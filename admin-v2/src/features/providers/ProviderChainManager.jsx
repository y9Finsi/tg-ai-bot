import React, { useState } from 'react';
import { Layers, Plus, Trash2, Edit2, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';

export function ProviderChainManager({
    providers = [],
    onAddProvider,
    onUpdateProvider,
    onDeleteProvider,
    onMovePriority
}) {
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        name: '',
        model_name: '',
        base_url: '',
        api_key: '',
        priority: 1,
        is_active: true,
        supports_vision: false,
        supports_audio: false
    });

    const handleStartCreate = () => {
        setForm({
            name: '',
            model_name: '',
            base_url: 'https://api.openai.com/v1',
            api_key: '',
            priority: providers.length + 1,
            is_active: true,
            supports_vision: false,
            supports_audio: false
        });
        setEditingId(null);
        setIsCreating(true);
    };

    const handleStartEdit = (p) => {
        setForm({
            name: p.name || '',
            model_name: p.model_name || '',
            base_url: p.base_url || '',
            api_key: '',
            priority: p.priority || 1,
            is_active: p.is_active !== false,
            supports_vision: Boolean(p.supports_vision || p.sampling_capabilities?.vision),
            supports_audio: Boolean(p.supports_audio || p.sampling_capabilities?.audio)
        });
        setEditingId(p.id);
        setIsCreating(false);
    };

    const handleSave = () => {
        if (!form.name.trim()) return;
        if (editingId) {
            onUpdateProvider?.(editingId, form);
            setEditingId(null);
        } else {
            onAddProvider?.(form);
            setIsCreating(false);
        }
    };

    return (
        <Card>
            <CardHeader
                eyebrow="Провайдеры и fallback"
                title="Реестр LLM / Voice / Image Провайдеров"
                description="Подключение API-ключей, кастомных OpenAI-совместимых эндпоинтов и управление приоритетом цепочки. Ключи и секреты скрыты."
                action={
                    <Button size="sm" onClick={handleStartCreate}>
                        <Plus size={14} /> Добавить провайдера
                    </Button>
                }
            />

            {(isCreating || editingId) && (
                <div style={{ padding: 14, background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--border)', marginTop: 12 }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>{editingId ? 'Редактировать провайдера' : 'Новый провайдер'}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                        <label style={{ fontSize: 12 }}>
                            Название (Alias)
                            <input value={form.name} placeholder="OpenAI Official / Hausmer TTS" onChange={e => setForm({ ...form, name: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                            Модель по умолчанию
                            <input value={form.model_name} placeholder="gpt-4o / cosyvoice3" onChange={e => setForm({ ...form, model_name: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                            Base URL
                            <input name="base_url" value={form.base_url} placeholder="https://api.openai.com/v1" onChange={e => setForm({ ...form, base_url: e.target.value })} />
                        </label>
                        <label style={{ fontSize: 12 }}>
                            API Key {editingId && '(оставьте пустым, если не меняется)'}
                            <input name="api_key" type="password" value={form.api_key} placeholder="sk-..." onChange={e => setForm({ ...form, api_key: e.target.value })} />
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input type="checkbox" checked={form.supports_vision} onChange={e => setForm({ ...form, supports_vision: e.target.checked })} /> Vision
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input type="checkbox" checked={form.supports_audio} onChange={e => setForm({ ...form, supports_audio: e.target.checked })} /> Audio / TTS
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Активен
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <Button size="sm" onClick={handleSave}>Сохранить</Button>
                        <Button size="sm" variant="outline" onClick={() => { setIsCreating(false); setEditingId(null); }}>Отмена</Button>
                    </div>
                </div>
            )}

            <div className="providers-list" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {providers.map((p, idx) => (
                    <div className="managed-row provider-managed-row" key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Layers size={16} />
                            <div>
                                <strong>{p.name}</strong>
                                <div>
                                    <span style={{ fontSize: 12, opacity: 0.8 }}>Модель: {p.model_name} · <code>{p.base_url}</code></span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Button size="xs" variant="outline" onClick={() => onMovePriority?.(p.id, -1)} title="Поднять провайдера в цепочке">
                                <ArrowUp size={12} /> Поднять в цепочке
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => onMovePriority?.(p.id, 1)} title="Опустить провайдера в цепочке">
                                <ArrowDown size={12} /> Опустить в цепочке
                            </Button>
                            {p.supports_vision && <Badge variant="purple">Vision</Badge>}
                            {p.supports_audio && <Badge variant="yellow">Audio</Badge>}
                            <Badge variant={p.is_active ? 'green' : 'muted'}>{p.is_active ? 'Активен' : 'Отключен'}</Badge>
                            <Button size="xs" variant="outline" onClick={() => handleStartEdit(p)}><Edit2 size={12} /></Button>
                            {onDeleteProvider && (
                                <ConfirmAction
                                    title="Удалить провайдера?"
                                    description="Провайдер будет удален из конфигурации."
                                    confirmText="Удалить"
                                    variant="danger"
                                    onConfirm={() => onDeleteProvider(p.id)}
                                >
                                    <Trash2 size={12} />
                                </ConfirmAction>
                            )}
                        </div>
                    </div>
                ))}
                {!providers.length && (
                    <div className="empty-state">Провайдеры не настроены.</div>
                )}
            </div>
        </Card>
    );
}

export default ProviderChainManager;
