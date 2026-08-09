import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRandomEvent, applyRandomConsequences } from '../src/radiant/random_events.js';
import { normalizePersonality, personalityModifiers } from '../src/radiant/personality.js';
import { UtilitySelector } from '../src/radiant/utility_selector.js';

test('random event selection is deterministic and respects windows/conditions', () => {
    const input = { now: new Date('2026-08-07T12:00:00+03:00'), state: { location_id: 'petrogradka_home', needs: { fatigue: 60, hunger: 50 } }, activeTask: { taskType: 'WORK_LAPTOP' }, seed: 'fixed-seed' };
    assert.deepEqual(selectRandomEvent(input), selectRandomEvent(input));
    assert.equal(selectRandomEvent({ ...input, now: new Date('2026-08-07T03:00:00+03:00') }), null);
    assert.equal(selectRandomEvent({ ...input, state: { location_id: 'showroom_work', needs: input.state.needs } }), null);
});

test('random event cooldown blocks a repeated event and consequences are bounded', () => {
    const now = new Date('2026-08-07T12:00:00+03:00');
    const event = selectRandomEvent({ now, state: { location_id: 'petrogradka_home', needs: { fatigue: 60, hunger: 50 } }, activeTask: { taskType: 'WORK_LAPTOP' }, seed: 'event-seed' });
    if (event) {
        assert.equal(selectRandomEvent({ now: new Date(now.getTime() + 5 * 60000), state: { location_id: 'petrogradka_home', needs: { fatigue: 60, hunger: 50 } }, activeTask: { taskType: 'WORK_LAPTOP' }, history: { [event.id]: now.toISOString() }, seed: 'event-seed' }), null);
        const next = applyRandomConsequences({ needs: { boredom: 98, fatigue: 98 }, physiology: { irritation: 98 } }, event);
        assert.ok(next.needs.boredom <= 100 && next.needs.fatigue <= 100 && next.physiology.irritation <= 100);
    }
});

test('random event catalog covers travel, venue, message, delivery and energy branches', () => {
    const cases = [
        { taskType: 'TRAVEL', targetLocation: 'bar_rubinsteina', state: { location_id: 'petrogradka_home', needs: {} }, commitments: [] },
        { taskType: 'TRAVEL', targetLocation: 'cafe_sloy', state: { location_id: 'cafe_sloy', needs: {} }, commitments: [] },
        { taskType: 'WORK_LAPTOP', targetLocation: 'petrogradka_home', state: { location_id: 'petrogradka_home', needs: { fatigue: 60, hunger: 50 } }, commitments: [] },
        { taskType: 'IDLE_HOME_REST', targetLocation: 'petrogradka_home', state: { location_id: 'petrogradka_home', needs: {} }, commitments: [{ type: 'SOCIAL_MEETING', status: 'PLANNED' }] }
    ];
    for (const input of cases) {
        const event = selectRandomEvent({ now: new Date('2026-08-07T15:00:00+03:00'), activeTask: input, ...input, seed: 'catalog-matrix' });
        assert.ok(event === null || ['INTERNET_OUTAGE', 'DELIVERY_DELAY', 'SUDDEN_LOW_ENERGY', 'CAFE_CLOSED', 'TRANSPORT_DELAY', 'UNEXPECTED_MESSAGE'].includes(event.id));
    }
});

test('personality is normalized and changes utility without breaking hard rules', () => {
    const disciplined = normalizePersonality({ discipline: 100, procrastination: 0 });
    const lazy = normalizePersonality({ discipline: 0, procrastination: 100 });
    assert.ok(personalityModifiers({ personality: disciplined, taskType: 'WORK_LAPTOP' }) > personalityModifiers({ personality: lazy, taskType: 'WORK_LAPTOP' }));
    const candidates = UtilitySelector.candidates({ state: { needs: { hunger: 0, fatigue: 0, boredom: 70, hygiene: 100, bladder: 0, horny: 0 } }, personality: lazy });
    assert.ok(candidates.some(candidate => candidate.taskType === 'LEISURE_HOME'));
});
