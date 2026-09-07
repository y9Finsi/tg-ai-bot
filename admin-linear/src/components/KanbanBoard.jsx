import React, { useState } from 'react';
import { Plus, Check, Trash2, Clock, MapPin } from 'lucide-react';
import { formatTaskType, LOCATION_MAP } from '@/lib/simulationConstants.js';
import { TaskModal } from './TaskModal.jsx';
import { api } from '@/lib/api.js';

/**
 * Kanban Board matching Figma 13:2135
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

    return (
        <section className="w-[1005px] mx-auto select-none">
            {/* Header: "Расписание на день" (13:2136, 20px Medium White) */}
            <h2 className="text-[20px] font-medium text-white leading-tight mb-5">
                Расписание на день
            </h2>

            {/* 4 Columns Grid matching Figma 13:2137 (1005x359px, gap 8px) */}
            <div className="grid grid-cols-4 gap-2">
                {/* 1. ПРЕДСТОИТ (13:2138, 245x351px, r:23px, #0b0d0f, border #272727) */}
                <div className="w-full h-[351px] bg-[#0b0d0f] border border-[#272727] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2">
                        <span className="text-[16px] font-normal text-white leading-tight">
                            Предстоит
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {safePending.length === 0 ? (
                            <div 
                                onClick={() => setModalOpen(true)}
                                className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4 cursor-pointer hover:text-white/50 transition-colors"
                                title="Нажмите, чтобы запланировать задачу"
                            >
                                Нет задач
                            </div>
                        ) : (
                            safePending.map((task, idx) => {
                                const title = formatTaskType(task.task_type || task.taskType || task.type || task.title);
                                return (
                                    <div
                                        key={task.id || idx}
                                        onClick={() => task.id && handleCompleteTask(task.id)}
                                        title="Нажмите, чтобы перевести в процесс/завершить"
                                        className="w-full h-[108px] bg-[#1b1d22] rounded-[20px] p-3 text-white/72 text-[16px] leading-[1.3] flex flex-col justify-between cursor-pointer hover:border-white/10 border border-transparent transition-colors"
                                    >
                                        <p className="line-clamp-4">
                                            {title}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 2. В ПРОЦЕССЕ (13:2139, 245x351px, r:23px, #000212/37, border #282f58) */}
                <div className="w-full h-[351px] bg-[#000212]/37 border border-[#282f58] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2">
                        <span className="text-[16px] font-normal text-[#7178a1] leading-tight">
                            В процессе
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {activeTask ? (
                            <div 
                                onClick={() => activeTask.id && handleCompleteTask(activeTask.id)}
                                title="Нажмите, чтобы завершить действие"
                                className="w-full h-[108px] bg-[#282f58] rounded-[20px] p-3 text-white/72 text-[16px] leading-[1.3] flex flex-col justify-between cursor-pointer hover:border-white/20 border border-transparent transition-colors shadow-lg"
                            >
                                <p className="line-clamp-4">
                                    {formatTaskType(activeTask.task_type || activeTask.title || 'Текущее действие')}
                                </p>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Отдых
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. СДЕЛАНО (13:2140, 245x351px, r:23px, #0c1113, border #07231e) */}
                <div className="w-full h-[351px] bg-[#0c1113] border border-[#07231e] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2">
                        <span className="text-[16px] font-normal text-[#71a186] leading-tight">
                            Сделано
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {safeCompleted.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Пусто
                            </div>
                        ) : (
                            safeCompleted.map((task, idx) => (
                                <div
                                    key={task.id || idx}
                                    className="w-full h-[108px] bg-[#28583b] rounded-[20px] p-3 text-white/72 text-[16px] leading-[1.3] flex flex-col justify-between"
                                >
                                    <p className="line-clamp-4">
                                        {formatTaskType(task.task_type || task.title || task.type || 'Завершено')}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 4. ОТМЕНЕНО (13:2141, 245x351px, r:23px, #100f13, border #2c121a) */}
                <div className="w-full h-[351px] bg-[#100f13] border border-[#2c121a] rounded-[23px] p-2 flex flex-col">
                    <div className="px-1 pt-1 pb-2">
                        <span className="text-[16px] font-normal text-[#a17171] leading-tight">
                            Отменено
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
                        {safeCancelled.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-white/30 text-center px-4">
                                Срывов нет
                            </div>
                        ) : (
                            safeCancelled.map((task, idx) => (
                                <div
                                    key={task.id || idx}
                                    className="w-full h-[108px] bg-[#582828] rounded-[20px] p-3 text-white/72 text-[16px] leading-[1.3] flex flex-col justify-between"
                                >
                                    <p className="line-clamp-4">
                                        {formatTaskType(task.task_type || task.title || 'Отменено')}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

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
