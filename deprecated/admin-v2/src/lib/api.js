/**
 * Centralized API client with session authentication header and JSON error handling.
 */
export async function api(path, options = {}) {
    const savedKey = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('admin_key') : null;
    const authHeaders = savedKey ? { 'x-admin-key': savedKey } : {};
    const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...authHeaders,
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('AUTH');
    if (!response.ok || data.success === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

export default api;
