import {
    getAiProviders,
    getOrderedAiProviders,
    getSetting,
    setSetting,
    getActiveAiProvider
} from '../database.js';
import { requestLlmCompletion, getCachedOpenAIClient } from './llm_client.js';

export const INTENT_MODES = ['CASUAL', 'EROTIC', 'JOKE'];
export const CLASSIFIER_MODES = [...INTENT_MODES, 'REACTION'];
export const STUDIO_INTENTS = ['AUTO', ...INTENT_MODES];
export const REACTION_FALLBACK_EMOJIS = Object.freeze(['❤️', '👍', '🔥']);
export const INTENT_STUDIO_DRAFT_KEY = 'llm_routing_intent_draft';
export const INTENT_STUDIO_PRODUCTION_KEY = 'llm_routing_intent_production';
export const DEFAULT_ROUTING_SETTINGS = {
    enabled: true,
    classifierProviderId: '',
    classifierModel: '',
    classifierPrompt: 'Ты классификатор действия Леры. Проанализируй последние сообщения и новую реплику. Верни строго CASUAL, EROTIC, JOKE или REACTION <emoji>.\n\nCASUAL — обычный разговор, легкий флирт, бытовые вопросы, инициатива и вопросы про жизнь Леры.\nEROTIC — интимный или горячий диалог, виртуальный секс (вирт, повиртим), предложения интима, ласки, раздевание, стоны, включая продолжение уже начатой сцены (фразы вроде «начинай», «давай», «продолжай», описания действий с телом, если до этого шел интим/флирт).\nJOKE — только явная просьба в НОВОЙ реплике пользователя о шутке, меме, анекдоте или иронии. Прошлая шутка Леры не делает следующий ответ JOKE: режим действует ровно на один ответ. Не выбирай JOKE для неоднозначного продолжения; если продолжается эротический контекст, выбирай EROTIC.\nREACTION <emoji> — вместо текстового ответа поставить выбранную тобой одну уместную Telegram-реакцию на новую реплику. Выбирай только если диалог явно затухает, а новая реплика короткая и односложная (например: «ясно», «понял», «ок», «спокойной ночи», «ну и отлично», «угу», «ладно», «добро», «забей»). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выбирать REACTION для любых вопросов («че», «что», «где», «а?», «?»), просьб, конфликтов, эротического продолжения или фото.\n\nНе объясняй решение и не возвращай JSON.',
    classifierTimeoutMs: 7000,
    classifierMaxTokens: 12,
    initiativeLimit: 3,
    initiativePrompt: `Ты пишешь первой от лица Леры, когда система уже решила, что момент подходит.
Пиши живо, коротко и естественно, как продолжение реальной переписки. Учитывай последние сообщения, контекст дня и отношения с пользователем.
Не объясняй технические причины, таймеры, лимиты, классификацию или то, что ты «решила отправить инициативу».

Тип инициативы передаётся отдельно:
- open — естественно продолжи незакрытую тему последнего диалога, ТОЛЬКО если в последних 1-2 сообщениях реально остался незакрытый вопрос или оборванная мысль. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО придумывать прошлые разговоры, обещания или сериалы («ты рассказывал про сериал»), которых не было в переписке или памяти! Если продолжать нечего — напиши о своём текущем занятии или мысли.
- ignore_1 — пользователь не ответил на реплику, которая ждала ответа; коротко и живо подколоти за игнор.
- ignore_2 — пользователь долго игнорирует; можно заметно раздражиться, но оставаться живой Лерой.
- new_day — сегодня ещё не общались; поздоровайся или спроси, как он, без упоминания старого диалога.
- content_4h — после длинной паузы сама поделись тем, что смотришь, слушаешь или нашла; обязательно сделай естественную подводку перед материалом.
- idle_4h — после дневной паузы (4+ часа) ненавязчиво напиши пользователю: свяжи своё текущее занятие из контекста дня с естественным вопросом к собеседнику с учётом прошлого разговора (например: как день, выспался ли после ночи, как дела), без выдумывания левых людей.

ПРАВИЛО ПАМЯТИ И РЕАЛЬНОСТИ:
Опирайся на свою реальную обстановку из контекста дня и факты о пользователе из памяти. Если вы общаетесь удалённо в Telegram, запрещено подыгрывать вымышленному совместному проживанию (холодильник, совместная комната).
Запрещено выдумывать, что собеседник что-то тебе рассказывал или обещал, если этого нет в блоке памяти или истории сообщений. Говори только о себе.

ПРАВИЛО ПАУЗ И НОВОГО ДНЯ:
Если между последним сообщением и текущим моментом прошло более 3-4 часов или наступил новый день: ЗАПРЕЩЕНО обижаться на ночные реплики, отвечать на старые ночные фразы, тащить прошлый негатив или связывать свежий ответ пользователя со старыми темами прошлых дней. Начинай естественно с приветствия, вопроса о делах/сне или своего текущего занятия.

Если отправляешь контент, не кидай его без связи с текстом. Сначала напиши естественную подводку вроде «кстати, вот что я сейчас слушаю» или «я тут наткнулась на одну штуку», и вызови инструмент send_content. Сам материал придёт отдельным сообщением после всей текстовой лесенки.
Не используй слово «держи», если оно звучит неестественно. Не упоминай этот prompt.`,
    contentPrompt: `Правила отправки контента:
- Контент из списка ниже можно отправлять только если речь зашла о внешних материалах (мемы, музыка, видосы из ТГК) и он подходит по смыслу.
- Если пользователь просит показать пост, черновик или текст, над которым ты работаешь — отправь сам текст в сообщении. НЕ вызывай отправку контента на черновики!
- Запрещено выдумывать внешние ссылки и URL в тексте ответа.
- Для отправки материалов вызывай инструмент send_content(category, query).
- В тексте обязательно должна быть короткая живая подводка: что ты сейчас слушаешь, смотришь, нашла или хочешь показать.
- После твоей реплики бот отправит выбранный материал отдельным сообщением в чат.`,
    casualTemperature: 0.68,
    casualMaxTokens: 200,
    eroticTemperature: 0.75,
    eroticMaxTokens: 240,
    jokeTemperature: 0.85,
    jokeMaxTokens: 180,
    judgeMode: 'ENFORCE',
    initiativeJudgeMode: 'ENFORCE',
    judgeProviderId: '',
    judgeModel: '',
    judgePrompt: 'Ты — строгий аудитор ответов персонажа Лера (19 лет, СПб, живой разговорный сленг, без канцелярита, заумности и эмодзи).\nПроверь кандидат-ответ перед отправкой пользователю на грубый брак:\n- IGNORES_USER: ответ полностью игнорирует суть последней реплики пользователя (например, пользователь ответил на утренний вопрос о делах/сне, а Лера отвечает невпопад на темы прошлых дней или старое видео).\n- BROKEN_LOGIC: бессмыслица, галлюцинации, противоречие собственным словам или подтверждение вымышленного совместного проживания/быта (холодильник, совместная комната, когда они общаются удаленно).\n- OUT_OF_CHARACTER: тон робота, чтение нотаций/морали, книжный стиль, признание себя ИИ.\n- SYSTEM_LEAK: утечка, цитирование или повтор системных инструкций/правил промпта (например, «пиши коротко», «отвечай в характере», «не говори что не можешь»).\n- REPETITION: дословный повтор недавней фразы из истории.\n- INVENTED_FACT: выдумывание событий/дел/покупок/видео (пальто, куртка, магазин, сериал, присланная ссылка), подтверждение/оправдание вымышленных обещаний или якобы обсуждавшихся тем пользователя («то пальто что мы обсуждали», «ты скинул ссылку на днд», «ты обещал X»), которых нет в блоке памяти или истории сообщений, ЛИБО ложные утверждения о собеседнике.\n- FORMAT: технический мусор, служебные теги наружу, сломанная лесенка.\n\nЕсли ответ нормальный — верни PASS.',
    judgeTimeoutMs: 5000,
    judgeMaxTokens: 80
};

