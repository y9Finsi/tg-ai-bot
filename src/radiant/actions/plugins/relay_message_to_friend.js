/**
 * RADIANT Plugin: relay_message_to_friend
 * Передача сообщения или просьбы общему знакомому/другу (Social Relay)
 */

import { resolveSocialTarget, createSocialRelay, enqueueSocialRelayDelivery } from '../../../services/social_resolver.js';
import { getUser } from '../../../db/database.js';

export const relayMessageToFriendAction = {
    name: 'relay_message_to_friend',
    title: 'Передать сообщение другу или общему знакомому',
    description: 'Передает сообщение, просьбу или привет общему знакомому (другу по общим группам, рефералу или по указанному @username). Вызывай, когда пользователь просит передать что-то другому человеку: «передай Богдану, что...», «черкани Юте...», «скажи @username...». Поддерживает задержку, чтобы выглядеть живо.',
    inputSchema: {
        type: 'object',
        properties: {
            target: {
                type: 'string',
                description: 'Имя человека или его @username (например: "Богдан", "Ютя", "@bogdan").'
            },
            message: {
                type: 'string',
                description: 'Текст или суть того, что нужно передать (например: "он краш", "пусть вернет худи", "напомни про курсач").'
            },
            delay_minutes: {
                type: 'integer',
                minimum: 1,
                maximum: 1440,
                description: 'Через сколько минут написать (по умолчанию 3-5 минут, чтобы выглядело естественно).'
            },
            vibe: {
                type: 'string',
                description: 'Тональность или вайб (например: "подкол", "комплимент", "напоминалка", "флирт").'
            }
        },
        required: ['target', 'message']
    },
    timeoutMs: 8000,
    config: { cacheTtlSeconds: 0 },

    async execute(args = {}, context = {}) {
        const senderId = context.userId;
        if (!senderId) {
            return {
                status: 'error',
                error: { code: 'NO_USER', message: 'Не указан senderId пользователя.' }
            };
        }

        const rawTarget = String(args.target || '').trim();
        const message = String(args.message || '').trim();

        if (!rawTarget) {
            return {
                status: 'error',
                error: { code: 'EMPTY_TARGET', message: 'Не указано имя или юзернейм получателя.' }
            };
        }

        if (!message) {
            return {
                status: 'error',
                error: { code: 'EMPTY_MESSAGE', message: 'Не указан текст сообщения для передачи.' }
            };
        }

        // Получаем имя отправителя
        const senderUser = await getUser(senderId).catch(() => null);
        const senderName = context.senderName || senderUser?.first_name || 'Твой друг';

        const resolution = await resolveSocialTarget(senderId, rawTarget);

        if (resolution.status === 'NOT_FOUND') {
            return {
                status: 'error',
                error: {
                    code: 'TARGET_NOT_FOUND',
                    message: `Я не нашла «${rawTarget}» среди ваших общих чатов и знакомых. Спроси у пользователя его точный @username или предложи добавить меня в ваш общий чат, чтобы я могла с ним связаться.`
                }
            };
        }

        if (resolution.status === 'AMBIGUOUS') {
            const list = resolution.candidates.map(c => c.name + (c.username ? ` (${c.username})` : '')).join(', ');
            return {
                status: 'error',
                error: {
                    code: 'AMBIGUOUS_TARGET',
                    message: `У тебя среди общих знакомых несколько людей с именем «${rawTarget}» (${list}). Переспроси у пользователя прямо, кому именно передать, или пусть скинет точный @username.`
                }
            };
        }

        if (resolution.status === 'BOT_NEVER_STARTED') {
            const name = resolution.candidate.firstName || rawTarget;
            const handle = resolution.candidate.username ? `@${resolution.candidate.username}` : '';
            return {
                status: 'error',
                error: {
                    code: 'BOT_NEVER_STARTED',
                    message: `Я знаю, кто такой ${name} ${handle}, но он еще ни разу не нажимал /start у меня в личке. По правилам Telegram бот не может написать первым незнакомому человеку. Скажи пользователю, пусть его друг сначала напишет мне хотя бы пару слов в ЛС.`
                }
            };
        }

        if (resolution.status !== 'RESOLVED' || !resolution.candidate?.userId) {
            return {
                status: 'error',
                error: { code: 'RESOLUTION_FAILED', message: 'Не удалось определить адресата.' }
            };
        }

        const target = resolution.candidate;
        if (String(target.userId) === String(senderId)) {
            return {
                status: 'error',
                error: {
                    code: 'SELF_RELAY',
                    message: 'Ты просишь меня передать сообщение самому себе) Если хочешь что-то записать для себя — лучше просто скажи мне запомнить это.'
                }
            };
        }
        const delayMinutes = Math.max(1, Math.min(1440, parseInt(args.delay_minutes, 10) || 3));

        try {
            const relay = await createSocialRelay({
                senderId,
                senderName,
                targetId: target.userId,
                targetName: target.firstName,
                message,
                vibeTag: args.vibe || null,
                delayMinutes
            });

            await enqueueSocialRelayDelivery({
                relayId: relay?.id,
                senderId,
                targetId: target.userId,
                senderName,
                targetName: target.firstName,
                message,
                vibeTag: args.vibe || null,
                delayMinutes
            });

            return {
                status: 'success',
                data: {
                    text: `Сообщение для ${target.firstName} принято! Я передам ему в личку примерно через ${delayMinutes} мин: «${message}». Ответь пользователю живо и в своем характере (например: «ахах ладно, ща черкану ему))»), не цитируя системные логи.`,
                    relayId: relay?.id,
                    targetName: target.firstName,
                    delayMinutes
                }
            };
        } catch (err) {
            return {
                status: 'error',
                error: { code: 'RELAY_CREATION_FAILED', message: `Ошибка создания передачи: ${err.message}` }
            };
        }
    }
};
