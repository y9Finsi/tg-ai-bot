import React from 'react';
import { Radio, Users, SlidersHorizontal, Brain, Image, Zap } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export const NAV_ITEMS = [
    {
        route: 'channel',
        hash: '#channel',
        title: 'Канал и Публикации',
        icon: Radio,
        description: 'ТГК, черновики, автопостинг'
    },
    {
        route: 'crm',
        hash: '#crm',
        title: 'CRM Пользователей',
        icon: Users,
        description: 'Клиенты, балансы, память'
    },
    {
        route: 'studio',
        hash: '#studio',
        title: 'AI Sandbox & Prompts',
        icon: SlidersHorizontal,
        description: 'Промпты, тесты A/B, Judge'
    },
    {
        route: 'providers',
        hash: '#providers',
        title: 'Матрица AI Моделей',
        icon: Brain,
        description: 'Маршрутизация 6 слотов, ping'
    },
    {
        route: 'content',
        hash: '#content',
        title: 'Контент и Медиа',
        icon: Image,
        description: 'Фото, CosyVoice 3, каталог'
    },
    {
        route: 'simulation',
        hash: '#simulation',
        title: 'Симуляция и Дневник',
        icon: Zap,
        description: 'GOAP, рюкзак, логи, движок'
    }
];

export function Sidebar({ activeRoute, onNavigate }) {
    return (
        <aside className="v2-sidebar" aria-label="Основная навигация">
            <div className="sidebar-brand">
                <div className="brand-mark">Л</div>
                <div className="brand-title">
                    <strong>Лера 2.0</strong>
                    <span>Control Center</span>
                </div>
            </div>

            <nav className="sidebar-nav" role="navigation">
                {NAV_ITEMS.map(item => {
                    const Icon = item.icon;
                    const isActive = activeRoute === item.route;

                    return (
                        <a
                            key={item.route}
                            href={item.hash}
                            className={cn('sidebar-nav-item', isActive && 'is-active')}
                            onClick={(e) => {
                                if (onNavigate) {
                                    e.preventDefault();
                                    onNavigate(item.route);
                                }
                            }}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className="nav-item-icon">
                                <Icon size={16} />
                            </span>
                            <div className="nav-item-text">
                                <span className="nav-item-title">{item.title}</span>
                                <small className="nav-item-desc">{item.description}</small>
                            </div>
                            {isActive && <span className="nav-item-active-indicator" />}
                        </a>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-system-badge">
                    <span className="status-dot" />
                    <span>SPA v2.0 · Live</span>
                </div>
            </div>
        </aside>
    );
}

export default Sidebar;
