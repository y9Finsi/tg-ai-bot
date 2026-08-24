import React, { useState } from 'react';
import { Upload, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { compressImage } from '@/lib/imageCompressor.js';

export function PhotoUploader({ onUploadSuccess, onAddByFileId, toast }) {
    const [photoForm, setPhotoForm] = useState({
        file_id: '',
        caption: '',
        tags: '',
        outfit_tags: '',
        explicitness: 0,
        access_level: 'free',
        time_of_day: 'any'
    });
    const [uploading, setUploading] = useState(false);
    const [compressionInfo, setCompressionInfo] = useState(null);
    const [fileName, setFileName] = useState('');

    async function handleFileSelected(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setUploading(true);
        setCompressionInfo(null);

        try {
            // Client-side canvas compression (max 2.5MB, <= 2560px)
            const compressed = await compressImage(file, {
                maxSizeBytes: 2.5 * 1024 * 1024,
                maxWidth: 2560,
                maxHeight: 2560
            });

            setCompressionInfo({
                originalMb: (compressed.originalSize / (1024 * 1024)).toFixed(2),
                compressedMb: (compressed.compressedSize / (1024 * 1024)).toFixed(2),
                reduction: compressed.reductionPercent
            });

            await onUploadSuccess?.({
                data: compressed.dataUrl,
                filename: compressed.file.name,
                caption: photoForm.caption || file.name,
                access_level: photoForm.access_level,
                time_of_day: photoForm.time_of_day,
                explicitness: Number(photoForm.explicitness || 0),
                tags: photoForm.tags ? photoForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                outfit_tags: photoForm.outfit_tags ? photoForm.outfit_tags.split(',').map(t => t.trim()).filter(Boolean) : []
            });

            event.target.value = '';
            setFileName('');
            setPhotoForm({
                file_id: '',
                caption: '',
                tags: '',
                outfit_tags: '',
                explicitness: 0,
                access_level: 'free',
                time_of_day: 'any'
            });
            toast?.('Фото успешно оптимизировано и загружено!');
        } catch (err) {
            toast?.(`Ошибка при загрузке: ${err.message}`, 'error');
        } finally {
            setUploading(false);
        }
    }

    function handleAddByFileId() {
        if (!photoForm.file_id.trim()) {
            toast?.('Укажите Telegram file_id', 'error');
            return;
        }
        onAddByFileId?.({
            ...photoForm,
            file_id: photoForm.file_id.trim(),
            explicitness: Number(photoForm.explicitness || 0),
            tags: photoForm.tags ? photoForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
            outfit_tags: photoForm.outfit_tags ? photoForm.outfit_tags.split(',').map(t => t.trim()).filter(Boolean) : []
        });
        setPhotoForm({
            file_id: '',
            caption: '',
            tags: '',
            outfit_tags: '',
            explicitness: 0,
            access_level: 'free',
            time_of_day: 'any'
        });
    }

    return (
        <Card>
            <CardHeader
                eyebrow="Добавление медиа"
                title="Загрузить новое фото Леры"
                description="Сначала добавьте описание, затем выберите изображение с компьютера (автоматическое сжатие Canvas до 2.5 МБ)."
            />
            <div className="photo-upload-container">
                <div className="photo-upload-form">
                    <input
                        value={photoForm.caption}
                        placeholder="Описание картинки"
                        onChange={event => setPhotoForm({ ...photoForm, caption: event.target.value })}
                    />
                    <input
                        value={photoForm.tags}
                        placeholder="Теги (например, домашнее, селфи)"
                        onChange={event => setPhotoForm({ ...photoForm, tags: event.target.value })}
                    />
                    <input
                        value={photoForm.outfit_tags}
                        placeholder="Теги наряда (например, пижама, бельё)"
                        onChange={event => setPhotoForm({ ...photoForm, outfit_tags: event.target.value })}
                    />
                    <label>
                        Откровенность (0-100%)
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={photoForm.explicitness}
                            onChange={event => setPhotoForm({ ...photoForm, explicitness: Number(event.target.value) })}
                        />
                    </label>
                    <label>
                        Доступ
                        <select
                            value={photoForm.access_level}
                            onChange={event => setPhotoForm({ ...photoForm, access_level: event.target.value })}
                        >
                            <option value="free">Free (Бесплатное)</option>
                            <option value="premium">Premium (Платное)</option>
                        </select>
                    </label>
                    <label>
                        Время суток
                        <select
                            value={photoForm.time_of_day}
                            onChange={event => setPhotoForm({ ...photoForm, time_of_day: event.target.value })}
                        >
                            <option value="any">Любое</option>
                            <option value="day">День</option>
                            <option value="night">Ночь</option>
                        </select>
                    </label>
                </div>

                <div className="file-dropzone-box">
                    <div>
                        <strong>Изображение</strong>
                        <span>JPG, PNG или WEBP (автоматически сжимается на клиенте)</span>
                    </div>
                    <input
                        id="photo-upload-input"
                        className="photo-file-input"
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelected}
                        disabled={uploading}
                    />
                    <label className="ui-button ui-button-primary photo-file-button" htmlFor="photo-upload-input">
                        <Upload size={14} /> {uploading ? 'Сжатие и загрузка…' : 'Выбрать изображение'}
                    </label>
                    <span className="photo-file-name">{fileName || 'Файл не выбран'}</span>
                    {compressionInfo && (
                        <div style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
                            Сжато: {compressionInfo.originalMb} МБ → {compressionInfo.compressedMb} МБ (-{compressionInfo.reduction}%)
                        </div>
                    )}
                </div>

                <details className="photo-expert-details">
                    <summary>Экспертный режим · Telegram file_id</summary>
                    <div className="photo-expert-row">
                        <input
                            value={photoForm.file_id}
                            placeholder="Telegram file_id"
                            onChange={event => setPhotoForm({ ...photoForm, file_id: event.target.value })}
                        />
                        <Button onClick={handleAddByFileId}>Добавить по file_id</Button>
                    </div>
                </details>
            </div>
        </Card>
    );
}

export const MediaUploader = PhotoUploader;
export default PhotoUploader;
