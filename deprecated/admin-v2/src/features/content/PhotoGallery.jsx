import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { PhotoThumbnail } from './PhotoThumbnail.jsx';
import { PhotoMetaEditor } from './PhotoMetaEditor.jsx';
import { cn } from '@/lib/utils.js';

export function PhotoGallery({
    photos = [],
    onSetMasterRef,
    onUpdatePhoto,
    onDeletePhoto
}) {
    const [photoFilter, setPhotoFilter] = useState('all');

    const filteredPhotos = photos.filter(p => {
        if (photoFilter === 'free') return p.access_level === 'free';
        if (photoFilter === 'premium') return p.access_level === 'premium';
        if (photoFilter === 'spicy') return (p.explicitness || 0) >= 50;
        return true;
    });

    return (
        <Card>
            <CardHeader
                eyebrow="Галерея карточек"
                title="Каталог фотографий Леры"
                description="Превью, метаданные, назначение эталонного мастер-референса и удаление из базы."
            />
            <div className="crm-filter-bar">
                {[['all', 'Все'], ['free', 'Free'], ['premium', 'Premium'], ['spicy', 'Откровенные 50+']].map(([val, lbl]) => (
                    <button
                        key={val}
                        className={cn('crm-filter-btn', photoFilter === val && 'active')}
                        onClick={() => setPhotoFilter(val)}
                    >
                        {lbl}
                    </button>
                ))}
            </div>
            <div className="photos-card-grid">
                {filteredPhotos.length ? (
                    filteredPhotos.map(photo => (
                        <div className="photo-card" key={photo.id}>
                            <div className="photo-card-header">
                                <Badge variant={photo.access_level === 'premium' ? 'green' : 'blue'}>
                                    {photo.access_level}
                                </Badge>
                                <Badge variant={photo.explicitness >= 50 ? 'red' : 'muted'}>
                                    {photo.explicitness}%🌶️
                                </Badge>
                                {Boolean(photo.is_reference) && <Badge variant="purple">👑 Master Ref</Badge>}
                            </div>
                            <PhotoThumbnail photo={photo} />
                            <div className="photo-card-body">
                                <strong>{photo.caption || 'Без описания'}</strong>
                                <div className="photo-tags-list">
                                    {Array.isArray(photo.outfit_tags) ? photo.outfit_tags.map(t => (
                                        <span key={t} className="photo-tag-pill">👗 {t}</span>
                                    )) : null}
                                </div>
                            </div>
                            <PhotoMetaEditor
                                photo={photo}
                                onSave={values => onUpdatePhoto?.(photo, values)}
                            />
                            <details className="photo-expert-details">
                                <summary>Технические данные</summary>
                                <span className="photo-file-id">{photo.file_id}</span>
                            </details>
                            <div className="photo-card-actions">
                                <Button
                                    size="xs"
                                    variant={photo.is_reference ? 'secondary' : 'outline'}
                                    onClick={() => onSetMasterRef?.(photo.id)}
                                >
                                    {photo.is_reference ? '👑 Активный референс' : '⭐ Сделать референсом'}
                                </Button>
                                {onDeletePhoto && (
                                    <ConfirmAction
                                        title="Удалить фото?"
                                        description="Фото исчезнет из каталога."
                                        confirmText="Удалить"
                                        variant="danger"
                                        onConfirm={() => onDeletePhoto(photo.id)}
                                    >
                                        Удалить
                                    </ConfirmAction>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state">Фотографии не найдены.</div>
                )}
            </div>
        </Card>
    );
}

export default PhotoGallery;
