import React, { useState } from 'react';
import { X, Clock, MapPin, Sparkles, CheckCircle2, Ban, ArrowRight, Zap } from 'lucide-react';
import { formatTaskType, formatTaskReason, getTaskEffects, LOCATION_MAP } from '@/lib/simulationConstants.js';
import { formatTime } from '@/lib/dateUtils.js';

export function TaskDetailModal({
    isOpen,
    task,
    onClose,
    onComplete,
    onCancel,
    toast
}) {
    if (!isOpen || !task) return null;

    const [actionLoading, setActionLoading] = useState(false);

    const taskType = task.task_type || task.taskType || task.type;
    const title = task.label || formatTaskType(taskType || task.title || 'Задача');
    const reason = formatTaskReason(task.reason || task.metadata?.reason, task.created_by || task.createdBy || task.source);
    const effects = getTaskEffects(taskType);

    // Resolve location info
    const locId = task.target_location || task.targetLocation || task.location_id || task.location;
    const locObj = locId ? LOCATION_MAP[locId] : null;

    // Status styling
    const status = task.status || 'PENDING';
    const isCompleted = status === 'COMPLETED' || task.kind === 'fact';
    const isCancelled = ['CANCELLED', 'MISSED', 'OVERDUE'].includes(status) || task.overdue;
    const isInProgress = status === 'IN_PROGRESS' || status === 'IN_TRANSIT';

    async function handleComplete() {
        if (!onComplete) return;
        setActionLoading(true);
        try {
            await onComplete(task.id || task.task_id);
            onClose();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    }

    async function handleCancel() {
        if (!onCancel) return;
        setActionLoading(true);
        try {
            await onCancel(task.id || task.task_id);
            onClose();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08090a]/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl bg-[#0e1013] border border-white/[0.08] p-6 shadow-2xl shadow-black/90 space-y-5 select-none">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b border-white/[0.06] pb-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                                isInProgress
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    : isCompleted
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : isCancelled
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : 'bg-white/[0.05] text-white/70 border-white/10'
                            }`}>
                                {isInProgress ? 'В процессе' : isCompleted ? 'Выполнено' : isCancelled ? 'Отменено' : 'Предстоит'}
                            </span>
                            {task.sourceLabel && (
                                <span className="text-[11px] font-mono text-white/40">
                                    {task.sourceLabel}
                                </span>
                            )}
                        </div>
                        <h3 className="text-[18px] font-semibold text-white tracking-tight leading-snug">
                            {title}
                        </h3>
                    </div>

                    <button
                        onClick={onClose}
                        className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
                    >
                        <X className="w-5 h-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Details Grid */}
                <div className="space-y-3.5 text-xs">
                    {/* Reason / Trigger */}
                    {reason && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                            <div>
                                <span className="text-white/40 block font-medium">Причина и обоснование</span>
                                <span className="text-white/90 font-medium text-[13px]">{reason}</span>
                            </div>
                        </div>
                    )}

                    {/* Timing */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <Clock className="w-4 h-4 text-sky-400 shrink-0" />
                            <div>
                                <span className="text-white/40 block font-medium">Длительность</span>
                                <span className="text-white/90 font-medium">
                                    {task.durationMinutes || task.duration_minutes || 30} мин
                                    {task.remaining_minutes != null && ` (осталось ${task.remaining_minutes}м)`}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                            <div>
                                <span className="text-white/40 block font-medium">Время</span>
                                <span className="text-white/90 font-medium">
                                    {task.start ? formatTime(task.start) : task.at ? formatTime(task.at) : 'По графику'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Location */}
                    {locObj ? (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <span className="text-white/40 block font-medium">Локация</span>
                                <span className="text-white/90 font-medium text-[13px]">
                                    {locObj.icon} {locObj.name}
                                </span>
                                <span className="text-white/50 block text-[11px]">
                                    {locObj.address} ({locObj.district})
                                </span>
                            </div>
                        </div>
                    ) : locId ? (
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div>
                                <span className="text-white/40 block font-medium">Локация</span>
                                <span className="text-white/90 font-medium">{locId}</span>
                            </div>
                        </div>
                    ) : null}

                    {/* Task Effects on Needs */}
                    {effects && (
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div>
                                <span className="text-emerald-400/70 block font-medium">Эффект на состояние</span>
                                <span className="text-emerald-300 font-medium">{effects}</span>
                            </div>
                        </div>
                    )}

                    {/* Technical details (collapsible or mono) */}
                    <div className="pt-1 flex items-center justify-between text-[11px] text-white/30 font-mono">
                        <span>Type: {taskType || 'N/A'}</span>
                        {task.priority && <span>Приоритет: {task.priority}</span>}
                    </div>
                </div>

                {/* Modal Footer / Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        {onCancel && !isCompleted && !isCancelled && (
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={handleCancel}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Отменить</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white/70 hover:text-white text-xs font-medium transition-all active:scale-95 cursor-pointer"
                        >
                            Закрыть
                        </button>

                        {onComplete && !isCompleted && !isCancelled && (
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={handleComplete}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#28583b] hover:bg-[#34734d] text-white text-xs font-medium border border-[#3f885d]/40 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isInProgress ? 'Завершить действие' : 'Выполнить'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TaskDetailModal;
