import test from 'node:test';
import assert from 'node:assert/strict';
import { getDayProfile } from '../src/radiant/day_profile.js';
import { commitmentPriority, commitmentStatusAt, dailyCommitmentTemplates, COMMITMENT_STATUS, rankCommitments } from '../src/radiant/commitments.js';
import { buildCommitmentChain } from '../src/radiant/commitment_planner.js';
import { calculateTravelInfo, coordinateAtProgress, buildTransitRoute } from '../src/radiant/world_map.js';
import { GOAPPlanner } from '../src/radiant/goap_planner.js';
import { taskDefinition } from '../src/radiant/task_catalog.js';

const now = new Date('2026-08-07T12:00:00+03:00');

test('weekday templates create work and Friday social commitments', () => {
    const profile = getDayProfile(now);
    const templates = dailyCommitmentTemplates({ profile, date: profile.date, maxUrgency: 65, dramaLevel: 40 });
    assert.ok(templates.some(item => item.type === 'WORK_DEADLINE'));
    assert.ok(templates.some(item => item.type === 'SOCIAL_MEETING'));
    assert.equal(templates.find(item => item.type === 'WORK_DEADLINE').targetLocation, 'showroom_work');
});

test('weekend does not create normal work commitment', () => {
    const profile = getDayProfile(new Date('2026-08-08T12:00:00+03:00'));
    assert.equal(dailyCommitmentTemplates({ profile, date: profile.date, maxUrgency: 100 }).length, 0);
});

test('deadline priority rises and ranking prefers the nearer deadline', () => {
    const soon = { id: 1, type: 'WORK_DEADLINE', title: 'soon', priority: 40, dueAt: '2026-08-07T14:00:00+03:00', durationMinutes: 60 };
    const later = { id: 2, type: 'WORK_DEADLINE', title: 'later', priority: 40, dueAt: '2026-08-08T14:00:00+03:00', durationMinutes: 60 };
    assert.ok(commitmentPriority(soon, now) > commitmentPriority(later, now));
    assert.equal(rankCommitments([later, soon], now)[0].id, 1);
});

test('commitment lifecycle marks overdue work missed', () => {
    assert.equal(commitmentStatusAt({ status: COMMITMENT_STATUS.PLANNED, dueAt: '2026-08-07T11:00:00+03:00' }, now), COMMITMENT_STATUS.MISSED);
    assert.equal(commitmentStatusAt({ status: COMMITMENT_STATUS.COMPLETED, dueAt: '2026-08-07T11:00:00+03:00' }, now), COMMITMENT_STATUS.COMPLETED);
});

test('work and social commitments build travel-aware chains with return home', () => {
    const work = buildCommitmentChain({ id: 1, type: 'WORK_DEADLINE', targetLocation: 'showroom_work', durationMinutes: 60, preparationMinutes: 10, dueAt: '2026-08-07T18:00:00+03:00', priority: 50 }, { state: { location_id: 'petrogradka_home' } });
    assert.deepEqual(work.map(step => step.taskType), ['PREPARE_FOR_OUTING', 'TRAVEL', 'WORK_LAPTOP', 'TRAVEL']);
    assert.equal(work[1].transit.fromLocation, 'petrogradka_home');
    assert.equal(work.at(-1).targetLocation, 'petrogradka_home');
    const social = GOAPPlanner.resolveGoalDependencies({ goalTaskType: 'COMMITMENT', commitment: { id: 2, type: 'SOCIAL_MEETING', targetLocation: 'bar_rubinsteina', durationMinutes: 90, preparationMinutes: 20, priority: 50 }, state: { location_id: 'bar_rubinsteina' }, inventory: [], weather: {} });
    assert.deepEqual(social.map(step => step.taskType), ['PREPARE_FOR_OUTING', 'SOCIAL_NASTYA', 'TRAVEL']);
});

