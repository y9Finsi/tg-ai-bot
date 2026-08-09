-- Persisted God Mode controls and request idempotency for existing installs.
-- This is separate from the recovery reset so an already-applied 002 migration
-- still receives the late schema additions exactly once.

ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS weather_override JSONB;

CREATE TABLE IF NOT EXISTS sim_admin_mutations (
    request_id VARCHAR(255) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_successful_tick_at TIMESTAMPTZ;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_tick_error TEXT;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_tick_duration_ms INT;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS worker_instance_id VARCHAR(128);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS runtime_recovery_version VARCHAR(64);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS runtime_reset_at TIMESTAMPTZ;