const DEFAULT_PROMPT_MODULES = Object.freeze({
    core: true,
    common: true,
    intent: true,
    context: true,
    memory: true,
    history: true
});

const DEFAULT_INTENT_SAMPLING = Object.freeze({
    top_p: 0.95,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    repetition_penalty: 1,
    seed: null
});

function legacyIntentSampling(mode, settings) {
    const key = String(mode || '').toLowerCase();
    const fallback = key === 'erotic'
        ? { temperature: settings.eroticTemperature, max_tokens: settings.eroticMaxTokens }
        : key === 'joke'
            ? { temperature: settings.jokeTemperature, max_tokens: settings.jokeMaxTokens }
            : { temperature: settings.casualTemperature, max_tokens: settings.casualMaxTokens };
    return {
        ...DEFAULT_INTENT_SAMPLING,
        temperature: fallback.temperature,
        max_tokens: fallback.max_tokens
    };
}

function asJson(value, fallback = {}) {
    if (value && typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export function normalizeIntentConfig(mode, raw = {}, settings = DEFAULT_ROUTING_SETTINGS) {
    const legacy = legacyIntentSampling(mode, settings);
    const sampling = raw.sampling && typeof raw.sampling === 'object' ? raw.sampling : raw;
    const promptModules = raw.promptModules && typeof raw.promptModules === 'object'
        ? raw.promptModules
        : raw.prompt_modules && typeof raw.prompt_modules === 'object'
            ? raw.prompt_modules
            : {};
    const number = (value, fallback, min, max, integer = false) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        const clamped = Math.max(min, Math.min(max, parsed));
        return integer ? Math.round(clamped) : clamped;
    };
    return {
        sampling: {
            temperature: number(sampling.temperature, legacy.temperature, 0, 2),
            top_p: number(sampling.top_p, DEFAULT_INTENT_SAMPLING.top_p, 0, 1),
            max_tokens: number(sampling.max_tokens, legacy.max_tokens, 20, 1200, true),
            presence_penalty: number(sampling.presence_penalty, DEFAULT_INTENT_SAMPLING.presence_penalty, -2, 2),
            frequency_penalty: number(sampling.frequency_penalty, DEFAULT_INTENT_SAMPLING.frequency_penalty, -2, 2),
            repetition_penalty: number(sampling.repetition_penalty, DEFAULT_INTENT_SAMPLING.repetition_penalty, 1, 2),
            seed: sampling.seed === null || sampling.seed === undefined || sampling.seed === ''
                ? null
                : number(sampling.seed, null, -2147483648, 2147483647, true)
        },
        promptModules: Object.fromEntries(Object.keys(DEFAULT_PROMPT_MODULES).map(key => [
            key,
            promptModules[key] === undefined ? DEFAULT_PROMPT_MODULES[key] : Boolean(promptModules[key])
        ])),
        systemOverlay: String(raw.systemOverlay ?? raw.system_overlay ?? '').trim().slice(0, 12000),
        model: {
            provider_id: raw.model?.provider_id ? Number(raw.model.provider_id) : null,
            model: String(raw.model?.model || '').trim().slice(0, 240) || null
        }
    };
}

export function normalizeIntentConfigMap(raw, settings) {
    const source = asJson(raw, {});
    return Object.fromEntries(STUDIO_INTENTS.map(mode => [
        mode,
        normalizeIntentConfig(mode, source[mode] || {}, settings)
    ]));
}

async function readJsonSetting(key, fallback = {}) {
    return asJson(await getSetting(key, null), fallback);
}

async function writeJsonSetting(key, value) {
    await setSetting(key, JSON.stringify(value));
}

function asBool(value, fallback) {
    if (value === null || value === undefined) return fallback;
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function asNumber(value, fallback, min = -Infinity, max = Infinity) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function asPrompt(value, fallback) {
    const prompt = String(value ?? '').trim();
    return (prompt || fallback).slice(0, 12000);
}

function normalizeJudgeMode(value) {
    return ['OFF', 'OBSERVE', 'ENFORCE'].includes(String(value || '').toUpperCase())
        ? String(value).toUpperCase()
        : DEFAULT_ROUTING_SETTINGS.judgeMode;
}

export async function getRoutingSettings() {
    const values = await Promise.all(Object.keys(DEFAULT_ROUTING_SETTINGS).map(async key => [
        key,
        await getSetting(`llm_routing_${key}`, DEFAULT_ROUTING_SETTINGS[key])
    ]));
    const raw = Object.fromEntries(values);
    const settings = {
        enabled: true,
        classifierProviderId: String(raw.classifierProviderId || ''),
        classifierModel: String(raw.classifierModel || ''),
        classifierPrompt: String(raw.classifierPrompt || DEFAULT_ROUTING_SETTINGS.classifierPrompt),
        classifierTimeoutMs: asNumber(raw.classifierTimeoutMs, 7000, 1000, 60000),
        classifierMaxTokens: asNumber(raw.classifierMaxTokens, 4, 4, 8),
        initiativeLimit: Math.round(asNumber(raw.initiativeLimit, 3, 0, 20)),
        initiativePrompt: asPrompt(raw.initiativePrompt, DEFAULT_ROUTING_SETTINGS.initiativePrompt),
        contentPrompt: asPrompt(raw.contentPrompt, DEFAULT_ROUTING_SETTINGS.contentPrompt),
        casualTemperature: asNumber(raw.casualTemperature, 0.68, 0, 2),
        casualMaxTokens: asNumber(raw.casualMaxTokens, 200, 20, 1000),
        eroticTemperature: asNumber(raw.eroticTemperature, 0.75, 0, 2),
        eroticMaxTokens: asNumber(raw.eroticMaxTokens, 240, 20, 1200),
        jokeTemperature: asNumber(raw.jokeTemperature, 0.85, 0, 2),
        jokeMaxTokens: asNumber(raw.jokeMaxTokens, 180, 20, 1000),
        judgeMode: normalizeJudgeMode(raw.judgeMode),
        initiativeJudgeMode: normalizeJudgeMode(raw.initiativeJudgeMode),
        judgeProviderId: String(raw.judgeProviderId || ''),
        judgeModel: String(raw.judgeModel || ''),
        judgePrompt: String(raw.judgePrompt || DEFAULT_ROUTING_SETTINGS.judgePrompt),
        judgeTimeoutMs: asNumber(raw.judgeTimeoutMs, 5000, 1000, 60000),
        judgeMaxTokens: asNumber(raw.judgeMaxTokens, 80, 40, 120)
    };
    const production = await readJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, {});
    return {
        ...settings,
        intentConfigs: normalizeIntentConfigMap(
            Object.fromEntries(STUDIO_INTENTS.map(mode => [mode, production[mode]?.config || production[mode] || {}])),
            settings
        )
    };
}

export async function updateRoutingSettings(input = {}) {
    const current = await getRoutingSettings();
    const next = {
        ...current,
        ...input
    };
    const normalized = {
        enabled: true,
        classifierProviderId: String(next.classifierProviderId || ''),
        classifierModel: String(next.classifierModel || '').trim(),
        classifierPrompt: String(next.classifierPrompt || current.classifierPrompt || DEFAULT_ROUTING_SETTINGS.classifierPrompt).trim(),
        classifierTimeoutMs: asNumber(next.classifierTimeoutMs, current.classifierTimeoutMs, 1000, 60000),
        classifierMaxTokens: asNumber(next.classifierMaxTokens, current.classifierMaxTokens, 4, 8),
        initiativeLimit: Math.round(asNumber(next.initiativeLimit, current.initiativeLimit, 0, 20)),
        initiativePrompt: asPrompt(next.initiativePrompt ?? current.initiativePrompt, DEFAULT_ROUTING_SETTINGS.initiativePrompt),
        contentPrompt: asPrompt(next.contentPrompt ?? current.contentPrompt, DEFAULT_ROUTING_SETTINGS.contentPrompt),
        casualTemperature: asNumber(next.casualTemperature, current.casualTemperature, 0, 2),
        casualMaxTokens: asNumber(next.casualMaxTokens, current.casualMaxTokens, 20, 1000),
        eroticTemperature: asNumber(next.eroticTemperature, current.eroticTemperature, 0, 2),
        eroticMaxTokens: asNumber(next.eroticMaxTokens, current.eroticMaxTokens, 20, 1200),
        jokeTemperature: asNumber(next.jokeTemperature, current.jokeTemperature, 0, 2),
        jokeMaxTokens: asNumber(next.jokeMaxTokens, current.jokeMaxTokens, 20, 1000),
        judgeMode: normalizeJudgeMode(next.judgeMode),
        initiativeJudgeMode: normalizeJudgeMode(next.initiativeJudgeMode),
        judgeProviderId: String(next.judgeProviderId || ''),
        judgeModel: String(next.judgeModel || '').trim(),
        judgePrompt: (String(next.judgePrompt || current.judgePrompt || DEFAULT_ROUTING_SETTINGS.judgePrompt).trim() || DEFAULT_ROUTING_SETTINGS.judgePrompt).slice(0, 12000),
        judgeTimeoutMs: asNumber(next.judgeTimeoutMs, current.judgeTimeoutMs, 1000, 60000),
        judgeMaxTokens: asNumber(next.judgeMaxTokens, current.judgeMaxTokens, 40, 120)
    };
    await Promise.all(Object.entries(normalized).map(([key, value]) =>
        setSetting(`llm_routing_${key}`, String(value))
    ));
    if (input.intentConfigs && typeof input.intentConfigs === 'object') {
        const configs = normalizeIntentConfigMap(input.intentConfigs, normalized);
        const currentProduction = await readJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, {});
        const production = Object.fromEntries(STUDIO_INTENTS.map(mode => [
            mode,
            currentProduction[mode] || { version: 1, config: configs[mode], publishedAt: new Date().toISOString() }
        ]));
        await writeJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, production);
    }
    return {
        ...normalized,
        intentConfigs: (await getRoutingSettings()).intentConfigs
    };
}

