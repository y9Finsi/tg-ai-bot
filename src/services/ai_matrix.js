import {
    getAiProviders,
    getOrderedAiProviders,
    getActiveAiProvider,
    getSetting,
    setSetting,
    getImageGenerationSettings,
    saveImageGenerationSettings,
    getImageEditSettings,
    saveImageEditSettings,
    getVoiceGenerationSettings,
    saveVoiceGenerationSettings,
    query
} from '../database.js';
import {
    getRoutingSettings,
    updateRoutingSettings,
    DEFAULT_ROUTING_SETTINGS
} from '../ai/intent_router.js';
import {
    isMultimodalChatModel,
    pickImageProvider,
    isImageCapableProvider,
    executeImageGenerationRequest
} from './image_generator.js';
import {
    pickVoiceProvider,
    generateLeraVoice
} from './voice_generator.js';

export const MATRIX_SLOTS = [
    'core_dialogue',
    'style_classifier',
    'judge',
    'text_to_image',
    'image_to_image',
    'voice'
];

// In-memory state cache to support environments where DB is transient or offline in tests
const inMemoryCache = {
    core_dialogue: {},
    style_classifier: {},
    judge: {},
    text_to_image: {},
    image_to_image: {},
    voice: {}
};

/**
 * Normalizes protocol string to standard representation
 */
export function normalizeProtocol(protocol, defaultProtocol = '/images/generations') {
    if (!protocol) return defaultProtocol;
    const str = String(protocol).trim().toLowerCase();
    if (str.includes('chat') || str === 'chat_completions' || str === '/chat/completions') {
        return '/chat/completions';
    }
    if (str.includes('image') || str.includes('generation') || str === 'images_generations' || str === '/images/generations') {
        return '/images/generations';
    }
    if (str.includes('speech') || str.includes('audio') || str === 'audio_speech' || str === '/audio/speech') {
        return '/audio/speech';
    }
    return defaultProtocol;
}

/**
 * Retrieves the full centralized AI Model Matrix configuration
 */
