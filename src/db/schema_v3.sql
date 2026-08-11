-- Strict Radiant LERA Engine schema. All statements are idempotent for existing installs.

CREATE TABLE IF NOT EXISTS sim_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    location_id VARCHAR(64) NOT NULL DEFAULT 'petrogradka_home',
    needs JSONB NOT NULL DEFAULT '{"hunger":20,"fatigue":10,"boredom":30,"horny":40,"bladder":0,"hygiene":90}'::jsonb,
    physiology JSONB NOT NULL DEFAULT '{"cycle_day":3,"arousal_level":20,"irritation":0,"refractory_period":false}'::jsonb,
    wallet_rubles INT NOT NULL DEFAULT 3820,
    wallet_stars INT NOT NULL DEFAULT 150,
    active_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    personality JSONB NOT NULL DEFAULT '{"discipline":55,"sociability":55,"procrastination":35,"homebody":45,"spontaneity":30,"rainSensitivity":50}'::jsonb,
    weather_override JSONB,
    cycle_anchor_date DATE,
    last_successful_tick_at TIMESTAMPTZ,
    last_tick_error TEXT,
    last_tick_duration_ms INT,
    worker_instance_id VARCHAR(128),
    runtime_recovery_version VARCHAR(64),
    runtime_reset_at TIMESTAMPTZ,
    last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS cycle_anchor_date DATE;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS personality JSONB NOT NULL DEFAULT '{"discipline":55,"sociability":55,"procrastination":35,"homebody":45,"spontaneity":30,"rainSensitivity":50}'::jsonb;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS weather_override JSONB;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_successful_tick_at TIMESTAMPTZ;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_tick_error TEXT;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS last_tick_duration_ms INT;
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS worker_instance_id VARCHAR(128);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS runtime_recovery_version VARCHAR(64);
ALTER TABLE sim_state ADD COLUMN IF NOT EXISTS runtime_reset_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sim_inventory (
    id BIGSERIAL PRIMARY KEY,
    item_id VARCHAR(64) NOT NULL,
    item_type VARCHAR(32) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    quantity INT NOT NULL DEFAULT 1,
    is_equipped BOOLEAN DEFAULT FALSE
);

-- Existing installations may contain duplicate legacy inventory rows. Collapse
-- them before adding the natural-key index so schema initialization remains
-- idempotent and does not prevent the queue migrations below from running.
WITH duplicate_groups AS (
    SELECT item_id, MIN(id) AS keeper_id, SUM(quantity) AS total_quantity, BOOL_OR(is_equipped) AS any_equipped
    FROM sim_inventory
    GROUP BY item_id
    HAVING COUNT(*) > 1
)
UPDATE sim_inventory inventory
SET quantity = duplicate_groups.total_quantity,
    is_equipped = duplicate_groups.any_equipped
FROM duplicate_groups
WHERE inventory.id = duplicate_groups.keeper_id;

DELETE FROM sim_inventory duplicate
USING sim_inventory keeper
WHERE duplicate.item_id = keeper.item_id
  AND duplicate.id > keeper.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_inventory_item_id ON sim_inventory (item_id);

