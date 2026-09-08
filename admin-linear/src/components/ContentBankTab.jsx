import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Search, Plus, List, Grid, Link as LinkIcon, Image as ImageIcon,
    Film, Sparkles, Music, FileText, ExternalLink, Send, Pencil,
    Trash2, Check, Radio, RefreshCw, AlertCircle, Eye, Settings
} from 'lucide-react';
import { api } from '@/lib/api.js';
import { ContentModal } from './ContentModal.jsx';

const FILTER_TABS = [
    { id: 'all', label: 'Все' },
    { id: 'audio', label: 'Музыка', icon: '🎵' },
    { id: 'video', label: 'Видео', icon: '🎬' },
    { id: 'photo', label: 'Фото / Мемы', icon: '🐱' },
    { id: 'animation', label: 'GIF', icon: '✨' },
    { id: 'link', label: 'Ссылки', icon: '🔗' }
];

const TYPE_ICONS = {
    audio: Music,
    video: Film,
    photo: ImageIcon,
    animation: Sparkles,
    document: FileText,
    link: LinkIcon
};

export function ContentBankTab({ toast }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTab, setSelectedTab] = useState('all');
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [saving, setSaving] = useState(false);

    // Channel settings modal state
    const [channelModalOpen, setChannelModalOpen] = useState(false);
    const [contentChannelId, setContentChannelId] = useState('');
    const [channelSaving, setChannelSaving] = useState(false);
    const [publishingGuide, setPublishingGuide] = useState(false);

    // Test sending state
    const [testingId, setTestingId] = useState(null);

    const loadContent = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api('/api/admin/content');
            if (res && res.content) {
                setItems(Array.isArray(res.content) ? res.content : []);
                if (res.contentChannelId) {
                    setContentChannelId(String(res.contentChannelId));
                }
            }
        } catch (err) {
            console.error('[LOAD CONTENT ERROR]', err);
            if (toast) toast('Ошибка загрузки контента: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    // Filter items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            if (selectedTab !== 'all' && item.telegram_type !== selectedTab) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const url = (item.url || '').toLowerCase();
                const type = (item.telegram_type || '').toLowerCase();
                return desc.includes(q) || url.includes(q) || type.includes(q);
            }
            return true;
        });
    }, [items, selectedTab, searchQuery]);

    // Stats
    const stats = useMemo(() => {
        return {
            total: items.length,
            active: items.filter(i => i.enabled).length,
            dialogue: items.filter(i => i.enabled && i.allow_in_dialogue).length,
            initiative: items.filter(i => i.enabled && i.allow_initiative).length,
            channel: items.filter(i => i.enabled && i.allow_channel).length
        };
    }, [items]);

    // Handle save modal
    const handleSaveItem = async (payload) => {
        setSaving(true);
        try {
            if (editingItem) {
                await api(`/api/admin/content/${editingItem.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });
                if (toast) toast('Материал обновлен', 'success');
            } else {
                await api('/api/admin/content', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (toast) toast('Материал добавлен', 'success');
            }
            setModalOpen(false);
            setEditingItem(null);
            await loadContent();
        } catch (err) {
            console.error('[SAVE CONTENT ERROR]', err);
            if (toast) toast('Ошибка сохранения: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Handle delete
    const handleDeleteItem = async (id, desc) => {
        if (!confirm(`Удалить материал "${desc || 'без описания'}"?`)) return;
        try {
            await api(`/api/admin/content/${id}`, { method: 'DELETE' });
            if (toast) toast('Материал удален', 'success');
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (err) {
            if (toast) toast('Ошибка удаления: ' + err.message, 'error');
        }
    };

    // Handle test send to admin TG
    const handleTestSend = async (id) => {
        setTestingId(id);
        try {
            await api(`/api/admin/content/${id}/test`, { method: 'POST' });
            if (toast) toast('Материал отправлен тебе в Telegram!', 'success');
        } catch (err) {
            if (toast) toast('Ошибка отправки теста: ' + err.message, 'error');
        } finally {
            setTestingId(null);
        }
    };

    // Save channel ID
    const handleSaveChannelSettings = async () => {
        setChannelSaving(true);
        try {
            await api('/api/admin/content/settings', {
                method: 'PATCH',
                body: JSON.stringify({ content_channel_id: contentChannelId })
            });
            if (toast) toast('ID канала контента сохранен', 'success');
            setChannelModalOpen(false);
        } catch (err) {
            if (toast) toast('Ошибка сохранения канала: ' + err.message, 'error');
        } finally {
            setChannelSaving(false);
        }
    };

    // Publish guide to channel
    const handlePublishGuide = async () => {
        setPublishingGuide(true);
        try {
            await api('/api/admin/content/publish-guide', { method: 'POST' });
            if (toast) toast('Инструкция отправлена в сервисный канал контента', 'success');
        } catch (err) {
            if (toast) toast('Ошибка публикации памятки: ' + err.message, 'error');
        } finally {
            setPublishingGuide(false);
        }
    };

    return (
        <main className="flex-1 w-full max-w-[1240px] mx-auto px-4 md:px-8 py-6 flex flex-col gap-6 animate-in fade-in duration-150">
            {/* Top Stats Bar */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-[20px] bg-[#1b1d22]/80 border border-white/5 p-3.5 flex flex-col gap-1">
                    <span className="text-[12px] uppercase font-semibold text-white/40">Всего в базе</span>
                    <span className="text-[22px] font-medium text-white">{stats.total}</span>
                </div>
                <div className="rounded-[20px] bg-[#1b1d22]/80 border border-white/5 p-3.5 flex flex-col gap-1">
                    <span className="text-[12px] uppercase font-semibold text-emerald-400/70">Активных</span>
                    <span className="text-[22px] font-medium text-emerald-400">{stats.active}</span>
                </div>
                <div className="rounded-[20px] bg-[#1b1d22]/80 border border-white/5 p-3.5 flex flex-col gap-1">
                    <span className="text-[12px] uppercase font-semibold text-indigo-400/70">В диалогах</span>
                    <span className="text-[22px] font-medium text-indigo-300">{stats.dialogue}</span>
                </div>
                <div className="rounded-[20px] bg-[#1b1d22]/80 border border-white/5 p-3.5 flex flex-col gap-1">
                    <span className="text-[12px] uppercase font-semibold text-amber-400/70">В инициативах</span>
                    <span className="text-[22px] font-medium text-amber-300">{stats.initiative}</span>
                </div>
                <div className="rounded-[20px] bg-[#1b1d22]/80 border border-white/5 p-3.5 flex flex-col gap-1 col-span-2 sm:col-span-1">
                    <span className="text-[12px] uppercase font-semibold text-sky-400/70">В ТГ-канале</span>
                    <span className="text-[22px] font-medium text-sky-300">{stats.channel}</span>
                </div>
            </div>

            {/* Controls Bar: Filters, Search, Mode Toggle & Actions */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#1b1d22]/60 backdrop-blur-md rounded-[24px] p-3 border border-white/5">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск по описанию, ссылкам, авторам..."
                        className="w-full pl-10 pr-4 py-2 rounded-full bg-[#151515] border border-white/10 text-white text-[14px] placeholder:text-white/30 focus:outline-none focus:border-[#434771]"
                    />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                    {FILTER_TABS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedTab(tab.id)}
                            className={`px-3.5 py-1.5 rounded-full text-[13px] font-normal cursor-pointer whitespace-nowrap transition-all ${
                                selectedTab === tab.id
                                    ? 'bg-[#292e5e] text-white border border-[#434771]'
                                    : 'text-white/50 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Right Actions: View Toggle, Channel Config, Add Button */}
                <div className="flex items-center gap-2 shrink-0 justify-end">
                    {/* View Mode Toggle */}
                    <div className="flex items-center p-1 bg-[#151515] rounded-full border border-white/10">
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            title="Вид: список"
                            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                                viewMode === 'list' ? 'bg-[#292e5e] text-white' : 'text-white/40 hover:text-white'
                            }`}
                        >
                            <List className="w-4 h-4 stroke-[2]" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            title="Вид: плитка"
                            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                                viewMode === 'grid' ? 'bg-[#292e5e] text-white' : 'text-white/40 hover:text-white'
                            }`}
                        >
                            <Grid className="w-4 h-4 stroke-[2]" />
                        </button>
                    </div>

                    {/* Channel Sync Settings */}
                    <button
                        type="button"
                        onClick={() => setChannelModalOpen(true)}
                        title="Настройки сервисного канала контента"
                        className="p-2 rounded-full bg-[#151515] border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all cursor-pointer"
                    >
                        <Settings className="w-4 h-4 stroke-[1.8]" />
                    </button>

                    {/* Add Content Button */}
                    <button
                        type="button"
                        onClick={() => {
                            setEditingItem(null);
                            setModalOpen(true);
                        }}
                        className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#383f7d] border border-[#434771] text-white text-[14px] font-medium flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                        <Plus className="w-4 h-4 stroke-[2.2]" />
                        <span>Добавить материал</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            {loading ? (
                <div className="w-full h-64 flex flex-col items-center justify-center gap-3 text-white/40">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#8693ff]" />
                    <span className="text-[14px]">Загрузка банка контента...</span>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="w-full rounded-[24px] bg-[#1b1d22]/40 border border-white/5 p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/30 mb-2">
                        <AlertCircle className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <span className="text-[17px] font-medium text-white">Материалы не найдены</span>
                    <p className="text-[14px] text-white/40 max-w-md">
                        {searchQuery ? 'По вашему запросу ничего не найдено.' : 'Банк контента пуст. Добавьте первый трек, мем или видео через кнопку выше.'}
                    </p>
                </div>
            ) : viewMode === 'list' ? (
                /* LIST VIEW (FigmaListItemRow style) */
                <div className="flex flex-col gap-2">
                    {filteredItems.map(item => {
                        const Icon = TYPE_ICONS[item.telegram_type] || LinkIcon;
                        return (
                            <div
                                key={item.id}
                                className={`w-full rounded-[20px] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border transition-all ${
                                    item.enabled
                                        ? 'bg-[#1b1d22]/90 border-white/[0.08] hover:border-white/15'
                                        : 'bg-[#1b1d22]/40 border-white/5 opacity-60'
                                }`}
                            >
                                {/* Left side: Icon + Content Info */}
                                <div className="flex items-start md:items-center gap-3.5 flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-[#272727] flex items-center justify-center shrink-0 border border-white/10 text-white/80">
                                        <Icon className="w-5 h-5 stroke-[1.8]" />
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[15px] font-medium text-white truncate max-w-md">
                                                {item.description || 'Без описания'}
                                            </span>
                                            {!item.enabled && (
                                                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                                                    Отключен
                                                </span>
                                            )}
                                        </div>
                                        {item.url && (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[12px] text-sky-400/80 hover:text-sky-300 hover:underline truncate max-w-lg mt-0.5 inline-flex items-center gap-1"
                                            >
                                                <span className="truncate">{item.url}</span>
                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                            </a>
                                        )}
                                        {item.telegram_file_id && !item.url && (
                                            <span className="text-[11px] font-mono text-white/30 truncate max-w-sm">
                                                TG File: {item.telegram_file_id.slice(0, 24)}...
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Center: Badges */}
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                    {item.allow_in_dialogue && (
                                        <span className="text-[11px] font-normal px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                            Диалог
                                        </span>
                                    )}
                                    {item.allow_initiative && (
                                        <span className="text-[11px] font-normal px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                            Инициатива
                                        </span>
                                    )}
                                    {item.allow_channel && (
                                        <span className="text-[11px] font-normal px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                            Канал
                                        </span>
                                    )}
                                </div>

                                {/* Right: Action buttons */}
                                <div className="flex items-center gap-1 shrink-0 self-end md:self-auto border-t md:border-t-0 pt-2 md:pt-0 border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => handleTestSend(item.id)}
                                        disabled={testingId === item.id}
                                        title="Отправить мне в Telegram для проверки"
                                        className="p-2 rounded-xl text-white/50 hover:text-sky-400 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        <Send className={`w-4 h-4 stroke-[1.8] ${testingId === item.id ? 'animate-pulse' : ''}`} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingItem(item);
                                            setModalOpen(true);
                                        }}
                                        title="Редактировать параметры"
                                        className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                                    >
                                        <Pencil className="w-4 h-4 stroke-[1.8]" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteItem(item.id, item.description)}
                                        title="Удалить материал"
                                        className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-white/5 transition-all cursor-pointer"
                                    >
                                        <Trash2 className="w-4 h-4 stroke-[1.8]" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* GRID VIEW (Card style matching AiSettingsTab) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredItems.map(item => {
                        const Icon = TYPE_ICONS[item.telegram_type] || LinkIcon;
                        return (
                            <div
                                key={item.id}
                                className={`rounded-[23px] p-4 flex flex-col justify-between gap-4 border transition-all ${
                                    item.enabled
                                        ? 'bg-[#1b1d22]/90 border-white/[0.08] hover:border-white/15'
                                        : 'bg-[#1b1d22]/40 border-white/5 opacity-60'
                                }`}
                            >
                                {/* Card Header */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-9 h-9 rounded-xl bg-[#272727] flex items-center justify-center shrink-0 border border-white/10 text-white/80">
                                            <Icon className="w-4 h-4 stroke-[1.8]" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[12px] uppercase font-bold tracking-wider text-white/40">
                                                {item.telegram_type}
                                            </span>
                                            <span className="text-[10px] text-white/30">ID: #{item.id}</span>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleTestSend(item.id)}
                                            disabled={testingId === item.id}
                                            title="Отправить мне в Telegram"
                                            className="p-1.5 rounded-lg text-white/50 hover:text-sky-400 hover:bg-white/5 transition-all cursor-pointer"
                                        >
                                            <Send className="w-3.5 h-3.5 stroke-[1.8]" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingItem(item);
                                                setModalOpen(true);
                                            }}
                                            title="Редактировать"
                                            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                                        >
                                            <Pencil className="w-3.5 h-3.5 stroke-[1.8]" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteItem(item.id, item.description)}
                                            title="Удалить"
                                            className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-all cursor-pointer"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 stroke-[1.8]" />
                                        </button>
                                    </div>
                                </div>

                                {/* Description & Preview */}
                                <div className="rounded-[18px] bg-[#272727] p-3 flex flex-col gap-2 min-h-[90px]">
                                    <p className="text-[14px] font-normal leading-relaxed line-clamp-3 text-white/80">
                                        {item.description || 'Без описания'}
                                    </p>
                                    {item.url && (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[12px] text-sky-400/80 hover:text-sky-300 hover:underline truncate inline-flex items-center gap-1 mt-auto"
                                        >
                                            <span className="truncate">{item.url}</span>
                                            <ExternalLink className="w-3 h-3 shrink-0" />
                                        </a>
                                    )}
                                </div>

                                {/* Badges Footer */}
                                <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/5 text-[11px]">
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {item.allow_in_dialogue && (
                                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                                Диалог
                                            </span>
                                        )}
                                        {item.allow_initiative && (
                                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                                Инициатива
                                            </span>
                                        )}
                                        {item.allow_channel && (
                                            <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                                Канал
                                            </span>
                                        )}
                                    </div>
                                    <span className={`text-[10px] uppercase font-bold tracking-wider ${item.enabled ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {item.enabled ? 'Активен' : 'Выкл'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal: Add/Edit Item */}
            <ContentModal
                isOpen={modalOpen}
                item={editingItem}
                onClose={() => {
                    setModalOpen(false);
                    setEditingItem(null);
                }}
                onSave={handleSaveItem}
                saving={saving}
            />

            {/* Modal: Service Channel Settings */}
            {channelModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none">
                    <div className="relative w-full max-w-[500px] rounded-[24px] bg-[#151515] border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#1b1d22]/50">
                            <h3 className="text-[17px] font-medium text-white">
                                Канал пополнения контента
                            </h3>
                            <button
                                type="button"
                                onClick={() => setChannelModalOpen(false)}
                                className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                            >
                                <Check className="w-4 h-4 stroke-[2]" />
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <p className="text-[13px] text-white/60 leading-relaxed">
                                Любое медиа или ссылка, отправленные в этот закрытый Telegram-канал, автоматически парсятся и попадают в базу контента Леры.
                            </p>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                                    Telegram Channel ID
                                </label>
                                <input
                                    type="text"
                                    value={contentChannelId}
                                    onChange={(e) => setContentChannelId(e.target.value)}
                                    placeholder="-100..."
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1d22] border border-white/10 text-white text-[14px] font-mono placeholder:text-white/25 focus:outline-none focus:border-[#434771]"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handlePublishGuide}
                                disabled={publishingGuide}
                                className="w-full py-2.5 px-4 rounded-xl bg-[#1b1d22] hover:bg-white/5 border border-white/10 text-white/80 hover:text-white text-[13px] transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Radio className="w-4 h-4 stroke-[1.8] text-sky-400" />
                                <span>{publishingGuide ? 'Отправка...' : 'Опубликовать памятку в канал'}</span>
                            </button>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                                <button
                                    type="button"
                                    onClick={() => setChannelModalOpen(false)}
                                    className="px-4 py-2 rounded-full text-[14px] text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                                >
                                    Закрыть
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveChannelSettings}
                                    disabled={channelSaving}
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#383f7d] border border-[#434771] text-white text-[14px] font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                                >
                                    {channelSaving ? 'Сохранение...' : 'Сохранить ID'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

export default ContentBankTab;
