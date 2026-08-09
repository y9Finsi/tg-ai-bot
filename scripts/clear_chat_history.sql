BEGIN;

DELETE FROM chat_history;
DELETE FROM conversation_events;

COMMIT;
