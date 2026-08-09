import {
    getAiProviders,
    getOrderedAiProviders,
    getSetting,
    setSetting,
    getActiveAiProvider
} from '../database.js';
import { requestLlmCompletion, getCachedOpenAIClient } from './llm_client.js';

export const INTENT_MODES = ['CASUAL', 'EROTIC', 'JOKE'];
export const STUDIO_INTENTS = ['AUTO', ...INTENT_MODES];
export const INTENT_STUDIO_DRAFT_KEY = 'llm_routing_intent_draft';
export const INTENT_STUDIO_PRODUCTION_KEY = 'llm_routing_intent_production';
export const DEFAULT_ROUTING_SETTINGS = {
    enabled: true,
    classifierProviderId: '',
    classifierModel: '',
    classifierPrompt: 'Ты классификатор стиля ответа Леры. Проанализируй последние сообщения и новую реплику. Верни строго одно слово: CASUAL, EROTIC или JOKE.\n\nCASUAL — обычный разговор, флирт, бытовые вопросы, инициатива и вопросы про жизнь Леры.\nEROTIC — контекстный интимный или горячий диалог, включая продолжение уже начатой сцены.\nJOKE — просьба о шутке, мем, анекдот или ирония. Режим действует на один ответ.\n\nНе объясняй решение и не возвращай JSON.',
    classifierTimeoutMs: 7000,
    classifierMaxTokens: 3,
    casualTemperature: 0.68,
    casualMaxTokens: 200,
    eroticTemperature: 0.75,
    eroticMaxTokens: 240,
    jokeTemperature: 0.85,
    jokeMaxTokens: 180
};

const DEFAULT_PROMPT_MODULES = Object.freeze({
    core: true,
    common: true,
    intent: true,
    context: true,
    memory: true,
    history: true
});

const DEFAULT_INTENT_SAMPLING = Object.freeze({
    top_p: 0.95,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    repetition_penalty: 1,
    seed: null
});

function legacyIntentSampling(mode, settings) {
    const key = String(mode || '').toLowerCase();
    const fallback = key === 'erotic'
        ? { temperature: settings.eroticTemperature, max_tokens: settings.eroticMaxTokens }
        : key === 'joke'
            ? { temperature: settings.jokeTemperature, max_tokens: settings.jokeMaxTokens }
            : { temperature: settings.casualTemperature, max_tokens: settings.casualMaxTokens };
    return {
        ...DEFAULT_INTENT_SAMPLING,
        temperature: fallback.temperature,
        max_tokens: fallback.max_tokens
    };
}

