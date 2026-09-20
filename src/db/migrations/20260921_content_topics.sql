CREATE TABLE IF NOT EXISTS content_topics (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    situation TEXT NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'spb_life',
    media_id BIGINT REFERENCES lera_content(id) ON DELETE SET NULL,
    media_url TEXT,
    source_url TEXT,
    source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
    status VARCHAR(32) NOT NULL DEFAULT 'NEW',
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    used_in_surface VARCHAR(32),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_topics_status_expires
    ON content_topics (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_content_topics_category
    ON content_topics (category);
