-- One-time archive migration from the retired chat_history read model.
-- Existing conversation_events remain authoritative and are never mixed with
-- an older partial history for the same user.
INSERT INTO conversation_events (
    user_id,
    event_type,
    role,
    content,
    occurred_at,
    timezone,
    local_date,
    gap_seconds,
    gap_label,
    calendar_day_changed,
    conversation_day,
    status,
    metadata,
    processed_at
)
SELECT
    history.user_id,
    'MESSAGE',
    CASE WHEN history.role IN ('assistant', 'lera') THEN 'lera' ELSE 'user' END,
    history.content,
    history.created_at AT TIME ZONE 'Europe/Moscow',
    'Europe/Moscow',
    (history.created_at AT TIME ZONE 'Europe/Moscow' AT TIME ZONE 'Europe/Moscow')::date,
    0,
    'D:0',
    FALSE,
    1,
    'COMPLETED',
    jsonb_build_object('source', 'chat_history_migration', 'legacy_chat_history_id', history.id),
    NOW()
FROM chat_history history
WHERE NOT EXISTS (
    SELECT 1
    FROM conversation_events events
    WHERE events.user_id = history.user_id
)
AND NOT EXISTS (
    SELECT 1
    FROM conversation_events imported
    WHERE imported.metadata ->> 'legacy_chat_history_id' = history.id::text
);
