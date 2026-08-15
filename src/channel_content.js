export const CHANNEL_CONTENT_FORMATS = [
    'short_thought',
    'photo_caption',
    'life_observation',
    'long_monologue',
    'question',
    'meme_caption',
    'repost_reaction'
];

const BASE_FORMAT_WEIGHTS = {
    short_thought: 30,
    photo_caption: 30,
    life_observation: 25,
    long_monologue: 15
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

export function selectChannelContentFormat({
    recentPosts = [],
    hasMedia = false,
    topic = '',
    preferredFormat = '',
    avoidFormat = '',
    randomValue = Math.random()
} = {}) {
    const topicFormat = TOPIC_FORMATS[topic];
    const requested = preferredFormat || topicFormat;
    const previousFormat = recentFormat(recentPosts.at(-1));
    if (CHANNEL_CONTENT_FORMATS.includes(requested)
        && requested !== avoidFormat
        && requested !== previousFormat) {
        if (requested !== 'photo_caption' || hasMedia) return requested;
    }

    const candidates = CHANNEL_CONTENT_FORMATS
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
