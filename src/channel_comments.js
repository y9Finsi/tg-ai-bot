import {
    getUser,
    getUserMemories,
    getUserRelationship,
    getChannelPosterSettings,
    getOrderedAiProviders,
    getLeraProfile,
    getLeraProfileProjection
} from './database.js';
import { getOpenAIClientAndModel } from './ai.js';
import { getCachedOpenAIClient, logLlmTrace } from './ai/llm_client.js';
import { parseLlmJson } from './utils/robust_json.js';

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

export async function getCommenterContext(userId) {
    if (!userId) return { isKnown: false };
    try {
        const [user, memories, rel] = await Promise.all([
            getUser(userId),
            getUserMemories(userId).catch(() => []),
            getUserRelationship(userId).catch(() => null)
        ]);
        if (!user) return { isKnown: false };

        const name = user.first_name || user.username || 'друг';
        const facts = (memories || [])
            .map(m => m.fact)
            .filter(Boolean)
            .slice(0, 5);

        let relStatus = 'знакомый';
        if (rel && (rel.affection > 60 || rel.trust > 60)) relStatus = 'близкий друг';
        else if (rel && rel.irritation > 50) relStatus = 'вредный знакомый';

        return {
            isKnown: true,
            userId,
            name,
            relationshipStatus: relStatus,
            trust: rel?.trust ?? 50,
            affection: rel?.affection ?? 50,
            facts
        };
    } catch {
        return { isKnown: false };
    }
}

export async function generateCommentDecision({
    postText = '',
    commentText = '',
    commenter = { isKnown: false },
    isDirectMention = false,
    channelSettings = {}
} = {}) {
    const profile = await getLeraProfile();
    const leraPersona = getLeraProfileProjection(profile.profile, 'CHANNEL_COMMENT');

    let commenterContext = 'Собеседник: обычный подписчик канала. Отвечай дружелюбно, дерзко, с юмором и на «ты».';
    if (commenter.isKnown && channelSettings.recognize_users !== false) {
        const factsList = commenter.facts?.length
            ? `\nФакты из памяти: ${commenter.facts.join('; ')}`
            : '';
        commenterContext = `Ты лично знаешь этого подписчика из личной переписки!
Имя: ${commenter.name}
Статус отношений: ${commenter.relationshipStatus}${factsList}

ВАЖНОЕ ПРАВИЛО БЕЗОПАСНОСТИ:
Общайся с ним как со старым знакомым (можешь обратиться по имени, подколоть за привычки или вспомнить безобидный факт).
Но СТРОГО ЗАПРЕЩЕНО раскрывать интимные тайны, эротику или личные секреты в публичных комментариях.`;
    }

    const taskInstruction = isDirectMention
        ? 'Подписчик обратился напрямую к тебе (@упоминание или ответ на твой пост/сообщение). Текстовый ответ обязателен. При желании можешь также поставить реакцию-эмодзи.'
        : 'Это фоновый комментарий в обсуждении. Реши, хочешь ли ты поставить реакцию-эмодзи, написать короткий ответ или оставить без ответа.';

    const systemPrompt = `${leraPersona}

Ты находишься в комментариях под постом в своём Telegram-канале.
Исходный пост канала: "${postText || 'без текста'}"

${commenterContext}

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
                max_tokens: 180,
                temperature: 0.7
            });
            const rawResponse = result.choices[0]?.message?.content?.trim() || '';
            if (rawResponse) {
                await logLlmTrace({
                    userId: commenter.userId || 0,
                    kind: 'CHANNEL_COMMENT',
                    mode: 'comment_decision',
                    model: provider.model_name,
                    providerName: provider.name,
                    systemPrompt,
                    messages,
                    rawResponse,
                    usage: result.usage || {}
                });

                const parsed = parseLlmJson(rawResponse) || {};
                let cleanReaction = typeof parsed.reaction === 'string' ? parsed.reaction.trim() : null;
                if (cleanReaction && !ALLOWED_REACTIONS.has(cleanReaction)) {
                    // Normalize or fallback if model returned extra characters
                    const match = cleanReaction.match(/[\p{Extended_Pictographic}]/u);
                    cleanReaction = match && ALLOWED_REACTIONS.has(match[0]) ? match[0] : null;
                }

                let cleanReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : null;
                if (cleanReply) {
                    cleanReply = cleanReply
                        .replace(/^["'«»]+|["'«»]+$/g, '')
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/^[\s\-–—]+/gm, '')
                        .trim();
                }

                return {
                    reaction: cleanReaction || null,
                    reply: cleanReply || null,
                    reason: parsed.reason || ''
                };
            }
        } catch (error) {
            console.warn(`[CHANNEL COMMENTS] Provider ${provider.name} error:`, error.message);
        }
    }
    return { reaction: null, reply: null, reason: 'error' };
}

// Track recently commented posts to avoid spam
const postReplyCounts = new Map();

export async function handleChannelDiscussionMessage(bot, ctx) {
    const msg = ctx.message;
    if (!msg || !msg.text || !ctx.chat || ctx.chat.type !== 'supergroup') return false;

    const settings = await getChannelPosterSettings();
    if (!settings.comments_enabled) return false;

    // Check if this is a comment under a channel post or discussion thread
    const isReply = Boolean(msg.reply_to_message);
    const isChannelForward = msg.reply_to_message?.is_automatic_forward;
    const isBotTagged = msg.text.includes(`@${ctx.botInfo?.username}`);
    const isReplyToBot = msg.reply_to_message?.from?.id === ctx.botInfo?.id;

    if (!isReply && !isBotTagged && !isChannelForward) return false;

    const postText = isChannelForward
        ? (msg.reply_to_message.text || msg.reply_to_message.caption || '')
        : (msg.reply_to_message?.text || '');

    const rootMessageId = msg.message_thread_id || msg.reply_to_message?.message_id || msg.message_id;
    const currentRepliesOnPost = postReplyCounts.get(rootMessageId) || 0;

    const isDirectMention = isBotTagged || isReplyToBot;

    // For background comments, respect configured chances
    if (!isDirectMention) {
        if (currentRepliesOnPost >= 2) return false;
        const roll = Math.random() * 100;
        const maxChance = Math.max(settings.reaction_chance ?? 40, settings.comment_chance ?? 15);
        if (roll > maxChance) return false;
    }

    try {
        const commenter = await getCommenterContext(msg.from?.id);
        const decision = await generateCommentDecision({
            postText,
            commentText: msg.text,
            commenter,
            isDirectMention,
            channelSettings: settings
        });

        // 1. Emoji reaction if chosen
        if (decision.reaction) {
            try {
                await ctx.telegram.setMessageReaction(ctx.chat.id, msg.message_id, [{ type: 'emoji', emoji: decision.reaction }]);
            } catch (err) {
                // Ignore reaction API permission errors
            }
        }

        // 2. Text response if chosen
        if (decision.reply) {
            await ctx.reply(decision.reply, { reply_to_message_id: msg.message_id });
            postReplyCounts.set(rootMessageId, currentRepliesOnPost + 1);
            return true;
        }
    } catch (error) {
        console.error('[CHANNEL COMMENTS] Error handling discussion message:', error.message);
    }

    return false;
}
