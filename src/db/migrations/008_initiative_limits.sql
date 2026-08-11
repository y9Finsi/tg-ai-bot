ALTER TABLE users
    ADD COLUMN IF NOT EXISTS initiative_limit INTEGER;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_initiative_limit_check;

ALTER TABLE users
    ADD CONSTRAINT users_initiative_limit_check
    CHECK (initiative_limit IS NULL OR (initiative_limit >= 0 AND initiative_limit <= 20));
