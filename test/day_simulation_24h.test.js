import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMood, calculatePassiveNeedDecay, checkNeedInterrupts } from '../src/radiant/needs.js';
import { UtilitySelector } from '../src/radiant/utility_selector.js';
import { applyTaskEffects, TASK_DEFINITIONS } from '../src/radiant/task_catalog.js';
import { DailyRoutine } from '../src/radiant/daily_routine.js';
import { runContinuousDay } from '../src/radiant/day_runner.js';

const STEP_MINUTES = 5;
const DAY_MINUTES = 24 * 60;
const START = new Date('2026-08-07T00:00:00+03:00');

const initialState = () => ({
    needs: { hunger: 20, fatigue: 10, boredom: 30, horny: 40, hygiene: 90, bladder: 0 },
    physiology: { cycle_day: 3 },
    active_modifiers: [],
    wallet_rubles: 3820,
    food_servings: 2,
    npc: {
        nastya: { drama_level: 40 },
        max_client: { deadline_urgency: 65 }
    }
});

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

function label(taskType) {
    return {
        IDLE_HOME_REST: 'отдых дома',
        GO_TO_BATHROOM: 'туалет',
        EMERGENCY_EAT: 'еда',
        SLEEP_EXHAUSTED: 'сон от истощения',
        SHOWER_HOME: 'душ',
        LEISURE_HOME: 'досуг дома',
        PRIVATE_RELIEF: 'личное время',
        WORK_LAPTOP: 'работа за ноутбуком',
        SOCIAL_NASTYA: 'время с Настей'
    }[taskType] || taskType;
}

function legacySelect({ state, npc, now, excludedTaskTypes = [] }) {
    const candidates = UtilitySelector.candidates({ state, npc, now, excludedTaskTypes });
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(now));
    const fatigueScore = Math.max(0, Math.min(100, Number(state.needs?.fatigue || 0) * 1.15 + (hour >= 23 || hour < 7 ? 20 : 0)));
    if (fatigueScore >= 45 && !excludedTaskTypes.includes('SLEEP_EXHAUSTED') && !candidates.some(candidate => candidate.taskType === 'SLEEP_EXHAUSTED')) {
        candidates.push({ taskType: 'SLEEP_EXHAUSTED', score: fatigueScore, reason: 'sleep utility', durationMinutes: 120, priority: 85 });
        candidates.sort((a, b) => b.score - a.score || a.taskType.localeCompare(b.taskType));
    }
    return candidates[0] || { taskType: 'IDLE_HOME_REST', score: 10, reason: 'idle fallback', durationMinutes: 30 };
}

