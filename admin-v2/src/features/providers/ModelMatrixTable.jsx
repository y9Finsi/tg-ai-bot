import React from 'react';
import { Brain, Sparkles, MessageSquare, ShieldCheck, Image, Mic } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { SlotHealthPing } from './SlotHealthPing.jsx';

export const AI_SLOTS = [
    { key: 'core_dialogue', name: '01 · Core Dialogue (Основной диалог)', icon: MessageSquare, description: 'Генерация диалогов, поддержание роли Леры и эмоциональной связи.' },
    { key: 'style_classifier', name: '02 · Style Classifier (Классификатор тем)', icon: Brain, description: 'Классификация тем сообщений, определение тональности и интент-анализ.' },
    { key: 'judge', name: '03 · AI Judge (Контроль качества)', icon: ShieldCheck, description: 'Проверка ответов и постов перед отправкой пользователям.' },
    { key: 'text_to_image', name: '04 · Text-to-Image (Генерация фото по тексту)', icon: Image, description: 'Генерация селфи и уличных фото Леры в Санкт-Петербурге.' },
    { key: 'image_to_image', name: '05 · Image-to-Image / Edit (Vision & Референс)', icon: Sparkles, description: 'Генерация с сохранением лица эталонного мастер-референса.' },
    { key: 'voice', name: '06 · Voice TTS (CosyVoice 3)', icon: Mic, description: 'Клонирование голоса и синтез реалистичной русской речи Леры.' }
];

export function ModelMatrixTable({
    matrix = {},
    setMatrix,
    providers = [],
    onSave,
    toast
}) {
    const handleSlotChange = (slotKey, field, value) => {
        setMatrix(prev => ({
            ...prev,
            [slotKey]: {
                ...(prev[slotKey] || {}),
                [field]: value
            }
        }));
    };

    return (
        <Card>
            <CardHeader
                eyebrow="Единый диспетчер AI моделей"
                title="Model Matrix (Матрица 6 AI Слотов)"
                description="Настройка основных и резервных моделей, маршрутизация запросов и мгновенный мониторинг пинга."
                action={
                    <Button size="sm" onClick={onSave}>
                        Сохранить матрицу
                    </Button>
                }
            />

            <div className="model-matrix-grid" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                {AI_SLOTS.map(slot => {
                    const Icon = slot.icon;
                    const config = matrix[slot.key] || {};

                    return (
                        <div
                            key={slot.key}
                            className="managed-row"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: 16,
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 8,
                                border: '1px solid var(--border)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Icon size={18} style={{ color: 'var(--primary)' }} />
                                    <div>
                                        <strong style={{ fontSize: 14 }}>{slot.name}</strong>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{slot.description}</div>
                                    </div>
                                </div>
                                <SlotHealthPing slotKey={slot.key} slotName={slot.name} toast={toast} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, width: '100%', marginTop: 4 }}>
                                <label style={{ fontSize: 12 }}>
                                    Основной провайдер
                                    <select
                                        value={config.provider_id || ''}
                                        onChange={e => handleSlotChange(slot.key, 'provider_id', e.target.value)}
                                        style={{ marginTop: 4 }}
                                    >
                                        <option value="">По умолчанию / Авто</option>
                                        {providers.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.model_name})</option>
                                        ))}
                                    </select>
                                </label>

                                <label style={{ fontSize: 12 }}>
                                    Модель (Model Tag)
                                    <input
                                        value={config.model || ''}
                                        placeholder="например: gpt-4o / gemini-2.5-flash"
                                        onChange={e => handleSlotChange(slot.key, 'model', e.target.value)}
                                        style={{ marginTop: 4 }}
                                    />
                                </label>

                                <label style={{ fontSize: 12 }}>
                                    Fallback модель (Резерв)
                                    <input
                                        value={config.fallback_model || ''}
                                        placeholder="например: claude-3-5-sonnet"
                                        onChange={e => handleSlotChange(slot.key, 'fallback_model', e.target.value)}
                                        style={{ marginTop: 4 }}
                                    />
                                </label>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={config.fallback_enabled !== false}
                                            onChange={e => handleSlotChange(slot.key, 'fallback_enabled', e.target.checked)}
                                        />
                                        Fallback активен
                                    </label>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Изменения матрицы вступают в силу мгновенно без перезагрузки сервера.</span>
                <Button onClick={onSave}>Сохранить матрицу</Button>
            </div>
        </Card>
    );
}

export default ModelMatrixTable;
