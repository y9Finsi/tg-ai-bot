import React from 'react';
import { Badge } from '@/components/ui/badge.jsx';
import { Card } from '@/components/ui/card.jsx';
import { getCycleMeta, formatLocation, taskName } from '@/lib/simulationUtils.js';

export function StatCard({ label, value, hint, tone = 'blue' }) {
    return (
        <div className={`stat-card stat-tone-${tone}`} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>{label}</span>
            <strong style={{ fontSize: 18, color: '#f8fafc', margin: '2px 0', display: 'block' }}>{value}</strong>
            {hint && <small style={{ fontSize: 10, opacity: 0.7 }}>{hint}</small>}
        </div>
    );
}

export function ProfileCard({ snapshot, cycleDay = 3 }) {
    const cycle = getCycleMeta(cycleDay);
    const loc = snapshot?.location || snapshot?.currentLocation || 'petrogradka_home';
    const rawActivity = snapshot?.currentTask?.taskType || snapshot?.current_activity || snapshot?.state?.current_activity || 'IDLE_HOME_REST';
    const activity = taskName(rawActivity);

    return (
        <Card className="profile-widget-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 20 }}>Л</div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <strong style={{ fontSize: 15 }}>Лера</strong>
                        <Badge variant="blue">19 лет · СПб</Badge>
                        <Badge variant={cycle.tone}>{cycle.phase} (день {cycle.day}/28)</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        📍 <strong>{formatLocation(loc)}</strong> · Текущее занятие: <span>{activity}</span>
                    </div>
                </div>
            </div>
        </Card>
    );
}

export default ProfileCard;