function asJson(value, fallback = {}) {
    if (value && typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export function normalizeIntentConfig(mode, raw = {}, settings = DEFAULT_ROUTING_SETTINGS) {
    const legacy = legacyIntentSampling(mode, settings);
    const sampling = raw.sampling && typeof raw.sampling === 'object' ? raw.sampling : raw;
    const promptModules = raw.promptModules && typeof raw.promptModules === 'object'
        ? raw.promptModules
        : raw.prompt_modules && typeof raw.prompt_modules === 'object'
            ? raw.prompt_modules
            : {};
    const number = (value, fallback, min, max, integer = false) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        const clamped = Math.max(min, Math.min(max, parsed));
        return integer ? Math.round(clamped) : clamped;
    };
    return {
        sampling: {
            temperature: number(sampling.temperature, legacy.temperature, 0, 2),
            top_p: number(sampling.top_p, DEFAULT_INTENT_SAMPLING.top_p, 0, 1),
            max_tokens: number(sampling.max_tokens, legacy.max_tokens, 20, 1200, true),
            presence_penalty: number(sampling.presence_penalty, DEFAULT_INTENT_SAMPLING.presence_penalty, -2, 2),
            frequency_penalty: number(sampling.frequency_penalty, DEFAULT_INTENT_SAMPLING.frequency_penalty, -2, 2),
            repetition_penalty: number(sampling.repetition_penalty, DEFAULT_INTENT_SAMPLING.repetition_penalty, 1, 2),
            seed: sampling.seed === null || sampling.seed === undefined || sampling.seed === ''
                ? null
                : number(sampling.seed, null, -2147483648, 2147483647, true)
        },
        promptModules: Object.fromEntries(Object.keys(DEFAULT_PROMPT_MODULES).map(key => [
            key,
            promptModules[key] === undefined ? DEFAULT_PROMPT_MODULES[key] : Boolean(promptModules[key])
        ])),
        systemOverlay: String(raw.systemOverlay ?? raw.system_overlay ?? '').trim().slice(0, 12000),
        model: {
            provider_id: raw.model?.provider_id ? Number(raw.model.provider_id) : null,
            model: String(raw.model?.model || '').trim().slice(0, 240) || null
        }
    };
}

export function normalizeIntentConfigMap(raw, settings) {
    const source = asJson(raw, {});
    return Object.fromEntries(STUDIO_INTENTS.map(mode => [
        mode,
        normalizeIntentConfig(mode, source[mode] || {}, settings)
    ]));
}

async function readJsonSetting(key, fallback = {}) {
    return asJson(await getSetting(key, null), fallback);
}

async function writeJsonSetting(key, value) {
    await setSetting(key, JSON.stringify(value));
}

function asBool(value, fallback) {
    if (value === null || value === undefined) return fallback;
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function asNumber(value, fallback, min = -Infinity, max = Infinity) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export async function getRoutingSettings() {
    const values = await Promise.all(Object.keys(DEFAULT_ROUTING_SETTINGS).map(async key => [
        key,
        await getSetting(`llm_routing_${key}`, DEFAULT_ROUTING_SETTINGS[key])
    ]));
    const raw = Object.fromEntries(values);
    const settings = {
        enabled: true,
        classifierProviderId: String(raw.classifierProviderId || ''),
        classifierModel: String(raw.classifierModel || ''),
        classifierPrompt: String(raw.classifierPrompt || DEFAULT_ROUTING_SETTINGS.classifierPrompt),
        classifierTimeoutMs: asNumber(raw.classifierTimeoutMs, 7000, 1000, 60000),
        classifierMaxTokens: asNumber(raw.classifierMaxTokens, 3, 1, 8),
        casualTemperature: asNumber(raw.casualTemperature, 0.68, 0, 2),
        casualMaxTokens: asNumber(raw.casualMaxTokens, 200, 20, 1000),
        eroticTemperature: asNumber(raw.eroticTemperature, 0.75, 0, 2),
        eroticMaxTokens: asNumber(raw.eroticMaxTokens, 240, 20, 1200),
        jokeTemperature: asNumber(raw.jokeTemperature, 0.85, 0, 2),
        jokeMaxTokens: asNumber(raw.jokeMaxTokens, 180, 20, 1000)
    };
    const production = await readJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, {});
    return {
        ...settings,
        intentConfigs: normalizeIntentConfigMap(
            Object.fromEntries(STUDIO_INTENTS.map(mode => [mode, production[mode]?.config || production[mode] || {}])),
            settings
        )
    };
}

export async function updateRoutingSettings(input = {}) {
    const current = await getRoutingSettings();
    const next = {
        ...current,
        ...input
    };
    const normalized = {
        enabled: true,
        classifierProviderId: String(next.classifierProviderId || ''),
        classifierModel: String(next.classifierModel || '').trim(),
        classifierPrompt: String(next.classifierPrompt || current.classifierPrompt || DEFAULT_ROUTING_SETTINGS.classifierPrompt).trim(),
        classifierTimeoutMs: asNumber(next.classifierTimeoutMs, current.classifierTimeoutMs, 1000, 60000),
        classifierMaxTokens: asNumber(next.classifierMaxTokens, current.classifierMaxTokens, 1, 8),
        casualTemperature: asNumber(next.casualTemperature, current.casualTemperature, 0, 2),
        casualMaxTokens: asNumber(next.casualMaxTokens, current.casualMaxTokens, 20, 1000),
        eroticTemperature: asNumber(next.eroticTemperature, current.eroticTemperature, 0, 2),
        eroticMaxTokens: asNumber(next.eroticMaxTokens, current.eroticMaxTokens, 20, 1200),
        jokeTemperature: asNumber(next.jokeTemperature, current.jokeTemperature, 0, 2),
        jokeMaxTokens: asNumber(next.jokeMaxTokens, current.jokeMaxTokens, 20, 1000)
    };
    await Promise.all(Object.entries(normalized).map(([key, value]) =>
        setSetting(`llm_routing_${key}`, String(value))
    ));
    if (input.intentConfigs && typeof input.intentConfigs === 'object') {
        const configs = normalizeIntentConfigMap(input.intentConfigs, normalized);
        const currentProduction = await readJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, {});
        const production = Object.fromEntries(STUDIO_INTENTS.map(mode => [
            mode,
            currentProduction[mode] || { version: 1, config: configs[mode], publishedAt: new Date().toISOString() }
        ]));
        await writeJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, production);
    }
    return {
        ...normalized,
        intentConfigs: (await getRoutingSettings()).intentConfigs
    };
}

