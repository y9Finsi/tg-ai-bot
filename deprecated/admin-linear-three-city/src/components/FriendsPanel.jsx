import React, { useState } from 'react';
import { 
    Users, 
    Flame, 
    Briefcase, 
    Zap, 
    Coffee 
} from 'lucide-react';
import { api } from '@/lib/api.js';

export function FriendsPanel({ npcs = {}, onActionTriggered, toast }) {
    const [loadingAction, setLoadingAction] = useState(null);

    const nastya = npcs?.nastya || { friendship_score: 85, drama_level: 30 };
    const maxClient = npcs?.max_client || { satisfaction: 75, deadline_urgency: 20 };

    async function handleGodAction(action, label) {
        setLoadingAction(action);
        try {
            await api('/api/admin/radiant/god-mode', {
                method: 'POST',
                body: JSON.stringify({ action })
            });
            toast?.(label, 'success');
            onActionTriggered?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setLoadingAction(null);
        }
    }

    async function handleInviteTask(taskType, targetLocation, label) {
        setLoadingAction(taskType);
        try {
            await api('/api/admin/radiant/queue/push', {
                method: 'POST',
                body: JSON.stringify({
                    taskType,
                    targetLocation,
                    durationMinutes: 45,
                    priority: 75
                })
            });
            toast?.(`Запланировано: ${label}`, 'success');
            onActionTriggered?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setLoadingAction(null);
        }
    }

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#5e6ad2] stroke-[1.5]" />
                    <h3 className="text-sm font-semibold text-white tracking-tight">Друзья Леры</h3>
                </div>
                <span className="text-[10px] text-white/50 font-mono">Социальный круг</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. НАСТЯ */}
                <div className="rounded-lg bg-white/[0.015] border border-white/[0.04] p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-xs font-semibold text-rose-300">
                                Н
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-white">Настя</h4>
                                <span className="text-[10px] text-white/50">Подруга · СПбГИК</span>
                            </div>
                        </div>

                        {nastya.drama_level > 50 && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 animate-pulse">
                                <Flame className="w-2.5 h-2.5 stroke-[1.5]" />
                                Драма
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-black/25 px-2 py-1 rounded border border-white/[0.03]">
                            <span className="text-white/50 block text-[9px] uppercase">Дружба</span>
                            <span className="text-emerald-400 font-medium">{nastya.friendship_score ?? 85}%</span>
                        </div>
                        <div className="bg-black/25 px-2 py-1 rounded border border-white/[0.03]">
                            <span className="text-white/50 block text-[9px] uppercase">Драма</span>
                            <span className={nastya.drama_level > 40 ? 'text-rose-400 font-medium' : 'text-white/60'}>
                                {nastya.drama_level ?? 25}%
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                            onClick={() => handleGodAction('NASTYA_DRAMA_50', 'Драма Насти (+50%)')}
                            disabled={loadingAction === 'NASTYA_DRAMA_50'}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-[11px] font-medium transition-[background-color,border-color,transform] active:scale-[0.96]"
                        >
                            <Flame className="w-3 h-3 stroke-[1.5]" />
                            <span>Драма</span>
                        </button>
                        <button
                            onClick={() => handleInviteTask('HANG_NASTYA', 'cafe_sloy', 'Встреча в «Слое»')}
                            disabled={loadingAction === 'HANG_NASTYA'}
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-white/80 text-[11px] transition-[background-color,border-color,transform] active:scale-[0.96]"
                            title="Позвать в «Слой»"
                        >
                            <Coffee className="w-3 h-3 text-amber-300 stroke-[1.5]" />
                            <span>В «Слой»</span>
                        </button>
                    </div>
                </div>

                {/* 2. МАКС (КЛИЕНТ) */}
                <div className="rounded-lg bg-white/[0.015] border border-white/[0.04] p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-xs font-semibold text-blue-300">
                                М
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-white">Макс</h4>
                                <span className="text-[10px] text-white/50">Шоурум на ВО</span>
                            </div>
                        </div>

                        {maxClient.deadline_urgency > 60 && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                Срочно
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-black/25 px-2 py-1 rounded border border-white/[0.03]">
                            <span className="text-white/50 block text-[9px] uppercase">Доверие</span>
                            <span className="text-blue-400 font-medium">{maxClient.satisfaction ?? 75}%</span>
                        </div>
                        <div className="bg-black/25 px-2 py-1 rounded border border-white/[0.03]">
                            <span className="text-white/50 block text-[9px] uppercase">Дедлайн</span>
                            <span className={maxClient.deadline_urgency > 50 ? 'text-amber-400 font-medium' : 'text-white/60'}>
                                {maxClient.deadline_urgency ?? 20}%
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                            onClick={() => handleGodAction('MAX_DEADLINE', 'Дедлайн Макса (100%)')}
                            disabled={loadingAction === 'MAX_DEADLINE'}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-[11px] font-medium transition-[background-color,border-color,transform] active:scale-[0.96]"
                        >
                            <Zap className="w-3 h-3 stroke-[1.5]" />
                            <span>Дедлайн</span>
                        </button>
                        <button
                            onClick={() => handleInviteTask('WORK_SHOWROOM', 'showroom_work', 'Смена в шоуруме')}
                            disabled={loadingAction === 'WORK_SHOWROOM'}
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-white/80 text-[11px] transition-[background-color,border-color,transform] active:scale-[0.96]"
                            title="Отправить в шоурум"
                        >
                            <Briefcase className="w-3 h-3 text-sky-400 stroke-[1.5]" />
                            <span>В шоурум</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
