import {
    getChannelPosterSettings,
    saveChannelPostLog,
    getChannelPostHistory,
    getRandomLeraPhoto,
    getOrderedAiProviders,
    getLeraProfile,
    getLeraProfileProjection,
    getRandomChannelContent,
    getLeraContent,
    getLeraPhotoById,
    getChannelSubscriberCount,
    countChannelPostsSince,
    claimChannelPublication,
    completeChannelPublication
} from './database.js';
import { getOpenAIClientAndModel } from './ai.js';
import { getCachedOpenAIClient, logLlmTrace } from './ai/llm_client.js';
import { selectWeightedTopic } from './channel_topics.js';
import { buildChannelSystemPrompt } from './channel_prompt.js';
import { judgeLeraReply } from './ai/response_judge.js';
import { generateLeraPhoto } from './services/image_generator.js';
import { cleanResponseText } from './utils/response_text.js';
import {
    selectChannelContentFormat,
    validateChannelText,
    normalizeChannelEditorialMode,
    normalizeChannelFormatSequence
} from './channel_content.js';

const TOPIC_DESCRIPTIONS = {
    thoughts: 'Мысли вслух о людях, Питере, музыке и неожиданных наблюдениях',
    flirt: 'Пикантный флирт, кокетство, ирония и интригующие намёки',
    life: 'Учёба в СПбГИК, СММ-правки от клиентов, питерская погода, неловкие ситуации и фейлы',
    jokes: 'Ироничный юмор, постирония, мемы и дерзкие шутки',
    questions: 'Провокационный или жизненный вопрос подписчикам, интерактив',
    meme: 'Дерзкая, жизненная или ироничная подпись к мему/картинке',
    repost: 'Личное мнение и реакция на пересланный пост'
};
const PUBLIC_BLOCK_LABELS = { voice: 'Голос и подача', context: 'Контекст', restrictions: 'Ограничения', cta: 'CTA' };

export function getTimeOfDayMSK() {
    const hour = parseInt(new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }), 10);
    if (hour >= 5 && hour < 12) return 'утро';
    if (hour >= 12 && hour < 18) return 'день';
    if (hour >= 18 && hour < 23) return 'вечер';
    return 'ночь';
}

export function getStartOfDayMSK(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const mskDateStr = formatter.format(date); // "YYYY-MM-DD"
    return new Date(`${mskDateStr}T00:00:00.000+03:00`);
}

export function decodeMediaPayload(mediaInput, defaultFilename = 'lera_channel.jpg') {
    if (!mediaInput) return null;

    if (Buffer.isBuffer(mediaInput)) {
        return { source: mediaInput, filename: defaultFilename };
    }

    if (typeof mediaInput === 'object') {
        if (Buffer.isBuffer(mediaInput.buffer)) {
            return { source: mediaInput.buffer, filename: mediaInput.filename || defaultFilename };
        }
        if (Buffer.isBuffer(mediaInput.source)) {
            return { source: mediaInput.source, filename: mediaInput.filename || defaultFilename };
        }
        if (mediaInput.file_id || mediaInput.fileId) {
            return mediaInput.file_id || mediaInput.fileId;
        }
    }

    const candidateStr = typeof mediaInput === 'string'
        ? mediaInput
        : (mediaInput?.preview_url || mediaInput?.media_url || mediaInput?.data_url || mediaInput?.dataUrl || mediaInput?.url || mediaInput?.source || '');

    if (typeof candidateStr === 'string' && candidateStr.trim()) {
        const trimmed = candidateStr.trim();
        if (trimmed.startsWith('data:')) {
            const commaIdx = trimmed.indexOf(',');
            if (commaIdx !== -1) {
                const base64Part = trimmed.slice(commaIdx + 1);
                const buffer = Buffer.from(base64Part, 'base64');
                return { source: buffer, filename: defaultFilename };
            }
        }
        if (trimmed.includes('file_id=')) {
            const m = trimmed.match(/file_id=([^&]+)/);
            if (m) return decodeURIComponent(m[1]);
        }
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
            return trimmed;
        }
    }

    return null;
}

function getFormattedTimeMSK() {
    return new Date().toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
}

