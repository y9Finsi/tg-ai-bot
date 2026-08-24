/**
 * Channel topic keys and distribution normalizers.
 */

export const CHANNEL_TOPIC_KEYS = ['thoughts', 'flirt', 'life', 'jokes', 'questions', 'meme', 'repost'];

export const TOPIC_LABELS = {
    thoughts: 'Мысли Леры',
    flirt: 'Флирт и Игривость',
    life: 'Личная жизнь',
    jokes: 'Юмор и Шутки',
    questions: 'Вопросы аудитории',
    meme: 'Мемы и картинки (#тгк)',
    repost: 'Репосты с мнением Леры'
};

export const TOPIC_PROMPT_RULES = {
    thoughts: 'внутреннее ощущение или наблюдение из обычной жизни',
    flirt: 'лёгкий публичный флирт без обращения к конкретному человеку',
    life: 'бытовая деталь, маленькая неловкость или настроение',
    jokes: 'короткая ироничная шутка или наблюдение',
    questions: 'естественный вопрос подписчикам от первого лица',
    meme: 'дерзкая или смешная подпись к мему / картинке',
    repost: 'личное мнение и реакция на пересланный пост'
};

export function normalizeTopicShares(topics, rawWeights = {}) {
    const active = [...new Set((topics || []).filter(topic => CHANNEL_TOPIC_KEYS.includes(topic)))];
    const safeTopics = active.length ? active : ['thoughts'];
    const shares = Object.fromEntries(CHANNEL_TOPIC_KEYS.map(topic => [topic, 0]));
    const entries = safeTopics.map(topic => ({ topic, weight: Math.max(1, Number(rawWeights[topic]) || 1) }));
    const total = entries.reduce((sum, item) => sum + item.weight, 0);

    if (total <= 0) {
        const base = Math.floor(100 / safeTopics.length);
        let remainder = 100 - base * safeTopics.length;
        for (const topic of safeTopics) {
            shares[topic] = base + (remainder > 0 ? 1 : 0);
            remainder -= 1;
        }
        return shares;
    }

    let assigned = 0;
    for (const entry of entries) {
        entry.exact = (entry.weight / total) * 100;
        entry.value = Math.floor(entry.exact);
        assigned += entry.value;
    }

    entries
        .sort((a, b) => (b.exact - b.value) - (a.exact - a.value))
        .slice(0, 100 - assigned)
        .forEach(entry => { entry.value += 1; });

    for (const entry of entries) shares[entry.topic] = entry.value;
    return shares;
}

export function redistributeTopicShare(topics, weights, changedTopic, requestedValue) {
    const active = (topics || []).filter(topic => CHANNEL_TOPIC_KEYS.includes(topic));
    if (!active.includes(changedTopic)) return normalizeTopicShares(active, weights);
    if (active.length === 1) return normalizeTopicShares(active, { [changedTopic]: 100 });
    const nextValue = Math.max(0, Math.min(100, Number(requestedValue) || 0));
    return normalizeTopicShares(active, { ...weights, [changedTopic]: nextValue });
}
