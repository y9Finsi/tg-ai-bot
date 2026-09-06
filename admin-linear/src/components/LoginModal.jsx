import React, { useState } from 'react';
import { KeyRound, ArrowRight, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api.js';

export function LoginModal({ onLogin, onOpenMap }) {
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!key.trim()) return;
        setLoading(true);
        setError(null);

        try {
            await api('/api/admin/login', {
                method: 'POST',
                body: JSON.stringify({ key: key.trim() })
            });
            sessionStorage.setItem('admin_key', key.trim());
            onLogin();
        } catch (err) {
            sessionStorage.removeItem('admin_key');
            setError('Неверный ключ доступа (ADMIN_WEB_KEY)');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08090a]/85 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#0e1013] border border-white/10 p-6 shadow-2xl shadow-black/80">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-[#5e6ad2]/15 border border-[#5e6ad2]/30 flex items-center justify-center text-[#5e6ad2]">
                        <KeyRound className="w-4 h-4 stroke-[1.5]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-white tracking-tight">Lera Life Engine</h2>
                        <p className="text-xs text-white/50">Авторизация по мастер-ключу</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="password"
                            placeholder="ADMIN_WEB_KEY"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            autoFocus
                            className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#5e6ad2] focus:ring-1 focus:ring-[#5e6ad2] transition-[border-color,box-shadow] font-mono"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0 stroke-[1.5]" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !key.trim()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#5e6ad2] hover:bg-[#6d78e3] text-white text-xs font-semibold tracking-wide disabled:opacity-50 transition-[background-color,transform] active:scale-[0.96]"
                    >
                        <span>{loading ? 'Проверка...' : 'Войти в систему'}</span>
                        <ArrowRight className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>

                    {onOpenMap && (
                        <div className="pt-2 border-t border-white/[0.08] flex justify-center">
                            <button
                                type="button"
                                onClick={onOpenMap}
                                className="text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1.5 py-1"
                            >
                                <span>Открыть 3D-карту Петроградки</span>
                                <span>→</span>
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
