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
    if (value.length < 5) return false;
    if (/(?:^|[^\p{L}\p{N}])(?:я|мне)(?:[^\p{L}\p{N}][\s\S]{0,40}[^\p{L}\p{N}]|[^\p{L}\p{N}])(?:спать|спть|поспать|ложиться|отбой|устал(?:а|ый)?|сон)(?=[^\p{L}\p{N}]|$)/iu.test(value)) return false;
    if (/^(?:кароче\s+)?(?:ладно\s+)?(?:я\s+)?(?:спать|спть|пойду\s+спать|ложусь)[^\p{L}\p{N}]*$/iu.test(value)) return false;
    return /(?:^|[^\p{L}\p{N}])(?:я|мне|меня|мой|моя|моё|мое|мои|моем|моей|моих|моего|у меня|люблю|ненавижу|обожаю|работаю|учусь|живу|зовут|родом|занимаюсь|хочу|могу|не люблю|еду|поеду|родился|родилась|мама|папа|брат|сестра|девушка|парень|жена|муж|друг|подруга|кот|кошка|собака)(?=[^\p{L}\p{N}]|$)/iu.test(value);
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
    if (!userText || userText.trim().length < 3) return { success: false, reason: "Text too short" };
    if (!isMemoryCandidate(userText)) return { success: false, reason: "No personal assertion candidate" };
    // Игнорируем простые приветствия и общие фан-реакции
    if (/^(привет|приветик|хай|ку|ага|угу|да|нет|неа|ок|окей|спасибо|спасиб|хаха+|ахах+|ясно|понял(?:а)?|пон|как дела|че делаешь)$/i.test(userText.trim())) {
        return { success: false, reason: "Generic greeting or reaction" };
    }

    let lastRaw = null;
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
            console.warn(`[MEMORY TYPED READ FALLBACK] user ${userId}:`, typedReadError.message);
        }

        let legacyMemories = [];
        try {
            legacyMemories = await getUserMemories(userId, 30);
        } catch {
            legacyMemories = [];
        }
        const existingMemories = [
            ...typedMemories.map(fact => ({
                id: fact.id,
                fact: fact.text || fact.normalizedText,
                source: 'typed'
            })),
            ...legacyMemories.map(fact => ({ ...fact, source: 'legacy' }))
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

Дополнение: короткие прямые утверждения тоже являются фактами. Например, «я дизайнер» — это факт о профессии пользователя, его нужно вернуть в new_facts. Не выдумывай детали и не добавляй факт только из ответа Леры.`;

        let client = getCachedOpenAIClient(provider.base_url, provider.api_key, memSettings.timeout_ms);
        const makeCompletionCall = async (prov, maxTokens, retry = false) => {
            const cl = getCachedOpenAIClient(prov.base_url, prov.api_key, memSettings.timeout_ms);
            return cl.chat.completions.create({
                model: memSettings.model || prov.model_name,
                messages: [
                    {
                        role: 'system',
                        content: 'Ты — строгий модуль извлечения долгосрочных фактов о пользователе. Отвечай СТРОГО валидным JSON без markdown и без лишнего текста.'
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
            completion = await requestCompletion(memSettings.retry_max_tokens, true);
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
                        console.warn(`[MEMORY TYPED ARCHIVE FALLBACK] user ${userId}:`, typedArchiveError.message);
                    }
                }
                if (!archived) await deactivateUserMemory(id, userId);
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
                    let saved = null;
                    if (typedRepository) {
                        try {
                            saved = await typedRepository.createFact({
                                userId,
                                type: memoryType,
                                payload: {
                                    text: factText,
                                    category: String(category).slice(0, 80),
                                    extractor: 'memory_extractor'
                                },
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
                            console.warn(`[MEMORY TYPED FALLBACK] user ${userId}:`, typedError.message);
                        }
                    }
                    if (!saved) {
                        saved = await saveUserMemory(userId, factText);
                    }
                    await appendConversationEvent({
                        userId,
                        eventType: 'REMEMBER',
                        role: 'system',
                        content: factText,
                        metadata: {
                            category,
                            memory_type: memoryType,
                            memory_fact_id: saved?.id ?? null,
                            source_event_id: sourceEventId
                        },
                        status: 'COMPLETED'
                    }).catch(() => null);
                    console.log(`🧠 [MEMORY SAVED for user ${userId} via ${provider.name}]: (${category}) ${factText}`);
                    savedCount++;
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
