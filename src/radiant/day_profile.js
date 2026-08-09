const MSK = 'Europe/Moscow';

const WORKDAY = {
    dayType: 'WORKDAY',
    isWorkday: true,
    sleepWindow: { start: '23:30', end: '08:00', durationMinutes: 510, priority: 70, interruptible: true },
    mealWindows: {
        breakfast: { start: '08:00', end: '10:00', durationMinutes: 20, toleranceMinutes: 60, priority: 72 },
        lunch: { start: '12:30', end: '14:30', durationMinutes: 25, toleranceMinutes: 60, priority: 72 },
        dinner: { start: '18:30', end: '21:00', durationMinutes: 25, toleranceMinutes: 90, priority: 72 }
    },
    workWindows: [
        { start: '10:00', end: '12:30' },
        { start: '14:30', end: '18:30' }
    ],
    restWindows: [{ start: '21:00', end: '23:30' }]
};

const FRIDAY = {
    ...WORKDAY,
    dayType: 'FRIDAY',
    sleepWindow: { start: '00:30', end: '08:30', durationMinutes: 480, priority: 70, interruptible: true },
    restWindows: [{ start: '21:00', end: '00:30' }]
};

const SATURDAY = {
    dayType: 'SATURDAY',
    isWorkday: false,
    sleepWindow: { start: '00:30', end: '09:30', durationMinutes: 540, priority: 70, interruptible: true },
    mealWindows: {
        breakfast: { start: '09:30', end: '11:00', durationMinutes: 25, toleranceMinutes: 60, priority: 72 },
        lunch: { start: '13:00', end: '15:00', durationMinutes: 25, toleranceMinutes: 90, priority: 72 },
        dinner: { start: '18:30', end: '21:30', durationMinutes: 25, toleranceMinutes: 90, priority: 72 }
    },
    workWindows: [],
    restWindows: [{ start: '11:00', end: '13:00' }, { start: '15:00', end: '18:30' }, { start: '21:30', end: '00:30' }]
};

const SUNDAY = {
    dayType: 'SUNDAY',
    isWorkday: false,
    sleepWindow: { start: '23:00', end: '08:30', durationMinutes: 570, priority: 70, interruptible: true },
    mealWindows: {
        breakfast: { start: '08:30', end: '10:30', durationMinutes: 25, toleranceMinutes: 60, priority: 72 },
        lunch: { start: '12:30', end: '14:30', durationMinutes: 25, toleranceMinutes: 90, priority: 72 },
        dinner: { start: '18:00', end: '20:30', durationMinutes: 25, toleranceMinutes: 90, priority: 72 }
    },
    workWindows: [],
    restWindows: [{ start: '10:30', end: '12:30' }, { start: '14:30', end: '18:00' }, { start: '20:30', end: '23:00' }]
};

const clone = value => JSON.parse(JSON.stringify(value));

function partsAt(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MSK, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(date));
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function minuteOfDay(date) {
    const parts = partsAt(date);
    return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseMinute(value) {
    const [hour, minute] = String(value).split(':').map(Number);
    return hour * 60 + minute;
}

export function isWithinWindow(date, window) {
    const current = minuteOfDay(date);
    const start = parseMinute(window.start);
    const end = parseMinute(window.end);
    return start <= end ? current >= start && current < end : current >= start || current < end;
}

export function minutesFromWindowStart(date, window) {
    const current = minuteOfDay(date);
    const start = parseMinute(window.start);
    return current >= start ? current - start : current + 1440 - start;
}

export function getDayProfile(date = new Date()) {
    const parts = partsAt(date);
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
    const base = weekday === 5 ? FRIDAY : weekday === 6 ? SATURDAY : weekday === 7 ? SUNDAY : WORKDAY;
    const profile = clone(base);
    profile.weekday = weekday;
    profile.weekdayName = parts.weekday;
    profile.date = `${parts.year}-${parts.month}-${parts.day}`;
    profile.timeZone = MSK;
    profile.timeWindow = isWithinWindow(date, profile.sleepWindow)
        ? 'NIGHT_SLEEP'
        : Object.entries(profile.mealWindows).find(([, window]) => isWithinWindow(date, window))?.[0]?.toUpperCase() ||
          (profile.workWindows.some(window => isWithinWindow(date, window)) ? 'WORK' :
              profile.restWindows.some(window => isWithinWindow(date, window)) ? (profile.isWorkday ? 'EVENING' : 'WEEKEND_REST') : 'MORNING');
    return profile;
}

export function getRoutineWindow(profile, kind) {
    if (kind === 'sleep') return profile.sleepWindow;
    return profile.mealWindows?.[kind] || null;
}

export { MSK, minuteOfDay, parseMinute };
