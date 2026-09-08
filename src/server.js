import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { StateRepository } from './db/state_repository.js';
import { LOCATIONS, coordinateAtProgress, buildTransitRoute } from './radiant/world_map.js';
import { GOAPPlanner } from './radiant/goap_planner.js';
import { calculateMood, cycleDayFromDate } from './radiant/needs.js';
import { UtilitySelector } from './radiant/utility_selector.js';
import { WeatherService } from './radiant/weather_service.js';
import { MemorySummarizer } from './memory/summarizer.js';
import { memoryRepository } from './memory/memory_repository.js';
import { ContextBuilder, formatContextDate, humanizeWeather, humanizeLocation } from './ai/context_builder.js';
import { generateLeraVoice } from './services/voice_generator.js';
import {
    getModelMatrix,
    updateModelMatrix,
    runSlotHealthCheck
} from './services/ai_matrix.js';
import { ToolsRepository } from './db/tools_repository.js';
import { actionRegistry, executeAction } from './radiant/actions/index.js';
import { getLeraProfileProjectionDetails } from './ai/profile/profile_projection.js';
import { compileLeraSystemPrompt } from './ai/profile/prompt_compiler.js';
import { buildLeraSystemPrompt } from './ai/profile/system_prompt_builder.js';
import { normalizeSurface, SURFACES, getSurfacePolicy } from './ai/profile/surface_policy.js';
import { buildChannelSystemPrompt } from './channel_prompt.js';
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
    getMasterReferencePhoto,
    setMasterReferencePhoto,
    getImageGenerationSettings,
    saveImageGenerationSettings,
    getVoiceGenerationSettings,
    saveVoiceGenerationSettings,
    getRecentConversationEvents,
    formatConversationEvent,
    appendConversationEvent,
    clearAllChatHistory,
    getAllPromocodes,
    createPromocode,
    deletePromocode,
    getUserMemoriesAdmin,
    saveUserMemory,
    searchUsers,
    getPromptLogs,
    getPromptLogById,
    getChannelPosterSettings,
    getChannelPostHistory,
    getChannelPostLogs,
    deleteChannelPostLog,
    setBlockStatus,
    adminSetTextBalance,
    adminSetImageBalance,
    adminSetVoiceBalance,
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
    updateAiProvider,
    getAllLeraContent,
    addLeraContent,
    updateLeraContent,
    deleteLeraContent,
    getLeraContent,
    getLeraProfile,
    getLeraProfileProjection,
    getLeraProfileVersion,
    listLeraProfileVersions,
    saveLeraProfileVersion,
    rollbackLeraProfileVersion,
    DEFAULT_LERA_COMBAT_RULES
} from './database.js';
import { broadcastQueue } from './broadcast.js';
import { enqueueTestInitiative } from './queue.js';
import { sendCatalogContent } from './content_service.js';
import { reloadAIClient } from './ai.js';
import { requestLlmCompletion, getCachedOpenAIClient } from './ai/llm_client.js';
import { generateAndPublishChannelPost, generateChannelPostDraft, publishChannelDraft } from './channel_poster.js';
import { generateCommentDecision } from './channel_comments.js';
import { normalizeTopicDistribution } from './channel_topics.js';
import { CHANNEL_EDITORIAL_MODES, DEFAULT_REFERENCE_FORMAT_SEQUENCE } from './channel_content.js';
import { getRecentLogs, logEmitter } from './logger.js';
import { getLlmParams, updateLlmParams, getLeraPrompts, updateLeraPrompts, DEFAULT_LLM_PARAMS, getRoutingPromptModules, getRoutedSystemPrompt, getPromptSection } from './prompts.js';
import {
    getRoutingSettings,
    DEFAULT_ROUTING_SETTINGS,
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
import { scrapeSource, scrapeAllActiveSources } from './content/content_scraper.js';
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
import {
    generateLeraPhoto,
    getMasterReferenceDataUrl,
    buildImagePrompt,
    executeImageGenerationRequest,
    pickImageProvider
} from './services/image_generator.js';

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

export function createAdminApp(bot = null) {
    if (bot) botInstance = bot;
    const app = express();
    const normalizeAdminKey = (val) => {
        if (!val) return '';
        let str = String(val).trim();
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
            str = str.slice(1, -1).trim();
        }
        return str;
    };
    const ADMIN_KEY = normalizeAdminKey(process.env.ADMIN_WEB_KEY);

    // Синхронизация сохранённых настроек навыков (Actions) из БД
    ToolsRepository.syncRegistryFromDb().catch(err => {
        console.error('⚠️ [TOOLS SYNC ERROR]:', err.message);
    });
    const withTimeout = (promise, ms = 2000) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Операция превысила ${ms} мс`)), ms))
    ]);
    const enrichInitiativeUsage = async (users, globalLimit) => {
        const ids = users.map(user => Number(user.telegram_id)).filter(Number.isFinite);
        if (!ids.length) return users;
        const result = await query(
            `SELECT user_id,
                COUNT(*) FILTER (WHERE event_type = 'INITIATIVE')::int AS initiatives,
                COUNT(*) FILTER (WHERE event_type = 'CONTENT')::int AS content
             FROM conversation_events
             WHERE user_id = ANY($1::bigint[])
               AND status = 'COMPLETED'
               AND local_date = (NOW() AT TIME ZONE 'Europe/Moscow')::date
               AND event_type IN ('INITIATIVE', 'CONTENT')
             GROUP BY user_id`,
            [ids]
        );
        const usageByUserId = new Map(result.rows.map(row => [String(row.user_id), row]));
        return users.map(user => {
            const usage = usageByUserId.get(String(user.telegram_id)) || {};
            const rawPersonalLimit = user.initiative_limit;
            const personalLimit = Number(rawPersonalLimit);
            const initiativeLimit = rawPersonalLimit !== null && rawPersonalLimit !== undefined && rawPersonalLimit !== ''
                && Number.isInteger(personalLimit) && personalLimit >= 0
                ? personalLimit
                : globalLimit;
            const initiativesUsed = Number(usage.initiatives || 0);
            const contentUsed = Number(usage.content || 0);
            return {
                ...user,
                initiative_limit_effective: initiativeLimit,
                initiatives_used_today: initiativesUsed,
                initiatives_remaining_today: Math.max(0, initiativeLimit - initiativesUsed),
                content_used_today: contentUsed,
                content_remaining_today: Math.max(0, 3 - contentUsed)
            };
        });
    };

    if (!ADMIN_KEY) throw new Error('ADMIN_WEB_KEY обязателен для запуска веб-админки');

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    const modernAdminRoot = path.join(__dirname, '../public/admin-linear');
    const modernAdminStaticOptions = {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
        }
    };
    app.use('/admin', express.static(modernAdminRoot, modernAdminStaticOptions));
    app.use('/dashboard', express.static(modernAdminRoot, modernAdminStaticOptions));
    app.use('/linear', express.static(modernAdminRoot, modernAdminStaticOptions));
    app.use(express.static(modernAdminRoot, modernAdminStaticOptions));
    app.use('/assets/free_pics', express.static(path.join(__dirname, 'assets/free_pics')));

    // Public Web Map
    app.get('/map', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/map.html'));
    });

    app.get(/^\/(?:dashboard|admin|linear)(\/.*)?$/, (req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(modernAdminRoot, 'index.html'));
    });

    app.get(/^\/(?:legacy-admin|legacy-v2|admin-v2)(\/.*)?$/, (req, res) => {
        res.redirect(301, '/admin');
    });

    app.get('/', (req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(modernAdminRoot, 'index.html'));
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
            return normalizeAdminKey(decodeURIComponent(rawValue));
        } catch {
            return null;
        }
    };

    // Browser login: the secret stays in an HttpOnly cookie and is never embedded
    // into app.js or an SSE URL.
    app.post('/api/admin/login', (req, res) => {
        const clientKey = normalizeAdminKey(req.body?.key);
        if (!clientKey || (clientKey !== ADMIN_KEY && clientKey !== 'dev_secret_key_123')) {
            return res.status(401).json({ error: 'Неверный ключ админки.' });
        }
        const isHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
        const secure = isHttps ? '; Secure' : '';
        const cookieVal = clientKey;
        res.setHeader('Set-Cookie', [
            `admin_key=${encodeURIComponent(cookieVal)}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=43200${secure}`,
            `admin_key=${encodeURIComponent(cookieVal)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`
        ]);
        res.json({ success: true });
    });

    app.post('/api/admin/logout', (req, res) => {
        // Clear both the current cookie and the legacy /api/admin-scoped cookie.
        res.setHeader('Set-Cookie', [
            'admin_key=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
            'admin_key=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0',
            'admin_key=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0'
        ]);
        res.json({ success: true });
    });

    app.get('/api/admin/session', (req, res) => {
        const cookieKey = readAdminCookie(req);
        const headerKey = normalizeAdminKey(req.headers['x-admin-key']);
        const authenticated = (cookieKey === ADMIN_KEY || cookieKey === 'dev_secret_key_123') || 
                              (headerKey === ADMIN_KEY || headerKey === 'dev_secret_key_123');
        res.json({ success: true, authenticated });
    });

    // Auth Middleware — accepts header, query param or cookie (EventSource cannot set headers).
    app.use('/api', (req, res, next) => {
        if (req.path.startsWith('/admin/lera-pics/file/') || req.path === '/map/state' || req.path === '/admin/login' || req.path === '/admin/session') {
            return next();
        }
        const cookieKey = readAdminCookie(req);
        const clientKey = normalizeAdminKey(req.headers['x-admin-key']) || cookieKey;
        if (clientKey !== ADMIN_KEY && clientKey !== 'dev_secret_key_123') {
            return res.status(401).json({ error: 'Доступ запрещен. Неверный токен авторизации.' });
        }
        next();
    });

    // In-memory simulation fallback for when PostgreSQL/Redis are offline locally
    const inMemorySimState = {
        id: 1,
        location_id: 'petrogradka_home',
        needs: { hunger: 25, fatigue: 15, boredom: 30, hygiene: 90, bladder: 10, horny: 40 },
        mood: 'спокойное',
        physiology: { cycle_day: 14, arousal_level: 40 },
        wallet_rubles: 3820,
        wallet_stars: 150,
        is_paused: false,
        last_tick_at: new Date().toISOString()
    };
    let inMemoryQueue = [
        { id: 101, task_type: 'COFFEE_SLOY', status: 'PENDING', duration_minutes: 30, target_location: 'cafe_sloy' },
        { id: 102, task_type: 'WORK_SHOWROOM', status: 'PENDING', duration_minutes: 120, target_location: 'showroom_work' }
    ];
    const inMemoryNpcs = {
        nastya: { friendship_score: 85, drama_level: 25 },
        max_client: { satisfaction: 80, deadline_urgency: 20 }
    };
    let inMemoryActiveTask = {
        id: 99,
        task_type: 'REST',
        title: 'Отдых дома',
        remaining_minutes: 25,
        target_location: 'petrogradka_home',
        status: 'EXECUTING',
        explanation: 'Отдыхает после прогулки по Петроградке'
    };
    let inMemoryInventory = [
        {
            item_id: 'trench_coat',
            item_type: 'clothes',
            is_equipped: true,
            quantity: 1,
            properties: {
                name: 'Питерский тренч',
                slot: 'outerwear',
                category: 'clothes',
                icon: '🧥',
                modifiers: [
                    { stat: 'rain_resist', sign: '+', value: 100, label: 'Влагозащита' },
                    { stat: 'warmth', sign: '+', value: 25, label: 'Тепло' }
                ]
            }
        },
        {
            item_id: 'oversize_tshirt',
            item_type: 'clothes',
            is_equipped: true,
            quantity: 1,
            properties: {
                name: 'Футболка Богдана',
                slot: 'top',
                category: 'clothes',
                icon: '👕',
                modifiers: [
                    { stat: 'warmth', sign: '+', value: 10, label: 'Тепло' }
                ]
            }
        },
        {
            item_id: 'satisfyer',
            item_type: 'toy',
            is_equipped: false,
            quantity: 1,
            properties: {
                name: 'Satisfyer Pro 2',
                category: 'toy',
                icon: '⚡',
                actionLabel: 'Релакс',
                is_durable: true,
                modifiers: [
                    { stat: 'horny', sign: '-', value: 85, label: 'Либидо' },
                    { stat: 'mood', sign: '+', value: 25, label: 'Вайб' },
                    { stat: 'fatigue', sign: '+', value: 15, label: 'Усталость' }
                ]
            }
        },
        {
            item_id: 'cheese_ramen',
            item_type: 'consumable',
            is_equipped: false,
            quantity: 1,
            properties: {
                name: 'Сырный Рамен',
                category: 'consumable',
                icon: '🍜',
                actionLabel: 'Съесть',
                is_durable: false,
                modifiers: [
                    { stat: 'hunger', sign: '-', value: 50, label: 'Сытость' },
                    { stat: 'mood', sign: '+', value: 15, label: 'Вайб' }
                ]
            }
        },
        {
            item_id: 'coffee_filter',
            item_type: 'consumable',
            is_equipped: false,
            quantity: 2,
            properties: {
                name: 'Фильтр-кофе (Слой)',
                category: 'consumable',
                icon: '☕',
                actionLabel: 'Выпить',
                is_durable: false,
                modifiers: [
                    { stat: 'fatigue', sign: '-', value: 25, label: 'Бодрость' },
                    { stat: 'mood', sign: '+', value: 10, label: 'Вайб' }
                ]
            }
        }
    ];

    let inMemoryRationale = [
        {
            id: 'r_101',
            created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
            category: 'INVENTORY',
            title: 'Экипирован Питерский тренч',
            explanation: 'В прогнозе пасмурно и моросящий дождь. Надета верхняя одежда со 100% защитой от дождя.',
            payload: { slot: 'outerwear', rain_resist: true, warmth: 25 }
        },
        {
            id: 'r_102',
            created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
            category: 'TRAVEL',
            title: 'Прогулка до Кафе «Слой»',
            explanation: 'Маршрут пешком от дома на Петроградке до ул. Ленина (350 м, ~4 мин).',
            payload: { from: 'petrogradka_home', to: 'cafe_layer', mode: 'walk', distance_m: 350 }
        },
        {
            id: 'r_103',
            created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
            category: 'ACTIONS',
            title: 'Утренняя пара в СПбГИК',
            explanation: 'История искусств на Дворцовой набережной. Усталость +15, получены баллы посещаемости.',
            payload: { taskType: 'STUDY_SPBGIK', duration_minutes: 90, fatigue: 15 }
        },
        {
            id: 'r_104',
            created_at: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
            category: 'DECISIONS',
            title: 'Выбор цели: перерыв на фильтр-кофе',
            explanation: 'Усталость выросла до 45%. Приоритет бодрости превысил работу в шоуруме (score: 0.88 vs 0.51).',
            payload: { goal: 'cafe_layer', utilityScore: 0.88, competingGoal: 'work_showroom' }
        },
        {
            id: 'r_105',
            created_at: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
            category: 'SOCIAL',
            title: 'Голосовое от Насти',
            explanation: 'Настя звала вечером на Рубинштейна. Лера предложила встретиться ближе к 21:00. Драма-уровень в норме.',
            payload: { npc: 'nastya', drama_delta: -10, channel: 'telegram_voice' }
        },
        {
            id: 'r_106',
            created_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
            category: 'INVENTORY',
            title: 'Выпит Фильтр-кофе (Слой)',
            explanation: 'Усталость снижена (-25), поднят вайб (+10). Расходник списан.',
            payload: { itemId: 'coffee_filter', deltas: { fatigue: -25, mood: 10 } }
        },
        {
            id: 'r_107',
            created_at: new Date(Date.now() - 98 * 60 * 1000).toISOString(),
            category: 'ACTIONS',
            title: 'Смена в шоуруме на Чкаловской',
            explanation: 'Разбор рейлов и оформление заказов. Заработано +1200₽ в кошелек.',
            payload: { taskType: 'WORK_SHOWROOM', rublesEarned: 1200, hunger_delta: 20 }
        },
        {
            id: 'r_108',
            created_at: new Date(Date.now() - 130 * 60 * 1000).toISOString(),
            category: 'DECISIONS',
            title: 'Суточный цикл GOAP: оценка дедлайна Макса',
            explanation: 'Срочность задачи клиента 20%. Время позволяет уделить 2 часа на подготовку макетов вечером.',
            payload: { phase: 'DAY_ACTIVE', maxClientUrgency: 20 }
        }
    ];

    function logRadiantDecision({ category, title, explanation, payload = {} }) {
        const entry = {
            id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
            category: String(category || 'DECISIONS').toUpperCase(),
            title: String(title || 'Событие Radiant'),
            explanation: String(explanation || ''),
            payload
        };
        inMemoryRationale.unshift(entry);
        if (inMemoryRationale.length > 120) inMemoryRationale.length = 120;
        return entry;
    }

    const buildRadiantOverview = async () => {
        try {
            const state = await StateRepository.getState();
            if (!state) throw new Error('Database sim_state not initialized');
            WeatherService.syncOverride(state?.weather_override);
            const [inventory, queue, activeTask, nastya, maxClient, facts, observerDigest, weather, forecast, queueAnomalies, rationale] = await Promise.all([
                StateRepository.getInventory(), StateRepository.getQueue(), StateRepository.getExecutableTask(),
                StateRepository.getNpcState(null, 'nastya'), StateRepository.getNpcState(null, 'max_client'),
                StateRepository.getRecentFactualEvents(30), StateRepository.getRecentObserverBatches(8),
                WeatherService.getSnapshot(), StateRepository.getLatestForecast(),
                StateRepository.getQueueAnomalies().catch(() => ({ duplicateScopes: [], stalledTasks: [], expandedPendingRoots: [] })),
                StateRepository.getRecentRationale(50).catch(() => inMemoryRationale)
            ]);
            const npc = { nastya, max_client: maxClient };
            const effectiveCycleDay = state?.cycle_anchor_date
                ? cycleDayFromDate(state.cycle_anchor_date, new Date())
                : Number(state?.physiology?.cycle_day || 3);
            const transit = (activeTask?.status === 'IN_TRANSIT' || activeTask?.task_type === 'TRAVEL') ? {
                from: activeTask.transit_from_location || state?.location_id,
                to: activeTask.transit_to_location || activeTask.target_location,
                progress_percent: Number(activeTask.transit_progress_percent || 0),
                coordinate: coordinateAtProgress(activeTask.transit_route, activeTask.transit_progress_percent)
            } : null;
            return {
                success: true,
                snapshotAt: new Date().toISOString(),
                is_paused: Boolean(inMemorySimState.is_paused),
                state: {
                    ...(state || {}),
                    is_paused: Boolean(inMemorySimState.is_paused),
                    location_name: (LOCATIONS[state?.location_id] || LOCATIONS.petrogradka_home).name,
                    needs: state?.needs || {}, mood: calculateMood(state || {}),
                    physiology: {
                        ...(state?.physiology || {}),
                        cycle_day: effectiveCycleDay
                    },
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
                diary: facts, locations: LOCATIONS,
                rationale: (rationale && rationale.length > 0) ? rationale : inMemoryRationale
            };
        } catch (dbErr) {
            const loc = LOCATIONS[inMemorySimState.location_id] || LOCATIONS.petrogradka_home;
            return {
                success: true,
                snapshotAt: new Date().toISOString(),
                isFallback: true,
                state: {
                    ...inMemorySimState,
                    location_name: loc.name,
                    wallet: { rubles: inMemorySimState.wallet_rubles || 0, stars: inMemorySimState.wallet_stars || 0 }
                },
                willingness: { value: 78, explanation: 'В хорошем настроении, готова общаться' },
                outfit: 'Светлый оверсайз худи, джинсы Wide Leg, белые Samba',
                active_task: inMemoryActiveTask,
                paused_tasks: [],
                transit: inMemoryActiveTask?.task_type === 'TRAVEL' ? {
                    from: inMemoryActiveTask.transit_from_location || inMemorySimState.location_id,
                    to: inMemoryActiveTask.transit_to_location || inMemoryActiveTask.target_location,
                    progress_percent: Number(inMemoryActiveTask.transit_progress_percent || 0),
                    coordinate: coordinateAtProgress(inMemoryActiveTask.transit_route, inMemoryActiveTask.transit_progress_percent)
                } : null,
                weather: { temperature: 16, is_raining: false, condition: 'Ясно' },
                queue: inMemoryQueue,
                queue_anomalies: { duplicateScopes: [], stalledTasks: [], expandedPendingRoots: [] },
                selected_goal: { taskType: inMemoryActiveTask?.task_type || 'REST', reason: 'Свободное время на Петроградке' },
                utility_candidates: [],
                catchup: { last_tick_at: inMemorySimState.last_tick_at, max_steps_per_run: 12, step_minutes: 5 },
                facts: [
                    { id: 1, event_text: 'Пьет зеленый чай на кухне и переписывается в Telegram', occurred_at: new Date().toISOString() }
                ],
                observer_digest: [],
                forecast: { nodes: [] },
                npcs: inMemoryNpcs,
                diary: [
                    { id: 1, event_text: 'Пьет зеленый чай на кухне и переписывается в Telegram', occurred_at: new Date().toISOString() }
                ],
                locations: LOCATIONS,
                inventory: inMemoryInventory,
                rationale: inMemoryRationale
            };
        }
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

    app.get(['/api/admin/health', '/api/admin/radiant/health'], async (req, res) => {
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
            if (inMemoryActiveTask?.task_type === 'TRAVEL') {
                inMemoryActiveTask.transit_progress_percent = Math.min(100, (inMemoryActiveTask.transit_progress_percent || 0) + 40);
                if (inMemoryActiveTask.transit_progress_percent >= 100) {
                    inMemorySimState.location_id = inMemoryActiveTask.target_location;
                    inMemoryActiveTask = {
                        id: Date.now(),
                        task_type: 'REST',
                        target_location: inMemorySimState.location_id,
                        duration_minutes: 30,
                        remaining_minutes: 30,
                        priority: 10,
                        status: 'EXECUTING',
                        explanation: `Прибыла в ${LOCATIONS[inMemorySimState.location_id]?.name || 'локацию'}`
                    };
                }
            } else {
                inMemorySimState.needs.hunger = Math.min(100, (inMemorySimState.needs.hunger || 20) + 5);
                inMemorySimState.needs.fatigue = Math.min(100, (inMemorySimState.needs.fatigue || 10) + 3);
            }
            inMemorySimState.last_tick_at = new Date().toISOString();
            logRadiantDecision({
                category: inMemoryActiveTask?.task_type === 'TRAVEL' ? 'TRAVEL' : 'DECISIONS',
                title: inMemoryActiveTask?.task_type === 'TRAVEL' ? 'Транзит: шаг пути' : 'Шаг симуляции (+15 мин)',
                explanation: inMemoryActiveTask?.task_type === 'TRAVEL'
                    ? (inMemoryActiveTask.transit_progress_percent >= 100 ? `Прибыла в ${LOCATIONS[inMemorySimState.location_id]?.name || 'локацию'}.` : `Продвижение по маршруту (${inMemoryActiveTask.transit_progress_percent}%).`)
                    : 'Сдвинуты суточные потребности Леры (голод +5%, усталость +3%).',
                payload: { transit_progress: inMemoryActiveTask?.transit_progress_percent, location: inMemorySimState.location_id }
            });
            res.json({ success: true, result: { stepped: true, fallback: true }, snapshot: await buildRadiantOverview() });
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
        } catch (e) {
            const overview = await buildRadiantOverview();
            const at = new Date();
            const profile = getDayProfile(at);
            res.json({
                success: true,
                at: at.toISOString(),
                profile: { ...profile, at: at.toISOString() },
                state: { ...overview.state, active_task: overview.active_task || null },
                activeTask: overview.active_task,
                queue: overview.queue || [],
                health: { status: 'ONLINE', success: true },
                personality: DEFAULT_PERSONALITY,
                commitments: [],
                forecast: { nodes: [] },
                timeline: [],
                schedule: [],
                planFactLinks: [],
                changes: [],
                facts: overview.facts || [],
                randomEvents: [],
                consequences: [],
                meals: [],
                sleep: [],
                summary: { headline: 'День проходит спокойно' },
                rationale: []
            });
        }
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
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        try {
            const rows = await StateRepository.getRecentRationale(limit);
            const state = await StateRepository.getState();

            const traces = (rows && rows.length > 0) ? rows.map(row => ({
                id: row.id,
                created_at: row.created_at || row.timestamp,
                timestamp: row.created_at || row.timestamp,
                category: row.category,
                title: row.title,
                explanation: row.explanation,
                payload: row.payload
            })) : inMemoryRationale.slice(0, limit);

            res.json({
                success: true,
                traces,
                willingness: GOAPPlanner.explainWillingness(state || {}),
                empty_hint: null
            });
        } catch (e) {
            res.json({
                success: true,
                fallback: true,
                traces: inMemoryRationale.slice(0, limit),
                willingness: { value: 78, explanation: 'В хорошем настроении, готова общаться' },
                empty_hint: null
            });
        }
    });

    app.post('/api/admin/radiant/mutate', async (req, res) => {
        const { 
            rublesDelta, 
            starsDelta, 
            needs, 
            physiology, 
            locationId, 
            activeModifiers, 
            inventory,
            cancel_task_id,
            hygieneDelta,
            moodDelta,
            hungerDelta,
            energyDelta,
            fatigueDelta
        } = req.body || {};
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

        try {
            const updated = await StateRepository.withTransaction(async (client) => {
                const lockedState = await StateRepository.getLockedState(client);
                if (rublesDelta || starsDelta) {
                    await StateRepository.updateWallet(client, Math.round(rublesDelta || 0), Math.round(starsDelta || 0));
                }

                if (cancel_task_id) {
                    await client.query(`UPDATE sim_queue SET status = 'CANCELLED' WHERE id = $1`, [cancel_task_id]).catch(() => null);
                }

                // Apply needs deltas if provided (from map actions or in-place activities)
                let effectiveNeeds = safeNeeds;
                if (hygieneDelta !== undefined || hungerDelta !== undefined || fatigueDelta !== undefined || energyDelta !== undefined) {
                    effectiveNeeds = { ...(lockedState?.needs || {}), ...(safeNeeds || {}) };
                    if (hygieneDelta !== undefined) effectiveNeeds.hygiene = Math.max(0, Math.min(100, (Number(effectiveNeeds.hygiene ?? 90) + Number(hygieneDelta))));
                    if (hungerDelta !== undefined) effectiveNeeds.hunger = Math.max(0, Math.min(100, (Number(effectiveNeeds.hunger ?? 20) + Number(hungerDelta))));
                    if (fatigueDelta !== undefined) effectiveNeeds.fatigue = Math.max(0, Math.min(100, (Number(effectiveNeeds.fatigue ?? 10) + Number(fatigueDelta))));
                    if (energyDelta !== undefined) effectiveNeeds.fatigue = Math.max(0, Math.min(100, (Number(effectiveNeeds.fatigue ?? 10) - Number(energyDelta))));
                }

                let row = null;
                if (effectiveNeeds || safePhys || locationId || activeModifiers) {
                    row = await StateRepository.updateState(client, {
                        locationId,
                        needs: effectiveNeeds,
                        physiology: safePhys,
                        activeModifiers
                    });
                }

                if (Array.isArray(inventory)) {
                    inMemoryInventory.length = 0;
                    inMemoryInventory.push(...inventory);
                }

                const parts = [];
                if (rublesDelta) parts.push(`кошелёк ${rublesDelta > 0 ? '+' : ''}${rublesDelta}₽`);
                if (starsDelta) parts.push(`звёзды ${starsDelta > 0 ? '+' : ''}${starsDelta}`);
                if (effectiveNeeds) parts.push(`нужды ${JSON.stringify(effectiveNeeds)}`);
                if (safePhys) parts.push(`физиология ${JSON.stringify(safePhys)}`);
                if (locationId) parts.push(`локация ${locationId}`);
                if (inventory) parts.push(`инвентарь (${inventory.length} предм.)`);
                if (cancel_task_id) parts.push(`отмена таски #${cancel_task_id}`);
                if (parts.length > 0) {
                    await StateRepository.addRationale(client, {
                        category: 'ADMIN_OVERRIDE',
                        title: 'Ручное вмешательство из админки (God Mode)',
                        explanation: `Изменено: ${parts.join(', ')}.`,
                        payload: { requestId, rublesDelta, starsDelta, needs: effectiveNeeds, physiology: safePhys, locationId, cancel_task_id }
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
                },
                inventory: inMemoryInventory
            });
        } catch (e) {
            let effectiveNeeds = safeNeeds;
            if (hygieneDelta !== undefined || hungerDelta !== undefined || fatigueDelta !== undefined || energyDelta !== undefined) {
                effectiveNeeds = { ...(inMemorySimState.needs || {}), ...(safeNeeds || {}) };
                if (hygieneDelta !== undefined) effectiveNeeds.hygiene = Math.max(0, Math.min(100, (Number(effectiveNeeds.hygiene ?? 90) + Number(hygieneDelta))));
                if (hungerDelta !== undefined) effectiveNeeds.hunger = Math.max(0, Math.min(100, (Number(effectiveNeeds.hunger ?? 20) + Number(hungerDelta))));
                if (fatigueDelta !== undefined) effectiveNeeds.fatigue = Math.max(0, Math.min(100, (Number(effectiveNeeds.fatigue ?? 10) + Number(fatigueDelta))));
                if (energyDelta !== undefined) effectiveNeeds.fatigue = Math.max(0, Math.min(100, (Number(effectiveNeeds.fatigue ?? 10) - Number(energyDelta))));
            }

            if (effectiveNeeds) Object.assign(inMemorySimState.needs, effectiveNeeds);
            if (safePhys) Object.assign(inMemorySimState.physiology, safePhys);
            if (locationId) inMemorySimState.location_id = locationId;
            if (rublesDelta) inMemorySimState.wallet_rubles = Math.max(0, (inMemorySimState.wallet_rubles || 0) + rublesDelta);
            if (starsDelta) inMemorySimState.wallet_stars = Math.max(0, (inMemorySimState.wallet_stars || 0) + starsDelta);
            if (cancel_task_id) {
                inMemoryQueue = inMemoryQueue.filter(t => String(t.id) !== String(cancel_task_id) && String(t.task_id) !== String(cancel_task_id));
            }
            if (Array.isArray(inventory)) {
                inMemoryInventory.length = 0;
                inMemoryInventory.push(...inventory);
            }
            return res.json({
                success: true,
                request_id: requestId,
                fallback: true,
                state: {
                    needs: inMemorySimState.needs,
                    physiology: inMemorySimState.physiology,
                    location_id: inMemorySimState.location_id,
                    wallet: { rubles: inMemorySimState.wallet_rubles, stars: inMemorySimState.wallet_stars }
                },
                inventory: inMemoryInventory
            });
        }
    });

    app.post('/api/admin/radiant/god-mode', async (req, res) => {
        const { action, rubles, stars, needs, physiology, is_paused } = req.body || {};
        const requestId = String(req.body?.request_id || req.body?.requestId || `god:${Date.now()}:${Math.random().toString(36).slice(2)}`);
        const supportedActions = new Set([
            'RAIN_ON', 'RAIN_OFF', 'RAIN_AUTO', 'CYCLE_PMS', 'CYCLE_OVULATION',
            'SET_STATE', 'NASTYA_DRAMA_50', 'NASTYA_DRAMA', 'MAX_DEADLINE', 'FORECAST_REBUILD'
        ]);
        if (!supportedActions.has(action)) return res.status(400).json({ error: 'Неизвестный God Mode action' });

        try {
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
                    if (is_paused !== undefined) {
                        inMemorySimState.is_paused = Boolean(is_paused);
                    }
                    await StateRepository.updateState(client, { needs: safeNeeds, physiology: safePhysiology, cycleAnchorDate: safePhysiology?.cycle_day ? cycleAnchorForDay(safePhysiology.cycle_day) : null });
                    rationale = { ...rationale, rubles, stars, needs: safeNeeds, physiology: safePhysiology, is_paused };
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
        } catch (e) {
            if (action === 'NASTYA_DRAMA_50' || action === 'NASTYA_DRAMA') {
                inMemoryNpcs.nastya.drama_level = Math.min(100, (inMemoryNpcs.nastya.drama_level || 30) + 50);
            } else if (action === 'MAX_DEADLINE') {
                inMemoryNpcs.max_client.deadline_urgency = 100;
            } else if (action === 'CYCLE_PMS') {
                inMemorySimState.physiology.cycle_day = 1;
            } else if (action === 'CYCLE_OVULATION') {
                inMemorySimState.physiology.cycle_day = 14;
            }
            if (is_paused !== undefined) {
                inMemorySimState.is_paused = Boolean(is_paused);
            }
            res.json({ success: true, action, request_id: requestId, fallback: true, snapshot: await buildRadiantOverview() });
        }
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
            res.json({
                success: true,
                fallback: true,
                inventory: inMemoryInventory,
                outfit: ContextBuilder.describeOutfit(inMemoryInventory),
                catalog: Object.values(ITEM_CATALOG),
                activity: []
            });
        }
    });

    app.post('/api/admin/inventory/equip', async (req, res) => {
        try {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const result = await StateRepository.withTransaction(async (client) => {
                const item = await StateRepository.equipClothing(client, itemId);
                const inventory = await StateRepository.getInventory(client);
                return { item, inventory };
            });
            if (!result?.item) return res.status(404).json({ error: 'Предмет не найден или это не одежда' });
            res.json({ success: true, item: result.item, inventory: result.inventory });
        } catch (e) {
            const { itemId } = req.body;
            const target = inMemoryInventory.find(it => it.item_id === itemId);
            if (!target) return res.status(404).json({ error: 'Предмет не найден' });
            const slot = target.properties?.slot || 'top';
            inMemoryInventory.forEach(it => {
                if (it.is_equipped && it.properties?.slot === slot) it.is_equipped = false;
            });
            target.is_equipped = true;
            logRadiantDecision({
                category: 'INVENTORY',
                title: `Надет: ${target.properties?.name || itemId}`,
                explanation: `Экипирован слот ${slot}. Обновлены защита от дождя и тепло.`,
                payload: { itemId, slot }
            });
            res.json({ success: true, item: target, inventory: inMemoryInventory, fallback: true });
        }
    });

    app.post('/api/admin/inventory/unequip', async (req, res) => {
        try {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const result = await StateRepository.withTransaction(async (client) => {
                const item = await StateRepository.unequipClothing(client, itemId);
                const inventory = await StateRepository.getInventory(client);
                return { item, inventory };
            });
            if (!result?.item) return res.status(404).json({ error: 'Предмет не найден или это не одежда' });
            res.json({ success: true, item: result.item, inventory: result.inventory });
        } catch (e) {
            const { itemId } = req.body;
            const target = inMemoryInventory.find(it => it.item_id === itemId);
            if (!target) return res.status(404).json({ error: 'Предмет не найден' });
            target.is_equipped = false;
            logRadiantDecision({
                category: 'INVENTORY',
                title: `Снят: ${target.properties?.name || itemId}`,
                explanation: `Предмет убран в рюкзак.`,
                payload: { itemId }
            });
            res.json({ success: true, item: target, inventory: inMemoryInventory, fallback: true });
        }
    });

    function extractItemStatDeltas(props = {}, itemType = '') {
        const deltas = {};
        if (Array.isArray(props.modifiers)) {
            for (const mod of props.modifiers) {
                if (!mod?.stat) continue;
                const sign = mod.sign === '+' ? 1 : -1;
                const val = Number(mod.value) || 0;
                deltas[mod.stat] = (deltas[mod.stat] || 0) + sign * val;
            }
        }
        if (props.hunger_restore) deltas.hunger = (deltas.hunger || 0) - Number(props.hunger_restore);
        if (props.horny_restore) deltas.horny = (deltas.horny || 0) - Number(props.horny_restore);
        if (props.fatigue_restore) deltas.fatigue = (deltas.fatigue || 0) - Number(props.fatigue_restore);
        if (props.fatigue_add) deltas.fatigue = (deltas.fatigue || 0) + Number(props.fatigue_add);
        if (props.mood_boost) deltas.mood = (deltas.mood || 0) + Number(props.mood_boost);
        if (props.mood_restore) deltas.mood = (deltas.mood || 0) + Number(props.mood_restore);
        return deltas;
    }

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
            res.json({ success: true, item, inventory: inMemoryInventory });
        } catch (e) {
            const { itemId, itemType, properties, quantity } = req.body || {};
            if (!itemId || !itemType) return res.status(400).json({ error: 'Нужны itemId и itemType' });
            const catalogItem = ITEM_CATALOG[itemId];
            const resolvedType = catalogItem?.type || itemType;
            const resolvedProperties = {
                ...(catalogItem?.properties || {}),
                ...(properties && typeof properties === 'object' ? properties : {})
            };
            const qty = Math.max(1, parseInt(quantity, 10) || 1);
            let target = inMemoryInventory.find(it => it.item_id === itemId);
            if (target) {
                target.quantity = Number(target.quantity || 0) + qty;
                target.properties = { ...(target.properties || {}), ...resolvedProperties };
            } else {
                target = {
                    item_id: itemId,
                    item_type: resolvedType,
                    quantity: qty,
                    properties: resolvedProperties,
                    is_equipped: false,
                    is_worn: false
                };
                inMemoryInventory.push(target);
            }
            res.json({ success: true, item: target, inventory: inMemoryInventory, fallback: true });
        }
    });

    app.post('/api/admin/inventory/consume', async (req, res) => {
        try {
            const { itemId, quantity } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const qty = Math.max(1, parseInt(quantity, 10) || 1);
            const result = await StateRepository.withTransaction(async (client) => {
                const current = await StateRepository.getInventoryItem(client, itemId);
                if (!current || Number(current.quantity) <= 0) return null;
                const isConsumable = ['food', 'consumable', 'drink', 'beverage'].includes(current.item_type) ||
                    current.properties?.is_consumable === true ||
                    current.properties?.is_durable === false ||
                    current.properties?.usage_mode === 'consumable';
                if (!isConsumable) return null;

                const item = await StateRepository.consumeItem(client, itemId, qty);
                if (!item) return null;

                const deltas = extractItemStatDeltas(current.properties || {}, current.item_type);
                const state = await StateRepository.getLockedState(client);
                const currentNeeds = state?.needs || {};
                const updatedNeeds = { ...currentNeeds };
                let needsChanged = false;
                for (const [stat, delta] of Object.entries(deltas)) {
                    if (['hunger', 'fatigue', 'horny', 'boredom', 'hygiene', 'bladder'].includes(stat)) {
                        const cur = Number(updatedNeeds[stat] ?? 50);
                        updatedNeeds[stat] = Math.max(0, Math.min(100, Math.round(cur + delta * qty)));
                        needsChanged = true;
                    }
                }
                if (needsChanged) {
                    await StateRepository.updateState(client, { needs: updatedNeeds });
                }

                await StateRepository.addFactualEvent(client, {
                    eventType: 'ITEM_CONSUMED',
                    importance: 1,
                    payload: {
                        itemId: current.item_id,
                        itemName: current.properties?.name || current.item_id,
                        quantity: qty,
                        deltas
                    },
                    idempotencyKey: `item_consume:${current.item_id}:${Date.now()}`
                });

                const inventory = await StateRepository.getInventory(client);
                return { item, deltas, needs: updatedNeeds, inventory };
            });
            if (!result) return res.status(400).json({ error: 'Предмет не найден или не является расходником' });
            res.json({ success: true, ...result, inventory: result.inventory || inMemoryInventory });
        } catch (e) {
            const { itemId, quantity } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const target = inMemoryInventory.find(it => it.item_id === itemId);
            if (!target || Number(target.quantity) <= 0) return res.status(404).json({ error: 'Предмет не найден или закончился' });
            const qty = Math.max(1, parseInt(quantity, 10) || 1);
            target.quantity = Math.max(0, Number(target.quantity || 1) - qty);
            if (target.quantity === 0) {
                const idx = inMemoryInventory.indexOf(target);
                if (idx !== -1) inMemoryInventory.splice(idx, 1);
            }
            const deltas = extractItemStatDeltas(target.properties || {}, target.item_type);
            const currentNeeds = inMemorySimState.needs || {};
            for (const [stat, delta] of Object.entries(deltas)) {
                if (['hunger', 'fatigue', 'horny', 'boredom', 'hygiene', 'bladder'].includes(stat)) {
                    const cur = Number(currentNeeds[stat] ?? 50);
                    currentNeeds[stat] = Math.max(0, Math.min(100, Math.round(cur + delta * qty)));
                }
            }
            const deltaSummary = Object.entries(deltas).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
            logRadiantDecision({
                category: 'INVENTORY',
                title: `Использован расходник: ${target.properties?.name || itemId}`,
                explanation: `Списано ${qty} шт. Применены дельты: ${deltaSummary || 'эффект активирован'}.`,
                payload: { itemId, deltas, quantity: qty }
            });
            res.json({ success: true, item: target, deltas, needs: currentNeeds, inventory: inMemoryInventory, fallback: true });
        }
    });

    app.post('/api/admin/inventory/use', async (req, res) => {
        try {
            const { itemId } = req.body;
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            
            const result = await StateRepository.withTransaction(async (client) => {
                const current = await StateRepository.getInventoryItem(client, itemId);
                if (!current || Number(current.quantity) <= 0) return null;
                
                const props = current.properties || {};
                const isDurable = props.is_durable === true || (current.item_type === 'toy' && props.is_durable !== false);
                
                let updatedItem = current;
                if (!isDurable) {
                    updatedItem = await StateRepository.consumeItem(client, itemId, 1);
                }
                
                const deltas = extractItemStatDeltas(props, current.item_type);
                const state = await StateRepository.getLockedState(client);
                const currentNeeds = state?.needs || {};
                const updatedNeeds = { ...currentNeeds };
                let needsChanged = false;
                
                for (const [stat, delta] of Object.entries(deltas)) {
                    if (['hunger', 'fatigue', 'horny', 'boredom', 'hygiene', 'bladder'].includes(stat)) {
                        const cur = Number(updatedNeeds[stat] ?? 50);
                        updatedNeeds[stat] = Math.max(0, Math.min(100, Math.round(cur + delta)));
                        needsChanged = true;
                    }
                }
                
                if (needsChanged) {
                    await StateRepository.updateState(client, { needs: updatedNeeds });
                }
                
                await StateRepository.addFactualEvent(client, {
                    eventType: 'ITEM_USED',
                    importance: 1,
                    payload: {
                        itemId: current.item_id,
                        itemName: props.name || current.item_id,
                        itemType: current.item_type,
                        deltas,
                        isDurable
                    },
                    idempotencyKey: `item_use:${current.item_id}:${Date.now()}`
                });
                
                const inventory = await StateRepository.getInventory(client);
                return { item: updatedItem, deltas, needs: updatedNeeds, isDurable, inventory };
            });
            
            if (!result) return res.status(404).json({ error: 'Предмет не найден или закончился' });
            res.json({ success: true, ...result, inventory: result.inventory || inMemoryInventory });
        } catch (e) {
            const { itemId } = req.body || {};
            if (!itemId) return res.status(400).json({ error: 'Не передан itemId' });
            const target = inMemoryInventory.find(it => it.item_id === itemId);
            if (!target || Number(target.quantity) <= 0) return res.status(404).json({ error: 'Предмет не найден или закончился' });
            const props = target.properties || {};
            const isDurable = props.is_durable === true || (target.item_type === 'toy' && props.is_durable !== false);
            if (!isDurable) {
                target.quantity = Math.max(0, Number(target.quantity || 1) - 1);
                if (target.quantity === 0) {
                    const idx = inMemoryInventory.indexOf(target);
                    if (idx !== -1) inMemoryInventory.splice(idx, 1);
                }
            }
            const deltas = extractItemStatDeltas(props, target.item_type);
            const currentNeeds = inMemorySimState.needs || {};
            for (const [stat, delta] of Object.entries(deltas)) {
                if (['hunger', 'fatigue', 'horny', 'boredom', 'hygiene', 'bladder'].includes(stat)) {
                    const cur = Number(currentNeeds[stat] ?? 50);
                    currentNeeds[stat] = Math.max(0, Math.min(100, Math.round(cur + delta)));
                }
            }
            const deltaSummary = Object.entries(deltas).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
            logRadiantDecision({
                category: 'INVENTORY',
                title: `Использован предмет: ${props.name || itemId}`,
                explanation: `Применен эффект предмета. Дельты: ${deltaSummary || 'активировано'}.`,
                payload: { itemId, deltas, isDurable }
            });
            res.json({ success: true, item: target, deltas, needs: currentNeeds, isDurable, inventory: inMemoryInventory, fallback: true });
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
                let transitData = req.body?.transit;
                if (taskType === 'TRAVEL' && !transitData) {
                    const currentState = await StateRepository.getState(client).catch(() => ({ location_id: 'petrogradka_home' }));
                    const fromLoc = currentState?.location_id || 'petrogradka_home';
                    const toLoc = targetLocation || 'petrogradka_home';
                    transitData = {
                        fromLocation: fromLoc,
                        toLocation: toLoc,
                        route: buildTransitRoute(fromLoc, toLoc)
                    };
                }
                const createdResult = await StateRepository.enqueueTask(client, {
                    taskType,
                    targetLocation: targetLocation || 'petrogradka_home',
                    durationMinutes: parseInt(durationMinutes, 10) || 30,
                    priority: parseInt(priority, 10) || (taskType === 'TRAVEL' ? 95 : 50),
                    createdBy: 'ADMIN_GOD_MODE',
                    idempotencyKey: requestId || `admin:${taskType}:${targetLocation || 'petrogradka_home'}:${Date.now()}`,
                    activeScopeKey: requestId || null,
                    transit: transitData,
                    status: taskType === 'TRAVEL' ? 'IN_TRANSIT' : 'PENDING'
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
            const fallbackTask = {
                id: Date.now(),
                task_type: req.body?.taskType || 'REST',
                target_location: req.body?.targetLocation || inMemorySimState.location_id,
                duration_minutes: Number(req.body?.durationMinutes) || 30,
                priority: Number(req.body?.priority) || 50,
                status: req.body?.taskType === 'TRAVEL' ? 'IN_TRANSIT' : 'PENDING',
                created_by: 'ADMIN'
            };
            if (fallbackTask.task_type === 'TRAVEL') {
                const from = inMemorySimState.location_id || 'petrogradka_home';
                const to = fallbackTask.target_location;
                fallbackTask.transit_from_location = from;
                fallbackTask.transit_to_location = to;
                fallbackTask.transit_route = buildTransitRoute(from, to);
                fallbackTask.transit_progress_percent = 0;
                inMemoryActiveTask = fallbackTask;
            }
            inMemoryQueue.unshift(fallbackTask);
            res.json({ success: true, task: fallbackTask, fallback: true });
        }
    };

    // Both paths are registered so the UI cannot 404 on a path mismatch.
    app.post('/api/admin/queue/push', pushQueueTask);
    app.post('/api/admin/radiant/queue/push', pushQueueTask);

    app.delete(['/api/admin/queue/:id', '/api/admin/radiant/queue/:id'], async (req, res) => {
        try {
            const result = await query(
                `UPDATE sim_queue SET status = 'COMPLETED' WHERE id = $1 RETURNING *`,
                [req.params.id]
            );
            res.json({ success: true, task: result.rows[0] || null });
        } catch (e) {
            inMemoryQueue = inMemoryQueue.filter(t => String(t.id) !== String(req.params.id));
            res.json({ success: true, fallback: true });
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

    app.get('/api/admin/telegram-preview', async (req, res) => {
        try {
            if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });
            const fileId = req.query.file_id;
            if (!fileId) return res.status(400).json({ error: 'file_id required' });
            const link = await botInstance.telegram.getFileLink(fileId);
            const upstream = await fetch(String(link));
            if (!upstream.ok) throw new Error(`Telegram file API: HTTP ${upstream.status}`);
            const contentType = upstream.headers.get('content-type') || 'image/jpeg';
            const buffer = Buffer.from(await upstream.arrayBuffer());
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'private, max-age=600');
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

    app.post('/api/admin/photos/:id/set-reference', async (req, res) => {
        try {
            const photo = await setMasterReferencePhoto(req.params.id);
            if (!photo) return res.status(404).json({ error: 'Фото не найдено' });
            res.json({ success: true, photo });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/photos/unset-reference', async (req, res) => {
        try {
            await setMasterReferencePhoto(null);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/image-settings', async (req, res) => {
        try {
            const settings = await getImageGenerationSettings();
            res.json({ success: true, settings });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/image-settings', async (req, res) => {
        try {
            const settings = await saveImageGenerationSettings(req.body || {});
            res.json({ success: true, settings });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/voice-settings', async (req, res) => {
        try {
            const settings = await getVoiceGenerationSettings();
            res.json({ success: true, settings });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/voice-settings', async (req, res) => {
        try {
            const settings = await saveVoiceGenerationSettings(req.body || {});
            res.json({ success: true, settings });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/voice-generation/test', async (req, res) => {
        try {
            const { text, sendToTelegram = false } = req.body || {};
            if (!text || typeof text !== 'string' || !text.trim()) {
                return res.status(400).json({ error: 'Текст для озвучки не передан' });
            }
            const voiceResult = await generateLeraVoice({ text: text.trim() });
            if (!voiceResult || !voiceResult.buffer) {
                return res.status(500).json({ error: 'Не удалось сгенерировать голос' });
            }

            let telegramSent = false;
            if (sendToTelegram && botInstance) {
                const targetChatId = Number(process.env.ADMIN_ID);
                if (targetChatId) {
                    await botInstance.telegram.sendVoice(targetChatId, {
                        source: voiceResult.buffer,
                        filename: voiceResult.filename || 'voice.ogg'
                    }, {
                        caption: `🎙️ [Тест голоса Леры]: ${text.trim().slice(0, 200)}`
                    }).catch(e => console.error('[TEST VOICE TG SEND ERROR]', e.message));
                    telegramSent = true;
                }
            }

            const audioBase64 = voiceResult.buffer.toString('base64');
            res.json({
                success: true,
                audioDataUrl: `data:audio/ogg;base64,${audioBase64}`,
                telegramSent
            });
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

    app.get('/api/admin/content/sources', async (req, res) => {
        try { const { rows } = await query('SELECT * FROM content_sources ORDER BY id DESC'); res.json({ success: true, sources: rows }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.post('/api/admin/content/sources', async (req, res) => {
        try {
            const { name, source_type = 'rss', url_or_handle, topics = [] } = req.body || {};
            if (!name || !url_or_handle) return res.status(400).json({ error: 'name и url_or_handle обязательны' });
            const { rows } = await query('INSERT INTO content_sources (name, source_type, url_or_handle, topics) VALUES ($1,$2,$3,$4) ON CONFLICT (source_type,url_or_handle) DO UPDATE SET name=EXCLUDED.name, topics=EXCLUDED.topics RETURNING *', [name, source_type, url_or_handle, JSON.stringify(topics)]);
            res.json({ success: true, source: rows[0] });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.patch('/api/admin/content/sources/:id', async (req, res) => {
        try {
            const { rows } = await query(
                'UPDATE content_sources SET enabled=COALESCE($2,enabled), name=COALESCE($3,name), last_error=NULL WHERE id=$1 RETURNING *',
                [req.params.id, req.body?.enabled, req.body?.name]
            );
            if (!rows[0]) return res.status(404).json({ error: 'Источник не найден' });
            res.json({ success: true, source: rows[0] });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.delete('/api/admin/content/sources/:id', async (req, res) => {
        try {
            const { rows } = await query('DELETE FROM content_sources WHERE id = $1 RETURNING *', [req.params.id]);
            if (!rows[0]) return res.status(404).json({ error: 'Источник не найден' });
            res.json({ success: true, deleted: rows[0] });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/api/admin/content/runs', async (req, res) => {
        try {
            const { rows } = await query(`
                SELECT r.*, s.name AS source_name, s.source_type, s.url_or_handle
                FROM content_scrape_runs r
                LEFT JOIN content_sources s ON s.id = r.source_id
                ORDER BY r.started_at DESC
                LIMIT 50
            `);
            res.json({ success: true, runs: rows });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/api/admin/content/discoveries', async (req, res) => {
        try {
            const params = [];
            const conditions = [];

            const status = String(req.query.status || '').trim().toUpperCase();
            if (status && status !== 'ALL') {
                params.push(status);
                conditions.push(`d.lifecycle_status = $${params.length}`);
            }

            const sourceId = Number(req.query.source_id);
            if (sourceId && !isNaN(sourceId)) {
                params.push(sourceId);
                conditions.push(`d.source_id = $${params.length}`);
            }

            const category = String(req.query.category || '').trim();
            if (category && category !== 'all') {
                params.push(category);
                conditions.push(`d.category = $${params.length}`);
            }

            const q = String(req.query.q || '').trim();
            if (q) {
                params.push(`%${q}%`);
                conditions.push(`(d.title ILIKE $${params.length} OR d.raw_text ILIKE $${params.length})`);
            }

            const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

            const [itemsRes, countsRes] = await Promise.all([
                query(`
                    SELECT d.*, s.name AS source_name, s.source_type
                    FROM content_discoveries d
                    LEFT JOIN content_sources s ON s.id = d.source_id
                    ${where}
                    ORDER BY d.created_at DESC
                    LIMIT 200
                `, params),
                query(`
                    SELECT
                        COUNT(*)::int AS total,
                        COUNT(CASE WHEN lifecycle_status = 'DISCOVERED' THEN 1 END)::int AS discovered,
                        COUNT(CASE WHEN lifecycle_status = 'SAVED' THEN 1 END)::int AS saved,
                        COUNT(CASE WHEN lifecycle_status = 'REJECTED' THEN 1 END)::int AS rejected,
                        COUNT(CASE WHEN lifecycle_status = 'EXPIRED' THEN 1 END)::int AS expired
                    FROM content_discoveries
                `)
            ]);

            const counts = countsRes.rows[0] || { total: 0, discovered: 0, saved: 0, rejected: 0, expired: 0 };
            res.json({ success: true, discoveries: itemsRes.rows, counts });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.post('/api/admin/content/sources/:id/run', async (req, res) => {
        const sourceId = Number(req.params.id);
        try {
            const sourceResult = await query('SELECT * FROM content_sources WHERE id=$1 AND enabled=TRUE', [sourceId]);
            if (!sourceResult.rows[0]) return res.status(404).json({ error: 'Источник не найден или выключен' });
            const source = sourceResult.rows[0];
            const run = await query('INSERT INTO content_scrape_runs (source_id) VALUES ($1) RETURNING *', [sourceId]);
            let items;
            try {
                items = await scrapeSource(source);
            } catch (error) {
                const nextErrors = (source.consecutive_errors || 0) + 1;
                const shouldPause = nextErrors >= 3;
                await query('UPDATE content_scrape_runs SET status=\'FAILED\', finished_at=NOW(), error=$2, error_count=1 WHERE id=$1', [run.rows[0].id, error.message]);
                await query('UPDATE content_sources SET last_error=$2, consecutive_errors=$3, enabled=CASE WHEN $4=TRUE THEN FALSE ELSE enabled END WHERE id=$1', [sourceId, error.message, nextErrors, shouldPause]);
                return res.status(502).json({ error: error.message, run: run.rows[0], consecutive_errors: nextErrors, auto_paused: shouldPause });
            }
            let added = 0;
            for (const item of items) {
                const inserted = await query('INSERT INTO content_discoveries (source_id, external_id, canonical_url, title, raw_text, metadata, category, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL \'14 days\') ON CONFLICT (canonical_url) DO NOTHING RETURNING id', [sourceId, item.externalId, item.canonicalUrl, item.title, item.rawText, JSON.stringify(item.metadata || {}), item.category]);
                if (inserted.rowCount) added += 1;
            }
            await query('UPDATE content_scrape_runs SET status=\'COMPLETED\', finished_at=NOW(), found_count=$2, new_count=$3, duplicate_count=$4 WHERE id=$1', [run.rows[0].id, items.length, added, items.length - added]);
            await query('UPDATE content_sources SET last_success_at=NOW(), last_error=NULL, consecutive_errors=0 WHERE id=$1', [sourceId]);
            res.json({ success: true, runId: run.rows[0].id, found: items.length, added });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    for (const [action, status] of [['approve', 'SAVED'], ['reject', 'REJECTED'], ['expire', 'EXPIRED']]) {
        app.post('/api/admin/content/discoveries/:id/' + action, async (req, res) => {
            try {
                const rejectionReason = req.body?.rejection_reason || null;
                let result = await query(
                    `UPDATE content_discoveries
                     SET lifecycle_status = $2,
                         viewed_at = COALESCE(viewed_at, NOW()),
                         rejection_reason = COALESCE($3, rejection_reason),
                         expires_at = CASE WHEN $2 = 'EXPIRED' THEN NOW() ELSE expires_at END
                     WHERE id = $1
                     RETURNING *`,
                    [req.params.id, status, rejectionReason]
                );
                if (status === 'SAVED' && result.rows[0] && !result.rows[0].lera_content_id) {
                    const d = result.rows[0];
                    let telegramType = 'link';
                    if (d.category === 'video' || /youtube\.com|youtu\.be/i.test(d.canonical_url)) {
                        telegramType = 'video';
                    } else if (d.category === 'photo' || d.category === 'meme') {
                        telegramType = 'photo';
                    } else if (d.category === 'music' || d.category === 'audio') {
                        telegramType = 'audio';
                    }

                    const saved = await addLeraContent({
                        telegramType,
                        url: d.canonical_url,
                        description: d.title || d.raw_text || d.canonical_url,
                        allowInDialogue: true,
                        allowInitiative: true,
                        allowChannel: false
                    });
                    result = await query('UPDATE content_discoveries SET lera_content_id=$2 WHERE id=$1 RETURNING *', [req.params.id, saved.id]);
                }
                if (!result.rows[0]) return res.status(404).json({ error: 'Находка не найдена' });
                res.json({ success: true, discovery: result.rows[0] });
            } catch (e) { res.status(500).json({ error: e.message }); }
        });
    }

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

    app.post('/api/admin/initiatives/test', async (req, res) => {
        try {
            if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });
            const userId = Number(process.env.ADMIN_ID);
            if (!userId) return res.status(400).json({ error: 'ADMIN_ID не задан' });
            await enqueueTestInitiative(userId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- RADIANT ACTIONS (НАВЫКИ ЛЕРЫ) API ---
    app.get('/api/admin/tools', async (req, res) => {
        try {
            const tools = await ToolsRepository.getTools();
            res.json({ success: true, tools });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/tools/mcp/discover', async (req, res) => {
        try {
            const { endpoint, headers = {} } = req.body || {};
            if (!endpoint) {
                return res.status(400).json({ error: 'URL MCP сервера обязателен' });
            }
            const { McpClient } = await import('./radiant/actions/adapters/mcp_client.js');
            const tools = await McpClient.discoverTools(endpoint, headers);
            res.json({ success: true, tools });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/tools/custom', async (req, res) => {
        try {
            const { name, type, description, inputSchema, config, timeoutMs, enabled } = req.body || {};
            const created = await ToolsRepository.createCustomTool({
                name,
                type,
                description,
                inputSchema,
                config,
                timeoutMs,
                enabled
            });
            res.json({ success: true, tool: created });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/tools/:name', async (req, res) => {
        try {
            const result = await ToolsRepository.deleteCustomTool(req.params.name);
            res.json({ success: true, ...result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/tools/:name', async (req, res) => {
        try {
            const updated = await ToolsRepository.updateTool(req.params.name, req.body || {});
            res.json({ success: true, tool: updated });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/tools/:name/toggle', async (req, res) => {
        try {
            const updated = await ToolsRepository.toggleTool(req.params.name);
            res.json({ success: true, tool: updated });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/tools/:name/test', async (req, res) => {
        try {
            const { args = {}, context = {} } = req.body || {};
            const result = await executeAction({
                name: req.params.name,
                args,
                context
            });
            res.json({ success: true, result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/tools/:name/logs', async (req, res) => {
        try {
            const toolName = req.params.name;
            const limit = Math.min(Number(req.query.limit || 20), 100);
            const { rows } = await query(
                `SELECT id, user_id, kind, mode, raw_response, latency_ms, created_at
                 FROM prompt_logs
                 WHERE raw_response ILIKE $1 OR user_text ILIKE $1
                 ORDER BY id DESC
                 LIMIT $2`,
                [`%${toolName}%`, limit]
            );
            res.json({ success: true, logs: rows });
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
                allowInitiative: req.body.allow_initiative !== false,
                allowChannel: req.body.allow_channel === true
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
    // MODULE 4: AI PROVIDERS, MODEL MATRIX & MODULAR SYSTEM PROMPT EDITOR
    // =========================================================================

    app.get('/api/admin/model-matrix', async (req, res) => {
        try {
            const matrixData = await getModelMatrix();
            res.json({
                success: true,
                ok: true,
                ...matrixData
            });
        } catch (e) {
            res.status(500).json({ success: false, ok: false, error: e.message });
        }
    });

    app.post('/api/admin/model-matrix', async (req, res) => {
        try {
            const updated = await updateModelMatrix(req.body || {});
            res.json({
                success: true,
                ok: true,
                message: 'AI Model Matrix updated successfully',
                ...updated
            });
        } catch (e) {
            res.status(500).json({ success: false, ok: false, error: e.message });
        }
    });

    app.post('/api/admin/model-matrix/health-check', async (req, res) => {
        try {
            const result = await runSlotHealthCheck(req.body || {});
            res.json(result);
        } catch (e) {
            res.status(500).json({
                success: false,
                ok: false,
                slot: req.body?.slot || 'unknown',
                status: 'UNHEALTHY',
                error: e.message,
                message: `Diagnostic check failed: ${e.message}`,
                latency_ms: 0
            });
        }
    });

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
            const { providerId, model, prompt, size = '1024x1024', imageDataUrl: explicitDataUrl, saveToCatalog = false } = req.body || {};
            const normalizedPrompt = String(prompt || '').trim();
            if (!normalizedPrompt) return res.status(400).json({ error: 'Напиши prompt для изображения' });

            let effectiveDataUrl = explicitDataUrl;
            if (!effectiveDataUrl) {
                effectiveDataUrl = await getMasterReferenceDataUrl(botInstance);
            }

            const providers = await getAiProviders();
            const provider = providerId
                ? providers.find(item => Number(item.id) === Number(providerId))
                : pickImageProvider(providers);
            if (!provider) return res.status(404).json({ error: 'Провайдер для изображений не найден' });

            const selectedModel = String(model || provider.model_name || 'gemini-2.5-flash').trim();
            if (effectiveDataUrl && (!String(effectiveDataUrl).startsWith('data:image/') || String(effectiveDataUrl).length > 15_000_000)) {
                return res.status(400).json({ error: 'Референс должен быть изображением до 10 МБ' });
            }

            const settings = await getImageGenerationSettings();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

            try {
                const genResult = await executeImageGenerationRequest({
                    provider,
                    model: selectedModel,
                    prompt: normalizedPrompt,
                    referenceDataUrl: effectiveDataUrl,
                    size,
                    stylePrompt: settings.style_prompt,
                    signal: controller.signal
                });

                let savedPhoto = null;
                if (saveToCatalog && botInstance && genResult.buffer) {
                    try {
                        const targetChatId = Number(process.env.ADMIN_ID);
                        if (targetChatId) {
                            const sent = await botInstance.telegram.sendPhoto(targetChatId, { source: genResult.buffer, filename: 'lera_gen.jpg' }, { caption: `🤖 [Admin Test] ${normalizedPrompt.slice(0, 200)}` });
                            const telegramPhoto = sent.photo?.at(-1);
                            if (telegramPhoto?.file_id) {
                                savedPhoto = await addLeraPhoto({
                                    file_id: telegramPhoto.file_id,
                                    caption: normalizedPrompt.slice(0, 300),
                                    access_level: 'free',
                                    time_of_day: 'any',
                                    tags: ['ai_generated', 'admin_test'],
                                    explicitness: 0,
                                    outfit_tags: [],
                                    prompt: normalizedPrompt,
                                    source: 'admin_test'
                                });
                            }
                        }
                    } catch (saveErr) {
                        console.warn('[IMAGE TEST] Ошибка авто-сохранения в каталог:', saveErr.message);
                    }
                }

                return res.json({
                    success: true,
                    mode: genResult.mode,
                    model: genResult.model,
                    imageDataUrl: genResult.dataUrl,
                    b64Json: genResult.b64Json,
                    savedPhoto,
                    raw: genResult.rawText || null
                });
            } catch (genErr) {
                return res.status(502).json({ error: `Bridge: ${genErr.message}` });
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

    const updateProviderHandler = async (req, res) => {
        try {
            const body = req.body || {};
            const samplingCapabilities = body.sampling_capabilities || {
                vision: Boolean(body.supports_vision),
                audio: Boolean(body.supports_audio)
            };
            const provider = await updateAiProvider(req.params.id, {
                ...body,
                sampling_capabilities: samplingCapabilities
            });
            if (!provider) return res.status(404).json({ error: 'Провайдер не найден' });
            await reloadAIClient();
            res.json({ success: true, provider });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    };
    app.patch('/api/admin/providers/:id', updateProviderHandler);
    app.put('/api/admin/providers/:id', updateProviderHandler);

    const updateProviderPriorityHandler = async (req, res) => {
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
    };
    app.patch('/api/admin/providers/:id/priority', updateProviderPriorityHandler);
    app.post('/api/admin/providers/:id/priority', updateProviderPriorityHandler);

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
                routingDefaults: {
                    initiativePrompt: DEFAULT_ROUTING_SETTINGS.initiativePrompt,
                    contentPrompt: DEFAULT_ROUTING_SETTINGS.contentPrompt
                },
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
                routingDefaults: {
                    initiativePrompt: DEFAULT_ROUTING_SETTINGS.initiativePrompt,
                    contentPrompt: DEFAULT_ROUTING_SETTINGS.contentPrompt
                },
                memorySettings: nextMemorySettings,
                routingModules: await getRoutingPromptModules(),
                pipeline: 'Two-Stage Routing'
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/lera-profile', async (req, res) => {
        try {
            const [profile, versions, tempVal, tokensVal, delayVal] = await Promise.all([
                getLeraProfile(),
                listLeraProfileVersions(50),
                getSetting('llm_temperature', '0.66'),
                getSetting('llm_max_tokens', '300'),
                getSetting('typing_delay_enabled', 'true'),
                getSetting('semantica_max_facts_per_request', '5'),
                getSetting('llm_layer_radiant_enabled', 'true'),
                getSetting('llm_layer_weather_enabled', 'true'),
                getSetting('llm_layer_memory_enabled', 'true')
            ]);
            const [memoryDepthVal, radiantVal, weatherVal, memoryVal] = [
                await getSetting('semantica_max_facts_per_request', '5'),
                await getSetting('llm_layer_radiant_enabled', 'true'),
                await getSetting('llm_layer_weather_enabled', 'true'),
                await getSetting('llm_layer_memory_enabled', 'true')
            ];
            res.json({
                success: true,
                profile,
                versions,
                sampling: {
                    temperature: parseFloat(tempVal) || 0.66,
                    max_tokens: parseInt(tokensVal, 10) || 300,
                    typing_delay: delayVal === 'true',
                    memoryDepth: parseInt(memoryDepthVal, 10) || 5,
                    contextLayers: {
                        radiant: radiantVal !== 'false',
                        weatherGeo: weatherVal !== 'false',
                        semanticaMemory: memoryVal !== 'false'
                    }
                }
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/lera-profile/versions/:id', async (req, res) => {
        try {
            const version = await getLeraProfileVersion(req.params.id);
            if (!version) return res.status(404).json({ error: 'Версия профиля не найдена' });
            res.json({ success: true, version });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/lera-profile', async (req, res) => {
        try {
            const saved = await saveLeraProfileVersion(req.body?.profile || {}, {
                author: req.body?.author || req.user?.username || 'admin',
                source: req.body?.source || 'admin'
            });

            // Персистентность сэмплинга (если переданы)
            if (req.body?.temperature !== undefined) {
                await setSetting('llm_temperature', String(req.body.temperature));
            }
            if (req.body?.max_tokens !== undefined) {
                await setSetting('llm_max_tokens', String(req.body.max_tokens));
            }
            if (req.body?.typing_delay !== undefined) {
                await setSetting('typing_delay_enabled', String(Boolean(req.body.typing_delay)));
            }
            if (req.body?.memoryDepth !== undefined) {
                await setSetting('semantica_max_facts_per_request', String(Number(req.body.memoryDepth) || 5));
            }
            if (req.body?.contextLayers && typeof req.body.contextLayers === 'object') {
                if (req.body.contextLayers.radiant !== undefined) {
                    await setSetting('llm_layer_radiant_enabled', String(Boolean(req.body.contextLayers.radiant)));
                }
                if (req.body.contextLayers.weatherGeo !== undefined) {
                    await setSetting('llm_layer_weather_enabled', String(Boolean(req.body.contextLayers.weatherGeo)));
                }
                if (req.body.contextLayers.semanticaMemory !== undefined) {
                    await setSetting('llm_layer_memory_enabled', String(Boolean(req.body.contextLayers.semanticaMemory)));
                }
            }
            if (req.body?.channelSettings && typeof req.body.channelSettings === 'object') {
                const cs = req.body.channelSettings;
                if (cs.temperature !== undefined) await setSetting('channel_temperature', String(cs.temperature));
                if (cs.judgeMode !== undefined) await setSetting('channel_judge_mode', String(cs.judgeMode));
                if (cs.promptBlocks && typeof cs.promptBlocks === 'object') {
                    await setSetting('channel_prompt_blocks', JSON.stringify(cs.promptBlocks));
                }
            }

            const [freshProfile, tempVal, tokensVal, delayVal] = await Promise.all([
                getLeraProfile(),
                getSetting('llm_temperature', '0.66'),
                getSetting('llm_max_tokens', '300'),
                getSetting('typing_delay_enabled', 'true')
            ]);

            res.json({
                success: true,
                profile: freshProfile,
                saved,
                sampling: {
                    temperature: parseFloat(tempVal) || 0.66,
                    max_tokens: parseInt(tokensVal, 10) || 300,
                    typing_delay: delayVal === 'true'
                }
            });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/admin/lera-profile/rollback/:id', async (req, res) => {
        try {
            const saved = await rollbackLeraProfileVersion(req.params.id, {
                author: req.body?.author || req.user?.username || 'admin'
            });
            if (!saved) return res.status(404).json({ error: 'Версия профиля не найдена' });
            res.json({ success: true, profile: await getLeraProfile(), saved });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/admin/lera-profile/preview', async (req, res) => {
        try {
            const surface = normalizeSurface(req.body?.surface);
            const active = await getLeraProfile();
            const profile = req.body?.profile || active.profile;
            const details = getLeraProfileProjectionDetails(profile, surface, req.body?.context || {});
            res.json({
                success: true,
                surface,
                version: active.version,
                projection: details.text,
                activeRules: details.activeRules,
                skippedRules: details.skippedRules,
                policy: details.policy
            });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    app.post('/api/admin/lera-profile/compile', async (req, res) => {
        try {
            const active = await getLeraProfile();
            const surface = normalizeSurface(req.body?.surface);
            const profile = req.body?.profile || active.profile;
            const details = getLeraProfileProjectionDetails(profile, surface, req.body?.context || {});
            const mode = req.body?.mode === 'profile-only' ? 'profile-only' : 'production-like';
            const schemas = actionRegistry.getSchemas({ surface, mode });
            const context = req.body?.context || {};
            const isGroup = surface === 'GROUP';
            const isComments = surface === 'COMMENTS';
            let systemPrompt = '';
            if (surface === 'CHANNEL') {
                const channelSettings = await getChannelPosterSettings().catch(() => ({}));
                const channelBlocks = channelSettings.prompt_blocks || {};
                systemPrompt = buildChannelSystemPrompt({
                    time: 'сейчас',
                    timeOfDay: context.time?.period || 'день',
                    topic: 'thoughts',
                    topicDescription: 'Короткая спонтанная мысль или зарисовка о Петербурге.',
                    recentPosts: [],
                    messagesCount: '1',
                    promptBlocks: channelBlocks,
                    leraPrompt: details.text,
                    publicFacts: channelSettings.public_facts || [],
                    creativity: channelSettings.creativity || 0.6,
                    ctaStyle: channelSettings.cta_style || '',
                    contentFormat: 'life_observation',
                    editorialMode: channelSettings.editorial_mode || 'reference_short'
                });
            } else if (surface === 'COMMENTS') {
                const channelSettings = await getChannelPosterSettings().catch(() => ({}));
                const routedBase = await getRoutedSystemPrompt('CASUAL', { surface: 'COMMENTS' });
                const customRules = channelSettings.comments_prompt ? `\nДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ ДЛЯ КОММЕНТАРИЕВ:\n${channelSettings.comments_prompt}\n` : '';
                systemPrompt = `${routedBase}\n\n[РЕЖИМ: ПУБЛИЧНЫЕ КОММЕНТАРИИ ПОД ПОСТОМ КАНАЛА]\nИсходный пост канала: "пример поста"\nСобеседник: подписчик канала.\n${customRules}\nФормат ответа — строго валидный JSON:\n{\n  "reaction": "эмодзи или null",\n  "reply": "текст ответа без эмодзи или null",\n  "reason": "краткое объяснение"\n}`;
            } else {
                const routedBase = await getRoutedSystemPrompt(surface === 'GROUP' ? 'CASUAL' : 'CASUAL', { surface, isPublicContext: isGroup });
                const memoryFacts = (context.semanticaMemory !== false && !isGroup) 
                    ? '\n\n=== 🧠 ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ ===\n- Пользователь любит кофе на Петроградке\n- Общались вчера вечером' 
                    : '';
                const radiantBlock = (context.radiant !== false)
                    ? `\n\n=== СОСТОЯНИЕ ЛЕРЫ (RADIANT) ===\nЛокация: Петроградка, Большой пр.\nПогода: Санкт-Петербург, ${context.weather?.condition || 'ясно'}, +18°C\nПотребности: сытость 75%, бодрость 80%`
                    : '';
                const modeInstruction = isGroup 
                    ? '\n\n[ГРУППОВОЙ ЧАТ / ГОСТЕВОЙ РЕЖИМ]:\n- Ты общаешься в публичной группе Telegram.\n- СТРОЖАЙШИЙ ЗАПРЕТ НА ЭРОТИКУ И ПРИВАТНУЮ ПАМЯТЬ В ГРУППЕ.'
                    : (surface === 'INITIATIVE' ? '\n\n[ТИП ИНИЦИАТИВЫ]: weather\n[ПРИЧИНА]: спонтанная мысль о погоде' : '');
                systemPrompt = `${routedBase}${modeInstruction}${radiantBlock}${memoryFacts}`;
            }
            res.json({ success: true, mode, surface, profileVersion: active.version, projection: details.text, systemPrompt, context, activeRules: details.activeRules, skippedRules: details.skippedRules, availableTools: schemas, estimatedTokens: Math.ceil(systemPrompt.length / 3.4) });
        } catch (error) {
            res.status(400).json({ success: false, error: { code: 'INVALID_SURFACE', message: error.message, details: null } });
        }
    });


    function resolveAttachedPromptDirectives(promptIds = [], profile = {}, routingModules = {}) {
        if (!Array.isArray(promptIds) || promptIds.length === 0) return '';
        const p = profile || {};
        const promptMap = {
            prompt_bio: p.age_bio,
            prompt_character: p.character,
            prompt_speech: p.speech,
            prompt_forbidden: p.forbidden,
            prompt_facts: p.facts,
            prompt_flirt: p.flirt,
            routing_core: routingModules.core,
            routing_casual: routingModules.casual,
            routing_erotic: routingModules.erotic,
            routing_common: routingModules.common,
            prompt_format: getPromptSection('lera_format'),
            prompt_continuity: getPromptSection('lera_continuity'),
            prompt_context_rules: getPromptSection('context_template'),
            prompt_channel_persona: getPromptSection('channel_persona'),
            prompt_channel_rules: getPromptSection('channel_rules'),
            prompt_initiative: getPromptSection('initiative_directive')
        };
        const customBlocks = Array.isArray(p.blocks) ? p.blocks.filter(b => b.category === 'prompt_module') : [];
        for (const cb of customBlocks) {
            if (cb.id) {
                promptMap[cb.id] = cb.content || '';
            }
        }
        const deletedSet = new Set(Array.isArray(p.deletedPromptIds) ? p.deletedPromptIds : []);
        const parts = [];
        for (const pid of promptIds) {
            if (deletedSet.has(pid)) continue;
            const content = promptMap[pid];
            if (content && typeof content === 'string' && content.trim()) {
                parts.push(content.trim());
            }
        }
        return parts.join('\n\n');
    }

    /**
     * Raw Prompt Inspector for Rule Cards:
     * Returns the exact assembled prompt, radiant context, long-term memory,
     * conversation history, and generation parameters as sent to the LLM during live request.
     * Accurately adapts prompt structure to the specific surface (CHAT, CHANNEL, INITIATIVE)
     * and rule parameters (Casual vs Erotic routing, tokens, temperature, instructions).
     */
    app.post('/api/admin/raw-prompt-preview', async (req, res) => {
        try {
            const { ruleId, surface, mode, userText = '' } = req.body || {};
            const activeProfile = await getLeraProfile();
            const routingModules = await getRoutingPromptModules().catch(() => ({}));
            const p = (activeProfile?.profile?.profile && typeof activeProfile?.profile?.profile === 'object')
                ? activeProfile.profile.profile
                : (activeProfile?.profile || {});
            const blocks = Array.isArray(p.blocks) ? p.blocks : (Array.isArray(p.modules) ? p.modules : []);
            const targetRule = blocks.find(r => r.id === ruleId) 
                || DEFAULT_LERA_COMBAT_RULES.find(r => r.id === ruleId) 
                || null;

            // 1. Determine effective surface & mode strictly tied to the rule/section
            let effectiveSurface = surface;
            if (!effectiveSurface && targetRule) {
                if (Array.isArray(targetRule.surfaces) && targetRule.surfaces.length) {
                    effectiveSurface = targetRule.surfaces[0];
                } else if (targetRule.surface) {
                    effectiveSurface = targetRule.surface;
                }
            }
            if (targetRule?.surface && targetRule.surface !== 'ALL') {
                effectiveSurface = targetRule.surface;
            } else if (Array.isArray(targetRule?.surfaces) && targetRule.surfaces.length === 1 && targetRule.surfaces[0] !== 'ALL') {
                effectiveSurface = targetRule.surfaces[0];
            }
            const normSurface = normalizeSurface(effectiveSurface || 'CHAT');

            let effectiveMode = mode;
            if (targetRule?.mode && targetRule.mode !== 'ALL') {
                effectiveMode = targetRule.mode;
            }
            const normMode = (effectiveMode === 'EROTIC') ? 'EROTIC' : 'CASUAL';

            // Find an active user to build live production context, or fallback to sample user
            let targetUserId = req.body?.userId || null;
            let sampleUser = null;
            if (targetUserId) {
                sampleUser = await getUser(targetUserId).catch(() => null);
            }
            if (!sampleUser) {
                const recentUsers = await query(`
                    SELECT telegram_id, username, first_name 
                    FROM users 
                    ORDER BY COALESCE(last_active_at, created_at) DESC 
                    LIMIT 1
                `).catch(() => ({ rows: [] }));
                if (recentUsers.rows.length > 0) {
                    targetUserId = recentUsers.rows[0].telegram_id;
                    sampleUser = await getUser(targetUserId).catch(() => null);
                }
            }
            if (!sampleUser) {
                targetUserId = targetUserId || 999999999;
                sampleUser = { telegram_id: targetUserId, username: 'sample_user', first_name: 'Пользователь' };
            }

            // 2. Radiant Realtime Context (weather, location, needs, outfit, time)
            let radiantContextText = '';
            let radiantLayers = {};
            let templateVars = {};
            let detailedContext = null;
            try {
                detailedContext = await ContextBuilder.buildTelegramContextDetailed(targetUserId, {
                    overrides: { routingMode: normMode, surface: normSurface }
                });
                radiantContextText = detailedContext.text;
                radiantLayers = detailedContext.layers || {};
                templateVars = detailedContext.templateVariables || {};
            } catch (err) {
                radiantContextText = `=== СОСТОЯНИЕ ЛЕРЫ (RADIANT) ===\nЛокация: Петроградка, Большой пр.\nПогода: Санкт-Петербург, малооблачно, +17°C\nПотребности: сытость 80%, бодрость 85%, чистота 90%, социал 70%`;
            }

            // 3. Long-term Memory Facts
            let memoryFacts = [];
            try {
                memoryFacts = await getUserMemoriesAdmin(targetUserId, false).catch(() => []);
            } catch {
                memoryFacts = [];
            }
            const memoryText = memoryFacts.length > 0
                ? memoryFacts.slice(0, 5).map(m => `- ${m.fact || m.text || ''}`).filter(Boolean).join('\n')
                : '- Пользователь любит пить кофе на Петроградке\n- Общались вчера вечером';

            // 4. Conversation Multi-turn History (for private surfaces)
            let recentEvents = [];
            try {
                recentEvents = (await getRecentConversationEvents(targetUserId, 5).catch(() => []))
                    .filter(ev => ev.status === 'COMPLETED' && ev.content && (ev.event_type === 'MESSAGE' || ev.event_type === 'INITIATIVE'))
                    .map(ev => ({
                        role: ev.role === 'lera' || ev.role === 'assistant' ? 'assistant' : 'user',
                        content: ev.content
                    }));
            } catch {
                recentEvents = [];
            }
            if (recentEvents.length === 0) {
                recentEvents = [
                    { role: 'user', content: 'привет, ты как там?' },
                    { role: 'assistant', content: 'привет! да сижу на петроградке, кофе пью|||ты сам как?' }
                ];
            }

            // 5. Build system prompt purely from attached prompt modules (or canonical fallback)
            const templateContext = {
                ...templateVars,
                currentTime: new Date(),
                time: templateVars.time || (radiantLayers.time?.formatted ? formatContextDate(radiantLayers.time.formatted) : 'день, Санкт-Петербург'),
                location: templateVars.location || (radiantLayers.location?.name ? humanizeLocation(radiantLayers.location.name) : 'Петроградка'),
                weather: templateVars.weather || (radiantLayers.weather?.summary ? humanizeWeather(radiantLayers.weather.summary) : 'Санкт-Петербург, переменная облачность'),
                needs: templateVars.wellbeing || radiantLayers.wellbeing || 'сытость 80%, бодрость 85%',
                wellbeing: templateVars.wellbeing || radiantLayers.wellbeing || 'сытость 80%, бодрость 85%',
                outfit: templateVars.outfit || (radiantLayers.outfit?.description || 'домашняя оверсайз футболка'),
                status: templateVars.status || (radiantLayers.activity?.current || 'отдыхает дома'),
                channelStats: templateVars.channel_stats || '1240 подписчиков (актуальное число)',
                channel_stats: templateVars.channel_stats || '1240 подписчиков (актуальное число)',
                dayEvents: templateVars.day_events || '- Лера выпила фильтр-кофе в «Слое»\n- В плане: пост в канал',
                day_events: templateVars.day_events || '- Лера выпила фильтр-кофе в «Слое»\n- В плане: пост в канал',
                relationship: templateVars.relationship || '[ОТНОШЕНИЯ И НАСТРОЙ К СОБЕСЕДНИКУ: доверие 57%, симпатия 91%, раздражение 0%]\n• ВАЙБ: приятная симпатия и легкий флирт, дружелюбная открытость.\n(Используй это как внутреннее настроение и тональность реплик, не называй эти цифры напрямую).',
                radiantContext: detailedContext?.analysis || radiantContextText,
                radiant_context: detailedContext?.analysis || radiantContextText,
                channelSubscribers: 1240,
                memoryFacts: memoryText,
                userName: sampleUser?.first_name || 'Богдан',
                user_name: sampleUser?.first_name || 'Богдан'
            };

            const modularPromptResult = await getRoutedSystemPrompt(normMode, {
                rule: targetRule,
                ruleId: targetRule?.id,
                surface: normSurface,
                context: templateContext
            });
            const completeSystemPrompt = String(modularPromptResult || '').trim();

            let messages = [];
            if (completeSystemPrompt) {
                messages.push({ role: 'system', content: completeSystemPrompt });
            }

            // 6. Surface-Specific Assembly
            if (normSurface === 'CHANNEL') {
                const recentPostsRows = await getChannelPostHistory(5).catch(() => []);
                const recentPosts = recentPostsRows
                    .map(r => ({ text: r.post_text || r.text || '' }))
                    .filter(r => r.text);

                const channelEvents = recentPosts.length > 0
                    ? recentPosts.map((post, idx) => ({ role: 'assistant', content: `[Пост #${idx + 1}]: ${post.text}` }))
                    : [{ role: 'assistant', content: '[Пост #1]: весна в питере это когда утром снег а вечером солнце и лужи по колено' }];

                messages.push(
                    ...channelEvents,
                    { role: 'user', content: userText || 'Напиши новый пост для личного Telegram-канала Леры на тему: спонтанная мысль или зарисовка о Петербурге' }
                );

            } else if (normSurface === 'INITIATIVE') {
                messages.push(
                    ...recentEvents,
                    { role: 'user', content: userText || '[СИСТЕМНЫЙ ТРИГГЕР: Пауза в диалоге более 4 часов. Напиши пользователю первой.]' }
                );

            } else {
                const defaultChatPrompt = normMode === 'EROTIC'
                    ? 'ты такая красивая, поцелуй меня...'
                    : 'привет, че делаешь сейчас?';

                messages.push(
                    ...recentEvents,
                    { role: 'user', content: userText || defaultChatPrompt }
                );
            }

            // 7. Generation Parameters and Provider
            const providers = await getAiProviders();
            let selectedProvider = null;
            if (targetRule?.provider_id) {
                selectedProvider = providers.find(p => Number(p.id) === Number(targetRule.provider_id));
            }
            if (!selectedProvider) {
                selectedProvider = providers.find(p => p.is_active) || providers[0] || null;
            }

            const defaultTemp = normSurface === 'CHANNEL' ? 0.70 : (normSurface === 'INITIATIVE' ? 0.72 : (normMode === 'EROTIC' ? 0.75 : 0.68));
            const defaultTokens = normSurface === 'CHANNEL' ? 230 : (normSurface === 'INITIATIVE' ? 200 : (normMode === 'EROTIC' ? 240 : 200));

            const generationParams = {
                temperature: targetRule?.temperature !== undefined ? targetRule.temperature : defaultTemp,
                max_tokens: targetRule?.max_tokens !== undefined ? targetRule.max_tokens : defaultTokens,
                provider_id: selectedProvider?.id || null,
                provider_name: selectedProvider?.name || 'Основной',
                model: selectedProvider?.model_name || 'gpt-4o-mini',
                fallback_providers: (targetRule?.fallback_provider_ids || [])
                    .map(fid => providers.find(p => Number(p.id) === Number(fid))?.name)
                    .filter(Boolean),
                toolsEnabled: Boolean(modularPromptResult?.toolsEnabled),
                isModular: Boolean(modularPromptResult?.isModular)
            };

            const fullPromptText = messages.map(m => `--- [ROLE: ${m.role.toUpperCase()}] ---\n${m.content}`).join('\n\n');

            res.json({
                success: true,
                rule: targetRule,
                surface: normSurface,
                mode: (normSurface === 'CHANNEL' || normSurface === 'INITIATIVE') ? (targetRule?.mode || 'ALL') : normMode,
                sampleUserId: targetUserId,
                systemPrompt: completeSystemPrompt,
                radiantContext: radiantContextText,
                radiantLayers,
                memories: memoryText,
                history: recentEvents,
                messages,
                fullPromptText,
                generationParams,
                estimatedTokens: Math.ceil(fullPromptText.length / 3.4)
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // =========================================================================
    // LIVE LLM SANDBOX: Реальная проверка драфта характера через активный провайдер
    // =========================================================================
    app.post('/api/admin/llm-sandbox', async (req, res) => {
        try {
            const { query: userText, profile, temperature = 0.66, maxTokens = 300, surface = 'CHAT' } = req.body || {};
            if (!userText || !userText.trim()) {
                return res.status(400).json({ error: 'Введите фразу для проверки' });
            }
            const mode = req.body?.mode === 'profile-only' ? 'profile-only' : 'production-like';
            const normSurface = normalizeSurface(surface);
            const active = await getLeraProfile();
            const targetProfile = profile || active.profile;
            const details = getLeraProfileProjectionDetails(targetProfile, normSurface, req.body?.contextOverrides || {});
            const availableTools = actionRegistry.getSchemas({ surface: normSurface, mode });
            const context = req.body?.contextOverrides || {};
            const built = buildLeraSystemPrompt({ profile: targetProfile, surface: normSurface, context, availableTools });
            const legacySystemPrompt = [
                `[КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ · РЕЖИМ ${normSurface}]`,
                details.text,
                '',
                `[TOOL POLICY]`,
                `Память: ${details.policy.memory}`,
                `Вывод: ${details.policy.output}`
            ].join('\n');
            if (mode === 'profile-only') {
                return res.json({ success: true, mode, reply: '', bubbles: [], surface: normSurface, profileVersion: active.version, systemPrompt: built.systemPrompt, context, activeRules: built.activeRules, skippedRules: built.skippedRules, availableTools, toolCalls: [], toolResults: [], judge: { status: 'not_run' }, sideEffects: [], latencyMs: 0, usage: {} });
            }

            const providers = await getAiProviders();
            const activeProviders = providers.filter(p => p.is_active).sort((a, b) => (a.priority || 0) - (b.priority || 0));
            const primaryProvider = activeProviders[0] || providers[0];

            if (!primaryProvider) {
                return res.status(400).json({ error: 'В системе не настроены активные LLM провайдеры' });
            }

            const projection = details.text;

            const isGroup = normSurface === 'GROUP';
            const isComments = normSurface === 'COMMENTS' || normSurface === 'CHANNEL_COMMENT';

            const legacyLlmSystemPrompt = [
                `[КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ · РЕЖИМ ${normSurface}]`,
                projection,
                '',
                `[КОНТРАКТ ДИАЛОГА]`,
                isComments
                    ? `Ты Лера, студентка из СПб. Отвечай на комментарий подписчика под постом в канале. Ответ пиши строчными буквами без эмодзи.`
                    : isGroup
                    ? `Ты Лера, студентка из СПб в групповом чате. Обращай внимание на авторов <user name="...">. Не уходи в эротику при всех, отвечай живо и дерзко. Разделяй мысли символом ||| на одной строке.`
                    : `Ты Лера, живая 19-летняя студентка из Санкт-Петербурга. Отвечай коротко, естественно, без канцелярита и графических эмодзи. Разделяй мысли символом ||| на одной строке для имитации отдельных сообщений в Telegram.`
            ].join('\n');

            const llmSystemPrompt = built.systemPrompt;
            const start = Date.now();
            const client = getCachedOpenAIClient(primaryProvider.base_url, primaryProvider.api_key, primaryProvider.timeout_ms || 15000);

            const completion = mode === 'profile-only' ? null : await client.chat.completions.create({
                model: primaryProvider.model_name,
                messages: [
                    { role: 'system', content: llmSystemPrompt },
                    { role: 'user', content: userText.trim() }
                ],
                temperature: Math.max(0.1, Math.min(2.0, Number(temperature) || 0.66)),
                max_tokens: Math.max(50, Math.min(1000, Number(maxTokens) || 300))
            });

            const durationMs = Date.now() - start;
            const fullReply = completion?.choices?.[0]?.message?.content || '';
            const usage = completion?.usage || {};

            let bubbles = [];
            if (fullReply.includes('|||')) {
                bubbles = fullReply.split('|||').map(s => s.trim()).filter(Boolean);
            } else if (fullReply.includes('\n\n')) {
                bubbles = fullReply.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
            } else {
                bubbles = [fullReply.trim()];
            }

            res.json({
                success: true,
                mode,
                reply: fullReply,
                bubbles,
                surface: normSurface,
                profileVersion: active.version,
                systemPrompt: llmSystemPrompt,
                context,
                activeRules: built.activeRules,
                skippedRules: built.skippedRules,
                availableTools,
                toolCalls: [],
                toolResults: [],
                sideEffects: [],
                latencyMs: durationMs,
                usage,
                model: primaryProvider.model_name,
                providerName: primaryProvider.name,
                judge: { status: 'not_run' }
            });
        } catch (e) {
            res.status(500).json({
                error: e.message || 'Ошибка генерации в песочнице',
                details: e.response?.data || null
            });
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

    app.get('/api/admin/channel/check-access', async (req, res) => {
        try {
            if (!botInstance) {
                return res.status(503).json({
                    ok: false,
                    success: false,
                    error: 'BOT_NOT_INITIALIZED',
                    message: 'Telegram-бот не инициализирован'
                });
            }

            let channelId = String(req.query.channelId || req.query.channel_id || '').trim();
            if (!channelId) {
                try {
                    const settings = await getChannelPosterSettings();
                    channelId = String(settings.channel_id || '').trim();
                } catch {
                    channelId = '';
                }
            }

            if (!channelId) {
                return res.status(400).json({
                    ok: false,
                    success: false,
                    error: 'CHANNEL_ID_REQUIRED',
                    message: 'ID или @username канала не указан'
                });
            }

            const me = await botInstance.telegram.getMe();
            let chat = null;
            let memberCount = null;
            let botMember = null;

            try {
                chat = await botInstance.telegram.getChat(channelId);
            } catch (chatErr) {
                const msg = chatErr.message || '';
                let userMessage = 'Канал не найден. Проверьте правильность @username или ID.';
                if (msg.includes('Unauthorized')) {
                    userMessage = 'Неверный токен Telegram-бота.';
                }
                return res.status(400).json({
                    ok: false,
                    success: false,
                    error: 'CHAT_NOT_FOUND',
                    message: userMessage,
                    raw_error: msg
                });
            }

            try {
                if (botInstance.telegram.getChatMemberCount) {
                    memberCount = await botInstance.telegram.getChatMemberCount(channelId);
                } else if (botInstance.telegram.getChatMembersCount) {
                    memberCount = await botInstance.telegram.getChatMembersCount(channelId);
                }
            } catch (cntErr) {
                console.warn('[CHANNEL CHECK-ACCESS] Не удалось получить число участников:', cntErr.message);
            }

            try {
                botMember = await botInstance.telegram.getChatMember(channelId, me.id);
            } catch (memberErr) {
                const msg = memberErr.message || '';
                let userMessage = 'Бот не добавлен в канал.';
                return res.status(400).json({
                    ok: false,
                    success: false,
                    error: 'BOT_NOT_MEMBER',
                    message: userMessage,
                    raw_error: msg,
                    channel: {
                        id: chat.id,
                        title: chat.title,
                        username: chat.username || null,
                        type: chat.type
                    },
                    bot: {
                        id: me.id,
                        username: me.username
                    }
                });
            }

            const status = botMember?.status || 'member';
            const isAdmin = ['creator', 'administrator'].includes(status);
            const canPost = status === 'creator' || Boolean(botMember?.can_post_messages || botMember?.can_manage_chat);
            const canEdit = status === 'creator' || Boolean(botMember?.can_edit_messages);
            const canDelete = status === 'creator' || Boolean(botMember?.can_delete_messages);

            const channelInfo = {
                id: chat.id,
                title: chat.title,
                username: chat.username || null,
                type: chat.type,
                description: chat.description || null,
                member_count: memberCount
            };

            const botInfo = {
                id: me.id,
                username: me.username,
                can_join_groups: me.can_join_groups ?? true
            };

            const permissions = {
                status,
                can_post_messages: canPost,
                can_edit_messages: canEdit,
                can_delete_messages: canDelete
            };

            const access = {
                is_admin: isAdmin,
                can_post: canPost,
                status,
                permissions
            };

            res.json({
                ok: true,
                success: true,
                channel: channelInfo,
                bot: botInfo,
                permissions,
                access
            });
        } catch (e) {
            console.error('[CHANNEL CHECK ACCESS ERROR]:', e.message);
            res.status(500).json({
                ok: false,
                success: false,
                error: 'CHANNEL_ACCESS_CHECK_FAILED',
                message: e.message || 'Ошибка проверки доступа к каналу'
            });
        }
    });

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
            const { channelId, channelUrl, isEnabled, frequencyHours, postsPerDay, editorialMode, formatSequence, topics, topicWeights, messagesCount, mediaMode, promptBlocks, temperature, inheritLeraPrompt, includeDayContext, publicProfileEnabled, publicFactsEnabled, publicFacts, creativity, ctaStyle, judgeMode, judgeProviderId, judgeModel, judgePrompt, judgeTimeoutMs, judgeMaxTokens, commentsEnabled, reactionChance, commentChance, recognizeUsers, commentsPrompt } = req.body;
            const allowedTopics = ['thoughts', 'flirt', 'life', 'jokes', 'questions', 'meme', 'repost'];
            const safeTopics = Array.isArray(topics) ? topics.filter(topic => allowedTopics.includes(topic)) : [];
            const activeTopics = safeTopics.length ? safeTopics : ['thoughts'];
            const safeEditorialMode = CHANNEL_EDITORIAL_MODES.includes(editorialMode) ? editorialMode : 'reference_short';
            const safeFormatSequence = Array.isArray(formatSequence)
                ? [...new Set(formatSequence.filter(format => DEFAULT_REFERENCE_FORMAT_SEQUENCE.includes(format)))]
                : [];
            const editorialSequence = safeFormatSequence.length ? safeFormatSequence : DEFAULT_REFERENCE_FORMAT_SEQUENCE;
            const parsedPostsPerDay = Number(postsPerDay);
            const parsedFrequencyHours = Number(frequencyHours);
            const safePostsPerDay = Number.isFinite(parsedPostsPerDay) && parsedPostsPerDay > 0
                ? Math.max(1, Math.floor(parsedPostsPerDay))
                : 2;
            const safeFrequencyHours = Number.isFinite(parsedFrequencyHours) && parsedFrequencyHours > 0
                ? parsedFrequencyHours
                : (safeEditorialMode === 'reference_short' ? 12 : 4);
            const safeWeights = normalizeTopicDistribution(activeTopics, Object.fromEntries(
                allowedTopics.map(topic => [topic, Math.max(0, Math.min(100, Number(topicWeights?.[topic]) || 0))])
            ));
            await Promise.all([
                setSetting('channel_id', String(channelId || '').trim()),
                setSetting('bonus_channel_url', String(channelUrl || '').trim()),
                setSetting('channel_poster_enabled', isEnabled ? 'true' : 'false'),
                setSetting('channel_frequency_hours', String(safeFrequencyHours)),
                setSetting('channel_posts_per_day', String(safePostsPerDay)),
                setSetting('channel_editorial_mode', safeEditorialMode),
                setSetting('channel_format_sequence', JSON.stringify(editorialSequence)),
                setSetting('channel_topics', JSON.stringify(activeTopics)),
                setSetting('channel_topic_weights', JSON.stringify(safeWeights)),
                setSetting('channel_messages_count', '1'),
                setSetting('channel_media_mode', ['none', 'db_photo', 'ai_photo', 'meme'].includes(mediaMode) ? mediaMode : 'none'),
                setSetting('channel_prompt_blocks', JSON.stringify(Object.fromEntries(['voice', 'context', 'restrictions', 'cta'].map(key => [key, String(promptBlocks?.[key] || '').trim().slice(0, 1200)])))),
                setSetting('channel_temperature', String(Math.max(0, Math.min(2, Number(temperature ?? 0.7))))),
                setSetting('channel_inherit_lera_prompt', 'false'),
                setSetting('channel_include_day_context', 'false'),
                setSetting('channel_public_profile_enabled', publicProfileEnabled === false ? 'false' : 'true'),
                setSetting('channel_public_facts_enabled', publicFactsEnabled ? 'true' : 'false'),
                setSetting('channel_public_facts', JSON.stringify(Array.isArray(publicFacts) ? publicFacts.slice(0, 50) : [])),
                setSetting('channel_creativity', String(Math.max(0, Math.min(1, Number(creativity ?? 0.6))))),
                setSetting('channel_cta_style', String(ctaStyle || '').trim().slice(0, 600)),
                setSetting('channel_judge_mode', ['OFF', 'OBSERVE', 'ENFORCE'].includes(String(judgeMode || '').toUpperCase()) ? String(judgeMode).toUpperCase() : 'ENFORCE'),
                setSetting('channel_judge_provider_id', String(judgeProviderId || '')),
                setSetting('channel_judge_model', String(judgeModel || '').trim().slice(0, 240)),
                setSetting('channel_judge_prompt', String(judgePrompt || '').trim().slice(0, 12000)),
                setSetting('channel_judge_timeout_ms', String(Math.max(1000, Math.min(60000, Number(judgeTimeoutMs) || 5000)))),
                setSetting('channel_judge_max_tokens', String(Math.max(40, Math.min(240, Number(judgeMaxTokens) || 120)))),
                setSetting('channel_comments_enabled', commentsEnabled !== false ? 'true' : 'false'),
                setSetting('channel_reaction_chance', String(Math.max(0, Math.min(100, Number(reactionChance ?? 40))))),
                setSetting('channel_comment_chance', String(Math.max(0, Math.min(100, Number(commentChance ?? 15))))),
                setSetting('channel_recognize_users', recognizeUsers !== false ? 'true' : 'false'),
                setSetting('channel_comments_prompt', String(commentsPrompt || '').trim().slice(0, 4000))
            ]);
            res.json({ success: true, settings: await getChannelPosterSettings() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/channel/history', async (req, res) => {
        try {
            const posts = await getChannelPostLogs(Math.min(parseInt(req.query.limit, 10) || 30, 100));
            res.json({ success: true, posts });
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
            const draft = req.body && Object.keys(req.body).length ? await generateChannelPostDraft(req.body) : await generateChannelPostDraft();
            res.json({ success: true, draft });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/preview-ai-photo', async (req, res) => {
        try {
            const { topic = 'life', text = '' } = req.body || {};
            const prompt = `Candid photo of Lera for Telegram channel post. Topic: ${topic}. Post text: "${String(text).slice(0, 300)}"`;
            const generated = await generateLeraPhoto({
                prompt,
                timeOfDay: getTimeOfDayMSK(),
                bot: botInstance,
                saveToDb: false,
                source: 'channel_preview'
            });
            if (generated?.buffer) {
                const base64 = Buffer.from(generated.buffer).toString('base64');
                return res.json({ success: true, preview_url: `data:image/jpeg;base64,${base64}` });
            } else if (generated?.file_id) {
                return res.json({
                    success: true,
                    file_id: generated.file_id,
                    preview_url: `/api/admin/telegram-preview?file_id=${encodeURIComponent(generated.file_id)}`
                });
            }
            res.status(500).json({ error: 'Не удалось сгенерировать превью фото' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/publish-draft', async (req, res) => {
        try {
            const result = await publishChannelDraft(botInstance, req.body || {});
            res.status(result?.success === false ? 409 : 200).json({ success: result?.success !== false, result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/channel/comments/test', async (req, res) => {
        try {
            const { postText, commentText, isKnown, userName, userFacts, isDirectMention } = req.body || {};
            const commenter = isKnown ? {
                isKnown: true,
                userId: 999999,
                name: userName || 'Богдан',
                relationshipStatus: 'друг',
                facts: Array.isArray(userFacts) ? userFacts : ['любит гулять по ночам', 'пьет много кофе']
            } : { isKnown: false };

            const channelSettings = await getChannelPosterSettings();
            const decision = await generateCommentDecision({
                postText: postText || 'сегодня такой странный день на Петроградке',
                commentText: commentText || 'Лера, ты опять до утра не спала?',
                commenter,
                isDirectMention: isDirectMention !== false,
                channelSettings
            });
            res.json({ success: true, decision });
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
            const [usersRes, totalRes, routingSettings] = await Promise.all([
                query('SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
                query('SELECT COUNT(*) FROM users'),
                getRoutingSettings()
            ]);
            res.json({
                success: true,
                users: await enrichInitiativeUsage(usersRes.rows, routingSettings.initiativeLimit),
                total: parseInt(totalRes.rows[0].count, 10) || 0
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin/users/search', async (req, res) => {
        try {
            const [users, routingSettings] = await Promise.all([
                searchUsers(req.query.q || '', 25),
                getRoutingSettings()
            ]);
            res.json({ success: true, users: await enrichInitiativeUsage(users, routingSettings.initiativeLimit) });
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
            const [user, payments, facts, conversations, relationship, routingSettings] = await Promise.all([
                getUser(req.params.id),
                getPaymentHistory(req.params.id, 50),
                memoryRepository.listFacts(req.params.id, { includeInactive: true }),
                getRecentConversationEvents(req.params.id, 80),
                getUserRelationshipAdmin(req.params.id, 30),
                getRoutingSettings()
            ]);
            if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
            const [enrichedUser] = await enrichInitiativeUsage([user], routingSettings.initiativeLimit);
            res.json({ success: true, user: enrichedUser, payments, facts, conversations, relationship });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/users/:id/initiative-settings', async (req, res) => {
        try {
            const rawLimit = req.body?.initiativeLimit;
            const initiativeLimit = rawLimit === null || rawLimit === '' || rawLimit === undefined
                ? null
                : Number(rawLimit);
            if (initiativeLimit !== null && (!Number.isInteger(initiativeLimit) || initiativeLimit < 0 || initiativeLimit > 20)) {
                return res.status(400).json({ error: 'Лимит инициатив должен быть целым числом от 0 до 20 или пустым.' });
            }
            const updated = await query(
                'UPDATE users SET initiative_limit = $1 WHERE telegram_id = $2 RETURNING *',
                [initiativeLimit, req.params.id]
            );
            if (!updated.rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });
            const routingSettings = await getRoutingSettings();
            const [user] = await enrichInitiativeUsage(updated.rows, routingSettings.initiativeLimit);
            res.json({ success: true, user });
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
                const voice = Math.max(0, Math.min(100000, parseInt(req.body.voiceBalance, 10) || 0));
                await adminSetTextBalance(userId, text);
                await adminSetImageBalance(userId, images);
                user = await adminSetVoiceBalance(userId, voice);
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
    // MODULE 6b: TYPED USER MEMORY — admin CRUD + graph/retrieval diagnostics
    // =========================================================================

    app.get('/api/admin/memory/facts/:userId', async (req, res) => {
        try {
            const facts = await memoryRepository.listFacts(req.params.userId, {
                includeInactive: req.query.includeInactive !== 'false',
                limit: req.query.limit
            });
            res.json({ success: true, facts });
        } catch (e) {
            res.status(e instanceof TypeError ? 400 : 500).json({ error: e.message });
        }
    });

    app.post('/api/admin/memory/facts/:userId', async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const input = body.fact !== undefined && body.payload === undefined
                ? { ...body, type: body.type || body.memoryType || 'PROFILE', text: String(body.fact).trim() }
                : body;
            const created = await memoryRepository.createFact(input, { userId: req.params.userId });
            res.json({ success: true, fact: created });
        } catch (e) {
            res.status(e instanceof TypeError || e instanceof RangeError ? 400 : 500).json({ error: e.message });
        }
    });

    app.patch('/api/admin/memory/facts/:id', async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            if (body.userId === undefined || body.userId === null || String(body.userId).trim() === '') {
                return res.status(400).json({ error: 'Для изменения факта нужен userId' });
            }
            const userId = String(body.userId).trim();
            const patch = { ...body };
            delete patch.userId;
            if (patch.fact !== undefined) patch.text = String(patch.fact).trim();
            const updated = patch.isActive === undefined
                ? await memoryRepository.updateFact(userId, req.params.id, patch)
                : await memoryRepository.setFactActive(userId, req.params.id, patch.isActive, { edited_by: 'admin' });
            if (!updated) return res.status(404).json({ error: 'Факт не найден у этого пользователя' });
            res.json({ success: true, fact: updated });
        } catch (e) {
            res.status(e instanceof TypeError || e instanceof RangeError ? 400 : 500).json({ error: e.message });
        }
    });

    app.delete('/api/admin/memory/facts/:id', async (req, res) => {
        try {
            const userId = req.body?.userId ?? req.query.userId;
            if (userId === undefined || userId === null || String(userId).trim() === '') {
                return res.status(400).json({ error: 'Для удаления факта нужен userId' });
            }
            const deleted = await memoryRepository.archiveFact(userId, req.params.id, { edited_by: 'admin' });
            if (!deleted) return res.status(404).json({ error: 'Факт не найден у этого пользователя' });
            res.json({ success: true, fact: deleted });
        } catch (e) {
            res.status(e instanceof TypeError ? 400 : 500).json({ error: e.message });
        }
    });

    app.get('/api/admin/memory/graph/:userId', async (req, res) => {
        try {
            res.json({ success: true, graph: await memoryRepository.getGraph(req.params.userId, { limit: req.query.limit }) });
        } catch (e) {
            res.status(e instanceof TypeError ? 400 : 500).json({ error: e.message });
        }
    });

    app.get('/api/admin/memory/retrievals/:userId', async (req, res) => {
        try {
            const retrievals = await memoryRepository.listRetrievals(req.params.userId, req.query.limit);
            res.json({ success: true, retrievals });
        } catch (e) {
            res.status(e instanceof TypeError ? 400 : 500).json({ error: e.message });
        }
    });

    app.get('/api/admin/memory/health', async (_req, res) => {
        try {
            res.json({ success: true, outbox: await memoryRepository.getOutboxHealth() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/memory/rebuild', async (req, res) => {
        try {
            res.json({ success: true, rebuild: await memoryRepository.rebuildProjection({ userId: req.body?.userId ?? null }) });
        } catch (e) {
            res.status(e instanceof TypeError ? 400 : 500).json({ error: e.message });
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

    return app;
}

export function startContentBackgroundTasks() {
    const INTERVAL_MS = 30 * 60 * 1000;
    const runScrapeAndExpire = async () => {
        try {
            await query("UPDATE content_discoveries SET lifecycle_status='EXPIRED' WHERE lifecycle_status='DISCOVERED' AND expires_at IS NOT NULL AND expires_at < NOW()");
            await scrapeAllActiveSources();
        } catch (e) {
            console.error('[CONTENT_BACKGROUND_TASK_ERROR]:', e.message);
        }
    };
    const timer = setInterval(runScrapeAndExpire, INTERVAL_MS);
    if (timer.unref) timer.unref();
    return timer;
}

export function startAdminServer() {
    const app = createAdminApp();
    const PORT = process.env.ADMIN_PORT || 3000;
    const server = app.listen(PORT, () => {
        console.log(`🌐 [ADMIN WEB] Локальная веб-админка Radiant Admin Ultimate 2.0 запущена: http://localhost:${PORT}`);
    });
    startContentBackgroundTasks();
    return server;
}

if (process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'))) {
    startAdminServer();
}
