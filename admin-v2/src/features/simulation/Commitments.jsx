import React from 'react';
import { Bookmark, Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { formatTime } from '@/lib/dateUtils.js';

export function Commitments({ commitments = [] }) {
    const safeCommitments = Array.isArray(commitments) ? commitments : [];

    return (
        <Card className="commitments-card">
            <CardHeader
                eyebrow="Обязательства"
                title="Планы и Обещания Леры"
                description="Договорённости о встречах, дедлайны по работе и запланированные визиты."
            />
            <div className="commitments-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {safeCommitments.length ? (
                    safeCommitments.map((com, idx) => (
                        <div
                            key={com.id || idx}
                            className="managed-row"
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Bookmark size={15} />
                                <div>
                                    <strong>{com.title || com.task_type || 'Обязательство'}</strong>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        {com.partner ? `С кем: ${com.partner} · ` : ''}{com.description || '—'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Badge variant={com.status === 'COMPLETED' ? 'green' : com.status === 'MISSED' ? 'red' : 'blue'}>
                                    {com.status || 'PENDING'}
                                </Badge>
                                {com.deadline && <span style={{ fontSize: 11, opacity: 0.7 }}>до {formatTime(com.deadline)}</span>}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state">Нет активных обязательств.</div>
                )}
            </div>
        </Card>
    );
}

export function NpcPanel({ npcs = [] }) {
    const safeNpcs = Array.isArray(npcs) ? npcs : [];

    return (
        <Card className="npc-panel-card">
            <CardHeader
                eyebrow="Социальный круг"
                title="NPC и Близкие персонажи"
                description="Настя, Макс и динамика взаимоотношений с ними."
            />
            <div className="npc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 10 }}>
                {safeNpcs.map(npc => (
                    <div
                        key={npc.id || npc.name}
                        className="managed-row"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <strong style={{ fontSize: 14 }}>{npc.name}</strong>
                            <Badge variant="blue">{npc.role || 'Друг'}</Badge>
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{npc.description || '—'}</div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 11, marginTop: 4 }}>
                            <span>Trust: <strong>{npc.trust ?? 50}</strong></span>
                            <span>Affection: <strong>{npc.affection ?? 50}</strong></span>
                        </div>
                    </div>
                ))}
                {!safeNpcs.length && <div className="empty-state">NPC персонажи не настроены.</div>}
            </div>
        </Card>
    );
}

export default Commitments;
