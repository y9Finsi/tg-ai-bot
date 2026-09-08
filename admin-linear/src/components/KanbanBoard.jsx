import React, { useState } from 'react';
import { Plus, Check, Trash2, Clock, MapPin, Sparkles, AlertCircle } from 'lucide-react';
import { formatTaskType, formatTaskReason, LOCATION_MAP } from '@/lib/simulationConstants.js';
import { TaskModal } from './TaskModal.jsx';
import { TaskDetailModal } from './TaskDetailModal.jsx';
import { api } from '@/lib/api.js';
import { formatTime } from '@/lib/dateUtils.js';

/**
 * Kanban Board matching Figma 13:2135 with rich metadata & safe inspection
 * - Header: "Расписание на день" (20px font-medium text-white) + "+ Добавить"
 * - 4 columns (1005px total width, gap 8px, height 351px):
 *   1) "Предстоит": bg-[#0b0d0f], border-[#272727], header white, cards bg-[#1b1d22]
 *   2) "В процессе": bg-[#000212]/37, border-[#282f58], header #7178a1, cards bg-[#282f58]
 *   3) "Сделано": bg-[#0c1113], border-[#07231e], header #71a186, cards bg-[#28583b]
 *   4) "Отменено": bg-[#100f13], border-[#2c121a], header #a17171, cards bg-[#582828]
 */
