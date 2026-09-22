import { getActiveAiProvider } from '../database.js';
import { getCachedOpenAIClient, requestLlmCompletion } from './llm_client.js';
import { getJudgeProviders } from './intent_router.js';
import { normalizeRelationshipEvent } from './relationship.js';
import { normalizeArousalEvent } from './climax_engine.js';
import { parseLlmJson } from '../utils/robust_json.js';
import { evaluateTypeSafe, buildTypeSafeJudgeQuestions, isTypeSafeProvider } from '../services/typesafe_client.js';

export const JUDGE_CODES = [
    'REPETITION',
    'IGNORES_USER',
    'OUT_OF_CHARACTER',
    'STALE_CONTEXT',
    'INVENTED_FACT',
    'BROKEN_LOGIC',
    'SYSTEM_LEAK',
    'FORMAT',
    'GHOST_DELIVERY',
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
        .filter(item => item?.content && (item?.role !== 'system' || String(item.content).startsWith('[--- Пауза в диалоге')))
        .slice(-6)
        .map(item => {
            if (item.role === 'system') return String(item.content);
            return `${item.role === 'assistant' || item.role === 'lera' ? 'Лера' : 'Пользователь'}: ${String(item.content).slice(0, 300)}`;
        })
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
    const systemLeakContract = !isPublic
        ? '\n\n[SYSTEM LEAK JUDGE - ЗАПРЕТ УТЕЧЕК СИСТЕМНЫХ ИНСТРУКЦИЙ]:' +
          '\n- Если кандидат-ответ содержит мета-инструкции, системные мысли модели (например: «НЕ повторяй...», «Не начинай с...», «Ответь своими словами», «Инструкция:», технические термины, теги, служебные правила), ОБЯЗАТЕЛЬНО верни REJECT:SYSTEM_LEAK.'
        : '';
    const jsonFormat = isPublic
        ? ' {"verdict":"PASS" или "REJECT:CODE","reason":"краткая причина отказа если REJECT, иначе пустая строка"}'
        : isErotic
        ? ' {"verdict":"PASS" (или "REJECT:CODE"),"reason":"краткая причина отказа если REJECT, иначе пустая строка","relationship_event":{"type":"NEUTRAL|COMPLIMENT|AFFECTION|SUPPORT|APOLOGY|INSULT|DISRESPECT","intensity":0.0},"arousal_event":{"type":"NONE|KISS_TOUCH|ORAL_LICK|SEX_PENETRATION|CLIMAX_TRIGGER|COOL_DOWN","intensity":0.0}}'
        : ' {"verdict":"PASS" (или "REJECT:CODE"),"reason":"краткая причина отказа если REJECT, иначе пустая строка","relationship_event":{"type":"NEUTRAL|COMPLIMENT|AFFECTION|SUPPORT|APOLOGY|INSULT|DISRESPECT","intensity":0.0}}';
    return [
        {
            role: 'system',
            content: `${judgePrompt || ''}${relationshipContract}${arousalContract}${channelContract}${commentContract}${systemLeakContract}`
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
        const reasonText = parsed?.reason || parsed?.explanation || parsed?.details || null;
        const eventPayload = parsed?.relationship_event || parsed?.relationshipEvent || parsed?.event || {};
        const arousalPayload = parsed?.arousal_event || parsed?.arousalEvent || null;
        const arousalEvent = arousalPayload ? normalizeArousalEvent(arousalPayload) : null;
        if (verdictText === 'PASS') {
            return {
                verdict: 'PASS',
                passed: true,
                code: null,
                reason: null,
                relationshipEvent: normalizeRelationshipEvent(eventPayload),
                arousalEvent
            };
        }
        const jsonMatch = verdictText.match(/^REJECT:?([A-Z_]*)$/);
        if (jsonMatch) {
            const rawCode = jsonMatch[1] || parsed?.code || 'REJECTED';
            const matchedCode = JUDGE_CODES.includes(rawCode) ? rawCode : 'BROKEN_LOGIC';
            return {
                verdict: `REJECT:${matchedCode}`,
                passed: false,
                code: matchedCode,
                reason: reasonText ? String(reasonText).trim() : null,
                relationshipEvent: normalizeRelationshipEvent(eventPayload),
                arousalEvent
            };
        }
    } catch {
        // Backward-compatible compact verdicts are still accepted below.
    }
    const normalized = raw.toUpperCase().replace(/[`"'*\s]/g, '');
    if (normalized === 'PASS') return { verdict: 'PASS', passed: true, code: null, reason: null };
    const match = normalized.match(/^REJECT:([A-Z_]+)$/);
    if (match && JUDGE_CODES.includes(match[1])) {
        return { verdict: `REJECT:${match[1]}`, passed: false, code: match[1], reason: null };
    }
    return { verdict: 'INVALID', passed: true, code: null, reason: null, invalid: true };
}

export function applyJudgeModePolicy(parsedVerdict, { isPublic = false, configuredMode = 'OBSERVE' } = {}) {
    if (isPublic && parsedVerdict?.invalid) {
        return {
            ...parsedVerdict,
            verdict: 'REJECT:CHANNEL_JUDGE_INVALID',
            passed: false,
            code: 'CHANNEL_JUDGE_INVALID'
        };
    }
    if (!isPublic && configuredMode === 'ENFORCE' && parsedVerdict?.invalid) {
        return {
            ...parsedVerdict,
            verdict: 'REJECT:BROKEN_LOGIC',
            passed: false,
            code: 'BROKEN_LOGIC',
            reason: 'Судья вернул невалидный ответ вместо PASS или REJECT.'
        };
    }
    return parsedVerdict;
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
    toolTrace = [],
    emotionProfile = null,
    settings = {}
} = {}) {
    const surfaceKey = String(surface || 'CHAT').toUpperCase();
    const isPublic = surfaceKey === 'CHANNEL' || surfaceKey === 'CHANNEL_COMMENT';
    const configuredMode = isPublic
        ? settings.channelJudgeMode || settings.judgeMode
        : surfaceKey === 'INITIATIVE'
            ? settings.initiativeJudgeMode || settings.judgeMode
            : settings.judgeMode;
    if (configuredMode !== 'ENFORCE') {
        return { skipped: true, verdict: 'SKIPPED', passed: true, code: null };
    }

    const providers = await getJudgeProviders(settings);
    const typeSafeProvider = providers.find(isTypeSafeProvider);
    const fallbackProviders = providers.filter(provider => !isTypeSafeProvider(provider));
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
        if (typeSafeProvider && providers[0] === typeSafeProvider) {
            const startedAt = Date.now();
            const result = await evaluateTypeSafe({
                provider: typeSafeProvider,
                model: typeSafeProvider.model_name || 'jev-latest',
                timeoutMs: settings.judgeTimeoutMs,
                state: {
                    mode,
                    surface: surfaceKey,
                    conversation: compactConversation(messages),
                    userMessage: String(userText || '').slice(0, 2000),
                    candidateReply: String(reply || '').slice(0, 3000),
                    toolTrace: Array.isArray(toolTrace) ? toolTrace.slice(-8) : [],
                    emotionProfile,
                    dayContext: compactDayContext(dayContext),
                    memories: compactMemories(memories),
                    rules: compactLeraRules(leraRules)
                },
                questions: buildTypeSafeJudgeQuestions()
            });
            const threshold = 0.65;
            const codeMap = [
                ['system_leak', 'SYSTEM_LEAK'],
                ['invented_fact', 'INVENTED_FACT'],
                ['broken_logic', 'BROKEN_LOGIC'],
                ['ignores_user', 'IGNORES_USER'],
                ['out_of_character', 'OUT_OF_CHARACTER'],
                ['repetition', 'REPETITION'],
                ['format', 'FORMAT']
            ];
            const failed = codeMap.find(([key]) => Number(result.answers[key]?.noul) >= threshold);
            const relationshipType = String(result.answers.relationship_event?.choice || 'NEUTRAL').toUpperCase();
            const relationshipIntensity = {
                NEUTRAL: 0,
                SUPPORT: 0.7,
                COMPLIMENT: 0.6,
                AFFECTION: 0.8,
                INSULT: 0.9,
                DISRESPECT: 0.8,
                APOLOGY: 0.7
            }[relationshipType] ?? 0;
            const relationshipEvent = normalizeRelationshipEvent({ type: relationshipType, intensity: relationshipIntensity });
            const ghostDeliveryRe = /(?<![\p{L}\p{N}_])(?:вот\s+(?:держи|скинула|скину|ссылка|лови)|скинула|скину(?:\s+тебе)?|пришлю|отправлю|кину|держи(?:\s+(?:ссылку|статью|материал|в общем))?|лови(?:\s+(?:ссылку|статью))?)(?![\p{L}\p{N}_])/iu;
            const idiomRe = /(?:держи\s+(?:в\s+курсе|удар|дистанцию|карман|себя|руку|нос|хвост)|держись)/iu;
            const hasUrl = /https?:\/\/|t\.me\//i.test(reply);
            const hasDeliveryTool = Array.isArray(toolTrace) && toolTrace.some(t => ['send_content', 'send_photo', 'send_voice'].includes(t.name) && t.status === 'success');
            const isGhostDelivery = (ghostDeliveryRe.test(reply) && !idiomRe.test(reply) && !hasUrl && !hasDeliveryTool);

            const unfulfilledToolChoice = String(result.answers.unfulfilled_tool?.choice || 'NONE');
            const isJevGhostDelivery = unfulfilledToolChoice !== 'NONE' && !hasUrl && !hasDeliveryTool;

            const effectiveUnfulfilledTool = isJevGhostDelivery ? unfulfilledToolChoice : (isGhostDelivery ? 'send_content' : null);

            const parsedVerdict = (isJevGhostDelivery || isGhostDelivery)
                ? {
                    verdict: 'REJECT:GHOST_DELIVERY',
                    passed: false,
                    code: 'GHOST_DELIVERY',
                    unfulfilledTool: effectiveUnfulfilledTool,
                    reason: `Лера пообещала скинуть/показать материал или медиа, но инструмент ${effectiveUnfulfilledTool || 'отправки'} не был вызван`
                }
                : failed
                ? { verdict: 'REJECT:' + failed[1], passed: false, code: failed[1], reason: 'TypeSafe Jev flagged ' + failed[1] }
                : { verdict: 'PASS', passed: true, code: null, reason: null };
            const emotionConsistency = result.answers?.emotion_consistency
                ? {
                    consistent: Number(result.answers.emotion_consistency.noul) >= 0.5,
                    score: Number(result.answers.emotion_consistency.noul)
                }
                : null;

            return {
                ...parsedVerdict,
                rawText: JSON.stringify(result.answers),
                model: result.model,
                providerName: typeSafeProvider.name,
                latencyMs: Date.now() - startedAt,
                usage: result.usage || {},
                judgeMessages,
                typesafe: true,
                confidence: failed ? Number(result.answers[failed[0]]?.noul) : null,
                relationshipEvent,
                toolTrace,
                emotionConsistency
            };
        }
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
        const parsedVerdict = applyJudgeModePolicy(parseJudgeVerdict(result.rawText), {
            isPublic,
            configuredMode
        });
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
        if (typeSafeProvider && fallbackProviders.length > 0 && providers[0] === typeSafeProvider) {
            try {
                const result = await requestLlmCompletion(
                    { roleplay_mode: 'response-judge', max_tokens: settings.judgeMaxTokens },
                    judgeMessages,
                    false,
                    async () => {
                        const provider = fallbackProviders[0] || await getActiveAiProvider();
                        if (!provider) throw new Error('Нет настроенного провайдера судьи');
                        return { client: getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || settings.judgeTimeoutMs), model: settings.judgeModel || provider.model_name };
                    },
                    { userId, providers: fallbackProviders, modelOverride: fallbackProviders[0]?.model_name || null, timeoutMs: settings.judgeTimeoutMs, maxTokens: settings.judgeMaxTokens, temperature: 0, trace: false }
                );
                const parsedVerdict = applyJudgeModePolicy(parseJudgeVerdict(result.rawText), { isPublic, configuredMode });
                return { ...parsedVerdict, rawText: result.rawText || '', model: result.model, providerName: result.providerName, latencyMs: result.latencyMs || 0, usage: result.usage || {}, judgeMessages, fallbackFrom: typeSafeProvider.name, error: error.message };
            } catch (fallbackError) {
                error = fallbackError;
            }
        }
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