function simulateDay() {
    const state = initialState();
    const intervals = [];
    const completed = [];
    const samples = [];
    let active = null;
    let intervalStart = START;
    const recentCompleted = new Map();

    for (let minute = 0; minute < DAY_MINUTES; minute += STEP_MINUTES) {
        const now = addMinutes(START, minute);
        const decay = calculatePassiveNeedDecay(state.needs, state.physiology, state.active_modifiers, STEP_MINUTES, { sleeping: active?.taskType === 'SLEEP_NIGHT' });
        state.needs = decay.needs;
        state.physiology = decay.physiology;
        state.active_modifiers = decay.activeModifiers;

        if (!active) {
            const interrupt = checkNeedInterrupts(state.needs)[0];
            const excludedTaskTypes = [...recentCompleted.entries()]
                .filter(([, completedAt]) => now.getTime() - completedAt < 30 * 60 * 1000)
                .map(([taskType]) => taskType);
            const selected = interrupt
                ? { taskType: interrupt.taskType, durationMinutes: interrupt.durationMinutes, reason: interrupt.createdBy, score: interrupt.priority }
                : legacySelect({ state, npc: state.npc, now, excludedTaskTypes });
            active = {
                taskType: selected.taskType,
                remaining: TASK_DEFINITIONS[selected.taskType]?.durationMinutes || 30,
                reason: selected.reason,
                score: selected.score
            };
            intervalStart = now;
        }

        active.remaining -= STEP_MINUTES;
        if (active.remaining <= 0) {
            const taskType = active.taskType;
            // The real worker resolves EMERGENCY_EAT through GOAP. This offline
            // harness represents that chain by its observable completed effect.
            if (taskType === 'EMERGENCY_EAT' && state.food_servings <= 0) {
                if (state.wallet_rubles >= 250) {
                    state.wallet_rubles -= 250;
                    state.food_servings += 1;
                }
            }
            if (taskType === 'EMERGENCY_EAT' && state.food_servings > 0) {
                state.food_servings -= 1;
                // In production this is the parent goal; its GOAP child
                // EAT_FOOD_HOME applies the typed hunger effect.
                state.needs = applyTaskEffects(state.needs, 'EAT_FOOD_HOME', { hungerRestore: 50 });
            } else if (taskType !== 'EMERGENCY_EAT') {
                state.needs = applyTaskEffects(state.needs, taskType, { hungerRestore: 50 });
            }
            const end = addMinutes(now, STEP_MINUTES);
            intervals.push({ start: intervalStart, end, taskType, reason: active.reason, score: active.score });
            completed.push(taskType);
            recentCompleted.set(taskType, end.getTime());
            active = null;
        }

        if (minute % 60 === 55) samples.push({ at: addMinutes(now, STEP_MINUTES), needs: { ...state.needs }, mood: calculateMood(state) });
    }

    if (active) intervals.push({ start: intervalStart, end: addMinutes(START, DAY_MINUTES), taskType: active.taskType, reason: active.reason, score: active.score });
    return { state, intervals, completed, samples };
}

function simulateRoutineDay() {
    const state = initialState();
    const intervals = [];
    const completed = [];
    const samples = [];
    let active = null;
    let intervalStart = START;
    const routineCompleted = new Set();
    const recentCompleted = new Map();

    for (let minute = 0; minute < DAY_MINUTES; minute += STEP_MINUTES) {
        const now = addMinutes(START, minute);
        const decay = calculatePassiveNeedDecay(state.needs, state.physiology, state.active_modifiers, STEP_MINUTES, { sleeping: active?.taskType === 'SLEEP_NIGHT' });
        state.needs = decay.needs;
        state.physiology = decay.physiology;
        state.active_modifiers = decay.activeModifiers;

        if (!active) {
            const interrupt = checkNeedInterrupts(state.needs)[0];
            const routine = DailyRoutine.select({ now, state, completedTaskTypes: [...routineCompleted] });
            const excludedTaskTypes = [...recentCompleted.entries()]
                .filter(([, completedAt]) => now.getTime() - completedAt < 30 * 60 * 1000)
                .map(([taskType]) => taskType);
            const selected = interrupt
                ? { taskType: interrupt.taskType, durationMinutes: interrupt.durationMinutes, reason: interrupt.createdBy, score: interrupt.priority }
                : routine || UtilitySelector.select({ state, npc: state.npc, now, excludedTaskTypes });
            active = {
                taskType: selected.taskType,
                remaining: selected.durationMinutes || TASK_DEFINITIONS[selected.taskType]?.durationMinutes || 30,
                reason: selected.reason,
                score: selected.score || selected.priority || 10,
                routineDate: selected.routineDate,
                routineKind: selected.routineKind
            };
            intervalStart = now;
        }

        active.remaining -= STEP_MINUTES;
        if (active.remaining <= 0) {
            const taskType = active.taskType;
            if (['EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER', 'EMERGENCY_EAT'].includes(taskType) && state.food_servings <= 0 && state.wallet_rubles >= 250) {
                state.wallet_rubles -= 250;
                state.food_servings += 1;
            }
            if (['EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER', 'EMERGENCY_EAT'].includes(taskType) && state.food_servings > 0) {
                state.food_servings -= 1;
                state.needs = applyTaskEffects(state.needs, 'EAT_FOOD_HOME', { hungerRestore: 50 });
            } else {
                state.needs = applyTaskEffects(state.needs, taskType, { hungerRestore: 50 });
            }
            const end = addMinutes(now, STEP_MINUTES);
            intervals.push({ start: intervalStart, end, taskType, reason: active.reason, score: active.score });
            completed.push(taskType);
            recentCompleted.set(taskType, end.getTime());
            if (active.routineDate) routineCompleted.add(active.taskType);
            if (taskType === 'EMERGENCY_EAT') {
                const meal = DailyRoutine.candidates({ now: end, state }).find(candidate => candidate.routineKind !== 'sleep');
                if (meal) routineCompleted.add(meal.taskType);
            }
            active = null;
        }
        if (minute % 60 === 55) samples.push({ at: addMinutes(now, STEP_MINUTES), needs: { ...state.needs }, mood: calculateMood(state) });
    }
    if (active) intervals.push({ start: intervalStart, end: addMinutes(START, DAY_MINUTES), taskType: active.taskType, reason: active.reason, score: active.score });
    return { state, intervals, completed, samples };
}

