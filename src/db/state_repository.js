import { pool, query } from './database.js';
import { publishDevtoolEvent } from '../devtools/event_bus.js';

export class StateRepository {
    /**
     * Executes a callback inside a PostgreSQL transaction with explicit lock on sim_state.
     * Ensures sub-10ms performance and prevents race conditions.
     */
    static async withTransaction(callback) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ [StateRepository Transaction Error]:', err.message);
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Gets global simulation state with FOR UPDATE transactional lock.
     */
    static async getLockedState(client) {
        const res = await client.query(
            'SELECT * FROM sim_state WHERE id = 1 FOR UPDATE'
        );
        if (res.rows.length === 0) {
            // Seed fallback if state is missing
            const initRes = await client.query(`
                INSERT INTO sim_state (id, location_id, needs, physiology, wallet_rubles, wallet_stars, active_modifiers, cycle_anchor_date, last_tick_at, updated_at)
                VALUES (1, 'petrogradka_home', '{"hunger":20, "fatigue":10, "boredom":30, "horny":40, "bladder":0, "hygiene":90}'::jsonb,
                        '{"cycle_day":3, "arousal_level":20}'::jsonb, 3820, 150, '[]'::jsonb, CURRENT_DATE - 2, NOW(), NOW())
                RETURNING *
            `);
            return initRes.rows[0];
        }
        return res.rows[0];
    }

    /**
     * Gets global state without locking (for fast read operations).
     */
    static async getState() {
        const res = await query('SELECT * FROM sim_state WHERE id = 1');
        return res.rows[0] || null;
    }

    /**
     * Updates needs, physiology, and modifiers atomically.
     *
     * needs / physiology are MERGED into the existing JSONB (partial update), so passing
     * { hunger: 0 } no longer wipes fatigue/boredom/etc. Pass replaceNeeds/replacePhysiology
     * to overwrite the whole object instead.
     */
    static async updateState(client, {
        locationId,
        needs,
        physiology,
        activeModifiers,
        personality,
        lastTickAt,
        cycleAnchorDate,
        replaceNeeds = false,
        replacePhysiology = false
    }) {
        const needsJson = needs && Object.keys(needs).length > 0 ? JSON.stringify(needs) : null;
        const physJson = physiology && Object.keys(physiology).length > 0 ? JSON.stringify(physiology) : null;

        const res = await client.query(`
            UPDATE sim_state SET
                location_id = COALESCE($1, location_id),
                needs = CASE
                    WHEN $2::jsonb IS NULL THEN needs
                    WHEN $6::boolean THEN $2::jsonb
                    ELSE needs || $2::jsonb
                END,
                physiology = CASE
                    WHEN $3::jsonb IS NULL THEN physiology
                    WHEN $7::boolean THEN $3::jsonb
                    ELSE physiology || $3::jsonb
                END,
            active_modifiers = COALESCE($4::jsonb, active_modifiers),
                personality = COALESCE($9::jsonb, personality),
                last_tick_at = COALESCE($5, last_tick_at),
                cycle_anchor_date = COALESCE($8::date, cycle_anchor_date),
                updated_at = NOW()
            WHERE id = 1
            RETURNING *
        `, [
            locationId || null,
            needsJson,
            physJson,
            activeModifiers ? JSON.stringify(activeModifiers) : null,
            lastTickAt || null,
            replaceNeeds,
            replacePhysiology,
            cycleAnchorDate || null,
            personality ? JSON.stringify(personality) : null
        ]);
        return res.rows[0];
    }

    static async setWeatherOverride(client, override) {
        const result = await client.query(`
            UPDATE sim_state
            SET weather_override = $1::jsonb, updated_at = NOW()
            WHERE id = 1
            RETURNING weather_override
        `, [override ? JSON.stringify(override) : null]);
        return result.rows[0]?.weather_override || null;
    }

    static async recordWorkerSuccess(client, { durationMs, workerInstanceId, tickAt }) {
        const result = await client.query(`
            UPDATE sim_state
            SET last_successful_tick_at = NOW(), last_tick_error = NULL,
                last_tick_duration_ms = $1, worker_instance_id = $2,
                last_tick_at = $3, updated_at = NOW()
            WHERE id = 1 RETURNING *
        `, [Math.max(0, Math.round(durationMs || 0)), workerInstanceId || null, tickAt || null]);
        return result.rows[0] || null;
    }

    static async recordWorkerFailure({ error, workerInstanceId }) {
        const result = await query(`
            UPDATE sim_state
            SET last_tick_error = $1, worker_instance_id = $2, updated_at = NOW()
            WHERE id = 1 RETURNING *
        `, [String(error?.message || error || 'Unknown worker error').slice(0, 2000), workerInstanceId || null]);
        return result.rows[0] || null;
    }

