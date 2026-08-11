import { getActiveAiProvider } from '../database.js';
import { getCachedOpenAIClient, requestLlmCompletion } from './llm_client.js';
import { getJudgeProviders } from './intent_router.js';
import { normalizeRelationshipEvent } from './relationship.js';
import { parseLlmJson } from '../utils/robust_json.js';

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

function compactBlock(value, limit = 5000) {
    return String(value || '').trim().slice(0, limit);
}

export function buildJudgeMessages({
    mode = 'CASUAL',
    messages = [],
    userText = '',
    reply = '',
    judgePrompt = '',
    dayContext = '',
    leraRules = ''
} = {}) {
    const relationshipContract = ' Дополнительно верни relationship_event по последней реплике пользователя: тип NEUTRAL, SUPPORT, COMPLIMENT, AFFECTION, INSULT, DISRESPECT или APOLOGY и intensity 0.0–1.0. Для обычного сообщения NEUTRAL с intensity 0. Не меняй verdict из-за relationship_event. Формат результата: JSON {"verdict":"PASS","relationship_event":{"type":"NEUTRAL","intensity":0}}.';
    return [
        {
            role: 'system',
            content: `${judgePrompt || ''}${relationshipContract}`
        },
        {
            role: 'user',
            content: [
                `Режим: ${mode}`,
                `Контекст Леры на сегодня:\n${compactBlock(dayContext) || 'не передан'}`,
                `Как Лера должна говорить и обязательные правила:\n${compactBlock(leraRules) || 'не переданы'}`,
                `Диалог:\n${compactConversation(messages) || 'нет предыдущих сообщений'}`,
                `Последняя реплика пользователя:\n${String(userText || '').slice(0, 1200)}`,
                `Кандидат-ответ Леры:\n${String(reply || '').slice(0, 1600)}`,
                'Верни только JSON вида {"verdict":"PASS"} или {"verdict":"REJECT:CODE","relationship_event":{"type":"NEUTRAL|SUPPORT|COMPLIMENT|AFFECTION|INSULT|DISRESPECT|APOLOGY","intensity":0.0}}. Relationship event определяй по последней реплике пользователя, а не по ответу Леры. Для обычного сообщения используй NEUTRAL с intensity 0.'
            ].join('\n\n')
        }
    ];
}

export function parseJudgeVerdict(rawText) {
    const raw = String(rawText || '').trim();
    try {
        const parsed = parseLlmJson(raw);
        const verdictText = String(parsed?.verdict || '').toUpperCase().replace(/\s/g, '');
        if (verdictText === 'PASS') {
            return { verdict: 'PASS', passed: true, code: null, relationshipEvent: normalizeRelationshipEvent(parsed.relationship_event || parsed.relationshipEvent || {}) };
        }
        const jsonMatch = verdictText.match(/^REJECT:([A-Z_]+)$/);
        if (jsonMatch && JUDGE_CODES.includes(jsonMatch[1])) {
            return { verdict: `REJECT:${jsonMatch[1]}`, passed: false, code: jsonMatch[1], relationshipEvent: normalizeRelationshipEvent(parsed.relationship_event || parsed.relationshipEvent || {}) };
        }
    } catch {
        // Backward-compatible compact verdicts are still accepted below.
    }
    const normalized = raw.toUpperCase().replace(/[`"'*\s]/g, '');
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
    dayContext = '',
    leraRules = '',
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
        judgePrompt: settings.judgePrompt,
        dayContext,
        leraRules
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
