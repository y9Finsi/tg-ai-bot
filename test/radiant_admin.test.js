import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMood, calculatePassiveNeedDecay, applyCycleLifecycle, applyCompletedTaskEffects } from '../src/radiant/needs.js';
import { GOAPPlanner } from '../src/radiant/goap_planner.js';
import { buildTransitRoute, coordinateAtProgress } from '../src/radiant/world_map.js';
import { WeatherService } from '../src/radiant/weather_service.js';
import { ForecastService } from '../src/radiant/forecast_service.js';

test('mood is derived and never part of persisted needs', () => {
    const state = { needs: { hunger: 80, fatigue: 70, boredom: 20, bladder: 10, hygiene: 30, mood: 100 }, active_modifiers: ['WET_CLOTHES'] };
    assert.equal(calculateMood(state), 0);
    const decayed = calculatePassiveNeedDecay(state.needs, { cycle_day: 3 }, [], 5);
    assert.equal('mood' in decayed.needs, false);
});

test('cycle automatically applies PMS and exactly doubles ovulation horny decay', () => {
    const pms = applyCycleLifecycle({ cycle_day: 1 }, []);
    assert.ok(pms.activeModifiers.includes('PMS_CRAMPS'));
    const normal = calculatePassiveNeedDecay({ horny: 10 }, { cycle_day: 11 }, [], 5);
    const ovulation = calculatePassiveNeedDecay({ horny: 10 }, { cycle_day: 12 }, [], 5);
    assert.equal(ovulation.needs.horny - 10, (normal.needs.horny - 10) * 2);
    assert.equal(applyCycleLifecycle({ cycle_day: 3 }, ['PMS_CRAMPS']).activeModifiers.includes('PMS_CRAMPS'), false);
});

test('willingness uses the strict documented formula', () => {
    const state = { needs: { hunger: 50, fatigue: 45, hygiene: 90, boredom: 0, bladder: 0 }, active_modifiers: [] };
    const explanation = GOAPPlanner.explainWillingness(state, 80);
    assert.equal(explanation.value, Math.max(0, Math.min(100, 80 - 50 - 45 + calculateMood(state))));
});

test('transit route has deterministic endpoints and progress', () => {
    const route = buildTransitRoute('petrogradka_home', 'vkusvill_lenina');
    assert.deepEqual(coordinateAtProgress(route, 0), route[0]);
    assert.deepEqual(coordinateAtProgress(route, 100), route.at(-1));
    assert.notDeepEqual(coordinateAtProgress(route, 50), route[0]);
});

test('weather uses cache when fresh and never invents weather after TTL', async () => {
    const okFetcher = async () => ({ ok: true, json: async () => ({ current: { rain: 1, weather_code: 61, temperature_2m: 18 } }) });
    const fresh = await WeatherService.getSnapshot({ fetcher: okFetcher, now: 1_000 });
    assert.equal(fresh.status, 'fresh'); assert.equal(fresh.is_raining, true);
    const cached = await WeatherService.getSnapshot({ fetcher: async () => { throw new Error('offline'); }, now: 2_000 });
    assert.equal(cached.status, 'fresh');
    const unavailable = await WeatherService.getSnapshot({ fetcher: async () => { throw new Error('offline'); }, now: 1_000 + 21 * 60 * 1000 });
    assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.is_raining, null);
});

test('forecast is display-only deterministic intent data', () => {
    const nodes = ForecastService.buildNodes({ state: { location_id: 'petrogradka_home', needs: { hunger: 60, fatigue: 10, boredom: 20 } }, weather: { is_raining: false } });
    assert.ok(nodes.some(node => node.taskType === 'BUY_FOOD_STORE'));
    assert.equal(ForecastService.edgesFor(nodes).length, nodes.length - 1);
});

test('completed tasks change base needs without mood mutation', () => {
    const next = applyCompletedTaskEffects({ hunger: 90, fatigue: 20 }, 'EAT_FOOD_HOME');
    assert.equal(next.hunger, 35); assert.equal('mood' in next, false);
});
