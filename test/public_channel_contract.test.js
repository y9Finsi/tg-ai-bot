import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChannelSystemPrompt } from '../src/channel_prompt.js';
import { selectChannelContentFormat } from '../src/channel_content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('channel system prompt accepts only explicit public facts, never legacy private context', () => {
    const prompt = buildChannelSystemPrompt({
        topic: 'life',
        leraPrompt: 'PRIVATE: история конкретного пользователя',
        dayContext: 'PRIVATE: observer digest и планы',
        publicFacts: [{ event: 'сдала макет', date: '2026-08-11', public_status: true }]
    });

    assert.match(prompt, /сдала макет/);
    assert.doesNotMatch(prompt, /история конкретного пользователя/);
    assert.doesNotMatch(prompt, /observer digest/i);
});

test('channel generation is isolated and a repeated judge rejection remains a draft', () => {
    const poster = read('src/channel_poster.js');

    assert.doesNotMatch(poster, /getLeraPrompts/);
    assert.doesNotMatch(poster, /ContextBuilder/);
    assert.match(poster, /surface: 'CHANNEL'/);
    assert.match(poster, /if \(judge\.passed === false && settings\.judge_mode === 'ENFORCE'\)/);
    assert.match(poster, /status: 'DRAFT_REJECTED'/);
    assert.match(poster, /return \{ success: false, published: false, status: 'DRAFT_REJECTED'/);
});

test('public judge and initiative guard are wired to their independent surfaces', () => {
    const judge = read('src/ai/response_judge.js');
    const queue = read('src/queue.js');
    const server = read('src/server.js');

    assert.match(judge, /CHANNEL_INVENTED_FACT/);
    assert.match(judge, /CHANNEL_PRIVATE_DETAIL/);
    assert.match(judge, /CHANNEL_OUT_OF_TOPIC/);
    assert.match(judge, /CHANNEL_REPETITION/);
    assert.match(queue, /blockedByJudge/);
    assert.match(server, /\/api\/admin\/lera-profile\/preview/);
});

test('channel posts and comments reuse the single response cleaner', () => {
    const poster = read('src/channel_poster.js');
    const comments = read('src/channel_comments.js');

    assert.match(poster, /cleanResponseText\(generated\.text\)/);
    assert.match(poster, /cleanResponseText\(text\)/);
    assert.match(comments, /cleanResponseText\(cleanReply\)/);
    assert.doesNotMatch(poster, /function cleanGeneratedPost/);
    assert.doesNotMatch(comments, /splitResponseMessages/);
});

test('public judge fails closed for malformed or unavailable judge output', () => {
    const judge = read('src/ai/response_judge.js');

    assert.match(judge, /CHANNEL_JUDGE_INVALID/);
    assert.match(judge, /CHANNEL_JUDGE_ERROR/);
    assert.match(judge, /surfaceKey === 'CHANNEL' \|\| surfaceKey === 'CHANNEL_COMMENT'/);
    assert.match(judge, /passed: false/);
});

test('public commenter context is identity-only and never injects personal memory', () => {
    const comments = read('src/channel_comments.js');

    assert.match(comments, /Известный подписчик канала/);
    assert.match(comments, /public_comment_identity_only/);
    assert.match(comments, /memoryUsed: \[\]/);
    assert.doesNotMatch(comments, /Факты из памяти/);
    assert.doesNotMatch(comments, /Статус отношений:/);
    assert.doesNotMatch(comments, /старого знакомого/);
    assert.doesNotMatch(comments, /getUserMemories/);
    assert.doesNotMatch(comments, /getUserRelationship/);
});

test('discussion state and publication idempotency are persisted', () => {
    const database = read('src/db/database.js');
    const migration = read('src/db/migrations/20260815_channel_discussion_outbox.sql');
    const comments = read('src/channel_comments.js');
    const poster = read('src/channel_poster.js');

    assert.match(migration, /channel_discussion_threads/);
    assert.match(migration, /channel_processed_messages/);
    assert.match(migration, /channel_publication_outbox/);
    assert.match(database, /export async function claimChannelProcessedMessage/);
    assert.match(database, /export async function claimChannelPublication/);
    assert.match(comments, /getChannelPostByTelegramMessageId/);
    assert.match(comments, /if \(!postText\) return false/);
    assert.match(poster, /claimChannelPublication/);
});

test('reference contract is documented without copying full examples into runtime prompt', () => {
    const standard = read('docs/channel-content-standard.md');
    const prompt = buildChannelSystemPrompt({
        topic: 'life',
        contentFormat: 'photo_caption'
    });

    assert.match(standard, /Примеры из эталонных ТГК/);
    assert.match(standard, /Фото \+ бытовое состояние/);
    assert.match(standard, /Длинный поток мыслей/);
    assert.match(standard, /Бытовая деталь, которая вызывает реакции/);
    assert.match(prompt, /Формат поста: photo_caption/);
    assert.match(prompt, /не копируй формулировки из референсов/);
    assert.doesNotMatch(prompt, /может, остаться в Сочи/i);
});

test('content format selector respects media, topic and immediate format cooldown', () => {
    assert.equal(selectChannelContentFormat({
        topic: 'meme',
        hasMedia: true,
        recentPosts: []
    }), 'meme_caption');

    assert.equal(selectChannelContentFormat({
        topic: 'life',
        preferredFormat: 'long_monologue',
        recentPosts: [{ provenance: { content_format: 'short_thought' } }]
    }), 'long_monologue');

    assert.notEqual(selectChannelContentFormat({
        topic: 'life',
        preferredFormat: 'long_monologue',
        recentPosts: [{ provenance: { content_format: 'long_monologue' } }]
    }), 'long_monologue');

    assert.notEqual(selectChannelContentFormat({
        topic: 'life',
        hasMedia: false,
        randomValue: 0.5
    }), 'photo_caption');
});

test('channel publisher respects Telegram caption and message length boundaries', () => {
    const poster = read('src/channel_poster.js');

    assert.match(poster, /cleanedText = cleanedText\.slice\(0, 1024\)\.trim\(\)/);
    assert.match(poster, /4096 - suffix\.length/);
});
