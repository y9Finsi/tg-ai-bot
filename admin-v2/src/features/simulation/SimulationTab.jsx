import React, { useState, useEffect } from 'react';
import { Calendar, Package, Sparkles, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { isoDate } from '@/lib/dateUtils.js';
import { DiaryHeader } from './DiaryHeader.jsx';
import { ProfileCard } from './ProfileCard.jsx';
import { NeedsPanel } from './NeedsPanel.jsx';
import { CurrentDecision } from './CurrentDecision.jsx';
import { KanbanBoard } from './KanbanBoard.jsx';
import { DaySummary } from './DaySummary.jsx';
import { Timeline } from './Timeline.jsx';
import { InventoryPanel, InventoryWidget } from './InventoryWidget.jsx';
import { Commitments, NpcPanel } from './Commitments.jsx';
import { SimulationLab } from './SimulationLab.jsx';
import { SimulationPanel } from './SimulationPanel.jsx';

export function SimulationTab({ dayDate: externalDayDate, setDayDate: externalSetDayDate, toast }) {
    const todayIso = isoDate(new Date());
    const [localDayDate, setLocalDayDate] = useState(todayIso);
    const dayDate = externalDayDate || localDayDate;
    const setDayDate = externalSetDayDate || setLocalDayDate;

    const [subTab, setSubTab] = useState('diary');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    const [snapshot, setSnapshot] = useState(null);
    const [timelineEvents, setTimelineEvents] = useState([]);
    const [pendingTasks, setPendingTasks] = useState([]);
    const [completedTasks, setCompletedTasks] = useState([]);
    const [inProgressTask, setInProgressTask] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [itemCatalog, setItemCatalog] = useState([]);
    const [commitments, setCommitments] = useState([]);
    const [npcs, setNpcs] = useState([]);
    const [daySummary, setDaySummary] = useState(null);

    async function loadDayData() {
        try {
            const [snapRes, dayRes, invRes, catRes] = await Promise.allSettled([
                api(`/api/admin/simulation/snapshot?date=${dayDate}`),
                api(`/api/admin/simulation/day?date=${dayDate}`),
                api('/api/admin/simulation/inventory'),
                api('/api/admin/simulation/catalog')
            ]);

            if (snapRes.status === 'fulfilled') {
                const s = snapRes.value.snapshot || snapRes.value;
                setSnapshot(s);
                setIsPaused(Boolean(s.is_paused));
                setInProgressTask(s.currentTask || null);
            }

            if (dayRes.status === 'fulfilled') {
                const d = dayRes.value;
                setTimelineEvents(d.timeline || d.events || []);
                setPendingTasks(d.pendingTasks || d.forecast || []);
                setCompletedTasks(d.completedTasks || []);
                setCommitments(d.commitments || []);
                setNpcs(d.npcs || []);
                setDaySummary(d.summary || null);
            }

            if (invRes.status === 'fulfilled') {
                setInventory(invRes.value.inventory || invRes.value.items || []);
            }
            if (catRes.status === 'fulfilled') {
                setItemCatalog(catRes.value.catalog || catRes.value.items || []);
            }
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function togglePause() {
        try {
            const res = await api('/api/admin/simulation/pause', {
                method: 'POST',
                body: JSON.stringify({ pause: !isPaused })
            });
            setIsPaused(res.is_paused);
            if (toast) toast(res.is_paused ? 'Симуляция поставлена на паузу' : 'Симуляция возобновлена');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function handleTick() {
        try {
            await api('/api/admin/simulation/tick', { method: 'POST' });
            if (toast) toast('Шаг симуляции (+15 мин) выполнен');
            loadDayData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function handleAddInventory(itemId, qty) {
        try {
            await api('/api/admin/simulation/inventory', {
                method: 'POST',
                body: JSON.stringify({ item_id: itemId, quantity: qty })
            });
            if (toast) toast('Предмет добавлен в рюкзак');
            loadDayData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function handleRemoveInventory(itemId) {
        try {
            await api(`/api/admin/simulation/inventory/${itemId}`, { method: 'DELETE' });
            if (toast) toast('Предмет удален');
            loadDayData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    useEffect(() => {
        loadDayData();
    }, [dayDate]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(loadDayData, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, dayDate]);

    return (
        <div className="simulation-super-container admin-domain-page">
            <DiaryHeader
                dayDate={dayDate}
                setDayDate={setDayDate}
                todayIso={todayIso}
                autoRefresh={autoRefresh}
                setAutoRefresh={setAutoRefresh}
                isPaused={isPaused}
                onTogglePause={togglePause}
                onTick={handleTick}
                onOpenGodMode={() => setSubTab('lab')}
            />

            <div className="crm-subnav" style={{ marginTop: 12 }}>
                <Button
                    variant={subTab === 'diary' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('diary')}
                >
                    <Calendar size={14} /> 📖 Дневник и Расписание
                </Button>
                <Button
                    variant={subTab === 'inventory' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('inventory')}
                >
                    <Package size={14} /> 🎒 Рюкзак и Инвентарь ({inventory.length})
                </Button>
                <Button
                    variant={subTab === 'lab' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('lab')}
                >
                    <Sparkles size={14} /> ⚡ God Mode & Случайности
                </Button>
                <Button
                    variant={subTab === 'system' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('system')}
                >
                    <Cpu size={14} /> ⚙️ Операции Движка
                </Button>
            </div>

            <div style={{ marginTop: 14 }}>
                {subTab === 'diary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                            <ProfileCard snapshot={snapshot} cycleDay={snapshot?.cycle_day || 3} />
                            <InventoryWidget items={inventory} onOpenFull={() => setSubTab('inventory')} />
                        </div>
                        <NeedsPanel needs={snapshot?.needs || {}} />
                        <CurrentDecision
                            currentTask={inProgressTask}
                            currentDecision={snapshot?.currentDecision}
                            location={snapshot?.location}
                        />
                        <KanbanBoard
                            pendingTasks={pendingTasks}
                            inProgressTask={inProgressTask}
                            completedTasks={completedTasks}
                        />
                        <DaySummary summary={daySummary} dayDate={dayDate} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                            <Commitments commitments={commitments} />
                            <NpcPanel npcs={npcs} />
                        </div>
                        <Timeline events={timelineEvents} />
                    </div>
                )}

                {subTab === 'inventory' && (
                    <InventoryPanel
                        inventory={inventory}
                        catalog={itemCatalog}
                        onAddItem={handleAddInventory}
                        onRemoveItem={handleRemoveInventory}
                    />
                )}

                {subTab === 'lab' && (
                    <SimulationLab onRefresh={loadDayData} toast={toast} />
                )}

                {subTab === 'system' && (
                    <SimulationPanel toast={toast} />
                )}
            </div>
        </div>
    );
}

export default SimulationTab;
