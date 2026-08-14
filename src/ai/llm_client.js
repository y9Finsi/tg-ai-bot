import OpenAI from 'openai';
import { getOrderedAiProviders, getActiveAiProvider, savePromptLog } from '../database.js';
import { getLlmParams } from '../prompts.js';

const clientPool = new Map();

export function logLlmTrace(entry = {}) {
    return savePromptLog({
        userId: Number.isFinite(Number(entry.userId)) ? Number(entry.userId) : 0,
        kind: entry.kind || 'SYSTEM',
        mode: entry.mode || 'trace',
        model: entry.model || null,
        providerName: entry.providerName || null,
        userText: entry.userText || null,
        systemPrompt: entry.systemPrompt || null,
        radiantContext: entry.radiantContext || null,
        messages: entry.messages || [],
        stateSnapshot: entry.stateSnapshot || {},
        memoryUsed: entry.memoryUsed || [],
        rawResponse: entry.rawResponse || null,
        parsedResponse: entry.parsedResponse || null,
        usage: entry.usage || {},
        latencyMs: entry.latencyMs || 0,
        commandGateStatus: entry.commandGateStatus || null,
        commandGateReason: entry.commandGateReason || null,
        costUsd: entry.costUsd || 0,
        errorText: entry.errorText || null,
        generationTrace: entry.generationTrace || []
    }).catch(error => {
        console.error('[LLM TRACE ERROR]:', error.message);
        return null;
    });
}

export function getCachedOpenAIClient(baseURL, apiKey, timeoutMs) {
    const key = `${baseURL}:${apiKey}:${timeoutMs}`;
    if (clientPool.has(key)) {
        return clientPool.get(key);
    }
    const client = new OpenAI({
        baseURL,
        apiKey,
        timeout: timeoutMs,
        defaultHeaders: {
            'HTTP-Referer': 'https://t.me/your_bot',
            'X-Title': 'Telegram AI Bot',
        }
    });
    clientPool.set(key, client);
    return client;
}

export function buildLlmRequestParams({ model, messages, calculatedMaxTokens, llmParams = {}, traceContext = {}, provider = {} }) {
    const requestParams = { model, messages };
    const strictSampling = traceContext.strictSampling === true;
    const samplingStatus = traceContext.samplingStatus || {};
    const canSend = key => !strictSampling || samplingStatus[key]?.request === 'sent';
    const add = (key, value) => {
        if (canSend(key) && value !== undefined && value !== null) requestParams[key] = value;
    };

    add('max_tokens', canSend('max_tokens') && Number(traceContext.maxTokens) > 0
        ? Number(traceContext.maxTokens)
        : (!strictSampling ? calculatedMaxTokens : null));
    add('temperature', traceContext.temperature ?? (!strictSampling ? llmParams.temperature ?? 0.7 : null));
    add('top_p', traceContext.top_p ?? (!strictSampling ? 1 : null));
    add('presence_penalty', traceContext.presence_penalty ?? (!strictSampling ? llmParams.presence_penalty ?? 0.1 : null));
    add('frequency_penalty', traceContext.frequency_penalty ?? (!strictSampling ? llmParams.frequency_penalty ?? 0.1 : null));

    if (Array.isArray(traceContext.tools) && traceContext.tools.length > 0) {
        requestParams.tools = traceContext.tools;
        if (traceContext.tool_choice) {
            requestParams.tool_choice = traceContext.tool_choice;
        }
    }

    if (traceContext.samplingExtraBody && typeof traceContext.samplingExtraBody === 'object' && Object.keys(traceContext.samplingExtraBody).length) {
        requestParams.extra_body = { ...traceContext.samplingExtraBody };
    }
    if (canSend('seed') && Number.isInteger(traceContext.seed)) {
        requestParams.seed = traceContext.seed;
    }
    if (provider.model_name && provider.model_name.includes('MiniMax')) {
        requestParams.extra_body = {
            ...(requestParams.extra_body || {}),
            provider: { order: ["SiliconFlow"], allow_fallbacks: false }
        };
    }
    return requestParams;
}

export function hasMultimodalMessages(messages = []) {
    return Array.isArray(messages) && messages.some(msg => Array.isArray(msg?.content) && msg.content.some(part => part?.type === 'image_url'));
}

export function stripImageUrlsFromMessages(messages = []) {
    return (messages || []).map(msg => {
        if (Array.isArray(msg?.content)) {
            const textParts = msg.content
                .filter(part => part?.type === 'text')
                .map(part => part.text)
                .join(' ')
                .trim();
            const hasImage = msg.content.some(part => part?.type === 'image_url');
            return {
                ...msg,
                content: textParts || (hasImage ? '[Пользователь прислал фото]' : '')
            };
        }
        return msg;
    });
}

