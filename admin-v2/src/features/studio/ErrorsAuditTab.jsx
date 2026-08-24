import React, { useState, useEffect } from 'react';
import { CircleAlert, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { api } from '@/lib/api.js';
import { formatTime } from '@/lib/dateUtils.js';

export function ErrorsAuditTab({ toast }) {
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(false);

    async function loadErrors() {
        setLoading(true);
        try {
            const res = await api('/api/admin/errors?limit=50');
            setErrors(res.errors || res.items || []);
        } catch (err) {
            setErrors([]);
            if (toast) toast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    async function clearAllErrors() {
        try {
            await api('/api/admin/errors/clear', { method: 'POST' });
            setErrors([]);
            toast?.('Журнал ошибок очищен');
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    useEffect(() => {
        loadErrors();
    }, []);

    return (
        <Card>
            <CardHeader
                eyebrow="Аудит сбоев"
                title="Журнал ошибок и исключений"
                description="Сбои сетевых запросов, таймауты LLM, ошибки парсинга и отклонения Judge."
                action={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button size="sm" variant="outline" onClick={loadErrors} disabled={loading}>
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Обновить
                        </Button>
                        <ConfirmAction
                            title="Очистить журнал ошибок?"
                            description="Все накопленные записи об ошибках будут безвозвратно удалены."
                            confirmText="Очистить"
                            variant="danger"
                            onConfirm={clearAllErrors}
                        >
                            <Trash2 size={13} /> Очистить все
                        </ConfirmAction>
                    </div>
                }
            />

            <div className="errors-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {errors.length ? (
                    errors.map((err, idx) => (
                        <div
                            key={err.id || idx}
                            className="managed-row"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: 6,
                                padding: 12,
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: 8
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CircleAlert size={15} style={{ color: '#f87171' }} />
                                    <strong style={{ color: '#fca5a5', fontSize: 13 }}>{err.title || err.message || 'Ошибка'}</strong>
                                </div>
                                <span style={{ fontSize: 11, opacity: 0.7 }}>{formatTime(err.created_at || err.timestamp)}</span>
                            </div>
                            {err.stack && (
                                <pre style={{ fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 6, width: '100%', overflowX: 'auto', color: '#cbd5e1' }}>
                                    {err.stack}
                                </pre>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="empty-state" style={{ minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle2 size={32} style={{ color: '#4ade80', marginBottom: 8 }} />
                        <p>Критических ошибок и сбоев в работе не зафиксировано.</p>
                    </div>
                )}
            </div>
        </Card>
    );
}

export default ErrorsAuditTab;
