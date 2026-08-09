INSERT INTO settings (key, value)
VALUES
    ('llm_temperature', '0.7'),
    ('llm_presence_penalty', '0.1'),
    ('llm_frequency_penalty', '0.1')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;
