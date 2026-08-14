import {
    getAiProviders,
    getVoiceGenerationSettings
} from '../database.js';

/**
 * Подбирает AI-провайдер для генерации голоса
 */
export function pickVoiceProvider(providers = [], preferredProviderId = null) {
    if (!Array.isArray(providers) || providers.length === 0) return null;

    if (preferredProviderId) {
        const found = providers.find(p => Number(p.id) === Number(preferredProviderId) && p.is_enabled !== false);
        if (found) return found;
    }

    // Ищем провайдеры с моделью/именем cosy, voice, audio, hausmer
    const voiceProvider = providers.find(p =>
        p.is_enabled !== false &&
        (String(p.model_name || '').toLowerCase().includes('cosy') ||
         String(p.model_name || '').toLowerCase().includes('voice') ||
         String(p.model_name || '').toLowerCase().includes('audio') ||
         String(p.base_url || '').toLowerCase().includes('hausmer') ||
         String(p.name || '').toLowerCase().includes('hausmer'))
    );
    if (voiceProvider) return voiceProvider;

    // Fallback: активный или первый доступный
    return providers.find(p => p.is_active && p.is_enabled !== false) || providers.find(p => p.is_enabled !== false) || providers[0];
}

/**
 * Генерация голосового сообщения через CosyVoice / OpenAI-compatible speech endpoint
 */
export async function generateLeraVoice(input = {}) {
    const rawText = typeof input === 'string' ? input : input?.text;
    const timeoutMs = (typeof input === 'object' && input?.timeoutMs) || 45000;
    const cleanText = String(rawText || '').trim();
    if (!cleanText) {
        console.warn('[VOICE GENERATOR] Текст для озвучки пустой');
        return null;
    }

    const settings = await getVoiceGenerationSettings();
    if (settings.voice_enabled === false) {
        console.log('[VOICE GENERATOR] Озвучка отключена в настройках');
        return null;
    }

    const providers = await getAiProviders();
    const provider = pickVoiceProvider(providers, settings.provider_id);

    if (!provider) {
        console.warn('[VOICE GENERATOR] Нет доступного провайдера для генерации голоса');
        return null;
    }

    const selectedModel = String(settings.model || provider.model_name || 'cosyvoice3').trim();
    const endpoint = `${String(provider.base_url).replace(/\/+$/, '')}/audio/speech`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const payload = {
            model: selectedModel,
            input: cleanText,
            voice: settings.voice || 'default',
            response_format: 'mp3'
        };

        // Если в настройках есть эталонный сэмпл голоса Леры
        const sample = settings.audio_sample_dataurl || settings.master_reference_dataurl;
        if (sample) {
            payload.prompt_audio = sample;
            payload.reference_audio = sample;
            payload.prompt_wav = sample;
            payload.ref_audio = sample;
            
            const refText = String(settings.prompt_text || '').trim();
            if (refText) {
                payload.prompt_text = refText;
                payload.reference_text = refText;
                payload.prompt_speech_text = refText;
                payload.ref_text = refText;
            }
        }

        console.log(`🎙️ [VOICE GENERATOR] Старт генерации голоса через ${provider.name} (${selectedModel}) для текста: "${cleanText.slice(0, 50)}..."`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${provider.api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) {
            const raw = await response.text();
            let data = {};
            try { data = JSON.parse(raw); } catch { /* non-json */ }
            const detail = data?.error?.message || data?.message || raw.slice(0, 300) || `HTTP ${response.status}`;
            console.error(`❌ [VOICE GENERATOR] Ошибка провайдера ${provider.name}:`, detail);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (!buffer || buffer.length < 200) {
            console.warn('⚠️ [VOICE GENERATOR] Получен слишком маленький аудио-файл:', buffer?.length);
            return null;
        }

        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        const isOgg = contentType.includes('ogg') || contentType.includes('opus');
        const filename = isOgg ? 'voice.ogg' : 'voice.mp3';

        console.log(`✅ [VOICE GENERATOR] Голосовое успешно сгенерировано (${(buffer.length / 1024).toFixed(1)} КБ)`);

        return {
            success: true,
            buffer,
            filename,
            mimeType: contentType,
            model: selectedModel,
            provider: provider.name
        };
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`⏱️ [VOICE GENERATOR] Таймаут генерации голоса (${timeoutMs / 1000}s)`);
        } else {
            console.error('❌ [VOICE GENERATOR ERROR]:', err.message);
        }
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
