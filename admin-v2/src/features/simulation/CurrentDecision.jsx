import React from 'react';
import { Sparkles, MapPin, Clock } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { taskName, formatLocation, formatDecisionReason } from '@/lib/simulationUtils.js';

export function CurrentDecision({ currentTask, currentDecision, location, matchedFact }) {
    const activeTask = currentTask || currentDecision?.task;
    const taskType = activeTask?.taskType || activeTask?.type || 'IDLE_HOME_REST';
    const reasonText = formatDecisionReason(currentDecision, taskType);

    return (
        <Card className="current-decision-card">
            <CardHeader
                eyebrow="План и подтверждённый результат"
                title={`Сейчас: ${taskName(taskType)}`}
                description={reasonText}
                action={
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge variant="blue">
                            <MapPin size={12} /> {formatLocation(location)}
                        </Badge>
                        {activeTask?.progress !== undefined && (
                            <Badge variant="green">
                                <Clock size={12} /> {activeTask.progress}%
                            </Badge>
                        )}
                    </div>
                }
            />
            {matchedFact && (
                <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 6, border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: 12, color: '#cbd5e1' }}>
                    <span style={{ color: 'var(--blue)', fontWeight: 600 }}>💡 Подтверждённый факт: </span>
                    {typeof matchedFact === 'object' ? matchedFact.text || matchedFact.fact || JSON.stringify(matchedFact) : matchedFact}
                </div>
            )}
            {currentDecision?.effects && typeof currentDecision.effects === 'object' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Ожидаемый эффект:</span>
                    {Object.entries(currentDecision.effects).map(([k, v]) => (
                        <Badge key={k} variant={Number(v) < 0 ? 'green' : 'yellow'} style={{ fontSize: 11 }}>
                            {k}: {Number(v) > 0 ? `+${v}` : v}
                        </Badge>
                    ))}
                </div>
            )}
        </Card>
    );
}

export default CurrentDecision;
