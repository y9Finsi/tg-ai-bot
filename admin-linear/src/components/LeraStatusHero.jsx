import React from 'react';
import { 
    MapPin, 
    ArrowUpRight,
    MessageSquareQuote
} from 'lucide-react';
import { LOCATION_MAP } from '@/lib/simulationConstants.js';

export function LeraStatusHero({ snapshot, activeTask, onOpenMap }) {
    const state = snapshot?.state || {};
    const locId = state?.location_id || 'petrogradka_home';
    const loc = LOCATION_MAP[locId] || { name: 'Петроградка', district: 'СПб', icon: '🏠', shortName: 'Дом' };
    const transit = snapshot?.transit;
    const mood = state?.mood || 'спокойное';
    const selectedGoal = snapshot?.selected_goal;

    // Latest diary thought or fact
    const latestFact = Array.isArray(snapshot?.facts) && snapshot.facts.length > 0
        ? snapshot.facts[0]
        : null;
    const latestThought = latestFact?.event_text || latestFact?.raw_log || selectedGoal?.reason || 'Пьет чай на кухне и проверяет Telegram...';

    const isTraveling = Boolean(transit || activeTask?.task_type === 'TRAVEL');

    // Transit telemetry
    const progress = Math.min(100, Math.max(0, Number(transit?.progress_percent ?? 65)));
    const etaMin = transit?.eta_minutes ?? Math.max(1, Math.round((100 - progress) * 0.1));
    const distanceM = transit?.distance_meters ?? Math.round((100 - progress) * 12);
    const fromName = LOCATION_MAP[transit?.from]?.shortName || 'Слой';
    const toName = LOCATION_MAP[transit?.to]?.shortName || 'Дом';

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl px-3.5 py-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_32px_rgba(0,0,0,0.36)] select-none">
            
            {/* Identity & Location */}
            <div className="flex items-center gap-3 shrink-0">
                {/* Retina Avatar with Live Status Dot */}
                <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.1] overflow-hidden flex items-center justify-center shadow-inner">
                        <img 
                            src="/assets/lera_avatar.png" 
                            alt="Лера" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.parentElement) e.currentTarget.parentElement.innerText = 'Л';
                            }}
                        />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0e1013] animate-pulse" />
                </div>

                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xs font-semibold text-white tracking-tight">Лера</h1>
                        <span className="text-[11px] text-white/40 font-mono">19 лет · СПбГИК</span>
                    </div>
                    <button
                        onClick={onOpenMap}
                        className="group/loc flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors mt-0.5 cursor-pointer"
                        title="Открыть карту СПб"
                    >
                        <MapPin className="w-2.5 h-2.5 text-[#5e6ad2] stroke-[1.5]" />
                        <span className="font-medium text-white/80 group-hover/loc:underline underline-offset-2">{loc.name}</span>
                        <ArrowUpRight className="w-2.5 h-2.5 text-white/30 group-hover/loc:text-white transition-colors stroke-[1.5]" />
                        <span className="text-white/20 ml-0.5">·</span>
                        <span className="text-white/40 text-[10px] truncate max-w-[140px]">{loc.district}</span>
                    </button>
                </div>
            </div>

            {/* Context: Minimal Transit Progress OR Live Diary Thought */}
            <div className="min-w-0 flex-1 sm:max-w-md sm:ml-4">
                {isTraveling ? (
                    <div className="w-full">
                        <div className="flex items-center justify-between gap-3 text-xs mb-1.5 font-mono">
                            <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                                <span className="font-medium text-white truncate">{fromName}</span>
                                <span className="text-white/30">→</span>
                                <span className="text-white/80 truncate">{toName}</span>
                                <span className="text-[10px] text-white/40">пешком</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-white/50">
                                <span className="text-white font-medium">~{etaMin} мин</span>
                                <span className="text-white/20">·</span>
                                <span>{distanceM} м</span>
                            </div>
                        </div>
                        {/* 3px Anti-slop Route Track with Bead */}
                        <div className="relative w-full h-[3px] bg-white/[0.08] rounded-full overflow-visible">
                            <div 
                                className="h-full bg-sky-400 rounded-full" 
                                style={{ width: `${progress}%` }} 
                            />
                            <div 
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-[#0e1013] shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                style={{ left: `${progress}%` }} 
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-xs min-w-0 sm:justify-end">
                        <div className="flex items-center gap-1.5 min-w-0 text-white/60 italic text-[11px] truncate">
                            <MessageSquareQuote className="w-3 h-3 text-[#5e6ad2] stroke-[1.5] shrink-0" />
                            <span className="truncate">«{latestThought}»</span>
                        </div>
                        <span className="text-white/20 shrink-0">·</span>
                        <span className="text-[10px] font-mono text-white/40 shrink-0 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.04] capitalize">
                            {mood}
                        </span>
                    </div>
                )}
            </div>

        </div>
    );
}
