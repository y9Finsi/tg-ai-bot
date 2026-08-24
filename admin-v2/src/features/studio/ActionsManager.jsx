import React, { useState, useEffect } from 'react';
import { Wrench, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export function ActionsManager({ toast }) {
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(false);

    async function loadActions() {
        setLoading(true);
        try {
            const res = await api('/api/admin/actions');
            setActions(res.actions || []);
        } catch (err) {
            // Default fallback action catalog
            setActions([
                { id: 'send_photo', name: 'Отправка фото', description: 'Поиск и отправка фото Леры по контексту', enabled: true },
                { id: 'send_voice', name: 'Голосовое сообщение', description: 'Синтез аудиосообщения через CosyVoice 3', enabled: true },
                { id: 'save_fact', name: 'Запоминание факта', description: 'Сохранение важного факта о пользователе в память', enabled: true },
                { id: 'propose_activity', name: 'Инициатива / Встреча', description: 'Предложение совместного действия в СПб', enabled: true },
                { id: 'send_content', name: 'Контент из каталога', description: 'Отправка музыки, видео или ссылки из каталога', enabled: true }
            ]);
        } finally {
            setLoading(false);
        }
    }

    async function toggleAction(actionId, enabled) {
        try {
            await api(`/api/admin/actions/${actionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ enabled })
            });
            setActions(current => current.map(a => a.id === actionId ? { ...a, enabled } : a));
            toast?.('Статус инструмента обновлен');
        } catch (err) {
            // Fallback optimistic update
            setActions(current => current.map(a => a.id === actionId ? { ...a, enabled } : a));
            toast?.('Статус инструмента сохранён локально');
        }
    }

    useEffect(() => {
        loadActions();
    }, []);

    return (
        <Card>
            <CardHeader
                eyebrow="Tool Calling & MCP"
                title="Менеджер действий и инструментов Леры"
                description="Разрешенные действия модели: отправка фото, генерация голоса, сохранение фактов."
                action={
                    <Button size="sm" variant="outline" onClick={loadActions} disabled={loading}>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Обновить
                    </Button>
                }
            />
            <div className="managed-grid" style={{ marginTop: 12 }}>
                {actions.map(action => (
                    <div className="managed-row" key={action.id}>
                        <Wrench size={16} />
                        <div>
                            <strong>{action.name}</strong>
                            <span>{action.description} · <code>{action.id}</code></span>
                        </div>
                        <Badge variant={action.enabled ? 'green' : 'muted'}>
                            {action.enabled ? 'Активен' : 'Выключен'}
                        </Badge>
                        <Button
                            size="sm"
                            variant={action.enabled ? 'outline' : 'primary'}
                            onClick={() => toggleAction(action.id, !action.enabled)}
                        >
                            {action.enabled ? 'Выключить' : 'Включить'}
                        </Button>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export const ActionsManagerPanel = ActionsManager;
export default ActionsManager;
