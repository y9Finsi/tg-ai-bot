import { Queue, Worker } from 'bullmq';
import { generateResponse, generateAiInitiativeResponse } from './ai.js';
import {
    decrementFreeRequest, appendConversationEvent, updateConversationEventStatus, refundReservedRequest,
    getUser, getActiveMute, getCompletedEvent, getLatestMeaningfulEvent, getInitiativeDailyCounts,
    hasInitiativeStage, getLeraContent, wasContentSent, recordPhotoSent, getChatHistoryClearedAt,
    toLocalDateString, setBlockStatus
} from './database.js';
import { splitResponseMessages } from './utils/response_text.js';
import { sendCatalogContent } from './content_service.js';
import { sendTypingAction, stopTyping } from './typing_manager.js';
import { getRoutingSettings } from './ai/intent_router.js';
import { getEffectiveInitiativeLimit } from './initiative_service.js';

// Парсим URL из .env и жестко задаем IPv4 (family: 4)
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port, 10) || 6379,
    family: 4 // Спасает от ошибки EAI_AGAIN в Docker
};

export const aiQueue = new Queue('ai-requests', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
    }
});
let aiWorker = null;
const userJobLanes = new Map();

function runUserJob(userId, task) {
    const key = String(userId);
    const previous = userJobLanes.get(key) || Promise.resolve();
    const current = previous.catch(() => null).then(task);
    userJobLanes.set(key, current);
    return current.finally(() => {
        if (userJobLanes.get(key) === current) {
            userJobLanes.delete(key);
        }
    });
}

async function safeSendMessage(telegram, chatId, text, options = { parse_mode: 'Markdown' }) {
    try {
        return await telegram.sendMessage(chatId, text, options);
    } catch {
        const fallback = { ...options };
        delete fallback.parse_mode;
        return telegram.sendMessage(chatId, text, fallback);
    }
}

async function sendTextLadder(bot, chatId, text, tempMsgId = null, finalOptions = { parse_mode: 'Markdown' }) {
    let messages = splitResponseMessages(text);
    if (messages.length === 0 || messages.length > 10) messages = [text || '...'];
    const firstOptions = messages.length === 1 ? finalOptions : { parse_mode: 'Markdown' };
    if (tempMsgId) {
        try {
            await bot.telegram.editMessageText(chatId, tempMsgId, null, messages[0], firstOptions);
        } catch {
            await safeSendMessage(bot.telegram, chatId, messages[0], firstOptions);
        }
    } else {
        await safeSendMessage(bot.telegram, chatId, messages[0], firstOptions);
    }
    for (const message of messages.slice(1)) {
        void sendTypingAction(bot, chatId);
        await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(message.length * 35, 500), 1600)));
        await safeSendMessage(bot.telegram, chatId, message, { parse_mode: 'Markdown' });
    }
    return messages;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendVoiceWithSimulation(bot, chatId, voiceObj, voiceText = '') {
    const voiceBuffer = voiceObj?.buffer || voiceObj?.source;
    if (!voiceObj || !voiceBuffer) return null;

    try {
        // Сразу включаем статус записи голосового в Telegram
        await bot.telegram.sendChatAction(chatId, 'record_voice').catch(() => {});

        // Короткая имитация записи пропорционально длине реплики (от 1.5 до 3.5 сек)
        const textLen = String(voiceText || '').length;
        const recordingMs = Math.min(Math.max(textLen * 35, 1500), 3500);
        await sleep(recordingMs);

        const voicePayload = { source: voiceBuffer, filename: voiceObj.filename || 'voice.ogg' };
        const sentVoiceMsg = await bot.telegram.sendVoice(chatId, voicePayload);
        return sentVoiceMsg;
    } catch (voiceSendErr) {
        console.error(`[TELEGRAM VOICE ERROR] Не удалось отправить голосовое юзеру ${chatId}:`, voiceSendErr.message);
        return null;
    }
}

async function enqueueContentDelivery(data) {
    await aiQueue.add('content-delivery', data, {
        jobId: `content-${data.userId}-${data.contentId}`,
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 }
    });
}

async function deliverContentOrRetry(bot, data) {
    try {
        await processContentDeliveryJob(bot, { data });
    } catch (error) {
        await enqueueContentDelivery(data);
        console.warn(`[CONTENT DELIVERY] queued retry for user ${data.userId}, content ${data.contentId}:`, error.message);
    }
}

