import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MEMORY_SCHEMA_VERSION,
    MEMORY_TYPE,
    MEMORY_TYPES,
    assertMemoryType,
    isMemoryType,
    normalizeMemoryType
} from '../src/memory/memory_types.js';
import {
    computeMemoryContentHash,
    normalizeMemoryFact,
    normalizeMemoryPayload,
    sanitizeMemoryValue,
    stableStringify
} from '../src/memory/memory_normalizer.js';
import {
    formatMemoryContext,
    isMemoryValidAt,
    rerankMemoryFacts,
    scoreMemoryFact
} from '../src/memory/memory_policy.js';

test('canonical memory types are closed and LEGACY maps to PROFILE only at normalization', () => {
    assert.equal(MEMORY_SCHEMA_VERSION, 1);
    assert.deepEqual(MEMORY_TYPES, [
        'PROFILE',
        'PREFERENCE',
        'EPISODE',
        'COMMITMENT',
        'OPEN_THREAD',
        'TOOL_OBSERVATION',
        'RELATIONSHIP_EVENT',
        'SIMULATION_OBSERVATION',
        'DECISION_TRACE'
    ]);
    assert.equal(normalizeMemoryType('open-thread'), MEMORY_TYPE.OPEN_THREAD);
    assert.equal(normalizeMemoryType('legacy'), MEMORY_TYPE.PROFILE);
    assert.equal(isMemoryType('LEGACY'), false);
    assert.equal(assertMemoryType('preference'), MEMORY_TYPE.PREFERENCE);
    assert.throws(() => assertMemoryType('UNKNOWN'), /Unsupported memory type/);
});

test('typed payload normalization is safe, bounded and hash-stable', () => {
    const unsafePayload = JSON.parse(`{
        "value": "  любит flat white\\nбез сахара  ",
        "subject": "coffee",
        "__proto__": {"polluted": true},
        "details": {"finite": 2}
    }`);
    unsafePayload.details.notFinite = Infinity;
    unsafePayload.details.callback = () => 'nope';

    const normalized = normalizeMemoryFact({
        userId: '42',
        type: 'preference',
        payload: unsafePayload,
        validFrom: '2026-08-15T10:00:00+03:00',
        validUntil: '2026-09-15T10:00:00+03:00',
        confidence: 5,
        importance: -4,
        provenance: JSON.parse('{"source":"dialogue","constructor":{"bad":true}}'),
        sourceEventId: '99'
    });

    assert.equal(normalized.memoryType, MEMORY_TYPE.PREFERENCE);
    assert.equal(normalized.payload.text, 'любит flat white без сахара');
    assert.equal(normalized.payload.__proto__, Object.prototype);
    assert.equal(Object.hasOwn(normalized.payload, '__proto__'), false);
    assert.equal(Object.hasOwn(normalized.payload.details, 'callback'), false);
    assert.equal(normalized.payload.details.notFinite, null);
    assert.equal(normalized.confidence, 1);
    assert.equal(normalized.importance, 0);
    assert.equal(normalized.validFrom, '2026-08-15T07:00:00.000Z');
    assert.equal(normalized.validUntil, '2026-09-15T07:00:00.000Z');
    assert.equal(normalized.provenance.source, 'dialogue');
    assert.equal(Object.hasOwn(normalized.provenance, 'constructor'), false);
    assert.match(normalized.contentHash, /^[0-9a-f]{64}$/);
    assert.match(normalized.idempotencyKey, /^memory:preference:99:[0-9a-f]{64}$/);
    assert.equal({}.polluted, undefined);

    const reorderedHash = computeMemoryContentHash('PREFERENCE', {
        details: { finite: 2, notFinite: null },
        subject: 'coffee',
        value: 'любит flat white без сахара'
    });
    assert.equal(reorderedHash, normalized.contentHash);
    assert.equal(
        stableStringify({ z: 1, a: { y: 2, x: 3 } }),
        '{"a":{"x":3,"y":2},"z":1}'
    );
});

test('normalizer rejects empty facts and invalid temporal windows', () => {
    assert.throws(
        () => normalizeMemoryPayload('PROFILE', {}),
        /must contain meaningful text/
    );
    assert.throws(
        () => normalizeMemoryFact({
            type: 'EPISODE',
            payload: { summary: 'встретились' },
            validFrom: '2026-08-16T10:00:00Z',
            validUntil: '2026-08-16T09:00:00Z'
        }),
        /validUntil must be later/
    );

    const cyclic = { text: 'safe' };
    cyclic.self = cyclic;
    assert.deepEqual(sanitizeMemoryValue(cyclic), { self: null, text: 'safe' });
});

test('reranking is deterministic, validity-aware and does not mutate input', () => {
    const facts = [
        {
            id: 3,
            memory_type: 'PROFILE',
            normalized_text: 'Пользователь дизайнер',
            relevance_score: 0.45,
            confidence: 0.9,
            importance: 80,
            observed_at: '2026-08-14T12:00:00Z',
            is_active: true
        },
        {
            id: 1,
            memory_type: 'COMMITMENT',
            normalized_text: 'Позвонить вечером',
            relevance_score: 0.8,
            confidence: 0.9,
            importance: 70,
            observed_at: '2026-08-15T09:00:00Z',
            is_active: true
        },
        {
            id: 2,
            memory_type: 'OPEN_THREAD',
            normalized_text: 'Обсудить поездку',
            relevance_score: 1,
            confidence: 1,
            importance: 100,
            valid_until: '2026-08-15T08:00:00Z',
            is_active: true
        }
    ];
    const snapshot = structuredClone(facts);
    const options = { now: '2026-08-15T12:00:00Z' };

    const first = rerankMemoryFacts(facts, options);
    const second = rerankMemoryFacts(facts, options);

    assert.deepEqual(first, second);
    assert.deepEqual(facts, snapshot);
    assert.deepEqual(first.map(fact => fact.id), [1, 3]);
    assert.equal(isMemoryValidAt(facts[2], options.now), false);
    assert.deepEqual(scoreMemoryFact(facts[0], options), first[1].retrievalSignals);
});

test('context formatting follows rank order, deduplicates and stays deterministic', () => {
    const facts = [
        {
            id: 'preference',
            memoryType: 'PREFERENCE',
            normalizedText: 'Пользователь любит flat white',
            relevanceScore: 0.9,
            confidence: 0.9,
            importance: 80,
            observedAt: '2026-08-15T10:00:00Z'
        },
        {
            id: 'commitment',
            memoryType: 'COMMITMENT',
            payload: { text: 'Созвониться после учёбы' },
            relevanceScore: 0.8,
            confidence: 0.9,
            importance: 70,
            observedAt: '2026-08-15T10:00:00Z'
        },
        {
            id: 'duplicate',
            memoryType: 'PREFERENCE',
            payload: { text: 'Пользователь любит flat white' },
            relevanceScore: 0.7,
            confidence: 0.8,
            importance: 60,
            observedAt: '2026-08-15T10:00:00Z'
        }
    ];
    const options = { now: '2026-08-15T12:00:00Z' };
    const expected = [
        '## CANONICAL MEMORY',
        '- [PREFERENCE] Пользователь любит flat white',
        '- [COMMITMENT] Созвониться после учёбы'
    ].join('\n');

    assert.equal(formatMemoryContext(facts, options), expected);
    assert.equal(formatMemoryContext(facts, options), expected);
});
