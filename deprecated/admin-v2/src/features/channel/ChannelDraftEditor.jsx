import React, { useState } from 'react';
import { WandSparkles, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { PromptAssemblyMap } from './PromptAssemblyMap.jsx';
import { TOPIC_LABELS } from '@/lib/topicUtils.js';

export const CHANNEL_PROMPT_MODULES = [
    { key: 'voice', label: '01 · Голос и подача', description: 'Тон, ритм, длина предложений и подача мысли.' },
    { key: 'context', label: '02 · Контекст канала', description: 'О чем канал, для кого пишем и как ведем ленту.' },
    { key: 'restrictions', label: '03 · Ограничения', description: 'Запретные темы, стоп-слова и границы.' },
    { key: 'cta', label: '04 · Вовлечение и CTA', description: 'Правила вопросов, реакций и завершения постов.' }
];

export function PromptModulesEditor({ modules = {}, onChange, definitions = CHANNEL_PROMPT_MODULES }) {
    return (
        <div className="prompt-modules-editor">
            {definitions.map(def => (
                <div className="prompt-module-block" key={def.key}>
                    <div className="prompt-module-header">
                        <strong>{def.label}</strong>
                        <span>{def.description}</span>
                    </div>
                    <textarea
                        value={modules[def.key] || ''}
                        placeholder="Оставьте пустым для использования базового промпта Леры..."
                        onChange={e => onChange({ ...modules, [def.key]: e.target.value })}
                        rows={3}
                    />
                </div>
            ))}
        </div>
    );
}

export function ChannelDraftEditor({
    channelForm,
    setChannelForm,
    channelDraft,
    setChannelDraft,
    draftText,
    setDraftText,
    onGenerateDraft,
    onGenerateAiPhoto,
    onPublishDraft,
    generatingAiPreview
}) {
    const [draftTopic, setDraftTopic] = useState('random');
    const [draftMediaMode, setDraftMediaMode] = useState('inherit');
    const [draftFormat, setDraftFormat] = useState('auto');

    return (
        <Card>
            <CardHeader
                eyebrow="Конструктор промпта"
                title="Управляемая генерация"
                description="Личность Леры и контекст дня подключены ниже — вы сразу видите, из каких блоков собирается пост."
            />
            <PromptAssemblyMap channelForm={channelForm} onChannelChange={setChannelForm} />
            <PromptModulesEditor
                modules={channelForm.promptBlocks || {}}
                onChange={promptBlocks => setChannelForm({ ...channelForm, promptBlocks })}
                definitions={CHANNEL_PROMPT_MODULES}
            />

            <div className="channel-generator-controls">
                <span>Черновик не отправляется в Telegram.</span>
                <label className="channel-generator-select">
                    <span>Тема черновика:</span>
                    <select value={draftTopic} onChange={e => setDraftTopic(e.target.value)}>
                        <option value="random">🎲 Случайная (по весам)</option>
                        {Object.entries(TOPIC_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </label>
                <label className="channel-generator-select">
                    <span>Медиа-режим:</span>
                    <select value={draftMediaMode} onChange={e => setDraftMediaMode(e.target.value)}>
                        <option value="inherit">
                            ⚙️ Из настроек ({channelForm.mediaMode === 'none' ? 'без фото' : channelForm.mediaMode === 'db_photo' ? 'фото из БД' : channelForm.mediaMode === 'ai_photo' ? 'AI-фото' : 'мем'})
                        </option>
                        <option value="none">📝 Без фото (только текст)</option>
                        <option value="db_photo">🖼️ Фото из базы (lera_photos)</option>
                        <option value="ai_photo">🤖 AI-генерация фото (Gemini)</option>
                        <option value="meme">🎭 Мем / контент (#тгк)</option>
                    </select>
                </label>
                <label className="channel-generator-select">
                    <span>Формат:</span>
                    <select value={draftFormat} onChange={e => setDraftFormat(e.target.value)}>
                        <option value="auto">⚙️ По редакционному циклу</option>
                        <option value="photo_caption">Фото + состояние</option>
                        <option value="short_thought">Короткая мысль</option>
                        <option value="life_observation">Бытовое наблюдение</option>
                        <option value="question">Вопрос</option>
                        <option value="meme_caption">Подпись к мему</option>
                        <option value="repost_reaction">Реакция на репост</option>
                        <option value="long_monologue">Длинный поток · legacy</option>
                    </select>
                </label>
                <Button
                    variant="primary"
                    onClick={() => onGenerateDraft({ mediaMode: draftMediaMode, topic: draftTopic, format: draftFormat })}
                >
                    <WandSparkles size={15} /> Сгенерировать черновик
                </Button>
            </div>

            {channelDraft && (
                <div className="channel-draft-card">
                    <div className="channel-post-header">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Badge variant="blue">{TOPIC_LABELS[channelDraft.topic] || channelDraft.topic}</Badge>
                            {channelDraft.media?.type === 'photo' && <Badge variant="green">🖼️ Фото из базы</Badge>}
                            {channelDraft.media?.type === 'ai_photo' && <Badge variant="purple">🤖 AI-фото (Gemini)</Badge>}
                            {channelDraft.media?.type === 'meme' && <Badge variant="yellow">🎭 Мем</Badge>}
                            {!channelDraft.media && <Badge variant="muted">📝 Без фото</Badge>}
                        </div>
                        <span>Проверьте перед публикацией</span>
                    </div>

                    <textarea
                        value={draftText}
                        onChange={event => setDraftText(event.target.value)}
                        aria-label="Текст черновика поста"
                        rows={4}
                    />

                    {channelDraft.media && (
                        <div className="channel-draft-media-box">
                            {channelDraft.media.preview_url ? (
                                <div className="channel-draft-media-preview-container">
                                    <img
                                        src={channelDraft.media.preview_url}
                                        alt="Медиа превью"
                                        className="channel-draft-media-img"
                                    />
                                    <div className="channel-draft-media-details">
                                        <strong>
                                            {channelDraft.media.type === 'photo'
                                                ? 'Фото Леры'
                                                : channelDraft.media.type === 'ai_photo'
                                                    ? 'AI-фото (Gemini)'
                                                    : 'Мем/контент'}
                                        </strong>
                                        <span>{channelDraft.media.description || channelDraft.media.caption || 'Медиа прикреплено к посту'}</span>
                                        <div className="channel-draft-media-actions">
                                            <Button
                                                size="xs"
                                                variant="outline"
                                                onClick={() => setChannelDraft({ ...channelDraft, media: null, media_content_id: null })}
                                            >
                                                Убрать медиа
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : channelDraft.media.type === 'ai_photo' ? (
                                <div className="channel-draft-ai-placeholder">
                                    <div className="channel-draft-ai-text">
                                        <strong>🤖 AI-генерация фото включена</strong>
                                        <span>При публикации будет сгенерировано фото через Gemini под контекст поста. Вы можете сгенерировать превью прямо сейчас:</span>
                                    </div>
                                    <Button
                                        size="xs"
                                        variant="secondary"
                                        onClick={onGenerateAiPhoto}
                                        disabled={generatingAiPreview}
                                    >
                                        {generatingAiPreview ? (
                                            <>
                                                <RefreshCw size={13} className="animate-spin" /> Генерация превью...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={13} /> Сгенерировать AI-превью
                                            </>
                                        )}
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    )}

                    <div className="channel-action-bar">
                        <Button
                            variant="outline"
                            onClick={() => onGenerateDraft({ mediaMode: draftMediaMode, topic: draftTopic, format: draftFormat })}
                        >
                            <RefreshCw size={15} /> Сгенерировать заново
                        </Button>
                        <ConfirmAction
                            title="Опубликовать отредактированный черновик?"
                            description="Пост вместе с медиа будет отправлен в Telegram-канал."
                            confirmText="Опубликовать"
                            onConfirm={onPublishDraft}
                        >
                            Опубликовать в Telegram
                        </ConfirmAction>
                    </div>
                </div>
            )}
        </Card>
    );
}

export const PostEditor = ChannelDraftEditor;
export default ChannelDraftEditor;
