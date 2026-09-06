import React, { useState, useEffect } from 'react';
import { Image, Sparkles, Radio, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { PhotoGallery } from './PhotoGallery.jsx';
import { PhotoUploader } from './PhotoUploader.jsx';
import { MasterReferenceManager } from './MasterReferenceManager.jsx';
import { MediaCatalog } from './MediaCatalog.jsx';
import { ContentSentJournal } from './ContentSentJournal.jsx';

export function ContentTab({ toast }) {
    const [subTab, setSubTab] = useState('photos');

    const [photos, setPhotos] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [contentSent, setContentSent] = useState([]);
    const [contentChannelId, setContentChannelId] = useState('-1003729264804');
    const [imageSettings, setImageSettings] = useState(null);
    const [imageForm, setImageForm] = useState({
        master_reference_dataurl: ''
    });

    const run = async (action, success) => {
        try {
            const result = await action();
            if (success && toast) toast(success);
            return result;
        } catch (error) {
            if (toast) toast(error.message, 'error');
            return null;
        }
    };

    async function loadPhotos() {
        const result = await run(() => api('/api/admin/photos'));
        if (result) setPhotos(result.photos || []);
    }

    async function loadContent() {
        const result = await run(() => api('/api/admin/content'));
        if (result) {
            setCatalog(result.content || []);
            setContentSent(result.sent || []);
            setContentChannelId(result.contentChannelId || '-1003729264804');
        }
    }

    async function loadImageSettings() {
        const res = await run(() => api('/api/admin/image-settings'));
        if (res?.settings) {
            setImageSettings(res.settings);
            setImageForm({
                master_reference_dataurl: res.settings.master_reference_dataurl || ''
            });
        }
    }

    async function handleUploadPhoto(payload) {
        const result = await run(() => api('/api/admin/photos/upload', {
            method: 'POST',
            body: JSON.stringify(payload)
        }), 'Файл загружен и зарегистрирован!');
        if (result) loadPhotos();
    }

    async function handleAddPhotoByFileId(form) {
        await run(() => api('/api/admin/photos', {
            method: 'POST',
            body: JSON.stringify(form)
        }), 'Фото добавлено в каталог');
        loadPhotos();
    }

    async function updatePhoto(photo, values) {
        await run(() => api(`/api/admin/photos/${photo.id}`, {
            method: 'PATCH',
            body: JSON.stringify(values)
        }), 'Метаданные фото сохранены');
        loadPhotos();
    }

    async function deletePhoto(photoId) {
        await run(() => api(`/api/admin/photos/${photoId}`, { method: 'DELETE' }), 'Фото удалено');
        loadPhotos();
    }

    async function setAsMasterRef(photoId) {
        await run(() => api(`/api/admin/photos/${photoId}/set-reference`, { method: 'POST' }), `Фото #${photoId} назначено мастер-референсом`);
        loadImageSettings();
        loadPhotos();
    }

    async function uploadMasterRefFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            await run(() => api('/api/admin/image-settings', {
                method: 'POST',
                body: JSON.stringify({ master_reference_dataurl: reader.result })
            }), 'Мастер-референс успешно сохранён');
            loadImageSettings();
        };
        reader.readAsDataURL(file);
    }

    async function clearMasterRef() {
        await run(() => api('/api/admin/image-settings', {
            method: 'POST',
            body: JSON.stringify({ master_reference_dataurl: '' })
        }));
        await run(() => api('/api/admin/photos/unset-reference', { method: 'POST' }));
        if (toast) toast('Мастер-референс сброшен');
        loadImageSettings();
        loadPhotos();
    }

    async function saveContentChannelId() {
        await run(() => api('/api/admin/content/settings', {
            method: 'PATCH',
            body: JSON.stringify({ content_channel_id: contentChannelId })
        }), 'Канал контента сохранён');
    }

    async function addContent(form) {
        const result = await run(() => api('/api/admin/content', {
            method: 'POST',
            body: JSON.stringify(form)
        }), 'Контент добавлен');
        if (result) loadContent();
    }

    async function updateContent(item, values) {
        await run(() => api(`/api/admin/content/${item.id}`, { method: 'PATCH', body: JSON.stringify(values) }), 'Контент сохранён');
        loadContent();
    }

    async function deleteContent(itemId) {
        await run(() => api(`/api/admin/content/${itemId}`, { method: 'DELETE' }), 'Контент удалён');
        loadContent();
    }

    useEffect(() => {
        loadPhotos();
        loadContent();
        loadImageSettings();
    }, []);

    return (
        <div className="content-super-container admin-domain-page">
            <div className="crm-subnav">
                <Button
                    variant={subTab === 'photos' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('photos')}
                >
                    <Image size={14} /> 🖼️ Галерея и Загрузка ({photos.length})
                </Button>
                <Button
                    variant={subTab === 'master-ref' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('master-ref')}
                >
                    <Sparkles size={14} /> 👑 Мастер-референс
                </Button>
                <Button
                    variant={subTab === 'catalog' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('catalog')}
                >
                    <Folder size={14} /> 📁 Каталог материалов ({catalog.length})
                </Button>
            </div>

            <div style={{ marginTop: 14 }}>
                {subTab === 'photos' && (
                    <div className="content-photos-layout" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <PhotoUploader
                            onUploadSuccess={handleUploadPhoto}
                            onAddByFileId={handleAddPhotoByFileId}
                            toast={toast}
                        />
                        <PhotoGallery
                            photos={photos}
                            onSetMasterRef={setAsMasterRef}
                            onUpdatePhoto={updatePhoto}
                            onDeletePhoto={deletePhoto}
                        />
                    </div>
                )}

                {subTab === 'master-ref' && (
                    <MasterReferenceManager
                        imageForm={imageForm}
                        imageSettings={imageSettings}
                        onUploadMasterRef={uploadMasterRefFile}
                        onClearMasterRef={clearMasterRef}
                    />
                )}

                {subTab === 'catalog' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <MediaCatalog
                            catalog={catalog}
                            contentChannelId={contentChannelId}
                            setContentChannelId={setContentChannelId}
                            onSaveContentChannelId={saveContentChannelId}
                            onPublishGuide={() => run(() => api('/api/admin/content/publish-guide', { method: 'POST', body: '{}' }), 'Правила опубликованы')}
                            onTestInitiative={() => run(() => api('/api/admin/initiatives/test', { method: 'POST', body: '{}' }), 'Инициатива в очереди')}
                            onAddContent={addContent}
                            onUpdateContent={updateContent}
                            onTestContent={item => run(() => api(`/api/admin/content/${item.id}/test`, { method: 'POST', body: '{}' }), 'Отправлено админу')}
                            onDeleteContent={deleteContent}
                        />
                        <ContentSentJournal contentSent={contentSent} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default ContentTab;
