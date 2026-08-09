import fs from 'node:fs';
import path from 'node:path';

/**
 * Скрипт для парсинга публичных Telegram-каналов через веб-превью (https://t.me/s/CHANNEL_NAME)
 * 
 * Использование:
 * node src/scripts/parse_tg_channels.js durov
 * или
 * node src/scripts/parse_tg_channels.js https://t.me/s/durov
 */

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#33;/g, '!')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function cleanText(htmlText) {
  if (!htmlText) return '';

  // Обработка гиперссылок вида <a href="...">подпись</a>
  let processed = htmlText.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, href, anchorHtml) => {
    let anchorText = anchorHtml.replace(/<[^>]+>/g, '').trim();
    anchorText = decodeEntities(anchorText);

    let url = href.trim();
    if (url.startsWith('//')) {
      url = 'https:' + url;
    } else if (url.startsWith('/')) {
      url = 'https://t.me' + url;
    }

    if (url.startsWith('javascript:') || url.startsWith('?') || url.includes('?q=')) {
      return anchorText;
    }

    if (!anchorText) {
      return url;
    }

    const cleanAnchor = anchorText.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const cleanUrl = url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    if (cleanAnchor === cleanUrl) {
      return anchorText;
    }

    if (anchorText.startsWith('@') && cleanUrl.includes('t.me/' + cleanAnchor.slice(1))) {
      return anchorText;
    }

    return `${anchorText} (${url})`;
  });

  processed = processed.replace(/<br\s*\/?>/gi, '\n');
  processed = processed.replace(/<[^>]+>/g, '');
  processed = decodeEntities(processed);

  return processed
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseChannel(channelNameOrUrl) {
  let channelName = channelNameOrUrl.replace(/^https?:\/\/t\.me\/(s\/)?/, '').replace(/^\//, '').replace(/\/$/, '');

  console.log(`🔍 Парсим публичный канал: https://t.me/s/${channelName}`);

  try {
    const response = await fetch(`https://t.me/s/${channelName}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Ошибка загрузки страницы: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    const posts = [];
    const messageBlockRegex = /<div class="tgme_widget_message\b[^>]*data-post="([^"]+)"[\s\S]*?(?=<div class="tgme_widget_message\b|$)/g;

    let match;
    while ((match = messageBlockRegex.exec(html)) !== null) {
      const postPath = match[1];
      const blockHtml = match[0];
      const link = `https://t.me/${postPath}`;

      const textMatch = blockHtml.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (textMatch) {
        const rawText = textMatch[1];
        const text = cleanText(rawText);

        if (text) {
          posts.push({
            link,
            text,
            length: text.length
          });
        }
      }
    }

    console.log(`✅ Найдено постов: ${posts.length}`);

    const outDir = path.resolve('data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outFile = path.join(outDir, `${channelName}_posts.json`);
    fs.writeFileSync(outFile, JSON.stringify(posts, null, 2), 'utf-8');

    console.log(`💾 Посты сохранены в файл: ${outFile}`);
    return { channelName, posts, count: posts.length, file: outFile };
  } catch (error) {
    console.error(`❌ Ошибка при парсинге канала ${channelName}:`, error.message);
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith('parse_tg_channels.js')) {
  const inputChannel = process.argv[2] || 'durov';
  parseChannel(inputChannel);
}