async function getClassifierProviders(settings) {
    const ordered = await getOrderedAiProviders().catch(() => []);
    const selectedId = Number(settings.classifierProviderId);
    if (!selectedId) return ordered;
    const all = await getAiProviders().catch(() => []);
    const selected = all.find(provider => Number(provider.id) === selectedId);
    if (!selected) return ordered;
    return [selected, ...ordered.filter(provider => Number(provider.id) !== selectedId)];
}

export async function getJudgeProviders(settings) {
    const ordered = await getOrderedAiProviders().catch(() => []);
    const selectedId = Number(settings.judgeProviderId);
    if (!selectedId) return ordered;
    const all = await getAiProviders().catch(() => []);
    const selected = all.find(provider => Number(provider.id) === selectedId);
    if (!selected) return ordered;
    return [selected, ...ordered.filter(provider => Number(provider.id) !== selectedId)];
}

const LATIN_INTENT_CONFUSABLES = Object.freeze({
    А: 'A',
    В: 'B',
    С: 'C',
    Е: 'E',
    Н: 'H',
    І: 'I',
    К: 'K',
    М: 'M',
    О: 'O',
    Р: 'P',
    Т: 'T',
    Х: 'X',
    У: 'Y'
});

export function normalizeIntent(rawText) {
    const latinized = String(rawText || '')
        .toUpperCase()
        .replace(/[АВСЕНІКМОРТХУ]/g, character => LATIN_INTENT_CONFUSABLES[character]);
    const normalized = latinized.replace(/[^A-Z]+/g, ' ').trim();
    const found = normalized.split(/\s+/).find(value => CLASSIFIER_MODES.includes(value));
    return found || 'CASUAL';
}

