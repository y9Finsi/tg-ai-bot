import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryOutboxWorker, mapOutboxJob } from '../src/memory/memory_outbox_worker.js';

const job = (operation, payload = {}, extra = {}) => ({ id: 1, user_id: '42', memory_fact_id: '7', operation, idempotency_key: 'k-1', payload, ...extra });

test('maps upsert/reindex, retract and user purge operations', () => {
    const upsert = mapOutboxJob(job('REINDEX', { normalized_text: 'Любит чай', memory_type: 'PROFILE', payload: { x: 1 }, provenance: { source: 'test' } }));
    assert.equal(upsert.operation, 'upsert');
    assert.deepEqual(upsert.args, {
        userId: '42', memoryId: '7', content: 'Любит чай', metadata: {
            memory_type: 'PROFILE', schema_version: undefined, payload: { x: 1 }, valid_from: undefined,
            valid_until: undefined, observed_at: undefined, confidence: undefined, importance: undefined,
            source_event_id: undefined, supersedes_id: undefined, content_hash: undefined, is_active: undefined
        }, provenance: { source: 'test' }, idempotencyKey: 'k-1'
    });
    assert.deepEqual(mapOutboxJob(job('EXPIRE', { reason: 'expired' })).args, { userId: '42', memoryId: '7', reason: 'expired', idempotencyKey: 'k-1' });
    assert.deepEqual(mapOutboxJob(job('DELETE', { purge_user: true })).args, { userId: '42', idempotencyKey: 'k-1' });
    assert.throws(() => mapOutboxJob(job('DELETE')), /Unsupported/);
});

test('delegates success and retry/dead failures to repository', async () => {
    const calls = [];
    const repository = {
        claimOutbox: async () => [job('UPSERT', { normalized_text: 'чай' }), job('EXPIRE')],
        completeOutbox: async (...args) => calls.push(['complete', ...args]),
        failOutbox: async (...args) => calls.push(['fail', ...args])
    };
    const client = { mode: 'active', upsertFact: async args => calls.push(['upsert', args]), retractFact: async () => { throw new Error('sidecar down'); } };
    const result = await new MemoryOutboxWorker({ memoryRepository: repository, semanticaClient: client, workerId: 'w' }).processBatch();
    assert.deepEqual(result, { claimed: 2, completed: 1, failed: 1, disabled: false });
    assert.equal(calls[0][0], 'upsert');
    assert.equal(calls[1][0], 'complete');
    assert.equal(calls[2][0], 'fail');
    assert.equal(calls[2][1], 1);
    assert.equal(calls[2][2].message, 'sidecar down');
});

test('disabled mode performs no repository or network work', async () => {
    let claims = 0;
    let network = 0;
    const worker = new MemoryOutboxWorker({
        memoryRepository: { claimOutbox: async () => { claims++; return []; } },
        semanticaClient: { mode: 'disabled', upsertFact: async () => { network++; } },
        intervalMs: 1
    });
    assert.deepEqual(await worker.processBatch(), { claimed: 0, completed: 0, failed: 0, disabled: true });
    worker.start();
    await new Promise(resolve => setTimeout(resolve, 10));
    await worker.stop();
    assert.equal(claims, 0);
    assert.equal(network, 0);
});

test('start polls without blocking and stop clears timer and waits for pass', async () => {
    let resolveClaim;
    let claims = 0;
    const repository = {
        claimOutbox: () => { claims++; return new Promise(resolve => { resolveClaim = resolve; }); },
        completeOutbox: async () => {},
        failOutbox: async () => {}
    };
    const worker = new MemoryOutboxWorker({ memoryRepository: repository, semanticaClient: { mode: 'active', upsertFact: async () => {} }, intervalMs: 1 });
    worker.start();
    assert.equal(claims, 1);
    const stopped = worker.stop();
    let settled = false;
    stopped.then(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(settled, false);
    resolveClaim([]);
    await stopped;
    assert.equal(settled, true);
});

