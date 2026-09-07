import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api.js';
import { ItemBuilderModal } from './ItemBuilderModal.jsx';
import { FigmaListItemRow } from './FigmaListItemRow.jsx';

const FILTER_TABS = [
    { id: 'all', label: 'Все' },
    { id: 'food', label: 'Еда' },
    { id: 'clothes', label: 'Одежда' },
    { id: 'device', label: 'Девайсы' },
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
            description: 'Влагозащита 100%, Тепло +25',
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
            description: 'Тепло +10, оверсайз хлопок',
            modifiers: [
                { stat: 'warmth', sign: '+', value: 10, label: 'Тепло' }
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
            description: 'Сытость +50, Вайб +15',
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
            description: 'Бодрость +25, Вайб +10',
            modifiers: [
                { stat: 'fatigue', sign: '-', value: 25, label: 'Бодрость' },
                { stat: 'mood', sign: '+', value: 10, label: 'Вайб' }
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
            description: 'Либидо -85, Вайб +25',
            is_durable: true,
            modifiers: [
                { stat: 'horny', sign: '-', value: 85, label: 'Либидо' },
                { stat: 'mood', sign: '+', value: 25, label: 'Вайб' }
            ]
        }
    }
];

/**
 * Inventory Widget matching Figma 14:2186
 * - 2 columns (1005px total width, gap 20px, height 287px):
 *   1) Left: "Надето" (bg-[#151515], border-white/10, rounded-[18px])
 *   2) Right: "Экипировка" / Backpack (bg-[#151515], border-white/10, rounded-[18px])
 * - Frame 221 list rows with 9-dots icon, title, subtitle, action pill button
 * - Filter tabs: Все, Еда, Одежда, Девайсы, Разное
 */
export function InventoryWidget({ snapshot, onDataChanged, toast }) {
    const [activeTab, setActiveTab] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

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

    // Filter backpack items
    const filteredBackpack = activeTab === 'all'
        ? backpack
        : backpack.filter(it => {
            const cat = (it.properties?.category || it.item_type || '').toLowerCase();
            if (activeTab === 'food') return cat === 'consumable' || cat === 'food' || cat === 'drink';
            if (activeTab === 'clothes') return cat === 'clothes';
            if (activeTab === 'device') return cat === 'device' || cat === 'gadget' || cat === 'toy' || cat === '18+';
            if (activeTab === 'misc') return !['clothes', 'consumable', 'food', 'drink', 'device', 'gadget', 'toy', '18+'].includes(cat);
            return true;
        });

    // Unequip item
    const handleUnequip = async (item) => {
        const id = item.item_id;
        setActionLoading(id);

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

    // Use / consume item
    const handleUseItem = async (item) => {
        const id = item.item_id;
        setActionLoading(id);
        const name = item.properties?.name || id;
        const isDurable = item.properties?.is_durable || item.item_type === 'toy';
        const mods = item.properties?.modifiers || [];

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
                toast?.(`${name}: применено`, 'success');
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
                    return prev.map(it => it.item_id === newItem.item_id ? { ...it, quantity: (it.quantity || 1) + 1 } : it);
                }
                return [...prev, newItem];
            });
            onDataChanged?.();
        }
    };

    return (
        <section className="w-[1005px] mx-auto select-none">
            {/* 2 Columns Container matching Figma 14:2186 (1005x287px, gap 20px) */}
            <div className="grid grid-cols-2 gap-5">
                {/* 1. НАДЕТО (14:2617, 492.5x287px, r:18px, #151515, border rgba(255,255,255,0.1)) */}
                <div className="w-full h-[287px] bg-[#151515] border border-white/10 rounded-[18px] p-2 flex flex-col">
                    {/* Header: "Надето" (14:2189, 20px Medium White, pos 9,9 h:54px) */}
                    <div className="h-[54px] px-2 flex items-center">
                        <h2 className="text-[20px] font-medium text-white leading-tight">
                            Надето
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {equipped.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Ничего не надето
                            </div>
                        ) : (
                            equipped.map((item, idx) => {
                                const name = item.properties?.name || item.item_id;
                                const desc = item.properties?.description || item.properties?.slot || 'Элемент гардероба';
                                return (
                                    <FigmaListItemRow
                                        key={item.item_id || idx}
                                        title={name}
                                        subtitle={desc}
                                        actionLabel="Снять"
                                        actionVariant="blue"
                                        onAction={() => handleUnequip(item)}
                                        loading={actionLoading === item.item_id}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 2. ЭКИПИРОВКА / РЮКЗАК (14:2671, 492.5x287px, r:18px, #151515, border rgba(255,255,255,0.1)) */}
                <div className="w-full h-[287px] bg-[#151515] border border-white/10 rounded-[18px] p-2 flex flex-col">
                    {/* Header: Tabs matching Figma 14:2498 (h:54px, tabs: Все, Еда, Одежда, Девайсы, Разное) */}
                    <div className="h-[54px] px-1 flex items-center gap-1.5">
                        {FILTER_TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`h-[38px] px-3.5 text-[16px] font-normal transition-all cursor-pointer flex items-center justify-center ${
                                        isActive
                                            ? 'bg-[#1a1a1a] border border-[#353636] text-white rounded-xl shadow-sm'
                                            : 'text-white/58 hover:text-white rounded-full'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Backpack Item List */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {filteredBackpack.length === 0 ? (
                            <div 
                                onDoubleClick={() => setIsModalOpen(true)}
                                className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4 cursor-pointer hover:text-white/50 transition-colors"
                                title="Двойной клик, чтобы добавить предмет"
                            >
                                Пусто
                            </div>
                        ) : (
                            filteredBackpack.map((item, idx) => {
                                const name = item.properties?.name || item.item_id;
                                const isClothes = item.item_type === 'clothes' || item.properties?.category === 'clothes';
                                const isFood = item.item_type === 'consumable' || item.properties?.category === 'consumable';
                                
                                let label = 'Использовать';
                                let variant = 'blue';

                                if (isFood) {
                                    label = 'Сьесть';
                                    variant = 'green';
                                } else if (isClothes) {
                                    label = 'Надеть';
                                    variant = 'red';
                                }

                                const desc = item.properties?.description || (item.quantity > 1 ? `x${item.quantity} шт.` : 'В рюкзаке');

                                return (
                                    <FigmaListItemRow
                                        key={item.item_id || idx}
                                        title={name}
                                        subtitle={desc}
                                        actionLabel={label}
                                        actionVariant={variant}
                                        onAction={() => isClothes ? handleEquip(item) : handleUseItem(item)}
                                        loading={actionLoading === item.item_id}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Item Builder Modal */}
            <ItemBuilderModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onItemCreated={handleItemCreated}
                toast={toast}
            />
        </section>
    );
}

export default InventoryWidget;
