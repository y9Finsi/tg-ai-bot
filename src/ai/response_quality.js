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

export function getQualityFallback(mode = 'CASUAL') {
    if (mode === 'JOKE') {
        return 'не уловила, что именно пошутить — задай тему';
    }
    return 'не поняла, что ты имеешь в виду — скажи ещё раз нормально';
}
