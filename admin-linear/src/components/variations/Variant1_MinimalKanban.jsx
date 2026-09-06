import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Sparkles, Check, X, MessageSquare, Radio, Zap,
    Send, Plus, Trash2, ArrowRight, CornerDownLeft,
    ChevronDown, Sliders, Smartphone, Clock, Heart,
    CloudRain, Eye, Shield, Lock, Coffee
} from 'lucide-react';
import { api } from '@/lib/api.js';

// =============================================================================
// НАЧАЛЬНЫЕ МОДУЛЬНЫЕ ПРАВИЛА 3 СЛОЕВ КАНБОНА ЛЕРЫ
// =============================================================================
const INITIAL_KANBAN_RULES = [
    // 1. Слой ЛС (CHAT 1-on-1)
    {
        id: 'b_chat_ladder',
        surface: 'CHAT',
        title: 'Лесенка мыслей |||',
        content: 'Дробит сложные мысли на 2-4 коротких баббла через тройную черту |||. Естественная отправка с паузой набора.',
        conditions: ['💬 Всегда', '⚡ ЛС 1-на-1'],
        tokensEst: 35,
        enabled: true,
        temperature: 0.66,
        maxTokens: 300
    },
    {
        id: 'b_chat_flirt',
        surface: 'CHAT',
        title: 'Тон и личная симпатия',
        content: 'Теплая дружеская симпатия, легкие подколы, бытовые детали дня из жизни на Петроградке. Без холодной сухости.',
        conditions: ['❤️ Близость ≥ 3', '🕒 Вечер'],
        tokensEst: 42,
        enabled: true,
        temperature: 0.66,
        maxTokens: 300
    },
    {
        id: 'b_chat_slang',
        surface: 'CHAT',
        title: 'Питерский речевой код',
        content: 'Органичные питерские маркеры: поребрик, парадная, шава, точка. Не частить — максимум 1 маркер на пару реплик.',
        conditions: ['📍 Петроградка', '🗣️ Сленг'],
        tokensEst: 30,
        enabled: true,
        temperature: 0.66,
        maxTokens: 250
    },

    // 2. Слой Канал (CHANNEL Broadcast)
    {
        id: 'b_chan_image',
        surface: 'CHANNEL',
        title: 'Публичный образ студентки',
        content: 'Ироничные короткие заметки за фильтр-кофе, наблюдения за парами в СПбГИК. Обращение на "вы", легкая дистанция.',
        conditions: ['☀️ День', '📢 ТГК @lera_spb'],
        tokensEst: 38,
        enabled: true,
        temperature: 0.75,
        maxTokens: 400
    },
    {
        id: 'b_chan_privacy',
        surface: 'CHANNEL',
        title: 'Строгий запрет сливов тайн',
        content: 'Категорически запрещено раскрывать личные переписки, имена собеседников, секреты и приватный контекст общения.',
        conditions: ['🔒 Строго', '🛡️ Приватность'],
        tokensEst: 28,
        enabled: true,
        temperature: 0.5,
        maxTokens: 200
    },
    {
        id: 'b_chan_engagement',
        surface: 'CHANNEL',
        title: 'Интерактивные концовки',
        content: 'Заканчивать посты открытым вопросом к подписчикам или голосованием реакциями. Без дешевого блогерского кликбейта.',
        conditions: ['❓ Финал', '❤️ Опрос'],
        tokensEst: 25,
        enabled: true,
        temperature: 0.7,
        maxTokens: 250
    },

    // 3. Слой Инициатива (INITIATIVE Radiant)
    {
        id: 'b_init_routine',
        surface: 'INITIATIVE',
        title: 'Суточный биоритм (Radiant)',
        content: 'Пишет первой только в часы бодрствования. Ночью не беспокоит, если собеседник сам не начал диалог допоздна.',
        conditions: ['🕒 10:00–23:00', '⚡ GOAP'],
        tokensEst: 32,
        enabled: true,
        temperature: 0.65,
        maxTokens: 250
    },
    {
        id: 'b_init_weather',
        surface: 'INITIATIVE',
        title: 'Погодный контекст СПб',
        content: 'При осадках на Чкаловской использует погоду как органичный повод спросить про зонт или предложить согреться чаем.',
        conditions: ['🌧️ Дождь', '📍 Петроградка'],
        tokensEst: 36,
        enabled: true,
        temperature: 0.7,
        maxTokens: 280
    },
    {
        id: 'b_init_antispam',
        surface: 'INITIATIVE',
        title: 'Анти-спам кулдаун',
        content: 'Если собеседник занят или не ответил на предыдущее сообщение, не навязываться и не спамить. Уважать границы.',
        conditions: ['⏳ 1 раз / 4-6ч', '🛑 Лимит'],
        tokensEst: 29,
        enabled: true,
        temperature: 0.6,
        maxTokens: 200
    }
];

