import React, { useState, useRef, useEffect } from 'react';
import { Button } from './button.jsx';
import { api } from '@/lib/api.js';

export function Login({ onLogin }) {
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const keyRef = useRef(null);

    useEffect(() => {
        if (error) keyRef.current?.focus();
    }, [error]);

    async function submit(event) {
        event.preventDefault();
        setError('');
        setLoading(true);
        const trimmedKey = key.trim();
        try {
            await api('/api/admin/login', {
                method: 'POST',
                body: JSON.stringify({ key: trimmedKey })
            });
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('admin_key', trimmedKey);
            }
            onLogin();
        } catch {
            setError('Не удалось войти. Проверь ключ админки.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-screen">
            <form className="login-box" onSubmit={submit} noValidate>
                <div className="brand-mark">Л</div>
                <div className="eyebrow">RADIANT LERA</div>
                <h1>Дневник Леры</h1>
                <p>Панель наблюдения за жизнью, решениями и диалогами.</p>
                <label className="form-field" htmlFor="admin-key">
                    Ключ админки
                    <input
                        ref={keyRef}
                        id="admin-key"
                        name="admin-key"
                        autoFocus
                        autoComplete="current-password"
                        type="password"
                        value={key}
                        onChange={event => setKey(event.target.value)}
                        placeholder="Введите ключ"
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? 'admin-key-error' : undefined}
                    />
                </label>
                <Button type="submit" variant="primary" loading={loading}>
                    {loading ? 'Вхожу…' : 'Войти'}
                </Button>
                {error && (
                    <div id="admin-key-error" className="error-text" role="alert">
                        {error}
                    </div>
                )}
            </form>
        </div>
    );
}

export default Login;
