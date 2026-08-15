export const CHANNEL_CONTENT_FORMATS = [
    'short_thought',
    'photo_caption',
    'life_observation',
    'long_monologue',
    'question',
    'meme_caption',
    'repost_reaction'
];

export const CHANNEL_EDITORIAL_MODES = [
    'reference_short',
    'legacy_mix'
];

export const DEFAULT_REFERENCE_FORMAT_SEQUENCE = [
    'photo_caption',
    'short_thought',
    'life_observation'
];

const BASE_FORMAT_WEIGHTS = {
    short_thought: 30,
    photo_caption: 30,
    life_observation: 25,
    long_monologue: 15
};

const REFERENCE_FORMATS = new Set(DEFAULT_REFERENCE_FORMAT_SEQUENCE);

const FORMAT_LIMITS = {
    short_thought: { maxChars: 180, maxLines: 2, maxParagraphs: 1 },
    photo_caption: { maxChars: 420, maxLines: 4, maxParagraphs: 2 },
    life_observation: { maxChars: 560, maxLines: 8, maxParagraphs: 2 },
    long_monologue: { maxChars: 1400, maxLines: 30, maxParagraphs: 6 },
    question: { maxChars: 180, maxLines: 2, maxParagraphs: 1 },
    meme_caption: { maxChars: 260, maxLines: 4, maxParagraphs: 2 },
    repost_reaction: { maxChars: 360, maxLines: 6, maxParagraphs: 2 }
};

const TOPIC_FORMATS = {
    questions: 'question',
    meme: 'meme_caption',
    repost: 'repost_reaction'
};

function recentFormat(post) {
    const value = post?.provenance?.content_format || post?.content_format;
    return CHANNEL_CONTENT_FORMATS.includes(value) ? value : null;
}

export function describeChannelContentFormat(contentFormat = 'life_observation') {
    const descriptions = {
        short_thought: 'Одна фраза или 1–2 короткие строки: вопрос, внезапное желание или честное признание без обязательного объяснения.',
        photo_caption: 'Короткая подпись к фото, связанная с конкретной визуальной деталью и текущим состоянием. Не превращай её в красивую историю.',
        life_observation: 'Одно бытовое наблюдение или маленькая сцена в 1–2 коротких абзацах, без обязательного вывода.',
        long_monologue: 'Свободный поток из 3–6 естественных абзацев: несколько интересов или мыслей, переходы на ходу и лёгкая самоирония.',
        question: 'Короткий жизненный вопрос подписчикам. Вопрос не должен быть формальным CTA или повторяться в каждом посте.',
        meme_caption: 'Живая дерзкая подпись к мему или картинке, которая опирается на изображение и не объясняет шутку.',
        repost_reaction: 'Короткая личная реакция на пересланный материал: что зацепило, удивило или показалось смешным.'
    };
    return descriptions[contentFormat] || descriptions.life_observation;
}

export function normalizeChannelEditorialMode(mode = 'reference_short') {
    const normalized = String(mode || '').trim().toLowerCase();
    return CHANNEL_EDITORIAL_MODES.includes(normalized) ? normalized : 'reference_short';
}

export function normalizeChannelFormatSequence(sequence = DEFAULT_REFERENCE_FORMAT_SEQUENCE) {
    const normalized = Array.isArray(sequence)
        ? sequence
            .map(format => String(format || '').trim())
            .filter(format => REFERENCE_FORMATS.has(format))
        : [];
    return normalized.length ? [...new Set(normalized)] : [...DEFAULT_REFERENCE_FORMAT_SEQUENCE];
}

export function getChannelFormatLimits(contentFormat = 'life_observation') {
    return FORMAT_LIMITS[contentFormat] || FORMAT_LIMITS.life_observation;
}

export function validateChannelText(text, contentFormat = 'life_observation', editorialMode = 'reference_short') {
    const value = String(text || '').replace(/\r/g, '').trim();
    const limits = getChannelFormatLimits(contentFormat);
    const lines = value ? value.split('\n').filter(line => line.trim()) : [];
    const paragraphs = value ? value.split(/\n\s*\n/).filter(part => part.trim()) : [];
    const mode = normalizeChannelEditorialMode(editorialMode);
    if (!value) return { ok: false, code: 'CHANNEL_EMPTY', reason: 'Пост пустой.' };
    if (mode === 'reference_short' && !REFERENCE_FORMATS.has(contentFormat)) {
        return { ok: false, code: 'CHANNEL_FORMAT_MISMATCH', reason: 'Формат не входит в эталонный короткий режим.' };
    }
    if (value.length > limits.maxChars) {
        return { ok: false, code: 'CHANNEL_TOO_LONG', reason: `Пост длиннее лимита ${limits.maxChars} символов.` };
    }
    if (lines.length > limits.maxLines) {
        return { ok: false, code: 'CHANNEL_FORMAT_MISMATCH', reason: 'Слишком много строк для выбранного формата.' };
    }
    if (paragraphs.length > limits.maxParagraphs) {
        return { ok: false, code: 'CHANNEL_FORMAT_MISMATCH', reason: 'Слишком много абзацев для выбранного формата.' };
    }
    return { ok: true, code: null, reason: '' };
}

export function selectChannelContentFormat({
    recentPosts = [],
    hasMedia = false,
    topic = '',
    preferredFormat = '',
    avoidFormat = '',
    editorialMode = 'reference_short',
    formatSequence = DEFAULT_REFERENCE_FORMAT_SEQUENCE,
    randomValue = Math.random()
} = {}) {
    const mode = normalizeChannelEditorialMode(editorialMode);
    const sequence = normalizeChannelFormatSequence(formatSequence);
    const previousFormat = recentFormat(recentPosts.at(-1));
    const requested = preferredFormat || (mode === 'legacy_mix' ? TOPIC_FORMATS[topic] : '');
    const isAllowed = format => mode === 'legacy_mix' || REFERENCE_FORMATS.has(format);
    if (CHANNEL_CONTENT_FORMATS.includes(requested)
        && isAllowed(requested)
        && requested !== avoidFormat
        && requested !== previousFormat
        && (requested !== 'photo_caption' || hasMedia)) {
        return requested;
    }

    if (mode === 'reference_short') {
        const previousIndex = sequence.indexOf(previousFormat);
        const ordered = previousIndex >= 0
            ? sequence.slice(previousIndex + 1).concat(sequence.slice(0, previousIndex + 1))
            : sequence;
        const next = ordered.find(format =>
            format !== avoidFormat
            && format !== previousFormat
            && (format !== 'photo_caption' || hasMedia)
        );
        if (next) return next;
        return hasMedia && avoidFormat !== 'photo_caption' ? 'photo_caption' : 'short_thought';
    }

    const candidates = CHANNEL_CONTENT_FORMATS
        .filter(format => isAllowed(format))
        .filter(format => format !== avoidFormat)
        .filter(format => format !== previousFormat)
        .filter(format => hasMedia || format !== 'photo_caption');

    if (!candidates.length) {
        return hasMedia && avoidFormat !== 'photo_caption' ? 'photo_caption' : 'life_observation';
    }

    const weights = candidates.map(format => ({
        format,
        weight: BASE_FORMAT_WEIGHTS[format] || (format === 'photo_caption' && hasMedia ? 30 : 10)
    }));
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.max(0, Math.min(0.999999, Number(randomValue) || 0)) * total;
    for (const item of weights) {
        cursor -= item.weight;
        if (cursor <= 0) return item.format;
    }
    return weights.at(-1).format;
}
