import { getActiveAiProvider } from '../database.js';
import { getCachedOpenAIClient, requestLlmCompletion } from './llm_client.js';
import { getJudgeProviders } from './intent_router.js';
import { normalizeRelationshipEvent } from './relationship.js';
import { normalizeArousalEvent } from './climax_engine.js';
import { parseLlmJson } from '../utils/robust_json.js';

export const JUDGE_CODES = [
    'REPETITION',
    'IGNORES_USER',
    'OUT_OF_CHARACTER',
    'STALE_CONTEXT',
    'INVENTED_FACT',
    'BROKEN_LOGIC',
    'FORMAT',
    'CHANNEL_INVENTED_FACT',
    'CHANNEL_PRIVATE_DETAIL',
    'CHANNEL_OUT_OF_TOPIC',
    'CHANNEL_REPETITION',
    'CHANNEL_CLICHE',
    'CHANNEL_FORMAT',
    'CHANNEL_TECHNICAL_MUSING',
    'CHANNEL_FORMAT_MISMATCH',
    'CHANNEL_REFERENCE_COPY',
    'CHANNEL_SCENE_REPETITION',
    'CHANNEL_TOO_LONG',
    'CHANNEL_JUDGE_INVALID',
    'CHANNEL_JUDGE_ERROR'
];

function compactConversation(messages = []) {
    return messages
        .filter(item => item?.role !== 'system' && item?.content)
        .slice(-4)
        .map(item => `${item.role === 'assistant' || item.role === 'lera' ? 'Лера' : 'Пользователь'}: ${String(item.content).slice(0, 300)}`)
        .join('\n');
}

