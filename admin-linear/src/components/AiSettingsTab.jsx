import React, { useState, useEffect, useCallback } from 'react';
import { 
    Plus, 
    Pencil, 
    ChevronRight, 
    ChevronDown,
    Check, 
    X,
    SlidersHorizontal,
    Loader2,
    ArrowUp,
    ArrowDown,
    Trash2,
    Server,
    Zap
} from 'lucide-react';
import { api } from '@/lib/api.js';

// Surface keys mapped to Figma tab names
const SURFACES = [
    { id: 'CHAT', label: 'Личка' },
    { id: 'CHANNEL', label: 'Тг-канал' },
    { id: 'INITIATIVE', label: 'Инициатива' }
];

// Helper: Гарантирует, что канон и системные промпты всегда идут первыми в списке
export const sortPrompts = (prompts) => {
    const getPriority = (pr) => {
        // 1. Канон и биография — фундамент канона Леры, всегда абсолютный топ
        if (pr.id === 'prompt_bio' || pr.id === 'prompt_canon') return 1;
        // 2. Системный канон: Характер
        if (pr.id === 'prompt_character') return 2;
        // 3. Системный канон: Голос и речь
        if (pr.id === 'prompt_speech') return 3;
        // 4. Прочие канонические карточки (стиль А)
        if (pr.is_canonical || pr.style === 'style-a') return 4;
        // 5. Вторичные системные модули (стиль B)
        if (pr.id === 'prompt_forbidden') return 5;
        if (pr.id === 'prompt_facts') return 6;
        if (pr.id === 'prompt_flirt') return 7;
        if (pr.is_system) return 8;
        // 6. Пользовательские модульные промпты
        return 10;
    };

    return [...(prompts || [])].sort((a, b) => {
        const pa = getPriority(a);
        const pb = getPriority(b);
        if (pa !== pb) return pa - pb;
        return (a.title || '').localeCompare(b.title || '', 'ru');
    });
};

