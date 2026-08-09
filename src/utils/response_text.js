const DASH_CHARACTERS = /[-\u058A\u05BE\u1400\u1806\u2010-\u2015\u2E17\u2E1A\u2E3A-\u2E3B\u2E40\u301C\u3030\u30A0\uFE31-\uFE32\uFE58\uFE63\uFF0D]/gu;
const DECORATIVE_QUOTES = /[«»“”„‟]/gu;
const SENTENCE_BOUNDARY = /(?<!\.)\.(?=\s+)|[!?](?=\s+)/gu;
const LONG_MESSAGE_LIMIT = 220;

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
    return text
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

export function splitResponseMessages(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];

    let parts = raw.includes('|||')
        ? raw.split(/\s*\|\|\|\s*/)
        : raw.split(/\n+/);
    parts = parts
        .flatMap(part => splitLongResponsePart(part.trim()))
        .map(part => part.trim().replace(/(?<!\.)\.$/u, ''))
        .filter(Boolean);

    if (parts.length > 4) {
        return [parts.slice(0, 3).join(' '), parts.slice(3).join(' ')].filter(Boolean);
    }
    return parts;
}

function splitLongResponsePart(part) {
    if (part.length <= LONG_MESSAGE_LIMIT || !SENTENCE_BOUNDARY.test(part)) {
        SENTENCE_BOUNDARY.lastIndex = 0;
        return [part];
    }

    SENTENCE_BOUNDARY.lastIndex = 0;
    const chunks = [];
    let start = 0;
    let match;

    while ((match = SENTENCE_BOUNDARY.exec(part)) !== null) {
        const end = match.index + match[0].length - match[0].trimStart().length;
        chunks.push(part.slice(start, end).trim());
        start = match.index + match[0].length;
    }
    chunks.push(part.slice(start).trim());
    SENTENCE_BOUNDARY.lastIndex = 0;

    return chunks.filter(Boolean).length > 1 ? chunks.filter(Boolean) : [part];
}
