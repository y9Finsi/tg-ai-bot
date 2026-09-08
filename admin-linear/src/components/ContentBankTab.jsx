import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Search, Plus, List, Grid, Link as LinkIcon, Image as ImageIcon,
    Film, Sparkles, Music, FileText, ExternalLink, Send, Pencil,
    Trash2, Check, Radio, RefreshCw, AlertCircle, Settings
} from 'lucide-react';
import { api } from '@/lib/api.js';
import { ContentModal } from './ContentModal.jsx';
import { FigmaListItemRow } from './FigmaListItemRow.jsx';
import { ContentSourcesView } from './ContentSourcesView.jsx';
import { ContentDiscoveriesView } from './ContentDiscoveriesView.jsx';

const TOP_TABS = [
    { id: 'bank', label: 'Банк материалов' },
    { id: 'discoveries', label: 'Находки скрапера' },
    { id: 'sources', label: 'Источники' }
];

const FILTER_TABS = [
    { id: 'all', label: 'Все' },
    { id: 'audio', label: 'Музыка' },
    { id: 'video', label: 'Видео' },
    { id: 'photo', label: 'Фото / Мемы' },
    { id: 'animation', label: 'GIF' },
    { id: 'link', label: 'Ссылки' }
];

const TYPE_ICONS = {
    audio: Music,
    video: Film,
    photo: ImageIcon,
    animation: Sparkles,
    document: FileText,
    link: LinkIcon
};

const TYPE_LABELS = {
    audio: 'Аудио',
    video: 'Видео',
    photo: 'Фото',
    animation: 'GIF',
    document: 'Файл',
    link: 'Ссылка'
};

