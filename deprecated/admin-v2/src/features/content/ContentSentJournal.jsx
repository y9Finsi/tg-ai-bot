import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { formatDate } from '@/lib/dateUtils.js';

export function ContentSentJournal({ contentSent = [] }) {
    return (
        <Card>
            <CardHeader
                eyebrow="Журнал"
                title="Последние отправки"
                description="Тестовые отправки сюда не попадают и лимиты не расходуют."
            />
            <div className="activity-list">
                {contentSent.length ? (
                    contentSent.map(row => (
                        <div className="activity-row" key={row.id}>
                            <strong>user {row.user_id}</strong>
                            <span>{row.telegram_type || 'content'} · {row.description || row.content || 'без описания'}</span>
                            <time>{formatDate(row.occurred_at)}</time>
                        </div>
                    ))
                ) : (
                    <div className="empty-state">Отправок пока нет.</div>
                )}
            </div>
        </Card>
    );
}

export default ContentSentJournal;
