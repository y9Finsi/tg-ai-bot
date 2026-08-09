import { getActiveAiProvider } from '../database.js';
import { getCachedOpenAIClient, requestLlmCompletion } from './llm_client.js';
import { getJudgeProviders } from './intent_router.js';

export const JUDGE_CODES = [
    'REPETITION',
    'IGNORES_USER',
    'OUT_OF_CHARACTER',
    'STALE_CONTEXT',
    'INVENTED_FACT',
    'BROKEN_LOGIC',
    'FORMAT'
];

function compactConversation(messages = []) {
    return messages
        .filter(item => item?.role !== 'system' && item?.content)
        .slice(-6)
        .map(item => `${item.role === 'assistant' || item.role === 'lera' ? 'Лера' : 'Пользователь'}: ${String(item.content).slice(0, 700)}`)
        .join('\n');
}

function compactPersona(messages = []) {
    const systemMessage = messages.find(item => item?.role === 'system' && item?.content);
    return String(systemMessage?.content || '').slice(0, 3000);
}

export function buildJudgeMessages({ mode = 'CASUAL', messages = [], userText = '', reply = '', judgePrompt = '' } = {}) {
    return [
        {
            role: 'system',
            content: judgePrompt
        },
        {
            role: 'user',
            content: [
                `Режим: ${mode}`,
                `Правила и личность Леры:\n${compactPersona(messages) || 'не переданы'}`,
                `Диалог:\n${compactConversation(messages) || 'нет предыдущих сообщений'}`,
                `Последняя реплика пользователя:\n${String(userText || '').slice(0, 1200)}`,
                `Кандидат-ответ Леры:\n${String(reply || '').slice(0, 1600)}`,
                'Верни только PASS или REJECT:<CODE>.'
            ].join('\n\n')
        }
    ];
}

export function parseJudgeVerdict(rawText) {
    const normalized = String(rawText || '').toUpperCase().replace(/[`"'*\s]/g, '');
    if (normalized === 'PASS') return { verdict: 'PASS', passed: true, code: null };
    const match = normalized.match(/^REJECT:([A-Z_]+)$/);
    if (match && JUDGE_CODES.includes(match[1])) {
        return { verdict: `REJECT:${match[1]}`, passed: false, code: match[1] };
    }
    return { verdict: 'INVALID', passed: true, code: null, invalid: true };
}

export async function judgeLeraReply({
    userId = 0,
    mode = 'CASUAL',
    messages = [],
    userText = '',
    reply = '',
    settings = {}
} = {}) {
    if (!['OBSERVE', 'ENFORCE'].includes(settings.judgeMode)) {
        return { skipped: true, verdict: 'SKIPPED', passed: true, code: null };
    }

    const providers = await getJudgeProviders(settings);
    const judgeMessages = buildJudgeMessages({
        mode,
        messages,
        userText,
        reply,
        judgePrompt: settings.judgePrompt
    });

    try {
        const result = await requestLlmCompletion(
            { roleplay_mode: 'response-judge', max_tokens: settings.judgeMaxTokens },
            judgeMessages,
            false,
            async () => {
                const provider = providers[0] || await getActiveAiProvider();
                if (!provider) throw new Error('Нет настроенного провайдера судьи');
                return {
                    client: getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || settings.judgeTimeoutMs),
                    model: settings.judgeModel || provider.model_name
                };
            },
            {
                userId,
                providers,
                modelOverride: settings.judgeModel || null,
                timeoutMs: settings.judgeTimeoutMs,
                maxTokens: settings.judgeMaxTokens,
                temperature: 0,
                trace: false
            }
        );
        return {
            ...parseJudgeVerdict(result.rawText),
            rawText: result.rawText || '',
            model: result.model,
            providerName: result.providerName,
            latencyMs: result.latencyMs || 0,
            usage: result.usage || {},
            judgeMessages
        };
    } catch (error) {
        return {
            verdict: 'ERROR',
            passed: true,
            error: error.message,
            latencyMs: 0
        };
    }
}
