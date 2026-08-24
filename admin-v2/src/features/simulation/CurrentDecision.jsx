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
            {currentDecision?.effects && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                    <strong>Ожидаемый эффект:</strong> {JSON.stringify(currentDecision.effects)}
                </div>
            )}
        </Card>
    );
}

export default CurrentDecision;
