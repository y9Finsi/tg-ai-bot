import React from 'react';
import { Radio } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ChannelDiagnostics } from './ChannelDiagnostics.jsx';

export function ChannelSettings({
    channel,
    channelForm,
    setChannelForm,
    onSave,
    toast
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Настройки автопостинга"
                title="Параметры Telegram-канала"
                description="Расписание публикаций, режим медиа и включение."
            />
            <div className="channel-settings-grid">
                <label>
                    Channel ID
                    <input
                        value={channelForm.channelId}
                        placeholder="-100123456789"
                        onChange={event => setChannelForm({ ...channelForm, channelId: event.target.value })}
                    />
                </label>
                <label>
                    Ссылка на канал
                    <input
                        value={channelForm.channelUrl}
                        placeholder="t.me/..."
                        onChange={event => setChannelForm({ ...channelForm, channelUrl: event.target.value })}
                    />
                </label>
                <label>
                    Частота (ч)
                    <input
                        type="number"
                        min="1"
                        max="168"
                        value={channelForm.frequencyHours}
                        onChange={event => setChannelForm({ ...channelForm, frequencyHours: event.target.value })}
                    />
                </label>
                <label>
                    Постов в сутки
                    <select
                        value={channelForm.postsPerDay}
                        onChange={event => setChannelForm({
                            ...channelForm,
                            postsPerDay: Number(event.target.value),
                            frequencyHours: Number(event.target.value) === 1 ? 24 : 12
                        })}
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                    </select>
                </label>
                <label>
                    Редакционный режим
                    <select
                        value={channelForm.editorialMode}
                        onChange={event => setChannelForm({
                            ...channelForm,
                            editorialMode: event.target.value,
                            ...(event.target.value === 'reference_short'
                                ? { postsPerDay: 2, frequencyHours: 12, topics: ['thoughts', 'life'], topicWeights: { thoughts: 1, life: 1 } }
                                : {})
                        })}
                    >
                        <option value="reference_short">Эталон Леры · короткий</option>
                        <option value="legacy_mix">Свободный микс</option>
                    </select>
                </label>
                <label>
                    Цикл 1
                    <select
                        value={channelForm.formatSequence?.[0] || 'photo_caption'}
                        onChange={event => setChannelForm({
                            ...channelForm,
                            formatSequence: [event.target.value, ...(channelForm.formatSequence || []).slice(1)]
                        })}
                    >
                        <option value="photo_caption">Фото + состояние</option>
                        <option value="short_thought">Короткая мысль</option>
                        <option value="life_observation">Бытовое наблюдение</option>
                    </select>
                </label>
                <label>
                    Цикл 2
                    <select
                        value={channelForm.formatSequence?.[1] || 'short_thought'}
                        onChange={event => setChannelForm({
                            ...channelForm,
                            formatSequence: [channelForm.formatSequence?.[0] || 'photo_caption', event.target.value, ...(channelForm.formatSequence || []).slice(2)]
                        })}
                    >
                        <option value="photo_caption">Фото + состояние</option>
                        <option value="short_thought">Короткая мысль</option>
                        <option value="life_observation">Бытовое наблюдение</option>
                    </select>
                </label>
                <label>
                    Цикл 3
                    <select
                        value={channelForm.formatSequence?.[2] || 'life_observation'}
                        onChange={event => setChannelForm({
                            ...channelForm,
                            formatSequence: [channelForm.formatSequence?.[0] || 'photo_caption', channelForm.formatSequence?.[1] || 'short_thought', event.target.value]
                        })}
                    >
                        <option value="photo_caption">Фото + состояние</option>
                        <option value="short_thought">Короткая мысль</option>
                        <option value="life_observation">Бытовое наблюдение</option>
                    </select>
                </label>
                <label>
                    Медиа-режим
                    <select
                        value={channelForm.mediaMode}
                        onChange={event => setChannelForm({ ...channelForm, mediaMode: event.target.value })}
                    >
                        <option value="none">Без фото (только текст)</option>
                        <option value="db_photo">Прикреплять фото из базы</option>
                        <option value="ai_photo">AI-генерация фото (Gemini)</option>
                        <option value="meme">Мемы и картинки из каталога (#тгк)</option>
                    </select>
                </label>
                <label>
                    Температура <span>{Number(channelForm.temperature).toFixed(1)}</span>
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={channelForm.temperature}
                        onChange={event => setChannelForm({ ...channelForm, temperature: Number(event.target.value) })}
                    />
                </label>
                <label>
                    Креативность <span>{Number(channelForm.creativity).toFixed(1)}</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={channelForm.creativity}
                        onChange={event => setChannelForm({ ...channelForm, creativity: Number(event.target.value) })}
                    />
                </label>
                <label>
                    Проверка канала
                    <select
                        value={channelForm.judgeMode}
                        onChange={event => setChannelForm({ ...channelForm, judgeMode: event.target.value })}
                    >
                        <option value="OFF">OFF</option>
                        <option value="OBSERVE">OBSERVE</option>
                        <option value="ENFORCE">ENFORCE</option>
                    </select>
                </label>
                <label>
                    Judge model
                    <input
                        value={channelForm.judgeModel}
                        placeholder="модель по умолчанию"
                        onChange={event => setChannelForm({ ...channelForm, judgeModel: event.target.value })}
                    />
                </label>
                <label>
                    CTA style
                    <input
                        value={channelForm.ctaStyle}
                        placeholder="например: закончить вопросом"
                        onChange={event => setChannelForm({ ...channelForm, ctaStyle: event.target.value })}
                    />
                </label>
                <label className="channel-enabled">
                    <input
                        type="checkbox"
                        checked={channelForm.isEnabled}
                        onChange={event => setChannelForm({ ...channelForm, isEnabled: event.target.checked })}
                    />
                    <strong>Автопостинг активен</strong>
                </label>
                <label className="channel-enabled">
                    <input
                        type="checkbox"
                        checked={channelForm.publicProfileEnabled}
                        onChange={event => setChannelForm({ ...channelForm, publicProfileEnabled: event.target.checked })}
                    />
                    <strong>Публичная проекция профиля</strong>
                </label>
                <label className="channel-enabled">
                    <input
                        type="checkbox"
                        checked={channelForm.publicFactsEnabled}
                        onChange={event => setChannelForm({ ...channelForm, publicFactsEnabled: event.target.checked })}
                    />
                    <strong>Использовать публичные факты</strong>
                </label>
            </div>

            <div style={{ marginTop: 16 }}>
                <ChannelDiagnostics channelId={channelForm.channelId} toast={toast} />
            </div>

            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Настройки сохраняются отдельно от публикации.</span>
                <Button onClick={onSave}>Сохранить настройки</Button>
            </div>

            <div className="channel-status" style={{ marginTop: 12 }}>
                <Radio size={17} />
                <strong>{channel?.settings?.is_enabled ? 'Автопостинг ВКЛЮЧЁН' : 'Автопостинг ВЫКЛЮЧЕН'}</strong>
                <span>
                    Интервал: {channel?.settings?.frequency_hours || 12} ч · Постов/сутки: {channel?.settings?.posts_per_day || 2} · Канал: {channel?.channelUrl || '—'}
                </span>
            </div>

            <div className="context-template-editor" style={{ marginTop: 16 }}>
                <label className="classifier-prompt-editor">
                    Подтверждённые публичные факты дня
                    <textarea
                        value={(channelForm.publicFacts || []).map(fact => typeof fact === 'string' ? fact : JSON.stringify(fact)).join('\n')}
                        placeholder="Один факт на строку: событие, дата, разрешённая формулировка, источник"
                        onChange={event => setChannelForm({
                            ...channelForm,
                            publicFacts: event.target.value.split('\n').map(value => value.trim()).filter(Boolean)
                        })}
                    />
                </label>
                <label className="classifier-prompt-editor">
                    Правила channel-judge
                    <textarea
                        value={channelForm.judgePrompt}
                        placeholder="Проверяй публичный пост строго..."
                        onChange={event => setChannelForm({ ...channelForm, judgePrompt: event.target.value })}
                    />
                </label>
            </div>
        </Card>
    );
}

export default ChannelSettings;
