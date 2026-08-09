export const CHANNEL_TOPICS = ['thoughts', 'flirt', 'life', 'jokes', 'questions'];

export function normalizeTopicDistribution(topics, rawWeights = {}) {
    const available = Array.isArray(topics)
        ? [...new Set(topics.filter(topic => CHANNEL_TOPICS.includes(topic)))]
        : [];
    const safeTopics = available.length ? available : ['thoughts'];
    const weights = Object.fromEntries(CHANNEL_TOPICS.map(topic => [topic, 0]));
    const entries = safeTopics.map(topic => ({
        topic,
        weight: Math.max(0, Number(rawWeights?.[topic]) || 0)
    }));
    const total = entries.reduce((sum, item) => sum + item.weight, 0);

    if (total <= 0) {
        const base = Math.floor(100 / safeTopics.length);
        let remainder = 100 - base * safeTopics.length;
        for (const topic of safeTopics) {
            weights[topic] = base + (remainder > 0 ? 1 : 0);
            remainder -= 1;
        }
        return weights;
    }

    let assigned = 0;
    for (const item of entries) {
        item.exact = (item.weight / total) * 100;
        item.value = Math.floor(item.exact);
        assigned += item.value;
    }
    entries
        .sort((a, b) => (b.exact - b.value) - (a.exact - a.value))
        .slice(0, 100 - assigned)
        .forEach(item => { item.value += 1; });
    for (const item of entries) weights[item.topic] = item.value;
    return weights;
}

export function selectWeightedTopic(settings, randomValue = Math.random()) {
    const available = Array.isArray(settings.topics) && settings.topics.length > 0
        ? settings.topics.filter(topic => CHANNEL_TOPICS.includes(topic))
        : CHANNEL_TOPICS;
    const weights = normalizeTopicDistribution(available, settings.topic_weights);
    const weighted = available.map(topic => ({ topic, weight: weights[topic] }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) return available[Math.floor(randomValue * available.length)] || 'thoughts';
    let cursor = randomValue * total;
    for (const item of weighted) {
        cursor -= item.weight;
        if (cursor <= 0) return item.topic;
    }
    return weighted.at(-1)?.topic || 'thoughts';
}
