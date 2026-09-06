import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api.js';
import { Header } from '@/components/Header.jsx';
import { LeraStatusHero } from '@/components/LeraStatusHero.jsx';
import { KanbanBoard } from '@/components/KanbanBoard.jsx';
import { NeedsPanel } from '@/components/NeedsPanel.jsx';
import { FriendsPanel } from '@/components/FriendsPanel.jsx';
import { FullScreenMap } from '@/components/FullScreenMap.jsx';
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
            if (hash === '#map' || search.get('tab') === 'map') return 'map';
        }
        return 'overview';
    });

    const setActiveTab = useCallback((tab) => {
        setActiveTabState(tab);
        if (typeof window !== 'undefined') {
            window.location.hash = tab === 'map' ? '#map' : '#overview';
        }
    }, []);

    useEffect(() => {
        const handleHash = () => {
            const hash = window.location.hash.toLowerCase();
            if (hash === '#map') setActiveTabState('map');
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
        <div className="min-h-screen flex flex-col bg-[#08090a] text-[#f4f4f5]">
            <Header
                activeTab={activeTab}
                onTabChange={setActiveTab}
                snapshot={snapshot}
                isPaused={isPaused}
                onTogglePause={handleTogglePause}
                onTick={handleTick}
                onRefresh={() => loadRadiantData()}
                loading={loading}
                autoRefresh={autoRefresh}
                setAutoRefresh={setAutoRefresh}
            />

            {/* TAB 1: OVERVIEW / PULSE (LINEAR COLUMN FLOW, MAX-W-[830PX], 6-COL SYSTEM) */}
            {activeTab === 'overview' && (
                <main className="flex-1 w-full max-w-[830px] mx-auto px-3 sm:px-4 py-5 animate-in fade-in duration-150">
                    <div className="grid grid-cols-6 gap-3.5 items-start">
                        {/* 1. Lera Status Hero (col-span-6) */}
                        <div className="col-span-6">
                            <LeraStatusHero
                                snapshot={snapshot}
                                activeTask={activeTask}
                                onOpenMap={() => setActiveTab('map')}
                            />
                        </div>

                        {/* 2. Needs & Vitals (col-span-6) */}
                        <div className="col-span-6">
                            <NeedsPanel
                                needs={needs}
                                onNeedsChanged={() => loadRadiantData(true)}
                                toast={toast}
                            />
                        </div>

                        {/* 3. Schedule & Tasks (col-span-6) */}
                        <div className="col-span-6">
                            <KanbanBoard
                                pendingTasks={pendingTasks}
                                activeTask={activeTask}
                                completedTasks={completedTasks}
                                cancelledTasks={cancelledTasks}
                                onTasksChanged={() => loadRadiantData()}
                                toast={toast}
                            />
                        </div>

                        {/* 4. Friends & Social Circle (col-span-6) */}
                        <div className="col-span-6">
                            <FriendsPanel
                                npcs={npcs}
                                onActionTriggered={() => loadRadiantData()}
                                toast={toast}
                            />
                        </div>
                    </div>
                </main>
            )}

            {/* TAB 2: FULL-SCREEN MAP */}
            {activeTab === 'map' && (
                <main className="flex-1 w-full h-[calc(100vh-52px)] overflow-hidden animate-in fade-in duration-150">
                    <FullScreenMap
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

            <Toast notice={notice} onDismiss={() => setNotice(null)} />
        </div>
    );
}

export default App;
