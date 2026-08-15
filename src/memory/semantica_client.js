const DEFAULT_TIMEOUT_MS = 180;
const DEFAULT_MUTATION_TIMEOUT_MS = 2_000;
const DEFAULT_LIMIT = 8;
const DEFAULT_THRESHOLD = 0.65;

function requiredUserId(userId) {
    if (userId === undefined || userId === null || String(userId).trim() === '') {
        throw new TypeError('Semantica search requires userId');
    }
    return String(userId);
}

function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function abortError() {
    const error = new Error('Semantica request timed out');
    error.name = 'AbortError';
    return error;
}

function requestError(operation, response) {
    return new Error(`Semantica ${operation} failed (${response?.status ?? 'unknown'})`);
}

function resultText(result) {
    return result?.text ?? result?.fact ?? result?.normalized_text ?? result?.content ?? '';
}

export function normalizeSemanticaResults(payload, { threshold = DEFAULT_THRESHOLD, limit = DEFAULT_LIMIT } = {}) {
    const raw = Array.isArray(payload) ? payload : payload?.results ?? payload?.items ?? payload?.data ?? [];
    if (!Array.isArray(raw)) return [];

    const seen = new Set();
    return raw.map((item, index) => {
        if (typeof item === 'string') return { id: `result-${index}`, text: item, score: 1 };
        const score = numberOr(item?.score ?? item?.similarity ?? item?.relevance, 0);
        const text = String(resultText(item) || '').trim();
        const id = item?.id ?? item?.fact_id ?? item?.memory_fact_id ?? null;
        return { ...item, id: id == null ? `result-${index}` : String(id), text, score };
    }).filter((item) => {
        const key = item.id || item.text.toLocaleLowerCase();
        if (!item.text || item.score < threshold || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, Math.max(1, Math.floor(numberOr(limit, DEFAULT_LIMIT))));
}

export class SemanticaClient {
    constructor({
        baseUrl = process.env.SEMANTICA_URL || process.env.SEMANTICA_BASE_URL,
        fetchImpl = globalThis.fetch,
        timeoutMs = process.env.SEMANTICA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
        mutationTimeoutMs = process.env.SEMANTICA_MUTATION_TIMEOUT_MS || DEFAULT_MUTATION_TIMEOUT_MS,
        mode = process.env.SEMANTICA_MODE || 'disabled',
        threshold = process.env.SEMANTICA_THRESHOLD || DEFAULT_THRESHOLD,
        limit = process.env.SEMANTICA_LIMIT || DEFAULT_LIMIT
    } = {}) {
        this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
        this.fetchImpl = fetchImpl;
        this.timeoutMs = Math.min(200, Math.max(150, numberOr(timeoutMs, DEFAULT_TIMEOUT_MS)));
        this.mutationTimeoutMs = Math.max(250, numberOr(mutationTimeoutMs, DEFAULT_MUTATION_TIMEOUT_MS));
        this.mode = ['disabled', 'shadow', 'active'].includes(String(mode)) ? String(mode) : 'disabled';
        this.threshold = numberOr(threshold, DEFAULT_THRESHOLD);
        this.limit = Math.max(1, Math.floor(numberOr(limit, DEFAULT_LIMIT)));
    }

    async request(path, {
        operation,
        body,
        idempotencyKey = null,
        timeoutMs = this.mutationTimeoutMs,
        signal
    } = {}) {
        if (this.mode === 'disabled') return null;
        if (!this.baseUrl) throw new Error('Semantica URL is not configured');
        if (typeof this.fetchImpl !== 'function') throw new Error('fetch implementation is not configured');

        const controller = new AbortController();
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener?.('abort', onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(abortError()), timeoutMs);
        const headers = { 'content-type': 'application/json' };
        if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey);

        try {
            const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body || {}),
                signal: controller.signal
            });
            if (!response?.ok) throw requestError(operation, response);
            try {
                return await response.json();
            } catch {
                return {};
            }
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
        }
    }

    async search({ userId, query = '', limit = this.limit, threshold = this.threshold, signal } = {}) {
        const tenantId = requiredUserId(userId);
        if (this.mode === 'disabled') return [];
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) return [];
        if (!this.baseUrl) throw new Error('Semantica URL is not configured');
        if (typeof this.fetchImpl !== 'function') throw new Error('fetch implementation is not configured');

        const controller = new AbortController();
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener?.('abort', onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(abortError()), this.timeoutMs);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}/context/search`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ user_id: tenantId, query: normalizedQuery, limit, threshold }),
                signal: controller.signal
            });
            if (!response?.ok) throw new Error(`Semantica search failed (${response?.status ?? 'unknown'})`);
            let payload;
            try { payload = await response.json(); } catch { payload = {}; }
            return normalizeSemanticaResults(payload, { threshold, limit });
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
        }
    }

    async upsertFact({
        userId,
        memoryId,
        content,
        metadata = {},
        provenance = {},
        idempotencyKey,
        signal
    } = {}) {
        const tenantId = requiredUserId(userId);
        const normalizedMemoryId = requiredUserId(memoryId);
        if (this.mode === 'disabled') return null;
        return this.request('/context/upsert', {
            operation: 'upsert',
            body: {
                user_id: tenantId,
                memory_id: normalizedMemoryId,
                content: String(content || '').trim(),
                metadata,
                provenance
            },
            idempotencyKey,
            signal
        });
    }

    async retractFact({ userId, memoryId, reason = null, idempotencyKey, signal } = {}) {
        const tenantId = requiredUserId(userId);
        const normalizedMemoryId = requiredUserId(memoryId);
        if (this.mode === 'disabled') return null;
        return this.request('/context/retract', {
            operation: 'retract',
            body: {
                user_id: tenantId,
                memory_id: normalizedMemoryId,
                reason: reason == null ? null : String(reason)
            },
            idempotencyKey,
            signal
        });
    }

    async purge({ userId, memoryId, reason = null, idempotencyKey, signal } = {}) {
        const tenantId = requiredUserId(userId);
        const normalizedMemoryId = requiredUserId(memoryId);
        if (this.mode === 'disabled') return null;
        return this.request('/context/purge', {
            operation: 'purge',
            body: {
                user_id: tenantId,
                memory_id: normalizedMemoryId,
                reason: reason == null ? null : String(reason)
            },
            idempotencyKey,
            signal
        });
    }

    async purgeUser({ userId, reason = null, idempotencyKey, signal } = {}) {
        const tenantId = requiredUserId(userId);
        if (this.mode === 'disabled') return null;
        return this.request('/context/purge-user', {
            operation: 'purge-user',
            body: {
                user_id: tenantId,
                reason: reason == null ? null : String(reason)
            },
            idempotencyKey,
            signal
        });
    }

    async health({ signal } = {}) {
        if (!this.baseUrl) throw new Error('Semantica URL is not configured');
        if (typeof this.fetchImpl !== 'function') throw new Error('fetch implementation is not configured');
        const controller = new AbortController();
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener?.('abort', onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(abortError()), this.mutationTimeoutMs);
        try {
            const response = await this.fetchImpl(`${this.baseUrl}/health`, {
                method: 'GET',
                headers: { accept: 'application/json' },
                signal: controller.signal
            });
            if (!response?.ok) throw requestError('health', response);
            return await response.json();
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
        }
    }
}

export function createSemanticaClient(options) {
    return new SemanticaClient(options);
}

export {
    DEFAULT_LIMIT,
    DEFAULT_THRESHOLD,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MUTATION_TIMEOUT_MS
};
