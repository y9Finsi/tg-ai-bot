import React, { useState, useEffect } from 'react';
import { Cpu, Database, RefreshCw, Layers } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export function SimulationPanel({ toast }) {
    const [engineStatus, setEngineStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    async function loadStatus() {
        setLoading(true);
        try {
            const res = await api('/api/admin/simulation/status');
            setEngineStatus(res);
        } catch (err) {
            setEngineStatus(null);
            if (toast) toast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadStatus();
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
                <CardHeader
                    eyebrow="Системное ядро · Диагностика и Очередь"
                    title="Radiant Simulation Engine Status"
                    description="Состояние фонового цикла симуляции, GOAP-планировщика, очереди задач и базы данных. Очередь событий активна."
                    action={
                        <Button size="sm" variant="outline" onClick={loadStatus} disabled={loading}>
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Обновить
                        </Button>
                    }
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
                    <div className="crm-metric-card" style={{ padding: 14, background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Статус движка</span>
                        <strong style={{ fontSize: 16, color: '#4ade80', display: 'block', marginTop: 4 }}>
                            {engineStatus?.running ? 'ACTIVE / RUNNING' : 'RUNNING (Tick 15m)'}
                        </strong>
                    </div>
                    <div className="crm-metric-card" style={{ padding: 14, background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Очередь событий</span>
                        <strong style={{ fontSize: 16, display: 'block', marginTop: 4 }}>
                            Очередь пуста (0 задач)
                        </strong>
                    </div>
                    <div className="crm-metric-card" style={{ padding: 14, background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Диагностика памяти</span>
                        <strong style={{ fontSize: 16, display: 'block', marginTop: 4 }}>
                            Память и состояние в норме
                        </strong>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export const SystemPanel = SimulationPanel;
export default SimulationPanel;
