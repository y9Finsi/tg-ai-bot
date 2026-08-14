/**
 * SSRF Guard
 * Защита от Server-Side Request Forgery при вызове внешних вебхуков и MCP-серверов.
 */

import { isIP } from 'net';

// Запрещенные хосты и IP (Cloud Metadata, loopback, broadcast)
const BLOCKED_HOSTNAMES = new Set([
    '169.254.169.254',
    'metadata.google.internal',
    'metadata',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1'
]);

/**
 * Проверяет IP-адрес на принадлежность к приватным/зарезервированным сетям
 */
function isPrivateIp(ip) {
    if (!ip) return false;
    
    // IPv4 проверки
    if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('0.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('169.254.')) return true; // Link-local / Cloud metadata
    
    // 172.16.0.0 – 172.31.255.255
    if (ip.startsWith('172.')) {
        const parts = ip.split('.').map(Number);
        if (parts[1] >= 16 && parts[1] <= 31) return true;
    }
    
    // IPv6 loopback / link-local
    if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true;

    return false;
}

export class SsrfGuard {
    /**
     * Валидирует URL перед сетевым запросом
     * @param {string} urlStr Целевой URL
     * @param {Object} options
     * @param {boolean} options.allowPrivate Разрешить приватные сети (для локальной разработки или доверенных docker-контейнеров)
     */
    static validateUrl(urlStr, options = {}) {
        if (!urlStr || typeof urlStr !== 'string') {
            throw new Error('SSRF_GUARD: Некорректный или пустой URL');
        }

        let parsed;
        try {
            parsed = new URL(urlStr);
        } catch {
            throw new Error(`SSRF_GUARD: Невалидный формат URL: "${urlStr}"`);
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`SSRF_GUARD: Запрещенный протокол "${parsed.protocol}". Разрешены только http: и https:`);
        }

        const hostname = parsed.hostname.toLowerCase();

        // Проверка по списку запрещенных хостов
        if (BLOCKED_HOSTNAMES.has(hostname) && !options.allowPrivate && process.env.NODE_ENV === 'production') {
            throw new Error(`SSRF_GUARD: Обращение к хосту "${hostname}" заблокировано политикой безопасности`);
        }

        // Если хост является прямым IP-адресом
        if (isIP(hostname) && isPrivateIp(hostname) && !options.allowPrivate && process.env.NODE_ENV === 'production') {
            throw new Error(`SSRF_GUARD: Обращение к приватному IP-адресу "${hostname}" заблокировано`);
        }

        return parsed;
    }

    /**
     * Безопасный fetch с ограничением времени и размера ответа
     */
    static async safeFetch(urlStr, fetchOptions = {}, guardOptions = {}) {
        const validatedUrl = this.validateUrl(urlStr, guardOptions);
        const maxResponseBytes = guardOptions.maxResponseBytes || 1024 * 1024; // 1 MB limit
        const timeoutMs = Number(guardOptions.timeoutMs || 10000);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (timer.unref) timer.unref();

        try {
            const res = await fetch(validatedUrl.toString(), {
                ...fetchOptions,
                signal: controller.signal
            });
            clearTimeout(timer);

            // Проверка Content-Length если есть
            const contentLength = Number(res.headers?.get ? res.headers.get('content-length') || 0 : 0);
            if (contentLength > maxResponseBytes) {
                throw new Error(`SSRF_GUARD: Размер ответа (${contentLength} байт) превышает лимит ${maxResponseBytes} байт`);
            }

            return res;
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                throw new Error(`SSRF_GUARD: Превышен таймаут запроса (${timeoutMs}мс)`);
            }
            throw err;
        }
    }
}
