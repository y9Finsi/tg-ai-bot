import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { StateRepository } from './db/state_repository.js';
import { LOCATIONS } from './radiant/world_map.js';
import { GOAPPlanner } from './radiant/goap_planner.js';
import { calculateMood } from './radiant/needs.js';
import { UtilitySelector } from './radiant/utility_selector.js';
import { WeatherService } from './radiant/weather_service.js';
import { coordinateAtProgress } from './radiant/world_map.js';
import { MemorySummarizer } from './memory/summarizer.js';
import { ContextBuilder } from './ai/context_builder.js';
import {
    getAdminStats,
    getAiProviders,
    addAiProvider,
    setActiveAiProvider,
    deleteAiProvider,
    updateProviderPriority,
    toggleFreeMode,
    isFreeModeEnabled,
    resetAllFreeRequests,
    getSetting,
    setSetting,
    getUser,
    getUserMemories,
    getMemorySettings,
    setMemorySettings,
    getAllLeraPhotos,
    addLeraPhoto,
    updateLeraPhoto,
    deleteLeraPhoto,
    getRecentConversationEvents,
    formatConversationEvent,
    appendConversationEvent,
    clearAllChatHistory,
    getAllPromocodes,
    createPromocode,
    deletePromocode,
    getUserMemoriesAdmin,
    saveUserMemory,
    updateUserMemoryFact,
    setUserMemoryActive,
    deleteUserMemory,
    searchUsers,
    getPromptLogs,
    getPromptLogById,
    getChannelPosterSettings,
    getChannelPostHistory,
    deleteChannelPostLog,
    setBlockStatus,
    adminSetTextBalance,
    adminSetImageBalance,
    grantPackage,
    getPaymentHistory,
    getUserRelationshipAdmin,
    setUserRelationshipAdmin,
    query,
    listSandboxPresets,
    getSandboxPreset,
    createSandboxPreset,
    updateSandboxPreset,
    deleteSandboxPreset,
    getSandboxRuns,
    getSandboxRun,
    updateAiProviderSamplingCapabilities,
    getAllLeraContent,
    addLeraContent,
    updateLeraContent,
    deleteLeraContent,
    getLeraContent
} from './database.js';
import { broadcastQueue } from './broadcast.js';
import { sendCatalogContent } from './content_service.js';
import { reloadAIClient } from './ai.js';
import { requestLlmCompletion, getCachedOpenAIClient } from './ai/llm_client.js';
import { generateAndPublishChannelPost, generateChannelPostDraft, publishChannelDraft } from './channel_poster.js';
import { normalizeTopicDistribution } from './channel_topics.js';
import { getRecentLogs, logEmitter } from './logger.js';
import { getLlmParams, updateLlmParams, getLeraPrompts, updateLeraPrompts, DEFAULT_LLM_PARAMS, getRoutingPromptModules, getRoutedSystemPrompt } from './prompts.js';
import {
    getRoutingSettings,
    updateRoutingSettings,
    classifyIntent,
    getModeGenerationParams,
    getPromptStudioState,
    savePromptStudioDraft,
    publishPromptStudioIntent
} from './ai/intent_router.js';
import { SimulationWorker } from './workers/simulation_worker.js';
import { devtoolEvents, publishDevtoolEvent } from './devtools/event_bus.js';
import { runTelegramDaySmoke } from './radiant/telegram_day_smoke.js';
import { evaluateLeraReply } from './ai/response_quality.js';
import { CONTENT_CHANNEL_GUIDE } from './content_service.js';
import { getDayProfile, isWithinWindow } from './radiant/day_profile.js';
import { taskDefinition } from './radiant/task_catalog.js';
import { normalizePersonality, DEFAULT_PERSONALITY, personalityModifiers } from './radiant/personality.js';
import { RANDOM_EVENTS } from './radiant/random_events.js';
import { runContinuousDay } from './radiant/day_runner.js';
import { ITEM_CATALOG } from './radiant/inventory.js';
import { resolveRadiantHealthStatus } from './radiant/health_status.js';
import {
    generateSandbox,
    generateSandboxAbTest,
    migratePresetToCurrent
} from './ai/sandbox_service.js';

const DEFAULT_CONTENT_CHANNEL_ID = '-1003729264804';

