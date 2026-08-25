import React, { useState } from 'react';
import { Sparkles, Dices, FastForward, WandSparkles, Download, RotateCcw, Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { api } from '@/lib/api.js';
import { downloadTextFile } from '@/lib/helpers.js';

export function RandomEventLab({ onTriggerEvent, readOnly = false, toast }) {
    const [eventName, setEventName] = useState('rain_spb');

    const EVENTS = [
        { id: 'rain_spb', name: '🌧️ Дождь в Санкт-Петербурге' },
        { id: 'nastya_calls', name: '📞 Настя зовёт гулять' },
        { id: 'max_deadline', name: '💻 Макс прислал срочную задачу' },
        { id: 'coffee_spill', name: '☕ Пролила кофе на Петроградке' },
        { id: 'cat_meeting', name: '🐱 Встретила уличного кота' }
    ];

    async function trigger() {
        try {
            await api(`/api/admin/random-events/${eventName}`, {
                method: 'POST',
                body: JSON.stringify({ enabled: true })
            });
            toast?.(`Событие ${eventName} (фактическое событие) запущено в симуляции`);
            onTriggerEvent?.();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    return (
        <Card>
            <CardHeader
                eyebrow="Генератор случайностей"
                title="Random Event Lab"
                description="Принудительный запуск непредвиденных внешних событий для проверки реакции Леры."
            />
            <div className="inline-controls" style={{ marginTop: 10 }}>
                <select value={eventName} onChange={e => setEventName(e.target.value)} disabled={readOnly}>
                    {EVENTS.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                </select>
                <Button onClick={trigger} disabled={readOnly}>
                    <Dices size={14} /> Вызвать событие
                </Button>
            </div>
        </Card>
    );
}

export function PersonalityLab({ onUpdateTrait, readOnly = false, toast }) {
    const [needsForm, setNeedsForm] = useState({
        hunger: 20,
        fatigue: 20,
        boredom: 20,
        hygiene: 90,
        bladder: 10,
        horny: 10
    });

    async function applyNeeds() {
        try {
            await api('/api/admin/radiant/god-mode', {
                method: 'POST',
                body: JSON.stringify({ action: 'SET_STATE', needs: needsForm })
            });
            toast?.('Физиологические потребности обновлены (фактическое событие)');
            onUpdateTrait?.();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    return (
        <Card>
            <CardHeader
                eyebrow="Лаборатория параметров"
                title="Personality Lab & God Mode"
                description="Прямое редактирование потребностей для тестирования реакций движка GOAP."
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 10 }}>
                {Object.entries(needsForm).map(([key, val]) => (
                    <label key={key} style={{ fontSize: 12 }}>
                        {key}: <strong>{val}</strong>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={val}
                            disabled={readOnly}
                            onChange={e => setNeedsForm({ ...needsForm, [key]: Number(e.target.value) })}
                        />
                    </label>
                ))}
            </div>
            <div style={{ marginTop: 14 }}>
                <Button onClick={applyNeeds} disabled={readOnly}>
                    <WandSparkles size={14} /> Применить в симуляции
                </Button>
            </div>
        </Card>
    );
}

export function SimulationLab({ onRefresh, readOnly = false, toast }) {
    const [runningComparison, setRunningComparison] = useState(false);

    async function runComparison() {
        setRunningComparison(true);
        try {
            await api('/api/admin/radiant/simulation-lab', { method: 'POST' });
            toast?.('Сравнение сценариев симуляции завершено');
            onRefresh?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setRunningComparison(false);
        }
    }

    async function resetRuntime() {
        try {
            await api('/api/admin/radiant/reset-runtime', { method: 'POST' });
            toast?.('Runtime симуляции сброшен');
            onRefresh?.();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
                <CardHeader
                    eyebrow="Лаборатория симуляций"
                    title="Simulation Lab"
                    description="Изолированное тестирование и прогон 24-часовых сценариев без записи в production."
                    action={
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button size="sm" onClick={runComparison} disabled={runningComparison || readOnly}>
                                <Sparkles size={13} /> Запустить сравнение
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => downloadTextFile('simulation-export.json', JSON.stringify({ exported_at: new Date().toISOString() }, null, 2))}>
                                <Download size={13} /> Экспорт
                            </Button>
                            <ConfirmAction
                                title="Сбросить runtime?"
                                description="Текущее состояние runtime будет сброшено до базового."
                                confirmText="Сбросить"
                                variant="danger"
                                disabled={readOnly}
                                onConfirm={resetRuntime}
                            >
                                <RotateCcw size={13} /> Сбросить runtime
                            </ConfirmAction>
                        </div>
                    }
                />
            </Card>

            <PersonalityLab onUpdateTrait={onRefresh} readOnly={readOnly} toast={toast} />
            <RandomEventLab onTriggerEvent={onRefresh} readOnly={readOnly} toast={toast} />

            <Card>
                <CardHeader
                    eyebrow="Социальные связи"
                    title="Люди вокруг Леры"
                    description="Настя, Макс, однокурсники и преподаватели в СПбГИК."
                />
                <div style={{ padding: 10, color: '#94a3b8', fontSize: 13 }}>
                    Взаимодействия и телефонные звонки фиксируются в ленте событий.
                </div>
            </Card>
        </div>
    );
}

export default SimulationLab;
