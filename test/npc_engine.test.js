import test from 'node:test';
import assert from 'node:assert/strict';
import { NPCRadiantEngine } from '../src/radiant/npc_radiant.js';

const states = (nastya = {}, max = {}) => ({ nastya: { state_json: { drama_level: 90, ...nastya } }, max_client: { state_json: { deadline_urgency: 80, ...max } } });

test('NPC engine uses tickAt instead of wall clock', () => {
    const fridayEvening = new Date('2026-08-07T18:00:00+03:00');
    const result = NPCRadiantEngine.processNpcTicks(states(), 5, fridayEvening);
    assert.equal(result.tickAt.toISOString(), fridayEvening.toISOString());
    assert.ok(result.events.some(event => event.type === 'SOCIAL_MEETING_PROPOSED'));
});

test('NPC engine is deterministic for the same input and tickAt', () => {
    const tickAt = new Date('2026-08-07T12:00:00+03:00');
    const first = NPCRadiantEngine.processNpcTicks(states(), 5, tickAt);
    const second = NPCRadiantEngine.processNpcTicks(states(), 5, tickAt);
    assert.deepEqual(first.updatedNpcs, second.updatedNpcs);
    assert.deepEqual(first.events, second.events);
});

test('NPC cooldowns prevent duplicate events and use simulation time', () => {
    const tickAt = new Date('2026-08-07T18:00:00+03:00');
    const result = NPCRadiantEngine.processNpcTicks(states({ cooldown_until: '2026-08-08T18:00:00+03:00' }, { cooldown_until: '2026-08-08T18:00:00+03:00' }), 5, tickAt);
    assert.equal(result.events.length, 0);
});