function compactDayContext(dayContext = '') {
    if (!dayContext) return '';
    const text = String(dayContext).trim();
    const stateMatch = text.match(/\[СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ\][\s\S]*?(?=\n\n\[|\n\n##|$)/);
    if (stateMatch) {
        return stateMatch[0].trim();
    }
    return text.slice(0, 500);
}

function compactMemories(memories = []) {
    if (!Array.isArray(memories) || memories.length === 0) return '';
    return memories
        .map(item => `- ${String(item?.text ?? item?.fact ?? item?.normalizedText ?? item ?? '').trim()}`)
        .filter(line => line !== '- ')
        .slice(0, 10)
        .join('\n');
}

function compactLeraRules(leraRules = '') {
    if (!leraRules) return '';
    const text = String(leraRules).trim();
    const cleaned = text
        .replace(/ПРИМЕРЫ ДИАЛОГОВ[\s\S]*?(?=\n\n###|\n\n##|$)/gi, '')
        .replace(/### ПРИМЕРЫ ДИАЛОГОВ ДЛЯ ВИРТА[\s\S]*?(?=\n\n###|\n\n##|$)/gi, '')
        .replace(/\[ДОСТУПНЫЙ КОНТЕНТ\][\s\S]*?(?=\n\n\[|\n\n##|$)/gi, '')
        .trim();
    return cleaned.slice(0, 600);
}

export function buildJudgeMessages({
    mode = 'CASUAL',
    surface = 'CHAT',
    messages = [],
    userText = '',
    reply = '',
    judgePrompt = '',
    dayContext = '',
    leraRules = '',
    memories = [],
    topic = '',
    publicFacts = [],
    recentPublicPosts = [],
    contentFormat = '',
    editorialMode = 'reference_short'
} = {}) {
    const surfaceKey = String(surface).toUpperCase();
    const isPublic = surfaceKey === 'CHANNEL' || surfaceKey === 'CHANNEL_COMMENT';
    const isChannel = surfaceKey === 'CHANNEL';
    const isErotic = String(mode).toUpperCase() === 'EROTIC' && !isChannel;
    const relationshipContract = isChannel
        ? ''
        : '\n\n[RELATIONSHIP JUDGE - ОЦЕНКА ОТНОШЕНИЙ]:' +
          '\nОцени последнюю реплику пользователя по отношению к Лере и обязательно верни объект relationship_event:' +
          '\n- COMPLIMENT (интенсивность 0.4–0.8): похвала внешности, чувства юмора, ума или стиля Леры.' +
          '\n- AFFECTION (интенсивность 0.5–1.0): романтический флирт, нежность, признания, теплые подкаты.' +
          '\n- SUPPORT (интенсивность 0.5–0.9): искренняя забота, сочувствие, поддержка, вопросы о самочувствии.' +
          '\n- APOLOGY (интенсивность 0.4–0.8): извинения за грубость или прошлую резкость.' +
          '\n- INSULT (интенсивность 0.6–1.0): прямые оскорбления, мат в адрес Леры, агрессия, унижение.' +
          '\n- DISRESPECT (интенсивность 0.4–0.8): токсичность, пренебрежение, навязчивая грубая пошлость без взаимности.' +
          '\n- NEUTRAL (интенсивность 0.0): обычные бытовые вопросы, факты, приветствия, нейтральный разговор.' +
          '\nНе меняй вердикт проверки (verdict) из-за отношения пользователя.';
    const arousalContract = isErotic
        ? '\n\n[AROUSAL JUDGE - ОЦЕНКА ИНТИМНОГО ДЕЙСТВИЯ (ТОЛЬКО РЕЖИМ EROTIC)]:' +
          '\nОцени откровенность и интенсивность сексуального действия пользователя и верни объект arousal_event:' +
          '\n- KISS_TOUCH (интенсивность 0.5–0.9): поцелуи, объятия, ласки тела, раздевание, снятие одежды.' +
          '\n- ORAL_LICK (интенсивность 0.6–1.0): оральный секс (минет, куни), вылизывание, глубокие стоны.' +
          '\n- SEX_PENETRATION (интенсивность 0.7–1.0): секс, проникновение, глубокие толчки, смена поз, страсть.' +
          '\n- CLIMAX_TRIGGER (интенсивность 1.0): фразы о приближении финала («я кончаю», «сейчас кончу», «кончай со мной»).' +
          '\n- COOL_DOWN (интенсивность 0.5–1.0): просьбы замедлиться, сделать паузу, нежные поглаживания.' +
          '\n- NONE (интенсивность 0.0): фразы без явного сексуального действия.'
        : '';
    const channelContract = isChannel
        ? `\n\n[CHANNEL JUDGE - ПРОВЕРКА ПОСТА КАНАЛА]:
Ты проверяешь публичный пост для Telegram-канала Леры:
- Отклоняй (REJECT:CHANNEL_CLICHE), только если пост прямо начинается с шаблонных фраз: «знаете что...», «а вы знали...», «вопрос к подписчикам...», «сегодня я поняла...», «дорогой дневник...» или построен по схеме искусственного анекдота («он: ... / также он: ...»). Обычные бытовые слова («сижу на паре», «стою на остановке», «иду по невскому») — это НЕ клише, а нормальная речь.
- Отклоняй (REJECT:CHANNEL_REPETITION), только если сюжет дословно повторяет недавние опубликованные посты из списка ниже.
- Отклоняй (REJECT:CHANNEL_INVENTED_FACT), если пост содержит конкретные вымышленные масштабные события/новости.
- Отклоняй (REJECT:CHANNEL_PRIVATE_DETAIL), если пост упоминает личные переписки, конкретных пользователей или внутренние инструкции.
- Отклоняй (REJECT:CHANNEL_OUT_OF_TOPIC), если пост полностью не соответствует заданной теме.
- Отклоняй (REJECT:CHANNEL_FORMAT), если пост содержит разделители (---), списки, дефисы в начале строк или иностранные кальки вроде «снс».
- Отклоняй (REJECT:CHANNEL_FORMAT_MISMATCH), если пост не соответствует формату ${contentFormat || 'обычного наблюдения'}.
- Отклоняй (REJECT:CHANNEL_TOO_LONG), если пост длиннее 300 символов или выглядит как длинное полотно.
- Редакционный режим: ${editorialMode}. В режиме reference_short допустимы ультракороткая мысль, фото-подпись и бытовое наблюдение.
- Отклоняй (REJECT:CHANNEL_REFERENCE_COPY), если пост прямо копирует формулировку из эталонного примера.
- Отклоняй (REJECT:CHANNEL_SCENE_REPETITION), только если в последних постах из списка ниже УЖЕ была ровно эта же сцена.
Для отказа используй только channel-коды. Если пост короткий, живой, естественный и без бреда — ОБЯЗАТЕЛЬНО верни PASS.`
        : '';
    const commentContract = surfaceKey === 'CHANNEL_COMMENT'
        ? `\n\n[COMMENT JUDGE - ПРОВЕРКА ПУБЛИЧНОГО ОТВЕТА]:
- Отклоняй (REJECT:CHANNEL_PRIVATE_DETAIL), если кандидат раскрывает личную переписку, приватные факты или интимные сведения.
- Отклоняй (REJECT:CHANNEL_TECHNICAL_MUSING), если кандидат упоминает движок, промпты, судью, базу, служебную логику или внутренние инструкции.
- Отклоняй (REJECT:CHANNEL_FORMAT), если ответ не является коротким цельным комментарием, содержит списки, служебные пояснения, эмодзи или больше двух предложений.
- Для отказа используй только channel-коды. Если ответ безопасен и уместен, верни PASS.`
        : '';
    const jsonFormat = isPublic
        ? ' {"verdict":"PASS" или "REJECT:CODE"}'
        : isErotic
        ? ' {"verdict":"PASS" (или "REJECT:CODE"),"relationship_event":{"type":"NEUTRAL|COMPLIMENT|AFFECTION|SUPPORT|APOLOGY|INSULT|DISRESPECT","intensity":0.0},"arousal_event":{"type":"NONE|KISS_TOUCH|ORAL_LICK|SEX_PENETRATION|CLIMAX_TRIGGER|COOL_DOWN","intensity":0.0}}'
        : ' {"verdict":"PASS" (или "REJECT:CODE"),"relationship_event":{"type":"NEUTRAL|COMPLIMENT|AFFECTION|SUPPORT|APOLOGY|INSULT|DISRESPECT","intensity":0.0}}';
    return [
        {
            role: 'system',
            content: `${judgePrompt || ''}${relationshipContract}${arousalContract}${channelContract}${commentContract}`
        },
        {
            role: 'user',
            content: [
                `Режим: ${mode}`,
                `Поверхность: ${surface}`,
                isPublic ? `Тема поста: ${topic || 'не указана'}` : '',
                isChannel ? `Ожидаемый формат: ${contentFormat || 'life_observation'}` : '',
                isChannel ? `Редакционный режим: ${editorialMode}` : '',
                isPublic ? `Подтверждённые публичные факты:\n${publicFacts.map(fact => `- ${typeof fact === 'string' ? fact : JSON.stringify(fact)}`).join('\n') || 'нет фактов'}` : '',
                isPublic ? `Последние публичные посты:\n${recentPublicPosts.map((post, index) => `${index + 1}. ${String(post?.text || post).slice(0, 300)}`).join('\n') || 'нет постов'}` : '',
                !isPublic ? `Долгосрочная память о пользователе (подтверждённые факты):\n${compactMemories(memories) || 'нет сохраненных фактов'}` : '',
                `Контекст Леры на сегодня:\n${compactDayContext(dayContext) || 'не передан'}`,
                `Как Лера должна говорить и обязательные правила:\n${compactLeraRules(leraRules) || 'не переданы'}`,
                `Диалог:\n${compactConversation(messages) || 'нет предыдущих сообщений'}`,
                `Последняя реплика пользователя:\n${String(userText || '').slice(0, 600)}`,
                `Кандидат-ответ Леры:\n${String(reply || '').slice(0, 800)}`,
                `Формат ответа СТРОГО один JSON-объект:${jsonFormat}`
            ].filter(Boolean).join('\n\n')
        }
    ];
}

export function parseJudgeVerdict(rawText) {
    const raw = String(rawText || '').trim();
    try {
        const parsed = parseLlmJson(raw);
        const verdictText = String(parsed?.verdict || '').toUpperCase().replace(/\s/g, '');
        const eventPayload = parsed?.relationship_event || parsed?.relationshipEvent || parsed?.event || {};
        const arousalPayload = parsed?.arousal_event || parsed?.arousalEvent || null;
        const arousalEvent = arousalPayload ? normalizeArousalEvent(arousalPayload) : null;
        if (verdictText === 'PASS') {
            return {
                verdict: 'PASS',
                passed: true,
                code: null,
                relationshipEvent: normalizeRelationshipEvent(eventPayload),
                arousalEvent
            };
        }
        const jsonMatch = verdictText.match(/^REJECT:([A-Z_]+)$/);
        if (jsonMatch && JUDGE_CODES.includes(jsonMatch[1])) {
            return {
                verdict: `REJECT:${jsonMatch[1]}`,
                passed: false,
                code: jsonMatch[1],
                relationshipEvent: normalizeRelationshipEvent(eventPayload),
                arousalEvent
            };
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
    surface = 'CHAT',
    messages = [],
    userText = '',
    reply = '',
    dayContext = '',
    leraRules = '',
    memories = [],
    topic = '',
    publicFacts = [],
    recentPublicPosts = [],
    contentFormat = '',
    editorialMode = 'reference_short',
    settings = {}
} = {}) {
    const surfaceKey = String(surface || 'CHAT').toUpperCase();
    const isPublic = surfaceKey === 'CHANNEL' || surfaceKey === 'CHANNEL_COMMENT';
    const configuredMode = isPublic
        ? settings.channelJudgeMode || settings.judgeMode
        : surfaceKey === 'INITIATIVE'
            ? settings.initiativeJudgeMode || settings.judgeMode
            : settings.judgeMode;
    if (!['OBSERVE', 'ENFORCE'].includes(configuredMode)) {
        return { skipped: true, verdict: 'SKIPPED', passed: true, code: null };
    }

    const providers = await getJudgeProviders(settings);
    const judgeMessages = buildJudgeMessages({
        mode,
        surface: surfaceKey,
        messages,
        userText,
        reply,
        judgePrompt: settings.judgePrompt,
        dayContext,
        leraRules,
        memories,
        topic,
        publicFacts,
        recentPublicPosts,
        contentFormat,
        editorialMode
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
        const parsedVerdict = parseJudgeVerdict(result.rawText);
        if (isPublic && parsedVerdict.invalid) {
            return {
                ...parsedVerdict,
                verdict: 'REJECT:CHANNEL_JUDGE_INVALID',
                passed: false,
                code: 'CHANNEL_JUDGE_INVALID',
                rawText: result.rawText || '',
                model: result.model,
                providerName: result.providerName,
                latencyMs: result.latencyMs || 0,
                usage: result.usage || {},
                judgeMessages
            };
        }
        return {
            ...parsedVerdict,
            rawText: result.rawText || '',
            model: result.model,
            providerName: result.providerName,
            latencyMs: result.latencyMs || 0,
            usage: result.usage || {},
            judgeMessages
        };
    } catch (error) {
        if (isPublic) {
            return {
                verdict: 'REJECT:CHANNEL_JUDGE_ERROR',
                passed: false,
                code: 'CHANNEL_JUDGE_ERROR',
                error: error.message,
                latencyMs: 0
            };
        }
        return { verdict: 'ERROR', passed: true, error: error.message, latencyMs: 0 };
    }
}