async function processContentDeliveryJob(bot, job) {
    const { userId, chatId, contentId, source, anchorEventId, initiativeEventId = null } = job.data;
    if (await wasContentSent(userId, contentId)) return;
    const counts = await getInitiativeDailyCounts(userId);
    if (counts.content >= 3) return;
    const content = await getLeraContent(contentId);
    if (!content?.enabled) return;
    const sent = await sendCatalogContent(bot.telegram, chatId, content);
    await appendConversationEvent({
        userId,
        eventType: 'CONTENT',
        role: 'lera',
        content: content.description || content.url || '',
        occurredAt: new Date(),
        telegramMessageId: sent?.message_id || null,
        metadata: {
            content_id: Number(content.id),
            source,
            anchor_event_id: anchorEventId ? Number(anchorEventId) : null,
            initiative_event_id: initiativeEventId ? Number(initiativeEventId) : null,
            telegram_type: content.telegram_type
        },
        status: 'COMPLETED'
    });
}

async function processInitiativeJob(bot, job) {
    const { userId, chatId, anchorEventId, initiativeKind, contentCandidateIds = [] } = job.data;
    const isColdStart = initiativeKind === 'cold_start';
    const [user, mute, anchor, latest, counts, duplicate, routingSettings] = await Promise.all([
        getUser(userId),
        getActiveMute(userId),
        (anchorEventId && !isColdStart) ? getCompletedEvent(anchorEventId, userId) : Promise.resolve(null),
        getLatestMeaningfulEvent(userId),
        getInitiativeDailyCounts(userId),
        hasInitiativeStage(userId, anchorEventId || 0, initiativeKind),
        getRoutingSettings()
    ]);
    const initiativeLimit = getEffectiveInitiativeLimit(user, routingSettings);
    if (!user || user.is_blocked || mute || duplicate || counts.initiatives >= initiativeLimit) return;
    if (!isColdStart && !anchor) return;
    if (!isColdStart && latest?.role === 'user' && new Date(latest.occurred_at) > new Date(anchor.occurred_at)) return;
    if (!isColdStart && initiativeKind !== 'ignore_2' && Number(latest?.id) !== Number(anchorEventId)) return;
    const latestLocalDate = toLocalDateString(latest?.local_date);
    const todayMsk = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
    const hourMsk = Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        hourCycle: 'h23'
    }).format(new Date()));
    if (isColdStart && (hourMsk < 11 || hourMsk >= 21)) return;
    if (initiativeKind === 'new_day' && (latestLocalDate >= todayMsk || hourMsk < 9)) return;
    const anchorAgeSeconds = anchor ? (Date.now() - new Date(anchor.occurred_at).getTime()) / 1000 : 0;
    if (initiativeKind === 'open' && (anchorAgeSeconds < 300 || anchorAgeSeconds > 3600)) return;
    if (initiativeKind === 'ignore_1' && (anchorAgeSeconds < 300 || anchorAgeSeconds > 3600)) return;
    if (initiativeKind === 'ignore_2' && (anchorAgeSeconds < 7200 || anchorAgeSeconds >= 10800)) return;
    if (['content_4h', 'idle_4h'].includes(initiativeKind)) {
        if (anchorAgeSeconds < 14400) return;
        if (hourMsk < 11 || hourMsk >= 21) return;
    }
    if (['ignore_1', 'ignore_2'].includes(initiativeKind)) {
        if (anchorAgeSeconds >= 10800) return;
    }

    let candidates = [];
    if (!['ignore_1', 'ignore_2', 'new_day', 'idle_4h', 'cold_start'].includes(initiativeKind) && counts.content < 3) {
        const rows = await Promise.all(contentCandidateIds.map(id => getLeraContent(id)));
        candidates = rows.filter(item => item?.enabled && item.allow_initiative);
        const sentFlags = await Promise.all(candidates.map(item => wasContentSent(userId, item.id)));
        candidates = candidates.filter((_, index) => !sentFlags[index]);
    }
    if (initiativeKind === 'content_4h' && candidates.length === 0) return;

    const reason = initiativeKind === 'cold_start'
        ? 'написать первой и познакомиться / поинтересоваться как дела, без предыдущей истории переписки'
        : initiativeKind === 'open'
            ? 'естественно продолжить последний незакрытый диалог'
            : initiativeKind === 'new_day'
                ? 'наступил новый день, а вы сегодня ещё не общались'
            : initiativeKind === 'content_4h'
                ? 'после паузы самой поделиться контентом'
            : initiativeKind === 'idle_4h'
                ? 'после дневной паузы поинтересоваться как дела, связав со своим днем и прошлым разговором'
                : 'пользователь не ответил на реплику Леры';
    const response = await generateAiInitiativeResponse(userId, reason, {
        initiativeKind,
        anchorEventId: anchorEventId || null,
        contentCandidates: candidates
    });
    if (response?.blockedByJudge || !response?.text || response.text.startsWith('❌')) {
        console.warn(`[INITIATIVE SKIPPED] user ${userId}, kind ${initiativeKind}: отправка пропущена (blockedByJudge=${response?.blockedByJudge}, empty=${!response?.text})`);
        return;
    }
    if (initiativeKind === 'content_4h' && !response.contentId) {
        console.warn(`[INITIATIVE WARN] user ${userId}: AI did not select content for content_4h initiative, sending as plain text`);
    }
    try {
        await sendTextLadder(bot, chatId, response.text);

        // Отправка фото в инициативе
        if (response.photo) {
            await bot.telegram.sendChatAction(chatId, 'upload_photo').catch(() => {});
            const photoPayload = (response.photo && typeof response.photo === 'object' && response.photo.source)
                ? { source: response.photo.source, filename: response.photo.filename || 'photo.jpg' }
                : response.photo;
            const sentMsg = await bot.telegram.sendPhoto(chatId, photoPayload);
            const sentFileId = sentMsg?.photo?.at(-1)?.file_id || (typeof response.photo === 'string' ? response.photo : null);
            if (response.photoRecordId) {
                await recordPhotoSent(userId, response.photoRecordId).catch(() => {});
            }
            await appendConversationEvent({
                userId,
                eventType: 'PHOTO',
                role: 'lera',
                content: '',
                occurredAt: new Date(),
                metadata: { file_id: sentFileId || 'ai_generated_photo' },
                status: 'COMPLETED'
            }).catch(() => {});
        }

        // Отправка голосового сообщения в инициативе с имитацией записи
        if (response.voice) {
            await sendVoiceWithSimulation(bot, chatId, response.voice, response.voiceText || response.text);
        }
    } catch (sendErr) {
        if (sendErr.response?.error_code === 403 || sendErr.message?.includes('bot was blocked') || sendErr.message?.includes('user is deactivated') || sendErr.message?.includes('chat not found')) {
            console.warn(`[INITIATIVE BLOCKED] User ${userId} blocked the bot or chat unavailable, marking is_blocked=true`);
            await setBlockStatus(userId, true).catch(() => {});
            return;
        }
        throw sendErr;
    }

    const initiativeEvent = await appendConversationEvent({
        userId,
        eventType: 'INITIATIVE',
        role: 'lera',
        content: response.text,
        occurredAt: new Date(),
        metadata: { kind: initiativeKind, anchor_event_id: Number(anchorEventId), stage: initiativeKind },
        status: 'COMPLETED'
    });
    if (response.contentId) {
        await deliverContentOrRetry(bot, {
            userId, chatId, contentId: response.contentId, source: 'initiative',
            anchorEventId, initiativeEventId: initiativeEvent.id
        });
    }
}

