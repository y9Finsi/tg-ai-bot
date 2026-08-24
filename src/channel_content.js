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
    short_thought: { maxChars: 160, maxLines: 3, maxParagraphs: 1 },
    photo_caption: { maxChars: 120, maxLines: 2, maxParagraphs: 1 },
    life_observation: { maxChars: 240, maxLines: 4, maxParagraphs: 2 },
    long_monologue: { maxChars: 500, maxLines: 8, maxParagraphs: 3 },
    question: { maxChars: 160, maxLines: 2, maxParagraphs: 1 },
    meme_caption: { maxChars: 140, maxLines: 2, maxParagraphs: 1 },
    repost_reaction: { maxChars: 160, maxLines: 3, maxParagraphs: 1 }
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
        short_thought: 'Одна мысль, открытие или текущее состояние в 1–2 строки. Без искусственных шуток и без панчлайнов.',
        photo_caption: 'Короткая подпись к фото в 1 строку (например: «привет», «сегодня такой день», «настроение такое», «красиво»).',
        life_observation: 'Короткий факт или бытовая зарисовка на 1–3 строки о Питере, погоде, учёбе или усталости. Без вымученного юмора и без морали.',
        long_monologue: 'Короткая зарисовка на 2–3 абзаца о жизненном моменте.',
        question: 'Короткий вопрос подписчикам в 1 строку.',
        meme_caption: 'Короткая мысль к картинке в 1 строку.',
        repost_reaction: 'Короткая реакция в 1 строку.'
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

export function adaptChannelText(text, contentFormat = 'life_observation', editorialMode = 'reference_short') {
    if (!text || typeof text !== 'string') return '';
    let raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!raw) return '';

    const limits = getChannelFormatLimits(contentFormat);
    const singleParagraphFormats = ['short_thought', 'photo_caption', 'question', 'meme_caption', 'repost_reaction'];

    let cleaned = '';
    if (singleParagraphFormats.includes(contentFormat) || limits.maxParagraphs === 1) {
        if (contentFormat === 'photo_caption') {
            cleaned = raw.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim();
        } else {
            const lines = raw.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
            cleaned = lines.slice(0, limits.maxLines).join('\n').trim();
        }
    } else {
        const rawParagraphs = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        const normalizedParagraphs = rawParagraphs
            .slice(0, limits.maxParagraphs)
            .map(p => p.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n'))
            .filter(Boolean);
        cleaned = normalizedParagraphs.join('\n\n').trim();
    }

    if (cleaned.length <= limits.maxChars) {
        return cleaned;
    }

    const maxChars = limits.maxChars;
    const maxAllowed = Math.floor(maxChars * 1.20); // 15-20% overflow tolerance

    if (cleaned.length <= maxAllowed) {
        const targetSlice = cleaned.slice(0, maxChars + 1);

        const sentenceBoundaryRegex = /([.!?…])(?:\s+|$)/g;
        let lastSentenceEnd = -1;
        let match;
        while ((match = sentenceBoundaryRegex.exec(targetSlice)) !== null) {
            const endIdx = match.index + match[1].length;
            if (endIdx <= maxChars && endIdx >= maxChars * 0.35) {
                lastSentenceEnd = endIdx;
            }
        }

        if (lastSentenceEnd > 0) {
            const truncated = cleaned.slice(0, lastSentenceEnd).trim();
            if (truncated.length > 0) {
                return truncated;
            }
        }

        const clauseBoundaryRegex = /([;,—–])\s+/g;
        let lastClauseEnd = -1;
        while ((match = clauseBoundaryRegex.exec(targetSlice)) !== null) {
            const endIdx = match.index;
            if (endIdx <= maxChars && endIdx >= maxChars * 0.35) {
                lastClauseEnd = endIdx;
            }
        }

        if (lastClauseEnd > 0) {
            const truncated = cleaned.slice(0, lastClauseEnd).replace(/[,:;\-–—\s]+$/, '').trim();
            if (truncated.length > 0) {
                return truncated;
            }
        }

        const lastSpace = targetSlice.lastIndexOf(' ');
        if (lastSpace >= maxChars * 0.4) {
            const truncated = targetSlice.slice(0, lastSpace).replace(/[,:;\-–—\s]+$/, '').trim();
            if (truncated.length > 0) {
                return truncated;
            }
        }
    }

    return cleaned;
}

export function validateChannelText(text, contentFormat = 'life_observation', editorialMode = 'reference_short', { adapt = true } = {}) {
    let value = String(text || '').replace(/\r/g, '').trim();
    const mode = normalizeChannelEditorialMode(editorialMode);
    if (!value) return { ok: false, code: 'CHANNEL_EMPTY', reason: 'Пост пустой.', text: '' };
    if (mode === 'reference_short' && !REFERENCE_FORMATS.has(contentFormat)) {
        return { ok: false, code: 'CHANNEL_FORMAT_MISMATCH', reason: 'Формат не входит в эталонный короткий режим.', text: value };
    }
    if (adapt) {
        value = adaptChannelText(value, contentFormat, editorialMode);
    }
    const limits = getChannelFormatLimits(contentFormat);
    const lines = value ? value.split('\n').filter(line => line.trim()) : [];
    const paragraphs = value ? value.split(/\n\s*\n/).filter(part => part.trim()) : [];
    if (value.length > limits.maxChars) {
        return { ok: false, code: 'CHANNEL_TOO_LONG', reason: `Пост длиннее лимита ${limits.maxChars} символов.`, text: value };
    }
    if (lines.length > limits.maxLines) {
        return { ok: false, code: 'CHANNEL_FORMAT_MISMATCH', reason: 'Слишком много строк для выбранного формата.', text: value };
    }
    if (paragraphs.length > limits.maxParagraphs) {
        return { ok: false, code: 'CHANNEL_FORMAT_MISMATCH', reason: 'Слишком много абзацев для выбранного формата.', text: value };
    }
    return { ok: true, code: null, reason: '', text: value };
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
    const isAllowed = format => mode === 'legacy_mix' || REFERENCE_FORMATS.has(format);

    if (preferredFormat && CHANNEL_CONTENT_FORMATS.includes(preferredFormat) && isAllowed(preferredFormat)) {
        if (preferredFormat !== previousFormat && preferredFormat !== avoidFormat) {
            return preferredFormat;
        }
    }

    const topicFormat = TOPIC_FORMATS[topic];
    if (topicFormat && isAllowed(topicFormat) && topicFormat !== avoidFormat && topicFormat !== previousFormat) {
        if (topicFormat === 'meme_caption') {
            if (hasMedia) return topicFormat;
        } else if (topicFormat === 'photo_caption') {
            if (hasMedia) return topicFormat;
        } else {
            return topicFormat;
        }
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