export async function getModelMatrix() {
    let allProviders = [];
    let orderedProviders = [];
    let activeAiProvider = null;
    let routingSettings = { ...DEFAULT_ROUTING_SETTINGS };
    let imageSettings = {
        provider_id: null,
        model: 'flux-1-schnell',
        protocol: '/images/generations',
        style_prompt: '',
        auto_generate_channel: true,
        auto_save_catalog: true
    };
    let imageEditSettings = {
        provider_id: null,
        model: 'gemini-2.5-flash',
        protocol: '/chat/completions',
        style_prompt: '',
        require_reference: true,
        requires_reference: true
    };
    let voiceSettings = {
        provider_id: null,
        model: 'cosyvoice3',
        voice: 'default',
        prompt_text: '',
        audio_sample_dataurl: null,
        voice_enabled: true,
        auto_voice_messages: true
    };

    try {
        const [
            allP,
            ordP,
            actP,
            routS,
            imgS,
            imgEditS,
            vocS
        ] = await Promise.all([
            getAiProviders().catch(() => []),
            getOrderedAiProviders().catch(() => []),
            getActiveAiProvider().catch(() => null),
            getRoutingSettings().catch(() => DEFAULT_ROUTING_SETTINGS),
            getImageGenerationSettings().catch(() => imageSettings),
            getImageEditSettings().catch(() => imageEditSettings),
            getVoiceGenerationSettings().catch(() => voiceSettings)
        ]);

        if (Array.isArray(allP)) allProviders = allP;
        if (Array.isArray(ordP)) orderedProviders = ordP;
        if (actP) activeAiProvider = actP;
        if (routS) routingSettings = { ...routS };
        if (imgS) imageSettings = { ...imgS };
        if (imgEditS) imageEditSettings = { ...imgEditS };
        if (vocS) voiceSettings = { ...vocS };
    } catch (e) {
        console.warn('[AI MATRIX] Ошибка чтения настроек из БД, используются значения по умолчанию:', e.message);
    }

    // Apply in-memory cached overrides if present
    if (inMemoryCache.text_to_image.model) imageSettings.model = inMemoryCache.text_to_image.model;
    if (inMemoryCache.text_to_image.protocol) imageSettings.protocol = inMemoryCache.text_to_image.protocol;
    if (inMemoryCache.text_to_image.style_prompt !== undefined) imageSettings.style_prompt = inMemoryCache.text_to_image.style_prompt;
    if (inMemoryCache.text_to_image.auto_generate_channel !== undefined) imageSettings.auto_generate_channel = inMemoryCache.text_to_image.auto_generate_channel;
    if (inMemoryCache.text_to_image.auto_save_catalog !== undefined) imageSettings.auto_save_catalog = inMemoryCache.text_to_image.auto_save_catalog;
    if (inMemoryCache.text_to_image.provider_id !== undefined) imageSettings.provider_id = inMemoryCache.text_to_image.provider_id;

    if (inMemoryCache.image_to_image.model) imageEditSettings.model = inMemoryCache.image_to_image.model;
    if (inMemoryCache.image_to_image.style_prompt !== undefined) imageEditSettings.style_prompt = inMemoryCache.image_to_image.style_prompt;
    if (inMemoryCache.image_to_image.provider_id !== undefined) imageEditSettings.provider_id = inMemoryCache.image_to_image.provider_id;

    if (inMemoryCache.style_classifier.model) routingSettings.classifierModel = inMemoryCache.style_classifier.model;
    if (inMemoryCache.style_classifier.provider_id !== undefined) routingSettings.classifierProviderId = String(inMemoryCache.style_classifier.provider_id);
    if (inMemoryCache.style_classifier.prompt) routingSettings.classifierPrompt = inMemoryCache.style_classifier.prompt;

    if (inMemoryCache.judge.model) routingSettings.judgeModel = inMemoryCache.judge.model;
    if (inMemoryCache.judge.provider_id !== undefined) routingSettings.judgeProviderId = String(inMemoryCache.judge.provider_id);
    if (inMemoryCache.judge.mode) routingSettings.judgeMode = inMemoryCache.judge.mode;
    if (inMemoryCache.judge.prompt) routingSettings.judgePrompt = inMemoryCache.judge.prompt;

    if (inMemoryCache.voice.model) voiceSettings.model = inMemoryCache.voice.model;
    if (inMemoryCache.voice.voice) voiceSettings.voice = inMemoryCache.voice.voice;
    if (inMemoryCache.voice.provider_id !== undefined) voiceSettings.provider_id = inMemoryCache.voice.provider_id;
    if (inMemoryCache.voice.voice_enabled !== undefined) voiceSettings.voice_enabled = inMemoryCache.voice.voice_enabled;

    const activeProvider = activeAiProvider || orderedProviders[0] || allProviders[0] || null;
    const fallbackProviders = orderedProviders.filter(p => !activeProvider || Number(p.id) !== Number(activeProvider.id));

    // Find provider objects for slots
    const classifierProvider = allProviders.find(p => String(p.id) === String(routingSettings.classifierProviderId)) || activeProvider;
    const judgeProvider = allProviders.find(p => String(p.id) === String(routingSettings.judgeProviderId)) || activeProvider;
    const imageProvider = imageSettings.provider_id
        ? allProviders.find(p => Number(p.id) === Number(imageSettings.provider_id))
        : pickImageProvider(allProviders);
    const editProvider = imageEditSettings.provider_id
        ? allProviders.find(p => Number(p.id) === Number(imageEditSettings.provider_id))
        : (imageProvider || activeProvider);
    const voiceProvider = voiceSettings.provider_id
        ? allProviders.find(p => Number(p.id) === Number(voiceSettings.provider_id))
        : pickVoiceProvider(allProviders);

    const t2iProtocol = imageSettings.protocol
        ? normalizeProtocol(imageSettings.protocol, '/images/generations')
        : (isMultimodalChatModel(imageSettings.model, imageProvider?.base_url) ? '/chat/completions' : '/images/generations');

    const matrix = {
        core_dialogue: {
            active_provider_id: activeProvider?.id || null,
            active_provider: activeProvider?.name || null,
            active_model: activeProvider?.model_name || null,
            provider: activeProvider ? {
                id: activeProvider.id,
                name: activeProvider.name,
                model_name: activeProvider.model_name,
                base_url: activeProvider.base_url
            } : null,
            fallbacks: fallbackProviders.map(p => ({
                id: p.id,
                name: p.name,
                model_name: p.model_name,
                priority: p.priority,
                base_url: p.base_url
            })),
            providers: allProviders.map(p => ({
                id: p.id,
                name: p.name,
                model_name: p.model_name,
                base_url: p.base_url,
                priority: p.priority,
                is_active: Boolean(p.is_active),
                is_enabled: p.is_enabled !== false,
                timeout_ms: p.timeout_ms || 7000,
                sampling_capabilities: p.sampling_capabilities || {}
            }))
        },
        style_classifier: {
            provider_id: routingSettings.classifierProviderId ? Number(routingSettings.classifierProviderId) : (classifierProvider?.id || null),
            model: routingSettings.classifierModel || classifierProvider?.model_name || 'deepseek-chat',
            timeout_ms: routingSettings.classifierTimeoutMs || 7000,
            max_tokens: routingSettings.classifierMaxTokens || 4,
            prompt: routingSettings.classifierPrompt || DEFAULT_ROUTING_SETTINGS.classifierPrompt,
            active_provider: classifierProvider ? {
                id: classifierProvider.id,
                name: classifierProvider.name,
                model_name: classifierProvider.model_name
            } : null
        },
        judge: {
            provider_id: routingSettings.judgeProviderId ? Number(routingSettings.judgeProviderId) : (judgeProvider?.id || null),
            model: routingSettings.judgeModel || judgeProvider?.model_name || 'deepseek-chat',
            timeout_ms: routingSettings.judgeTimeoutMs || 5000,
            max_tokens: routingSettings.judgeMaxTokens || 80,
            mode: routingSettings.judgeMode || 'OBSERVE',
            initiative_mode: routingSettings.initiativeJudgeMode || 'OBSERVE',
            prompt: routingSettings.judgePrompt || DEFAULT_ROUTING_SETTINGS.judgePrompt,
            active_provider: judgeProvider ? {
                id: judgeProvider.id,
                name: judgeProvider.name,
                model_name: judgeProvider.model_name
            } : null
        },
        text_to_image: {
            provider_id: imageSettings.provider_id || (imageProvider?.id || null),
            model: imageSettings.model || imageProvider?.model_name || 'flux-1-schnell',
            protocol: t2iProtocol,
            style_prompt: imageSettings.style_prompt || '',
            auto_generate_channel: Boolean(imageSettings.auto_generate_channel),
            auto_save_catalog: Boolean(imageSettings.auto_save_catalog),
            active_provider: imageProvider ? {
                id: imageProvider.id,
                name: imageProvider.name,
                model_name: imageProvider.model_name
            } : null
        },
        image_to_image: {
            provider_id: imageEditSettings.provider_id || (editProvider?.id || null),
            model: imageEditSettings.model || editProvider?.model_name || 'gemini-2.5-flash',
            protocol: '/chat/completions',
            requires_reference: true,
            require_reference: true,
            style_prompt: imageEditSettings.style_prompt || imageSettings.style_prompt || '',
            active_provider: editProvider ? {
                id: editProvider.id,
                name: editProvider.name,
                model_name: editProvider.model_name
            } : null
        },
        voice: {
            provider_id: voiceSettings.provider_id || (voiceProvider?.id || null),
            model: voiceSettings.model || voiceProvider?.model_name || 'cosyvoice3',
            voice_name: voiceSettings.voice || 'default',
            voice: voiceSettings.voice || 'default',
            prompt_text: voiceSettings.prompt_text || '',
            audio_sample_dataurl: voiceSettings.audio_sample_dataurl || null,
            has_sample: Boolean(voiceSettings.audio_sample_dataurl),
            voice_enabled: Boolean(voiceSettings.voice_enabled),
            auto_voice_messages: Boolean(voiceSettings.auto_voice_messages),
            active_provider: voiceProvider ? {
                id: voiceProvider.id,
                name: voiceProvider.name,
                model_name: voiceProvider.model_name
            } : null
        }
    };

    return {
        success: true,
        ok: true,
        matrix,
        slots: matrix,
        available_providers: allProviders.map(p => ({
            id: p.id,
            name: p.name,
            model_name: p.model_name,
            base_url: p.base_url,
            priority: p.priority,
            is_active: Boolean(p.is_active),
            is_enabled: p.is_enabled !== false,
            timeout_ms: p.timeout_ms || 7000,
            sampling_capabilities: p.sampling_capabilities || {}
        }))
    };
}

