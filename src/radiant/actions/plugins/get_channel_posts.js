/**
 * RADIANT Plugin: get_channel_posts
 * Читает реальные опубликованные посты из личного Telegram-канала Леры.
 */

import { query } from '../../../db/database.js';

export const getChannelPostsAction = {
    name: 'get_channel_posts',
    title: 'Посмотреть посты в моём Telegram-канале',
    description: 'Возвращает реальные опубликованные посты из твоего личного ТГ-канала. Вызывай, когда пользователь спрашивает, что ты постила, о чём твой канал, просит рассказать подробнее о публикациях или когда нужно вспомнить свои недавние мысли из ТГК.',
    inputSchema: {
        type: 'object',
        properties: {
            limit: {
                type: 'integer',
                description: 'Количество последних постов (от 1 до 5, по умолчанию 3)'
            },
            query: {
                type: 'string',
                description: 'Поисковое слово или тема поста, если собеседник спрашивает про конкретный пост'
            }
        }
    },
    timeoutMs: 5000,
    config: {},

    async execute(args = {}, context = {}) {
        const limit = Math.min(5, Math.max(1, parseInt(args.limit, 10) || 3));
        const searchKeywords = String(args.query || '').trim().toLowerCase();

        try {
            let sql = `
                SELECT id, text, topic, created_at, provenance
                FROM channel_post_logs
                WHERE status = 'PUBLISHED'
            `;
            const params = [];

            if (searchKeywords) {
                const words = searchKeywords.split(/\s+/).filter(w => w.length >= 3);
                if (words.length > 0) {
                    const conditions = words.map(w => {
                        params.push(`%${w}%`);
                        return `(text ILIKE $${params.length} OR topic ILIKE $${params.length})`;
                    });
                    sql += ` AND (${conditions.join(' OR ')})`;
                } else {
                    params.push(`%${searchKeywords}%`);
                    sql += ` AND (text ILIKE $${params.length} OR topic ILIKE $${params.length})`;
                }
            }

            params.push(limit);
            sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

            const res = await query(sql, params);
            const rows = res.rows || [];

            if (rows.length === 0) {
                return {
                    status: 'success',
                    data: {
                        posts: [],
                        text: 'В канале пока нет постов по такому запросу.'
                    }
                };
            }

            const formatted = rows.map((post, idx) => {
                const date = new Date(post.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' });
                const cleanText = String(post.text || '').replace(/\n+/g, ' ').trim();
                return `${idx + 1}. [${date}] ${cleanText}`;
            }).join('\n');

            return {
                status: 'success',
                data: {
                    posts: rows,
                    text: `Реальные посты из твоего ТГ-канала:\n${formatted}\n\nИспользуй эти реальные посты в ответе, не выдумывай другие.`
                }
            };
        } catch (err) {
            console.error('[GET_CHANNEL_POSTS ACTION ERROR]:', err);
            return {
                status: 'error',
                error: {
                    code: 'DB_ERROR',
                    message: `Ошибка получения постов канала: ${err.message}`
                }
            };
        }
    }
};
