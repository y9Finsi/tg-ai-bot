/**
 * RADIANT Plugin: record_friend
 * Запоминание друга или знакомого по явному указанию пользователя
 */

import { addSocialEdge, normalizeTargetInput } from '../../../services/social_resolver.js';
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

        // Проверяем, есть ли пользователь в таблице users или group_participants по username
        let friendUserId = null;
        let friendUsername = rawTarget.startsWith('@') ? clean : null;
        let friendFirstName = null;

        try {
            const userRes = await query(`
                SELECT telegram_id, username, first_name
                FROM users
                WHERE LOWER(username) = LOWER($1) OR LOWER(first_name) = LOWER($1)
                LIMIT 1
            `, [clean]);

            if (userRes.rows.length > 0) {
                friendUserId = userRes.rows[0].telegram_id;
                friendUsername = userRes.rows[0].username || friendUsername;
                friendFirstName = userRes.rows[0].first_name;
            } else {
                // Проверяем общих участников групп
                const gpRes = await query(`
                    SELECT user_id, username, first_name
                    FROM group_participants
                    WHERE LOWER(username) = LOWER($1) OR LOWER(first_name) = LOWER($1)
                    LIMIT 1
                `, [clean]);
                if (gpRes.rows.length > 0) {
                    friendUserId = gpRes.rows[0].user_id;
                    friendUsername = gpRes.rows[0].username || friendUsername;
                    friendFirstName = gpRes.rows[0].first_name;
                }
            }
        } catch (dbErr) {
            console.warn('[RECORD FRIEND DB ERROR]:', dbErr.message);
        }

        try {
            await addSocialEdge({
                userId,
                friendUserId,
                friendUsername,
                friendFirstName: friendFirstName || clean,
                relationSource: 'explicit'
            });

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