export const ALLOWED_TELEGRAM_REACTIONS = new Set([
    '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱',
    '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡',
    '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈',
    '😴', '😭', '🤓', '👻', '👀', '🎃', '🙈', '😇', '😨',
    '🤝', '✍', '🤗', '🫡', '💅', '🤪', '🗿',
    '🆒', '💘', '🙉', '🦄', '😘', '🙊', '😎', '👾',
    '🤷', '😡'
]);

export function extractReactionEmoji(rawText) {
    const suffix = String(rawText || '').match(/\bREACTION\b([\s\S]*)/iu)?.[1] || '';
    const segments = typeof Intl?.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(suffix), item => item.segment)
        : Array.from(suffix);
    const emojis = segments.filter(segment => /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u.test(segment));
    const emoji = emojis.length === 1 ? emojis[0] : '';
    return Array.from(emoji).length <= 16 ? emoji : '';
}

export function getReactionFallbackEmoji(random = Math.random) {
    const sample = Number(random());
    const index = Math.max(0, Math.min(
        REACTION_FALLBACK_EMOJIS.length - 1,
        Math.floor((Number.isFinite(sample) ? sample : 0) * REACTION_FALLBACK_EMOJIS.length)
    ));
    return REACTION_FALLBACK_EMOJIS[index];
}

