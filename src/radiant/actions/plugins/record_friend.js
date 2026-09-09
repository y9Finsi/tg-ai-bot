/**
 * RADIANT Plugin: record_friend
 * Запоминание друга или знакомого по явному указанию пользователя
 */

import { addSocialEdge, normalizeTargetInput, getTargetNameVariants } from '../../../services/social_resolver.js';
import { query } from '../../../db/database.js';

export const recordFriendAction = {
    name: 'record_friend',
    title: 'Запомнить друга или знакомого',
    description: 'Запоминает человека как друга или знакомого пользователя в социальном графе. Вызывай, когда пользователь говорит: «@username мой друг», «Ютя моя подруга», «запомни, что @tag мой кореш», «мы с @username друзья».',
    inputSchema: {
        type: 'object',
        properties: {
            target: {
                type: 'string',
                description: '@username или имя друга (например: "@yutya", "Ютя", "@bogdan").'
            },
            relation: {
                type: 'string',
                description: 'Кем приходится (например: "друг", "подруга", "кореш", "коллега", "краш").'
            }
        },
        required: ['target']
    },
    timeoutMs: 5000,
    config: { cacheTtlSeconds: 0 },

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        if (!userId) {
            return {
                status: 'error',
                error: { code: 'NO_USER', message: 'Не указан userId пользователя.' }
            };
        }

        const rawTarget = String(args.target || '').trim();
        if (!rawTarget) {
            return {
                status: 'error',
                error: { code: 'EMPTY_TARGET', message: 'Не указан тег или имя друга.' }
            };
        }

        const clean = normalizeTargetInput(rawTarget);
        const relation = String(args.relation || 'друг').trim();
        const variants = getTargetNameVariants(rawTarget);

        // Проверяем, есть ли пользователь в таблице users или group_participants по username / имени
        let friendUserId = null;
        let friendUsername = rawTarget.startsWith('@') ? clean : null;
        let friendFirstName = null;

        try {
            // 1. Точный поиск по юзернейму или имени (включая транслит)
            const userRes = await query(`
                SELECT telegram_id, username, first_name
                FROM users
                WHERE (username IS NOT NULL AND LOWER(username) = ANY($1))
                   OR (first_name IS NOT NULL AND LOWER(first_name) = ANY($1))
                LIMIT 1
            `, [variants]);

            if (userRes.rows.length > 0) {
                friendUserId = userRes.rows[0].telegram_id;
                friendUsername = userRes.rows[0].username || friendUsername;
                friendFirstName = userRes.rows[0].first_name;
            }

            if (!friendUserId) {
                // 2. Ищем строго среди участников общих групп с текущим пользователем
                const gpRes = await query(`
                    SELECT gp.user_id, gp.username, gp.first_name
                    FROM group_participants gp
                    WHERE gp.chat_id IN (SELECT chat_id FROM group_participants WHERE user_id = $1)
                      AND gp.user_id != $1
                      AND (
                        (gp.username IS NOT NULL AND LOWER(gp.username) = ANY($2))
                        OR (gp.first_name IS NOT NULL AND LOWER(gp.first_name) = ANY($2))
                        OR EXISTS (SELECT 1 FROM unnest($2::text[]) v WHERE gp.first_name IS NOT NULL AND LOWER(gp.first_name) LIKE v || '%')
                      )
                    LIMIT 1
                `, [userId, variants]);

                if (gpRes.rows.length > 0) {
                    friendUserId = gpRes.rows[0].user_id;
                    friendUsername = gpRes.rows[0].username || friendUsername;
                    friendFirstName = gpRes.rows[0].first_name;
                }
            }
        } catch (dbErr) {
            console.warn('[RECORD FRIEND DB ERROR]:', dbErr.message);
        }

        if (!friendUserId) {
            return {
                status: 'error',
                error: {
                    code: 'FRIEND_NOT_FOUND',
                    message: `Я пока не нашла «${rawTarget}» в наших общих группах или по юзернейму. Спроси у пользователя его точный @username или предложи добавить меня в ваш общий чат, чтобы я могла его запомнить.`
                }
            };
        }

        try {
            const edge = await addSocialEdge({
                userId,
                friendUserId,
                friendUsername,
                friendFirstName: friendFirstName || clean,
                relationSource: 'explicit'
            });

            if (!edge) {
                return {
                    status: 'error',
                    error: { code: 'SAVE_FAILED', message: 'Не удалось привязать контакт в базе.' }
                };
            }

            const display = friendUsername ? `@${friendUsername}` : (friendFirstName || clean);
            return {
                status: 'success',
                data: {
                    text: `Запомнила, что ${display} твой ${relation}! Теперь я знаю, кто это, если ты о нем упомянешь. Ответь пользователю живо и в своем стиле (например: «о, записала себе)) буду знать»), без канцелярита.`,
                    friend: display,
                    relation
                }
            };
        } catch (err) {
            return {
                status: 'error',
                error: { code: 'SAVE_FAILED', message: `Не удалось сохранить друга: ${err.message}` }
            };
        }
    }
};
