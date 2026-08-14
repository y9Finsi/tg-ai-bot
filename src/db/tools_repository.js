/**
 * Tools Repository
 * Управляет сохранением и загрузкой конфигураций RADIANT Actions из PostgreSQL таблицы radiant_tools.
 * Поддерживает типы действий: SYSTEM, MCP, WEBHOOK.
 */

import { query } from './database.js';
import { actionRegistry } from '../radiant/actions/registry.js';
import { McpClient } from '../radiant/actions/adapters/mcp_client.js';
import { WebhookClient } from '../radiant/actions/adapters/webhook_client.js';
import { webSearchAction } from '../radiant/actions/plugins/web_search.js';
import { weatherAction } from '../radiant/actions/plugins/weather.js';
import { spbPlacesAction } from '../radiant/actions/plugins/spb_places.js';

export class ToolsRepository {
    static async ensureTable() {
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS radiant_tools (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(64) UNIQUE NOT NULL,
                    type VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
                    description TEXT,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    timeout_ms INTEGER NOT NULL DEFAULT 10000,
                    input_schema JSONB DEFAULT '{"type":"object"}'::jsonb,
                    config JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);
            // Добавляем колонки description и input_schema если таблица уже существовала
            await query(`
                ALTER TABLE radiant_tools ADD COLUMN IF NOT EXISTS description TEXT;
                ALTER TABLE radiant_tools ADD COLUMN IF NOT EXISTS input_schema JSONB DEFAULT '{"type":"object"}'::jsonb;
            `).catch(() => null);
        } catch (err) {
            console.error('⚠️ [TOOLS REPOSITORY INIT ERROR]:', err.message);
        }
    }

    /**
     * Создает исполняемый объект действия для реестра из записи БД
     */
    static buildExecutableAction(row) {
        const config = typeof row.config === 'object' && row.config ? row.config : {};
        const inputSchema = (typeof row.input_schema === 'object' && row.input_schema)
            || (typeof config.inputSchema === 'object' && config.inputSchema)
            || { type: 'object', properties: {} };
        const description = row.description || config.description || `Инструмент ${row.name}`;
        const timeoutMs = row.timeout_ms || 10000;

        let executeFn;

        if (row.type === 'MCP') {
            const mcpUrl = config.url;
            const originalToolName = config.originalToolName || row.name;
            const headers = config.headers || {};
            executeFn = async (args) => {
                const res = await McpClient.callTool(mcpUrl, originalToolName, args, headers, { timeoutMs });
                return {
                    text: res.text,
                    data: res.raw,
                    meta: { type: 'MCP', endpoint: mcpUrl }
                };
            };
        } else if (row.type === 'WEBHOOK') {
            const webhookUrl = config.url;
            const method = config.method || 'POST';
            const headers = config.headers || {};
            executeFn = async (args) => {
                const res = await WebhookClient.executeWebhook({
                    url: webhookUrl,
                    method,
                    headers,
                    args,
                    timeoutMs
                });
                return {
                    text: res.text,
                    data: res.data,
                    meta: { type: 'WEBHOOK', method, url: webhookUrl }
                };
            };
        } else {
            // Системные действия уже имеют локальный execute
            return null;
        }

        return {
            name: row.name,
            type: row.type,
            description,
            inputSchema,
            timeoutMs,
            enabled: row.enabled,
            config,
            execute: executeFn
        };
    }

    /**
     * Синхронизация реестра действий с БД при старте сервера
     */
    static async syncRegistryFromDb() {
        await this.ensureTable();
        try {
            const res = await query('SELECT * FROM radiant_tools');
            for (const row of res.rows) {
                // Если кастомный MCP или WEBHOOK — регистрируем исполняемый адаптер
                if (row.type === 'MCP' || row.type === 'WEBHOOK') {
                    const executable = this.buildExecutableAction(row);
                    if (executable) {
                        actionRegistry.register(executable);
                    }
                }

                // Устанавливаем оверрайды статуса и таймаута
                actionRegistry.setOverride(row.name, {
                    enabled: row.enabled,
                    timeoutMs: row.timeout_ms,
                    config: typeof row.config === 'object' ? row.config : {}
                });
            }
        } catch (err) {
            console.error('⚠️ [TOOLS REPOSITORY SYNC ERROR]:', err.message);
        }
    }

    /**
     * Получить список всех действий (системные + кастомные)
     */
    static async getTools() {
        await this.ensureTable();
        let dbRows = [];
        try {
            const res = await query('SELECT * FROM radiant_tools ORDER BY id ASC');
            dbRows = res.rows || [];
        } catch (err) {
            console.error('⚠️ [TOOLS REPOSITORY GET ERROR]:', err.message);
        }

        const dbMap = new Map(dbRows.map(r => [r.name, r]));
        const systemActions = actionRegistry.getAll();

        const combined = [];
        const seen = new Set();

        for (const action of systemActions) {
            seen.add(action.name);
            const dbEntry = dbMap.get(action.name);
            const runtimeAction = actionRegistry.getActionRuntime(action.name);

            combined.push({
                id: dbEntry?.id || null,
                name: action.name,
                title: action.title || dbEntry?.description?.split('—')?.[0]?.trim() || action.name,
                type: dbEntry?.type || action.type || 'SYSTEM',
                description: dbEntry?.description || action.description,
                enabled: runtimeAction.enabled,
                timeoutMs: runtimeAction.timeoutMs,
                config: runtimeAction.config,
                inputSchema: dbEntry?.input_schema || action.inputSchema,
                createdAt: dbEntry?.created_at || null,
                updatedAt: dbEntry?.updated_at || null
            });
        }

        for (const dbEntry of dbRows) {
            if (!seen.has(dbEntry.name)) {
                combined.push({
                    id: dbEntry.id,
                    name: dbEntry.name,
                    title: dbEntry.config?.title || dbEntry.name,
                    type: dbEntry.type || 'WEBHOOK',
                    description: dbEntry.description || dbEntry.config?.description || 'Custom tool',
                    enabled: dbEntry.enabled,
                    timeoutMs: dbEntry.timeout_ms,
                    config: dbEntry.config,
                    inputSchema: dbEntry.input_schema || dbEntry.config?.inputSchema || { type: 'object' },
                    createdAt: dbEntry.created_at,
                    updatedAt: dbEntry.updated_at
                });
            }
        }

        return combined;
    }

    /**
     * Получить инструмент по имени
     */
    static async getToolByName(name) {
        const tools = await this.getTools();
        return tools.find(t => t.name === name) || null;
    }

    /**
     * Создать новый пользовательский инструмент (MCP или WEBHOOK)
     */
    static async createCustomTool({ name, type = 'WEBHOOK', description = '', inputSchema = {}, config = {}, timeoutMs = 10000, enabled = true }) {
        await this.ensureTable();

        const cleanName = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!cleanName) {
            throw new Error('Имя действия не может быть пустым и должно содержать только латинские буквы, цифры и подчеркивание');
        }

        const validTypes = ['SYSTEM', 'MCP', 'WEBHOOK'];
        const toolType = validTypes.includes(type) ? type : 'WEBHOOK';

        const row = {
            name: cleanName,
            type: toolType,
            description: String(description || `Пользовательское действие ${cleanName}`).trim(),
            input_schema: typeof inputSchema === 'object' ? inputSchema : { type: 'object', properties: {} },
            config: typeof config === 'object' ? config : {},
            timeout_ms: Number(timeoutMs) || 10000,
            enabled: Boolean(enabled)
        };

        await query(`
            INSERT INTO radiant_tools (name, type, description, input_schema, config, timeout_ms, enabled, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, NOW())
            ON CONFLICT (name) DO UPDATE SET
                type = EXCLUDED.type,
                description = EXCLUDED.description,
                input_schema = EXCLUDED.input_schema,
                config = EXCLUDED.config,
                timeout_ms = EXCLUDED.timeout_ms,
                enabled = EXCLUDED.enabled,
                updated_at = NOW()
        `, [row.name, row.type, row.description, JSON.stringify(row.input_schema), JSON.stringify(row.config), row.timeout_ms, row.enabled]);

        // Регистрируем в рантайме
        const executable = this.buildExecutableAction(row);
        if (executable) {
            actionRegistry.register(executable);
        }
        actionRegistry.setOverride(row.name, {
            enabled: row.enabled,
            timeoutMs: row.timeout_ms,
            config: row.config
        });

        return await this.getToolByName(row.name);
    }

    /**
     * Обновить параметры инструмента в БД
     */
    static async updateTool(name, { enabled, timeoutMs, description, inputSchema, config } = {}) {
        await this.ensureTable();

        const current = await this.getToolByName(name);
        if (!current) {
            throw new Error(`Инструмент '${name}' не найден`);
        }

        const newEnabled = enabled !== undefined ? Boolean(enabled) : current.enabled;
        const newTimeout = timeoutMs !== undefined ? Number(timeoutMs) : current.timeoutMs;
        const newDesc = description !== undefined ? String(description) : current.description;
        const newSchema = inputSchema !== undefined ? inputSchema : current.inputSchema;
        const newConfig = config !== undefined ? (typeof config === 'object' ? config : {}) : current.config;

        await query(`
            INSERT INTO radiant_tools (name, type, description, input_schema, enabled, timeout_ms, config, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, NOW())
            ON CONFLICT (name) DO UPDATE SET
                description = EXCLUDED.description,
                input_schema = EXCLUDED.input_schema,
                enabled = EXCLUDED.enabled,
                timeout_ms = EXCLUDED.timeout_ms,
                config = EXCLUDED.config,
                updated_at = NOW()
        `, [name, current.type || 'SYSTEM', newDesc, JSON.stringify(newSchema), newEnabled, newTimeout, JSON.stringify(newConfig)]);

        // Обновляем в registry
        if (current.type === 'MCP' || current.type === 'WEBHOOK') {
            const executable = this.buildExecutableAction({
                name,
                type: current.type,
                description: newDesc,
                input_schema: newSchema,
                config: newConfig,
                timeout_ms: newTimeout,
                enabled: newEnabled
            });
            if (executable) {
                actionRegistry.register(executable);
            }
        }

        actionRegistry.setOverride(name, {
            enabled: newEnabled,
            timeoutMs: newTimeout,
            config: newConfig
        });

        return await this.getToolByName(name);
    }

    /**
     * Переключить статус включен/выключен
     */
    static async toggleTool(name) {
        const tool = await this.getToolByName(name);
        if (!tool) {
            throw new Error(`Инструмент '${name}' не найден`);
        }

        return await this.updateTool(name, { enabled: !tool.enabled });
    }

    /**
     * Удалить пользовательский инструмент
     */
    static async deleteCustomTool(name) {
        await this.ensureTable();
        const tool = await this.getToolByName(name);
        if (!tool) {
            throw new Error(`Инструмент '${name}' не найден`);
        }

        await query('DELETE FROM radiant_tools WHERE name = $1', [name]);
        actionRegistry.unregister(name);

        // Если это было имя системного действия — восстанавливаем встроенный плагин
        if (name === 'web_search') actionRegistry.register(webSearchAction);
        if (name === 'weather') actionRegistry.register(weatherAction);
        if (name === 'spb_places') actionRegistry.register(spbPlacesAction);

        return { success: true, name };
    }
}
