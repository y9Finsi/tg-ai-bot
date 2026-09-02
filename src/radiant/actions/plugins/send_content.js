/**
 * RADIANT Plugin: send_content
 * Отправляет внешний контент из личных закладок Леры (хентай, манга, музыка, мемы, видео).
 */

import { query } from '../../../db/database.js';

export const sendContentAction = {
    name: 'send_content',
    title: 'Отправить контент из закладок',
    description: 'Отправляет внешний материал из твоих сохранённых закладок (хентай, манга, музыка, мем или видео). Вызывай ОБЯЗАТЕЛЬНО, когда собеседник просит скинуть хентай, трек, мем, видос («скинь хентыч», «покажи мем», «че за трек») или когда ты сама хочешь скинуть конкретный трек/материал.',
    inputSchema: {
        type: 'object',
        properties: {
            category: {
                type: 'string',
                enum: ['hentai', 'music', 'meme', 'video', 'any'],
                description: 'Категория контента: hentai (хентай, манга), music (треки, Яндекс.Музыка), meme (мемы, гифки), video (ютуб, шортсы), any (любой подходящий)'
            },
            query: {
                type: 'string',
                description: 'Ключевые слова для поиска в закладках (например: "программируемая девушка", "битлз", "котик", "рок")'
            }
        }
    },
    timeoutMs: 5000,
    config: {},

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        const category = String(args.category || 'any').toLowerCase();
        const searchKeywords = String(args.query || '').trim().toLowerCase();

        try {
            // Базовая выборка неотправленного контента
            let sql = `
                SELECT c.* FROM lera_content c
                WHERE c.enabled = TRUE AND c.allow_in_dialogue = TRUE
            `;
            const params = [];

            if (userId) {
                params.push(userId);
                sql += `
                    AND NOT EXISTS (
                        SELECT 1 FROM conversation_events e
                        WHERE e.user_id = $${params.length} AND e.event_type = 'CONTENT' AND e.status = 'COMPLETED'
                          AND e.metadata->>'content_id' = c.id::text
                    )
                `;
            }

            const candidatesRes = await query(sql, params);
            let candidates = candidatesRes.rows || [];

            // Если все материалы уже отправлялись, разрешаем повторную выборку
            if (candidates.length === 0) {
                const allRes = await query(`SELECT * FROM lera_content WHERE enabled = TRUE AND allow_in_dialogue = TRUE`);
                candidates = allRes.rows || [];
            }

            if (candidates.length === 0) {
                return {
                    status: 'error',
                    error: {
                        code: 'NO_CONTENT_IN_DB',
                        message: 'В базе пока нет сохранённого контента. Скажи собеседнику, что сейчас ничего подходящего под рукой нет.'
                    }
                };
            }

            // Фильтрация по категории
            if (category === 'hentai') {
                const hentaiItems = candidates.filter(c => /хентай|манга|telegra\.ph|18\+|хентыч|коносуб/i.test(c.description || '') || /telegra\.ph/i.test(c.url || ''));
                if (hentaiItems.length > 0) candidates = hentaiItems;
            } else if (category === 'music') {
                const musicItems = candidates.filter(c => /music\.yandex|трек|песн|битлз|музык|саундтрек|рок/i.test(c.description || '') || /music\.yandex/i.test(c.url || ''));
                if (musicItems.length > 0) candidates = musicItems;
            } else if (category === 'meme') {
                const memeItems = candidates.filter(c => c.telegram_type === 'animation' || /мем|гифк|котик|ржач/i.test(c.description || ''));
                if (memeItems.length > 0) candidates = memeItems;
            } else if (category === 'video') {
                const videoItems = candidates.filter(c => /youtube|shorts|видос|видео/i.test(c.description || '') || /youtube\.com|youtu\.be/i.test(c.url || ''));
                if (videoItems.length > 0) candidates = videoItems;
            }

            // Фильтрация по ключевым словам
            if (searchKeywords) {
                const keywordMatches = candidates.filter(c => {
                    const text = `${c.description || ''} ${c.url || ''}`.toLowerCase();
                    return text.includes(searchKeywords);
                });
                if (keywordMatches.length > 0) {
                    candidates = keywordMatches;
                }
            }

            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            return {
                status: 'success',
                data: {
                    content_id: Number(chosen.id),
                    title: chosen.description,
                    category,
                    url: chosen.url,
                    telegram_type: chosen.telegram_type,
                    telegram_file_id: chosen.telegram_file_id,
                    text: `Материал найден: «${chosen.description}» (URL: ${chosen.url || ''}). Бот отправит его в чат отдельным сообщением сразу после твоей реплики. Подведи к нему естественно в тексте.`
                }
            };
        } catch (err) {
            console.error('[SEND_CONTENT ACTION ERROR]:', err);
            return {
                status: 'error',
                error: {
                    code: 'CONTENT_SEARCH_ERROR',
                    message: `Ошибка поиска контента: ${err.message}`
                }
            };
        }
    }
};