async function getClassifierProviders(settings) {
    const ordered = await getOrderedAiProviders().catch(() => []);
    const selectedId = Number(settings.classifierProviderId);
    if (!selectedId) return ordered;
    const all = await getAiProviders().catch(() => []);
    const selected = all.find(provider => Number(provider.id) === selectedId);
    if (!selected) return ordered;
    return [selected, ...ordered.filter(provider => Number(provider.id) !== selectedId)];
}

function normalizeIntent(rawText) {
    const normalized = String(rawText || '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
    const found = normalized.split(/\s+/).find(value => INTENT_MODES.includes(value));
    return found || 'CASUAL';
}

function buildClassifierMessages(history = [], userText = '', classifierPrompt = DEFAULT_ROUTING_SETTINGS.classifierPrompt) {
    const recent = history
        .filter(item => item?.content)
        .slice(-3)
        .map(item => `${item.role === 'assistant' || item.role === 'lera' ? 'Лера' : 'Пользователь'}: ${item.content}`)
        .join('\n');
    return [
        {
            role: 'system',
            content: classifierPrompt
        },
        {
            role: 'user',
            content: `Последние сообщения:\n${recent || 'нет'}\n\nНовая реплика:\n${String(userText || '').slice(0, 2000)}`
        }
    ];
}

export async function classifyIntent({ userId = 0, userText = '', history = [], trace = true } = {}) {
    const settings = await getRoutingSettings();
    if (!settings.enabled) {
        return { mode: 'CASUAL', bypassed: true, reason: 'legacy_disabled', settings };
    }

    const messages = buildClassifierMessages(history, userText, settings.classifierPrompt);
    const providers = await getClassifierProviders(settings);
    try {
        const result = await requestLlmCompletion(
            { roleplay_mode: 'intent-classifier', max_tokens: settings.classifierMaxTokens },
            messages,
            false,
            async () => {
                const provider = providers[0] || await getActiveAiProvider();
                if (!provider) throw new Error('Нет настроенных провайдеров классификатора');
                return {
                    client: getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || settings.classifierTimeoutMs),
                    model: settings.classifierModel || provider.model_name
                };
            },
            {
                trace,
                userId,
                kind: 'INTENT_CLASSIFIER',
                mode: 'ROUTER',
                userText,
                temperature: 0,
                maxTokens: settings.classifierMaxTokens,
                timeoutMs: settings.classifierTimeoutMs,
                providers,
                modelOverride: settings.classifierModel || null
            }
        );
        return {
            mode: normalizeIntent(result.rawText),
            rawText: result.rawText || '',
            usage: result.usage || {},
            model: result.model,
            providerName: result.providerName,
            latencyMs: result.latencyMs || 0,
            settings
        };
    } catch (error) {
        return { mode: 'CASUAL', rawText: '', error: error.message, settings };
    }
}

