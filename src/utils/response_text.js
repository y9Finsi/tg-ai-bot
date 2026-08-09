const DASH_CHARACTERS = /[-\u058A\u05BE\u1400\u1806\u2010-\u2015\u2E17\u2E1A\u2E3A-\u2E3B\u2E40\u301C\u3030\u30A0\uFE31-\uFE32\uFE58\uFE63\uFF0D]/gu;
const DECORATIVE_QUOTES = /[«»“”„‟]/gu;
const RESPONSE_BOUNDARY = /(?<!\.)\.(?=\s+)|[!?](?=\s+)|(?<=\s|[а-яё])(?=(?:кстати|короче|зато|только|ещё)(?![а-яё]))/giu;
const LADDER_PART_LIMIT = 100;
const LADDER_MESSAGE_LIMIT = 48;
const MAX_RESPONSE_MESSAGES = 6;

// These are format anomalies, not text-repair rules. We must not guess where
// arbitrary Russian words should be separated: the model has to regenerate
// the reply with an explicit `|||` boundary.
const ATTACHED_CONVERSATIONAL_BOUNDARY = [
    /(?<=[а-яё])(кстати|короче|зато|только|ещё)(?=[а-яё])/iu,
    /(?<=[а-яё])(как|что|почему|зачем|куда|где|когда)\s+(?=(?:ощущения|дела|ты|у тебя|это|так)(?:\s|$))/iu
];

export function cleanResponseText(rawText) {
    if (!rawText) return '';
    let text = String(rawText).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/<think>[\s\S]*/gi, '').trim();
    text = text.replace(/\[IMAGE:[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[IMAGE:[\s\S]*/gi, '').trim();
    text = text.replace(/\[RECOMMEND\]/gi, '').trim();
    text = text.replace(/\[SYSTEM\]:?/gi, '').trim();
    text = text.replace(/SYSTEM:?/gi, '').trim();
    text = text.replace(/\[СИСТЕМНАЯ ЗАДАЧА[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[СИСТЕМНАЯ КОМАНДА[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[СИСТЕМНЫЙ БЛОК[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[Лера отправила[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[Лера переслала[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[D:[^\]]+\]|\[(?:M|R|PHOTO|VOICE|VIDEO|STICKER|INITIATIVE|REMEMBER|FORGET|MUTE|SYSTEM)[^\]]*\]/gi, '').trim();
    text = text.replace(/Лера отправила личное фото:?[\s\S]*/gi, '').trim();
    text = text.replace(/Лера переслала пост:?[\s\S]*/gi, '').trim();
    text = text.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fa5\uac00-\ud7af]+/g, '');

    try {
        text = text.replace(/\p{Extended_Pictographic}/gu, '');
        text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '');
    } catch {
        text = text.replace(/[\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u2600-\u26FF\u2700-\u27BF]/g, '');
    }

    text = text.replace(/[()]+/g, '');
    text = text.replace(DASH_CHARACTERS, ' ');
    text = text.replace(DECORATIVE_QUOTES, '');
    text = text.replace(/[\uFE0E\uFE0F\u20E3]/gu, '');
    return text
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

export function splitResponseMessages(text) {
    let raw = String(text || '').trim();
    if (!raw) return [];

    let parts = raw.includes('|||')
        ? raw.split(/\s*\|\|\|\s*/)
        : raw.split(/\n+/);
    parts = parts
        .flatMap(part => splitLongResponsePart(part.trim()))
        .map(part => part.trim().replace(/(?<!\.)\.$/u, ''))
        .filter(Boolean);

    if (parts.length > MAX_RESPONSE_MESSAGES) {
        return [...parts.slice(0, MAX_RESPONSE_MESSAGES - 1), parts.slice(MAX_RESPONSE_MESSAGES - 1).join(' ')].filter(Boolean);
    }
    return parts;
}

export function findResponseFormatIssues(text) {
    const value = String(text || '');
    const issues = [];

    // A model may use newlines instead of `|||`. The queue already supports
    // that layout, so do not spend a retry or rewrite an otherwise usable reply.
    if (/\r?\n/.test(value) || value.includes('|||')) {
        return issues;
    }

    if (ATTACHED_CONVERSATIONAL_BOUNDARY.some(pattern => pattern.test(value))) {
        issues.push('attached_conversational_boundary');
    }

    return issues;
}

function splitLongResponsePart(part) {
    const opening = part.match(/^(да|ну|ага|нет|хм|блин),\s+/iu);
    if (opening && part.length > LADDER_PART_LIMIT) {
        return [opening[1], ...splitLongResponsePart(part.slice(opening[0].length).trim())];
    }

    if (part.length <= LADDER_PART_LIMIT || !RESPONSE_BOUNDARY.test(part)) {
        RESPONSE_BOUNDARY.lastIndex = 0;
        return splitByMessageLength(part);
    }

    RESPONSE_BOUNDARY.lastIndex = 0;
    const chunks = [];
    let start = 0;
    let match;

    while ((match = RESPONSE_BOUNDARY.exec(part)) !== null) {
        if (match[0].length === 0) {
            chunks.push(part.slice(start, match.index).trim());
            start = match.index;
            RESPONSE_BOUNDARY.lastIndex = match.index + 1;
            continue;
        }
        const end = match.index + match[0].length - match[0].trimStart().length;
        chunks.push(part.slice(start, end).trim());
        start = match.index + match[0].length;
    }
    chunks.push(part.slice(start).trim());
    RESPONSE_BOUNDARY.lastIndex = 0;

    const normalizedChunks = chunks.filter(Boolean);
    return normalizedChunks.length > 1
        ? normalizedChunks.flatMap(splitByMessageLength)
        : splitByMessageLength(part);
}

function splitByMessageLength(part) {
    if (part.length <= LADDER_MESSAGE_LIMIT) return [part];

    const chunks = [];
    let rest = part.trim();
    while (rest.length > LADDER_MESSAGE_LIMIT) {
        const window = rest.slice(0, LADDER_MESSAGE_LIMIT + 1);
        const splitAt = window.lastIndexOf(' ');
        if (splitAt <= 0) break;
        chunks.push(rest.slice(0, splitAt).trim());
        rest = rest.slice(splitAt + 1).trim();
    }
    if (rest) chunks.push(rest);
    return chunks.length > 1 ? chunks : [part];
}
