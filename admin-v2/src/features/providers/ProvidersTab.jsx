import React, { useState, useEffect } from 'react';
import { Brain, Layers, Sparkles, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { ModelMatrixTable } from './ModelMatrixTable.jsx';
import { ProviderChainManager } from './ProviderChainManager.jsx';
import { ImageGenSandbox } from './ImageGenSandbox.jsx';
import { VoiceGenSandbox } from './VoiceGenSandbox.jsx';

export function ProvidersTab({ toast }) {
    const [subTab, setSubTab] = useState('matrix');

    const [matrix, setMatrix] = useState({});
    const [providers, setProviders] = useState([]);

    const [imageSettings, setImageSettings] = useState(null);
    const [imageForm, setImageForm] = useState({
        provider_id: '',
        model: 'gemini-2.5-flash',
        style_prompt: '',
        auto_generate_channel: true,
        auto_save_catalog: true,
        master_reference_dataurl: ''
    });

    const [voiceSettings, setVoiceSettings] = useState(null);
    const [voiceForm, setVoiceForm] = useState({
        provider_id: '',
        model: 'cosyvoice3',
        voice: 'female',
        prompt_text: '',
        auto_voice_messages: true,
        audio_sample_dataurl: ''
    });

    async function loadData() {
        try {
            const [matrixRes, provRes, imgRes, voiceRes] = await Promise.allSettled([
                api('/api/admin/model-matrix'),
                api('/api/admin/providers'),
                api('/api/admin/image-settings'),
                api('/api/admin/voice-settings')
            ]);

            if (matrixRes.status === 'fulfilled') {
                setMatrix(matrixRes.value.matrix || matrixRes.value || {});
            }
            if (provRes.status === 'fulfilled') {
                setProviders(provRes.value.providers || []);
            }
            if (imgRes.status === 'fulfilled' && imgRes.value?.settings) {
                const s = imgRes.value.settings;
                setImageSettings(s);
                setImageForm({
                    provider_id: s.provider_id || '',
                    model: s.model || 'gemini-2.5-flash',
                    style_prompt: s.style_prompt || '',
                    auto_generate_channel: Boolean(s.auto_generate_channel),
                    auto_save_catalog: Boolean(s.auto_save_catalog),
                    master_reference_dataurl: s.master_reference_dataurl || ''
                });
            }
            if (voiceRes.status === 'fulfilled' && voiceRes.value?.settings) {
                const vs = voiceRes.value.settings;
                setVoiceSettings(vs);
                setVoiceForm({
                    provider_id: vs.provider_id || '',
                    model: vs.model || 'cosyvoice3',
                    voice: vs.voice || 'female',
                    prompt_text: vs.prompt_text || '',
                    auto_voice_messages: vs.auto_voice_messages !== false,
                    audio_sample_dataurl: vs.audio_sample_dataurl || ''
                });
            }
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveMatrix() {
        try {
            await api('/api/admin/model-matrix', {
                method: 'POST',
                body: JSON.stringify({ matrix })
            });
            if (toast) toast('Матрица AI Моделей сохранена');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function addProvider(formData) {
        try {
            await api('/api/admin/providers', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            if (toast) toast('Провайдер добавлен');
            loadData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function updateProvider(id, formData) {
        try {
            await api(`/api/admin/providers/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(formData)
            });
            if (toast) toast('Провайдер обновлен');
            loadData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function deleteProvider(id) {
        try {
            await api(`/api/admin/providers/${id}`, { method: 'DELETE' });
            if (toast) toast('Провайдер удален');
            loadData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function movePriority(providerId, direction) {
        const idx = providers.findIndex(p => p.id === providerId);
        if (idx === -1) return;
        const currentPriority = providers[idx].priority || (idx + 1);
        const newPriority = Math.max(1, currentPriority + direction);
        try {
            await api(`/api/admin/providers/${providerId}/priority`, {
                method: 'PATCH',
                body: JSON.stringify({ priority: newPriority })
            });
            if (toast) toast('Приоритет провайдера обновлён');
            loadData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveImageSettings() {
        try {
            await api('/api/admin/image-settings', {
                method: 'POST',
                body: JSON.stringify({
                    provider_id: imageForm.provider_id ? Number(imageForm.provider_id) : null,
                    model: imageForm.model,
                    style_prompt: imageForm.style_prompt,
                    auto_generate_channel: imageForm.auto_generate_channel,
                    auto_save_catalog: imageForm.auto_save_catalog
                })
            });
            if (toast) toast('Настройки генерации изображений сохранены');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveVoiceSettings() {
        try {
            await api('/api/admin/voice-settings', {
                method: 'POST',
                body: JSON.stringify({
                    provider_id: voiceForm.provider_id ? Number(voiceForm.provider_id) : null,
                    model: voiceForm.model,
                    voice: voiceForm.voice,
                    prompt_text: voiceForm.prompt_text,
                    auto_voice_messages: voiceForm.auto_voice_messages
                })
            });
            if (toast) toast('Настройки голоса сохранены');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    return (
        <div className="providers-super-container admin-domain-page">
            <div className="crm-subnav">
                <Button
                    variant={subTab === 'matrix' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('matrix')}
                >
                    <Brain size={14} /> 🎯 Model Matrix (6 AI Слотов)
                </Button>
                <Button
                    variant={subTab === 'providers' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('providers')}
                >
                    <Layers size={14} /> 🔌 Провайдеры ({providers.length})
                </Button>
                <Button
                    variant={subTab === 'image-gen' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('image-gen')}
                >
                    <Sparkles size={14} /> 🎨 Генерация Фото
                </Button>
                <Button
                    variant={subTab === 'voice-gen' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('voice-gen')}
                >
                    <Mic size={14} /> 🎙️ Голос (CosyVoice 3)
                </Button>
            </div>

            <div style={{ marginTop: 14 }}>
                {subTab === 'matrix' && (
                    <ModelMatrixTable
                        matrix={matrix}
                        setMatrix={setMatrix}
                        providers={providers}
                        onSave={saveMatrix}
                        toast={toast}
                    />
                )}

                {subTab === 'providers' && (
                    <ProviderChainManager
                        providers={providers}
                        onAddProvider={addProvider}
                        onUpdateProvider={updateProvider}
                        onDeleteProvider={deleteProvider}
                        onMovePriority={movePriority}
                    />
                )}

                {subTab === 'image-gen' && (
                    <ImageGenSandbox
                        imageForm={imageForm}
                        setImageForm={setImageForm}
                        imageProviders={providers}
                        imageSettings={imageSettings}
                        onSaveSettings={saveImageSettings}
                        toast={toast}
                    />
                )}

                {subTab === 'voice-gen' && (
                    <VoiceGenSandbox
                        voiceForm={voiceForm}
                        setVoiceForm={setVoiceForm}
                        voiceProviders={providers}
                        onSaveVoiceSettings={saveVoiceSettings}
                        toast={toast}
                    />
                )}
            </div>
        </div>
    );
}

export default ProvidersTab;
