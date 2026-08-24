import React, { useState } from 'react';
import { Package, Plus, Trash2, Zap } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { itemMeta, itemEffects } from '@/lib/simulationUtils.js';

export function InventoryWidget({ items = [], onOpenFull }) {
    return (
        <Card className="inventory-widget-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={16} />
                    <strong style={{ fontSize: 13 }}>Рюкзак Леры ({items.length})</strong>
                </div>
                {onOpenFull && (
                    <Button size="xs" variant="outline" onClick={onOpenFull}>
                        Все предметы
                    </Button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {items.slice(0, 6).map((it, idx) => (
                    <span
                        key={idx}
                        style={{
                            fontSize: 11,
                            background: 'rgba(255,255,255,0.06)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)'
                        }}
                    >
                        {it.name || it.item_id || 'Предмет'} {it.quantity > 1 ? `x${it.quantity}` : ''}
                    </span>
                ))}
                {!items.length && <span style={{ fontSize: 11, color: '#64748b' }}>Рюкзак пуст.</span>}
            </div>
        </Card>
    );
}

export function InventoryPanel({
    inventory = [],
    catalog = [],
    onAddItem,
    onUseItem,
    onRemoveItem
}) {
    const [selectedItemId, setSelectedItemId] = useState('');
    const [itemQty, setItemQty] = useState(1);

    const handleAdd = () => {
        if (!selectedItemId) return;
        onAddItem?.(selectedItemId, Number(itemQty) || 1);
        setSelectedItemId('');
        setItemQty(1);
    };

    return (
        <Card>
            <CardHeader
                eyebrow="Инвентарь персонажа"
                title="Предметы и Содержимое рюкзака Леры"
                description="Вещи, влияющие на доступность действий, защиту от дождя и восстановление сил."
            />
            <div className="inline-controls" style={{ marginTop: 12 }}>
                <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                    <option value="">Выберите предмет для добавления...</option>
                    {catalog.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name} ({cat.id})</option>
                    ))}
                </select>
                <input
                    type="number"
                    min="1"
                    max="99"
                    value={itemQty}
                    onChange={e => setItemQty(e.target.value)}
                    style={{ width: 80 }}
                />
                <Button onClick={handleAdd} disabled={!selectedItemId}>
                    <Plus size={14} /> Добавить в рюкзак
                </Button>
            </div>

            <div className="managed-grid" style={{ marginTop: 14 }}>
                {inventory.map(rawItem => {
                    const item = itemMeta(rawItem, catalog);
                    const effectsText = itemEffects(item);

                    return (
                        <div className="managed-row" key={item.item_id || item.id}>
                            <Package size={16} />
                            <div>
                                <strong>{item.name} {item.quantity > 1 ? `(x${item.quantity})` : ''}</strong>
                                <span>{effectsText}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {onUseItem && (
                                    <Button size="xs" variant="outline" onClick={() => onUseItem(item)}>
                                        <Zap size={11} /> Использовать
                                    </Button>
                                )}
                                {onRemoveItem && (
                                    <ConfirmAction
                                        title="Удалить предмет?"
                                        description="Предмет исчезнет из инвентаря Леры."
                                        confirmText="Удалить"
                                        variant="danger"
                                        onConfirm={() => onRemoveItem(item.item_id || item.id)}
                                    >
                                        <Trash2 size={11} />
                                    </ConfirmAction>
                                )}
                            </div>
                        </div>
                    );
                })}
                {!inventory.length && (
                    <div className="empty-state">В инвентаре нет предметов.</div>
                )}
            </div>
        </Card>
    );
}

export default InventoryPanel;