function safeProvenance({ topic, timeOfDay, messagesCount, settings, model, contentFormat, editorialMode, formatSequence }) {
    const promptBlocks = Object.entries(settings.prompt_blocks || {})
        .filter(([, value]) => String(value || '').trim())
        .map(([key]) => PUBLIC_BLOCK_LABELS[key] || key);
    return {
        topic,
        content_format: contentFormat,
        editorial_mode: editorialMode,
        format_sequence: formatSequence,
        time_of_day: timeOfDay,
        messages_count: messagesCount,
        media_mode: settings.media_mode || 'none',
        temperature: Math.max(0, Math.min(2, Number(settings.temperature ?? 0.7))),
        prompt_blocks: promptBlocks,
        profile_version: settings.profile_version || null,
        public_facts: settings.public_facts || [],
        inherited_lera_prompt: false,
        current_day_context: false,
        model: model || null,
        generated_at: new Date().toISOString()
    };
}

async function requestDraftText({ systemPrompt, topicDescription, temperature, retryReason = '' }) {
    let providers = [];
    try { providers = await getOrderedAiProviders(); } catch (error) { console.warn('[CHANNEL POSTER] Не удалось загрузить провайдеров:', error.message); }
    if (!providers.length) {
        const { client, model } = await getOpenAIClientAndModel();
        providers = [{ name: 'Default', base_url: client.baseURL, api_key: client.apiKey, model_name: model, timeout_ms: 10000 }];
    }
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Лера, сделай новый пост в свой канал на тему "${topicDescription}".${retryReason ? ` Предыдущий вариант отклонён: ${retryReason}. Напиши полностью новый вариант.` : ''}` }
    ];
    for (const provider of providers) {
        try {
            const client = getCachedOpenAIClient(provider.base_url, provider.api_key, parseInt(provider.timeout_ms, 10) || 10000);
            const result = await client.chat.completions.create({
                model: provider.model_name, messages, max_tokens: 350,
                temperature: Math.max(0, Math.min(2, Number(temperature ?? 1.1))),
                presence_penalty: 0.9, frequency_penalty: 0.8
            });
            const text = result.choices[0]?.message?.content || '';
            await logLlmTrace({
                userId: 0, kind: 'CHANNEL', surface: 'CHANNEL', mode: 'channel-draft', model: provider.model_name, providerName: provider.name,
                systemPrompt, messages, rawResponse: text, usage: result.usage || {}
            });
            if (text) return { text, model: provider.model_name };
        } catch (error) {
            console.warn(`[CHANNEL POSTER] Провайдер ${provider.name} сбой:`, error.message);
        }
    }
    throw new Error('Не удалось сгенерировать пост через ИИ.');
}

export async function generateChannelPostDraft(overrideSettings = null) {
    const settings = overrideSettings ? { ...(await getChannelPosterSettings()), ...overrideSettings } : await getChannelPosterSettings();
    const editorialMode = normalizeChannelEditorialMode(settings.editorial_mode);
    const formatSequence = normalizeChannelFormatSequence(settings.format_sequence);
    const [recentPosts, profile] = await Promise.all([
        getChannelPostHistory(8),
        getLeraProfile()
    ]);
    const time = getFormattedTimeMSK();
    const timeOfDay = getTimeOfDayMSK();
    const topic = overrideSettings?.topic || selectWeightedTopic(settings);
    let topicDescription = TOPIC_DESCRIPTIONS[topic] || 'Мысли вслух и жизненные заметки';
    const hasMediaCapability = settings.media_mode === 'db_photo' || settings.media_mode === 'meme' || settings.media_mode === 'ai_photo';

    const contentFormat = selectChannelContentFormat({
        recentPosts,
        hasMedia: hasMediaCapability,
        topic,
        preferredFormat: overrideSettings?.content_format || settings.content_format,
        editorialMode,
        formatSequence
    });

    let mediaContent = null;
    let selectedPhoto = null;

    if (contentFormat === 'photo_caption') {
        if (settings.media_mode === 'meme') {
            mediaContent = await getRandomChannelContent({ type: 'photo' }) || await getRandomChannelContent();
        } else if (settings.media_mode === 'db_photo') {
            selectedPhoto = await getRandomLeraPhoto({ access_level: 'free', time_of_day: timeOfDay, excludeChannelUsed: true });
        }
        topicDescription = 'Короткая подпись к фото в 1 строку (например: «привет», «сегодня такой день», «настроение такое», «красиво») или пара слов';
    } else if (topic === 'meme' && settings.media_mode === 'meme') {
        mediaContent = await getRandomChannelContent({ type: 'photo' }) || await getRandomChannelContent();
        if (mediaContent) {
            topicDescription = `Короткая мысль к картинке в 1 строку: ${mediaContent.description || 'жизненный мем'}`;
        }
    }
    const messagesCount = '1';
    let publicFacts = settings.public_facts_enabled ? (settings.public_facts || []) : [];
    const subscribers = await getChannelSubscriberCount().catch(() => null);
    if (subscribers !== null && subscribers !== undefined) {
        publicFacts = publicFacts.filter(f => !/подписчик/i.test(f));
        publicFacts.push(`В Telegram-канале Леры сейчас ${subscribers} подписчиков`);
    }
    const baseProvenance = safeProvenance({
        topic, timeOfDay, messagesCount,
        settings: { ...settings, public_facts: publicFacts, profile_version: profile.version },
        model: null,
        contentFormat,
        editorialMode,
        formatSequence
    });
    if (mediaContent) {
        baseProvenance.media_content_id = mediaContent.id;
        baseProvenance.media_type = mediaContent.telegram_type;
    } else if (selectedPhoto) {
        baseProvenance.media_content_id = `photo:${selectedPhoto.id}`;
        baseProvenance.media_type = 'photo';
    }
    const systemPrompt = buildChannelSystemPrompt({
        time, timeOfDay, topic, topicDescription, recentPosts, messagesCount: '1', promptBlocks: settings.prompt_blocks,
        leraPrompt: settings.public_profile_enabled === false ? '' : getLeraProfileProjection(profile.profile, 'CHANNEL'),
        publicFacts,
        creativity: settings.creativity,
        ctaStyle: settings.cta_style,
        contentFormat,
        editorialMode
    });
    let generated = await requestDraftText({ systemPrompt, topicDescription, temperature: settings.temperature });
    let text = cleanResponseText(generated.text);
    let formatCheck = validateChannelText(text, contentFormat, editorialMode);
    if (formatCheck.ok && formatCheck.text) {
        text = formatCheck.text;
    }
    let judge = await judgeChannelText({ text, topic, publicFacts, recentPosts, profile, settings, contentFormat, editorialMode });
    if (judge.passed !== false && !formatCheck.ok) {
        judge = { ...judge, passed: false, verdict: `REJECT:${formatCheck.code}`, code: formatCheck.code, local: true, reason: formatCheck.reason };
    }
    let finalFormat = contentFormat;
    let attempt = 1;
    if (judge.passed === false && settings.judge_mode === 'ENFORCE') {
        const retryFormat = selectChannelContentFormat({
            recentPosts,
            hasMedia: hasMediaCapability,
            topic,
            preferredFormat: contentFormat,
            avoidFormat: '',
            editorialMode,
            formatSequence,
            randomValue: 0
        });
        finalFormat = retryFormat;
        const retryPrompt = buildChannelSystemPrompt({
            time, timeOfDay, topic, topicDescription, recentPosts, messagesCount: '1', promptBlocks: settings.prompt_blocks,
            leraPrompt: settings.public_profile_enabled === false ? '' : getLeraProfileProjection(profile.profile, 'CHANNEL'),
            publicFacts,
            creativity: settings.creativity,
            ctaStyle: settings.cta_style,
            contentFormat: retryFormat,
            editorialMode
        });
        generated = await requestDraftText({
            systemPrompt: retryPrompt,
            topicDescription,
            temperature: settings.temperature,
            retryReason: `${judge.code || 'CHANNEL_REJECTED'}; используй формат ${retryFormat}`
        });
        text = cleanResponseText(generated.text);
        formatCheck = validateChannelText(text, retryFormat, editorialMode);
        if (formatCheck.ok && formatCheck.text) {
            text = formatCheck.text;
        }
        attempt = 2;
        judge = await judgeChannelText({ text, topic, publicFacts, recentPosts, profile, settings, contentFormat: retryFormat, editorialMode });
        if (judge.passed !== false && !formatCheck.ok) {
            judge = { ...judge, passed: false, verdict: `REJECT:${formatCheck.code}`, code: formatCheck.code, local: true, reason: formatCheck.reason };
        }
        baseProvenance.content_format = retryFormat;
    }

    let media = null;
    if (finalFormat === 'photo_caption') {
        if (settings.media_mode === 'meme') {
            mediaContent = await getRandomChannelContent({ type: 'photo' }) || await getRandomChannelContent();
        } else if (settings.media_mode === 'db_photo') {
            selectedPhoto = await getRandomLeraPhoto({ access_level: 'free', time_of_day: timeOfDay, excludeChannelUsed: true });
        } else if (settings.media_mode === 'ai_photo') {
            media = {
                type: 'ai_photo',
                description: 'AI-генерация фото (Gemini) при отправке'
            };
        }
    } else if (topic === 'meme' && settings.media_mode === 'meme') {
        mediaContent = await getRandomChannelContent({ type: 'photo' }) || await getRandomChannelContent();
    } else {
        mediaContent = null;
        selectedPhoto = null;
    }

    if (mediaContent) {
        media = {
            type: mediaContent.telegram_type || 'photo',
            id: mediaContent.id,
            description: mediaContent.description || 'Мем/картинка из каталога',
            file_id: mediaContent.telegram_file_id || null,
            preview_url: mediaContent.telegram_file_id
                ? `/api/admin/telegram-preview?file_id=${encodeURIComponent(mediaContent.telegram_file_id)}`
                : (mediaContent.url || null)
        };
        baseProvenance.media_content_id = mediaContent.id;
        baseProvenance.media_type = mediaContent.telegram_type || 'photo';
    } else if (selectedPhoto) {
        media = {
            type: 'photo',
            id: `photo:${selectedPhoto.id}`,
            description: selectedPhoto.caption || 'Фото Леры из базы',
            file_id: selectedPhoto.file_id || null,
            preview_url: `/api/admin/photos/${selectedPhoto.id}/preview`
        };
        baseProvenance.media_content_id = `photo:${selectedPhoto.id}`;
        baseProvenance.media_type = 'photo';
    } else {
        delete baseProvenance.media_content_id;
        delete baseProvenance.media_type;
    }

    const provenance = {
        ...baseProvenance,
        model: generated.model || null,
        attempt,
        judge_mode: settings.judge_mode,
        judge_verdict: judge.verdict || null,
        judge_code: judge.code || null,
        judge_model: judge.model || null,
        judge_provider: judge.providerName || null,
        judge_latency_ms: judge.latencyMs || 0,
        published: settings.judge_mode !== 'ENFORCE' || judge.passed !== false
    };

    const draft = {
        text,
        chunks: [text],
        topic,
        provenance,
        judge,
        media,
        media_mode: settings.media_mode,
        media_content_id: mediaContent?.id || (selectedPhoto ? `photo:${selectedPhoto.id}` : null),
        status: judge.passed === false && settings.judge_mode === 'ENFORCE' ? 'DRAFT_REJECTED' : 'DRAFT'
    };
    if (judge.passed === false && settings.judge_mode === 'ENFORCE') {
        draft.log = await saveChannelPostLog({
            channel_id: String(settings.channel_id || 'draft'),
            topic,
            text,
            media_mode: settings.media_mode,
            provenance,
            status: 'DRAFT_REJECTED'
        });
    }
    return draft;
}

async function judgeChannelText({ text, topic, publicFacts, recentPosts, profile, settings, contentFormat = 'life_observation', editorialMode = 'reference_short' }) {
    const judgeSettings = {
        ...settings,
        channelJudgeMode: settings.judge_mode,
        judgeProviderId: settings.judge_provider_id,
        judgeModel: settings.judge_model,
        judgePrompt: settings.judge_prompt || 'Проверяй публичный пост строго. Если конкретное событие не подтверждено фактами, отклоняй его.',
        judgeTimeoutMs: settings.judge_timeout_ms,
        judgeMaxTokens: settings.judge_max_tokens
    };
    return judgeLeraReply({
        userId: 0,
        surface: 'CHANNEL',
        mode: 'CHANNEL',
        reply: text,
        topic,
        contentFormat,
        editorialMode,
        publicFacts,
        recentPublicPosts: recentPosts,
        leraRules: getLeraProfileProjection(profile.profile, 'CHANNEL'),
        settings: judgeSettings
    });
}

export async function publishChannelDraft(bot, draft = {}, overrideSettings = null) {
    if (!bot) throw new Error('Бот не инициализирован');
    const {
        text,
        topic,
        provenance = {},
        media_content_id = null,
        media = null,
        preview_url = null,
        media_url = null,
        file_id = null,
        idempotency_key = null
    } = draft;
    const settings = overrideSettings || await getChannelPosterSettings();
    const editorialMode = normalizeChannelEditorialMode(settings.editorial_mode);
    const channelId = String(settings.channel_id || '').trim();
    if (!channelId) throw new Error('Юзернейм или ID канала не указан в настройках.');
    let cleanedText = cleanResponseText(text);
    if (!cleanedText || cleanedText.length > 4000) throw new Error('Черновик пустой или слишком длинный.');
    const publicationKey = idempotency_key || provenance.idempotency_key || null;
    if (publicationKey) {
        const claim = await claimChannelPublication(publicationKey, channelId, {
            topic,
            text: cleanedText,
            media_content_id,
            media_mode: settings.media_mode
        }).catch(() => ({ claimed: true }));
        if (!claim.claimed) {
            return {
                success: claim.record?.status === 'PUBLISHED',
                published: claim.record?.status === 'PUBLISHED',
                duplicate: true,
                status: claim.record?.status || 'SENDING',
                telegram_message_ids: claim.record?.telegram_message_ids || []
            };
        }
    }
    const profile = (settings.public_profile_enabled === false && settings.judge_mode === 'OFF')
        ? { profile: {}, version: 1 }
        : await getLeraProfile().catch(() => ({ profile: {}, version: 1 }));
    const recentPosts = settings.judge_mode === 'OFF'
        ? []
        : await getChannelPostHistory(8).catch(() => []);
    let publicFacts = settings.public_facts_enabled ? (settings.public_facts || []) : [];
    const subscribers = settings.public_facts_enabled ? await getChannelSubscriberCount(bot).catch(() => null) : null;
    if (subscribers !== null && subscribers !== undefined) {
        publicFacts = publicFacts.filter(f => !/подписчик/i.test(f));
        publicFacts.push(`В Telegram-канале Леры сейчас ${subscribers} подписчиков`);
    }
    const contentFormat = provenance.content_format || settings.content_format || 'life_observation';
    const formatCheck = validateChannelText(cleanedText, contentFormat, editorialMode);
    if (formatCheck.ok && formatCheck.text) {
        cleanedText = formatCheck.text;
    }
    let judge = await judgeChannelText({ text: cleanedText, topic, publicFacts, recentPosts, profile, settings, contentFormat, editorialMode });
    if (judge.passed !== false && !formatCheck.ok) {
        judge = { ...judge, passed: false, verdict: `REJECT:${formatCheck.code}`, code: formatCheck.code, local: true, reason: formatCheck.reason };
    }
    if (judge.passed === false && settings.judge_mode === 'ENFORCE') {
        const rejectedProvenance = {
            ...provenance,
            judge_mode: settings.judge_mode,
            judge_verdict: judge.verdict,
            judge_code: judge.code,
            attempt: Number(provenance.attempt || 1),
            published: false
        };
        const draftLog = await saveChannelPostLog({
            channel_id: channelId,
            topic,
            text: cleanedText,
            media_mode: settings.media_mode,
            provenance: rejectedProvenance,
            status: 'DRAFT_REJECTED'
        });
        if (publicationKey) await completeChannelPublication(publicationKey, { status: 'REJECTED', errorText: judge.code });
        return { success: false, published: false, status: 'DRAFT_REJECTED', reason: judge.code, judge, log: draftLog };
    }
    let photoToSend = null;
    let contentMedia = null;
    const contentId = media_content_id || provenance.media_content_id || media?.id;
    if (typeof contentId === 'string' && contentId.startsWith('photo:')) {
        const photoDbId = contentId.replace('photo:', '');
        const dbPhoto = await getLeraPhotoById(photoDbId).catch(() => null);
        if (dbPhoto?.file_id) {
            photoToSend = dbPhoto.file_id;
        }
    } else if (contentId) {
        contentMedia = await getLeraContent(contentId).catch(() => null);
    }

    if (!photoToSend && !contentMedia) {
        const previewCandidates = [
            media,
            preview_url,
            media_url,
            file_id,
            draft?.buffer,
            draft?.source,
            provenance.preview_url,
            provenance.media_url,
            provenance.file_id
        ];
        for (const cand of previewCandidates) {
            if (!cand) continue;
            const decoded = decodeMediaPayload(cand);
            if (decoded) {
                photoToSend = decoded;
                break;
            }
        }
    }

    const isPhotoFormat = contentFormat === 'photo_caption' || provenance.content_format === 'photo_caption';
    const isMemeFormat = contentFormat === 'meme_caption' || provenance.content_format === 'meme_caption';
    const isMediaRequested = Boolean(contentId || (media && media.type && media.type !== 'none') || photoToSend || isPhotoFormat || isMemeFormat);

    if (isMediaRequested && !contentMedia && !photoToSend && (settings.media_mode === 'ai_photo' || settings.media_mode === 'db_photo')) {
        if (settings.media_mode === 'ai_photo') {
            try {
                const prompt = `Candid photo of Lera for Telegram channel post. Topic: ${topic}. Post text: "${cleanedText.slice(0, 300)}"`;
                const generated = await generateLeraPhoto({
                    prompt,
                    timeOfDay: getTimeOfDayMSK(),
                    bot,
                    saveToDb: true,
                    source: 'channel'
                });
                if (generated?.buffer) {
                    photoToSend = { source: generated.buffer, filename: 'lera_channel.jpg' };
                } else if (generated?.file_id) {
                    photoToSend = generated.file_id;
                }
            } catch (e) {
                console.warn('[CHANNEL POSTER] Сбой генерации фото через Gemini, берем fallback из БД:', e.message);
            }
        }
        if (!photoToSend) {
            const photo = await getRandomLeraPhoto({ access_level: 'free', time_of_day: getTimeOfDayMSK(), excludeChannelUsed: true });
            photoToSend = photo?.file_id || null;
        }
    }
    const telegramMessageIds = [];
    let sentResult = null;
    const usesCaption = Boolean(photoToSend)
        || ['photo', 'animation', 'video', 'audio'].includes(contentMedia?.telegram_type);
    if (usesCaption) {
        cleanedText = cleanedText.slice(0, 1024).trim();
    }
    if (contentMedia) {
        if (contentMedia.telegram_type === 'photo' && contentMedia.telegram_file_id) {
            sentResult = bot.telegram?.sendPhoto
                ? await bot.telegram.sendPhoto(channelId, contentMedia.telegram_file_id, { caption: cleanedText })
                : await bot.sendPhoto(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'animation' && contentMedia.telegram_file_id) {
            sentResult = bot.telegram?.sendAnimation
                ? await bot.telegram.sendAnimation(channelId, contentMedia.telegram_file_id, { caption: cleanedText })
                : await bot.sendAnimation(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'video' && contentMedia.telegram_file_id) {
            sentResult = bot.telegram?.sendVideo
                ? await bot.telegram.sendVideo(channelId, contentMedia.telegram_file_id, { caption: cleanedText })
                : await bot.sendVideo(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'audio' && contentMedia.telegram_file_id) {
            sentResult = bot.telegram?.sendAudio
                ? await bot.telegram.sendAudio(channelId, contentMedia.telegram_file_id, { caption: cleanedText })
                : await bot.sendAudio(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'link' && contentMedia.url) {
            const suffix = `\n\n${contentMedia.url}`;
            const availableTextLength = Math.max(1, 4096 - suffix.length);
            cleanedText = cleanedText.slice(0, availableTextLength).trim();
            sentResult = bot.telegram?.sendMessage
                ? await bot.telegram.sendMessage(channelId, `${cleanedText}${suffix}`)
                : await bot.sendMessage(channelId, `${cleanedText}${suffix}`);
        } else {
            sentResult = bot.telegram?.sendMessage
                ? await bot.telegram.sendMessage(channelId, cleanedText)
                : await bot.sendMessage(channelId, cleanedText);
        }
    } else if (photoToSend) {
        sentResult = bot.telegram?.sendPhoto
            ? await bot.telegram.sendPhoto(channelId, photoToSend, { caption: cleanedText })
            : await bot.sendPhoto(channelId, photoToSend, { caption: cleanedText });
    } else {
        sentResult = bot.telegram?.sendMessage
            ? await bot.telegram.sendMessage(channelId, cleanedText)
            : await bot.sendMessage(channelId, cleanedText);
    }
    if (sentResult?.message_id) telegramMessageIds.push(sentResult.message_id);
    if (publicationKey) {
        await completeChannelPublication(publicationKey, { status: 'PUBLISHED', telegramMessageIds }).catch(() => null);
    }

    const safeTopic = TOPIC_DESCRIPTIONS[topic] ? topic : 'thoughts';
    const sentPhotoFileId = sentResult?.photo?.at(-1)?.file_id || (typeof photoToSend === 'string' ? photoToSend : null);
    const log = await saveChannelPostLog({
        channel_id: channelId, topic: safeTopic, text: cleanedText, photo_url: sentPhotoFileId || contentMedia?.telegram_file_id || null,
        media_mode: contentMedia ? contentMedia.telegram_type : settings.media_mode, provenance: { ...provenance, topic: safeTopic, judge_verdict: judge.verdict, judge_code: judge.code, published: true }, telegram_message_ids: telegramMessageIds,
        status: 'PUBLISHED'
    }).catch(() => ({ text: cleanedText, channel_id: channelId, status: 'PUBLISHED' }));
    return { success: true, count: 1, text: log.text || cleanedText, channel_id: channelId, log };
}

let channelPosterInterval = null;
let channelPostInFlight = false;

export async function generateAndPublishChannelPost(bot, overrideSettings = null) {
    if (channelPostInFlight) throw new Error('Публикация уже выполняется');
    channelPostInFlight = true;
    try {
        const draft = await generateChannelPostDraft(overrideSettings);
        const settings = overrideSettings || await getChannelPosterSettings();
        const frequencyHours = Math.max(1, Number(settings.frequency_hours || 12));
        const slot = Math.floor(Date.now() / (frequencyHours * 60 * 60 * 1000));
        draft.idempotency_key = draft.idempotency_key || `channel:${String(settings.channel_id)}:${slot}`;
        return await publishChannelDraft(bot, draft, overrideSettings);
    } finally {
        channelPostInFlight = false;
    }
}

export function initChannelPoster(bot) {
    if (channelPosterInterval) clearInterval(channelPosterInterval);
    channelPosterInterval = setInterval(async () => {
        try {
            const settings = await getChannelPosterSettings();
            const lastPosted = settings.last_posted_at ? new Date(settings.last_posted_at).getTime() : 0;
            const dayStart = getStartOfDayMSK();
            const postsToday = settings.channel_id
                ? await countChannelPostsSince(settings.channel_id, dayStart.toISOString())
                : 0;
            const dailyLimit = Math.max(1, Number(settings.posts_per_day || 2));
            const frequencyHours = Math.max(1, Number(settings.frequency_hours || 12));
            if (settings.is_enabled
                && settings.channel_id
                && postsToday < dailyLimit
                && Date.now() - lastPosted >= frequencyHours * 60 * 60 * 1000) {
                await generateAndPublishChannelPost(bot, settings);
            }
        } catch (error) {
            console.error('❌ [CHANNEL POSTER CRON ERROR]:', error.message);
        }
    }, 15 * 60 * 1000);
}

export function stopChannelPoster() {
    if (channelPosterInterval) clearInterval(channelPosterInterval);
    channelPosterInterval = null;
}
