import { query, getActiveAiProvider } from '../db/database.js';
import { getCachedOpenAIClient, generateCompletion } from '../ai/llm_client.js';
import { webSearchAction } from '../radiant/actions/plugins/web_search.js';
import { scrapeAllActiveSources } from '../content/content_scraper.js';

/**
 * Парсинг и сбор свежих тем дня (СПб новости, факты дня, посты из ТГК)
 */
export async function harvestDailyTopics({ force = false } = {}) {
    console.log('[TOPIC HARVESTER] Запуск сбора тем дня...');
    const results = [];

    // 1. Подтягиваем свежие находки из Telegram-каналов скрапера
    let recentDiscoveries = [];
    try {
        if (force) {
            await scrapeAllActiveSources().catch(err => console.warn('[TOPIC HARVESTER] Scraper error:', err.message));
        }

        const discRes = await query(`
            SELECT cd.id, cd.title, cd.raw_text, cd.canonical_url, cd.category, cs.name as source_name
            FROM content_discoveries cd
            LEFT JOIN content_sources cs ON cs.id = cd.source_id
            WHERE cd.lifecycle_status IN ('DISCOVERED', 'SAVED')
              AND cd.created_at > NOW() - INTERVAL '24 hours'
            ORDER BY cd.id DESC
            LIMIT 15
        `);
        recentDiscoveries = discRes.rows || [];
    } catch (discErr) {
        console.warn('[TOPIC HARVESTER] Ошибка чтения content_discoveries:', discErr.message);
    }

    // 2. Делаем веб-поиск по актуальным событиям Петербурга
    let webNewsSnippet = '';
    try {
        const searchResult = await webSearchAction.execute({
            query: 'новости Санкт-Петербург сегодня события'
        });
        webNewsSnippet = String(searchResult?.data?.text || searchResult?.text || '').slice(0, 3000);
    } catch (searchErr) {
        console.warn('[TOPIC HARVESTER] Ошибка web_search:', searchErr.message);
    }

    // 3. Формируем контекст для LLM-редактора тем
    const discoveriesSnippet = recentDiscoveries.map(d => 
        `- [${d.source_name || 'ТГ-канал'}]: ${d.title || ''} (${d.canonical_url})\n  ${(d.raw_text || '').slice(0, 250)}`
    ).join('\n\n');

    const prompt = `Ты — редактор тем и контент-директор для персонажа Лера (19 лет, студентка СПбГИК, живёт в Санкт-Петербурге, подрабатывает в СММ).
Твоя задача: на основе свежих новостей Петербурга и постов из Telegram отобрать 3–5 САМЫХ СОЧНЫХ, ЖИВЫХ И АКТУАЛЬНЫХ ТЕМ на сегодня.

МЫ ИЩЕМ:
- Реальные факты дня (погода, шторм, перекрытие моста/метро, выборы, городские курьезы, события на Невском/Марсовом поле, праздники).
- Смешные или абсурдные посты/мемы из соцсетей, тренды, над которыми можно поугорать или повозмущаться.
- Житейские ситуации студентки в СПб (учёба, дедлайны клиентов, транспорт, кофейни).

СТРОГО ЗАПРЕЩЕНО:
- Сухие протокольные криминальные сводки или тяжелый негатив (ДТП с жертвами, жесть).
- Политические агитки (если выборы — то с бытовой стороны: буфет на участке, пирожки, странные плакаты на столбах).

ВОТ СВЕЖИЕ ДАННЫЕ ИЗ ПОИСКА И ТЕЛЕГРАМА:

[НОВОСТИ ИЗ ПОИСКА]:
${webNewsSnippet || 'Нет данных из поиска.'}

[СВЕЖИЕ ПОСТЫ ИЗ КАНАЛОВ]:
${discoveriesSnippet || 'Нет свежих постов.'}

Верни СТРОГО валидный JSON-массив из 3–5 объектов следующего формата:
[
  {
    "title": "Краткое цепкое название темы",
    "situation": "Подробная суть того, что произошло или что за новость/тренд (2-3 предложения, понятные для Леры)",
    "category": "fact_of_the_day",
    "source_url": "URL источника если есть или пустая строка",
    "source_type": "web_search",
    "expires_in_hours": 24
  }
]`;

    try {
        const raw = await generateCompletion(prompt, { temperature: 0.7 });
        const cleanJson = String(raw || '[]').replace(/^```json/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                if (!item.title || !item.situation) continue;
                const hours = Number(item.expires_in_hours) || 24;
                const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

                const existing = await query('SELECT id FROM content_topics WHERE title = $1 LIMIT 1', [item.title]);
                if (existing.rows[0]) continue;

                const inserted = await query(`
                    INSERT INTO content_topics (
                        title, situation, category, source_url, source_type,
                        status, expires_at, created_at
                    ) VALUES ($1, $2, $3, $4, $5, 'NEW', $6, NOW())
                    RETURNING *
                `, [
                    item.title.slice(0, 255),
                    item.situation,
                    item.category || 'spb_life',
                    item.source_url || null,
                    item.source_type || 'web_search',
                    expiresAt
                ]);

                results.push(inserted.rows[0]);
            }
        }
        console.log(`[TOPIC HARVESTER] Успешно сохранено новых тем: ${results.length}`);
    } catch (err) {
        console.error('[TOPIC HARVESTER ERROR]:', err.message);
    }

    return results;
}

/**
 * Получение активных тем для генерации постов или инициатив
 */
export async function getActiveTopics({ category = null, limit = 10 } = {}) {
    let sql = `
        SELECT ct.*, lc.telegram_type, lc.url as media_content_url, lc.description as media_description
        FROM content_topics ct
        LEFT JOIN lera_content lc ON lc.id = ct.media_id
        WHERE ct.status = 'NEW'
          AND (ct.expires_at IS NULL OR ct.expires_at > NOW())
    `;
    const params = [];
    if (category) {
        params.push(category);
        sql += ` AND ct.category = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY ct.id DESC LIMIT $${params.length}`;

    const res = await query(sql, params);
    return res.rows || [];
}

/**
 * Отметка темы как использованной
 */
export async function markTopicUsed(topicId, surface = 'channel') {
    await query(`
        UPDATE content_topics
        SET status = 'USED', used_at = NOW(), used_in_surface = $2
        WHERE id = $1
    `, [topicId, surface]);
}
