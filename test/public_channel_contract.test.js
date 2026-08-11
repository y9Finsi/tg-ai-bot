import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChannelSystemPrompt } from '../src/channel_prompt.js';

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