export function KanbanBoard({
    pendingTasks = [],
    activeTask,
    completedTasks = [],
    cancelledTasks = [],
    onTasksChanged,
    toast
}) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [actionLoadingId, setActionLoadingId] = useState(null);

    const safePending = Array.isArray(pendingTasks) ? pendingTasks : [];
    const safeCompleted = Array.isArray(completedTasks) ? completedTasks : [];
    const safeCancelled = Array.isArray(cancelledTasks) ? cancelledTasks : [];

    async function handleCompleteTask(taskId) {
        if (!taskId) return;
        setActionLoadingId(taskId);
        try {
            await api(`/api/admin/queue/${taskId}`, { method: 'DELETE' });
            toast?.('Задача завершена', 'success');
            onTasksChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setActionLoadingId(null);
        }
    }

    async function handleCancelTask(taskId) {
        if (!taskId) return;
        setActionLoadingId(taskId);
        try {
            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ cancel_task_id: taskId })
            });
            toast?.('Задача отменена', 'info');
            onTasksChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setActionLoadingId(null);
        }
    }

    function renderTaskCard(task, styleConfig) {
        const rawType = task.task_type || task.taskType || task.type;
        const title = task.label || formatTaskType(rawType || task.title || 'Задача');
        const duration = task.durationMinutes || task.duration_minutes || task.planned_duration_minutes;
        const reason = formatTaskReason(task.reason || task.metadata?.reason, task.created_by || task.createdBy || task.source);
        const locId = task.target_location || task.targetLocation || task.location_id || task.location;
        const locName = locId ? (LOCATION_MAP[locId]?.shortName || locId) : null;
        const startTime = task.start ? formatTime(task.start) : task.at ? formatTime(task.at) : null;
        const isActionLoading = actionLoadingId === task.id;

        return (
            <div
                key={task.id || task.task_id || Math.random()}
                onClick={() => setSelectedTask(task)}
                title="Нажмите, чтобы посмотреть подробности"
                className={`w-full min-h-[108px] ${styleConfig.cardBg} rounded-[20px] p-3 text-white/80 text-[14px] leading-[1.3] flex flex-col justify-between cursor-pointer hover:border-white/20 border border-transparent transition-all group select-none shadow-sm relative`}
            >
                {/* Card Top: Title & Duration / Time */}
                <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-[14px] text-white/95 line-clamp-2 leading-snug">
                        {title}
                    </p>
                    <div className="shrink-0 flex items-center gap-1 text-[11px] font-mono text-white/50 bg-white/[0.05] px-1.5 py-0.5 rounded-full">
                        <Clock className="w-3 h-3 text-white/40" />
                        <span>{task.remaining_minutes != null ? `${task.remaining_minutes}м` : duration ? `${duration}м` : startTime || 'План'}</span>
                    </div>
                </div>

                {/* Card Middle: Badges (Reason, Location) */}
                <div className="flex flex-wrap items-center gap-1.5 my-1.5">
                    {reason && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-violet-300/90 bg-violet-500/10 px-1.5 py-0.5 rounded-md border border-violet-500/20 max-w-[170px] truncate">
                            <Sparkles className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{reason}</span>
                        </span>
                    )}
                    {locName && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300/90 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20 truncate">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{locName}</span>
                        </span>
                    )}
                </div>

                {/* Card Bottom: Source Label & Quick Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-[11px]">
                    <span className="text-white/40 font-mono truncate max-w-[130px]">
                        {task.sourceLabel || task.source || 'Симуляция'}
                    </span>

                    {/* Action buttons (stop propagation so card detail modal won't trigger immediately) */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {styleConfig.canComplete && task.id && (
                            <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteTask(task.id);
                                }}
                                title="Завершить задачу"
                                className="p-1 rounded-full hover:bg-emerald-500/20 text-white/40 hover:text-emerald-400 transition-colors cursor-pointer"
                            >
                                <Check className="w-3.5 h-3.5 stroke-[2]" />
                            </button>
                        )}
                        {styleConfig.canCancel && task.id && (
                            <button
                                type="button"
                                disabled={isActionLoading}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelTask(task.id);
                                }}
                                title="Отменить задачу"
                                className="p-1 rounded-full hover:bg-rose-500/20 text-white/40 hover:text-rose-400 transition-colors cursor-pointer"
                            >
                                <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section className="w-[1005px] mx-auto select-none">
            {/* Header: "Расписание на день" (13:2136, 20px Medium White) + "+ Добавить" */}
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-[20px] font-medium text-white leading-tight">
                    Расписание на день
                </h2>
                <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#292e5e] hover:bg-[#383f7d] text-white text-xs font-medium border border-[#434771] transition-all active:scale-95 cursor-pointer shadow-sm"
                    title="Запланировать новую задачу"
                >
                    <Plus className="w-3.5 h-3.5 stroke-[2]" />
                    <span>Добавить задачу</span>
                </button>
            </div>

            {/* 4 Columns Grid matching Figma 13:2137 (1005x359px, gap 8px) */}
            <div className="grid grid-cols-4 gap-2">
                {/* 1. ПРЕДСТОИТ (13:2138, 245x351px, r:23px, #0b0d0f, border #272727) */}
                <div className="w-full h-[351px] bg-[#0b0d0f] border border-[#272727] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2 flex items-center justify-between">
                        <span className="text-[16px] font-normal text-white leading-tight">
                            Предстоит
                        </span>
                        <span className="text-xs font-mono text-white/40">
                            {safePending.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {safePending.length === 0 ? (
                            <div 
                                onClick={() => setModalOpen(true)}
                                className="h-full flex flex-col items-center justify-center text-xs text-white/30 text-center px-4 cursor-pointer hover:text-white/60 transition-colors"
                                title="Нажмите, чтобы запланировать задачу"
                            >
                                <Plus className="w-5 h-5 mb-1 opacity-50" />
                                <span>Нет задач. Добавить?</span>
                            </div>
                        ) : (
                            safePending.map(task => renderTaskCard(task, {
                                cardBg: 'bg-[#1b1d22]',
                                canComplete: true,
                                canCancel: true
                            }))
                        )}
                    </div>
                </div>

                {/* 2. В ПРОЦЕССЕ (13:2139, 245x351px, r:23px, #000212/37, border #282f58) */}
                <div className="w-full h-[351px] bg-[#000212]/37 border border-[#282f58] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2 flex items-center justify-between">
                        <span className="text-[16px] font-normal text-[#7178a1] leading-tight">
                            В процессе
                        </span>
                        {activeTask && (
                            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {activeTask ? (
                            renderTaskCard(activeTask, {
                                cardBg: 'bg-[#282f58]',
                                canComplete: true,
                                canCancel: false
                            })
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Отдых и свободное время
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. СДЕЛАНО (13:2140, 245x351px, r:23px, #0c1113, border #07231e) */}
                <div className="w-full h-[351px] bg-[#0c1113] border border-[#07231e] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2 flex items-center justify-between">
                        <span className="text-[16px] font-normal text-[#71a186] leading-tight">
                            Сделано
                        </span>
                        <span className="text-xs font-mono text-[#71a186]/60">
                            {safeCompleted.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {safeCompleted.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Пусто
                            </div>
                        ) : (
                            safeCompleted.map(task => renderTaskCard(task, {
                                cardBg: 'bg-[#28583b]',
                                canComplete: false,
                                canCancel: false
                            }))
                        )}
                    </div>
                </div>

                {/* 4. ОТМЕНЕНО (13:2141, 245x351px, r:23px, #100f13, border #2c121a) */}
                <div className="w-full h-[351px] bg-[#100f13] border border-[#2c121a] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2 flex items-center justify-between">
                        <span className="text-[16px] font-normal text-[#a17171] leading-tight">
                            Отменено
                        </span>
                        <span className="text-xs font-mono text-[#a17171]/60">
                            {safeCancelled.length}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {safeCancelled.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Срывов нет
                            </div>
                        ) : (
                            safeCancelled.map(task => renderTaskCard(task, {
                                cardBg: 'bg-[#582828]',
                                canComplete: false,
                                canCancel: false
                            }))
                        )}
                    </div>
                </div>
            </div>

            {/* Task Detail Modal for inspection & safe actions */}
            <TaskDetailModal
                isOpen={Boolean(selectedTask)}
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
                onComplete={handleCompleteTask}
                onCancel={handleCancelTask}
                toast={toast}
            />

            {/* Add Task Modal */}
            <TaskModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onTaskCreated={onTasksChanged}
                toast={toast}
            />
        </section>
    );
}

export default KanbanBoard;
