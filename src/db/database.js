import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { publishDevtoolEvent } from '../devtools/event_bus.js';
import { normalizeTopicDistribution } from '../channel_topics.js';
import { applyRelationshipDelta, DEFAULT_RELATIONSHIP, relationshipDecay, normalizeRelationship } from '../ai/relationship.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 25,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
});

pool.on('error', (err) => {
    console.error('❌ Критическая ошибка пула PostgreSQL:', err.message);
});

export { pool };

export async function initDatabaseTables() {
    try {
        console.log("🛠️ [DB SCHEMA] Проверка и авто-создание таблиц PostgreSQL...");

        const schemaV3Path = path.join(__dirname, 'schema_v3.sql');
        if (fs.existsSync(schemaV3Path)) {
            const schemaV3Sql = fs.readFileSync(schemaV3Path, 'utf8');
            await query(schemaV3Sql);
            console.log("⚡ [DB SCHEMA V3] Таблицы Radiant LERA Engine (sim_state, sim_inventory, sim_queue, sim_npc_state, sim_diary) применены!");
        }

        await query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(128) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const migrationDir = path.join(__dirname, 'migrations');
        const migrationFiles = fs.existsSync(migrationDir)
            ? fs.readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort()
            : [];
        for (const migrationFile of migrationFiles) {
            const migrationVersion = migrationFile.replace(/\.sql$/i, '');
            const applied = await query('SELECT 1 FROM schema_migrations WHERE version = $1', [migrationVersion]);
            if (applied.rowCount > 0) continue;
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(fs.readFileSync(path.join(migrationDir, migrationFile), 'utf8'));
                await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migrationVersion]);
                await client.query('COMMIT');
                console.log(`⚡ [DB MIGRATION] ${migrationFile} applied.`);
            } catch (migrationError) {
                await client.query('ROLLBACK');
                throw migrationError;
            } finally {
                client.release();
            }
        }

        await query(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                username VARCHAR(100),
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                free_requests_left INT DEFAULT 10,
                image_balance INT DEFAULT 0,
                is_premium BOOLEAN DEFAULT FALSE,
                is_blocked BOOLEAN DEFAULT FALSE,
                current_prompt TEXT,
                roleplay_mode VARCHAR(50) DEFAULT 'flirthot',
                accepted_terms BOOLEAN DEFAULT FALSE,
                total_spent NUMERIC DEFAULT 0,
                promo_24h_sent BOOLEAN DEFAULT FALSE,
                promo_store_sent BOOLEAN DEFAULT FALSE,
                bonus_notified BOOLEAN DEFAULT FALSE,
                store_opened_at TIMESTAMP,
                last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_daily_bonus_at TIMESTAMP,
                last_recommendation_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const userColumns = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS free_requests_left INT DEFAULT 10;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS image_balance INT DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_prompt TEXT;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS roleplay_mode VARCHAR(50) DEFAULT 'flirthot';",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spent NUMERIC DEFAULT 0;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_24h_sent BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_store_sent BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_notified BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS store_opened_at TIMESTAMP;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus_at TIMESTAMP;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_recommendation_at TIMESTAMP;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id BIGINT;",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS diary_model VARCHAR(200);"
        ];

        for (const colQuery of userColumns) {
            await query(colQuery).catch(() => {});
        }

        await query(`
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS global_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_providers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT NOT NULL,
                model_name VARCHAR(100) NOT NULL,
                priority INT DEFAULT 1,
                timeout_ms INT DEFAULT 7000,
                is_active BOOLEAN DEFAULT TRUE,
                sampling_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_memories (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                fact TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS promocodes (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                max_activations INT DEFAULT 10,
                current_activations INT DEFAULT 0,
                bonus_requests INT DEFAULT 0,
                bonus_images INT DEFAULT 0,
                discount_percent INT DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                is_new_users_only BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_promocodes (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                promocode_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS channel_recommendations (
                id SERIAL PRIMARY KEY,
                channel_id BIGINT,
                post_id BIGINT,
                text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS channel_post_logs (
                id BIGSERIAL PRIMARY KEY,
                channel_id VARCHAR(255) NOT NULL,
                topic VARCHAR(64),
                text TEXT NOT NULL,
                photo_url TEXT,
                media_mode VARCHAR(32),
                provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
                telegram_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sent_recommendations (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                recommendation_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS lera_photos (
                id SERIAL PRIMARY KEY,
                file_id TEXT NOT NULL,
                caption TEXT,
                access_level VARCHAR(20) DEFAULT 'free',
                time_of_day VARCHAR(20) DEFAULT 'any',
                tags TEXT[],
                explicitness SMALLINT NOT NULL DEFAULT 0,
                outfit_tags TEXT[] NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sent_photos (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                photo_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_id BIGINT NOT NULL,
                referred_id BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                cost NUMERIC DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS conversation_events (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                event_type VARCHAR(32) NOT NULL,
                role VARCHAR(16) NOT NULL,
                content TEXT,
                occurred_at TIMESTAMPTZ NOT NULL,
                timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
                local_date DATE NOT NULL,
                gap_seconds BIGINT NOT NULL DEFAULT 0,
                gap_label VARCHAR(16) NOT NULL DEFAULT 'D:0',
                calendar_day_changed BOOLEAN NOT NULL DEFAULT FALSE,
                conversation_day INT NOT NULL DEFAULT 1,
                telegram_message_id BIGINT,
                batch_id UUID,
                status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at TIMESTAMPTZ,
                error_text TEXT
            );

            CREATE TABLE IF NOT EXISTS lera_content (
                id BIGSERIAL PRIMARY KEY,
                telegram_type VARCHAR(16) NOT NULL,
                telegram_file_id TEXT,
                url TEXT,
                description TEXT NOT NULL DEFAULT '',
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                allow_in_dialogue BOOLEAN NOT NULL DEFAULT TRUE,
                allow_initiative BOOLEAN NOT NULL DEFAULT TRUE,
                source_channel_id BIGINT,
                source_message_id BIGINT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_conversation_events_user_time
                ON conversation_events (user_id, occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_conversation_events_user_date
                ON conversation_events (user_id, local_date);
            CREATE INDEX IF NOT EXISTS idx_conversation_events_batch
                ON conversation_events (user_id, batch_id);
            CREATE INDEX IF NOT EXISTS idx_conversation_events_message
                ON conversation_events (telegram_message_id);
            CREATE INDEX IF NOT EXISTS idx_conversation_events_status
                ON conversation_events (status);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_events_telegram_message
                ON conversation_events (user_id, telegram_message_id)
                WHERE telegram_message_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount NUMERIC NOT NULL,
                currency VARCHAR(10) DEFAULT 'RUB',
                provider VARCHAR(50),
                payload TEXT,
                status VARCHAR(20) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS global_state (
                id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                location_id VARCHAR(120) NOT NULL DEFAULT 'HOME_PETROGRADKA',
                location_name TEXT NOT NULL DEFAULT 'Квартира на Петроградке',
                wallet_rubles NUMERIC NOT NULL DEFAULT 4200,
                wallet_stars NUMERIC NOT NULL DEFAULT 150,
                needs JSONB NOT NULL DEFAULT '{"hunger":20,"fatigue":10,"horny":15,"boredom":30,"hygiene":85,"bladder":10}'::jsonb,
                physiology JSONB NOT NULL DEFAULT '{"cycle_day":3,"arousal_level":0,"orgasm_threshold":70,"refractory_period":false,"refractory_until":null,"orgasm_count_today":0}'::jsonb,
                wearing JSONB NOT NULL DEFAULT '{}'::jsonb,
                inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
                active_task_id BIGINT,
                current_slot SMALLINT NOT NULL DEFAULT 0,
                current_minute SMALLINT NOT NULL DEFAULT 0,
                last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_day_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                weather JSONB NOT NULL DEFAULT '{}'::jsonb,
                version BIGINT NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS simulation_events (
                id BIGSERIAL PRIMARY KEY,
                event_type VARCHAR(64) NOT NULL,
                source_user_id BIGINT,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                importance SMALLINT NOT NULL DEFAULT 0,
                visibility VARCHAR(24) NOT NULL DEFAULT 'GLOBAL',
                idempotency_key VARCHAR(255) UNIQUE,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at TIMESTAMPTZ,
                initiative_sent_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS simulation_tasks (
                id BIGSERIAL PRIMARY KEY,
                task_type VARCHAR(64) NOT NULL,
                title TEXT NOT NULL,
                location_id VARCHAR(120),
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                ends_at TIMESTAMPTZ NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS',
                can_be_interrupted BOOLEAN NOT NULL DEFAULT TRUE,
                effects_on_finish JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_by_event_id BIGINT REFERENCES simulation_events(id),
                completed_at TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS simulation_diary (
                id BIGSERIAL PRIMARY KEY,
                date DATE NOT NULL,
                slot_number SMALLINT,
                location_id VARCHAR(120),
                event_id BIGINT REFERENCES simulation_events(id),
                thought TEXT,
                action TEXT,
                consequence TEXT,
                importance SMALLINT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS simulation_reflections (
                id BIGSERIAL PRIMARY KEY,
                date DATE UNIQUE NOT NULL,
                reflection JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id BIGSERIAL PRIMARY KEY,
                source_user_id BIGINT,
                transaction_type VARCHAR(32) NOT NULL,
                amount_rubles NUMERIC NOT NULL DEFAULT 0,
                amount_stars NUMERIC NOT NULL DEFAULT 0,
                reason TEXT,
                external_payment_id VARCHAR(255),
                idempotency_key VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            INSERT INTO global_state (id)
            VALUES (1)
            ON CONFLICT (id) DO NOTHING;

            CREATE INDEX IF NOT EXISTS idx_simulation_events_time
                ON simulation_events (occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_simulation_diary_date
                ON simulation_diary (date DESC, importance DESC);

            ALTER TABLE simulation_events ADD COLUMN IF NOT EXISTS initiative_sent_at TIMESTAMPTZ;

            ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;
            ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS sampling_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE lera_photos ADD COLUMN IF NOT EXISTS explicitness SMALLINT NOT NULL DEFAULT 0;
            ALTER TABLE lera_photos ADD COLUMN IF NOT EXISTS outfit_tags TEXT[] NOT NULL DEFAULT '{}';
            ALTER TABLE channel_post_logs ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE channel_post_logs ADD COLUMN IF NOT EXISTS telegram_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
        `);

        // Runs after CREATE TABLE payments above, otherwise these ALTERs fail on a fresh DB.
        const paymentColumns = [
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';",
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider VARCHAR(50);",
            "ALTER TABLE payments ADD COLUMN IF NOT EXISTS payload TEXT;"
        ];

        for (const colQuery of paymentColumns) {
            await query(colQuery).catch(() => {});
        }

        console.log("✅ [DB SCHEMA SUCCESS] Все таблицы и колонки PostgreSQL активны!");
    } catch (err) {
        console.error("❌ [DB SCHEMA ERROR] Ошибка авто-инициализации таблиц:", err.message);
        throw err;
    }
}

