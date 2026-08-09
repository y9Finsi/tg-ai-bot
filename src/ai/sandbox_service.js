import {
    getAiProviders,
    getActiveAiProvider,
    getUser,
    getUserMemories,
    saveSandboxRun
} from '../db/database.js';
import { ContextBuilder } from './context_builder.js';
import { classifyIntent, getRoutingSettings, STUDIO_INTENTS } from './intent_router.js';
import { getLeraPrompts, getRoutingPromptModules } from '../prompts.js';
import { getCachedOpenAIClient, requestLlmCompletion } from './llm_client.js';

export const SANDBOX_HISTORY_LIMIT = 10;
export const SANDBOX_PRESET_VERSION = 3;

export const DEFAULT_SANDBOX_SAMPLING = Object.freeze({
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 200,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    repetition_penalty: 1,
    seed: null
});

const ADVANCED_SAMPLERS = ['repetition_penalty', 'seed'];
const PROMPT_MODULE_DEFAULTS = Object.freeze({
    core: true,
    common: true,
    intent: true,
    context: true,
    memory: true,
    history: true
});
const SANDBOX_MEDIA_PREVIEW_INSTRUCTION = [
    '[SANDBOX MEDIA PREVIEW]',
    'При желании ты можешь добавить в конец ответа тег [IMAGE: краткое описание фото на английском].',
    'В песочнице фото не генерируется и не отправляется: тег нужен только для инспекции.'
].join('\n');

function clamp(value, fallback, min, max, integer = false) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const normalized = Math.max(min, Math.min(max, number));
    return integer ? Math.round(normalized) : normalized;
}

function asText(value, max = 12000) {
    return String(value || '').trim().slice(0, max);
}

function normalizeMessage(item, index) {
    const role = item?.role === 'assistant' || item?.role === 'lera' ? 'assistant' : 'user';
    const content = asText(item?.content, 12000);
    return { id: item?.id || `sandbox-history-${index}`, role, content };
}

export function normalizeSandboxHistory(history = []) {
    const normalized = Array.isArray(history)
        ? history.map(normalizeMessage).filter(item => item.content)
        : [];
    const included = normalized.slice(-SANDBOX_HISTORY_LIMIT);
    const excluded = normalized.slice(0, Math.max(0, normalized.length - SANDBOX_HISTORY_LIMIT))
        .map(item => ({ ...item, excludedReason: 'context_window_limit' }));
    return {
        historyLimit: SANDBOX_HISTORY_LIMIT,
        historyIncluded: included,
        historyExcluded: excluded
    };
}

export function migratePresetToCurrent(rawPreset = {}) {
    const rawSampling = rawPreset?.sampling && typeof rawPreset.sampling === 'object' ? rawPreset.sampling : {};
    const sampling = {
        temperature: clamp(rawSampling.temperature, DEFAULT_SANDBOX_SAMPLING.temperature, 0, 2),
        top_p: clamp(rawSampling.top_p, DEFAULT_SANDBOX_SAMPLING.top_p, 0, 1),
        max_tokens: clamp(rawSampling.max_tokens, DEFAULT_SANDBOX_SAMPLING.max_tokens, 10, 1000, true),
        presence_penalty: clamp(rawSampling.presence_penalty, DEFAULT_SANDBOX_SAMPLING.presence_penalty, -2, 2),
        frequency_penalty: clamp(rawSampling.frequency_penalty, DEFAULT_SANDBOX_SAMPLING.frequency_penalty, -2, 2),
        repetition_penalty: clamp(rawSampling.repetition_penalty, DEFAULT_SANDBOX_SAMPLING.repetition_penalty, 1, 2),
        seed: rawSampling.seed === null || rawSampling.seed === undefined || rawSampling.seed === ''
            ? null
            : clamp(rawSampling.seed, null, -2147483648, 2147483647, true)
    };
    const rawIntentConfigs = rawPreset?.intent_configs || rawPreset?.intentConfigs;
    const intentConfigs = rawIntentConfigs && typeof rawIntentConfigs === 'object'
        ? Object.fromEntries(STUDIO_INTENTS
            .filter(intent => rawIntentConfigs[intent] || rawIntentConfigs[intent.toLowerCase()])
            .map(intent => {
                const value = rawIntentConfigs[intent] || rawIntentConfigs[intent.toLowerCase()];
                return [intent, {
                    ...value,
                    sampling: value?.sampling && typeof value.sampling === 'object'
                        ? value.sampling
                        : value
                }];
            }))
        : null;
    return {
        preset: {
            version: SANDBOX_PRESET_VERSION,
            name: asText(rawPreset.name, 120) || 'Безымянный пресет',
            sampling,
            model: {
                provider_id: rawPreset?.model?.provider_id ? Number(rawPreset.model.provider_id) : null,
                model: asText(rawPreset?.model?.model, 240) || null
            },
            prompt_modules: Object.fromEntries(Object.keys(PROMPT_MODULE_DEFAULTS).map(key => [
                key,
                rawPreset?.prompt_modules?.[key] === undefined ? PROMPT_MODULE_DEFAULTS[key] : Boolean(rawPreset.prompt_modules[key])
            ])),
            system_overlay: asText(rawPreset.system_overlay, 12000),
            ...(intentConfigs ? { intent_configs: intentConfigs } : {})
        },
        migrated: Number(rawPreset?.version || 0) !== SANDBOX_PRESET_VERSION
    };
}

