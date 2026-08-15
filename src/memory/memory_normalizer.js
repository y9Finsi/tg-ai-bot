import { createHash } from 'node:crypto';
import {
    MEMORY_SCHEMA_VERSION,
    MEMORY_TYPE,
    assertMemoryType
} from './memory_types.js';

export const MEMORY_NORMALIZATION_LIMITS = Object.freeze({
    maxDepth: 6,
    maxObjectKeys: 64,
    maxArrayItems: 64,
    maxStringLength: 4000,
    maxIdempotencyKeyLength: 255
});

const blockedObjectKeys = new Set(['__proto__', 'prototype', 'constructor']);
const envelopeKeys = new Set([
    'type',
    'memoryType',
    'memory_type',
    'schemaVersion',
    'schema_version',
    'confidence',
    'importance',
    'provenance',
    'source',
    'sourceEventId',
    'source_event_id',
    'supersedesId',
    'supersedes_id',
    'contentHash',
    'content_hash',
    'idempotencyKey',
    'idempotency_key',
    'validFrom',
    'valid_from',
    'validUntil',
    'valid_until',
    'observedAt',
    'observed_at',
    'isActive',
    'is_active',
    'userId',
    'user_id'
]);

const textFieldsByType = Object.freeze({
    [MEMORY_TYPE.PROFILE]: ['text', 'fact', 'value', 'summary'],
    [MEMORY_TYPE.PREFERENCE]: ['text', 'preference', 'value', 'summary'],
    [MEMORY_TYPE.EPISODE]: ['text', 'summary', 'event', 'description'],
    [MEMORY_TYPE.COMMITMENT]: ['text', 'summary', 'commitment', 'description'],
    [MEMORY_TYPE.OPEN_THREAD]: ['text', 'summary', 'thread', 'question'],
    [MEMORY_TYPE.TOOL_OBSERVATION]: ['text', 'summary', 'observation', 'result'],
    [MEMORY_TYPE.RELATIONSHIP_EVENT]: ['text', 'summary', 'event', 'description'],
    [MEMORY_TYPE.SIMULATION_OBSERVATION]: ['text', 'summary', 'observation', 'description'],
    [MEMORY_TYPE.DECISION_TRACE]: ['text', 'decision', 'summary', 'rationale']
});

function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function truncate(value, maxLength) {
    if (value.length <= maxLength) return value;
    if (maxLength <= 1) return value.slice(0, maxLength);
    return `${value.slice(0, maxLength - 1)}…`;
}

export function normalizeMemoryText(value, maxLength = MEMORY_NORMALIZATION_LIMITS.maxStringLength) {
    if (value === null || value === undefined) return '';

    return truncate(
        String(value)
            .replace(/\u0000/g, '')
            .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        maxLength
    );
}

function sanitizeValue(value, limits, state, depth) {
    if (depth > limits.maxDepth) return null;
    if (value === null) return null;

    if (typeof value === 'string') {
        return normalizeMemoryText(value, limits.maxStringLength);
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value !== 'object') {
        return undefined;
    }
    if (state.seen.has(value)) {
        return null;
    }

    state.seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value
                .slice(0, limits.maxArrayItems)
                .map(item => sanitizeValue(item, limits, state, depth + 1))
                .filter(item => item !== undefined);
        }

        if (!isPlainObject(value)) return null;

        const result = {};
        const keys = Object.keys(value)
            .filter(key => !blockedObjectKeys.has(key))
            .sort()
            .slice(0, limits.maxObjectKeys);

        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) continue;

            const sanitized = sanitizeValue(descriptor.value, limits, state, depth + 1);
            if (sanitized !== undefined) result[key] = sanitized;
        }
        return result;
    } finally {
        state.seen.delete(value);
    }
}

