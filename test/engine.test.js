import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConversationGap, formatConversationEvent } from '../src/db/database.js';
import { parseLlmJson } from '../src/utils/robust_json.js';

// NOTE: tests for src/engine/* and src/memory/context_builder.js were removed —
// those modules belong to the abandoned simulation_*/schedule_* architecture and
// do not exist in the codebase. The live sim_* engine is covered by
// test/radiant_admin.test.js.

test('conversation gap is formatted for the DSL', () => {
    assert.equal(formatConversationGap(0), 'D:0');
    assert.equal(formatConversationGap(59), 'D:0');
    assert.equal(formatConversationGap(5 * 60), 'D:5m');
    assert.equal(formatConversationGap(2 * 3600), 'D:2h');
    assert.equal(formatConversationGap(3 * 86400), 'D:3d');
});

test('conversation event is rendered without exposing media identifiers', () => {
    const line = formatConversationEvent({
        event_type: 'PHOTO',
        role: 'lera',
        content: '',
        occurred_at: '2026-08-01T13:35:00.000Z',
        gap_seconds: 0,
        metadata: { caption: 'архивное фото', file_id: 'secret-file-id' }
    });
    assert.match(line, /\[PHOTO:lera\]/);
    assert.match(line, /архивное фото/);
    assert.doesNotMatch(line, /secret-file-id/);
});

test('LLM JSON parser repairs common smart quote and Infinity errors', () => {
    const value = parseLlmJson('```json { “title”: “Хаос”, “stats_delta”: { “mood”: +5, “fatigue”: +Infinity, }, } ```');
    assert.equal(value.title, 'Хаос');
    assert.equal(value.stats_delta.mood, 5);
    assert.equal(value.stats_delta.fatigue, null);
});
