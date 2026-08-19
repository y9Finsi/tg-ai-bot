import {
    getAiProviders,
    getImageGenerationSettings,
    getMasterReferencePhoto,
    addLeraPhoto
} from '../database.js';

/**
 * Строит точный и строгий промпт для генерации с сохранением лица референса
 */
export function buildImagePrompt({ prompt, baseStyle, hasReference = false, isChatModel = false }) {
    const defaultBaseStyle = 'Candid authentic amateur photo of Lera, a 19-year-old Russian student girl from Saint Petersburg. Appearance: fair skin with natural freckles across cheeks and nose bridge, distinct grey-green almond-shaped eyes with subtle thin winged eyeliner, soft natural brows, full natural lips. Shoulder-length messy textured dirty-blonde hair with wispy curtain bangs framing her face. Vibe & Aesthetic: cute, natural, expressive, genuine real-life iPhone camera photo, natural skin texture with subtle pores, warm ambient lighting, filmic grain, no CGI, no 3D render, no plastic AI smoothing.';
    const style = String(baseStyle || '').trim() || defaultBaseStyle;
    const cleanPrompt = String(prompt || '').trim();

    if (isChatModel) {
        if (hasReference) {
            return [
                `[TASK: CHARACTER-CONSISTENT PHOTO GENERATION - EXACT FACE MATCH]`,
                `The attached image is the EXACT facial reference of the character (Lera).`,
                `[CHARACTER FACE & IDENTITY SPECIFICATION]:`,
                style,
                `[SCENE / CONTEXT / EMOTION / ACTION]:`,
                cleanPrompt,
                `[STRICT RULES]:`,
                `1. FACE & IDENTITY: Strictly preserve the exact face structure, features, freckles, eye color/shape, and hair from the reference and character specification.`,
                `2. DYNAMIC SCENE: Follow the requested scene, outfit, pose, expression, and environment described above. Do NOT hardcode unrelated poses or rooms.`,
                `3. REALISM: Photorealistic candid shot, natural lighting, real depth of field, unedited phone camera quality, zero CGI or plastic smoothing.`,
                `[OUTPUT FORMAT]:`,
                `Return the generated image as markdown: ![image](data:image/jpeg;base64,...)`
            ].join('\n\n');
        }

        return [
            `[TASK: REALISTIC PHOTO GENERATION]`,
            `[CHARACTER SPECIFICATION]:`,
            style,
            `[SCENE / ACTION / CONTEXT]:`,
            cleanPrompt,
            `[REQUIREMENTS]:`,
            `Candid authentic photograph, natural ambient lighting, real skin texture, subtle film grain, real smartphone camera look.`,
            `Return the image in markdown format: ![image](data:image/jpeg;base64,...)`
        ].join('\n\n');
    }

    // Для специализированных моделей /images/generations (DALL-E, gpt-image-2, Flux, SD и т.д.)
    return `${style}. Scene: ${cleanPrompt}. Highly detailed, candid smartphone photograph, natural ambient light, authentic film grain, authentic skin texture, realistic phone photo look.`.trim();
}

/**
 * Проверяет, является ли модель мультимодальной чат-моделью (Gemini bridge) или выделенной image-моделью (/images/generations)
 */
