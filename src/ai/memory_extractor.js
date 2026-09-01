import { getMemorySettings, getMemoryProvider, getUserMemories, saveUserMemory, deactivateUserMemory, appendConversationEvent } from '../database.js';
import { getCachedOpenAIClient } from './llm_client.js';
import { logLlmTrace } from './llm_client.js';
import { parseLlmJson } from '../utils/robust_json.js';

const CATEGORY_TO_MEMORY_TYPE = Object.freeze({
    profile: 'PROFILE',
    identity: 'PROFILE',
    name: 'PROFILE',
    location: 'PROFILE',
    city: 'PROFILE',
    profession: 'PROFILE',
    work: 'PROFILE',
    preference: 'PREFERENCE',
    preferences: 'PREFERENCE',
    commitment: 'COMMITMENT',
    promise: 'COMMITMENT',
    open_thread: 'OPEN_THREAD',
    'open thread': 'OPEN_THREAD',
    episode: 'EPISODE',
    event: 'EPISODE',
    relationship: 'RELATIONSHIP_EVENT',
    relationship_event: 'RELATIONSHIP_EVENT'
});

function memoryTypeFor(item) {
    const raw = String(item?.type ?? item?.memory_type ?? item?.category ?? 'PROFILE')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    return CATEGORY_TO_MEMORY_TYPE[raw] || 'PROFILE';
}

export function isMemoryCandidate(text) {
    const value = String(text || '').trim();
    if (value.length < 3) return false;
    // Отсекаем только чистый мусор, однословные междометия и шаблонные приветствия
    if (/^(привет|приветик|хай|ку|хей|хеллоу|ага|угу|да|нет|неа|ок|окей|лан|ладно|спасибо|спасиб|хах+|ахах+|лол|рофл|ясно|понял(?:а)?|пон|как дела|че делаешь|споки|сладких|доброй ночи|доброе утро|пока|до завтра|бай|бб)$/i.test(value)) {
        return false;
    }
    return true;
}

function renderMemoryPrompt(template, existingListText, userText) {
    const fallback = String(template || '');
    return fallback
        .replace(/\{\{existing_facts\}\}/g, existingListText)
        .replace(/\{\{user_text\}\}/g, String(userText || '').slice(0, 4000));
}

function parseMemoryPayload(raw) {
    const parsed = parseLlmJson(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('LLM не вернул JSON-объект');
    }
    return parsed;
}

