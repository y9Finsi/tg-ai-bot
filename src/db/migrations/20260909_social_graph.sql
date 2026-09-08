-- Migration 20260909_social_graph: Social graph, mutual group tracking, and friend message relays

-- 1. Passive tracking of participants in group chats
CREATE TABLE IF NOT EXISTS group_participants (
    chat_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_participants_user ON group_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_username ON group_participants(LOWER(username));

-- 2. Social edges between users (friends, referrals, explicit bonds)
CREATE TABLE IF NOT EXISTS user_social_edges (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    friend_user_id BIGINT,
    friend_username VARCHAR(100),
    friend_first_name VARCHAR(100),
    relation_source VARCHAR(32) NOT NULL, -- 'mutual_group', 'referral', 'explicit'
    source_context_id BIGINT,              -- chat_id or referral_id
    is_confirmed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_social_edge UNIQUE (user_id, friend_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_social_edges_lookup
    ON user_social_edges(user_id, LOWER(friend_first_name));

-- 3. Social message relays and directed gossip
CREATE TABLE IF NOT EXISTS social_relays (
    id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL,
    target_id BIGINT NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    target_name_raw VARCHAR(100) NOT NULL,
    relay_type VARCHAR(32) NOT NULL DEFAULT 'DIRECT_MESSAGE',
    message_content TEXT NOT NULL,
    vibe_tag VARCHAR(50),
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'delivered', 'expired', 'canceled'
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_relays_pending
    ON social_relays(target_id, status, scheduled_for);