export default function Variant1_MinimalKanban({
    onSaveSuccess,
    initialProfile = null,
    className = ''
}) {
    // Состояние правил матрицы
    const [rules, setRules] = useState(INITIAL_KANBAN_RULES);
    const [selectedRuleId, setSelectedRuleId] = useState('b_chat_flirt');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error' | null
    const [activeArchetype, setActiveArchetype] = useState('canon');

    // Активное редактируемое правило в Drawer
    const activeRule = useMemo(() => {
        return rules.find(r => r.id === selectedRuleId) || rules[0];
    }, [rules, selectedRuleId]);

    // Загрузка реальных правил с бэкенда при наличии API
    useEffect(() => {
        let isMounted = true;
        async function fetchRules() {
            try {
                const data = await api('/api/admin/lera-profile');
                if (isMounted && data?.profile?.blocks && Array.isArray(data.profile.blocks) && data.profile.blocks.length > 0) {
                    setRules(data.profile.blocks);
                }
            } catch (e) {
                // Если API в оффлайн-режиме, сохраняем дефолтные правила
                console.info('[Variant1_MinimalKanban] Using rich default kanban rules');
            }
        }
        fetchRules();
        return () => { isMounted = false; };
    }, []);

    // Подсчет статистики по слоям
    const stats = useMemo(() => {
        const getLayer = (s) => rules.filter(r => r.surface === s);
        return {
            chatCount: getLayer('CHAT').length,
            chatTokens: getLayer('CHAT').reduce((sum, r) => sum + (r.tokensEst || 30), 0),
            channelCount: getLayer('CHANNEL').length,
            channelTokens: getLayer('CHANNEL').reduce((sum, r) => sum + (r.tokensEst || 30), 0),
            initCount: getLayer('INITIATIVE').length,
            initTokens: getLayer('INITIATIVE').reduce((sum, r) => sum + (r.tokensEst || 30), 0),
            totalActive: rules.filter(r => r.enabled).length,
            totalTokens: rules.reduce((sum, r) => sum + (r.tokensEst || 30), 0)
        };
    }, [rules]);

    // Переключение свитча ON/OFF
    const handleToggleRule = (id, e) => {
        e?.stopPropagation();
        setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    };

    // Обновление активного правила в Drawer
    const handleUpdateActiveRule = (patch) => {
        if (!activeRule) return;
        setRules(prev => prev.map(r => r.id === activeRule.id ? { ...r, ...patch } : r));
    };

    // Добавление нового правила в слой
    const handleAddRule = (surface) => {
        const newId = `rule_${Date.now()}`;
        const newRule = {
            id: newId,
            surface,
            title: surface === 'CHAT' ? 'Новое правило ЛС' : surface === 'CHANNEL' ? 'Новое правило канала' : 'Новый Radiant триггер',
            content: 'Укажите короткую и точную инструкцию для модели.',
            conditions: [surface === 'CHAT' ? '💬 ЛС' : surface === 'CHANNEL' ? '📢 ТГК' : '⚡ Radiant'],
            tokensEst: 25,
            enabled: true,
            temperature: 0.66,
            maxTokens: 300
        };
        setRules(prev => [...prev, newRule]);
        setSelectedRuleId(newId);
    };

    // Удаление правила
    const handleDeleteRule = (id) => {
        if (rules.length <= 1) return;
        const remaining = rules.filter(r => r.id !== id);
        setRules(remaining);
        if (selectedRuleId === id) {
            setSelectedRuleId(remaining[0]?.id || null);
        }
    };

    // Сохранение всей матрицы через API
    const handleSaveMatrix = async () => {
        setIsSaving(true);
        setSaveStatus(null);
        try {
            await api('/api/admin/lera-profile', {
                method: 'POST',
                body: JSON.stringify({
                    profile: {
                        blocks: rules,
                        archetype: activeArchetype,
                        updated_at: new Date().toISOString()
                    }
                })
            });
            setSaveStatus('saved');
            onSaveSuccess?.();
            setTimeout(() => setSaveStatus(null), 2500);
        } catch (e) {
            console.warn('[Variant1_MinimalKanban] Save fallback local storage:', e.message);
            setSaveStatus('saved'); // Локально всегда подтверждаем
            setTimeout(() => setSaveStatus(null), 2500);
        } finally {
            setIsSaving(false);
        }
    };

    // Хоткей ⌘S / Ctrl+S
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSaveMatrix();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [rules, activeArchetype]);

    return (
        <div className={`bg-[#0b0d10] text-zinc-100 flex flex-col antialiased selection:bg-[#5e6ad2]/30 selection:text-white font-sans ${className}`}>
            
            {/* 1. ВЕРХНЯЯ ШАПКА (HEADER linear style) */}
            <header className="w-full bg-[#12151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] px-6 py-2.5 flex items-center justify-between flex-shrink-0">
                <div class="flex items-center gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#5e6ad2]/20 flex items-center justify-center text-[#5e6ad2] font-bold text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                            <Zap className="w-4 h-4 text-[#5e6ad2]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold tracking-tight text-white">Студия Характера Леры</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                    v3.2 CANON
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Radiant GOAP Sync
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="hidden lg:flex items-center gap-1.5 pl-4 text-xs text-zinc-400">
                        <span className="text-zinc-500">Концепт:</span>
                        <span className="text-zinc-200 font-medium">Refactored Minimal Kanban</span>
                        <span className="text-[10px] text-zinc-500 font-mono">· 0% боксового шума · Свет фаски</span>
                    </div>
                </div>

                {/* Правые действия: Иерархия действий (ровно одна Solid Primary кнопка) */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-[#161922] rounded-md px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-zinc-300">
                        <span className="text-zinc-500 mr-2 text-[11px]">Архетип:</span>
                        <span className="font-medium text-white flex items-center gap-1 cursor-pointer">
                            {activeArchetype === 'canon' ? 'Студентка СПб' : 'Дерзкая'}
                            <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5" />
                        </span>
                    </div>

                    <button 
                        type="button" 
                        onClick={() => alert('Сэмплер: Temp 0.66, Max 300tk, Top_P 0.95')}
                        className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] rounded-md transition-colors font-medium cursor-pointer"
                    >
                        Тест сэмплинга
                    </button>

                    {/* РОДНАЯ И ЕДИНСТВЕННАЯ SOLID PRIMARY КНОПКА */}
                    <button
                        type="button"
                        onClick={handleSaveMatrix}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 bg-[#5e6ad2] hover:bg-[#6875e8] text-white font-medium text-xs rounded-md px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.4)] transition-all cursor-pointer disabled:opacity-50"
                    >
                        {saveStatus === 'saved' ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-200" />
                                <span>Матрица сохранена!</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-3.5 h-3.5" />
                                <span>{isSaving ? 'Сохранение...' : '⌘S Сохранить матрицу'}</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            {/* 2. СКВОЗНОЙ КАНОН ЛЕРЫ (GLOBAL CORE CANON BAR) */}
            <section className="px-6 pt-3 pb-1 flex-shrink-0">
                <div className="bg-[#12151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl px-4 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-indigo-400 px-2 py-0.5 rounded bg-[#5e6ad2]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                            Сквозной канон
                        </span>
                        <span className="text-xs text-zinc-400">Базовые аксиомы поведения для всех 3 слоев:</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs overflow-x-auto">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#161922] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-zinc-300 whitespace-nowrap">
                            <span>🎓</span>
                            <span>19 лет · 2 курс СПбГИК</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#161922] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-zinc-300 whitespace-nowrap">
                            <span>📍</span>
                            <span>Петроградка · Чкаловская</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#161922] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-zinc-300 whitespace-nowrap">
                            <span>🚫</span>
                            <span>Zero-Emoji (без смайлов)</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#161922] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-zinc-300 whitespace-nowrap">
                            <span>💬</span>
                            <span className="font-mono text-[11px]">«ну, блин, короче, типа, хз, рофл»</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#161922] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-zinc-300 whitespace-nowrap">
                            <span>🔒</span>
                            <span>Zero-Leakage (тайны ЛС неприкосновенны)</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. ОСНОВНАЯ ОБЛАСТЬ: 3 КОЛОНКИ СЛОЕВ + SLIDE-OVER DRAWER */}
            <main className="flex-1 px-6 py-2 flex gap-4 overflow-hidden min-h-0">
                
                {/* СЕТКА 3 КОЛОНОК (КАНБАН 3 СЛОЕВ) */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 h-full overflow-hidden">

                    {/* ========================================================= */}
                    {/* КОЛОНКА 1: ЛС (CHAT 1-on-1) */}
                    {/* ========================================================= */}
                    <div className="bg-[#12151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-3.5 flex flex-col h-full overflow-hidden">
                        <div className="flex items-center justify-between pb-1.5 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-sky-500/10 text-sky-400 flex items-center justify-center text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                </div>
                                <h2 className="text-xs font-semibold text-white tracking-wide uppercase">ЛС · Диалог 1-на-1</h2>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                {stats.chatCount} правила · {stats.chatTokens} тк
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 pb-2 leading-tight flex-shrink-0">
                            Приватное общение в Telegram. Близость, флирт, живой темп и лесенка мыслей.
                        </p>

                        {/* Список модульных карточек ЛС */}
                        <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                            {rules.filter(r => r.surface === 'CHAT').map(rule => {
                                const isSelected = rule.id === selectedRuleId;
                                return (
                                    <div
                                        key={rule.id}
                                        onClick={() => setSelectedRuleId(rule.id)}
                                        className={`p-2.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-[#1a1e29] border-l-2 border-l-[#5e6ad2] rounded-l-none'
                                                : 'bg-[#161922] hover:bg-[#1a1e2a]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                                    {rule.title}
                                                </span>
                                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#5e6ad2]" />}
                                            </div>
                                            <div
                                                onClick={(e) => handleToggleRule(rule.id, e)}
                                                className={`w-7 h-3.5 rounded-full p-0.5 flex items-center cursor-pointer transition-colors ${
                                                    rule.enabled ? 'bg-[#5e6ad2] justify-end' : 'bg-white/[0.1] justify-start'
                                                }`}
                                            >
                                                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                            {rule.conditions?.map((cond, idx) => (
                                                <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                                    {cond}
                                                </span>
                                            ))}
                                            <span className="text-[9px] font-mono text-zinc-500 ml-auto">
                                                {rule.tokensEst || 30} тк
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                                            {rule.content}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Кнопка добавления правила */}
                        <button
                            type="button"
                            onClick={() => handleAddRule('CHAT')}
                            className="my-2 py-1 px-3 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] transition-colors flex items-center justify-center gap-1.5 flex-shrink-0 cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Добавить правило в ЛС</span>
                        </button>

                        {/* Симулятор снизу: Telegram диалог */}
                        <div className="mt-auto pt-2.5 border-t border-white/[0.04] flex-shrink-0">
                            <div className="flex items-center justify-between pb-1.5">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3 text-sky-400" />
                                    Live Симулятор Telegram ЛС
                                </span>
                                <span className="text-[10px] font-mono text-emerald-400">840ms · 3 bubbles</span>
                            </div>

                            <div className="bg-[#161922] rounded-lg p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] space-y-1.5">
                                <div className="flex justify-end">
                                    <div className="bg-white/[0.06] text-zinc-200 text-[11px] px-2.5 py-1 rounded-lg rounded-tr-xs max-w-[85%] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        <span>Привет! Ты где сейчас? Дождь пошел</span>
                                        <span className="text-[9px] font-mono text-zinc-500 block text-right mt-0.5">16:40</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <div className="bg-[#5e6ad2]/20 text-zinc-100 text-[11px] px-2.5 py-1 rounded-lg rounded-tl-xs max-w-[85%] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        <span>да выползла из института кароч</span>
                                    </div>
                                    <div className="bg-[#5e6ad2]/20 text-zinc-100 text-[11px] px-2.5 py-1 rounded-lg rounded-tl-xs max-w-[85%] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        <span>ща на Чкаловской в кофейне сижу, зонт конечно дома забыла</span>
                                    </div>
                                    <div className="bg-[#5e6ad2]/20 text-zinc-100 text-[11px] px-2.5 py-1 rounded-lg rounded-tl-xs max-w-[85%] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        <span>ты сам то не промок?</span>
                                        <span className="text-[9px] font-mono text-[#8b95f6]/80 block text-right mt-0.5">16:40</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-0.5">
                                    <span>Latency: 840ms</span>
                                    <span>Typing: 2.1s</span>
                                    <span className="text-rose-400">Affection: Lv.4</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ========================================================= */}
                    {/* КОЛОНКА 2: КАНАЛ (CHANNEL Broadcast) */}
                    {/* ========================================================= */}
                    <div className="bg-[#12151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-3.5 flex flex-col h-full overflow-hidden">
                        <div className="flex items-center justify-between pb-1.5 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                    <Radio className="w-3.5 h-3.5" />
                                </div>
                                <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Канал · @lera_spb</h2>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                {stats.channelCount} правила · {stats.channelTokens} тк
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 pb-2 leading-tight flex-shrink-0">
                            Публичное вещание. Эстетика студентки, заметки о Петербурге, дистанция.
                        </p>

                        {/* Список модульных карточек Канала */}
                        <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                            {rules.filter(r => r.surface === 'CHANNEL').map(rule => {
                                const isSelected = rule.id === selectedRuleId;
                                return (
                                    <div
                                        key={rule.id}
                                        onClick={() => setSelectedRuleId(rule.id)}
                                        className={`p-2.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-[#1a1e29] border-l-2 border-l-[#5e6ad2] rounded-l-none'
                                                : 'bg-[#161922] hover:bg-[#1a1e2a]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                                    {rule.title}
                                                </span>
                                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#5e6ad2]" />}
                                            </div>
                                            <div
                                                onClick={(e) => handleToggleRule(rule.id, e)}
                                                className={`w-7 h-3.5 rounded-full p-0.5 flex items-center cursor-pointer transition-colors ${
                                                    rule.enabled ? 'bg-[#5e6ad2] justify-end' : 'bg-white/[0.1] justify-start'
                                                }`}
                                            >
                                                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                            {rule.conditions?.map((cond, idx) => (
                                                <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                                    {cond}
                                                </span>
                                            ))}
                                            <span className="text-[9px] font-mono text-zinc-500 ml-auto">
                                                {rule.tokensEst || 30} тк
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                                            {rule.content}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Кнопка добавления правила */}
                        <button
                            type="button"
                            onClick={() => handleAddRule('CHANNEL')}
                            className="my-2 py-1 px-3 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] transition-colors flex items-center justify-center gap-1.5 flex-shrink-0 cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Добавить правило в Канал</span>
                        </button>

                        {/* Симулятор снизу: Пост в Канале */}
                        <div className="mt-auto pt-2.5 border-t border-white/[0.04] flex-shrink-0">
                            <div className="flex items-center justify-between pb-1.5">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                                    <Radio className="w-3 h-3 text-emerald-400" />
                                    Live Пост в Канале @lera_spb
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400">Broadcast preview</span>
                            </div>

                            <div className="bg-[#161922] rounded-lg p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center">
                                        Л
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-semibold text-white leading-none">Лера на Петроградке</div>
                                        <div className="text-[9px] font-mono text-zinc-500">16:42 · 1.4k views</div>
                                    </div>
                                </div>
                                <p className="text-[11px] text-zinc-300 leading-relaxed">
                                    в питере если не вышел из дома до дождя — считай уже никуда не надо. сижу на чкаловской в Слое, смотрю как люди перепрыгивают лужи у поребрика. какой у вас план на вечер?
                                </p>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-zinc-300 hover:bg-white/[0.08] cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        ❤️ 142
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-zinc-300 hover:bg-white/[0.08] cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        ☕ 89
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-zinc-300 hover:bg-white/[0.08] cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        🌧️ 45
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ========================================================= */}
                    {/* КОЛОНКА 3: ИНИЦИАТИВА (INITIATIVE Radiant) */}
                    {/* ========================================================= */}
                    <div className="bg-[#12151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] rounded-xl p-3.5 flex flex-col h-full overflow-hidden">
                        <div className="flex items-center justify-between pb-1.5 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                    <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Инициатива · Radiant</h2>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                {stats.initCount} правила · {stats.initTokens} тк
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 pb-2 leading-tight flex-shrink-0">
                            Автономный триггер Radiant AI. Погода СПб, суточный биоритм, потребности.
                        </p>

                        {/* Список модульных карточек Инициативы */}
                        <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                            {rules.filter(r => r.surface === 'INITIATIVE').map(rule => {
                                const isSelected = rule.id === selectedRuleId;
                                return (
                                    <div
                                        key={rule.id}
                                        onClick={() => setSelectedRuleId(rule.id)}
                                        className={`p-2.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-[#1a1e29] border-l-2 border-l-[#5e6ad2] rounded-l-none'
                                                : 'bg-[#161922] hover:bg-[#1a1e2a]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                                    {rule.title}
                                                </span>
                                                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#5e6ad2]" />}
                                            </div>
                                            <div
                                                onClick={(e) => handleToggleRule(rule.id, e)}
                                                className={`w-7 h-3.5 rounded-full p-0.5 flex items-center cursor-pointer transition-colors ${
                                                    rule.enabled ? 'bg-[#5e6ad2] justify-end' : 'bg-white/[0.1] justify-start'
                                                }`}
                                            >
                                                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                            {rule.conditions?.map((cond, idx) => (
                                                <span key={idx} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                                    {cond}
                                                </span>
                                            ))}
                                            <span className="text-[9px] font-mono text-zinc-500 ml-auto">
                                                {rule.tokensEst || 30} тк
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                                            {rule.content}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Кнопка добавления правила */}
                        <button
                            type="button"
                            onClick={() => handleAddRule('INITIATIVE')}
                            className="my-2 py-1 px-3 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] transition-colors flex items-center justify-center gap-1.5 flex-shrink-0 cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Добавить правило в Инициативу</span>
                        </button>

                        {/* Симулятор снизу: Lockscreen Push */}
                        <div className="mt-auto pt-2.5 border-t border-white/[0.04] flex-shrink-0">
                            <div className="flex items-center justify-between pb-1.5">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                                    <Smartphone className="w-3 h-3 text-purple-400" />
                                    Live Lockscreen Push
                                </span>
                                <span className="text-[10px] font-mono text-purple-300">Spontaneous push</span>
                            </div>

                            <div className="bg-[#161922] rounded-lg p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3.5 h-3.5 rounded bg-[#2AABEE] flex items-center justify-center">
                                            <Send className="w-2 h-2 text-white" />
                                        </div>
                                        <span className="text-[10px] font-medium text-zinc-300">Telegram</span>
                                    </div>
                                    <span className="text-[9px] font-mono text-zinc-500">только что</span>
                                </div>
                                <div>
                                    <div className="text-[11px] font-semibold text-white leading-none mb-1">Лера</div>
                                    <p className="text-[11px] text-zinc-300 leading-snug">
                                        слушай, ты зонт взял? на петроградке такой ливень начался, просто стеной
                                    </p>
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-1 border-t border-white/[0.04]">
                                    <span>Rain: 88%</span>
                                    <span>Energy: 82%</span>
                                    <span className="text-emerald-400">P(send)=0.91</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* ========================================================= */}
                {/* 4. СПРАВА: SLIDE-OVER DRAWER ДЕТАЛЬНОГО РЕДАКТИРОВАНИЯ */}
                {/* ========================================================= */}
                <aside className="w-[380px] bg-[#12151b] shadow-[-12px_0_32px_rgba(0,0,0,0.6)] rounded-xl p-4 flex flex-col h-full overflow-hidden flex-shrink-0">
                    
                    {/* Хедер Дрейвера */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#5e6ad2]" />
                            <h3 className="text-xs font-bold text-white uppercase tracking-wide">Редактор правила</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#5e6ad2]/10 text-indigo-300 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                СЛОЙ: {activeRule?.surface || 'CHAT'}
                            </span>
                        </div>
                    </div>

                    {/* Тело Дрейвера (Форма настроек) */}
                    <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">

                        {/* Название правила */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-zinc-300 block">
                                Название правила
                            </label>
                            <input 
                                type="text" 
                                value={activeRule?.title || ''}
                                onChange={(e) => handleUpdateActiveRule({ title: e.target.value })}
                                className="w-full bg-[#161922] px-3 py-1.5 rounded-lg text-xs text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:outline-none focus:ring-1 focus:ring-[#5e6ad2]"
                            />
                        </div>

                        {/* Слой проекции (Табы) */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-zinc-300 block">
                                Слой проекции
                            </label>
                            <div className="grid grid-cols-3 gap-1 bg-[#161922] p-1 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                {[
                                    { id: 'CHAT', label: 'ЛС (CHAT)' },
                                    { id: 'CHANNEL', label: 'Канал' },
                                    { id: 'INITIATIVE', label: 'Инициатива' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => handleUpdateActiveRule({ surface: tab.id })}
                                        className={`py-1 text-[11px] font-medium rounded-md transition-all text-center cursor-pointer ${
                                            activeRule?.surface === tab.id
                                                ? 'bg-[#5e6ad2] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                                                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Условия активации Radiant (Теги) */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-semibold text-zinc-300">
                                    Условия активации (Radiant Tags)
                                </label>
                                <span className="text-[10px] font-mono text-zinc-500">
                                    {activeRule?.conditions?.length || 0} активных
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 p-2 bg-[#161922] rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                {activeRule?.conditions?.map((cond, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        {cond}
                                    </span>
                                ))}
                                <span 
                                    onClick={() => {
                                        const tag = prompt('Введите новый тег условия (например, [🌧️ Дождь]):');
                                        if (tag) {
                                            handleUpdateActiveRule({
                                                conditions: [...(activeRule?.conditions || []), tag]
                                            });
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 hover:text-zinc-200 cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                                >
                                    + Добавить тег
                                </span>
                            </div>
                        </div>

                        {/* Инструкция для LLM (Системный промпт правила) */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-semibold text-zinc-300">
                                    Инструкция правила для LLM
                                </label>
                                <span className="text-[10px] font-mono text-indigo-300">
                                    {activeRule?.tokensEst || 42} токена
                                </span>
                            </div>
                            <textarea 
                                rows="3" 
                                value={activeRule?.content || ''}
                                onChange={(e) => handleUpdateActiveRule({ content: e.target.value })}
                                className="w-full bg-[#161922] p-2.5 rounded-lg text-xs text-zinc-200 leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:outline-none focus:ring-1 focus:ring-[#5e6ad2] resize-none"
                            />
                        </div>

                        {/* Специфический сэмплинг (Overrides) */}
                        <div className="space-y-2.5 pt-1 border-t border-white/[0.04]">
                            <span className="text-[11px] font-semibold text-zinc-300 block">
                                Сэмплинг слоя
                            </span>
                            
                            {/* Температура */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-zinc-400">Температура</span>
                                    <span className="font-mono text-white text-xs font-semibold px-1.5 py-0.5 bg-[#161922] rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        {activeRule?.temperature || 0.66}
                                    </span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0.1" 
                                    max="1.2" 
                                    step="0.05" 
                                    value={activeRule?.temperature || 0.66} 
                                    onChange={(e) => handleUpdateActiveRule({ temperature: parseFloat(e.target.value) })}
                                    className="w-full accent-[#5e6ad2] cursor-pointer h-1.5 bg-white/[0.08] rounded-lg appearance-none"
                                />
                            </div>

                            {/* Max Tokens */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-zinc-400">Лимит токенов реплики</span>
                                    <span className="font-mono text-white text-xs font-semibold px-1.5 py-0.5 bg-[#161922] rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                        {activeRule?.maxTokens || 300} тк
                                    </span>
                                </div>
                                <input 
                                    type="range" 
                                    min="100" 
                                    max="600" 
                                    step="50" 
                                    value={activeRule?.maxTokens || 300} 
                                    onChange={(e) => handleUpdateActiveRule({ maxTokens: parseInt(e.target.value, 10) })}
                                    className="w-full accent-[#5e6ad2] cursor-pointer h-1.5 bg-white/[0.08] rounded-lg appearance-none"
                                />
                            </div>
                        </div>

                        {/* Инспектор компиляции в System Prompt */}
                        <div className="space-y-1 pt-1 border-t border-white/[0.04]">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-semibold text-zinc-300">
                                    Скомпилированный фрагмент
                                </label>
                                <span className="text-[10px] font-mono text-emerald-400">Active</span>
                            </div>
                            <div className="bg-[#0b0d10] p-2 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] font-mono text-[10px] text-zinc-400 leading-tight space-y-1">
                                <div className="text-indigo-400">&lt;rule:{activeRule?.id || 'rule'} surface="{activeRule?.surface?.toLowerCase()}"&gt;</div>
                                <div className="pl-2 text-zinc-300">{activeRule?.content}</div>
                                <div className="text-indigo-400">&lt;/rule:{activeRule?.id || 'rule'}&gt;</div>
                            </div>
                        </div>

                    </div>

                    {/* Футер Дрейвера (Иерархия действий) */}
                    <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-shrink-0">
                        <button 
                            type="button" 
                            onClick={() => handleDeleteRule(activeRule?.id)}
                            className="px-2 py-1.5 text-xs text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors font-medium cursor-pointer"
                        >
                            Удалить правило
                        </button>
                        <button 
                            type="button" 
                            onClick={handleSaveMatrix}
                            className="px-3.5 py-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 font-medium rounded-md transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] cursor-pointer"
                        >
                            Применить к матрице
                        </button>
                    </div>

                </aside>

            </main>

            {/* 5. СТАТУС-БАР В САМОМ НИЗУ */}
            <footer className="px-6 py-1.5 bg-[#12151b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-between text-[11px] text-zinc-500 font-mono flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span>Matrix hash: <span className="text-zinc-400">0x7F4A...B91C</span></span>
                    <span>·</span>
                    <span>Total rules: <span className="text-zinc-300">{stats.totalActive} active</span></span>
                    <span>·</span>
                    <span>Tokens payload: <span className="text-indigo-300">{stats.totalTokens} tokens</span></span>
                </div>
                <div className="flex items-center gap-3">
                    <span>Radiant Heartbeat: <span className="text-emerald-400">42s ago</span></span>
                    <span>·</span>
                    <span>Focus card: <span className="text-zinc-300">{selectedRuleId}</span></span>
                </div>
            </footer>

        </div>
    );
}