export function isMultimodalChatModel(modelName = '', baseUrl = '') {
    const m = String(modelName || '').toLowerCase();
    const u = String(baseUrl || '').toLowerCase();

    // Явные генераторы картинок для /images/generations
    if (
        m.includes('gpt-image') ||
        m.includes('dall-e') ||
        m.includes('dall') ||
        m.includes('flux') ||
        m.includes('stable-diffusion') ||
        m.startsWith('sd-') ||
        m.startsWith('sd3') ||
        m.startsWith('sdxl') ||
        m.includes('midjourney') ||
        m.includes('recraft') ||
        m.includes('ideogram') ||
        m.includes('imagen')
    ) {
        return false;
    }

    // Gemini или явный gemini web-to-api bridge
    if (m.includes('gemini') || u.includes('gemini-web-to-api')) {
        return true;
    }

    return false;
}

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
        if (masterPhoto?.file_id) {
            try {
                let fileUrl = null;
                if (bot?.telegram?.getFileLink) {
                    const link = await bot.telegram.getFileLink(masterPhoto.file_id);
                    fileUrl = typeof link === 'string' ? link : (link?.href || String(link));
                } else if (process.env.BOT_TOKEN) {
                    const getFileRes = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${masterPhoto.file_id}`);
                    if (getFileRes.ok) {
                        const fileInfo = await getFileRes.json();
                        if (fileInfo?.result?.file_path) {
                            fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.result.file_path}`;
                        }
                    }
                }
                if (fileUrl) {
                    const res = await fetch(fileUrl);
                    if (res.ok) {
                        const buf = Buffer.from(await res.arrayBuffer());
                        const contentType = res.headers.get('content-type') || 'image/jpeg';
                        return `data:${contentType};base64,${buf.toString('base64')}`;
                    }
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

    // Ищем провайдеры с моделью/именем image, gpt-image, pic, dall, flux, sd, gemini
    const imageProvider = providers.find(p =>
        p.is_enabled !== false &&
        (String(p.model_name || '').toLowerCase().includes('image') ||
         String(p.model_name || '').toLowerCase().includes('gemini') ||
         String(p.model_name || '').toLowerCase().includes('dall') ||
         String(p.model_name || '').toLowerCase().includes('flux') ||
         String(p.model_name || '').toLowerCase().includes('pic') ||
         String(p.name || '').toLowerCase().includes('image') ||
         String(p.name || '').toLowerCase().includes('gemini') ||
         String(p.name || '').toLowerCase().includes('pic') ||
         String(p.name || '').toLowerCase().includes('dall') ||
         String(p.name || '').toLowerCase().includes('flux'))
    );
    if (imageProvider) return imageProvider;

    // Fallback: активный провайдер или первый включенный
    return providers.find(p => p.is_active && p.is_enabled !== false) || providers.find(p => p.is_enabled !== false) || providers[0];
}

/**
 * Преобразует ответ провайдера (OpenAI / Gemini / Image Bridge) в буфер и dataUrl
 */
