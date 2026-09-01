-- Migration 011: Complete Legacy Memories Migration into Canonical memory_fact
-- Copies any active or unmigrated user_memories into memory_fact and enqueues outbox sync.

DO $complete_legacy_migration$
BEGIN
    IF to_regclass('public.user_memories') IS NOT NULL THEN
        -- Insert missing active memories
        INSERT INTO memory_fact (
            user_id,
            memory_type,
            schema_version,
            payload,
            normalized_text,
            valid_from,
            observed_at,
            confidence,
            importance,
            provenance,
            content_hash,
            idempotency_key,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            legacy.user_id,
            'PROFILE',
            1,
            jsonb_build_object(
                'text', COALESCE(NULLIF(btrim(legacy.fact), ''), '[legacy memory]'),
                'legacy_fact', legacy.fact,
                'legacy_memory_id', legacy.id
            ),
            COALESCE(NULLIF(btrim(legacy.fact), ''), '[legacy memory]'),
            COALESCE(legacy.created_at, NOW()),
            COALESCE(legacy.created_at, NOW()),
            0.600,
            60,
            jsonb_build_object(
                'source', 'legacy_user_memories',
                'source_kind', 'LEGACY_MIGRATION',
                'legacy_table', 'user_memories',
                'legacy_memory_id', legacy.id
            ),
            md5(concat_ws(
                E'\x1f',
                'PROFILE',
                legacy.user_id::text,
                legacy.id::text,
                COALESCE(legacy.fact, '')
            )),
            'legacy:user_memories:' || legacy.id::text,
            legacy.is_active,
            COALESCE(legacy.created_at, NOW()),
            COALESCE(legacy.created_at, NOW())
        FROM user_memories legacy
        ON CONFLICT (user_id, idempotency_key) DO NOTHING;

        -- Enqueue outbox items for Semantica sync if memory_outbox exists
        IF to_regclass('public.memory_outbox') IS NOT NULL THEN
            INSERT INTO memory_outbox (
                user_id,
                memory_fact_id,
                operation,
                payload,
                status,
                idempotency_key
            )
            SELECT
                mf.user_id,
                mf.id,
                'UPSERT',
                jsonb_build_object(
                    'id', mf.id,
                    'user_id', mf.user_id,
                    'text', mf.normalized_text,
                    'memory_type', mf.memory_type,
                    'importance', mf.importance,
                    'confidence', mf.confidence,
                    'is_active', mf.is_active
                ),
                'PENDING',
                'migration:011:legacy:' || mf.id::text
            FROM memory_fact mf
            WHERE mf.provenance->>'source_kind' = 'LEGACY_MIGRATION'
              AND mf.is_active = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM memory_outbox mo
                  WHERE mo.memory_fact_id = mf.id AND mo.operation = 'UPSERT'
              );
        END IF;
    END IF;
END
$complete_legacy_migration$;
