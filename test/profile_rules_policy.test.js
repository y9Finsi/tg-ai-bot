import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLeraProfile } from '../src/ai/profile/profile_normalizer.js';
import { evaluateRule, evaluateRules } from '../src/ai/profile/rule_evaluator.js';
import { getLeraProfileProjectionDetails } from '../src/ai/profile/profile_projection.js';
import { isToolAllowed } from '../src/ai/profile/surface_policy.js';

test('normalizer preserves legacy string conditions as tags', () => {
    const profile = normalizeLeraProfile({ blocks: [{ id: 'r', surface: 'CHAT', conditions: ['Дождь', { field: 'weather.condition', operator: 'equals', value: 'rain' }] }] });
    assert.deepEqual(profile.blocks[0].tags, ['Дождь']);
    assert.equal(profile.blocks[0].conditions.length, 1);
    assert.equal(profile.schemaVersion, 2);
});

test('rule evaluator uses AND semantics and typed operators', () => {
    const rule = { conditions: [{ field: 'weather.condition', operator: 'equals', value: 'rain' }, { field: 'time.hour', operator: 'between', value: [18, 23] }] };
    assert.equal(evaluateRule(rule, { weather: { condition: 'rain' }, time: { hour: 20 } }).active, true);
    assert.equal(evaluateRule(rule, { weather: { condition: 'clear' }, time: { hour: 20 } }).active, false);
});

test('projection filters by surface and priority with explainability', () => {
    const result = getLeraProfileProjectionDetails({ blocks: [
        { id: 'low', title: 'low', surface: 'CHAT', priority: 1, content: 'low' },
        { id: 'high', title: 'high', surface: 'CHAT', priority: 10, content: 'high' },
        { id: 'group', title: 'group', surface: 'GROUP', content: 'group' }
    ] }, 'CHAT');
    assert.deepEqual(result.activeRules.map(rule => rule.id), ['high', 'low']);
    assert.equal(result.skippedRules.some(rule => rule.ruleId === 'group'), true);
});

test('surface prompt overrides and typed numeric values survive normalization', () => {
    const profile = normalizeLeraProfile({
        character: 'global',
        surfacePrompts: { CHANNEL: { character: 'public character', instructions: 'public only' } },
        blocks: [{ id: 'rain', surface: 'CHAT', conditions: [{ field: 'time.hour', operator: 'equals', value: '19' }], content: 'quiet evening' }]
    });
    const chat = getLeraProfileProjectionDetails(profile, 'CHAT', { time: { hour: 19 } });
    const channel = getLeraProfileProjectionDetails(profile, 'CHANNEL', { time: { hour: 19 } });
    assert.match(chat.text, /quiet evening/);
    assert.doesNotMatch(channel.text, /quiet evening/);
    assert.match(channel.text, /public character/);
    assert.match(channel.text, /public only/);
    assert.equal(profile.blocks[0].conditions[0].value, 19);
});

test('surface policy blocks private memory in groups', () => {
    assert.equal(isToolAllowed('search_archive_memory', 'CHAT'), true);
    assert.equal(isToolAllowed('search_archive_memory', 'GROUP'), false);
    assert.equal(isToolAllowed('schedule_followup', 'INITIATIVE'), false);
});
