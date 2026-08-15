import { MEMORY_TYPE, normalizeMemoryType } from './memory_types.js';
import { normalizeMemoryText } from './memory_normalizer.js';

const scoreWeights = Object.freeze({
    relevance: 0.45,
    importance: 0.20,
    confidence: 0.15,
    recency: 0.10,
    type: 0.10
});

export const MEMORY_TYPE_WEIGHTS = Object.freeze({
    [MEMORY_TYPE.PROFILE]: 0.82,
    [MEMORY_TYPE.PREFERENCE]: 0.86,
    [MEMORY_TYPE.EPISODE]: 0.72,
    [MEMORY_TYPE.COMMITMENT]: 1.00,
    [MEMORY_TYPE.OPEN_THREAD]: 0.98,
    [MEMORY_TYPE.TOOL_OBSERVATION]: 0.62,
    [MEMORY_TYPE.RELATIONSHIP_EVENT]: 0.90,
    [MEMORY_TYPE.SIMULATION_OBSERVATION]: 0.68,
    [MEMORY_TYPE.DECISION_TRACE]: 0.76
});

export const DEFAULT_MEMORY_POLICY = Object.freeze({
    scoreWeights,
    typeWeights: MEMORY_TYPE_WEIGHTS,
    recencyHalfLifeDays: 30,
    maxItems: 12,
    maxContextChars: 6000,
    minimumScore: 0
});

function clamp(value, minimum = 0, maximum = 1, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
}

function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function factValue(fact, camelKey, snakeKey) {
    if (Object.hasOwn(fact, camelKey)) return fact[camelKey];
    return fact[snakeKey];
}

function factType(fact) {
    return normalizeMemoryType(fact.memoryType ?? fact.memory_type ?? fact.type) || MEMORY_TYPE.PROFILE;
}

