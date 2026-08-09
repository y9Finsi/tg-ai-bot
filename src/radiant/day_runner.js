import { calculatePassiveNeedDecay, checkNeedInterrupts, calculateMood } from './needs.js';
import { DailyRoutine } from './daily_routine.js';
import { UtilitySelector } from './utility_selector.js';
import { TASK_DEFINITIONS, applyTaskEffects } from './task_catalog.js';
import { NPCRadiantEngine } from './npc_radiant.js';
import { commitmentFromNpcEvent, dailyCommitmentTemplates, rankCommitments, commitmentStatusAt, COMMITMENT_STATUS } from './commitments.js';
import { buildCommitmentChain } from './commitment_planner.js';
import { selectRandomEvent, applyRandomConsequences } from './random_events.js';
import { normalizePersonality } from './personality.js';

const STEP_MINUTES = 5;
const addMinutes = (date, minutes) => new Date(new Date(date).getTime() + minutes * 60000);

export function runContinuousDay({ start, hours = 24, state, npcStates, weather = { is_raining: false, status: 'test' }, commitments = [], personality = {}, seed = 'lera-day' } = {}) {
    const world = structuredClone({ state, npcStates, commitments });
    const npcData = npcId => world.npcStates[npcId].state_json || world.npcStates[npcId];
    const facts = [], plans = [], consequences = [], intervals = [], randomEvents = [];
    world.state.personality = normalizePersonality(personality);
    const randomHistory = {};
    let active = null;
    let intervalStart = new Date(start);
    const completedRoutine = new Set();
    const duration = hours * 60;
    for (let minute = 0; minute < duration; minute += STEP_MINUTES) {
        const tickAt = addMinutes(start, minute);
        const npc = NPCRadiantEngine.processNpcTicks(world.npcStates, STEP_MINUTES, tickAt);
        world.npcStates = npc.updatedNpcs;
        for (const event of npc.events || []) {
            const fact = { type: event.type, occurredAt: tickAt.toISOString(), payload: event.payload, npcId: event.npcId, reason: event.reason };
            facts.push(fact);
            const commitment = commitmentFromNpcEvent({ ...event, sourceEventId: facts.length }, { date: DailyRoutine.profile(tickAt).date });
            if (commitment && !world.commitments.some(item => item.type === commitment.type && item.date === commitment.date)) world.commitments.push({ ...commitment, id: facts.length });
        }
        const profile = DailyRoutine.profile(tickAt);
        for (const template of dailyCommitmentTemplates({ profile, date: profile.date, maxUrgency: world.npcStates.max_client?.deadline_urgency || world.npcStates.max_client?.state_json?.deadline_urgency || 0, dramaLevel: world.npcStates.nastya?.drama_level || world.npcStates.nastya?.state_json?.drama_level || 0 })) {
            if (!world.commitments.some(item => item.type === template.type && item.date === template.date)) world.commitments.push({ ...template, id: `daily-${template.type}-${template.date}` });
        }
        for (const commitment of world.commitments) {
            const status = commitmentStatusAt(commitment, tickAt);
            if (status === COMMITMENT_STATUS.MISSED && commitment.status !== status) {
                commitment.status = status;
                consequences.push({ type: 'COMMITMENT_MISSED', commitmentId: commitment.id, title: commitment.title, occurredAt: tickAt.toISOString() });
                if (commitment.type === 'SOCIAL_MEETING') npcData('nastya').disappointment = Math.min(100, Number(npcData('nastya').disappointment || 0) + 20);
                if (commitment.type === 'WORK_DEADLINE') npcData('max_client').satisfaction = Math.max(0, Number(npcData('max_client').satisfaction || 75) - 20);
            }
        }
        const randomEvent = selectRandomEvent({ now: tickAt, state: world.state, activeTask: active, commitments: world.commitments, dayProfile: profile, history: randomHistory, seed });
        if (randomEvent) {
            randomHistory[randomEvent.id] = tickAt.toISOString();
            world.state = applyRandomConsequences(world.state, randomEvent);
            randomEvents.push({ id: randomEvent.id, title: randomEvent.title, occurredAt: tickAt.toISOString(), reason: randomEvent.reason });
            facts.push({ type: 'RANDOM_EVENT', occurredAt: tickAt.toISOString(), payload: { id: randomEvent.id, title: randomEvent.title, reason: randomEvent.reason } });
            consequences.push({ type: randomEvent.id, occurredAt: tickAt.toISOString(), payload: randomEvent.consequences });
        }
        const sleeping = active?.taskType === 'SLEEP_NIGHT';
        const decay = calculatePassiveNeedDecay(world.state.needs, world.state.physiology, world.state.active_modifiers, STEP_MINUTES, { sleeping });
        world.state.needs = decay.needs; world.state.physiology = decay.physiology; world.state.active_modifiers = decay.activeModifiers;
        if (!active) {
            const interrupt = checkNeedInterrupts(world.state.needs).find(item => !sleeping || item.taskType === 'GO_TO_BATHROOM');
            const routine = DailyRoutine.select({ now: tickAt, state: world.state, completedTaskTypes: [...completedRoutine] });
            const commitment = rankCommitments(world.commitments, tickAt).find(item => new Date(tickAt) >= new Date(item.plannedStart || tickAt));
            const selected = interrupt || routine || (commitment ? { taskType: 'COMMITMENT', durationMinutes: commitment.durationMinutes, targetLocation: commitment.targetLocation, commitment } : UtilitySelector.select({ state: world.state, npc: world.npcStates, now: tickAt, personality: world.state.personality }));
            active = { taskType: selected.taskType, remaining: selected.durationMinutes || TASK_DEFINITIONS[selected.taskType]?.durationMinutes || 30, targetLocation: selected.targetLocation || world.state.location_id || 'petrogradka_home', commitment: selected.commitment || null };
            intervalStart = tickAt;
            if (active.taskType === 'COMMITMENT') {
                active.chain = buildCommitmentChain(active.commitment, { state: world.state, weather, inventory: [] });
                active.chainIndex = 0;
                active.taskType = active.chain[0]?.taskType || 'IDLE_HOME_REST';
                active.remaining = active.chain[0]?.durationMinutes || 30;
                active.targetLocation = active.chain[0]?.targetLocation || world.state.location_id;
                active.commitment.status = COMMITMENT_STATUS.IN_PROGRESS;
                plans.push({ type: active.commitment.type, title: active.commitment.title, dueAt: active.commitment.dueAt, targetLocation: active.commitment.targetLocation });
            }
        }
        active.remaining -= STEP_MINUTES;
        if (active.remaining <= 0) {
            const taskType = active.taskType;
            if (taskType === 'TRAVEL') world.state.location_id = active.targetLocation;
            if (taskType.startsWith('EAT_') && taskType !== 'EAT_FOOD_HOME') world.state.needs = applyTaskEffects(world.state.needs, 'EAT_FOOD_HOME', { hungerRestore: 50 });
            else world.state.needs = applyTaskEffects(world.state.needs, taskType, { hungerRestore: 50 });
            const end = addMinutes(tickAt, STEP_MINUTES);
            intervals.push({ start: intervalStart, end, taskType, location: world.state.location_id, commitmentId: active.commitment?.id || null });
            facts.push({ type: 'TASK_COMPLETED', occurredAt: end.toISOString(), payload: { taskType, locationId: world.state.location_id, commitmentId: active.commitment?.id || null } });
            if (active.commitment) {
                const chain = active.chain;
                if (active.chainIndex < chain.length - 1) {
                    active.chainIndex += 1; active.taskType = chain[active.chainIndex].taskType; active.remaining = chain[active.chainIndex].durationMinutes; active.targetLocation = chain[active.chainIndex].targetLocation || world.state.location_id; intervalStart = end; continue;
                }
                active.commitment.status = COMMITMENT_STATUS.COMPLETED;
                consequences.push({ type: active.commitment.type === 'SOCIAL_MEETING' ? 'SOCIAL_MEETING_COMPLETED' : 'WORK_RESULT_ACCEPTED', commitmentId: active.commitment.id, occurredAt: end.toISOString() });
                if (active.commitment.type === 'SOCIAL_MEETING') npcData('nastya').disappointment = Math.max(0, Number(npcData('nastya').disappointment || 0) - 20);
                if (active.commitment.type === 'WORK_DEADLINE') npcData('max_client').satisfaction = Math.min(100, Number(npcData('max_client').satisfaction || 75) + 10);
            } else if (active.taskType.startsWith('EAT_') || active.taskType === 'SLEEP_NIGHT') completedRoutine.add(active.taskType);
            active = null;
        }
    }
    return { start: new Date(start), end: addMinutes(start, duration), state: world.state, npcStates: world.npcStates, commitments: world.commitments, facts, plans, consequences, intervals, randomEvents, personality: world.state.personality, mood: calculateMood(world.state) };
}