    static async resetRuntime(client, { requestId, version = 'runtime-recovery-v1' } = {}) {
        const existing = await client.query('SELECT result FROM sim_admin_mutations WHERE request_id = $1 FOR UPDATE', [requestId]);
        if (existing.rows[0]?.result?.reset === true) return { ...existing.rows[0].result, deduplicated: true };
        await client.query('DELETE FROM sim_queue');
        await client.query('DELETE FROM sim_diary');
        await client.query('DELETE FROM sim_rationale');
        await client.query('DELETE FROM sim_factual_events');
        await client.query('DELETE FROM sim_observer_batches');
        await client.query('DELETE FROM sim_forecast_edges');
        await client.query('DELETE FROM sim_forecast_nodes');
        await client.query('DELETE FROM sim_forecast_mutations');
        await client.query('DELETE FROM sim_forecast_versions');
        await client.query('DELETE FROM sim_forecast_days');
        const result = await client.query(`
            UPDATE sim_state SET location_id = 'petrogradka_home',
                needs = '{"hunger":20,"fatigue":10,"boredom":30,"horny":40,"hygiene":90,"bladder":0}'::jsonb,
                active_modifiers = '[]'::jsonb, weather_override = NULL,
                last_tick_at = NOW(), last_successful_tick_at = NULL,
                last_tick_error = NULL, last_tick_duration_ms = NULL,
                runtime_recovery_version = $1, runtime_reset_at = NOW(), updated_at = NOW()
            WHERE id = 1 RETURNING *
        `, [version]);
        const payload = { reset: true, request_id: requestId, runtime_recovery_version: version, reset_at: new Date().toISOString() };
        await client.query(`
            INSERT INTO sim_admin_mutations (request_id, action, status, result, completed_at)
            VALUES ($1, 'RESET_RUNTIME', 'COMPLETED', $2::jsonb, NOW())
            ON CONFLICT (request_id) DO UPDATE SET result = EXCLUDED.result, status = EXCLUDED.status, completed_at = EXCLUDED.completed_at
        `, [requestId, JSON.stringify(payload)]);
        await this.addRationale(client, {
            category: 'RUNTIME_RESET', title: 'Runtime simulation reset',
            explanation: 'Очищены только исполнительные артефакты; users, wallet, inventory и memory сохранены.', payload
        });
        return { ...payload, state: result.rows[0], deduplicated: false };
    }

    /**
     * Atomically modifies wallet balances (rubles & stars).
     */
    static async updateWallet(client, rublesDelta = 0, starsDelta = 0) {
        const res = await client.query(`
            UPDATE sim_state SET
                wallet_rubles = GREATEST(0, wallet_rubles + $1),
                wallet_stars = GREATEST(0, wallet_stars + $2),
                updated_at = NOW()
            WHERE id = 1
            RETURNING wallet_rubles, wallet_stars
        `, [rublesDelta, starsDelta]);
        return res.rows[0];
    }

    /**
     * Retrieves all items from inventory.
     */
    static async getInventory(client) {
        const q = client ? client.query.bind(client) : query;
        const res = await q('SELECT * FROM sim_inventory ORDER BY id ASC');
        return res.rows;
    }

    /**
     * Finds item by item_id.
     */
    static async getInventoryItem(client, itemId) {
        const q = client ? client.query.bind(client) : query;
        const res = await q('SELECT * FROM sim_inventory WHERE item_id = $1 LIMIT 1', [itemId]);
        return res.rows[0] || null;
    }

    /**
     * Equips a clothing item, unequipping only the item occupying the same slot
     * (bельё / верх / низ / верхняя одежда / обувь). Legacy rows without a `slot`
     * property default to the "top" slot, preserving the old single-item behaviour.
     */
    static async equipClothing(client, itemId) {
        const target = await this.getInventoryItem(client, itemId);
        if (!target || target.item_type !== 'clothes' || Number(target.quantity) <= 0) return null;

        const slot = target.properties?.slot || 'top';

        const conflictingSlots = slot === 'dress'
            ? ['dress', 'top', 'bottom']
            : (slot === 'top' || slot === 'bottom' ? [slot, 'dress'] : [slot]);

        await client.query(`
            UPDATE sim_inventory
            SET is_equipped = FALSE
            WHERE item_type = 'clothes'
              AND is_equipped = TRUE
              AND COALESCE(properties->>'slot', 'top') = ANY($1::text[])
              AND item_id <> $2
        `, [conflictingSlots, itemId]);

        const res = await client.query(`
            UPDATE sim_inventory
            SET is_equipped = TRUE
            WHERE item_id = $1 AND quantity > 0
            RETURNING *
        `, [itemId]);
        return res.rows[0] || null;
    }

    /**
     * Unequips a single clothing item.
     */
    static async unequipClothing(client, itemId) {
        const target = await this.getInventoryItem(client, itemId);
        if (!target || target.item_type !== 'clothes') return null;
        const res = await client.query(
            `UPDATE sim_inventory SET is_equipped = FALSE WHERE item_id = $1 AND item_type = 'clothes' RETURNING *`,
            [itemId]
        );
        return res.rows[0] || null;
    }

    /**
     * Adds a new item or increases the quantity of an existing one.
     */
    static async upsertItem(client, { itemId, itemType, properties = {}, quantity = 1 }) {
        const q = client ? client.query.bind(client) : query;
        const res = await q(`
            INSERT INTO sim_inventory (item_id, item_type, properties, quantity)
            VALUES ($1, $2, $3::jsonb, $4)
            ON CONFLICT (item_id) DO UPDATE SET
                quantity = sim_inventory.quantity + EXCLUDED.quantity,
                properties = CASE
                    WHEN EXCLUDED.properties = '{}'::jsonb THEN sim_inventory.properties
                    ELSE sim_inventory.properties || EXCLUDED.properties
                END
            RETURNING *
        `, [itemId, itemType, JSON.stringify(properties), quantity]);
        return res.rows[0];
    }