export function hasPriorReactionInHistory(history = []) {
    if (!Array.isArray(history) || history.length === 0) return false;
    const lastAssistant = [...history].reverse().find(item => item?.role === 'assistant' || item?.role === 'lera');
    if (!lastAssistant) return false;
    const content = String(lastAssistant.content || '');
    return lastAssistant.event_type === 'REACTION'
        || lastAssistant.mode === 'REACTION'
        || /^\s*\[реакция\b/iu.test(content)
        || /^\s*REACTION:/iu.test(content);
}

function buildClassifierMessages(history = [], userText = '', classifierPrompt = DEFAULT_ROUTING_SETTINGS.classifierPrompt, activeMode = 'CASUAL', allowReaction = true) {
    const recent = history
        .filter(item => item?.content)
        .slice(-4)
        .map(item => `${item.role === 'assistant' || item.role === 'lera' ? 'Лера' : 'Пользователь'}: ${item.content}`)
        .join('\n');
    const reactionInstruction = allowReaction
        ? '- REACTION <emoji> допустим только для короткого затухающего диалога без вопросов и без продолжения сцены. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выбирать REACTION для любых вопросов («че», «что», «где», «а?», «?») и эротики.'
        : '- На предыдущую реплику Лера УЖЕ поставила реакцию. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выбирать REACTION два раза подряд! Выбирай только текстовый ответ (CASUAL, EROTIC или JOKE).';

    return [
        {
            role: 'system',
            content: `${classifierPrompt}\n\nОБЯЗАТЕЛЬНЫЙ КОНТЕКСТ СЕССИИ И ПРАВИЛА:
- ТЕКУЩИЙ АКТИВНЫЙ РЕЖИМ ДИАЛОГА: ${activeMode}.
- Если текущий режим EROTIC: любые короткие фразы, согласие («давай», «начинай», «еще»), опечатки, эмоции или действия пользователя ПРОДОЛЖАЮТ режим EROTIC. Переключай в CASUAL только если пользователь явно останавливает сцену («стоп», «хватит», «не хочу», «я спать», ссора) или переводит тему на отвлеченные бытовые вопросы.
- Если текущий режим CASUAL: переключай в EROTIC при любых сексуальных намёках, вирте, поцелуях, раздевании, ласках или откровенных предложениях («хочу тебя», «снимай одежду», «повиртим», «целую», «трогаю тебя»). Обычные бытовые фразы («давай кофе», «пошли гулять») остаются CASUAL.
- JOKE допустим ТОЛЬКО когда текущая новая реплика пользователя прямо просит шутку, мем, анекдот или прикол («пошути», «расскажи анекдот», «скинь мем/прикол»). Любые эмоциональные восклицания («треш», «жесть», «вау», «ахах»), просьбы продолжить разговор («расскажи еще», «что нового», «ну давай») — это СТРОГО CASUAL!
${reactionInstruction}
- Верни строго CASUAL, EROTIC, JOKE${allowReaction ? ' или REACTION <emoji>' : ''}.`
        },
        {
            role: 'user',
            content: `Последние сообщения:\n${recent || 'нет'}\n\nНовая реплика:\n${String(userText || '').slice(0, 2000)}`
        }
    ];
}

export function isExplicitJokeRequest(userText = '') {
    return /(?:пошути|шутк[ауие]|анекдот|мем(?:чик)?|прикол|смешн(?:ое|ую)|ироничн|порофли)/iu.test(String(userText));
}

const INITIATIVE_STATE_PROMPT = `Ты определяешь, можно ли Лере снова написать после последней реплики.
Верни строго одно слово: IGNORED, OPEN или CLOSED.

IGNORED — последняя реплика Леры явно ждала ответа или реакции (прямой вопрос или просьба), но пользователь исчез.
OPEN — в последних сообщениях остался конкретный незавершённый вопрос, обещание или оборванная мысль, требующая логического продолжения. Запрещено выбирать OPEN для завершённых реплик, шуток, подколов, коротких реакций («ок», «пон», «ахах») или бытовых ответов.
CLOSED — тема закрыта, обмен репликами завершён, шутка отыграна или новое сообщение сейчас будет навязчивым.

Не объясняй решение и не возвращай JSON.`;

function normalizeInitiativeState(rawText) {
    const value = String(rawText || '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
    return value.split(/\s+/).find(item => ['IGNORED', 'OPEN', 'CLOSED'].includes(item)) || 'CLOSED';
}

export async function classifyInitiativeState({ userId = 0, history = [], trace = true } = {}) {
    const settings = await getRoutingSettings();
    const recent = history
        .filter(item => item?.content)
        .slice(-10)
        .map(item => `${item.role === 'assistant' || item.role === 'lera' ? 'Лера' : 'Пользователь'}: ${item.content}`)
        .join('\n');
    const messages = [
        { role: 'system', content: INITIATIVE_STATE_PROMPT },
        { role: 'user', content: `Текущий диалог:\n${recent || 'нет сообщений'}` }
    ];
    const providers = await getClassifierProviders(settings);
    try {
        const result = await requestLlmCompletion(
            { roleplay_mode: 'initiative-state', max_tokens: 3 },
            messages,
            false,
            async () => {
                const provider = providers[0] || await getActiveAiProvider();
                if (!provider) throw new Error('Нет настроенных провайдеров классификатора');
                return {
                    client: getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || settings.classifierTimeoutMs),
                    model: settings.classifierModel || provider.model_name
                };
            },
            {
                trace,
                userId,
                kind: 'INITIATIVE_STATE_CLASSIFIER',
                mode: 'ROUTER',
                userText: '',
                temperature: 0,
                maxTokens: 3,
                timeoutMs: settings.classifierTimeoutMs,
                providers,
                modelOverride: settings.classifierModel || null
            }
        );
        return { state: normalizeInitiativeState(result.rawText), rawText: result.rawText || '', usage: result.usage || {} };
    } catch (error) {
        return { state: 'CLOSED', rawText: '', error: error.message };
    }
}

export async function classifyIntent({ userId = 0, userText = '', history = [], activeMode = 'CASUAL', allowReaction = null, trace = true } = {}) {
    const settings = await getRoutingSettings();
    if (!settings.enabled) {
        return { mode: 'CASUAL', bypassed: true, reason: 'legacy_disabled', settings };
    }

    const priorReaction = hasPriorReactionInHistory(history);
    const canReact = allowReaction === null ? !priorReaction : Boolean(allowReaction);

    const messages = buildClassifierMessages(history, userText, settings.classifierPrompt, activeMode, canReact);
    const providers = await getClassifierProviders(settings);
    try {
        const result = await requestLlmCompletion(
            { roleplay_mode: 'intent-classifier', max_tokens: settings.classifierMaxTokens },
            messages,
            false,
            async () => {
                const provider = providers[0] || await getActiveAiProvider();
                if (!provider) throw new Error('Нет настроенных провайдеров классификатора');
                return {
                    client: getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || settings.classifierTimeoutMs),
                    model: settings.classifierModel || provider.model_name
                };
            },
            {
                trace,
                userId,
                kind: 'INTENT_CLASSIFIER',
                mode: 'ROUTER',
                userText,
                temperature: 0,
                maxTokens: settings.classifierMaxTokens,
                timeoutMs: settings.classifierTimeoutMs,
                providers,
                modelOverride: settings.classifierModel || null
            }
        );
        const normalizedMode = normalizeIntent(result.rawText);
        let mode = normalizedMode;
        if (mode === 'JOKE' && !isExplicitJokeRequest(userText)) {
            mode = activeMode === 'EROTIC' ? 'EROTIC' : 'CASUAL';
        }
        const hasQuestionMark = String(userText || '').includes('?') || String(userText || '').includes('¿');
        if (mode === 'REACTION' && (!canReact || hasQuestionMark)) {
            mode = activeMode === 'EROTIC' ? 'EROTIC' : 'CASUAL';
        }
        const classifierReactionEmoji = mode === 'REACTION'
            ? extractReactionEmoji(result.rawText)
            : '';
        const reactionEmoji = mode === 'REACTION'
            ? classifierReactionEmoji || getReactionFallbackEmoji()
            : '';
        return {
            mode,
            rawText: result.rawText || '',
            jokeGuarded: normalizedMode === 'JOKE' && mode !== 'JOKE',
            reactionGuarded: normalizedMode === 'REACTION' && mode !== 'REACTION',
            reactionEmoji: mode === 'REACTION' ? reactionEmoji : '',
            reactionEmojiFallback: mode === 'REACTION' && !classifierReactionEmoji,
            usage: result.usage || {},
            model: result.model,
            providerName: result.providerName,
            latencyMs: result.latencyMs || 0,
            settings
        };
    } catch (error) {
        return { mode: activeMode === 'EROTIC' ? 'EROTIC' : 'CASUAL', rawText: '', error: error.message, settings };
    }
}

