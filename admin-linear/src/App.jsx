import React, { useState, useEffect, useCallback } from 'react';
import { FastForward, RotateCw, Play, Pause } from 'lucide-react';
import { api } from '@/lib/api.js';
import { Header } from '@/components/Header.jsx';
import { LeraStatusHero } from '@/components/LeraStatusHero.jsx';
import { InventoryWidget } from '@/components/InventoryWidget.jsx';
import { KanbanBoard } from '@/components/KanbanBoard.jsx';
import { NeedsPanel } from '@/components/NeedsPanel.jsx';
import { AiSettingsTab } from '@/components/AiSettingsTab.jsx';
import { ContentBankTab } from '@/components/ContentBankTab.jsx';
import { ZenlyMap } from '@/components/ZenlyMap.jsx';
import { Toast } from '@/components/Toast.jsx';
import { LoginModal } from '@/components/LoginModal.jsx';

export function App() {
    const [authed, setAuthed] = useState(() => {
        return typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('admin_key'));
    });

    const [activeTab, setActiveTabState] = useState(() => {
        if (typeof window !== 'undefined') {
            const hash = window.location.hash.toLowerCase();
            const search = new URLSearchParams(window.location.search);
            if (hash === '#content' || search.get('tab') === 'content') return 'content';
            if (hash === '#map' || search.get('tab') === 'map') return 'map';
            if (hash === '#ai' || search.get('tab') === 'ai') return 'ai';
        }
        return 'overview';
    });

    const setActiveTab = useCallback((tab) => {
        setActiveTabState(tab);
        if (typeof window !== 'undefined') {
            window.location.hash = tab === 'map' ? '#map' : (tab === 'ai' ? '#ai' : (tab === 'content' ? '#content' : '#overview'));
        }
    }, []);

    useEffect(() => {
        const handleHash = () => {
            const hash = window.location.hash.toLowerCase();
            if (hash === '#content') setActiveTabState('content');
            else if (hash === '#map') setActiveTabState('map');
            else if (hash === '#ai') setActiveTabState('ai');
            else if (hash === '#overview') setActiveTabState('overview');
        };
        window.addEventListener('hashchange', handleHash);
        return () => window.removeEventListener('hashchange', handleHash);
    }, []);
    const [snapshot, setSnapshot] = useState(null);
    const [pendingTasks, setPendingTasks] = useState([]);
    const [completedTasks, setCompletedTasks] = useState([]);
    const [cancelledTasks, setCancelledTasks] = useState([]);
    const [activeTask, setActiveTask] = useState(null);
    const [isPaused, setIsPaused] = useState(false);

    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [notice, setNotice] = useState(null);

    const toast = useCallback((message, kind = 'info') => {
        if (!message) return;
        setNotice({ message, kind, timestamp: Date.now() });
    }, []);

    // Check existing session/cookie on mount
    useEffect(() => {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('admin_key')) {
            setAuthed(true);
        }
        api('/api/admin/session')
            .then(res => {
                if (res.authenticated) {
                    setAuthed(true);
                }
            })
            .catch(() => {});
    }, []);

    // Auto-dismiss toast
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => {
            setNotice(null);
        }, notice.kind === 'error' ? 5000 : 3000);
        return () => clearTimeout(timer);
    }, [notice]);

    // Load radiant snapshot and daily schedule
    const loadRadiantData = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const [overviewRes, dayRes] = await Promise.allSettled([
                api('/api/admin/radiant/overview'),
                api('/api/admin/radiant/day')
            ]);

            if (overviewRes.status === 'fulfilled') {
                const s = overviewRes.value.overview || overviewRes.value;
                setSnapshot(s);
                setIsPaused(Boolean(s.is_paused || s.state?.is_paused));
                setActiveTask(s.active_task || s.activeTask || null);

                const queue = Array.isArray(s.queue) ? s.queue : [];
                setPendingTasks(queue.filter(t => ['PENDING', 'PLANNED', 'ROUTINE'].includes(t.status) || !t.status));
            } else if (overviewRes.reason?.message === 'AUTH_REQUIRED') {
                setAuthed(false);
            }

            if (dayRes.status === 'fulfilled') {
                const d = dayRes.value || {};
                const completed = Array.isArray(d.timeline)
                    ? d.timeline.filter(t => t.type === 'TASK_COMPLETED' || t.status === 'COMPLETED')
                    : [];
                setCompletedTasks(completed);

                const cancelled = Array.isArray(d.schedule)
                    ? d.schedule.filter(t => ['CANCELLED', 'MISSED', 'OVERDUE'].includes(t.status) || t.overdue)
                    : [];
                setCancelledTasks(cancelled);
            }
        } catch (err) {
            if (err.message === 'AUTH_REQUIRED') {
                setAuthed(false);
            } else if (!isSilent) {
                toast(err.message, 'error');
            }
        } finally {
            if (!isSilent) setLoading(false);
        }
    }, [toast]);

    // Initial load when authed
    useEffect(() => {
        if (authed) {
            loadRadiantData();
        }
    }, [authed, loadRadiantData]);

    // Auto-refresh interval (5 seconds)
    useEffect(() => {
        if (!authed || !autoRefresh) return;
        const interval = setInterval(() => {
            loadRadiantData(true);
        }, 5000);
        return () => clearInterval(interval);
    }, [authed, autoRefresh, loadRadiantData]);

    // Fast simulation actions
    const handleTick = useCallback(async () => {
        try {
            await api('/api/admin/radiant/tick', { method: 'POST' });
            toast('Шаг симуляции (+15 мин)', 'success');
            loadRadiantData();
        } catch (err) {
            toast(err.message, 'error');
        }
    }, [loadRadiantData, toast]);

    const handleTogglePause = useCallback(async () => {
        const nextPaused = !isPaused;
        setIsPaused(nextPaused);
        try {
            await api('/api/admin/radiant/god-mode', {
                method: 'POST',
                body: JSON.stringify({ action: 'SET_STATE', is_paused: nextPaused })
            });
            toast(nextPaused ? 'Симуляция на паузе' : 'Симуляция запущена', 'info');
        } catch (err) {
            toast(err.message, 'error');
        }
    }, [isPaused, toast]);

    // Global keyboard shortcuts (T, Space, R, M)
    useEffect(() => {
        if (!authed) return;

        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
                return;
            }

            if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') {
                e.preventDefault();
                handleTick();
            } else if (e.code === 'Space') {
                e.preventDefault();
                handleTogglePause();
            } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
                e.preventDefault();
                loadRadiantData();
                toast('Данные обновлены', 'info');
            } else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
                e.preventDefault();
                setActiveTab(prev => prev === 'overview' ? 'map' : 'overview');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [authed, handleTick, handleTogglePause, loadRadiantData, toast]);

    if (!authed && activeTab !== 'map') {
        return (
            <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
                <LoginModal 
                    onLogin={() => {
                        setAuthed(true);
                        loadRadiantData();
                    }}
                    onOpenMap={() => setActiveTab('map')}
                />
            </div>
        );
    }

    const state = snapshot?.state || {};
    const locId = state?.location_id || 'petrogradka_home';
    const needs = state?.needs || {};
    const npcs = snapshot?.npcs || {};
    const transit = snapshot?.transit || null;
    const weather = state?.weather || snapshot?.weather || null;

    return (
        <div className="min-h-screen flex flex-col bg-[#0c0c0c] text-[#f4f4f5]">
            <Header
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />

            {/* TAB 1: PULT — Figma frame 13:1910 */}
            {activeTab === 'overview' && (
                <main className="flex-1 w-full max-w-[1042px] mx-auto pt-[10px] pb-[60px] animate-in fade-in duration-150">
                    <div className="space-y-6">
                        {/* 1. Lera Status Hero (Figma 15:2765) */}
                        <LeraStatusHero
                            snapshot={snapshot}
                            activeTask={activeTask}
                            onOpenMap={() => setActiveTab('map')}
                        />

                        {/* 2. Needs & Vitals (Figma 13:2132) */}
                        <NeedsPanel
                            needs={needs}
                            onNeedsChanged={() => loadRadiantData(true)}
                            toast={toast}
                        />

                        {/* 3. Schedule & Tasks (Figma 13:2135) */}
                        <KanbanBoard
                            pendingTasks={pendingTasks}
                            activeTask={activeTask}
                            completedTasks={completedTasks}
                            cancelledTasks={cancelledTasks}
                            onTasksChanged={() => loadRadiantData()}
                            toast={toast}
                        />

                        {/* 4. Inventory & Equipment (Figma 14:2186) */}
                        <InventoryWidget
                            snapshot={snapshot}
                            onDataChanged={() => loadRadiantData()}
                            toast={toast}
                        />
                    </div>
                </main>
            )}

            {/* TAB 2: AI SETTINGS & FLOW PIPELINES */}
            {activeTab === 'ai' && (
                <AiSettingsTab toast={toast} />
            )}

            {/* TAB 3: CONTENT BANK */}
            {activeTab === 'content' && (
                <ContentBankTab toast={toast} />
            )}

            {/* TAB 4: ZENLY INTERACTIVE MAP */}
            {activeTab === 'map' && (
                <main className="flex-1 w-full h-[calc(100vh-86px)] overflow-hidden animate-in fade-in duration-150">
                    <ZenlyMap
                        currentLocation={locId}
                        transit={transit}
                        snapshot={snapshot}
                        weather={weather}
                        needs={needs}
                        activeTask={activeTask}
                        onLocationChanged={() => loadRadiantData()}
                        toast={toast}
                    />
                </main>
            )}

            {/* Floating Radiant Simulation Controls (Discreet HUD) */}
            <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 p-1.5 rounded-full bg-[#1b1d22]/90 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <button
                    type="button"
                    onClick={handleTick}
                    title="Шаг симуляции +15 минут (T)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#292e5e] hover:bg-[#383f7d] text-white text-xs font-medium transition-all active:scale-95 cursor-pointer"
                >
                    <FastForward className="w-3.5 h-3.5 text-sky-400 stroke-[1.5]" />
                    <span>+15м</span>
                </button>

                <button
                    type="button"
                    onClick={handleTogglePause}
                    title={isPaused ? 'Возобновить симуляцию (Space)' : 'Поставить на паузу (Space)'}
                    className={`p-2 rounded-full hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer ${
                        isPaused ? 'text-amber-400' : 'text-white/70 hover:text-white'
                    }`}
                >
                    {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                </button>

                <button
                    type="button"
                    onClick={() => loadRadiantData()}
                    disabled={loading}
                    title="Обновить состояние (R)"
                    className="p-2 rounded-full hover:bg-white/[0.08] text-white/70 hover:text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                    <RotateCw className={`w-3.5 h-3.5 stroke-[1.5] ${loading ? 'animate-spin text-sky-400' : ''}`} />
                </button>
            </div>

            <Toast notice={notice} onDismiss={() => setNotice(null)} />
        </div>
    );
}

export default App;
