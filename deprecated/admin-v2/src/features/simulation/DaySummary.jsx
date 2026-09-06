import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';

export function DaySummary({ summary, dayDate }) {
    const text = typeof summary === 'string' ? summary : summary?.narrative || summary?.text || summary?.summary || 'Дневниковая запись формируется в конце дня.';

    return (
        <Card className="day-summary-card">
            <CardHeader
                eyebrow="Итог дня"
                title="Дневниковая запись Леры"
                description={`Осмысление прожитого дня за ${dayDate || 'сегодня'}.`}
            />
            <div className="day-summary-body" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: '#f1f5f9', fontStyle: 'italic', background: 'rgba(0,0,0,0.25)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                "{text}"
            </div>
        </Card>
    );
}

export default DaySummary;