function formatTime(date) {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(date);
}

function buildReport(result) {
    const lines = ['\n=== СУТКИ С ЛЕРОЙ: offline simulation ===', 'Дата: 07.08.2026, шаг: 5 минут, старт: дом, денег: 3820 ₽'];
    lines.push('\nДневник действий:');
    for (const interval of result.intervals) {
        lines.push(`${formatTime(interval.start)}–${formatTime(interval.end)}  ${label(interval.taskType)} [${interval.taskType}]`);
    }
    const max = key => result.samples.reduce((best, sample) => sample.needs[key] > best.value ? { value: sample.needs[key], at: sample.at } : best, { value: -1 });
    const minMood = result.samples.reduce((best, sample) => sample.mood < best.value ? { value: sample.mood, at: sample.at } : best, { value: 101 });
    lines.push('\nИтоговые показатели:');
    lines.push(`потребности: ${JSON.stringify(result.state.needs)}`);
    lines.push(`настроение: минимум ${minMood.value}/100 в ${formatTime(minMood.at)}, конец дня ${calculateMood(result.state)}/100`);
    lines.push(`пики: голод ${max('hunger').value}, усталость ${max('fatigue').value}, скука ${max('boredom').value}, пузырь ${max('bladder').value}`);
    lines.push(`завершено задач: ${result.completed.length}; еда осталась: ${result.state.food_servings}; денег осталось: ${result.state.wallet_rubles} ₽`);
    lines.push('Ограничение: это offline harness физики + UtilitySelector; PostgreSQL, WeatherService, GOAP-запись очереди, LLM и Telegram не запускались.');
    return lines.join('\n');
}

function summary(result) {
    const count = taskType => result.intervals.filter(interval => interval.taskType === taskType).length;
    return {
        nightSleep: count('SLEEP_NIGHT'),
        exhaustedSleep: count('SLEEP_EXHAUSTED'),
        plannedMeals: ['EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER'].reduce((sum, type) => sum + count(type), 0),
        emergencyMeals: count('EMERGENCY_EAT'),
        workMinutes: result.intervals.filter(interval => interval.taskType === 'WORK_LAPTOP').reduce((sum, interval) => sum + (interval.end - interval.start) / 60000, 0),
        finalNeeds: result.state.needs,
        finalMood: calculateMood(result.state)
    };
}

function continuousSummary() {
    const result = runContinuousDay({
        start: START,
        state: initialState(),
        npcStates: { nastya: { state_json: { drama_level: 90, cooldown_until: null } }, max_client: { state_json: { deadline_urgency: 20, cooldown_until: null } } },
        weather: { is_raining: false, status: 'test' }
    });
    return {
        result,
        nightSleep: result.intervals.filter(item => item.taskType === 'SLEEP_NIGHT').length,
        travel: result.intervals.filter(item => item.taskType === 'TRAVEL').length,
        npcEvents: result.facts.filter(item => item.type.includes('SOCIAL_') || item.type.includes('WORK_')).length,
        commitments: result.commitments.length,
        consequences: result.consequences.length,
        finalLocation: result.state.location_id,
        finalMood: result.mood
    };
}

