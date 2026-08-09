-- Existing-install migration for Strict Radiant. Safe to run repeatedly.
DO $$
BEGIN
    IF to_regclass('public.sim_schedule_slots') IS NOT NULL THEN
        INSERT INTO sim_rationale (category, title, explanation, payload)
        SELECT 'LEGACY_MIGRATION', 'Импортирован фактический лог старого расписания',
               COALESCE(actual_log::text, planned_action),
               jsonb_build_object('legacy_slot_id', id, 'location_id', location_id, 'status', status)
        FROM sim_schedule_slots
        WHERE actual_log IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM sim_rationale r
              WHERE r.category = 'LEGACY_MIGRATION'
                AND r.payload->>'legacy_slot_id' = sim_schedule_slots.id::text
          );
    END IF;
END $$;

-- Older bootstrap versions used the unprefixed names. Preserve only rows that
-- contain an actual log, then remove the planning tables as well.
DO $$
BEGIN
    IF to_regclass('public.schedule_slots') IS NOT NULL THEN
        INSERT INTO sim_rationale (category, title, explanation, payload)
        SELECT 'LEGACY_MIGRATION', 'Импортирован фактический лог старого расписания',
               COALESCE(actual_log::text, planned_action),
               jsonb_build_object('legacy_slot_id', id, 'location_id', location_id, 'status', status)
        FROM schedule_slots
        WHERE actual_log IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM sim_rationale r
              WHERE r.category = 'LEGACY_MIGRATION'
                AND r.payload->>'legacy_slot_id' = schedule_slots.id::text
          );
    END IF;
END $$;

DROP TABLE IF EXISTS sim_schedule_slots CASCADE;
DROP TABLE IF EXISTS sim_schedule_days CASCADE;
DROP TABLE IF EXISTS schedule_slots CASCADE;
DROP TABLE IF EXISTS schedule_days CASCADE;

ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS prompt_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS completion_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS total_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0;
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS command_gate_status VARCHAR(32);
ALTER TABLE prompt_logs ADD COLUMN IF NOT EXISTS command_gate_reason TEXT;