export async function requestLlmCompletion(user, messages, isPhotoRequest, getOpenAIClientAndModelFn, traceContext = {}) {
    const modeKey = user.roleplay_mode || 'flirt';
    let calculatedMaxTokens = user.max_tokens || ((modeKey === 'flirt' || modeKey === 'flirthot') ? 200 : 400);
    if (isPhotoRequest) {
        calculatedMaxTokens = Math.max(calculatedMaxTokens, 600);
    }

    let providers = [];
    try {
        providers = Array.isArray(traceContext.providers) && traceContext.providers.length
            ? traceContext.providers
            : await getOrderedAiProviders();
    } catch (e) {
        console.error("Ошибка загрузки списка ИИ провайдеров:", e);
    }

    if (!providers || providers.length === 0) {
        const { client, model } = await getOpenAIClientAndModelFn();
        providers = [{ name: 'Default Fallback', base_url: client.baseURL, api_key: client.apiKey, model_name: model, timeout_ms: 7000 }];
    }

    const llmParams = await getLlmParams();
    let lastError = null;

    for (let i = 0; i < providers.length; i++) {
        const prov = providers[i];
        const timeoutMs = parseInt(traceContext.timeoutMs, 10) || parseInt(prov.timeout_ms, 10) || 15000;

        const tempClient = getCachedOpenAIClient(prov.base_url, prov.api_key, timeoutMs);

        const requestParams = buildLlmRequestParams({
            model: traceContext.modelOverride || prov.model_name,
            messages,
            calculatedMaxTokens,
            llmParams,
            traceContext,
            provider: prov
        });

        try {
            const startedAt = Date.now();
            let completion;
            try {
                completion = await tempClient.chat.completions.create(requestParams);
            } catch (createErr) {
                if (hasMultimodalMessages(requestParams.messages)) {
                    console.warn(`⚠️ [VISION FALLBACK] Модель "${prov.model_name}" не поддерживает Vision (${createErr.message}). Повторяем запрос в текстовом режиме...`);
                    const fallbackParams = {
                        ...requestParams,
                        messages: stripImageUrlsFromMessages(requestParams.messages)
                    };
                    completion = await tempClient.chat.completions.create(fallbackParams);
                } else if (requestParams.tools && (createErr.message.includes('tools') || createErr.message.includes('function') || createErr.status === 400)) {
                    console.warn(`⚠️ [TOOLS HARNESS FALLBACK] Модель "${prov.model_name}" не поддерживает нативные tools (${createErr.message}). Переключаем в режим prompt-инъекции...`);
                    const toolsPrompt = "\n\n[ДОСТУПНЫЕ ИНСТРУМЕНТЫ]:\n" + requestParams.tools.map(t => `- ${t.function.name}: ${t.function.description}. Параметры: ${JSON.stringify(t.function.parameters)}`).join("\n") + "\nЕсли нужно вызвать инструмент, выведи строго <tool_call>{\"name\": \"...\", \"arguments\": {...}}</tool_call>";
                    const noToolsParams = { ...requestParams };
                    delete noToolsParams.tools;
                    delete noToolsParams.tool_choice;
                    const updatedMessages = [...noToolsParams.messages];
                    if (updatedMessages[0] && updatedMessages[0].role === 'system') {
                        updatedMessages[0] = { ...updatedMessages[0], content: updatedMessages[0].content + toolsPrompt };
                    }
                    noToolsParams.messages = updatedMessages;
                    completion = await tempClient.chat.completions.create(noToolsParams);
                } else {
                    throw createErr;
                }
            }
            if (completion.choices && completion.choices.length > 0) {
                if (i > 0) {
                    console.log(`✅ [FALLBACK SUCCESS] Успешный ответ от провайдера #${i + 1} (${prov.name}) после сбоя предыдущих!`);
                }
                const choiceMessage = completion.choices[0]?.message || {};
                const result = {
                    rawText: choiceMessage.content || null,
                    tool_calls: choiceMessage.tool_calls || null,
                    usage: completion.usage,
                    model: prov.model_name,
                    providerName: prov.name,
                    latencyMs: Date.now() - startedAt,
                    providerPayload: requestParams
                };
                if (traceContext.trace === true) {
                    const promptTokens = Number(result.usage?.prompt_tokens || 0);
                    const completionTokens = Number(result.usage?.completion_tokens || 0);
                    logLlmTrace({
                        ...traceContext,
                        model: prov.model_name,
                        providerName: prov.name,
                        messages,
                        rawResponse: result.rawText,
                        parsedResponse: result.rawText,
                        usage: result.usage,
                        latencyMs: result.latencyMs,
                        costUsd: (promptTokens * 0.13 / 1000000) + (completionTokens * 0.28 / 1000000)
                    });
                }
                return result;
            }
        } catch (err) {
            lastError = err;
            const nextProv = providers[i + 1];
            if (nextProv) {
                console.warn(`⚠️ [FALLBACK WARNING] Провайдер "${prov.name}" (Приоритет ${prov.priority || i + 1}) недоступен: ${err.message}. Мгновенный перехват на "${nextProv.name}"...`);
            } else {
                console.error(`❌ [FALLBACK FAILED] Все провайдеры (${providers.length}) недоступны! Последняя ошибка (${prov.name}): ${err.message}`);
            }
        }
    }

    throw lastError || new Error("Все ИИ провайдеры в цепочке недоступны");
}

export async function generateCompletion(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    const fallbackFn = async () => {
        const prov = await getActiveAiProvider();
        if (!prov) throw new Error("В базе админки не настроен ни один активный ИИ провайдер!");
        const client = getCachedOpenAIClient(prov.base_url, prov.api_key, prov.timeout_ms || 15000);
        return { client, model: prov.model_name };
    };
    const res = await requestLlmCompletion({ roleplay_mode: 'flirt' }, messages, false, fallbackFn, {
        ...(options.trace || {}),
        temperature: options.temperature,
        trace: true
    });
    return res.rawText || '';
}
