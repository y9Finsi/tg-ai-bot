import { runContinuousDay } from './day_runner.js';
import { ContextBuilder } from '../ai/context_builder.js';

const MSK = 'Europe/Moscow';

const fixtureState = () => ({
    location_id: 'petrogradka_home',
    needs: { hunger: 20, fatigue: 10, boredom: 30, horny: 40, hygiene: 90, bladder: 0 },
    physiology: { cycle_day: 3 },
    active_modifiers: [],
    wallet_rubles: 3820
});

const fixtureNpcs = () => ({
    nastya: { state_json: { drama_level: 90, cooldown_until: null } },
    max_client: { state_json: { deadline_urgency: 20, cooldown_until: null } }
});

function isoAt(start, minutes) {
    return new Date(new Date(start).getTime() + minutes * 60 * 1000).toISOString();
}

function displayTime(value) {
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: MSK, dateStyle: 'short', timeStyle: 'short'
    }).format(new Date(value));
}

function snapshotAt(day, atMinutes) {
    const at = new Date(new Date(day.start).getTime() + atMinutes * 60 * 1000);
    const facts = day.facts.filter(item => new Date(item.occurredAt || item.occurred_at) <= at);
    const consequences = day.consequences.filter(item => new Date(item.occurredAt || item.occurred_at) <= at);
    const commitments = day.commitments.filter(item => {
        const planned = item.plannedStart || item.dueAt || item.due_at;
        return !planned || new Date(planned) <= at;
    });
    const task = [...day.intervals].reverse().find(item => new Date(item.start) <= at && at < new Date(item.end));
    const locationFact = [...facts].reverse().find(item => item.type === 'TASK_COMPLETED' && item.payload?.locationId);
    return {
        state: { ...day.state, needs: { ...day.state.needs }, physiology: { ...day.state.physiology } },
        location: { name: locationFact?.payload?.locationId || day.state.location_id || 'Квартира на Петроградке' },
        activeTask: task ? { task_type: task.taskType, remaining_minutes: Math.max(0, Math.ceil((new Date(task.end) - at) / 60000)) } : null,
        transit: null,
        inventory: [],
        weather: { status: 'test', is_raining: false },
        mood: day.mood,
        willingness: { value: 70 },
        facts: facts.map(item => ({ occurred_at: item.occurredAt, event_type: item.type, payload: item.payload || {} })),
        commitments,
        missedCommitments: commitments.filter(item => item.status === 'MISSED'),
        observerDigests: [],
        user: { first_name: 'Тестовый пользователь' },
        currentTime: `${displayTime(at)} MSK`,
        consequences
    };
}

export function runTelegramDaySmoke({ start = new Date('2026-08-07T00:00:00+03:00'), runLlm = false, state = fixtureState(), npcStates = fixtureNpcs(), personality = { discipline: 70, sociability: 75, procrastination: 30, homebody: 40 }, seed = 'telegram-day-smoke' } = {}) {
    const day = runContinuousDay({
        start: new Date(start),
        state: structuredClone(state),
        npcStates: structuredClone(npcStates),
        weather: { is_raining: false, status: 'test' },
        personality,
        seed
    });
    const messages = [
        { atMinutes: 8 * 60 + 15, text: 'Доброе утро, как ты сегодня?', expected: 'morning' },
        { atMinutes: 16 * 60, text: 'Как прошла работа?', expected: 'work' },
        { atMinutes: 20 * 60 + 30, text: 'Что у тебя вечером?', expected: 'evening' },
        { atMinutes: 21 * 60, text: 'Ты опять всё бросила, иди разбирайся сама', expected: 'conflict' }
    ];
    const checkpoints = messages.map(message => {
        const snapshot = snapshotAt(day, message.atMinutes);
        const prompt = ContextBuilder.toPrompt(snapshot);
        return {
            at: isoAt(start, message.atMinutes),
            userText: message.text,
            expected: message.expected,
            prompt,
            facts: snapshot.facts,
            plans: snapshot.commitments,
            consequences: snapshot.consequences
        };
    });
    return { day, checkpoints, runLlm };
}

export { fixtureState, fixtureNpcs, snapshotAt };