export async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            console.warn(`⚠️ [DB SLOW QUERY] (${duration}ms): ${text.slice(0, 100)}...`);
        }
        return res;
    } catch (err) {
        console.error('❌ [DB QUERY ERROR]:', err.message, '| Query:', text.slice(0, 100));
        throw err;
    }
}

export async function closeDB() {
    console.log('🔒 Закрываем пул соединений с базой данных PostgreSQL...');
    await pool.end();
}

export async function getUser(telegramId) {
    const res = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return res.rows[0] || null;
}

export async function getUserRelationship(userId, { applyDecay = true } = {}) {
    const result = await query(
        `SELECT user_id, trust, affection, irritation, updated_at
         FROM user_relationships WHERE user_id = $1`,
        [userId]
    );
    const row = result.rows[0];
    if (!row) return { user_id: userId, ...DEFAULT_RELATIONSHIP, updated_at: new Date() };
    const state = normalizeRelationship(row);
    const decayed = applyDecay ? relationshipDecay(state, (Date.now() - new Date(row.updated_at).getTime()) / 1000) : state;
    return { user_id: userId, ...decayed, updated_at: row.updated_at };
}

export async function applyUserRelationshipEvent(userId, event, sourceText = '') {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query(
            `INSERT INTO user_relationships (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO UPDATE SET updated_at = user_relationships.updated_at
             RETURNING trust, affection, irritation, updated_at`,
            [userId]
        );
        const row = current.rows[0];
        const decayed = relationshipDecay(row, (Date.now() - new Date(row.updated_at).getTime()) / 1000);
        const applied = applyRelationshipDelta(decayed, event);
        await client.query(
            `UPDATE user_relationships
             SET trust = $2, affection = $3, irritation = $4, updated_at = NOW()
             WHERE user_id = $1`,
            [userId, applied.state.trust, applied.state.affection, applied.state.irritation]
        );
        await client.query(
            `INSERT INTO relationship_events
                (user_id, event_type, intensity, trust_delta, affection_delta, irritation_delta, source_text)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, applied.event.type, applied.event.intensity, applied.deltas.trust, applied.deltas.affection, applied.deltas.irritation, sourceText || null]
        );
        await client.query('COMMIT');
        return { ...applied.state, event: applied.event, deltas: applied.deltas };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function getUserRelationshipAdmin(userId, limit = 20) {
    const [relationship, events] = await Promise.all([
        getUserRelationship(userId),
        query(
            `SELECT id, event_type, intensity, trust_delta, affection_delta, irritation_delta, source_text, created_at
             FROM relationship_events WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
            [userId, limit]
        )
    ]);
    return { relationship, events: events.rows };
}

export async function setUserRelationshipAdmin(userId, values = {}) {
    const current = await getUserRelationship(userId, { applyDecay: false });
    const next = normalizeRelationship({ ...current, ...values });
    const result = await query(
        `INSERT INTO user_relationships (user_id, trust, affection, irritation)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET trust = EXCLUDED.trust, affection = EXCLUDED.affection,
             irritation = EXCLUDED.irritation, updated_at = NOW()
         RETURNING user_id, trust, affection, irritation, updated_at`,
        [userId, next.trust, next.affection, next.irritation]
    );
    return result.rows[0];
}

export async function createUser(telegramId, username, firstName, lastName, referrerId = null) {
    const queryText = `
        INSERT INTO users (telegram_id, username, first_name, last_name, free_requests_left, referrer_id)
        VALUES ($1, $2, $3, $4, 10, $5)
        ON CONFLICT (telegram_id) DO UPDATE SET
            username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            last_active_at = CURRENT_TIMESTAMP
        RETURNING *;
    `;
    const res = await query(queryText, [telegramId, username, firstName, lastName, referrerId]);
    return res.rows[0];
}

function asEventDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function moscowDateParts(value) {
    const date = asEventDate(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(date);
    const get = (type) => parts.find(part => part.type === type)?.value || '00';
    return {
        localDate: `${get('year')}-${get('month')}-${get('day')}`,
        display: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} MSK`
    };
}

export function formatConversationGap(gapSeconds) {
    const seconds = Math.max(0, Number(gapSeconds) || 0);
    if (seconds < 60) return 'D:0';
    if (seconds < 3600) return `D:${Math.max(1, Math.floor(seconds / 60))}m`;
    if (seconds < 86400) return `D:${Math.max(1, Math.floor(seconds / 3600))}h`;
    return `D:${Math.max(1, Math.floor(seconds / 86400))}d`;
}

export async function appendConversationEvent({
    userId,
    eventType = 'SYSTEM',
    role = 'system',
    content = '',
    occurredAt = new Date(),
    telegramMessageId = null,
    batchId = null,
    metadata = {},
    status = 'PENDING'
}) {
    const eventDate = asEventDate(occurredAt);
    if (telegramMessageId !== null && telegramMessageId !== undefined) {
        const existing = await query(
            'SELECT * FROM conversation_events WHERE user_id = $1 AND telegram_message_id = $2 LIMIT 1',
            [userId, telegramMessageId]
        );
        if (existing.rows[0]) return existing.rows[0];
    }

    const previousResult = await query(
        `SELECT occurred_at, local_date, conversation_day
         FROM conversation_events
         WHERE user_id = $1 AND occurred_at <= $2
           AND status = 'COMPLETED'
         ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [userId, eventDate]
    );
    const previous = previousResult.rows[0];
    const gapSeconds = previous ? Math.max(0, Math.floor((eventDate.getTime() - new Date(previous.occurred_at).getTime()) / 1000)) : 0;
    const { localDate } = moscowDateParts(eventDate);
    const calendarDayChanged = Boolean(previous && String(previous.local_date) !== localDate);
    const conversationDay = previous
        ? Number(previous.conversation_day || 1) + (calendarDayChanged ? 1 : 0)
        : 1;

    const result = await query(
        `INSERT INTO conversation_events
            (user_id, event_type, role, content, occurred_at, timezone, local_date,
             gap_seconds, gap_label, calendar_day_changed, conversation_day,
             telegram_message_id, batch_id, status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'Europe/Moscow', $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         RETURNING *`,
        [userId, eventType, role, content || '', eventDate, localDate, gapSeconds,
            formatConversationGap(gapSeconds), calendarDayChanged, conversationDay,
            telegramMessageId, batchId, status, JSON.stringify(metadata || {})]
    );
    return result.rows[0];
}

export async function updateConversationEventStatus(eventId, status, errorText = null) {
    const result = await query(
        `UPDATE conversation_events
         SET status = $2::varchar(16), error_text = $3::text,
             processed_at = CASE WHEN $2::varchar(16) IN ('COMPLETED', 'FAILED') THEN NOW() ELSE processed_at END
         WHERE id = $1 RETURNING *`,
        [eventId, status, errorText]
    );
    return result.rows[0] || null;
}

export async function getRecentConversationEvents(userId, limit = 20) {
    const result = await query(
        `SELECT * FROM (
            SELECT * FROM conversation_events
            WHERE user_id = $1 AND status <> 'FAILED'
            ORDER BY occurred_at DESC, id DESC LIMIT $2
         ) events
         ORDER BY occurred_at ASC, id ASC`,
        [userId, limit]
    );
    return result.rows;
}

export async function getInitiativeDailyCounts(userId) {
    const result = await query(
        `SELECT
            COUNT(*) FILTER (WHERE event_type = 'INITIATIVE')::int AS initiatives,
            COUNT(*) FILTER (WHERE event_type = 'CONTENT')::int AS content
         FROM conversation_events
         WHERE user_id = $1 AND status = 'COMPLETED'
           AND local_date = (NOW() AT TIME ZONE 'Europe/Moscow')::date
           AND event_type IN ('INITIATIVE', 'CONTENT')`,
        [userId]
    );
    return {
        initiatives: Number(result.rows[0]?.initiatives || 0),
        content: Number(result.rows[0]?.content || 0)
    };
}

