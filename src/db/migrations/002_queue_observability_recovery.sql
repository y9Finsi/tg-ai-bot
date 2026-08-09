-- Queue/runtime hardening and factual observer storage.
-- The migration is executed once through schema_migrations.

ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS active_scope_key VARCHAR(255);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS dependencies_expanded_at TIMESTAMPTZ;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS dependency_order INT;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS depends_on_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS paused_by_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS cycle_anchor_date DATE;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS weather_override JSONB;
ALTER TABLE sim_forecast_versions ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(128);

-- The requested recovery policy is deliberately narrow: remove broken runtime
-- artifacts while keeping wallet, inventory, cycle, NPC and user data.
DELETE FROM sim_queue;
DELETE FROM sim_diary;
DELETE FROM sim_rationale;
DELETE FROM sim_factual_events;
DELETE FROM sim_observer_batches;
DELETE FROM sim_forecast_edges;
DELETE FROM sim_forecast_nodes;
DELETE FROM sim_forecast_mutations;
DELETE FROM sim_forecast_versions;
DELETE FROM sim_forecast_days;
DELETE FROM user_memories_digests WHERE stream_type = 'LIFE_DIARY';

UPDATE sim_state
SET location_id = 'petrogradka_home',
    needs = '{"hunger":20,"fatigue":10,"boredom":30,"horny":40,"hygiene":90,"bladder":0}'::jsonb,
    active_modifiers = '[]'::jsonb,
    weather_override = NULL,
    last_tick_at = NOW(),
    cycle_anchor_date = COALESCE(cycle_anchor_date, CURRENT_DATE - GREATEST(0, COALESCE((physiology->>'cycle_day')::int, 3) - 1)),
    updated_at = NOW()
WHERE id = 1;

-- Old duplicate active rows are intentionally not archived per the selected
-- recovery policy. They were removed above before constraints are installed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_queue_idempotency_key
    ON sim_queue (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_queue_active_scope
    ON sim_queue (active_scope_key)
    WHERE active_scope_key IS NOT NULL
      AND status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY');
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_queue_parent_dependency_order
    ON sim_queue (parent_task_id, dependency_order)
    WHERE parent_task_id IS NOT NULL AND dependency_order IS NOT NULL;

CREATE TABLE IF NOT EXISTS sim_factual_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL,
    root_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL,
    importance INT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    before_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sim_factual_events_time ON sim_factual_events (occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sim_observer_batches (
    id BIGSERIAL PRIMARY KEY,
    trigger VARCHAR(64) NOT NULL,
    event_ids BIGINT[] NOT NULL DEFAULT '{}',
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    raw_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    narrative TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sim_observer_batches_time ON sim_observer_batches (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sim_admin_mutations (
    request_id VARCHAR(255) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
