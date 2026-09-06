import React, { useState } from 'react';
import { 
    Plus, 
    Package, 
    ShieldCheck, 
    ShieldAlert
} from 'lucide-react';
import { api } from '@/lib/api.js';
import { ItemBuilderModal } from './ItemBuilderModal.jsx';

const ALL_CATEGORY_CONFIG = [
    { id: 'all', label: 'Все' },
    { id: 'clothes', label: 'Одежда' },
    { id: 'consumable', label: 'Еда' },
    { id: 'toy', label: '18+' },
    { id: 'device', label: 'Гаджеты' },
    { id: 'misc', label: 'Разное' }
];

const DEFAULT_ITEMS = [
    {
        item_id: 'trench_coat',
        item_type: 'clothes',
        is_equipped: true,
        quantity: 1,
        properties: {
            name: 'Питерский тренч',
            slot: 'outerwear',
            category: 'clothes',
            icon: '🧥',
            modifiers: [
                { stat: 'rain_resist', sign: '+', value: 100, label: 'Влагозащита' },
                { stat: 'warmth', sign: '+', value: 25, label: 'Тепло' }
            ]
        }
    },
    {
        item_id: 'oversize_tshirt',
        item_type: 'clothes',
        is_equipped: true,
        quantity: 1,
        properties: {
            name: 'Футболка Богдана',
            slot: 'top',
            category: 'clothes',
            icon: '👕',
            modifiers: [
                { stat: 'warmth', sign: '+', value: 10, label: 'Тепло' }
            ]
        }
    },
    {
        item_id: 'satisfyer',
        item_type: 'toy',
        is_equipped: false,
        quantity: 1,
        properties: {
            name: 'Satisfyer Pro 2',
            category: 'toy',
            icon: '⚡',
            actionLabel: 'Релакс',
            is_durable: true,
            modifiers: [
                { stat: 'horny', sign: '-', value: 85, label: 'Либидо' },
                { stat: 'mood', sign: '+', value: 25, label: 'Вайб' },
                { stat: 'fatigue', sign: '+', value: 15, label: 'Усталость' }
            ]
        }
    },
    {
        item_id: 'cheese_ramen',
        item_type: 'consumable',
        is_equipped: false,
        quantity: 1,
        properties: {
            name: 'Сырный Рамен',
            category: 'consumable',
            icon: '🍜',
            actionLabel: 'Съесть',
            is_durable: false,
            modifiers: [
                { stat: 'hunger', sign: '-', value: 50, label: 'Сытость' },
                { stat: 'mood', sign: '+', value: 15, label: 'Вайб' }
            ]
        }
    },
    {
        item_id: 'coffee_filter',
        item_type: 'consumable',
        is_equipped: false,
        quantity: 2,
        properties: {
            name: 'Фильтр-кофе (Слой)',
            category: 'consumable',
            icon: '☕',
            actionLabel: 'Выпить',
            is_durable: false,
            modifiers: [
                { stat: 'fatigue', sign: '-', value: 25, label: 'Бодрость' },
                { stat: 'mood', sign: '+', value: 10, label: 'Вайб' }
            ]
        }
    }
];

