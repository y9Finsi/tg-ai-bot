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
            ,content_id: { type: 'integer', description: 'Точный ID материала из банка.' }
        }
    },
    timeoutMs: 5000,
    config: {},

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        const category = String(args.category || 'any').toLowerCase();
        const searchKeywords = String(args.query || '').trim().toLowerCase();
        const exactContentId = args.content_id ? Number(args.content_id) : null;

        try {
            // Базовая выборка неотправленного контента
            let sql = `
                SELECT c.* FROM lera_content c
                WHERE c.enabled = TRUE AND c.allow_in_dialogue = TRUE
            `;
            const params = [];
            if (exactContentId) { params.push(exactContentId); sql += ' AND c.id = $' + params.length; }

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
            if (candidates.length === 0 && !exactContentId) {
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

            // Скоринг кандидатов
            let recentUsageMap = new Map();
            if (userId) {
                try {
                    const usageRes = await query(
                        `SELECT content_id, MAX(used_at) AS last_used
                         FROM content_usage
                         WHERE user_id = $1
                         GROUP BY content_id`,
                        [userId]
                    );
                    for (const row of usageRes.rows) {
                        recentUsageMap.set(Number(row.content_id), new Date(row.last_used).getTime());
                    }
                } catch {
                    // ignore if content_usage not available
                }
            }

            const scoredCandidates = candidates.map(c => {
                let score = 50;
                const desc = String(c.description || '').toLowerCase();
                const url = String(c.url || '').toLowerCase();
                const combined = `${desc} ${url}`;

                // Совпадение по категории (+30)
                if (category === 'hentai' && (/хентай|манга|telegra\.ph|18\+|хентыч|коносуб/i.test(combined))) score += 30;
                if (category === 'music' && (/music\.yandex|трек|песн|битлз|музык|саундтрек|рок/i.test(combined))) score += 30;
                if (category === 'meme' && (c.telegram_type === 'animation' || /мем|гифк|котик|ржач/i.test(combined))) score += 30;
                if (category === 'video' && (/youtube|shorts|видос|видео/i.test(combined) || /youtube\.com|youtu\.be/i.test(url))) score += 30;

                // Совпадение ключевых слов (+30)
                if (searchKeywords && combined.includes(searchKeywords)) {
                    score += 30;
                }

                // Новизна created_at (+10)
                if (c.created_at) {
                    const ageDays = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
                    if (ageDays < 7) score += 10;
                    if (ageDays < 2) score += 5;
                }

                // Штраф за недавнюю отправку (-50)
                const lastUsedTime = recentUsageMap.get(Number(c.id));
                if (lastUsedTime) {
                    const daysSinceUse = (Date.now() - lastUsedTime) / (1000 * 60 * 60 * 24);
                    if (daysSinceUse < 7) score -= 50;
                    else if (daysSinceUse < 30) score -= 20;
                }

                // Бонус за высокий интерес (+10)
                if (c.allow_initiative) score += 10;

                return { item: c, score };
            });

            scoredCandidates.sort((a, b) => b.score - a.score);
            const topScore = scoredCandidates[0].score;
            const topCandidates = scoredCandidates.filter(c => c.score === topScore);
            const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)].item;

            // Фиксация использования контента
            if (chosen?.id) {
                try {
                    await query(
                        `INSERT INTO content_usage (content_id, user_id, surface, result)
                         VALUES ($1, $2, $3, $4)`,
                        [Number(chosen.id), userId ? Number(userId) : null, 'dialogue', 'SUCCESS']
                    );
                } catch (uErr) {
                    console.warn('[SEND_CONTENT USAGE RECORD WARN]:', uErr.message);
                }
            }
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
