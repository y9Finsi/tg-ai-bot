import React, { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';

const bridgeImageModels = ['gemini-3.1-flash-lite-image', 'gemini-2.5-flash'];

export function ImageGenSandbox({
    imageForm,
    setImageForm,
    imageProviders = [],
    imageSettings,
    onSaveSettings,
    onRefreshPhotos,
    toast
}) {
    const isBridge = true;
    const availableModels = isBridge ? bridgeImageModels : ['gemini-2.5-flash'];
    const [testPrompt, setTestPrompt] = useState('');
    const [testSaveToCatalog, setTestSaveToCatalog] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [testingImage, setTestingImage] = useState(false);

    async function runImageTest() {
        if (!testPrompt.trim()) {
            if (toast) toast('Введите сюжет для генерации', 'error');
            return;
        }
        setTestingImage(true);
        setTestResult(null);
        try {
            const res = await api('/api/admin/image-generation/test', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: testPrompt.trim(),
                    providerId: imageForm.provider_id ? Number(imageForm.provider_id) : undefined,
                    model: imageForm.model,
                    saveToCatalog: testSaveToCatalog
                })
            });
            setTestResult(res);
            if (res?.success) {
                if (toast) toast(res.imageDataUrl ? 'Изображение успешно сгенерировано!' : 'Ответ получен');
                if (testSaveToCatalog && onRefreshPhotos) onRefreshPhotos();
            }
        } catch (err) {
            setTestResult({ error: err.message });
            if (toast) toast(err.message, 'error');
        } finally {
            setTestingImage(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
                <CardHeader
                    eyebrow="Настройки генерации"
                    title="Параметры AI Генерации (Gemini / Imagen)"
                    description="Провайдер, модель и авто-постинг фото Леры."
                />
                <div className="channel-settings-grid">
                    <label>
                        Провайдер для фото
                        <select
                            value={imageForm.provider_id || ''}
                            onChange={e => setImageForm({ ...imageForm, provider_id: e.target.value })}
                        >
                            <option value="">Авто-поиск (Gemini / Image)</option>
                            {imageProviders.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.model_name})</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Модель генерации
                        <input
                            value={imageForm.model || ''}
                            placeholder="gemini-2.5-flash / imagen-3.0"
                            onChange={e => setImageForm({ ...imageForm, model: e.target.value })}
                        />
                    </label>
                    <label className="channel-enabled">
                        <input
                            type="checkbox"
                            checked={Boolean(imageForm.auto_generate_channel)}
                            onChange={e => setImageForm({ ...imageForm, auto_generate_channel: e.target.checked })}
                        />
                        <strong>Генерировать фото к постам в ТГК</strong>
                    </label>
                    <label className="channel-enabled">
                        <input
                            type="checkbox"
                            checked={Boolean(imageForm.auto_save_catalog)}
                            onChange={e => setImageForm({ ...imageForm, auto_save_catalog: e.target.checked })}
                        />
                        <strong>Авто-сохранять генерации в каталог</strong>
                    </label>
                </div>
                <div className="channel-action-bar" style={{ marginTop: 14 }}>
                    <Button onClick={onSaveSettings}>Сохранить настройки генерации</Button>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Промпт-пресет"
                    title="Базовый стиль-промпт Леры"
                    description="Описывает постоянную внешность, атмосферу СПб, стиль съемки на iPhone и реализм."
                />
                <div className="context-template-editor" style={{ marginTop: 12 }}>
                    <textarea
                        value={imageForm.style_prompt || ''}
                        rows={4}
                        placeholder="Realistic candid iPhone selfie of a 19-year-old Russian student girl named Lera from Saint Petersburg..."
                        onChange={e => setImageForm({ ...imageForm, style_prompt: e.target.value })}
                    />
                </div>
                <div className="channel-action-bar" style={{ marginTop: 14 }}>
                    <Button onClick={onSaveSettings}>Сохранить стиль-промпт</Button>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Песочница"
                    title="Тест генерации фото Леры"
                    description={
                        (imageSettings?.master_reference_dataurl || imageSettings?.master_reference_photo?.id)
                            ? '🟢 Мастер-референс активен — лицо будет скопировано из эталона'
                            : '⚠️ Мастер-референс не задан — будет сгенерировано случайное лицо'
                    }
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            style={{ flex: 1 }}
                            value={testPrompt}
                            placeholder="Сюжет: селфи в кофейне на Петроградке, кофе, осеннее пальто, легкая улыбка"
                            onChange={e => setTestPrompt(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') runImageTest(); }}
                        />
                        <Button onClick={runImageTest} disabled={testingImage}>
                            {testingImage ? 'Генерация...' : 'Сгенерировать'}
                        </Button>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <input
                                type="checkbox"
                                checked={testSaveToCatalog}
                                onChange={e => setTestSaveToCatalog(e.target.checked)}
                            />
                            Автоматически сохранить результат в каталог фото
                        </label>
                    </div>

                    {testResult && (
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                            {testResult.imageDataUrl ? (
                                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <img
                                        src={testResult.imageDataUrl}
                                        alt="Generated"
                                        style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }}
                                    />
                                    <div style={{ flex: 1, minWidth: 200 }}>
                                        <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>
                                            ✅ Фото готово ({testResult.mode === 'reference' ? 'С сохранением лица референса' : 'Текст-генерация без референса'})
                                        </div>
                                        <pre style={{ marginTop: 8, fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 6, maxHeight: 180, overflow: 'auto' }}>
                                            {JSON.stringify({ model: testResult.model, mode: testResult.mode, savedPhotoId: testResult.savedPhoto?.id }, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ color: '#f87171' }}>
                                    {testResult.error || 'Ответ модели получен, но изображение не найдено.'}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

export const ImageGenerationTestPanel = ImageGenSandbox;
export default ImageGenSandbox;
