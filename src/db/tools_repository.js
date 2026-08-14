/**
 * Tools Repository
 * Управляет сохранением и загрузкой конфигураций RADIANT Actions из PostgreSQL таблицы radiant_tools.
 */

import { query } from './database.js';
import { actionRegistry } from '../radiant/actions/registry.js';

export class ToolsRepository {
    static async ensureTable() {
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS radiant_tools (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(64) UNIQUE NOT NULL,
                    type VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    timeout_ms INTEGER NOT NULL DEFAULT 10000,
                    config JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);
        } catch (err) {
            console.error('⚠️ [TOOLS REPOSITORY INIT ERROR]:', err.message);
        }
    }

    /**
     * Синхронизация реестра действий с БД при старте сервера
     */
    static async syncRegistryFromDb() {
        await this.ensureTable();
        try {
            const res = await query('SELECT name, enabled, timeout_ms, config FROM radiant_tools');
            for (const row of res.rows) {
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
     * Получить список всех действий (системные + кастомные) с их актуальным состоянием
     */
    static async getTools() {
        await this.ensureTable();
        let dbRows = [];
        try {
            const res = await query('SELECT * FROM radiant_tools');
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
                type: dbEntry?.type || 'SYSTEM',
                description: action.description,
                enabled: runtimeAction.enabled,
                timeoutMs: runtimeAction.timeoutMs,
                config: runtimeAction.config,
                inputSchema: action.inputSchema,
                createdAt: dbEntry?.created_at || null,
                updatedAt: dbEntry?.updated_at || null
            });
        }

        // Добавляем кастомные записи из БД, если они не были в системных
        for (const dbEntry of dbRows) {
            if (!seen.has(dbEntry.name)) {
                combined.push({
                    id: dbEntry.id,
                    name: dbEntry.name,
                    type: dbEntry.type || 'CUSTOM',
                    description: dbEntry.config?.description || 'Custom tool',
                    enabled: dbEntry.enabled,
                    timeoutMs: dbEntry.timeout_ms,
                    config: dbEntry.config,
                    inputSchema: dbEntry.config?.inputSchema || { type: 'object' },
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
     * Обновить параметры инструмента в БД и применить в registry
     */
    static async updateTool(name, { enabled, timeoutMs, config } = {}) {
        await this.ensureTable();

        const current = await this.getToolByName(name);
        if (!current) {
            throw new Error(`Инструмент '${name}' не найден`);
        }

        const newEnabled = enabled !== undefined ? Boolean(enabled) : current.enabled;
        const newTimeout = timeoutMs !== undefined ? Number(timeoutMs) : current.timeoutMs;
        const newConfig = config !== undefined ? (typeof config === 'object' ? config : {}) : current.config;

        await query(`
            INSERT INTO radiant_tools (name, type, enabled, timeout_ms, config, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
            ON CONFLICT (name) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                timeout_ms = EXCLUDED.timeout_ms,
                config = EXCLUDED.config,
                updated_at = NOW()
        `, [name, current.type || 'SYSTEM', newEnabled, newTimeout, JSON.stringify(newConfig)]);

        // Применяем оверрайд в registry на лету
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
}
