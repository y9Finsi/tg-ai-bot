/**
 * RADIANT Plugin: schedule_reminder
 * Планирует отложенное напоминание пользователю («напомни через 10 секунд/минут...»)
 * через очередь BullMQ в Redis. Поддерживает мульти-таймеры.
 */

import { enqueueUserReminder } from '../../../queue.js';
import { getUser } from '../../../database.js';

export const scheduleReminderAction = {
    name: 'schedule_reminder',
    title: 'Запланировать напоминание пользователю',
    description: 'Планирует напоминание пользователю через указанное количество секунд или минут (например: «напомни через 10 секунд написать Маше», «пни меня через 15 минут», «напомни завтра утром»). Поддерживает несколько независимых напоминаний одновременно. В публичных группах напоминание автоматически приходит в ЛС пользователю.',
    inputSchema: {
        type: 'object',
        properties: {
            delay_seconds: {
                type: 'integer',
                minimum: 10,
                maximum: 86400,
                description: 'Через сколько секунд прислать напоминание (от 10 до 86400 секунд). Используй для коротких интервалов («через 10 секунд», «через полминуты»).'
            },
            delay_minutes: {
                type: 'integer',
                minimum: 1,
                maximum: 1440,
                description: 'Через сколько минут прислать напоминание (от 1 до 1440 минут). Используй для минутных/часовых интервалов («через 5 минут», «через час»).'
            },
            reminder_text: {
                type: 'string',
                description: 'О чём именно нужно напомнить (например: "написать Маше про пост", "выпить таблетку", "проверить духовку").'
            }
        },
        required: ['reminder_text']
    },
    timeoutMs: 10000,
    config: { cacheTtlSeconds: 0 },

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        if (!userId) {
            return {
                status: 'error',
                error: { code: 'NO_USER', message: 'Не указан userId для напоминания.' }
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
                        message: 'Пользователь еще не писал тебе в личные сообщения (@gexyy_bot). Telegram запрещает боту писать первым в ЛС незнакомым людям. Скажи ему прямо в чате: пусть сначала напишет тебе в ЛС /start, тогда ты сможешь напомнить ему в личку.'
                    }
                };
            }
        }

        const reminderText = String(args.reminder_text || '').trim();
        if (!reminderText) {
            return {
                status: 'error',
                error: { code: 'EMPTY_REMINDER', message: 'Не указан текст напоминания.' }
            };
        }

        let delaySeconds = 60;
        if (args.delay_seconds !== undefined && args.delay_seconds !== null) {
            delaySeconds = Math.min(Math.max(parseInt(args.delay_seconds, 10) || 10, 10), 86400);
        } else if (args.delay_minutes !== undefined && args.delay_minutes !== null) {
            delaySeconds = Math.min(Math.max(parseInt(args.delay_minutes, 10) || 1, 1), 1440) * 60;
        }

        try {
            await enqueueUserReminder(userId, userId, {
                delaySeconds,
                reminderText,
                anchorEventId: context.anchorEventId || null
            });

            return {
                status: 'success',
                data: {
                    delay_seconds: delaySeconds,
                    reminder_text: reminderText,
                    scheduled: true,
                    text: `Напоминание запланировано через ${delaySeconds} сек: "${reminderText}".`
                }
            };
        } catch (err) {
            console.error('[SCHEDULE_REMINDER ERROR]:', err.message);
            return {
                status: 'error',
                error: { code: 'QUEUE_ERROR', message: `Ошибка планирования: ${err.message}` }
            };
        }
    }
};