export async function extractFactsInBackground(userId, userText, { sourceEventId = null } = {}) {
    if (!userText || !isMemoryCandidate(userText)) return { success: false, reason: "Filtered out trivial/greeting" };

    let lastRaw = null;
    let savedCount = 0;
    try {
        const memSettings = await getMemorySettings();
        if (!memSettings.is_enabled) return { success: false, reason: "Memory disabled" };

        let provider = await getMemoryProvider(memSettings);
        if (!provider) return { success: false, reason: "No memory provider" };

        let typedRepository = null;
        let typedMemories = [];
        try {
            typedRepository = (await import('../memory/memory_repository.js')).memoryRepository;
            typedMemories = await typedRepository.listFacts(userId, {
                includeInactive: false,
                limit: 30
            });
        } catch (typedReadError) {
            console.warn(`[MEMORY TYPED READ] user ${userId}:`, typedReadError.message);
        }

        let legacyMemories = [];
        if (!typedMemories.length) {
            try {
                legacyMemories = await getUserMemories(userId, 30);
            } catch {
                legacyMemories = [];
            }
        }
        const existingMemories = [
            ...typedMemories.map(fact => ({
                id: fact.id,
                fact: fact.text || fact.normalizedText
            })),
            ...legacyMemories.map(fact => ({ id: fact.id, fact: fact.fact }))
        ].filter((fact, index, values) => (
            fact.fact
            && values.findIndex(candidate => (
                String(candidate.id) === String(fact.id)
                || String(candidate.fact).trim().toLocaleLowerCase('ru-RU')
                    === String(fact.fact).trim().toLocaleLowerCase('ru-RU')
            )) === index
        ));
        const existingListText = existingMemories.length > 0
            ? existingMemories.map(m => `(id:${m.id}) ${m.fact}`).join('\n')
            : 'Пока нет сохраненных фактов.';

        const prompt = `${renderMemoryPrompt(memSettings.prompt, existingListText, userText)}

Дополнение:
1. Короткие прямые утверждения тоже являются фактами (например: «я дизайнер», «едем с Машей в автобусе»).
2. Для временных событий (поездка, встреча, дела, болезнь) обязательно укажи поле "estimated_hours" (например: 6 для дороги, 3 для встречи/пары, 48 для болезни). Для постоянных фактов (профессия, город, предпочтения) ставь null.`;

        const makeCompletionCall = async (prov, maxTokens, retry = false) => {
            const cl = getCachedOpenAIClient(prov.base_url, prov.api_key, memSettings.timeout_ms || 10000);
            return cl.chat.completions.create({
                model: memSettings.model || prov.model_name,
                messages: [
                    {
                        role: 'system',
                        content: 'Ты — строгий модуль извлечения фактов о пользователе. Отвечай СТРОГО валидным JSON без markdown и без лишнего текста.'
                    },
                    {
                        role: 'user',
                        content: retry
                            ? `${prompt}\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ ОБОРВАН. Верни только полностью закрытый JSON. Если фактов нет, верни {"new_facts":[],"deactivate_ids":[]}.`
                            : prompt
                    }
                ],
                temperature: memSettings.temperature,
                max_tokens: maxTokens
            });
        };

        const startedAt = Date.now();
        let attempt = 'first';
        let completion;
        try {
            completion = await makeCompletionCall(provider, memSettings.max_tokens);
        } catch (provErr) {
            console.warn(`[MEMORY PROVIDER ERROR] ${provider.name} failed (${provErr.message}), falling back to active provider...`);
            const fallbackProvider = await (await import('../database.js')).getActiveAiProvider();
            if (fallbackProvider && String(fallbackProvider.id) !== String(provider.id)) {
                provider = fallbackProvider;
                completion = await makeCompletionCall(provider, memSettings.max_tokens);
            } else {
                throw provErr;
            }
        }
        let raw = completion.choices[0]?.message?.content || '';
        lastRaw = raw;
        let parsed;
        let firstRaw = raw;
        let firstError = null;
        try {
            parsed = parseMemoryPayload(raw);
        } catch (parseError) {
            firstError = parseError.message;
            attempt = 'retry';
            completion = await makeCompletionCall(provider, memSettings.retry_max_tokens || 800, true);
            raw = completion.choices[0]?.message?.content || '';
            lastRaw = raw;
            parsed = parseMemoryPayload(raw);
        }

        const trace = {
            step: attempt,
            firstRawResponse: firstRaw,
            firstParseError: firstError,
            rawResponse: raw,
            sampling: { temperature: memSettings.temperature, maxTokens: attempt === 'retry' ? memSettings.retry_max_tokens : memSettings.max_tokens },
            promptTemplate: memSettings.prompt,
            prompt: attempt === 'retry' ? `${prompt}\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ ОБОРВАН. Верни только полностью закрытый JSON. Если фактов нет, верни {"new_facts":[],"deactivate_ids":[]}.` : prompt
        };
        logLlmTrace({ userId, kind: 'MEMORY', mode: 'fact-extractor', providerName: provider.name, model: memSettings.model || provider.model_name, userText, systemPrompt: trace.prompt, messages: [{ role: 'system', content: trace.prompt }], rawResponse: raw, parsedResponse: parsed, usage: completion.usage || {}, latencyMs: Date.now() - startedAt, generationTrace: [trace] });

        if (parsed.deactivate_ids && Array.isArray(parsed.deactivate_ids)) {
            for (const id of parsed.deactivate_ids) {
                let archived = false;
                if (typedRepository) {
                    try {
                        archived = Boolean(await typedRepository.archiveFact(userId, id, {
                            source: 'memory_extractor',
                            reason: 'llm_deactivate'
                        }));
                    } catch (typedArchiveError) {
                        console.warn(`[MEMORY TYPED ARCHIVE] user ${userId}:`, typedArchiveError.message);
                    }
                }
                if (!archived) {
                    try {
                        await deactivateUserMemory(id, userId);
                    } catch {}
                }
                await appendConversationEvent({
                    userId,
                    eventType: 'FORGET',
                    role: 'system',
                    content: `Деактивирован факт памяти #${id}`,
                    metadata: { memory_id: id },
                    status: 'COMPLETED'
                }).catch(() => null);
            }
        }

        if (parsed.new_facts && Array.isArray(parsed.new_facts)) {
            for (const item of parsed.new_facts) {
                const factText = String(typeof item === 'string' ? item : item?.fact ?? item?.text ?? '').trim();
                if (factText) {
                    const category = typeof item === 'string' ? 'general' : (item.category || item.type || 'general');
                    const memoryType = memoryTypeFor(typeof item === 'string' ? {} : item);
                    const supersedesId = typeof item === 'object' && item?.supersedes_id != null
                        ? item.supersedes_id
                        : (typeof item === 'object' ? item?.supersedesId : null);
                    
                    const estimatedHours = typeof item === 'object' && Number(item.estimated_hours || item.estimatedHours) > 0
                        ? Number(item.estimated_hours || item.estimatedHours)
                        : (memoryType === 'EPISODE' ? 6 : null);
                    const validUntil = estimatedHours ? new Date(Date.now() + estimatedHours * 3600 * 1000) : null;

                    let saved = null;
                    if (typedRepository) {
                        try {
                            saved = await typedRepository.createFact({
                                userId,
                                type: memoryType,
                                payload: {
                                    text: factText,
                                    category: String(category).slice(0, 80),
                                    estimated_hours: estimatedHours,
                                    extractor: 'memory_extractor'
                                },
                                validUntil,
                                confidence: Number.isFinite(Number(item?.confidence))
                                    ? Number(item.confidence)
                                    : 0.75,
                                importance: Number.isFinite(Number(item?.importance))
                                    ? Number(item.importance)
                                    : (memoryType === 'PROFILE' ? 80 : 55),
                                sourceEventId,
                                supersedesId,
                                provenance: {
                                    source: 'memory_extractor',
                                    category: String(category).slice(0, 80),
                                    provider: provider.name,
                                    model: memSettings.model || provider.model_name
                                }
                            });
                        } catch (typedError) {
                            console.warn(`[MEMORY TYPED CREATE] user ${userId}:`, typedError.message);
                        }
                    }
                    if (saved) {
                        savedCount++;
                        console.log(`🧠 [MEMORY SAVED for user ${userId} via ${provider.name}]: (${category}) ${factText}${validUntil ? ` [TTL: ${estimatedHours}h]` : ''}`);
                    }
                    await appendConversationEvent({
                        userId,
                        eventType: 'REMEMBER',
                        role: 'system',
                        content: factText,
                        metadata: {
                            category,
                            memory_type: memoryType,
                            valid_until: validUntil ? validUntil.toISOString() : null,
                            memory_fact_id: saved?.id ?? null,
                            source_event_id: sourceEventId
                        },
                        status: 'COMPLETED'
                    }).catch(() => null);
                }
            }
        }

        return { success: true, savedCount, parsed, providerName: provider.name, model: memSettings.model || provider.model_name, attempt };
    } catch (err) {
        logLlmTrace({
            userId,
            kind: 'MEMORY',
            mode: 'fact-extractor',
            userText,
            rawResponse: lastRaw,
            errorText: err.message,
            generationTrace: [{ step: 'failed', error: err.message }]
        });
        console.error(`⚠️ [MEMORY EXTRACTION ERROR] user ${userId}:`, err.message);
        return { success: false, error: err.message };
    }
}