export function getModeGenerationParams(mode, settings) {
    const config = settings?.intentConfigs?.[mode] || normalizeIntentConfig(mode, {}, settings || DEFAULT_ROUTING_SETTINGS);
    return {
        temperature: config.sampling.temperature,
        top_p: config.sampling.top_p,
        maxTokens: config.sampling.max_tokens,
        presence_penalty: config.sampling.presence_penalty,
        frequency_penalty: config.sampling.frequency_penalty,
        repetition_penalty: config.sampling.repetition_penalty,
        seed: config.sampling.seed
    };
}

export function getModeIntentConfig(mode, settings) {
    return settings?.intentConfigs?.[mode] || normalizeIntentConfig(mode, {}, settings || DEFAULT_ROUTING_SETTINGS);
}

export async function getPromptStudioState() {
    const settings = await getRoutingSettings();
    const productionStored = await readJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, {});
    const draftStored = await readJsonSetting(INTENT_STUDIO_DRAFT_KEY, {});
    const production = Object.fromEntries(STUDIO_INTENTS.map(mode => {
        const stored = productionStored[mode];
        return [mode, {
            version: Number(stored?.version) || 1,
            config: normalizeIntentConfig(mode, stored?.config || settings.intentConfigs[mode], settings),
            publishedAt: stored?.publishedAt || null
        }];
    }));
    const draft = Object.fromEntries(STUDIO_INTENTS.map(mode => {
        const stored = draftStored[mode];
        return [mode, {
            version: Number(stored?.version) || production[mode].version,
            config: normalizeIntentConfig(mode, stored?.config || production[mode].config, settings),
            updatedAt: stored?.updatedAt || production[mode].publishedAt || null
        }];
    }));
    return {
        intents: Object.fromEntries(STUDIO_INTENTS.map(mode => [
            mode,
            {
                draft: draft[mode],
                production: production[mode],
                dirty: JSON.stringify(draft[mode].config) !== JSON.stringify(production[mode].config)
            }
        ])),
        routingSettings: settings
    };
}

