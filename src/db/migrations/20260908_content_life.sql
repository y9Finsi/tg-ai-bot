CREATE TABLE IF NOT EXISTS content_sources (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, source_type TEXT NOT NULL,
    url_or_handle TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
    topics JSONB NOT NULL DEFAULT '[]'::jsonb, last_cursor TEXT,
    last_success_at TIMESTAMPTZ, last_error TEXT,
    consecutive_errors INT NOT NULL DEFAULT 0,
    check_interval_minutes INT NOT NULL DEFAULT 180,
    is_trusted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_type, url_or_handle)
);
CREATE TABLE IF NOT EXISTS content_discoveries (
    id SERIAL PRIMARY KEY, source_id INT REFERENCES content_sources(id) ON DELETE SET NULL,
    external_id TEXT, canonical_url TEXT NOT NULL, title TEXT, raw_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, category TEXT, interest_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    mood_tags JSONB NOT NULL DEFAULT '[]'::jsonb, lifecycle_status TEXT NOT NULL DEFAULT 'DISCOVERED',
    retention_policy TEXT NOT NULL DEFAULT 'temporary', expires_at TIMESTAMPTZ,
    lera_content_id INT, viewed_at TIMESTAMPTZ,
    rejection_reason TEXT, quality_score NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(canonical_url)
);
CREATE INDEX IF NOT EXISTS content_discoveries_status_idx ON content_discoveries(lifecycle_status, created_at DESC);
CREATE TABLE IF NOT EXISTS content_browse_sessions (
    id SERIAL PRIMARY KEY, radiant_task_id BIGINT, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ, state_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'OPEN'
);
CREATE TABLE IF NOT EXISTS content_browse_decisions (
    id SERIAL PRIMARY KEY, session_id INT NOT NULL REFERENCES content_browse_sessions(id) ON DELETE CASCADE,
    discovery_id INT NOT NULL REFERENCES content_discoveries(id) ON DELETE CASCADE,
    decision TEXT NOT NULL, target_user_id BIGINT, target_surface TEXT,
    followup_job_id TEXT, content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, discovery_id)
);
CREATE TABLE IF NOT EXISTS content_usage (
    id SERIAL PRIMARY KEY, content_id INT, user_id BIGINT, surface TEXT, used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), result TEXT
);
CREATE TABLE IF NOT EXISTS content_scrape_runs (
    id SERIAL PRIMARY KEY, source_id INT REFERENCES content_sources(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'RUNNING', started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ,
    found_count INT NOT NULL DEFAULT 0, new_count INT NOT NULL DEFAULT 0, duplicate_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0, error TEXT
);

-- Safe migrations for existing tables
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS consecutive_errors INT NOT NULL DEFAULT 0;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS check_interval_minutes INT NOT NULL DEFAULT 180;
ALTER TABLE content_sources ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE content_discoveries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE content_discoveries ADD COLUMN IF NOT EXISTS quality_score NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS content_usage_user_content_idx ON content_usage(user_id, content_id);
CREATE INDEX IF NOT EXISTS content_scrape_runs_source_idx ON content_scrape_runs(source_id, started_at DESC);
