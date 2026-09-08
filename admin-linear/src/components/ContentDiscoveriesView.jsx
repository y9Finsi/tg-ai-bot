import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, RefreshCw, ExternalLink, Check, X,
    Archive, Sparkles, Film, Image as ImageIcon, Music,
    FileText, Globe, Send, AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api.js';

const STATUS_FILTERS = [
    { id: 'ALL', label: 'Все' },
    { id: 'DISCOVERED', label: 'Новые' },
    { id: 'SAVED', label: 'В банке' },
    { id: 'REJECTED', label: 'Отклоненные' },
    { id: 'EXPIRED', label: 'Архив' }
];

const CATEGORY_ICONS = {
    video: Film,
    photo: ImageIcon,
    meme: Sparkles,
    music: Music,
    telegram: Send,
    news: Globe
};

export function ContentDiscoveriesView({ toast }) {
    const [discoveries, setDiscoveries] = useState([]);
    const [counts, setCounts] = useState({ total: 0, discovered: 0, saved: 0, rejected: 0, expired: 0 });
    const [loading, setLoading] = useState(false);
    const [sources, setSources] = useState([]);

    // Filters
    const [selectedStatus, setSelectedStatus] = useState('DISCOVERED');
    const [selectedSourceId, setSelectedSourceId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Action states
    const [actionLoadingId, setActionLoadingId] = useState(null);

    const loadSources = useCallback(async () => {
        try {
            const res = await api('/api/admin/content/sources');
            if (res?.sources) setSources(res.sources);
        } catch {
            // silent
        }
    }, []);

    const loadDiscoveries = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedStatus && selectedStatus !== 'ALL') params.set('status', selectedStatus);
            if (selectedSourceId) params.set('source_id', selectedSourceId);
            if (searchQuery.trim()) params.set('q', searchQuery.trim());

            const url = '/api/admin/content/discoveries' + (params.toString() ? `?${params.toString()}` : '');
            const res = await api(url);
            if (res?.discoveries) {
                setDiscoveries(res.discoveries);
            }
            if (res?.counts) {
                setCounts(res.counts);
            }
        } catch (err) {
            if (toast) toast('Ошибка загрузки находок: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedStatus, selectedSourceId, searchQuery, toast]);

    useEffect(() => {
        loadSources();
    }, [loadSources]);

    useEffect(() => {
        loadDiscoveries();
    }, [loadDiscoveries]);

    const handleAction = async (id, action, rejectionReason = null) => {
        setActionLoadingId(id);
        try {
            const options = { method: 'POST' };
            if (rejectionReason) {
                options.body = JSON.stringify({ rejection_reason: rejectionReason });
            }
            await api(`/api/admin/content/discoveries/${id}/${action}`, options);
            if (action === 'approve') {
                if (toast) toast('Материал перенесён в банк контента Леры', 'success');
            } else if (action === 'reject') {
                if (toast) toast('Находка отклонена', 'success');
            } else if (action === 'expire') {
                if (toast) toast('Находка перемещена в архив', 'success');
            }
            await loadDiscoveries();
        } catch (err) {
            if (toast) toast(`Ошибка действия: ${err.message}`, 'error');
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <div className="w-full flex flex-col gap-5">
            {/* Top Filter Bar: Status Badges */}
            <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                    {STATUS_FILTERS.map(f => {
                        const isActive = selectedStatus === f.id;
                        let count = counts.total;
                        if (f.id === 'DISCOVERED') count = counts.discovered;
                        if (f.id === 'SAVED') count = counts.saved;
                        if (f.id === 'REJECTED') count = counts.rejected;
                        if (f.id === 'EXPIRED') count = counts.expired;

                        return (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setSelectedStatus(f.id)}
                                className={`h-[38px] px-3.5 rounded-[12px] text-[14px] font-medium flex items-center gap-2 cursor-pointer transition-all border ${
                                    isActive
                                        ? 'bg-[#292e5e] border-[#434771] text-white shadow-inner'
                                        : 'bg-[#181818] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <span>{f.label}</span>
                                <span className={`text-[12px] px-1.5 py-0.2 rounded-full ${
                                    isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40'
                                }`}>
                                    {count ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={loadDiscoveries}
                        disabled={loading}
                        title="Обновить находки"
                        className="h-[38px] w-[38px] rounded-full bg-[#1b1d22] border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center cursor-pointer active:scale-95"
                    >
                        <RefreshCw className={`w-4 h-4 stroke-[1.5] ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Sub-bar: Search & Source filter */}
            <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[260px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Поиск по заголовку или тексту находки..."
                        className="w-full pl-10 pr-4 py-2 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] placeholder:text-white/30 focus:outline-none focus:border-[#434771]"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedSourceId}
                        onChange={e => setSelectedSourceId(e.target.value)}
                        className="h-[38px] px-3 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] focus:outline-none focus:border-[#434771] cursor-pointer"
                    >
                        <option value="">Все источники</option>
                        {sources.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.source_type})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Discoveries List */}
            {loading && discoveries.length === 0 ? (
                <div className="w-full h-64 flex flex-col items-center justify-center gap-2 text-white/50">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#8693ff]" />
                    <span className="text-[14px]">Загрузка находок...</span>
                </div>
            ) : discoveries.length === 0 ? (
                <div className="w-full rounded-[23px] bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <AlertCircle className="w-8 h-8 text-white/30 mb-1" />
                    <span className="text-[16px] font-medium text-white">Находок не найдено</span>
                    <p className="text-[14px] text-white/45 max-w-sm">
                        {searchQuery
                            ? 'По вашему запросу ничего не найдено.'
                            : 'В этой категории пока нет находок. Запустите сбор во вкладке «Источники».'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {discoveries.map(item => {
                        const Icon = CATEGORY_ICONS[item.category] || Globe;
                        const isActionRunning = actionLoadingId === item.id;
                        const isDiscovered = item.lifecycle_status === 'DISCOVERED';
                        const isSaved = item.lifecycle_status === 'SAVED';
                        const isRejected = item.lifecycle_status === 'REJECTED';
                        const isExpired = item.lifecycle_status === 'EXPIRED';

                        return (
                            <div
                                key={item.id}
                                className={`rounded-[22px] p-4 flex flex-col justify-between gap-3 bg-gradient-to-b from-[#181818] to-[#1c1c1c]/70 border transition-all ${
                                    isDiscovered
                                        ? 'border-white/15 hover:border-white/25'
                                        : 'border-white/5 opacity-70'
                                }`}
                            >
                                {/* Header: Category, Source & Date */}
                                <div className="flex items-center justify-between gap-2 text-[12px]">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="w-6 h-6 rounded-[7px] bg-[#252525] border border-white/10 flex items-center justify-center shrink-0 text-white/80">
                                            <Icon className="w-3.5 h-3.5 stroke-[1.5]" />
                                        </div>
                                        <span className="text-white/70 font-medium truncate">
                                            {item.source_name || 'Источник'}
                                        </span>
                                        {item.category && (
                                            <span className="px-2 py-0.5 rounded-[6px] bg-white/5 text-white/40 text-[11px]">
                                                {item.category}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {Number(item.quality_score || 0) > 0 && (
                                            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                                                ★ {item.quality_score}
                                            </span>
                                        )}
                                        <span className="text-white/40 text-[11px]">
                                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                                        </span>
                                    </div>
                                </div>

                                {/* Title & Text snippet */}
                                <div className="flex gap-3 items-start">
                                    {item.metadata?.thumbnail && (
                                        <img
                                            src={item.metadata.thumbnail}
                                            alt=""
                                            className="w-14 h-14 rounded-[12px] object-cover border border-white/10 shrink-0 shadow-sm"
                                            onError={e => { e.target.style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                                        <h4 className="text-[15px] font-medium text-white line-clamp-2 leading-snug">
                                            {item.title || 'Без названия'}
                                        </h4>
                                        {item.metadata?.artists && (
                                            <span className="text-[12px] text-indigo-300 font-medium truncate">
                                                {item.metadata.artists}
                                            </span>
                                        )}
                                        {item.raw_text && (
                                            <p className="text-[13px] text-white/60 line-clamp-2 leading-relaxed">
                                                {item.raw_text}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Link & Status badge */}
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-[12px]">
                                    {item.canonical_url ? (
                                        <a
                                            href={item.canonical_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1 truncate max-w-[220px]"
                                        >
                                            <span className="truncate">{item.canonical_url}</span>
                                            <ExternalLink className="w-3 h-3 shrink-0" />
                                        </a>
                                    ) : (
                                        <span className="text-white/30">—</span>
                                    )}

                                    {/* Action buttons if DISCOVERED */}
                                    {isDiscovered ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleAction(item.id, 'approve')}
                                                disabled={isActionRunning}
                                                title="Принять в банк контента Леры"
                                                className="px-3 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[12px] font-medium transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
                                            >
                                                <Check className="w-3.5 h-3.5 stroke-[2]" />
                                                <span>В банк</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleAction(item.id, 'reject')}
                                                disabled={isActionRunning}
                                                title="Отклонить находку"
                                                className="px-2.5 py-1 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-[12px] transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
                                            >
                                                <X className="w-3.5 h-3.5 stroke-[2]" />
                                                <span>Отклонить</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleAction(item.id, 'expire')}
                                                disabled={isActionRunning}
                                                title="В архив"
                                                className="p-1 text-white/40 hover:text-white transition-colors cursor-pointer rounded hover:bg-white/5"
                                            >
                                                <Archive className="w-3.5 h-3.5 stroke-[1.5]" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {isSaved && (
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                                                    В банке {item.lera_content_id ? `#${item.lera_content_id}` : ''}
                                                </span>
                                            )}
                                            {isRejected && (
                                                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px]">
                                                    Отклонено {item.rejection_reason ? `(${item.rejection_reason})` : ''}
                                                </span>
                                            )}
                                            {isExpired && (
                                                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-[11px]">
                                                    Архив
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default ContentDiscoveriesView;