export async function getInitiativeSchedulerUsers(limit = 500) {
    const result = await query(
        `SELECT DISTINCT ON (e.user_id)
            e.*, u.is_blocked,
            EXTRACT(EPOCH FROM (NOW() - e.occurred_at))::bigint AS age_seconds
         FROM conversation_events e
         JOIN users u ON u.telegram_id = e.user_id
         WHERE e.status = 'COMPLETED'
           AND e.event_type IN ('MESSAGE', 'INITIATIVE', 'CONTENT')
           AND e.role IN ('user', 'lera', 'assistant')
           AND e.occurred_at >= NOW() - INTERVAL '24 hours'
         ORDER BY e.user_id, e.occurred_at DESC, e.id DESC
         LIMIT $1`,
        [limit]
    );
    return result.rows;
}

export async function getActiveDialogueEvents(userId, anchorOccurredAt = null, limit = 30) {
    const result = await query(
        `WITH ordered AS (
            SELECT e.*,
                   LAG(e.occurred_at) OVER (ORDER BY e.occurred_at, e.id) AS previous_at
            FROM conversation_events e
            WHERE e.user_id = $1 AND e.status = 'COMPLETED'
              AND e.event_type IN ('MESSAGE', 'INITIATIVE', 'CONTENT')
              AND ($2::timestamptz IS NULL OR e.occurred_at <= $2::timestamptz)
         ), grouped AS (
            SELECT ordered.*,
                   SUM(CASE WHEN previous_at IS NULL OR occurred_at - previous_at > INTERVAL '1 hour' THEN 1 ELSE 0 END)
                     OVER (ORDER BY occurred_at, id) AS dialogue_id
            FROM ordered
         )
         SELECT * FROM grouped
         WHERE dialogue_id = (SELECT MAX(dialogue_id) FROM grouped)
         ORDER BY occurred_at ASC, id ASC
         LIMIT $3`,
        [userId, anchorOccurredAt, limit]
    );
    return result.rows;
}

export async function updateConversationEventMetadata(eventId, metadata = {}) {
    const result = await query(
        `UPDATE conversation_events
         SET metadata = metadata || $2::jsonb
         WHERE id = $1 RETURNING *`,
        [eventId, JSON.stringify(metadata)]
    );
    return result.rows[0] || null;
}

export async function getCompletedEvent(eventId, userId) {
    const result = await query(
        `SELECT * FROM conversation_events
         WHERE id = $1 AND user_id = $2 AND status = 'COMPLETED' LIMIT 1`,
        [eventId, userId]
    );
    return result.rows[0] || null;
}

export async function getLatestMeaningfulEvent(userId) {
    const result = await query(
        `SELECT * FROM conversation_events
         WHERE user_id = $1 AND status = 'COMPLETED'
           AND event_type IN ('MESSAGE', 'INITIATIVE', 'CONTENT')
         ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
}

export async function hasInitiativeStage(userId, anchorEventId, kind) {
    const result = await query(
        `SELECT 1 FROM conversation_events
         WHERE user_id = $1 AND event_type = 'INITIATIVE' AND status = 'COMPLETED'
           AND metadata->>'anchor_event_id' = $2::text
           AND metadata->>'kind' = $3
         LIMIT 1`,
        [userId, anchorEventId, kind]
    );
    return result.rowCount > 0;
}

export async function getInitiativeStages(userId, anchorEventId) {
    const result = await query(
        `SELECT metadata->>'kind' AS kind
         FROM conversation_events
         WHERE user_id = $1 AND event_type = 'INITIATIVE' AND status = 'COMPLETED'
           AND metadata->>'anchor_event_id' = $2::text`,
        [userId, anchorEventId]
    );
    return result.rows.map(row => row.kind).filter(Boolean);
}

export async function addLeraContent({ telegramType, telegramFileId = null, url = null, description = '', enabled = true, allowInDialogue = true, allowInitiative = true, sourceChannelId = null, sourceMessageId = null }) {
    const result = await query(
        `INSERT INTO lera_content
            (telegram_type, telegram_file_id, url, description, enabled, allow_in_dialogue,
             allow_initiative, source_channel_id, source_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source_channel_id, source_message_id)
           WHERE source_channel_id IS NOT NULL AND source_message_id IS NOT NULL
         DO UPDATE SET telegram_type = EXCLUDED.telegram_type,
             telegram_file_id = EXCLUDED.telegram_file_id, url = EXCLUDED.url,
             description = EXCLUDED.description, updated_at = NOW()
         RETURNING *`,
        [telegramType, telegramFileId, url, description, enabled, allowInDialogue,
            allowInitiative, sourceChannelId, sourceMessageId]
    );
    return result.rows[0];
}

export async function getLeraContent(id) {
    const result = await query('SELECT * FROM lera_content WHERE id = $1', [id]);
    return result.rows[0] || null;
}

export async function getAllLeraContent() {
    const result = await query('SELECT * FROM lera_content ORDER BY id DESC');
    return result.rows;
}

export async function updateLeraContent(id, fields = {}) {
    const current = await getLeraContent(id);
    if (!current) return null;
    const result = await query(
        `UPDATE lera_content SET description = $2, enabled = $3,
             allow_in_dialogue = $4, allow_initiative = $5, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, fields.description ?? current.description, fields.enabled ?? current.enabled,
            fields.allow_in_dialogue ?? current.allow_in_dialogue,
            fields.allow_initiative ?? current.allow_initiative]
    );
    return result.rows[0] || null;
}

