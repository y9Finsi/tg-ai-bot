/**
 * RADIANT Plugin: schedule_followup
 * Планирует отложенное возвращение в диалог / выполнение обещания Леры
 * через очередь BullMQ в Redis.
 */

import { enqueueFollowupPromise } from '../../../queue.js';
import { getUser } from '../../../database.js';

export const scheduleFollowupAction = {
    name: 'schedule_followup',
    title: 'Запланировать отложенное возвращение / напоминание',
    description: 'Планирует отложенное сообщение или напоминание собеседнику через указанное количество минут (минимум 1 минута). Вызывай в двух случаях: 1) когда ты сама обещаешь сделать бытовое действие и вернуться/скинуть фото (заварить кофе, доехать до работы, выйти из душа, скинуть лук); 2) когда собеседник просит напомнить ему о чём-то («напомни через 5 минут написать пост», «пни меня через полчаса», «напомни написать Маше»). В публичных группах сообщение автоматически запланируется в ЛС пользователю.',
    inputSchema: {
        type: 'object',
        properties: {
            delay_minutes: {
                type: 'integer',
                minimum: 1,
                maximum: 360,
                description: 'Через сколько минут вернуться или напомнить собеседнику (в минутах, от 1 до 360).'
            },
            topic: {
                type: 'string',
                description: 'О чём именно будет отложенное сообщение или напоминание (например: "заварила дрип-кофе, показать фотку чашки", "напомнить собеседнику написать пост о новой фиче", "напомнить написать Маше").'
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

        const delayMinutes = Math.min(Math.max(parseInt(args.delay_minutes, 10) || 5, 1), 360);
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
