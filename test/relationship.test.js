import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyRelationshipDelta,
    relationshipDecay,
    relationshipToPrompt,
    normalizeRelationshipEvent
} from '../src/ai/relationship.js';

test('relationship events use deterministic small deltas and clamp values', () => {
    const result = applyRelationshipDelta({ trust: 1, affection: 1, irritation: 98 }, { type: 'INSULT', intensity: 1 });
    assert.deepEqual(result.state, { trust: 0, affection: 0, irritation: 100 });
    assert.deepEqual(result.deltas, { trust: -3, affection: -1, irritation: 6 });
});

test('relationship decay only reduces irritation over six-hour steps', () => {
    assert.deepEqual(relationshipDecay({ trust: 80, affection: 70, irritation: 5 }, 6 * 60 * 60), {
        trust: 80, affection: 70, irritation: 4
    });
});

test('unknown or malformed relationship events become neutral', () => {
    assert.deepEqual(normalizeRelationshipEvent({ type: 'made_up', intensity: 9 }), { type: 'NEUTRAL', intensity: 1 });
    assert.match(relationshipToPrompt({ trust: 80, affection: 75, irritation: 65 }), /СИЛЬНО РАЗДРАЖЕНА/);
    assert.match(relationshipToPrompt({ trust: 80, affection: 75, irritation: 65 }), /БЛИЗКОГО ЧЕЛОВЕКА\/КРАША/);
    assert.match(relationshipToPrompt({ trust: 20, affection: 20, irritation: 65 }), /отвали/);
    assert.match(relationshipToPrompt({ trust: 80, affection: 80, irritation: 35 }), /ДУЕШЬСЯ И ПОДКАЛЫВАЕШЬ/);
});