export async function deleteLeraContent(id) {
    const result = await query('DELETE FROM lera_content WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
}

export async function getContentCandidates(userId, source, limit = 4) {
    const allowColumn = source === 'initiative' ? 'allow_initiative' : 'allow_in_dialogue';
    const result = await query(
        `SELECT c.* FROM lera_content c
         WHERE c.enabled = TRUE AND c.${allowColumn} = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM conversation_events e
             WHERE e.user_id = $1 AND e.event_type = 'CONTENT' AND e.status = 'COMPLETED'
               AND e.metadata->>'content_id' = c.id::text
           )
         ORDER BY RANDOM() LIMIT $2`,
        [userId, limit]
    );
    return result.rows;
}

export async function wasContentSent(userId, contentId) {
    const result = await query(
        `SELECT 1 FROM conversation_events
         WHERE user_id = $1 AND event_type = 'CONTENT' AND status = 'COMPLETED'
           AND metadata->>'content_id' = $2::text LIMIT 1`,
        [userId, contentId]
    );
    return result.rowCount > 0;
}

export function formatConversationEvent(event) {
    const gap = event.gap_label || formatConversationGap(event.gap_seconds);
    const occurred = moscowDateParts(event.occurred_at).display;
    const role = event.role || 'system';
    const type = event.event_type || 'SYSTEM';
    const metadata = event.metadata && typeof event.metadata === 'string'
        ? (() => { try { return JSON.parse(event.metadata); } catch { return {}; } })()
        : (event.metadata || {});

    if (type === 'MESSAGE') {
        return `[${gap}][M:${role}][${occurred}]: ${event.content || ''}`;
    }
    if (type === 'INITIATIVE') {
        return `[${gap}][M:${role}][INITIATIVE][${occurred}]: ${event.content || ''}`;
    }
    if (type === 'REACTION') return `[${gap}][R:${metadata.emoji || event.content || ''}][actor:${role}]: ${event.content || ''}`;
    if (type === 'PHOTO' || type === 'VOICE' || type === 'STICKER') {
        return `[${gap}][${type}:${role}]${metadata.caption ? `[caption: ${metadata.caption}]` : ''}: ${event.content || ''}`;
    }
    const details = Object.entries(metadata)
        .filter(([key]) => !['telegram_message_id'].includes(key))
        .map(([key, value]) => `[${key}: ${value}]`).join('');
    return `[${gap}][${type}]${details}: ${event.content || ''}`;
}

export async function clearConversationEvents(userId) {
    const result = await query('DELETE FROM conversation_events WHERE user_id = $1', [userId]);
    return result.rowCount;
}

export async function getActiveMute(userId) {
    const result = await query(
        `SELECT * FROM conversation_events
         WHERE user_id = $1 AND event_type = 'MUTE'
           AND COALESCE((metadata->>'until')::timestamptz, NOW() + INTERVAL '100 years') > NOW()
         ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
}

export async function clearHistory(userId) {
    return await clearConversationEvents(userId);
}

export async function decrementFreeRequest(userId) {
    const res = await query(
        `UPDATE users 
         SET free_requests_left = GREATEST(0, free_requests_left - 1) 
         WHERE telegram_id = $1 
         RETURNING free_requests_left`,
        [userId]
    );
    return res.rows[0]?.free_requests_left ?? 0;
}

export async function reserveFreeRequest(userId) {
    const res = await query(`UPDATE users SET free_requests_left = free_requests_left - 1
        WHERE telegram_id = $1 AND free_requests_left > 0 RETURNING free_requests_left`, [userId]);
    return res.rows[0] || null;
}

export async function reserveImageRequest(userId) {
    const res = await query(`UPDATE users SET image_balance = image_balance - 1
        WHERE telegram_id = $1 AND image_balance > 0 RETURNING image_balance`, [userId]);
    return res.rows[0] || null;
}

export async function refundReservedRequest(userId, resource) {
    const column = resource === 'image' ? 'image_balance' : 'free_requests_left';
    const res = await query(`UPDATE users SET ${column} = ${column} + 1 WHERE telegram_id = $1 RETURNING *`, [userId]);
    return res.rows[0] || null;
}

export async function decrementImageBalance(userId) {
    const res = await query(
        `UPDATE users 
         SET image_balance = GREATEST(0, image_balance - 1) 
         WHERE telegram_id = $1 
         RETURNING image_balance`,
        [userId]
    );
    return res.rows[0]?.image_balance ?? 0;
}

export async function addApiCost(userId, cost) {
    await query(
        'UPDATE users SET total_spent = total_spent + $1 WHERE telegram_id = $2',
        [cost, userId]
    );
}

export async function getAdminStats() {
    const [totalUsers, totalSpent, totalPayments, totalStars, totalMessages, active24h, premiumUsers, createdDay, createdWeek, funnel, freeMode] = await Promise.all([
        query('SELECT COUNT(*) FROM users'),
        query('SELECT COALESCE(SUM(total_spent), 0) AS sum FROM users'),
        query("SELECT COALESCE(SUM(amount), 0) AS sum FROM payments WHERE status = 'completed' AND currency <> 'XTR'"),
        query("SELECT COALESCE(SUM(amount), 0) AS sum FROM payments WHERE status = 'completed' AND currency = 'XTR'"),
        query("SELECT COUNT(*) FROM conversation_events WHERE event_type IN ('MESSAGE', 'INITIATIVE') AND role IN ('user', 'lera', 'assistant') AND status = 'COMPLETED'"),
        query("SELECT COUNT(*) FROM users WHERE last_active_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'"),
        query('SELECT COUNT(*) FROM users WHERE is_premium = TRUE'),
        query("SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'"),
        query("SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'"),
        query(`SELECT
            COUNT(*) AS total_users,
            COUNT(*) FILTER (WHERE free_requests_left < 10) AS spent_free,
            COUNT(*) FILTER (WHERE store_opened_at IS NOT NULL) AS store_opened,
            (SELECT COUNT(DISTINCT user_id) FROM payments WHERE status = 'completed') AS paid
            FROM users`),
        isFreeModeEnabled()
    ]);

    const totalUsersValue = parseInt(totalUsers.rows[0].count, 10) || 0;
    const apiCost = parseFloat(totalSpent.rows[0].sum || 0) || 0;
    const revenueRub = parseFloat(totalPayments.rows[0].sum || 0) || 0;
    const revenueStars = parseFloat(totalStars.rows[0].sum || 0) || 0;
    const funnelData = funnel.rows[0] || {};

    const usersByDay = parseInt(createdDay.rows[0].count, 10) || 0;
    const usersByWeek = parseInt(createdWeek.rows[0].count, 10) || 0;

    return {
        total_users: totalUsersValue,
        active_24h: parseInt(active24h.rows[0].count, 10) || 0,
        premium_users: parseInt(premiumUsers.rows[0].count, 10) || 0,
        total_spent_usd: apiCost.toFixed(4),
        total_api_cost: apiCost,
        total_revenue_rub: revenueRub.toFixed(2),
        total_revenue: revenueRub,
        rub_total: revenueRub,
        stars_total: revenueStars,
        total_messages: parseInt(totalMessages.rows[0].count, 10) || 0,
        // Legacy nested shape used by the Telegram admin panel.
        users: { day: usersByDay, week: usersByWeek, total: totalUsersValue },
        revenue: { rub_total: revenueRub, stars_total: revenueStars },
        api_costs_time: { total: apiCost },
        free_mode_enabled: freeMode,
        funnel: {
            total_users: parseInt(funnelData.total_users, 10) || totalUsersValue,
            spent_free: parseInt(funnelData.spent_free, 10) || 0,
            store_opened: parseInt(funnelData.store_opened, 10) || 0,
            paid: parseInt(funnelData.paid, 10) || 0
        }
    };
}

export async function isFreeModeEnabled() {
    const value = await getSetting('free_mode', null);
    if (value !== null) return value === 'true';
    const legacyValue = await getSetting('free_mode_enabled', 'false');
    return legacyValue === 'true';
}

export async function toggleFreeMode() {
    const current = await isFreeModeEnabled();
    const newValue = (!current).toString();
    await setSetting('free_mode', newValue);
    await setSetting('free_mode_enabled', newValue);
    return !current;
}

export async function resetAllFreeRequests(count = 10) {
    const res = await query('UPDATE users SET free_requests_left = $1', [count]);
    return res.rowCount;
}

export async function setUserPrompt(userId, promptText, mode = 'custom') {
    const res = await query(
        'UPDATE users SET current_prompt = $1, roleplay_mode = $2 WHERE telegram_id = $3 RETURNING *',
        [promptText, mode, userId]
    );
    return res.rows[0];
}

export async function getAllUserIds() {
    const res = await query('SELECT telegram_id FROM users WHERE is_blocked = FALSE');
    return res.rows.map(r => r.telegram_id);
}

export async function logPayment(userId, amount, currency, provider, payload, status = 'completed') {
    const res = await query(
        `INSERT INTO payments (user_id, amount, currency, provider, payload, status) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, amount, currency, provider, payload, status]
    );
    return res.rows[0];
}

export async function processPlategaPayment(paymentId, userId, amountRub, packageType) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const payCheck = await client.query('SELECT status FROM payments WHERE payload = $1', [paymentId]);
        if (payCheck.rows.length > 0 && payCheck.rows[0].status === 'completed') {
            await client.query('ROLLBACK');
            return false;
        }

        await client.query(
            `INSERT INTO payments (user_id, amount, currency, provider, payload, status) 
             VALUES ($1, $2, 'RUB', 'platega', $3, 'completed')
             ON CONFLICT DO NOTHING`,
            [userId, amountRub, paymentId]
        );

        if (packageType === 'text_small') {
            await client.query('UPDATE users SET free_requests_left = free_requests_left + 50 WHERE telegram_id = $1', [userId]);
        } else if (packageType === 'text_large') {
            await client.query('UPDATE users SET free_requests_left = free_requests_left + 200 WHERE telegram_id = $1', [userId]);
        } else if (packageType === 'img_small') {
            await client.query('UPDATE users SET image_balance = image_balance + 10 WHERE telegram_id = $1', [userId]);
        } else if (packageType === 'img_large') {
            await client.query('UPDATE users SET image_balance = image_balance + 30 WHERE telegram_id = $1', [userId]);
        } else if (packageType === 'vip_sub') {
            await client.query(`
                UPDATE users SET 
                    is_premium = TRUE, 
                    free_requests_left = free_requests_left + 500, 
                    image_balance = image_balance + 50 
                WHERE telegram_id = $1
            `, [userId]);
        }

        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка транзакции оплаты Platega:', e);
        throw e;
    } finally {
        client.release();
    }
}

export async function addFreeRequests(userId, count) {
    const res = await query(
        'UPDATE users SET free_requests_left = free_requests_left + $1 WHERE telegram_id = $2 RETURNING free_requests_left',
        [count, userId]
    );
    return res.rows[0]?.free_requests_left;
}

export async function setBlockStatus(userId, isBlocked) {
    const res = await query(
        'UPDATE users SET is_blocked = $1 WHERE telegram_id = $2 RETURNING *',
        [isBlocked, userId]
    );
    return res.rows[0];
}

export async function adminSetTextBalance(userId, balance) {
    const res = await query(
        'UPDATE users SET free_requests_left = $1 WHERE telegram_id = $2 RETURNING *',
        [balance, userId]
    );
    return res.rows[0];
}

export async function adminSetImageBalance(userId, balance) {
    const res = await query(
        'UPDATE users SET image_balance = $1 WHERE telegram_id = $2 RETURNING *',
        [balance, userId]
    );
    return res.rows[0];
}

export async function getUsersTotal() {
    const res = await query('SELECT COUNT(*) FROM users');
    return parseInt(res.rows[0].count, 10);
}

export async function getUsersPage(limit = 20, offset = 0) {
    const res = await query(
        'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
    );
    return res.rows;
}

export async function grantPackage(userId, packageType) {
    let updateQuery = '';
    if (packageType === 'text_small') updateQuery = 'free_requests_left = free_requests_left + 50';
    else if (packageType === 'text_large') updateQuery = 'free_requests_left = free_requests_left + 200';
    else if (packageType === 'img_small') updateQuery = 'image_balance = image_balance + 10';
    else if (packageType === 'img_large') updateQuery = 'image_balance = image_balance + 30';
    else if (packageType === 'vip_sub') updateQuery = 'is_premium = TRUE, free_requests_left = free_requests_left + 500, image_balance = image_balance + 50';

    if (!updateQuery) return null;

    const res = await query(`UPDATE users SET ${updateQuery} WHERE telegram_id = $1 RETURNING *`, [userId]);
    return res.rows[0];
}

export async function updateUserMeta(userId, { first_name, last_name, username }) {
    const res = await query(
        `UPDATE users SET 
            first_name = COALESCE($1, first_name),
            last_name = COALESCE($2, last_name),
            username = COALESCE($3, username),
            last_active_at = CURRENT_TIMESTAMP
         WHERE telegram_id = $4 RETURNING *`,
        [first_name, last_name, username, userId]
    );
    return res.rows[0];
}

