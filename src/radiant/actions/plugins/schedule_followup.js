/**
 * RADIANT Plugin: schedule_followup
 * Планирует отложенное возвращение в диалог / выполнение обещания Леры
 * через очередь BullMQ в Redis.
 */

import { enqueueFollowupPromise } from '../../../queue.js';
import { getUser } from '../../../database.js';

export const scheduleFollowupAction = {
    name: 'schedule_followup',
    title: 'Запланировать бытовое возвращение Леры',
    description: 'Планирует отложенное сообщение от лица Леры через указанное количество минут (от 1 до 2880 мин, то есть до 48 часов). Вызывай, когда ты сама обещаешь сделать бытовое действие и вернуться/скинуть фото (заварить кофе, доехать до работы, выйти из душа, скинуть лук). Для просьб пользователя («напомни мне через X») используй инструмент schedule_reminder.',
    inputSchema: {
        type: 'object',
        properties: {
            delay_minutes: {
                type: 'integer',
                minimum: 1,
                maximum: 2880,
                description: 'Через сколько минут вернуться собеседнику (в минутах, от 1 до 2880, максимум 48 часов).'
            },
            topic: {
                type: 'string',
                description: 'О чём именно будет отложенное сообщение (например: "заварила дрип-кофе, показать фотку чашки", "доехала до работы", "вышла из душа").'
            },
            send_photo: {
                type: 'boolean',
                description: 'Планируешь ли прислать фото по завершении действия (например: фото чашки кофе, селфи в новом луке, вид за окном). По умолчанию false.'
            }
        },
        required: ['delay_minutes', 'topic']
    },
    timeoutMs: 10000,
    config: { cacheTtlSeconds: 0 },

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        if (!userId) {
            return {
                status: 'error',
                error: { code: 'NO_USER', message: 'Не указан userId для отложенного обещания.' }
            };
        }

        const isPublic = Boolean(context.isPublicContext || context.currentContext?.isPublicContext);
        if (isPublic) {
            const user = await getUser(userId).catch(() => null);
            if (!user || user.is_blocked) {
                return {
                    status: 'error',
                    error: {
                        code: 'PM_NOT_STARTED',
                        message: 'Пользователь еще не писал тебе в личные сообщения (@gexyy_bot). Telegram запрещает боту писать первым в ЛС незнакомым людям. Скажи ему прямо в чате: пусть сначала напишет тебе в ЛС /start или привет, тогда ты сможешь скинуть/написать ему в личку.'
                    }
                };
            }
        }

        const delayMinutes = Math.min(Math.max(parseInt(args.delay_minutes, 10) || 5, 1), 2880);
        const topic = String(args.topic || '').trim();
        const sendPhoto = Boolean(args.send_photo);

        if (!topic) {
            return {
                status: 'error',
                error: { code: 'EMPTY_TOPIC', message: 'Не указана тема/действие отложенного обещания.' }
            };
        }

        try {
            await enqueueFollowupPromise(userId, userId, {
                delayMinutes,
                topic,
                sendPhoto,
                anchorEventId: context.anchorEventId || null
            });

            return {
                status: 'success',
                data: {
                    delay_minutes: delayMinutes,
                    topic,
                    send_photo: sendPhoto,
                    scheduled: true,
                    text: `Отложенное обещание запланировано: вернуться через ${delayMinutes} мин с темой "${topic}".`
                }
            };
        } catch (err) {
            console.error('[SCHEDULE_FOLLOWUP ERROR]:', err.message);
            return {
                status: 'error',
                error: { code: 'QUEUE_ERROR', message: `Ошибка планирования: ${err.message}` }
            };
        }
    }
};