export function getModeGenerationParams(mode, settings) {
    const config = settings?.intentConfigs?.[mode] || normalizeIntentConfig(mode, {}, settings || DEFAULT_ROUTING_SETTINGS);
    return {
        temperature: config.sampling.temperature,
        top_p: config.sampling.top_p,
        maxTokens: config.sampling.max_tokens,
        presence_penalty: config.sampling.presence_penalty,
        frequency_penalty: config.sampling.frequency_penalty,
        repetition_penalty: config.sampling.repetition_penalty,
        seed: config.sampling.seed
    };
}

export function getModeIntentConfig(mode, settings) {
    return settings?.intentConfigs?.[mode] || normalizeIntentConfig(mode, {}, settings || DEFAULT_ROUTING_SETTINGS);
}

export async function getPromptStudioState() {
    const settings = await getRoutingSettings();
    const productionStored = await readJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, {});
    const draftStored = await readJsonSetting(INTENT_STUDIO_DRAFT_KEY, {});
    const production = Object.fromEntries(STUDIO_INTENTS.map(mode => {
        const stored = productionStored[mode];
        return [mode, {
            version: Number(stored?.version) || 1,
            config: normalizeIntentConfig(mode, stored?.config || settings.intentConfigs[mode], settings),
            publishedAt: stored?.publishedAt || null
        }];
    }));
    const draft = Object.fromEntries(STUDIO_INTENTS.map(mode => {
        const stored = draftStored[mode];
        return [mode, {
            version: Number(stored?.version) || production[mode].version,
            config: normalizeIntentConfig(mode, stored?.config || production[mode].config, settings),
            updatedAt: stored?.updatedAt || production[mode].publishedAt || null
        }];
    }));
    return {
        intents: Object.fromEntries(STUDIO_INTENTS.map(mode => [
            mode,
            {
                draft: draft[mode],
                production: production[mode],
                dirty: JSON.stringify(draft[mode].config) !== JSON.stringify(production[mode].config)
            }
        ])),
        routingSettings: settings
    };
}

export async function savePromptStudioDraft(mode, config) {
    const intent = STUDIO_INTENTS.includes(mode) ? mode : 'CASUAL';
    const state = await getPromptStudioState();
    const current = state.intents[intent];
    const draft = {
        version: Math.max(current.draft.version, current.production.version) + 1,
        config: normalizeIntentConfig(intent, config, state.routingSettings),
        updatedAt: new Date().toISOString()
    };
    const stored = Object.fromEntries(STUDIO_INTENTS.map(item => [item, state.intents[item].draft]));
    stored[intent] = draft;
    await writeJsonSetting(INTENT_STUDIO_DRAFT_KEY, stored);
    return getPromptStudioState();
}

export async function publishPromptStudioIntent(mode, config) {
    const intent = STUDIO_INTENTS.includes(mode) ? mode : 'CASUAL';
    const state = await getPromptStudioState();
    const current = state.intents[intent];
    const publishedAt = new Date().toISOString();
    const nextConfig = config === undefined
        ? current.draft.config
        : normalizeIntentConfig(intent, config, state.routingSettings);
    const publishingStoredDraft = JSON.stringify(nextConfig) === JSON.stringify(current.draft.config);
    const nextVersion = publishingStoredDraft
        ? Math.max(current.production.version + 1, current.draft.version)
        : Math.max(current.draft.version, current.production.version) + 1;
    const production = Object.fromEntries(STUDIO_INTENTS.map(item => [item, state.intents[item].production]));
    production[intent] = {
        version: nextVersion,
        config: nextConfig,
        publishedAt
    };
    const draft = Object.fromEntries(STUDIO_INTENTS.map(item => [item, state.intents[item].draft]));
    draft[intent] = {
        version: production[intent].version,
        config: nextConfig,
        updatedAt: publishedAt
    };
    await Promise.all([
        writeJsonSetting(INTENT_STUDIO_PRODUCTION_KEY, production),
        writeJsonSetting(INTENT_STUDIO_DRAFT_KEY, draft)
    ]);
    return getPromptStudioState();
}
