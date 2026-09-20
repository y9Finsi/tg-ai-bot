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
    scheduled_for TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    used_in_surface VARCHAR(32),
    target_user_id BIGINT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_topics_status_expires
    ON content_topics (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_content_topics_category
    ON content_topics (category);

CREATE TABLE IF NOT EXISTS pending_stories (
    id BIGSERIAL PRIMARY KEY,
    topic_id BIGINT REFERENCES content_topics(id) ON DELETE SET NULL,
    surface VARCHAR(32) NOT NULL DEFAULT 'DM',
    user_id BIGINT,
    hook_text TEXT NOT NULL,
    story_steps JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(64) NOT NULL DEFAULT 'WAITING_TRIGGER',
    hook_sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    jev_emotions JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_stories_user_status
    ON pending_stories (user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_stories_surface_status
    ON pending_stories (surface, status);