function timestampMs(value) {
    if (!value) return null;
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function retrievalTimestamp(fact) {
    return timestampMs(
        factValue(fact, 'observedAt', 'observed_at')
        ?? factValue(fact, 'validFrom', 'valid_from')
        ?? factValue(fact, 'createdAt', 'created_at')
    );
}

function resolvePolicy(overrides = {}) {
    const mergedWeights = {
        ...DEFAULT_MEMORY_POLICY.scoreWeights,
        ...(overrides.scoreWeights || {})
    };
    const totalWeight = Object.values(mergedWeights)
        .reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
    const normalizedWeights = {};

    for (const [key, value] of Object.entries(mergedWeights)) {
        normalizedWeights[key] = totalWeight > 0
            ? Math.max(0, Number(value) || 0) / totalWeight
            : DEFAULT_MEMORY_POLICY.scoreWeights[key];
    }

    return {
        scoreWeights: normalizedWeights,
        typeWeights: {
            ...DEFAULT_MEMORY_POLICY.typeWeights,
            ...(overrides.typeWeights || {})
        },
        recencyHalfLifeDays: positiveNumber(
            overrides.recencyHalfLifeDays,
            DEFAULT_MEMORY_POLICY.recencyHalfLifeDays
        ),
        maxItems: nonNegativeInteger(overrides.maxItems, DEFAULT_MEMORY_POLICY.maxItems),
        maxContextChars: nonNegativeInteger(
            overrides.maxContextChars,
            DEFAULT_MEMORY_POLICY.maxContextChars
        ),
        minimumScore: clamp(overrides.minimumScore, 0, 1, DEFAULT_MEMORY_POLICY.minimumScore)
    };
}

export function isMemoryValidAt(fact, at = null) {
    if (!fact || typeof fact !== 'object') return false;
    if (factValue(fact, 'isActive', 'is_active') === false) return false;
    if (at === null || at === undefined) return true;

    const atMs = timestampMs(at);
    if (atMs === null) throw new TypeError('at must be a valid timestamp');

    const validFrom = timestampMs(factValue(fact, 'validFrom', 'valid_from'));
    const validUntil = timestampMs(factValue(fact, 'validUntil', 'valid_until'));
    if (validFrom !== null && validFrom > atMs) return false;
    if (validUntil !== null && validUntil <= atMs) return false;
    return true;
}

function recencyScore(fact, now, halfLifeDays) {
    const supplied = factValue(fact, 'recencyScore', 'recency_score');
    if (supplied !== undefined && supplied !== null) return clamp(supplied, 0, 1, 0.5);
    if (now === null || now === undefined) return 0.5;

    const nowMs = timestampMs(now);
    if (nowMs === null) throw new TypeError('now must be a valid timestamp');

    const occurredAt = retrievalTimestamp(fact);
    if (occurredAt === null) return 0.5;

    const ageDays = Math.max(0, nowMs - occurredAt) / 86_400_000;
    return Math.pow(0.5, ageDays / halfLifeDays);
}

function roundScore(value) {
    return Number(value.toFixed(6));
}

export function scoreMemoryFact(fact, options = {}) {
    if (!fact || typeof fact !== 'object') {
        throw new TypeError('Memory fact must be an object');
    }

    const policy = resolvePolicy(options.policy);
    const type = factType(fact);
    const relevance = clamp(
        fact.relevanceScore ?? fact.relevance_score ?? fact.similarity ?? fact.score,
        0,
        1,
        0
    );
    const importance = clamp(Number(fact.importance) / 100, 0, 1, 0.5);
    const confidence = clamp(fact.confidence, 0, 1, 0.5);
    const recency = clamp(
        recencyScore(fact, options.now, policy.recencyHalfLifeDays),
        0,
        1,
        0.5
    );
    const typeScore = clamp(policy.typeWeights[type], 0, 1, 0.5);
    const finalScore = (
        relevance * policy.scoreWeights.relevance
        + importance * policy.scoreWeights.importance
        + confidence * policy.scoreWeights.confidence
        + recency * policy.scoreWeights.recency
        + typeScore * policy.scoreWeights.type
    );

    return Object.freeze({
        relevance: roundScore(relevance),
        importance: roundScore(importance),
        confidence: roundScore(confidence),
        recency: roundScore(recency),
        type: roundScore(typeScore),
        final: roundScore(clamp(finalScore))
    });
}

function compareIds(left, right) {
    const leftId = String(left.id ?? left.contentHash ?? left.content_hash ?? '');
    const rightId = String(right.id ?? right.contentHash ?? right.content_hash ?? '');
    return leftId.localeCompare(rightId);
}

export function rerankMemoryFacts(facts, options = {}) {
    if (!Array.isArray(facts)) {
        throw new TypeError('Memory facts must be an array');
    }

    const policy = resolvePolicy(options.policy);
    const limit = options.limit === undefined
        ? facts.length
        : nonNegativeInteger(options.limit, facts.length);
    const at = options.now ?? options.at ?? null;

    return facts
        .map((fact, inputIndex) => ({
            fact,
            inputIndex,
            signals: scoreMemoryFact(fact, { ...options, policy })
        }))
        .filter(item => isMemoryValidAt(item.fact, at))
        .filter(item => item.signals.final >= policy.minimumScore)
        .sort((left, right) => (
            right.signals.final - left.signals.final
            || right.signals.importance - left.signals.importance
            || right.signals.confidence - left.signals.confidence
            || right.signals.recency - left.signals.recency
            || compareIds(left.fact, right.fact)
            || left.inputIndex - right.inputIndex
        ))
        .slice(0, limit)
        .map(({ fact, signals }) => ({
            ...fact,
            retrievalScore: signals.final,
            retrievalSignals: signals
        }));
}

function contextText(fact) {
    const payload = fact.payload && typeof fact.payload === 'object' ? fact.payload : {};
    const candidates = [
        factValue(fact, 'normalizedText', 'normalized_text'),
        payload.text,
        payload.summary,
        payload.decision,
        fact.fact
    ];

    for (const candidate of candidates) {
        const normalized = normalizeMemoryText(candidate);
        if (normalized) return normalized;
    }
    return '';
}

function fitContextLine(prefix, text, remaining) {
    const fullLine = `${prefix}${text}`;
    if (fullLine.length <= remaining) return fullLine;
    if (remaining <= prefix.length + 1) return null;
    return `${prefix}${text.slice(0, remaining - prefix.length - 1).trimEnd()}…`;
}

export function formatMemoryContext(facts, options = {}) {
    const policy = resolvePolicy(options.policy);
    const header = normalizeMemoryText(options.header || '## CANONICAL MEMORY', 200);
    const ranked = rerankMemoryFacts(facts, {
        ...options,
        limit: options.limit ?? policy.maxItems,
        policy
    });
    const lines = [];
    const seen = new Set();
    let currentLength = header.length;

    for (const fact of ranked) {
        const text = contextText(fact);
        if (!text) continue;

        const type = factType(fact);
        const dedupeKey = `${type}\u0000${text.toLocaleLowerCase('en-US')}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const scoreSuffix = options.includeScores
            ? ` (${Number(fact.retrievalScore || 0).toFixed(3)})`
            : '';
        const prefix = `- [${type}] `;
        const separatorLength = 1;
        const remaining = policy.maxContextChars - currentLength - separatorLength;
        const line = fitContextLine(prefix, `${text}${scoreSuffix}`, remaining);
        if (!line) break;

        lines.push(line);
        currentLength += separatorLength + line.length;
        if (currentLength >= policy.maxContextChars) break;
    }

    return lines.length > 0 ? `${header}\n${lines.join('\n')}` : '';
}

export const rerankMemories = rerankMemoryFacts;
export const formatMemoriesForContext = formatMemoryContext;
