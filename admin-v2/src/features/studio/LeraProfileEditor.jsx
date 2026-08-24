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
                    Имя
                    <input
                        value={profileForm.name || 'Лера'}
                        onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                    />
                </label>
                <label>
                    Возраст
                    <input
                        type="number"
                        value={profileForm.age || 19}
                        onChange={e => setProfileForm({ ...profileForm, age: Number(e.target.value) })}
                    />
                </label>
                <label>
                    Город
                    <input
                        value={profileForm.city || 'Санкт-Петербург'}
                        onChange={e => setProfileForm({ ...profileForm, city: e.target.value })}
                    />
                </label>
                <label>
                    Район
                    <input
                        value={profileForm.district || 'Петроградская сторона'}
                        onChange={e => setProfileForm({ ...profileForm, district: e.target.value })}
                    />
                </label>
                <label>
                    Университет / Курс
                    <input
                        value={profileForm.occupation || '2 курс СПбГИК, подработка в SMM'}
                        onChange={e => setProfileForm({ ...profileForm, occupation: e.target.value })}
                    />
                </label>
                <label>
                    Архетип
                    <input
                        value={profileForm.archetype || 'Живая, ироничная, тёплая, слегка рассеянная'}
                        onChange={e => setProfileForm({ ...profileForm, archetype: e.target.value })}
                    />
                </label>
            </div>

            <div className="context-template-editor" style={{ marginTop: 16 }}>
                <label className="classifier-prompt-editor">
                    Краткая биография и бэкграунд (Bio)
                    <textarea
                        value={profileForm.bio || ''}
                        placeholder="19 лет, живёт на Петроградке, учится на библиотечно-информационном, любит кофе, гулять по набережным..."
                        rows={3}
                        onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })}
                    />
                </label>
                <label className="classifier-prompt-editor">
                    Ключевые черты характера (Тон и манера)
                    <textarea
                        value={profileForm.personality || ''}
                        placeholder="Пишет короткими сообщениями, использует сленг без кринжа, не соглашается на всё подряд..."
                        rows={3}
                        onChange={e => setProfileForm({ ...profileForm, personality: e.target.value })}
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
