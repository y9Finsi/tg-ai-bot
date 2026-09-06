import React from 'react';
import { Sparkles, MapPin, CloudRain, Sun, Moon, Zap, Heart, MessageSquare } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { taskName, formatLocation, getCycleMeta } from '@/lib/simulationUtils.js';

export function LiveStatusCard({
    snapshot,
    activeTask,
    currentLocation = 'petrogradka_home',
    weather,
    cycleDay = 25,
    moneyRubles = 70,
    moneyStars = 150,
    recentFacts = []
}) {
    const rawTask = activeTask?.task_type || activeTask?.taskType || activeTask?.type;
    const isResting = !rawTask || rawTask === 'IDLE_HOME_REST';
    const activityName = isResting ? 'Отдых дома' : taskName(rawTask);
    const locName = formatLocation(currentLocation);
    const cycle = getCycleMeta(cycleDay);

    // Human readable summary of recent memory / facts for Telegram context
    const cleanFacts = Array.isArray(recentFacts) ? recentFacts.slice(0, 3) : [];
    const factSummary = cleanFacts.map(f => {
        if (typeof f === 'string') return f;
        if (f.text || f.fact) return f.text || f.fact;
        if (f.payload?.taskType) return `Завершено: ${taskName(f.payload.taskType)}`;
        if (f.event_type === 'TASK_COMPLETED') return 'Выполнила запланированное дело';
        if (f.event_type === 'RANDOM_EVENT') return 'Встретила неожиданное событие дня';
        return null;
    }).filter(Boolean);

    const temp = weather?.temperatureC !== undefined ? `${weather.temperatureC > 0 ? `+${weather.temperatureC}` : weather.temperatureC}°C` : '+14°C';
    const weatherText = weather?.is_raining || weather?.rain ? '🌧️ Дождь в Санкт-Петербурге' : '⛅ Облачно с прояснениями';

    return (
        <Card className="live-status-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CardHeader
                eyebrow="Жизнь Леры в реальном времени"
                title={`Сейчас: ${activityName} (${locName})`}
                description={
                    isResting
                        ? `Лера дома на Петроградке. Потребности стабильны, в ожидании следующего шага симуляции.`
                        : `Выполняет запланированное действие в локации ${locName}.`
                }
                action={
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge variant="blue">📍 {locName}</Badge>
                        <Badge variant="muted">{temp} · {weatherText}</Badge>
                        <Badge variant={cycle.tone}>🌸 {cycle.phase} ({cycle.day}/28)</Badge>
                        <Badge variant="green">💰 {moneyRubles} ₽ / {moneyStars} ⭐️</Badge>
                    </div>
                }
            />

            {/* Telegram Context Box */}
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(30,41,59,0.4) 100%)',
                    borderRadius: 8,
                    padding: 12,
                    border: '1px solid rgba(59,130,246,0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>
                    <MessageSquare size={14} />
                    <span>Что Лера помнит и как ответит в Telegram прямо сейчас:</span>
                </div>
                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
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
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Свежие факты в памяти:</span>
                        {factSummary.map((item, idx) => (
                            <Badge key={idx} variant="muted" style={{ fontSize: 10 }}>
                                💡 {item}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
}

export default LiveStatusCard;
