import { Queue, Worker } from 'bullmq';
import { generateResponse } from './ai.js';
import { decrementFreeRequest, appendConversationEvent, updateConversationEventStatus, refundReservedRequest } from './database.js';

// Парсим URL из .env и жестко задаем IPv4 (family: 4)
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port, 10) || 6379,
    family: 4 // Спасает от ошибки EAI_AGAIN в Docker
};

function splitResponseMessages(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    // Переносы строки — обычное форматирование одного сообщения, а не команда
    // отправить Лерину реплику несколькими пузырями. Дробление возможно только
    // по явному разделителю, который внутренний генератор ставит намеренно.
    let parts = raw.includes('|||')
        ? raw.split(/\s*\|\|\|\s*/).map(part => part.trim()).filter(Boolean)
        : [raw];
    if (parts.length > 4) parts = [parts.slice(0, 3).join(' '), parts.slice(3).join(' ')];
    return parts;
}

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

async function processAiJob(bot, job) {
        const { userId, text, chatId, shouldDecrement, reservedResource = null, tempMsgId, eventIds = [], batchId = null, firstMessageAt = null, preMessageGapSeconds = null } = job.data;
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
                    state_snapshot: response?.debugInfo?.state_snapshot || job.data.state_snapshot || {},
                    memory_used: response?.debugInfo?.memory_used || job.data.memory_used || {},
                    raw_prompt: response?.debugInfo?.rawPrompt || job.data.raw_prompt || '',
                    raw_response: response?.debugInfo?.rawText || content
                },
                status: 'COMPLETED'
            }).catch(error => console.error(`[CONVERSATION OUT EVENT ERROR] user ${userId}:`, error.message));
        };
        try {
            response = await generateResponse(userId, text, { batchId, eventIds, firstMessageAt, preMessageGapSeconds });

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
                        await saveLeraEvent(textParts[0], 'MESSAGE', { has_photo: true });
                        for (const part of textParts.slice(1)) {
                            await bot.telegram.sendChatAction(chatId, 'typing').catch(() => {});
                            await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(part.length * 35, 500), 1600)));
                            await bot.telegram.sendMessage(chatId, part, { parse_mode: 'Markdown' });
                            await saveLeraEvent(part, 'MESSAGE', { has_photo: true });
                        }
                    } else if (tempMsgId) {
                        await bot.telegram.deleteMessage(chatId, tempMsgId).catch(() => {});
                    }

                    // Статус "загружает фото..." в Telegram перед отправкой картинки
                    await bot.telegram.sendChatAction(chatId, 'upload_photo').catch(() => {});

                    // Отдельное второе сообщение — сама картинка (без подписи)
                    await bot.telegram.sendPhoto(chatId, response.photo);
                    await saveLeraEvent('', 'PHOTO', { file_id: response.photo });
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
                // Если фото нет, отправляем текст (поддержка отправки "лесенкой")
                const extraOptions = { parse_mode: 'Markdown' };
                
                if (response.showBuyButton) {
                    extraOptions.reply_markup = {
                        inline_keyboard: [[{ text: '⭐️ Перейти в магазин', callback_data: 'trigger_buy' }]]
                    };
                }

                // Вспомогательные функции для безопасной отправки (с фолбэком без Markdown)
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

                // Не режем обычный ответ по переносам или предложениям: иначе один
                // ответ модели выглядит как несколько её самостоятельных сообщений.
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
                await saveLeraEvent(firstMsg);

                // 2. Последующие сообщения "лесенкой" с реальной имитацией набора текста
                for (let i = 1; i < messages.length; i++) {
                    const msg = messages[i];
                    // Расчет паузы печати (500мс - 1600мс)
                    const delay = Math.min(Math.max(msg.length * 35, 500), 1600);

                    // Статус "печатает..." в Telegram отправляем асинхронно без блокировки потока
                    bot.telegram.sendChatAction(chatId, 'typing').catch(() => {});
                    await sleep(delay);

                    const isLast = (i === messages.length - 1);
                    const currentOptions = isLast ? extraOptions : { parse_mode: 'Markdown' };
                    await safeSendMessage(msg, currentOptions);
                    await saveLeraEvent(msg);
                }
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
        }
}

export function startWorker(bot) {
    if (aiWorker) return aiWorker;
    aiWorker = new Worker('ai-requests', job => runUserJob(
        job.data.userId,
        () => processAiJob(bot, job)
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
