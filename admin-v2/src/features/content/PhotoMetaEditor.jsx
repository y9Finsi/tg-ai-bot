import React, { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';

export function PhotoMetaEditor({ photo, onSave }) {
    const [form, setForm] = useState({
        caption: photo.caption || '',
        tags: Array.isArray(photo.tags) ? photo.tags.join(', ') : '',
        outfit_tags: Array.isArray(photo.outfit_tags) ? photo.outfit_tags.join(', ') : '',
        access_level: photo.access_level || 'free',
        time_of_day: photo.time_of_day || 'any',
        explicitness: Number(photo.explicitness || 0)
    });

    return (
        <details className="photo-edit-details">
            <summary>Изменить метаданные</summary>
            <div className="photo-edit-form">
                <input
                    value={form.caption}
                    placeholder="Описание"
                    onChange={event => setForm({ ...form, caption: event.target.value })}
                />
                <input
                    value={form.tags}
                    placeholder="Теги через запятую"
                    onChange={event => setForm({ ...form, tags: event.target.value })}
                />
                <input
                    value={form.outfit_tags}
                    placeholder="Теги наряда"
                    onChange={event => setForm({ ...form, outfit_tags: event.target.value })}
                />
                <label>
                    Откровенность
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={form.explicitness}
                        onChange={event => setForm({ ...form, explicitness: Number(event.target.value) })}
                    />
                </label>
                <label>
                    Доступ
                    <select
                        value={form.access_level}
                        onChange={event => setForm({ ...form, access_level: event.target.value })}
                    >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                    </select>
                </label>
                <label>
                    Время
                    <select
                        value={form.time_of_day}
                        onChange={event => setForm({ ...form, time_of_day: event.target.value })}
                    >
                        <option value="any">Любое</option>
                        <option value="day">День</option>
                        <option value="night">Ночь</option>
                    </select>
                </label>
                <Button
                    size="sm"
                    onClick={() => onSave({
                        ...form,
                        tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
                        outfit_tags: form.outfit_tags.split(',').map(tag => tag.trim()).filter(Boolean)
                    })}
                >
                    Сохранить
                </Button>
            </div>
        </details>
    );
}

export default PhotoMetaEditor;