export function sanitizeMemoryValue(value, options = {}) {
    const limits = {
        maxDepth: positiveInteger(options.maxDepth, MEMORY_NORMALIZATION_LIMITS.maxDepth),
        maxObjectKeys: positiveInteger(options.maxObjectKeys, MEMORY_NORMALIZATION_LIMITS.maxObjectKeys),
        maxArrayItems: positiveInteger(options.maxArrayItems, MEMORY_NORMALIZATION_LIMITS.maxArrayItems),
        maxStringLength: positiveInteger(options.maxStringLength, MEMORY_NORMALIZATION_LIMITS.maxStringLength)
    };
    return sanitizeValue(value, limits, { seen: new WeakSet() }, 0);
}

export function stableStringify(value) {
    const sanitized = sanitizeMemoryValue(value);
    return JSON.stringify(sanitized === undefined ? null : sanitized);
}

function scalarText(value) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return normalizeMemoryText(value);
    }
    return '';
}

function hasMeaningfulValue(value) {
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'number' || typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.some(hasMeaningfulValue);
    if (isPlainObject(value)) return Object.values(value).some(hasMeaningfulValue);
    return false;
}

function derivePayloadText(type, payload) {
    const fields = [...textFieldsByType[type], 'content', 'fact'];
    for (const field of fields) {
        const text = scalarText(payload[field]);
        if (text) return text;
    }

    if (type === MEMORY_TYPE.PROFILE) {
        const attribute = scalarText(payload.attribute);
        const value = scalarText(payload.value);
        if (attribute && value) return `${attribute}: ${value}`;
    }

    return hasMeaningfulValue(payload)
        ? normalizeMemoryText(stableStringify(payload))
        : '';
}

export function normalizeMemoryPayload(typeValue, rawPayload, options = {}) {
    const type = assertMemoryType(typeValue);
    const source = isPlainObject(rawPayload)
        ? rawPayload
        : { text: rawPayload };
    const sanitized = sanitizeMemoryValue(source, options);

    if (!isPlainObject(sanitized)) {
        throw new TypeError('Memory payload must normalize to an object');
    }

    const text = derivePayloadText(type, sanitized);
    if (!text) {
        throw new TypeError(`Memory payload for ${type} must contain meaningful text`);
    }

    return sanitizeMemoryValue({ ...sanitized, text }, options);
}

function positiveInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) return fallback;
    return number;
}

function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
}

function normalizeImportance(value, fallback = 50) {
    return Math.round(clampNumber(value, 0, 100, fallback));
}

function normalizeTimestamp(value, fieldName) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new TypeError(`${fieldName} must be a valid timestamp`);
        return value.toISOString();
    }

    let candidate = value;
    if (typeof value === 'string') {
        candidate = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
            candidate = `${candidate}T00:00:00.000Z`;
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(candidate)) {
            candidate = `${candidate}Z`;
        }
    }

    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
        throw new TypeError(`${fieldName} must be a valid timestamp`);
    }
    return parsed.toISOString();
}

function normalizeIdentifier(value, fieldName, { allowZero = false } = {}) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'bigint') {
        if (value < 0n || (!allowZero && value === 0n)) {
            throw new TypeError(`${fieldName} must be a positive integer`);
        }
        return value.toString();
    }

    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
            throw new TypeError(`${fieldName} must be a positive integer`);
        }
        return value;
    }

    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const normalized = value.trim().replace(/^0+(?=\d)/, '');
        if (!allowZero && normalized === '0') {
            throw new TypeError(`${fieldName} must be a positive integer`);
        }
        return normalized;
    }

    throw new TypeError(`${fieldName} must be a positive integer`);
}

function read(input, camelKey, snakeKey) {
    if (Object.hasOwn(input, camelKey)) return input[camelKey];
    return input[snakeKey];
}

function extractPayload(input) {
    if (Object.hasOwn(input, 'payload')) return input.payload;

    const payload = {};
    for (const key of Object.keys(input)) {
        if (!envelopeKeys.has(key)) payload[key] = input[key];
    }

    if (Object.keys(payload).length > 0) return payload;
    if (Object.hasOwn(input, 'content')) return { text: input.content };
    if (Object.hasOwn(input, 'fact')) return { text: input.fact };
    return {};
}

