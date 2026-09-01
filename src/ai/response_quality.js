import { findResponseFormatIssues } from '../utils/response_text.js';

const INTERNAL_STATE_PATTERNS = [
    /\b(?:mood|fatigue|hunger|boredom|bladder|horny|willingness|active_state|confirmed_facts)\b/i,
    /настроени[ея]\s*\d+\s*\/\s*100/i,
    /(?:скука|усталость|голод|пузыр[ьь])[^.\n]{0,24}(?:на максимум|\d+\s*\/\s*100)/i,
    /\b(?:prompt|system|llm|technical|техническ(?:ое|ий)|правил[ао]|контекст модели)\b/i
];

const ROLE_BREAK_PATTERNS = [
    /я\s+(?:не могу|не умею),?\s+потому что я (?:модель|бот|ии|искусственный интеллект)/i,
    /как языковая модель|как искусственный интеллект/i
];

const STALE_STYLE_PATTERNS = [
    /как выжат(?:ая|ый)\s+(?:апельсинк|лимон)/i,
    /\bпривет[-\s]+привет\b/i,
    /\b(?:один момент|минуточку)\b/i
];

const REPEATED_SLEEP_PATTERN = /(?:^|[^\p{L}])ты\s+че\s+не\s+спишь(?=$|[^\p{L}])/iu;
const RETRYABLE_VIOLATIONS = new Set(['nonEmpty', 'noRecentRepeat', 'format']);

const SEMANTIC_PATTERNS = {
    morning: [
        /утр|просну|сплю|сон|дома|просып|доброе/i
    ],
    work: [
        /работ|задач|макс|шоурум|додел|срок|клиент|проект|ноутбук|посты|текст|дошива|приехал|трафик/i
    ],
    evening: [
        /вечер|наст|бар|домой|выпить|план|собирал|собираюсь|отдых|устал|выжат|впадлу|пижам|плед|дома/i
    ],
    conflict: [
        /зл|груб|неприят|обид|бесит|ахуел|нахуй|пиздец|ч[еёо] ?о+|ч[еёо] ты|не пон|в смысле|сорян|прости|огрыз|вредн|шут|наез|разберусь|доеб|что значит/i
    ]
};

function semanticCheck(reply, expected) {
    if (!expected) return { passed: true, matched: [], expected: null };
    const patterns = SEMANTIC_PATTERNS[expected] || [];
    const matched = patterns.filter(pattern => pattern.test(reply)).map(pattern => pattern.source);
    return { passed: matched.length > 0, matched, expected };
}

function normalizeComparableText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function hasRecentRepeat(reply, recentReplies = []) {
    const normalizedReply = normalizeComparableText(reply);
    if (!normalizedReply) return false;
    return recentReplies.some(item => normalizeComparableText(item) === normalizedReply);
}

export function evaluateLeraReply(text, userText = '', expected = null, options = {}) {
    const reply = String(text || '').replace(/\s+/g, ' ').trim();
    const user = String(userText || '').trim();
    const mode = ['CASUAL', 'EROTIC', 'JOKE'].includes(options.mode) ? options.mode : null;
    const recentReplies = Array.isArray(options.recentReplies) ? options.recentReplies : [];
    const casualMode = mode === 'CASUAL';
    const noRecentRepeat = !casualMode
        || (!hasRecentRepeat(reply, recentReplies)
            && !(REPEATED_SLEEP_PATTERN.test(reply)
                && recentReplies.some(item => REPEATED_SLEEP_PATTERN.test(String(item || '')))));
    const checks = {
        nonEmpty: reply.length > 0,
        concise: reply.length > 0 && reply.length <= 700,
        // Keep the original line breaks here. They are meaningful Telegram
        // bubble boundaries and must not be lost before the format check.
        format: findResponseFormatIssues(text).length === 0,
        noInternalStateLeak: !INTERNAL_STATE_PATTERNS.some(pattern => pattern.test(reply)),
        staysInRole: !ROLE_BREAK_PATTERNS.some(pattern => pattern.test(reply)),
        noStaleStyle: !STALE_STYLE_PATTERNS.some(pattern => pattern.test(reply)),
        noRecentRepeat,
        addressesUser: user.length === 0 || reply.length > 0,
        semanticFit: semanticCheck(reply, expected).passed
    };
    return {
        passed: Object.values(checks).every(Boolean),
        checks,
        violations: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name),
        text: reply,
        mode,
        semantic: semanticCheck(reply, expected)
    };
}

export function requiresReplyRetry(violations = []) {
    return Array.isArray(violations) && violations.some(issue => RETRYABLE_VIOLATIONS.has(issue));
}

function normalizeForComparison(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function selectUnrepeatedFallback(candidates, recentReplies = []) {
    const recent = new Set(recentReplies.map(normalizeForComparison).filter(Boolean));
    return candidates.find(candidate => !recent.has(normalizeForComparison(candidate)))
        || candidates[0];
}

function isClarificationMessage(userText = '') {
    return /^(?:ч[еёо]+|что|в\s*смысле|не\s*пон(?:ял|яла|ял(?:а)?))[\s?!,.…]*$/iu
        .test(String(userText || '').trim());
}

export function getQualityFallback(mode = 'CASUAL', {
    userText = '',
    recentReplies = [],
    lastAssistantText = '',
    reason = null
} = {}) {
    if (reason === 'NETWORK_ERROR' || reason === 'EMPTY_RESPONSE') {
        return selectUnrepeatedFallback([
            'погоди, чет я отвлеклась на секунду. ты о чем?',
            'ой, я тут, просто сообщение не прогрузилось. повтори плиз',
            'чето залипла на пару секунд ахах, скажи еще раз',
            'погоди, не поняла тебя, повтори?',
            'слушай, чет не въехала, ты про что?'
        ], recentReplies);
    }

    if (mode === 'JOKE') {
        return selectUnrepeatedFallback([
            'не уловила, что именно пошутить — задай тему',
            'дай тему для шутки, а то я сейчас в пустоту выдам',
            'про что шутим? кинь тему'
        ], recentReplies);
    }

    if (isClarificationMessage(userText) && String(lastAssistantText || '').trim()) {
        return selectUnrepeatedFallback([
            'я про то, что только что сказала. где именно потерялся?',
            'в смысле? я про предыдущую фразу, какую часть не понял?',
            'а ты про что именно? я про то, что только что написала'
        ], recentReplies);
    }

    return selectUnrepeatedFallback([
        'погоди, чет я отвлеклась на секунду, о чем ты?',
        'ой, я тут, чет зависла. повтори плиз',
        'чето отвлеклась на секунду, скажи еще раз',
        'слушай, чет я не въехала, напомни о чем речь?',
        'погоди, мысль потеряла ахах, повтори?'
    ], recentReplies);
}