export async function extractImageFromResponse(data, rawText = '') {
    let base64Data = null;
    let mimeType = 'image/png';
    let buffer = null;

    // 1. Стандартный формат /images/generations: data[0].b64_json или b64_json в корне
    if (data?.data?.[0]?.b64_json) {
        base64Data = data.data[0].b64_json;
        mimeType = 'image/png';
    } else if (data?.data?.[0]?.image && typeof data.data[0].image === 'string' && data.data[0].image.length > 200 && !data.data[0].image.startsWith('http')) {
        base64Data = data.data[0].image;
    } else if (data?.b64_json) {
        base64Data = data.b64_json;
    } else if (data?.image && typeof data.image === 'string' && data.image.length > 200 && !data.image.startsWith('http')) {
        base64Data = data.image;
    }

    // 2. Стандартный формат /images/generations: data[0].url или прямая ссылка
    if (!base64Data) {
        const potentialUrl = data?.data?.[0]?.url
            || (typeof data?.url === 'string' ? data.url : null)
            || (Array.isArray(data?.images) && typeof data.images[0] === 'string' ? data.images[0] : null)
            || (Array.isArray(data?.output) && typeof data.output[0] === 'string' ? data.output[0] : null)
            || (typeof data?.result === 'string' && data.result.startsWith('http') ? data.result : null);

        if (potentialUrl && potentialUrl.startsWith('http')) {
            try {
                const imgRes = await fetch(potentialUrl);
                if (imgRes.ok) {
                    const arrBuf = await imgRes.arrayBuffer();
                    buffer = Buffer.from(arrBuf);
                    mimeType = imgRes.headers.get('content-type') || 'image/png';
                    base64Data = buffer.toString('base64');
                }
            } catch (e) {
                console.warn('[IMAGE GENERATOR] Ошибка скачивания сгенерированной картинки по URL:', e.message);
            }
        } else if (potentialUrl && potentialUrl.startsWith('data:image/')) {
            const parts = potentialUrl.split(',');
            const extractedMime = potentialUrl.match(/data:image\/([^;]+);/)?.[1];
            mimeType = extractedMime ? `image/${extractedMime}` : 'image/png';
            base64Data = parts[1] || parts[0];
        }
    }

    // 3. Формат multimodal chat / markdown в choices или rawText
    if (!base64Data) {
        const content = data?.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : (typeof rawText === 'string' ? rawText : '');

        // 3a. dataUrl в markdown ![image](data:image/...;base64,...)
        const dataUrlMatch = text.match(/!\[image\]\((data:image\/([^;]+);base64,([^\)]+))\)/i)
            || text.match(/(data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))/i);
        if (dataUrlMatch) {
            mimeType = `image/${dataUrlMatch[2] || 'png'}`;
            base64Data = dataUrlMatch[3] || dataUrlMatch[1].split(',')[1];
        }

        // 3b. URL картинки в markdown ![image](https://...) или прямая ссылка
        if (!base64Data) {
            const urlMatch = text.match(/!\[(?:image|.*?)\]\((https?:\/\/[^\s\)]+)\)/i)
                || text.match(/(https:\/\/[a-zA-Z0-9.\-_/]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s\)]*)?)/i)
                || text.match(/(https:\/\/lh3\.googleusercontent\.com\/[^\s\)]+)/i);
            if (urlMatch) {
                const imgUrl = urlMatch[1];
                try {
                    const imgRes = await fetch(imgUrl);
                    if (imgRes.ok) {
                        const arrBuf = await imgRes.arrayBuffer();
                        buffer = Buffer.from(arrBuf);
                        mimeType = imgRes.headers.get('content-type') || 'image/png';
                        base64Data = buffer.toString('base64');
                    }
                } catch (e) {
                    console.warn('[IMAGE GENERATOR] Ошибка скачивания сгенерированной картинки по URL из текста:', e.message);
                }
            }
        }
    }

    if (!base64Data) return null;

    const cleanB64 = String(base64Data).replace(/\s+/g, '');
    buffer = buffer || Buffer.from(cleanB64, 'base64');
    const dataUrl = `data:${mimeType};base64,${cleanB64}`;

    return { buffer, dataUrl, mimeType, b64Json: cleanB64 };
}

/**
 * Выполняет один запрос генерации к конкретному AI-провайдеру с умной маршрутизацией эндпоинтов и авто-fallback
 */
