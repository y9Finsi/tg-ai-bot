import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { NEED_LABELS, needStatus, formatLocation } from '@/lib/simulationUtils.js';
import { api } from '@/lib/api.js';
import { WandSparkles, X } from 'lucide-react';

export const NEED_DESCRIPTIONS = {
    hunger: {
        title: 'Голод',
        scale: '0 — сыта, 100 — сильный голод',
        impact: 'При голоде выше 60% Лера жалуется, что хочет есть, зовёт в кофейню «Слой» или заказывает еду. При >85% отказывается от долгих разговоров и бежит перекусить.',
        recommendation: 'Восстанавливается приёмом пищи (завтрак, обед, ужин, круассан в кафе).'
    },
    fatigue: {
        title: 'Усталость',
        scale: '0 — полна сил, 100 — истощение',
        impact: 'При усталости выше 70% Лера зевает, пишет лениво и короткими сообщениями («кароч спать хочу»). При >90% ложится спать и ставит статус сна.',
        recommendation: 'Восстанавливается ночным сном (до 8 часов) или коротким отдыхом дома.'
    },
    boredom: {
        title: 'Скука',
        scale: '0 — увлечена, 100 — тоска и скука',
        impact: 'При скуке выше 60% Лера сама пишет первой в Telegram, шлёт кружочки, мемы и зовёт погулять по Петроградке или встретиться с Настей.',
        recommendation: 'Снижается при общении с пользователями, работе в шоуруме, прогулках и вечеринках в баре.'
    },
    hygiene: {
        title: 'Свежесть (Гигиена)',
        scale: '100 — чистая и свежая, 0 — требуется душ',
        impact: 'При показателе ниже 30% Лера прерывает дела со словами «я в душ на 20 минут, не теряй» и отправляется в ванную.',
        recommendation: 'Восстанавливается приемом душа или утренней рутиной.'
    },
    bladder: {
        title: 'Туалет',
        scale: '0 — комфортно, 100 — критическая потребность',
        impact: 'При >75% вызывает экстренное прерывание задач (Interrupt) и поход в санузел дома или в кафе.',
        recommendation: 'Сбрасывается в 0 при посещении санузла.'
    },
    horny: {
        title: 'Влечение (Либидо)',
        scale: '0 — спокойствие, 100 — романтический импульс',
        impact: 'При показателе выше 65% в диалогах усиливается кокетливый тон, флирт, намёки и готовность к романтическим темам.',
        recommendation: 'Зависит от фазы менструального цикла (пик в фазе овуляции на 12-16 день).'
    }
};

export function NeedModal({ needKey, currentValue, onClose, onSave, toast }) {
    const info = NEED_DESCRIPTIONS[needKey] || { title: needKey, scale: '', impact: '', recommendation: '' };
    const [val, setVal] = useState(currentValue ?? 50);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        setSaving(true);
        try {
            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ needs: { [needKey]: Number(val) } })
            });
            toast?.(`Потребность «${info.title}» установлена на ${val}%`);
            onSave?.();
            onClose?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="dialog-overlay"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.75)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16
            }}
        >
            <div
                className="dialog-content"
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#0f172a',
                    padding: 20,
                    borderRadius: 10,
                    maxWidth: 440,
                    width: '100%',
                    border: '1px solid var(--border)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 16, color: '#f8fafc' }}>{info.title}</strong>
                        <Badge variant="blue">{val}%</Badge>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                    {info.scale}
                </div>

                <div
                    style={{
                        background: 'rgba(59,130,246,0.08)',
                        padding: 12,
                        borderRadius: 6,
                        border: '1px solid rgba(59,130,246,0.2)',
                        fontSize: 13,
                        color: '#cbd5e1',
                        lineHeight: 1.5,
                        marginBottom: 14
                    }}
                >
                    <strong style={{ color: '#60a5fa', display: 'block', marginBottom: 4 }}>
                        💬 Как влияет на общение в Telegram:
                    </strong>
                    {info.impact}
                </div>

                {info.recommendation && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
                        💡 <strong>Как меняется:</strong> {info.recommendation}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Изменить значение:</span>
                        <span style={{ color: '#38bdf8' }}>{val}%</span>
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={val}
                        onChange={e => setVal(Number(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                </div>

                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button size="sm" variant="outline" onClick={onClose}>
                        Отмена
                    </Button>
                    <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
                        <WandSparkles size={13} /> {saving ? 'Применяем...' : 'Применить в симуляцию'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function NeedsPanel({ needs = {}, mood = 'Хорошее', location = 'petrogradka_home', money = '70 ₽', onRefresh, toast }) {
    const [selectedNeed, setSelectedNeed] = useState(null);

    return (
        <Card className="needs-panel-card needs-overview">
            <CardHeader
                eyebrow="Физиология и Состояние"
                title="Потребности Леры"
                description="Нажмите на любую шкалу, чтобы узнать влияние на чат или изменить значение."
            />
            <div className="needs-grid needs-compact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 10 }}>
                {Object.entries(NEED_LABELS).map(([key, [title, desc, shortName, Icon]]) => {
                    const value = needs[key] !== undefined ? needs[key] : (needs[key.toLowerCase()] ?? 0);
                    const status = needStatus(key, value);

                    return (
                        <div
                            key={key}
                            className="need-item-box need-compact-item"
                            onClick={() => setSelectedNeed(key)}
                            style={{
                                padding: 10,
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            title="Кликните для просмотра влияния и редактирования"
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Icon size={14} />
                                    <strong style={{ fontSize: 12 }}>{title}</strong>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{value}%</span>
                            </div>
                            <ProgressBar value={value} tone={status.tone} />
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                                <span>{status.label}</span>
                                <span style={{ color: '#38bdf8' }}>ред. ⚙️</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedNeed && (
                <NeedModal
                    needKey={selectedNeed}
                    currentValue={needs[selectedNeed] ?? 0}
                    onClose={() => setSelectedNeed(null)}
                    onSave={onRefresh}
                    toast={toast}
                />
            )}
        </Card>
    );
}

export default NeedsPanel;
