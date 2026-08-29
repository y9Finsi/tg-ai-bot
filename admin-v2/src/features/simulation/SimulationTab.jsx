import React, { useState, useEffect } from 'react';
import { Calendar, Package, Sparkles, Cpu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { isoDate } from '@/lib/dateUtils.js';
import { DiaryHeader } from './DiaryHeader.jsx';
import { LiveStatusCard } from './LiveStatusCard.jsx';
import { SpbMapWidget } from './SpbMapWidget.jsx';
import { NeedsPanel } from './NeedsPanel.jsx';
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
    const [cancelledTasks, setCancelledTasks] = useState([]);
    const [inProgressTask, setInProgressTask] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [itemCatalog, setItemCatalog] = useState([]);
    const [commitments, setCommitments] = useState([]);
    const [npcs, setNpcs] = useState([]);
    const [daySummary, setDaySummary] = useState(null);

    async function loadDayData() {
        try {
            const [snapRes, dayRes, invRes] = await Promise.allSettled([
                api('/api/admin/radiant/overview'),
                api(`/api/admin/radiant/day?at=${encodeURIComponent(`${dayDate}T12:00:00+03:00`)}`),
                api('/api/admin/inventory')
            ]);

            if (snapRes.status === 'fulfilled') {
                const s = snapRes.value.overview || snapRes.value;
                setSnapshot(s);
                setIsPaused(Boolean(s.is_paused || s.state?.is_paused));
                setInProgressTask(s.active_task || s.activeTask || null);
            }

            if (dayRes.status === 'fulfilled') {
                const d = dayRes.value || {};
                setTimelineEvents(Array.isArray(d.timeline) ? d.timeline : (Array.isArray(d.events) ? d.events : []));
                const forecastNodes = Array.isArray(d.forecast)
                    ? d.forecast
                    : (Array.isArray(d.forecast?.nodes) ? d.forecast.nodes : []);
                const schedulePlanned = Array.isArray(d.schedule)
                    ? d.schedule.filter(item => item.status === 'PLANNED' || item.status === 'FORECAST' || item.status === 'ROUTINE')
                    : [];
                setPendingTasks(forecastNodes.length > 0 ? forecastNodes : schedulePlanned);
                setCompletedTasks(Array.isArray(d.timeline) ? d.timeline.filter(item => item.type === 'TASK_COMPLETED') : []);
                const cancelled = Array.isArray(d.schedule)
                    ? d.schedule.filter(item => ['CANCELLED', 'MISSED', 'OVERDUE'].includes(item.status) || item.overdue)
                    : [];
                setCancelledTasks(cancelled);
                setCommitments(Array.isArray(d.commitments) ? d.commitments : []);
                setNpcs(Array.isArray(d.npcs) ? d.npcs : (Array.isArray(d.people) ? d.people : []));
                setDaySummary(d.summary || null);
            }

            if (invRes.status === 'fulfilled') {
                const invVal = invRes.value || {};
                setInventory(Array.isArray(invVal.inventory) ? invVal.inventory : (Array.isArray(invVal.items) ? invVal.items : []));
                setItemCatalog(Array.isArray(invVal.catalog) ? invVal.catalog : []);
            }
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function togglePause() {
        const nextPaused = !isPaused;
        setIsPaused(nextPaused);
        try {
            await api('/api/admin/radiant/god-mode', {
                method: 'POST',
                body: JSON.stringify({ action: 'SET_STATE', is_paused: nextPaused })
            });
        } catch (e) {
            // fallback
        }
        if (toast) toast(nextPaused ? 'Симуляция поставлена на паузу' : 'Симуляция возобновлена');
    }

    async function handleTick() {
        try {
            await api('/api/admin/radiant/tick', { method: 'POST' });
            if (toast) toast('Шаг симуляции (+15 мин) выполнен');
            loadDayData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function handleAddInventory(itemId, qty) {
        try {
            await api('/api/admin/inventory/add', {
                method: 'POST',
                body: JSON.stringify({ itemId, itemType: 'misc', quantity: qty })
            });
            if (toast) toast('Предмет добавлен в рюкзак');
            loadDayData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function handleUseInventory(item) {
        try {
            if (item.item_type === 'clothing' || item.type === 'clothing') {
                await api('/api/admin/inventory/equip', {
                    method: 'POST',
                    body: JSON.stringify({ itemId: item.item_id || item.id })
                });
                if (toast) toast(`Одежда «${item.name || item.item_id}» надета`);
            } else {
                await api('/api/admin/inventory/consume', {
                    method: 'POST',
                    body: JSON.stringify({ itemId: item.item_id || item.id, quantity: 1 })
                });
                if (toast) toast(`Предмет «${item.name || item.item_id}» использован`);
            }
            loadDayData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function handleRemoveInventory(itemId) {
        try {
            await api('/api/admin/inventory/consume', {
                method: 'POST',
                body: JSON.stringify({ itemId, quantity: 1 })
            });
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

    const locId = snapshot?.state?.location_id || snapshot?.location_id || 'petrogradka_home';
    const rubles = snapshot?.state?.wallet_rubles ?? snapshot?.state?.wallet?.rubles ?? 70;
    const stars = snapshot?.state?.wallet_stars ?? snapshot?.state?.wallet?.stars ?? 150;
    const cycleDay = snapshot?.state?.physiology?.cycle_day || snapshot?.cycle_day || 25;

    return (
        <div className="simulation-super-container admin-domain-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

            <div className="crm-subnav">
                <Button
                    variant={subTab === 'diary' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('diary')}
                >
                    <Calendar size={14} /> 📖 Пульт жизни и Расписание
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
                    <Sparkles size={14} /> 🧪 Simulation Lab & God Mode
                </Button>
                <Button
                    variant={subTab === 'system' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('system')}
                >
                    <Cpu size={14} /> ⚙️ Операции Движка
                </Button>
            </div>

            <div style={{ marginTop: 2 }}>
                {subTab === 'diary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* ========================================================= */}
                        {/* БЛОК 1: ЖИВОЙ СТАТУС (TELEGRAM КОНТЕКСТ) */}
                        {/* ========================================================= */}
                        <LiveStatusCard
                            snapshot={snapshot}
                            activeTask={inProgressTask}
                            currentLocation={locId}
                            weather={snapshot?.weather || snapshot?.state?.weather}
                            cycleDay={cycleDay}
                            moneyRubles={rubles}
                            moneyStars={stars}
                            recentFacts={snapshot?.facts || timelineEvents}
                        />

                        {/* ========================================================= */}
                        {/* БЛОК 2: ПОТРЕБНОСТИ ЛЕРЫ (ЧИПЫ СТАТУСА + 6 ШКАЛ В ОДИН РЯД) */}
                        {/* ========================================================= */}
                        <NeedsPanel
                            needs={snapshot?.state?.needs || snapshot?.needs || {}}
                            location={locId}
                            weather={snapshot?.weather || snapshot?.state?.weather}
                            cycleDay={cycleDay}
                            moneyRubles={rubles}
                            moneyStars={stars}
                            onRefresh={loadDayData}
                            toast={toast}
                        />

                        {/* ========================================================= */}
                        {/* БЛОК 3: ИНТЕРАКТИВНАЯ КАРТА СПБ (LEAFLET) */}
                        {/* ========================================================= */}
                        <SpbMapWidget
                            currentLocation={locId}
                            isTransit={Boolean(snapshot?.transit || inProgressTask?.task_type === 'TRAVEL')}
                            onLocationChanged={loadDayData}
                            toast={toast}
                        />

                        {/* ========================================================= */}
                        {/* БЛОК 2: ПОЛНОРАЗМЕРНЫЙ KANBAN РАСПИСАНИЯ ДНЯ (4 КОЛОНКИ В РЯД) */}
                        {/* ========================================================= */}
                        <KanbanBoard
                            pendingTasks={pendingTasks}
                            inProgressTask={inProgressTask}
                            completedTasks={completedTasks}
                            cancelledTasks={cancelledTasks}
                        />

                        {/* ========================================================= */}
                        {/* БЛОК 3: СОЦИАЛЬНЫЙ КРУГ, ПЛАНЫ И РЮКЗАК */}
                        {/* ========================================================= */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <NpcPanel
                                    npcs={npcs}
                                    onActionTriggered={loadDayData}
                                    toast={toast}
                                />
                                <Commitments
                                    commitments={commitments}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <DaySummary summary={daySummary} dayDate={dayDate} />
                                <InventoryWidget
                                    items={inventory}
                                    onOpenFull={() => setSubTab('inventory')}
                                />
                            </div>
                        </div>

                        {/* ========================================================= */}
                        {/* БЛОК 4: ХРОНИКА ВРЕМЕНИ (TIMELINE) */}
                        {/* ========================================================= */}
                        <Timeline events={timelineEvents} />
                    </div>
                )}

                {subTab === 'inventory' && (
                    <InventoryPanel
                        inventory={inventory}
                        catalog={itemCatalog}
                        onAddItem={handleAddInventory}
                        onUseItem={handleUseInventory}
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