export function InventoryWidget({ snapshot, onDataChanged, toast }) {
    const [activeTab, setActiveTab] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [floatingDeltas, setFloatingDeltas] = useState({});

    const state = snapshot?.state || {};
    const [items, setItems] = useState(() => {
        if (Array.isArray(snapshot?.inventory) && snapshot.inventory.length > 0) {
            return snapshot.inventory;
        }
        return DEFAULT_ITEMS;
    });

    React.useEffect(() => {
        if (Array.isArray(snapshot?.inventory) && snapshot.inventory.length > 0) {
            setItems(snapshot.inventory);
        }
    }, [snapshot?.inventory]);

    const equipped = items.filter(it => it.is_equipped);
    const backpack = items.filter(it => !it.is_equipped);

    // Check rain resistance
    const hasRainResist = equipped.some(it => 
        it.properties?.rain_resist || 
        it.properties?.modifiers?.some(m => m.stat === 'rain_resist' && Number(m.value) > 0)
    );

    // Filter backpack items
    const filteredBackpack = activeTab === 'all'
        ? backpack
        : backpack.filter(it => {
            const cat = it.properties?.category || it.item_type;
            if (activeTab === 'clothes') return cat === 'clothes';
            if (activeTab === 'consumable') return cat === 'consumable' || cat === 'food' || cat === 'drink';
            if (activeTab === 'toy') return cat === 'toy' || cat === '18+';
            if (activeTab === 'device') return cat === 'device' || cat === 'gadget';
            if (activeTab === 'misc') return !['clothes', 'consumable', 'food', 'drink', 'toy', '18+', 'device', 'gadget'].includes(cat);
            return true;
        });

    const triggerDelta = (id, text) => {
        setFloatingDeltas(prev => ({ ...prev, [id]: text }));
        setTimeout(() => {
            setFloatingDeltas(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        }, 1500);
    };

    // Unequip item
    const handleUnequip = async (item) => {
        const id = item.item_id;
        setActionLoading(id);

        // Optimistic update right away
        setItems(prev => prev.map(it => it.item_id === id ? { ...it, is_equipped: false } : it));

        try {
            const res = await api('/api/admin/inventory/unequip', {
                method: 'POST',
                body: JSON.stringify({ itemId: id })
            });
            if (res?.inventory) setItems(res.inventory);
            toast?.(`Снято: ${item.properties?.name || id}`, 'info');
            onDataChanged?.();
        } catch {
            try {
                const updated = items.map(it => it.item_id === id ? { ...it, is_equipped: false } : it);
                const res2 = await api('/api/admin/radiant/mutate', {
                    method: 'POST',
                    body: JSON.stringify({ inventory: updated })
                });
                if (res2?.inventory) setItems(res2.inventory);
                toast?.(`Снято: ${item.properties?.name || id}`, 'info');
                onDataChanged?.();
            } catch (err2) {
                toast?.(err2.message, 'error');
            }
        } finally {
            setActionLoading(null);
        }
    };

    // Equip item
    const handleEquip = async (item) => {
        const id = item.item_id;
        setActionLoading(id);
        const targetSlot = item.properties?.slot || 'top';

        // Optimistic update right away
        setItems(prev => prev.map(it => {
            if (it.item_id === id) return { ...it, is_equipped: true };
            if (it.is_equipped && it.properties?.slot === targetSlot) return { ...it, is_equipped: false };
            return it;
        }));

        try {
            const res = await api('/api/admin/inventory/equip', {
                method: 'POST',
                body: JSON.stringify({ itemId: id })
            });
            if (res?.inventory) setItems(res.inventory);
            toast?.(`Надето: ${item.properties?.name || id}`, 'success');
            onDataChanged?.();
        } catch {
            try {
                const updated = items.map(it => {
                    if (it.item_id === id) return { ...it, is_equipped: true };
                    if (it.is_equipped && it.properties?.slot === targetSlot) return { ...it, is_equipped: false };
                    return it;
                });
                const res2 = await api('/api/admin/radiant/mutate', {
                    method: 'POST',
                    body: JSON.stringify({ inventory: updated })
                });
                if (res2?.inventory) setItems(res2.inventory);
                toast?.(`Надето: ${item.properties?.name || id}`, 'success');
                onDataChanged?.();
            } catch (err2) {
                toast?.(err2.message, 'error');
            }
        } finally {
            setActionLoading(null);
        }
    };

    // Use / consume consumable or toy
    const handleUseItem = async (item) => {
        const id = item.item_id;
        setActionLoading(id);
        const name = item.properties?.name || id;
        const isDurable = item.properties?.is_durable || item.item_type === 'toy';
        const mods = item.properties?.modifiers || [];

        // Compute delta summary
        const deltaStr = mods.map(m => `${m.sign || ''}${m.value} ${m.label || m.stat}`).join(', ');
        if (deltaStr) triggerDelta(id, deltaStr);

        // Optimistic update right away
        if (!isDurable) {
            setItems(prev => prev.map(it => {
                if (it.item_id === id) {
                    const nextQty = (it.quantity || 1) - 1;
                    return nextQty > 0 ? { ...it, quantity: nextQty } : null;
                }
                return it;
            }).filter(Boolean));
        }

        try {
            const endpoint = isDurable ? '/api/admin/inventory/use' : '/api/admin/inventory/consume';
            const res = await api(endpoint, {
                method: 'POST',
                body: JSON.stringify({ itemId: id })
            });
            if (res?.inventory) setItems(res.inventory);
            toast?.(`Использовано: ${name}`, 'success');
            onDataChanged?.();
        } catch {
            // Apply modifiers directly via mutate
            const curNeeds = { ...(state?.needs || {}) };
            let newMood = state?.mood || 'спокойное';

            for (const m of mods) {
                const val = Number(m.value) || 0;
                const sign = m.sign === '-' ? -1 : 1;
                const delta = val * sign;
                if (m.stat === 'mood') {
                    if (sign > 0) newMood = 'игривое';
                } else if (curNeeds[m.stat] !== undefined) {
                    curNeeds[m.stat] = Math.max(0, Math.min(100, Math.round(curNeeds[m.stat] + delta)));
                }
            }

            let updatedInv = items;
            if (!isDurable) {
                updatedInv = items.map(it => {
                    if (it.item_id === id) {
                        const nextQty = (it.quantity || 1) - 1;
                        return nextQty > 0 ? { ...it, quantity: nextQty } : null;
                    }
                    return it;
                }).filter(Boolean);
            }

            try {
                const res2 = await api('/api/admin/radiant/mutate', {
                    method: 'POST',
                    body: JSON.stringify({
                        needs: curNeeds,
                        mood: newMood,
                        inventory: updatedInv
                    })
                });
                if (res2?.inventory) setItems(res2.inventory);
                toast?.(`${name}: применено (${deltaStr || 'эффект активирован'})`, 'success');
                onDataChanged?.();
            } catch (err2) {
                toast?.(err2.message, 'error');
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleItemCreated = (newItem) => {
        setIsModalOpen(false);
        if (newItem) {
            setItems(prev => {
                const existing = prev.find(it => it.item_id === newItem.item_id);
                if (existing) {
                    return prev.map(it => it.item_id === newItem.item_id ? { ...it, quantity: (it.quantity || 1) + (newItem.quantity || 1) } : it);
                }
                return [...prev, newItem];
            });
            toast?.(`Создано: ${newItem.properties?.name || newItem.item_id}`, 'success');
        }
        onDataChanged?.();
    };

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3 sm:px-4 sm:py-3.5 relative overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_32px_rgba(0,0,0,0.36)] select-none">
            
            {/* Top Card Header */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70 shadow-inner">
                        <Package className="w-3.5 h-3.5 stroke-[1.5]" />
                    </div>
                    <h2 className="text-xs font-semibold tracking-tight text-white uppercase tracking-wider text-[11px]">
                        Экипировка и инвентарь
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    {/* Rain Protection Indicator */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono select-none bg-white/[0.03] border border-white/[0.06]">
                        {hasRainResist ? (
                            <>
                                <ShieldCheck className="w-3 h-3 text-sky-400 stroke-[1.5]" />
                                <span className="text-sky-400">Влагозащита ✓</span>
                            </>
                        ) : (
                            <>
                                <ShieldAlert className="w-3 h-3 text-amber-400 stroke-[1.5]" />
                                <span className="text-amber-400/90">Промокает ✗</span>
                            </>
                        )}
                    </div>

                    {/* Capacity Indicator */}
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-[#8a8f98] bg-white/[0.03] border border-white/[0.06]">
                        <span>Слоты:</span>
                        <span className="text-white/90 tabular-nums">{items.length} / 12</span>
                    </div>

                    {/* Add Item Action */}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-1 h-6 px-2.5 rounded-md bg-[#5e6ad2] hover:bg-[#6875e5] text-white text-[11px] font-medium transition-colors shadow-sm cursor-pointer ml-1"
                    >
                        <Plus className="w-3 h-3 stroke-[2]" />
                        <span>Добавить вещь</span>
                    </button>
                </div>
            </div>

            {/* Split Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                
                {/* LEFT: НАДЕТО ПРЯМО СЕЙЧАС (5 cols) */}
                <div className="md:col-span-5">
                    <div className="h-6 mb-1.5 px-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#8a8f98]">
                        <div className="flex items-center gap-1.5">
                            <span>Надето сейчас</span>
                            <span className="font-mono tabular-nums text-[10px] text-white/40 bg-white/[0.04] px-1.5 py-0.2 rounded">
                                {equipped.length}
                            </span>
                        </div>
                    </div>

                    {/* Fixed Height Container with scroll for equipped items */}
                    <div className="h-[160px] overflow-y-auto pr-1 flex flex-col gap-1.5 select-none">
                        {equipped.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-xs text-white/30 border border-dashed border-white/[0.06] rounded-xl p-3">
                                Ничего не надето
                            </div>
                        ) : (
                            equipped.map((item) => {
                                const id = item.item_id;
                                const name = item.properties?.name || id;
                                const icon = item.properties?.icon || '🧥';
                                const slotLabel = item.properties?.slot || 'слот';
                                const delta = floatingDeltas[id];

                                return (
                                    <div
                                        key={id}
                                        className="relative p-2 rounded-xl bg-[#12141c] border border-white/[0.06] hover:border-white/[0.14] transition-all flex items-center justify-between gap-2 group"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-sm shrink-0">
                                                {icon}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium text-white truncate group-hover:text-white/90">
                                                    {name}
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5 text-[10px] font-mono text-white/40 flex-wrap">
                                                    <span className="text-white/50">{slotLabel}</span>
                                                    {item.properties?.modifiers?.map((m, idx) => (
                                                        <span key={idx} className={`inline-flex items-center whitespace-nowrap ${m.sign === '-' ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                            · {m.sign || ''}{m.value} {m.label || m.stat}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleUnequip(item)}
                                            disabled={actionLoading === id}
                                            className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-[#8a8f98] hover:text-white border border-white/[0.06] shrink-0 transition-colors cursor-pointer"
                                        >
                                            {actionLoading === id ? '...' : 'Снять'}
                                        </button>

                                        {delta && (
                                            <div className="absolute right-12 top-1/2 -translate-y-1/2 bg-emerald-500/20 text-emerald-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 animate-in fade-in zoom-in-95">
                                                {delta}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* RIGHT: В РЮКЗАКЕ (7 cols) */}
                <div className="md:col-span-7">
                    <div className="mb-2 px-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#8a8f98]">
                        <nav className="inline-flex items-center p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06] gap-0.5 overflow-x-auto no-scrollbar">
                            {ALL_CATEGORY_CONFIG.map(cat => {
                                const count = cat.id === 'all'
                                    ? backpack.length
                                    : backpack.filter(it => {
                                        const c = it.properties?.category || it.item_type;
                                        if (cat.id === 'clothes') return c === 'clothes';
                                        if (cat.id === 'consumable') return c === 'consumable' || c === 'food' || c === 'drink';
                                        if (cat.id === 'toy') return c === 'toy' || c === '18+';
                                        if (cat.id === 'device') return c === 'device' || c === 'gadget';
                                        if (cat.id === 'misc') return !['clothes', 'consumable', 'food', 'drink', 'toy', '18+', 'device', 'gadget'].includes(c);
                                        return true;
                                    }).length;
                                const isActive = activeTab === cat.id;

                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => setActiveTab(cat.id)}
                                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96] cursor-pointer flex items-center gap-1 ${
                                            isActive
                                                ? 'bg-white/[0.08] text-white shadow-sm border border-white/[0.08]'
                                                : 'text-white/50 hover:text-white/80 border border-transparent'
                                        }`}
                                    >
                                        <span>{cat.label}</span>
                                        <span className={`font-mono text-[9px] ${isActive ? 'text-white/80' : 'text-white/30'}`}>{count}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Fixed Height Container with scroll for backpack items */}
                    <div className="h-[160px] overflow-y-auto pr-1 flex flex-col gap-1.5 select-none">
                        {filteredBackpack.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-xs text-white/30 border border-dashed border-white/[0.06] rounded-xl p-3">
                                В этой категории пусто
                            </div>
                        ) : (
                            filteredBackpack.map((item) => {
                                const id = item.item_id;
                                const name = item.properties?.name || id;
                                const icon = item.properties?.icon || '📦';
                                const qty = item.quantity > 1 ? `x${item.quantity}` : null;
                                const mods = item.properties?.modifiers || [];
                                const isClothes = item.item_type === 'clothes' || item.properties?.category === 'clothes';
                                const actionText = isClothes 
                                    ? 'Надеть' 
                                    : (item.properties?.actionLabel || (item.item_type === 'toy' ? 'Релакс' : 'Принять'));
                                const delta = floatingDeltas[id];

                                return (
                                    <div
                                        key={id}
                                        className="relative p-2 rounded-xl bg-[#12141c] border border-white/[0.06] hover:border-white/[0.14] transition-all flex items-center justify-between gap-2 group"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-sm shrink-0">
                                                {icon}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-medium text-white truncate group-hover:text-white/90">
                                                        {name}
                                                    </span>
                                                    {qty && (
                                                        <span className="font-mono text-[10px] text-white/40 bg-white/[0.04] px-1 rounded">
                                                            {qty}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5 text-[10px] font-mono text-white/40 flex-wrap">
                                                    {mods.length > 0 ? (
                                                        mods.map((m, idx) => (
                                                            <span
                                                                key={idx}
                                                                className={`inline-flex items-center whitespace-nowrap font-mono text-[10px] ${
                                                                    m.sign === '-' ? 'text-emerald-400' : 'text-sky-400'
                                                                }`}
                                                            >
                                                                {m.sign || ''}{m.value} {m.label || m.stat}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-white/30 text-[10px]">без эффектов</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => isClothes ? handleEquip(item) : handleUseItem(item)}
                                            disabled={actionLoading === id}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                                                item.item_type === 'toy'
                                                    ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                                    : isClothes
                                                    ? 'bg-white/[0.04] hover:bg-white/[0.08] text-[#8a8f98] hover:text-white border border-white/[0.06]'
                                                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            }`}
                                        >
                                            {actionLoading === id ? '...' : actionText}
                                        </button>

                                        {delta && (
                                            <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-emerald-500/20 text-emerald-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 animate-in fade-in zoom-in-95">
                                                {delta}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>

            {/* Custom Item Builder Modal */}
            <ItemBuilderModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onItemCreated={handleItemCreated}
                toast={toast}
            />
        </div>
    );
}
