/**
 * RADIANT Action Router
 * Управляет реестром схем и безопасным исполнением действий.
 */

import { actionRegistry } from './registry.js';
import { executeAction } from './executor.js';

export class ActionRouter {
    constructor(options = {}) {
        this.minConfidence = Number(options.minConfidence || process.env.ACTION_ROUTER_MIN_CONFIDENCE || 0.80);
    }

    /**
     * Получает доступные схемы инструментов в формате OpenAI Function Calling
     * @param {Object} context
     * @returns {Array}
     */
    getToolsForLlm(context = {}) {
        const schemas = actionRegistry.getSchemas(context);
        return schemas.map(s => ({
            type: 'function',
            function: {
                name: s.name,
                description: `${s.title ? s.title + ': ' : ''}${s.description}`,
                parameters: s.inputSchema || { type: 'object', properties: {} }
            }
        }));
    }

    /**
     * Выполняет действие через безопасный Executor
     * @param {Object} params
     * @param {string} params.name Имя действия
     * @param {Object} params.args Аргументы действия
     * @param {Object} params.context Контекст выполнения
     * @returns {Promise<Object>}
     */
    async execute({ name, args, context = {} }) {
        return executeAction({ name, args, context });
    }
}

export const actionRouter = new ActionRouter();
