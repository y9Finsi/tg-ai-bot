import React from 'react';
import { Badge } from '@/components/ui/badge.jsx';

export function Header({
    eyebrow,
    title,
    description,
    health,
    location,
    action
}) {
    return (
        <header className="v2-header">
            <div className="v2-page-heading">
                {eyebrow && <div className="eyebrow">{eyebrow}</div>}
                <h1>{title}</h1>
                {description && <p>{description}</p>}
            </div>
            {(action || health || location) && (
                <div className="header-actions">
                    {action}
                    {health && (
                        <Badge
                            variant={health?.status === 'ONLINE' ? 'green' : 'yellow'}
                            aria-label={`Статус системы: ${health?.status || 'Проверка'}`}
                        >
                            <span className="status-dot" /> {health?.status || 'Проверка'}
                        </Badge>
                    )}
                    {location && <Badge>{location}</Badge>}
                </div>
            )}
        </header>
    );
}

export default Header;