async function processTestInitiativeJob(bot, job) {
    const { userId, chatId } = job.data;
    const user = await getUser(userId);
    if (!user || user.is_blocked) return;

    const response = await generateAiInitiativeResponse(
        userId,
        'администратор вручную запросил тест инициативы',
        { initiativeKind: 'admin_test' }
    );
    if (!response?.text) throw new Error('AI returned empty test initiative');

    await sendTextLadder(bot, chatId, response.text);
}

async function processAiJob(bot, job) {
        const { userId, text, chatId, shouldDecrement, reservedResource = null, tempMsgId, eventIds = [], batchId = null, firstMessageAt = null, preMessageGapSeconds = null, reactionMessageId = null } = job.data;
        const historyClearedAtBeforeGeneration = await getChatHistoryClearedAt(userId);
        let reservationRefunded = false;
        const refundReservation = async () => {
            if (!reservedResource || reservationRefunded) return;
            reservationRefunded = true;
            await refundReservedRequest(userId, reservedResource).catch(() => null);
        };
        const markInputEvents = async (status, errorText = null) => {
            await Promise.all(eventIds.map(eventId => updateConversationEventStatus(eventId, status, errorText).catch(() => null)));
        };
        let response = null;
        const saveLeraEvent = async (content, eventType = 'MESSAGE', metadata = {}) => {
            await appendConversationEvent({
                userId,
                eventType,
                role: 'lera',
                content,
                occurredAt: new Date(),
                batchId,
                metadata: {
                    ...metadata,
                    mode: response?.routingMode || metadata?.mode || 'CASUAL',
                    climax_stage: response?.climaxState?.stage || null,
                    arousal: response?.climaxState?.arousal ?? null,
                    climax_turns: response?.climaxState?.turns ?? null,
                    state_snapshot: response?.debugInfo?.state_snapshot || job.data.state_snapshot || {},
                    memory_used: response?.debugInfo?.memory_used || job.data.memory_used || {},
                    raw_prompt: response?.debugInfo?.rawPrompt || job.data.raw_prompt || '',
                    raw_response: response?.debugInfo?.rawText || content
                },
                status: 'COMPLETED'
            }).catch(error => console.error(`[CONVERSATION OUT EVENT ERROR] user ${userId}:`, error.message));
        };
        try {
            response = await generateResponse(userId, text, { batchId, eventIds, firstMessageAt, preMessageGapSeconds, photoUrls: job.data.photoUrls || [] });
            const historyClearedAtAfterGeneration = await getChatHistoryClearedAt(userId);
            if (String(historyClearedAtBeforeGeneration || '') !== String(historyClearedAtAfterGeneration || '')) {
                await refundReservation();
                if (tempMsgId) await bot.telegram.deleteMessage(chatId, tempMsgId).catch(() => {});
                return;
            }

            if (!response) {
                const attempts = Number(job.opts?.attempts || 1);
                if (Number(job.attemptsMade || 0) < attempts - 1) throw new Error('AI returned empty response');
                await refundReservation();
                const errMsg = "❌ _Ошибка генерации ответа. Попробуй ещё раз._";
                if (tempMsgId) {
                    await bot.telegram.editMessageText(chatId, tempMsgId, null, errMsg, { parse_mode: 'Markdown' }).catch(() => {});
                } else {
                    await bot.telegram.sendMessage(chatId, errMsg, { parse_mode: 'Markdown' });
                }
                await markInputEvents('FAILED', 'AI returned empty response');
                return;
            }

            if (response.reactionRequested) {
                if (!response.reactionEmoji || !reactionMessageId) {
                    await refundReservation();
                    if (tempMsgId) await bot.telegram.deleteMessage(chatId, tempMsgId).catch(() => {});
                    await markInputEvents('FAILED', !response.reactionEmoji
                        ? 'Classifier requested REACTION without a valid emoji'
                        : 'Classifier requested REACTION without a target message');
                    console.error(`[REACTION ERROR] user ${userId}: missing ${!response.reactionEmoji ? 'emoji' : 'target message'}`);
                    return;
                }
                try {
                    await bot.telegram.setMessageReaction(chatId, reactionMessageId, [{
                        type: 'emoji',
                        emoji: response.reactionEmoji
                    }]);
                    await refundReservation();
                    await saveLeraEvent(response.reactionEmoji, 'REACTION', {
                        emoji: response.reactionEmoji,
                        target_telegram_message_id: reactionMessageId,
                        routing_mode: 'REACTION'
                    });
                    await markInputEvents('COMPLETED');
                    return;
                } catch (reactionError) {
                    console.warn(`[REACTION FALLBACK] user ${userId}: Telegram reaction "${response.reactionEmoji}" failed (${reactionError.message}). Fallback to text...`);
                    response = await generateResponse(userId, text, {
                        batchId,
                        eventIds,
                        firstMessageAt,
                        preMessageGapSeconds,
                        photoUrls: job.data.photoUrls || [],
                        forceText: true
                    });
                }
            }

            if (reservedResource === 'image' && !response.photo) {
                await refundReservation();
            }
            
            // ЕСЛИ ЕСТЬ ФОТО - сначала редактируем временное сообщение на текстовую фразу Леры ("ща пришлю..."),
            // а затем ОТДЕЛЬНЫМ следующим сообщением присылаем саму картинку!
            if (shouldDecrement && !reservedResource) await decrementFreeRequest(userId);

            if (response.photo) {
                try {
                    const textParts = splitResponseMessages(response.text);
                    if (textParts.length > 0) {
                        if (tempMsgId) {
                            await bot.telegram.editMessageText(chatId, tempMsgId, null, textParts[0], { parse_mode: 'Markdown' })
                                .catch(async () => {
                                    await bot.telegram.sendMessage(chatId, textParts[0], { parse_mode: 'Markdown' });
                                });
                        } else {
                            await bot.telegram.sendMessage(chatId, textParts[0], { parse_mode: 'Markdown' });
                        }
                        for (const part of textParts.slice(1)) {
                            await sendTypingAction(bot, chatId);
                            await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(part.length * 35, 500), 1600)));
                            await bot.telegram.sendMessage(chatId, part, { parse_mode: 'Markdown' });
                        }
                        await saveLeraEvent(response.text, 'MESSAGE', {
                            has_photo: true,
                            message_count: textParts.length
                        });
                    } else if (tempMsgId) {
                        await bot.telegram.deleteMessage(chatId, tempMsgId).catch(() => {});
                    }

                    // Статус "загружает фото..." в Telegram перед отправкой картинки
                    await bot.telegram.sendChatAction(chatId, 'upload_photo').catch(() => {});

                    // Формируем полезную нагрузку: либо file_id строка, либо InputFile объект с filename
                    const photoPayload = (response.photo && typeof response.photo === 'object' && response.photo.source)
                        ? { source: response.photo.source, filename: response.photo.filename || 'photo.jpg' }
                        : response.photo;

                    // Отдельное второе сообщение — сама картинка (без подписи)
                    const sentMsg = await bot.telegram.sendPhoto(chatId, photoPayload);
                    const sentFileId = sentMsg?.photo?.at(-1)?.file_id || (typeof response.photo === 'string' ? response.photo : null);

                    if (response.photoRecordId) {
                        await recordPhotoSent(userId, response.photoRecordId)
                            .catch(error => console.error(`[PHOTO HISTORY ERROR] user ${userId}:`, error.message));
                    }
                    await saveLeraEvent('', 'PHOTO', { file_id: sentFileId || 'ai_generated_photo' });
                } catch (imgError) {
                    await refundReservation();
                    console.error(`[TELEGRAM ERROR] Не удалось отправить фото юзеру ${userId}:`, imgError.message);
                    const fallbackText = (response.text || "") + "\n\n❌ _Фото сгенерировано, но Telegram отказался его загружать._";
                    if (tempMsgId) {
                        await bot.telegram.editMessageText(chatId, tempMsgId, null, fallbackText, { parse_mode: 'Markdown' }).catch(() => {});
                    } else {
                        await bot.telegram.sendMessage(chatId, fallbackText, { parse_mode: 'Markdown' });
                    }
                    await markInputEvents('COMPLETED', imgError.message);
                }
            } else {
                const extraOptions = { parse_mode: 'Markdown' };
                if (response.showBuyButton) {
                    extraOptions.reply_markup = {
                        inline_keyboard: [[{ text: '⭐️ Перейти в магазин', callback_data: 'trigger_buy' }]]
                    };
                }

                const safeSendMessage = async (text, options) => {
                    try {
                        return await bot.telegram.sendMessage(chatId, text, options);
                    } catch (e) {
                        const noMdOptions = { ...options };
                        delete noMdOptions.parse_mode;
                        return await bot.telegram.sendMessage(chatId, text, noMdOptions);
                    }
                };

                const safeEditMessage = async (msgId, text, options) => {
                    try {
                        return await bot.telegram.editMessageText(chatId, msgId, null, text, options);
                    } catch (e) {
                        const noMdOptions = { ...options };
                        delete noMdOptions.parse_mode;
                        return await bot.telegram.editMessageText(chatId, msgId, null, text, noMdOptions);
                    }
                };

                const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                if (!response.text && response.voice) {
                    // Чисто голосовой ответ: удаляем временное сообщение-плейсхолдер
                    if (tempMsgId) {
                        await bot.telegram.deleteMessage(chatId, tempMsgId).catch(() => {});
                    }
                } else if (response.text) {
                    let messages = splitResponseMessages(response.text);
                    if (messages.length === 0 || messages.length > 10) {
                        messages = [response.text || "..."];
                    }

                    // 1. Первое сообщение — редактируем временное (или отправляем заново)
                    const firstMsg = messages[0];
                    const firstOptions = messages.length === 1 ? extraOptions : { parse_mode: 'Markdown' };

                    if (tempMsgId) {
                        await safeEditMessage(tempMsgId, firstMsg, firstOptions)
                            .catch(async () => {
                                await safeSendMessage(firstMsg, firstOptions);
                            });
                    } else {
                        await safeSendMessage(firstMsg, firstOptions);
                    }

                    // 2. Последующие сообщения "лесенкой" с реальной имитацией набора текста
                    for (let i = 1; i < messages.length; i++) {
                        const msg = messages[i];
                        const delay = Math.min(Math.max(msg.length * 35, 500), 1600);
                        void sendTypingAction(bot, chatId);
                        await sleep(delay);

                        const isLast = (i === messages.length - 1);
                        const currentOptions = isLast ? extraOptions : { parse_mode: 'Markdown' };
                        await safeSendMessage(msg, currentOptions);
                    }
                    await saveLeraEvent(response.text, 'MESSAGE', { message_count: messages.length });
                }
            }

            // Отправка голосового сообщения с имитацией записи
            if (response.voice) {
                const sentVoiceMsg = await sendVoiceWithSimulation(bot, chatId, response.voice, response.voiceText || response.text);
                const sentVoiceFileId = sentVoiceMsg?.voice?.file_id || 'ai_generated_voice';
                const spokenVoiceText = response.voiceText || response.voice.text || '';
                const eventContent = spokenVoiceText ? `[Лера отправила голосовое сообщение: "${spokenVoiceText}"]` : '[Лера отправила голосовое сообщение]';
                await saveLeraEvent(eventContent, 'VOICE', { file_id: sentVoiceFileId, text: spokenVoiceText });
            }

            if (response.contentId) {
                await deliverContentOrRetry(bot, {
                    userId,
                    chatId,
                    contentId: response.contentId,
                    source: 'dialogue',
                    anchorEventId: eventIds.at(-1) || null
                });
            }

            await markInputEvents('COMPLETED');


        } catch (error) {
            const errMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
            console.error(`[ОШИБКА ИИ] Юзер ${userId}: ${errMsg}`, error?.stack || '');
            const attempts = Number(job.opts?.attempts || 1);
            if (Number(job.attemptsMade || 0) < attempts - 1) {
                throw error;
            }
            await refundReservation();
            const errorMsg = "❌ _Извините, произошла ошибка генерации ответа._";
            if (tempMsgId) {
                await bot.telegram.editMessageText(chatId, tempMsgId, null, errorMsg, { parse_mode: 'Markdown' }).catch(() => {});
            } else {
                await bot.telegram.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
            }
            await markInputEvents('FAILED', errMsg);
        } finally {
            stopTyping(chatId, batchId);
        }
}

export function startWorker(bot) {
    if (aiWorker) return aiWorker;
    aiWorker = new Worker('ai-requests', job => runUserJob(
        job.data.userId,
        () => job.name === 'initiative'
            ? processInitiativeJob(bot, job)
            : job.name === 'initiative-test'
                ? processTestInitiativeJob(bot, job)
            : job.name === 'content-delivery'
                ? processContentDeliveryJob(bot, job)
                : processAiJob(bot, job)
    ), {
        connection,
        concurrency: 5,
        lockDuration: 120000,
        stalledInterval: 30000
    });
    return aiWorker;
}

export async function stopWorker() {
    if (aiWorker) await aiWorker.close();
    aiWorker = null;
}

export async function enqueueTestInitiative(userId) {
    const chatId = Number(userId);
    if (!chatId) throw new Error('Не указан Telegram user_id для тестовой инициативы');

    await aiQueue.add('initiative-test', {
        userId: chatId,
        chatId
    }, {
        jobId: `initiative-test-${chatId}-${Date.now()}`,
        priority: 1
    });
}
