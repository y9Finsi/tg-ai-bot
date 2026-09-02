/**
 * RADIANT Plugin: schedule_followup
 * Планирует отложенное возвращение в диалог / выполнение обещания Леры
 * через очередь BullMQ в Redis.
 */

import { enqueueFollowupPromise } from '../../../queue.js';
import { getUser } from '../../../database.js';

export const scheduleFollowupAction = {
    name: 'schedule_followup',
    title: 'Запланировать отложенное возвращение / обещание',
    description: 'Планирует отложенное сообщение собеседнику через указанное количество минут, когда ты обещаешь сделать действие и вернуться (заварить кофе, доехать до работы/шоурума, выйти из душа, найти мем/трек, скинуть лук). В публичных группах сообщение автоматически запланируется в ЛС пользователю. Вызывай ТОЛЬКО при реальном обещании в диалоге.',
    inputSchema: {
        type: 'object',
        properties: {
            delay_minutes: {
                type: 'integer',
                minimum: 3,
                maximum: 360,
                description: 'Через сколько минут вернуться собеседнику (обычно 10–30 минут).'
            },
            topic: {
                type: 'string',
                description: 'Что именно ты пошла делать и о чём напишешь (например: "заварила дрип-кофе, показать фотку чашки и рассказать как на вкус", "доехала до работы, рассказать про давку в метро", "вышла из душа, спросить че делает").'
            },
            send_photo: {
                type: 'boolean',
                description: 'Планируешь ли прислать фото по завершении действия (например: фото чашки кофе, селфи в новом луке, вид за окном, рабочий стол). По умолчанию false.'
            }
        },
        required: ['delay_minutes', 'topic']
    },
    timeoutMs: 10000,
    config: {},

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

        const delayMinutes = Math.min(Math.max(parseInt(args.delay_minutes, 10) || 15, 3), 360);
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
