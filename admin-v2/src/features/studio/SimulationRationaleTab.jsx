import React, { useState, useEffect } from 'react';
import { BrainCircuit, RefreshCw, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';
import { formatTime } from '@/lib/dateUtils.js';

export function SimulationRationaleTab({ toast }) {
    const [decisions, setDecisions] = useState([]);
    const [loading, setLoading] = useState(false);

    async function loadDecisions() {
        setLoading(true);
        try {
            const res = await api('/api/admin/radiant/rationale?limit=30');
            setDecisions(res.traces || []);
        } catch (err) {
            setDecisions([]);
            if (toast) toast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadDecisions();
    }, []);

    return (
        <Card>
            <CardHeader
                eyebrow="GOAP & Utility Decision Trace"
                title="Обоснование решений симуляции"
                description="Почему Radiant Engine выбрал конкретные действия, оценки полезности (utility) и альтернативы."
                action={
                    <Button size="sm" variant="outline" onClick={loadDecisions} disabled={loading}>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Обновить
                    </Button>
                }
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {decisions.length ? (
                    decisions.map((dec, idx) => (
                        <div
                            key={dec.id || idx}
                            className="managed-row"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: 14,
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 8,
                                border: '1px solid var(--border)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Badge variant="blue">{dec.task_type || dec.chosen_action || 'Решение'}</Badge>
                                    <Badge variant="muted">{dec.engine || 'GOAP'}</Badge>
                                </div>
                                <span style={{ fontSize: 11, opacity: 0.7 }}>{formatTime(dec.timestamp || dec.created_at)}</span>
                            </div>

                            <div style={{ fontSize: 13, color: '#f1f5f9' }}>
                                <strong>Причина выбора:</strong> {dec.reason || dec.explanation || 'Баланс потребностей и текущего расписания'}
                            </div>

                            {dec.candidates && dec.candidates.length > 0 && (
                                <div style={{ width: '100%', fontSize: 12, marginTop: 4 }}>
                                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>Рассмотренные альтернативы (Utility scores):</span>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                        {dec.candidates.map((c, cIdx) => (
                                            <span
                                                key={cIdx}
                                                style={{
                                                    background: 'rgba(255,255,255,0.06)',
                                                    padding: '3px 8px',
                                                    borderRadius: 4,
                                                    color: c.chosen ? '#4ade80' : '#94a3b8'
                                                }}
                                            >
                                                {c.name || c.task}: {Number(c.score || c.utility || 0).toFixed(2)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="empty-state" style={{ minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <BrainCircuit size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                        <p>Обоснования решений симуляции пока не накопились.</p>
                    </div>
                )}
            </div>
        </Card>
    );
}

export default SimulationRationaleTab;
