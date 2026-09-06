import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';

export function LeraProfileEditor({
    profileForm,
    setProfileForm,
    versions = [],
    onRollback,
    onSave,
    toast
}) {
    const [selectedVersionId, setSelectedVersionId] = useState('');
    const [previewPrompt, setPreviewPrompt] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    async function handlePreview() {
        setPreviewLoading(true);
        try {
            const res = await api('/api/admin/lera-profile/preview', {
                method: 'POST',
                body: JSON.stringify({ profile: profileForm })
            });
            setPreviewPrompt(res.rendered_prompt || res.preview || 'Превью сформировано');
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setPreviewLoading(false);
        }
    }

    return (
        <Card>
            <CardHeader
                eyebrow="Паспорт персонажа"
                title="Профиль и Биография Леры"
                description="Базовые константы личности: возраст, город, учёба, интересы и характер."
                action={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button size="sm" variant="outline" onClick={handlePreview} disabled={previewLoading}>
                            Предпросмотр промпта
                        </Button>
                        <Button size="sm" onClick={onSave}>
                            Сохранить профиль
                        </Button>
                    </div>
                }
            />
            <div className="channel-settings-grid">
                <label>
                    Возраст, биография и базовые факты
                    <input
                        value={profileForm.age_bio || ''}
                        onChange={e => setProfileForm({ ...profileForm, age_bio: e.target.value })}
                    />
                </label>
                <label>
                    Характер
                    <input
                        value={profileForm.character || ''}
                        onChange={e => setProfileForm({ ...profileForm, character: e.target.value })}
                    />
                </label>
                <label>
                    Речь
                    <input
                        value={profileForm.speech || ''}
                        onChange={e => setProfileForm({ ...profileForm, speech: e.target.value })}
                    />
                </label>
                <label>
                    Флирт и границы
                    <input
                        value={profileForm.flirt || ''}
                        onChange={e => setProfileForm({ ...profileForm, flirt: e.target.value })}
                    />
                </label>
                <label>
                    Публичный образ
                    <input
                        value={profileForm.public_image || ''}
                        onChange={e => setProfileForm({ ...profileForm, public_image: e.target.value })}
                    />
                </label>
                <label>
                    Запреты и приватность
                    <input
                        value={profileForm.forbidden || ''}
                        onChange={e => setProfileForm({ ...profileForm, forbidden: e.target.value })}
                    />
                </label>
            </div>

            <div className="context-template-editor" style={{ marginTop: 16 }}>
                <label className="classifier-prompt-editor">
                    Факты и проверяемая реальность
                    <textarea
                        value={profileForm.facts || ''}
                        placeholder="Не выдавать выдуманные конкретные события за факты..."
                        rows={3}
                        onChange={e => setProfileForm({ ...profileForm, facts: e.target.value })}
                    />
                </label>
            </div>

            {previewPrompt && (
                <div style={{ marginTop: 14, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong style={{ fontSize: 13, color: '#60a5fa' }}>Итоговый собранный системный промпт Леры:</strong>
                        <Button size="xs" variant="outline" onClick={() => setPreviewPrompt(null)}>Скрыть</Button>
                    </div>
                    <pre style={{ fontSize: 11, background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', maxHeight: 250, overflowY: 'auto', color: '#cbd5e1' }}>
                        {previewPrompt}
                    </pre>
                </div>
            )}

            {versions.length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                        История версий биографии ({versions.length} изменений):
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            value={selectedVersionId}
                            onChange={e => setSelectedVersionId(e.target.value)}
                            style={{ flex: 1, minWidth: 200 }}
                        >
                            <option value="">Выберите версию для отката...</option>
                            {versions.map(v => (
                                <option key={v.id} value={v.id}>
                                    Версия #{v.id} · {new Date(v.created_at).toLocaleString('ru-RU')}
                                </option>
                            ))}
                        </select>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!selectedVersionId}
                            onClick={() => {
                                if (selectedVersionId) onRollback?.(selectedVersionId);
                            }}
                        >
                            Откатить к выбранной версии
                        </Button>
                    </div>
                </div>
            )}

            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Все правки версионируются в базе данных и автоматически применяются в системный промпт Леры.</span>
                <Button onClick={onSave}>Сохранить профиль</Button>
            </div>
        </Card>
    );
}

export default LeraProfileEditor;
