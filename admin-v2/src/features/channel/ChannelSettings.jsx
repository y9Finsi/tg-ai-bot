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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Card 1: Channel & Schedule */}
            <Card>
                <CardHeader
                    eyebrow="Расписание и подключение"
                    title="01 · Канал и Автопостинг"
                    description="Telegram Channel ID, ссылка на канал и частота автоматических публикаций."
                    action={
                        <Button size="sm" onClick={onSave}>
                            Сохранить настройки
                        </Button>
                    }
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
                        Ссылка на канал (t.me/...)
                        <input
                            value={channelForm.channelUrl}
                            placeholder="https://t.me/..."
                            onChange={event => setChannelForm({ ...channelForm, channelUrl: event.target.value })}
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
                            <option value={1}>1 пост в сутки</option>
                            <option value={2}>2 поста в сутки (утро / вечер)</option>
                        </select>
                    </label>
                    <label>
                        Интервал между постами (часы)
                        <input
                            type="number"
                            min="1"
                            max="168"
                            value={channelForm.frequencyHours}
                            onChange={event => setChannelForm({ ...channelForm, frequencyHours: event.target.value })}
                        />
                    </label>
                    <label className="channel-enabled" style={{ gridColumn: '1 / -1' }}>
                        <input
                            type="checkbox"
                            checked={channelForm.isEnabled}
                            onChange={event => setChannelForm({ ...channelForm, isEnabled: event.target.checked })}
                        />
                        <strong>Включить автоматический постинг по расписанию</strong>
                    </label>
                </div>

                <div style={{ marginTop: 14 }}>
                    <ChannelDiagnostics channelId={channelForm.channelId} toast={toast} />
                </div>
            </Card>

            {/* Card 2: Editorial & Media Formats */}
            <Card>
                <CardHeader
                    eyebrow="Контент и стилистика"
                    title="02 · Редакционный формат и Медиа"
                    description="Последовательность форматов (циклы), генерация фото и температура креативности."
                />
                <div className="channel-settings-grid">
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
                            <option value="reference_short">Эталон Леры · Короткий живой пост</option>
                            <option value="legacy_mix">Свободный микс тем</option>
                        </select>
                    </label>
                    <label>
                        Медиа-режим
                        <select
                            value={channelForm.mediaMode}
                            onChange={event => setChannelForm({ ...channelForm, mediaMode: event.target.value })}
                        >
                            <option value="none">📝 Без фото (только текст)</option>
                            <option value="db_photo">🖼️ Фото Леры из базы (lera_photos)</option>
                            <option value="ai_photo">🤖 AI-генерация фото (Gemini)</option>
                            <option value="meme">🎭 Мемы и контент из каталога (#тгк)</option>
                        </select>
                    </label>
                    <label>
                        Цикл 1 (Утро)
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
                        Цикл 2 (Вечер)
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
                        Температура ИИ: <strong>{Number(channelForm.temperature || 0.8).toFixed(1)}</strong>
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={channelForm.temperature || 0.8}
                            onChange={event => setChannelForm({ ...channelForm, temperature: Number(event.target.value) })}
                        />
                    </label>
                    <label>
                        Стиль CTA (завершение поста)
                        <input
                            value={channelForm.ctaStyle || ''}
                            placeholder="например: открытый вопрос в конце"
                            onChange={event => setChannelForm({ ...channelForm, ctaStyle: event.target.value })}
                        />
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
                        <strong>Использовать публичные факты дня</strong>
                    </label>
                </div>
            </Card>

            {/* Card 3: Quality Control & Facts of the Day */}
            <Card>
                <CardHeader
                    eyebrow="Контроль качества"
                    title="03 · Channel Judge и Факты дня"
                    description="Проверка постов перед публикацией и подтвержденные факты из жизни Леры."
                />
                <div className="channel-settings-grid">
                    <label>
                        Режим проверки Channel Judge
                        <select
                            value={channelForm.judgeMode || 'OFF'}
                            onChange={event => setChannelForm({ ...channelForm, judgeMode: event.target.value })}
                        >
                            <option value="OFF">OFF (Без проверки)</option>
                            <option value="OBSERVE">OBSERVE (Логировать замечания)</option>
                            <option value="ENFORCE">ENFORCE (Перегенерировать при браке)</option>
                        </select>
                    </label>
                    <label>
                        Модель Channel Judge
                        <input
                            value={channelForm.judgeModel || ''}
                            placeholder="gpt-4o-mini / gemini-2.5-flash"
                            onChange={event => setChannelForm({ ...channelForm, judgeModel: event.target.value })}
                        />
                    </label>
                </div>

                <div className="context-template-editor" style={{ marginTop: 14 }}>
                    <label className="classifier-prompt-editor">
                        Подтверждённые публичные факты дня (по одному на строку)
                        <textarea
                            rows={3}
                            value={(channelForm.publicFacts || []).map(fact => typeof fact === 'string' ? fact : JSON.stringify(fact)).join('\n')}
                            placeholder="Например: Утром была в кафе «Слой» на Петроградке, пила фильтр-кофе..."
                            onChange={event => setChannelForm({
                                ...channelForm,
                                publicFacts: event.target.value.split('\n').map(value => value.trim()).filter(Boolean)
                            })}
                        />
                    </label>
                    <label className="classifier-prompt-editor" style={{ marginTop: 10 }}>
                        Инструкция и правила для Channel Judge
                        <textarea
                            rows={3}
                            value={channelForm.judgePrompt || ''}
                            placeholder="Проверяй пост на живость, отсутствие блогерских штампов и соответствие стилю Леры..."
                            onChange={event => setChannelForm({ ...channelForm, judgePrompt: event.target.value })}
                        />
                    </label>
                </div>

                <div className="channel-action-bar" style={{ marginTop: 16 }}>
                    <span>Все изменения вступают в силу немедленно при следующем цикле автопостинга.</span>
                    <Button onClick={onSave}>Сохранить все настройки</Button>
                </div>
            </Card>
        </div>
    );
}

export default ChannelSettings;