export function AiSettingsTab({ toast }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSurface, setActiveSurface] = useState('CHANNEL');

    // Left column mode: 'prompts' | 'providers'
    const [leftTab, setLeftTab] = useState('prompts');
    const [leftMenuOpen, setLeftMenuOpen] = useState(false);

    // Profile state from backend
    const [profile, setProfile] = useState(null);
    const [promptsList, setPromptsList] = useState([]);
    const [rulesList, setRulesList] = useState([]);
    const [sampling, setSampling] = useState({ temperature: 0.7, max_tokens: 230 });

    // Providers state from backend
    const [providersList, setProvidersList] = useState([]);
    const [providerModalOpen, setProviderModalOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState(null);

    // Modals
    const [promptModalOpen, setPromptModalOpen] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState(null);

    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [ruleSelectedPromptIds, setRuleSelectedPromptIds] = useState([]);
    const [ruleSelectedFallbackIds, setRuleSelectedFallbackIds] = useState([]);

    const [attachModalRuleId, setAttachModalRuleId] = useState(null);

    const [paramPopover, setParamPopover] = useState(null); // { ruleId, type: 'tokens' | 'temp' }

    // Load AI providers list from server
    const loadProviders = useCallback(async () => {
        try {
            const data = await api('/api/admin/providers');
            if (data && Array.isArray(data.providers)) {
                setProvidersList(data.providers);
            }
        } catch (err) {
            console.error('[PROVIDERS LOAD ERROR]', err);
        }
    }, []);

    // Load profile from server
    const loadProfile = useCallback(async () => {
        try {
            setLoading(true);
            const [profileData] = await Promise.all([
                api('/api/admin/lera-profile'),
                loadProviders()
            ]);
            const p = profileData.profile || {};
            setProfile(p);

            if (profileData.sampling) {
                setSampling(profileData.sampling);
            }

            // Extract prompts from profile
            const rawPrompts = [];

            // 1. Canonical prompts (Style A in Figma: #000212/37 + #8693ff/25)
            // ПЕРВЫЙ: Канон и биография (фундамент характера Леры)
            if (p.age_bio !== undefined) {
                rawPrompts.push({
                    id: 'prompt_bio',
                    title: 'Канон и биография',
                    style: 'style-a',
                    is_canonical: true,
                    is_system: true,
                    content: p.age_bio || ''
                });
            }
            // ВТОРОЙ: Характер
            if (p.character !== undefined) {
                rawPrompts.push({
                    id: 'prompt_character',
                    title: 'Характер',
                    style: 'style-a',
                    is_canonical: true,
                    is_system: true,
                    content: p.character || ''
                });
            }
            // ТРЕТИЙ: Голос и речь
            if (p.speech !== undefined) {
                rawPrompts.push({
                    id: 'prompt_speech',
                    title: 'Голос и речь',
                    style: 'style-a',
                    is_canonical: true,
                    is_system: true,
                    content: p.speech || ''
                });
            }

            // 2. Secondary/Modular prompts (Style B in Figma: gradient from #171717 to #232425/0)
            if (p.forbidden !== undefined) {
                rawPrompts.push({
                    id: 'prompt_forbidden',
                    title: 'Ограничения',
                    style: 'style-b',
                    is_system: true,
                    content: p.forbidden || ''
                });
            }
            if (p.facts !== undefined) {
                rawPrompts.push({
                    id: 'prompt_facts',
                    title: 'Правила фактов',
                    style: 'style-b',
                    is_system: true,
                    content: p.facts || ''
                });
            }
            if (p.flirt !== undefined) {
                rawPrompts.push({
                    id: 'prompt_flirt',
                    title: 'Флирт и теплота',
                    style: 'style-b',
                    is_system: true,
                    content: p.flirt || ''
                });
            }

            // Custom prompt modules from blocks
            const customModules = (p.blocks || [])
                .filter(b => b.category === 'prompt_module')
                .map((b, idx) => ({
                    id: b.id || `custom_module_${idx}`,
                    title: b.title || 'Модуль промпта',
                    style: b.style || 'style-b',
                    content: b.content || '',
                    is_canonical: b.style === 'style-a',
                    is_system: false
                }));

            setPromptsList(sortPrompts([...rawPrompts, ...customModules]));

            // Extract rules from profile.blocks
            const rawRules = (p.blocks || []).filter(b => b.category !== 'prompt_module');

            if (rawRules.length === 0) {
                // Initialize default Figma rules if empty
                const initialRules = [
                    {
                        id: 'rule_evening_channel',
                        title: 'Вечер / тг канал',
                        surface: 'CHANNEL',
                        surfaces: ['CHANNEL'],
                        mode: 'ALL',
                        enabled: true,
                        attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech'],
                        max_tokens: 230,
                        temperature: 0.7,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_chat_casual',
                        title: 'Быстрый ответ / личка',
                        surface: 'CHAT',
                        surfaces: ['CHAT'],
                        mode: 'CASUAL',
                        enabled: true,
                        attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech'],
                        max_tokens: 250,
                        temperature: 0.66,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_morning_initiative',
                        title: 'Утренняя инициатива',
                        surface: 'INITIATIVE',
                        surfaces: ['INITIATIVE'],
                        mode: 'CASUAL',
                        enabled: true,
                        attachedPromptIds: ['prompt_character', 'prompt_flirt'],
                        max_tokens: 200,
                        temperature: 0.75,
                        provider_id: null,
                        fallback_provider_ids: []
                    }
                ];
                setRulesList(initialRules);
            } else {
                setRulesList(rawRules.map(r => ({
                    id: r.id,
                    title: r.title || 'Правило',
                    surface: r.surface || 'CHAT',
                    surfaces: Array.isArray(r.surfaces) && r.surfaces.length ? r.surfaces : [r.surface || 'CHAT'],
                    mode: r.mode || (r.conditions?.find(c => c.field === 'mode')?.value) || 'ALL',
                    conditions: Array.isArray(r.conditions) ? r.conditions : [],
                    enabled: r.enabled !== false,
                    attachedPromptIds: Array.isArray(r.attachedPromptIds) ? r.attachedPromptIds : ['prompt_bio'],
                    max_tokens: r.max_tokens || 230,
                    temperature: r.temperature !== undefined ? r.temperature : 0.7,
                    provider_id: r.provider_id ? Number(r.provider_id) : null,
                    fallback_provider_ids: Array.isArray(r.fallback_provider_ids) ? r.fallback_provider_ids.map(Number).filter(Boolean) : []
                })));
            }

        } catch (err) {
            console.error('[AI SETTINGS LOAD ERROR]', err);
            if (toast) toast('Ошибка загрузки настроек ИИ: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [toast, loadProviders]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    // Save profile to server
    const saveProfileChanges = async (updatedPrompts, updatedRules) => {
        try {
            setSaving(true);
            const baseProfile = profile ? { ...profile } : {};

            // Map canonical prompts back to profile fields
            updatedPrompts.forEach(pr => {
                if (pr.id === 'prompt_character') baseProfile.character = pr.content;
                if (pr.id === 'prompt_speech') baseProfile.speech = pr.content;
                if (pr.id === 'prompt_bio') baseProfile.age_bio = pr.content;
                if (pr.id === 'prompt_forbidden') baseProfile.forbidden = pr.content;
                if (pr.id === 'prompt_facts') baseProfile.facts = pr.content;
                if (pr.id === 'prompt_flirt') baseProfile.flirt = pr.content;
            });

            // Custom prompt modules
            const customPromptBlocks = updatedPrompts
                .filter(pr => !pr.id.startsWith('prompt_'))
                .map(pr => ({
                    id: pr.id,
                    title: pr.title,
                    category: 'prompt_module',
                    style: pr.style,
                    content: pr.content
                }));

            // Rule blocks
            const ruleBlocks = updatedRules.map(r => {
                const attachedPrompts = (r.attachedPromptIds || [])
                    .map(pId => updatedPrompts.find(p => p.id === pId))
                    .filter(Boolean);

                const promptInstructions = attachedPrompts.length > 0
                    ? attachedPrompts.map(p => `[${p.title}]: ${p.content}`).join('; ')
                    : `Правило ${r.title} для ${(r.surfaces || [r.surface]).join(', ')}`;

                const mode = r.mode || 'ALL';
                const conditions = Array.isArray(r.conditions) ? [...r.conditions] : [];
                if (mode !== 'ALL' && !conditions.some(c => c.field === 'mode')) {
                    conditions.push({ field: 'mode', operator: 'equals', value: mode });
                }

                return {
                    id: r.id,
                    title: r.title,
                    surface: r.surface,
                    surfaces: r.surfaces || [r.surface],
                    mode: mode,
                    conditions: conditions,
                    enabled: r.enabled !== false,
                    category: 'rule',
                    attachedPromptIds: r.attachedPromptIds,
                    max_tokens: r.max_tokens,
                    temperature: r.temperature,
                    provider_id: r.provider_id ? Number(r.provider_id) : null,
                    fallback_provider_ids: Array.isArray(r.fallback_provider_ids) ? r.fallback_provider_ids.map(Number).filter(Boolean) : [],
                    content: promptInstructions
                };
            });

            baseProfile.blocks = [...customPromptBlocks, ...ruleBlocks];

            const res = await api('/api/admin/lera-profile', {
                method: 'POST',
                body: JSON.stringify({
                    profile: baseProfile,
                    temperature: sampling.temperature,
                    max_tokens: sampling.max_tokens
                })
            });

            if (res.profile) {
                setProfile(res.profile);
            }
            if (toast) toast('Настройки сохранены на сервере', 'success');
        } catch (err) {
            console.error('[AI SETTINGS SAVE ERROR]', err);
            if (toast) toast('Ошибка сохранения: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Provider actions: activate, move fallback priority, delete, save modal
    const handleActivateProvider = async (providerId) => {
        try {
            await api(`/api/admin/providers/${providerId}/activate`, { method: 'POST' });
            if (toast) toast('Основной провайдер переключен', 'success');
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка активации провайдера: ' + err.message, 'error');
        }
    };

    const handleMoveFallback = async (fallbackIndex, direction) => {
        const fallbacks = providersList.filter(p => !p.is_active);
        const targetIndex = direction === 'up' ? fallbackIndex - 1 : fallbackIndex + 1;
        if (targetIndex < 0 || targetIndex >= fallbacks.length) return;

        const current = fallbacks[fallbackIndex];
        const target = fallbacks[targetIndex];

        const currPrio = Number(current.priority) || (fallbackIndex + 1);
        const targetPrio = Number(target.priority) || (targetIndex + 1);
        const newCurrPrio = currPrio === targetPrio ? (direction === 'up' ? Math.max(1, targetPrio - 1) : targetPrio + 1) : targetPrio;
        const newTargetPrio = currPrio;

        try {
            await Promise.all([
                api(`/api/admin/providers/${current.id}/priority`, {
                    method: 'PATCH',
                    body: JSON.stringify({ priority: Math.max(1, newCurrPrio) })
                }),
                api(`/api/admin/providers/${target.id}/priority`, {
                    method: 'PATCH',
                    body: JSON.stringify({ priority: Math.max(1, newTargetPrio) })
                })
            ]);
            if (toast) toast('Порядок фоллбэков изменен', 'success');
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка изменения порядка фоллбэков: ' + err.message, 'error');
        }
    };

    const handleDeleteProvider = async (providerId) => {
        if (!confirm('Удалить этого провайдера?')) return;
        try {
            await api(`/api/admin/providers/${providerId}`, { method: 'DELETE' });
            if (toast) toast('Провайдер удален', 'success');
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка удаления: ' + err.message, 'error');
        }
    };

    const handleSaveProviderModal = async (providerData) => {
        try {
            if (editingProvider && editingProvider.id) {
                await api(`/api/admin/providers/${editingProvider.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(providerData)
                });
                if (toast) toast('Провайдер обновлен', 'success');
            } else {
                await api('/api/admin/providers', {
                    method: 'POST',
                    body: JSON.stringify(providerData)
                });
                if (toast) toast('Новый провайдер добавлен', 'success');
            }
            setProviderModalOpen(false);
            setEditingProvider(null);
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка сохранения провайдера: ' + err.message, 'error');
        }
    };

    // Toggle rule active status
    const handleToggleRule = (ruleId) => {
        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                return { ...r, enabled: !r.enabled };
            }
            return r;
        });
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Save prompt from modal
    const handleSavePromptModal = (promptData) => {
        let nextPrompts;
        const isCanonStyle = promptData.style === 'style-a';
        if (editingPrompt) {
            nextPrompts = promptsList.map(p => p.id === editingPrompt.id ? { 
                ...p, 
                ...promptData,
                is_canonical: p.is_canonical || isCanonStyle 
            } : p);
        } else {
            const newId = 'custom_' + Date.now();
            nextPrompts = [...promptsList, { 
                id: newId, 
                ...promptData,
                is_canonical: isCanonStyle,
                is_system: false 
            }];
        }
        const sorted = sortPrompts(nextPrompts);
        setPromptsList(sorted);
        setPromptModalOpen(false);
        setEditingPrompt(null);
        saveProfileChanges(sorted, rulesList);
    };

    // Open modal for new rule
    const openAddRuleModal = () => {
        setEditingRule(null);
        const firstCanon = promptsList.find(p => p.id === 'prompt_bio')?.id || promptsList[0]?.id || 'prompt_bio';
        setRuleSelectedPromptIds([firstCanon]);
        setRuleSelectedFallbackIds([]);
        setRuleModalOpen(true);
    };

    // Open modal for editing existing rule
    const openEditRuleModal = (rule) => {
        setEditingRule(rule);
        setRuleSelectedPromptIds(rule.attachedPromptIds || []);
        setRuleSelectedFallbackIds(Array.isArray(rule.fallback_provider_ids) ? rule.fallback_provider_ids : []);
        setRuleModalOpen(true);
    };

    // Save rule from modal
    const handleSaveRuleModal = (ruleData) => {
        let nextRules;
        if (editingRule && editingRule.id) {
            nextRules = rulesList.map(r => r.id === editingRule.id ? { ...r, ...ruleData } : r);
        } else {
            const newId = 'rule_' + Date.now();
            nextRules = [...rulesList, { id: newId, ...ruleData }];
        }
        setRulesList(nextRules);
        setRuleModalOpen(false);
        setEditingRule(null);
        saveProfileChanges(promptsList, nextRules);
    };

    // Attach/detach prompt IDs in a rule
    const handleToggleAttachPrompt = (ruleId, promptId) => {
        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                const current = r.attachedPromptIds || [];
                const updated = current.includes(promptId)
                    ? current.filter(id => id !== promptId)
                    : [...current, promptId];
                return { ...r, attachedPromptIds: updated };
            }
            return r;
        });
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Update single parameter (tokens or temperature)
    const handleUpdateParam = (ruleId, field, value) => {
        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                return { ...r, [field]: value };
            }
            return r;
        });
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Filter rules by active surface
    const activeRules = rulesList.filter(r => {
        if (Array.isArray(r.surfaces) && r.surfaces.length) {
            return r.surfaces.includes(activeSurface);
        }
        return (r.surface || 'CHAT') === activeSurface;
    });

    if (loading) {
        return (
            <div className="w-full h-96 flex items-center justify-center text-white/50 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Загрузка настроек ИИ...</span>
            </div>
        );
    }

    return (
        <main className="flex-1 w-full flex flex-col items-center animate-in fade-in duration-150">
            <div className="w-full max-w-[1042px] pl-[20px] pr-[17px] pt-[34px] pb-[60px] flex gap-[20px]">

                {/* LEFT COLUMN: ПРОМПТЫ / ПРОВАЙДЕРЫ (Figma Frame 205, width: 393px, padding: left/right 8px) */}
                <section className="w-[393px] px-2 flex-shrink-0 flex flex-col gap-[24px]">
                    {/* Header (Figma Frame 201, width: 377px) with dropdown menu */}
                    <div className="w-[377px] h-[38px] flex items-center justify-between relative">
                        {/* Dropdown Title Trigger */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setLeftMenuOpen(prev => !prev)}
                                className="flex items-center gap-1.5 text-[16px] font-medium text-white tracking-normal select-none cursor-pointer hover:text-white/80 transition-colors py-1 px-2 -ml-2 rounded-xl hover:bg-white/5"
                            >
                                <span>{leftTab === 'prompts' ? 'Промпты' : 'Провайдеры'}</span>
                                <ChevronDown className={`w-4 h-4 text-white/60 transition-transform duration-200 ${leftMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {leftMenuOpen && (
                                <div className="absolute top-[42px] left-0 z-50 w-44 bg-[#1b1b1b] border border-white/10 rounded-[18px] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLeftTab('prompts');
                                            setLeftMenuOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-[14px] rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                            leftTab === 'prompts' ? 'bg-[#292e5e] text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                    >
                                        <span>Промпты</span>
                                        {leftTab === 'prompts' && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLeftTab('providers');
                                            setLeftMenuOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-[14px] rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                            leftTab === 'providers' ? 'bg-[#292e5e] text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                    >
                                        <span>Провайдеры</span>
                                        {leftTab === 'providers' && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Action Button */}
                        {leftTab === 'prompts' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingPrompt(null);
                                    setPromptModalOpen(true);
                                }}
                                className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                            >
                                <span>Новый промпт</span>
                                <Plus className="w-4 h-4 text-white stroke-[1.5]" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingProvider(null);
                                    setProviderModalOpen(true);
                                }}
                                className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                            >
                                <span>Новый провайдер</span>
                                <Plus className="w-4 h-4 text-white stroke-[1.5]" />
                            </button>
                        )}
                    </div>

                    {/* Content: Prompts Stack or Providers Stack */}
                    {leftTab === 'prompts' ? (
                        /* Prompts Stack (Figma Frame 213 for Style A & Frame 216 for Style B) */
                        <div className="flex flex-col gap-[24px]">
                            {/* Frame 213: Style A Cards (gap: 7px) */}
                            {promptsList.filter(p => p.style === 'style-a').length > 0 && (
                                <div className="flex flex-col gap-[7px]">
                                    {promptsList.filter(p => p.style === 'style-a').map((item) => (
                                        <div
                                            key={item.id}
                                            className="w-[377px] min-h-[158px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-[#000212]/37 border border-[#8693ff]/25"
                                        >
                                            {/* Card Header (Frame 201) */}
                                            <div className="px-2 py-1 flex items-center justify-between">
                                                <span className="text-[16px] font-medium text-white select-none">
                                                    {item.title}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingPrompt(item);
                                                        setPromptModalOpen(true);
                                                    }}
                                                    title="Редактировать промпт"
                                                    className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                                >
                                                    <Pencil className="w-4 h-4 stroke-[1.5]" />
                                                </button>
                                            </div>

                                            {/* Card Content (Component 41) */}
                                            <div className="w-full h-[108px] rounded-[20px] p-3 flex flex-col justify-start overflow-hidden bg-[#1d1f2f]/39">
                                                <p className="text-[16px] font-normal leading-relaxed line-clamp-4 select-none text-white/72">
                                                    {item.content || 'Промпт не заполнен'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Frame 216: Style B Cards (gap: 14px) */}
                            {promptsList.filter(p => p.style !== 'style-a').length > 0 && (
                                <div className="flex flex-col gap-[14px]">
                                    {promptsList.filter(p => p.style !== 'style-a').map((item) => (
                                        <div
                                            key={item.id}
                                            className="w-[377px] min-h-[158px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10"
                                        >
                                            {/* Card Header (Frame 201) */}
                                            <div className="px-2 py-1 flex items-center justify-between">
                                                <span className="text-[16px] font-medium text-white select-none">
                                                    {item.title}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingPrompt(item);
                                                        setPromptModalOpen(true);
                                                    }}
                                                    title="Редактировать промпт"
                                                    className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                                >
                                                    <Pencil className="w-4 h-4 stroke-[1.5]" />
                                                </button>
                                            </div>

                                            {/* Card Content (Component 41) */}
                                            <div className="w-full h-[108px] rounded-[20px] p-3 flex flex-col justify-start overflow-hidden bg-[#272727]">
                                                <p className="text-[16px] font-normal leading-relaxed line-clamp-4 select-none text-white/45">
                                                    {item.content || 'Промпт не заполнен'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Providers Stack (Figma 377px width cards) */
                        <div className="flex flex-col gap-[20px]">
                            {/* Primary Provider */}
                            {providersList.find(p => p.is_active) ? (() => {
                                const primaryProvider = providersList.find(p => p.is_active);
                                return (
                                    <div className="flex flex-col gap-[7px]">
                                        <div className="text-[12px] uppercase tracking-wider font-semibold text-[#8693ff] px-2 flex items-center gap-1.5">
                                            <Zap className="w-3.5 h-3.5" />
                                            <span>Основной провайдер</span>
                                        </div>
                                        <div className="w-[377px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-[#000212]/37 border border-[#8693ff]/30 shadow-[0_0_20px_rgba(134,147,255,0.07)]">
                                            {/* Card Header */}
                                            <div className="px-2 py-1.5 flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className="text-[16px] font-medium text-white truncate select-none">
                                                        {primaryProvider.name}
                                                    </span>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#8693ff]/20 text-[#8693ff] border border-[#8693ff]/40 select-none flex-shrink-0">
                                                        Активен
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingProvider(primaryProvider);
                                                            setProviderModalOpen(true);
                                                        }}
                                                        title="Редактировать провайдера"
                                                        className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                                    >
                                                        <Pencil className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Card Content */}
                                            <div className="w-full rounded-[20px] p-3.5 flex flex-col gap-2 bg-[#1d1f2f]/39">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[11px] text-white/40 font-medium">Модель</span>
                                                    <span className="text-[14px] font-mono font-medium text-white/90 truncate select-none">
                                                        {primaryProvider.model_name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-[12px] text-white/50 pt-1 border-t border-white/5">
                                                    <span className="truncate max-w-[220px]" title={primaryProvider.base_url}>
                                                        {primaryProvider.base_url}
                                                    </span>
                                                    <span>{Math.round((primaryProvider.timeout_ms || 15000) / 1000)}с таймаут</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <div className="w-[377px] p-4 rounded-[20px] bg-[#1d1f2f]/30 border border-white/10 text-center text-xs text-white/50">
                                    Нет активного основного провайдера.
                                </div>
                            )}

                            {/* Fallback Providers */}
                            {(() => {
                                const fallbacks = providersList.filter(p => !p.is_active);
                                return (
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="text-[12px] uppercase tracking-wider font-semibold text-white/50 px-2 flex items-center justify-between">
                                            <span>Цепочка фоллбэков ({fallbacks.length})</span>
                                            <span className="text-[11px] text-white/30 font-normal">Приоритет: сверху вниз</span>
                                        </div>

                                        {fallbacks.length > 0 ? (
                                            <div className="flex flex-col gap-[12px]">
                                                {fallbacks.map((prov, idx) => (
                                                    <div
                                                        key={prov.id}
                                                        className="w-[377px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 hover:border-white/20"
                                                    >
                                                        {/* Card Header */}
                                                        <div className="px-2 py-1.5 flex items-center justify-between">
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="text-[15px] font-medium text-white truncate select-none">
                                                                    {prov.name}
                                                                </span>
                                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/70 select-none flex-shrink-0">
                                                                    Фоллбэк #{idx + 1}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-1">
                                                                {/* Up Reorder */}
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={() => handleMoveFallback(idx, 'up')}
                                                                    title="Поднять приоритет фоллбэка"
                                                                    className="p-1 text-white/50 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <ArrowUp className="w-3.5 h-3.5" />
                                                                </button>
                                                                {/* Down Reorder */}
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === fallbacks.length - 1}
                                                                    onClick={() => handleMoveFallback(idx, 'down')}
                                                                    title="Понизить приоритет фоллбэка"
                                                                    className="p-1 text-white/50 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <ArrowDown className="w-3.5 h-3.5" />
                                                                </button>
                                                                {/* Edit */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingProvider(prov);
                                                                        setProviderModalOpen(true);
                                                                    }}
                                                                    title="Редактировать провайдера"
                                                                    className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                                                                </button>
                                                                {/* Delete */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteProvider(prov.id)}
                                                                    title="Удалить провайдера"
                                                                    className="p-1 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Card Content */}
                                                        <div className="w-full rounded-[20px] p-3 flex flex-col gap-2 bg-[#272727]">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[11px] text-white/40 font-medium">Модель</span>
                                                                <span className="text-[13px] font-mono text-white/80 truncate select-none">
                                                                    {prov.model_name}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-[11px] text-white/45 pt-1 border-t border-white/5">
                                                                <span className="truncate max-w-[200px]" title={prov.base_url}>
                                                                    {prov.base_url}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleActivateProvider(prov.id)}
                                                                    className="px-2.5 py-1 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-[11px] font-medium text-white cursor-pointer transition-all active:scale-95 flex-shrink-0"
                                                                >
                                                                    Сделать основным
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="w-[377px] p-4 rounded-[20px] bg-[#171717]/50 border border-white/5 text-center text-xs text-white/40 italic">
                                                Нет резервных провайдеров. Нажмите «Новый провайдер», чтобы добавить фоллбэк на случай сбоев.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </section>

                {/* RIGHT COLUMN: ПРАВИЛА (Figma Frame 208, width: 592px) */}
                <section className="w-[592px] flex-shrink-0 flex flex-col gap-[24px]">
                    {/* Surface Selector Tabs (Figma Frame 212) */}
                    <div className="flex items-center gap-[10px]">
                        {SURFACES.map((surf) => {
                            const isActive = activeSurface === surf.id;
                            return (
                                <button
                                    key={surf.id}
                                    type="button"
                                    onClick={() => setActiveSurface(surf.id)}
                                    className={`h-[38px] px-4 text-[16px] font-normal flex items-center justify-center cursor-pointer transition-all ${
                                        isActive
                                            ? 'rounded-[12px] bg-[#232425] border border-[#353636] text-white shadow-inner'
                                            : 'rounded-full text-white/58 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {surf.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Rules Section (Figma Frame 206, padding left/right 8px) */}
                    <div className="px-2 flex flex-col gap-[16px]">
                        {/* Rules Header (Figma Frame 201, width: 586px) */}
                        <div className="w-[586px] h-[38px] flex items-center justify-between">
                            <h2 className="text-[16px] font-medium text-white tracking-normal select-none">
                                Правила
                            </h2>
                            <button
                                type="button"
                                onClick={openAddRuleModal}
                                className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center justify-center cursor-pointer transition-all active:scale-98 shadow-sm"
                            >
                                Добавить правило
                            </button>
                        </div>

                        {/* Rules List (Component 43 & Frame 202, width: 586px) */}
                        <div className="flex flex-col gap-[16px]">
                            {activeRules.map((rule) => {
                                const attachedPrompts = promptsList.filter(p => 
                                    (rule.attachedPromptIds || []).includes(p.id)
                                );

                                return (
                                    <div
                                        key={rule.id}
                                        className="w-[586px] min-h-[199px] rounded-[23px] bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 p-2 flex flex-col gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                                    >
                                        {/* Rule Header (Frame 201) */}
                                        <div className="px-2 py-1.5 flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <span 
                                                    onClick={() => openEditRuleModal(rule)}
                                                    className="text-[16px] font-medium text-white select-none cursor-pointer hover:text-white/80 transition-colors truncate"
                                                >
                                                    {rule.title}
                                                </span>
                                                {rule.mode === 'EROTIC' && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#ff5c8d]/20 text-[#ff7fa8] font-medium select-none flex-shrink-0">
                                                        Erotic (18+)
                                                    </span>
                                                )}
                                                {rule.mode === 'CASUAL' && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#8693ff]/20 text-[#8693ff] font-medium select-none flex-shrink-0">
                                                        Casual
                                                    </span>
                                                )}
                                            </div>

                                            {/* Toggle Icon (Circle Checkmark) */}
                                            <button
                                                type="button"
                                                onClick={() => handleToggleRule(rule.id)}
                                                title={rule.enabled ? 'Правило активно (кликните, чтобы отключить)' : 'Правило отключено (кликните, чтобы включить)'}
                                                className={`w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                                                    rule.enabled
                                                        ? 'bg-white text-black shadow-sm'
                                                        : 'border border-white/30 text-transparent hover:border-white/60'
                                                }`}
                                            >
                                                <Check className="w-4 h-4 stroke-[2.5]" />
                                            </button>
                                        </div>

                                        {/* Rule Provider & Fallback Badge Row */}
                                        <div className="px-2 pb-1 flex items-center gap-2">
                                            {rule.provider_id ? (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#8693ff]/10 border border-[#8693ff]/25 text-[12px] text-white/80">
                                                    <Server className="w-3 h-3 text-[#8693ff]" />
                                                    <span className="font-medium">
                                                        {providersList.find(p => Number(p.id) === Number(rule.provider_id))?.name || `Провайдер #${rule.provider_id}`}
                                                    </span>
                                                    {Array.isArray(rule.fallback_provider_ids) && rule.fallback_provider_ids.length > 0 && (
                                                        <span className="text-[#8693ff] font-medium text-[11px]">
                                                            (+{rule.fallback_provider_ids.length} {rule.fallback_provider_ids.length === 1 ? 'фоллбэк' : 'фоллбэка'})
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/5 text-[12px] text-white/45">
                                                    <Server className="w-3 h-3 opacity-40" />
                                                    <span>Провайдер: Глобальный</span>
                                                    {Array.isArray(rule.fallback_provider_ids) && rule.fallback_provider_ids.length > 0 && (
                                                        <span className="text-[#8693ff]/80 font-medium text-[11px]">
                                                            (+{rule.fallback_provider_ids.length} {rule.fallback_provider_ids.length === 1 ? 'фоллбэк' : 'фоллбэка'})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Rule Content Row (Frame 199) */}
                                        <div className="flex items-stretch gap-2">
                                            {/* Left Sub-card: Инструкции (Frame 193, width: 288px) */}
                                            <div className="w-[288px] min-h-[145px] bg-[#272727] rounded-[20px] p-2 flex flex-col gap-1">
                                                {/* Header (Frame 111) */}
                                                <div className="flex items-center justify-between px-1 py-1">
                                                    <span className="text-[16px] font-medium text-[#9a9a9a] select-none">
                                                        Инструкции
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAttachModalRuleId(rule.id)}
                                                        title="Выбрать прикрепленные инструкции"
                                                        className="p-1 text-[#9a9a9a] hover:text-white transition-colors cursor-pointer rounded-md hover:bg-white/5"
                                                    >
                                                        <ChevronRight className="w-5 h-5 stroke-[1.5]" />
                                                    </button>
                                                </div>

                                                {/* Attached Prompts List (Frame 112) */}
                                                <div className="flex flex-col gap-1.5 overflow-hidden">
                                                    {attachedPrompts.length > 0 ? (
                                                        attachedPrompts.slice(0, 3).map((ap) => (
                                                            <div
                                                                key={ap.id}
                                                                className="w-full bg-[#171616] border border-white/[0.07] rounded-[16px] p-2 flex flex-col gap-1"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                                        <img 
                                                                            src="/assets/icon_dots9.svg" 
                                                                            alt="" 
                                                                            className="w-3.5 h-3.5 opacity-80 flex-shrink-0" 
                                                                        />
                                                                        <span className="text-[15px] font-medium text-[#bdbdbd] truncate select-none">
                                                                            {ap.title}
                                                                        </span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingPrompt(ap);
                                                                            setPromptModalOpen(true);
                                                                        }}
                                                                        className="p-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
                                                                    >
                                                                        <Pencil className="w-3 h-3 text-white stroke-[1.5]" />
                                                                    </button>
                                                                </div>
                                                                <p className="text-[14px] text-white/50 truncate px-1 select-none">
                                                                    {ap.content || 'Пустой текст'}
                                                                </p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div 
                                                            onClick={() => setAttachModalRuleId(rule.id)}
                                                            className="text-[13px] text-white/30 italic py-6 text-center cursor-pointer hover:text-white/50 select-none"
                                                        >
                                                            Нажмите › чтобы прикрепить инструкции
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Sub-cards: Токены & Темп (Frame 200, width: 272px) */}
                                            <div className="w-[272px] flex flex-col gap-2 relative">
                                                {/* Card 1: Токены (Component 41) */}
                                                <button
                                                    type="button"
                                                    onClick={() => setParamPopover(
                                                        paramPopover?.ruleId === rule.id && paramPopover?.type === 'tokens'
                                                            ? null
                                                            : { ruleId: rule.id, type: 'tokens', value: rule.max_tokens || 230 }
                                                    )}
                                                    className="h-[68.5px] rounded-[20px] bg-[#272727] hover:bg-[#303030] text-white/50 hover:text-white/80 font-semibold text-[16px] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 select-none"
                                                >
                                                    <span>Токены {rule.max_tokens || 230}</span>
                                                    <ChevronRight className="w-4 h-4 text-white/50 stroke-[2]" />
                                                </button>

                                                {/* Card 2: Темп (Component 42) */}
                                                <button
                                                    type="button"
                                                    onClick={() => setParamPopover(
                                                        paramPopover?.ruleId === rule.id && paramPopover?.type === 'temp'
                                                            ? null
                                                            : { ruleId: rule.id, type: 'temp', value: rule.temperature !== undefined ? rule.temperature : 0.7 }
                                                    )}
                                                    className="h-[68.5px] rounded-[20px] bg-[#272727] hover:bg-[#303030] text-[#9a9a9a] hover:text-white/80 font-semibold text-[16px] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 select-none"
                                                >
                                                    <span>Темп: {rule.temperature !== undefined ? String(rule.temperature).replace('.', ',') : '0,7'}</span>
                                                    <ChevronRight className="w-4 h-4 text-white/50 stroke-[2]" />
                                                </button>

                                                {/* Parameter Popover */}
                                                {paramPopover && paramPopover.ruleId === rule.id && (
                                                    <div className="absolute top-0 right-0 z-30 w-full bg-[#1e1e1e] border border-white/10 rounded-[20px] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2">
                                                        <div className="flex items-center justify-between text-xs text-white/70 font-medium">
                                                            <span>
                                                                {paramPopover.type === 'tokens' ? 'Лимит токенов' : 'Температура креативности'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setParamPopover(null)}
                                                                className="text-white/40 hover:text-white"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>

                                                        {paramPopover.type === 'tokens' ? (
                                                            <div className="flex flex-col gap-2">
                                                                <input
                                                                    type="range"
                                                                    min="50"
                                                                    max="1200"
                                                                    step="10"
                                                                    value={paramPopover.value}
                                                                    onChange={(e) => setParamPopover({ ...paramPopover, value: Number(e.target.value) })}
                                                                    className="w-full accent-[#292e5e] cursor-pointer"
                                                                />
                                                                <div className="flex items-center justify-between">
                                                                    <input
                                                                        type="number"
                                                                        value={paramPopover.value}
                                                                        onChange={(e) => setParamPopover({ ...paramPopover, value: Number(e.target.value) })}
                                                                        className="w-20 bg-[#121212] border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleUpdateParam(rule.id, 'max_tokens', paramPopover.value);
                                                                            setParamPopover(null);
                                                                        }}
                                                                        className="px-3 py-1 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-xs font-medium cursor-pointer"
                                                                    >
                                                                        Применить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                <input
                                                                    type="range"
                                                                    min="0.1"
                                                                    max="1.5"
                                                                    step="0.05"
                                                                    value={paramPopover.value}
                                                                    onChange={(e) => setParamPopover({ ...paramPopover, value: Number(e.target.value) })}
                                                                    className="w-full accent-[#292e5e] cursor-pointer"
                                                                />
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm font-semibold text-white px-2">
                                                                        {String(paramPopover.value).replace('.', ',')}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleUpdateParam(rule.id, 'temperature', paramPopover.value);
                                                                            setParamPopover(null);
                                                                        }}
                                                                        className="px-3 py-1 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-xs font-medium cursor-pointer"
                                                                    >
                                                                        Применить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {activeRules.length === 0 && (
                                <div className="text-center py-12 text-white/40 text-sm italic">
                                    Нет правил для поверхности {SURFACES.find(s => s.id === activeSurface)?.label}. Нажмите «Добавить правило».
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* MODAL: Создание / Редактирование промпта */}
            {promptModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                {editingPrompt ? 'Редактировать промпт' : 'Новый модуль промпта'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setPromptModalOpen(false);
                                    setEditingPrompt(null);
                                }}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleSavePromptModal({
                                    title: formData.get('title'),
                                    style: formData.get('style'),
                                    content: formData.get('content')
                                });
                            }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Название промпта</label>
                                <input
                                    name="title"
                                    defaultValue={editingPrompt?.title || ''}
                                    placeholder="например, Характер, Ограничения..."
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Стиль карточки (акцент)</label>
                                <select
                                    name="style"
                                    defaultValue={editingPrompt?.style || 'style-b'}
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50 cursor-pointer"
                                >
                                    <option value="style-a">Стиль A (Синий фон #000212 — Канон/Системный)</option>
                                    <option value="style-b">Стиль B (Темный градиент #171717 — Модульный)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Текст системной инструкции</label>
                                <textarea
                                    name="content"
                                    defaultValue={editingPrompt?.content || ''}
                                    placeholder="Опишите инструкции для персонажа..."
                                    rows={6}
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl p-3.5 text-sm text-white leading-relaxed focus:outline-none focus:border-[#8693ff]/50 resize-y"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPromptModalOpen(false);
                                        setEditingPrompt(null);
                                    }}
                                    className="px-4 py-2 rounded-full hover:bg-white/5 text-sm text-white/70 hover:text-white cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Создание / Редактирование правила */}
            {ruleModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                {editingRule?.id ? 'Настройка правила' : 'Новое правило'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setRuleModalOpen(false);
                                    setEditingRule(null);
                                }}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const selectedSurfaces = SURFACES
                                    .map(s => s.id)
                                    .filter(sId => formData.get(`surf_${sId}`) === 'on');

                                handleSaveRuleModal({
                                    title: formData.get('title'),
                                    surfaces: selectedSurfaces.length ? selectedSurfaces : [activeSurface],
                                    surface: selectedSurfaces[0] || activeSurface,
                                    mode: formData.get('mode') || 'ALL',
                                    provider_id: formData.get('provider_id') ? Number(formData.get('provider_id')) : null,
                                    fallback_provider_ids: ruleSelectedFallbackIds,
                                    enabled: editingRule?.enabled !== false,
                                    attachedPromptIds: ruleSelectedPromptIds.length ? ruleSelectedPromptIds : (promptsList.length ? [promptsList[0].id] : ['prompt_bio']),
                                    max_tokens: Number(formData.get('max_tokens')) || 230,
                                    temperature: Number(formData.get('temperature')) || 0.7
                                });
                            }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Название правила</label>
                                <input
                                    name="title"
                                    defaultValue={editingRule?.title || ''}
                                    placeholder="например, Вечер / тг канал"
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            {/* Выбор инструкций/промптов */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium flex items-center justify-between">
                                    <span>Прикрепленные промпты (инструкции)</span>
                                    <span className="text-[11px] text-white/40">{ruleSelectedPromptIds.length} выбрано</span>
                                </label>
                                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                                    {promptsList.map((pr) => {
                                        const isChecked = ruleSelectedPromptIds.includes(pr.id);
                                        return (
                                            <div
                                                key={pr.id}
                                                onClick={() => {
                                                    setRuleSelectedPromptIds(prev =>
                                                        prev.includes(pr.id)
                                                            ? prev.filter(id => id !== pr.id)
                                                            : [...prev, pr.id]
                                                    );
                                                }}
                                                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                    isChecked
                                                        ? 'bg-[#1e233d] border-[#8693ff]/40 text-white'
                                                        : 'bg-[#202020] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-white">{pr.title}</span>
                                                        {(pr.is_canonical || pr.style === 'style-a') && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-normal select-none">
                                                                Канон
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[11px] text-white/40 truncate">{pr.content}</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                                                        isChecked ? 'bg-white text-black' : 'border border-white/30 text-transparent'
                                                    }`}
                                                >
                                                    <Check className="w-3 h-3 stroke-[2.5]" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Поверхности применения</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {SURFACES.map((s) => {
                                        const isChecked = (editingRule?.surfaces || [activeSurface]).includes(s.id);
                                        return (
                                            <label
                                                key={s.id}
                                                className="flex items-center gap-2 p-2.5 rounded-xl bg-[#202020] border border-white/10 cursor-pointer hover:bg-white/5"
                                            >
                                                <input
                                                    type="checkbox"
                                                    name={`surf_${s.id}`}
                                                    defaultChecked={isChecked}
                                                    className="rounded accent-[#292e5e]"
                                                />
                                                <span className="text-xs text-white/90">{s.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Режим диалога (Casual / Erotic) */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Режим диалога (условие правила)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'ALL', label: 'Все режимы' },
                                        { id: 'CASUAL', label: 'Casual' },
                                        { id: 'EROTIC', label: 'Erotic (18+)' }
                                    ].map((m) => {
                                        const isSelected = (editingRule?.mode || 'ALL') === m.id;
                                        return (
                                            <label
                                                key={m.id}
                                                className="flex items-center gap-2 p-2.5 rounded-xl bg-[#202020] border border-white/10 cursor-pointer hover:bg-white/5 has-[:checked]:border-[#8693ff]/50 has-[:checked]:bg-[#1e233d]"
                                            >
                                                <input
                                                    type="radio"
                                                    name="mode"
                                                    value={m.id}
                                                    defaultChecked={isSelected}
                                                    className="accent-[#8693ff]"
                                                />
                                                <span className="text-xs text-white/90">{m.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Выбор основного провайдера для правила */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium flex items-center justify-between">
                                    <span>Основной AI провайдер (override)</span>
                                    <span className="text-[11px] text-white/40">Опционально</span>
                                </label>
                                <select
                                    name="provider_id"
                                    defaultValue={editingRule?.provider_id || ''}
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50 cursor-pointer"
                                >
                                    <option value="">По умолчанию (Глобальный активный)</option>
                                    {providersList.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} — {p.model_name} {p.is_active ? '(Глобальный основной)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Цепочка фоллбэков для правила */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium flex items-center justify-between">
                                    <span>Цепочка фоллбэков правила (резервные AI)</span>
                                    <span className="text-[11px] text-white/40">{ruleSelectedFallbackIds.length} выбрано</span>
                                </label>
                                {providersList.length > 0 ? (
                                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                                        {providersList.map((p) => {
                                            const isChecked = ruleSelectedFallbackIds.includes(Number(p.id));
                                            const orderIndex = ruleSelectedFallbackIds.indexOf(Number(p.id));
                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setRuleSelectedFallbackIds(prev =>
                                                            prev.includes(Number(p.id))
                                                                ? prev.filter(id => id !== Number(p.id))
                                                                : [...prev, Number(p.id)]
                                                        );
                                                    }}
                                                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                        isChecked
                                                            ? 'bg-[#1e233d] border-[#8693ff]/40 text-white'
                                                            : 'bg-[#202020] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                                                        <span className="text-xs font-medium text-white truncate">{p.name}</span>
                                                        <span className="text-[11px] font-mono text-white/40 truncate">({p.model_name})</span>
                                                        {isChecked && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-medium flex-shrink-0">
                                                                Шаг #{orderIndex + 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                                                            isChecked ? 'bg-white text-black' : 'border border-white/30 text-transparent'
                                                        }`}
                                                    >
                                                        <Check className="w-3 h-3 stroke-[2.5]" />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span className="text-xs text-white/40 italic">Нет настроенных провайдеров</span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Лимит токенов</label>
                                    <input
                                        type="number"
                                        name="max_tokens"
                                        defaultValue={editingRule?.max_tokens || 230}
                                        min="50"
                                        max="1500"
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Температура</label>
                                    <input
                                        type="number"
                                        name="temperature"
                                        step="0.05"
                                        min="0.1"
                                        max="1.5"
                                        defaultValue={editingRule?.temperature !== undefined ? editingRule.temperature : 0.7}
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRuleModalOpen(false);
                                        setEditingRule(null);
                                    }}
                                    className="px-4 py-2 rounded-full hover:bg-white/5 text-sm text-white/70 hover:text-white cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? 'Сохранение...' : 'Сохранить правило'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Добавление / Редактирование AI провайдера */}
            {providerModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                {editingProvider?.id ? 'Настройка провайдера' : 'Новый AI провайдер'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setProviderModalOpen(false);
                                    setEditingProvider(null);
                                }}
                                className="text-white/40 hover:text-white cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleSaveProviderModal({
                                    name: formData.get('name'),
                                    base_url: formData.get('base_url'),
                                    api_key: formData.get('api_key'),
                                    model_name: formData.get('model_name'),
                                    timeout_ms: Number(formData.get('timeout_ms')) || 15000
                                });
                            }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Название провайдера</label>
                                <input
                                    name="name"
                                    defaultValue={editingProvider?.name || ''}
                                    placeholder="например, OpenRouter (Claude), Together (DeepSeek)..."
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Base URL (OpenAI-совместимый endpoint)</label>
                                <input
                                    name="base_url"
                                    defaultValue={editingProvider?.base_url || 'https://openrouter.ai/api/v1'}
                                    placeholder="https://openrouter.ai/api/v1"
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">API Ключ</label>
                                <input
                                    type="password"
                                    name="api_key"
                                    defaultValue={editingProvider?.api_key || ''}
                                    placeholder={editingProvider ? 'Оставьте пустым, чтобы не менять' : 'sk-or-v1-...'}
                                    required={!editingProvider}
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Идентификатор модели</label>
                                    <input
                                        name="model_name"
                                        defaultValue={editingProvider?.model_name || ''}
                                        placeholder="anthropic/claude-3.5-sonnet"
                                        required
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Таймаут (мс)</label>
                                    <input
                                        type="number"
                                        name="timeout_ms"
                                        defaultValue={editingProvider?.timeout_ms || 15000}
                                        step="1000"
                                        min="2000"
                                        max="60000"
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProviderModalOpen(false);
                                        setEditingProvider(null);
                                    }}
                                    className="px-4 py-2 rounded-full hover:bg-white/5 text-sm text-white/70 hover:text-white cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all active:scale-95"
                                >
                                    {editingProvider ? 'Сохранить изменения' : 'Добавить провайдера'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Выбор прикрепленных инструкций (Инструкции >) */}
            {attachModalRuleId && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                Прикрепить инструкции
                            </h3>
                            <button
                                type="button"
                                onClick={() => setAttachModalRuleId(null)}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-white/60">
                            Выберите модули промптов, которые должны войти в состав этого правила:
                        </p>

                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                            {promptsList.map((pr) => {
                                const currentRule = rulesList.find(r => r.id === attachModalRuleId);
                                const isAttached = (currentRule?.attachedPromptIds || []).includes(pr.id);

                                return (
                                    <div
                                        key={pr.id}
                                        onClick={() => handleToggleAttachPrompt(attachModalRuleId, pr.id)}
                                        className={`p-3 rounded-[16px] border flex items-center justify-between cursor-pointer transition-all ${
                                            isAttached
                                                ? 'bg-[#1e233d] border-[#8693ff]/40 text-white'
                                                : 'bg-[#1c1c1c] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{pr.title}</span>
                                                {(pr.is_canonical || pr.style === 'style-a') && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-normal select-none">
                                                        Канон
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-white/40 truncate">{pr.content}</span>
                                        </div>

                                        <div
                                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                                isAttached
                                                    ? 'bg-white text-black'
                                                    : 'border border-white/30 text-transparent'
                                            }`}
                                        >
                                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setAttachModalRuleId(null)}
                                className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer"
                            >
                                Готово
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
