import React, { useState } from 'react';
import { 
    Clock, 
    Plus, 
    CheckCircle2, 
    AlertCircle, 
    Trash2, 
    CalendarClock, 
    MapPin, 
    Check,
    XCircle
} from 'lucide-react';
import { formatTaskType, LOCATION_MAP } from '@/lib/simulationConstants.js';
import { TaskModal } from './TaskModal.jsx';
import { api } from '@/lib/api.js';

export function KanbanBoard({
    pendingTasks = [],
    activeTask,
    completedTasks = [],
    cancelledTasks = [],
    onTasksChanged,
    toast
}) {
    const [modalOpen, setModalOpen] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    async function handleCompleteTask(taskId) {
        if (!taskId) return;
        setDeletingId(taskId);
        try {
            await api(`/api/admin/queue/${taskId}`, { method: 'DELETE' });
            toast?.('Задача завершена', 'success');
            onTasksChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setDeletingId(null);
        }
    }

    const safePending = Array.isArray(pendingTasks) ? pendingTasks : [];
    const safeCompleted = Array.isArray(completedTasks) ? completedTasks : [];
    const safeCancelled = Array.isArray(cancelledTasks) ? cancelledTasks : [];
    const totalCount = safePending.length + (activeTask ? 1 : 0) + safeCompleted.length + safeCancelled.length;

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3 sm:p-3.5 space-y-3 w-full">
            {/* Header */}
            <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-[#5e6ad2] stroke-[1.5]" />
                    <h2 className="text-sm font-semibold text-white tracking-tight">Канбан расписание</h2>
                    <span className="text-[11px] text-white/40 font-mono">
                        {totalCount}
                    </span>
                </div>

                <button
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#5e6ad2] hover:bg-[#6d78e3] text-white text-xs font-medium tracking-tight shadow-sm transition-[background-color,transform] active:scale-[0.96] shrink-0"
                >
                    <Plus className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Добавить</span>
                </button>
            </div>

            {/* All 4 Columns Horizontally Across the Line */}
            <div className="overflow-x-auto no-scrollbar pb-0.5">
                <div className="grid grid-cols-4 min-w-[620px] sm:min-w-0 gap-2 items-start">
                    {/* 1. ПРЕДСТОИТ */}
                    <div className="rounded-xl bg-black/20 border border-white/[0.04] p-2 h-[260px] flex flex-col">
                        <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                <span className="truncate">Предстоит</span>
                            </div>
                            <span className="text-[10px] font-mono text-white/50 px-1.5 py-0.2 rounded bg-white/[0.04]">
                                {safePending.length}
                            </span>
                        </div>

                        <div className="space-y-1 flex-1 overflow-y-auto max-h-[380px] pr-0.5 no-scrollbar">
                            {safePending.map((task, idx) => {
                                const loc = LOCATION_MAP[task.target_location || task.targetLocation || task.location_id];
                                return (
                                    <div
                                        key={task.id || idx}
                                        className="group rounded-md bg-[#121418] border border-white/[0.05] hover:border-white/15 p-1.5 text-xs space-y-1 transition-[background-color,border-color] duration-150"
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <span className="font-medium text-white/90 leading-tight line-clamp-2">
                                                {formatTaskType(task.task_type || task.taskType || task.type || task.title)}
                                            </span>
                                            {task.id && (
                                                <button
                                                    onClick={() => handleCompleteTask(task.id)}
                                                    disabled={deletingId === task.id}
                                                    title="Завершить / Удалить"
                                                    className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-rose-400 transition-[opacity,color] p-0.5 -mr-0.5 shrink-0"
                                                >
                                                    <Trash2 className="w-3 h-3 stroke-[1.5]" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between gap-1 text-[10px] text-white/50 pt-0.5">
                                            <div className="flex items-center gap-1 truncate">
                                                <MapPin className="w-2.5 h-2.5 text-white/40 stroke-[1.5] shrink-0" />
                                                <span className="truncate">{loc ? loc.shortName : 'СПб'}</span>
                                            </div>
                                            <div className="flex items-center gap-0.5 font-mono text-white/50 shrink-0">
                                                <Clock className="w-2.5 h-2.5 stroke-[1.5]" />
                                                <span>{task.duration_minutes || task.durationMinutes || 30}м</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {safePending.length === 0 && (
                                <div className="h-24 flex flex-col items-center justify-center text-center text-[11px] text-white/40 border border-dashed border-white/[0.04] rounded-md">
                                    <span>Очередь пуста</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. В ПРОЦЕССЕ */}
                    <div className="rounded-xl bg-[#5e6ad2]/[0.03] border border-[#5e6ad2]/20 p-2 h-[260px] flex flex-col">
                        <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[#8a95f5]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#5e6ad2] animate-pulse" />
                                <span className="truncate">В процессе</span>
                            </div>
                            <span className="text-[10px] font-mono text-[#8a95f5]/90 px-1.5 py-0.2 rounded bg-[#5e6ad2]/10 border border-[#5e6ad2]/20">
                                {activeTask ? 1 : 0}
                            </span>
                        </div>

                        <div className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar">
                            {activeTask ? (
                                <div className="rounded-md bg-[#13161e] border border-[#5e6ad2]/30 p-2 text-xs space-y-1 shadow-sm">
                                    <div className="flex items-start justify-between gap-1">
                                        <span className="font-semibold text-white leading-tight">
                                            {formatTaskType(activeTask.task_type || activeTask.title || activeTask.name)}
                                        </span>
                                        <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20 shrink-0">
                                            Активно
                                        </span>
                                    </div>

                                    {activeTask.explanation && (
                                        <p className="text-[10px] text-white/60 italic leading-snug line-clamp-3">
                                            «{activeTask.explanation}»
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between text-[10px] text-white/50 pt-0.5">
                                        <span className="flex items-center gap-1 text-white/70 truncate">
                                            <MapPin className="w-2.5 h-2.5 text-[#5e6ad2] stroke-[1.5] shrink-0" />
                                            <span className="truncate">{LOCATION_MAP[activeTask.target_location]?.shortName || 'СПб'}</span>
                                        </span>
                                        {activeTask.remaining_minutes !== undefined && (
                                            <span className="font-mono text-[#8a95f5] shrink-0">
                                                ~{activeTask.remaining_minutes}м
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-24 flex flex-col items-center justify-center text-center text-[11px] text-white/40 border border-dashed border-white/[0.04] rounded-md">
                                    <span>Свободна</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. СДЕЛАНО */}
                    <div className="rounded-xl bg-emerald-950/[0.04] border border-emerald-500/10 p-2 h-[260px] flex flex-col">
                        <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/80">
                                <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span className="truncate">Сделано</span>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400/80 px-1.5 py-0.2 rounded bg-emerald-500/10">
                                {safeCompleted.length}
                            </span>
                        </div>

                        <div className="space-y-1 flex-1 overflow-y-auto max-h-[380px] pr-0.5 no-scrollbar">
                            {safeCompleted.map((task, idx) => (
                                <div
                                    key={task.id || idx}
                                    className="rounded-md bg-[#121418] border border-emerald-500/15 p-1.5 text-xs space-y-1 opacity-80"
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="font-medium text-white/80 leading-tight truncate">
                                            {formatTaskType(task.task_type || task.title || task.type || task.name)}
                                        </span>
                                        <Check className="w-3 h-3 text-emerald-400 stroke-[1.5] shrink-0" />
                                    </div>
                                    {task.at && (
                                        <span className="text-[10px] text-white/40 font-mono block">
                                            {new Date(task.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                            ))}

                            {safeCompleted.length === 0 && (
                                <div className="h-24 flex flex-col items-center justify-center text-center text-[11px] text-white/40 border border-dashed border-white/[0.04] rounded-md">
                                    <span>Пока пусто</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 4. ОТМЕНЕНО */}
                    <div className="rounded-xl bg-rose-950/[0.04] border border-rose-500/10 p-2 h-[260px] flex flex-col">
                        <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-rose-400/80">
                                <XCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span className="truncate">Отменено</span>
                            </div>
                            <span className="text-[10px] font-mono text-rose-400/80 px-1.5 py-0.2 rounded bg-rose-500/10">
                                {safeCancelled.length}
                            </span>
                        </div>

                        <div className="space-y-1 flex-1 overflow-y-auto max-h-[380px] pr-0.5">
                            {safeCancelled.map((task, idx) => (
                                <div
                                    key={task.id || idx}
                                    className="rounded-md bg-[#121418] border border-rose-500/15 p-1.5 text-xs space-y-0.5 opacity-70"
                                >
                                    <span className="font-medium text-rose-200/80 leading-tight block truncate">
                                        {formatTaskType(task.task_type || task.type || task.title)}
                                    </span>
                                    {task.reason && (
                                        <span className="text-[10px] text-rose-400/60 block truncate">
                                            {task.reason}
                                        </span>
                                    )}
                                </div>
                            ))}

                            {safeCancelled.length === 0 && (
                                <div className="h-24 flex flex-col items-center justify-center text-center text-[11px] text-white/40 border border-dashed border-white/[0.04] rounded-md">
                                    <span>Срывов нет</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <TaskModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onTaskCreated={onTasksChanged}
                toast={toast}
            />
        </div>
    );
}
