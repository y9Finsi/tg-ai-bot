import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { NEED_LABELS, needStatus, formatLocation } from '@/lib/simulationUtils.js';

export function NeedsPanel({ needs = {}, mood = 'Хорошее', location = 'petrogradka_home', money = '1 500 ₽' }) {
    const formattedMood = typeof mood === 'number'
        ? `${mood}/10 (${mood >= 7 ? 'Отличное' : mood >= 5 ? 'Хорошее' : mood >= 3 ? 'Нормальное' : 'Подавленное'})`
        : (mood || 'Хорошее');

    return (
        <Card className="needs-panel-card needs-overview">
            <CardHeader
                eyebrow="Физиология и Состояние"
                title="Потребности Леры"
                description="Текущие уровни насыщения, усталости, свежести и эмоционального тонуса."
            />
            <div className="needs-overview-meta" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13, color: '#cbd5e1' }}>
                <div><strong>Настроение:</strong> <span>{formattedMood}</span></div>
                <div><strong>Текущее местоположение:</strong> <span>{formatLocation(location)}</span></div>
                <div><strong>Деньги:</strong> <span>{money}</span></div>
            </div>
            <div className="needs-grid needs-compact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {Object.entries(NEED_LABELS).map(([key, [title, desc, shortName, Icon]]) => {
                    const value = needs[key] !== undefined ? needs[key] : (needs[key.toLowerCase()] ?? 0);
                    const status = needStatus(key, value);

                    return (
                        <div
                            key={key}
                            className="need-item-box need-compact-item"
                            style={{
                                padding: 12,
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 8,
                                border: '1px solid var(--border)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Icon size={15} />
                                    <strong style={{ fontSize: 13 }}>{title}</strong>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{status.valueText}</span>
                            </div>
                            <ProgressBar value={value} tone={status.tone} />
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                                <span>{status.label}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

export default NeedsPanel;
