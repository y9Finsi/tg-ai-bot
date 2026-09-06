import React, { useState } from 'react';
import { ShieldCheck, CircleAlert, CheckCircle2, RefreshCw, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';

export function ChannelDiagnostics({ channelId, toast }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    async function checkAccess() {
        setLoading(true);
        setStatus(null);
        try {
            const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
            const result = await api(`/api/admin/channel/check-access${query}`);
            setStatus(result);
            if (result.can_post_messages) {
                toast?.('Права бота в Telegram-канале подтверждены!');
            } else {
                toast?.(result.error || 'Бот не имеет прав на публикацию в канале', 'error');
            }
        } catch (error) {
            setStatus({ ok: false, error: error.message });
            toast?.(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="channel-diagnostics-box" style={{ background: 'rgba(0,0,0,0.25)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={16} />
                    <strong>Диагностика прав бота в Telegram-канале</strong>
                </div>
                <Button size="sm" variant="outline" onClick={checkAccess} disabled={loading}>
                    <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
                    {loading ? 'Проверяю права…' : 'Проверить доступ'}
                </Button>
            </div>

            {status && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge variant={status.can_post_messages ? 'green' : 'red'}>
                            {status.can_post_messages ? 'ГОТОВ К ПОСТИНГУ' : 'НЕТ ПРАВ НА ПОСТИНГ'}
                        </Badge>
                        {status.title && <span style={{ fontSize: 13, fontWeight: 600 }}>{status.title}</span>}
                        {status.username && <span style={{ fontSize: 12, opacity: 0.7 }}>@{status.username}</span>}
                        {status.member_count !== undefined && <span style={{ fontSize: 12, opacity: 0.7 }}>👥 {status.member_count} подписчиков</span>}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, fontSize: 12, marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {status.can_post_messages ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} /> : <CircleAlert size={13} style={{ color: 'var(--red)' }} />}
                            <span>Публикация (can_post): {status.can_post_messages ? 'Да' : 'Нет'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {status.can_edit_messages !== false ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} /> : <CircleAlert size={13} style={{ color: 'var(--red)' }} />}
                            <span>Редактирование: {status.can_edit_messages ? 'Да' : 'Нет'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {status.can_delete_messages !== false ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} /> : <CircleAlert size={13} style={{ color: 'var(--red)' }} />}
                            <span>Удаление: {status.can_delete_messages ? 'Да' : 'Нет'}</span>
                        </div>
                    </div>

                    {status.error && (
                        <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>
                            {status.error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ChannelDiagnostics;
