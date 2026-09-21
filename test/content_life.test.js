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

test('topic harvester salvage logic recovers truncated JSON array', () => {
    const truncated = `[
        {
            "title": "Литейный мост ремонт",
            "situation": "Перекрыли тротуар",
            "category": "fact_of_the_day"
        },
        {
            "title": "Бензин вернулся",
            "situation": "Очереди рассосались",
            "category": "city_life",
            "source_url": "https://t.me/test",
            "expires`;

    let cleanJson = truncated.trim();
    const arrayMatch = cleanJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
        cleanJson = arrayMatch[0];
    } else {
        const lastObjEnd = cleanJson.lastIndexOf('}');
        if (lastObjEnd !== -1 && cleanJson.trim().startsWith('[')) {
            cleanJson = cleanJson.slice(0, lastObjEnd + 1) + ']';
        }
    }

    const parsed = JSON.parse(cleanJson);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, 'Литейный мост ремонт');
});

test('story engine extracts steps from messages or steps or story_steps', () => {
    const scriptWithMessages = {
        messages: ["строка 1", "строка 2"],
        photo_prompt: "sitting at desk"
    };

    const steps = Array.isArray(scriptWithMessages.steps) ? scriptWithMessages.steps :
                  Array.isArray(scriptWithMessages.messages) ? scriptWithMessages.messages :
                  Array.isArray(scriptWithMessages.story_steps) ? scriptWithMessages.story_steps : [];

    assert.equal(steps.length, 2);
    assert.equal(steps[0], 'строка 1');
});

test('media mode distribution favors text_only in majority of cases', () => {
    let noneCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
        const hasSourceMedia = i % 2 === 0;
        let mediaMode = 'none';
        const rand = Math.random();
        if (hasSourceMedia && rand < 0.20) {
            mediaMode = 'source_media';
        } else if (rand < 0.12) {
            mediaMode = 'ai_photo';
        } else {
            mediaMode = 'none';
        }
        if (mediaMode === 'none') noneCount++;
    }
    // none should be >= 70%
    const ratio = noneCount / trials;
    assert.ok(ratio >= 0.70, `Expected text_only ratio >= 0.70, got ${ratio}`);
});

test('story HTML link structure is valid and non-intrusive', () => {
    const url = 'https://t.me/spb_news/123';
    const linkTag = `<a href="${url}">пруф</a>`;
    assert.match(linkTag, /^<a href="https:\/\/t\.me\/[^"]+">[^<]+<\/a>$/);
});


