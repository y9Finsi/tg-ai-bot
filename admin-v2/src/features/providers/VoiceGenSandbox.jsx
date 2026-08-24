import React, { useState } from 'react';
import { Mic, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';

export function VoiceGenSandbox({
    voiceForm,
    setVoiceForm,
    voiceProviders = [],
    onSaveVoiceSettings,
    toast
}) {
    const [testVoiceText, setTestVoiceText] = useState('Привет! Я Лера, учусь в Питере на втором курсе. Как твои дела?');
    const [testVoiceSendTg, setTestVoiceSendTg] = useState(false);
    const [testVoiceResult, setTestVoiceResult] = useState(null);
    const [testingVoice, setTestingVoice] = useState(false);

    async function uploadVoiceSample(file) {
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            if (toast) toast('Аудиофайл больше 20 МБ', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result;
            try {
                await api('/api/admin/voice-settings', {
                    method: 'POST',
                    body: JSON.stringify({ audio_sample_dataurl: dataUrl })
                });
                setVoiceForm(prev => ({ ...prev, audio_sample_dataurl: dataUrl }));
                if (toast) toast('Голосовой сэмпл Леры успешно сохранён');
            } catch (err) {
                if (toast) toast(err.message, 'error');
            }
        };
        reader.readAsDataURL(file);
    }

    async function clearVoiceSample() {
        try {
            await api('/api/admin/voice-settings', {
                method: 'POST',
                body: JSON.stringify({ audio_sample_dataurl: '' })
            });
            setVoiceForm(prev => ({ ...prev, audio_sample_dataurl: '' }));
            if (toast) toast('Голосовой сэмпл сброшен');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function runVoiceTest() {
        if (!testVoiceText.trim()) {
            if (toast) toast('Введите текст для озвучки', 'error');
            return;
        }
        setTestingVoice(true);
        setTestVoiceResult(null);
        try {
            const res = await api('/api/admin/voice-generation/test', {
                method: 'POST',
                body: JSON.stringify({
                    text: testVoiceText.trim(),
                    sendToTelegram: testVoiceSendTg
                })
            });
            setTestVoiceResult(res);
            if (res?.success) {
                if (toast) toast(res.telegramSent ? 'Голосовое отправлено в Telegram!' : 'Голос сгенерирован!');
            }
        } catch (err) {
            setTestVoiceResult({ error: err.message });
            if (toast) toast(err.message, 'error');
        } finally {
            setTestingVoice(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
                <CardHeader
                    eyebrow="Настройки озвучки"
                    title="Параметры голосовых сообщений (CosyVoice 3)"
                    description="Провайдер, модель TTS, системный голос и активность голосовых сообщений."
                />
                <div className="channel-settings-grid">
                    <label>
                        Провайдер для голоса
                        <select
                            value={voiceForm.provider_id || ''}
                            onChange={e => setVoiceForm({ ...voiceForm, provider_id: e.target.value })}
                        >
                            <option value="">Авто-поиск (Hausmer / OpenAI Audio)</option>
                            {voiceProviders.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.model_name})</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Модель TTS
                        <input
                            value={voiceForm.model || ''}
                            placeholder="cosyvoice3 / tts-1"
                            onChange={e => setVoiceForm({ ...voiceForm, model: e.target.value })}
                        />
                    </label>
                    <label>
                        Голос (Voice Preset)
                        <input
                            value={voiceForm.voice || ''}
                            placeholder="female / nova / alloy"
                            onChange={e => setVoiceForm({ ...voiceForm, voice: e.target.value })}
                        />
                    </label>
                    <label className="channel-enabled">
                        <input
                            type="checkbox"
                            checked={Boolean(voiceForm.auto_voice_messages)}
                            onChange={e => setVoiceForm({ ...voiceForm, auto_voice_messages: e.target.checked })}
                        />
                        <strong>Разрешить генерацию голосовых ответов</strong>
                    </label>
                </div>
                <div className="channel-action-bar" style={{ marginTop: 14 }}>
                    <Button onClick={onSaveVoiceSettings}>Сохранить настройки голоса</Button>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Клонирование голоса"
                    title="Сэмпл голоса Леры (Audio Reference)"
                    description="Эталонное аудио тембра и интонации Леры для zero-shot / few-shot клонирования в CosyVoice 3."
                />
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
                    <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {voiceForm.audio_sample_dataurl ? (
                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                                    🎙️ Активный голосовой сэмпл Леры
                                </div>
                                <audio controls src={voiceForm.audio_sample_dataurl} style={{ width: '100%' }} />
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.15)', color: '#888', fontSize: 12 }}>
                                Сэмпл голоса Леры еще не загружен. Будет использоваться стандартный голос провайдера.
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <label className="ui-button ui-button-primary photo-file-button" style={{ display: 'inline-block', width: 'fit-content' }}>
                                Загрузить аудиофайл (.mp3 / .wav / .ogg)
                                <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => uploadVoiceSample(e.target.files?.[0])} />
                            </label>
                            {voiceForm.audio_sample_dataurl && (
                                <Button size="sm" variant="outline" onClick={clearVoiceSample}>Сбросить сэмпл</Button>
                            )}
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                                Текст аудио-образца (Расшифровка сэмпла для CosyVoice 3)
                            </label>
                            <textarea
                                rows={2}
                                value={voiceForm.prompt_text || ''}
                                placeholder="Например: Привет! Как твои дела? Чем сегодня занимаешься?"
                                onChange={e => setVoiceForm({ ...voiceForm, prompt_text: e.target.value })}
                            />
                            <div style={{ marginTop: 4 }}>
                                <Button size="sm" onClick={onSaveVoiceSettings}>Сохранить текст сэмпла</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Песочница"
                    title="Тестовая озвучка голосом Леры"
                    description="Проверка синтеза речи CosyVoice 3 перед отправкой пользователям."
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <textarea
                        value={testVoiceText}
                        rows={3}
                        placeholder="Текст, который Лера должна сказать..."
                        onChange={e => setTestVoiceText(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button onClick={runVoiceTest} disabled={testingVoice}>
                            {testingVoice ? 'Озвучивание...' : '🎙️ Озвучить текст'}
                        </Button>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <input
                                type="checkbox"
                                checked={testVoiceSendTg}
                                onChange={e => setTestVoiceSendTg(e.target.checked)}
                            />
                            Отправить голосовое мне в Telegram (@admin)
                        </label>
                    </div>

                    {testVoiceResult && (
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                            {testVoiceResult.audioDataUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>
                                        ✅ Голосовое сообщение сгенерировано!
                                    </div>
                                    <audio controls autoPlay src={testVoiceResult.audioDataUrl} style={{ width: '100%', maxWidth: 400 }} />
                                    {testVoiceResult.telegramSent && (
                                        <div style={{ fontSize: 12, color: '#60a5fa' }}>
                                            🚀 Также отправлено в Telegram админа!
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ color: '#f87171' }}>
                                    {testVoiceResult.error || 'Ошибка при генерации аудио.'}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

export default VoiceGenSandbox;
