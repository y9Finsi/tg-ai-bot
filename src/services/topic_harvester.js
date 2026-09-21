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

    // 3. Подтягиваем ранее собранные темы за последние 7 дней для строгого исключения дубликатов
    let recentExistingTopics = [];
    try {
        const existRes = await query(`
            SELECT title FROM content_topics
            WHERE created_at > NOW() - INTERVAL '7 days'
            ORDER BY id DESC
            LIMIT 40
        `);
        recentExistingTopics = (existRes.rows || []).map(r => r.title.trim()).filter(Boolean);
    } catch (existErr) {
        console.warn('[TOPIC HARVESTER] Ошибка чтения существующих тем:', existErr.message);
    }

    const existingTopicsBlock = recentExistingTopics.length > 0
        ? `[УЖЕ ИСПОЛЬЗОВАННЫЕ ИЛИ СУЩЕСТВУЮЩИЕ ТЕМЫ (СТРОГО ЗАПРЕЩЕНО ПОВТОРЯТЬ ИЛИ ПЕРЕФРАЗИРОВАТЬ ИХ!)]:
${recentExistingTopics.map(t => `- ${t}`).join('\n')}`
        : '';

    // 4. Формируем контекст для LLM-редактора тем
    const discoveriesSnippet = recentDiscoveries.map(d => 
        `- [${d.source_name || 'ТГ-канал'}]: ${d.title || ''} (${d.canonical_url})\n  ${(d.raw_text || '').slice(0, 250)}`
    ).join('\n\n');

    const prompt = `Ты — редактор тем и контент-директор для персонажа Лера (19 лет, студентка СПбГИК, живёт в Санкт-Петербурге, подрабатывает в СММ).
Твоя задача: на основе свежих новостей Петербурга и постов из Telegram отобрать 3–5 САМЫХ СОЧНЫХ, ЖИВЫХ И АКТУАЛЬНЫХ ТЕМ на сегодня.

МЫ ИЩЕМ:
- Реальные факты дня (погода, шторм, перекрытие моста/метро, городские курьезы, события на Невском/Марсовом поле, праздники).
- Смешные или абсурдные посты/мемы из соцсетей, тренды, над которыми можно поугорать или повозмущаться.
- Житейские ситуации студентки в СПб (учёба, дедлайны клиентов, транспорт, кофейни).

СТРОГО ЗАПРЕЩЕНО:
- ПОВТОРЯТЬ ТЕМЫ ИЗ СПИСКА УЖЕ СУЩЕСТВУЮЩИХ (даже другими словами).
- Сухие протокольные криминальные сводки или тяжелый негатив (ДТП с жертвами, жесть).
- Политические агитки (если выборы — то с бытовой стороны: буфет на участке, пирожки, странные плакаты на столбах).

${existingTopicsBlock}

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
    "category": "personal_life", // или "fact_of_the_day", "spb_life"
    "source_url": "URL источника если это внешняя новость/пост из ТГ, ИЛИ null/пустая строка если это житейская/бытовая ситуация Леры",
    "source_type": "web_search", // или "channel_digest", "manual"
    "expires_in_hours": 24
  }
]`;

    try {
        const raw = await generateCompletion(prompt, {
            temperature: 0.7,
            max_tokens: 3500,
            trace: { kind: 'TOPIC_HARVEST', userId: 0 }
        });
        let cleanJson = String(raw || '[]')
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // Extract JSON array block if surrounded by prose
        const arrayMatch = cleanJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
            cleanJson = arrayMatch[0];
        } else {
            // Salvage truncated JSON array up to last valid object
            const lastObjEnd = cleanJson.lastIndexOf('}');
            if (lastObjEnd !== -1 && cleanJson.trim().startsWith('[')) {
                cleanJson = cleanJson.slice(0, lastObjEnd + 1) + ']';
            }
        }

        let parsed = [];
        try {
            parsed = JSON.parse(cleanJson);
        } catch {
            // Fallback: extract individual valid JSON objects
            const objMatches = cleanJson.match(/\{[\s\S]*?\}(?=\s*,\s*\{|\s*\]|$)/g) || [];
            for (const m of objMatches) {
                try { parsed.push(JSON.parse(m)); } catch { }
            }
        }

        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                if (!item.title || !item.situation) continue;
                const hours = Number(item.expires_in_hours) || 24;
                const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

                const cleanTitle = item.title.trim();
                const titleWords = cleanTitle.toLowerCase().replace(/[^a-zа-я0-9\s]/gi, '').split(/\s+/).filter(w => w.length > 3);
                
                // Проверка на точный дубликат или сильное сходство ключевых слов
                const existing = await query(`
                    SELECT id, title FROM content_topics 
                    WHERE title = $1 
                       OR created_at > NOW() - INTERVAL '7 days'
                `, [cleanTitle]);

                let isDuplicate = false;
                for (const row of existing.rows) {
                    if (row.title.trim().toLowerCase() === cleanTitle.toLowerCase()) {
                        isDuplicate = true;
                        break;
                    }
                    const rowWords = row.title.toLowerCase().replace(/[^a-zа-я0-9\s]/gi, '').split(/\s+/).filter(w => w.length > 3);
                    const commonWords = titleWords.filter(w => rowWords.includes(w));
                    // Если больше половины значимых слов совпадают — считаем дублем
                    if (titleWords.length >= 3 && commonWords.length >= Math.ceil(titleWords.length * 0.6)) {
                        isDuplicate = true;
                        console.log(`[TOPIC HARVESTER] Пропуск похожей темы: "${cleanTitle}" ~ "${row.title}"`);
                        break;
                    }
                }
                if (isDuplicate) continue;

                let mediaUrl = item.media_url || null;
                let mediaType = item.media_type || (mediaUrl ? 'photo' : null);

                // Если в LLM не было media_url, ищем совпадение среди находок по source_url или canonical_url
                if (item.source_url) {
                    const matchedDisc = recentDiscoveries.find(d => 
                        d.canonical_url === item.source_url || 
                        (d.canonical_url && item.source_url.includes(d.canonical_url))
                    );
                    if (matchedDisc?.metadata?.videoUrl) {
                        mediaUrl = matchedDisc.metadata.videoUrl;
                        mediaType = 'video';
                    } else if (!mediaUrl && matchedDisc?.metadata?.thumbnail) {
                        mediaUrl = matchedDisc.metadata.thumbnail;
                        mediaType = 'photo';
                    }
                }

                const metadata = {
                    media_type: mediaType || 'photo'
                };

                const inserted = await query(`
                    INSERT INTO content_topics (
                        title, situation, category, media_url, source_url, source_type,
                        status, expires_at, metadata, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'NEW', $7, $8, NOW())
                    RETURNING *
                `, [
                    cleanTitle.slice(0, 255),
                    item.situation,
                    item.category || 'spb_life',
                    mediaUrl,
                    item.source_url || null,
                    item.source_type || 'web_search',
                    expiresAt,
                    JSON.stringify(metadata)
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
    const isChannel = String(surface).toLowerCase().includes('channel');
    const isDm = String(surface).toLowerCase().includes('dm');

    await query(`
        UPDATE content_topics
        SET status = 'USED',
            used_at = NOW(),
            used_in_surface = $2,
            used_in_channel_at = CASE WHEN $3 = TRUE THEN NOW() ELSE used_in_channel_at END,
            used_in_dm_at = CASE WHEN $4 = TRUE THEN NOW() ELSE used_in_dm_at END
        WHERE id = $1
    `, [topicId, surface, isChannel, isDm]);
}