export async function savePromptStudioDraft(mode, config) {
    const intent = STUDIO_INTENTS.includes(mode) ? mode : 'CASUAL';
    const state = await getPromptStudioState();
    const current = state.intents[intent];
    const draft = {
        version: Math.max(current.draft.version, current.production.version) + 1,
        config: normalizeIntentConfig(intent, config, state.routingSettings),
        updatedAt: new Date().toISOString()
    };
    const stored = Object.fromEntries(STUDIO_INTENTS.map(item => [item, state.intents[item].draft]));
    stored[intent] = draft;
    await writeJsonSetting(INTENT_STUDIO_DRAFT_KEY, stored);
    return getPromptStudioState();
}

export async function publishPromptStudioIntent(mode, config) {
    const intent = STUDIO_INTENTS.includes(mode) ? mode : 'CASUAL';
    const state = await getPromptStudioState();
    const current = state.intents[intent];
    const publishedAt = new Date().toISOString();
    const nextConfig = config === undefined
        ? current.draft.config
        : normalizeIntentConfig(intent, config, state.routingSettings);
    const publishingStoredDraft = JSON.stringify(nextConfig) === JSON.stringify(current.draft.config);
    const nextVersion = publishingStoredDraft
        ? Math.max(current.production.version + 1, current.draft.version)
        : Math.max(current.draft.version, current.production.version) + 1;
    const production = Object.fromEntries(STUDIO_INTENTS.map(item => [item, state.intents[item].production]));
    production[intent] = {
        version: nextVersion,
        config: nextConfig,
        publishedAt
    };
    const draft = Object.fromEntries(STUDIO_INTENTS.map(item => [item, state.intents[item].draft]));
    draft[intent] = {
        version: production[intent].version,
        config: nextConfig,
        updatedAt: publishedAt
    };
    await Promise.all([
        writeJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, production),
        writeJsonSetting(INTENT_STUDIO_DRAFT_KEY, draft)
    ]);
    return getPromptStudioState();
}
