import React, { useState } from 'react';
import { Sparkles, MapPin, CloudRain, Sun, MessageSquare, Utensils, Zap, Droplets, CircleAlert, Flame, Wallet, CalendarHeart } from 'lucide-react';
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

    const cleanFacts = Array.isArray(recentFacts) ? recentFacts.slice(0, 4) : [];
    const factSummary = cleanFacts.map(f => {
        if (typeof f === 'string') return f;
        if (f.text || f.fact) return f.text || f.fact;
        if (f.payload?.taskType) return `Завершено: ${taskName(f.payload.taskType)}`;
        if (f.event_type === 'TASK_COMPLETED') return 'Выполнила задачу';
        if (f.event_type === 'RANDOM_EVENT') return 'Событие дня';
        return null;
    }).filter(Boolean);

    const temp = weather?.temperatureC !== undefined ? `${weather.temperatureC > 0 ? `+${weather.temperatureC}` : weather.temperatureC}°C` : '+14°C';
    const weatherText = weather?.is_raining || weather?.rain ? 'Дождь' : 'Облачно с прояснениями';
    const needs = snapshot?.state?.needs || snapshot?.needs || {};

    // Dynamic dialogue tone and preview based on Lera's real state
    const fatigueVal = needs.fatigue ?? 50;
    const hungerVal = needs.hunger ?? 50;
    const moodVal = snapshot?.state?.mood || snapshot?.mood || 6;

    let toneTag = 'Спокойное';
    let readyAnswer = `«Я щас в локации ${locName}, занимаюсь своими делами. Как у тебя дела?»`;

    if (fatigueVal >= 80) {
        toneTag = '😴 Сонная (усталость 100%)';
        readyAnswer = `«Я щас дома на Петроградке вырубаюсь, сил вообще нет... Глаза слипаются, напишу попозже, ладно?»`;
    } else if (hungerVal >= 75) {
        toneTag = '🍔 Голодная';
        readyAnswer = `«Блин, я дико голодная! Щас бы шаверму на Ленина или круассан из Слоя... Ты сам ел уже?»`;
    } else if (cycle.phase.includes('ПМС')) {
        toneTag = '🌸 ПМС · Чувствительная';
        readyAnswer = `«Настроение такое себе, хочется завернуться в плед и пить чай. Расскажи что-нибудь хорошее?»`;
    }

    return (
        <Card className="lera-bento-status-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', justifyContent: 'space-between' }}>
            {/* 1. Header: Clean Title and Location */}
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
                    Жизнь Леры в реальном времени · Физиология
                </div>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#f8fafc' }}>
                    Сейчас: {activityName} ({locName})
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    {isResting
                        ? 'Лера дома на Петроградке. Потребности стабильны, в ожидании следующего шага симуляции.'
                        : `Выполняет запланированное действие в локации ${locName}.`}
                </p>
            </div>

            {/* 2. Top 4 Environment & State Cards */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 8,
                    width: '100%'
                }}
            >
                {/* Card 1: Локация */}
                <div
                    style={{
                        padding: '8px 10px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        borderRadius: 8,
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#60a5fa', fontSize: 11, fontWeight: 600 }}>
                        <MapPin size={12} />
                        <span>Локация</span>
                    </div>
                    <strong style={{ fontSize: 12, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {locName}
                    </strong>
                    <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Петроградская</span>
                </div>

                {/* Card 2: Погода в СПб */}
                <div
                    style={{
                        padding: '8px 10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', fontSize: 11, fontWeight: 600 }}>
                        <Sun size={12} />
                        <span>Погода СПб</span>
                    </div>
                    <strong style={{ fontSize: 12, color: '#f8fafc' }}>
                        {temp} · ⛅
                    </strong>
                    <span style={{ fontSize: 9.5, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {weatherText}
                    </span>
                </div>

                {/* Card 3: Фаза цикла */}
                <div
                    style={{
                        padding: '8px 10px',
                        background: 'rgba(244, 114, 182, 0.08)',
                        borderRadius: 8,
                        border: '1px solid rgba(244, 114, 182, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f472b6', fontSize: 11, fontWeight: 600 }}>
                        <CalendarHeart size={12} />
                        <span>Цикл</span>
                    </div>
                    <strong style={{ fontSize: 12, color: '#f8fafc' }}>
                        🌸 {cycle.phase}
                    </strong>
                    <span style={{ fontSize: 9.5, color: '#f472b6' }}>
                        День {cycle.day} из 28
                    </span>
                </div>

                {/* Card 4: Кошелек */}
                <div
                    style={{
                        padding: '8px 10px',
                        background: 'rgba(34, 197, 94, 0.08)',
                        borderRadius: 8,
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ade80', fontSize: 11, fontWeight: 600 }}>
                        <Wallet size={12} />
                        <span>Кошелёк</span>
                    </div>
                    <strong style={{ fontSize: 12, color: '#4ade80' }}>
                        💰 {moneyRubles} ₽
                    </strong>
                    <span style={{ fontSize: 9.5, color: '#94a3b8' }}>
                        + {moneyStars} ⭐️ Stars
                    </span>
                </div>
            </div>

            {/* 3. 6 Needs Cards in 2 Rows (3 cards per row) - Placed immediately after status cards without header */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 7,
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
                                padding: '8px 10px',
                                background: 'rgba(0,0,0,0.3)',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                                minWidth: 0,
                                transition: 'all 0.15s ease'
                            }}
                            title="Кликните для настройки потребности"
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                    <Icon size={12} style={{ flexShrink: 0 }} />
                                    <strong style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {title}
                                    </strong>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>{value}%</span>
                            </div>
                            <ProgressBar value={value} tone={status.tone} style={{ height: 4 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.label}</span>
                                <span style={{ color: '#38bdf8', flexShrink: 0 }}>ред. ⚙️</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 4. Light, Decluttered Telegram Response & Memory Box */}
            <div
                style={{
                    background: 'rgba(59,130,246,0.06)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    border: '1px solid rgba(59,130,246,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontSize: 11, fontWeight: 600 }}>
                        <MessageSquare size={13} />
                        <span>Ответ в Telegram прямо сейчас:</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                        <Badge variant="blue" style={{ fontSize: 9.5 }}>{toneTag}</Badge>
                        <Badge variant="muted" style={{ fontSize: 9.5 }}>Настроение: {moodVal}/10</Badge>
                    </div>
                </div>

                <div
                    style={{
                        fontSize: 12.5,
                        color: '#f8fafc',
                        lineHeight: 1.4,
                        background: 'rgba(0,0,0,0.25)',
                        padding: '6px 10px',
                        borderRadius: 6,
                        borderLeft: '3px solid #38bdf8'
                    }}
                >
                    {readyAnswer}
                </div>

                {factSummary.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 1 }}>
                        <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Память:</span>
                        {factSummary.map((item, idx) => (
                            <span
                                key={idx}
                                style={{
                                    fontSize: 9.5,
                                    background: 'rgba(255,255,255,0.06)',
                                    padding: '1px 6px',
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
