import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { TaskCard, TaskDetailModal } from './TaskCard.jsx';
import { formatTime } from '@/lib/dateUtils.js';
import { taskName, formatCancelReason } from '@/lib/simulationUtils.js';

export function KanbanBoard({
    pendingTasks = [],
    inProgressTask,
    completedTasks = [],
    cancelledTasks = [],
    scheduleChanges = []
}) {
    const [selectedTask, setSelectedTask] = useState(null);
    const safePending = Array.isArray(pendingTasks) ? pendingTasks : [];
    const safeCompleted = Array.isArray(completedTasks) ? completedTasks : [];
    const safeCancelled = Array.isArray(cancelledTasks) ? cancelledTasks : [];

    return (
        <Card className="kanban-board-card">
            <CardHeader
                eyebrow="Расписание дня"
                title="Жизнь задач · Kanban расписание и цепочки GOAP"
                description="Что происходит с планами: предстоит, выполняется, сделано и отменено."
            />
            <div className="kanban-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 12, width: '100%' }}>
                {/* Column 1: Предстоит */}
                <div className="kanban-column planned-column" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 8px', borderRadius: 8, border: '1px solid var(--border)', minWidth: 0 }}>
                    <div className="kanban-column-header" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📋 Предстоит ({safePending.length})</strong>
                    </div>
                    <div className="kanban-column-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', overflowX: 'hidden' }}>
                        {safePending.map((t, idx) => (
                            <div key={t.id || idx} className="planned-task-item">
                                <TaskCard task={t} onClick={setSelectedTask} />
                                {t.remaining_minutes !== undefined && (
                                    <span className="remaining_minutes" style={{ fontSize: 10, opacity: 0.7 }}>
                                        Осталось: {t.remaining_minutes} мин
                                    </span>
                                )}
                            </div>
                        ))}
                        {!safePending.length && <div className="empty-state" style={{ padding: 8, fontSize: 11 }}>Нет предстоящих задач.</div>}
                    </div>
                </div>

                {/* Column 2: В процессе */}
                <div className="kanban-column active-column" style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '10px 8px', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.3)', minWidth: 0 }}>
                    <div className="kanban-column-header" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12, color: '#60a5fa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>⚡ В процессе</strong>
                    </div>
                    <div className="kanban-column-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', overflowX: 'hidden' }}>
                        {inProgressTask ? (
                            <div>
                                <TaskCard task={inProgressTask} onClick={setSelectedTask} />
                                <span className="decision-label" style={{ fontSize: 10, color: '#93c5fd', marginTop: 4, display: 'block' }}>
                                    {inProgressTask.explanation || 'Выполняется по текущему фокусу'}
                                </span>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 8, fontSize: 11 }}>Сейчас Лера свободна.</div>
                        )}
                    </div>
                </div>

                {/* Column 3: Сделано */}
                <div className="kanban-column done-column" style={{ background: 'rgba(34, 197, 94, 0.06)', padding: '10px 8px', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.25)', minWidth: 0 }}>
                    <div className="kanban-column-header" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12, color: '#4ade80', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✅ Сделано ({safeCompleted.length})</strong>
                    </div>
                    <div className="kanban-column-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', overflowX: 'hidden' }}>
                        {safeCompleted.map((t, idx) => (
                            <TaskCard key={t.id || idx} task={t} onClick={setSelectedTask} />
                        ))}
                        {!safeCompleted.length && <div className="empty-state" style={{ padding: 8, fontSize: 11 }}>Ещё нет завершённых дел.</div>}
                    </div>
                </div>

                {/* Column 4: Отменено */}
                <div className="kanban-column cancelled-column" style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '10px 8px', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)', minWidth: 0 }}>
                    <div className="kanban-column-header" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12, color: '#f87171', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🚫 Отменено ({safeCancelled.length})</strong>
                    </div>
                    <div className="kanban-column-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', overflowX: 'hidden' }}>
                        {safeCancelled.map((row, idx) => (
                            <div key={row.id || idx} className="managed-row" style={{ padding: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                                <strong style={{ fontSize: 11 }}>{taskName(row.taskType || row.type)}</strong>
                                <span style={{ fontSize: 10, color: '#fca5a5', display: 'block' }}>
                                    {formatCancelReason(row, !row.matchedFact)}
                                </span>
                                {row.inviter && <Badge variant="muted" style={{ fontSize: 9 }}>От: {row.inviter}</Badge>}
                            </div>
                        ))}
                        {!safeCancelled.length && <div className="empty-state" style={{ padding: 8, fontSize: 11 }}>Отменённых задач нет.</div>}
                    </div>
                </div>
            </div>

            {selectedTask && (
                <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
            )}
        </Card>
    );
}

export default KanbanBoard;
