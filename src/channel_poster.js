import {
    getChannelPosterSettings,
    saveChannelPostLog,
    getChannelPostHistory,
    getRandomLeraPhoto,
    getOrderedAiProviders,
    getLeraProfile,
    getLeraProfileProjection,
    getRandomChannelContent,
    getLeraContent
} from './database.js';
import { getOpenAIClientAndModel } from './ai.js';
import { getCachedOpenAIClient, logLlmTrace } from './ai/llm_client.js';
import { selectWeightedTopic } from './channel_topics.js';
import { buildChannelSystemPrompt } from './channel_prompt.js';
import { judgeLeraReply } from './ai/response_judge.js';

const TOPIC_DESCRIPTIONS = {
    thoughts: 'Мысли вслух о жизни, парнях и настроении',
    flirt: 'Пикантный флирт, кокетство и интригующие намеки',
    life: 'Личные фейлы, милые случайности и истории из дня',
    jokes: 'Ироничный юмор, жизненные мемы и дерзкие шутки',
    questions: 'Провокационный вопрос подписчикам или интерактив',
    meme: 'Дерзкая, жизненная или ироничная подпись к мему/картинке',
    repost: 'Личное мнение и реакция на пересланный пост'
};
const PUBLIC_BLOCK_LABELS = { voice: 'Голос и подача', context: 'Контекст', restrictions: 'Ограничения', cta: 'CTA' };

function getTimeOfDayMSK() {
    const hour = parseInt(new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }), 10);
    if (hour >= 5 && hour < 12) return 'утро';
    if (hour >= 12 && hour < 18) return 'день';
    if (hour >= 18 && hour < 23) return 'вечер';
    return 'ночь';
}

function getFormattedTimeMSK() {
    return new Date().toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
}

function cleanGeneratedPost(rawText) {
    return String(rawText || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/\[IMAGE:[\s\S]*?\]/gi, '')
        .replace(/\[RECOMMEND\]/gi, '')
        .replace(/---/g, '\n')
        .replace(/^[\s\-–—]+/gm, '')
        .replace(/^знаете что[,\s]*(?:я\s+)?(?:сделала|заметила|бесит)?[,:\s]*/iu, '')
        .trim();
}

