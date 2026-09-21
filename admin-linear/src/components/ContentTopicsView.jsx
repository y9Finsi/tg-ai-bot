import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Send, Plus, Trash2, Calendar, MapPin, CheckCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api.js';

export function ContentTopicsView({ toast }) {
    const [topics, setTopics] = useState([]);
    const [pendingStories, setPendingStories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [harvesting, setHarvesting] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all' | 'available' | 'used'
    const [actionLoadingId, setActionLoadingId] = useState(null);

    const loadTopics = useCallback(async () => {
        setLoading(true);
        try {
            const [topicsRes, pendingRes] = await Promise.all([
                api('/api/admin/content/topics'),
                api('/api/admin/content/pending-stories').catch(() => ({ pending_stories: [] }))
            ]);
            if (topicsRes && topicsRes.topics) {
                setTopics(topicsRes.topics);
            }
            if (pendingRes && pendingRes.pending_stories) {
                setPendingStories(pendingRes.pending_stories);
            }
        } catch (err) {
            console.error('[LOAD TOPICS ERROR]:', err);
            toast?.('Ошибка загрузки тем: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadTopics();
    }, [loadTopics]);

    const handleHarvest = async () => {
        setHarvesting(true);
        try {
            const res = await api('/api/admin/content/topics/harvest', { method: 'POST' });
            toast?.(`Собрано новых тем: ${res.topics?.length || 0}`, 'success');
            await loadTopics();
        } catch (err) {
            toast?.('Ошибка сбора тем: ' + err.message, 'error');
        } finally {
            setHarvesting(false);
        }
    };

    const handlePublishToChannel = async (topic) => {
        if (!confirm(`Опубликовать тему "${topic.title}" в канал с режиссурой Jev?`)) return;
        setActionLoadingId(topic.id);
        try {
            await api('/api/admin/content/topics/publish-channel', {
                method: 'POST',
                body: JSON.stringify({ topic_id: topic.id })
            });
            toast?.('История успешно срежиссирована и отправлена в канал!', 'success');
            await loadTopics();
        } catch (err) {
            toast?.('Ошибка публикации: ' + err.message, 'error');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleDeleteTopic = async (topic) => {
        if (!confirm(`Удалить тему "${topic.title}"?`)) return;
        setActionLoadingId(topic.id);
        try {
            await api(`/api/admin/content/topics/${topic.id}`, { method: 'DELETE' });
            toast?.('Тема удалена', 'success');
            await loadTopics();
        } catch (err) {
            toast?.('Ошибка удаления: ' + err.message, 'error');
        } finally {
            setActionLoadingId(null);
        }
    };

    const filteredTopics = topics.filter(t => {
        if (filter === 'available') return !t.used_in_channel_at && !t.used_in_dm_at;
        if (filter === 'used') return t.used_in_channel_at || t.used_in_dm_at;
        return true;
    });

    return (
        <div className="w-full flex flex-col gap-4 animate-in fade-in duration-150">
            {/* Header / Actions Bar */}
            <div className="w-full flex items-center justify-between gap-3 flex-wrap bg-[#1a1b1e] p-4 rounded-[16px] border border-white/5">
                <div className="flex items-center gap-3">
                    <span className="text-[18px] font-semibold text-white flex items-center gap-2">
                        📰 Темы дня (СПб и тренды)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-[#292e5e] text-[#a5b4fc]">
                        {topics.length} тем
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleHarvest}
                        disabled={harvesting}
                        className="h-[36px] px-4 rounded-[10px] bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-[14px] font-medium flex items-center gap-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${harvesting ? 'animate-spin' : ''}`} />
                        {harvesting ? 'Собираю...' : '⚡ Собрать факты дня'}
                    </button>
                    <button
                        type="button"
                        onClick={loadTopics}
                        disabled={loading}
                        className="h-[36px] w-[36px] rounded-[10px] bg-white/5 hover:bg-white/10 text-white/70 flex items-center justify-center transition-all cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2">
                {[
                    { id: 'all', label: 'Все темы' },
                    { id: 'available', label: 'Свежие (не использованы)' },
                    { id: 'used', label: 'Опубликованные' }
                ].map(f => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilter(f.id)}
                        className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-all cursor-pointer ${
                            filter === f.id
                                ? 'bg-[#2b2d35] text-white border border-white/10 shadow-inner'
                                : 'text-white/40 hover:text-white/70 bg-transparent'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Active Pending Stories (Двухэтапный пендинг) */}
            {pendingStories.length > 0 && (
                <div className="p-4 rounded-[16px] bg-amber-500/10 border border-amber-500/20 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-amber-300 flex items-center gap-1.5">
                            <Clock className="w-4 h-4" /> Активные ожидания в ЛС (Двухэтапный пендинг Леры)
                        </span>
                        <span className="text-[11px] font-mono text-amber-300/60 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            {pendingStories.length} в процессе
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {pendingStories.map(p => (
                            <div key={p.id} className="p-3 bg-black/40 rounded-[10px] border border-amber-500/15 flex flex-col gap-1 text-[12px]">
                                <div className="flex items-center justify-between text-white/90 font-medium">
                                    <span>Чат {p.chat_id}</span>
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">{p.status}</span>
                                </div>
                                <div className="text-white/60 truncate">«{p.hook_message}»</div>
                                <div className="text-white/30 text-[10px]">Драматургия: {p.dramaturgy?.hook_type || 'DIRECT_SHARE'} • Создано: {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Topics List */}
            {loading && topics.length === 0 ? (
                <div className="p-12 text-center text-white/40 text-[14px]">Загрузка тем дня...</div>
            ) : filteredTopics.length === 0 ? (
                <div className="p-12 text-center text-white/40 text-[14px] bg-[#141517] rounded-[16px] border border-white/5">
                    Нет тем в этой категории. Нажмите «⚡ Собрать факты дня», чтобы спарсить свежие новости.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filteredTopics.map(topic => {
                        const isUsedInChannel = Boolean(topic.used_in_channel_at);
                        const isUsedInDm = Boolean(topic.used_in_dm_at);
                        const isLoading = actionLoadingId === topic.id;

                        return (
                            <div
                                key={topic.id}
                                className="w-full bg-[#18191c] hover:bg-[#1d1f23] p-4 rounded-[14px] border border-white/5 hover:border-white/10 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none"
                            >
                                <div className="flex-1 flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[15px] font-semibold text-white/90">
                                            {topic.title}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-white/5 text-white/60">
                                            {topic.category || 'spb'}
                                        </span>
                                        {isUsedInChannel && (
                                            <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> В канале
                                            </span>
                                        )}
                                        {isUsedInDm && (
                                            <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> В личке
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[13px] text-white/60 line-clamp-2 leading-relaxed">
                                        {topic.situation}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        disabled={isLoading || isUsedInChannel}
                                        onClick={() => handlePublishToChannel(topic)}
                                        className={`h-[34px] px-3 rounded-[8px] text-[13px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                                            isUsedInChannel
                                                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                                : 'bg-[#292e5e] hover:bg-[#343b78] text-white border border-[#434771]'
                                        }`}
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                        {isUsedInChannel ? 'Опубликовано' : 'В канал (Jev)'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => handleDeleteTopic(topic)}
                                        title="Удалить тему"
                                        className="h-[34px] w-[34px] rounded-[8px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all cursor-pointer disabled:opacity-40"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