/**
 * Updates any of the 6 Model Matrix slots
 */
export async function updateModelMatrix(input = {}) {
    const slots = input.slots || input.matrix || input;

    try {
        // 1. Core Dialogue
        if (slots.core_dialogue && typeof slots.core_dialogue === 'object') {
            const cd = slots.core_dialogue;
            inMemoryCache.core_dialogue = { ...inMemoryCache.core_dialogue, ...cd };
            if (cd.active_provider_id !== undefined || cd.primary_provider_id !== undefined) {
                const targetId = Number(cd.active_provider_id ?? cd.primary_provider_id);
                if (targetId) {
                    await query('UPDATE ai_providers SET is_active = FALSE').catch(() => {});
                    await query('UPDATE ai_providers SET is_active = TRUE, is_enabled = TRUE WHERE id = $1', [targetId]).catch(() => {});
                }
            }
            if (Array.isArray(cd.fallbacks)) {
                for (let i = 0; i < cd.fallbacks.length; i++) {
                    const fb = cd.fallbacks[i];
                    const fbId = typeof fb === 'object' ? fb.id : fb;
                    if (fbId) {
                        await query('UPDATE ai_providers SET priority = $1 WHERE id = $2', [i + 2, fbId]).catch(() => {});
                    }
                }
            }
            if (Array.isArray(cd.providers)) {
                for (const p of cd.providers) {
                    if (p.id) {
                        const fields = [];
                        const vals = [p.id];
                        let idx = 2;
                        if (p.priority !== undefined) { fields.push(`priority = $${idx++}`); vals.push(Number(p.priority)); }
                        if (p.is_enabled !== undefined) { fields.push(`is_enabled = $${idx++}`); vals.push(Boolean(p.is_enabled)); }
                        if (p.is_active !== undefined) { fields.push(`is_active = $${idx++}`); vals.push(Boolean(p.is_active)); }
                        if (p.timeout_ms !== undefined) { fields.push(`timeout_ms = $${idx++}`); vals.push(Number(p.timeout_ms)); }
                        if (fields.length > 0) {
                            await query(`UPDATE ai_providers SET ${fields.join(', ')} WHERE id = $1`, vals).catch(() => {});
                        }
                    }
                }
            }
        }

        // 2. Style Classifier
        if (slots.style_classifier && typeof slots.style_classifier === 'object') {
            const sc = slots.style_classifier;
            inMemoryCache.style_classifier = { ...inMemoryCache.style_classifier, ...sc };
            const updates = {};
            if (sc.provider_id !== undefined || sc.providerId !== undefined) {
                updates.classifierProviderId = String(sc.provider_id ?? sc.providerId ?? '');
            }
            if (sc.model !== undefined) updates.classifierModel = String(sc.model || '');
            if (sc.timeout_ms !== undefined || sc.timeoutMs !== undefined) {
                updates.classifierTimeoutMs = Number(sc.timeout_ms ?? sc.timeoutMs);
            }
            if (sc.max_tokens !== undefined || sc.maxTokens !== undefined) {
                updates.classifierMaxTokens = Number(sc.max_tokens ?? sc.maxTokens);
            }
            if (sc.prompt !== undefined) updates.classifierPrompt = String(sc.prompt || '');
            await updateRoutingSettings(updates).catch(() => {});
        }

        // 3. Judge
        if (slots.judge && typeof slots.judge === 'object') {
            const j = slots.judge;
            inMemoryCache.judge = { ...inMemoryCache.judge, ...j };
            const updates = {};
            if (j.provider_id !== undefined || j.providerId !== undefined) {
                updates.judgeProviderId = String(j.provider_id ?? j.providerId ?? '');
            }
            if (j.model !== undefined) updates.judgeModel = String(j.model || '');
            if (j.timeout_ms !== undefined || j.timeoutMs !== undefined) {
                updates.judgeTimeoutMs = Number(j.timeout_ms ?? j.timeoutMs);
            }
            if (j.max_tokens !== undefined || j.maxTokens !== undefined) {
                updates.judgeMaxTokens = Number(j.max_tokens ?? j.maxTokens);
            }
            if (j.mode !== undefined) updates.judgeMode = j.mode;
            if (j.initiative_mode !== undefined || j.initiativeJudgeMode !== undefined) {
                updates.initiativeJudgeMode = j.initiative_mode ?? j.initiativeJudgeMode;
            }
            if (j.prompt !== undefined) updates.judgePrompt = String(j.prompt || '');
            await updateRoutingSettings(updates).catch(() => {});
        }

        // 4. Text-to-Image
        if (slots.text_to_image && typeof slots.text_to_image === 'object') {
            const t2i = slots.text_to_image;
            inMemoryCache.text_to_image = { ...inMemoryCache.text_to_image, ...t2i };
            const updates = {};
            if (t2i.provider_id !== undefined || t2i.providerId !== undefined) {
                updates.provider_id = t2i.provider_id ?? t2i.providerId;
            }
            if (t2i.model !== undefined) updates.model = t2i.model;
            if (t2i.protocol !== undefined) updates.protocol = normalizeProtocol(t2i.protocol, '/images/generations');
            if (t2i.style_prompt !== undefined || t2i.stylePrompt !== undefined) {
                updates.style_prompt = t2i.style_prompt ?? t2i.stylePrompt;
            }
            if (t2i.auto_generate_channel !== undefined || t2i.auto_channel !== undefined) {
                updates.auto_generate_channel = Boolean(t2i.auto_generate_channel ?? t2i.auto_channel);
            }
            if (t2i.auto_save_catalog !== undefined || t2i.auto_save !== undefined) {
                updates.auto_save_catalog = Boolean(t2i.auto_save_catalog ?? t2i.auto_save);
            }
            await saveImageGenerationSettings(updates).catch(() => {});
        }

        // 5. Image-to-Image
        if (slots.image_to_image && typeof slots.image_to_image === 'object') {
            const i2i = slots.image_to_image;
            inMemoryCache.image_to_image = { ...inMemoryCache.image_to_image, ...i2i };
            const updates = {};
            if (i2i.provider_id !== undefined || i2i.providerId !== undefined) {
                updates.provider_id = i2i.provider_id ?? i2i.providerId;
            }
            if (i2i.model !== undefined) updates.model = i2i.model;
            if (i2i.protocol !== undefined) updates.protocol = '/chat/completions';
            if (i2i.style_prompt !== undefined || i2i.stylePrompt !== undefined) {
                updates.style_prompt = i2i.style_prompt ?? i2i.stylePrompt;
            }
            updates.require_reference = true;
            await saveImageEditSettings(updates).catch(() => {});
        }

        // 6. Voice / TTS
        if (slots.voice && typeof slots.voice === 'object') {
            const v = slots.voice;
            inMemoryCache.voice = { ...inMemoryCache.voice, ...v };
            const updates = {};
            if (v.provider_id !== undefined || v.providerId !== undefined) {
                updates.provider_id = v.provider_id ?? v.providerId;
            }
            if (v.model !== undefined) updates.model = v.model;
            if (v.voice_name !== undefined || v.voice !== undefined) {
                updates.voice = v.voice_name ?? v.voice;
            }
            if (v.prompt_text !== undefined || v.promptText !== undefined) {
                updates.prompt_text = v.prompt_text ?? v.promptText;
            }
            if (v.audio_sample_dataurl !== undefined) {
                updates.audio_sample_dataurl = v.audio_sample_dataurl;
            }
            if (v.voice_enabled !== undefined || v.auto_voice_messages !== undefined || v.enabled !== undefined) {
                updates.voice_enabled = Boolean(v.voice_enabled ?? v.auto_voice_messages ?? v.enabled);
            }
            await saveVoiceGenerationSettings(updates).catch(() => {});
        }
    } catch (e) {
        console.warn('[AI MATRIX] Ошибка обновления настроек:', e.message);
    }

    return await getModelMatrix();
}

