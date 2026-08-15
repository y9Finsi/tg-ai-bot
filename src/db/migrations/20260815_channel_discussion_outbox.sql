CREATE TABLE IF NOT EXISTS channel_discussion_threads (
    channel_id VARCHAR(255) NOT NULL,
    root_message_id BIGINT NOT NULL,
    source_post_message_id BIGINT,
    post_text TEXT NOT NULL DEFAULT '',
    thread_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    reply_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, root_message_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_discussion_threads_updated
    ON channel_discussion_threads (channel_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS channel_processed_messages (
    channel_id VARCHAR(255) NOT NULL,
    message_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, message_id)
);

CREATE TABLE IF NOT EXISTS channel_publication_outbox (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    channel_id VARCHAR(255) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'SENDING',
    telegram_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