function readCapabilities(provider = {}) {
    const raw = provider.sampling_capabilities;
    if (Array.isArray(raw)) return new Set(raw.map(String));
    if (raw && typeof raw === 'object') return new Set(Object.entries(raw).filter(([, enabled]) => enabled).map(([key]) => key));
    return new Set();
}

export function requestSamplingForProvider(sampling, provider) {
    const capabilities = readCapabilities(provider);
    const extraBody = {};
    const skippedParams = [];
    const samplingStatus = {};
    const addStatus = (key, value, target = key) => {
        const supported = capabilities.has(key);
        samplingStatus[key] = {
            capability: supported ? 'supported' : 'unsupported',
            request: supported ? 'sent' : 'skipped',
            value
        };
        if (!supported) {
            skippedParams.push(key);
            return false;
        }
        if (target === 'extra_body') extraBody[key] = value;
        return true;
    };
    const standardValues = {
        temperature: sampling.temperature,
        top_p: sampling.top_p,
        max_tokens: sampling.max_tokens,
        presence_penalty: sampling.presence_penalty,
        frequency_penalty: sampling.frequency_penalty
    };
    for (const [key, value] of Object.entries(standardValues)) addStatus(key, value);

    for (const key of ADVANCED_SAMPLERS) {
        const meaningful = key === 'seed'
            ? sampling.seed !== null
            : Number(sampling[key] || 0) !== 0 && !(key === 'repetition_penalty' && Number(sampling[key]) === 1);
        if (!meaningful) continue;
        if (key === 'seed') {
            addStatus(key, sampling.seed);
        } else {
            addStatus(key, sampling[key], 'extra_body');
        }
    }
    return {
        temperature: samplingStatus.temperature?.request === 'sent' ? sampling.temperature : undefined,
        top_p: samplingStatus.top_p?.request === 'sent' ? sampling.top_p : undefined,
        maxTokens: samplingStatus.max_tokens?.request === 'sent' ? sampling.max_tokens : undefined,
        presence_penalty: samplingStatus.presence_penalty?.request === 'sent' ? sampling.presence_penalty : undefined,
        frequency_penalty: samplingStatus.frequency_penalty?.request === 'sent' ? sampling.frequency_penalty : undefined,
        samplingExtraBody: extraBody,
        skippedParams,
        samplingStatus,
        strictSampling: true,
        seed: samplingStatus.seed?.request === 'sent' ? sampling.seed : null
    };
}

export function extractMediaTriggers(rawText = '') {
    return [...String(rawText).matchAll(/\[IMAGE:\s*([^\]]+)\]/gi)]
        .map(match => asText(match[1], 2000))
        .filter(Boolean)
        .map(description => ({ type: 'IMAGE', description }));
}

export function assembleSandboxSystemBase({ basePrompt = '', promptLayers = [], contextText = '', memoryFacts = [], modules = PROMPT_MODULE_DEFAULTS, mediaPreview = false } = {}) {
    const layers = promptLayers.length ? promptLayers : [{ key: 'core', content: basePrompt }];
    const blocks = layers
        .filter(layer => modules[layer.key] !== false)
        .map(layer => layer.content)
        .filter(Boolean);
    if (modules.context !== false && contextText) blocks.push(contextText);
    if (modules.memory !== false && memoryFacts.length) {
        blocks.push(`[ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ]\n${memoryFacts.map(fact => `- ${fact}`).join('\n')}`);
    }
    if (mediaPreview) blocks.push(SANDBOX_MEDIA_PREVIEW_INSTRUCTION);
    return blocks.join('\n\n');
}