    /**
     * Consumes or decrements inventory item quantity.
     */
    static async consumeItem(client, itemId, qty = 1) {
        const res = await client.query(`
            UPDATE sim_inventory
            SET quantity = quantity - $2,
                is_equipped = CASE WHEN quantity - $2 <= 0 THEN FALSE ELSE is_equipped END
            WHERE item_id = $1 AND quantity >= $2
            RETURNING *
        `, [itemId, qty]);
        return res.rows[0] || null;
    }

    static async getFirstConsumable(client, itemType) {
        const q = client ? client.query.bind(client) : query;
        const res = await q(`
            SELECT * FROM sim_inventory
            WHERE item_type = $1 AND quantity > 0
            ORDER BY id ASC LIMIT 1
        `, [itemType]);
        return res.rows[0] || null;
    }

    /**
     * Gets active task queue sorted by priority DESC, created_at ASC.
     */
    static async getQueue(client, { statuses = null, limit = null, source = null, cursor = null } = {}) {
        const q = client ? client.query.bind(client) : query;
        const allowedStatuses = statuses?.length
            ? statuses
            : ['PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY'];
        const params = [allowedStatuses];
        const filters = [`status = ANY($1::varchar[])`];
        if (source) { params.push(source); filters.push(`created_by = $${params.length}`); }
        if (cursor) { params.push(Number(cursor)); filters.push(`id < $${params.length}`); }
        const limitClause = limit ? `LIMIT $${params.push(Math.max(1, Number(limit)))} ` : '';
        const res = await q(`
            SELECT * FROM sim_queue
            WHERE ${filters.join(' AND ')}
            ORDER BY priority DESC, created_at DESC, id DESC
            ${limitClause}
        `, params);
        return res.rows;
    }

    static async getQueueAnomalies() {
        const [duplicates, stalled, expanded] = await Promise.all([
            query(`
                SELECT active_scope_key, COUNT(*)::int AS count, ARRAY_AGG(id ORDER BY id) AS task_ids
                FROM sim_queue
                WHERE active_scope_key IS NOT NULL
                  AND status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY')
                GROUP BY active_scope_key HAVING COUNT(*) > 1
                ORDER BY count DESC
            `),
            query(`
                SELECT id, task_type, status, created_at
                FROM sim_queue
                WHERE status IN ('IN_PROGRESS', 'IN_TRANSIT') AND updated_at < NOW() - INTERVAL '30 minutes'
                ORDER BY updated_at ASC LIMIT 20
            `).catch(() => ({ rows: [] })),
            query(`
                SELECT id, task_type, status, dependencies_expanded_at
                FROM sim_queue
                WHERE dependencies_expanded_at IS NOT NULL
                  AND status = 'PENDING'
                ORDER BY dependencies_expanded_at DESC LIMIT 20
            `)
        ]);
        return { duplicateScopes: duplicates.rows, stalledTasks: stalled.rows, expandedPendingRoots: expanded.rows };
    }

    static async repairQueueAnomalies(client) {
        const activeStatuses = ['PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY'];
        const result = await client.query(`
            SELECT id, task_type, status, created_by, created_at, parent_task_id, root_task_id, active_scope_key
            FROM sim_queue
            WHERE status = ANY($1::varchar[])
            ORDER BY created_at DESC, id DESC
        `, [activeStatuses]);
        const rows = result.rows;
        const cancel = new Set();
        const scopeGroups = new Map();
        rows.filter(row => row.active_scope_key).forEach(row => {
            const group = scopeGroups.get(row.active_scope_key) || [];
            group.push(row);
            scopeGroups.set(row.active_scope_key, group);
        });
        for (const group of scopeGroups.values()) group.slice(1).forEach(row => cancel.add(row.id));

        for (const taskType of ['EMERGENCY_EAT', 'GO_TO_BATHROOM', 'SLEEP_EXHAUSTED']) {
            // A root emergency is never a child task. Older workers did not
            // consistently write created_by/active_scope_key, so task_type +
            // parent_task_id is the reliable recovery discriminator here.
            const roots = rows.filter(row => row.task_type === taskType && !row.parent_task_id);
            if (roots.length < 2) continue;
            const score = root => {
                const children = rows.filter(row => row.root_task_id === root.id);
                const hasExecutableChild = children.some(row => ['PENDING', 'IN_PROGRESS', 'IN_TRANSIT'].includes(row.status));
                return [hasExecutableChild ? 1 : 0, new Date(root.created_at).getTime(), Number(root.id)].join(':');
            };
            roots.sort((left, right) => score(right).localeCompare(score(left)));
            roots.slice(1).forEach(root => {
                cancel.add(root.id);
                rows.filter(row => row.root_task_id === root.id).forEach(child => cancel.add(child.id));
            });
        }
        const ids = [...cancel];
        if (!ids.length) return { cancelled: 0, ids: [] };
        const cancelled = await client.query(`
            UPDATE sim_queue
            SET status = 'CANCELLED',
                result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('reason', 'DUPLICATE_ACTIVE_ROOT', 'repaired_at', NOW()),
                updated_at = NOW(), completed_at = COALESCE(completed_at, NOW())
            WHERE id = ANY($1::bigint[])
              AND status = ANY($2::varchar[])
            RETURNING id
        `, [ids, activeStatuses]);
        return { cancelled: cancelled.rowCount, ids: cancelled.rows.map(row => row.id) };
    }

