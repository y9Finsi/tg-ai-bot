import { StateRepository } from '../db/state_repository.js';
import { calculatePassiveNeedDecay, checkNeedInterrupts, cycleDayFromDate } from '../radiant/needs.js';
import { NPCRadiantEngine } from '../radiant/npc_radiant.js';
import { GOAPPlanner } from '../radiant/goap_planner.js';
import { WeatherService } from '../radiant/weather_service.js';
import { ForecastService } from '../radiant/forecast_service.js';
import { hasRainResistantEquipment } from '../radiant/inventory.js';
import { generateCompletion } from '../ai/llm_client.js';
import { UtilitySelector } from '../radiant/utility_selector.js';
import { DailyRoutine } from '../radiant/daily_routine.js';
import { dailyCommitmentTemplates, rankCommitments, commitmentStatusAt, commitmentFromNpcEvent, COMMITMENT_STATUS } from '../radiant/commitments.js';
import { buildCommitmentChain } from '../radiant/commitment_planner.js';
import { selectRandomEvent, applyRandomConsequences, RANDOM_EVENTS } from '../radiant/random_events.js';
import { normalizePersonality } from '../radiant/personality.js';
import { getSetting, getSettingsByPrefix } from '../db/database.js';
import { applyTaskEffects, FOOD_PRICE_RUBLES } from '../radiant/task_catalog.js';
import { randomUUID } from 'node:crypto';
import { memoryRepository } from '../memory/memory_repository.js';

const RANDOM_EVENT_IDS = RANDOM_EVENTS.map(event => event.id);

const STEP_MINUTES = 5;
const MAX_CATCHUP_STEPS = 12;
const MAX_BACKLOG_MINUTES = 24 * 60;

function snapshotState(state) {
    return {
        location_id: state?.location_id || 'petrogradka_home',
        needs: { ...(state?.needs || {}) },
        physiology: { ...(state?.physiology || {}) },
        active_modifiers: [...(state?.active_modifiers || [])],
        wallet_rubles: Number(state?.wallet_rubles || 0),
        wallet_stars: Number(state?.wallet_stars || 0)
    };
}

function addMinutes(date, minutes) {
    return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}

function safeScope(value) {
    return String(value || 'SYSTEM').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 240);
}

export class SimulationWorker {
    static isRunning = false;
    static timer = null;
    static observerRunning = false;
    static workerInstanceId = randomUUID();

