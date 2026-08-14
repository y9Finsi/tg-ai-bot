/**
 * Needle Router Adapter
 * Клиент к легковесному локальному сервису маршрутизации Needle 2.
 * Передает схемы доступных инструментов и возвращает решение (mode, action, confidence).
 */

export class NeedleAdapter {
    constructor(options = {}) {
        this.endpoint = options.endpoint || process.env.NEEDLE_ENDPOINT || 'http://127.0.0.1:8000/v1/route';
        this.timeoutMs = Number(options.timeoutMs || process.env.NEEDLE_TIMEOUT_MS || 250);
    }

    /**
     * Запрос классификации / выбора инструмента у Needle
     * @param {Object} params
     * @param {string} params.message Сообщение пользователя
     * @param {Array} params.schemas Схемы разрешенных действий
     * @param {Array} params.history История диалога
     * @param {Object} params.context Контекст диалога
     */
    async route({ message, schemas = [], history = [], context = {} }) {
        const start = Date.now();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        if (timer.unref) timer.unref();

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    tools: schemas,
                    history,
                    context: {
                        userId: context.userId || null
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timer);

            if (!response.ok) {
                return {
                    status: 'ROUTER_ERROR',
                    decision: 'fallback',
                    mode: 'CASUAL',
                    action: null,
                    arguments: {},
                    confidence: 0,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    latencyMs: Date.now() - start
                };
            }

            const data = await response.json();
            const latencyMs = Date.now() - start;

            const mode = data.mode || 'CASUAL';
            const type = data.type || (data.action ? 'action' : 'no_action');
            const confidence = typeof data.confidence === 'number' ? data.confidence : 1.0;
            const reactionEmoji = data.reaction_emoji || null;

            if (type === 'action' && data.action) {
                return {
                    status: 'SUCCESS',
                    decision: 'action',
                    mode,
                    action: data.action,
                    arguments: data.arguments || data.args || {},
                    confidence,
                    reactionEmoji,
                    latencyMs
                };
            }

            return {
                status: 'NO_ACTION',
                decision: 'no_action',
                mode,
                action: null,
                arguments: {},
                confidence,
                reactionEmoji,
                latencyMs
            };
        } catch (err) {
            clearTimeout(timer);
            const latencyMs = Date.now() - start;

            if (err.name === 'AbortError') {
                return {
                    status: 'ROUTER_TIMEOUT',
                    decision: 'fallback',
                    mode: 'CASUAL',
                    action: null,
                    arguments: {},
                    confidence: 0,
                    error: `Needle timeout exceeded (${this.timeoutMs}ms)`,
                    latencyMs
                };
            }

            return {
                status: 'ROUTER_OFFLINE',
                decision: 'fallback',
                mode: 'CASUAL',
                action: null,
                arguments: {},
                confidence: 0,
                error: err.message || 'Needle service unreachable',
                latencyMs
            };
        }
    }
}

export const needleAdapter = new NeedleAdapter();
