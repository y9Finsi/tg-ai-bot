/**
 * RADIANT Action Registry
 * Хранит реестр доступных действий, валидирует контракт и предоставляет схемы для Router/Needle.
 */

class ActionRegistry {
    constructor() {
        this.actions = new Map();
        this.overrides = new Map();
    }

    /**
     * Валидация канонического контракта действия
     */
    validateContract(action) {
        if (!action || typeof action !== 'object') {
            throw new Error('[ACTION REGISTRY] Action должен быть объектом');
        }
        if (!action.name || typeof action.name !== 'string') {
            throw new Error('[ACTION REGISTRY] Отсутствует или невалиден action.name');
        }
        if (!action.description || typeof action.description !== 'string') {
            throw new Error(`[ACTION REGISTRY] Отсутствует description у action: ${action.name}`);
        }
        if (!action.inputSchema || typeof action.inputSchema !== 'object') {
            throw new Error(`[ACTION REGISTRY] Отсутствует inputSchema у action: ${action.name}`);
        }
        if (typeof action.execute !== 'function') {
            throw new Error(`[ACTION REGISTRY] Отсутствует функция execute у action: ${action.name}`);
        }
    }

    /**
     * Регистрация действия
     */
    register(action) {
        this.validateContract(action);
        this.actions.set(action.name, action);
        return this;
    }

    /**
     * Получить действие по имени
     */
    get(name) {
        return this.actions.get(name) || null;
    }

    /**
     * Получить все зарегистрированные действия
     */
    getAll() {
        return Array.from(this.actions.values());
    }

    /**
     * Применить переопределения (из БД / админки)
     */
    setOverride(name, { enabled, timeoutMs, config } = {}) {
        const current = this.overrides.get(name) || {};
        this.overrides.set(name, {
            ...current,
            ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
            ...(timeoutMs !== undefined ? { timeoutMs: Number(timeoutMs) } : {}),
            ...(config !== undefined ? { config } : {})
        });
    }

    /**
     * Получить действие с учетом переопределений
     */
    getActionRuntime(name) {
        const action = this.get(name);
        if (!action) return null;
        const override = this.overrides.get(name) || {};

        return {
            ...action,
            enabled: override.enabled !== undefined ? override.enabled : (action.enabled !== false),
            timeoutMs: override.timeoutMs || action.timeoutMs || 10000,
            config: {
                ...(action.config || {}),
                ...(override.config || {})
            }
        };
    }

    /**
     * Получить только включенные действия, прошедшие фильтрацию политики
     */
    getEnabled(context = {}) {
        const enabledActions = [];
        for (const [name] of this.actions) {
            const runtimeAction = this.getActionRuntime(name);
            if (!runtimeAction || !runtimeAction.enabled) continue;

            // Если у действия есть собственная функция доступности по контексту
            if (typeof runtimeAction.isAvailable === 'function') {
                try {
                    if (!runtimeAction.isAvailable(context)) continue;
                } catch {
                    continue;
                }
            }
            enabledActions.push(runtimeAction);
        }
        return enabledActions;
    }

    /**
     * Получить схемы активных действий для передачи в Router/Needle
     */
    getSchemas(context = {}) {
        return this.getEnabled(context).map(action => ({
            name: action.name,
            description: action.description,
            inputSchema: action.inputSchema
        }));
    }

    /**
     * Очистка реестра (для тестов)
     */
    clear() {
        this.actions.clear();
        this.overrides.clear();
    }
}

export const actionRegistry = new ActionRegistry();
