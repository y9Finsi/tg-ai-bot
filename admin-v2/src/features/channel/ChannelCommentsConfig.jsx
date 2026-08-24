import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export function ChannelCommentsConfig({
    channelForm,
    setChannelForm,
    onSave
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Интерактив в канале"
                title="💬 Комментарии и реакции"
                description="Автоответы подписчикам в привязанной группе обсуждений, умные эмодзи-реакции и узнавание собеседников из ЛС."
            />
            <div className="channel-settings-grid">
                <label className="channel-enabled">
                    <input
                        type="checkbox"
                        checked={channelForm.commentsEnabled}
                        onChange={event => setChannelForm({ ...channelForm, commentsEnabled: event.target.checked })}
                    />
                    <strong>Включить автоответы и реакции</strong>
                </label>
                <label className="channel-enabled">
                    <input
                        type="checkbox"
                        checked={channelForm.recognizeUsers}
                        onChange={event => setChannelForm({ ...channelForm, recognizeUsers: event.target.checked })}
                    />
                    <strong>Узнавать собеседников из ЛС</strong> (по имени и фактам памяти)
                </label>
                <label>
                    Шанс эмодзи-реакции на коммент: <span>{channelForm.reactionChance}%</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={channelForm.reactionChance}
                        onChange={event => setChannelForm({ ...channelForm, reactionChance: Number(event.target.value) })}
                    />
                </label>
                <label>
                    Шанс случайного комментария в тред: <span>{channelForm.commentChance}%</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={channelForm.commentChance}
                        onChange={event => setChannelForm({ ...channelForm, commentChance: Number(event.target.value) })}
                    />
                </label>
            </div>
            <div className="context-template-editor" style={{ marginTop: 16 }}>
                <label className="classifier-prompt-editor">
                    Дополнительные инструкции для комментариев
                    <textarea
                        value={channelForm.commentsPrompt}
                        placeholder="Например: чаще подкалывай за питерскую погоду, будь чуть более ироничной к хейтерам..."
                        onChange={event => setChannelForm({ ...channelForm, commentsPrompt: event.target.value })}
                    />
                </label>
            </div>
            <div className="channel-action-bar">
                <span>Прямые теги (@username) и реплаи на Леру получают 100% ответ. Интимные тайны в публичный чат не утекают.</span>
                <Button onClick={onSave}>Сохранить настройки комментариев</Button>
            </div>
        </Card>
    );
}

export default ChannelCommentsConfig;
