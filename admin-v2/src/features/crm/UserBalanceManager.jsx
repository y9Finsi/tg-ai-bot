import React from 'react';
import { Button } from '@/components/ui/button.jsx';

export function UserBalanceManager({
    selectedUser,
    userForm,
    setUserForm,
    initiativeLimitForm,
    setInitiativeLimitForm,
    onSaveBalance,
    onSaveInitiativeLimit,
    onAddPreset
}) {
    if (!selectedUser?.user) return null;

    return (
        <div className="crm-section balance-section">
            <h3>Выдача и пресеты балансов</h3>
            <div className="preset-group">
                <span>Быстро добавить 💬 Текст:</span>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(10, 0, 0)}>+10 💬</Button>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(50, 0, 0)}>+50 💬</Button>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(100, 0, 0)}>+100 💬</Button>
            </div>
            <div className="preset-group">
                <span>Быстро добавить 🖼️ Фото:</span>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(0, 5, 0)}>+5 🖼️</Button>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(0, 20, 0)}>+20 🖼️</Button>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(0, 50, 0)}>+50 🖼️</Button>
            </div>
            <div className="preset-group">
                <span>Быстро добавить 🎙️ Голосовые:</span>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(0, 0, 5)}>+5 🎙️</Button>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(0, 0, 20)}>+20 🎙️</Button>
                <Button size="sm" variant="outline" onClick={() => onAddPreset(0, 0, 50)}>+50 🎙️</Button>
            </div>

            <div className="inline-controls" style={{ marginTop: 12 }}>
                <label>
                    Текстовый баланс
                    <input
                        type="number"
                        value={userForm.textBalance}
                        onChange={event => setUserForm({ ...userForm, textBalance: event.target.value })}
                    />
                </label>
                <label>
                    Баланс фото
                    <input
                        type="number"
                        value={userForm.imageBalance}
                        onChange={event => setUserForm({ ...userForm, imageBalance: event.target.value })}
                    />
                </label>
                <label>
                    Баланс голосовых
                    <input
                        type="number"
                        value={userForm.voiceBalance}
                        onChange={event => setUserForm({ ...userForm, voiceBalance: event.target.value })}
                    />
                </label>
                <Button size="sm" onClick={() => onSaveBalance(userForm)}>Сохранить баланс</Button>
            </div>

            <h3 style={{ marginTop: 24 }}>Инициативы</h3>
            <div className="field-hint">
                Сегодня использовано: {selectedUser.user.initiatives_used_today ?? 0}. Эффективный лимит: {selectedUser.user.initiative_limit_effective ?? 3}. Осталось: {selectedUser.user.initiatives_remaining_today ?? 0}.
            </div>
            <div className="inline-controls" style={{ marginTop: 12 }}>
                <label>
                    Личный лимит в сутки
                    <input
                        type="number"
                        min="0"
                        max="20"
                        value={initiativeLimitForm}
                        placeholder="Общий лимит"
                        onChange={event => setInitiativeLimitForm(event.target.value)}
                    />
                </label>
                <Button size="sm" onClick={() => onSaveInitiativeLimit(initiativeLimitForm)}>Сохранить лимит</Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        setInitiativeLimitForm('');
                        onSaveInitiativeLimit('');
                    }}
                >
                    Использовать общий
                </Button>
            </div>
        </div>
    );
}

export default UserBalanceManager;
