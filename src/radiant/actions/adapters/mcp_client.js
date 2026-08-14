/**
 * Model Context Protocol (MCP) HTTP Client
 * Поддерживает стандартные методы MCP: tools/list и tools/call через HTTP JSON-RPC 2.0.
 */

import { SsrfGuard } from '../security/ssrf_guard.js';

export class McpClient {
    /**
     * Получает список доступных инструментов с MCP сервера (tools/list)
     * @param {string} endpoint URL MCP-сервера
     * @param {Object} headers Дополнительные заголовки (например Authorization)
     */
    static async discoverTools(endpoint, headers = {}) {
        const payload = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        };

        const response = await SsrfGuard.safeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(payload)
        }, { timeoutMs: 8000, allowPrivate: true });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`MCP tools/list failed (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
        }

        const tools = data.result?.tools || [];
        return tools.map(tool => ({
            name: tool.name,
            description: tool.description || `Инструмент ${tool.name}`,
            inputSchema: tool.inputSchema || { type: 'object', properties: {} }
        }));
    }

    /**
     * Вызывает инструмент на MCP сервере (tools/call)
     * @param {string} endpoint URL MCP-сервера
     * @param {string} toolName Название инструмента
     * @param {Object} args Аргументы инструмента
     * @param {Object} headers Дополнительные заголовки
     */
    static async callTool(endpoint, toolName, args = {}, headers = {}, options = {}) {
        const payload = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        };

        const timeoutMs = options.timeoutMs || 15000;
        const response = await SsrfGuard.safeFetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(payload)
        }, { timeoutMs, allowPrivate: true });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`MCP tools/call failed (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
        }

        const content = data.result?.content || [];
        let textResult = '';
        if (Array.isArray(content)) {
            textResult = content.map(item => item.text || JSON.stringify(item)).join('\n');
        } else if (typeof data.result === 'object') {
            textResult = JSON.stringify(data.result);
        } else {
            textResult = String(data.result || '');
        }

        return {
            text: textResult,
            raw: data.result,
            isError: Boolean(data.result?.isError)
        };
    }
}
