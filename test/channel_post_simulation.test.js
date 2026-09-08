import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDefinition, applyTaskEffects } from '../src/radiant/task_catalog.js';
import { SimulationWorker } from '../src/workers/simulation_worker.js';

test('CHANNEL_POST is registered in task catalog with valid definition', () => {
    const def = taskDefinition('CHANNEL_POST');
    assert.ok(def, 'CHANNEL_POST definition should exist');
    assert.equal(def.category, 'utility');
    assert.equal(def.durationMinutes, 30);
    assert.equal(def.priority, 50);
});

test('applyTaskEffects correctly updates needs for CHANNEL_POST', () => {
    const initialNeeds = { boredom: 50, fatigue: 20, hunger: 10 };
    const nextNeeds = applyTaskEffects(initialNeeds, 'CHANNEL_POST');
    assert.equal(nextNeeds.boredom, 35, 'Boredom should decrease by 15');
    assert.equal(nextNeeds.fatigue, 30, 'Fatigue should increase by 10');
});

test('SimulationWorker sets and retains bot instance', () => {
    const mockBot = { telegram: { sendMessage: async () => {} } };
    SimulationWorker.setBot(mockBot);
    assert.equal(SimulationWorker.bot, mockBot, 'SimulationWorker should retain bot reference');
});
