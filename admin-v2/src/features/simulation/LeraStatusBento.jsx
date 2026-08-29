import React, { useState } from 'react';
import { Sparkles, MapPin, CloudRain, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ProgressBar } from '@/components/ui/ProgressBar.jsx';
import { taskName, formatLocation, getCycleMeta, NEED_LABELS, needStatus } from '@/lib/simulationUtils.js';
import { NeedModal } from './NeedsPanel.jsx';

export function LeraStatusBento({
    snapshot,
    activeTask,
    currentLocation = 'petrogradka_home',
    weather,
    cycleDay = 25,
    moneyRubles = 70,
    moneyStars = 150,
    recentFacts = [],
    onRefresh,
    toast
}) {
    const [selectedNeed, setSelectedNeed] = useState(null);

    const rawTask = activeTask?.task_type || activeTask?.taskType || activeTask?.type;
    const isResting = !rawTask || rawTask === 'IDLE_HOME_REST';
    const activityName = isResting ? 'Отдых дома' : taskName(rawTask);
    const locName = formatLocation(currentLocation);
    const cycle = getCycleMeta(cycleDay);

    const cleanFacts = Array.isArray(recentFacts) ? recentFacts.slice(0, 3) : [];
    const factSummary = cleanFacts.map(f => {
        if (typeof f === 'string') return f;
        if (f.text || f.fact) return f.text || f.fact;
        if (f.payload?.taskType) return `Завершено: ${taskName(f.payload.taskType)}`;
        if (f.event_type === 'TASK_COMPLETED') return 'Выполнила задачу';
        if (f.event_type === 'RANDOM_EVENT') return 'Событие дня';
        return null;
    }).filter(Boolean);

    const temp = weather?.temperatureC !== undefined ? `${weather.temperatureC > 0 ? `+${weather.temperatureC}` : weather.temperatureC}°C` : '+14°C';
    const weatherText = weather?.is_raining || weather?.rain ? '🌧️ Дождь' : '⛅ Облачно с прояснениями';
    const needs = snapshot?.state?.needs || snapshot?.needs || {};

    return (
        <Card className="lera-bento-status-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, height: '100%' }}>
            {/* Top Row: Activity Title & Status Chips */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                        Жизнь Леры в реальном времени · Физиология
                    </div>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
                        Сейчас: {activityName} ({locName})
                    </h2>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                        {isResting
                            ? 'Лера дома на Петроградке. Потребности стабильны, в ожидании следующего триггера.'
                            : `Выполняет запланированное действие в локации ${locName}.`}
                    </p>
                </div>

                {/* 4 Status Chips */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge variant="blue" style={{ fontSize: 11, padding: '3px 7px' }}>
                        📍 {locName}
                    </Badge>
                    <Badge variant="muted" style={{ fontSize: 11, padding: '3px 7px' }}>
                        {temp} · {weatherText}
                    </Badge>
                    <Badge variant={cycle.tone} style={{ fontSize: 11, padding: '3px 7px' }}>
                        🌸 {cycle.phase} ({cycle.day}/28)
                    </Badge>
                    <Badge variant="green" style={{ fontSize: 11, padding: '3px 7px' }}>
                        💰 {moneyRubles} ₽ / {moneyStars} ⭐️
                    </Badge>
                </div>
            </div>

            {/* Telegram Context Strip */}
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(15,23,42,0.4) 100%)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    border: '1px solid rgba(59,130,246,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontSize: 11, fontWeight: 600 }}>
                    <MessageSquare size={12} />
                    <span>Что Лера помнит и как ответит в Telegram:</span>
                </div>
                <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.35 }}>
                    {isResting ? (
                        <span>
                            «Я щас дома на Петроградке валяюсь, пью чай и залипаю в телефон. Настроение {snapshot?.state?.mood ? `${snapshot.state.mood}/10` : 'спокойное'}.»
                        </span>
                    ) : (
                        <span>
                            «Я щас занята: {activityName.toLowerCase()} ({locName}). Напишу чуть позже, как освобожусь!»
                        </span>
                    )}
                </div>
                {factSummary.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Свежие факты:</span>
                        {factSummary.map((item, idx) => (
                            <span
                                key={idx}
                                style={{
                                    fontSize: 9,
                                    background: 'rgba(255,255,255,0.06)',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    color: '#cbd5e1',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}
                            >
                                💡 {item}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Needs Row: 6 Needs strictly in 1 row */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1' }}>
                        Потребности Леры (клик для настройки):
                    </span>
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                        gap: 6,
                        width: '100%'
                    }}
                >
                    {Object.entries(NEED_LABELS).map(([key, [title, desc, shortName, Icon]]) => {
                        const value = needs[key] !== undefined ? needs[key] : (needs[key.toLowerCase()] ?? 0);
                        const status = needStatus(key, value);

                        return (
                            <div
                                key={key}
                                onClick={() => setSelectedNeed(key)}
                                style={{
                                    padding: '6px 8px',
                                    background: 'rgba(0,0,0,0.3)',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 3,
                                    minWidth: 0,
                                    transition: 'all 0.15s ease'
                                }}
                                title="Кликните для просмотра влияния и редактирования"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                                        <Icon size={11} style={{ flexShrink: 0 }} />
                                        <strong style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {title}
                                        </strong>
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#f1f5f9' }}>{value}%</span>
                                </div>
                                <ProgressBar value={value} tone={status.tone} style={{ height: 3 }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#94a3b8', marginTop: 1 }}>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.label}</span>
                                    <span style={{ color: '#38bdf8', flexShrink: 0 }}>⚙️</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
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

export default LeraStatusBento;
