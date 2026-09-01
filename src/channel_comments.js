import {
    getUser,
    getChannelPosterSettings,
    getChannelPostByTelegramMessageId,
    claimChannelProcessedMessage,
    getChannelDiscussionThread,
    upsertChannelDiscussionThread,
    getOrderedAiProviders,
    getLeraProfile,
    getLeraProfileProjection
} from './database.js';
import { getOpenAIClientAndModel } from './ai.js';
import { getCachedOpenAIClient, logLlmTrace } from './ai/llm_client.js';
import { parseLlmJson } from './utils/robust_json.js';
import { getRoutingSettings, getModeGenerationParams } from './ai/intent_router.js';
import { getRoutedSystemPrompt } from './prompts.js';
import { cleanResponseText } from './utils/response_text.js';
import { judgeLeraReply } from './ai/response_judge.js';

// Valid Telegram emoji reactions
const ALLOWED_REACTIONS = new Set([
    '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱',
    '🤬', '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡',
    '🍌', '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈',
    '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '😨',
    '🤝', '✍️', '🤗', '🫡', '🎅', '🎄', '☃️', '💅', '🤪', '🗿',
    '🆒', '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂️',
    '🤷', '🤷‍♀️', '😡'
]);

// Hot caches only. PostgreSQL remains the source of truth across restarts.
const rootPosts = new Map();
const threadHistory = new Map();
const postReplyCounts = new Map();

export async function getCommenterContext(userId) {
    if (!userId) return { isKnown: false };
    try {
        const user = await getUser(userId);
        if (!user) return { isKnown: false };

        const name = user.first_name || user.username || 'друг';

        return {
            isKnown: true,
            userId,
            name,
            facts: [],
            relationshipStatus: 'известный подписчик'
        };
    } catch {
        return { isKnown: false };
    }
}

