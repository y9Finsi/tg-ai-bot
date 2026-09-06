import React, { useState, useMemo } from 'react';
import { 
    ScrollText, 
    Zap, 
    Compass, 
    Package, 
    BrainCircuit, 
    MessageSquare, 
    Search, 
    ChevronDown, 
    ChevronRight, 
    Copy, 
    Check, 
    Clock, 
    RefreshCw,
    X
} from 'lucide-react';

const CATEGORIES = [
    { id: 'all', label: 'Все', icon: ScrollText },
    { id: 'ACTIONS', label: 'Действия', icon: Zap },
    { id: 'TRAVEL', label: 'Перемещения', icon: Compass },
    { id: 'INVENTORY', label: 'Инвентарь', icon: Package },
    { id: 'DECISIONS', label: 'Решения', icon: BrainCircuit },
    { id: 'SOCIAL', label: 'Общение', icon: MessageSquare }
];

const BADGE_STYLES = {
    ACTIONS: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    TRAVEL: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    INVENTORY: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    DECISIONS: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    SOCIAL: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    DEFAULT: 'bg-white/[0.04] text-[#8a8f98] border-white/[0.08]'
};

const CATEGORY_ICONS = {
    ACTIONS: Zap,
    TRAVEL: Compass,
    INVENTORY: Package,
    DECISIONS: BrainCircuit,
    SOCIAL: MessageSquare,
    DEFAULT: ScrollText
};

const STAT_LABELS = {
    fatigue: 'Бодрость',
    hunger: 'Сытость',
    mood: 'Вайб',
    boredom: 'Фан',
    hygiene: 'Чистота',
    bladder: 'Туалет',
    horny: 'Либидо',
    warmth: 'Тепло',
    rain_resist: 'Влагозащита'
};

function extractEventStats(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const stats = [];
    if (payload.deltas && typeof payload.deltas === 'object') {
        for (const [k, v] of Object.entries(payload.deltas)) {
            const num = Number(v);
            if (!isNaN(num)) {
                const isGood = k === 'mood' ? num > 0 : num < 0;
                stats.push({
                    key: k,
                    label: STAT_LABELS[k] || k,
                    value: num > 0 ? `+${num}` : `${num}`,
                    color: isGood ? 'text-emerald-400' : 'text-sky-400'
                });
            }
        }
    }
    if (payload.warmth) {
        stats.push({
            key: 'warmth',
            label: 'Тепло',
            value: `+${payload.warmth}`,
            color: 'text-amber-400'
        });
    }
    if (payload.rain_resist) {
        stats.push({
            key: 'rain_resist',
            label: 'Влагозащита',
            value: '✓',
            color: 'text-cyan-400'
        });
    }
    return stats;
}

