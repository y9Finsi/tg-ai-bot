import React from 'react';
import { LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';

export function Header({
    eyebrow,
    title,
    description,
    health,
    location,
    action
}) {
    async function handleLogout() {
        try {
            await api('/api/admin/logout', { method: 'POST' });
        } catch (e) {
            // ignore
        }
        sessionStorage.removeItem('admin_key');
        window.location.reload();
    }

    return (
        <header className="v2-header">
            <div className="v2-page-heading">
                {eyebrow && <div className="eyebrow">{eyebrow}</div>}
                <h1>{title}</h1>
                {description && <p>{description}</p>}
            </div>
            <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                <Button size="xs" variant="outline" onClick={handleLogout} title="Выйти из панели управления">
                    <LogOut size={13} /> Выход
                </Button>
            </div>
        </header>
    );
}

export default Header;
