import test from 'node:test';
import assert from 'node:assert/strict';
import { getDayProfile, isWithinWindow } from '../src/radiant/day_profile.js';
import { DailyRoutine } from '../src/radiant/daily_routine.js';
import { calculatePassiveNeedDecay } from '../src/radiant/needs.js';

const at = value => new Date(value);

test('day profile uses Moscow calendar and distinguishes weekdays', () => {
    assert.equal(getDayProfile(at('2026-08-03T09:00:00Z')).weekday, 1); // Monday 12:00 MSK
    assert.equal(getDayProfile(at('2026-08-07T12:00:00Z')).dayType, 'FRIDAY');
    assert.equal(getDayProfile(at('2026-08-08T12:00:00Z')).dayType, 'SATURDAY');
    assert.equal(getDayProfile(at('2026-08-09T12:00:00Z')).dayType, 'SUNDAY');
    assert.equal(getDayProfile(at('2026-08-03T09:00:00Z')).date, '2026-08-03');
});

test('day profile respects minute boundaries and overnight sleep window', () => {
    const beforeSleep = getDayProfile(at('2026-08-06T20:29:00Z')); // Thursday 23:29 MSK
    const sleep = getDayProfile(at('2026-08-06T20:30:00Z')); // Thursday 23:30 MSK
    const morning = getDayProfile(at('2026-08-07T05:29:00Z')); // Friday 08:29 MSK
    const afterSleep = getDayProfile(at('2026-08-07T05:30:00Z')); // Friday 08:30 MSK
    assert.notEqual(beforeSleep.timeWindow, 'NIGHT_SLEEP');
    assert.equal(sleep.timeWindow, 'NIGHT_SLEEP');
    assert.equal(morning.timeWindow, 'NIGHT_SLEEP');
    assert.notEqual(afterSleep.timeWindow, 'NIGHT_SLEEP');
    assert.equal(isWithinWindow(at('2026-08-08T00:00:00Z'), sleep.sleepWindow), true);
});

test('routine exposes planned meals in their windows and no meal before its window', () => {
    const before = DailyRoutine.select({ now: at('2026-08-07T04:00:00Z'), state: { needs: { hunger: 20 } } });
    const breakfast = DailyRoutine.select({ now: at('2026-08-07T05:00:00Z'), state: { needs: { hunger: 20 } } });
    const lunch = DailyRoutine.select({ now: at('2026-08-07T10:00:00Z'), state: { needs: { hunger: 20 } } });
    assert.equal(before.taskType, 'SLEEP_NIGHT');
    assert.equal(breakfast.taskType, 'EAT_BREAKFAST');
    assert.equal(lunch.taskType, 'EAT_LUNCH');
});

test('routine carries the previous day sleep across midnight', () => {
    const candidate = DailyRoutine.select({ now: at('2026-08-06T21:00:00Z'), state: { needs: { hunger: 20 } } }); // Thu 00:00 Fri
    assert.equal(candidate.taskType, 'SLEEP_NIGHT');
    assert.equal(candidate.routineDate, '2026-08-06');
});

test('routine does not repeat a meal after its daily fact or produce duplicate candidates', () => {
    const now = at('2026-08-07T05:30:00Z');
    const first = DailyRoutine.candidates({ now, state: { needs: { hunger: 20 } } });
    const second = DailyRoutine.candidates({ now, state: { needs: { hunger: 20 } }, completedTaskTypes: ['EAT_BREAKFAST'] });
    assert.equal(first.filter(candidate => candidate.taskType === 'EAT_BREAKFAST').length, 1);
    assert.equal(second.some(candidate => candidate.taskType === 'EAT_BREAKFAST'), false);
});

test('weekday profile survives leap day and date rollover', () => {
    assert.equal(getDayProfile(at('2028-02-29T09:00:00Z')).date, '2028-02-29');
    assert.equal(getDayProfile(at('2028-03-01T09:00:00Z')).date, '2028-03-01');
    assert.notEqual(getDayProfile(at('2028-02-29T09:00:00Z')).weekday, getDayProfile(at('2028-03-01T09:00:00Z')).weekday);
});

test('night sleep uses sleeping decay and does not increase fatigue', () => {
    const sleeping = calculatePassiveNeedDecay(
        { hunger: 20, fatigue: 70, boredom: 30, bladder: 10, hygiene: 90, horny: 40 },
        { cycle_day: 3 }, [], 60, { sleeping: true }
    );
    assert.equal(sleeping.needs.fatigue, 70);
    assert.equal(sleeping.needs.hunger, 22);
    assert.equal(sleeping.needs.bladder, 16);
});
