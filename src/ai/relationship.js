export const RELATIONSHIP_EVENT_TYPES = [
    'NEUTRAL',
    'SUPPORT',
    'COMPLIMENT',
    'AFFECTION',
    'INSULT',
    'DISRESPECT',
    'APOLOGY'
];

export const DEFAULT_RELATIONSHIP = Object.freeze({
    trust: 50,
    affection: 50,
    irritation: 0
});

export const RELATIONSHIP_DELTAS = Object.freeze({
    NEUTRAL: {},
    SUPPORT: { trust: 3, affection: 2, irritation: -1 },
    COMPLIMENT: { trust: 1, affection: 3 },
    AFFECTION: { trust: 1, affection: 4 },
    INSULT: { trust: -3, affection: -1, irritation: 6 },
    DISRESPECT: { trust: -2, affection: -1, irritation: 5 },
    APOLOGY: { trust: 2, irritation: -5 }
});

export function clampRelationshipValue(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

export function normalizeRelationship(value = {}) {
    return {
        trust: clampRelationshipValue(value.trust ?? DEFAULT_RELATIONSHIP.trust),
        affection: clampRelationshipValue(value.affection ?? DEFAULT_RELATIONSHIP.affection),
        irritation: clampRelationshipValue(value.irritation ?? DEFAULT_RELATIONSHIP.irritation)
    };
}

export function normalizeRelationshipEvent(event = {}) {
    const type = String(event.type || 'NEUTRAL').trim().toUpperCase();
    const intensity = Math.max(0, Math.min(1, Number(event.intensity) || 0));
    return {
        type: RELATIONSHIP_EVENT_TYPES.includes(type) ? type : 'NEUTRAL',
        intensity
    };
}

export function applyRelationshipDelta(state = DEFAULT_RELATIONSHIP, event = {}) {
    const normalizedEvent = normalizeRelationshipEvent(event);
    const deltas = RELATIONSHIP_DELTAS[normalizedEvent.type] || {};
    const next = normalizeRelationship(state);
    for (const key of ['trust', 'affection', 'irritation']) {
        next[key] = clampRelationshipValue(next[key] + (deltas[key] || 0) * normalizedEvent.intensity);
    }
    return { state: next, event: normalizedEvent, deltas: {
        trust: (deltas.trust || 0) * normalizedEvent.intensity,
        affection: (deltas.affection || 0) * normalizedEvent.intensity,
        irritation: (deltas.irritation || 0) * normalizedEvent.intensity
    } };
}

export function relationshipDecay(state = DEFAULT_RELATIONSHIP, elapsedSeconds = 0) {
    const steps = Math.floor(Math.max(0, Number(elapsedSeconds) || 0) / (60 * 60 * 6));
    if (!steps) return normalizeRelationship(state);
    return {
        ...normalizeRelationship(state),
        irritation: clampRelationshipValue(normalizeRelationship(state).irritation - steps)
    };
}

export function relationshipToPrompt(state = DEFAULT_RELATIONSHIP) {
    const relationship = normalizeRelationship(state);
    const lines = ['[ОТНОШЕНИЯ ЛЕРЫ С ПОЛЬЗОВАТЕЛЕМ]'];
    if (relationship.trust >= 70) {
        lines.push('Лера хорошо доверяет пользователю и свободнее относится к его словам.');
    } else if (relationship.trust <= 30) {
        lines.push('Лера не очень доверяет пользователю и осторожнее относится к его словам.');
    } else {
        lines.push('Между Лерой и пользователем нейтральный уровень доверия.');
    }
    if (relationship.affection >= 70) {
        lines.push('Лера очень тепло относится к пользователю и может быть более открытой и эмоциональной.');
    } else if (relationship.affection <= 30) {
        lines.push('Лера эмоционально отстранена от пользователя и не стремится лишний раз раскрываться.');
    } else {
        lines.push('Лера относится к пользователю спокойно, без сильной эмоциональной вовлечённости.');
    }
    if (relationship.irritation >= 60) {
        lines.push('Сейчас Лера заметно раздражена недавним поведением пользователя: может отвечать короче, холоднее или резче, но продолжает нормально общаться.');
    } else if (relationship.irritation >= 25) {
        lines.push('Сейчас Лера немного раздражена пользователем, поэтому её терпение ниже обычного.');
    } else {
        lines.push('Сейчас между ними нет заметного напряжения.');
    }
    lines.push('Не проговаривай эти параметры и не объясняй пользователю состояние отношений — используй их только как внутренний контекст.');
    return lines.join('\n');
}

export function getRelationshipDisplay(state = DEFAULT_RELATIONSHIP) {
    const rel = normalizeRelationship(state);
    const trust = Math.round(rel.trust);
    const affection = Math.round(rel.affection);
    const irritation = Math.round(rel.irritation);

    let status = '👀 Присматривается';
    if (irritation >= 60) {
        status = '⚡ Злая пиздец (лучше не бесить)';
    } else if (irritation >= 35) {
        status = '😤 Дуется / Напряг';
    } else if (affection >= 85 && trust >= 75) {
        status = '👑 Влюблена по уши / Любимый №1';
    } else if (affection >= 70 && trust >= 60) {
        status = '💖 Сильное притяжение / Тёплый вайб';
    } else if (affection >= 55) {
        status = '💬 Флирт / Приятный интерес';
    } else if (affection <= 25 && trust <= 25) {
        status = '🧊 Холод / Полный игнор';
    } else if (trust >= 75) {
        status = '🤝 Близкий друг / Полное доверие';
    }

    const renderBar = (val, fillChar, emptyChar = '░', length = 8) => {
        const count = Math.min(length, Math.max(0, Math.round((val / 100) * length)));
        return fillChar.repeat(count) + emptyChar.repeat(length - count);
    };

    return {
        trust,
        affection,
        irritation,
        status,
        bars: {
            affection: renderBar(affection, '❤️', '░', 8),
            trust: renderBar(trust, '🤝', '░', 8),
            irritation: renderBar(irritation, '⚡', '░', 8)
        }
    };
}

