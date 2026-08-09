CREATE TABLE IF NOT EXISTS user_relationships (
    user_id BIGINT PRIMARY KEY,
    trust NUMERIC(6, 2) NOT NULL DEFAULT 50 CHECK (trust >= 0 AND trust <= 100),
    affection NUMERIC(6, 2) NOT NULL DEFAULT 50 CHECK (affection >= 0 AND affection <= 100),
    irritation NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (irritation >= 0 AND irritation <= 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationship_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_type VARCHAR(24) NOT NULL,
    intensity NUMERIC(4, 3) NOT NULL DEFAULT 0 CHECK (intensity >= 0 AND intensity <= 1),
    trust_delta NUMERIC(6, 2) NOT NULL DEFAULT 0,
    affection_delta NUMERIC(6, 2) NOT NULL DEFAULT 0,
    irritation_delta NUMERIC(6, 2) NOT NULL DEFAULT 0,
    source_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationship_events_user_time
    ON relationship_events (user_id, created_at DESC);
