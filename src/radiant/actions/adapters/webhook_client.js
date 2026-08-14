/**
 * Custom Webhook Action Runner
 * Выполняет HTTP запросы к пользовательским вебхукам (n8n, Make, сторонние API)
 * с поддержкой подстановки аргументов, параметров авторизации и SSRF защиты.
 */

import { SsrfGuard } from '../security/ssrf_guard.js';

export class WebhookClient {
    /**
     * Вызывает произвольный вебхук
     * @param {Object} params
     * @param {string} params.url Целевой URL вебхука
     * @param {string} params.method Метод (POST, GET, PUT, etc.)
     * @param {Object} params.headers Пользовательские заголовки
     * @param {Object} params.args Аргументы от Needle
     * @param {number} params.timeoutMs Таймаут в миллисекундах
     */
    static async executeWebhook({ url, method = 'POST', headers = {}, args = {}, timeoutMs = 10000 }) {
        const httpMethod = (method || 'POST').toUpperCase();
        let targetUrl = url;
        let requestBody = null;

        const requestHeaders = {
            'User-Agent': 'RadiantLeraBot/2.0',
            ...headers
        };

        if (httpMethod === 'GET') {
            const parsed = new URL(url);
            for (const [key, val] of Object.entries(args)) {
                if (val !== undefined && val !== null) {
                    parsed.searchParams.set(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
                }
            }
            targetUrl = parsed.toString();
        } else {
            if (!requestHeaders['Content-Type']) {
                requestHeaders['Content-Type'] = 'application/json';
            }
            requestBody = JSON.stringify(args);
        }

        const response = await SsrfGuard.safeFetch(targetUrl, {
            method: httpMethod,
            headers: requestHeaders,
            body: requestBody
        }, { timeoutMs, allowPrivate: true });

        const contentType = response.headers?.get ? response.headers.get('content-type') || '' : '';
        let resultData = null;
        let resultText = '';

        if (contentType.includes('application/json')) {
            resultData = await response.json().catch(() => ({}));
            resultText = typeof resultData === 'object' ? JSON.stringify(resultData, null, 2) : String(resultData);
        } else {
            resultText = await response.text().catch(() => '');
            resultData = { text: resultText };
        }

        if (response.ok === false) {
            throw new Error(`Webhook Error HTTP ${response.status}: ${resultText.slice(0, 300)}`);
        }

        return {
            text: resultText,
            data: resultData,
            status: response.status || 200
        };
    }
}
