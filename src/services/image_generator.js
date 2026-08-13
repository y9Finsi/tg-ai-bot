import {
    getAiProviders,
    getImageGenerationSettings,
    getMasterReferencePhoto,
    addLeraPhoto
} from '../database.js';

/**
 * Извлекает мастер-референс Леры в виде data:image/...;base64,...
 */
export async function getMasterReferenceDataUrl(bot = null) {
    try {
        const settings = await getImageGenerationSettings();
        if (settings.master_reference_dataurl && settings.master_reference_dataurl.startsWith('data:image/')) {
            return settings.master_reference_dataurl;
        }

        const masterPhoto = settings.master_reference_photo || await getMasterReferencePhoto();
        if (masterPhoto?.file_id && bot) {
            try {
                const link = await bot.telegram.getFileLink(masterPhoto.file_id);
                const fileUrl = typeof link === 'string' ? link : (link?.href || String(link));
                const res = await fetch(fileUrl);
                if (res.ok) {
                    const buf = Buffer.from(await res.arrayBuffer());
                    const contentType = res.headers.get('content-type') || 'image/jpeg';
                    return `data:${contentType};base64,${buf.toString('base64')}`;
                }
            } catch (err) {
                console.warn('[IMAGE GENERATOR] Не удалось скачать фото-референс из Telegram:', err.message);
            }
        }
    } catch (e) {
        console.warn('[IMAGE GENERATOR] Ошибка получения мастер-референса:', e.message);
    }
    return null;
}

/**
 * Подбирает наиболее подходящий AI-провайдер для генерации картинок
 */
export function pickImageProvider(providers = [], preferredProviderId = null) {
    if (!Array.isArray(providers) || providers.length === 0) return null;

    if (preferredProviderId) {
        const found = providers.find(p => Number(p.id) === Number(preferredProviderId) && p.is_enabled !== false);
        if (found) return found;
    }

    // Ищем провайдеры с моделью/именем gemini или image
    const imageProvider = providers.find(p =>
        p.is_enabled !== false &&
        (String(p.model_name || '').toLowerCase().includes('image') ||
         String(p.model_name || '').toLowerCase().includes('gemini') ||
         String(p.name || '').toLowerCase().includes('image') ||
         String(p.name || '').toLowerCase().includes('gemini'))
    );
    if (imageProvider) return imageProvider;

    // Fallback: активный провайдер или первый включенный
    return providers.find(p => p.is_active && p.is_enabled !== false) || providers.find(p => p.is_enabled !== false) || providers[0];
}

/**
 * Преобразует ответ Gemini / Image Bridge в буфер и dataUrl
 */
function extractImageFromResponse(data, rawText, isReferenceMode) {
    let base64Data = null;
    let mimeType = 'image/png';

    if (isReferenceMode) {
        const content = data?.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : (rawText || '');
        
        // 1. Ищем dataUrl в markdown формате ![image](data:image/...;base64,...)
        const dataUrlMatch = text.match(/!\[image\]\((data:image\/([^;]+);base64,([^\)]+))\)/i)
            || text.match(/(data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))/i);
        if (dataUrlMatch) {
            mimeType = `image/${dataUrlMatch[2] || 'png'}`;
            base64Data = dataUrlMatch[3] || dataUrlMatch[1].split(',')[1];
        }
    }

    // 2. Ищем в стандартном формате /images/generations b64_json
    if (!base64Data && data?.data?.[0]?.b64_json) {
        base64Data = data.data[0].b64_json;
        mimeType = 'image/png';
    }

    if (!base64Data) return null;

    const cleanB64 = base64Data.replace(/\s+/g, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    const dataUrl = `data:${mimeType};base64,${cleanB64}`;

    return { buffer, dataUrl, mimeType };
}

/**
 * Основная функция генерации фото Леры с референсом
 */
