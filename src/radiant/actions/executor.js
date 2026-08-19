/**
 * RADIANT Action Executor
 * Единственная точка исполнения действий. Обеспечивает валидацию входных параметров,
 * контроль таймаутов, изоляцию ошибок и стандартизацию канонического ActionResult.
 */

import { actionRegistry } from './registry.js';
import crypto from 'crypto';

/**
 * Легковесная валидация JSON Schema для параметров действия
 */
function validateSchema(schema, data) {
    if (!schema || typeof schema !== 'object') return { valid: true };

    if (schema.type === 'object') {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { valid: false, error: 'Аргументы должны быть объектом' };
        }

        // Проверка обязательных полей
        if (Array.isArray(schema.required)) {
            for (const field of schema.required) {
                if (data[field] === undefined || data[field] === null || data[field] === '') {
                    return { valid: false, error: `Обязательное поле '${field}' не заполнено` };
                }
            }
        }

        // Проверка типов свойств
        if (schema.properties && typeof schema.properties === 'object') {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (data[key] === undefined) continue;
                const val = data[key];

                if (propSchema.type === 'string' && typeof val !== 'string') {
                    return { valid: false, error: `Поле '${key}' должно быть строкой` };
                }
                if (propSchema.type === 'number' && typeof val !== 'number') {
                    return { valid: false, error: `Поле '${key}' должно быть числом` };
                }
                if (propSchema.type === 'boolean' && typeof val !== 'boolean') {
                    return { valid: false, error: `Поле '${key}' должно быть boolean` };
                }
                if (propSchema.type === 'array' && !Array.isArray(val)) {
                    return { valid: false, error: `Поле '${key}' должно быть массивом` };
                }
            }
        }
    }

    return { valid: true };
}

const ACTION_CACHE = new Map();
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут

function getCacheKey(name, args) {
    return `${name}:${JSON.stringify(args || {})}`;
}

export function getFromActionCache(name, args) {
    const key = getCacheKey(name, args);
    const item = ACTION_CACHE.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
        ACTION_CACHE.delete(key);
        return null;
    }
    return item.data;
}

export function setInActionCache(name, args, data, ttlMs = DEFAULT_CACHE_TTL_MS) {
    if (!ttlMs || ttlMs <= 0) return;
    const key = getCacheKey(name, args);
    if (ACTION_CACHE.size > 500) {
        const oldestKey = ACTION_CACHE.keys().next().value;
        ACTION_CACHE.delete(oldestKey);
    }
    ACTION_CACHE.set(key, {
        data,
        expiresAt: Date.now() + ttlMs
    });
}

/**
 * Исполнение действия с контролем таймаута и кэшированием
 */
export async function executeAction({ name, args = {}, context = {}, callId = null }) {
    const start = Date.now();
    const actionCallId = callId || `act_${crypto.randomBytes(4).toString('hex')}_${Date.now()}`;

    // 1. Поиск действия в реестре
    const action = actionRegistry.getActionRuntime(name);
    if (!action) {
        return {
            action: name,
            callId: actionCallId,
            status: 'error',
            data: null,
            meta: {
                durationMs: Date.now() - start,
                cached: false,
                provider: 'unknown'
            },
            error: {
                code: 'UNKNOWN_ACTION',
                message: `Действие '${name}' не зарегистрировано в RADIANT`
            }
        };
    }

    // 2. Проверка доступности (enabled)
    if (!action.enabled) {
        return {
            action: name,
            callId: actionCallId,
            status: 'error',
            data: null,
            meta: {
                durationMs: Date.now() - start,
                cached: false,
                provider: action.config?.provider || 'system'
            },
            error: {
                code: 'ACTION_DISABLED',
                message: `Действие '${name}' отключено в конфигурации`
            }
        };
    }

    // 3. Проверка кэша для идемпотентных запросов (поиск, погода, локации, GET вебхуки)
    const cacheTtlSeconds = action.config?.cacheTtlSeconds !== undefined
        ? Number(action.config.cacheTtlSeconds)
        : 900; // 15 минут по умолчанию
    const isCacheable = cacheTtlSeconds > 0 && action.config?.method !== 'POST';
    if (isCacheable) {
        const cachedData = getFromActionCache(name, args);
        if (cachedData !== null) {
            return {
                action: name,
                callId: actionCallId,
                status: 'success',
                data: cachedData,
                meta: {
                    durationMs: 1,
                    cached: true,
                    provider: 'cache'
                },
                error: null
            };
        }
    }

    // 4. Валидация входных аргументов по inputSchema
    const validation = validateSchema(action.inputSchema, args);
    if (!validation.valid) {
        return {
            action: name,
            callId: actionCallId,
            status: 'error',
            data: null,
            meta: {
                durationMs: Date.now() - start,
                cached: false,
                provider: action.config?.provider || 'system'
            },
            error: {
                code: 'INVALID_ARGUMENTS',
                message: validation.error
            }
        };
    }

    // 5. Выполнение с контролем таймаута
    const timeoutMs = action.timeoutMs || 10000;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`ACTION_TIMEOUT: превышен лимит времени (${timeoutMs}мс)`));
            }, timeoutMs);
            if (timer.unref) timer.unref();
        });

        const executionContext = {
            ...context,
            callId: actionCallId,
            config: action.config || {}
        };

        const rawResult = await Promise.race([
            action.execute(args, executionContext),
            timeoutPromise
        ]);

        const durationMs = Date.now() - start;

        // Извлечение данных и сохранение в кэш
        let finalData = rawResult;
        let finalMeta = {
            durationMs,
            cached: false,
            provider: action.config?.provider || 'system'
        };
        let finalStatus = 'success';
        let finalError = null;

        if (rawResult && typeof rawResult === 'object' && rawResult.status) {
            finalStatus = rawResult.status;
            finalData = rawResult.data !== undefined ? rawResult.data : null;
            finalMeta = {
                durationMs,
                cached: Boolean(rawResult.meta?.cached),
                provider: rawResult.meta?.provider || action.config?.provider || 'system',
                ...(rawResult.meta || {})
            };
            finalError = rawResult.error || null;
        }

        if (finalStatus === 'success' && isCacheable) {
            setInActionCache(name, args, finalData, cacheTtlSeconds * 1000);
        }

        return {
            action: name,
            callId: actionCallId,
            status: finalStatus,
            data: finalData,
            meta: finalMeta,
            error: finalError
        };
    } catch (err) {
        const durationMs = Date.now() - start;
        const isTimeout = err.message && err.message.includes('ACTION_TIMEOUT');

        return {
            action: name,
            callId: actionCallId,
            status: 'error',
            data: null,
            meta: {
                durationMs,
                cached: false,
                provider: action.config?.provider || 'system'
            },
            error: {
                code: isTimeout ? 'ACTION_TIMEOUT' : 'ACTION_EXECUTION_ERROR',
                message: err.message || 'Внутренняя ошибка выполнения действия'
            }
        };
    }
}
