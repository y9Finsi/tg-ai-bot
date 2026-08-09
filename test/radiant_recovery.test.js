import test from 'node:test';
import assert from 'node:assert/strict';
import { UtilitySelector } from '../src/radiant/utility_selector.js';
import { applyTaskEffects } from '../src/radiant/task_catalog.js';
import { calculateMood, cycleDayFromDate } from '../src/radiant/needs.js';
import { GOAPPlanner } from '../src/radiant/goap_planner.js';

test('utility selector picks critical bathroom before idle and exposes deterministic candidates', () => {
    const selected = UtilitySelector.select({
        state: { needs: { bladder: 75, hunger: 10, fatigue: 5, hygiene: 90, boredom: 0, horny: 0 }, wallet_rubles: 3000 },
        npc: {},
        now: new Date('2026-08-05T10:00:00+03:00')
    });
    assert.equal(selected.taskType, 'GO_TO_BATHROOM');
    assert.ok(selected.score > 0);
    assert.equal(selected.priority, 100);
});

test('utility selector uses technical id as deterministic tie break', () => {
    const candidates = UtilitySelector.candidates({
        state: { needs: { bladder: 50, hunger: 50, fatigue: 0, hygiene: 100, boredom: 0, horny: 0 }, wallet_rubles: 3000 },
        npc: {},
        now: new Date('2026-08-05T10:00:00+03:00')
    });
    for (let index = 1; index < candidates.length; index += 1) {
        const previous = candidates[index - 1];
        const current = candidates[index];
        assert.ok(previous.score >= current.score);
        if (previous.score === current.score) assert.ok(previous.taskType.localeCompare(current.taskType) <= 0);
    }
});

test('typed task effects alter needs without persisting mood', () => {
    const next = applyTaskEffects({ hunger: 95, fatigue: 20, mood: 4 }, 'EAT_FOOD_HOME', { hungerRestore: 50 });
    assert.equal(next.hunger, 45);
    assert.equal('mood' in next, false);
});

test('cycle day is normalized from a Moscow anchor date', () => {
    assert.equal(cycleDayFromDate('2026-08-01', new Date('2026-08-01T12:00:00+03:00')), 1);
    assert.equal(cycleDayFromDate('2026-08-01', new Date('2026-08-14T12:00:00+03:00')), 14);
    assert.equal(cycleDayFromDate('2026-08-01', new Date('2026-08-29T12:00:00+03:00')), 1);
});

test('derived mood remains clamped at zero for saturated needs and penalties', () => {
    assert.equal(calculateMood({
        needs: { hunger: 100, fatigue: 100, boredom: 100, bladder: 100, hygiene: 0 },
        active_modifiers: ['WET_CLOTHES', 'PMS_CRAMPS', 'HANGOVER']
    }), 0);
});

test('utility selector can exclude a just-completed goal during cooldown', () => {
    const selected = UtilitySelector.select({
        state: { needs: { hunger: 60, fatigue: 0, bladder: 0, hygiene: 100, boredom: 0, horny: 0 }, wallet_rubles: 3000 },
        excludedTaskTypes: ['EMERGENCY_EAT'],
        now: new Date('2026-08-05T10:00:00+03:00')
    });
    assert.notEqual(selected.taskType, 'EMERGENCY_EAT');
});

test('live GOAP chain is scoped to the active root instead of the whole queue', () => {
    const chain = GOAPPlanner.buildVisualChain({
        activeTask: { id: 12, root_task_id: 10 },
        queue: [
            { id: 10, root_task_id: 10, task_type: 'EMERGENCY_EAT', target_location: 'petrogradka_home' },
            { id: 12, root_task_id: 10, task_type: 'EAT_FOOD_HOME', target_location: 'petrogradka_home' },
            { id: 30, root_task_id: 30, task_type: 'EMERGENCY_EAT', target_location: 'petrogradka_home' }
        ]
    });
    assert.deepEqual(chain.steps.map(step => step.name), ['EMERGENCY_EAT', 'EAT_FOOD_HOME']);
});

test('getExecutableTask generates FOR UPDATE SKIP LOCKED clause when transaction client is provided', async () => {
    let capturedQuery = null;
    const mockClient = {
        query: async (sql) => {
            capturedQuery = sql;
            return { rows: [{ id: 683, task_type: 'WORK_LAPTOP', status: 'PENDING' }] };
        }
    };
    const { StateRepository } = await import('../src/db/state_repository.js');
    const task = await StateRepository.getExecutableTask(mockClient);
    assert.ok(capturedQuery.includes('FOR UPDATE SKIP LOCKED'));
    assert.equal(task.id, 683);
});

test('getExecutableTask omits FOR UPDATE clause when lock parameter is false or client is null', async () => {
    let capturedQuery = null;
    const mockClient = {
        query: async (sql) => {
            capturedQuery = sql;
            return { rows: [] };
        }
    };
    const { StateRepository } = await import('../src/db/state_repository.js');
    await StateRepository.getExecutableTask(mockClient, { lock: false });
    assert.equal(capturedQuery.includes('FOR UPDATE'), false);
});

