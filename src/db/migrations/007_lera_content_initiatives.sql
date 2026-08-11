CREATE TABLE IF NOT EXISTS lera_content (
    id BIGSERIAL PRIMARY KEY,
    telegram_type VARCHAR(16) NOT NULL CHECK (telegram_type IN ('audio', 'video', 'animation', 'document', 'photo', 'link')),
    telegram_file_id TEXT,
    url TEXT,
    description TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    allow_in_dialogue BOOLEAN NOT NULL DEFAULT TRUE,
    allow_initiative BOOLEAN NOT NULL DEFAULT TRUE,
    source_channel_id BIGINT,
    source_message_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (telegram_file_id IS NOT NULL OR url IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lera_content_source
    ON lera_content (source_channel_id, source_message_id)
    WHERE source_channel_id IS NOT NULL AND source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lera_content_available
    ON lera_content (enabled, allow_in_dialogue, allow_initiative, id);

CREATE INDEX IF NOT EXISTS idx_conversation_events_content_id
    ON conversation_events (user_id, ((metadata->>'content_id')::bigint))
    WHERE event_type = 'CONTENT' AND status = 'COMPLETED' AND metadata ? 'content_id';

CREATE INDEX IF NOT EXISTS idx_conversation_events_initiative_anchor
    ON conversation_events (user_id, ((metadata->>'anchor_event_id')::bigint), (metadata->>'kind'))
    WHERE event_type = 'INITIATIVE' AND status = 'COMPLETED';
