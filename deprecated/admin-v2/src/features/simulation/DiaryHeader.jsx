import React from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, FastForward, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { shiftIsoDate, formatDay } from '@/lib/dateUtils.js';

export function DiaryHeader({
    dayDate,
    setDayDate,
    todayIso,
    autoRefresh,
    setAutoRefresh,
    isPaused,
    onTogglePause,
    onTick,
    onOpenGodMode
}) {
    return (
        <div className="diary-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div className="date-navigation" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setDayDate(shiftIsoDate(dayDate, -1))}
                    title="Предыдущий день"
                >
                    <ChevronLeft size={14} />
                </Button>
                <input
                    type="date"
                    value={dayDate}
                    onChange={e => setDayDate(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid var(--border)' }}
                />
                <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setDayDate(shiftIsoDate(dayDate, 1))}
                    title="Следующий день"
                >
                    <ChevronRight size={14} />
                </Button>
                {dayDate !== todayIso && (
                    <Button size="xs" variant="secondary" onClick={() => setDayDate(todayIso)}>
                        Сегодня
                    </Button>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4, color: '#e2e8f0' }}>
                    {formatDay(dayDate)}
                </span>
            </div>

            <div className="simulation-controls" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={e => setAutoRefresh(e.target.checked)}
                    />
                    Авто-обновление
                </label>
                <Button size="xs" variant={isPaused ? 'warning' : 'outline'} onClick={onTogglePause}>
                    {isPaused ? <Play size={13} /> : <Pause size={13} />}
                    {isPaused ? 'Возобновить' : 'Пауза'}
                </Button>
                <Button size="xs" variant="primary" onClick={onTick} title="Сделать 1 шаг симуляции (+15 мин)">
                    <FastForward size={13} /> Шаг симуляции (+15м)
                </Button>
                {onOpenGodMode && (
                    <Button size="xs" variant="secondary" onClick={onOpenGodMode}>
                        <WandSparkles size={13} /> God Mode
                    </Button>
                )}
            </div>
        </div>
    );
}

export default DiaryHeader;