export async function getSetting(key, defaultValue = null, applyEscape = false) {
    let value = null;
    let foundInLegacy = false;

    let current = { rows: [] };
    try {
        current = await query('SELECT value FROM settings WHERE key = $1', [key]);
    } catch {
        // Try the legacy table below when the new settings table is unavailable.
    }
    if (current.rows.length > 0) {
        value = current.rows[0].value;
    } else {
        try {
            const legacy = await query('SELECT value FROM global_settings WHERE key = $1', [key]);
            if (legacy.rows.length > 0) {
                value = legacy.rows[0].value;
                foundInLegacy = true;
            }
        } catch {
            // Legacy table may not exist on a fresh installation.
        }
    }

    if (value === null && defaultValue !== null && defaultValue !== undefined) {
        value = String(defaultValue);
        try {
            await query(
                'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
                [key, value]
            );
        } catch {
            // The legacy table remains the source of truth on old installations.
        }
    } else if (foundInLegacy) {
        try {
            await query(
                'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
                [key, value]
            );
        } catch {
            // Optional migration copy.
        }
    }

    if (applyEscape && typeof value === 'string') {
        return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return value;
}

export async function setSetting(key, value) {
    const normalizedValue = String(value ?? '');
    let res = { rows: [] };
    let primarySaved = false;
    let legacySaved = false;
    let primaryError = null;
    let legacyError = null;
    try {
        res = await query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2 RETURNING *',
            [key, normalizedValue]
        );
        primarySaved = true;
    } catch (error) {
        primaryError = error;
        // Continue with the legacy settings table.
    }
    try {
        await query(
            'INSERT INTO global_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [key, normalizedValue]
        );
        legacySaved = true;
    } catch (error) {
        legacyError = error;
        // Legacy table is optional on a fresh installation.
    }
    if (!primarySaved && !legacySaved) {
        const databaseError = primaryError || legacyError;
        const unavailable = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(databaseError?.code);
        throw new Error(unavailable
            ? 'PostgreSQL недоступен: проверь DATABASE_URL и что база запущена.'
            : 'Не удалось сохранить настройку в PostgreSQL.');
    }
    return res.rows[0] || { key, value: normalizedValue };
}

export async function updateLastActive(userId) {
    await query('UPDATE users SET last_active_at = CURRENT_TIMESTAMP, promo_24h_sent = FALSE WHERE telegram_id = $1', [userId]);
}

export async function setStoreOpened(userId) {
    await query('UPDATE users SET store_opened_at = CURRENT_TIMESTAMP WHERE telegram_id = $1', [userId]);
}

export async function getUsersForRetargeting24h() {
    const res = await query(`
        SELECT telegram_id FROM users 
        WHERE is_blocked = FALSE 
          AND promo_24h_sent = FALSE 
          AND last_active_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `);
    return res.rows.map(r => r.telegram_id);
}

export async function getPendingCriticalGlobalEvents(limit = 20) {
    const res = await query(`SELECT * FROM simulation_events
        WHERE importance >= 2 AND initiative_sent_at IS NULL
          AND occurred_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
          AND source_user_id IS NOT NULL
        ORDER BY occurred_at ASC LIMIT $1`, [limit]);
    return res.rows;
}

export async function markGlobalEventInitiativeSent(eventId) {
    await query('UPDATE simulation_events SET initiative_sent_at = CURRENT_TIMESTAMP WHERE id = $1 AND initiative_sent_at IS NULL', [eventId]);
}

export async function mark24hPromoSent(userId) {
    await query('UPDATE users SET promo_24h_sent = TRUE WHERE telegram_id = $1', [userId]);
}

export async function getUsersForRetargetingStore() {
    const res = await query(`
        SELECT telegram_id FROM users 
        WHERE is_blocked = FALSE 
          AND promo_store_sent = FALSE 
          AND store_opened_at IS NOT NULL 
          AND store_opened_at <= CURRENT_TIMESTAMP - INTERVAL '2 hours'
          AND last_active_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `);
    return res.rows.map(r => r.telegram_id);
}

export async function markStorePromoSent(userId) {
    await query('UPDATE users SET promo_store_sent = TRUE WHERE telegram_id = $1', [userId]);
}

export async function createPromocode(code, maxActivations, bonusRequests, bonusImages, discountPercent) {
    const res = await query(
        `INSERT INTO promocodes (code, max_activations, bonus_requests, bonus_images, discount_percent)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [code.toUpperCase(), maxActivations, bonusRequests, bonusImages, discountPercent]
    );
    return res.rows[0];
}

export async function activatePromocode(userId, codeStr) {
    const codeObj = await query('SELECT * FROM promocodes WHERE code = $1 AND is_active = TRUE', [codeStr.toUpperCase()]);
    if (codeObj.rows.length === 0) return { success: false, message: 'Промокод не найден или деактивирован.' };

    const promo = codeObj.rows[0];

    const userObj = await getUser(userId);
    if (promo.is_new_users_only && userObj) {
        const regDate = new Date(userObj.created_at);
        const now = new Date();
        const diffHours = (now - regDate) / (1000 * 60 * 60);
        if (diffHours > 48) {
            return { success: false, message: 'Этот промокод только для новых пользователей (первые 48 часов)!' };
        }
    }

    const usageCheck = await query(
        'SELECT * FROM user_promocodes WHERE user_id = $1 AND promocode_id = $2',
        [userId, promo.id]
    );
    if (usageCheck.rows.length > 0) return { success: false, message: 'Вы уже активировали этот промокод!' };

    if (promo.current_activations >= promo.max_activations) {
        return { success: false, message: 'Лимит активаций этого промокода исчерпан.' };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'INSERT INTO user_promocodes (user_id, promocode_id) VALUES ($1, $2)',
            [userId, promo.id]
        );

        await client.query(
            'UPDATE promocodes SET current_activations = current_activations + 1 WHERE id = $1',
            [promo.id]
        );

        await client.query(
            `UPDATE users SET 
                free_requests_left = free_requests_left + $1, 
                image_balance = image_balance + $2 
             WHERE telegram_id = $3`,
            [promo.bonus_requests, promo.bonus_images, userId]
        );

        await client.query('COMMIT');
        return {
            success: true,
            message: `🎉 Промокод успешно активирован!\nВам начислено:\n• Текстовых запросов: +${promo.bonus_requests}\n• Генераций фото: +${promo.bonus_images}`
        };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка активации промокода:', e);
        return { success: false, message: 'Ошибка сервера при активации промокода.' };
    } finally {
        client.release();
    }
}

export async function getPaymentHistory(userId, limit = 10) {
    const res = await query(
        `SELECT amount, currency, provider, status, created_at 
         FROM payments 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit]
    );
    return res.rows;
}

export async function getAllPromocodes() {
    const res = await query('SELECT * FROM promocodes ORDER BY created_at DESC');
    return res.rows;
}

export async function getPromocodeById(id) {
    const res = await query('SELECT * FROM promocodes WHERE id = $1', [id]);
    return res.rows[0] || null;
}

