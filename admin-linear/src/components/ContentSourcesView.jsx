import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, RefreshCw, Trash2, Globe, Send, Film,
    Check, X, AlertTriangle, ExternalLink, Play, Radio
} from 'lucide-react';
import { api } from '@/lib/api.js';

const SOURCE_TYPE_LABELS = {
    telegram: 'Telegram',
    rss: 'RSS / Atom',
    youtube: 'YouTube'
};

const SOURCE_TYPE_ICONS = {
    telegram: Send,
    rss: Globe,
    youtube: Film
};

export function ContentSourcesView({ toast }) {
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(false);
    const [runningId, setRunningId] = useState(null);
    const [runningAll, setRunningAll] = useState(false);

    // Modal add source
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [sourceType, setSourceType] = useState('telegram');
    const [urlOrHandle, setUrlOrHandle] = useState('');
    const [topicsInput, setTopicsInput] = useState('');

    const loadSources = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api('/api/admin/content/sources');
            if (res?.sources) {
                setSources(res.sources);
            }
        } catch (err) {
            if (toast) toast('Ошибка загрузки источников: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadSources();
    }, [loadSources]);

    const handleRunScrape = async (sourceId) => {
        setRunningId(sourceId);
        try {
            const res = await api(`/api/admin/content/sources/${sourceId}/run`, { method: 'POST' });
            if (toast) {
                toast(`Сбор завершён: найдено ${res.found}, новых находок ${res.added}`, 'success');
            }
            await loadSources();
        } catch (err) {
            if (toast) toast('Ошибка сбора: ' + err.message, 'error');
            await loadSources();
        } finally {
            setRunningId(null);
        }
    };

    const handleToggleEnabled = async (source) => {
        try {
            await api(`/api/admin/content/sources/${source.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ enabled: !source.enabled })
            });
            if (toast) toast(`Источник «${source.name}» ${!source.enabled ? 'включён' : 'приостановлен'}`, 'success');
            await loadSources();
        } catch (err) {
            if (toast) toast('Ошибка изменения статуса: ' + err.message, 'error');
        }
    };

    const handleDeleteSource = async (sourceId, sourceName) => {
        if (!confirm(`Удалить источник «${sourceName}»? Все связанные находки останутся в базе.`)) return;
        try {
            await api(`/api/admin/content/sources/${sourceId}`, { method: 'DELETE' });
            if (toast) toast('Источник удалён', 'success');
            setSources(prev => prev.filter(s => s.id !== sourceId));
        } catch (err) {
            if (toast) toast('Ошибка удаления источника: ' + err.message, 'error');
        }
    };

    const handleSaveSource = async (e) => {
        e.preventDefault();
        if (!name.trim() || !urlOrHandle.trim()) {
            if (toast) toast('Заполните название и адрес источника', 'error');
            return;
        }

        const topics = topicsInput
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);

        setSaving(true);
        try {
            await api('/api/admin/content/sources', {
                method: 'POST',
                body: JSON.stringify({
                    name: name.trim(),
                    source_type: sourceType,
                    url_or_handle: urlOrHandle.trim(),
                    topics
                })
            });
            if (toast) toast('Источник успешно добавлен', 'success');
            setModalOpen(false);
            setName('');
            setUrlOrHandle('');
            setTopicsInput('');
            await loadSources();
        } catch (err) {
            if (toast) toast('Ошибка добавления: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full flex flex-col gap-5">
            {/* Header controls */}
            <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <span className="text-[14px] text-white/50">
                        Всего источников: <strong className="text-white font-medium">{sources.length}</strong>
                    </span>
                    <span className="text-[14px] text-emerald-400/80">
                        Активных: <strong className="text-emerald-400 font-medium">{sources.filter(s => s.enabled).length}</strong>
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={loadSources}
                        disabled={loading}
                        title="Обновить список"
                        className="h-[38px] w-[38px] rounded-full bg-[#1b1d22] border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center cursor-pointer active:scale-95"
                    >
                        <RefreshCw className={`w-4 h-4 stroke-[1.5] ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[15px] font-normal flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                    >
                        <span>Добавить источник</span>
                        <Plus className="w-4 h-4 text-white stroke-[1.5]" />
                    </button>
                </div>
            </div>

            {/* Sources List */}
            {loading && sources.length === 0 ? (
                <div className="w-full h-64 flex flex-col items-center justify-center gap-2 text-white/50">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#8693ff]" />
                    <span className="text-[14px]">Загрузка источников...</span>
                </div>
            ) : sources.length === 0 ? (
                <div className="w-full rounded-[23px] bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <Radio className="w-8 h-8 text-white/30 mb-1" />
                    <span className="text-[16px] font-medium text-white">Источники не добавлены</span>
                    <p className="text-[14px] text-white/45 max-w-sm">
                        Добавьте каналы Telegram, RSS-ленты или YouTube-каналы, чтобы бот автоматически собирал контент.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {sources.map(source => {
                        const Icon = SOURCE_TYPE_ICONS[source.source_type] || Globe;
                        const isRunning = runningId === source.id;
                        const hasErrors = (source.consecutive_errors || 0) > 0;

                        return (
                            <div
                                key={source.id}
                                className={`rounded-[20px] p-4 flex flex-col justify-between gap-3 transition-all bg-gradient-to-b from-[#181818] to-[#1e1e1e]/60 border ${
                                    source.enabled ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-60'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                        <div className="w-8 h-8 rounded-[10px] bg-[#242424] border border-white/10 flex items-center justify-center shrink-0 text-white/80">
                                            <Icon className="w-4 h-4 stroke-[1.5]" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[15px] font-medium text-white truncate">
                                                {source.name}
                                            </span>
                                            <span className="text-[12px] text-white/40 font-mono truncate">
                                                {source.url_or_handle}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleEnabled(source)}
                                            title={source.enabled ? 'Приостановить источник' : 'Включить источник'}
                                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer border ${
                                                source.enabled
                                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                            }`}
                                        >
                                            {source.enabled ? 'Активен' : 'Пауза'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteSource(source.id, source.name)}
                                            title="Удалить источник"
                                            className="p-1.5 text-white/40 hover:text-rose-400 transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                        >
                                            <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                        </button>
                                    </div>
                                </div>

                                {/* Topics / Tags */}
                                {Array.isArray(source.topics) && source.topics.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {source.topics.map((t, idx) => (
                                            <span
                                                key={idx}
                                                className="text-[11px] px-2 py-0.5 rounded-[8px] bg-white/5 text-white/60 border border-white/5"
                                            >
                                                #{t}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Status / Error Warning */}
                                {hasErrors && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[12px]">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">
                                            Сбоев: {source.consecutive_errors} {source.last_error ? `(${source.last_error})` : ''}
                                        </span>
                                    </div>
                                )}

                                {/* Bottom Info & Action */}
                                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[12px] text-white/40">
                                    <span>
                                        {source.last_success_at
                                            ? `Успех: ${new Date(source.last_success_at).toLocaleDateString()} ${new Date(source.last_success_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                            : 'Ещё не собирался'}
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => handleRunScrape(source.id)}
                                        disabled={isRunning || !source.enabled}
                                        className="px-3 py-1.5 rounded-full bg-[#292e5e] hover:bg-[#383f7d] border border-[#434771] text-white text-[13px] font-normal transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-40"
                                    >
                                        <Play className={`w-3 h-3 fill-current stroke-none ${isRunning ? 'animate-spin' : ''}`} />
                                        <span>{isRunning ? 'Сбор...' : 'Собрать сейчас'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal: Add Source */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
                    <div className="relative w-full max-w-[460px] rounded-[24px] bg-[#151515] border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#1b1d22]/60">
                            <h3 className="text-[17px] font-medium text-white">Добавить источник контента</h3>
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4 stroke-[2]" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSource} className="p-6 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                                    Название
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Например: Двач Мемы или Хабр RSS"
                                    className="w-full px-3.5 py-2.5 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] placeholder:text-white/25 focus:outline-none focus:border-[#434771]"
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                                    Тип источника
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.entries(SOURCE_TYPE_LABELS).map(([typeKey, label]) => (
                                        <button
                                            key={typeKey}
                                            type="button"
                                            onClick={() => setSourceType(typeKey)}
                                            className={`py-2 px-3 rounded-[12px] text-[13px] font-medium transition-all border cursor-pointer ${
                                                sourceType === typeKey
                                                    ? 'bg-[#292e5e] border-[#434771] text-white shadow-inner'
                                                    : 'bg-[#171717] border-white/5 text-white/50 hover:text-white'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                                    Ссылка или Handle
                                </label>
                                <input
                                    type="text"
                                    value={urlOrHandle}
                                    onChange={e => setUrlOrHandle(e.target.value)}
                                    placeholder={
                                        sourceType === 'telegram'
                                            ? '@channel_name или t.me/s/channel'
                                            : sourceType === 'youtube'
                                            ? 'https://youtube.com/@handle или /channel/UC...'
                                            : 'https://example.com/feed.xml'
                                    }
                                    className="w-full px-3.5 py-2.5 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] placeholder:text-white/25 focus:outline-none focus:border-[#434771]"
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                                    Топики / Теги (через запятую)
                                </label>
                                <input
                                    type="text"
                                    value={topicsInput}
                                    onChange={e => setTopicsInput(e.target.value)}
                                    placeholder="мемы, игры, новости, аниме"
                                    className="w-full px-3.5 py-2.5 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] placeholder:text-white/25 focus:outline-none focus:border-[#434771]"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="px-4 py-2 rounded-full text-[14px] text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#383f7d] border border-[#434771] text-white text-[14px] font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                                >
                                    {saving ? 'Сохранение...' : 'Добавить источник'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ContentSourcesView;
