import {
    getChannelPosterSettings,
    saveChannelPostLog,
    getChannelPostHistory,
    getRandomLeraPhoto,
    getOrderedAiProviders
} from './database.js';
import { getOpenAIClientAndModel } from './ai.js';
import { getCachedOpenAIClient, logLlmTrace } from './ai/llm_client.js';
import { selectWeightedTopic } from './channel_topics.js';
import { buildChannelSystemPrompt } from './channel_prompt.js';
import { getLeraPrompts } from './prompts.js';
import { ContextBuilder } from './ai/context_builder.js';

const TOPIC_DESCRIPTIONS = {
    thoughts: 'Мысли вслух о жизни, парнях и настроении',
    flirt: 'Пикантный флирт, кокетство и интригующие намеки',
    life: 'Личные фейлы, милые случайности и истории из дня',
    jokes: 'Ироничный юмор, жизненные мемы и дерзкие шутки',
    questions: 'Провокационный вопрос подписчикам или интерактив'
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

function splitGeneratedPost(rawText, messagesCountSetting) {
    const cleanedText = String(rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\[IMAGE:[\s\S]*?\]/gi, '').replace(/\[RECOMMEND\]/gi, '').trim();
    let chunks = messagesCountSetting === '1'
        ? [cleanedText.replace(/---/g, '\n')]
        : cleanedText.split(/---/g).map(chunk => chunk.trim().replace(/^[\s\-–—]+/gm, '')).filter(Boolean);
    if (messagesCountSetting === '2' && chunks.length > 2) chunks = chunks.slice(0, 2);
    if (messagesCountSetting === '3' && chunks.length > 3) chunks = chunks.slice(0, 3);
    return chunks.length ? chunks.slice(0, 3) : [cleanedText];
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
        temperature: Math.max(0, Math.min(2, Number(settings.temperature ?? 1.1))),
        prompt_blocks: promptBlocks,
        inherited_lera_prompt: settings.inherit_lera_prompt !== false,
        current_day_context: settings.include_day_context !== false,
        model: model || null,
        generated_at: new Date().toISOString()
    };
}

async function requestDraftText({ systemPrompt, topicDescription, temperature }) {
    let providers = [];
    try { providers = await getOrderedAiProviders(); } catch (error) { console.warn('[CHANNEL POSTER] Не удалось загрузить провайдеров:', error.message); }
    if (!providers.length) {
        const { client, model } = await getOpenAIClientAndModel();
        providers = [{ name: 'Default', base_url: client.baseURL, api_key: client.apiKey, model_name: model, timeout_ms: 10000 }];
    }
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Лера, сделай новый пост в свой канал на тему "${topicDescription}".` }
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
    const [recentPosts, leraPromptsData, daySnapshot] = await Promise.all([
        getChannelPostHistory(5),
        settings.inherit_lera_prompt === false ? Promise.resolve(null) : getLeraPrompts(),
        settings.include_day_context === false ? Promise.resolve(null) : ContextBuilder.buildTelegramContextDetailed(null)
    ]);
    const time = getFormattedTimeMSK();
    const timeOfDay = getTimeOfDayMSK();
    const topic = selectWeightedTopic(settings);
    const topicDescription = TOPIC_DESCRIPTIONS[topic] || 'Мысли вслух и жизненные заметки';
    const messagesCount = settings.messages_count || '1';
    const systemPrompt = buildChannelSystemPrompt({
        time, timeOfDay, topic, topicDescription, recentPosts, messagesCount, promptBlocks: settings.prompt_blocks,
        leraPrompt: leraPromptsData?.fullPrompt || '',
        dayContext: daySnapshot?.text || ''
    });
    const generated = await requestDraftText({ systemPrompt, topicDescription, temperature: settings.temperature });
    const chunks = splitGeneratedPost(generated.text, messagesCount);
    const text = chunks.join('\n---\n');
    return {
        text,
        chunks,
        topic,
        provenance: safeProvenance({ topic, timeOfDay, messagesCount, settings, model: generated.model })
    };
}

export async function publishChannelDraft(bot, { text, topic, provenance = {} } = {}, overrideSettings = null) {
    if (!bot) throw new Error('Бот не инициализирован');
    const settings = overrideSettings ? { ...(await getChannelPosterSettings()), ...overrideSettings } : await getChannelPosterSettings();
    const channelId = String(settings.channel_id || '').trim();
    if (!channelId) throw new Error('Юзернейм или ID канала не указан в настройках.');
    const chunks = String(text || '').split(/\n---\n/g).map(chunk => chunk.trim()).filter(Boolean).slice(0, 3);
    if (!chunks.length || chunks.join('').length > 12000) throw new Error('Черновик пустой или слишком длинный.');
    let photoToSend = null;
    if (settings.media_mode === 'db_photo') {
        const photo = await getRandomLeraPhoto({ access_level: 'free', time_of_day: getTimeOfDayMSK() });
        photoToSend = photo?.file_id || null;
    }
    const telegramMessageIds = [];
    for (let index = 0; index < chunks.length; index += 1) {
        const isLast = index === chunks.length - 1;
        const result = isLast && photoToSend
            ? await bot.telegram.sendPhoto(channelId, photoToSend, { caption: chunks[index] })
            : await bot.telegram.sendMessage(channelId, chunks[index]);
        if (result?.message_id) telegramMessageIds.push(result.message_id);
    }
    const safeTopic = TOPIC_DESCRIPTIONS[topic] ? topic : 'thoughts';
    const log = await saveChannelPostLog({
        channel_id: channelId, topic: safeTopic, text: chunks.join('\n---\n'), photo_url: photoToSend,
        media_mode: settings.media_mode, provenance: { ...provenance, topic: safeTopic }, telegram_message_ids: telegramMessageIds
    });
    return { success: true, count: chunks.length, text: log.text, channel_id: channelId, log };
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