const ADMIN_DAY_TASKS = ['SLEEP_NIGHT', 'SLEEP_EXHAUSTED', 'EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER', 'EMERGENCY_EAT', 'WORK_LAPTOP', 'TRAVEL', 'SOCIAL_NASTYA', 'LEISURE_HOME', 'IDLE_HOME_REST'];
function humanizeAdminEvent(type, payload = {}) {
    const task = payload.taskType || payload.task_type;
    const taskNames = {
        SLEEP_NIGHT: 'ночной сон', SLEEP_EXHAUSTED: 'сон от истощения',
        EAT_BREAKFAST: 'завтрак', EAT_LUNCH: 'обед', EAT_DINNER: 'ужин', EMERGENCY_EAT: 'аварийная еда',
        EAT_FOOD_HOME: 'еда дома', BUY_FOOD_STORE: 'покупка еды',
        WORK_LAPTOP: 'работа за ноутбуком', TRAVEL: 'дорога', SOCIAL_NASTYA: 'встреча с Настей',
        LEISURE_HOME: 'досуг дома', IDLE_HOME_REST: 'отдых дома', GO_TO_BATHROOM: 'туалет', SHOWER_HOME: 'душ',
        PRIVATE_RELIEF: 'личное время', PREPARE_FOR_OUTING: 'подготовка к выходу'
    };
    if (type === 'RANDOM_EVENT') return `Случайное событие: ${payload.title || payload.id || 'без названия'}`;
    if (type === 'INTERRUPT_ACCEPTED') return `Лера прервала текущую задачу: ${task || 'неизвестная задача'}`;
    if (type === 'TASK_COMPLETED' || type === 'ROOT_TASK_COMPLETED') return `Завершено: ${taskNames[task] || task || 'задача'}`;
    if (type === 'WORK_REQUEST_CREATED') return 'Макс создал рабочую задачу';
    if (type === 'SOCIAL_MEETING_PROPOSED') return 'Настя предложила встречу';
    if (type === 'COMMITMENT_MISSED') return `Пропущен план: ${payload.title || 'без названия'}`;
    return type.replaceAll('_', ' ').toLowerCase();
}
const isWithinAdminWindow = (date, window) => isWithinWindow(date, window);
function daySummary({ intervals = [], facts = [], commitments = [], randomEvents = [], consequences = [], state = {}, mood = null } = {}) {
    const minutes = taskType => intervals.filter(item => item.taskType === taskType).reduce((sum, item) => sum + (Number(item.durationMinutes) || Math.max(0, (new Date(item.end) - new Date(item.start)) / 60000)), 0);
    const count = taskType => intervals.filter(item => item.taskType === taskType).length;
    return {
        totalIntervals: intervals.length,
        workMinutes: minutes('WORK_LAPTOP'),
        travelMinutes: minutes('TRAVEL'),
        sleepMinutes: minutes('SLEEP_NIGHT') + minutes('SLEEP_EXHAUSTED'),
        plannedMeals: ['EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER'].reduce((sum, key) => sum + count(key), 0),
        emergencyMeals: count('EMERGENCY_EAT'),
        nightSleepBlocks: count('SLEEP_NIGHT'),
        exhaustedSleepBlocks: count('SLEEP_EXHAUSTED'),
        commitments: commitments.length,
        completedCommitments: commitments.filter(item => item.status === 'COMPLETED').length,
        missedCommitments: commitments.filter(item => item.status === 'MISSED').length,
        randomEvents: randomEvents.length,
        consequences: consequences.length,
        facts: facts.length,
        finalMood: mood,
        finalLocation: state.location_id || null,
        finalNeeds: state.needs || {}
    };
}
function scheduleWindowRows(profile) {
    const rows = [];
    const add = (kind, label, window) => rows.push({ kind, label, start: window.start, end: window.end, startMinutes: parseMinutes(window.start), durationMinutes: window.durationMinutes || null });
    add('sleep', 'Ночной сон', profile.sleepWindow);
    Object.entries(profile.mealWindows || {}).forEach(([key, window]) => add('meal', key === 'breakfast' ? 'Завтрак' : key === 'lunch' ? 'Обед' : 'Ужин', window));
    (profile.workWindows || []).forEach(window => add('work', 'Рабочее окно', window));
    (profile.restWindows || []).forEach(window => add('rest', profile.isWorkday ? 'Вечерний отдых' : 'Отдых выходного дня', window));
    return rows;
}
function parseMinutes(value) { const [hours, minutes] = String(value || '0:0').split(':').map(Number); return hours * 60 + minutes; }
function schedulePosition(date, profile) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: profile.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(date));
    const hour = Number(parts.find(item => item.type === 'hour')?.value || 0); const minute = Number(parts.find(item => item.type === 'minute')?.value || 0);
    return hour * 60 + minute;
}
function invitationMeta(origin) {
    const value = String(origin || 'SYSTEM');
    if (value.includes('NASTYA')) return { invitation: true, inviter: 'Настя', inviterInitial: 'Н', inviterTone: 'pink' };
    if (value.includes('MAX')) return { invitation: true, inviter: 'Макс', inviterInitial: 'М', inviterTone: 'blue' };
    return { invitation: false, inviter: null, inviterInitial: null, inviterTone: null };
}
function humanCancelReason(row, at) {
    if (row.status === 'MISSED' || row.status === 'OVERDUE' || row.overdue) return 'Лера не успела выполнить до дедлайна';
    if (row.status === 'CANCELLED') return row.reason || 'Задача отменена системой';
    if (row.kind === 'forecast' && row.start && new Date(row.start) < at) return 'Время плана прошло, подтверждённого факта нет';
    return row.reason || 'Задача больше не активна';
}
function humanCommitmentReason(value) {
    const reasons = { MAX_DEADLINE_MISSED: 'Макс не получил результат вовремя', NASTYA_DISAPPOINTED: 'Настя могла расстроиться из-за пропуска встречи' };
    return reasons[value] || value || null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let botInstance = null;

export function setBotInstanceForServer(bot) {
    botInstance = bot;
}

export function startAdminServer() {
    const app = express();
    const PORT = process.env.ADMIN_PORT || 3000;
    const ADMIN_KEY = process.env.ADMIN_WEB_KEY;
    const withTimeout = (promise, ms = 2000) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Операция превысила ${ms} мс`)), ms))
    ]);

    if (!ADMIN_KEY) throw new Error('ADMIN_WEB_KEY обязателен для запуска веб-админки');

    app.use(express.json({ limit: '50mb' }));
    app.use('/legacy-admin', express.static(path.join(__dirname, '../public/admin')));
    app.use('/admin-v2', express.static(path.join(__dirname, '../public/admin-v2'), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
        }
    }));
    app.use(express.static(path.join(__dirname, '../public/admin-v2'), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
        }
    }));
    app.use('/assets/free_pics', express.static(path.join(__dirname, 'assets/free_pics')));

    // Public Web Map
    app.get('/map', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/map.html'));
    });

    app.get(/^\/admin-v2(\/.*)?$/, (req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(__dirname, '../public/admin-v2/index.html'));
    });

    app.get('/', (req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(__dirname, '../public/admin-v2/index.html'));
    });

    // Public Map API Endpoint
    app.get('/api/map/state', async (req, res) => {
        try {
            const state = await StateRepository.getState();
            const queue = await StateRepository.getQueue();
            const currentNode = LOCATIONS[state?.location_id] || LOCATIONS.petrogradka_home;
            res.json({
                success: true,
                state: {
                    location_id: state?.location_id || 'petrogradka_home',
                    location_name: currentNode.name,
                    last_tick_at: state?.last_tick_at || null,
                    active_task: queue[0] ? {
                        title: queue[0].task_type,
                        target_location: queue[0].target_location,
                        time_remaining_seconds: Math.max(0, Number(queue[0].remaining_minutes || 0) * 60)
                    } : null
                },
                current_node: currentNode,
                all_nodes: LOCATIONS
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    const readAdminCookie = (req) => {
        const rawValue = (req.headers.cookie || '')
            .split(';')
            .map(c => c.trim())
            .find(c => c.startsWith('admin_key='))
            ?.slice('admin_key='.length);
        if (!rawValue) return null;
        try {
            return decodeURIComponent(rawValue);
        } catch {
            return null;
        }
    };

    // Browser login: the secret stays in an HttpOnly cookie and is never embedded
    // into app.js or an SSE URL.
    app.post('/api/admin/login', (req, res) => {
        if (req.body?.key !== ADMIN_KEY) {
            return res.status(401).json({ error: 'Неверный ключ админки.' });
        }
        const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
        res.setHeader(
            'Set-Cookie',
            `admin_key=${encodeURIComponent(ADMIN_KEY)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200${secure}`
        );
        res.json({ success: true });
    });

    app.post('/api/admin/logout', (req, res) => {
        // Clear both the current cookie and the legacy /api/admin-scoped cookie.
        res.setHeader('Set-Cookie', [
            'admin_key=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0',
            'admin_key=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0'
        ]);
        res.json({ success: true });
    });

    app.get('/api/admin/session', (req, res) => {
        const authenticated = readAdminCookie(req) === ADMIN_KEY;
        res.json({ success: true, authenticated });
    });

    // Auth Middleware — accepts header, query param or cookie (EventSource cannot set headers).
    app.use('/api', (req, res, next) => {
        if (req.path.startsWith('/admin/lera-pics/file/') || req.path === '/map/state' || req.path === '/admin/login' || req.path === '/admin/session') {
            return next();
        }
        const cookieKey = readAdminCookie(req);
        const clientKey = req.headers['x-admin-key'] || cookieKey;
        if (clientKey !== ADMIN_KEY) {
            return res.status(401).json({ error: 'Доступ запрещен. Неверный токен авторизации.' });
        }
        next();
    });

    const buildRadiantOverview = async () => {
        const state = await StateRepository.getState();
        WeatherService.syncOverride(state?.weather_override);
        const [inventory, queue, activeTask, nastya, maxClient, facts, observerDigest, weather, forecast, queueAnomalies] = await Promise.all([
            StateRepository.getInventory(), StateRepository.getQueue(), StateRepository.getExecutableTask(),
            StateRepository.getNpcState(null, 'nastya'), StateRepository.getNpcState(null, 'max_client'),
            StateRepository.getRecentFactualEvents(30), StateRepository.getRecentObserverBatches(8),
            WeatherService.getSnapshot(), StateRepository.getLatestForecast(),
            StateRepository.getQueueAnomalies().catch(() => ({ duplicateScopes: [], stalledTasks: [], expandedPendingRoots: [] }))
        ]);
        const npc = { nastya, max_client: maxClient };
        const transit = activeTask?.status === 'IN_TRANSIT' ? {
            from: activeTask.transit_from_location, to: activeTask.transit_to_location,
            progress_percent: Number(activeTask.transit_progress_percent || 0),
            coordinate: coordinateAtProgress(activeTask.transit_route, activeTask.transit_progress_percent)
        } : null;
        return {
            success: true,
            snapshotAt: new Date().toISOString(),
            state: {
                ...(state || {}),
                location_name: (LOCATIONS[state?.location_id] || LOCATIONS.petrogradka_home).name,
                needs: state?.needs || {}, mood: calculateMood(state || {}),
                physiology: state?.physiology || {},
                wallet: { rubles: state?.wallet_rubles || 0, stars: state?.wallet_stars || 0 }
            },
            willingness: GOAPPlanner.explainWillingness(state || {}),
            outfit: ContextBuilder.describeOutfit(inventory), active_task: activeTask,
            paused_tasks: queue.filter(task => ['PAUSED', 'PAUSED_WAITING_DEPENDENCY'].includes(task.status)),
            transit, weather, queue, queue_anomalies: queueAnomalies,
            selected_goal: UtilitySelector.select({ state: state || {}, npc, now: new Date() }),
            utility_candidates: UtilitySelector.candidates({ state: state || {}, npc, now: new Date() }),
            catchup: { last_tick_at: state?.last_tick_at || null, max_steps_per_run: 12, step_minutes: 5 },
            facts, observer_digest: observerDigest, forecast,
            goap_chain: GOAPPlanner.buildVisualChain({ queue, activeTask }), inventory,
            npcs: { nastya: nastya?.state_json || {}, max_client: maxClient?.state_json || {} },
            diary: facts, locations: LOCATIONS
        };
    };

    const buildRadiantHealth = async () => {
        const overview = await buildRadiantOverview();
        const state = overview.state || {};
        const now = Date.now();
        const lastSuccess = state.last_successful_tick_at ? new Date(state.last_successful_tick_at).getTime() : 0;
        const tickAgeSeconds = lastSuccess ? Math.max(0, Math.floor((now - lastSuccess) / 1000)) : null;
        const duplicateRoots = overview.queue_anomalies?.duplicateScopes?.length || 0;
        const stalledTasks = overview.queue_anomalies?.stalledTasks?.length || 0;
        const workerRunning = SimulationWorker.getStatus().timerActive;
        const status = resolveRadiantHealthStatus({
            tickAgeSeconds,
            workerRunning,
            lastTickError: state.last_tick_error,
            duplicateRoots,
            stalledTasks
        });
        return {
            success: true, status,
            worker: {
                running: workerRunning,
                instance_id: state.worker_instance_id || SimulationWorker.workerInstanceId,
                last_tick_at: state.last_tick_at || null,
                last_success_at: state.last_successful_tick_at || null,
                last_error: state.last_tick_error || null,
                last_duration_ms: state.last_tick_duration_ms || null,
                tick_age_seconds: tickAgeSeconds,
                next_tick_expected_at: state.last_successful_tick_at ? new Date(lastSuccess + 5 * 60 * 1000).toISOString() : null
            },
            queue: {
                active_count: overview.queue.length,
                paused_count: overview.paused_tasks.length,
                duplicate_roots: duplicateRoots,
                stalled_tasks: stalledTasks
            },
            state: {
                location_id: state.location_id,
                active_task: overview.active_task?.task_type || null,
                selected_goal: overview.selected_goal?.taskType || null,
                mood: state.mood,
                willingness: overview.willingness?.value ?? null
            },
            runtime_recovery: {
                last_reset_at: state.runtime_reset_at || null,
                reset_version: state.runtime_recovery_version || null
            }
        };
    };

    const cycleAnchorForDay = day => {
        const safeDay = Math.max(1, Math.min(28, Math.round(Number(day) || 3)));
        return new Date(Date.now() - (safeDay - 1) * 86400000).toISOString().slice(0, 10);
    };

    // =========================================================================
    // MODULE 1: RADIANT ENGINE OBSERVABILITY (REAL DB DATA) & SKYRIM MAP
    // =========================================================================

    app.get('/api/admin/radiant/overview', async (req, res) => {
        try {
            res.json(await buildRadiantOverview());
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/radiant/health', async (req, res) => {
        try { res.json(await buildRadiantHealth()); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/radiant/reset-runtime', async (req, res) => {
        try {
            const requestId = String(req.body?.request_id || req.body?.requestId || `reset:${Date.now()}:${Math.random().toString(36).slice(2)}`);
            const result = await StateRepository.withTransaction(async client => {
                await StateRepository.getLockedState(client);
                const existing = await client.query('SELECT result FROM sim_admin_mutations WHERE request_id = $1 FOR UPDATE', [requestId]);
                if (existing.rows[0]) return { ...existing.rows[0].result, deduplicated: true };
                return StateRepository.resetRuntime(client, { requestId });
            });
            res.json({ success: true, request_id: requestId, reset: result, health: await buildRadiantHealth(), overview: await buildRadiantOverview() });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/radiant/tick', async (req, res) => {
        try {
            const result = await SimulationWorker.runManualTick({ forceChaos: req.body?.forceChaos || null });
            res.json({ success: true, result, snapshot: await buildRadiantOverview() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Unified developer snapshot. This is deliberately a read-only composition
    // of the factual world, queue, forecast and latest decision trace.
    app.get('/api/admin/devtool/snapshot', async (req, res) => {
        try {
            const radiant = await buildRadiantOverview();
            const [rationale, promptLogs, forecastHistory] = await Promise.all([
                StateRepository.getRecentRationale(120),
                getPromptLogs({ limit: 25 }),
                StateRepository.getForecastHistory(25)
            ]);
            res.json({
                success: true,
                snapshotAt: new Date().toISOString(),
                world: {
                    ...radiant,
                    state: radiant.state,
                    activeTask: radiant.active_task,
                    transit: radiant.transit,
                    locations: LOCATIONS
                },
                rationale,
                promptLogs,
                forecastHistory
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/devtool/graph', async (req, res) => {
        try {
            const [forecast, queue, rationale] = await Promise.all([
                StateRepository.getLatestForecast(req.query.date || null),
                StateRepository.getQueue(),
                StateRepository.getRecentRationale(200)
            ]);
            res.json({ success: true, forecast, queue, rationale });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/devtool/rationale/:id', async (req, res) => {
        try {
            const rows = await StateRepository.getRecentRationale(500);
            const trace = rows.find(item => String(item.id) === String(req.params.id));
            if (!trace) return res.status(404).json({ error: 'Rationale trace не найден' });
            res.json({ success: true, trace, raw: trace.payload || {} });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/radiant/forecast', async (req, res) => {
        try {
            res.json({ success: true, forecast: await StateRepository.getLatestForecast() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/radiant/forecast/history', async (req, res) => {
        try { res.json({ success: true, history: await StateRepository.getForecastHistory() }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Read model for the diary-style admin UI. It deliberately composes the
    // existing factual sources instead of making the frontend infer semantics
    // from raw queue payloads.
    app.get('/api/admin/radiant/day', async (req, res) => {
        try {
            const state = await StateRepository.getState();
            const at = req.query.at ? new Date(req.query.at) : new Date(state?.last_tick_at || Date.now());
            if (Number.isNaN(at.getTime())) return res.status(400).json({ error: 'Некорректная дата at' });
            const profile = getDayProfile(at);
            const [facts, commitments, rationale, forecast, health, overview] = await Promise.all([
                StateRepository.getRecentFactualEvents(160),
                StateRepository.getCommitments(null, profile.date),
                StateRepository.getRecentRationale(120),
                StateRepository.getLatestForecast(profile.date),
                buildRadiantHealth(),
                buildRadiantOverview()
            ]);
            const personality = normalizePersonality(state?.personality || DEFAULT_PERSONALITY);
            const dayFacts = facts.filter(item => {
                const occurred = item.occurred_at ? new Date(item.occurred_at) : null;
                return occurred && getDayProfile(occurred).date === profile.date;
            });
            const randomEvents = dayFacts.filter(item => item.event_type === 'RANDOM_EVENT');
            const consequences = dayFacts.filter(item => ['COMMITMENT_MISSED', 'SOCIAL_MEETING_COMPLETED', 'WORK_RESULT_ACCEPTED'].includes(item.event_type));
            const meals = dayFacts.filter(item => {
                const taskType = item.payload?.taskType;
                return typeof taskType === 'string' && (taskType.startsWith('EAT_') || taskType === 'EMERGENCY_EAT');
            });
            const sleep = dayFacts.filter(item => ['SLEEP_NIGHT', 'SLEEP_EXHAUSTED'].includes(item.payload?.taskType));
            const timeline = dayFacts.map(item => ({
                id: item.id,
                at: item.occurred_at,
                type: item.event_type,
                title: humanizeAdminEvent(item.event_type, item.payload || {}),
                source: item.payload?.createdBy || item.payload?.source || item.event_type,
                payload: item.payload || {},
                technical: item
            }));
            const factIntervals = dayFacts.filter(item => item.event_type === 'TASK_COMPLETED' && item.payload?.taskType).map(item => {
                const taskType = item.payload.taskType;
                const durationMinutes = Number(item.payload?.durationMinutes || item.payload?.duration_minutes || taskDefinition(taskType).durationMinutes || 0);
                const end = new Date(item.occurred_at);
                return { taskType, durationMinutes, start: new Date(end.getTime() - durationMinutes * 60000).toISOString(), end: end.toISOString() };
            });
            const factRows = dayFacts.filter(item => item.event_type === 'TASK_COMPLETED' && item.payload?.taskType).map(item => ({
                id: `fact-${item.id}`, kind: 'fact', label: humanizeAdminEvent('TASK_COMPLETED', item.payload || {}).replace(/^Завершено:\s*/, ''), taskType: item.payload.taskType,
                start: item.occurred_at, occurredAt: item.occurred_at, startMinutes: schedulePosition(item.occurred_at, profile),
                durationMinutes: Number(item.payload?.durationMinutes || item.payload?.duration_minutes || taskDefinition(item.payload.taskType).durationMinutes || 30),
                end: item.occurred_at, source: 'Подтверждённое событие', sourceLabel: 'Факт', status: 'COMPLETED', detail: item.payload || {}
            }));
            const activeQueueRows = (overview.queue || []).filter(item => ['IN_PROGRESS', 'IN_TRANSIT'].includes(item.status)).map(item => ({
                id: `queue-${item.id}`, kind: 'active', taskType: item.task_type || item.taskType,
                label: humanizeAdminEvent('TASK_COMPLETED', { taskType: item.task_type || item.taskType }).replace(/^Завершено:\s*/, ''),
                start: item.created_at, durationMinutes: Number(item.duration_minutes || 30), remaining_minutes: Number(item.remaining_minutes || 0),
                source: item.created_by || item.createdBy || 'Текущая задача', sourceLabel: item.created_by || item.createdBy || 'Текущая задача',
                status: item.status, target_location: item.target_location || item.targetLocation
            }));
            const schedule = [
                ...activeQueueRows,
                ...scheduleWindowRows(profile).map(row => ({ ...row, source: 'DAY_PROFILE', status: 'ROUTINE' })),
                ...factRows,
                ...(forecast?.nodes || []).map(node => ({ id: `forecast-${node.id}`, kind: 'forecast', taskType: node.task_type, label: humanizeAdminEvent('TASK_COMPLETED', { taskType: node.task_type }).replace(/^Завершено: /, ''), planned_start: node.planned_start, start: node.planned_start, startMinutes: schedulePosition(node.planned_start, profile), durationMinutes: Number(node.planned_duration_minutes || 30), end: new Date(new Date(node.planned_start).getTime() + Number(node.planned_duration_minutes || 30) * 60000).toISOString(), source: 'План движка', sourceLabel: 'План движка', status: node.status, reason: node.metadata?.reason || null })),
                ...commitments.map(item => ({ id: `commitment-${item.id}`, kind: 'commitment', taskType: item.task_type || item.type, label: item.title, planned_start: item.planned_start || item.due_at, start: item.planned_start || item.due_at, startMinutes: schedulePosition(item.planned_start || item.due_at, profile), durationMinutes: item.duration_minutes || 30, end: item.due_at || item.planned_start, source: item.origin, sourceLabel: 'Приглашение', status: item.status, reason: item.consequence_on_miss || null, ...invitationMeta(item.origin) }))
            ].filter(item => item.start);
            const scheduleWithClock = schedule.map(row => {
                const startAt = new Date(row.start);
                const endAt = row.end ? new Date(row.end) : null;
                const hasAbsoluteStart = !Number.isNaN(startAt.getTime());
                const isPast = hasAbsoluteStart && startAt < at && (!endAt || endAt <= at);
                const status = row.kind === 'commitment' && isPast && row.status === 'PLANNED' ? 'OVERDUE' : row.status;
                const matchingFacts = row.kind !== 'fact' ? factRows.filter(fact => fact.taskType === row.taskType) : [];
                const matchedFact = matchingFacts.find(fact => Math.abs(new Date(fact.occurredAt).getTime() - startAt.getTime()) < 90 * 60000) || matchingFacts[0] || null;
                const matchedFactNearPlan = matchingFacts.find(fact => Math.abs(new Date(fact.occurredAt).getTime() - startAt.getTime()) < 90 * 60000) || null;
                const matchedPlan = row.kind === 'fact' && schedule
                    .filter(candidate => candidate.kind !== 'fact' && candidate.taskType === row.taskType && candidate.start && Math.abs(new Date(row.occurredAt).getTime() - new Date(candidate.start).getTime()) < 90 * 60000)
                    .sort((a, b) => Math.abs(new Date(row.occurredAt).getTime() - new Date(a.start).getTime()) - Math.abs(new Date(row.occurredAt).getTime() - new Date(b.start).getTime()))[0];
                const enriched = matchedFact
                    ? { ...row, matchedFact: true, factLabel: matchedFact.label, factAt: matchedFact.occurredAt, factRowId: matchedFact.id, planStart: matchedFactNearPlan ? row.start : null }
                    : matchedPlan
                        ? { ...row, matchedFact: true, planStart: matchedPlan.start, planSource: matchedPlan.sourceLabel }
                        : { ...row, matchedFact: false };
                const shouldCancel = enriched.kind === 'forecast' && (isPast || enriched.matchedFact) || enriched.kind === 'commitment' && ['MISSED', 'CANCELLED', 'OVERDUE'].includes(status);
                return {
                    ...enriched,
                    inviterName: enriched.inviter || null,
                    status,
                    clockAt: at.toISOString(),
                    overdue: status === 'OVERDUE',
                    cancelReason: shouldCancel ? humanCancelReason({ ...enriched, reason: humanCommitmentReason(enriched.reason), overdue: status === 'OVERDUE' }, at) : null,
                    lifecycleStatus: shouldCancel ? (enriched.matchedFact ? 'COMPLETED' : 'CANCELLED') : status,
                    startAt: hasAbsoluteStart ? startAt.toISOString() : null,
                    endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt.toISOString() : null
                };
            });
            const planFactLinks = (forecast?.nodes || []).map((plan, index) => {
                const fact = dayFacts.find(item => item.event_type === 'TASK_COMPLETED' && item.payload?.taskType === plan.task_type);
                return { id: `plan-${index}-${plan.task_type}`, plan: humanizeAdminEvent('TASK_COMPLETED', { taskType: plan.task_type }), planType: plan.task_type, fact: fact ? humanizeAdminEvent('TASK_COMPLETED', fact.payload || {}) : null, factId: fact?.id || null, matched: Boolean(fact), reason: plan.metadata?.reason || null };
            });
            const changes = dayFacts.filter(item => ['RANDOM_EVENT', 'COMMITMENT_MISSED', 'WORK_REQUEST_CREATED', 'SOCIAL_MEETING_PROPOSED'].includes(item.event_type)).map(item => ({ at: item.occurred_at, label: humanizeAdminEvent(item.event_type, item.payload || {}), type: item.event_type, payload: item.payload || {} }));
            const enrichedActiveTask = overview.active_task ? { ...overview.active_task, taskType: overview.active_task.task_type, label: humanizeAdminEvent('TASK_COMPLETED', { taskType: overview.active_task.task_type }).replace(/^Завершено: /, ''), sourceLabel: overview.active_task.created_by || 'Текущая задача', clockAt: at.toISOString() } : null;
            res.json({ success: true, at: at.toISOString(), profile: { ...profile, at: at.toISOString() }, state: { ...overview.state, active_task: overview.active_task || null }, activeTask: enrichedActiveTask, queue: overview.queue || [], health, personality, personalityPreview: ADMIN_DAY_TASKS.map(taskType => ({ taskType, modifier: personalityModifiers({ personality, taskType, state, now: at }) })), commitments, forecast, timeline: timeline, schedule: scheduleWithClock, planFactLinks, changes, facts: dayFacts, randomEvents, consequences, meals, sleep, summary: daySummary({ intervals: factIntervals, facts: dayFacts, commitments, randomEvents, consequences, state: overview.state, mood: calculateMood(state || {}) }), rationale: rationale.filter(item => getDayProfile(item.created_at).date === profile.date) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/radiant/random-events', async (req, res) => {
        try {
            const at = req.query.at ? new Date(req.query.at) : new Date();
            const state = await StateRepository.getState();
            const activeTask = await StateRepository.getExecutableTask();
            const commitments = await StateRepository.getCommitments(null, getDayProfile(at).date);
            const history = await StateRepository.getRandomEventHistory(null, new Date(at.getTime() - 14 * 86400000));
            const profile = getDayProfile(at);
            const events = RANDOM_EVENTS.map(event => {
                const inWindow = !event.windows?.length || event.windows.some(window => isWithinAdminWindow(at, window));
                const condition = Boolean(event.condition({ now: at, state: state || {}, activeTask: activeTask ? { taskType: activeTask.task_type, targetLocation: activeTask.target_location } : null, commitments, dayProfile: profile }));
                const lastAt = history[event.id] || null;
                const cooldownUntil = lastAt ? new Date(new Date(lastAt).getTime() + event.cooldownMinutes * 60000).toISOString() : null;
                return { id: event.id, title: event.title, probability: event.probability, cooldownMinutes: event.cooldownMinutes, windows: event.windows || [], reason: event.reason, consequences: event.consequences || {}, lastAt, cooldownUntil, checks: { inWindow, condition, cooldownActive: Boolean(cooldownUntil && new Date(cooldownUntil) > at) }, eligible: inWindow && condition && !(cooldownUntil && new Date(cooldownUntil) > at) };
            });
            res.json({ success: true, at: at.toISOString(), profile, events });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/personality', async (req, res) => {
        try {
            const next = normalizePersonality(req.body?.personality || {});
            const requestId = String(req.body?.request_id || `personality:${Date.now()}:${Math.random().toString(36).slice(2)}`);
            const result = await StateRepository.withTransaction(async client => {
                const claim = await StateRepository.beginAdminMutation(client, { requestId, action: 'SET_PERSONALITY' });
                if (!claim?.claimed) return { deduplicated: true, result: claim?.row?.result || {} };
                const updated = await client.query(`UPDATE sim_state SET personality = $1::jsonb, updated_at = NOW() WHERE id = 1 RETURNING personality`, [JSON.stringify(next)]);
                const stored = { action: 'SET_PERSONALITY', personality: next, request_id: requestId };
                await StateRepository.addRationale(client, { category: 'ADMIN_OVERRIDE', title: 'Изменён характер Леры', explanation: 'Администратор сохранил параметры личности.', payload: stored });
                await StateRepository.completeAdminMutation(client, requestId, stored);
                return { deduplicated: false, result: updated.rows[0]?.personality || next };
            });
            res.json({ success: true, request_id: requestId, personality: result.result, deduplicated: result.deduplicated });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/random-events/:id', async (req, res) => {
        try {
            const event = RANDOM_EVENTS.find(item => item.id === req.params.id);
            if (!event) return res.status(404).json({ error: 'Random event не найден' });
            const enabled = req.body?.enabled !== false;
            const requestId = String(req.body?.request_id || `random:${event.id}:${Date.now()}`);
            await setSetting(`random_event_enabled_${event.id}`, enabled ? 'true' : 'false');
            await StateRepository.withTransaction(async client => {
                const claim = await StateRepository.beginAdminMutation(client, { requestId, action: 'SET_RANDOM_EVENT' });
                if (claim?.claimed) {
                    const result = { action: 'SET_RANDOM_EVENT', id: event.id, enabled, request_id: requestId };
                    await StateRepository.addRationale(client, { category: 'ADMIN_OVERRIDE', title: `Random event ${event.id}: ${enabled ? 'включено' : 'выключено'}`, explanation: 'Изменено состояние random event каталога.', payload: result });
                    await StateRepository.completeAdminMutation(client, requestId, result);
                }
            });
            res.json({ success: true, id: event.id, enabled, request_id: requestId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/radiant/simulation-lab', async (req, res) => {
        try {
            const start = new Date(req.body?.start || '2026-08-07T00:00:00+03:00');
            if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Некорректная дата start' });
            const hours = Math.max(1, Math.min(72, Number(req.body?.hours) || 24));
            const result = runContinuousDay({ start, hours, state: req.body?.state || { location_id: 'petrogradka_home', needs: { hunger: 20, fatigue: 10, boredom: 30, horny: 40, hygiene: 90, bladder: 0 }, physiology: { cycle_day: 3 }, active_modifiers: [], wallet_rubles: 3820 }, npcStates: req.body?.npcStates || { nastya: { state_json: { drama_level: 90, cooldown_until: null } }, max_client: { state_json: { deadline_urgency: 20, cooldown_until: null } } }, personality: req.body?.personality || DEFAULT_PERSONALITY, seed: String(req.body?.seed || 'admin-lab') });
            const checkpoints = [8 * 60 + 15, 16 * 60, 20 * 60 + 30, 21 * 60].map((minutes, index) => ({
                at: new Date(start.getTime() + minutes * 60000).toISOString(),
                userText: ['Доброе утро, как ты?', 'Как прошла работа?', 'Что у тебя вечером?', 'Ты опять всё бросила?'][index],
                contextLayers: { facts: result.facts.filter(item => new Date(item.occurredAt || item.occurred_at) <= new Date(start.getTime() + minutes * 60000)).length, commitments: result.commitments.length, consequences: result.consequences.filter(item => new Date(item.occurredAt || item.occurred_at) <= new Date(start.getTime() + minutes * 60000)).length }
            }));
            res.json({ success: true, safe: true, writes: 0, telegramSends: 0, start: result.start, end: result.end, summary: daySummary(result), intervals: result.intervals, facts: result.facts, commitments: result.commitments, randomEvents: result.randomEvents, consequences: result.consequences, personality: result.personality, checkpoints, baseline: { label: 'V0 reactive baseline', available: false, reason: 'baseline runner не подключён к production endpoint; сравнение доступно локальными тестами' } });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/audit', async (req, res) => {
        try {
            const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
            const result = await query(`SELECT request_id, action, status, result, created_at, completed_at FROM sim_admin_mutations ORDER BY created_at DESC LIMIT $1`, [limit]);
            res.json({ success: true, entries: result.rows });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/radiant/timeline', async (req, res) => {
        try {
            const [facts, observerDigests, rationale] = await Promise.all([
                StateRepository.getRecentFactualEvents(100), StateRepository.getRecentObserverBatches(30), StateRepository.getRecentRationale(100)
            ]);
            res.json({ success: true, facts, observer_digests: observerDigests, rationale, diary: facts });
        }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/admin/radiant/queue', async (req, res) => {
        try {
            const statuses = req.query.status ? String(req.query.status).split(',').filter(Boolean) : null;
            const queue = await StateRepository.getQueue(null, { statuses, source: req.query.source || null, cursor: req.query.cursor || null, limit: Math.min(200, Number(req.query.limit) || 100) });
            res.json({ success: true, queue, next_cursor: queue.at(-1)?.id || null });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/radiant/queue/repair', async (req, res) => {
        try {
            const repair = await StateRepository.withTransaction(async client => StateRepository.repairQueueAnomalies(client));
            res.json({ success: true, repair, overview: await buildRadiantOverview() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Real decision rationale written by the simulation worker (sim_rationale).
    app.get('/api/admin/radiant/rationale', async (req, res) => {
        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);
            const rows = await StateRepository.getRecentRationale(limit);
            const state = await StateRepository.getState();

            const traces = rows.map(row => ({
                id: row.id,
                timestamp: row.created_at,
                category: row.category,
                title: row.title,
                explanation: row.explanation,
                payload: row.payload
            }));

            res.json({
                success: true,
                traces,
                willingness: GOAPPlanner.explainWillingness(state || {}),
                empty_hint: traces.length === 0
                    ? 'Трейс пуст: воркер симуляции ещё не сделал ни одного тика (первый тик — при старте бота, далее каждые 5 минут).'
                    : null
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/radiant/mutate', async (req, res) => {
        try {
            const { rublesDelta, starsDelta, needs, physiology, locationId, activeModifiers } = req.body;
            const requestId = String(req.body?.request_id || req.body?.requestId || `mutate:${Date.now()}:${Math.random().toString(36).slice(2)}`);

            // Clamp needs/physiology to sane ranges so God Mode cannot corrupt the engine.
            const clampMap = (obj, min = 0, max = 100) => {
                if (!obj || typeof obj !== 'object') return null;
                const out = {};
                for (const [key, value] of Object.entries(obj)) {
                    const num = Number(value);
                    if (Number.isFinite(num)) out[key] = Math.max(min, Math.min(max, num));
                }
                return Object.keys(out).length > 0 ? out : null;
            };

            const safeNeeds = clampMap(needs);
            const safePhys = physiology && typeof physiology === 'object'
                ? (() => {
                    const out = {};
                    if (physiology.cycle_day !== undefined) {
                        const day = Number(physiology.cycle_day);
                        if (Number.isFinite(day)) out.cycle_day = Math.max(1, Math.min(28, Math.round(day)));
                    }
                    if (physiology.arousal_level !== undefined) {
                        const lvl = Number(physiology.arousal_level);
                        if (Number.isFinite(lvl)) out.arousal_level = Math.max(0, Math.min(100, lvl));
                    }
                    if (physiology.refractory_period !== undefined) {
                        out.refractory_period = !!physiology.refractory_period;
                    }
                    return Object.keys(out).length > 0 ? out : null;
                })()
                : null;

            const updated = await StateRepository.withTransaction(async (client) => {
                await StateRepository.getLockedState(client);
                if (rublesDelta || starsDelta) {
                    await StateRepository.updateWallet(client, Math.round(rublesDelta || 0), Math.round(starsDelta || 0));
                }
                let row = null;
                if (safeNeeds || safePhys || locationId || activeModifiers) {
                    row = await StateRepository.updateState(client, {
                        locationId,
                        needs: safeNeeds,
                        physiology: safePhys,
                        activeModifiers
                    });
                }

                const parts = [];
                if (rublesDelta) parts.push(`кошелёк ${rublesDelta > 0 ? '+' : ''}${rublesDelta}₽`);
                if (starsDelta) parts.push(`звёзды ${starsDelta > 0 ? '+' : ''}${starsDelta}`);
                if (safeNeeds) parts.push(`нужды ${JSON.stringify(safeNeeds)}`);
                if (safePhys) parts.push(`физиология ${JSON.stringify(safePhys)}`);
                if (locationId) parts.push(`локация ${locationId}`);
                if (parts.length > 0) {
                    await StateRepository.addRationale(client, {
                        category: 'ADMIN_OVERRIDE',
                        title: 'Ручное вмешательство из админки (God Mode)',
                        explanation: `Изменено: ${parts.join(', ')}.`,
                        payload: { requestId, rublesDelta, starsDelta, needs: safeNeeds, physiology: safePhys, locationId }
                    }).catch(() => null);
                }

                return row;
            });

            const state = updated || await StateRepository.getState();
            res.json({
                success: true,
                request_id: requestId,
                state: {
                    needs: state?.needs || {},
                    physiology: state?.physiology || {},
                    location_id: state?.location_id,
                    wallet: { rubles: state?.wallet_rubles || 0, stars: state?.wallet_stars || 0 }
                }
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/radiant/god-mode', async (req, res) => {
        try {
            const { action, rubles, stars, needs, physiology } = req.body || {};
            const requestId = String(req.body?.request_id || req.body?.requestId || `god:${Date.now()}:${Math.random().toString(36).slice(2)}`);
            const supportedActions = new Set([
                'RAIN_ON', 'RAIN_OFF', 'RAIN_AUTO', 'CYCLE_PMS', 'CYCLE_OVULATION',
                'SET_STATE', 'NASTYA_DRAMA_50', 'NASTYA_DRAMA', 'MAX_DEADLINE', 'FORECAST_REBUILD'
            ]);
            if (!supportedActions.has(action)) return res.status(400).json({ error: 'Неизвестный God Mode action' });

            const mutation = await StateRepository.withTransaction(async client => {
                const claim = await StateRepository.beginAdminMutation(client, { requestId, action });
                if (!claim?.claimed) return { deduplicated: true, stored: claim?.row?.result || {} };

                await StateRepository.getLockedState(client);
                const safeNeeds = needs && typeof needs === 'object'
                    ? Object.fromEntries(Object.entries(needs)
                        .map(([key, value]) => [key, Math.max(0, Math.min(100, Number(value)))])
                        .filter(([, value]) => Number.isFinite(value)))
                    : null;
                const safePhysiology = physiology && typeof physiology === 'object'
                    ? { cycle_day: Math.max(1, Math.min(28, Math.round(Number(physiology.cycle_day || 3)))) }
                    : null;
                let rationale = { action, requestId };

                if (action === 'CYCLE_PMS' || action === 'CYCLE_OVULATION') {
                    const cycleDay = action === 'CYCLE_PMS' ? 1 : 14;
                    await StateRepository.updateState(client, { physiology: { cycle_day: cycleDay }, cycleAnchorDate: cycleAnchorForDay(cycleDay) });
                    rationale = { ...rationale, cycleDay };
                } else if (action === 'SET_STATE') {
                    if (rubles !== undefined || stars !== undefined) {
                        const current = await StateRepository.getLockedState(client);
                        await StateRepository.updateWallet(client, Math.round(Number(rubles ?? current.wallet_rubles) - Number(current.wallet_rubles)), Math.round(Number(stars ?? current.wallet_stars) - Number(current.wallet_stars)));
                    }
                    await StateRepository.updateState(client, { needs: safeNeeds, physiology: safePhysiology, cycleAnchorDate: safePhysiology?.cycle_day ? cycleAnchorForDay(safePhysiology.cycle_day) : null });
                    rationale = { ...rationale, rubles, stars, needs: safeNeeds, physiology: safePhysiology };
                } else if (action === 'NASTYA_DRAMA_50' || action === 'NASTYA_DRAMA' || action === 'MAX_DEADLINE') {
                    const isNastya = action.startsWith('NASTYA');
                    const npcId = isNastya ? 'nastya' : 'max_client';
                    const key = isNastya ? 'drama_level' : 'deadline_urgency';
                    const current = await StateRepository.getNpcState(client, npcId);
                    const amount = action === 'NASTYA_DRAMA_50' ? 50 : 100;
                    const next = action === 'NASTYA_DRAMA' || action === 'MAX_DEADLINE'
                        ? amount
                        : Math.min(100, Number(current?.state_json?.[key] || 0) + amount);
                    await StateRepository.updateNpcState(client, npcId, { ...(current?.state_json || {}), [key]: next });
                    rationale = { ...rationale, npcId, key, value: next };
                } else if (action === 'FORECAST_REBUILD') {
                    const weather = await WeatherService.getSnapshot();
                    const state = await StateRepository.getLockedState(client);
                    const { ForecastService } = await import('./radiant/forecast_service.js');
                    const nodes = ForecastService.buildNodes({ state, weather });
                    await StateRepository.createForecastVersion(client, { date: ForecastService.dateFor(new Date()), source: 'ADMIN_GOD_MODE', reason: 'MANUAL_REBUILD', nodes, edges: ForecastService.edgesFor(nodes) });
                    rationale = { ...rationale, reason: 'MANUAL_REBUILD' };
                }

                if (action === 'RAIN_ON' || action === 'RAIN_OFF' || action === 'RAIN_AUTO') {
                    await StateRepository.setWeatherOverride(client, action === 'RAIN_AUTO' ? null : { is_raining: action === 'RAIN_ON' });
                    rationale = { ...rationale, override: action === 'RAIN_ON' ? true : action === 'RAIN_OFF' ? false : null };
                }
                await StateRepository.addRationale(client, {
                    category: 'ADMIN_OVERRIDE',
                    title: `God Mode: ${action}`,
                    explanation: `Применено действие ${action} с request_id ${requestId}.`,
                    payload: rationale
                });
                const stored = { action, request_id: requestId, applied: true };
                await StateRepository.completeAdminMutation(client, requestId, stored);
                return { deduplicated: false, stored };
            });

            if (!mutation.deduplicated) {
                if (action === 'RAIN_ON') WeatherService.setOverride(true);
                else if (action === 'RAIN_OFF') WeatherService.setOverride(false);
                else if (action === 'RAIN_AUTO') WeatherService.clearOverride();
            }
            publishDevtoolEvent('god_mode', { action, requestId, values: { rubles, stars, needs, physiology } });
            res.json({ success: true, action, request_id: requestId, deduplicated: mutation.deduplicated, snapshot: await buildRadiantOverview() });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // =========================================================================
    // MODULE 2: INVENTORY & GOAP QUEUE MANAGEMENT
    // =========================================================================

    app.get('/api/admin/inventory', async (req, res) => {
        try {
            const [inventory, facts] = await Promise.all([
                StateRepository.getInventory(),
                StateRepository.getRecentFactualEvents(160)
            ]);
            const activity = facts.flatMap(event => (event.payload?.worldEffects || [])
                .filter(effect => ['consumed', 'added', 'received', 'equipped'].includes(effect.type))
                .map(effect => ({
                    at: event.occurred_at,
                    taskType: event.payload?.taskType,
                    ...effect
                })))
                .slice(-20)
                .reverse();
            res.json({
                success: true,
                inventory,
                outfit: ContextBuilder.describeOutfit(inventory),
                catalog: Object.values(ITEM_CATALOG),
                activity
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/inventory/equip', async (req, res) => {
        try {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const item = await StateRepository.withTransaction(async (client) => {
                return await StateRepository.equipClothing(client, itemId);
            });
            if (!item) return res.status(404).json({ error: 'Предмет не найден или это не одежда' });
            res.json({ success: true, item });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/inventory/unequip', async (req, res) => {
        try {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const item = await StateRepository.withTransaction(async (client) => {
                return await StateRepository.unequipClothing(client, itemId);
            });
            if (!item) return res.status(404).json({ error: 'Предмет не найден или это не одежда' });
            res.json({ success: true, item });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/inventory/add', async (req, res) => {
        try {
            const { itemId, itemType, properties, quantity } = req.body;
            if (!itemId || !itemType) return res.status(400).json({ error: 'Нужны itemId и itemType' });
            const catalogItem = ITEM_CATALOG[itemId];
            const resolvedType = catalogItem?.type || itemType;
            const resolvedProperties = {
                ...(catalogItem?.properties || {}),
                ...(properties && typeof properties === 'object' ? properties : {})
            };
            const item = await StateRepository.withTransaction(async (client) => {
                return await StateRepository.upsertItem(client, {
                    itemId,
                    itemType: resolvedType,
                    properties: resolvedProperties,
                    quantity: Math.max(1, parseInt(quantity, 10) || 1)
                });
            });
            res.json({ success: true, item });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/inventory/consume', async (req, res) => {
        try {
            const { itemId, quantity } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const item = await StateRepository.withTransaction(async (client) => {
                const current = await StateRepository.getInventoryItem(client, itemId);
                if (!current || current.item_type !== 'food') return null;
                return await StateRepository.consumeItem(client, itemId, Math.max(1, parseInt(quantity, 10) || 1));
            });
            if (!item) return res.status(400).json({ error: 'Можно списать только доступную еду' });
            res.json({ success: true, item });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/queue', async (req, res) => {
        try {
            const queue = await StateRepository.getQueue();
            res.json({ success: true, queue });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    const pushQueueTask = async (req, res) => {
        try {
            const { taskType, targetLocation, durationMinutes, priority, request_id: requestId } = req.body;
            if (!taskType) return res.status(400).json({ error: 'Не передан taskType' });
            const task = await StateRepository.withTransaction(async (client) => {
                const createdResult = await StateRepository.enqueueTask(client, {
                    taskType,
                    targetLocation: targetLocation || 'petrogradka_home',
                    durationMinutes: parseInt(durationMinutes, 10) || 30,
                    priority: parseInt(priority, 10) || 50,
                    createdBy: 'ADMIN_GOD_MODE',
                    idempotencyKey: requestId || `admin:${taskType}:${targetLocation || 'petrogradka_home'}`,
                    activeScopeKey: requestId || null
                });
                const created = createdResult.task;
                await StateRepository.addRationale(client, {
                    category: 'ADMIN_OVERRIDE',
                    title: `Админ вклинил задачу ${created.task_type}`,
                    explanation: `Приоритет ${created.priority}, локация ${created.target_location}, `
                        + `длительность ${created.duration_minutes} мин.`,
                    payload: { taskId: created.id, taskType: created.task_type }
                }).catch(() => null);
                return created;
            });
            res.json({ success: true, task, request_id: requestId || null });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    };

    // Both paths are registered so the UI cannot 404 on a path mismatch.
    app.post('/api/admin/queue/push', pushQueueTask);
    app.post('/api/admin/radiant/queue/push', pushQueueTask);

    app.delete('/api/admin/queue/:id', async (req, res) => {
        try {
            const result = await query(
                `UPDATE sim_queue SET status = 'COMPLETED' WHERE id = $1 RETURNING *`,
                [req.params.id]
            );
            res.json({ success: true, task: result.rows[0] || null });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 3: LERA PHOTOS CATALOG (lera_photos)
    // =========================================================================

    app.get('/api/admin/photos', async (req, res) => {
        try {
            const photos = await getAllLeraPhotos();
            res.json({ success: true, photos });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/photos', async (req, res) => {
        try {
            const { file_id, caption, tags, access_level, time_of_day, explicitness, outfit_tags } = req.body;
            if (!file_id) return res.status(400).json({ error: 'Не указан Telegram file_id' });
            const newPhoto = await addLeraPhoto({
                file_id,
                caption: caption || '',
                tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
                access_level: access_level || 'free',
                time_of_day: time_of_day || 'any',
                explicitness: Math.max(0, Math.min(100, parseInt(explicitness, 10) || 0)),
                outfit_tags: Array.isArray(outfit_tags) ? outfit_tags : (outfit_tags ? String(outfit_tags).split(',').map(t => t.trim()).filter(Boolean) : [])
            });
            res.json({ success: true, photo: newPhoto });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/photos/upload', async (req, res) => {
        try {
            if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });
            const { data, filename = 'lera.jpg', caption = '', access_level = 'free', time_of_day = 'any', tags = [], explicitness = 0, outfit_tags = [] } = req.body;
            if (!data || !String(data).includes(',')) return res.status(400).json({ error: 'Не передан data URL изображения' });
            const buffer = Buffer.from(String(data).split(',')[1], 'base64');
            if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Файл больше 10 МБ' });
            const targetChatId = Number(process.env.ADMIN_ID);
            if (!targetChatId) return res.status(500).json({ error: 'ADMIN_ID не задан' });
            const sent = await botInstance.telegram.sendPhoto(targetChatId, { source: buffer, filename }, { caption: 'Загрузка из Ultimate Admin' });
            const telegramPhoto = sent.photo?.at(-1);
            if (!telegramPhoto?.file_id) throw new Error('Telegram не вернул file_id');
            const photo = await addLeraPhoto({
                file_id: telegramPhoto.file_id,
                caption,
                access_level,
                time_of_day,
                tags: Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean),
                explicitness: Math.max(0, Math.min(100, parseInt(explicitness, 10) || 0)),
                outfit_tags: Array.isArray(outfit_tags) ? outfit_tags : String(outfit_tags).split(',').map(t => t.trim()).filter(Boolean)
            });
            res.json({ success: true, photo });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/photos/:id/preview', async (req, res) => {
        try {
            if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });
            const result = await query('SELECT file_id FROM lera_photos WHERE id = $1', [req.params.id]);
            const fileId = result.rows[0]?.file_id;
            if (!fileId) return res.status(404).json({ error: 'Фото не найдено' });
            const link = await botInstance.telegram.getFileLink(fileId);
            const upstream = await fetch(String(link));
            if (!upstream.ok) throw new Error(`Telegram file API: HTTP ${upstream.status}`);
            const contentType = upstream.headers.get('content-type') || 'image/jpeg';
            const buffer = Buffer.from(await upstream.arrayBuffer());
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'private, max-age=300');
            res.send(buffer);
        } catch (e) {
            res.status(502).json({ error: e.message });
        }
    });

    app.patch('/api/admin/photos/:id', async (req, res) => {
        try {
            const { caption, tags, access_level, time_of_day, explicitness, outfit_tags } = req.body;
            const normalizedTags = Array.isArray(tags)
                ? tags
                : (typeof tags === 'string' && tags.trim() ? tags.split(',').map(t => t.trim()) : null);
            const updated = await updateLeraPhoto(req.params.id, {
                caption: caption ?? null,
                tags: normalizedTags,
                access_level: access_level ?? null,
                time_of_day: time_of_day ?? null,
                explicitness: explicitness === undefined ? null : Math.max(0, Math.min(100, parseInt(explicitness, 10) || 0)),
                outfit_tags: outfit_tags === undefined ? null : (Array.isArray(outfit_tags) ? outfit_tags : String(outfit_tags).split(',').map(t => t.trim()).filter(Boolean))
            });
            if (!updated) return res.status(404).json({ error: 'Фото не найдено' });
            res.json({ success: true, photo: updated });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/photos/:id', async (req, res) => {
        try {
            await deleteLeraPhoto(req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/content', async (req, res) => {
        try {
            const [items, sent, contentChannelId] = await Promise.all([
                getAllLeraContent(),
                query(`SELECT e.id, e.user_id, e.occurred_at, e.metadata, e.content,
                              c.telegram_type, c.description
                       FROM conversation_events e
                       LEFT JOIN lera_content c ON c.id::text = e.metadata->>'content_id'
                       WHERE e.event_type = 'CONTENT' AND e.status = 'COMPLETED'
                       ORDER BY e.occurred_at DESC, e.id DESC LIMIT 50`),
                getSetting('content_channel_id', DEFAULT_CONTENT_CHANNEL_ID)
            ]);
            res.json({ success: true, content: items, sent: sent.rows, contentChannelId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/content/settings', async (req, res) => {
        try {
            const contentChannelId = String(req.body?.content_channel_id || '').trim();
            if (!/^-100\d+$/.test(contentChannelId)) {
                return res.status(400).json({ error: 'Укажите Telegram Channel ID в формате -100…' });
            }
            await setSetting('content_channel_id', contentChannelId);
            res.json({ success: true, contentChannelId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/content/publish-guide', async (req, res) => {
        try {
            if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });
            const contentChannelId = await getSetting('content_channel_id', DEFAULT_CONTENT_CHANNEL_ID);
            const sent = await botInstance.telegram.sendMessage(contentChannelId, CONTENT_CHANNEL_GUIDE);
            res.json({ success: true, messageId: sent?.message_id || null, contentChannelId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/content', async (req, res) => {
        try {
            const telegramType = String(req.body.telegram_type || 'link');
            if (!['audio', 'video', 'animation', 'document', 'photo', 'link'].includes(telegramType)) {
                return res.status(400).json({ error: 'Неподдерживаемый тип контента' });
            }
            const telegramFileId = String(req.body.telegram_file_id || '').trim() || null;
            const url = String(req.body.url || '').trim() || null;
            if (!telegramFileId && !url) return res.status(400).json({ error: 'Нужен file_id или URL' });
            const content = await addLeraContent({
                telegramType,
                telegramFileId,
                url,
                description: String(req.body.description || '').trim(),
                enabled: req.body.enabled !== false,
                allowInDialogue: req.body.allow_in_dialogue !== false,
                allowInitiative: req.body.allow_initiative !== false
            });
            res.json({ success: true, content });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/content/:id', async (req, res) => {
        try {
            const content = await updateLeraContent(req.params.id, req.body || {});
            if (!content) return res.status(404).json({ error: 'Контент не найден' });
            res.json({ success: true, content });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/content/:id', async (req, res) => {
        try {
            const content = await deleteLeraContent(req.params.id);
            if (!content) return res.status(404).json({ error: 'Контент не найден' });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/content/:id/test', async (req, res) => {
        try {
            if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });
            const content = await getLeraContent(req.params.id);
            if (!content) return res.status(404).json({ error: 'Контент не найден' });
            const chatId = Number(req.body?.user_id || process.env.ADMIN_ID);
            if (!chatId) return res.status(400).json({ error: 'Не указан user_id и ADMIN_ID не задан' });
            await sendCatalogContent(botInstance.telegram, chatId, { ...content, enabled: true });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 4: AI PROVIDERS & MODULAR SYSTEM PROMPT EDITOR
    // =========================================================================

    app.get('/api/admin/providers', async (req, res) => {
        try {
            const providers = await getAiProviders();
            res.json({ success: true, providers });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/providers', async (req, res) => {
        try {
            const { name, base_url, api_key, model_name, timeout_ms } = req.body;
            if (!name || !base_url || !api_key || !model_name) {
                return res.status(400).json({ error: 'Заполните все обязательные поля' });
            }
            const providers = await getAiProviders();
            const nextPriority = Math.max(0, ...providers.map(provider => Number(provider.priority) || 0)) + 1;
            const newProvider = await addAiProvider(name, base_url, api_key, model_name, nextPriority, timeout_ms || 15000);
            await reloadAIClient();
            res.json({ success: true, provider: newProvider });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/providers/test', async (req, res) => {
        try {
            const providers = await getAiProviders();
            const results = [];

            for (const prov of providers) {
                const start = Date.now();
                try {
                    const client = getCachedOpenAIClient(prov.base_url, prov.api_key, prov.timeout_ms || 10000);
                    const comp = await client.chat.completions.create({
                        model: prov.model_name,
                        messages: [{ role: 'user', content: 'Скажи "ОК"' }],
                        max_tokens: 10
                    });
                    const duration = Date.now() - start;
                    results.push({
                        id: prov.id,
                        name: prov.name,
                        status: 'SUCCESS',
                        durationMs: duration,
                        response: comp.choices[0]?.message?.content || 'OK'
                    });
                } catch (err) {
                    results.push({
                        id: prov.id,
                        name: prov.name,
                        status: 'FAILED',
                        error: err.message
                    });
                }
            }

            res.json({ success: true, results });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/image-generation/test', async (req, res) => {
        try {
            const { providerId, model, prompt, size = '1024x1024', imageDataUrl } = req.body || {};
            const normalizedPrompt = String(prompt || '').trim();
            if (!normalizedPrompt) return res.status(400).json({ error: 'Напиши prompt для изображения' });

            const providers = await getAiProviders();
            const provider = providerId
                ? providers.find(item => Number(item.id) === Number(providerId))
                : providers.find(item => String(item.model_name || '').toLowerCase().includes('image'));
            if (!provider) return res.status(404).json({ error: 'Провайдер для изображений не найден' });

            const selectedModel = String(model || provider.model_name || '').trim();
            if (!selectedModel) return res.status(400).json({ error: 'Не выбрана модель изображения' });
            if (imageDataUrl && (!String(imageDataUrl).startsWith('data:image/') || String(imageDataUrl).length > 15_000_000)) {
                return res.status(400).json({ error: 'Референс должен быть изображением до 10 МБ' });
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
            try {
                const endpoint = imageDataUrl
                    ? `${String(provider.base_url).replace(/\/+$/, '')}/chat/completions`
                    : `${String(provider.base_url).replace(/\/+$/, '')}/images/generations`;
                const payload = imageDataUrl
                    ? {
                        model: selectedModel,
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: `${normalizedPrompt}\n\nВерни именно сгенерированное изображение, а не только описание.` },
                                { type: 'image_url', image_url: { url: imageDataUrl } }
                            ]
                        }],
                        max_tokens: 1200
                    }
                    : {
                        model: selectedModel,
                        prompt: normalizedPrompt,
                        size,
                        n: 1,
                        response_format: 'b64_json'
                    };
                const upstream = await fetch(endpoint, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${provider.api_key}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                const raw = await upstream.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* upstream returned non-JSON */ }
                if (!upstream.ok) {
                    const detail = data?.error?.message || data?.message || raw.slice(0, 500) || `HTTP ${upstream.status}`;
                    return res.status(502).json({ error: `Bridge: ${detail}` });
                }

                if (imageDataUrl) {
                    const content = data?.choices?.[0]?.message?.content;
                    const text = typeof content === 'string' ? content : '';
                    const embeddedImage = text.match(/!\[image\]\((data:image\/[^;]+;base64,[^)]+)\)/i)?.[1] || null;
                    return res.json({ success: true, mode: 'reference', model: selectedModel, content: text, imageDataUrl: embeddedImage });
                }

                const image = data?.data?.[0];
                if (!image?.b64_json) return res.status(502).json({ error: 'Bridge не вернул байты изображения' });
                res.json({ success: true, mode: 'generation', model: selectedModel, mimeType: 'image/png', b64Json: image.b64_json, revisedPrompt: image.revised_prompt || normalizedPrompt });
            } finally {
                clearTimeout(timeout);
            }
        } catch (e) {
            if (e?.name === 'AbortError') return res.status(504).json({ error: 'Генерация не ответила за 10 минут' });
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/providers/:id/activate', async (req, res) => {
        try {
            const activated = await setActiveAiProvider(req.params.id);
            await reloadAIClient();
            res.json({ success: true, provider: activated });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/providers/:id/priority', async (req, res) => {
        try {
            const priority = Number(req.body?.priority);
            if (!Number.isInteger(priority) || priority < 1) return res.status(400).json({ error: 'Некорректный приоритет' });
            const provider = await updateProviderPriority(req.params.id, priority);
            if (!provider) return res.status(404).json({ error: 'Провайдер не найден' });
            await reloadAIClient();
            res.json({ success: true, provider });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/providers/:id', async (req, res) => {
        try {
            const deleted = await deleteAiProvider(req.params.id);
            if (!deleted) return res.status(404).json({ error: 'Провайдер не найден' });
            if (deleted.is_active) {
                const [fallback] = await getAiProviders();
                if (fallback) await setActiveAiProvider(fallback.id);
            }
            await reloadAIClient();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/llm-settings', async (req, res) => {
        try {
            const llmParams = await getLlmParams();
            const leraPromptsData = await getLeraPrompts();
            const routingSettings = await getRoutingSettings();
            const routingModules = await getRoutingPromptModules();
            res.json({
                success: true,
                llmParams,
                defaultParams: DEFAULT_LLM_PARAMS,
                prompts: leraPromptsData.prompts,
                fullPrompt: leraPromptsData.fullPrompt,
                routingSettings,
                memorySettings: await getMemorySettings(),
                routingModules,
                promptStudio: await getPromptStudioState(),
                pipeline: 'Two-Stage Routing'
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/llm-settings', async (req, res) => {
        try {
            const { temperature, presence_penalty, frequency_penalty, prompts, routingSettings, memorySettings } = req.body;
            let llmParams = null;
            if (temperature !== undefined || presence_penalty !== undefined || frequency_penalty !== undefined) {
                llmParams = await updateLlmParams({ temperature, presence_penalty, frequency_penalty });
            } else {
                llmParams = await getLlmParams();
            }

            let leraPromptsData = null;
            if (prompts && typeof prompts === 'object') {
                leraPromptsData = await updateLeraPrompts(prompts);
            } else {
                leraPromptsData = await getLeraPrompts();
            }
            const nextRoutingSettings = routingSettings && typeof routingSettings === 'object'
                ? await updateRoutingSettings(routingSettings)
                : await getRoutingSettings();
            const nextMemorySettings = memorySettings && typeof memorySettings === 'object'
                ? await setMemorySettings(memorySettings)
                : await getMemorySettings();

            res.json({
                success: true,
                llmParams,
                prompts: leraPromptsData.prompts,
                fullPrompt: leraPromptsData.fullPrompt,
                routingSettings: nextRoutingSettings,
                memorySettings: nextMemorySettings,
                routingModules: await getRoutingPromptModules(),
                pipeline: 'Two-Stage Routing'
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // ADVANCED AI SANDBOX — isolated prompt/model experiments only.
    // No route in this block writes production chat history, memories, world
    // state, Telegram messages, billing, or production prompt logs.
    // =========================================================================

    app.get('/api/sandbox/users', async (req, res) => {
        try {
            const queryText = String(req.query.q || '').trim();
            if (!queryText) return res.json({ success: true, users: [] });
            res.json({ success: true, users: await searchUsers(queryText, 12) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/sandbox/users/:id/context', async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const [user, events, memories] = await Promise.all([
                getUser(userId),
                getRecentConversationEvents(userId, 10),
                getUserMemories(userId, 30)
            ]);
            if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

            const eventHistory = events
                .filter(event => event.status === 'COMPLETED' && event.content && (
                    event.event_type === 'MESSAGE'
                    || event.event_type === 'INITIATIVE'
                ))
                .slice(-10)
                .map(event => ({
                    id: `event-${event.id}`,
                    role: event.role === 'lera' || event.role === 'assistant' ? 'assistant' : 'user',
                    content: event.content
                }));
            res.json({
                success: true,
                writes: 0,
                user,
                history: eventHistory,
                historySource: 'conversation_events',
                activeMemoryCount: memories.length
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/sandbox/presets', async (req, res) => {
        try {
            const presets = (await listSandboxPresets()).map(row => {
                const migrated = migratePresetToCurrent({ ...(row.config || {}), name: row.name });
                return { ...row, config: migrated.preset, migrated: migrated.migrated };
            });
            res.json({ success: true, presets });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/sandbox/prompt-studio', async (req, res) => {
        try {
            res.json({ success: true, ...(await getPromptStudioState()) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/prompt-studio/draft', async (req, res) => {
        try {
            const intent = String(req.body?.intent || 'CASUAL').toUpperCase();
            res.json({ success: true, ...(await savePromptStudioDraft(intent, req.body?.config || {})) });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/prompt-studio/publish', async (req, res) => {
        try {
            const intent = String(req.body?.intent || 'CASUAL').toUpperCase();
            res.json({ success: true, ...(await publishPromptStudioIntent(intent, req.body?.config)) });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/presets', async (req, res) => {
        try {
            const migrated = migratePresetToCurrent(req.body?.config || req.body || {});
            const name = String(req.body?.name || migrated.preset.name || '').trim();
            if (!name) return res.status(400).json({ error: 'Укажите имя пресета' });
            const preset = await createSandboxPreset({ name, slot: req.body?.slot || null, config: { ...migrated.preset, name } });
            res.status(201).json({ success: true, preset: { ...preset, config: { ...migrated.preset, name }, migrated: migrated.migrated } });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/sandbox/presets/:id', async (req, res) => {
        try {
            const existing = await getSandboxPreset(req.params.id);
            if (!existing) return res.status(404).json({ error: 'Пресет не найден' });
            const nextConfig = req.body?.config === undefined
                ? undefined
                : migratePresetToCurrent({ ...(req.body.config || {}), name: req.body.name || existing.name }).preset;
            const preset = await updateSandboxPreset(req.params.id, {
                name: req.body?.name,
                slot: req.body?.slot,
                config: nextConfig
            });
            res.json({ success: true, preset });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/sandbox/presets/:id', async (req, res) => {
        try {
            const preset = await deleteSandboxPreset(req.params.id);
            if (!preset) return res.status(404).json({ error: 'Пресет не найден' });
            res.json({ success: true, preset });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/presets/:id/migrate', async (req, res) => {
        try {
            const preset = await getSandboxPreset(req.params.id);
            if (!preset) return res.status(404).json({ error: 'Пресет не найден' });
            const migrated = migratePresetToCurrent({ ...(preset.config || {}), name: preset.name });
            // Deliberately read-only: a user must explicitly save the migration.
            res.json({ success: true, preset: { ...preset, config: migrated.preset }, migrated: migrated.migrated, writes: 0 });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/sandbox/runs', async (req, res) => {
        try {
            res.json({ success: true, runs: await getSandboxRuns(req.query.limit) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/sandbox/runs/:id', async (req, res) => {
        try {
            const run = await getSandboxRun(req.params.id);
            if (!run) return res.status(404).json({ error: 'Sandbox-run не найден' });
            res.json({ success: true, run });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/generate', async (req, res) => {
        try {
            res.json(await generateSandbox(req.body || {}));
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/ab-test', async (req, res) => {
        try {
            res.json(await generateSandboxAbTest(req.body || {}));
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/sandbox/apply-production', async (req, res) => {
        try {
            const { preset } = migratePresetToCurrent(req.body?.preset || req.body || {});
            const llmParams = await updateLlmParams({
                temperature: preset.sampling.temperature,
                presence_penalty: preset.sampling.presence_penalty,
                frequency_penalty: preset.sampling.frequency_penalty
            });
            res.json({
                success: true,
                llmParams,
                applied: ['temperature', 'presence_penalty', 'frequency_penalty'],
                skipped: ['top_p', 'max_tokens', 'repetition_penalty', 'seed'],
                message: 'Применены только поддерживаемые production-настройки. Промпт, история, мир и Telegram не менялись.'
            });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.patch('/api/admin/providers/:id/capabilities', async (req, res) => {
        try {
            const provider = await updateAiProviderSamplingCapabilities(req.params.id, req.body?.samplingCapabilities);
            if (!provider) return res.status(404).json({ error: 'Провайдер не найден' });
            res.json({ success: true, provider });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/admin/chat-history/clear', async (req, res) => {
        try {
            const deleted = await clearAllChatHistory();
            res.json({ success: true, deleted });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/prompt-day-context', async (req, res) => {
        try {
            // Public preview: the shared world/day state only, never a user's chat memory.
            const context = await ContextBuilder.buildTelegramContextDetailed(null);
            res.json({ success: true, context: context.analysis });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 5: TELEGRAM CHANNEL POSTER & RETARGETING FUNNELS
    // =========================================================================

    app.get('/api/admin/channel/settings', async (req, res) => {
        try {
            const settings = await getChannelPosterSettings();
            const channelId = settings.channel_id || await getSetting('bonus_channel_id', '');
            const channelUrl = await getSetting('bonus_channel_url', '');
            const freeMode = await isFreeModeEnabled();
            res.json({ success: true, channelId, channelUrl, settings, freeMode });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/settings', async (req, res) => {
        try {
            const { channelId, channelUrl, isEnabled, frequencyHours, topics, topicWeights, messagesCount, mediaMode, promptBlocks, temperature, inheritLeraPrompt, includeDayContext } = req.body;
            const allowedTopics = ['thoughts', 'flirt', 'life', 'jokes', 'questions'];
            const safeTopics = Array.isArray(topics) ? topics.filter(topic => allowedTopics.includes(topic)) : [];
            const activeTopics = safeTopics.length ? safeTopics : ['thoughts'];
            const safeWeights = normalizeTopicDistribution(activeTopics, Object.fromEntries(
                allowedTopics.map(topic => [topic, Math.max(0, Math.min(100, Number(topicWeights?.[topic]) || 0))])
            ));
            await Promise.all([
                setSetting('channel_id', String(channelId || '').trim()),
                setSetting('bonus_channel_url', String(channelUrl || '').trim()),
                setSetting('channel_poster_enabled', isEnabled ? 'true' : 'false'),
                setSetting('channel_frequency_hours', String(Math.max(1, Math.min(168, Number(frequencyHours) || 4)))),
                setSetting('channel_topics', JSON.stringify(activeTopics)),
                setSetting('channel_topic_weights', JSON.stringify(safeWeights)),
                setSetting('channel_messages_count', ['1', '2', '3', 'random'].includes(String(messagesCount)) ? String(messagesCount) : '1'),
                setSetting('channel_media_mode', ['none', 'db_photo'].includes(mediaMode) ? mediaMode : 'none'),
                setSetting('channel_prompt_blocks', JSON.stringify(Object.fromEntries(['voice', 'context', 'restrictions', 'cta'].map(key => [key, String(promptBlocks?.[key] || '').trim().slice(0, 1200)])))),
                setSetting('channel_temperature', String(Math.max(0, Math.min(2, Number(temperature ?? 1.1))))),
                setSetting('channel_inherit_lera_prompt', inheritLeraPrompt === false ? 'false' : 'true'),
                setSetting('channel_include_day_context', includeDayContext === false ? 'false' : 'true')
            ]);
            res.json({ success: true, settings: await getChannelPosterSettings() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/channel/history', async (req, res) => {
        try {
            const posts = await getChannelPostHistory(Math.min(parseInt(req.query.limit, 10) || 30, 100));
            res.json({ success: true, posts: posts.slice().reverse() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/publish-now', async (req, res) => {
        try {
            if (!botInstance) return res.status(500).json({ error: 'Бот не инициализирован' });
            const result = await generateAndPublishChannelPost(botInstance);
            res.json({ success: true, result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/draft', async (req, res) => {
        try {
            const draft = await generateChannelPostDraft();
            res.json({ success: true, draft });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/publish-draft', async (req, res) => {
        try {
            const result = await publishChannelDraft(botInstance, req.body || {});
            res.json({ success: true, result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/channel/history/:id', async (req, res) => {
        try {
            const deleted = await deleteChannelPostLog(req.params.id);
            if (!deleted) return res.status(404).json({ error: 'Запись истории не найдена' });
            res.json({ success: true, deleted });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/funnels/toggle-free-mode', async (req, res) => {
        try {
            const current = await isFreeModeEnabled();
            await toggleFreeMode(!current);
            res.json({ success: true, free_mode_enabled: !current });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/funnels/reset-limits', async (req, res) => {
        try {
            const { textCount } = req.body;
            const count = await resetAllFreeRequests(parseInt(textCount, 10) || 10);
            res.json({ success: true, count, message: 'Лимиты всем пользователям сброшены!' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/broadcast/status', async (req, res) => {
        try {
            const counts = await withTimeout(broadcastQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'));
            res.json({ success: true, counts, paused: await withTimeout(broadcastQueue.isPaused()) });
        } catch (e) {
            res.json({ success: true, available: false, counts: {}, paused: null, error: `Redis/BullMQ недоступен: ${e.message}` });
        }
    });

    app.post('/api/admin/broadcast/control', async (req, res) => {
        try {
            if (req.body?.action === 'pause') await withTimeout(broadcastQueue.pause());
            else if (req.body?.action === 'resume') await withTimeout(broadcastQueue.resume());
            else if (req.body?.action === 'clean') {
                await withTimeout(broadcastQueue.clean(24 * 60 * 60 * 1000, 1000, 'completed'));
                await withTimeout(broadcastQueue.clean(7 * 24 * 60 * 60 * 1000, 1000, 'failed'));
            } else return res.status(400).json({ error: 'Неизвестное действие' });
            res.json({ success: true, paused: await withTimeout(broadcastQueue.isPaused()), counts: await withTimeout(broadcastQueue.getJobCounts()) });
        } catch (e) {
            res.status(503).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 6: USERS, CONVERSATIONS & USER FACTS INSPECTOR
    // =========================================================================

    app.get('/api/admin/stats', async (req, res) => {
        try {
            const stats = await getAdminStats();
            const providers = await getAiProviders();
            const activeProvider = providers.find(p => p.is_active);
            res.json({
                success: true,
                stats,
                activeProvider: activeProvider || null
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/users', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit, 10) || 50;
            const offset = parseInt(req.query.offset, 10) || 0;
            const usersRes = await query('SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
            const totalRes = await query('SELECT COUNT(*) FROM users');
            res.json({
                success: true,
                users: usersRes.rows,
                total: parseInt(totalRes.rows[0].count, 10) || 0
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/users/search', async (req, res) => {
        try {
            const users = await searchUsers(req.query.q || '', 25);
            res.json({ success: true, users });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/users/:id', async (req, res) => {
        try {
            const user = await getUser(req.params.id);
            if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
            res.json({ success: true, user });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/users/:id/full', async (req, res) => {
        try {
            const [user, payments, facts, conversations, relationship] = await Promise.all([
                getUser(req.params.id),
                getPaymentHistory(req.params.id, 50),
                getUserMemoriesAdmin(req.params.id, true),
                getRecentConversationEvents(req.params.id, 80),
                getUserRelationshipAdmin(req.params.id, 30)
            ]);
            if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
            res.json({ success: true, user, payments, facts, conversations, relationship });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/relationships/:userId', async (req, res) => {
        try {
            const relationship = await setUserRelationshipAdmin(req.params.userId, {
                trust: req.body.trust,
                affection: req.body.affection,
                irritation: req.body.irritation
            });
            res.json({ success: true, relationship });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/users/:id/action', async (req, res) => {
        try {
            const userId = req.params.id;
            const { action } = req.body;
            let user = null;
            if (action === 'set_balances') {
                const text = Math.max(0, Math.min(1000000, parseInt(req.body.textBalance, 10) || 0));
                const images = Math.max(0, Math.min(100000, parseInt(req.body.imageBalance, 10) || 0));
                await adminSetTextBalance(userId, text);
                user = await adminSetImageBalance(userId, images);
            } else if (action === 'block') {
                user = await setBlockStatus(userId, true);
            } else if (action === 'unblock') {
                user = await setBlockStatus(userId, false);
            } else if (action === 'grant_package') {
                user = await grantPackage(userId, req.body.packageType);
                if (!user) return res.status(400).json({ error: 'Неизвестный пакет выдачи' });
            } else if (action === 'grant_store_package') {
                const key = String(req.body.packageKey || '');
                if (!PKG_KEYS.includes(key)) return res.status(400).json({ error: 'Неизвестный пакет магазина' });
                const value = String(await getSetting(`pkg_${key}`, PKG_DEFAULTS[key]));
                const [, , text, images] = value.split('_').map(v => parseInt(v, 10) || 0);
                await query(`UPDATE users SET free_requests_left = free_requests_left + $1,
                    image_balance = image_balance + $2,
                    is_premium = CASE WHEN $3 = 'full' THEN TRUE ELSE is_premium END
                    WHERE telegram_id = $4`, [text, images, key, userId]);
                user = await getUser(userId);
            } else {
                return res.status(400).json({ error: 'Неизвестное действие CRM' });
            }
            if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
            res.json({ success: true, user });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/conversations/:userId', async (req, res) => {
        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
            const events = await getRecentConversationEvents(req.params.userId, limit);
            res.json({
                success: true,
                events,
                dsl: events.map(formatConversationEvent).join('\n')
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 6b: USER MEMORY (user_memories) — full CRUD + digests
    // =========================================================================

    app.get('/api/admin/memory/facts/:userId', async (req, res) => {
        try {
            const facts = await getUserMemoriesAdmin(req.params.userId, true);
            res.json({ success: true, facts });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/memory/facts/:userId', async (req, res) => {
        try {
            const { fact } = req.body;
            if (!fact || !String(fact).trim()) return res.status(400).json({ error: 'Пустой факт' });
            const created = await saveUserMemory(req.params.userId, String(fact).trim());
            if (!created) return res.status(500).json({ error: 'Не удалось сохранить факт' });
            res.json({ success: true, fact: created });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/memory/facts/:id', async (req, res) => {
        try {
            const { fact, isActive } = req.body;
            let updated = null;
            if (fact !== undefined && String(fact).trim()) {
                updated = await updateUserMemoryFact(req.params.id, String(fact).trim());
            }
            if (isActive !== undefined) {
                updated = await setUserMemoryActive(req.params.id, isActive);
            }
            if (!updated) return res.status(404).json({ error: 'Факт не найден' });
            res.json({ success: true, fact: updated });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/memory/facts/:id', async (req, res) => {
        try {
            const deleted = await deleteUserMemory(req.params.id);
            res.json({ success: true, fact: deleted });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/memory/digests', async (req, res) => {
        try {
            const digests = await StateRepository.getMemoryDigests({
                streamType: req.query.stream || null,
                userId: req.query.userId ? Number(req.query.userId) : null,
                limit: Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 200)
            });
            res.json({ success: true, digests });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/memory/digests/generate', async (req, res) => {
        try {
            const layer = String(req.body?.layer || 'DAILY').toUpperCase();
            const userId = req.body?.userId ? Number(req.body.userId) : null;
            let summary = null;
            if (userId) {
                if (layer === 'WEEKLY') summary = await MemorySummarizer.generateWeeklyUserDigest(userId);
                else if (layer === 'MONTHLY') summary = await MemorySummarizer.generateMonthlyUserDigest(userId);
                else summary = await MemorySummarizer.generateDailyUserDigest(userId);
            } else if (layer === 'WEEKLY') summary = await MemorySummarizer.generateWeeklyDigest();
            else if (layer === 'MONTHLY') summary = await MemorySummarizer.generateMonthlyDigest();
            else summary = await MemorySummarizer.generateDailyLifeDigest();

            res.json({
                success: true,
                layer,
                userId,
                summary,
                message: summary
                    ? `Дайджест ${layer} сгенерирован.`
                    : `Недостаточно данных для ${layer} (нужны записи дневника / нижние слои).`
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 6c: PROMPT INSPECTOR (real raw prompt + response per message)
    // =========================================================================

    app.get('/api/admin/prompt-logs', async (req, res) => {
        try {
            const logs = await getPromptLogs({
                userId: req.query.userId ? Number(req.query.userId) : null,
                limit: Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200),
                offset: parseInt(req.query.offset, 10) || 0
            });
            res.json({ success: true, logs });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/prompt-logs/:id', async (req, res) => {
        try {
            const log = await getPromptLogById(req.params.id);
            if (!log) return res.status(404).json({ error: 'Лог не найден' });

            const facts = await getUserMemoriesAdmin(log.user_id, false).catch(() => []);
            const quality = evaluateLeraReply(
                log.parsed_response || log.raw_response || '',
                log.user_text || '',
                null,
                { mode: ['CASUAL', 'EROTIC', 'JOKE'].includes(log.mode) ? log.mode : null }
            );
            res.json({
                success: true,
                log,
                layers: {
                    physics: log.state_snapshot || {},
                    radiant_context: log.radiant_context || '',
                    memory_used: log.memory_used || [],
                    current_facts: facts,
                    system_prompt: log.system_prompt || '',
                    messages: log.messages || [],
                    raw_response: log.raw_response || '',
                    parsed_response: log.parsed_response || '',
                    generation_trace: log.generation_trace || [],
                    quality
                }, quality
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/prompt-logs/:id/judge', async (req, res) => {
        try {
            const log = await getPromptLogById(req.params.id);
            if (!log) return res.status(404).json({ error: 'Лог не найден' });
            const quality = evaluateLeraReply(
                log.parsed_response || log.raw_response || '',
                log.user_text || '',
                null,
                { mode: ['CASUAL', 'EROTIC', 'JOKE'].includes(log.mode) ? log.mode : null }
            );
            res.json({ success: true, safe: true, writes: 0, judge: { type: 'quality-gate', quality, explanation: quality.passed ? 'Ответ не содержит технической утечки и остаётся в роли.' : `Найдены нарушения: ${quality.violations.join(', ')}` } });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    /**
     * Live prompt constructor: builds the context that WOULD be sent with temporary
     * stat overrides, and optionally runs one LLM call. Nothing is written to
     * sim_state — the real simulation is untouched.
     */
    app.post('/api/admin/prompt-preview', async (req, res) => {
        try {
            const { userId, overrides = {}, runLlm = false, userText = '' } = req.body;
            if (!userId) return res.status(400).json({ error: 'Не передан userId' });

            const user = await getUser(userId);
            if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

            const context = await ContextBuilder.buildTelegramContext(userId, { overrides });
            const routingSettings = await getRoutingSettings();
            const history = (await getRecentConversationEvents(userId, 3).catch(() => []))
                .filter(event => event.status === 'COMPLETED'
                    && event.content
                    && (event.event_type === 'MESSAGE' || event.event_type === 'INITIATIVE'))
                .map(event => ({
                    role: event.role === 'lera' || event.role === 'assistant' ? 'assistant' : 'user',
                    content: event.content
                }));
            const classifier = userText
                ? await classifyIntent({ userId, userText, history })
                : { mode: 'CASUAL', bypassed: true };
            const facts = await getUserMemoriesAdmin(userId, false);
            const memoryBlock = facts.length
                ? facts.map(item => `- ${item.fact}`).join('\n')
                : 'Пока нет сохранённых фактов о пользователе.';
            const routedBase = await getRoutedSystemPrompt(classifier.mode || 'CASUAL');
            const completeSystemPrompt = `${routedBase}\n\n${context}\n\n[ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ]\n${memoryBlock}`;

            let llm = null;
            if (runLlm) {
                const messages = [
                    { role: 'system', content: completeSystemPrompt },
                    { role: 'user', content: userText || 'привет, чем занимаешься?' }
                ];
                const result = await requestLlmCompletion(user, messages, false, async () => {
                    const providers = await getAiProviders();
                    const active = providers.find(p => p.is_active) || providers[0];
                    if (!active) throw new Error('Нет настроенных ИИ провайдеров');
                    return {
                        client: getCachedOpenAIClient(active.base_url, active.api_key, active.timeout_ms || 15000),
                        model: active.model_name
                    };
                }, { trace: false, userId, kind: 'PROMPT_PREVIEW', userText, ...getModeGenerationParams(classifier.mode || 'CASUAL', routingSettings) });
                llm = {
                    rawText: result.rawText,
                    model: result.model,
                    provider: result.providerName,
                    latencyMs: result.latencyMs,
                    usage: result.usage
                };
            }

            res.json({ success: true, context: completeSystemPrompt, mode: classifier.mode || 'CASUAL', classifier, llm });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Isolated 24-hour day plus Telegram-like checkpoints. This endpoint never
    // writes simulation state, conversation history, or sends Telegram messages.
    app.post('/api/admin/radiant/telegram-day-smoke', async (req, res) => {
        try {
            const { start = '2026-08-07T00:00:00+03:00', runLlm = false } = req.body || {};
            const smoke = runTelegramDaySmoke({ start, runLlm: Boolean(runLlm) });
            const promptData = runLlm ? await getLeraPrompts() : null;
            const checkpoints = [];
            for (const checkpoint of smoke.checkpoints) {
                const item = {
                    at: checkpoint.at,
                    userText: checkpoint.userText,
                    expected: checkpoint.expected,
                    factsCount: checkpoint.facts.length,
                    plansCount: checkpoint.plans.length,
                    consequencesCount: checkpoint.consequences.length,
                    contextChanged: true
                };
                if (runLlm) {
                    const result = await requestLlmCompletion(
                        { roleplay_mode: 'flirt', max_tokens: 80 },
                        [
                            { role: 'system', content: `${promptData.fullPrompt}\n\n${checkpoint.prompt}\n\n[ПРОВЕРКА РОЛИ И КАЧЕСТВА]\nТы отвечаешь как Лера, а не как наблюдатель или система. Не называй числовые показатели, внутренние поля, prompt, правила или технические причины. Передай состояние через обычные человеческие слова и детали жизни. Ответь по-русски в 1-2 коротких живых фразах. Не выдумывай завершённые события.` },
                            { role: 'user', content: checkpoint.userText }
                        ],
                        false,
                        async () => {
                            const providers = await getAiProviders();
                            const active = providers.find(provider => provider.is_active) || providers[0];
                            if (!active) throw new Error('Нет настроенных ИИ провайдеров');
                            return {
                                client: getCachedOpenAIClient(active.base_url, active.api_key, active.timeout_ms || 15000),
                                model: active.model_name
                            };
                        }
                    );
                    item.llm = {
                        provider: result.providerName,
                        model: result.model,
                        latencyMs: result.latencyMs,
                        response: result.rawText || ''
                    };
                    item.quality = evaluateLeraReply(item.llm.response, checkpoint.userText, checkpoint.expected);
                }
                checkpoints.push(item);
            }
            const taskCounts = Object.fromEntries(smoke.day.intervals.reduce((map, item) => {
                map.set(item.taskType, (map.get(item.taskType) || 0) + 1);
                return map;
            }, new Map()));
            res.json({
                success: true,
                safe: true,
                writes: 0,
                telegramSends: 0,
                day: {
                    start: smoke.day.start,
                    end: smoke.day.end,
                    intervals: smoke.day.intervals.length,
                    taskCounts,
                    facts: smoke.day.facts.length,
                    commitments: smoke.day.commitments.length,
                    consequences: smoke.day.consequences.length,
                    randomEvents: smoke.day.randomEvents.length,
                    finalLocation: smoke.day.state.location_id,
                    finalMood: smoke.day.mood
                },
                checkpoints
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/admin/users/send-message', async (req, res) => {
        try {
            const { userId, text } = req.body;
            if (!userId || !text) return res.status(400).json({ error: 'Не переданы данные' });
            if (!botInstance) return res.status(500).json({ error: 'Бот не инициализирован' });
            await botInstance.telegram.sendMessage(userId, text, { parse_mode: 'HTML' });
            await appendConversationEvent({
                userId,
                eventType: 'MESSAGE',
                role: 'lera',
                content: text,
                occurredAt: new Date(),
                metadata: { source: 'ADMIN_LIVE_CHAT' },
                status: 'COMPLETED'
            }).catch(() => null);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 7: PACKAGES CRM & PROMOCODES
    // =========================================================================

    const PKG_KEYS = ['t50', 't200', 't500', 'i5', 'i15', 'i50', 'lite', 'medium', 'hard', 'full'];
    const PKG_DEFAULTS = {
        t50: '35_50_50_0', t200: '125_150_200_0', t500: '250_300_500_0',
        i5: '35_50_0_5', i15: '125_150_0_15', i50: '300_390_0_50',
        lite: '65_80_50_5', medium: '150_200_200_20', hard: '350_500_500_50', full: '750_999_1000_100'
    };

    app.get('/api/admin/packages', async (req, res) => {
        try {
            const packages = {};
            for (const key of PKG_KEYS) {
                const val = String(await getSetting(`pkg_${key}`, PKG_DEFAULTS[key]) || PKG_DEFAULTS[key]);
                const parts = val.split('_');
                packages[key] = {
                    stars: parseInt(parts[0], 10) || 0,
                    rub: parseInt(parts[1], 10) || 0,
                    text: parseInt(parts[2], 10) || 0,
                    img: parseInt(parts[3], 10) || 0
                };
            }
            res.json({ success: true, packages });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/packages', async (req, res) => {
        try {
            const { key, stars, rub, text, img } = req.body;
            if (!PKG_KEYS.includes(key)) return res.status(400).json({ error: 'Неизвестный пакет' });
            const val = `${parseInt(stars, 10) || 0}_${parseInt(rub, 10) || 0}_${parseInt(text, 10) || 0}_${parseInt(img, 10) || 0}`;
            await setSetting(`pkg_${key}`, val);
            res.json({ success: true, package: { key, stars, rub, text, img } });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/promocodes', async (req, res) => {
        try {
            const promocodes = await getAllPromocodes();
            res.json({ success: true, promocodes });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/promocodes', async (req, res) => {
        try {
            const { code, maxActivations, bonusRequests, bonusImages, discountPercent } = req.body;
            const newPromo = await createPromocode(code, maxActivations, bonusRequests, bonusImages, discountPercent);
            res.json({ success: true, promocode: newPromo });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/promocodes/:id', async (req, res) => {
        try {
            await deletePromocode(req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/broadcast', async (req, res) => {
        try {
            const { text, mediaFileId, mediaType = 'text', button = 'none', segment = 'all' } = req.body;
            if (!text || !text.trim()) return res.status(400).json({ error: 'Текст рассылки пуст' });
            const segmentSql = {
                all: 'SELECT telegram_id FROM users WHERE is_blocked = FALSE',
                purchased: 'SELECT telegram_id FROM users WHERE is_blocked = FALSE AND total_spent > 0',
                free: 'SELECT telegram_id FROM users WHERE is_blocked = FALSE AND total_spent = 0',
                inactive_24h: "SELECT telegram_id FROM users WHERE is_blocked = FALSE AND last_active_at < NOW() - INTERVAL '24 hours'",
                premium: 'SELECT telegram_id FROM users WHERE is_blocked = FALSE AND is_premium = TRUE'
            };
            const users = await query(segmentSql[segment] || segmentSql.all);
            const userIds = users.rows.map(row => row.telegram_id);
            const safeType = ['text', 'photo', 'video', 'document', 'animation'].includes(mediaType) ? mediaType : 'text';
            const msgData = {
                type: mediaFileId ? safeType : 'text',
                text: text.trim(),
                caption: text.trim(),
                file_id: mediaFileId || null,
                btn: button
            };

            for (const uid of userIds) {
                await broadcastQueue.add('send-msg', { userId: uid, msgData });
            }

            res.json({ success: true, count: userIds.length, segment, message: `Рассылка поставлена в очередь для ${userIds.length} пользователей.` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // =========================================================================
    // MODULE 8: REAL-TIME SERVER LOGS (SSE)
    // =========================================================================

    app.get('/api/admin/logs', (req, res) => {
        const level = String(req.query.level || '').toUpperCase();
        const search = String(req.query.search || '').toLowerCase();
        const logs = getRecentLogs().filter(item =>
            (!level || item.type === level) && (!search || item.message.toLowerCase().includes(search))
        );
        res.json({ success: true, logs });
    });

    app.get('/api/admin/diagnostics', async (req, res) => {
        const startedAt = Date.now();
        let db = { ok: false, latencyMs: null, error: null };
        let redis = { ok: false, counts: null, error: null };
        try {
            const dbStart = Date.now();
            await query('SELECT 1');
            db = { ok: true, latencyMs: Date.now() - dbStart, error: null };
        } catch (e) {
            db.error = e.message;
        }
        try {
            redis.counts = await withTimeout(broadcastQueue.getJobCounts('waiting', 'active', 'failed', 'delayed'));
            redis.ok = true;
        } catch (e) {
            redis.error = e.message;
        }
        const [promptCount, rationaleCount, queueCount] = await Promise.all([
            query('SELECT COUNT(*)::int AS count FROM prompt_logs').catch(() => ({ rows: [{ count: 0 }] })),
            query('SELECT COUNT(*)::int AS count FROM sim_rationale').catch(() => ({ rows: [{ count: 0 }] })),
            query("SELECT COUNT(*)::int AS count FROM sim_queue WHERE status IN ('PENDING','IN_PROGRESS','PAUSED')").catch(() => ({ rows: [{ count: 0 }] }))
        ]);
        res.json({
            success: true,
            uptimeSeconds: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
            checkedInMs: Date.now() - startedAt,
            db,
            redis,
            worker: SimulationWorker.getStatus(),
            rows: { prompt_logs: promptCount.rows[0].count, sim_rationale: rationaleCount.rows[0].count, active_queue: queueCount.rows[0].count }
        });
    });

    app.post('/api/admin/diagnostics/prune', async (req, res) => {
        try {
            const result = await StateRepository.pruneOperationalLogs({
                promptDays: Math.max(1, parseInt(req.body?.promptDays, 10) || 30),
                rationaleDays: Math.max(1, parseInt(req.body?.rationaleDays, 10) || 14),
                diaryDays: Math.max(1, parseInt(req.body?.diaryDays, 10) || 90)
            });
            res.json({ success: true, deleted: result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/logs/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

        const onLog = (logItem) => {
            res.write(`data: ${JSON.stringify(logItem)}\n\n`);
        };

        logEmitter.on('log', onLog);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);

        req.on('close', () => {
            clearInterval(heartbeat);
            logEmitter.off('log', onLog);
        });
    });

    app.get('/api/admin/devtool/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        const send = event => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        send({ type: 'connected', timestamp: new Date().toISOString() });
        devtoolEvents.on('event', send);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
        req.on('close', () => { clearInterval(heartbeat); devtoolEvents.off('event', send); });
    });

    app.listen(PORT, () => {
        console.log(`🌐 [ADMIN WEB] Локальная веб-админка Radiant Admin Ultimate 2.0 запущена: http://localhost:${PORT}`);
    });
}
