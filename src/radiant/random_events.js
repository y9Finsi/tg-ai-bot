import { isWithinWindow } from './day_profile.js';

const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

export const RANDOM_EVENTS = Object.freeze([
    {
        id: 'INTERNET_OUTAGE',
        title: 'Пропал интернет',
        probability: 0.04,
        cooldownMinutes: 720,
        windows: [{ start: '10:00', end: '21:00' }],
        condition: ({ state, activeTask }) => Boolean(activeTask && ['WORK_LAPTOP', 'SMM_EDITS_REQUIRED'].includes(activeTask.taskType) && state.location_id === 'petrogradka_home'),
        consequences: { boredomDelta: 8, irritationDelta: 5, pauseMinutes: 20 },
        reason: 'Лера работала дома, но интернет временно пропал.'
    },
    {
        id: 'DELIVERY_DELAY',
        title: 'Задержалась доставка',
        probability: 0.03,
        cooldownMinutes: 1440,
        windows: [{ start: '12:00', end: '22:00' }],
        condition: ({ commitments }) => commitments.some(item => item.type === 'BUY_SUPPLIES' && item.status === 'IN_PROGRESS'),
        consequences: { boredomDelta: 5, pauseMinutes: 15 },
        reason: 'Доставка задержалась, планы пришлось немного подвинуть.'
    },
    {
        id: 'SUDDEN_LOW_ENERGY',
        title: 'Резко упала энергия',
        probability: 0.025,
        cooldownMinutes: 1440,
        windows: [{ start: '13:00', end: '20:00' }],
        condition: ({ state }) => Number(state.needs?.fatigue || 0) >= 45 && Number(state.needs?.hunger || 0) >= 35,
        consequences: { fatigueDelta: 10, pauseMinutes: 15 },
        reason: 'На фоне усталости и голода у Леры резко упала энергия.'
    },
    {
        id: 'CAFE_CLOSED',
        title: 'Кафе оказалось закрыто',
        probability: 0.025,
        cooldownMinutes: 1440,
        windows: [{ start: '08:00', end: '22:00' }],
        condition: ({ state, activeTask }) => Boolean(activeTask?.targetLocation === 'cafe_sloy' && state.location_id !== 'petrogradka_home'),
        consequences: { boredomDelta: 6, irritationDelta: 8, pauseMinutes: 20 },
        reason: 'Кафе оказалось закрыто, пришлось изменить планы.'
    },
    {
        id: 'TRANSPORT_DELAY',
        title: 'Задержался транспорт',
        probability: 0.035,
        cooldownMinutes: 360,
        windows: [{ start: '07:00', end: '22:00' }],
        condition: ({ activeTask }) => activeTask?.taskType === 'TRAVEL',
        consequences: { fatigueDelta: 4, irritationDelta: 6, pauseMinutes: 10 },
        reason: 'Дорога заняла немного больше времени.'
    },
    {
        id: 'UNEXPECTED_MESSAGE',
        title: 'Пришло неожиданное сообщение',
        probability: 0.02,
        cooldownMinutes: 480,
        windows: [{ start: '09:00', end: '23:00' }],
        condition: ({ commitments }) => commitments.length > 0,
        consequences: { boredomDelta: -4, irritationDelta: 2, pauseMinutes: 5 },
        reason: 'Пришло сообщение, которое ненадолго изменило внимание Леры.'
    }
]);

function hashUnit(input) {
    let hash = 2166136261;
    for (const char of String(input)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
}

function inAnyWindow(date, windows) {
    return !windows?.length || windows.some(window => isWithinWindow(date, window));
}

export function selectRandomEvent({ now = new Date(), state = {}, activeTask = null, commitments = [], dayProfile, history = {}, seed = 'lera', disabledIds = [] } = {}) {
    const candidates = RANDOM_EVENTS.filter(event => {
        if (disabledIds.includes(event.id)) return false;
        const lastAt = history[event.id] ? new Date(history[event.id]).getTime() : 0;
        const cooldownActive = lastAt && new Date(now).getTime() - lastAt < event.cooldownMinutes * 60000;
        return !cooldownActive && inAnyWindow(now, event.windows) && event.condition({ now, state, activeTask, commitments, dayProfile });
    });
    for (const event of candidates) {
        if (hashUnit(`${seed}:${event.id}:${new Date(now).toISOString().slice(0, 16)}`) < event.probability) return event;
    }
    return null;
}

export function applyRandomConsequences(state = {}, event) {
    if (!event) return state;
    const next = structuredClone(state);
    next.needs = { ...(next.needs || {}) };
    next.needs.boredom = clamp(Number(next.needs.boredom || 0) + Number(event.consequences?.boredomDelta || 0));
    next.needs.fatigue = clamp(Number(next.needs.fatigue || 0) + Number(event.consequences?.fatigueDelta || 0));
    next.physiology = { ...(next.physiology || {}) };
    next.physiology.irritation = clamp(Number(next.physiology.irritation || 0) + Number(event.consequences?.irritationDelta || 0));
    return next;
}

export { hashUnit };
