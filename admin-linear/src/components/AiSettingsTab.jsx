import React, { useState, useEffect } from 'react';
import { 
    Plus, 
    Trash2, 
    ArrowUp, 
    ArrowDown, 
    Edit2, 
    X,
    Megaphone,
    Image as ImageIcon,
    Sparkles,
    Cpu,
    MessageSquare,
    Clock,
    CheckCircle2,
    RefreshCw,
    Shield,
    Activity,
    Lock,
    SlidersHorizontal,
    Volume2,
    CalendarClock,
    Layers,
    Check
} from 'lucide-react';
import { api } from '@/lib/api.js';
import { UniversalPipelineBoard } from './UniversalPipelineBoard.jsx';

const INITIAL_PROVIDERS = [
    {
        id: 1,
        name: 'OpenRouter Primary',
        model_name: 'google/gemini-2.5-flash',
        base_url: 'https://openrouter.ai/api/v1',
        api_key: 'sk-or-••••••••',
        priority: 1,
        is_active: true,
        supports_vision: true,
        supports_audio: false
    },
    {
        id: 2,
        name: 'OpenAI Backup',
        model_name: 'gpt-4o-mini',
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-proj-••••••••',
        priority: 2,
        is_active: true,
        supports_vision: true,
        supports_audio: false
    },
    {
        id: 3,
        name: 'Groq Speed Slot',
        model_name: 'llama-3.3-70b-versatile',
        base_url: 'https://api.groq.com/openai/v1',
        api_key: 'gsk-••••••••',
        priority: 3,
        is_active: true,
        supports_vision: false,
        supports_audio: false
    }
];

const INITIAL_PUBLISHED_POSTS = [
    {
        id: '104',
        time: 'Сегодня 11:45',
        format: 'life_observation',
        formatLabel: 'Зарисовка СПб',
        text: 'Успела добежать до Большого проспекта до дождя... Взяла фильтр в Слое и залипаю на прохожих. Питер такой Питер сегодня',
        hasPhoto: true,
        photoText: '📸 Петроградка, Большой пр.'
    },
    {
        id: '103',
        time: 'Вчера 22:15',
        format: 'short_thought',
        formatLabel: 'Короткая мысль',
        text: 'Иногда лучший плейлист — это просто звук колес ночного троллейбуса на Петроградке.',
        hasPhoto: false
    },
    {
        id: '102',
        time: 'Вчера 14:30',
        format: 'photo_caption',
        formatLabel: 'Подпись к фото',
        text: 'когда препод по смм полчаса объяснял тренды, которые умерли три года назад',
        hasPhoto: true,
        photoText: '📸 СПбГИК, 3-я аудитория'
    }
];