function v3Summary() {
    const result = runContinuousDay({
        start: START,
        state: initialState(),
        npcStates: { nastya: { state_json: { drama_level: 90, cooldown_until: null } }, max_client: { state_json: { deadline_urgency: 20, cooldown_until: null } } },
        weather: { is_raining: false, status: 'test' },
        personality: { discipline: 70, sociability: 75, procrastination: 30, homebody: 40 },
        seed: 'final-v3'
    });
    return {
        result,
        nightSleep: result.intervals.filter(item => item.taskType === 'SLEEP_NIGHT').length,
        travel: result.intervals.filter(item => item.taskType === 'TRAVEL').length,
        npcEvents: result.facts.filter(item => ['SOCIAL_MEETING_PROPOSED', 'WORK_REQUEST_CREATED'].includes(item.type)).length,
        randomEvents: result.randomEvents.length,
        commitments: result.commitments.length,
        consequences: result.consequences.length,
        finalLocation: result.state.location_id,
        finalMood: result.mood
    };
}

test('24-hour Lera simulation compares the old reactive day with the routine day', () => {
    const baseline = simulateDay();
    const result = simulateRoutineDay();
    const v2 = continuousSummary();
    const v3 = v3Summary();
    console.log(buildReport(baseline).replace('offline simulation', 'OLD BASELINE'));
    console.log(buildReport(result).replace('offline simulation', 'NEW ROUTINE'));
    console.log('\n=== OLD vs NEW ===\n' + JSON.stringify({ old: summary(baseline), new: summary(result) }, null, 2));
    console.log('\n=== V0 vs V1 vs V2 ===\n' + JSON.stringify({ V0: summary(baseline), V1: summary(result), V2: { nightSleep: v2.nightSleep, travel: v2.travel, npcEvents: v2.npcEvents, commitments: v2.commitments, consequences: v2.consequences, finalLocation: v2.finalLocation, finalMood: v2.finalMood } }, null, 2));
    console.log('\n=== V0 vs V1 vs V2 vs V3 ===\n' + JSON.stringify({ V0: summary(baseline), V1: summary(result), V2: { nightSleep: v2.nightSleep, travel: v2.travel, npcEvents: v2.npcEvents, commitments: v2.commitments, consequences: v2.consequences, finalLocation: v2.finalLocation, finalMood: v2.finalMood }, V3: { nightSleep: v3.nightSleep, travel: v3.travel, npcEvents: v3.npcEvents, randomEvents: v3.randomEvents, commitments: v3.commitments, consequences: v3.consequences, finalLocation: v3.finalLocation, finalMood: v3.finalMood } }, null, 2));

    assert.equal(result.intervals[0].start.toISOString(), START.toISOString());
    assert.ok(result.intervals.length >= 5, 'a day should contain multiple activities');
    assert.ok(result.completed.includes('GO_TO_BATHROOM'), 'bladder interrupt must be serviced');
    assert.ok(result.completed.some(taskType => ['EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER'].includes(taskType)), 'routine meals must happen');
    assert.equal(summary(result).nightSleep, 1, 'routine day should have one main night sleep block');
    assert.ok(summary(result).emergencyMeals < summary(baseline).emergencyMeals, 'routine should reduce emergency meals');
    assert.ok(summary(result).workMinutes >= 0, 'work duration should be non-negative');
    assert.ok(result.intervals.filter(interval => interval.taskType === 'WORK_LAPTOP').every(interval => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(interval.start)) >= 8), 'routine should not start work at night');
    assert.ok(result.state.needs.hunger >= 0 && result.state.needs.hunger <= 100);
    assert.ok(result.state.needs.fatigue >= 0 && result.state.needs.fatigue <= 100);
    assert.ok(result.state.needs.bladder >= 0 && result.state.needs.bladder <= 100);
    assert.equal(v2.nightSleep, 1);
    assert.ok(v2.travel > 0);
    assert.ok(v2.commitments > 0);
    assert.equal(v2.finalLocation, 'petrogradka_home');
    assert.equal(v3.nightSleep, 1);
    assert.ok(v3.travel > 0);
    assert.ok(v3.commitments > 0);
    assert.equal(v3.finalLocation, 'petrogradka_home');
});

export { simulateDay, buildReport };
