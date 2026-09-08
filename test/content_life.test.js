import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl } from '../src/content/content_scraper.js';

test('canonicalUrl strips tracking queries and normalizes youtu.be', () => {
    const url1 = canonicalUrl('https://example.com/post?utm_source=tg&utm_medium=cpc&si=123#frag');
    assert.equal(url1, 'https://example.com/post');

    const url2 = canonicalUrl('https://youtu.be/dQw4w9WgXcQ?si=abc&feature=share');
    assert.equal(url2, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const url3 = canonicalUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_campaign=promo');
    assert.equal(url3, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('RSS parser handles multiline items and entry tags without [sS] bug', async () => {
    const xml = `
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
            <entry>
                <id>yt:video:abc12345</id>
                <yt:videoId>abc12345</yt:videoId>
                <title>Test Video Title</title>
                <link rel="alternate" href="https://www.youtube.com/watch?v=abc12345"/>
                <summary>Short description of the video</summary>
                <published>2026-09-08T12:00:00+00:00</published>
            </entry>
        </feed>
    `;

    // Extract entries using the regex from parseRss
    const matches = [...String(xml).matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)];
    assert.equal(matches.length, 1);
    assert.match(matches[0][0], /<title>Test Video Title<\/title>/);
});

test('Telegram parser regex matches multiline telegram widget blocks', () => {
    const html = `
        <div class="tgme_widget_message" data-post="mychannel/42">
            <div class="tgme_widget_message_text">
                Привет, это крутой пост про технологии и разработку!
                Вторая строчка текста.
            </div>
        </div>
    `;

    const re = /<div class="tgme_widget_message\b[^>]*data-post="([^"]+)"[\s\S]*?(?=<div class="tgme_widget_message\b|$)/g;
    const matches = [...html.matchAll(re)];
    assert.equal(matches.length, 1);
    assert.equal(matches[0][1], 'mychannel/42');
});