export async function togglePromoStatus(id) {
    const res = await query('UPDATE promocodes SET is_active = NOT is_active WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function togglePromoNewUsersOnly(id) {
    const res = await query('UPDATE promocodes SET is_new_users_only = NOT is_new_users_only WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function deletePromocode(id) {
    const res = await query('DELETE FROM promocodes WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function updatePromoField(id, field, value) {
    const allowedFields = ['code', 'max_activations', 'bonus_requests', 'bonus_images', 'discount_percent'];
    if (!allowedFields.includes(field)) throw new Error('Недопустимое поле');
    const res = await query(`UPDATE promocodes SET ${field} = $1 WHERE id = $2 RETURNING *`, [value, id]);
    return res.rows[0];
}

export async function getUsersForBonusNotify() {
    const res = await query(`
        SELECT telegram_id FROM users 
        WHERE is_blocked = FALSE 
          AND bonus_notified = FALSE 
          AND free_requests_left <= 2 
          AND last_active_at <= CURRENT_TIMESTAMP - INTERVAL '12 hours'
    `);
    return res.rows.map(r => r.telegram_id);
}

export async function markBonusNotified(userId) {
    await query('UPDATE users SET bonus_notified = TRUE WHERE telegram_id = $1', [userId]);
}

export async function canUserReceiveRecommendation(userId) {
    const res = await query('SELECT last_recommendation_at FROM users WHERE telegram_id = $1', [userId]);
    if (res.rows.length === 0) return false;
    const lastRec = res.rows[0].last_recommendation_at;
    if (!lastRec) return true;
    const now = new Date();
    const diffHours = (now - new Date(lastRec)) / (1000 * 60 * 60);
    return diffHours >= 4;
}

export async function getRandomLeraPhoto({ access_level = null, time_of_day = null } = {}) {
    let sql = 'SELECT * FROM lera_photos WHERE TRUE';
    const params = [];
    if (access_level) {
        params.push(access_level);
        sql += ` AND access_level = $${params.length}`;
    }
    if (time_of_day) {
        params.push(time_of_day);
        sql += ` AND (time_of_day = $${params.length} OR time_of_day = 'any' OR time_of_day IS NULL)`;
    }
    sql += ' ORDER BY RANDOM() LIMIT 1';
    const res = await query(sql, params);
    return res.rows[0] || null;
}

export async function getLeraPhotoCandidates({ access_level = 'free', time_of_day = null } = {}) {
    let sql = 'SELECT * FROM lera_photos WHERE 1=1';
    const params = [];

    if (access_level === 'free') {
        sql += " AND access_level = 'free'";
    }

    if (time_of_day) {
        params.push(time_of_day);
        sql += ` AND (time_of_day = $${params.length} OR time_of_day = 'any' OR time_of_day IS NULL)`;
    }

    sql += ' ORDER BY RANDOM()';
    const res = await query(sql, params);
    return res.rows;
}

export async function getSentPhotos(userId) {
    const numericUserId = typeof userId === 'object' ? userId?.telegram_id : userId;
    const res = await query('SELECT photo_id FROM sent_photos WHERE user_id = $1', [numericUserId]);
    return res.rows.map(r => String(r.photo_id));
}

export async function recordPhotoSent(userId, photoId) {
    const numericUserId = typeof userId === 'object' ? userId?.telegram_id : userId;
    await query(
        'INSERT INTO sent_photos (user_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [numericUserId, String(photoId)]
    );
}

export async function addLeraPhoto({
    file_id,
    caption = '',
    access_level = 'free',
    time_of_day = 'any',
    tags = [],
    explicitness = 0,
    outfit_tags = []
}) {
    const res = await query(
        `INSERT INTO lera_photos (file_id, caption, access_level, time_of_day, tags, explicitness, outfit_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [file_id, caption, access_level, time_of_day, tags, explicitness, outfit_tags]
    );
    return res.rows[0];
}

export async function getActiveAiProvider() {
    try {
        const res = await query("SELECT * FROM ai_providers WHERE is_active = TRUE ORDER BY priority ASC LIMIT 1");
        return res.rows[0] || null;
    } catch (e) {
        return null;
    }
}

export async function getOrderedAiProviders() {
    try {
        const res = await query("SELECT * FROM ai_providers WHERE is_enabled = TRUE ORDER BY is_active DESC, priority ASC, id ASC");
        if (res.rows.length === 0) {
            const fallbackRes = await query("SELECT * FROM ai_providers ORDER BY is_active DESC, priority ASC, id ASC");
            return fallbackRes.rows;
        }
        return res.rows;
    } catch (e) {
        return [];
    }
}

export async function getChannelPosterSettings() {
    const keys = ['channel_poster_enabled', 'channel_id', 'lera_channel_id', 'channel_frequency_hours', 'channel_topics', 'channel_topic_weights', 'channel_messages_count', 'channel_media_mode', 'channel_prompt_blocks', 'channel_temperature', 'channel_inherit_lera_prompt', 'channel_include_day_context'];
    const result = await query('SELECT key, value FROM settings WHERE key = ANY($1::text[])', [keys]);
    const values = Object.fromEntries(result.rows.map(row => [row.key, row.value]));
    let topics = ['thoughts', 'life', 'jokes'];
    try { if (values.channel_topics) topics = JSON.parse(values.channel_topics); } catch { /* default */ }
    let topic_weights = { thoughts: 30, flirt: 20, life: 30, jokes: 15, questions: 5 };
    try { if (values.channel_topic_weights) topic_weights = { ...topic_weights, ...JSON.parse(values.channel_topic_weights) }; } catch { /* default */ }
    topic_weights = normalizeTopicDistribution(topics, topic_weights);
    let prompt_blocks = { voice: '', context: '', restrictions: '', cta: '' };
    try { if (values.channel_prompt_blocks) prompt_blocks = { ...prompt_blocks, ...JSON.parse(values.channel_prompt_blocks) }; } catch { /* default */ }
    return {
        is_enabled: values.channel_poster_enabled !== 'false',
        channel_id: values.channel_id || values.lera_channel_id || '',
        frequency_hours: Number(values.channel_frequency_hours || 4),
        topics,
        topic_weights,
        messages_count: values.channel_messages_count || '1',
        media_mode: values.channel_media_mode || 'none',
        prompt_blocks,
        temperature: Math.max(0, Math.min(2, Number(values.channel_temperature ?? 1.1))),
        inherit_lera_prompt: values.channel_inherit_lera_prompt !== 'false',
        include_day_context: values.channel_include_day_context !== 'false',
        last_posted_at: (await query('SELECT created_at FROM channel_post_logs ORDER BY created_at DESC LIMIT 1')).rows[0]?.created_at || null
    };
}

export async function saveChannelPostLog({ channel_id, topic, text, photo_url = null, media_mode = null, provenance = {}, telegram_message_ids = [] }) {
    const result = await query(`INSERT INTO channel_post_logs (channel_id, topic, text, photo_url, media_mode, provenance, telegram_message_ids)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) RETURNING *`, [
        channel_id, topic, text, photo_url, media_mode, JSON.stringify(provenance || {}), JSON.stringify(telegram_message_ids || [])
    ]);
    return result.rows[0];
}

export async function getChannelPostHistory(limit = 5) {
    const result = await query('SELECT * FROM channel_post_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows.reverse();
}

export async function deleteChannelPostLog(id) {
    const result = await query('DELETE FROM channel_post_logs WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
}

export async function getTodayUserChatSummary() {
    const result = await query(`SELECT role, content FROM conversation_events
        WHERE occurred_at >= CURRENT_DATE
          AND status = 'COMPLETED'
          AND event_type IN ('MESSAGE', 'INITIATIVE', 'PROMO')
          AND role IN ('user', 'lera', 'assistant')
        ORDER BY occurred_at DESC, id DESC LIMIT 20`);
    return result.rows.reverse().map(row => `${row.role}: ${String(row.content).slice(0, 160)}`).join('\n') || 'Сегодня личных разговоров еще не было.';
}

export async function saveSimulationReflection(date, reflection) {
    const result = await query(`
        INSERT INTO simulation_reflections (date, reflection)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (date) DO UPDATE SET reflection = EXCLUDED.reflection, updated_at = NOW()
        RETURNING *`, [date, JSON.stringify(reflection || {})]);
    return result.rows[0];
}

export async function getRecentSimulationReflections(limit = 3) {
    const result = await query(`SELECT date, reflection, created_at, updated_at
        FROM simulation_reflections ORDER BY date DESC LIMIT $1`, [limit]);
    return result.rows.reverse().map(row => ({ ...row.reflection, date: String(row.date).slice(0, 10) }));
}

export const DEFAULT_MEMORY_SETTINGS = Object.freeze({
    is_enabled: true,
    provider_id: '',
    model: '',
    temperature: 0.2,
    max_tokens: 400,
    retry_max_tokens: 700,
    timeout_ms: 10000,
    prompt: `Ты — модуль извлечения долгосрочной памяти о пользователе.
Проанализируй реплику пользователя и выдели НОВЫЕ важные долгосрочные факты о нем (имя, город, возраст, профессия, увлечения, предпочтения, отношения, кинки, важные люди).

[ТЕКУЩИЕ ФАКТЫ В БАЗЕ]:
{{existing_facts}}

[СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ]:
"{{user_text}}"

[ПРАВИЛА]:
1. Извлекай только реальные устойчивые факты о ПОЛЬЗОВАТЕЛЕ, которые прямо следуют из его сообщения.
2. Если пользователь просто задал вопрос, попрощался или сообщил о текущем действии без долгосрочного факта — верни пустой new_facts.
3. Если пользователь обновил или отменил старый факт — укажи id старого факта в deactivate_ids.
4. Ответь СТРОГО валидным JSON без markdown и без пояснений:
{"new_facts":[{"category":"identity","fact":"Имя пользователя — Богдан"}],"deactivate_ids":[]}
Если фактов нет, верни {"new_facts":[],"deactivate_ids":[]}.`
});

function normalizeMemorySettingValue(key, value) {
    if (key === 'memory_enabled') return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
    if (key === 'memory_provider_id') return String(value || '');
    if (key === 'memory_model') return String(value || '').trim().slice(0, 240);
    if (key === 'memory_prompt') return String(value || DEFAULT_MEMORY_SETTINGS.prompt).trim().slice(0, 16000);
    if (key === 'memory_temperature') return Number.isFinite(Number(value)) ? Math.max(0, Math.min(2, Number(value))) : DEFAULT_MEMORY_SETTINGS.temperature;
    if (key === 'memory_max_tokens') return Number.isFinite(Number(value)) ? Math.max(80, Math.min(1200, Math.round(Number(value)))) : DEFAULT_MEMORY_SETTINGS.max_tokens;
    if (key === 'memory_retry_max_tokens') return Number.isFinite(Number(value)) ? Math.max(80, Math.min(1600, Math.round(Number(value)))) : DEFAULT_MEMORY_SETTINGS.retry_max_tokens;
    if (key === 'memory_timeout_ms') return Number.isFinite(Number(value)) ? Math.max(1000, Math.min(60000, Math.round(Number(value)))) : DEFAULT_MEMORY_SETTINGS.timeout_ms;
    return value;
}

export async function getMemorySettings() {
    try {
        const res = await query("SELECT * FROM settings WHERE key LIKE 'memory_%'");
        const settings = { ...DEFAULT_MEMORY_SETTINGS };
        res.rows.forEach(r => {
            const key = r.key;
            const value = normalizeMemorySettingValue(key, r.value);
            if (key === 'memory_enabled') settings.is_enabled = value;
            if (key === 'memory_provider_id') settings.provider_id = value;
            if (key === 'memory_model') settings.model = value;
            if (key === 'memory_prompt') settings.prompt = value;
            if (key === 'memory_temperature') settings.temperature = value;
            if (key === 'memory_max_tokens') settings.max_tokens = value;
            if (key === 'memory_retry_max_tokens') settings.retry_max_tokens = value;
            if (key === 'memory_timeout_ms') settings.timeout_ms = value;
        });
        return settings;
    } catch (e) {
        return { ...DEFAULT_MEMORY_SETTINGS };
    }
}

export async function getMemoryProvider(settings = {}) {
    const selectedId = Number(settings.provider_id);
    if (selectedId) {
        const selected = (await getAiProviders()).find(provider => Number(provider.id) === selectedId);
        if (selected) return selected;
    }
    return await getActiveAiProvider();
}

export async function getUserMemories(userId, limit = 30) {
    try {
        const res = await query(
            "SELECT id, fact FROM user_memories WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT $2",
            [userId, limit]
        );
        return res.rows;
    } catch (e) {
        return [];
    }
}

export async function saveUserMemory(userId, fact) {
    try {
        const res = await query(
            "INSERT INTO user_memories (user_id, fact) VALUES ($1, $2) RETURNING *",
            [userId, fact]
        );
        return res.rows[0];
    } catch (e) {
        return null;
    }
}

export async function deactivateUserMemory(id, userId = null) {
    try {
        await query("UPDATE user_memories SET is_active = FALSE WHERE id = $1 AND ($2::bigint IS NULL OR user_id = $2)", [id, userId]);
    } catch (e) {
        // Ignored
    }
}

export async function getAdminDashboardStats() {
    return await getAdminStats();
}

export async function getAiProviders() {
    const res = await query('SELECT * FROM ai_providers ORDER BY is_active DESC, priority ASC, id ASC');
    return res.rows;
}

export async function addAiProvider(nameOrObj, baseUrl, apiKey, modelName, priority = 1, timeoutMs = 7000) {
    let name, url, key, model, prio, timeout, samplingCapabilities;
    if (typeof nameOrObj === 'object' && nameOrObj !== null) {
        name = nameOrObj.name;
        url = nameOrObj.base_url || nameOrObj.baseUrl;
        key = nameOrObj.api_key || nameOrObj.apiKey;
        model = nameOrObj.model_name || nameOrObj.modelName;
        prio = nameOrObj.priority !== undefined ? nameOrObj.priority : 1;
        timeout = nameOrObj.timeout_ms || nameOrObj.timeoutMs || 7000;
        samplingCapabilities = nameOrObj.sampling_capabilities || nameOrObj.samplingCapabilities || {};
    } else {
        name = nameOrObj;
        url = baseUrl;
        key = apiKey;
        model = modelName;
        prio = priority !== undefined ? priority : 1;
        timeout = timeoutMs || 7000;
        samplingCapabilities = {};
    }

    if (!name || !url || !key || !model) {
        throw new Error("Заполните все обязательные поля: Название, Base URL, API Key, Название модели");
    }

    url = String(url).trim();
    key = String(key).trim();
    name = String(name).trim();
    model = String(model).trim();

    const res = await query(
        `INSERT INTO ai_providers (name, base_url, api_key, model_name, priority, timeout_ms, sampling_capabilities)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
        [name, url, key, model, prio, timeout, JSON.stringify(samplingCapabilities || {})]
    );
    return res.rows[0];
}

export async function updateAiProviderSamplingCapabilities(id, samplingCapabilities = {}) {
    const value = samplingCapabilities && typeof samplingCapabilities === 'object' ? samplingCapabilities : {};
    const res = await query(
        'UPDATE ai_providers SET sampling_capabilities = $2::jsonb WHERE id = $1 RETURNING *',
        [id, JSON.stringify(value)]
    );
    return res.rows[0] || null;
}

export async function listSandboxPresets() {
    const res = await query('SELECT * FROM sandbox_presets ORDER BY updated_at DESC, id DESC');
    return res.rows;
}

export async function getSandboxPreset(id) {
    const res = await query('SELECT * FROM sandbox_presets WHERE id = $1', [id]);
    return res.rows[0] || null;
}

export async function createSandboxPreset({ name, slot = null, config = {} } = {}) {
    const res = await query(
        'INSERT INTO sandbox_presets (name, slot, config) VALUES ($1, $2, $3::jsonb) RETURNING *',
        [String(name || '').trim(), slot || null, JSON.stringify(config || {})]
    );
    return res.rows[0];
}

export async function updateSandboxPreset(id, { name, slot, config } = {}) {
    const res = await query(
        `UPDATE sandbox_presets
         SET name = COALESCE($2, name), slot = COALESCE($3, slot),
             config = COALESCE($4::jsonb, config), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, name === undefined ? null : String(name || '').trim(), slot === undefined ? null : slot, config === undefined ? null : JSON.stringify(config || {})]
    );
    return res.rows[0] || null;
}

export async function deleteSandboxPreset(id) {
    const res = await query('DELETE FROM sandbox_presets WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
}

export async function saveSandboxRun({ kind, request = {}, result = {} } = {}) {
    const res = await query(
        'INSERT INTO sandbox_runs (kind, request_json, result_json) VALUES ($1, $2::jsonb, $3::jsonb) RETURNING id, kind, created_at',
        [String(kind || 'GENERATE'), JSON.stringify(request || {}), JSON.stringify(result || {})]
    );
    return res.rows[0] || null;
}

export async function getSandboxRuns(limit = 30) {
    const res = await query(
        'SELECT id, kind, request_json, result_json, created_at FROM sandbox_runs ORDER BY created_at DESC, id DESC LIMIT $1',
        [Math.max(1, Math.min(Number(limit) || 30, 200))]
    );
    return res.rows;
}

export async function getSandboxRun(id) {
    const res = await query('SELECT * FROM sandbox_runs WHERE id = $1', [id]);
    return res.rows[0] || null;
}

export async function setActiveAiProvider(id) {
    await query('UPDATE ai_providers SET is_active = FALSE');
    const res = await query('UPDATE ai_providers SET is_active = TRUE WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function deleteAiProvider(id) {
    const res = await query('DELETE FROM ai_providers WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function updateProviderPriority(id, priority) {
    const res = await query('UPDATE ai_providers SET priority = $1 WHERE id = $2 RETURNING *', [priority, id]);
    return res.rows[0];
}

export async function toggleProviderEnabled(id) {
    const res = await query('UPDATE ai_providers SET is_active = NOT is_active WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function searchUsersAdmin(searchTerm = '', limit = 20, offset = 0) {
    let sql = 'SELECT * FROM users';
    const params = [];
    if (searchTerm) {
        params.push(`%${searchTerm}%`);
        sql += ' WHERE username ILIKE $1 OR first_name ILIKE $1 OR telegram_id::text ILIKE $1';
    }
    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    const res = await query(sql, params);
    return res.rows;
}

export async function updateUserAdmin(userId, fields = {}) {
    const updates = [];
    const params = [userId];

    if (fields.free_requests_left !== undefined) {
        params.push(fields.free_requests_left);
        updates.push(`free_requests_left = $${params.length}`);
    }
    if (fields.image_balance !== undefined) {
        params.push(fields.image_balance);
        updates.push(`image_balance = $${params.length}`);
    }
    if (fields.is_premium !== undefined) {
        params.push(fields.is_premium);
        updates.push(`is_premium = $${params.length}`);
    }
    if (fields.is_blocked !== undefined) {
        params.push(fields.is_blocked);
        updates.push(`is_blocked = $${params.length}`);
    }

    if (updates.length === 0) return await getUser(userId);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE telegram_id = $1 RETURNING *`;
    const res = await query(sql, params);
    return res.rows[0];
}

export async function getAllPromocodesAdmin() {
    return await getAllPromocodes();
}

export async function createPromocodeAdmin(data) {
    const { code, maxActivations, bonusRequests, bonusImages, discountPercent } = data;
    return await createPromocode(code, maxActivations, bonusRequests, bonusImages, discountPercent);
}

export async function updatePromocodeAdmin(id, fields) {
    const res = await query(
        `UPDATE promocodes SET 
            code = COALESCE($1, code),
            max_activations = COALESCE($2, max_activations),
            bonus_requests = COALESCE($3, bonus_requests),
            bonus_images = COALESCE($4, bonus_images),
            discount_percent = COALESCE($5, discount_percent),
            is_active = COALESCE($6, is_active),
            is_new_users_only = COALESCE($7, is_new_users_only)
         WHERE id = $8 RETURNING *`,
        [fields.code, fields.max_activations, fields.bonus_requests, fields.bonus_images, fields.discount_percent, fields.is_active, fields.is_new_users_only, id]
    );
    return res.rows[0];
}

export async function deletePromocodeAdmin(id) {
    return await deletePromocode(id);
}

export async function setMemorySettings(input = {}) {
    const current = await getMemorySettings();
    const next = {
        ...current,
        ...(typeof input === 'boolean' ? { is_enabled: input } : input)
    };
    const normalized = {
        is_enabled: Boolean(next.is_enabled),
        provider_id: String(next.provider_id || ''),
        model: String(next.model || '').trim().slice(0, 240),
        prompt: (String(next.prompt || DEFAULT_MEMORY_SETTINGS.prompt).trim() || DEFAULT_MEMORY_SETTINGS.prompt).slice(0, 16000),
        temperature: normalizeMemorySettingValue('memory_temperature', next.temperature),
        max_tokens: normalizeMemorySettingValue('memory_max_tokens', next.max_tokens),
        retry_max_tokens: normalizeMemorySettingValue('memory_retry_max_tokens', next.retry_max_tokens),
        timeout_ms: normalizeMemorySettingValue('memory_timeout_ms', next.timeout_ms)
    };
    const entries = [
        ['memory_enabled', normalized.is_enabled ? 'true' : 'false'],
        ['memory_provider_id', normalized.provider_id],
        ['memory_model', normalized.model],
        ['memory_prompt', normalized.prompt],
        ['memory_temperature', String(normalized.temperature)],
        ['memory_max_tokens', String(normalized.max_tokens)],
        ['memory_retry_max_tokens', String(normalized.retry_max_tokens)],
        ['memory_timeout_ms', String(normalized.timeout_ms)]
    ];
    for (const [key, value] of entries) {
        await query(
            "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            [key, value]
        );
    }
    return normalized;
}

export async function getAllLeraPhotos() {
    const res = await query('SELECT * FROM lera_photos ORDER BY id DESC');
    return res.rows;
}

export async function deleteLeraPhoto(id) {
    const res = await query('DELETE FROM lera_photos WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
}

export async function updateLeraPhoto(id, fields) {
    const res = await query(
        `UPDATE lera_photos SET 
            caption = COALESCE($1, caption),
            tags = COALESCE($2, tags),
            access_level = COALESCE($3, access_level),
            time_of_day = COALESCE($4, time_of_day),
            explicitness = COALESCE($5, explicitness),
            outfit_tags = COALESCE($6, outfit_tags)
         WHERE id = $7 RETURNING *`,
        [fields.caption, fields.tags, fields.access_level, fields.time_of_day,
            fields.explicitness, fields.outfit_tags, id]
    );
    return res.rows[0];
}

export async function acceptTerms(userId) {
    const res = await query(
        'UPDATE users SET accepted_terms = TRUE WHERE telegram_id = $1 RETURNING *',
        [userId]
    );
    return res.rows[0];
}

export async function getReferralsCount(userId) {
    const res = await query(
        'SELECT COUNT(*) FROM referrals WHERE referrer_id = $1',
        [userId]
    );
    return parseInt(res.rows[0]?.count || 0, 10);
}

export async function claimDailyBonus(userId, bonusRequests = 3) {
    const user = await getUser(userId);
    if (!user) return { success: false, message: 'Пользователь не найден' };

    const lastClaim = user.last_daily_bonus_at ? new Date(user.last_daily_bonus_at) : null;
    const now = new Date();

    if (lastClaim && (now - lastClaim) < 24 * 60 * 60 * 1000) {
        const nextClaim = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
        const diffMs = nextClaim - now;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return { success: false, message: `Ежедневный бонус уже получен! Следующий доступен через ${hours}ч ${mins}мин.` };
    }

    await query(
        `UPDATE users SET 
            free_requests_left = free_requests_left + $1,
            last_daily_bonus_at = CURRENT_TIMESTAMP
         WHERE telegram_id = $2`,
        [bonusRequests, userId]
    );

    return { success: true, bonusRequests };
}

export async function clearUserMemories(userId) {
    const res = await query('DELETE FROM user_memories WHERE user_id = $1', [userId]);
    return res.rowCount;
}

export async function getAllRecentConversationEvents(limit = 50) {
    const res = await query(
        `SELECT c.*, u.first_name, u.username 
         FROM conversation_events c
         LEFT JOIN users u ON u.telegram_id = c.user_id
         ORDER BY c.created_at DESC 
         LIMIT $1`,
        [limit]
    );
    return res.rows;
}

export async function clearAllChatHistory() {
    const resEvents = await query('DELETE FROM conversation_events');
    return resEvents.rowCount || 0;
}

export async function clearAllUserMemories() {
    const resMem = await query('DELETE FROM user_memories');
    return resMem.rowCount || 0;
}

// =========================================================================
// USER MEMORY (user_memories) — admin CRUD for the Memory Inspector tab
// =========================================================================

export async function getUserMemoriesAdmin(userId, includeInactive = true) {
    const res = await query(
        `SELECT id, user_id, fact, is_active, created_at
         FROM user_memories
         WHERE user_id = $1 AND ($2::boolean OR is_active = TRUE)
         ORDER BY created_at DESC`,
        [userId, includeInactive]
    );
    return res.rows;
}

export async function updateUserMemoryFact(id, fact) {
    const res = await query(
        'UPDATE user_memories SET fact = $2 WHERE id = $1 RETURNING *',
        [id, fact]
    );
    return res.rows[0] || null;
}

export async function setUserMemoryActive(id, isActive) {
    const res = await query(
        'UPDATE user_memories SET is_active = $2 WHERE id = $1 RETURNING *',
        [id, !!isActive]
    );
    return res.rows[0] || null;
}

export async function deleteUserMemory(id) {
    const res = await query('DELETE FROM user_memories WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
}

/**
 * Searches users by telegram id, @username or first/last name.
 */
export async function searchUsers(term, limit = 25) {
    const raw = String(term || '').trim().replace(/^@/, '');
    if (!raw) return [];
    const numeric = /^\d+$/.test(raw) ? Number(raw) : null;
    const res = await query(
        `SELECT telegram_id, username, first_name, last_name, free_requests_left,
                image_balance, is_premium, is_blocked, total_spent, created_at, last_active_at
         FROM users
         WHERE ($2::bigint IS NOT NULL AND telegram_id = $2)
            OR username ILIKE '%' || $1 || '%'
            OR first_name ILIKE '%' || $1 || '%'
            OR last_name ILIKE '%' || $1 || '%'
         ORDER BY last_active_at DESC NULLS LAST
         LIMIT $3`,
        [raw, numeric, limit]
    );
    return res.rows;
}

// =========================================================================
// PROMPT LOGS — full raw prompt/response audit powering the Prompt Inspector
// =========================================================================

/**
 * Persists one LLM call. Never throws: logging must not break reply generation.
 */
export async function savePromptLog(entry) {
    try {
        const res = await query(
            `INSERT INTO prompt_logs (
                user_id, kind, mode, model, provider_name, user_text,
                system_prompt, radiant_context, messages, state_snapshot, memory_used,
                raw_response, parsed_response, usage, generation_trace, prompt_tokens, completion_tokens, total_tokens, cost_usd,
                command_gate_status, command_gate_reason, latency_ms, is_photo_request, error_text
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24)
             RETURNING id, created_at`,
            [
                entry.userId,
                entry.kind || 'CHAT',
                entry.mode || null,
                entry.model || null,
                entry.providerName || null,
                entry.userText || null,
                entry.systemPrompt || null,
                entry.radiantContext || null,
                JSON.stringify(entry.messages || []),
                JSON.stringify(entry.stateSnapshot || {}),
                JSON.stringify(entry.memoryUsed || []),
                entry.rawResponse || null,
                entry.parsedResponse || null,
                JSON.stringify(entry.usage || {}),
                JSON.stringify(entry.generationTrace || []),
                Number(entry.usage?.prompt_tokens || 0),
                Number(entry.usage?.completion_tokens || 0),
                Number(entry.usage?.total_tokens || (Number(entry.usage?.prompt_tokens || 0) + Number(entry.usage?.completion_tokens || 0))),
                Number(entry.costUsd || 0),
                entry.commandGateStatus || null,
                entry.commandGateReason || null,
                Math.round(entry.latencyMs || 0),
                !!entry.isPhotoRequest,
                entry.errorText || null
            ]
        );
        publishDevtoolEvent('prompt_log', { id: res.rows[0]?.id, kind: entry.kind || 'CHAT', userId: entry.userId, model: entry.model, provider: entry.providerName, latencyMs: Math.round(entry.latencyMs || 0), usage: entry.usage || {}, commandGateStatus: entry.commandGateStatus || null });
        return res.rows[0] || null;
    } catch (e) {
        console.error('⚠️ [PROMPT LOG SAVE ERROR]:', e.message);
        return null;
    }
}

/**
 * Compact list for the inspector sidebar (no heavy prompt bodies).
 */
export async function getPromptLogs({ userId = null, limit = 50, offset = 0 } = {}) {
    const res = await query(
        `SELECT p.id, p.user_id, p.kind, p.mode, p.model, p.provider_name, p.user_text,
                LEFT(COALESCE(p.parsed_response, p.raw_response, ''), 160) AS preview,
                p.latency_ms, p.is_photo_request, p.error_text, p.created_at,
                p.prompt_tokens, p.completion_tokens, p.total_tokens, p.cost_usd,
                p.command_gate_status, p.command_gate_reason,
                u.username, u.first_name
         FROM prompt_logs p
         LEFT JOIN users u ON u.telegram_id = p.user_id
         WHERE ($1::bigint IS NULL OR p.user_id = $1)
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );
    return res.rows;
}

/**
 * Full layered detail of a single LLM call.
 */
export async function getPromptLogById(id) {
    const res = await query(
        `SELECT p.*, u.username, u.first_name
         FROM prompt_logs p
         LEFT JOIN users u ON u.telegram_id = p.user_id
         WHERE p.id = $1`,
        [id]
    );
    return res.rows[0] || null;
}

/**
 * Retention helper: keeps the newest N logs so the table cannot grow forever.
 */
export async function prunePromptLogs(keep = 5000) {
    try {
        const res = await query(
            `DELETE FROM prompt_logs
             WHERE id NOT IN (SELECT id FROM prompt_logs ORDER BY id DESC LIMIT $1)`,
            [keep]
        );
        return res.rowCount || 0;
    } catch {
        return 0;
    }
}
