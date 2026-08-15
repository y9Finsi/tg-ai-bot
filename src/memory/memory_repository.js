import { createHash, randomUUID } from 'node:crypto';
import { pool, query } from '../db/database.js';
import {
    normalizeMemoryFact,
    normalizeMemoryText,
    sanitizeMemoryValue
} from './memory_normalizer.js';
import { MEMORY_TYPE, normalizeMemoryType } from './memory_types.js';
import { rerankMemoryFacts } from './memory_policy.js';
import { createSemanticaClient } from './semantica_client.js';

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_CANDIDATE_LIMIT = 200;
const DEFAULT_GRAPH_LIMIT = 250;
const CORE_TYPES = Object.freeze([MEMORY_TYPE.PROFILE]);
const PRECEDENT_TYPES = Object.freeze([
    MEMORY_TYPE.SIMULATION_OBSERVATION,
    MEMORY_TYPE.DECISION_TRACE
]);

function asPositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) return fallback;
    return Math.min(number, maximum);
}

function asUserId(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new TypeError('Memory operation requires userId');
    }
    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) throw new TypeError('userId must be an integer');
    return normalized;
}

function asFactId(value, fieldName = 'factId') {
    const normalized = String(value ?? '').trim();
    if (!/^[1-9]\d*$/.test(normalized)) throw new TypeError(`${fieldName} must be a positive integer`);
    return normalized;
}

function clampScore(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(1, Math.max(0, number));
}