export async function executeImageGenerationRequest({
    provider,
    model,
    prompt,
    referenceDataUrl = null,
    size = '1024x1024',
    stylePrompt = '',
    signal = null
}) {
    if (!provider || !provider.base_url) {
        throw new Error('Не указан AI-провайдер');
    }

    const selectedModel = String(model || provider.model_name || 'gemini-2.5-flash').trim();
    const baseUrl = String(provider.base_url).replace(/\/+$/, '');
    const isChatEligible = isMultimodalChatModel(selectedModel, baseUrl) && Boolean(referenceDataUrl);

    let lastError = null;

    // Стратегия 1: Если модель поддерживает Multimodal Chat и есть референс — пробуем /chat/completions
    if (isChatEligible) {
        try {
            const chatPrompt = buildImagePrompt({
                prompt,
                baseStyle: stylePrompt,
                hasReference: true,
                isChatModel: true
            });
            const chatPayload = {
                model: selectedModel,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: referenceDataUrl } },
                        { type: 'text', text: chatPrompt }
                    ]
                }],
                max_tokens: 2000
            };

            console.log(`🎨 [IMAGE GEN] Попытка через /chat/completions (${provider.name}, ${selectedModel})...`);
            const res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${provider.api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(chatPayload),
                signal
            });

            const raw = await res.text();
            let data = {};
            try { data = JSON.parse(raw); } catch { /* non-json */ }

            if (res.ok) {
                const extracted = await extractImageFromResponse(data, raw);
                if (extracted?.buffer && extracted.buffer.length >= 500) {
                    return {
                        success: true,
                        mode: 'reference_chat',
                        model: selectedModel,
                        providerName: provider.name,
                        dataUrl: extracted.dataUrl,
                        b64Json: extracted.b64Json,
                        buffer: extracted.buffer,
                        mimeType: extracted.mimeType,
                        rawText: raw
                    };
                }
            } else {
                const detail = data?.error?.message || data?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
                console.warn(`⚠️ [IMAGE GEN] /chat/completions вернул ошибку (${detail}), переключаюсь на /images/generations...`);
                lastError = new Error(detail);
            }
        } catch (chatErr) {
            if (chatErr.name === 'AbortError') throw chatErr;
            console.warn(`⚠️ [IMAGE GEN] Сбой /chat/completions (${chatErr.message}), переключаюсь на /images/generations...`);
            lastError = chatErr;
        }
    }

    // Стратегия 2: /images/generations (для gpt-image-2, dall-e, flux, sd, либо как fallback)
    const genPrompt = buildImagePrompt({
        prompt,
        baseStyle: stylePrompt,
        hasReference: false,
        isChatModel: false
    });

    const payloadsToTry = [
        { model: selectedModel, prompt: genPrompt, size, n: 1 },
        { model: selectedModel, prompt: genPrompt, size, n: 1, response_format: 'b64_json' },
        { model: selectedModel, prompt: genPrompt }
    ];

    for (let i = 0; i < payloadsToTry.length; i++) {
        const payload = payloadsToTry[i];
        try {
            const validSignals = [signal, AbortSignal.timeout(120000)].filter(Boolean);
            const fetchSignal = (AbortSignal.any && validSignals.length > 1) ? AbortSignal.any(validSignals) : (signal || AbortSignal.timeout(120000));
            const res = await fetch(`${baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${provider.api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: fetchSignal
            });

            const raw = await res.text();
            let data = {};
            try { data = JSON.parse(raw); } catch { /* non-json */ }

            if (res.ok) {
                const extracted = await extractImageFromResponse(data, raw);
                if (extracted?.buffer && extracted.buffer.length >= 500) {
                    return {
                        success: true,
                        mode: referenceDataUrl ? 'reference_fallback' : 'generation',
                        model: selectedModel,
                        providerName: provider.name,
                        dataUrl: extracted.dataUrl,
                        b64Json: extracted.b64Json,
                        buffer: extracted.buffer,
                        mimeType: extracted.mimeType,
                        rawText: raw
                    };
                }
            }

            const detail = data?.error?.message || data?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
            lastError = new Error(detail);

            // Если ошибка не связана с лишними параметрами или форматом, прекращаем перебор вариантов payload
            if (!detail.toLowerCase().includes('response_format') &&
                !detail.toLowerCase().includes('extra') &&
                !detail.toLowerCase().includes('parameter') &&
                !detail.toLowerCase().includes('size') &&
                !detail.toLowerCase().includes('invalid')) {
                break;
            }
        } catch (genErr) {
            if (genErr.name === 'AbortError') throw genErr;
            lastError = genErr;
            break;
        }
    }

    throw lastError || new Error('Провайдер не вернул изображение');
}

/**
 * Основная функция генерации фото Леры
 */
export async function generateLeraPhoto({
    prompt,
    timeOfDay = 'any',
    user = null,
    bot = null,
    saveToDb = true,
    source = 'chat',
    timeoutMs = 120000,
    providerId = null,
    model = null,
    size = '1024x1024',
    imageDataUrl = null
} = {}) {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
        console.warn('[IMAGE GENERATOR] Промпт для генерации пустой');
        return null;
    }

    const settings = await getImageGenerationSettings();
    const providers = await getAiProviders();
    const targetProviderId = providerId || settings.provider_id;
    const primaryProvider = pickImageProvider(providers, targetProviderId);

    if (!primaryProvider) {
        console.warn('[IMAGE GENERATOR] Нет доступного провайдера для генерации картинок');
        return null;
    }

    // Составляем цепочку провайдеров: primary -> остальные enabled провайдеры
    const candidateProviders = [primaryProvider];
    for (const p of providers) {
        if (p.is_enabled !== false && Number(p.id) !== Number(primaryProvider.id)) {
            candidateProviders.push(p);
        }
    }

    const effectiveReferenceUrl = imageDataUrl || await getMasterReferenceDataUrl(bot);
    const selectedModel = String(model || settings.model || primaryProvider.model_name || 'gemini-2.5-flash').trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let result = null;
        let lastError = null;

        for (let i = 0; i < candidateProviders.length; i++) {
            const currentProvider = candidateProviders[i];
            const currentModel = (i === 0 && model) ? selectedModel : (currentProvider.model_name || selectedModel);

            try {
                result = await executeImageGenerationRequest({
                    provider: currentProvider,
                    model: currentModel,
                    prompt: normalizedPrompt,
                    referenceDataUrl: effectiveReferenceUrl,
                    size,
                    stylePrompt: settings.style_prompt,
                    signal: controller.signal
                });

                if (result?.buffer) {
                    if (i > 0) {
                        console.log(`✅ [IMAGE GENERATOR FALLBACK] Успешная генерация через fallback-провайдер ${currentProvider.name} (${currentModel})!`);
                    }
                    break;
                }
            } catch (err) {
                lastError = err;
                if (err.name === 'AbortError') throw err;
                console.warn(`⚠️ [IMAGE GENERATOR] Сбой генерации через ${currentProvider.name} (${currentModel}): ${err.message}`);
            }
        }

        if (!result || !result.buffer) {
            console.error('❌ [IMAGE GENERATOR] Все провайдеры завершились с ошибкой:', lastError?.message);
            return null;
        }

        console.log(`✅ [IMAGE GENERATOR] Фото успешно сгенерировано (${(result.buffer.length / 1024).toFixed(1)} КБ)`);

        let savedDbRecord = null;
        let telegramFileId = null;

        if (bot && saveToDb && settings.auto_save_catalog) {
            try {
                const adminChatId = Number(process.env.ADMIN_ID);
                if (adminChatId) {
                    const uploadSent = await bot.telegram.sendPhoto(adminChatId, {
                        source: result.buffer,
                        filename: 'lera_ai.jpg'
                    }, { caption: `🤖 [Auto-gen ${source}] ${normalizedPrompt.slice(0, 200)}` });
                    telegramFileId = uploadSent.photo?.at(-1)?.file_id || null;
                    if (telegramFileId) {
                        savedDbRecord = await addLeraPhoto({
                            file_id: telegramFileId,
                            caption: normalizedPrompt.slice(0, 300),
                            access_level: 'free',
                            time_of_day: timeOfDay || 'any',
                            tags: ['ai_generated', result.model || 'gen', timeOfDay || 'any', source],
                            explicitness: 0,
                            outfit_tags: [],
                            is_reference: false,
                            prompt: normalizedPrompt,
                            source: `${result.providerName || 'ai'}_${source}`
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
            buffer: result.buffer,
            filename: 'photo.jpg',
            dataUrl: result.dataUrl,
            b64Json: result.b64Json,
            mimeType: result.mimeType,
            file_id: telegramFileId,
            caption: normalizedPrompt,
            savedPhoto: savedDbRecord,
            model: result.model,
            provider: result.providerName,
            mode: result.mode
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
