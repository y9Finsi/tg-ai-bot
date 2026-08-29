import React from 'react';
import { Badge } from '@/components/ui/badge.jsx';
import { taskName, taskSource } from '@/lib/simulationUtils.js';
import { formatTime } from '@/lib/dateUtils.js';

export function TaskCard({ task, onClick }) {
    if (!task) return null;
    const name = taskName(task);
    const source = taskSource(task);

    return (
        <div
            className="kanban-task-card"
            onClick={() => onClick?.(task)}
            style={{
                padding: '10px 12px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13, color: '#f1f5f9' }}>{name}</strong>
                <Badge variant="muted" style={{ fontSize: 10 }}>{source}</Badge>
            </div>
            {task.startTime && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    ⏰ {formatTime(task.startTime)} {task.endTime ? `— ${formatTime(task.endTime)}` : ''}
                </div>
            )}
            {task.explanation && (
                <p style={{ margin: 0, fontSize: 11, color: '#cbd5e1', lineHeight: 1.3, opacity: 0.85 }}>
                    {task.explanation}
                </p>
            )}
        </div>
    );
}

export function TaskDetailModal({ task, onClose }) {
    if (!task) return null;

    return (
        <div className="dialog-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="dialog-content" onClick={e => e.stopPropagation()} style={{ background: '#0f172a', padding: 20, borderRadius: 8, maxWidth: 450, width: '90%', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{taskName(task)}</h3>
                    <Badge variant="blue">{taskSource(task)}</Badge>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                    <div><strong>ID:</strong> {task.id || task.taskId || '—'}</div>
                    <div><strong>Статус:</strong> {task.status || 'ACTIVE'}</div>
                    {task.startTime && <div><strong>Время:</strong> {formatTime(task.startTime)} — {formatTime(task.endTime)}</div>}
                    {task.explanation && <div><strong>Причина:</strong> {task.explanation}</div>}
                    {task.effects && typeof task.effects === 'object' && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                            <strong>Эффекты:</strong>
                            {Object.entries(task.effects).map(([k, v]) => (
                                <Badge key={k} variant={Number(v) < 0 ? 'green' : 'yellow'} style={{ fontSize: 11 }}>
                                    {k}: {Number(v) > 0 ? `+${v}` : v}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="ui-button ui-button-primary" onClick={onClose}>Закрыть</button>
                </div>
            </div>
        </div>
    );
}

export default TaskCard;