function resolvePromptLayers({ routingEnabled, resolvedIntent, prompts, routingModules }) {
    if (routingEnabled) {
        const intent = resolvedIntent === 'EROTIC' ? routingModules.erotic : resolvedIntent === 'JOKE' ? routingModules.joke : routingModules.casual;
        return [
            { key: 'core', label: 'Lera Base', content: routingModules.core },
            { key: 'common', label: 'Lera Speech & Rules', content: routingModules.common },
            { key: 'intent', label: `Intent: ${resolvedIntent}`, content: intent }
        ];
    }
    return [
        { key: 'core', label: 'Lera Base', content: prompts.prompts.lera_base },
        { key: 'common', label: 'Lera Speech & Rules', content: [prompts.prompts.lera_speech, prompts.prompts.lera_rules].filter(Boolean).join('\n\n') },
        { key: 'intent', label: 'Legacy style modules', content: [prompts.prompts.lera_intimacy, prompts.prompts.lera_jokes, prompts.prompts.lera_examples, prompts.prompts.lera_virt_examples].filter(Boolean).join('\n\n') }
    ];
}

async function resolveProvider(config = {}) {
    const providers = await getAiProviders();
    const requestedId = Number(config?.model?.provider_id || config?.provider_id || 0);
    const requested = requestedId ? providers.find(provider => Number(provider.id) === requestedId) : null;
    if (requestedId && !requested) throw new Error('Выбранный провайдер Sandbox не найден');
    const fallback = requested || providers.find(provider => provider.is_active) || providers[0] || await getActiveAiProvider();
    if (!fallback) throw new Error('Нет настроенных ИИ-провайдеров');
    return {
        ...fallback,
        model_name: asText(config?.model?.model, 240) || fallback.model_name
    };
}

async function buildFrozenContext(input = {}) {
    const userId = Number(input.userId || 0);
    const user = userId ? await getUser(userId) : null;
    if (userId && !user) throw new Error('Пользователь для Sandbox не найден');
    const normalizedHistory = normalizeSandboxHistory(input.history);
    const currentMessage = asText(input.userText, 12000);
    if (!currentMessage) throw new Error('Введите сообщение для Леры');
    const contextOverrides = input.contextOverrides && typeof input.contextOverrides === 'object' ? input.contextOverrides : {};
    const detailedContext = await ContextBuilder.buildTelegramContextDetailed(userId || null, {
        overrides: {
            currentTime: contextOverrides.current_time || new Date().toISOString(),
            preMessageGapSeconds: contextOverrides.pre_message_gap_seconds,
            location_id: contextOverrides.location_id,
            active_task: contextOverrides.status?.task_type
                ? { task_type: contextOverrides.status.task_type, status: 'IN_PROGRESS' }
                : undefined,
            outfit_text: contextOverrides.outfit_text,
            weather: contextOverrides.weather,
            dailyFacts: Array.isArray(contextOverrides.daily_facts) ? contextOverrides.daily_facts : undefined,
            mood: contextOverrides.mood
        }
    });
    const routingSettings = await getRoutingSettings();
    const requestedMode = ['CASUAL', 'EROTIC', 'JOKE'].includes(input.routingMode) ? input.routingMode : 'AUTO';
    let classifier = { executed: false, sharedByVariants: false, bypassed: true };
    let resolvedIntent = requestedMode;
    if (requestedMode === 'AUTO') {
        const result = routingSettings.enabled
            ? await classifyIntent({ userId: userId || 0, userText: currentMessage, history: normalizedHistory.historyIncluded, trace: false })
            : { mode: 'CASUAL', bypassed: true };
        resolvedIntent = result.mode || 'CASUAL';
        classifier = {
            executed: !result.bypassed,
            sharedByVariants: true,
            mode: resolvedIntent,
            model: result.model || null,
            providerName: result.providerName || null,
            latencyMs: result.latencyMs || 0,
            usage: result.usage || {},
            error: result.error || null
        };
    }
    const [prompts, routingModules] = await Promise.all([getLeraPrompts(), getRoutingPromptModules()]);
    const memories = userId ? await getUserMemories(userId, 30).catch(() => []) : [];
    return {
        user: user || { telegram_id: 0, first_name: 'Богдан', roleplay_mode: 'flirthot' },
        currentMessage,
        ...normalizedHistory,
        contextOverrides,
        context: detailedContext,
        routingSettings,
        resolvedIntent,
        classifier,
        promptLayers: resolvePromptLayers({ routingEnabled: routingSettings.enabled, resolvedIntent, prompts, routingModules }),
        memoryFacts: memories.map(item => item.fact).filter(Boolean),
        mediaPreview: input.mediaPreview === true,
        timestamp: contextOverrides.current_time || new Date().toISOString()
    };
}

