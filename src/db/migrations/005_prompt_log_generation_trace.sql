-- One canonical prompt log now keeps the full retry/fallback chain so the
-- admin inspector can explain the generated answer without correlating rows.
ALTER TABLE prompt_logs
    ADD COLUMN IF NOT EXISTS generation_trace JSONB NOT NULL DEFAULT '[]'::jsonb;
