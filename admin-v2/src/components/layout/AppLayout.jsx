import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Radio, Users, SlidersHorizontal, Brain, Image, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Toast } from '@/components/ui/Toast.jsx';

export const NAV_ITEMS = [
    { route: 'channel', title: 'Канал и ТГК', icon: Radio },
    { route: 'crm', title: 'CRM Пользователей', icon: Users },
    { route: 'studio', title: 'AI Sandbox & Prompts', icon: SlidersHorizontal },
    { route: 'providers', title: 'Матрица Моделей', icon: Brain },
    { route: 'content', title: 'Контент и Медиа', icon: Image },
    { route: 'simulation', title: 'Симуляция и Дневник', icon: Zap }
];

export function AppLayout({
    activeRoute,
    onNavigate,
    notice,
    onDismissToast,
    health,
    children
}) {
    return (
        <div className="v2-shell diary-shell">
            <main className="v2-main" role="main">
                <header className="v2-topbar">
                    <div className="topbar-brand">
                        <div className="brand-mark">Л</div>
                        <div className="brand-title">
                            <strong>Лера 2.0</strong>
                            <span>Control Center</span>
                        </div>
                    </div>
                    <Tabs.Root className="diary-tabs-root" value={activeRoute} onValueChange={onNavigate}>
                        <Tabs.List className="diary-tabbar" aria-label="Разделы админки">
                            {NAV_ITEMS.map(item => {
                                const Icon = item.icon;
                                return (
                                    <Tabs.Trigger key={item.route} value={item.route}>
                                        <Icon size={14} /> <span>{item.title}</span>
                                    </Tabs.Trigger>
                                );
                            })}
                        </Tabs.List>
                    </Tabs.Root>
                    <div className="topbar-status-bar">
                        <Badge variant={health?.status === 'ONLINE' ? 'green' : 'yellow'} aria-label={`Статус системы: ${health?.status || 'ONLINE'}`}>
                            <span className="status-dot" /> {health?.status || 'ONLINE'}
                        </Badge>
                        <Badge>Санкт-Петербург</Badge>
                    </div>
                </header>

                <div className="v2-content">
                    {children}
                </div>
            </main>
            {notice && <Toast notice={notice} onDismiss={onDismissToast} />}
        </div>
    );
}

export default AppLayout;
