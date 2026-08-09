ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_successful_tick_at TIMESTAMPTZ;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_tick_error TEXT;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_tick_duration_ms INT;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS worker_instance_id VARCHAR(128);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS runtime_recovery_version VARCHAR(64);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS runtime_reset_at TIMESTAMPTZ;
