import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('production dialog has one event-backed routed path', () => {
    const ai = read('src/ai.js');
    const bot = read('src/bot.js');
    const db = read('src/db/database.js');

    assert.match(ai, /getRoutedSystemPrompt\(routingMode, productionIntentConfig\)/);
    assert.doesNotMatch(ai, /getHistory|saveMessage|extractConversationEffects/);
    assert.doesNotMatch(bot, /saveMessage|getHistory/);
    assert.match(db, /FROM conversation_events/);
    assert.doesNotMatch(db, /INSERT INTO chat_history|FROM chat_history/);
});

test('initiatives use the routed casual engine', () => {
    const ai = read('src/ai.js');
    const initiative = ai.slice(ai.indexOf('export async function generateAiInitiativeResponse'));

    assert.match(initiative, /runAiEngine\(userId, \{/);
    assert.match(initiative, /routingMode: 'CASUAL'/);
});

test('same-user jobs are serialized while worker concurrency stays global', () => {
    const queue = read('src/queue.js');

    assert.match(queue, /const userJobLanes = new Map\(\)/);
    assert.match(queue, /const previous = userJobLanes\.get\(key\) \|\| Promise\.resolve\(\)/);
    assert.match(queue, /concurrency: 5/);
    assert.match(queue, /runUserJob\(\s*job\.data\.userId/);
});

test('enqueue failures close pending input events', () => {
    const bot = read('src/bot.js');

    assert.match(bot, /status: 'PENDING'/);
    assert.match(bot, /failPendingEvents\(`queue enqueue failed:/);
    assert.match(bot, /updateConversationEventStatus\(eventId, 'FAILED'/);
});

test('legacy history migration archives only users without events', () => {
    const migration = read('src/db/migrations/003_chat_history_to_conversation_events.sql');

    assert.match(migration, /INSERT INTO conversation_events/);
    assert.match(migration, /source', 'chat_history_migration'/);
    assert.match(migration, /WHERE NOT EXISTS \(\s*SELECT 1\s*FROM conversation_events events\s*WHERE events\.user_id = history\.user_id/s);
    assert.match(migration, /does not delete|never mixed/i);
});