export async function generateLeraPhoto({
    prompt,
    timeOfDay = 'any',
    user = null,
    bot = null,
    saveToDb = true,
    source = 'chat',
    timeoutMs = 90000
} = {}) {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
        console.warn('[IMAGE GENERATOR] Промпт для генерации пустой');
        return null;
    }

    const settings = await getImageGenerationSettings();
    const providers = await getAiProviders();
    const provider = pickImageProvider(providers, settings.provider_id);

    if (!provider) {
        console.warn('[IMAGE GENERATOR] Нет доступного провайдера для генерации картинок');
        return null;
    }

    const selectedModel = String(settings.model || provider.model_name || 'gemini-2.5-flash').trim();
    const referenceDataUrl = await getMasterReferenceDataUrl(bot);

    // Сборка составного промпта
    const baseStyle = String(settings.style_prompt || '').trim();
    const fullPrompt = [
        baseStyle || 'Realistic candid iPhone selfie of a 19-year-old Russian student girl named Lera from Saint Petersburg, natural lighting, authentic skin texture, subtle grain, real photo look, casual atmosphere.',
        `[SCENE]: ${normalizedPrompt}`,
        referenceDataUrl
            ? '[STRICT REQUIREMENT]: Strictly match and preserve the face, facial structure, eye shape, haircut, and identity of the girl shown in the reference image. Real camera look, authentic lighting, no 3D/AI plastic look.'
            : 'Real camera look, authentic lighting, no 3D/AI plastic look. Return the generated photo.'
    ].filter(Boolean).join('\n\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const isReferenceMode = Boolean(referenceDataUrl);
        const endpoint = isReferenceMode
            ? `${String(provider.base_url).replace(/\/+$/, '')}/chat/completions`
            : `${String(provider.base_url).replace(/\/+$/, '')}/images/generations`;

        const payload = isReferenceMode
            ? {
                model: selectedModel,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: `${fullPrompt}\n\nСгенерируй изображение и верни его в формате: ![image](data:image/jpeg;base64,...)` },
                        { type: 'image_url', image_url: { url: referenceDataUrl } }
                    ]
                }],
                max_tokens: 1500
            }
            : {
                model: selectedModel,
                prompt: fullPrompt,
                size: '1024x1024',
                n: 1,
                response_format: 'b64_json'
            };

        console.log(`🎨 [IMAGE GENERATOR] Старт генерации фото (${isReferenceMode ? 'с референсом' : 'текст-ту-фото'}) через ${provider.name} (${selectedModel})...`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${provider.api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const rawText = await response.text();
        let data = {};
        try { data = JSON.parse(rawText); } catch { /* non-json */ }

        if (!response.ok) {
            const detail = data?.error?.message || data?.message || rawText.slice(0, 300) || `HTTP ${response.status}`;
            console.error(`❌ [IMAGE GENERATOR] Ошибка провайдера ${provider.name}:`, detail);
            return null;
        }

        const extracted = extractImageFromResponse(data, rawText, isReferenceMode);
        if (!extracted || !extracted.buffer || extracted.buffer.length < 1000) {
            console.warn('⚠️ [IMAGE GENERATOR] Провайдер ответил успешно, но байты картинки не найдены в ответе:', rawText.slice(0, 300));
            return null;
        }

        console.log(`✅ [IMAGE GENERATOR] Фото успешно сгенерировано (${(extracted.buffer.length / 1024).toFixed(1)} КБ)`);

        let savedDbRecord = null;
        let telegramFileId = null;

        // Если есть бот и включено автосохранение в каталог, можно предварительно загрузить фото
        if (bot && saveToDb && settings.auto_save_catalog) {
            try {
                const adminChatId = Number(process.env.ADMIN_ID);
                if (adminChatId) {
                    const uploadSent = await bot.telegram.sendPhoto(adminChatId, {
                        source: extracted.buffer,
                        filename: 'lera_ai.jpg'
                    }, { caption: `🤖 [Auto-gen ${source}] ${normalizedPrompt.slice(0, 200)}` });
                    telegramFileId = uploadSent.photo?.at(-1)?.file_id || null;
                    if (telegramFileId) {
                        savedDbRecord = await addLeraPhoto({
                            file_id: telegramFileId,
                            caption: normalizedPrompt.slice(0, 300),
                            access_level: 'free',
                            time_of_day: timeOfDay || 'any',
                            tags: ['ai_generated', 'gemini', timeOfDay || 'any', source],
                            explicitness: 0,
                            outfit_tags: [],
                            is_reference: false,
                            prompt: normalizedPrompt,
                            source: `gemini_${source}`
                        });
                        console.log(`📸 [IMAGE GENERATOR] Новое фото #${savedDbRecord.id} сохранено в каталог lera_photos!`);
                    }
                }
            } catch (tgUploadErr) {
                console.warn('[IMAGE GENERATOR] Не удалось авто-сохранить фото через Telegram:', tgUploadErr.message);
            }
        }

        return {
            success: true,
            buffer: extracted.buffer,
            dataUrl: extracted.dataUrl,
            mimeType: extracted.mimeType,
            file_id: telegramFileId,
            caption: normalizedPrompt,
            savedPhoto: savedDbRecord,
            model: selectedModel,
            provider: provider.name
        };
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`⏱️ [IMAGE GENERATOR] Таймаут генерации изображения (${timeoutMs / 1000}s)`);
        } else {
            console.error('❌ [IMAGE GENERATOR ERROR]:', err.message);
        }
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
