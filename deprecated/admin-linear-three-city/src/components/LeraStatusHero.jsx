import React from 'react';
import { 
    MapPin, 
    Navigation, 
    Heart, 
    MessageSquareQuote, 
    Shirt, 
    ChevronRight,
    ArrowUpRight
} from 'lucide-react';
import { LOCATION_MAP, formatTaskType } from '@/lib/simulationConstants.js';

export function LeraStatusHero({ snapshot, activeTask, onOpenMap }) {
    const state = snapshot?.state || {};
    const locId = state?.location_id || 'petrogradka_home';
    const loc = LOCATION_MAP[locId] || { name: 'Петроградка', district: 'СПб', icon: '🏠', shortName: 'Дом' };
    const transit = snapshot?.transit;
    const mood = state?.mood || 'спокойное';
    const selectedGoal = snapshot?.selected_goal;
    const outfit = snapshot?.outfit;

    // Latest diary thought or fact
    const latestFact = Array.isArray(snapshot?.facts) && snapshot.facts.length > 0
        ? snapshot.facts[0]
        : null;
    const latestThought = latestFact?.event_text || latestFact?.raw_log || selectedGoal?.reason || 'Пьет воду и проверяет Telegram...';

    const isTraveling = Boolean(transit || activeTask?.task_type === 'TRAVEL');

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3.5 sm:p-4 relative overflow-hidden">
            {/* Subtle atmospheric glow */}
            <div className="absolute top-0 right-0 w-80 h-32 bg-gradient-to-bl from-[#5e6ad2]/5 via-transparent to-transparent pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                {/* Profile info & current activity */}
                <div className="space-y-2.5 max-w-xl w-full">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-sm font-semibold text-white shrink-0 shadow-inner">
                            Л
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm font-semibold text-white tracking-tight">Лера</h1>
                                <span className="text-[11px] text-white/40">19 лет · СПбГИК</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-white/50">
                                <button
                                    onClick={onOpenMap}
                                    className="group/loc flex items-center gap-1 text-white/80 hover:text-white transition-colors"
                                >
                                    <MapPin className="w-3 h-3 text-[#5e6ad2] stroke-[1.5]" />
                                    <span className="font-medium underline-offset-2 group-hover/loc:underline">{loc.name}</span>
                                    <ArrowUpRight className="w-2.5 h-2.5 text-white/40 group-hover/loc:text-white transition-colors stroke-[1.5]" />
                                </button>
                                <span className="text-white/25">·</span>
                                <span className="text-white/50 truncate">{loc.district}</span>
                            </div>
                        </div>
                    </div>

                    {/* Current Activity Banner */}
                    <div className="pt-1">
                        {isTraveling ? (
                            <div className="flex flex-col gap-2 p-3 rounded-lg bg-sky-500/[0.06] border border-sky-500/20 text-xs">
                                <div className="flex items-center justify-between text-sky-300 font-medium">
                                    <span className="flex items-center gap-1.5">
                                        <Navigation className="w-3.5 h-3.5 animate-pulse stroke-[1.5]" />
                                        <span>Транзит: {LOCATION_MAP[transit?.from]?.shortName || 'Выезд'} → {LOCATION_MAP[transit?.to]?.shortName || 'Прибытие'}</span>
                                    </span>
                                    <span className="font-mono text-[11px]">{transit?.progress_percent || 50}%</span>
                                </div>
                                <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/[0.04]">
                                    <div
                                        className="bg-sky-400 h-full transition-[width] duration-300 rounded-full"
                                        style={{ width: `${transit?.progress_percent || 50}%` }}
                                    />
                                </div>
                            </div>
                        ) : activeTask ? (
                            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                                <span className="w-2 h-2 rounded-full bg-[#5e6ad2] animate-pulse shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] uppercase tracking-wider text-white/50 font-mono block">Фокус сейчас</span>
                                    <span className="text-xs font-semibold text-white truncate block">
                                        {formatTaskType(activeTask.task_type || activeTask.title || activeTask.name)}
                                    </span>
                                </div>
                                {activeTask.remaining_minutes !== undefined && (
                                    <span className="text-[11px] font-mono text-white/50 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06] shrink-0">
                                        ~{activeTask.remaining_minutes}м
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-xs text-white/50 p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04]">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                                <span>Свободна · отдыхает или листает ленту на Петроградке</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mood and details badges - rounded-full distinct from controls */}
                <div className="flex sm:flex-col items-end gap-2 shrink-0 self-start sm:self-auto">
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs select-none">
                        <Heart className="w-3 h-3 text-rose-400 stroke-[1.5]" />
                        <span className="text-white/50 text-[11px]">Вайб:</span>
                        <span className="font-medium text-white/90 capitalize">{mood}</span>
                    </div>

                    {outfit && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/60 max-w-[180px] truncate select-none">
                            <Shirt className="w-3 h-3 text-white/40 stroke-[1.5] shrink-0" />
                            <span className="truncate">{outfit}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Thoughts / Log strip */}
            <div className="mt-3.5 pt-3 border-t border-white/[0.04] flex items-start gap-2.5 text-xs text-white/60">
                <MessageSquareQuote className="w-3.5 h-3.5 text-[#5e6ad2] stroke-[1.5] shrink-0 mt-0.5" />
                <div className="italic text-white/70 line-clamp-1">
                    «{latestThought}»
                </div>
            </div>
        </div>
    );
}