function formatRelativeTime(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        
        if (diffMins < 1) return 'только что';
        if (diffMins < 60) return `${diffMins}м назад`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}ч назад`;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function formatExactTime(dateString) {
    if (!dateString) return '';
    try {
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return '';
    }
}

export function DecisionsHistoryPanel({ snapshot, onRefresh, toast }) {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Pull events from snapshot (rationale array or facts array)
    const rawEvents = useMemo(() => {
        const rationale = Array.isArray(snapshot?.rationale) ? snapshot.rationale : [];
        const facts = Array.isArray(snapshot?.facts) ? snapshot.facts : [];

        // Normalize rationale traces
        const normalizedRationale = rationale.map((r, idx) => ({
            id: r.id || `rat_${idx}`,
            created_at: r.created_at || r.timestamp || new Date().toISOString(),
            category: String(r.category || 'DECISIONS').toUpperCase(),
            title: r.title || 'Решение Radiant',
            explanation: r.explanation || '',
            payload: r.payload || {}
        }));

        // Normalize facts as actions/events if needed
        const normalizedFacts = facts
            .filter(f => !normalizedRationale.some(r => r.title === f.event_text))
            .map(f => ({
                id: `fact_${f.id}`,
                created_at: f.occurred_at || new Date().toISOString(),
                category: f.payload?.taskType === 'TRAVEL' ? 'TRAVEL' : (f.payload?.itemId ? 'INVENTORY' : 'ACTIONS'),
                title: f.event_text || f.event_type || 'Событие симуляции',
                explanation: f.payload?.reason || f.payload?.explanation || '',
                payload: f.payload || {}
            }));

        const combined = [...normalizedRationale, ...normalizedFacts];
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return combined;
    }, [snapshot?.rationale, snapshot?.facts]);

    // Compute category counts
    const categoryCounts = useMemo(() => {
        const counts = { all: rawEvents.length };
        for (const cat of CATEGORIES) {
            if (cat.id === 'all') continue;
            counts[cat.id] = rawEvents.filter(e => e.category === cat.id).length;
        }
        return counts;
    }, [rawEvents]);

    // Filter events
    const filteredEvents = useMemo(() => {
        return rawEvents.filter(event => {
            const matchesCategory = selectedCategory === 'all' || event.category === selectedCategory;
            if (!matchesCategory) return false;
            if (!searchQuery.trim()) return true;

            const q = searchQuery.toLowerCase().trim();
            const inTitle = (event.title || '').toLowerCase().includes(q);
            const inExplanation = (event.explanation || '').toLowerCase().includes(q);
            const inPayload = JSON.stringify(event.payload || {}).toLowerCase().includes(q);
            return inTitle || inExplanation || inPayload;
        });
    }, [rawEvents, selectedCategory, searchQuery]);

    const handleCopyPayload = (item, e) => {
        e.stopPropagation();
        const jsonStr = JSON.stringify(item.payload, null, 2);
        navigator.clipboard.writeText(jsonStr)
            .then(() => {
                setCopiedId(item.id);
                setTimeout(() => setCopiedId(null), 1800);
            })
            .catch(() => {});
    };

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            await onRefresh?.();
        } finally {
            setTimeout(() => setIsRefreshing(false), 400);
        }
    };

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3 sm:px-4 sm:py-3.5 relative overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_32px_rgba(0,0,0,0.36)] select-none">
            
            {/* Top Bar Header */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70 shadow-inner">
                        <ScrollText className="w-3.5 h-3.5 stroke-[1.5]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-[11px] font-semibold tracking-wider text-white uppercase">
                            История решений Radiant
                        </h2>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[#8a8f98] bg-white/[0.03] border border-white/[0.06]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                            <span>{rawEvents.length} событий</span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Search Input */}
                    <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-white/30 absolute left-2 pointer-events-none stroke-[1.5]" />
                        <input
                            type="text"
                            placeholder="Фильтр логов..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-6 pl-6 pr-6 w-32 sm:w-44 text-[11px] bg-white/[0.03] border border-white/[0.06] focus:border-white/20 focus:bg-white/[0.05] rounded text-white placeholder-white/25 outline-none transition-all duration-150"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-1.5 text-white/30 hover:text-white/70"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        title="Обновить журнал решений"
                        className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] text-white/60 hover:text-white transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3 h-3 stroke-[1.5] ${isRefreshing ? 'animate-spin text-white' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Linear Segmented Category Control */}
            <div className="pb-2.5 mb-2.5 border-b border-white/[0.04] overflow-x-auto scrollbar-none">
                <nav className="inline-flex items-center p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06] gap-0.5">
                    {CATEGORIES.map(cat => {
                        const count = categoryCounts[cat.id] || 0;
                        const isActive = selectedCategory === cat.id;
                        const Icon = cat.icon;

                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96] whitespace-nowrap cursor-pointer ${
                                    isActive
                                        ? 'bg-white/[0.08] text-white shadow-sm border border-white/[0.08]'
                                        : 'text-white/50 hover:text-white/80 border border-transparent'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5 stroke-[1.5] opacity-80" />
                                <span>{cat.label}</span>
                                <span className={`text-[10px] font-mono px-1 rounded ${
                                    isActive ? 'bg-white/10 text-white' : 'text-white/30'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Event List (Fixed Height with Custom Scroll) */}
            <div className="h-[280px] overflow-y-auto space-y-1 pr-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {filteredEvents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8a8f98]">
                        <ScrollText className="w-7 h-7 stroke-[1.2] opacity-30 mb-2" />
                        <span className="text-xs">Событий в этой категории пока нет</span>
                        {searchQuery && (
                            <span className="text-[11px] text-white/40 mt-1">Попробуйте изменить поисковый запрос</span>
                        )}
                    </div>
                ) : (
                    filteredEvents.map((item) => {
                        const isExpanded = expandedId === item.id;
                        const cat = item.category || 'DEFAULT';
                        const badgeStyle = BADGE_STYLES[cat] || BADGE_STYLES.DEFAULT;
                        const CatIcon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.DEFAULT;
                        const relTime = formatRelativeTime(item.created_at);
                        const exactTime = formatExactTime(item.created_at);
                        const hasPayload = item.payload && Object.keys(item.payload).length > 0;
                        const eventStats = extractEventStats(item.payload);

                        return (
                            <div
                                key={item.id}
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                className={`rounded-lg border transition-all duration-150 cursor-pointer ${
                                    isExpanded 
                                        ? 'bg-white/[0.03] border-white/15' 
                                        : 'bg-white/[0.015] hover:bg-white/[0.025] border-white/[0.04]'
                                }`}
                            >
                                <div className="p-2.5 flex items-center justify-between gap-3">
                                    {/* Left: Fixed Icon Anchor + Title & Subtitle (never shifts) */}
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        {/* Fixed visual anchor: Category Icon */}
                                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${badgeStyle}`}>
                                            <CatIcon className="w-3.5 h-3.5 stroke-[1.5]" />
                                        </div>

                                        {/* Title and Context */}
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-[12px] font-medium text-white/95 leading-snug truncate">
                                                {item.title}
                                            </h4>
                                            {item.explanation && (
                                                <p className="text-[11px] text-[#8a8f98] font-normal leading-tight truncate mt-0.5">
                                                    {item.explanation}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Need Changes / Deltas + Category Badge + Time + Chevron */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* Quick Stat / Need Deltas tags */}
                                        {eventStats.length > 0 && (
                                            <div className="hidden sm:flex items-center gap-1">
                                                {eventStats.map((st, i) => (
                                                    <span 
                                                        key={i} 
                                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-white/80 inline-flex items-center gap-1 whitespace-nowrap"
                                                    >
                                                        <span className={st.color}>{st.value}</span>
                                                        <span className="text-white/40 text-[9px]">{st.label}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Category Badge (Right-aligned, never pushes title) */}
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border tracking-wider shrink-0 whitespace-nowrap ${badgeStyle}`}>
                                            {item.category}
                                        </div>

                                        {/* Timestamp */}
                                        <span className="text-[10px] font-mono text-[#8a8f98] shrink-0 min-w-[48px] text-right" title={`${item.created_at} (${exactTime})`}>
                                            {relTime}
                                        </span>

                                        {/* Chevron */}
                                        <div className="w-4 h-4 rounded flex items-center justify-center text-white/40 group-hover:text-white">
                                            {isExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5 stroke-[1.5]" />
                                            ) : (
                                                <ChevronRight className="w-3.5 h-3.5 stroke-[1.5]" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Payload Drawer */}
                                {isExpanded && (
                                    <div className="px-3 pb-3 pt-2 border-t border-white/[0.04] bg-black/30 space-y-2 animate-in fade-in duration-100">
                                        {/* Full Explanation if exists */}
                                        {item.explanation && (
                                            <div className="text-xs text-white/80 leading-relaxed bg-white/[0.02] border border-white/[0.04] rounded p-2">
                                                <span className="text-[#8a8f98] text-[10px] block mb-0.5 uppercase tracking-wider font-mono">Контекст решения:</span>
                                                {item.explanation}
                                            </div>
                                        )}

                                        {/* Mobile stats tag line if hidden on mobile */}
                                        {eventStats.length > 0 && (
                                            <div className="flex sm:hidden items-center gap-1.5 flex-wrap pt-0.5">
                                                <span className="text-[10px] text-white/40 font-mono">Эффекты:</span>
                                                {eventStats.map((st, i) => (
                                                    <span 
                                                        key={i} 
                                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-white/80 inline-flex items-center gap-1"
                                                    >
                                                        <span className={st.color}>{st.value}</span>
                                                        <span className="text-white/40 text-[9px]">{st.label}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-[10px] font-mono text-[#8a8f98]">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3 stroke-[1.5]" />
                                                {item.created_at}
                                            </span>
                                            {hasPayload && (
                                                <button
                                                    onClick={(e) => handleCopyPayload(item, e)}
                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-colors"
                                                >
                                                    {copiedId === item.id ? (
                                                        <>
                                                            <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[2]" />
                                                            <span className="text-emerald-400">Скопировано</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-2.5 h-2.5 stroke-[1.5]" />
                                                            <span>Копировать JSON</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>

                                        {hasPayload ? (
                                            <pre className="text-[11px] font-mono text-zinc-300 bg-black/50 border border-white/[0.05] rounded p-2 overflow-x-auto select-text leading-relaxed">
                                                {JSON.stringify(item.payload, null, 2)}
                                            </pre>
                                        ) : (
                                            <div className="text-[11px] text-[#8a8f98] italic">
                                                Дополнительных метаданных нет
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
