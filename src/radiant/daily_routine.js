import { getDayProfile, getRoutineWindow, isWithinWindow, minutesFromWindowStart, minuteOfDay, parseMinute } from './day_profile.js';

const MEALS = [
    { kind: 'breakfast', taskType: 'EAT_BREAKFAST', createdBy: 'DAILY_ROUTINE', reason: 'planовый завтрак' },
    { kind: 'lunch', taskType: 'EAT_LUNCH', createdBy: 'DAILY_ROUTINE', reason: 'плановый обед' },
    { kind: 'dinner', taskType: 'EAT_DINNER', createdBy: 'DAILY_ROUTINE', reason: 'плановый ужин' }
];

function mealCandidate({ state = {}, now = new Date(), dayProfile = getDayProfile(now), completedTaskTypes = [] } = {}) {
    for (const meal of MEALS) {
        const window = getRoutineWindow(dayProfile, meal.kind);
        if (!window || completedTaskTypes.includes(meal.taskType)) continue;
        const current = minuteOfDay(now);
        const start = parseMinute(window.start);
        const end = parseMinute(window.end);
        const inWindow = isWithinWindow(now, window);
        const lateBy = inWindow ? minutesFromWindowStart(now, window) : current >= end ? current - end : -1;
        if (!inWindow && (lateBy < 0 || lateBy > window.toleranceMinutes)) continue;
        const hunger = Number(state.needs?.hunger || 0);
        return {
            taskType: meal.taskType,
            durationMinutes: window.durationMinutes,
            priority: window.priority + Math.min(10, Math.floor(lateBy / 15)) + (hunger >= 60 ? 8 : 0),
            reason: meal.reason,
            createdBy: meal.createdBy,
            routineKind: meal.kind,
            routineDate: dayProfile.date,
            targetLocation: 'petrogradka_home',
            window,
            lateBy
        };
    }
    return null;
}

export class DailyRoutine {
    static profile(now = new Date()) { return getDayProfile(now); }

    static candidates({ state = {}, now = new Date(), dayProfile = getDayProfile(now), completedTaskTypes = [] } = {}) {
        const candidates = [];
        const sleep = getRoutineWindow(dayProfile, 'sleep');
        const previousDate = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000);
        const previousProfile = getDayProfile(previousDate);
        const previousSleep = getRoutineWindow(previousProfile, 'sleep');
        const currentSleepElapsed = sleep ? minutesFromWindowStart(now, sleep) : Infinity;
        const previousSleepElapsed = previousSleep ? minutesFromWindowStart(now, previousSleep) : Infinity;
        const sleepProfile = sleep && isWithinWindow(now, sleep) && currentSleepElapsed <= sleep.durationMinutes ? dayProfile
            : previousSleep && isWithinWindow(now, previousSleep) && previousSleepElapsed <= previousSleep.durationMinutes ? previousProfile : null;
        const activeSleep = sleepProfile ? getRoutineWindow(sleepProfile, 'sleep') : null;
        if (activeSleep && !completedTaskTypes.includes('SLEEP_NIGHT')) {
            const elapsed = minutesFromWindowStart(now, activeSleep);
            candidates.push({
                taskType: 'SLEEP_NIGHT', durationMinutes: Math.max(5, activeSleep.durationMinutes - elapsed), priority: activeSleep.priority,
                reason: 'ночной сон по режиму', createdBy: 'DAILY_ROUTINE', routineKind: 'sleep',
                routineDate: sleepProfile.date, targetLocation: 'petrogradka_home', window: activeSleep
            });
        }
        const meal = mealCandidate({ state, now, dayProfile, completedTaskTypes });
        if (meal) candidates.push(meal);
        return candidates.sort((a, b) => b.priority - a.priority || a.taskType.localeCompare(b.taskType));
    }

    static select(input = {}) { return this.candidates(input)[0] || null; }
}

export { mealCandidate };
