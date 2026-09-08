/**
 * RADIANT Service: content_browse_service
 * Обработка сессии просмотра контента Лерой при выполнении задачи CONTENT_BROWSE
 */

import { query, addLeraContent } from '../db/database.js';

const SPAM_REGEX = /казино|ставка|1xbet|крипт|сигнал[ы]?\s+на|заработ|инвестици|вход\s+в\s+канал/i;

function evaluateDiscoveryQuality(item) {
    let score = 20;
    const title = String(item.title || '').trim();
    const text = String(item.raw_text || '').trim();
    const url = String(item.canonical_url || '').toLowerCase();

    if (SPAM_REGEX.test(title) || SPAM_REGEX.test(text)) {
        return { score: 0, reason: 'Спам или реклама заработка' };
    }

    if (title.length >= 5) score += 30;
    if (text.length >= 40 && text.length <= 2500) score += 30;
    else if (text.length > 0 && text.length < 40) score += 10;

    if (['video', 'meme', 'music', 'telegram', 'hentai'].includes(item.category)) {
        score += 20;
    }

    // Вкус Леры в музыке: русский инди, пост-панк, шугейз, построк (Дайте танк, Сироткин, Перемотка и др.)
    if (item.category === 'music') {
        const musicKeywords = /инди|пост-панк|шугейз|построк|дайте танк|сироткин|перемотк|молчат дома|буерак|пасош|ploho|автоспорт|источник|щенки|бонд с кнопкой|монеточка|settlers|питер|спб/i;
        if (musicKeywords.test(title) || musicKeywords.test(text)) {
            score += 25;
        }
    }

    // Хентай и манга: фреймы, манхва, тайтлы, mangalib, remanga
    if (item.category === 'hentai') {
        if (/manga|манга|манхва|хентай|hentai|mangalib|remanga|глав[аы]|главу/i.test(title) || /manga|манга|манхва|хентай|hentai|mangalib|remanga|глав[аы]|главу/i.test(text) || url.includes('mangalib') || url.includes('remanga')) {
            score += 25;
        }
    }

    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('t.me/') || url.includes('music.yandex.')) {
        score += 10;
    }

    return { score: Math.min(100, score), reason: score < 40 ? 'Слишком короткий текст или мусор' : null };
}

export async function executeContentBrowseSession(radiantTaskId = null) {
    const sessionRes = await query(
        `INSERT INTO content_browse_sessions (radiant_task_id, status, started_at)
         VALUES ($1, 'OPEN', NOW())
         RETURNING id`,
        [radiantTaskId ? Number(radiantTaskId) : null]
    );
    const sessionId = sessionRes.rows[0]?.id;

    const discoveriesRes = await query(
        `SELECT * FROM content_discoveries
         WHERE lifecycle_status = 'DISCOVERED'
         ORDER BY created_at DESC
         LIMIT 5`
    );
    const items = discoveriesRes.rows || [];

    let savedCount = 0;
    let rejectedCount = 0;
    let deferredCount = 0;

    for (const item of items) {
        const { score, reason } = evaluateDiscoveryQuality(item);
        let decision = 'DEFER';

        if (score >= 60) {
            decision = 'SAVE';
            let telegramType = 'link';
            if (item.category === 'video' || /youtube\.com|youtu\.be/i.test(item.canonical_url)) {
                telegramType = 'video';
            } else if (item.category === 'photo' || item.category === 'meme') {
                telegramType = 'photo';
            } else if (item.category === 'music' || item.category === 'audio') {
                telegramType = 'audio';
            }

            try {
                let leraContentId = item.lera_content_id;
                if (!leraContentId) {
                    const saved = await addLeraContent({
                        telegramType,
                        url: item.canonical_url,
                        description: item.title || item.raw_text || item.canonical_url,
                        allowInDialogue: true,
                        allowInitiative: true,
                        allowChannel: false
                    });
                    leraContentId = saved.id;
                }

                await query(
                    `UPDATE content_discoveries
                     SET lifecycle_status = 'SAVED',
                         viewed_at = NOW(),
                         quality_score = $2,
                         lera_content_id = $3
                     WHERE id = $1`,
                    [item.id, score, leraContentId]
                );
                savedCount++;
            } catch (err) {
                console.warn(`[CONTENT BROWSE] Ошибка добавления находки #${item.id} в банк:`, err.message);
                decision = 'DEFER';
                deferredCount++;
            }
        } else if (score < 30) {
            decision = 'REJECT';
            await query(
                `UPDATE content_discoveries
                 SET lifecycle_status = 'REJECTED',
                     viewed_at = NOW(),
                     quality_score = $2,
                     rejection_reason = $3
                 WHERE id = $1`,
                [item.id, score, reason || 'Не подошло по формату']
            );
            rejectedCount++;
        } else {
            decision = 'DEFER';
            await query(
                `UPDATE content_discoveries
                 SET viewed_at = NOW(),
                     quality_score = $2
                 WHERE id = $1`,
                [item.id, score]
            );
            deferredCount++;
        }

        if (sessionId) {
            await query(
                `INSERT INTO content_browse_decisions (session_id, discovery_id, decision, content_snapshot)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (session_id, discovery_id) DO NOTHING`,
                [sessionId, item.id, decision, JSON.stringify({ title: item.title, url: item.canonical_url, score })]
            );
        }
    }

    const stats = { reviewed: items.length, saved: savedCount, rejected: rejectedCount, deferred: deferredCount };

    if (sessionId) {
        await query(
            `UPDATE content_browse_sessions
             SET status = 'COMPLETED', completed_at = NOW(), stats = $2
             WHERE id = $1`,
            [sessionId, JSON.stringify(stats)]
        );
    }

    return { sessionId, stats };
}