function hashText(value) {
    return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeTokens(value) {
    return [...new Set(
        String(value || '')
            .toLocaleLowerCase('ru-RU')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .split(/\s+/)
            .map(token => token.trim())
            .filter(token => token.length >= 2)
    )];
}

function lexicalRelevance(text, queryText) {
    const query = normalizeMemoryText(queryText, 2000).toLocaleLowerCase('ru-RU');
    const haystack = normalizeMemoryText(text, 8000).toLocaleLowerCase('ru-RU');
    if (!query || !haystack) return query ? 0 : 0.25;
    if (haystack === query) return 1;
    if (haystack.includes(query)) return 0.95;

    const queryTokens = normalizeTokens(query);
    if (queryTokens.length === 0) return 0;
    const factTokens = new Set(normalizeTokens(haystack));
    const matches = queryTokens.filter(token => factTokens.has(token)).length;
    if (matches === 0) return 0;

    const coverage = matches / queryTokens.length;
    const density = matches / Math.max(queryTokens.length, factTokens.size);
    return clampScore(0.15 + coverage * 0.65 + density * 0.20);
}

function rowToFact(row) {
    if (!row) return null;
    const text = normalizeMemoryText(row.normalized_text ?? row.text ?? row.fact);
    return {
        ...row,
        id: String(row.id),
        userId: String(row.user_id),
        memoryType: row.memory_type,
        normalizedText: text,
        text,
        fact: text,
        sourceEventId: row.source_event_id == null ? null : String(row.source_event_id),
        supersedesId: row.supersedes_id == null ? null : String(row.supersedes_id),
        isActive: row.is_active !== false
    };
}

function projectionFactPayload(row) {
    const fact = rowToFact(row);
    return {
        id: fact.id,
        user_id: fact.userId,
        memory_type: fact.memoryType,
        schema_version: Number(fact.schema_version || 1),
        payload: fact.payload || {},
        normalized_text: fact.normalizedText,
        valid_from: fact.valid_from,
        valid_until: fact.valid_until,
        observed_at: fact.observed_at,
        confidence: Number(fact.confidence ?? 0.5),
        importance: Number(fact.importance ?? 50),
        provenance: fact.provenance || {},
        source_event_id: fact.sourceEventId,
        supersedes_id: fact.supersedesId,
        content_hash: fact.content_hash,
        is_active: fact.isActive,
        updated_at: fact.updated_at
    };
}

function cleanMetadata(value) {
    const sanitized = sanitizeMemoryValue(value || {});
    return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : {};
}

function scoreFields(fact, selected, selectedRank, candidateRank) {
    const signals = fact.retrievalSignals || fact.retrieval_signals || {};
    const fallback = clampScore(fact.score ?? fact.retrievalScore ?? fact.retrieval_score, 0);
    return {
        candidateRank,
        selected,
        selectedRank: selected ? selectedRank : null,
        relevance: clampScore(signals.relevance ?? fact.relevanceScore ?? fact.relevance_score, fallback),
        recency: clampScore(signals.recency ?? fact.recencyScore ?? fact.recency_score, 0.5),
        confidence: clampScore(signals.confidence ?? fact.confidence, 0.5),
        importance: clampScore(signals.importance ?? Number(fact.importance) / 100, 0.5),
        type: clampScore(signals.type ?? fact.typeScore ?? fact.type_score, 0.5),
        final: clampScore(signals.final ?? fact.retrievalScore ?? fact.retrieval_score ?? fact.score, fallback)
    };
}

export class MemoryRepository {
    constructor({
        poolImpl = pool,
        queryImpl = query,
        now = () => new Date(),
        uuid = randomUUID,
        semanticaClient = createSemanticaClient()
    } = {}) {
        this.pool = poolImpl;
        this.query = queryImpl;
        this.now = now;
        this.uuid = uuid;
        this.semanticaClient = semanticaClient;
    }

    async withTransaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async enqueue(client, {
        userId,
        factId = null,
        operation = 'UPSERT',
        payload = {},
        idempotencyKey = null
    }) {
        const tenantId = asUserId(userId);
        const key = normalizeMemoryText(
            idempotencyKey || `projection:${operation.toLowerCase()}:${factId || 'user'}:${this.uuid()}`,
            255
        );
        const result = await client.query(
            `INSERT INTO memory_outbox
                (user_id, memory_fact_id, operation, payload, idempotency_key)
             VALUES ($1, $2, $3, $4::jsonb, $5)
             ON CONFLICT (user_id, idempotency_key) DO UPDATE
             SET updated_at = memory_outbox.updated_at
             RETURNING *`,
            [tenantId, factId, operation, JSON.stringify(cleanMetadata(payload)), key]
        );
        return result.rows[0] || null;
    }

    async createFact(input, options = {}) {
        const normalized = normalizeMemoryFact(input, {
            ...options,
            userId: options.userId ?? input?.userId ?? input?.user_id
        });
        const userId = asUserId(normalized.userId);

        return this.withTransaction(async client => {
            const idempotent = await client.query(
                `SELECT * FROM memory_fact
                 WHERE user_id = $1 AND idempotency_key = $2
                 FOR UPDATE`,
                [userId, normalized.idempotencyKey]
            );
            if (idempotent.rows[0]) return rowToFact(idempotent.rows[0]);

            const duplicate = await client.query(
                `SELECT * FROM memory_fact
                 WHERE user_id = $1
                   AND memory_type = $2
                   AND content_hash = $3
                   AND is_active = TRUE
                   AND (valid_until IS NULL OR valid_until > NOW())
                 ORDER BY updated_at DESC, id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [userId, normalized.memoryType, normalized.contentHash]
            );
            if (duplicate.rows[0] && !normalized.supersedesId) {
                const reinforced = await client.query(
                    `UPDATE memory_fact
                     SET observed_at = COALESCE($2, observed_at, NOW()),
                         confidence = GREATEST(confidence, $3),
                         importance = GREATEST(importance, $4),
                         provenance = provenance || $5::jsonb,
                         updated_at = NOW()
                     WHERE id = $1
                     RETURNING *`,
                    [
                        duplicate.rows[0].id,
                        normalized.observedAt,
                        normalized.confidence,
                        normalized.importance,
                        JSON.stringify({
                            ...normalized.provenance,
                            last_confirmation_source_event_id: normalized.sourceEventId
                        })
                    ]
                );
                const row = reinforced.rows[0];
                await this.enqueue(client, {
                    userId,
                    factId: row.id,
                    operation: 'UPSERT',
                    payload: projectionFactPayload(row)
                });
                return rowToFact(row);
            }

            if (normalized.supersedesId) {
                const supersededId = asFactId(normalized.supersedesId, 'supersedesId');
                const previous = await client.query(
                    `SELECT * FROM memory_fact
                     WHERE id = $1 AND user_id = $2
                     FOR UPDATE`,
                    [supersededId, userId]
                );
                if (!previous.rows[0]) throw new Error('Superseded memory fact was not found for this user');
                await client.query(
                    `UPDATE memory_fact
                     SET is_active = FALSE,
                         valid_until = COALESCE(
                             valid_until,
                             CASE
                                 WHEN NOW() > valid_from THEN NOW()
                                 ELSE valid_from + INTERVAL '1 millisecond'
                             END
                         ),
                         updated_at = NOW()
                     WHERE id = $1`,
                    [supersededId]
                );
                await this.enqueue(client, {
                    userId,
                    factId: supersededId,
                    operation: 'SUPERSEDE',
                    payload: {
                        fact_id: supersededId,
                        superseded_by_content_hash: normalized.contentHash
                    }
                });
            }

            const inserted = await client.query(
                `INSERT INTO memory_fact (
                    user_id, memory_type, schema_version, payload, normalized_text,
                    valid_from, valid_until, observed_at, confidence, importance,
                    provenance, source_event_id, supersedes_id, content_hash,
                    idempotency_key, is_active
                 ) VALUES (
                    $1, $2, $3, $4::jsonb, $5,
                    COALESCE($6::timestamptz, NOW()), $7::timestamptz, $8::timestamptz,
                    $9, $10, $11::jsonb, $12, $13, $14, $15, $16
                 )
                 RETURNING *`,
                [
                    userId,
                    normalized.memoryType,
                    normalized.schemaVersion,
                    JSON.stringify(normalized.payload),
                    normalized.normalizedText,
                    normalized.validFrom,
                    normalized.validUntil,
                    normalized.observedAt,
                    normalized.confidence,
                    normalized.importance,
                    JSON.stringify(normalized.provenance),
                    normalized.sourceEventId,
                    normalized.supersedesId,
                    normalized.contentHash,
                    normalized.idempotencyKey,
                    normalized.isActive
                ]
            );
            const row = inserted.rows[0];
            await this.enqueue(client, {
                userId,
                factId: row.id,
                operation: normalized.isActive ? 'UPSERT' : 'EXPIRE',
                payload: projectionFactPayload(row)
            });
            return rowToFact(row);
        });
    }

    async supersedeFact({ userId, factId, replacement, provenance = {} }) {
        const current = await this.getFact(userId, factId);
        if (!current) throw new Error('Memory fact not found');
        return this.createFact({
            ...replacement,
            userId,
            type: replacement?.type ?? replacement?.memoryType ?? current.memoryType,
            confidence: replacement?.confidence ?? current.confidence,
            importance: replacement?.importance ?? current.importance,
            provenance: {
                ...(current.provenance || {}),
                ...provenance,
                source: provenance.source || 'supersede'
            },
            supersedesId: current.id
        });
    }

    async updateFact(userId, factId, patch = {}) {
        const current = await this.getFact(userId, factId);
        if (!current) return null;

        const changesContent = [
            'fact', 'text', 'payload', 'type', 'memoryType', 'memory_type'
        ].some(key => Object.hasOwn(patch, key));
        if (changesContent) {
            const payload = patch.payload ?? {
                ...(current.payload || {}),
                text: patch.text ?? patch.fact ?? current.normalizedText
            };
            return this.supersedeFact({
                userId,
                factId,
                replacement: {
                    type: patch.type ?? patch.memoryType ?? patch.memory_type ?? current.memoryType,
                    payload,
                    confidence: patch.confidence ?? current.confidence,
                    importance: patch.importance ?? current.importance,
                    provenance: {
                        ...(current.provenance || {}),
                        ...(patch.provenance || {}),
                        edited_by: patch.editedBy || 'admin'
                    },
                    sourceEventId: patch.sourceEventId ?? current.sourceEventId
                },
                provenance: { reason: patch.reason || 'admin_edit' }
            });
        }

        const tenantId = asUserId(userId);
        const id = asFactId(factId);
        return this.withTransaction(async client => {
            const result = await client.query(
                `UPDATE memory_fact
                 SET confidence = COALESCE($3, confidence),
                     importance = COALESCE($4, importance),
                     provenance = provenance || $5::jsonb,
                     updated_at = NOW()
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [
                    id,
                    tenantId,
                    patch.confidence == null ? null : clampScore(patch.confidence, 0.5),
                    patch.importance == null
                        ? null
                        : Math.round(Math.min(100, Math.max(0, Number(patch.importance) || 0))),
                    JSON.stringify(cleanMetadata(patch.provenance))
                ]
            );
            const row = result.rows[0];
            if (!row) return null;
            await this.enqueue(client, {
                userId: tenantId,
                factId: row.id,
                operation: 'UPSERT',
                payload: projectionFactPayload(row)
            });
            return rowToFact(row);
        });
    }

    async setFactActive(userId, factId, isActive, provenance = {}) {
        const tenantId = asUserId(userId);
        const id = asFactId(factId);
        const active = Boolean(isActive);
        return this.withTransaction(async client => {
            if (active) {
                const replacement = await client.query(
                    `SELECT id FROM memory_fact
                     WHERE user_id = $1 AND supersedes_id = $2 AND is_active = TRUE
                     LIMIT 1`,
                    [tenantId, id]
                );
                if (replacement.rows[0]) {
                    throw new Error('Нельзя включить факт: у него уже есть активная новая версия');
                }
            }
            const result = await client.query(
                `UPDATE memory_fact
                 SET is_active = $3,
                     valid_until = CASE
                         WHEN $3 THEN NULL
                         ELSE COALESCE(
                             valid_until,
                             CASE
                                 WHEN NOW() > valid_from THEN NOW()
                                 ELSE valid_from + INTERVAL '1 millisecond'
                             END
                         )
                     END,
                     provenance = provenance || $4::jsonb,
                     updated_at = NOW()
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [id, tenantId, active, JSON.stringify(cleanMetadata(provenance))]
            );
            const row = result.rows[0];
            if (!row) return null;
            await this.enqueue(client, {
                userId: tenantId,
                factId: row.id,
                operation: active ? 'UPSERT' : 'EXPIRE',
                payload: projectionFactPayload(row)
            });
            return rowToFact(row);
        });
    }

    async archiveFact(userId, factId, provenance = {}) {
        return this.setFactActive(userId, factId, false, {
            ...provenance,
            archived_at: this.now().toISOString()
        });
    }

    async getFact(userId, factId) {
        const result = await this.query(
            `SELECT * FROM memory_fact WHERE id = $1 AND user_id = $2`,
            [asFactId(factId), asUserId(userId)]
        );
        return rowToFact(result.rows[0]);
    }

    async listFacts(userId, { includeInactive = false, limit = 200, types = null } = {}) {
        const normalizedTypes = Array.isArray(types)
            ? types.map(normalizeMemoryType).filter(Boolean)
            : [];
        const result = await this.query(
            `SELECT *
             FROM memory_fact
             WHERE user_id = $1
               AND ($2::boolean OR (
                    is_active = TRUE
                    AND valid_from <= NOW()
                    AND (valid_until IS NULL OR valid_until > NOW())
               ))
               AND (
                    cardinality($3::text[]) = 0
                    OR memory_type = ANY($3::text[])
               )
             ORDER BY is_active DESC, importance DESC, valid_from DESC, id DESC
             LIMIT $4`,
            [
                asUserId(userId),
                Boolean(includeInactive),
                normalizedTypes,
                asPositiveInteger(limit, 200, 1000)
            ]
        );
        return result.rows.map(rowToFact);
    }

    async getCoreFacts(userId, limit = 12) {
        return this.listFacts(userId, {
            includeInactive: false,
            limit: asPositiveInteger(limit, 12, 50),
            types: CORE_TYPES
        });
    }

    async search(userIdOrRequest, queryText = '', limit = DEFAULT_SEARCH_LIMIT, threshold = 0) {
        const request = typeof userIdOrRequest === 'object' && userIdOrRequest !== null
            ? userIdOrRequest
            : { userId: userIdOrRequest, query: queryText, limit, threshold };
        const userId = asUserId(request.userId ?? request.user_id);
        const queryValue = normalizeMemoryText(request.query, 2000);
        const selectedLimit = asPositiveInteger(request.limit, DEFAULT_SEARCH_LIMIT, 50);
        const candidateLimit = asPositiveInteger(
            request.candidateLimit,
            Math.max(DEFAULT_CANDIDATE_LIMIT, selectedLimit * 10),
            1000
        );
        const normalizedTypes = Array.isArray(request.types)
            ? request.types.map(normalizeMemoryType).filter(Boolean)
            : [];
        const includeInactive = Boolean(request.includeInactive);
        const result = await this.query(
            `SELECT *
             FROM memory_fact
             WHERE user_id = $1
               AND ($2::boolean OR (
                    is_active = TRUE
                    AND valid_from <= NOW()
                    AND (valid_until IS NULL OR valid_until > NOW())
               ))
               AND memory_type <> 'PROFILE'
               AND (
                    cardinality($3::text[]) = 0
                    OR memory_type = ANY($3::text[])
               )
             ORDER BY importance DESC, confidence DESC, observed_at DESC NULLS LAST, id DESC
             LIMIT $4`,
            [userId, includeInactive, normalizedTypes, candidateLimit]
        );
        const candidates = result.rows.map(row => {
            const fact = rowToFact(row);
            return {
                ...fact,
                relevanceScore: lexicalRelevance(fact.normalizedText, queryValue)
            };
        });
        const ranked = rerankMemoryFacts(candidates, {
            now: this.now(),
            limit: selectedLimit,
            policy: { minimumScore: clampScore(request.threshold ?? threshold, 0) }
        });
        return ranked.map(fact => ({
            ...fact,
            score: fact.retrievalScore
        }));
    }

    async searchArchiveMemory(userIdOrRequest, queryText = '', limit = 12, threshold = 0.2) {
        const request = typeof userIdOrRequest === 'object' && userIdOrRequest !== null
            ? userIdOrRequest
            : { userId: userIdOrRequest, query: queryText, limit, threshold };
        return this.search({
            ...request,
            includeInactive: true,
            limit: asPositiveInteger(request.limit, 12, 30),
            threshold: request.threshold ?? 0.2
        });
    }

    async getSimulationPrecedents(queryText, { userId = '0', limit = 5 } = {}) {
        const tenantId = asUserId(userId);
        const result = await this.query(
            `SELECT *
             FROM memory_fact
             WHERE user_id = $1
               AND memory_type = ANY($2::text[])
               AND is_active = TRUE
               AND valid_from <= NOW()
               AND (valid_until IS NULL OR valid_until > NOW())
             ORDER BY importance DESC, observed_at DESC NULLS LAST, id DESC
             LIMIT $3`,
            [tenantId, PRECEDENT_TYPES, DEFAULT_CANDIDATE_LIMIT]
        );
        const queryValue = normalizeMemoryText(queryText, 2000);
        const ranked = rerankMemoryFacts(
            result.rows.map(row => {
                const fact = rowToFact(row);
                return {
                    ...fact,
                    relevanceScore: lexicalRelevance(fact.normalizedText, queryValue)
                };
            }),
            { now: this.now(), limit: asPositiveInteger(limit, 5, 20) }
        );
        const lexical = ranked.map(fact => ({ ...fact, score: fact.retrievalScore }));
        if (this.semanticaClient?.mode !== 'active') return lexical;

        try {
            const semantic = await this.semanticaClient.search({
                userId: tenantId,
                query: queryValue,
                limit: asPositiveInteger(limit, 5, 20),
                threshold: 0.2
            });
            const semanticFacts = semantic.map(item => ({
                id: item.memory?.memory_id ?? item.id,
                memoryType: item.memory?.metadata?.memory_type ?? item.memory?.metadata?.type ?? MEMORY_TYPE.DECISION_TRACE,
                normalizedText: item.text,
                payload: item.memory?.metadata?.payload || {},
                provenance: item.memory?.provenance || {},
                confidence: Number(item.memory?.metadata?.confidence ?? 0.5),
                importance: Number(item.memory?.metadata?.importance ?? 50),
                isActive: item.memory?.status === 'active',
                score: Number(item.score ?? 0),
                retrievalScore: Number(item.score ?? 0),
                retrievalSignals: { relevance: Number(item.score ?? 0) },
                source: 'semantica'
            })).filter(item => item.id && item.normalizedText);
            const seen = new Set();
            return [...semanticFacts, ...lexical].filter(item => {
                const key = String(item.id);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).slice(0, asPositiveInteger(limit, 5, 20));
        } catch (error) {
            console.warn('[SIMULATION SEMANTICA FALLBACK]:', error.message);
            return lexical;
        }
    }

    async recordToolObservation({
        userId,
        toolName,
        queryText = '',
        resultText,
        callId = null,
        sourceEventId = null,
        metadata = {}
    }) {
        const text = normalizeMemoryText(resultText, 4000);
        if (!text) return null;
        return this.createFact({
            userId,
            type: MEMORY_TYPE.TOOL_OBSERVATION,
            payload: {
                text: `${normalizeMemoryText(toolName, 128)}: ${text}`,
                tool_name: normalizeMemoryText(toolName, 128),
                query: normalizeMemoryText(queryText, 1000),
                result: text,
                call_id: normalizeMemoryText(callId, 255),
                metadata: cleanMetadata(metadata)
            },
            confidence: 0.9,
            importance: 45,
            sourceEventId,
            provenance: {
                source: 'native_tool',
                tool_name: normalizeMemoryText(toolName, 128),
                call_id: normalizeMemoryText(callId, 255)
            },
            idempotencyKey: callId
                ? `tool:${normalizeMemoryText(toolName, 80)}:${normalizeMemoryText(callId, 150)}`
                : undefined
        });
    }

    async claimOutbox({ workerId, limit = 20, staleAfterMs = 60_000 } = {}) {
        const owner = normalizeMemoryText(workerId || `memory-worker:${process.pid}`, 128);
        const batchLimit = asPositiveInteger(limit, 20, 100);
        const staleSeconds = Math.max(1, Math.ceil(Number(staleAfterMs || 60_000) / 1000));
        return this.withTransaction(async client => {
            await client.query(
                `UPDATE memory_outbox
                 SET status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD' ELSE 'RETRY' END,
                     locked_at = NULL,
                     locked_by = NULL,
                     available_at = CASE
                         WHEN attempt_count >= max_attempts THEN available_at
                         ELSE NOW()
                     END,
                     completed_at = CASE
                         WHEN attempt_count >= max_attempts THEN NOW()
                         ELSE NULL
                     END,
                     last_error = COALESCE(last_error, 'stale processing lock'),
                     updated_at = NOW()
                 WHERE status = 'PROCESSING'
                   AND locked_at < NOW() - ($1 * INTERVAL '1 second')`,
                [staleSeconds]
            );
            await client.query(
                `UPDATE memory_outbox
                 SET status = 'DEAD', completed_at = NOW(), updated_at = NOW()
                 WHERE status IN ('PENDING', 'RETRY')
                   AND attempt_count >= max_attempts`
            );
            const result = await client.query(
                `WITH candidates AS (
                    SELECT id
                    FROM memory_outbox
                    WHERE status IN ('PENDING', 'RETRY')
                      AND available_at <= NOW()
                      AND attempt_count < max_attempts
                    ORDER BY available_at ASC, id ASC
                    LIMIT $1
                    FOR UPDATE SKIP LOCKED
                 )
                 UPDATE memory_outbox outbox
                 SET status = 'PROCESSING',
                     attempt_count = outbox.attempt_count + 1,
                     locked_at = NOW(),
                     locked_by = $2,
                     last_attempt_at = NOW(),
                     updated_at = NOW()
                 FROM candidates
                 WHERE outbox.id = candidates.id
                 RETURNING outbox.*`,
                [batchLimit, owner]
            );
            return result.rows;
        });
    }

    async completeOutbox(jobId, workerId = null) {
        const result = await this.query(
            `UPDATE memory_outbox
             SET status = 'COMPLETED',
                 completed_at = NOW(),
                 locked_at = NULL,
                 locked_by = NULL,
                 last_error = NULL,
                 updated_at = NOW()
             WHERE id = $1
               AND status = 'PROCESSING'
               AND ($2::text IS NULL OR locked_by = $2)
             RETURNING *`,
            [asFactId(jobId, 'jobId'), workerId ? normalizeMemoryText(workerId, 128) : null]
        );
        return result.rows[0] || null;
    }

    async failOutbox(jobId, error, {
        workerId = null,
        baseDelayMs = 1000,
        maxDelayMs = 300_000
    } = {}) {
        const result = await this.query(
            `UPDATE memory_outbox
             SET status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD' ELSE 'RETRY' END,
                 available_at = CASE
                     WHEN attempt_count >= max_attempts THEN available_at
                     ELSE NOW() + (
                         LEAST($4, $3 * POWER(2, GREATEST(0, attempt_count - 1)))
                         * INTERVAL '1 millisecond'
                     )
                 END,
                 completed_at = CASE WHEN attempt_count >= max_attempts THEN NOW() ELSE NULL END,
                 locked_at = NULL,
                 locked_by = NULL,
                 last_error = $5,
                 updated_at = NOW()
             WHERE id = $1
               AND status = 'PROCESSING'
               AND ($2::text IS NULL OR locked_by = $2)
             RETURNING *`,
            [
                asFactId(jobId, 'jobId'),
                workerId ? normalizeMemoryText(workerId, 128) : null,
                Math.max(100, Number(baseDelayMs) || 1000),
                Math.max(1000, Number(maxDelayMs) || 300_000),
                normalizeMemoryText(error?.message || error || 'projection failed', 4000)
            ]
        );
        return result.rows[0] || null;
    }

    async getOutboxHealth() {
        const result = await this.query(
            `SELECT
                COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRY'))::int AS queued,
                COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
                COUNT(*) FILTER (WHERE status = 'DEAD')::int AS dead,
                MIN(created_at) FILTER (WHERE status IN ('PENDING', 'RETRY')) AS oldest_queued_at,
                MAX(completed_at) FILTER (WHERE status = 'COMPLETED') AS last_completed_at
             FROM memory_outbox`
        );
        return result.rows[0] || {
            queued: 0,
            processing: 0,
            dead: 0,
            oldest_queued_at: null,
            last_completed_at: null
        };
    }

    async rebuildProjection({ userId = null } = {}) {
        const tenantId = userId == null ? null : asUserId(userId);
        return this.withTransaction(async client => {
            const facts = await client.query(
                `SELECT * FROM memory_fact
                 WHERE is_active = TRUE
                   AND valid_from <= NOW()
                   AND (valid_until IS NULL OR valid_until > NOW())
                   AND ($1::bigint IS NULL OR user_id = $1)
                 ORDER BY user_id, id`,
                [tenantId]
            );
            for (const row of facts.rows) {
                await this.enqueue(client, {
                    userId: row.user_id,
                    factId: row.id,
                    operation: 'REINDEX',
                    payload: projectionFactPayload(row)
                });
            }
            return { enqueued: facts.rowCount, userId: tenantId };
        });
    }

    async enqueueProjectionPurge(userId) {
        const tenantId = asUserId(userId);
        return this.withTransaction(client => this.enqueue(client, {
            userId: tenantId,
            operation: 'DELETE',
            payload: { purge_user: true, user_id: tenantId }
        }));
    }

    async recordRetrieval({
        requestId = this.uuid(),
        userId,
        queryText = '',
        strategy = 'hybrid_v1',
        status = 'COMPLETED',
        requestedLimit = 0,
        contextText = '',
        metadata = {},
        error = null,
        selectedFacts = [],
        candidates = null
    }) {
        const tenantId = asUserId(userId);
        const selected = Array.isArray(selectedFacts) ? selectedFacts : [];
        const traced = Array.isArray(candidates) ? candidates : selected;
        const effectiveLimit = Math.max(
            Number(requestedLimit) || 0,
            selected.length,
            traced.length
        );
        const selectedIds = new Map(
            selected.map((fact, index) => [String(fact.id ?? fact.fact_id ?? ''), index + 1])
        );

        return this.withTransaction(async client => {
            const logResult = await client.query(
                `INSERT INTO memory_retrieval_log (
                    request_id, user_id, query_text, query_hash, strategy, status,
                    requested_limit, returned_count, context_text, metadata, error,
                    completed_at
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10::jsonb, $11,
                    CASE WHEN $6 = 'PENDING' THEN NULL ELSE NOW() END
                 )
                 ON CONFLICT (user_id, request_id) DO UPDATE
                 SET status = EXCLUDED.status,
                     returned_count = EXCLUDED.returned_count,
                     context_text = EXCLUDED.context_text,
                     metadata = EXCLUDED.metadata,
                     error = EXCLUDED.error,
                     completed_at = EXCLUDED.completed_at
                 RETURNING *`,
                [
                    normalizeMemoryText(requestId, 255),
                    tenantId,
                    normalizeMemoryText(queryText, 4000),
                    hashText(queryText),
                    normalizeMemoryText(strategy, 64) || 'hybrid_v1',
                    ['PENDING', 'COMPLETED', 'FAILED'].includes(status) ? status : 'COMPLETED',
                    effectiveLimit,
                    selected.length,
                    normalizeMemoryText(contextText, 12000),
                    JSON.stringify(cleanMetadata(metadata)),
                    error ? normalizeMemoryText(error?.message || error, 4000) : null
                ]
            );
            const log = logResult.rows[0];
            await client.query(
                'DELETE FROM memory_retrieval_trace WHERE retrieval_log_id = $1',
                [log.id]
            );
            let candidateRank = 0;
            for (const fact of traced) {
                candidateRank += 1;
                const factIdRaw = fact?.id ?? fact?.fact_id ?? fact?.memory_fact_id;
                const factId = /^[1-9]\d*$/.test(String(factIdRaw ?? ''))
                    ? String(factIdRaw)
                    : null;
                const selectedRank = selectedIds.get(String(factIdRaw ?? '')) || null;
                const scores = scoreFields(fact, Boolean(selectedRank), selectedRank, candidateRank);
                await client.query(
                    `INSERT INTO memory_retrieval_trace (
                        retrieval_log_id, memory_fact_id, candidate_rank, selected,
                        selected_rank, relevance_score, recency_score, confidence_score,
                        importance_score, type_score, final_score, exclusion_reason, trace
                     ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
                     )`,
                    [
                        log.id,
                        factId,
                        scores.candidateRank,
                        scores.selected,
                        scores.selectedRank,
                        scores.relevance,
                        scores.recency,
                        scores.confidence,
                        scores.importance,
                        scores.type,
                        scores.final,
                        fact.exclusionReason ?? fact.exclusion_reason ?? null,
                        JSON.stringify(cleanMetadata({
                            source: fact.source,
                            memory_type: fact.memoryType ?? fact.memory_type,
                            text: fact.text ?? fact.fact ?? fact.normalized_text,
                            semantica_score: fact.score
                        }))
                    ]
                );
            }
            return { ...log, traces: candidateRank };
        });
    }

    async listRetrievals(userId, limit = 20) {
        const logsResult = await this.query(
            `SELECT *
             FROM memory_retrieval_log
             WHERE user_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT $2`,
            [asUserId(userId), asPositiveInteger(limit, 20, 100)]
        );
        const logs = logsResult.rows;
        if (logs.length === 0) return [];
        const traceResult = await this.query(
            `SELECT trace.*, fact.memory_type, fact.normalized_text, fact.is_active
             FROM memory_retrieval_trace trace
             LEFT JOIN memory_fact fact ON fact.id = trace.memory_fact_id
             WHERE trace.retrieval_log_id = ANY($1::bigint[])
             ORDER BY trace.retrieval_log_id DESC, trace.candidate_rank ASC`,
            [logs.map(row => row.id)]
        );
        const tracesByLog = new Map();
        for (const trace of traceResult.rows) {
            const key = String(trace.retrieval_log_id);
            if (!tracesByLog.has(key)) tracesByLog.set(key, []);
            tracesByLog.get(key).push({
                ...trace,
                memory_fact_id: trace.memory_fact_id == null ? null : String(trace.memory_fact_id)
            });
        }
        return logs.map(log => ({
            ...log,
            id: String(log.id),
            traces: tracesByLog.get(String(log.id)) || []
        }));
    }

    async getGraph(userId, { limit = DEFAULT_GRAPH_LIMIT } = {}) {
        const tenantId = asUserId(userId);
        const [facts, retrievals] = await Promise.all([
            this.listFacts(tenantId, {
                includeInactive: true,
                limit: asPositiveInteger(limit, DEFAULT_GRAPH_LIMIT, 1000)
            }),
            this.listRetrievals(tenantId, 12)
        ]);
        const nodes = [];
        const edges = [];
        const entityIds = new Map();
        const activeCount = facts.filter(fact => fact.isActive).length;

        for (const fact of facts) {
            nodes.push({
                id: `fact:${fact.id}`,
                kind: 'fact',
                factId: fact.id,
                type: fact.memoryType,
                label: fact.normalizedText,
                active: fact.isActive,
                confidence: Number(fact.confidence ?? 0.5),
                importance: Number(fact.importance ?? 50),
                provenance: fact.provenance || {},
                createdAt: fact.created_at,
                validFrom: fact.valid_from,
                validUntil: fact.valid_until
            });
            if (fact.supersedesId) {
                edges.push({
                    id: `supersedes:${fact.id}:${fact.supersedesId}`,
                    source: `fact:${fact.id}`,
                    target: `fact:${fact.supersedesId}`,
                    type: 'SUPERSEDES',
                    label: 'заменяет'
                });
            }

            const payload = fact.payload && typeof fact.payload === 'object' ? fact.payload : {};
            const rawEntities = [
                ...(Array.isArray(payload.entities) ? payload.entities : []),
                payload.entity,
                payload.subject,
                payload.person,
                payload.place
            ].filter(Boolean);
            for (const rawEntity of rawEntities.slice(0, 12)) {
                const entityLabel = normalizeMemoryText(
                    typeof rawEntity === 'object'
                        ? rawEntity.name ?? rawEntity.label ?? rawEntity.id
                        : rawEntity,
                    160
                );
                if (!entityLabel) continue;
                const entityKey = entityLabel.toLocaleLowerCase('ru-RU');
                let entityId = entityIds.get(entityKey);
                if (!entityId) {
                    entityId = `entity:${hashText(entityKey).slice(0, 16)}`;
                    entityIds.set(entityKey, entityId);
                    nodes.push({
                        id: entityId,
                        kind: 'entity',
                        label: entityLabel,
                        active: true
                    });
                }
                edges.push({
                    id: `mentions:${fact.id}:${entityId}`,
                    source: `fact:${fact.id}`,
                    target: entityId,
                    type: 'MENTIONS',
                    label: 'связано'
                });
            }
        }

        for (const retrieval of retrievals.slice(0, 6)) {
            const retrievalNodeId = `retrieval:${retrieval.id}`;
            nodes.push({
                id: retrievalNodeId,
                kind: 'retrieval',
                label: retrieval.query_text || 'контекст без запроса',
                source: retrieval.metadata?.source || retrieval.strategy,
                createdAt: retrieval.created_at,
                active: true
            });
            for (const trace of retrieval.traces.filter(item => item.selected)) {
                if (!trace.memory_fact_id) continue;
                edges.push({
                    id: `selected:${retrieval.id}:${trace.memory_fact_id}`,
                    source: retrievalNodeId,
                    target: `fact:${trace.memory_fact_id}`,
                    type: 'SELECTED',
                    label: Number(trace.final_score || 0).toFixed(2),
                    score: Number(trace.final_score || 0)
                });
            }
        }

        return {
            userId: tenantId,
            nodes,
            edges,
            stats: {
                facts: facts.length,
                active: activeCount,
                inactive: facts.length - activeCount,
                retrievals: retrievals.length,
                entities: entityIds.size
            }
        };
    }
}

export const memoryRepository = new MemoryRepository();

export {
    CORE_TYPES,
    PRECEDENT_TYPES,
    lexicalRelevance,
    projectionFactPayload,
    rowToFact
};