CREATE TABLE IF NOT EXISTS sim_queue (
    id BIGSERIAL PRIMARY KEY,
    parent_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL,
    root_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL,
    priority INT NOT NULL DEFAULT 10,
    task_type VARCHAR(64) NOT NULL,
    target_location VARCHAR(64) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 30,
    remaining_minutes INT NOT NULL DEFAULT 30,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    created_by VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    importance INT NOT NULL DEFAULT 1,
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    transit_from_location VARCHAR(64),
    transit_to_location VARCHAR(64),
    transit_started_at TIMESTAMPTZ,
    transit_route JSONB,
    transit_progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS parent_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS root_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS importance INT NOT NULL DEFAULT 1;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS transit_from_location VARCHAR(64);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS transit_to_location VARCHAR(64);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS transit_started_at TIMESTAMPTZ;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS transit_route JSONB;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS transit_progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS active_scope_key VARCHAR(255);
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS dependencies_expanded_at TIMESTAMPTZ;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS dependency_order INT;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS depends_on_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS paused_by_task_id BIGINT REFERENCES sim_queue(id) ON DELETE SET NULL;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sim_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_sim_queue_live_priority ON sim_queue (priority DESC, created_at DESC)
    WHERE status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY');

CREATE TABLE IF NOT EXISTS sim_npc_state (
    npc_id VARCHAR(64) PRIMARY KEY,
    state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_diary (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_log TEXT NOT NULL,
    llm_narrative TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS sim_rationale (
    id BIGSERIAL PRIMARY KEY,
    category VARCHAR(48) NOT NULL,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sim_rationale_time ON sim_rationale (created_at DESC);

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

CREATE TABLE IF NOT EXISTS sim_commitments (
    id BIGSERIAL PRIMARY KEY,
    commitment_key VARCHAR(160) NOT NULL UNIQUE,
    type VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
    priority INT NOT NULL DEFAULT 0,
    commitment_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ,
    planned_start TIMESTAMPTZ,
    duration_minutes INT NOT NULL DEFAULT 30,
    preparation_minutes INT NOT NULL DEFAULT 0,
    travel_minutes INT NOT NULL DEFAULT 0,
    target_location VARCHAR(64) NOT NULL DEFAULT 'petrogradka_home',
    origin VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    consequence_on_miss VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sim_commitments_live ON sim_commitments (commitment_date, status, priority DESC);

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

CREATE TABLE IF NOT EXISTS sim_forecast_days (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sim_forecast_versions (
    id BIGSERIAL PRIMARY KEY,
    forecast_day_id BIGINT NOT NULL REFERENCES sim_forecast_days(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    source VARCHAR(64) NOT NULL,
    mutation_reason TEXT,
    fingerprint VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(forecast_day_id, version_number)
);
ALTER TABLE sim_forecast_versions ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(128);
CREATE TABLE IF NOT EXISTS sim_forecast_nodes (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL REFERENCES sim_forecast_versions(id) ON DELETE CASCADE,
    intent_key VARCHAR(80) NOT NULL,
    task_type VARCHAR(64) NOT NULL,
    location_id VARCHAR(64) NOT NULL,
    planned_start TIMESTAMPTZ,
    planned_duration_minutes INT NOT NULL DEFAULT 30,
    status VARCHAR(24) NOT NULL DEFAULT 'FORECAST',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS sim_forecast_edges (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL REFERENCES sim_forecast_versions(id) ON DELETE CASCADE,
    from_node_id BIGINT NOT NULL REFERENCES sim_forecast_nodes(id) ON DELETE CASCADE,
    to_node_id BIGINT NOT NULL REFERENCES sim_forecast_nodes(id) ON DELETE CASCADE,
    edge_type VARCHAR(32) NOT NULL DEFAULT 'INTENT'
);
CREATE TABLE IF NOT EXISTS sim_forecast_mutations (
    id BIGSERIAL PRIMARY KEY,
    forecast_day_id BIGINT NOT NULL REFERENCES sim_forecast_days(id) ON DELETE CASCADE,
    from_version_id BIGINT REFERENCES sim_forecast_versions(id) ON DELETE SET NULL,
    to_version_id BIGINT NOT NULL REFERENCES sim_forecast_versions(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    source VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prompt/audit tables are shared with the rest of the bot.
CREATE TABLE IF NOT EXISTS user_memories_digests (
    id BIGSERIAL PRIMARY KEY, digest_type VARCHAR(16) NOT NULL, stream_type VARCHAR(16) NOT NULL,
    period_label VARCHAR(32) NOT NULL, summary_text TEXT NOT NULL, user_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_memories_digests ADD COLUMN IF NOT EXISTS user_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_memories_digests_period ON user_memories_digests (digest_type, stream_type, period_label, user_id) NULLS NOT DISTINCT;
CREATE TABLE IF NOT EXISTS prompt_logs (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, kind VARCHAR(32) NOT NULL DEFAULT 'CHAT', mode VARCHAR(32), model VARCHAR(160), provider_name VARCHAR(120), user_text TEXT, system_prompt TEXT, radiant_context TEXT, messages JSONB NOT NULL DEFAULT '[]'::jsonb, state_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, memory_used JSONB NOT NULL DEFAULT '[]'::jsonb, raw_response TEXT, parsed_response TEXT, usage JSONB NOT NULL DEFAULT '{}'::jsonb, generation_trace JSONB NOT NULL DEFAULT '[]'::jsonb, prompt_tokens INT NOT NULL DEFAULT 0, completion_tokens INT NOT NULL DEFAULT 0, total_tokens INT NOT NULL DEFAULT 0, cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0, command_gate_status VARCHAR(32), command_gate_reason TEXT, latency_ms INT NOT NULL DEFAULT 0, is_photo_request BOOLEAN NOT NULL DEFAULT FALSE, error_text TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS surface VARCHAR(24);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS profile_version BIGINT;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS judge_mode VARCHAR(16);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS judge_verdict VARCHAR(32);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS judge_code VARCHAR(64);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS generation_trace JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS prompt_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS completion_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS total_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS command_gate_status VARCHAR(32);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS command_gate_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_prompt_logs_user_time ON prompt_logs (user_id, created_at DESC);

-- Isolated Advanced AI Sandbox records. They are deliberately separate from
-- production chat history, memories, state, billing, Telegram, and prompt logs.
CREATE TABLE IF NOT EXISTS sandbox_presets (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slot VARCHAR(32),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_presets_updated ON sandbox_presets (updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sandbox_runs (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(24) NOT NULL,
    request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_created ON sandbox_runs (created_at DESC, id DESC);

ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS sampling_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO sim_state (id, location_id, needs, physiology, wallet_rubles, wallet_stars, active_modifiers, cycle_anchor_date)
VALUES (1, 'petrogradka_home', '{"hunger":20,"fatigue":10,"boredom":30,"horny":40,"bladder":0,"hygiene":90}'::jsonb, '{"cycle_day":3,"arousal_level":20,"irritation":0,"refractory_period":false}'::jsonb, 3820, 150, '[]'::jsonb, (CURRENT_DATE - 2))
ON CONFLICT (id) DO NOTHING;
UPDATE sim_state SET cycle_anchor_date = COALESCE(cycle_anchor_date, CURRENT_DATE - GREATEST(0, COALESCE((physiology->>'cycle_day')::int, 3) - 1)) WHERE id = 1;
UPDATE sim_state SET needs = needs - 'mood';
UPDATE sim_state SET physiology = '{"cycle_day":3,"arousal_level":20,"irritation":0,"refractory_period":false}'::jsonb || physiology WHERE id = 1;

INSERT INTO sim_inventory (item_id, item_type, properties, quantity, is_equipped) VALUES
('oversize_tshirt', 'clothes', '{"warmth":10,"rain_resist":false,"location_type":"home","slot":"top"}'::jsonb, 1, true),
('trench_coat', 'clothes', '{"warmth":20,"rain_resist":true,"location_type":"street","slot":"outer"}'::jsonb, 1, false),
('black_jeans', 'clothes', '{"warmth":15,"rain_resist":false,"location_type":"street","slot":"bottom"}'::jsonb, 1, true),
('white_sneakers', 'clothes', '{"warmth":8,"rain_resist":false,"location_type":"street","slot":"shoes"}'::jsonb, 1, true),
('cheese_ramen', 'food', '{"hunger_restore":50}'::jsonb, 2, false),
('satisfyer', 'toy', '{"horny_restore":80,"fatigue_add":15,"charge":100}'::jsonb, 1, false)
ON CONFLICT (item_id) DO NOTHING;
INSERT INTO sim_npc_state (npc_id, state_json) VALUES
('nastya', '{"drama_level":40,"friendship_score":85,"cooldown_until":null}'::jsonb),
('max_client', '{"deadline_urgency":20,"satisfaction":75,"cooldown_until":null}'::jsonb)
ON CONFLICT DO NOTHING;