    static async tick({ manual = false, forceChaos = null, bootstrap = false } = {}) {
        if (this.isRunning) return { skipped: true };
        this.isRunning = true;
        try {
            const now = new Date();
            const state = await StateRepository.getState();
            WeatherService.syncOverride(state?.weather_override);
            const cursor = new Date(state?.last_tick_at || now);
            const elapsed = Math.max(0, Math.floor((now.getTime() - cursor.getTime()) / 60000));
            let backlog = Math.min(elapsed, MAX_BACKLOG_MINUTES);
            const steps = manual || bootstrap ? 1 : Math.min(MAX_CATCHUP_STEPS, Math.floor(backlog / STEP_MINUTES));
            if (!manual && !bootstrap && steps <= 0) return { skipped: false, steps: 0, elapsedMinutes: elapsed, cursor: cursor.toISOString() };

            let replayCursor = cursor;
            if (!manual && elapsed > MAX_BACKLOG_MINUTES) {
                // Discard time older than the supported replay window once, then
                // advance the cursor normally over subsequent worker runs. Without
                // this anchor every run would jump back to the newest 24-hour slice.
                replayCursor = addMinutes(now, -MAX_BACKLOG_MINUTES);
                await StateRepository.withTransaction(async client => {
                    await StateRepository.getLockedState(client);
                    await StateRepository.updateState(client, { lastTickAt: replayCursor });
                });
                backlog = MAX_BACKLOG_MINUTES;
            }

            const weather = await WeatherService.getSnapshot();
            const results = [];
            // Replay the retained window from its oldest point. The previous
            // implementation jumped straight to the newest sub-tick, which
            // made needs catch up but left the queue far behind.
            let stepCursor = manual || bootstrap
                ? cursor
                : replayCursor;
            for (let index = 0; index < steps; index += 1) {
                stepCursor = addMinutes(stepCursor, STEP_MINUTES);
                // A live weather snapshot must not be applied retroactively to
                // historical catch-up steps. Those steps continue physically,
                // but weather effects are unavailable for them.
                const isLiveStep = manual || bootstrap || stepCursor.getTime() >= now.getTime() - STEP_MINUTES * 60 * 1000;
                const stepWeather = isLiveStep
                    ? weather
                    : { ...weather, is_raining: null, status: 'unavailable', historical: true };
                results.push(await this.runSubTick({ tickAt: stepCursor, weather: stepWeather, forceChaos: index === steps - 1 ? forceChaos : null }));
            }

            if (!manual && elapsed > MAX_BACKLOG_MINUTES) {
                await StateRepository.withTransaction(async client => {
                    await StateRepository.addRationale(client, {
                        category: 'CATCHUP_TRUNCATED',
                        title: 'Backlog ограничен 24 часами',
                        explanation: 'Слишком старое время не проигрывается бесконечно; движок продолжил с безопасного окна.',
                        payload: { elapsedMinutes: elapsed, maxBacklogMinutes: MAX_BACKLOG_MINUTES }
                    });
                });
            }
            const observerIds = results.flatMap(result => result.observerEventIds || []);
            const observerEligible = results.some(result => result.observerEligible);
            if (observerIds.length) setImmediate(() => this.maybeTriggerObserver(observerIds, observerEligible).catch(error => console.error('Observer batch error:', error.message)));
            await StateRepository.withTransaction(async client => {
                await StateRepository.getLockedState(client);
                await StateRepository.recordWorkerSuccess(client, {
                    durationMs: Date.now() - now.getTime(),
                    workerInstanceId: this.workerInstanceId,
                    tickAt: results.at(-1)?.tickAt || now
                });
            });
            return { skipped: false, steps, elapsedMinutes: elapsed, weather, results };
        } catch (error) {
            console.error('SimulationWorker tick error:', error.message);
            await StateRepository.recordWorkerFailure({ error, workerInstanceId: this.workerInstanceId }).catch(() => null);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    static async runManualTick({ forceChaos = null } = {}) {
        return this.tick({ manual: true, forceChaos });
    }

    static async runSubTick({ tickAt, weather, forceChaos = null }) {
        const result = await StateRepository.withTransaction(async client => {
            const state = await StateRepository.getLockedState(client);
            const before = snapshotState(state);
            const rationale = [];
            const queueRepair = await StateRepository.repairQueueAnomalies(client);
            if (queueRepair.cancelled > 0) {
                rationale.push({
                    category: 'QUEUE_REPAIR',
                    title: 'Удалены дубли активных emergency roots',
                    explanation: `Отменено ${queueRepair.cancelled} старых дублирующих задач; оставлена самая новая root-цепочка.`,
                    payload: queueRepair
                });
            }
            const activeTaskBeforeDecay = await StateRepository.getExecutableTask(client);
            const effectiveCycleDay = state.cycle_anchor_date
                ? cycleDayFromDate(state.cycle_anchor_date, tickAt)
                : Number(state.physiology?.cycle_day || 3);
            const decay = calculatePassiveNeedDecay(
                state.needs,
                { ...(state.physiology || {}), cycle_day: effectiveCycleDay },
                state.active_modifiers,
                STEP_MINUTES,
                { sleeping: activeTaskBeforeDecay?.task_type === 'SLEEP_NIGHT' }
            );
            const needs = decay.needs;
            const physiology = { ...decay.physiology, cycle_day: effectiveCycleDay };
            const modifiers = [...decay.activeModifiers];
            const personality = normalizePersonality(state.personality || {});
            rationale.push({ category: 'NEEDS_DECAY', title: `Декей за ${STEP_MINUTES} мин`, explanation: 'Один физический sub-tick.', payload: { tickAt, needs, physiology, modifiers } });

            const [inventory, nastyaDb, maxDb] = await Promise.all([
                StateRepository.getInventory(client),
                StateRepository.getNpcState(client, 'nastya'),
                StateRepository.getNpcState(client, 'max_client')
            ]);
            const npc = NPCRadiantEngine.processNpcTicks({ nastya: nastyaDb, max_client: maxDb }, STEP_MINUTES, tickAt);
            await StateRepository.updateNpcState(client, 'nastya', npc.updatedNpcs.nastya);
            await StateRepository.updateNpcState(client, 'max_client', npc.updatedNpcs.max_client);

            const dayProfile = DailyRoutine.profile(tickAt);
            const date = dayProfile.date;

            for (const event of npc.events || []) {
                const npcFact = await StateRepository.addFactualEvent(client, {
                    eventType: event.type, importance: 2, payload: { npcId: event.npcId, reason: event.reason, ...(event.payload || {}) },
                    beforeSnapshot: before, afterSnapshot: before,
                    idempotencyKey: `npc:${event.npcId}:${event.type}:${String(tickAt.toISOString()).slice(0, 16)}`
                });
                const npcCommitment = commitmentFromNpcEvent({ ...event, sourceEventId: npcFact?.id }, { date });
                if (npcCommitment) await StateRepository.upsertCommitment(client, {
                    ...npcCommitment,
                    commitmentKey: `${npcCommitment.origin}:${npcCommitment.type}:${date}`
                });
            }

            const templates = dailyCommitmentTemplates({ profile: dayProfile, date,
                maxUrgency: maxDb?.state_json?.deadline_urgency || maxDb?.deadline_urgency || 0,
                dramaLevel: nastyaDb?.state_json?.drama_level || nastyaDb?.drama_level || 0 });
            for (const template of templates) {
                await StateRepository.upsertCommitment(client, { ...template, commitmentKey: `${template.type}:${date}` });
            }
            let commitments = await StateRepository.getCommitments(client, date);
            for (const commitment of commitments) {
                const nextStatus = commitmentStatusAt({ ...commitment, dueAt: commitment.due_at, status: commitment.status }, tickAt);
                if (nextStatus === COMMITMENT_STATUS.MISSED && commitment.status !== nextStatus) {
                    await StateRepository.updateCommitmentStatus(client, commitment.id, nextStatus);
                    await StateRepository.addFactualEvent(client, {
                        eventType: 'COMMITMENT_MISSED', importance: 2,
                        payload: { commitmentId: commitment.id, commitmentType: commitment.type, consequence: commitment.consequence_on_miss },
                        beforeSnapshot: before, afterSnapshot: before, idempotencyKey: `commitment-missed:${commitment.id}:${date}`
                    });
                }
            }
            commitments = await StateRepository.getCommitments(client, date);

            let observerEventIds = [];
            let observerEligible = false;
            const needInterrupts = checkNeedInterrupts(needs);
            const sleepInterrupts = activeTaskBeforeDecay?.task_type === 'SLEEP_NIGHT'
                ? needInterrupts.filter(interrupt => interrupt.taskType === 'GO_TO_BATHROOM')
                : needInterrupts;
            const interrupts = [...npc.interrupts, ...sleepInterrupts];
            const randomHistory = await StateRepository.getRandomEventHistory(client, new Date(tickAt.getTime() - 48 * 3600000));
            const disabledRandomEvents = [];
            const randomEventSettings = await getSettingsByPrefix('random_event_enabled_');
            for (const eventId of RANDOM_EVENT_IDS) {
                if (randomEventSettings[`random_event_enabled_${eventId}`] === 'false') disabledRandomEvents.push(eventId);
            }
            const randomEvent = selectRandomEvent({
                now: tickAt,
                state: { ...state, needs, physiology, active_modifiers: modifiers },
                activeTask: activeTaskBeforeDecay ? { taskType: activeTaskBeforeDecay.task_type, targetLocation: activeTaskBeforeDecay.target_location } : null,
                commitments,
                dayProfile,
                history: randomHistory,
                seed: state.random_seed || 'lera-production'
                , disabledIds: disabledRandomEvents
            });
            if (randomEvent) {
                const randomState = applyRandomConsequences({ needs, physiology, active_modifiers: modifiers }, randomEvent);
                Object.assign(needs, randomState.needs);
                Object.assign(physiology, randomState.physiology);
                const randomFact = await StateRepository.addFactualEvent(client, {
                    eventType: 'RANDOM_EVENT', importance: 1,
                    payload: { id: randomEvent.id, title: randomEvent.title, reason: randomEvent.reason, consequences: randomEvent.consequences },
                    beforeSnapshot: before, afterSnapshot: { ...before, needs, physiology, active_modifiers: modifiers },
                    idempotencyKey: `random:${randomEvent.id}:${String(tickAt.toISOString()).slice(0, 16)}`
                });
                if (randomFact) rationale.push({ category: 'RANDOM_EVENT', title: randomEvent.title, explanation: randomEvent.reason, payload: randomEvent.consequences });
            }
            for (const interrupt of interrupts) {
                const scope = `root:${safeScope(interrupt.taskType)}`;
                const queued = await StateRepository.enqueueTask(client, {
                    ...interrupt,
                    activeScopeKey: scope,
                    idempotencyKey: `${scope}:${String(tickAt.toISOString()).slice(0, 16)}`,
                    createdBy: interrupt.createdBy,
                    rootTaskId: null
                });
                if (queued.created) {
                    await StateRepository.pauseActiveTasksFor(client, queued.task.id);
                    const interruptFact = await StateRepository.addFactualEvent(client, {
                        eventType: 'INTERRUPT_ACCEPTED', taskId: queued.task.id, rootTaskId: queued.task.root_task_id,
                        importance: Math.max(2, Number(queued.task.importance || 1)),
                        payload: { taskType: queued.task.task_type, createdBy: queued.task.created_by },
                        beforeSnapshot: before, afterSnapshot: before,
                        idempotencyKey: `interrupt:${queued.task.id}`
                    });
                    if (interruptFact) observerEventIds.push(interruptFact.id);
                    observerEligible = true;
                    rationale.push({ category: 'INTERRUPT', title: `Прерывание ${interrupt.taskType}`, explanation: `Добавлено ${interrupt.createdBy}; существующая активная задача поставлена на паузу.`, payload: { interrupt: queued.task } });
                }
            }

            let executable = await StateRepository.getExecutableTask(client);
            const displayedQueue = await StateRepository.getQueue(client);
            const hasRuntimeTask = displayedQueue.some(task => ['PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY'].includes(task.status));
            if (!executable && !hasRuntimeTask) {
                const selectorState = { ...state, needs, physiology, active_modifiers: modifiers };
                const routineCandidates = DailyRoutine.candidates({ state: selectorState, now: tickAt, dayProfile });
                const availableRoutine = [];
                for (const candidate of routineCandidates) {
                    const alreadyDone = candidate.routineKind === 'sleep'
                        ? await StateRepository.hasRoutineFact(client, candidate.taskType, candidate.routineDate)
                        : await StateRepository.hasRoutineKindFact(client, candidate.routineKind, candidate.routineDate);
                    if (!alreadyDone) availableRoutine.push(candidate);
                }
                const ranked = rankCommitments(commitments.map(row => ({ ...row, dueAt: row.due_at, plannedStart: row.planned_start, durationMinutes: row.duration_minutes, preparationMinutes: row.preparation_minutes, targetLocation: row.target_location })), tickAt);
                const commitment = ranked.find(item => new Date(tickAt) >= new Date(item.plannedStart || tickAt));
                let selected = availableRoutine[0] || (commitment ? {
                    taskType: 'COMMITMENT', durationMinutes: commitment.durationMinutes, priority: commitment.computedPriority,
                    reason: `commitment: ${commitment.title}`, createdBy: 'COMMITMENT_PLANNER', targetLocation: commitment.targetLocation,
                    commitmentId: commitment.id, commitment
                } : null) || UtilitySelector.select({
                    state: selectorState,
                    npc: { nastya: nastyaDb, max_client: maxDb },
                    now: tickAt,
                    dayProfile,
                    timeWindow: dayProfile.timeWindow,
                    personality,
                    routineCandidates: availableRoutine
                });
                if (!availableRoutine.length && await StateRepository.hasRecentTaskFact(client, selected.taskType, new Date(tickAt.getTime() - 30 * 60 * 1000))) {
                    selected = UtilitySelector.select({ state: selectorState, npc: { nastya: nastyaDb, max_client: maxDb }, now: tickAt, dayProfile, timeWindow: dayProfile.timeWindow, excludedTaskTypes: [selected.taskType] });
                }
                const selectedTaskContext = `${selected.taskType} ${selected.reason || ''}`.trim();
                const precedents = await memoryRepository.getSimulationPrecedents(
                    `${selectedTaskContext} ${tickAt.toISOString()}`,
                    { userId: '0', limit: 5 }
                ).catch(error => {
                    console.warn('[SIMULATION PRECEDENTS ERROR]:', error.message);
                    return [];
                });
                const precedentIds = precedents.map(item => String(item.id)).filter(Boolean);
                const queued = await StateRepository.enqueueTask(client, {
                    taskType: selected.taskType,
                    targetLocation: selected.targetLocation || 'petrogradka_home',
                    durationMinutes: selected.durationMinutes,
                    priority: selected.priority,
                    createdBy: selected.createdBy || 'UTILITY_SELECTOR',
                    activeScopeKey: selected.routineDate ? `routine:${selected.routineKind}:${selected.routineDate}` : `utility:${selected.taskType}`,
                    idempotencyKey: selected.routineDate ? `routine:${selected.routineKind}:${selected.routineDate}` : `utility:${selected.taskType}:${String(tickAt.toISOString()).slice(0, 16)}`,
                    result: selected.routineDate ? { routineDate: selected.routineDate, routineKind: selected.routineKind } : {}
                });
                if (selected.commitmentId) {
                    await StateRepository.updateCommitmentStatus(client, selected.commitmentId, COMMITMENT_STATUS.IN_PROGRESS);
                    queued.task.result = { ...(queued.task.result || {}), commitmentId: selected.commitmentId };
                    await client.query('UPDATE sim_queue SET result = $2::jsonb WHERE id = $1', [queued.task.id, JSON.stringify(queued.task.result)]);
                }
                executable = queued.task;
                const decisionStrategy = 'utility_selector_plus_memory';
                rationale.push({
                    category: selected.routineDate ? 'DAILY_ROUTINE' : 'UTILITY_SELECTOR',
                    title: `Выбрана цель ${selected.taskType}`,
                    explanation: selected.reason,
                    payload: {
                        selected,
                        dayProfile,
                        strategy: decisionStrategy,
                        precedentIds,
                        precedents,
                        candidates: UtilitySelector.candidates({
                            state: selectorState,
                            npc: { nastya: nastyaDb, max_client: maxDb },
                            now: tickAt
                        })
                    }
                });
                memoryRepository.createFact({
                    userId: '0',
                    type: 'DECISION_TRACE',
                    payload: {
                        text: `Выбрана задача ${selected.taskType}: ${selected.reason || 'без пояснения'}`,
                        selectedTaskType: selected.taskType,
                        precedentIds,
                        precedents: precedents.slice(0, 5),
                        strategy: decisionStrategy
                    },
                    observedAt: tickAt,
                    confidence: 0.8,
                    importance: 55,
                    provenance: {
                        source: 'simulation_worker',
                        strategy: decisionStrategy,
                        tickAt: tickAt.toISOString()
                    },
                    idempotencyKey: `simulation:decision:${tickAt.toISOString()}`
                }).catch(error => {
                    console.warn('[SIMULATION DECISION TRACE ERROR]:', error.message);
                });
            }

            if (executable?.status === 'PENDING' && !executable.dependencies_expanded_at) {
                const allowAskNastya = !(await StateRepository.hasRecentTaskFact(client, 'ASK_NASTYA_FOR_FOOD', new Date(tickAt.getTime() - 6 * 60 * 60 * 1000)));
                const commitment = executable.result?.commitmentId ? commitments.find(item => Number(item.id) === Number(executable.result.commitmentId)) : null;
                const subtasks = executable.task_type === 'COMMITMENT'
                    ? buildCommitmentChain({ ...commitment, dueAt: commitment?.due_at, plannedStart: commitment?.planned_start, durationMinutes: commitment?.duration_minutes, preparationMinutes: commitment?.preparation_minutes, targetLocation: commitment?.target_location, id: commitment?.id }, { state: { ...state, needs, physiology, active_modifiers: modifiers }, inventory, weather })
                    : GOAPPlanner.resolveGoalDependencies({ goalTaskType: executable.task_type, state: { ...state, needs, physiology, active_modifiers: modifiers }, inventory, weather, allowAskNastya });
                if (subtasks.length > 0) {
                    await StateRepository.markDependenciesExpanded(client, executable.id);
                    let previousChildId = null;
                    for (let index = 0; index < subtasks.length; index += 1) {
                        const subtask = subtasks[index];
                        const child = await StateRepository.enqueueTask(client, {
                            ...subtask,
                            parentTaskId: executable.id,
                            rootTaskId: executable.root_task_id || executable.id,
                            createdBy: 'GOAP',
                            dependencyOrder: index,
                            dependsOnTaskId: previousChildId,
                            idempotencyKey: `goap:${executable.id}:${index}`,
                            activeScopeKey: `goap:${executable.id}:${index}`
                            ,result: { ...(subtask.result || {}), ...(commitment ? { commitmentId: commitment.id } : {}) }
                        });
                        previousChildId = child.task.id;
                    }
                    rationale.push({ category: 'GOAP_PLANNER', title: `Раскрыта цель ${executable.task_type}`, explanation: `Dependency-chain создана один раз; parent ждёт дочерние задачи.`, payload: { taskId: executable.id, subtasks } });
                    executable = null;
                }
            }

            if (executable) {
                if (executable.task_type !== 'TRAVEL') {
                    const activeTransit = await StateRepository.getActiveTransitTask(client);
                    if (activeTransit && activeTransit.id !== executable.id) {
                        const updatedTransit = await StateRepository.advanceTopTaskProgress(client, activeTransit.id, STEP_MINUTES);
                        if (updatedTransit && updatedTransit.status === 'COMPLETED') {
                            state.location_id = updatedTransit.target_location;
                            const factual = await StateRepository.addFactualEvent(client, {
                                eventType: 'TASK_COMPLETED', taskId: updatedTransit.id, rootTaskId: updatedTransit.root_task_id, importance: 1,
                                payload: { taskType: 'TRAVEL', locationId: state.location_id, worldEffects: [], status: 'COMPLETED' },
                                beforeSnapshot: before, afterSnapshot: { ...before, location_id: state.location_id, needs, physiology, active_modifiers: modifiers },
                                idempotencyKey: `task-completed:${updatedTransit.id}`
                            });
                            if (factual) observerEventIds.push(factual.id);
                            await StateRepository.resumeReadyParents(client);
                        }
                    }
                }
                const updated = await StateRepository.advanceTopTaskProgress(client, executable.id, STEP_MINUTES);
                if (!updated) {
                    const currentTask = await StateRepository.getTaskById(client, executable.id);
                    rationale.push({
                        category: 'TASK_ADVANCE_SKIPPED',
                        title: `Продвижение задачи ${executable.id} пропущено`,
                        explanation: `Задача не продвинута в этом тике (текущий статус: ${currentTask?.status || 'DELETED'}).`,
                        payload: { taskId: executable.id, previousStatus: executable.status, currentStatus: currentTask?.status || null }
                    });
                    executable = null;
                }
                if (updated) {
                    if (updated.task_type === 'TRAVEL' && weather?.is_raining === true && !hasRainResistantEquipment(inventory)) {
                    physiology.irritation = Math.min(100, Number(physiology.irritation || 0) + 10);
                    if (!modifiers.includes('WET_CLOTHES')) modifiers.push('WET_CLOTHES');
                    const rainEvent = await StateRepository.addFactualEvent(client, {
                        eventType: 'WEATHER_EFFECT', taskId: updated.id, rootTaskId: updated.root_task_id, importance: 2,
                        payload: { weather, effect: 'WET_CLOTHES', irritationDelta: 10 },
                        beforeSnapshot: before, afterSnapshot: { ...before, active_modifiers: modifiers },
                        idempotencyKey: `weather:${updated.id}:${updated.progress_percent}`
                    });
                    if (rainEvent) {
                        observerEventIds.push(rainEvent.id);
                    }
                    rationale.push({ category: 'WEATHER_EFFECT', title: 'Дождь во время пути', explanation: 'Нет rain_resist: irritation +10, WET_CLOTHES активирован.', payload: { taskId: updated.id, weather } });
                }

                if (updated.status === 'COMPLETED') {
                    const worldEffects = await this.applyTaskWorldEffects(client, updated);
                    const failedEffect = worldEffects.find(effect => effect.type === 'failed');
                    if (failedEffect) {
                        const failed = await client.query(`
                            UPDATE sim_queue
                            SET status = 'FAILED', result = $2::jsonb, updated_at = NOW(), completed_at = NOW()
                            WHERE id = $1
                            RETURNING *
                        `, [updated.id, JSON.stringify({ reason: failedEffect.reason })]);
                        updated.status = failed.rows[0]?.status || 'FAILED';
                        await StateRepository.failDependencyParents(client, updated.id, failedEffect.reason);
                    }
                    const isDependencyRoot = Boolean(updated.dependencies_expanded_at);
                    const nextNeeds = updated.status === 'FAILED' || isDependencyRoot
                        ? needs
                        : applyTaskEffects(needs, updated.task_type, { hungerRestore: worldEffects.find(effect => effect.type === 'consumed')?.properties?.hunger_restore });
                    Object.assign(needs, nextNeeds);
                    if (updated.task_type === 'TRAVEL' && updated.status === 'COMPLETED') state.location_id = updated.target_location;
                    if (updated.task_type === 'SHOWER_HOME' && updated.status === 'COMPLETED') {
                        const wetIndex = modifiers.indexOf('WET_CLOTHES');
                        if (wetIndex >= 0) modifiers.splice(wetIndex, 1);
                    }
                    const routineProfile = DailyRoutine.profile(tickAt);
                    const routineCandidate = DailyRoutine.candidates({ now: tickAt, state: { needs, physiology, active_modifiers: modifiers } }).find(candidate => candidate.routineKind !== 'sleep');
                    const factual = await StateRepository.addFactualEvent(client, {
                        eventType: updated.status === 'FAILED' ? 'TASK_FAILED' : 'TASK_COMPLETED', taskId: updated.id, rootTaskId: updated.root_task_id, importance: Math.max(Number(updated.importance || 1), updated.status === 'FAILED' ? 2 : 1),
                        payload: { taskType: updated.task_type, locationId: state.location_id, worldEffects, dependencyRoot: isDependencyRoot, status: updated.status,
                            ...(updated.result?.routineDate ? { routineDate: updated.result.routineDate, routineKind: updated.result.routineKind } : {}),
                            ...(updated.task_type === 'EMERGENCY_EAT' && routineCandidate ? { routineDate: routineProfile.date, routineKind: routineCandidate.routineKind } : {}) },
                        beforeSnapshot: before,
                        afterSnapshot: { ...before, location_id: state.location_id, needs, physiology, active_modifiers: modifiers },
                        idempotencyKey: `task-completed:${updated.id}`
                    });
                    if (factual) observerEventIds.push(factual.id);
                    await StateRepository.addDiaryEntry(client, `FACT ${updated.task_type} ${updated.status.toLowerCase()} at ${state.location_id}`);
                    if (isDependencyRoot && updated.status === 'COMPLETED') {
                        await client.query(`
                            UPDATE sim_queue SET status = 'COMPLETED', remaining_minutes = 0, progress_percent = 100, updated_at = NOW(), completed_at = NOW()
                            WHERE id = $1 AND status = 'PENDING'
                        `, [updated.id]);
                    }
                    const commitmentAction = ['WORK_LAPTOP', 'SOCIAL_NASTYA', 'PERSONAL_TASK'].includes(updated.task_type);
                    if (updated.result?.commitmentId && updated.status === 'COMPLETED' && commitmentAction) await StateRepository.updateCommitmentStatus(client, updated.result.commitmentId, COMMITMENT_STATUS.COMPLETED);
                    await StateRepository.resumeReadyParents(client);
                    const completedParents = updated.status === 'COMPLETED'
                        ? await StateRepository.completeReadyDependencyParents(client)
                        : [];
                    for (const parent of completedParents) {
                        const parentFact = await StateRepository.addFactualEvent(client, {
                            eventType: 'ROOT_TASK_COMPLETED', taskId: parent.id, rootTaskId: parent.root_task_id || parent.id,
                            importance: Math.max(2, Number(parent.importance || 1)),
                            payload: { taskType: parent.task_type, dependencyChain: true, ...(parent.result?.routineDate ? { routineDate: parent.result.routineDate, routineKind: parent.result.routineKind } : {}) },
                            beforeSnapshot: before,
                            afterSnapshot: { ...before, location_id: state.location_id, needs, physiology, active_modifiers: modifiers },
                            idempotencyKey: `root-completed:${parent.id}`
                        });
                        if (parentFact) observerEventIds.push(parentFact.id);
                        observerEligible = true;
                        // Resume a task paused by this root only after the whole
                        // dependency chain has completed, not after its last child
                        // happens to finish.
                        await StateRepository.resumePausedTasks(client, parent.id);
                    }
                    await StateRepository.resumePausedTasks(client, updated.id);
                    observerEligible = observerEligible || !updated.parent_task_id || Number(updated.importance || 1) >= 2;
                    rationale.push({ category: 'TASK_EFFECTS', title: `Завершена ${updated.task_type}`, explanation: 'Применены типизированные физические последствия.', payload: { taskId: updated.id, worldEffects, dependencyRoot: isDependencyRoot } });
                }
            }
        }

            if (forceChaos) {
                rationale.push({ category: 'FORCED_CHAOS', title: 'Forced chaos применён в текущем тике', explanation: String(forceChaos), payload: { forceChaos } });
            }

            await StateRepository.updateState(client, {
                locationId: state.location_id,
                needs,
                physiology,
                activeModifiers: modifiers,
                lastTickAt: tickAt,
                cycleAnchorDate: state.cycle_anchor_date,
                replaceNeeds: true,
                replacePhysiology: true
            });

            const current = await StateRepository.getLockedState(client);
            const forecast = await StateRepository.getLatestForecast(ForecastService.dateFor(tickAt), client);
            const significant = interrupts.length > 0 || observerEligible || executable?.status === 'COMPLETED';
            const tickHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(tickAt));
            if ((forecast ? significant : tickHour >= 6)) {
                const nodes = ForecastService.buildNodes({ state: current, weather, npc: { nastya: nastyaDb, max_client: maxDb }, now: tickAt });
                const edges = ForecastService.edgesFor(nodes);
                await StateRepository.createForecastVersion(client, {
                    date: ForecastService.dateFor(tickAt), source: forecast ? 'WORKER_MUTATION' : 'MORNING_GENERATOR',
                    reason: forecast ? (interrupts.length ? 'INTERRUPT' : 'TASK_COMPLETED') : 'INITIAL_FORECAST',
                    nodes, edges, fingerprint: ForecastService.fingerprint(nodes, edges)
                });
            }
            for (const entry of rationale) await StateRepository.addRationale(client, entry);
            return { tickAt, observerEventIds, observerEligible, activeTask: executable, needs, weather };
        });
        return result;
    }

    static async applyTaskWorldEffects(client, task) {
        const effects = [];
        const type = String(task.task_type || '');
        if (['EAT_FOOD_HOME', 'EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER'].includes(type)) {
            const food = await StateRepository.getFirstConsumable(client, 'food');
            if (food) {
                await StateRepository.consumeItem(client, food.item_id, 1);
                effects.push({ type: 'consumed', itemId: food.item_id, properties: food.properties || {} });
            } else effects.push({ type: 'failed', reason: 'NO_FOOD_AVAILABLE' });
        }
        if (type === 'BUY_FOOD_STORE') {
            const state = await StateRepository.getLockedState(client);
            if (Number(state.wallet_rubles) >= FOOD_PRICE_RUBLES) {
                await StateRepository.updateWallet(client, -FOOD_PRICE_RUBLES);
                await StateRepository.upsertItem(client, { itemId: 'cheese_ramen', itemType: 'food', quantity: 1, properties: { hunger_restore: 50 } });
                effects.push({ type: 'added', itemId: 'cheese_ramen', priceRubles: FOOD_PRICE_RUBLES });
            } else effects.push({ type: 'failed', reason: 'INSUFFICIENT_FUNDS' });
        }
        if (type === 'ASK_NASTYA_FOR_FOOD') {
            await StateRepository.upsertItem(client, { itemId: 'basic_meal', itemType: 'food', quantity: 1, properties: { hunger_restore: 45, source: 'nastya' } });
            effects.push({ type: 'received', itemId: 'basic_meal', source: 'nastya' });
        }
        if (type === 'EQUIP_OUTFIT') {
            const trench = await StateRepository.getInventoryItem(client, 'trench_coat');
            if (trench) {
                await StateRepository.equipClothing(client, trench.item_id);
                effects.push({ type: 'equipped', itemId: trench.item_id });
            }
        }
        return effects;
    }

    static async maybeTriggerObserver(eventIds = [], eligible = false) {
        if (this.observerRunning || eventIds.length === 0) return null;
        this.observerRunning = true;
        try {
            const events = await StateRepository.getRecentFactualEvents(40);
            const previous = (await StateRepository.getRecentObserverBatches(1)).at(-1);
            const lastBatchAt = previous?.created_at ? new Date(previous.created_at).getTime() : 0;
            const selected = events.filter(event => eventIds.includes(Number(event.id)) || !lastBatchAt || new Date(event.occurred_at).getTime() > lastBatchAt).slice(-20);
            const freshEvents = selected.filter(event => !lastBatchAt || new Date(event.occurred_at).getTime() > lastBatchAt);
            if (!eligible && freshEvents.length < 3) return null;
            if (selected.length === 0) return null;
            const batch = await StateRepository.withTransaction(client => StateRepository.createObserverBatch(client, {
                trigger: selected.some(event => Number(event.importance) >= 2) ? 'SIGNIFICANT_EVENT' : 'ROOT_COMPLETED',
                eventIds: selected.map(event => event.id),
                rawContext: { events: selected.map(event => ({ type: event.event_type, payload: event.payload, occurred_at: event.occurred_at })) }
            }));
            const prompt = `Ты Observer симуляции. Сформулируй короткий художественный digest только по JSON-фактам ниже. Не добавляй еду, локации, статусы, эмоции или действия, которых нет в payload. Если фактов мало, напиши нейтрально.\n${JSON.stringify(batch.raw_context)}`;
            const narrative = await generateCompletion(prompt, { temperature: 0.2, trace: { kind: 'OBSERVER', userId: 0 } });
            return StateRepository.completeObserverBatch(batch.id, String(narrative || '').trim(), narrative ? 'COMPLETED' : 'FAILED');
        } catch (error) {
            console.error('Observer batch error:', error.message);
            return null;
        } finally {
            this.observerRunning = false;
        }
    }

    static startWorker() { this.tick({ bootstrap: true }).catch(() => null); this.timer = setInterval(() => this.tick().catch(() => null), STEP_MINUTES * 60 * 1000); }
    static stopWorker() { if (this.timer) clearInterval(this.timer); this.timer = null; }
    static getStatus() { return { running: this.isRunning, timerActive: !!this.timer, intervalMinutes: STEP_MINUTES, maxCatchupSteps: MAX_CATCHUP_STEPS }; }
}
