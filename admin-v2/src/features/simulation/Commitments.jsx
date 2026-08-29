import React, { useState } from 'react';
import { Bookmark, Users, PhoneCall, Flame, Briefcase, Plus, CheckCircle, Clock } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { formatTime } from '@/lib/dateUtils.js';
import { api } from '@/lib/api.js';

export function NpcPanel({ npcs = [], onActionTriggered, toast }) {
    const [actionLoading, setActionLoading] = useState(false);

    async function triggerNpcAction(actionType, npcId) {
        setActionLoading(true);
        try {
            if (actionType === 'NASTYA_CALL') {
                await api('/api/admin/radiant/queue/push', {
                    method: 'POST',
                    body: JSON.stringify({
                        taskType: 'SOCIAL_NASTYA',
                        targetLocation: 'cafe_sloy',
                        durationMinutes: 45,
                        priority: 85,
                        createdBy: 'NPC_NASTYA'
                    })
                });
                toast?.('Настя позвала Леру на встречу в кафе «Слой»');
            } else if (actionType === 'NASTYA_DRAMA') {
                await api('/api/admin/radiant/god-mode', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'NASTYA_DRAMA_50' })
                });
                toast?.('Запущена ссора/драма с Настей (+50% уровня драмы)');
            } else if (actionType === 'MAX_DEADLINE') {
                await api('/api/admin/radiant/god-mode', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'MAX_DEADLINE' })
                });
                toast?.('Макс прислал срочную задачу по шоуруму (высокий дедлайн)');
            } else if (actionType === 'MAX_WORK') {
                await api('/api/admin/radiant/queue/push', {
                    method: 'POST',
                    body: JSON.stringify({
                        taskType: 'WORK_SHOWROOM',
                        targetLocation: 'showroom_work',
                        durationMinutes: 60,
                        priority: 80,
                        createdBy: 'NPC_MAX'
                    })
                });
                toast?.('Лера отправилась на смену в шоурум Макса на Васильевском');
            }
            onActionTriggered?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    }

    const defaultNpcs = [
        {
            id: 'nastya',
            name: 'Настя',
            role: 'Лучшая подруга · СПбГИК',
            description: 'Однокурсница в СПбГИК, тусовки, сплетни и совместные кофе-брейки.',
            trust: 85,
            affection: 90
        },
        {
            id: 'max_client',
            name: 'Макс',
            role: 'Владелец шоурума · Клиент',
            description: 'Руководитель шоурума одежды на ВО. Даёт задачи по SMM и съёмкам контента.',
            trust: 70,
            affection: 60
        }
    ];

    const displayNpcs = (Array.isArray(npcs) && npcs.length > 0) ? npcs : defaultNpcs;

    return (
        <Card className="npc-panel-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <CardHeader
                eyebrow="Социальный круг"
                title="NPC и Отношения"
                description="Настя и Макс: влияние на планы, звонки и спонтанные задачи."
            />
            <div className="npc-grid" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {displayNpcs.map(npc => {
                    const isNastya = npc.id === 'nastya' || npc.name?.toLowerCase().includes('настя');

                    return (
                        <div
                            key={npc.id || npc.name}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                                padding: 12,
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 8,
                                border: '1px solid var(--border)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong style={{ fontSize: 13, color: '#f8fafc' }}>{npc.name}</strong>
                                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>{npc.role}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <Badge variant="blue" style={{ fontSize: 10 }}>Доверие: {npc.trust ?? 80}%</Badge>
                                    <Badge variant="pink" style={{ fontSize: 10 }}>Связь: {npc.affection ?? 85}%</Badge>
                                </div>
                            </div>

                            <p style={{ margin: 0, fontSize: 11, color: '#cbd5e1', lineHeight: 1.3 }}>
                                {npc.description}
                            </p>

                            {/* NPC Action Buttons */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                                {isNastya ? (
                                    <>
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={actionLoading}
                                            onClick={() => triggerNpcAction('NASTYA_CALL', npc.id)}
                                        >
                                            <PhoneCall size={11} /> Позвать на кофе
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={actionLoading}
                                            onClick={() => triggerNpcAction('NASTYA_DRAMA', npc.id)}
                                        >
                                            <Flame size={11} /> Запустить драму
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={actionLoading}
                                            onClick={() => triggerNpcAction('MAX_DEADLINE', npc.id)}
                                        >
                                            <Clock size={11} /> Срочный дедлайн
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={actionLoading}
                                            onClick={() => triggerNpcAction('MAX_WORK', npc.id)}
                                        >
                                            <Briefcase size={11} /> Отправить в шоурум
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

export function Commitments({ commitments = [] }) {
    const safeCommitments = Array.isArray(commitments) ? commitments : [];

    return (
        <Card className="commitments-card">
            <CardHeader
                eyebrow="Обязательства"
                title="Планы и Обещания Леры"
                description="Договорённости о встречах, дедлайны по работе и визиты."
            />
            <div className="commitments-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {safeCommitments.length ? (
                    safeCommitments.map((com, idx) => (
                        <div
                            key={com.id || idx}
                            className="managed-row"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 12px',
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 6,
                                border: '1px solid var(--border)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Bookmark size={15} style={{ color: '#38bdf8' }} />
                                <div>
                                    <strong style={{ fontSize: 12, color: '#f1f5f9' }}>{com.title || com.task_type || 'Обязательство'}</strong>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        {com.partner ? `С кем: ${com.partner} · ` : ''}{com.description || '—'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Badge variant={com.status === 'COMPLETED' ? 'green' : com.status === 'MISSED' ? 'red' : 'blue'}>
                                    {com.status === 'COMPLETED' ? 'Выполнено' : com.status === 'MISSED' ? 'Пропущено' : 'В планах'}
                                </Badge>
                                {com.deadline && <span style={{ fontSize: 11, opacity: 0.7 }}>до {formatTime(com.deadline)}</span>}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state" style={{ padding: 12, fontSize: 12 }}>
                        Активных обязательств на сегодня нет.
                    </div>
                )}
            </div>
        </Card>
    );
}

export default Commitments;
