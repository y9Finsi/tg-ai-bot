import React, { useState, useEffect } from 'react';
import { Send, Play, Pause, XCircle, RefreshCw, Radio } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { api } from '@/lib/api.js';

export function BroadcastManager({ toast }) {
    const [status, setStatus] = useState(null);
    const [text, setText] = useState('');
    const [target, setTarget] = useState('all');
    const [photoUrl, setPhotoUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function loadStatus() {
        try {
            const res = await api('/api/admin/broadcast/status');
            setStatus(res);
        } catch (e) {
            // broadcast not running
        }
    }

    async function startBroadcast() {
        if (!text.trim()) {
            toast?.('Введите текст рассылки', 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            await api('/api/admin/broadcast', {
                method: 'POST',
                body: JSON.stringify({
                    text: text.trim(),
                    target,
                    photo_url: photoUrl.trim() || undefined
                })
            });
            toast?.('Рассылка успешно запущена!');
            setText('');
            setPhotoUrl('');
            loadStatus();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleControl(action) {
        try {
            await api('/api/admin/broadcast/control', {
                method: 'POST',
                body: JSON.stringify({ action })
            });
            toast?.(`Команда «${action}» отправлена`);
            loadStatus();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    const isRunning = status?.is_running;

    return (
        <Card className="broadcast-manager-card">
            <CardHeader
                eyebrow="Массовые коммуникации"
                title="Рассылка сообщений в Telegram"
                description="Отправка промо, системных новостей или анонсов по сегментам базы пользователей."
                action={
                    <Button size="sm" variant="outline" onClick={loadStatus}>
                        <RefreshCw size={13} />
                    </Button>
                }
            />

            {isRunning && (
                <div style={{ padding: 14, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Radio size={16} className="animate-pulse" style={{ color: '#60a5fa' }} />
                            <strong>Рассылка в процессе: {status.sent || 0} / {status.total || 0}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <Button size="xs" variant="outline" onClick={() => handleControl('pause')}>
                                <Pause size={12} /> Пауза
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => handleControl('resume')}>
                                <Play size={12} /> Продолжить
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => handleControl('cancel')}>
                                <XCircle size={12} /> Отменить
                            </Button>
                        </div>
                    </div>
                    <ProgressBar value={status.progress_percent || 0} tone="blue" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                        <span>Успешно: {status.sent || 0} · Ошибок: {status.failed || 0}</span>
                        <span>{status.progress_percent || 0}%</span>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, flex: 1, minWidth: 200 }}>
                        Сегмент получателей
                        <select
                            value={target}
                            onChange={e => setTarget(e.target.value)}
                            disabled={isRunning}
                            style={{ marginTop: 4 }}
                        >
                            <option value="all">👥 Все пользователи бота</option>
                            <option value="free">🆓 Только пользователи Free</option>
                            <option value="premium">💎 Только Premium подписчики</option>
                        </select>
                    </label>
                    <label style={{ fontSize: 12, flex: 2, minWidth: 260 }}>
                        Ссылка на изображение (опционально)
                        <input
                            value={photoUrl}
                            placeholder="https://... или оставить пустым"
                            onChange={e => setPhotoUrl(e.target.value)}
                            disabled={isRunning}
                            style={{ marginTop: 4 }}
                        />
                    </label>
                </div>

                <label style={{ fontSize: 12 }}>
                    Текст сообщения
                    <textarea
                        rows={4}
                        value={text}
                        placeholder="Привет! У Леры вышло новое обновление..."
                        onChange={e => setText(e.target.value)}
                        disabled={isRunning}
                        style={{ marginTop: 4 }}
                    />
                </label>

                <div className="channel-action-bar" style={{ marginTop: 6 }}>
                    <span>Сообщения отправляются с паузами для обхода лимитов Telegram Bot API.</span>
                    <ConfirmAction
                        title="Запустить массовую рассылку?"
                        description={`Сообщение получат все пользователи выбранного сегмента (${target}).`}
                        confirmText="Запустить"
                        onConfirm={startBroadcast}
                        disabled={isRunning || !text.trim() || isSubmitting}
                    >
                        <Send size={14} /> Начать рассылку
                    </ConfirmAction>
                </div>
            </div>
        </Card>
    );
}

export default BroadcastManager;
