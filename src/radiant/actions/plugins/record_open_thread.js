/**
 * RADIANT Plugin: record_open_thread
 * Фиксирует социальное обещание / открытый гештальт собеседника («скину трек потом», «покажу кота»).
 * Сохраняет в таблицу memory_fact как OPEN_THREAD со сроком жизни (TTL).
 * Применяет правило 1 слота: новое обещание вытесняет предыдущие активные.
 */

import { query } from '../../../db/database.js';

export const recordOpenThreadAction = {
    name: 'record_open_thread',
    title: 'Зафиксировать открытое обещание собеседника',
    description: 'Фиксирует открытое социальное обещание собеседника («скину трек потом», «покажу фотку кота», «расскажу как прошло собеседование»). Используй, когда собеседник обещает что-то сделать для тебя без точного таймера. В тексте ответа отвечай живо и естественно («вахвхав хорошо, ловлю на слове»). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО называть это вслух таймером, секундомером или говорить «я записала в память».',
    inputSchema: {
        type: 'object',
        properties: {
            topic: {
                type: 'string',
                description: 'О чём именно открытый тред или обещание собеседника (например: "скинуть крутой трек", "показать фотку кота", "рассказать про собеседование").'
            },
            ttl_hours: {
                type: 'integer',
                minimum: 1,
                maximum: 168,
                description: 'Сколько часов актуален этот открытый тред (по умолчанию 36 часов).'
            }
        },
        required: ['topic']
    },
    timeoutMs: 10000,
    config: { cacheTtlSeconds: 0 },

    async execute(args = {}, context = {}) {
        const userId = context.userId || context.currentContext?.userId;
        if (!userId) {
            return {
                status: 'error',
                error: { code: 'NO_USER', message: 'Не указан userId для фиксации открытого треда.' }
            };
        }

        const topic = String(args.topic || '').trim();
        if (!topic) {
            return {
                status: 'error',
                error: { code: 'EMPTY_TOPIC', message: 'Не указана тема открытого треда.' }
            };
        }

        const ttlHours = Math.min(Math.max(parseInt(args.ttl_hours, 10) || 36, 1), 168);
        const validUntil = new Date(Date.now() + ttlHours * 3600 * 1000);

        try {
            // 1. Правило 1 слота: деактивируем старые активные треды этого пользователя
            await query(
                `UPDATE memory_fact
                 SET is_active = FALSE, updated_at = NOW()
                 WHERE user_id = $1 AND memory_type = 'OPEN_THREAD' AND is_active = TRUE`,
                [Number(userId)]
            ).catch(() => null);

            // 2. Вставляем новый открытый тред
            const payload = {
                topic,
                target: 'user',
                asked: false,
                created_at: new Date().toISOString()
            };
            const normalizedText = `Собеседник обещал: ${topic}`;
            const contentHash = Buffer.from(topic).toString('hex').padEnd(32, '0').slice(0, 32);
            const idempotencyKey = `open_thread_${userId}_${Date.now()}`;

            await query(
                `INSERT INTO memory_fact (
                    user_id, memory_type, schema_version, payload, normalized_text,
                    valid_from, valid_until, confidence, importance, provenance,
                    content_hash, idempotency_key, is_active, created_at, updated_at
                ) VALUES (
                    $1, 'OPEN_THREAD', 1, $2, $3,
                    NOW(), $4, 0.900, 70, $5,
                    $6, $7, TRUE, NOW(), NOW()
                )`,
                [
                    Number(userId),
                    JSON.stringify(payload),
                    normalizedText,
                    validUntil,
                    JSON.stringify({ source: 'record_open_thread_action' }),
                    contentHash,
                    idempotencyKey
                ]
            );

            return {
                status: 'success',
                data: {
                    topic,
                    ttl_hours: ttlHours,
                    valid_until: validUntil.toISOString(),
                    recorded: true,
                    text: `Обещание собеседника принято. Ответь живо, тепло или с дружеским подколом («ловлю на слове», «только реально годный»), без душных фраз и без упоминания таймеров.`
                }
            };
        } catch (err) {
            console.error('[RECORD_OPEN_THREAD ERROR]:', err.message);
            return {
                status: 'error',
                error: { code: 'DB_ERROR', message: `Ошибка сохранения открытого треда: ${err.message}` }
            };
        }
    }
};
