import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export function LeraProfileEditor({
    profileForm,
    setProfileForm,
    onSave
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Паспорт персонажа"
                title="Профиль и Биография Леры"
                description="Базовые константы личности: возраст, город, учёба, интересы и характер."
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
                <label className="classifier-prompt-editor">
                    Канонический профиль
                    <textarea
                        value="Изменения сохраняются новой версией профиля и используются в chat-промпте."
                        readOnly
                        rows={3}
                    />
                </label>
            </div>

            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Сохраняется в профиль персонажа и используется при сборке промптов.</span>
                <Button onClick={onSave}>Сохранить профиль</Button>
            </div>
        </Card>
    );
}

export default LeraProfileEditor;
