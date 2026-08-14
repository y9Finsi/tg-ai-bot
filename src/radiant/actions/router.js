/**
 * RADIANT Action Router
 * Координирует политику доступности действий, запрашивает маршрутизацию у Needle
 * и передает исполнение в безопасный Action Executor.
 */

import { actionRegistry } from './registry.js';
import { needleAdapter } from './adapters/needle.js';
import { executeAction } from './executor.js';

export class ActionRouter {
    constructor(options = {}) {
        this.minConfidence = Number(options.minConfidence || process.env.ACTION_ROUTER_MIN_CONFIDENCE || 0.80);
    }

    /**
     * Анализирует сообщение пользователя, определяет режим диалога (mode) и выполняет Action при необходимости
     * @param {Object} params
     * @param {string} params.userText Текст сообщения
     * @param {number} params.userId ID пользователя
     * @param {Array} params.history История диалога
     * @param {Object} params.context Дополнительный контекст
     */
    async routeAndExecute({ userText, userId, history = [], context = {} }) {
        const start = Date.now();
        const routingContext = { ...context, userId };

        // 1. Policy: отбор доступных схем ДО обращения к роутеру
        const enabledSchemas = actionRegistry.getSchemas(routingContext);

        // 2. Обращение к Needle Router (возвращает и mode, и action за ~10-30 мс)
        const needleResponse = await needleAdapter.route({
            message: userText,
            schemas: enabledSchemas,
            history,
            context: routingContext
        });

        const routerLatencyMs = Date.now() - start;

        // 3. Обработка оффлайн режима Needle (fallback на старый intent router)
        if (needleResponse.status === 'ROUTER_OFFLINE' || needleResponse.status === 'ROUTER_TIMEOUT' || needleResponse.status === 'ROUTER_ERROR') {
            return {
                decision: 'FALLBACK_TO_LLM',
                mode: null,
                reactionEmoji: null,
                actionResult: null,
                trace: {
                    status: needleResponse.status,
                    error: needleResponse.error,
                    latencyMs: routerLatencyMs,
                    routerLatencyMs: needleResponse.latencyMs,
                    confidence: 0
                }
            };
        }

        const mode = needleResponse.mode || 'CASUAL';
        const reactionEmoji = needleResponse.reactionEmoji || null;

        // 4. Штатный NO_ACTION (инструменты не требуются)
        if (needleResponse.decision === 'no_action' || !needleResponse.action) {
            return {
                decision: 'NO_ACTION',
                mode,
                reactionEmoji,
                actionResult: null,
                trace: {
                    status: 'NO_ACTION',
                    mode,
                    confidence: needleResponse.confidence,
                    latencyMs: routerLatencyMs,
                    routerLatencyMs: needleResponse.latencyMs
                }
            };
        }

        // 5. Проверка confidence
        if (needleResponse.confidence < this.minConfidence) {
            return {
                decision: 'LOW_CONFIDENCE_FALLBACK',
                mode,
                reactionEmoji,
                actionResult: null,
                trace: {
                    status: 'LOW_CONFIDENCE',
                    mode,
                    actionProposed: needleResponse.action,
                    confidence: needleResponse.confidence,
                    minConfidence: this.minConfidence,
                    latencyMs: routerLatencyMs,
                    routerLatencyMs: needleResponse.latencyMs
                }
            };
        }

        // 6. Исполнение через Executor (security boundary)
        const actionResult = await executeAction({
            name: needleResponse.action,
            args: needleResponse.arguments,
            context: routingContext
        });

        const totalLatencyMs = Date.now() - start;

        return {
            decision: 'ACTION_EXECUTED',
            mode,
            reactionEmoji,
            actionResult,
            trace: {
                status: actionResult.status === 'success' ? 'ACTION_SUCCESS' : 'ACTION_ERROR',
                mode,
                action: needleResponse.action,
                arguments: needleResponse.arguments,
                confidence: needleResponse.confidence,
                routerLatencyMs: needleResponse.latencyMs,
                executionLatencyMs: actionResult.meta?.durationMs || 0,
                totalLatencyMs,
                cached: Boolean(actionResult.meta?.cached),
                error: actionResult.error
            }
        };
    }
}

export const actionRouter = new ActionRouter();
