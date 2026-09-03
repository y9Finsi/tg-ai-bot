import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextBuilder, invalidateSnapshotCache } from '../src/ai/context_builder.js';
import { getSettingsByPrefix, invalidateSettingsCache, setSetting, getRecentConversationEvents } from '../src/db/database.js';
import fs from 'node:fs';
import path from 'node:path';

test('ContextBuilder caches global snapshot and supports invalidateSnapshotCache', async () => {
    invalidateSnapshotCache();
    const snap1 = await ContextBuilder.getGlobalSnapshot();
    assert.ok(snap1, 'first snapshot should be returned');

    const snap2 = await ContextBuilder.getGlobalSnapshot();
    assert.strictEqual(snap1, snap2, 'subsequent calls should return the cached reference within TTL');

    invalidateSnapshotCache();
    const snap3 = await ContextBuilder.getGlobalSnapshot();
    assert.ok(snap3, 'snapshot after invalidation should be returned');
    assert.notStrictEqual(snap1, snap3, 'snapshot after invalidation should be a fresh object');
});

test('ContextBuilder.getOrBuildSnapshot returns a full snapshot structure', async () => {
    const snapshot = await ContextBuilder.getOrBuildSnapshot({ mood: 80 });
    assert.ok(snapshot);
    assert.equal(snapshot.mood, 80);
    assert.ok(snapshot.state);
    assert.ok(Array.isArray(snapshot.queue));
});

test('getSettingsByPrefix caches results and invalidates upon setSetting or explicit invalidation', async () => {
    invalidateSettingsCache();
    const prefix = 'test_perf_';

    const first = await getSettingsByPrefix(prefix);
    const second = await getSettingsByPrefix(prefix);
    assert.deepEqual(first, second);

    invalidateSettingsCache('test_perf_foo');
    const third = await getSettingsByPrefix(prefix);
    assert.deepEqual(first, third);
});

test('simulation_worker passes transactional client to getLatestForecast and uses batch settings', () => {
    const workerCode = fs.readFileSync(path.join(process.cwd(), 'src', 'workers', 'simulation_worker.js'), 'utf8');
    assert.match(workerCode, /StateRepository\.getLatestForecast\(ForecastService\.dateFor\(tickAt\),\s*client\)/);
    assert.match(workerCode, /getSettingsByPrefix\('random_event_enabled_'\)/);
});

test('getRecentConversationEvents supports optional chatHistoryClearedAt parameter', () => {
    const dbCode = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'database.js'), 'utf8');
    assert.match(dbCode, /export async function getRecentConversationEvents\(userId, limit = 20, chatHistoryClearedAt = undefined\)/);
    assert.match(dbCode, /occurred_at > COALESCE\(\(\$3\)::timestamptz, '-infinity'::timestamptz\)/);
});