    static async getExecutableTask(client, { lock = true } = {}) {
        const q = client ? client.query.bind(client) : query;
        const lockClause = client && lock ? ' FOR UPDATE SKIP LOCKED' : '';
        const res = await q(`
            SELECT * FROM sim_queue
            WHERE status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT')
              AND NOT EXISTS (
                  SELECT 1 FROM sim_queue dependency
                  WHERE dependency.id = sim_queue.depends_on_task_id
                    AND dependency.status <> 'COMPLETED'
              )
            ORDER BY priority DESC, created_at DESC, id DESC
            LIMIT 1${lockClause}
        `);
        return res.rows[0] || null;
    }

    /**
     * Pushes a new task onto the queue stack.
     */
    static async enqueueTask(client, {
        taskType, targetLocation, durationMinutes, priority = 10, createdBy = 'SYSTEM',
        parentTaskId = null, rootTaskId = null, importance = 1, transit = null,
        idempotencyKey = null, activeScopeKey = null, dependencyOrder = null,
        dependsOnTaskId = null, status = 'PENDING', result = {}
    }) {
        const safeDuration = Math.max(5, Math.round(Number(durationMinutes) || 30));
        if (activeScopeKey) {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [activeScopeKey]);
            const existing = await client.query(`
                SELECT * FROM sim_queue
                WHERE active_scope_key = $1
                  AND status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY')
                ORDER BY id DESC LIMIT 1
            `, [activeScopeKey]);
            if (existing.rows[0]) return { task: existing.rows[0], created: false, deduplicated: true };
        }
        const res = await client.query(`
                INSERT INTO sim_queue (
                    task_type, target_location, duration_minutes, remaining_minutes, priority, created_by,
                    parent_task_id, root_task_id, importance, transit_from_location, transit_to_location,
                    transit_route, status, idempotency_key, active_scope_key, dependency_order,
                    depends_on_task_id, result
                )
                VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17::jsonb)
                ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
                DO UPDATE SET id = sim_queue.id
                RETURNING *, (xmax = 0) AS inserted
            `, [taskType, targetLocation || 'petrogradka_home', safeDuration, priority, createdBy, parentTaskId, rootTaskId, importance,
                transit?.fromLocation || null, transit?.toLocation || null, transit?.route ? JSON.stringify(transit.route) : null,
                status, idempotencyKey, activeScopeKey, dependencyOrder, dependsOnTaskId, JSON.stringify(result || {})]);
        let task = res.rows[0];
        let created = !!task?.inserted;
        if (!task && activeScopeKey) {
            const existing = await client.query(`
                SELECT * FROM sim_queue
                WHERE active_scope_key = $1
                  AND status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY')
                ORDER BY id DESC LIMIT 1
            `, [activeScopeKey]);
            task = existing.rows[0] || null;
            created = false;
        }
        if (!task) throw new Error(`Unable to enqueue task ${taskType}`);
        delete task.inserted;
        if (!task.root_task_id) {
            const root = await client.query('UPDATE sim_queue SET root_task_id = id WHERE id = $1 RETURNING *', [task.id]);
            task = root.rows[0];
        }
        return { task, created, deduplicated: !created };
    }

    static async pushTask(client, payload) {
        const result = await this.enqueueTask(client, payload);
        return result.task;
    }

    static async hasQueuedTask(client, taskType) {
        const q = client ? client.query.bind(client) : query;
        const res = await q(`
            SELECT EXISTS(
                SELECT 1 FROM sim_queue
                WHERE task_type = $1 AND status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT', 'PAUSED', 'PAUSED_WAITING_DEPENDENCY')
            ) AS exists
        `, [taskType]);
        return !!res.rows[0]?.exists;
    }

    static async getTaskById(client, taskId) {
        const q = client ? client.query.bind(client) : query;
        const result = await q('SELECT * FROM sim_queue WHERE id = $1', [taskId]);
        return result.rows[0] || null;
    }

    /**
     * Advances progress on the current top task by elapsed minutes.
     */
    static async advanceTopTaskProgress(client, taskId, elapsedMinutes) {
        const res = await client.query(`
            UPDATE sim_queue SET
                remaining_minutes = GREATEST(0, remaining_minutes - $2),
                progress_percent = LEAST(100, ROUND((1 - GREATEST(0, remaining_minutes - $2)::numeric / NULLIF(duration_minutes, 0)) * 100, 2)),
                transit_progress_percent = CASE WHEN task_type = 'TRAVEL' THEN LEAST(100, ROUND((1 - GREATEST(0, remaining_minutes - $2)::numeric / NULLIF(duration_minutes, 0)) * 100, 2)) ELSE transit_progress_percent END,
                transit_started_at = CASE WHEN task_type = 'TRAVEL' THEN COALESCE(transit_started_at, NOW()) ELSE transit_started_at END,
                status = CASE
                    WHEN remaining_minutes - $2 <= 0 THEN 'COMPLETED'
                    WHEN task_type = 'TRAVEL' THEN 'IN_TRANSIT'
                    ELSE 'IN_PROGRESS'
                END,
                updated_at = NOW(),
                completed_at = CASE WHEN remaining_minutes - $2 <= 0 THEN NOW() ELSE completed_at END
            WHERE id = $1 AND status IN ('PENDING', 'IN_PROGRESS', 'IN_TRANSIT')
            RETURNING *
        `, [taskId, elapsedMinutes]);
        return res.rows[0];
    }

    static async completeTask(client, taskId) {
        const res = await client.query(`
            UPDATE sim_queue
            SET remaining_minutes = 0, progress_percent = 100, transit_progress_percent = CASE WHEN task_type = 'TRAVEL' THEN 100 ELSE transit_progress_percent END, status = 'COMPLETED', updated_at = NOW(), completed_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [taskId]);
        return res.rows[0] || null;
    }

    /**
     * Pauses tasks in queue when a higher priority interrupt arrives.
     */
    static async pauseActiveTasks(client, interruptTaskId = null) {
        if (!interruptTaskId) return [];
        const result = await client.query(`
            UPDATE sim_queue
            SET status = 'PAUSED', paused_by_task_id = $1, updated_at = NOW()
            WHERE status IN ('IN_PROGRESS', 'IN_TRANSIT') AND id <> $1
            RETURNING *
        `, [interruptTaskId]);
        return result.rows;
    }

    static async getActiveTransitTask(client) {
        const q = client ? client.query.bind(client) : query;
        const res = await q(`
            SELECT * FROM sim_queue
            WHERE task_type = 'TRAVEL' AND status IN ('IN_PROGRESS', 'IN_TRANSIT')
            ORDER BY id DESC LIMIT 1
        `);
        return res.rows[0] || null;
    }

    static async pauseActiveTasksFor(client, interruptTaskId) {
        const q = client ? client.query.bind(client) : query;
        const interruptTask = await q('SELECT * FROM sim_queue WHERE id = $1', [interruptTaskId]);
        const isPhysiologicalRecovery = ['SLEEP_EXHAUSTED', 'SLEEP_NIGHT', 'REST_HOME', 'EMERGENCY_EAT'].includes(interruptTask.rows[0]?.task_type);

        if (!isPhysiologicalRecovery) {
            const activeTransits = await q(`
                SELECT id, target_location FROM sim_queue
                WHERE status IN ('IN_PROGRESS', 'IN_TRANSIT') AND task_type = 'TRAVEL' AND id <> $1
            `, [interruptTaskId]);

            for (const travel of activeTransits.rows) {
                await q(`
                    UPDATE sim_queue
                    SET status = 'COMPLETED', remaining_minutes = 0, completed_at = NOW(), updated_at = NOW()
                    WHERE id = $1
                `, [travel.id]);
                if (travel.target_location) {
                    await q(`
                        UPDATE sim_state SET location_id = $1, updated_at = NOW() WHERE id = 1
                    `, [travel.target_location]);
                }
            }
        }

        await q(`
            UPDATE sim_queue
            SET status = 'PAUSED', paused_by_task_id = $1, updated_at = NOW()
            WHERE status IN ('IN_PROGRESS', 'IN_TRANSIT') AND id <> $1 AND task_type <> 'TRAVEL'
        `, [interruptTaskId]);
    }

    static async pauseForDependencies(client, taskId) {
        const res = await client.query(`
            UPDATE sim_queue SET status = 'PAUSED_WAITING_DEPENDENCY'
            WHERE id = $1 RETURNING *
        `, [taskId]);
        return res.rows[0] || null;
    }

    static async resumeReadyParents(client) {
        const res = await client.query(`
            UPDATE sim_queue parent
            SET status = 'PENDING', paused_by_task_id = NULL, updated_at = NOW()
            WHERE parent.status = 'PAUSED_WAITING_DEPENDENCY'
              AND NOT EXISTS (
                  SELECT 1 FROM sim_queue child
                  WHERE child.parent_task_id = parent.id
                    AND child.status <> 'COMPLETED'
              )
            RETURNING *
        `);
        return res.rows;
    }

    static async completeReadyDependencyParents(client) {
        const res = await client.query(`
            UPDATE sim_queue parent
            SET status = 'COMPLETED', remaining_minutes = 0, progress_percent = 100,
                updated_at = NOW(), completed_at = NOW(), result = jsonb_build_object('completed_by', 'DEPENDENCY_CHAIN')
            WHERE parent.status = 'PENDING'
              AND parent.dependencies_expanded_at IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM sim_queue child
                  WHERE child.parent_task_id = parent.id AND child.status <> 'COMPLETED'
              )
            RETURNING *
        `);
        return res.rows;
    }

    static async failDependencyParents(client, childTaskId, reason = 'DEPENDENCY_FAILED') {
        const res = await client.query(`
            UPDATE sim_queue parent
            SET status = 'FAILED',
                result = jsonb_build_object('reason', COALESCE($2::text, 'DEPENDENCY_FAILED'), 'failed_child_task_id', $1),
                updated_at = NOW(), completed_at = NOW()
            WHERE parent.id = (SELECT parent_task_id FROM sim_queue WHERE id = $1)
              AND parent.status IN ('PENDING', 'PAUSED_WAITING_DEPENDENCY')
            RETURNING *
        `, [childTaskId, reason]);
        return res.rows;
    }

    static async resumePausedTasks(client, completedTaskId = null) {
        const res = await client.query(`
            UPDATE sim_queue paused
            SET status = 'PENDING', paused_by_task_id = NULL, updated_at = NOW()
            WHERE paused.status = 'PAUSED'
              AND ($1::bigint IS NULL OR paused.paused_by_task_id = $1)
              AND NOT EXISTS (
                  SELECT 1 FROM sim_queue blocker
                  WHERE blocker.id = paused.paused_by_task_id
                    AND blocker.status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')
              )
            RETURNING *
        `, [completedTaskId]);
        return res.rows;
    }

    static async markDependenciesExpanded(client, taskId) {
        const res = await client.query(`
            UPDATE sim_queue SET dependencies_expanded_at = COALESCE(dependencies_expanded_at, NOW()), status = 'PAUSED_WAITING_DEPENDENCY'
            WHERE id = $1 RETURNING *
        `, [taskId]);
        return res.rows[0] || null;
    }

    /**
     * Gets NPC state by ID.
     */
    static async getNpcState(client, npcId) {
        const q = client ? client.query.bind(client) : query;
        const res = await q('SELECT * FROM sim_npc_state WHERE npc_id = $1', [npcId]);
        return res.rows[0] || null;
    }

    /**
     * Updates NPC state JSON.
     */
    static async updateNpcState(client, npcId, stateJson) {
        const res = await client.query(`
            INSERT INTO sim_npc_state (npc_id, state_json, last_interaction)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (npc_id) DO UPDATE SET
                state_json = EXCLUDED.state_json,
                last_interaction = NOW()
            RETURNING *
        `, [npcId, JSON.stringify(stateJson)]);
        return res.rows[0];
    }

    /**
     * Adds an entry to sim_diary.
     */
    static async addDiaryEntry(client, rawLog, llmNarrative = null) {
        const q = client ? client.query.bind(client) : query;
        const res = await q(`
            INSERT INTO sim_diary (raw_log, llm_narrative, timestamp)
            VALUES ($1, $2, NOW())
            RETURNING *
        `, [rawLog, llmNarrative]);
        return res.rows[0];
    }

    static async addFactualEvent(client, {
        eventType, taskId = null, rootTaskId = null, importance = 1, payload = {},
        beforeSnapshot = {}, afterSnapshot = {}, idempotencyKey
    }) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            INSERT INTO sim_factual_events
                (event_type, task_id, root_task_id, importance, payload, before_snapshot, after_snapshot, idempotency_key)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING *
        `, [eventType, taskId, rootTaskId, importance, JSON.stringify(payload), JSON.stringify(beforeSnapshot), JSON.stringify(afterSnapshot), idempotencyKey]);
        const row = result.rows[0] || null;
        if (row) publishDevtoolEvent('factual_event', row);
        return row;
    }

    static async getRecentFactualEvents(limit = 30) {
        const result = await query(`SELECT * FROM sim_factual_events ORDER BY occurred_at DESC, id DESC LIMIT $1`, [limit]);
        return result.rows.reverse();
    }

    static async hasRecentTaskFact(client, taskType, since) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            SELECT 1
            FROM sim_factual_events
            WHERE event_type IN ('TASK_COMPLETED', 'ROOT_TASK_COMPLETED')
              AND payload->>'taskType' = $1
              AND occurred_at >= $2
            LIMIT 1
        `, [taskType, since]);
        return result.rowCount > 0;
    }

    static async hasRoutineFact(client, taskType, routineDate) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            SELECT 1
            FROM sim_factual_events
            WHERE event_type IN ('TASK_COMPLETED', 'ROOT_TASK_COMPLETED')
              AND payload->>'taskType' = $1
              AND payload->>'routineDate' = $2
            LIMIT 1
        `, [taskType, routineDate]);
        return result.rowCount > 0;
    }

    static async hasRoutineKindFact(client, routineKind, routineDate) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            SELECT 1
            FROM sim_factual_events
            WHERE event_type IN ('TASK_COMPLETED', 'ROOT_TASK_COMPLETED')
              AND payload->>'routineKind' = $1
              AND payload->>'routineDate' = $2
            LIMIT 1
        `, [routineKind, routineDate]);
        return result.rowCount > 0;
    }

    static async getFactualEventsSince(since, limit = 100) {
        const result = await query(`SELECT * FROM sim_factual_events WHERE occurred_at >= $1 ORDER BY occurred_at ASC, id ASC LIMIT $2`, [since, limit]);
        return result.rows;
    }

    static async getRandomEventHistory(client, since) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            SELECT payload->>'id' AS event_id, MAX(occurred_at) AS occurred_at
            FROM sim_factual_events
            WHERE event_type = 'RANDOM_EVENT' AND occurred_at >= $1
            GROUP BY payload->>'id'
        `, [since]);
        return Object.fromEntries(result.rows.map(row => [row.event_id, row.occurred_at]));
    }

    static async getCommitments(client, date = null) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            SELECT * FROM sim_commitments
            WHERE ($1::date IS NULL OR commitment_date = $1::date)
            ORDER BY priority DESC, due_at NULLS LAST, id ASC
        `, [date]);
        return result.rows;
    }

    static async upsertCommitment(client, commitment) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            INSERT INTO sim_commitments
                (commitment_key, type, title, status, priority, commitment_date, due_at, planned_start,
                 duration_minutes, preparation_minutes, travel_minutes, target_location, origin, consequence_on_miss, metadata, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, NOW())
            ON CONFLICT (commitment_key) DO UPDATE SET
                type = EXCLUDED.type, title = EXCLUDED.title, priority = EXCLUDED.priority,
                due_at = EXCLUDED.due_at, planned_start = EXCLUDED.planned_start,
                duration_minutes = EXCLUDED.duration_minutes, preparation_minutes = EXCLUDED.preparation_minutes,
                travel_minutes = EXCLUDED.travel_minutes, target_location = EXCLUDED.target_location,
                origin = EXCLUDED.origin, consequence_on_miss = EXCLUDED.consequence_on_miss,
                metadata = EXCLUDED.metadata, updated_at = NOW()
            RETURNING *
        `, [commitment.commitmentKey || `${commitment.type}:${commitment.date}:${commitment.title}`, commitment.type, commitment.title,
            commitment.status || 'PLANNED', commitment.priority || 0, commitment.date, commitment.dueAt || null, commitment.plannedStart || null,
            commitment.durationMinutes || 30, commitment.preparationMinutes || 0, commitment.travelMinutes || 0,
            commitment.targetLocation || 'petrogradka_home', commitment.origin || 'SYSTEM', commitment.consequenceOnMiss || null, JSON.stringify(commitment.metadata || {})]);
        return result.rows[0] || null;
    }

    static async updateCommitmentStatus(client, id, status) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`UPDATE sim_commitments SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, status]);
        return result.rows[0] || null;
    }

    static async findCommitmentBySourceEvent(client, sourceEventId) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`SELECT * FROM sim_commitments WHERE metadata->>'sourceEventId' = $1 LIMIT 1`, [String(sourceEventId)]);
        return result.rows[0] || null;
    }

    static async createObserverBatch(client, { trigger, eventIds = [], rawContext = {} }) {
        const q = client ? client.query.bind(client) : query;
        const result = await q(`
            INSERT INTO sim_observer_batches (trigger, event_ids, raw_context)
            VALUES ($1, $2::bigint[], $3::jsonb) RETURNING *
        `, [trigger, eventIds, JSON.stringify(rawContext)]);
        return result.rows[0];
    }

    static async completeObserverBatch(batchId, narrative, status = 'COMPLETED') {
        const result = await query(`
            UPDATE sim_observer_batches SET narrative = $2, status = $3, completed_at = NOW()
            WHERE id = $1 RETURNING *
        `, [batchId, narrative, status]);
        return result.rows[0] || null;
    }

    static async getRecentObserverBatches(limit = 20) {
        const result = await query(`SELECT * FROM sim_observer_batches ORDER BY created_at DESC, id DESC LIMIT $1`, [limit]);
        return result.rows.reverse();
    }

    /**
     * Updates LLM narrative for an existing diary entry.
     */
    static async updateDiaryNarrative(diaryId, llmNarrative) {
        const res = await query(`
            UPDATE sim_diary SET llm_narrative = $2 WHERE id = $1 RETURNING *
        `, [diaryId, llmNarrative]);
        return res.rows[0];
    }

    /**
     * Gets recent diary entries.
     */
    static async getRecentDiaryEntries(limit = 10) {
        const res = await query(`
            SELECT * FROM sim_diary ORDER BY timestamp DESC LIMIT $1
        `, [limit]);
        return res.rows.reverse();
    }

    /**
     * Saves a 3-layer memory digest (DAILY, WEEKLY, MONTHLY).
     * Idempotent per (digestType, streamType, periodLabel, userId).
     */
    static async saveMemoryDigest({ digestType, streamType, periodLabel, summaryText, userId = null }) {
        const res = await query(`
            INSERT INTO user_memories_digests (digest_type, stream_type, period_label, summary_text, user_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (digest_type, stream_type, period_label, user_id)
            DO UPDATE SET summary_text = EXCLUDED.summary_text
            RETURNING *
        `, [digestType, streamType, periodLabel, summaryText, userId]);
        return res.rows[0];
    }

    /**
     * Lists memory digests, optionally filtered by stream/user.
     */
    static async getMemoryDigests({ streamType = null, userId = null, limit = 60 } = {}) {
        const res = await query(`
            SELECT * FROM user_memories_digests
            WHERE ($1::varchar IS NULL OR stream_type = $1)
              AND ($2::bigint IS NULL OR user_id = $2)
            ORDER BY created_at DESC
            LIMIT $3
        `, [streamType, userId, limit]);
        return res.rows;
    }

    static async getConversationEventsForDigest(userId, since, limit = 300) {
        const res = await query(`
            SELECT role, content, event_type, occurred_at
            FROM conversation_events
            WHERE user_id = $1
              AND occurred_at >= $2
              AND content IS NOT NULL
              AND content <> ''
              AND status = 'COMPLETED'
            ORDER BY occurred_at ASC
            LIMIT $3
        `, [userId, since, limit]);
        return res.rows;
    }

    // Forecast data is display-only. It never creates simulation tasks.
    static async createForecastVersion(client, { date, source, reason = null, nodes = [], edges = [], fingerprint = null }) {
        const dayRes = await client.query(`
            INSERT INTO sim_forecast_days (date) VALUES ($1)
            ON CONFLICT (date) DO UPDATE SET updated_at = NOW() RETURNING *
        `, [date]);
        const day = dayRes.rows[0];
        const previousRes = await client.query(`
            SELECT * FROM sim_forecast_versions WHERE forecast_day_id = $1 ORDER BY version_number DESC LIMIT 1
        `, [day.id]);
        const previous = previousRes.rows[0] || null;
        if (previous && fingerprint && previous.fingerprint === fingerprint) return previous;
        if (previous) {
            await client.query(`UPDATE sim_forecast_nodes SET status = 'SUPERSEDED' WHERE version_id = $1 AND status = 'FORECAST'`, [previous.id]);
        }
        const versionRes = await client.query(`
            INSERT INTO sim_forecast_versions (forecast_day_id, version_number, source, mutation_reason, fingerprint)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [day.id, (previous?.version_number || 0) + 1, source, reason, fingerprint]);
        const version = versionRes.rows[0];
        const nodeIds = [];
        for (const node of nodes) {
            const result = await client.query(`
                INSERT INTO sim_forecast_nodes (version_id, intent_key, task_type, location_id, planned_start, planned_duration_minutes, status, metadata)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id
            `, [version.id, node.intentKey, node.taskType, node.locationId, node.plannedStart || null, node.durationMinutes || 30, node.status || 'FORECAST', JSON.stringify(node.metadata || {})]);
            nodeIds.push(result.rows[0].id);
        }
        for (const [from, to, edgeType = 'INTENT'] of edges) {
            if (nodeIds[from] && nodeIds[to]) await client.query(`
                INSERT INTO sim_forecast_edges (version_id, from_node_id, to_node_id, edge_type) VALUES ($1,$2,$3,$4)
            `, [version.id, nodeIds[from], nodeIds[to], edgeType]);
        }
        if (previous) await client.query(`
            INSERT INTO sim_forecast_mutations (forecast_day_id, from_version_id, to_version_id, reason, source)
            VALUES ($1,$2,$3,$4,$5)
        `, [day.id, previous.id, version.id, reason || 'FORECAST_REFRESH', source]);
        return version;
    }

    static async getLatestForecast(date = null, client = null) {
        const q = client ? client.query.bind(client) : query;
        const dateClause = date ? 'WHERE d.date = $1' : 'WHERE d.date = (NOW() AT TIME ZONE \'Europe/Moscow\')::date';
        const res = await q(`
            SELECT d.*, v.id AS version_id, v.version_number, v.source, v.mutation_reason, v.created_at AS version_created_at
            FROM sim_forecast_days d
            JOIN LATERAL (SELECT * FROM sim_forecast_versions WHERE forecast_day_id = d.id ORDER BY version_number DESC LIMIT 1) v ON TRUE
            ${dateClause}
        `, date ? [date] : []);
        const forecast = res.rows[0] || null;
        if (!forecast) return null;
        const [nodes, edges] = await Promise.all([
            q('SELECT * FROM sim_forecast_nodes WHERE version_id = $1 ORDER BY id ASC', [forecast.version_id]),
            q('SELECT * FROM sim_forecast_edges WHERE version_id = $1 ORDER BY id ASC', [forecast.version_id])
        ]);
        return { ...forecast, nodes: nodes.rows, edges: edges.rows };
    }

    static async getForecastHistory(limit = 20) {
        const res = await query(`
            SELECT m.*, f.version_number AS to_version_number
            FROM sim_forecast_mutations m JOIN sim_forecast_versions f ON f.id = m.to_version_id
            ORDER BY m.created_at DESC LIMIT $1
        `, [limit]);
        return res.rows;
    }

    // =====================================================================
    // RATIONALE TRACE (why the engine decided something — real data)
    // =====================================================================

    static async addRationale(client, { category, title, explanation, payload = {} }) {
        const q = client ? client.query.bind(client) : query;
        const res = await q(`
            INSERT INTO sim_rationale (category, title, explanation, payload)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING *
        `, [category, title, explanation, JSON.stringify(payload)]);
        const row = res.rows[0];
        publishDevtoolEvent('rationale', { id: row?.id, category, title, explanation, payload });
        return row;
    }

    static async getRecentRationale(limit = 40) {
        const res = await query(
            'SELECT * FROM sim_rationale ORDER BY created_at DESC, id DESC LIMIT $1',
            [limit]
        );
        return res.rows;
    }

    static async beginAdminMutation(client, { requestId, action }) {
        const result = await client.query(`
            INSERT INTO sim_admin_mutations (request_id, action, status)
            VALUES ($1, $2, 'PENDING')
            ON CONFLICT (request_id) DO NOTHING
            RETURNING *
        `, [requestId, action]);
        if (result.rows[0]) return { row: result.rows[0], claimed: true };
        const existing = await client.query(
            'SELECT * FROM sim_admin_mutations WHERE request_id = $1 FOR UPDATE',
            [requestId]
        );
        const row = existing.rows[0] || null;
        if (row?.status === 'FAILED') {
            const retried = await client.query(`
                UPDATE sim_admin_mutations SET action = $2, status = 'PENDING', result = '{}'::jsonb, completed_at = NULL
                WHERE request_id = $1 RETURNING *
            `, [requestId, action]);
            return { row: retried.rows[0], claimed: true };
        }
        return { row, claimed: false };
    }

    static async completeAdminMutation(client, requestId, result) {
        const updated = await client.query(`
            UPDATE sim_admin_mutations
            SET status = 'COMPLETED', result = $2::jsonb, completed_at = NOW()
            WHERE request_id = $1
            RETURNING *
        `, [requestId, JSON.stringify(result || {})]);
        return updated.rows[0] || null;
    }

    static async pruneOperationalLogs({ promptDays = 30, rationaleDays = 14, diaryDays = 90 } = {}) {
        const [prompts, rationale, diary] = await Promise.all([
            query(`DELETE FROM prompt_logs WHERE created_at < NOW() - ($1 || ' days')::interval`, [promptDays]),
            query(`DELETE FROM sim_rationale WHERE created_at < NOW() - ($1 || ' days')::interval`, [rationaleDays]),
            query(`DELETE FROM sim_diary WHERE timestamp < NOW() - ($1 || ' days')::interval`, [diaryDays])
        ]);
        return { prompt_logs: prompts.rowCount, sim_rationale: rationale.rowCount, sim_diary: diary.rowCount };
    }
}
