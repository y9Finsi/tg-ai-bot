import { query } from '../db/database.js';

const clean = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function canonicalUrl(input) {
    try {
        const url = new URL(String(input));
        url.hash = '';
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'si', 'feature'].forEach(key => url.searchParams.delete(key));
        if (url.hostname === 'youtu.be') return 'https://www.youtube.com/watch?v=' + url.pathname.slice(1);
        return url.toString().replace(/\/$/, '');
    } catch { return String(input || '').trim(); }
}

function parseTelegram(html, sourceUrl) {
    const out = [];
    const re = /<div class="tgme_widget_message\b[^>]*data-post="([^"]+)"[\s\S]*?(?=<div class="tgme_widget_message\b|$)/g;
    let match;
    while ((match = re.exec(html))) {
        const block = match[0];
        const textMatch = block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);
        const text = clean(textMatch?.[1]);
        if (!text) continue;

        const ymLinkMatch = block.match(/href=["'](https?:\/\/music\.yandex\.[^"'\s>]+)["']/i);
        const mangaLinkMatch = block.match(/href=["'](https?:\/\/(?:mangalib\.me|remanga\.org|hentailib\.me)[^"'\s>]+)["']/i);

        let canonical = canonicalUrl('https://t.me/' + match[1]);
        let category = 'telegram';

        if (ymLinkMatch) {
            canonical = canonicalUrl(ymLinkMatch[1].replace(/&amp;/g, '&'));
            category = 'music';
        } else if (mangaLinkMatch) {
            canonical = canonicalUrl(mangaLinkMatch[1].replace(/&amp;/g, '&'));
            category = 'hentai';
        }

        out.push({
            externalId: match[1],
            canonicalUrl: canonical,
            title: text.slice(0, 160),
            rawText: text,
            category,
            metadata: {
                sourceUrl,
                yandexMusicUrl: ymLinkMatch ? ymLinkMatch[1] : null,
                mangaUrl: mangaLinkMatch ? mangaLinkMatch[1] : null
            }
        });
    }
    return out;
}

function parseRss(xml, sourceUrl) {
    return [...String(xml).matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)].map(blockMatch => {
        const block = blockMatch[0];
        const tag = name => clean(block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'))?.[1]);
        const link = tag('link') || block.match(/<link[^>]+href=["']([^"']+)/i)?.[1];
        const isVideo = sourceUrl.includes('youtube') || block.includes('yt:videoId');
        const desc = tag('description') || tag('summary') || tag('media:description');
        const thumb = block.match(/<media:thumbnail[^>]+url=["']([^"']+)/i)?.[1] || null;
        return link ? {
            externalId: tag('yt:videoId') || link,
            canonicalUrl: canonicalUrl(link),
            title: tag('title') || tag('media:title'),
            rawText: desc,
            category: isVideo ? 'video' : 'news',
            metadata: {
                sourceUrl,
                publishedAt: tag('pubDate') || tag('updated') || tag('published'),
                thumbnail: thumb
            }
        } : null;
    }).filter(Boolean);
}

function parseYoutube(html, sourceUrl) {
    const title = clean(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/<title>([^<]+)/i)?.[1]);
    const thumbnail = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || null;
    const rawText = clean(html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1]);
    return title ? [{
        externalId: sourceUrl,
        canonicalUrl: canonicalUrl(sourceUrl),
        title,
        rawText,
        category: 'video',
        metadata: { sourceUrl, thumbnail }
    }] : [];
}

async function parseYandexMusic(target) {
    const playlistMatch = target.match(/\/users\/([^\/]+)\/playlists\/(\d+)/i);
    if (playlistMatch) {
        const [, owner, kind] = playlistMatch;
        const apiUrl = `https://api.music.yandex.net/users/${owner}/playlists/${kind}`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': 'Yandex-Music-API' }, signal: AbortSignal.timeout(10000) });
        if (res.status === 403) {
            console.warn(`[YANDEX MUSIC GEOBLOCK] Yandex Music API returned 403 for ${target}. Direct datacenter IP blocked by Yandex.`);
            return [];
        }
        if (!res.ok) throw new Error(`Yandex Music API ${res.status}`);
        const data = await res.json();
        const playlistTitle = data.result?.title || 'Плейлист Яндекс Музыки';
        const tracks = (data.result?.tracks || []).slice(0, 30);
        return tracks.map(t => {
            const track = t.track || t;
            const albumId = track.albums?.[0]?.id;
            const artists = track.artists?.map(a => a.name).join(', ') || 'Неизвестный исполнитель';
            const trackUrl = albumId ? `https://music.yandex.ru/album/${albumId}/track/${track.id}` : `https://music.yandex.ru/track/${track.id}`;
            const cover = track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : null;
            return {
                externalId: String(track.id),
                canonicalUrl: canonicalUrl(trackUrl),
                title: `${track.title} — ${artists}`,
                rawText: `Трек «${track.title}» от ${artists} из подборки «${playlistTitle}» на Яндекс Музыке`,
                category: 'music',
                metadata: {
                    sourceUrl: target,
                    artists,
                    trackTitle: track.title,
                    albumId,
                    thumbnail: cover,
                    durationMs: track.durationMs
                }
            };
        });
    }
    return [];
}

export async function scrapeSource(source) {
    const url = String(source.url_or_handle || '').trim();
    let target = url;
    if (source.source_type === 'telegram' && !url.includes('/s/')) {
        target = 'https://t.me/s/' + url.replace(/^@/, '');
    }

    const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 LeraContentBot/1.0' };

    if (source.source_type === 'yandex_music' || /music\.yandex\./i.test(target)) {
        return parseYandexMusic(target);
    }

    if (source.source_type === 'youtube') {
        const isChannel = /channel\/|@|c\/|user\//i.test(target);
        if (isChannel) {
            let channelId = target.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/i)?.[1];
            if (!channelId) {
                try {
                    const chRes = await fetch(target, { headers, signal: AbortSignal.timeout(10000) });
                    if (chRes.ok) {
                        const chHtml = await chRes.text();
                        channelId = chHtml.match(/channel_id=(UC[a-zA-Z0-9_-]+)/i)?.[1]
                            || chHtml.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/i)?.[1]
                            || chHtml.match(/itemprop="identifier"\s+content="(UC[a-zA-Z0-9_-]+)"/i)?.[1]
                            || chHtml.match(/href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)"/i)?.[1];
                    }
                } catch (err) {
                    console.warn(`[SCRAPER YOUTUBE CHANNEL RESOLVE WARN]: ${err.message}`);
                }
            }

            if (channelId) {
                const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
                const feedRes = await fetch(rssUrl, { headers, signal: AbortSignal.timeout(10000) });
                if (feedRes.ok) {
                    const xml = await feedRes.text();
                    const items = parseRss(xml, target);
                    if (items.length > 0) return items;
                }
            }
        }
    }

    const response = await fetch(target, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = await response.text();
    if (source.source_type === 'telegram') {
        const items = parseTelegram(body, target);
        const isHentaiSource = Array.isArray(source.topics) && source.topics.some(t => /хентай|манга|манхва|hentai|manga/i.test(t));
        if (isHentaiSource) {
            items.forEach(it => { it.category = 'hentai'; });
        }
        return items;
    }
    if (source.source_type === 'youtube') return parseYoutube(body, target);
    return parseRss(body, target);
}

let isScrapingActive = false;

export async function scrapeAllActiveSources() {
    if (isScrapingActive) {
        console.log('[SCRAPER] scrapeAllActiveSources уже выполняется, пропуск вызова');
        return { running: true, skipped: true };
    }
    isScrapingActive = true;
    try {
        const { rows: sources } = await query('SELECT * FROM content_sources WHERE enabled = TRUE ORDER BY id ASC');
        const stats = { totalSources: sources.length, processed: 0, totalFound: 0, totalAdded: 0, errors: 0 };

        for (const source of sources) {
            const runRes = await query('INSERT INTO content_scrape_runs (source_id) VALUES ($1) RETURNING id', [source.id]);
            const runId = runRes.rows[0]?.id;
            try {
                const items = await scrapeSource(source);
                let added = 0;
                for (const item of items) {
                    const inserted = await query(
                        `INSERT INTO content_discoveries (source_id, external_id, canonical_url, title, raw_text, metadata, category, expires_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '14 days')
                         ON CONFLICT (canonical_url) DO NOTHING
                         RETURNING id`,
                        [source.id, item.externalId, item.canonicalUrl, item.title, item.rawText, JSON.stringify(item.metadata || {}), item.category]
                    );
                    if (inserted.rowCount) added += 1;
                }

                if (runId) {
                    await query(
                        `UPDATE content_scrape_runs
                         SET status = 'COMPLETED', finished_at = NOW(), found_count = $2, new_count = $3, duplicate_count = $4
                         WHERE id = $1`,
                        [runId, items.length, added, items.length - added]
                    );
                }

                await query(
                    `UPDATE content_sources
                     SET last_success_at = NOW(), last_error = NULL, consecutive_errors = 0
                     WHERE id = $1`,
                    [source.id]
                );

                stats.processed++;
                stats.totalFound += items.length;
                stats.totalAdded += added;
            } catch (err) {
                stats.errors++;
                const newErrCount = (source.consecutive_errors || 0) + 1;
                const shouldDisable = newErrCount >= 3;

                if (runId) {
                    await query(
                        `UPDATE content_scrape_runs
                         SET status = 'FAILED', finished_at = NOW(), error = $2, error_count = 1
                         WHERE id = $1`,
                        [runId, err.message]
                    );
                }

                await query(
                    `UPDATE content_sources
                     SET last_error = $2, consecutive_errors = $3, enabled = CASE WHEN $4 = TRUE THEN FALSE ELSE enabled END
                     WHERE id = $1`,
                    [source.id, err.message, newErrCount, shouldDisable]
                );

                if (shouldDisable) {
                    console.warn(`[SCRAPER AUTO-PAUSE] Источник #${source.id} (${source.name}) автоматически приостановлен после 3 ошибок: ${err.message}`);
                }
            }
        }
        return stats;
    } finally {
        isScrapingActive = false;
    }
}
