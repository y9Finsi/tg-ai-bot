import { randomUUID } from 'node:crypto';

const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_STALE_AFTER_MS = 60_000;

function text(value, fallback = '') {
    return value == null ? fallback : String(value);
}

function payloadOf(job) {
    return job?.payload && typeof job.payload === 'object' ? job.payload : {};
}

function userIdOf(job) {
    const payload = payloadOf(job);
    return text(job?.user_id ?? job?.userId ?? payload.user_id ?? payload.userId);
}

function factIdOf(job) {
    const payload = payloadOf(job);
    return text(job?.memory_fact_id ?? job?.memoryFactId ?? payload.id ?? payload.fact_id);
}

export function mapOutboxJob(job) {
    const operation = text(job?.operation).toUpperCase();
    const userId = userIdOf(job);
    const payload = payloadOf(job);
    const factId = factIdOf(job);
    const idempotencyKey = text(job?.idempotency_key ?? job?.idempotencyKey ?? `outbox:${job?.id ?? factId}`);

    if (operation === 'UPSERT' || operation === 'REINDEX') {
        return {
            operation: 'upsert',
            args: {
                userId,
                memoryId: factId,
                content: text(payload.normalized_text ?? payload.text ?? payload.fact),
                metadata: {
                    memory_type: payload.memory_type,
                    schema_version: payload.schema_version,
                    payload: payload.payload || {},
                    valid_from: payload.valid_from,
                    valid_until: payload.valid_until,
                    observed_at: payload.observed_at,
                    confidence: payload.confidence,
                    importance: payload.importance,
                    source_event_id: payload.source_event_id,
                    supersedes_id: payload.supersedes_id,
                    content_hash: payload.content_hash,
                    is_active: payload.is_active
                },
                provenance: payload.provenance || {},
                idempotencyKey
            }
        };
    }

    if (operation === 'SUPERSEDE' || operation === 'EXPIRE') {
        return {
            operation: 'retract',
            args: {
                userId,
                memoryId: factId,
                reason: text(payload.reason, operation.toLowerCase()),
                idempotencyKey
            }
        };
    }

    if (operation === 'DELETE' && payload.purge_user === true) {
        return {
            operation: 'purgeUser',
            args: { userId, idempotencyKey }
        };
    }

    throw new TypeError(`Unsupported memory outbox operation: ${operation || 'unknown'}`);
}

async function callMutation(client, operation, args) {
    const names = operation === 'upsert'
        ? ['upsertFact', 'upsert']
        : operation === 'retract'
            ? ['retractFact', 'retract']
            : ['purgeUser', 'purge'];
    const method = names.map(name => client?.[name]).find(candidate => typeof candidate === 'function');
    if (!method) throw new Error(`SemanticaClient does not support ${operation}`);
    return method.call(client, args);
}

export class MemoryOutboxWorker {
    constructor({
        memoryRepository,
        semanticaClient,
        enabled = semanticaClient?.mode !== 'disabled',
        workerId = `memory-outbox:${process.pid}:${randomUUID()}`,
        intervalMs = DEFAULT_INTERVAL_MS,
        batchSize = DEFAULT_BATCH_SIZE,
        staleAfterMs = DEFAULT_STALE_AFTER_MS,
        failOptions = {}
    } = {}) {
        if (!memoryRepository) throw new TypeError('memoryRepository is required');
        if (!semanticaClient) throw new TypeError('semanticaClient is required');
        this.repository = memoryRepository;
        this.client = semanticaClient;
        this.enabled = enabled !== false && semanticaClient.mode !== 'disabled';
        this.workerId = workerId;
        this.intervalMs = Math.max(1, Number(intervalMs) || DEFAULT_INTERVAL_MS);
        this.batchSize = Math.max(1, Math.floor(Number(batchSize) || DEFAULT_BATCH_SIZE));
        this.staleAfterMs = Math.max(1, Number(staleAfterMs) || DEFAULT_STALE_AFTER_MS);
        this.failOptions = failOptions;
        this.timer = null;
        this.inFlight = null;
        this.stopping = false;
    }

    async processBatch() {
        if (!this.enabled || this.stopping) return { claimed: 0, completed: 0, failed: 0, disabled: !this.enabled };
        const jobs = await this.repository.claimOutbox({
            workerId: this.workerId,
            limit: this.batchSize,
            staleAfterMs: this.staleAfterMs
        });
        const result = { claimed: jobs.length, completed: 0, failed: 0, disabled: false };
        for (const job of jobs) {
            try {
                const mapped = mapOutboxJob(job);
                await callMutation(this.client, mapped.operation, mapped.args);
                await this.repository.completeOutbox(job.id, this.workerId);
                result.completed++;
            } catch (error) {
                result.failed++;
                try {
                    await this.repository.failOutbox(job.id, error, { workerId: this.workerId, ...this.failOptions });
                } catch {
                    // A database failure here must not create an unhandled rejection in the poller.
                }
            }
        }
        return result;
    }

    start() {
        if (!this.enabled || this.timer || this.stopping) return this;
        const poll = () => {
            if (this.inFlight) return;
            this.inFlight = this.processBatch().catch(() => null).finally(() => { this.inFlight = null; });
        };
        poll();
        this.timer = setInterval(poll, this.intervalMs);
        this.timer.unref?.();
        return this;
    }

    async stop() {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.inFlight;
        return this;
    }
}

export function createMemoryOutboxWorker(options) {
    return new MemoryOutboxWorker(options);
}