function safeProvenance({ topic, timeOfDay, messagesCount, settings, model }) {
    const promptBlocks = Object.entries(settings.prompt_blocks || {})
        .filter(([, value]) => String(value || '').trim())
        .map(([key]) => PUBLIC_BLOCK_LABELS[key] || key);
    return {
        topic,
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
                userId: 0, kind: 'CHANNEL', mode: 'channel-draft', model: provider.model_name, providerName: provider.name,
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
    const [recentPosts, profile] = await Promise.all([
        getChannelPostHistory(5),
        getLeraProfile()
    ]);
    const time = getFormattedTimeMSK();
    const timeOfDay = getTimeOfDayMSK();
    const topic = selectWeightedTopic(settings);
    let topicDescription = TOPIC_DESCRIPTIONS[topic] || 'Мысли вслух и жизненные заметки';
    let mediaContent = null;
    if (topic === 'meme' || settings.media_mode === 'meme') {
        mediaContent = await getRandomChannelContent({ type: 'photo' }) || await getRandomChannelContent();
        if (mediaContent) {
            topicDescription = `Дерзкая подпись к мему/картинке: ${mediaContent.description || 'жизненный мем'}`;
        }
    }
    const messagesCount = '1';
    const publicFacts = settings.public_facts_enabled ? (settings.public_facts || []) : [];
    const baseProvenance = safeProvenance({
        topic, timeOfDay, messagesCount,
        settings: { ...settings, public_facts: publicFacts, profile_version: profile.version },
        model: null
    });
    if (mediaContent) {
        baseProvenance.media_content_id = mediaContent.id;
        baseProvenance.media_type = mediaContent.telegram_type;
    }
    const systemPrompt = buildChannelSystemPrompt({
        time, timeOfDay, topic, topicDescription, recentPosts, messagesCount: '1', promptBlocks: settings.prompt_blocks,
        leraPrompt: settings.public_profile_enabled === false ? '' : getLeraProfileProjection(profile.profile, 'CHANNEL'),
        publicFacts,
        creativity: settings.creativity,
        ctaStyle: settings.cta_style
    });
    let generated = await requestDraftText({ systemPrompt, topicDescription, temperature: settings.temperature });
    let text = cleanGeneratedPost(generated.text);
    let judge = await judgeChannelText({ text, topic, publicFacts, recentPosts, profile, settings });
    let attempt = 1;
    if (judge.passed === false && settings.judge_mode === 'ENFORCE') {
        generated = await requestDraftText({
            systemPrompt,
            topicDescription,
            temperature: settings.temperature,
            retryReason: judge.code || 'CHANNEL_REJECTED'
        });
        text = cleanGeneratedPost(generated.text);
        attempt = 2;
        judge = await judgeChannelText({ text, topic, publicFacts, recentPosts, profile, settings });
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
        media_content_id: mediaContent?.id || null,
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

async function judgeChannelText({ text, topic, publicFacts, recentPosts, profile, settings }) {
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
        publicFacts,
        recentPublicPosts: recentPosts,
        leraRules: getLeraProfileProjection(profile.profile, 'CHANNEL'),
        settings: judgeSettings
    });
}

export async function publishChannelDraft(bot, { text, topic, provenance = {}, media_content_id = null } = {}, overrideSettings = null) {
    if (!bot) throw new Error('Бот не инициализирован');
    const settings = overrideSettings ? { ...(await getChannelPosterSettings()), ...overrideSettings } : await getChannelPosterSettings();
    const channelId = String(settings.channel_id || '').trim();
    if (!channelId) throw new Error('Юзернейм или ID канала не указан в настройках.');
    const cleanedText = cleanGeneratedPost(text);
    if (!cleanedText || cleanedText.length > 4000) throw new Error('Черновик пустой или слишком длинный.');
    const profile = await getLeraProfile();
    const recentPosts = await getChannelPostHistory(5);
    const publicFacts = settings.public_facts_enabled ? (settings.public_facts || []) : [];
    const judge = await judgeChannelText({ text: cleanedText, topic, publicFacts, recentPosts, profile, settings });
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
        return { success: false, published: false, status: 'DRAFT_REJECTED', reason: judge.code, judge, log: draftLog };
    }
    let photoToSend = null;
    let contentMedia = null;
    const contentId = media_content_id || provenance.media_content_id;
    if (contentId) {
        contentMedia = await getLeraContent(contentId).catch(() => null);
    }
    if (!contentMedia && settings.media_mode === 'db_photo') {
        const photo = await getRandomLeraPhoto({ access_level: 'free', time_of_day: getTimeOfDayMSK() });
        photoToSend = photo?.file_id || null;
    }
    const telegramMessageIds = [];
    let sentResult = null;
    if (contentMedia) {
        if (contentMedia.telegram_type === 'photo' && contentMedia.telegram_file_id) {
            sentResult = await bot.telegram.sendPhoto(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'animation' && contentMedia.telegram_file_id) {
            sentResult = await bot.telegram.sendAnimation(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'video' && contentMedia.telegram_file_id) {
            sentResult = await bot.telegram.sendVideo(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'audio' && contentMedia.telegram_file_id) {
            sentResult = await bot.telegram.sendAudio(channelId, contentMedia.telegram_file_id, { caption: cleanedText });
        } else if (contentMedia.telegram_type === 'link' && contentMedia.url) {
            sentResult = await bot.telegram.sendMessage(channelId, `${cleanedText}\n\n${contentMedia.url}`);
        } else {
            sentResult = await bot.telegram.sendMessage(channelId, cleanedText);
        }
    } else if (photoToSend) {
        sentResult = await bot.telegram.sendPhoto(channelId, photoToSend, { caption: cleanedText });
    } else {
        sentResult = await bot.telegram.sendMessage(channelId, cleanedText);
    }
    if (sentResult?.message_id) telegramMessageIds.push(sentResult.message_id);

    const safeTopic = TOPIC_DESCRIPTIONS[topic] ? topic : 'thoughts';
    const log = await saveChannelPostLog({
        channel_id: channelId, topic: safeTopic, text: cleanedText, photo_url: photoToSend || contentMedia?.telegram_file_id || null,
        media_mode: contentMedia ? contentMedia.telegram_type : settings.media_mode, provenance: { ...provenance, topic: safeTopic, judge_verdict: judge.verdict, judge_code: judge.code, published: true }, telegram_message_ids: telegramMessageIds,
        status: 'PUBLISHED'
    });
    return { success: true, count: 1, text: log.text, channel_id: channelId, log };
}

let channelPosterInterval = null;
let channelPostInFlight = false;

export async function generateAndPublishChannelPost(bot, overrideSettings = null) {
    if (channelPostInFlight) throw new Error('Публикация уже выполняется');
    channelPostInFlight = true;
    try {
        const draft = await generateChannelPostDraft(overrideSettings);
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
            if (settings.is_enabled && settings.channel_id && Date.now() - lastPosted >= (settings.frequency_hours || 4) * 60 * 60 * 1000) {
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