export async function generateCommentDecision({
    postText = '',
    threadContext = [],
    commentText = '',
    commenter = { isKnown: false },
    isDirectMention = false,
    channelSettings = {}
} = {}) {
    // 1. Inherit CASUAL prompt modules (Core, Common, Casual rules + Profile)
    const casualPromptBase = await getRoutedSystemPrompt('CASUAL');

    let commenterContext = 'Собеседник: обычный подписчик канала. Отвечай дружелюбно, дерзко, с юмором и на «ты».';
    if (commenter.isKnown && channelSettings.recognize_users !== false) {
        commenterContext = `Известный подписчик канала.
Имя: ${commenter.name}
Можно обратиться по имени, если это естественно.
Не используй сведения из личной переписки, памяти пользователя или статуса отношений.`;
    }

    const taskInstruction = isDirectMention
        ? 'Подписчик обратился напрямую к тебе (@упоминание или ответ на твой пост/сообщение). Текстовый ответ обязателен. При желании можешь также поставить реакцию-эмодзи.'
        : 'Это фоновый комментарий в обсуждении. Реши, хочешь ли ты поставить реакцию-эмодзи, написать короткий ответ или оставить без ответа.';

    const customRules = channelSettings.comments_prompt
        ? `\nДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ ДЛЯ КОММЕНТАРИЕВ:\n${channelSettings.comments_prompt}\n`
        : '';

    const historySection = Array.isArray(threadContext) && threadContext.length
        ? `\nПоследние сообщения в этой ветке комментариев:\n${threadContext.map(m => `${m.sender}: "${m.text}"`).join('\n')}\n`
        : '';

    const systemPrompt = `${casualPromptBase}

[РЕЖИМ: ПУБЛИЧНЫЕ КОММЕНТАРИИ ПОД ПОСТОМ КАНАЛА]
Исходный пост канала: "${postText || 'без текста'}"
${historySection}
${commenterContext}

${customRules}
${taskInstruction}

Формат ответа — строго валидный JSON:
{
  "reaction": "эмодзи из списка (например: 🔥, 🤣, ❤️, 💅, 👀, 👍, 🤡, 🌚, 💔, ⚡) или null",
  "reply": "текст твоего ответа подписчику строчными буквами без эмодзи (1-2 коротких предложения) или null",
  "reason": "краткое объяснение почему выбрана такая реакция/ответ"
}

Правила текста ответа:
- Живой разговорный стиль студентки из СПб (жиза, рил, блин, кароч).
- Без смайликов и эмодзи внутри текста.
- Не начинай с тире.`;

    // 2. Inherit sampling parameters from CASUAL mode
    let routingSettings = {};
    try { routingSettings = await getRoutingSettings(); } catch { /* default */ }
    const casualParams = getModeGenerationParams('CASUAL', routingSettings);

    let providers = [];
    try { providers = await getOrderedAiProviders(); } catch { /* ignore */ }
    if (!providers.length) {
        const { client, model } = await getOpenAIClientAndModel();
        providers = [{ name: 'Default', base_url: client.baseURL, api_key: client.apiKey, model_name: model, timeout_ms: 8000 }];
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Комментарий подписчика: "${commentText}"` }
    ];

    for (const provider of providers) {
        try {
            const client = getCachedOpenAIClient(provider.base_url, provider.api_key, parseInt(provider.timeout_ms, 10) || 8000);
            const result = await client.chat.completions.create({
                model: provider.model_name,
                messages,
                max_tokens: casualParams.maxTokens || 180,
                temperature: casualParams.temperature ?? 0.7,
                top_p: casualParams.top_p,
                frequency_penalty: casualParams.frequency_penalty,
                presence_penalty: casualParams.presence_penalty
            });
            const rawResponse = result.choices[0]?.message?.content?.trim() || '';
            if (rawResponse) {
                await logLlmTrace({
                    userId: commenter.userId || 0,
                    kind: 'CHANNEL_COMMENT',
                    mode: 'comment_decision',
                    surface: 'CHANNEL_COMMENT',
                    userText: commentText,
                    model: provider.model_name,
                    providerName: provider.name,
                    systemPrompt,
                    messages,
                    memoryUsed: [],
                    rawResponse,
                    usage: result.usage || {},
                    generationTrace: [{
                        step: 'memory_retrieval',
                        source: 'public_comment_identity_only',
                        strategy: 'public_identity_only',
                        semanticCandidates: 0,
                        semanticSelected: 0,
                        repositorySelected: 0,
                        injectedCount: 0,
                        facts: []
                    }]
                });

                const parsed = parseLlmJson(rawResponse) || {};
                let cleanReaction = typeof parsed.reaction === 'string' ? parsed.reaction.trim() : null;
                if (cleanReaction && !ALLOWED_REACTIONS.has(cleanReaction)) {
                    const match = cleanReaction.match(/[\p{Extended_Pictographic}]/u);
                    cleanReaction = match && ALLOWED_REACTIONS.has(match[0]) ? match[0] : null;
                }

                let cleanReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : null;
                if (cleanReply) {
                    cleanReply = cleanResponseText(cleanReply);
                }

                let commentJudge = { skipped: true, verdict: 'SKIPPED', passed: true, code: null };
                if (cleanReply) {
                    const judgeSettings = {
                        ...channelSettings,
                        channelJudgeMode: channelSettings.judge_mode,
                        judgeProviderId: channelSettings.judge_provider_id,
                        judgeModel: channelSettings.judge_model,
                        judgePrompt: channelSettings.judge_prompt || 'Проверяй публичный комментарий строго и не пропускай приватные детали.',
                        judgeTimeoutMs: channelSettings.judge_timeout_ms,
                        judgeMaxTokens: channelSettings.judge_max_tokens
                    };
                    commentJudge = await judgeLeraReply({
                        userId: commenter.userId || 0,
                        surface: 'CHANNEL_COMMENT',
                        mode: 'CHANNEL_COMMENT',
                        userText: commentText,
                        reply: cleanReply,
                        topic: 'комментарий под постом',
                        publicFacts: [],
                        recentPublicPosts: [{ text: postText }],
                        leraRules: 'Публичный комментарий без утечки личных данных, служебных деталей и интимных секретов.',
                        settings: judgeSettings
                    });
                    if (commentJudge.passed === false && channelSettings.judge_mode === 'ENFORCE') {
                        cleanReply = null;
                    }
                }

                return {
                    reaction: cleanReaction || null,
                    reply: cleanReply || null,
                    reason: parsed.reason || '',
                    judge: commentJudge
                };
            }
        } catch (error) {
            console.warn(`[CHANNEL COMMENTS] Provider ${provider.name} error:`, error.message);
        }
    }
    return { reaction: null, reply: null, reason: 'error' };
}

export async function handleChannelDiscussionMessage(bot, ctx) {
    const msg = ctx.message;
    if (!msg || !msg.text || !ctx.chat || ctx.chat.type !== 'supergroup') return false;

    const settings = await getChannelPosterSettings();
    if (!settings.comments_enabled) return false;

    const sourcePostMessageId = msg.reply_to_message?.forward_from_message_id
        || msg.reply_to_message?.forward_origin?.message_id
        || null;
    const rootMessageId = sourcePostMessageId
        || msg.message_thread_id
        || msg.reply_to_message?.message_id
        || msg.message_id;
    const discussionId = String(ctx.chat.id);
    const sourceChannelId = String(msg.reply_to_message?.forward_from_chat?.id || settings.channel_id || '');

    // 1. If this message or reply is an automatic channel forward, save post text
    const isChannelForward = Boolean(msg.reply_to_message?.is_automatic_forward || msg.reply_to_message?.forward_from_chat);
    if (isChannelForward && msg.reply_to_message) {
        const text = msg.reply_to_message.text || msg.reply_to_message.caption || '';
        if (text) {
            rootPosts.set(rootMessageId, text);
            rootPosts.set(msg.reply_to_message.message_id, text);
            await upsertChannelDiscussionThread({
                channelId: discussionId,
                rootMessageId,
                sourcePostMessageId,
                postText: text,
                threadHistory: threadHistory.get(rootMessageId) || [],
                replyCount: postReplyCounts.get(rootMessageId) || 0
            });
        }
    }

    // 2. Resolve original post text: cache -> persisted exact mapping -> forward.
    let postText = rootPosts.get(rootMessageId) || rootPosts.get(msg.reply_to_message?.message_id) || '';
    if (!postText && isChannelForward) {
        postText = msg.reply_to_message.text || msg.reply_to_message.caption || '';
    }
    const persistedThread = await getChannelDiscussionThread(discussionId, rootMessageId).catch(() => null);
    if (!postText && persistedThread?.post_text) {
        postText = persistedThread.post_text;
        rootPosts.set(rootMessageId, postText);
    }
    if (!postText && sourcePostMessageId) {
        const exactPost = await getChannelPostByTelegramMessageId(sourceChannelId, sourcePostMessageId).catch(() => null);
        if (exactPost?.text) {
            postText = exactPost.text;
            rootPosts.set(rootMessageId, postText);
        }
    }
    if (!postText) return false;

    const isReply = Boolean(msg.reply_to_message);
    const isBotTagged = Boolean(ctx.botInfo?.username)
        && msg.text.toLowerCase().includes(`@${ctx.botInfo.username.toLowerCase()}`);
    const isReplyToBot = msg.reply_to_message?.from?.id === ctx.botInfo?.id;

    if (!isReply && !isBotTagged && !isChannelForward) return false;
    if (!(await claimChannelProcessedMessage(ctx.chat.id, msg.message_id))) return false;

    const currentRepliesOnPost = postReplyCounts.get(rootMessageId)
        ?? Number(persistedThread?.reply_count || 0);
    const isDirectMention = isBotTagged || isReplyToBot;

    // For background comments, respect configured chances
    if (!isDirectMention) {
        if (currentRepliesOnPost >= 2) return false;
        const roll = Math.random() * 100;
        const maxChance = Math.max(settings.reaction_chance ?? 40, settings.comment_chance ?? 15);
        if (roll > maxChance) return false;
    }

    // Get current thread context
    const currentThread = threadHistory.get(rootMessageId)
        || (Array.isArray(persistedThread?.thread_history) ? persistedThread.thread_history : []);

    try {
        const commenter = await getCommenterContext(msg.from?.id);
        const decision = await generateCommentDecision({
            postText,
            threadContext: currentThread.slice(-5),
            commentText: msg.text,
            commenter,
            isDirectMention,
            channelSettings: settings
        });

        // Record incoming user comment in thread
        currentThread.push({ sender: commenter.name || 'Подписчик', text: msg.text });
        if (currentThread.length > 10) currentThread.shift();
        threadHistory.set(rootMessageId, currentThread);
        await upsertChannelDiscussionThread({
            channelId: discussionId,
            rootMessageId,
            sourcePostMessageId,
            postText,
            threadHistory: currentThread,
            replyCount: currentRepliesOnPost
        });

        // 1. Emoji reaction if chosen
        if (decision.reaction) {
            try {
                await ctx.telegram.setMessageReaction(ctx.chat.id, msg.message_id, [{ type: 'emoji', emoji: decision.reaction }]);
            } catch {
                // Ignore reaction API errors
            }
        }

        // 2. Text response if chosen
        if (decision.reply) {
            await ctx.reply(decision.reply, { reply_to_message_id: msg.message_id });
            postReplyCounts.set(rootMessageId, currentRepliesOnPost + 1);

            // Record bot reply in thread
            currentThread.push({ sender: 'Лера', text: decision.reply });
            if (currentThread.length > 10) currentThread.shift();
            threadHistory.set(rootMessageId, currentThread);
            await upsertChannelDiscussionThread({
                channelId: discussionId,
                rootMessageId,
                sourcePostMessageId,
                postText,
                threadHistory: currentThread,
                replyCount: currentRepliesOnPost + 1
            });

            return true;
        }
    } catch (error) {
        console.error('[CHANNEL COMMENTS] Error handling discussion message:', error.message);
    }

    return false;
}

export async function handleGroupMention(bot, ctx) {
    const msg = ctx.message;
    if (!msg || !msg.text || !ctx.chat) return false;

    const botUsername = ctx.botInfo?.username?.toLowerCase() || '';
    const isBotTagged = Boolean(botUsername) && msg.text.toLowerCase().includes(`@${botUsername}`);
    const isReplyToBot = msg.reply_to_message?.from?.id === ctx.botInfo?.id;
    const isGuestMention = msg.entities?.some(e => e.type === 'mention' && msg.text.substring(e.offset, e.offset + e.length).toLowerCase() === `@${botUsername}`);

    if (!isBotTagged && !isReplyToBot && !isGuestMention) return false;

    // Защита от дублей
    if (!(await claimChannelProcessedMessage(ctx.chat.id, msg.message_id))) return false;

    ctx.sendChatAction('typing').catch(() => {});

    // Очищаем запрос от тега бота
    let userQuery = msg.text;
    if (botUsername) {
        userQuery = userQuery.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
    }
    if (!userQuery && msg.reply_to_message?.text) {
        userQuery = msg.reply_to_message.text;
    }

    const commenter = await getCommenterContext(msg.from?.id);
    const channelSettings = await getChannelPosterSettings().catch(() => ({}));

    // Контекст реплая
    const threadContext = [];
    if (msg.reply_to_message?.text) {
        const replySender = msg.reply_to_message.from?.first_name || (msg.reply_to_message.from?.id === ctx.botInfo?.id ? 'Лера' : 'Участник');
        threadContext.push({ sender: replySender, text: msg.reply_to_message.text });
    }

    try {
        const decision = await generateCommentDecision({
            postText: ctx.chat.title ? `Групповой чат: "${ctx.chat.title}"` : 'Групповой чат',
            threadContext,
            commentText: userQuery || msg.text,
            commenter,
            isDirectMention: true,
            channelSettings
        });

        if (decision?.reaction && ALLOWED_REACTIONS.has(decision.reaction)) {
            try {
                await ctx.telegram.setMessageReaction(ctx.chat.id, msg.message_id, [{ type: 'emoji', emoji: decision.reaction }]);
            } catch {
                // Ignore reaction API errors
            }
        }

        if (decision?.reply) {
            const replyText = cleanResponseText(decision.reply).replace(/\|\|\|/g, '\n\n');
            const guestQueryId = msg.guest_query_id || ctx.update?.guest_query?.id;
            if (guestQueryId && bot.telegram?.callApi) {
                await bot.telegram.callApi('answerGuestQuery', {
                    guest_query_id: guestQueryId,
                    text: replyText
                }).catch(gqErr => {
                    console.warn('[ANSWER GUEST QUERY WARNING]:', gqErr.message);
                });
            }
            await ctx.reply(replyText, {
                reply_parameters: { message_id: msg.message_id }
            }).catch(async () => {
                await ctx.reply(replyText, { reply_to_message_id: msg.message_id }).catch(() => {});
            });
            return true;
        }
    } catch (err) {
        console.error('[GROUP MENTION ERROR]:', err.message);
    }

    return false;
}

