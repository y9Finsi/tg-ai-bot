-- Canonical typed memory foundation.
-- This migration intentionally keeps user_memories as the legacy read/write
-- model while copying every active legacy row into memory_fact.

CREATE TABLE IF NOT EXISTS memory_fact (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    memory_type VARCHAR(32) NOT NULL,
    schema_version SMALLINT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    normalized_text TEXT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
    importance SMALLINT NOT NULL DEFAULT 50,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_event_id BIGINT,
    supersedes_id BIGINT REFERENCES memory_fact(id) ON DELETE SET NULL,
    content_hash VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT memory_fact_type_check CHECK (
        memory_type IN (
            'PROFILE',
            'PREFERENCE',
            'EPISODE',
            'COMMITMENT',
            'OPEN_THREAD',
            'TOOL_OBSERVATION',
            'RELATIONSHIP_EVENT',
            'SIMULATION_OBSERVATION',
            'DECISION_TRACE'
        )
    ),
    CONSTRAINT memory_fact_schema_version_check CHECK (schema_version > 0),
    CONSTRAINT memory_fact_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT memory_fact_text_check CHECK (char_length(btrim(normalized_text)) > 0),
    CONSTRAINT memory_fact_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT memory_fact_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT memory_fact_importance_check CHECK (importance >= 0 AND importance <= 100),
    CONSTRAINT memory_fact_provenance_object_check CHECK (jsonb_typeof(provenance) = 'object'),
    CONSTRAINT memory_fact_source_event_check CHECK (source_event_id IS NULL OR source_event_id > 0),
    CONSTRAINT memory_fact_supersedes_self_check CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT memory_fact_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{32}([0-9a-f]{32})?$'),
    CONSTRAINT memory_fact_idempotency_key_check CHECK (char_length(btrim(idempotency_key)) > 0),
    CONSTRAINT uq_memory_fact_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_memory_fact_user_active_rank
    ON memory_fact (user_id, memory_type, importance DESC, valid_from DESC, id DESC)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_memory_fact_user_valid_until
    ON memory_fact (user_id, valid_until)
    WHERE is_active AND valid_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_fact_source_event
    ON memory_fact (source_event_id)
    WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_fact_content_hash
    ON memory_fact (user_id, memory_type, content_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_fact_supersedes
    ON memory_fact (supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_fact_payload_gin
    ON memory_fact USING GIN (payload);

CREATE TABLE IF NOT EXISTS memory_outbox (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    memory_fact_id BIGINT REFERENCES memory_fact(id) ON DELETE SET NULL,
    operation VARCHAR(24) NOT NULL DEFAULT 'UPSERT',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(255) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts SMALLINT NOT NULL DEFAULT 8,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(128),
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT memory_outbox_operation_check CHECK (
        operation IN ('UPSERT', 'SUPERSEDE', 'EXPIRE', 'DELETE', 'REINDEX')
    ),
    CONSTRAINT memory_outbox_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT memory_outbox_status_check CHECK (
        status IN ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'DEAD')
    ),
    CONSTRAINT memory_outbox_attempts_check CHECK (
        attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts
    ),
    CONSTRAINT memory_outbox_lock_check CHECK (
        (
            status = 'PROCESSING'
            AND locked_at IS NOT NULL
            AND locked_by IS NOT NULL
        )
        OR
        (
            status <> 'PROCESSING'
            AND locked_at IS NULL
            AND locked_by IS NULL
        )
    ),
    CONSTRAINT memory_outbox_completed_check CHECK (
        completed_at IS NULL OR status IN ('COMPLETED', 'DEAD')
    ),
    CONSTRAINT memory_outbox_idempotency_key_check CHECK (char_length(btrim(idempotency_key)) > 0),
    CONSTRAINT uq_memory_outbox_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_memory_outbox_claim
    ON memory_outbox (available_at, id)
    WHERE status IN ('PENDING', 'RETRY');

CREATE INDEX IF NOT EXISTS idx_memory_outbox_processing_lock
    ON memory_outbox (locked_at, id)
    WHERE status = 'PROCESSING';

CREATE INDEX IF NOT EXISTS idx_memory_outbox_fact
    ON memory_outbox (memory_fact_id, created_at DESC)
    WHERE memory_fact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS memory_retrieval_log (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(255) NOT NULL,
    user_id BIGINT NOT NULL,
    query_text TEXT NOT NULL DEFAULT '',
    query_hash VARCHAR(64) NOT NULL,
    strategy VARCHAR(64) NOT NULL DEFAULT 'deterministic_v1',
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    requested_limit INTEGER NOT NULL DEFAULT 0,
    returned_count INTEGER NOT NULL DEFAULT 0,
    context_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT memory_retrieval_log_query_hash_check CHECK (
        query_hash ~ '^[0-9a-f]{32}([0-9a-f]{32})?$'
    ),
    CONSTRAINT memory_retrieval_log_status_check CHECK (
        status IN ('PENDING', 'COMPLETED', 'FAILED')
    ),
    CONSTRAINT memory_retrieval_log_counts_check CHECK (
        requested_limit >= 0 AND returned_count >= 0 AND returned_count <= requested_limit
    ),
    CONSTRAINT memory_retrieval_log_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT memory_retrieval_log_completion_check CHECK (
        completed_at IS NULL OR completed_at >= started_at
    ),
    CONSTRAINT uq_memory_retrieval_request UNIQUE (user_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_retrieval_log_user_time
    ON memory_retrieval_log (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_memory_retrieval_log_status
    ON memory_retrieval_log (status, started_at, id);

CREATE TABLE IF NOT EXISTS memory_retrieval_trace (
    id BIGSERIAL PRIMARY KEY,
    retrieval_log_id BIGINT NOT NULL REFERENCES memory_retrieval_log(id) ON DELETE CASCADE,
    memory_fact_id BIGINT REFERENCES memory_fact(id) ON DELETE SET NULL,
    candidate_rank INTEGER NOT NULL,
    selected BOOLEAN NOT NULL DEFAULT FALSE,
    selected_rank INTEGER,
    relevance_score NUMERIC(8, 6) NOT NULL DEFAULT 0,
    recency_score NUMERIC(8, 6) NOT NULL DEFAULT 0,
    confidence_score NUMERIC(8, 6) NOT NULL DEFAULT 0,
    importance_score NUMERIC(8, 6) NOT NULL DEFAULT 0,
    type_score NUMERIC(8, 6) NOT NULL DEFAULT 0,
    final_score NUMERIC(8, 6) NOT NULL DEFAULT 0,
    exclusion_reason TEXT,
    trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT memory_retrieval_trace_candidate_rank_check CHECK (candidate_rank > 0),
    CONSTRAINT memory_retrieval_trace_selected_rank_check CHECK (
        (selected AND selected_rank IS NOT NULL AND selected_rank > 0)
        OR
        (NOT selected AND selected_rank IS NULL)
    ),
    CONSTRAINT memory_retrieval_trace_scores_check CHECK (
        relevance_score >= 0 AND relevance_score <= 1
        AND recency_score >= 0 AND recency_score <= 1
        AND confidence_score >= 0 AND confidence_score <= 1
        AND importance_score >= 0 AND importance_score <= 1
        AND type_score >= 0 AND type_score <= 1
        AND final_score >= 0 AND final_score <= 1
    ),
    CONSTRAINT memory_retrieval_trace_object_check CHECK (jsonb_typeof(trace) = 'object'),
    CONSTRAINT uq_memory_retrieval_candidate_rank UNIQUE (retrieval_log_id, candidate_rank)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_retrieval_fact
    ON memory_retrieval_trace (retrieval_log_id, memory_fact_id)
    WHERE memory_fact_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_retrieval_selected_rank
    ON memory_retrieval_trace (retrieval_log_id, selected_rank)
    WHERE selected_rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_retrieval_trace_fact
    ON memory_retrieval_trace (memory_fact_id, created_at DESC)
    WHERE memory_fact_id IS NOT NULL;

-- On an existing installation, preserve every active legacy fact as a
-- PROFILE-shaped canonical fact with explicit LEGACY provenance. On a fresh
-- installation user_memories is bootstrapped after migrations, so this block
-- deliberately becomes a no-op.
DO $typed_memory_migration$
BEGIN
    IF to_regclass('public.user_memories') IS NOT NULL THEN
        EXECUTE $legacy_import$
            INSERT INTO memory_fact (
                user_id,
                memory_type,
                schema_version,
                payload,
                normalized_text,
                valid_from,
                observed_at,
                confidence,
                importance,
                provenance,
                content_hash,
                idempotency_key,
                is_active,
                created_at,
                updated_at
            )
            SELECT
                legacy.user_id,
                'PROFILE',
                1,
                jsonb_build_object(
                    'text', COALESCE(NULLIF(btrim(legacy.fact), ''), '[legacy memory without text]'),
                    'legacy_fact', legacy.fact,
                    'legacy_memory_id', legacy.id
                ),
                COALESCE(NULLIF(btrim(legacy.fact), ''), '[legacy memory without text]'),
                COALESCE(legacy.created_at AT TIME ZONE 'Europe/Moscow', NOW()),
                COALESCE(legacy.created_at AT TIME ZONE 'Europe/Moscow', NOW()),
                0.500,
                50,
                jsonb_build_object(
                    'source', 'legacy_user_memories',
                    'source_kind', 'LEGACY',
                    'legacy_table', 'user_memories',
                    'legacy_memory_id', legacy.id
                ),
                md5(concat_ws(
                    E'\x1f',
                    'PROFILE',
                    legacy.user_id::text,
                    legacy.id::text,
                    COALESCE(legacy.fact, '')
                )),
                'legacy:user_memories:' || legacy.id::text,
                TRUE,
                COALESCE(legacy.created_at AT TIME ZONE 'Europe/Moscow', NOW()),
                COALESCE(legacy.created_at AT TIME ZONE 'Europe/Moscow', NOW())
            FROM user_memories legacy
            WHERE legacy.is_active IS TRUE
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
        $legacy_import$;
    END IF;
END
$typed_memory_migration$;

-- user_memories is intentionally retained for backward compatibility.
