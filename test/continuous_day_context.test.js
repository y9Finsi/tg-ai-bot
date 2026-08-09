import test from 'node:test';
import assert from 'node:assert/strict';
import { runContinuousDay } from '../src/radiant/day_runner.js';
import { ContextBuilder } from '../src/ai/context_builder.js';

function seed() {
    return {
        state: { location_id: 'petrogradka_home', needs: { hunger: 20, fatigue: 10, boredom: 30, horny: 40, hygiene: 90, bladder: 0 }, physiology: { cycle_day: 3 }, active_modifiers: [], wallet_rubles: 3820 },
        npcStates: { nastya: { state_json: { drama_level: 90, cooldown_until: null } }, max_client: { state_json: { deadline_urgency: 20, cooldown_until: null } } }
    };
}

test('one continuous day contains NPC events, commitments, travel, facts and consequences', () => {
    const result = runContinuousDay({ start: new Date('2026-08-07T00:00:00+03:00'), ...seed() });
    assert.ok(result.intervals.some(item => item.taskType === 'SLEEP_NIGHT'));
    assert.ok(result.intervals.some(item => item.taskType === 'TRAVEL'), `continuous day had no travel: ${result.facts.map(item => item.type).join(',')}`);
    assert.ok(result.facts.some(item => item.type === 'SOCIAL_MEETING_PROPOSED' || item.type === 'WORK_REQUEST_CREATED') || result.commitments.some(item => item.origin === 'NPC_MAX_CLIENT' || item.origin === 'NPC_NASTYA'));
    assert.ok(result.commitments.length > 0);
    assert.ok(result.intervals.every(item => item.location));
    assert.equal(result.state.location_id, 'petrogradka_home');
});

test('one continuous day carries controlled randomness and personality into the same stream', () => {
    const base = seed();
    const first = runContinuousDay({ start: new Date('2026-08-07T00:00:00+03:00'), ...base, personality: { discipline: 90, sociability: 70 }, seed: 'continuous-fixed' });
    const second = runContinuousDay({ start: new Date('2026-08-07T00:00:00+03:00'), ...base, personality: { discipline: 90, sociability: 70 }, seed: 'continuous-fixed' });
    assert.deepEqual(first.randomEvents, second.randomEvents);
    assert.deepEqual(first.personality, second.personality);
    assert.ok(first.facts.some(item => item.type === 'RANDOM_EVENT') || first.randomEvents.length === 0);
});

test('LLM prompt gives a compact day analysis with only facts and plans', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: null,
        transit: null,
        inventory: [],
        weather: { status: 'test', is_raining: false },
        mood: 70,
        willingness: { value: 70 },
        facts: [{ occurred_at: '2026-08-07T16:00:00+03:00', event_type: 'TRAVEL_COMPLETED', payload: { locationId: 'showroom_work' } }],
        commitments: [{ title: 'Встреча с Настей', due_at: '2026-08-07T19:00:00+03:00', target_location: 'bar_rubinsteina', status: 'PLANNED' }],
        missedCommitments: [{ title: 'Старая встреча', status: 'MISSED' }],
        observerDigests: [{ narrative: 'Лера будто бы ждёт вечера.' }],
        user: { first_name: 'Богдан' },
        currentTime: '2026-08-07 18:00 MSK'
    });
    assert.match(prompt, /СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ/);
    assert.match(prompt, /ГЛАВНЫЕ СОБЫТИЯ ЗА ДЕНЬ/);
    assert.match(prompt, /В плане:/);
    assert.match(prompt, /События уже произошли; планы — только намерения/);
    assert.match(prompt, /Не придумывай факты или подробности событий/);
    assert.doesNotMatch(prompt, /ЧЕГО МЫ НЕ ЗНАЕМ|ОБЩЕЕ НАБЛЮДЕНИЕ — НЕ ФАКТ|причина не установлена|ПРИЧИНЫ И ПОСЛЕДСТВИЯ|\[НАБЛЮДЕНИЕ\]/);
    assert.doesNotMatch(prompt, /Мы уже сидим в баре/);
    assert.doesNotMatch(prompt, /TASK_COMPLETED|TRAVEL_COMPLETED|locationId|taskType|\{"/);
    assert.doesNotMatch(prompt, /голод \d+|усталость \d+|скука \d+/);
});

test('context formats ISO timestamps in Moscow time without applying timezone twice', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: null,
        transit: null,
        inventory: [],
        weather: { is_raining: false },
        mood: 70,
        facts: [],
        commitments: [],
        user: { first_name: 'Богдан' },
        currentTime: '2026-08-07T23:00:00.000Z'
    });

    assert.match(prompt, /Суббота, 08\.08\.2026, 02:00 \(Москва\/Питер\)/);
});
