import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';

export function MediaCatalog({
    catalog = [],
    contentChannelId,
    setContentChannelId,
    onSaveContentChannelId,
    onPublishGuide,
    onTestInitiative,
    onAddContent,
    onUpdateContent,
    onTestContent,
    onDeleteContent
}) {
    const [contentForm, setContentForm] = useState({
        telegram_type: 'link',
        telegram_file_id: '',
        url: '',
        description: '',
        enabled: true,
        allow_in_dialogue: true,
        allow_initiative: true,
        allow_channel: false
    });

    const handleAdd = () => {
        onAddContent?.(contentForm);
        setContentForm({
            telegram_type: 'link',
            telegram_file_id: '',
            url: '',
            description: '',
            enabled: true,
            allow_in_dialogue: true,
            allow_initiative: true,
            allow_channel: false
        });
    };

    return (
        <div className="content-photos-layout" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
                <CardHeader
                    eyebrow="Источник каталога"
                    title="Канал контента"
                    description="Бот автоматически забирает из него музыку, TikTok, видео и ссылки. Тут же можно отправить в канал памятку с правилами."
                />
                <div className="photo-upload-form">
                    <label>
                        Telegram Channel ID
                        <input
                            value={contentChannelId}
                            placeholder="-1003729264804"
                            onChange={event => setContentChannelId(event.target.value)}
                        />
                    </label>
                    <Button onClick={onSaveContentChannelId}>Сохранить канал</Button>
                    <ConfirmAction
                        title="Опубликовать правила в канал?"
                        description="От имени Леры уйдёт один готовый пост с правилами оформления материалов."
                        confirmText="Опубликовать"
                        onConfirm={onPublishGuide}
                    >
                        Опубликовать правила
                    </ConfirmAction>
                    <Button variant="outline" onClick={onTestInitiative}>
                        Тест инициативы себе
                    </Button>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Музыка, TikTok и ссылки"
                    title="Добавить материал"
                    description="Посты из выбранного канала появляются здесь автоматически."
                />
                <div className="photo-upload-form">
                    <label>
                        Тип
                        <select
                            value={contentForm.telegram_type}
                            onChange={event => setContentForm({ ...contentForm, telegram_type: event.target.value })}
                        >
                            {['link', 'audio', 'video', 'animation', 'document', 'photo'].map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </label>
                    <input
                        value={contentForm.telegram_file_id}
                        placeholder="Telegram file_id для нативного медиа"
                        onChange={event => setContentForm({ ...contentForm, telegram_file_id: event.target.value })}
                    />
                    <input
                        value={contentForm.url}
                        placeholder="URL для link"
                        onChange={event => setContentForm({ ...contentForm, url: event.target.value })}
                    />
                    <input
                        value={contentForm.description}
                        placeholder="Короткое описание для Леры"
                        onChange={event => setContentForm({ ...contentForm, description: event.target.value })}
                    />
                    <label>
                        <input
                            type="checkbox"
                            checked={contentForm.allow_in_dialogue}
                            onChange={event => setContentForm({ ...contentForm, allow_in_dialogue: event.target.checked })}
                        /> В диалоге
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={contentForm.allow_initiative}
                            onChange={event => setContentForm({ ...contentForm, allow_initiative: event.target.checked })}
                        /> В инициативе
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={contentForm.allow_channel}
                            onChange={event => setContentForm({ ...contentForm, allow_channel: event.target.checked })}
                        /> В канале ТГК (#тгк)
                    </label>
                    <Button onClick={handleAdd}>Добавить</Button>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Каталог"
                    title="Доступные материалы"
                    description="Описание определяет, сможет ли Лера естественно связать материал с ответом."
                />
                <div className="photos-card-grid">
                    {catalog.length ? (
                        catalog.map(item => (
                            <div className="photo-card" key={item.id}>
                                <div className="photo-card-header">
                                    <Badge variant={item.enabled ? 'green' : 'muted'}>{item.telegram_type}</Badge>
                                    {item.allow_channel && <Badge variant="blue">#тгк</Badge>}
                                    <span>#{item.id}</span>
                                </div>
                                <div className="photo-card-body">
                                    <input
                                        defaultValue={item.description}
                                        onBlur={event => onUpdateContent?.(item, { description: event.target.value })}
                                    />
                                    <span className="photo-file-id">{item.url || item.telegram_file_id}</span>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={item.enabled}
                                            onChange={event => onUpdateContent?.(item, { enabled: event.target.checked })}
                                        /> Включён
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={item.allow_in_dialogue}
                                            onChange={event => onUpdateContent?.(item, { allow_in_dialogue: event.target.checked })}
                                        /> В диалоге
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={item.allow_initiative}
                                            onChange={event => onUpdateContent?.(item, { allow_initiative: event.target.checked })}
                                        /> В инициативе
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={item.allow_channel}
                                            onChange={event => onUpdateContent?.(item, { allow_channel: event.target.checked })}
                                        /> В канале ТГК
                                    </label>
                                </div>
                                <div className="photo-card-actions">
                                    <Button variant="outline" onClick={() => onTestContent?.(item)}>Тест себе</Button>
                                    {onDeleteContent && (
                                        <ConfirmAction
                                            title="Удалить материал?"
                                            description="История прежних отправок сохранится."
                                            confirmText="Удалить"
                                            variant="danger"
                                            onConfirm={() => onDeleteContent(item.id)}
                                        >
                                            Удалить
                                        </ConfirmAction>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state">Материалов пока нет.</div>
                    )}
                </div>
            </Card>
        </div>
    );
}

export default MediaCatalog;
