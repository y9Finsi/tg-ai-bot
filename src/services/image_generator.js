import {
    getAiProviders,
    getImageGenerationSettings,
    getMasterReferencePhoto,
    addLeraPhoto
} from '../database.js';

/**
 * Строит точный и строгий промпт для генерации с сохранением лица референса
 */
export function buildImagePrompt({ prompt, baseStyle, hasReference }) {
    const defaultBaseStyle = 'Candid authentic amateur photo of Lera, a 19-year-old Russian student girl from Saint Petersburg. Appearance: fair skin with natural freckles across cheeks and nose bridge, distinct grey-green almond-shaped eyes with subtle thin winged eyeliner, soft natural brows, full natural lips. Shoulder-length messy textured dirty-blonde hair with wispy curtain bangs framing her face. Vibe & Aesthetic: cute, natural, expressive, genuine real-life iPhone camera photo, natural skin texture with subtle pores, warm ambient lighting, filmic grain, no CGI, no 3D render, no plastic AI smoothing.';
    const style = String(baseStyle || '').trim() || defaultBaseStyle;
    const cleanPrompt = String(prompt || '').trim();

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
async function extractImageFromResponse(data, rawText, isReferenceMode) {
    let base64Data = null;
    let mimeType = 'image/png';
    let buffer = null;

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

        // 2. Ищем URL картинки в формате ![image](https://...) или прямую ссылку
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
                    console.warn('[IMAGE GENERATOR] Ошибка скачивания сгенерированной картинки по URL:', e.message);
                }
            }
        }
    }

    // 3. Ищем в стандартном формате /images/generations b64_json или url
    if (!base64Data && data?.data?.[0]?.b64_json) {
        base64Data = data.data[0].b64_json;
        mimeType = 'image/png';
    } else if (!base64Data && data?.data?.[0]?.url) {
        try {
            const imgRes = await fetch(data.data[0].url);
            if (imgRes.ok) {
                const arrBuf = await imgRes.arrayBuffer();
                buffer = Buffer.from(arrBuf);
                mimeType = imgRes.headers.get('content-type') || 'image/png';
                base64Data = buffer.toString('base64');
            }
        } catch (e) {
            console.warn('[IMAGE GENERATOR] Ошибка скачивания сгенерированной картинки по data.url:', e.message);
        }
    }

    if (!base64Data) return null;

    const cleanB64 = base64Data.replace(/\s+/g, '');
    buffer = buffer || Buffer.from(cleanB64, 'base64');
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
    const isReferenceMode = Boolean(referenceDataUrl);

    // Сборка составного промпта
    const fullPrompt = buildImagePrompt({
        prompt: normalizedPrompt,
        baseStyle: settings.style_prompt,
        hasReference: isReferenceMode
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const endpoint = isReferenceMode
            ? `${String(provider.base_url).replace(/\/+$/, '')}/chat/completions`
            : `${String(provider.base_url).replace(/\/+$/, '')}/images/generations`;

        const payload = isReferenceMode
            ? {
                model: selectedModel,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: referenceDataUrl } },
                        { type: 'text', text: fullPrompt }
                    ]
                }],
                max_tokens: 2000
            }
            : {
                model: selectedModel,
                prompt: fullPrompt,
                size: '1024x1024',
                n: 1,
                response_format: 'b64_json'
            };

        console.log(`🎨 [IMAGE GENERATOR] Старт генерации фото (${isReferenceMode ? 'с референсом лица' : 'текст-ту-фото'}) через ${provider.name} (${selectedModel})...`);

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

        const extracted = await extractImageFromResponse(data, rawText, isReferenceMode);
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
            filename: 'photo.jpg',
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
