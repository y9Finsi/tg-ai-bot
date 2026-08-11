import { getMemorySettings, getMemoryProvider, getUserMemories, saveUserMemory, deactivateUserMemory, appendConversationEvent } from '../database.js';
import { getCachedOpenAIClient } from './llm_client.js';
import { logLlmTrace } from './llm_client.js';
import { parseLlmJson } from '../utils/robust_json.js';

export function isMemoryCandidate(text) {
    const value = String(text || '').trim();
    if (value.length < 8) return false;
    if (/(?:^|\s)(?:я|мне)\b[\s\S]{0,40}\b(?:спать|спть|поспать|ложиться|отбой|устал(?:а|ый)?|сон)\b/iu.test(value)) return false;
    if (/^(?:кароче\s+)?(?:ладно\s+)?(?:я\s+)?(?:спать|спть|пойду\s+спать|ложусь)\b[\s!.…]*$/iu.test(value)) return false;
    return /(?:^|\s)(?:я|мне|меня|мой|моя|моё|мои|у меня|люблю|ненавижу|обожаю|работаю|учусь|живу|зовут|родом|занимаюсь|хочу|могу|не люблю)\b/iu.test(value);
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

export async function extractFactsInBackground(userId, userText) {
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

        const provider = await getMemoryProvider(memSettings);
        if (!provider) return { success: false, reason: "No memory provider" };

        const existingMemories = await getUserMemories(userId, 30);
        const existingListText = existingMemories.length > 0
            ? existingMemories.map(m => `(id:${m.id}) ${m.fact}`).join('\n')
            : 'Пока нет сохраненных фактов.';

        const prompt = `${renderMemoryPrompt(memSettings.prompt, existingListText, userText)}

Дополнение: короткие прямые утверждения тоже являются фактами. Например, «я дизайнер» — это факт о профессии пользователя, его нужно вернуть в new_facts. Не выдумывай детали и не добавляй факт только из ответа Леры.`;

        const client = getCachedOpenAIClient(provider.base_url, provider.api_key, memSettings.timeout_ms);
        const requestCompletion = (maxTokens, retry = false) => client.chat.completions.create({
            model: memSettings.model || provider.model_name,
            messages: [{
                role: 'system',
                content: retry
                    ? `${prompt}\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ ОБОРВАН. Верни только полностью закрытый JSON. Если фактов нет, верни {"new_facts":[],"deactivate_ids":[]}.`
                    : prompt
            }],
            temperature: memSettings.temperature,
            max_tokens: maxTokens
        });

        const startedAt = Date.now();
        let attempt = 'first';
        let completion = await requestCompletion(memSettings.max_tokens);
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

        let savedCount = 0;
        if (parsed.deactivate_ids && Array.isArray(parsed.deactivate_ids)) {
            for (const id of parsed.deactivate_ids) {
                await deactivateUserMemory(id, userId);
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
                if (item.fact && item.fact.trim()) {
                    await saveUserMemory(userId, item.fact);
                    await appendConversationEvent({
                        userId,
                        eventType: 'REMEMBER',
                        role: 'system',
                        content: item.fact,
                        metadata: { category: item.category || 'general' },
                        status: 'COMPLETED'
                    }).catch(() => null);
                    console.log(`🧠 [MEMORY SAVED for user ${userId} via ${provider.name}]: (${item.category || 'general'}) ${item.fact}`);
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