test('travel starts at current location and only ends at 100 percent', () => {
    const route = buildTransitRoute('petrogradka_home', 'showroom_work');
    assert.deepEqual(coordinateAtProgress(route, 0), route[0]);
    assert.deepEqual(coordinateAtProgress(route, 100), route.at(-1));
    assert.notDeepEqual(coordinateAtProgress(route, 50), route[0]);
    assert.equal(calculateTravelInfo('petrogradka_home', 'showroom_work', { is_raining: true }, null).extraModifiers.includes('WET_CLOTHES'), true);
    assert.equal(calculateTravelInfo('petrogradka_home', 'showroom_work', { is_raining: true }, { properties: { rain_resist: true } }).extraModifiers.length, 0);
});

function simulate24hCommitmentScenario({ type, late = false }) {
    const start = new Date('2026-08-07T00:00:00+03:00');
    const commitment = type === 'SOCIAL_MEETING'
        ? { id: 2, type, title: 'Встреча с Настей', priority: 60, plannedStart: '2026-08-07T19:00:00+03:00', dueAt: '2026-08-07T19:00:00+03:00', durationMinutes: 90, preparationMinutes: 20, targetLocation: 'bar_rubinsteina' }
        : { id: 1, type: 'WORK_DEADLINE', title: 'Работа для Макса', priority: 60, plannedStart: '2026-08-07T10:00:00+03:00', dueAt: '2026-08-07T18:00:00+03:00', durationMinutes: 120, preparationMinutes: 10, targetLocation: 'showroom_work' };
    const chain = buildCommitmentChain(commitment, { state: { location_id: 'petrogradka_home' } });
    const intervals = [];
    let cursor = late ? new Date(type === 'SOCIAL_MEETING' ? '2026-08-07T19:20:00+03:00' : '2026-08-07T17:45:00+03:00') : new Date(type === 'SOCIAL_MEETING' ? '2026-08-07T18:00:00+03:00' : '2026-08-07T09:50:00+03:00');
    let location = 'petrogradka_home';
    for (const step of chain) {
        const duration = step.durationMinutes || taskDefinition(step.taskType).durationMinutes;
        const end = new Date(cursor.getTime() + duration * 60 * 1000);
        intervals.push({ taskType: step.taskType, from: location, to: step.targetLocation, start: cursor, end });
        if (step.taskType === 'TRAVEL') location = step.targetLocation;
        cursor = end;
    }
    const dueAt = new Date(commitment.dueAt);
    const action = intervals.find(interval => interval.taskType === (type === 'SOCIAL_MEETING' ? 'SOCIAL_NASTYA' : 'WORK_LAPTOP'));
    const status = late && action.start > dueAt ? COMMITMENT_STATUS.MISSED : COMMITMENT_STATUS.COMPLETED;
    return { start, commitment, intervals, location, status };
}

test('24-hour scenarios report work travel, social travel, and missed deadline', () => {
    const work = simulate24hCommitmentScenario({ type: 'WORK_DEADLINE' });
    const meeting = simulate24hCommitmentScenario({ type: 'SOCIAL_MEETING' });
    const late = simulate24hCommitmentScenario({ type: 'SOCIAL_MEETING', late: true });
    console.log('\n=== 24H COMMITMENT SCENARIOS ===');
    for (const scenario of [work, meeting, late]) {
        console.log(`${scenario.commitment.type} status=${scenario.status} finalLocation=${scenario.location}`);
        console.log(scenario.intervals.map(interval => `${interval.taskType}:${interval.from}->${interval.to}`).join(' | '));
    }
    assert.ok(work.intervals.some(interval => interval.taskType === 'TRAVEL' && interval.to === 'showroom_work'));
    assert.equal(work.location, 'petrogradka_home');
    assert.ok(meeting.intervals.some(interval => interval.taskType === 'SOCIAL_NASTYA'));
    assert.equal(meeting.location, 'petrogradka_home');
    assert.equal(late.status, COMMITMENT_STATUS.MISSED);
});
