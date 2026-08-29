import React, { useState } from 'react';
import { Clock, Activity, AlertTriangle } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { formatTime } from '@/lib/dateUtils.js';
import { eventName, taskName } from '@/lib/simulationUtils.js';
import { cn } from '@/lib/utils.js';

export function TimelineFilters({ activeFilter, onChangeFilter }) {
    const filters = [
        ['all', 'Все события'],
        ['task', 'Задачи'],
        ['event', 'События'],
        ['interrupt', 'Прерывания'],
        ['social', 'Общение']
    ];

    return (
        <div className="crm-filter-bar" style={{ marginBottom: 12 }}>
            {filters.map(([val, lbl]) => (
                <button
                    key={val}
                    className={cn('crm-filter-btn', activeFilter === val && 'active')}
                    onClick={() => onChangeFilter(val)}
                >
                    {lbl}
                </button>
            ))}
        </div>
    );
}

export function Timeline({ events = [], onOpenTaskDetail }) {
    const [filter, setFilter] = useState('all');
    const safeEvents = Array.isArray(events) ? events : [];

    const filteredEvents = safeEvents.filter(e => {
        if (filter === 'task') return e.kind === 'task' || e.type?.includes('TASK');
        if (filter === 'interrupt') return e.kind === 'interrupt' || e.type?.includes('INTERRUPT');
        if (filter === 'social') return e.type?.includes('SOCIAL') || e.type?.includes('CHAT');
        return true;
    });

    return (
        <Card className="timeline-card">
            <CardHeader
                eyebrow="Лента времени"
                title="Хроника дня Леры"
                description="Пошаговая история выполненных действий, звонков и происшествий."
            />
            <TimelineFilters activeFilter={filter} onChangeFilter={setFilter} />
            <div className="timeline-feed-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredEvents.length ? (
                    filteredEvents.map((evt, idx) => {
                        const isInterrupt = evt.type?.includes('INTERRUPT');
                        return (
                            <div
                                key={evt.id || idx}
                                className="managed-row"
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    background: isInterrupt ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.25)',
                                    border: isInterrupt ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--border)',
                                    borderRadius: 8
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {isInterrupt ? <AlertTriangle size={15} style={{ color: '#f87171' }} /> : <Clock size={15} />}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <strong style={{ fontSize: 13 }}>{eventName(evt)}</strong>
                                            {isInterrupt && <Badge variant="red">Прерывание</Badge>}
                                            {evt.type === 'TASK_COMPLETED' && <Badge variant="green">Завершено</Badge>}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                            {evt.description || evt.explanation || evt.payload?.text || '—'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {evt.location && <Badge variant="muted">{evt.location}</Badge>}
                                    <span style={{ fontSize: 12, opacity: 0.75 }}>
                                        {formatTime(evt.timestamp || evt.created_at || evt.time)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="empty-state">Событий за выбранный период нет.</div>
                )}
            </div>
        </Card>
    );
}

export default Timeline;