function normalizeProvenance(input) {
    const raw = isPlainObject(input.provenance) ? input.provenance : {};
    const provenance = sanitizeMemoryValue(raw);
    const source = normalizeMemoryText(input.source, 128);

    if (source && !provenance.source) {
        provenance.source = source;
    }
    return sanitizeMemoryValue(provenance);
}

export function computeMemoryContentHash(typeValue, payload) {
    const type = assertMemoryType(typeValue);
    const normalizedPayload = normalizeMemoryPayload(type, payload);
    return createHash('sha256')
        .update(`${type}\n${stableStringify(normalizedPayload)}`, 'utf8')
        .digest('hex');
}

export function buildMemoryIdempotencyKey({
    type,
    contentHash,
    sourceEventId = null,
    idempotencyKey = null
}) {
    const explicit = normalizeMemoryText(
        idempotencyKey,
        MEMORY_NORMALIZATION_LIMITS.maxIdempotencyKeyLength
    );
    if (explicit) return explicit;

    const memoryType = assertMemoryType(type);
    const hash = String(contentHash || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
        throw new TypeError('contentHash must be a lowercase SHA-256 hex digest');
    }

    const eventPart = sourceEventId === null || sourceEventId === undefined
        ? ''
        : `:${normalizeIdentifier(sourceEventId, 'sourceEventId')}`;
    return `memory:${memoryType.toLowerCase()}${eventPart}:${hash}`;
}

export function normalizeMemoryFact(input, options = {}) {
    const candidate = typeof input === 'string'
        ? { type: options.defaultType || MEMORY_TYPE.PROFILE, text: input }
        : input;

    if (!isPlainObject(candidate)) {
        throw new TypeError('Memory fact must be an object or a string');
    }

    const type = assertMemoryType(
        candidate.type
        ?? candidate.memoryType
        ?? candidate.memory_type
        ?? options.defaultType
    );
    const payload = normalizeMemoryPayload(type, extractPayload(candidate), options);
    const validFrom = normalizeTimestamp(read(candidate, 'validFrom', 'valid_from'), 'validFrom');
    const validUntil = normalizeTimestamp(read(candidate, 'validUntil', 'valid_until'), 'validUntil');
    const observedAt = normalizeTimestamp(read(candidate, 'observedAt', 'observed_at'), 'observedAt');

    if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
        throw new RangeError('validUntil must be later than validFrom');
    }

    const sourceEventId = normalizeIdentifier(
        read(candidate, 'sourceEventId', 'source_event_id'),
        'sourceEventId'
    );
    const contentHash = computeMemoryContentHash(type, payload);
    const idempotencyKey = buildMemoryIdempotencyKey({
        type,
        contentHash,
        sourceEventId,
        idempotencyKey: read(candidate, 'idempotencyKey', 'idempotency_key')
    });

    return {
        userId: normalizeIdentifier(
            read(candidate, 'userId', 'user_id') ?? options.userId,
            'userId',
            { allowZero: true }
        ),
        memoryType: type,
        schemaVersion: MEMORY_SCHEMA_VERSION,
        payload,
        normalizedText: payload.text,
        validFrom,
        validUntil,
        observedAt,
        confidence: clampNumber(candidate.confidence, 0, 1, 0.5),
        importance: normalizeImportance(candidate.importance),
        provenance: normalizeProvenance(candidate),
        sourceEventId,
        supersedesId: normalizeIdentifier(
            read(candidate, 'supersedesId', 'supersedes_id'),
            'supersedesId'
        ),
        contentHash,
        idempotencyKey,
        isActive: read(candidate, 'isActive', 'is_active') !== false
    };
}

export function normalizeMemoryFacts(values, options = {}) {
    if (!Array.isArray(values)) {
        throw new TypeError('Memory facts must be an array');
    }
    return values.map(value => normalizeMemoryFact(value, options));
}