export function AiSettingsTab({ toast }) {
    // -------------------------------------------------------------
    // 1. АВТООТВЕТЧИК В ЛС
    // -------------------------------------------------------------
    const [contextLayers, setContextLayers] = useState({
        radiant: true,
        weatherGeo: true,
        semanticaMemory: true
    });
    const [memoryDepth, setMemoryDepth] = useState(5);

    const [providers, setProviders] = useState(INITIAL_PROVIDERS);
    const [providerModalOpen, setProviderModalOpen] = useState(false);
    const [editingProviderId, setEditingProviderId] = useState(null);
    const [pingStates, setPingStates] = useState({});
    const [providerForm, setProviderForm] = useState({
        name: '',
        model_name: '',
        base_url: 'https://openrouter.ai/api/v1',
        api_key: '',
        is_active: true,
        supports_vision: true,
        supports_audio: false
    });

    const [dmJudgeMode, setDmJudgeMode] = useState('ENFORCE');
    const [dmJudgeModel, setDmJudgeModel] = useState('gpt-4o-mini');

    const [dmTemperature, setDmTemperature] = useState(1.0);
    const [dmMaxTokens, setDmMaxTokens] = useState(300);
    const [dmTypingDelay, setDmTypingDelay] = useState(true);
    const [dmVoiceTrigger, setDmVoiceTrigger] = useState(true);




    // -------------------------------------------------------------
    // 2. АВТОПОСТИНГ В ТГ-КАНАЛ (@lera_spb)
    // -------------------------------------------------------------
    const [channelEnabled, setChannelEnabled] = useState(true);
    const [channelFrequency, setChannelFrequency] = useState(12);
    const [channelPostsPerDay, setChannelPostsPerDay] = useState(2);
    
    // Редакционный цикл и медиа
    const [channelMediaMode, setChannelMediaMode] = useState('db_photo');
    const [antiDuplicationWindow, setAntiDuplicationWindow] = useState(true);

    // Судья и комменты канала
    const [channelJudgeMode, setChannelJudgeMode] = useState('ENFORCE');
    const [channelJudgeModel, setChannelJudgeModel] = useState('gpt-4o-mini');
    const [channelCommentsEnabled, setChannelCommentsEnabled] = useState(true);
    const [channelTesting, setChannelTesting] = useState(false);
    const [channelSettingsSaving, setChannelSettingsSaving] = useState(false);
    const [channelSettingsError, setChannelSettingsError] = useState('');

    // Опубликованные посты
    const [publishedPosts, setPublishedPosts] = useState(INITIAL_PUBLISHED_POSTS);

    // Fetch live data
    useEffect(() => {
        async function loadInitial() {
            try {
                const provRes = await api('/api/admin/providers');
                if (provRes?.providers && Array.isArray(provRes.providers) && provRes.providers.length > 0) {
                    setProviders(provRes.providers.sort((a, b) => (a.priority || 0) - (b.priority || 0)));
                }
            } catch {}

            try {
                const settingsRes = await api('/api/admin/channel/settings');
                const settings = settingsRes?.settings;
                if (settings) {
                    setChannelEnabled(settings.is_enabled !== false);
                    setChannelFrequency(Number(settings.frequency_hours) || 12);
                    setChannelPostsPerDay(Number(settings.posts_per_day) || 2);
                    setChannelMediaMode(settings.media_mode || 'none');
                    setChannelJudgeMode(settings.judge_mode || 'ENFORCE');
                    setChannelJudgeModel(settings.judge_model || 'gpt-4o-mini');
                    setChannelCommentsEnabled(settings.comments_enabled !== false);
                }
            } catch (error) {
                setChannelSettingsError(error?.message || 'Настройки канала недоступны');
            }

            try {
                const histRes = await api('/api/admin/channel/history');
                if (histRes?.posts && Array.isArray(histRes.posts) && histRes.posts.length > 0) {
                    const formatted = histRes.posts.slice(0, 8).map((p, idx) => ({
                        id: String(p.id || idx + 1),
                        time: p.created_at ? new Date(p.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Недавно',
                        format: p.provenance?.content_format || 'life_observation',
                        formatLabel: p.provenance?.content_format === 'photo_caption' ? 'Подпись к фото' : p.provenance?.content_format === 'short_thought' ? 'Короткая мысль' : 'Зарисовка СПб',
                        text: p.text || '',
                        hasPhoto: Boolean(p.photo_url || p.provenance?.media_content_id),
                        photoText: p.photo_url ? '📸 Фото' : null
                    }));
                    setPublishedPosts(formatted);
                }
            } catch {}
        }
        loadInitial();
    }, []);

    const handleSaveChannelSettings = async () => {
        setChannelSettingsSaving(true);
        setChannelSettingsError('');
        try {
            await api('/api/admin/channel/settings', {
                method: 'POST',
                body: JSON.stringify({
                    isEnabled: channelEnabled,
                    frequencyHours: channelFrequency,
                    postsPerDay: channelPostsPerDay,
                    mediaMode: channelMediaMode,
                    judgeMode: channelJudgeMode,
                    judgeModel: channelJudgeModel,
                    commentsEnabled: channelCommentsEnabled,
                    inheritLeraPrompt: true,
                    publicProfileEnabled: true,
                    publicFactsEnabled: false
                })
            });
            toast?.('Настройки публикации сохранены', 'success');
        } catch (error) {
            setChannelSettingsError(error?.message || 'Не удалось сохранить настройки канала');
            toast?.(error?.message || 'Не удалось сохранить настройки канала', 'error');
        } finally {
            setChannelSettingsSaving(false);
        }
    };

    // Provider actions
    const handleToggleProvider = async (id) => {
        const target = providers.find(p => p.id === id);
        if (!target) return;
        const nextActive = !target.is_active;
        try {
            await api(`/api/admin/providers/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_active: nextActive, is_enabled: nextActive })
            });
            setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: nextActive, is_enabled: nextActive } : p));
            toast?.('Статус провайдера сохранен в БД', 'success');
        } catch (err) {
            toast?.(err?.message || 'Ошибка обновления провайдера', 'error');
        }
    };

    const handleMovePriority = (id, direction) => {
        setProviders(prev => {
            const list = [...prev];
            const index = list.findIndex(p => p.id === id);
            if (index === -1) return prev;
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= list.length) return prev;
            const temp = list[index];
            list[index] = list[targetIndex];
            list[targetIndex] = temp;
            return list.map((item, idx) => ({ ...item, priority: idx + 1 }));
        });
    };

    const handleDeleteProvider = (id) => {
        setProviders(prev => prev.filter(p => p.id !== id));
        toast?.('Провайдер удален', 'info');
    };

    const handlePingProvider = async (provider) => {
        setPingStates(prev => ({ ...prev, [provider.id]: { loading: true } }));
        const start = Date.now();
        try {
            await api('/api/admin/providers/test', {
                method: 'POST',
                body: JSON.stringify({
                    base_url: provider.base_url,
                    api_key: provider.api_key,
                    model_name: provider.model_name,
                    timeout_ms: 5000
                })
            });
            const latency = Date.now() - start;
            setPingStates(prev => ({ ...prev, [provider.id]: { status: 'OK', latency } }));
            toast?.(`${provider.name}: ${latency}мс`, 'success');
        } catch (error) {
            setPingStates(prev => ({ ...prev, [provider.id]: { status: 'ERROR', error: error?.message || 'Проверка не удалась' } }));
            toast?.(`${provider.name}: проверка не удалась`, 'error');
        }
    };

    const handleOpenAddProvider = () => {
        setEditingProviderId(null);
        setProviderForm({
            name: '',
            model_name: '',
            base_url: 'https://openrouter.ai/api/v1',
            api_key: '',
            is_active: true,
            supports_vision: true,
            supports_audio: false
        });
        setProviderModalOpen(true);
    };

    const handleOpenEditProvider = (provider) => {
        setEditingProviderId(provider.id);
        setProviderForm({
            name: provider.name || '',
            model_name: provider.model_name || '',
            base_url: provider.base_url || '',
            api_key: provider.api_key || '',
            is_active: provider.is_active !== false,
            supports_vision: !!provider.supports_vision,
            supports_audio: !!provider.supports_audio
        });
        setProviderModalOpen(true);
    };

    const handleSaveProvider = (e) => {
        e.preventDefault();
        if (!providerForm.name || !providerForm.model_name) {
            toast?.('Заполните название и модель', 'error');
            return;
        }

        if (editingProviderId) {
            setProviders(prev => prev.map(p => p.id === editingProviderId ? { ...p, ...providerForm } : p));
            api(`/api/admin/providers/${editingProviderId}`, {
                method: 'PATCH',
                body: JSON.stringify(providerForm)
            }).then(() => toast?.('Провайдер сохранен в БД', 'success')).catch(err => toast?.(err.message, 'error'));
        } else {
            const newId = Date.now();
            setProviders(prev => [...prev, {
                ...providerForm,
                id: newId,
                priority: prev.length + 1
            }]);
            api('/api/admin/providers', {
                method: 'POST',
                body: JSON.stringify({
                    name: providerForm.name,
                    model_name: providerForm.model_name,
                    base_url: providerForm.base_url,
                    api_key: providerForm.api_key
                })
            }).then(res => {
                if (res?.provider) {
                    setProviders(prev => prev.map(p => p.id === newId ? res.provider : p));
                }
                toast?.('Провайдер добавлен в БД', 'success');
            }).catch(err => toast?.(err.message, 'error'));
        }
        setProviderModalOpen(false);
    };


    // Trigger test post publication in channel
    const handleTriggerChannelPost = async () => {
        setChannelTesting(true);
        try {
            const res = await api('/api/admin/channel/draft', {
                method: 'POST',
                body: JSON.stringify({
                    content_format: 'photo_caption',
                    media_mode: channelMediaMode
                })
            });
            if (!res?.draft?.text) {
                throw new Error('API не вернул текст черновика');
            }
            const newPost = {
                id: String(Date.now()).slice(-3),
                time: 'Только что',
                format: 'photo_caption',
                formatLabel: 'Подпись к фото',
                text: res.draft.text,
                hasPhoto: channelMediaMode !== 'none',
                photoText: channelMediaMode === 'ai_photo' ? '✨ AI Match' : '📸 Канон'
            };
            setPublishedPosts(prev => [newPost, ...prev]);
            toast?.('Тестовый пост сформирован', 'success');
        } catch (error) {
            toast?.(error?.message || 'Не удалось сформировать пост: API недоступен', 'error');
        } finally {
            setChannelTesting(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 space-y-4 animate-in fade-in duration-150">
            {/* ========================================================= */}
            {/* БЛОК: ХАРАКТЕР И ГОЛОС ЛЕРЫ                              */}
            {/* ========================================================= */}
            <div className="w-full">
                <UniversalPipelineBoard
                    providers={providers}
                    temperature={dmTemperature}
                    setTemperature={setDmTemperature}
                    maxTokens={dmMaxTokens}
                    setMaxTokens={setDmMaxTokens}
                    judgeMode={dmJudgeMode}
                    setJudgeMode={setDmJudgeMode}
                    judgeModel={dmJudgeModel}
                    setJudgeModel={setDmJudgeModel}
                    contextLayers={contextLayers}
                    setContextLayers={setContextLayers}
                    memoryDepth={memoryDepth}
                    setMemoryDepth={setMemoryDepth}
                    onAddProvider={handleOpenAddProvider}
                    onEditProvider={handleOpenEditProvider}
                    onToggleProvider={handleToggleProvider}
                    onPingProvider={handlePingProvider}
                    pingStates={pingStates}
                    toast={toast}
                />
            </div>

            {/* ========================================================= */}
            {/* БЛОК 2: АВТОПОСТИНГ В ТГ-КАНАЛ (@lera_spb)               */}
            {/* ========================================================= */}
            <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3 sm:p-3.5 space-y-3 w-full">
                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                    <div className="flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-emerald-400 stroke-[1.5]" />
                        <h2 className="text-sm font-semibold text-white tracking-tight">Автопостинг в канал</h2>
                        <span className="text-[10px] text-white/40">отдельный workflow публикации · использует Character Studio: CHANNEL</span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded">@lera_spb</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button type="button" onClick={handleSaveChannelSettings} disabled={channelSettingsSaving} className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1 text-xs font-medium text-emerald-200 disabled:opacity-50">{channelSettingsSaving ? 'Сохраняю…' : 'Сохранить настройки'}</button>
                        <button type="button" onClick={handleTriggerChannelPost} disabled={channelTesting} className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-medium tracking-tight text-white shadow-xs transition-[background-color,transform] active:scale-[0.96] shrink-0 cursor-pointer disabled:opacity-50">
                            <RefreshCw className={`h-3.5 w-3.5 ${channelTesting ? 'animate-spin' : ''}`} />
                            <span>{channelTesting ? 'Генерация...' : 'Сгенерировать пост'}</span>
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-emerald-400/10 bg-emerald-400/[0.025] px-2 py-1.5 text-[9px] text-white/45">
                    <span>Характер: наследуется из Character Studio · CHANNEL</span><span>Публикация: расписание · медиа · проверка · история</span>{channelSettingsError && <span className="text-red-300">{channelSettingsError}</span>}
                </div>

                <div className="overflow-x-auto no-scrollbar pb-0.5">
                    <div className="grid grid-cols-4 min-w-[620px] sm:min-w-0 gap-2 items-start">
                        
                        {/* ТРЕК 1: РАСПИСАНИЕ & АВТОПИЛОТ */}
                        <div className="rounded-xl bg-black/20 border border-white/[0.04] p-2 h-[260px] flex flex-col">
                            <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                    <span className="truncate">1. Расписание</span>
                                </div>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-medium ${channelEnabled ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/40 bg-white/[0.04]'}`}>{channelEnabled ? 'Активен' : 'Пауза'}</span>
                            </div>

                            <div className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar pr-0.5">
                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white/90 text-[11px]">Автопилот постов</span>
                                        <button type="button" onClick={() => setChannelEnabled(p => !p)} className={`w-6 h-3.5 rounded-full ${channelEnabled ? 'bg-[#5e6ad2]' : 'bg-white/[0.08]'}`}><span className={`block w-2.5 h-2.5 rounded-full bg-white transition-transform ${channelEnabled ? 'translate-x-3' : 'translate-x-0.5'}`} /></button>
                                    </div>
                                    <div className="text-[9px] text-white/40">Публикация по крон-таймеру</div>
                                    <div className="text-[9px] font-mono text-[#8a95f5] truncate">{channelEnabled ? 'Статус: Активен' : 'Статус: Пауза'}</div>
                                </div>

                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-white/60">Интервал:</span>
                                        <select value={channelFrequency} onChange={(e) => setChannelFrequency(Number(e.target.value))} className="bg-[#0a0c0e] border border-white/[0.08] rounded px-1 py-0.5 text-[9px] text-white/90">
                                            <option value={6}>Каждые 6ч</option><option value={12}>Каждые 12ч</option><option value={24}>Каждые 24ч</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between pt-0.5 border-t border-white/[0.04]">
                                        <span className="text-[10px] text-white/60">Лимит:</span>
                                        <div className="flex items-center gap-0.5">
                                            {[1, 2, 3].map(cnt => (<button key={cnt} type="button" onClick={() => setChannelPostsPerDay(cnt)} className={`px-1 py-0.2 text-[8px] rounded ${channelPostsPerDay === cnt ? 'bg-[#5e6ad2] text-white' : 'text-white/40 bg-white/[0.03]'}`}>{cnt}</button>))}
                                        </div>
                                    </div>
                                    <div className="text-[9px] text-white/40 truncate">Суточный объем контента</div>
                                </div>

                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white/90 text-[11px]">Анти-дубликация</span>
                                        <button type="button" onClick={() => setAntiDuplicationWindow(p => !p)} className={`w-6 h-3.5 rounded-full ${antiDuplicationWindow ? 'bg-[#5e6ad2]' : 'bg-white/[0.08]'}`}><span className={`block w-2.5 h-2.5 rounded-full bg-white transition-transform ${antiDuplicationWindow ? 'translate-x-3' : 'translate-x-0.5'}`} /></button>
                                    </div>
                                    <div className="text-[9px] text-white/60">Окно 8 постов в истории</div>
                                    <div className="text-[9px] text-white/40 truncate">Исключение повторов тем и фото</div>
                                </div>
                            </div>
                        </div>

                        {/* ТРЕК 2: РЕДАКЦИОННЫЙ ЦИКЛ */}
                        <div className="rounded-xl bg-[#5e6ad2]/[0.03] border border-[#5e6ad2]/20 p-2 h-[260px] flex flex-col">
                            <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-[#8a95f5]"><span className="w-1.5 h-1.5 rounded-full bg-[#5e6ad2]" /><span className="truncate">2. Редакц. цикл</span></div>
                                <span className="text-[10px] font-mono text-[#8a95f5]/90 px-1.5 py-0.2 rounded bg-[#5e6ad2]/10 border border-[#5e6ad2]/20">3 шага</span>
                            </div>

                            <div className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar pr-0.5">
                                <div className="group rounded-md bg-[#13161e] border border-[#5e6ad2]/30 p-1.5 text-xs h-[68px] flex flex-col justify-between shadow-xs">
                                    <div className="flex items-center justify-between"><span className="font-semibold text-white text-[11px]">Ротация</span><span className="text-[8px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded">Эталон</span></div>
                                    <div className="text-[9px] font-mono text-white/70 space-y-0.5">
                                        <div className="flex items-center justify-between"><span>1. photo_caption · 120з</span><span>2. thought · 160з</span></div>
                                        <div className="flex items-center justify-between text-white/50"><span>3. life_obs · 240з</span></div>
                                    </div>
                                    <div className="text-[9px] text-white/40 truncate">Чередование форматов</div>
                                </div>

                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <span className="font-medium text-white/90 text-[11px] block">Источник визуала</span>
                                    <select value={channelMediaMode} onChange={(e) => setChannelMediaMode(e.target.value)} className="w-full bg-[#0a0c0e] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] text-white/90 focus:outline-none focus:border-[#5e6ad2]">
                                        <option value="db_photo">Фото Леры</option><option value="ai_photo">AI Face Match</option><option value="meme">Мемы</option><option value="none">Текст</option>
                                    </select>
                                    <div className="text-[9px] text-white/40 truncate">Пайплайн выбора медиа</div>
                                </div>

                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white/90 text-[11px]">Face Anchor</span>
                                        <span className="text-[9px] text-white/60 bg-white/[0.04] px-1 py-0.2 rounded"><Lock className="w-2.5 h-2.5 inline" /> Lock</span>
                                    </div>
                                    <div className="text-[9px] text-white/60 leading-tight">Единое лицо во всех кадрах</div>
                                    <div className="text-[9px] text-white/40 truncate">Master Face (Gemini)</div>
                                </div>
                            </div>
                        </div>

                        {/* ТРЕК 3: СУДЬЯ */}
                        <div className="rounded-xl bg-amber-950/[0.04] border border-amber-500/15 p-2 h-[260px] flex flex-col">
                            <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400/90"><Shield className="w-3.5 h-3.5 stroke-[1.5]" /><span className="truncate">3. Судья</span></div>
                                <span className="text-[10px] font-mono text-amber-400/90 px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">{channelJudgeMode}</span>
                            </div>

                            <div className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar pr-0.5">
                                <div className="group rounded-md bg-[#121418] border border-amber-500/15 p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white/90 text-[11px]">Судья канала</span>
                                        <span className="text-[9px] font-mono text-amber-400/80">{channelJudgeMode}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-black/30 rounded border border-white/[0.04]">
                                        {['ENFORCE', 'OBSERVE', 'OFF'].map(mode => (<button key={mode} type="button" onClick={() => setChannelJudgeMode(mode)} className={`py-0.5 text-[9px] rounded ${channelJudgeMode === mode ? 'bg-[#5e6ad2] text-white' : 'text-white/40'}`}>{mode === 'OFF' ? 'Выкл' : mode === 'OBSERVE' ? 'Audit' : 'Enforce'}</button>))}
                                    </div>
                                    <div className="text-[9px] text-white/40 truncate">Фильтрация перед постом</div>
                                </div>

                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <span className="font-medium text-white/90 text-[11px] block">Фильтры постов</span>
                                    <div className="space-y-0.5 text-[9px] font-mono text-white/60">
                                        <div className="flex items-center justify-between"><span>CLICHE</span><span>FACT</span></div>
                                        <div>PRIVATE_DETAIL</div>
                                    </div>
                                    <div className="text-[9px] text-white/40 truncate">Отсев клише и выдумок</div>
                                </div>

                                <div className="group rounded-md bg-[#121418] border border-white/[0.05] p-1.5 text-xs h-[68px] flex flex-col justify-between">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-white/90 text-[11px]">Реакции / Ответы</span>
                                        <button type="button" onClick={() => setChannelCommentsEnabled(p => !p)} className={`w-6 h-3.5 rounded-full ${channelCommentsEnabled ? 'bg-[#5e6ad2]' : 'bg-white/[0.08]'}`}><span className={`block w-2.5 h-2.5 rounded-full bg-white transition-transform ${channelCommentsEnabled ? 'translate-x-3' : 'translate-x-0.5'}`} /></button>
                                    </div>
                                    <div className="text-[9px] text-white/60">40% эмодзи · 15% текст</div>
                                    <div className="text-[9px] text-white/40 truncate">Авто-ответы в чате</div>
                                </div>
                            </div>
                        </div>

                        {/* ТРЕК 4: ОПУБЛИКОВАННЫЕ ПОСТЫ */}
                        <div className="rounded-xl bg-emerald-950/[0.04] border border-emerald-500/15 p-2 h-[260px] flex flex-col">
                            <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/80">
                                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                    <span className="truncate">4. Посты в канале</span>
                                </div>
                                <span className="text-[10px] font-mono text-emerald-400/80 px-1.5 py-0.2 rounded bg-emerald-500/10">
                                    {publishedPosts.length}
                                </span>
                            </div>

                            <div className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar pr-0.5">
                                {publishedPosts.map((post) => (
                                    <div 
                                        key={post.id} 
                                        className="group rounded-md bg-[#121418] border border-emerald-500/15 p-1.5 text-xs h-[68px] flex flex-col justify-between opacity-90 transition-all hover:opacity-100"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <div className="flex items-center gap-1 min-w-0">
                                                <span className="text-[9px] font-mono text-white/40 shrink-0">{post.time}</span>
                                                <span className="text-[9px] font-mono text-[#8a95f5] truncate">· {post.formatLabel}</span>
                                            </div>
                                            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded shrink-0">В канале</span>
                                        </div>
                                        <p className="text-[10px] text-white/80 leading-snug line-clamp-2">
                                            {post.text}
                                        </p>
                                        <div className="flex items-center gap-1 text-[9px] text-white/40 pt-0.5 border-t border-white/[0.03]">
                                            {post.hasPhoto ? (
                                                <>
                                                    <ImageIcon className="w-2.5 h-2.5 stroke-[1.5] text-white/50 shrink-0" />
                                                    <span className="truncate">{post.photoText || 'Фото'}</span>
                                                </>
                                            ) : (
                                                <span className="text-white/30 italic">📝 Текстовый пост</span>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {publishedPosts.length === 0 && (
                                    <div className="h-24 flex flex-col items-center justify-center text-center text-[11px] text-white/40 border border-dashed border-white/[0.04] rounded-md">
                                        <span>Пока нет постов</span>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* МОДАЛКА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ ПРОВАЙДЕРА            */}
            {/* ========================================================= */}
            {providerModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-100">
                    <div className="bg-[#0e1013] border border-white/[0.08] rounded-xl w-full max-w-md p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                            <h4 className="text-[14px] font-semibold text-white tracking-tight">
                                {editingProviderId ? 'Редактировать провайдера' : 'Добавить ИИ-провайдера'}
                            </h4>
                            <button 
                                type="button"
                                onClick={() => setProviderModalOpen(false)}
                                className="p-1 hover:bg-white/[0.06] rounded text-white/50 hover:text-white transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveProvider} className="space-y-3.5 text-[12px]">
                            <div>
                                <label className="block text-[11px] font-medium text-white/60 mb-1">
                                    Название слота
                                </label>
                                <input
                                    type="text"
                                    placeholder="например: OpenRouter Speed"
                                    value={providerForm.name}
                                    onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                                    className="w-full bg-[#121418] border border-white/[0.08] hover:border-white/[0.12] focus:border-[#5e6ad2] rounded-md px-3 py-1.5 text-white focus:outline-none transition-colors"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-white/60 mb-1">
                                    Идентификатор модели
                                </label>
                                <input
                                    type="text"
                                    placeholder="например: google/gemini-2.5-flash или gpt-4o-mini"
                                    value={providerForm.model_name}
                                    onChange={(e) => setProviderForm({ ...providerForm, model_name: e.target.value })}
                                    className="w-full bg-[#121418] border border-white/[0.08] hover:border-white/[0.12] focus:border-[#5e6ad2] rounded-md px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none transition-colors"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-white/60 mb-1">
                                    Base URL (OpenAI-compatible)
                                </label>
                                <input
                                    type="text"
                                    value={providerForm.base_url}
                                    onChange={(e) => setProviderForm({ ...providerForm, base_url: e.target.value })}
                                    className="w-full bg-[#121418] border border-white/[0.08] hover:border-white/[0.12] focus:border-[#5e6ad2] rounded-md px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none transition-colors"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-white/60 mb-1">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    placeholder="sk-..."
                                    value={providerForm.api_key}
                                    onChange={(e) => setProviderForm({ ...providerForm, api_key: e.target.value })}
                                    className="w-full bg-[#121418] border border-white/[0.08] hover:border-white/[0.12] focus:border-[#5e6ad2] rounded-md px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-4 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer text-white/80">
                                    <input
                                        type="checkbox"
                                        checked={providerForm.supports_vision}
                                        onChange={(e) => setProviderForm({ ...providerForm, supports_vision: e.target.checked })}
                                        className="rounded border-white/[0.1] bg-white/[0.05] text-[#5e6ad2] focus:ring-0 cursor-pointer"
                                    />
                                    <span className="text-[11px]">Vision (изображения)</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer text-white/80">
                                    <input
                                        type="checkbox"
                                        checked={providerForm.is_active}
                                        onChange={(e) => setProviderForm({ ...providerForm, is_active: e.target.checked })}
                                        className="rounded border-white/[0.1] bg-white/[0.05] text-[#5e6ad2] focus:ring-0 cursor-pointer"
                                    />
                                    <span className="text-[11px]">Активен</span>
                                </label>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06] mt-4">
                                <button
                                    type="button"
                                    onClick={() => setProviderModalOpen(false)}
                                    className="px-3 py-1.5 rounded-md text-[11px] text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-3.5 py-1.5 rounded-md text-[11px] font-medium bg-[#5e6ad2] hover:bg-[#6d78e3] text-white transition-colors cursor-pointer shadow-xs"
                                >
                                    {editingProviderId ? 'Сохранить изменения' : 'Добавить слот'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