/**
 * Diagnostic health-check execution for individual or all model matrix slots
 */
export async function runSlotHealthCheck(options = {}) {
    const rawSlot = String(options.slot || 'all').toLowerCase().trim();
    const timeoutMs = Number(options.timeout_ms || options.timeoutMs || 10000);

    if (rawSlot === 'all') {
        const results = {};
        let allHealthy = true;
        for (const slotName of MATRIX_SLOTS) {
            try {
                results[slotName] = await checkSingleSlot(slotName, options, timeoutMs);
                if (results[slotName].status !== 'HEALTHY') {
                    allHealthy = false;
                }
            } catch (err) {
                allHealthy = false;
                results[slotName] = {
                    ok: false,
                    success: false,
                    slot: slotName,
                    status: 'UNHEALTHY',
                    error: err.message,
                    message: `Health check failed: ${err.message}`,
                    latency_ms: 0
                };
            }
        }
        const healthyCount = Object.values(results).filter(r => r.status === 'HEALTHY').length;
        return {
            ok: allHealthy,
            success: allHealthy,
            slot: 'all',
            status: allHealthy ? 'HEALTHY' : (healthyCount > 0 ? 'DEGRADED' : 'UNHEALTHY'),
            slots: results,
            matrix: results,
            summary: {
                total: MATRIX_SLOTS.length,
                healthy: healthyCount,
                unhealthy: MATRIX_SLOTS.length - healthyCount
            }
        };
    }

    const normalizedSlot = MATRIX_SLOTS.find(s => s === rawSlot || s.replace(/_/g, '') === rawSlot.replace(/_/g, '')) || rawSlot;
    return await checkSingleSlot(normalizedSlot, options, timeoutMs);
}

