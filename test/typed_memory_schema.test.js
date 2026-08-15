import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMORY_TYPES } from '../src/memory/memory_types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
    path.join(root, 'src/db/migrations/009_typed_memory.sql'),
    'utf8'
);
const databaseSource = fs.readFileSync(
    path.join(root, 'src/db/database.js'),
    'utf8'
);

test('memory_fact stores typed, temporal, attributable and idempotent facts', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS memory_fact\s*\(/);
    for (const type of MEMORY_TYPES) {
        assert.match(migration, new RegExp(`'${type}'`));
    }

    for (const column of [
        'payload JSONB NOT NULL',
        'normalized_text TEXT NOT NULL',
        'valid_from TIMESTAMPTZ NOT NULL',
        'valid_until TIMESTAMPTZ',
        'observed_at TIMESTAMPTZ',
        'confidence NUMERIC',
        'importance SMALLINT',
        'provenance JSONB NOT NULL',
        'source_event_id BIGINT',
        'supersedes_id BIGINT',
        'content_hash VARCHAR',
        'idempotency_key VARCHAR',
        'is_active BOOLEAN'
    ]) {
        assert.match(migration, new RegExp(column.replace(/[()]/g, '\\$&')));
    }

    assert.match(migration, /valid_until IS NULL OR valid_until > valid_from/);
    assert.match(migration, /confidence >= 0 AND confidence <= 1/);
    assert.match(migration, /importance >= 0 AND importance <= 100/);
    assert.match(migration, /UNIQUE \(user_id, idempotency_key\)/);
    assert.match(migration, /idx_memory_fact_user_active_rank/);
    assert.match(migration, /idx_memory_fact_content_hash/);
    assert.match(migration, /uq_memory_fact_supersedes/);
});

test('memory_outbox has explicit retry, lock, status and idempotency contracts', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS memory_outbox\s*\(/);
    assert.match(migration, /status IN \('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'DEAD'\)/);
    assert.match(migration, /attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts/);
    assert.match(migration, /status = 'PROCESSING'[\s\S]*locked_at IS NOT NULL[\s\S]*locked_by IS NOT NULL/);
    assert.match(migration, /uq_memory_outbox_user_idempotency UNIQUE \(user_id, idempotency_key\)/);
    assert.match(migration, /idx_memory_outbox_claim/);
    assert.match(migration, /idx_memory_outbox_processing_lock/);
});

test('retrieval logs retain request summaries and per-candidate score traces', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS memory_retrieval_log\s*\(/);
    assert.match(migration, /request_id VARCHAR\(255\) NOT NULL/);
    assert.match(migration, /query_hash VARCHAR\(64\) NOT NULL/);
    assert.match(migration, /context_text TEXT/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS memory_retrieval_trace\s*\(/);
    assert.match(migration, /retrieval_log_id BIGINT NOT NULL REFERENCES memory_retrieval_log/);
    assert.match(migration, /memory_fact_id BIGINT REFERENCES memory_fact/);
    assert.match(migration, /relevance_score NUMERIC/);
    assert.match(migration, /recency_score NUMERIC/);
    assert.match(migration, /final_score NUMERIC/);
    assert.match(migration, /uq_memory_retrieval_selected_rank/);
});

test('active legacy user_memories are copied once and the old table is retained', () => {
    assert.match(migration, /to_regclass\('public\.user_memories'\) IS NOT NULL/);
    assert.match(migration, /FROM user_memories legacy/);
    assert.match(migration, /WHERE legacy\.is_active IS TRUE/);
    assert.match(migration, /'PROFILE'/);
    assert.match(migration, /'source_kind', 'LEGACY'/);
    assert.match(migration, /'legacy:user_memories:' \|\| legacy\.id::text/);
    assert.match(migration, /ON CONFLICT \(user_id, idempotency_key\) DO NOTHING/);
    assert.doesNotMatch(migration, /DROP TABLE(?: IF EXISTS)? user_memories/i);
    assert.doesNotMatch(migration, /DELETE FROM user_memories/i);
    assert.doesNotMatch(migration, /UPDATE user_memories/i);
    assert.match(migration, /user_memories is intentionally retained/i);
});

test('typed memory migration runs before compatibility table creation on fresh install', () => {
    const migrationLoop = databaseSource.indexOf('for (const migrationFile of migrationFiles)');
    const compatibilityTable = databaseSource.indexOf('CREATE TABLE IF NOT EXISTS user_memories');

    assert.ok(migrationLoop >= 0);
    assert.ok(compatibilityTable > migrationLoop);
    assert.match(migration, /IF to_regclass\('public\.user_memories'\) IS NOT NULL/);
});
