import React, { useState, useEffect } from 'react';
import { X, Sparkles, Plus, Trash2, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api.js';

export const RADIANT_STAT_GROUPS = [
    {
        group: 'Потребности (Radiant Core 0-100)',
        options: [
            { id: 'hunger', label: '🍔 Голод (hunger)', defaultDelta: -50, labelRu: 'Сытость' },
            { id: 'fatigue', label: '⚡ Усталость (fatigue)', defaultDelta: -25, labelRu: 'Бодрость' },
            { id: 'horny', label: '🔥 Либидо (horny)', defaultDelta: -85, labelRu: 'Либидо' },
            { id: 'boredom', label: '🎭 Скука (boredom)', defaultDelta: -30, labelRu: 'Интерес' },
            { id: 'hygiene', label: '🚿 Гигиена (hygiene)', defaultDelta: 40, labelRu: 'Свежесть' },
            { id: 'bladder', label: '🚽 Санузел (bladder)', defaultDelta: -50, labelRu: 'Санузел' }
        ]
    },
    {
        group: 'Эмоциональный фон',
        options: [
            { id: 'mood', label: '💖 Вайб / Настроение (mood)', defaultDelta: 15, labelRu: 'Вайб' }
        ]
    },
    {
        group: 'Экипировка & Погода',
        options: [
            { id: 'rain_resist', label: '🌧 Влагозащита (rain_resist)', defaultDelta: 100, labelRu: 'Влагозащита' },
            { id: 'warmth', label: '🧣 Теплоизоляция (warmth)', defaultDelta: 25, labelRu: 'Тепло' }
        ]
    }
];

const ALL_STAT_OPTIONS = RADIANT_STAT_GROUPS.flatMap(g => g.options);
const STAT_MAP = Object.fromEntries(ALL_STAT_OPTIONS.map(opt => [opt.id, opt]));

export function ItemBuilderModal({ isOpen, onClose, onItemCreated, toast }) {
    if (!isOpen) return null;

    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [category, setCategory] = useState('toy');
    const [slot, setSlot] = useState('none');
    const [usageMode, setUsageMode] = useState('durable'); // 'durable' | 'consumable'
    const [quantity, setQuantity] = useState(1);
    const [modifiers, setModifiers] = useState([
        { stat: 'horny', delta: -85, label: 'Либидо' },
        { stat: 'mood', delta: 25, label: 'Вайб' },
        { stat: 'fatigue', delta: 15, label: 'Усталость' }
    ]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(e);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [name, desc, category, slot, usageMode, quantity, modifiers]);

    const loadPreset = (type) => {
        if (type === 'satisfyer') {
            setName('Satisfyer Pro 2');
            setDesc('Игрушка в спальне Леры на Петроградке, глубокий релакс');
            setCategory('toy');
            setSlot('none');
            setUsageMode('durable');
            setQuantity(1);
            setModifiers([
                { stat: 'horny', delta: -85, label: 'Либидо' },
                { stat: 'mood', delta: 25, label: 'Вайб' },
                { stat: 'fatigue', delta: 15, label: 'Усталость' }
            ]);
        } else if (type === 'coffee') {
            setName('Фильтр-кофе Эфиопия');
            setDesc('Свежий завар из кофейни «Слой» на Петроградке');
            setCategory('consumable');
            setSlot('accessory');
            setUsageMode('consumable');
            setQuantity(2);
            setModifiers([
                { stat: 'fatigue', delta: -25, label: 'Бодрость' },
                { stat: 'mood', delta: 10, label: 'Вайб' },
                { stat: 'bladder', delta: 15, label: 'Санузел' }
            ]);
        } else if (type === 'ramen') {
            setName('Сырный Рамен');
            setDesc('Сытный горячий обед с тофу и кукурузой');
            setCategory('consumable');
            setSlot('none');
            setUsageMode('consumable');
            setQuantity(1);
            setModifiers([
                { stat: 'hunger', delta: -50, label: 'Сытость' },
                { stat: 'mood', delta: 15, label: 'Вайб' }
            ]);
        } else if (type === 'trench') {
            setName('Питерский оверсайз тренч');
            setDesc('Непромокаемый хлопковый тренч, спасает от ливня на Большом');
            setCategory('clothes');
            setSlot('outerwear');
            setUsageMode('durable');
            setQuantity(1);
            setModifiers([
                { stat: 'rain_resist', delta: 100, label: 'Влагозащита' },
                { stat: 'warmth', delta: 25, label: 'Тепло' }
            ]);
        }
    };

    const addModifierRow = () => {
        setModifiers(prev => [
            ...prev,
            { stat: 'hunger', delta: -50, label: 'Сытость' }
        ]);
    };

    const updateModifierStat = (index, statId) => {
        const meta = STAT_MAP[statId];
        setModifiers(prev => prev.map((m, i) => {
            if (i !== index) return m;
            return {
                ...m,
                stat: statId,
                label: meta?.labelRu || statId,
                delta: meta?.defaultDelta ?? m.delta,
                rawInput: undefined
            };
        }));
    };

    const handleDeltaChange = (index, rawStr) => {
        setModifiers(prev => prev.map((m, i) => {
            if (i !== index) return m;
            const cleaned = rawStr.trim();
            // allow typing minus or plus alone without breaking
            if (cleaned === '-' || cleaned === '+') {
                return { ...m, rawInput: cleaned };
            }
            let val = parseInt(cleaned.replace(/[^\d-]/g, ''), 10);
            if (isNaN(val)) val = 0;
            return {
                ...m,
                rawInput: rawStr,
                delta: val
            };
        }));
    };

    const removeModifier = (index) => {
        setModifiers(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!name.trim()) {
            toast?.('Укажи название предмета', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const cleanSlug = name
                .toLowerCase()
                .trim()
                .replace(/[^a-zа-я0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 32) || `custom_${Date.now()}`;

            let icon = '📦';
            let actionLabel = 'Использовать';
            if (category === 'clothes') {
                icon = '🧥';
                actionLabel = 'Надеть';
            } else if (category === 'toy') {
                icon = '⚡';
                actionLabel = 'Релакс';
            } else if (name.toLowerCase().includes('кофе') || name.toLowerCase().includes('чай') || name.toLowerCase().includes('матча')) {
                icon = '☕';
                actionLabel = 'Выпить';
            } else if (category === 'consumable') {
                icon = '🍜';
                actionLabel = 'Съесть';
            } else if (category === 'device') {
                icon = '📱';
                actionLabel = 'Включить';
            }

            // Normalise modifiers with explicit sign and value for backend compatibility
            const normalizedMods = modifiers.map(m => {
                const deltaNum = Number(m.delta) || 0;
                return {
                    stat: m.stat,
                    sign: deltaNum >= 0 ? '+' : '-',
                    value: Math.abs(deltaNum),
                    label: m.label || STAT_MAP[m.stat]?.labelRu || m.stat
                };
            });

            const properties = {
                name: name.trim(),
                description: desc.trim(),
                category,
                slot: slot !== 'none' ? slot : null,
                is_durable: usageMode === 'durable',
                is_consumable: usageMode === 'consumable',
                usage_mode: usageMode,
                icon,
                actionLabel,
                modifiers: normalizedMods,
                rain_resist: normalizedMods.some(m => m.stat === 'rain_resist' && m.sign === '+' && Number(m.value) > 0),
                warmth: Number(normalizedMods.find(m => m.stat === 'warmth' && m.sign === '+')?.value || 0),
                hunger_restore: Number(normalizedMods.find(m => m.stat === 'hunger' && m.sign === '-')?.value || 0),
                horny_restore: Number(normalizedMods.find(m => m.stat === 'horny' && m.sign === '-')?.value || 0),
                fatigue_restore: Number(normalizedMods.find(m => m.stat === 'fatigue' && m.sign === '-')?.value || 0)
            };

            await api('/api/admin/inventory/add', {
                method: 'POST',
                body: JSON.stringify({
                    itemId: cleanSlug,
                    itemType: category === 'clothes' ? 'clothes' : (category === 'toy' ? 'toy' : 'consumable'),
                    quantity: Math.max(1, parseInt(quantity, 10) || 1),
                    properties
                })
            });

            const createdItem = {
                item_id: cleanSlug,
                item_type: category === 'clothes' ? 'clothes' : (category === 'toy' ? 'toy' : 'consumable'),
                quantity: Math.max(1, parseInt(quantity, 10) || 1),
                properties,
                is_equipped: false
            };

            toast?.(`Предмет «${name}» добавлен в инвентарь!`, 'success');
            onItemCreated?.(createdItem);
            onClose();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030407]/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-[#0f1118] border border-white/[0.08] rounded-2xl w-full max-w-[540px] p-5 sm:p-6 text-[#f0f0f3] shadow-[0_24px_64px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)] relative max-h-[90vh] overflow-y-auto">
                
                {/* Header */}
                <div className="flex items-start justify-between pb-3.5 border-b border-white/[0.06] mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-white">
                                Новый предмет для Леры
                            </h2>
                            <span className="text-[10px] font-mono text-[#818cf8] bg-[#5e6ad2]/15 border border-[#5e6ad2]/25 px-1.5 py-0.5 rounded">
                                Radiant Sim
                            </span>
                        </div>
                        <p className="text-[11px] text-[#8a8f98] mt-1">
                            Лера сможет автономно использовать вещь в симуляции и реагировать на неё в Telegram
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/40 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg cursor-pointer"
                    >
                        <X className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>

                {/* Quick Presets */}
                <div className="mb-4">
                    <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#525866] mb-1.5">
                        Быстрые пресеты:
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => loadPreset('satisfyer')}
                            className="text-xs px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 active:scale-[0.96] transition-all cursor-pointer"
                        >
                            Satisfyer 18+
                        </button>
                        <button
                            type="button"
                            onClick={() => loadPreset('coffee')}
                            className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 active:scale-[0.96] transition-all cursor-pointer"
                        >
                            Фильтр-кофе
                        </button>
                        <button
                            type="button"
                            onClick={() => loadPreset('ramen')}
                            className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 active:scale-[0.96] transition-all cursor-pointer"
                        >
                            Сырный Рамен
                        </button>
                        <button
                            type="button"
                            onClick={() => loadPreset('trench')}
                            className="text-xs px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-400 hover:bg-sky-500/20 active:scale-[0.96] transition-all cursor-pointer"
                        >
                            Питерский тренч
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    
                    {/* Identity */}
                    <div className="flex flex-col gap-2.5">
                        <div>
                            <label className="block text-[11px] font-medium text-[#8a8f98] mb-1">
                                Название предмета <span className="text-rose-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Например: Satisfyer Pro 2, Матча латте, Оверсайз бомбер"
                                className="w-full bg-[#141722] border border-white/[0.09] text-white rounded-lg px-3 py-2 text-xs focus:border-[#5e6ad2] outline-none transition-colors placeholder:text-white/20"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-[#8a8f98] mb-1">
                                Контекст для Леры (LLM) <span className="text-[#525866] text-[10px]">· попадёт в системный промпт</span>
                            </label>
                            <input
                                type="text"
                                value={desc}
                                onChange={(e) => setDesc(e.target.value)}
                                placeholder="Например: Спасает от осенней хандры на Петроградке"
                                className="w-full bg-[#141722] border border-white/[0.09] text-white rounded-lg px-3 py-2 text-xs focus:border-[#5e6ad2] outline-none transition-colors placeholder:text-white/20"
                            />
                        </div>
                    </div>

                    {/* Parameters Box (Independent) */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-3">
                        <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#525866]">
                            Параметры предмета:
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <label className="block text-[11px] font-medium text-[#8a8f98] mb-1">Категория</label>
                                <div className="relative">
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full appearance-none bg-[#141722] border border-white/[0.09] text-white rounded-lg pl-3 pr-8 py-2 text-xs focus:border-[#5e6ad2] outline-none cursor-pointer"
                                    >
                                        <option value="toy">Интим & 18+ (toy)</option>
                                        <option value="consumable">Расходник / Еда / Напиток</option>
                                        <option value="clothes">Одежда / Гардероб</option>
                                        <option value="device">Девайс / Гаджет</option>
                                        <option value="misc">Разное / EDC</option>
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-[#8a8f98] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none stroke-[2]" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-[#8a8f98] mb-1">Слот экипировки</label>
                                <div className="relative">
                                    <select
                                        value={slot}
                                        onChange={(e) => setSlot(e.target.value)}
                                        className="w-full appearance-none bg-[#141722] border border-white/[0.09] text-white rounded-lg pl-3 pr-8 py-2 text-xs focus:border-[#5e6ad2] outline-none cursor-pointer"
                                    >
                                        <option value="none">Не надевается (в рюкзаке / тумбочке)</option>
                                        <option value="outerwear">Верхняя одежда (outerwear)</option>
                                        <option value="top">Верх (top)</option>
                                        <option value="bottom">Низ (bottom)</option>
                                        <option value="shoes">Обувь (shoes)</option>
                                        <option value="accessory">Аксессуар / В руке</option>
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-[#8a8f98] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none stroke-[2]" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 items-end">
                            <div>
                                <label className="block text-[11px] font-medium text-[#8a8f98] mb-1">Режим использования</label>
                                <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#141722] border border-white/[0.08] rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setUsageMode('durable')}
                                        className={`py-1.5 text-[11px] font-medium rounded-md transition-all ${usageMode === 'durable' ? 'bg-white/10 text-white shadow-sm' : 'text-[#8a8f98] hover:text-white'}`}
                                    >
                                        Многоразовое
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setUsageMode('consumable')}
                                        className={`py-1.5 text-[11px] font-medium rounded-md transition-all ${usageMode === 'consumable' ? 'bg-white/10 text-white shadow-sm' : 'text-[#8a8f98] hover:text-white'}`}
                                    >
                                        Расходник (-1)
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-[#8a8f98] mb-1">
                                    Количество <span className="text-[#525866] text-[10px]">· в наличии</span>
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="w-full bg-[#141722] border border-white/[0.09] text-white rounded-lg px-3 py-2 text-xs font-mono tabular-nums focus:border-[#5e6ad2] outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Modifiers Box (Clean 3-column row, signed input, no toggle clutter) */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#525866]">
                                Эффекты на шкалы Радианта:
                            </span>
                            <button
                                type="button"
                                onClick={addModifierRow}
                                className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#5e6ad2]/10 border border-[#5e6ad2]/25 text-[#818cf8] hover:bg-[#5e6ad2]/20 active:scale-[0.96] transition-all cursor-pointer flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3 stroke-[2]" />
                                <span>Эффект</span>
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            {modifiers.length === 0 ? (
                                <div className="text-[11px] text-white/30 italic py-2 text-center">
                                    Без эффектов на шкалы
                                </div>
                            ) : (
                                modifiers.map((mod, idx) => {
                                    const num = Number(mod.delta) || 0;
                                    const formattedVal = mod.rawInput !== undefined ? mod.rawInput : (num > 0 ? `+${num}` : `${num}`);

                                    return (
                                        <div key={idx} className="grid grid-cols-[1fr_96px_auto] gap-2 items-center">
                                            {/* Grouped Select with custom chevron */}
                                            <div className="relative min-w-0">
                                                <select
                                                    value={mod.stat}
                                                    onChange={(e) => updateModifierStat(idx, e.target.value)}
                                                    className="w-full appearance-none bg-[#141722] border border-white/[0.09] text-white rounded-lg pl-3 pr-8 py-2 text-xs focus:border-[#5e6ad2] outline-none truncate cursor-pointer"
                                                >
                                                    {RADIANT_STAT_GROUPS.map(g => (
                                                        <optgroup key={g.group} label={g.group} className="bg-[#141722] text-white/40 text-[11px]">
                                                            {g.options.map(opt => (
                                                                <option key={opt.id} value={opt.id} className="text-white text-xs">
                                                                    {opt.label}
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                                <ChevronDown className="w-3.5 h-3.5 text-[#8a8f98] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none stroke-[2]" />
                                            </div>

                                            {/* Signed Single Input (+/- directly in input) */}
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={formattedVal}
                                                    onChange={(e) => handleDeltaChange(idx, e.target.value)}
                                                    placeholder="-50 или +20"
                                                    className={`w-full bg-[#141722] border border-white/[0.09] rounded-lg px-2.5 py-2 text-xs font-mono font-semibold tabular-nums text-center focus:border-[#5e6ad2] outline-none transition-colors ${
                                                        num < 0 ? 'text-emerald-400' : (num > 0 ? 'text-amber-400' : 'text-white/70')
                                                    }`}
                                                />
                                            </div>

                                            {/* Delete Button */}
                                            <button
                                                type="button"
                                                onClick={() => removeModifier(idx)}
                                                className="text-white/30 hover:text-rose-400 transition-colors p-1.5 cursor-pointer"
                                                title="Удалить"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end pt-3.5 border-t border-white/[0.06] mt-1 gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#8a8f98] hover:text-white text-xs font-medium transition-colors cursor-pointer"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 rounded-lg bg-[#5e6ad2] hover:bg-[#6875e5] border border-[#717de4] text-white text-xs font-medium shadow-[0_1px_3px_rgba(94,106,210,0.4)] active:scale-[0.96] transition-all disabled:opacity-50 cursor-pointer"
                        >
                            {submitting ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>

                </form>

            </div>
        </div>
    );
}