async function checkSingleSlot(slot, options, timeoutMs) {
    let allProviders = [];
    try {
        allProviders = await getAiProviders();
    } catch {
        allProviders = [];
    }

    const startTime = Date.now();

    const overrideProviderId = options.provider_id ?? options.providerId ?? options.provider;
    let targetProvider = null;
    if (overrideProviderId) {
        if (typeof overrideProviderId === 'object' && overrideProviderId.base_url) {
            targetProvider = overrideProviderId;
        } else {
            targetProvider = allProviders.find(p => String(p.id) === String(overrideProviderId) || String(p.name).toLowerCase() === String(overrideProviderId).toLowerCase());
        }
    }

    switch (slot) {
        case 'core_dialogue': {
            if (!targetProvider) {
                targetProvider = allProviders.find(p => p.is_active) || allProviders.find(p => p.is_enabled !== false) || allProviders[0];
            }
            if (!targetProvider) {
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    error: 'PROVIDER_NOT_CONFIGURED',
                    message: 'AI-провайдер не настроен в слоте Core Dialogue',
                    latency_ms: 0
                };
            }

            const model = options.model || targetProvider.model_name || 'deepseek-chat';
            const baseUrl = String(targetProvider.base_url).replace(/\/+$/, '');

            try {
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${targetProvider.api_key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Ping' }],
                        max_tokens: 5
                    }),
                    signal: AbortSignal.timeout(timeoutMs)
                });

                const latency_ms = Date.now() - startTime;
                const raw = await res.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* non-json */ }

                if (res.ok) {
                    return {
                        ok: true,
                        success: true,
                        slot,
                        status: 'HEALTHY',
                        latency_ms,
                        provider_id: targetProvider.id,
                        provider_name: targetProvider.name,
                        model,
                        protocol: '/chat/completions',
                        message: `Диалоговый эндпоинт ${targetProvider.name} (${model}) отвечает стабильно (${latency_ms}ms)`
                    };
                }

                const detail = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: detail,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol: '/chat/completions',
                    message: `Ошибка ответа (${res.status}): ${detail}`
                };
            } catch (err) {
                const latency_ms = Date.now() - startTime;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: err.message,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol: '/chat/completions',
                    message: `Сбой соединения: ${err.message}`
                };
            }
        }

        case 'style_classifier': {
            let routingSettings = DEFAULT_ROUTING_SETTINGS;
            try { routingSettings = await getRoutingSettings(); } catch { /* fallback */ }
            if (!targetProvider) {
                targetProvider = allProviders.find(p => String(p.id) === String(routingSettings.classifierProviderId))
                    || allProviders.find(p => p.is_active)
                    || allProviders[0];
            }
            if (!targetProvider) {
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    error: 'PROVIDER_NOT_CONFIGURED',
                    message: 'Провайдер не настроен в слоте Style Classifier',
                    latency_ms: 0
                };
            }

            const model = options.model || routingSettings.classifierModel || targetProvider.model_name || 'deepseek-chat';
            const baseUrl = String(targetProvider.base_url).replace(/\/+$/, '');

            try {
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${targetProvider.api_key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Классифицируй: Привет как дела' }],
                        max_tokens: 6
                    }),
                    signal: AbortSignal.timeout(timeoutMs)
                });

                const latency_ms = Date.now() - startTime;
                const raw = await res.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* non-json */ }

                if (res.ok) {
                    return {
                        ok: true,
                        success: true,
                        slot,
                        status: 'HEALTHY',
                        latency_ms,
                        provider_id: targetProvider.id,
                        provider_name: targetProvider.name,
                        model,
                        protocol: '/chat/completions',
                        message: `Классификатор стилей ${targetProvider.name} (${model}) проверен (${latency_ms}ms)`
                    };
                }

                const detail = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: detail,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    message: `Ошибка классификатора (${res.status}): ${detail}`
                };
            } catch (err) {
                const latency_ms = Date.now() - startTime;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: err.message,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    message: `Сбой соединения классификатора: ${err.message}`
                };
            }
        }

        case 'judge': {
            let routingSettings = DEFAULT_ROUTING_SETTINGS;
            try { routingSettings = await getRoutingSettings(); } catch { /* fallback */ }
            if (!targetProvider) {
                targetProvider = allProviders.find(p => String(p.id) === String(routingSettings.judgeProviderId))
                    || allProviders.find(p => p.is_active)
                    || allProviders[0];
            }
            if (!targetProvider) {
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    error: 'PROVIDER_NOT_CONFIGURED',
                    message: 'Провайдер не настроен в слоте Judge',
                    latency_ms: 0
                };
            }

            const model = options.model || routingSettings.judgeModel || targetProvider.model_name || 'deepseek-chat';
            const baseUrl = String(targetProvider.base_url).replace(/\/+$/, '');

            try {
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${targetProvider.api_key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Проверь ответ: привет. Верни PASS.' }],
                        max_tokens: 10
                    }),
                    signal: AbortSignal.timeout(timeoutMs)
                });

                const latency_ms = Date.now() - startTime;
                const raw = await res.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* non-json */ }

                if (res.ok) {
                    return {
                        ok: true,
                        success: true,
                        slot,
                        status: 'HEALTHY',
                        latency_ms,
                        provider_id: targetProvider.id,
                        provider_name: targetProvider.name,
                        model,
                        protocol: '/chat/completions',
                        message: `Judge-аудитор ${targetProvider.name} (${model}) проверен (${latency_ms}ms)`
                    };
                }

                const detail = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: detail,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    message: `Ошибка Judge (${res.status}): ${detail}`
                };
            } catch (err) {
                const latency_ms = Date.now() - startTime;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: err.message,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    message: `Сбой соединения Judge: ${err.message}`
                };
            }
        }

        case 'text_to_image': {
            let imageSettings = { model: 'flux-1-schnell', protocol: '/images/generations' };
            try { imageSettings = await getImageGenerationSettings(); } catch { /* fallback */ }
            if (!targetProvider) {
                targetProvider = imageSettings.provider_id
                    ? allProviders.find(p => Number(p.id) === Number(imageSettings.provider_id))
                    : pickImageProvider(allProviders);
            }
            if (!targetProvider) {
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    error: 'PROVIDER_NOT_CONFIGURED',
                    message: 'Провайдер не настроен в слоте Text-to-Image',
                    latency_ms: 0
                };
            }

            const model = options.model || imageSettings.model || targetProvider.model_name || 'flux-1-schnell';
            const protocol = normalizeProtocol(options.protocol || imageSettings.protocol || (isMultimodalChatModel(model, targetProvider.base_url) ? '/chat/completions' : '/images/generations'));
            const baseUrl = String(targetProvider.base_url).replace(/\/+$/, '');

            try {
                let res;
                if (protocol === '/images/generations') {
                    res = await fetch(`${baseUrl}/images/generations`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${targetProvider.api_key}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model,
                            prompt: 'ping test dot',
                            size: '256x256',
                            n: 1
                        }),
                        signal: AbortSignal.timeout(timeoutMs)
                    });
                } else {
                    res = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${targetProvider.api_key}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: 'Generate a small test image: ping' }],
                            max_tokens: 500
                        }),
                        signal: AbortSignal.timeout(timeoutMs)
                    });
                }

                const latency_ms = Date.now() - startTime;
                const raw = await res.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* non-json */ }

                if (res.ok) {
                    return {
                        ok: true,
                        success: true,
                        slot,
                        status: 'HEALTHY',
                        latency_ms,
                        provider_id: targetProvider.id,
                        provider_name: targetProvider.name,
                        model,
                        protocol,
                        message: `Text-to-Image эндпоинт ${targetProvider.name} (${model}, ${protocol}) успешно верифицирован (${latency_ms}ms)`
                    };
                }

                const detail = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: detail,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol,
                    message: `Ошибка Text-to-Image (${res.status}): ${detail}`
                };
            } catch (err) {
                const latency_ms = Date.now() - startTime;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: err.message,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol,
                    message: `Сбой Text-to-Image: ${err.message}`
                };
            }
        }

        case 'image_to_image': {
            let imageEditSettings = { model: 'gemini-2.5-flash' };
            let imageSettings = {};
            try {
                imageEditSettings = await getImageEditSettings();
                imageSettings = await getImageGenerationSettings();
            } catch { /* fallback */ }

            if (!targetProvider) {
                targetProvider = imageEditSettings.provider_id
                    ? allProviders.find(p => Number(p.id) === Number(imageEditSettings.provider_id))
                    : (imageSettings.provider_id ? allProviders.find(p => Number(p.id) === Number(imageSettings.provider_id)) : pickImageProvider(allProviders));
            }
            if (!targetProvider) {
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    error: 'PROVIDER_NOT_CONFIGURED',
                    message: 'Провайдер не настроен в слоте Image-to-Image / Edit',
                    latency_ms: 0
                };
            }

            const model = options.model || imageEditSettings.model || 'gemini-2.5-flash';
            const baseUrl = String(targetProvider.base_url).replace(/\/+$/, '');
            const testPixelDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

            try {
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${targetProvider.api_key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'image_url', image_url: { url: testPixelDataUrl } },
                                { type: 'text', text: 'Test reference image edit request' }
                            ]
                        }],
                        max_tokens: 500
                    }),
                    signal: AbortSignal.timeout(timeoutMs)
                });

                const latency_ms = Date.now() - startTime;
                const raw = await res.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* non-json */ }

                if (res.ok) {
                    return {
                        ok: true,
                        success: true,
                        slot,
                        status: 'HEALTHY',
                        latency_ms,
                        provider_id: targetProvider.id,
                        provider_name: targetProvider.name,
                        model,
                        protocol: '/chat/completions',
                        requires_reference: true,
                        require_reference: true,
                        message: `Image-to-Image эндпоинт ${targetProvider.name} (${model}) успешно верифицирован (${latency_ms}ms)`
                    };
                }

                const detail = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: detail,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol: '/chat/completions',
                    requires_reference: true,
                    message: `Ошибка Image-to-Image (${res.status}): ${detail}`
                };
            } catch (err) {
                const latency_ms = Date.now() - startTime;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: err.message,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol: '/chat/completions',
                    requires_reference: true,
                    message: `Сбой Image-to-Image: ${err.message}`
                };
            }
        }

        case 'voice': {
            let voiceSettings = { model: 'cosyvoice3', voice: 'default' };
            try { voiceSettings = await getVoiceGenerationSettings(); } catch { /* fallback */ }

            if (!targetProvider) {
                targetProvider = voiceSettings.provider_id
                    ? allProviders.find(p => Number(p.id) === Number(voiceSettings.provider_id))
                    : pickVoiceProvider(allProviders);
            }
            if (!targetProvider) {
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    error: 'PROVIDER_NOT_CONFIGURED',
                    message: 'Провайдер не настроен в слоте Voice / TTS',
                    latency_ms: 0
                };
            }

            const model = options.model || voiceSettings.model || targetProvider.model_name || 'cosyvoice3';
            const baseUrl = String(targetProvider.base_url).replace(/\/+$/, '');

            try {
                const res = await fetch(`${baseUrl}/audio/speech`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${targetProvider.api_key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        input: 'Пинг',
                        voice: voiceSettings.voice || 'default',
                        response_format: 'mp3'
                    }),
                    signal: AbortSignal.timeout(timeoutMs)
                });

                const latency_ms = Date.now() - startTime;
                if (res.ok) {
                    return {
                        ok: true,
                        success: true,
                        slot,
                        status: 'HEALTHY',
                        latency_ms,
                        provider_id: targetProvider.id,
                        provider_name: targetProvider.name,
                        model,
                        protocol: '/audio/speech',
                        message: `Voice TTS эндпоинт ${targetProvider.name} (${model}) успешно верифицирован (${latency_ms}ms)`
                    };
                }

                const raw = await res.text();
                let data = {};
                try { data = JSON.parse(raw); } catch { /* non-json */ }
                const detail = data?.error?.message || data?.message || raw.slice(0, 200) || `HTTP ${res.status}`;

                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: detail,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol: '/audio/speech',
                    message: `Ошибка Voice TTS (${res.status}): ${detail}`
                };
            } catch (err) {
                const latency_ms = Date.now() - startTime;
                return {
                    ok: false,
                    success: false,
                    slot,
                    status: 'UNHEALTHY',
                    latency_ms,
                    error: err.message,
                    provider_id: targetProvider.id,
                    provider_name: targetProvider.name,
                    model,
                    protocol: '/audio/speech',
                    message: `Сбой Voice TTS: ${err.message}`
                };
            }
        }

        default:
            return {
                ok: false,
                success: false,
                slot,
                status: 'UNHEALTHY',
                error: 'UNKNOWN_SLOT',
                message: `Неизвестный слот модели: ${slot}`,
                latency_ms: 0
            };
    }
}