export function ContentBankTab({ toast }) {
    const [topTab, setTopTab] = useState('bank'); // 'bank' | 'discoveries' | 'sources'
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
        <main className="flex-1 w-full flex flex-col items-center animate-in fade-in duration-150">
            {/* Main Content Container matching Figma 1005px / 1042px */}
            <div className="w-full max-w-[1042px] px-4 md:px-[20px] pt-[24px] pb-[60px] flex flex-col gap-[20px]">
                
                {/* Level 1 Navigation Tabs: Bank / Discoveries / Sources */}
                <div className="w-full flex items-center gap-2 p-1 bg-[#181818] rounded-[16px] border border-white/5 select-none">
                    {TOP_TABS.map(tab => {
                        const isActive = topTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setTopTab(tab.id)}
                                className={`flex-1 h-[40px] rounded-[12px] text-[15px] font-medium transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                    isActive
                                        ? 'bg-[#292e5e] text-white shadow-sm border border-[#434771]'
                                        : 'text-white/50 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {topTab === 'discoveries' && (
                    <ContentDiscoveriesView toast={toast} />
                )}

                {topTab === 'sources' && (
                    <ContentSourcesView toast={toast} />
                )}

                {topTab === 'bank' && (
                    <>
                        {/* Top Bar: Surface Filter Tabs (Figma Frame 212) + Action Buttons (Frame 201) */}
                <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                    {/* Category Filter Tabs matching Figma Frame 212 Surface selector */}
                    <div className="flex items-center gap-[10px] overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                        {FILTER_TABS.map((surf) => {
                            const isActive = selectedTab === surf.id;
                            return (
                                <button
                                    key={surf.id}
                                    type="button"
                                    onClick={() => setSelectedTab(surf.id)}
                                    className={`h-[38px] px-4 text-[16px] font-normal flex items-center justify-center cursor-pointer transition-all ${
                                        isActive
                                            ? 'rounded-[12px] bg-[#232425] border border-[#353636] text-white shadow-inner'
                                            : 'rounded-full text-white/58 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {surf.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Right Controls matching Figma Frame 201 */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* View Switcher (Pill with #292e5e active tab) */}
                        <div className="flex items-center h-[38px] px-1 bg-[#1b1d22] rounded-full border border-white/10">
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                title="Список (FigmaListItemRow)"
                                className={`h-[30px] px-3 rounded-full text-[14px] font-normal transition-all cursor-pointer flex items-center gap-1.5 ${
                                    viewMode === 'list'
                                        ? 'bg-[#292e5e] border border-[#434771] text-white shadow-sm'
                                        : 'text-white/50 hover:text-white'
                                }`}
                            >
                                <List className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Список</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                title="Сетка (Frame 216)"
                                className={`h-[30px] px-3 rounded-full text-[14px] font-normal transition-all cursor-pointer flex items-center gap-1.5 ${
                                    viewMode === 'grid'
                                        ? 'bg-[#292e5e] border border-[#434771] text-white shadow-sm'
                                        : 'text-white/50 hover:text-white'
                                }`}
                            >
                                <Grid className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Сетка</span>
                            </button>
                        </div>

                        {/* Settings Button */}
                        <button
                            type="button"
                            onClick={() => setChannelModalOpen(true)}
                            title="Настройки канала пополнения"
                            className="h-[38px] w-[38px] rounded-full bg-[#1b1d22] border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all flex items-center justify-center cursor-pointer active:scale-95"
                        >
                            <Settings className="w-4 h-4 stroke-[1.5]" />
                        </button>

                        {/* Add Content Button matching Figma Frame 201 (38px height, rounded-full, bg-[#292e5e]) */}
                        <button
                            type="button"
                            onClick={() => {
                                setEditingItem(null);
                                setModalOpen(true);
                            }}
                            className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                        >
                            <span>Добавить материал</span>
                            <Plus className="w-4 h-4 text-white stroke-[1.5]" />
                        </button>
                    </div>
                </div>

                {/* Sub-bar: Search Input and Status Stats Counter */}
                <div className="w-full flex items-center justify-between gap-3 flex-wrap">
                    {/* Search Field styled like Figma input */}
                    <div className="relative flex-1 min-w-[280px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск по описанию, ссылкам, ключевым словам..."
                            className="w-full pl-10 pr-4 py-2 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] placeholder:text-white/30 focus:outline-none focus:border-[#434771] transition-all"
                        />
                    </div>

                    {/* Compact Status Badges */}
                    <div className="flex items-center gap-2 text-[12px] text-white/50 select-none">
                        <span className="px-2.5 py-1 rounded-[10px] bg-[#171717] border border-white/5">
                            Всего: <strong className="text-white font-medium">{stats.total}</strong>
                        </span>
                        <span className="px-2.5 py-1 rounded-[10px] bg-[#171717] border border-white/5">
                            Активно: <strong className="text-emerald-400 font-medium">{stats.active}</strong>
                        </span>
                        <span className="px-2.5 py-1 rounded-[10px] bg-[#171717] border border-white/5 hidden sm:inline">
                            В диалогах: <strong className="text-indigo-300 font-medium">{stats.dialogue}</strong>
                        </span>
                        <span className="px-2.5 py-1 rounded-[10px] bg-[#171717] border border-white/5 hidden sm:inline">
                            В канале: <strong className="text-sky-300 font-medium">{stats.channel}</strong>
                        </span>
                    </div>
                </div>

                {/* Main Content Render */}
                {loading ? (
                    <div className="w-full h-80 flex flex-col items-center justify-center gap-2 text-white/50">
                        <RefreshCw className="w-5 h-5 animate-spin text-[#8693ff]" />
                        <span className="text-[14px]">Загрузка банка контента...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="w-full rounded-[23px] bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 p-12 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/30 mb-1">
                            <AlertCircle className="w-6 h-6 stroke-[1.5]" />
                        </div>
                        <span className="text-[16px] font-medium text-white">Материалы не найдены</span>
                        <p className="text-[14px] text-white/45 max-w-sm">
                            {searchQuery ? 'По вашему запросу ничего не найдено.' : 'Банк контента пуст. Нажмите «Добавить материал», чтобы пополнить банк.'}
                        </p>
                    </div>
                ) : viewMode === 'list' ? (
                    /* LIST VIEW: Using FigmaListItemRow (Figma 14:2253 Frame 221) */
                    <div className="flex flex-col gap-2">
                        {filteredItems.map((item) => {
                            const typeLabel = TYPE_LABELS[item.telegram_type] || item.telegram_type;
                            const subtitleText = item.url
                                ? item.url
                                : (item.telegram_file_id ? `TG File: ${item.telegram_file_id.slice(0, 26)}...` : typeLabel);

                            return (
                                <FigmaListItemRow
                                    key={item.id}
                                    title={item.description || `${typeLabel} #${item.id}`}
                                    subtitle={subtitleText}
                                    className={!item.enabled ? 'opacity-50' : ''}
                                    rightContent={
                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Badges */}
                                            <div className="hidden sm:flex items-center gap-1.5 select-none">
                                                {item.allow_in_dialogue && (
                                                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#292e5e]/40 border border-[#434771]/50 text-indigo-200">
                                                        Диалог
                                                    </span>
                                                )}
                                                {item.allow_initiative && (
                                                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200">
                                                        Инициатива
                                                    </span>
                                                )}
                                                {item.allow_channel && (
                                                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-200">
                                                        Канал
                                                    </span>
                                                )}
                                                {!item.enabled && (
                                                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                                                        Выкл
                                                    </span>
                                                )}
                                            </div>

                                            {/* Action Pill Button matching Figma */}
                                            <button
                                                type="button"
                                                onClick={() => handleTestSend(item.id)}
                                                disabled={testingId === item.id}
                                                title="Отправить мне в Telegram для проверки"
                                                className="shrink-0 px-3 py-1.5 rounded-full text-[14px] font-normal text-white bg-[#292e5e] hover:bg-[#343b78] active:bg-[#22264e] transition-all cursor-pointer flex items-center gap-1.5"
                                            >
                                                <Send className={`w-3.5 h-3.5 stroke-[1.5] ${testingId === item.id ? 'animate-pulse' : ''}`} />
                                                <span className="hidden md:inline">Тест</span>
                                            </button>

                                            {/* Edit Button */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingItem(item);
                                                    setModalOpen(true);
                                                }}
                                                title="Редактировать параметры"
                                                className="p-1.5 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                            >
                                                <Pencil className="w-4 h-4 stroke-[1.5]" />
                                            </button>

                                            {/* Delete Button */}
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteItem(item.id, item.description)}
                                                title="Удалить материал"
                                                className="p-1.5 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                            >
                                                <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                            </button>
                                        </div>
                                    }
                                />
                            );
                        })}
                    </div>
                ) : (
                    /* GRID VIEW: Cards styled exactly like Figma 377px Width Cards (Style B / Frame 216) */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">
                        {filteredItems.map((item) => {
                            const Icon = TYPE_ICONS[item.telegram_type] || LinkIcon;
                            const typeLabel = TYPE_LABELS[item.telegram_type] || item.telegram_type;
                            return (
                                <div
                                    key={item.id}
                                    className={`w-full min-h-[170px] rounded-[23px] p-2 flex flex-col justify-between gap-2 transition-all bg-gradient-to-b from-[#171717] to-[#232425]/0 border ${
                                        item.enabled ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-50'
                                    }`}
                                >
                                    {/* Card Header (Frame 201) */}
                                    <div className="px-2 py-1 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                            <div className="w-6 h-6 rounded-[8px] bg-[#272727] border border-white/10 flex items-center justify-center shrink-0 text-white/80">
                                                <Icon className="w-3 h-3 stroke-[1.5]" />
                                            </div>
                                            <span className="text-[14px] font-medium text-white truncate select-none">
                                                {typeLabel}
                                            </span>
                                            <span className="text-[10px] text-white/30 font-mono">#{item.id}</span>
                                        </div>

                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleTestSend(item.id)}
                                                disabled={testingId === item.id}
                                                title="Отправить в Telegram"
                                                className="p-1 text-white/40 hover:text-sky-400 transition-colors cursor-pointer rounded hover:bg-white/5"
                                            >
                                                <Send className="w-3.5 h-3.5 stroke-[1.5]" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingItem(item);
                                                    setModalOpen(true);
                                                }}
                                                title="Редактировать"
                                                className="p-1 text-white/40 hover:text-white transition-colors cursor-pointer rounded hover:bg-white/5"
                                            >
                                                <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteItem(item.id, item.description)}
                                                title="Удалить"
                                                className="p-1 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded hover:bg-white/5"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Content (Component 41: bg-[#272727] rounded-[20px]) */}
                                    <div className="w-full h-[96px] rounded-[20px] p-3 flex flex-col justify-between overflow-hidden bg-[#272727]">
                                        <p className="text-[14px] font-normal leading-relaxed line-clamp-2 text-white/70 select-none">
                                            {item.description || 'Без описания'}
                                        </p>
                                        {item.url ? (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[12px] text-sky-400 hover:text-sky-300 hover:underline truncate inline-flex items-center gap-1"
                                            >
                                                <span className="truncate">{item.url}</span>
                                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                            </a>
                                        ) : (
                                            <span className="text-[11px] text-white/30 font-mono truncate">
                                                {item.telegram_file_id ? `TG: ${item.telegram_file_id.slice(0, 22)}...` : 'Локальный'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Bottom Badges */}
                                    <div className="px-2 pb-0.5 flex items-center justify-between text-[11px] select-none">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {item.allow_in_dialogue && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#292e5e]/40 border border-[#434771]/50 text-indigo-200">
                                                    Диалог
                                                </span>
                                            )}
                                            {item.allow_initiative && (
                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200">
                                                    Инициатива
                                                </span>
                                            )}
                                            {item.allow_channel && (
                                                <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-200">
                                                    Канал
                                                </span>
                                            )}
                                        </div>
                                        <span className={`uppercase font-bold tracking-wider text-[10px] ${item.enabled ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {item.enabled ? 'Активен' : 'Выкл'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                    </>
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none">
                        <div className="relative w-full max-w-[480px] rounded-[24px] bg-[#151515] border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#1b1d22]/60">
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
                                    Медиа или ссылки, отправленные в этот закрытый Telegram-канал, автоматически парсятся и попадают в базу Леры.
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
                                        className="w-full px-3.5 py-2.5 rounded-[14px] bg-[#171717] border border-white/10 text-white text-[14px] font-mono placeholder:text-white/25 focus:outline-none focus:border-[#434771]"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePublishGuide}
                                    disabled={publishingGuide}
                                    className="w-full py-2.5 px-4 rounded-[14px] bg-[#171717] hover:bg-white/5 border border-white/10 text-white/80 hover:text-white text-[13px] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <Radio className="w-4 h-4 stroke-[1.5] text-sky-400" />
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
            </div>
        </main>
    );
}

export default ContentBankTab;