async function generateVariant(frozen, config = {}, label = 'A') {
    const { preset } = migratePresetToCurrent(config);
    const provider = await resolveProvider(preset);
    const generation = requestSamplingForProvider(preset.sampling, provider);
    const enabledModules = preset.prompt_modules;
    const systemPrompt = [
        assembleSandboxSystemBase({
            promptLayers: frozen.promptLayers,
            contextText: frozen.context.text,
            memoryFacts: frozen.memoryFacts,
            modules: enabledModules,
            mediaPreview: frozen.mediaPreview
        }),
        preset.system_overlay ? `[SYSTEM PROMPT OVERLAY]\n${preset.system_overlay}` : ''
    ].filter(Boolean).join('\n\n');
    const messages = [
        { role: 'system', content: systemPrompt },
        ...(enabledModules.history === false ? [] : frozen.historyIncluded.map(({ role, content }) => ({ role, content }))),
        { role: 'user', content: frozen.currentMessage }
    ];
    const result = await requestLlmCompletion(
        { ...frozen.user, max_tokens: preset.sampling.max_tokens },
        messages,
        false,
        async () => ({
            client: getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || 15000),
            model: provider.model_name
        }),
        {
            trace: false,
            providers: [provider],
            modelOverride: provider.model_name,
            timeoutMs: provider.timeout_ms,
            ...generation
        }
    );
    return {
        label,
        preset,
        provider: { id: provider.id, name: provider.name, model: provider.model_name },
        response: result.rawText || '',
        rawResponse: result.rawText || '',
        usage: result.usage || {},
        latencyMs: result.latencyMs || 0,
        seed: generation.seed,
        skippedParams: generation.skippedParams,
        samplingStatus: generation.samplingStatus,
        mediaTriggers: extractMediaTriggers(result.rawText),
        messages,
        systemPrompt,
        providerPayload: result.providerPayload || {},
        promptLayers: [
            ...frozen.promptLayers.map(layer => ({ ...layer, enabled: enabledModules[layer.key] !== false })),
            { key: 'context', label: 'Context', content: frozen.context.text, enabled: enabledModules.context !== false },
            { key: 'memory', label: 'Memory', content: frozen.memoryFacts, enabled: enabledModules.memory !== false },
            { key: 'history', label: 'History', content: frozen.historyIncluded, enabled: enabledModules.history !== false }
        ],
        why: {
            intent: frozen.resolvedIntent,
            prompt: frozen.promptLayers.filter(layer => enabledModules[layer.key] !== false).map(layer => layer.label),
            context: enabledModules.context !== false,
            memoryFacts: enabledModules.memory !== false ? frozen.memoryFacts.length : 0,
            historyMessages: enabledModules.history !== false ? frozen.historyIncluded.length : 0,
            sampling: generation.samplingStatus
        }
    };
}

async function persistRun(kind, frozen, payload, result) {
    return saveSandboxRun({
        kind,
        request: {
            timestamp: frozen.timestamp,
            resolvedIntent: frozen.resolvedIntent,
            classifier: frozen.classifier,
            historyIncluded: frozen.historyIncluded,
            historyExcluded: frozen.historyExcluded,
            historyLimit: frozen.historyLimit,
            contextOverrides: frozen.contextOverrides,
            ...payload
        },
        result
    });
}

export async function generateSandbox(input = {}) {
    const frozen = await buildFrozenContext(input);
    const variant = await generateVariant(frozen, input.preset || input.variant || {}, 'A');
    const run = await persistRun('GENERATE', frozen, { preset: variant.preset }, variant);
    return {
        success: true,
        runId: run?.id || null,
        resolvedIntent: frozen.resolvedIntent,
        classifier: frozen.classifier,
        historyIncluded: frozen.historyIncluded,
        historyExcluded: frozen.historyExcluded,
        historyLimit: frozen.historyLimit,
        ...variant
    };
}

export async function generateSandboxAbTest(input = {}) {
    const frozen = await buildFrozenContext(input);
    const configs = { A: input.variantA || input.a || {}, B: input.variantB || input.b || {} };
    const results = await Promise.allSettled([
        generateVariant(frozen, configs.A, 'A'),
        generateVariant(frozen, configs.B, 'B')
    ]);
    const variants = Object.fromEntries(results.map((result, index) => {
        const label = index === 0 ? 'A' : 'B';
        return [label, result.status === 'fulfilled'
            ? result.value
            : { label, error: result.reason?.message || 'Ошибка генерации', response: '', usage: {}, latencyMs: 0, skippedParams: [], mediaTriggers: [] }];
    }));
    const run = await persistRun('AB_TEST', frozen, { variantA: configs.A, variantB: configs.B }, { variants });
    return {
        success: true,
        runId: run?.id || null,
        resolvedIntent: frozen.resolvedIntent,
        classifier: frozen.classifier,
        historyIncluded: frozen.historyIncluded,
        historyExcluded: frozen.historyExcluded,
        historyLimit: frozen.historyLimit,
        variants
    };
}
