import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api.js';
import { isoDate } from '@/lib/dateUtils.js';
import { Login } from '@/components/ui/Login.jsx';
import { AppLayout } from '@/components/layout/AppLayout.jsx';
import { Header } from '@/components/layout/Header.jsx';
import { ChannelTab } from '@/features/channel/index.jsx';
import { CrmTab } from '@/features/crm/index.jsx';
import { StudioTab } from '@/features/studio/index.jsx';
import { ProvidersTab } from '@/features/providers/index.jsx';
import { ContentTab } from '@/features/content/index.jsx';
import { SimulationTab } from '@/features/simulation/index.jsx';

export const ROUTE_CONFIG = {
    channel: {
        title: 'Канал и Публикации',
        eyebrow: 'TELEGRAM CHANNEL & AUTOPOSTING',
        description: 'Управление публикациями в ТГК, черновики, проверка качества и расписание постов.'
    },
    crm: {
        title: 'CRM и Клиенты',
        eyebrow: 'USER INTELLIGENCE & CRM',
        description: 'Профили пользователей, балансы, ассоциативный Memory Graph, response trace и аналитика.'
    },
    studio: {
        title: 'AI Sandbox & Prompts Studio',
        eyebrow: 'PROMPT ENGINEERING & SANDBOX',
        description: 'Песочница A/B тестирования, системные промпты Леры, AI Judge и инструменты MCP.'
    },
    providers: {
        title: 'Матрица AI Моделей',
        eyebrow: 'MODEL MATRIX & AI INFRASTRUCTURE',
        description: 'Централизованная матрица 6 AI слотов, fallback цепочки, мгновенный пинг, генерация фото и голоса.'
    },
    content: {
        title: 'Контент и Медиатека',
        eyebrow: 'MEDIA ASSETS & PHOTOS',
        description: 'Галерея фото Леры, авто-сжатие Canvas, мастер-референс лица и каталог материалов.'
    },
    simulation: {
        title: 'Симуляция и Дневник',
        eyebrow: 'RADIANT LIFE ENGINE',
        description: 'Дневник жизни Леры, физиологические потребности, GOAP планирование, рюкзак и управление временем.'
    }
};

export function parseHashRoute(hash = window.location.hash) {
    const clean = (hash || '').replace(/^#\/?/, '').toLowerCase().trim();
    if (!clean) return 'channel';

    // Route alias mapping for backward compatibility
    if (clean === 'diary') return 'simulation';
    if (clean === 'inventory') return 'simulation';
    if (clean === 'system') return 'simulation';
    if (clean === 'dialogs' || clean === 'llm-settings' || clean === 'prompts') return 'studio';
    if (clean === 'photos' || clean === 'media') return 'content';

    if (ROUTE_CONFIG[clean]) return clean;
    return 'channel';
}

export function App() {
    const [authed, setAuthed] = useState(() => {
        return typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('admin_key'));
    });

    const [activeRoute, setActiveRoute] = useState(() => parseHashRoute());
    const [notice, setNotice] = useState(null);
    const [health, setHealth] = useState({ status: 'ONLINE', details: {} });
    const [dayDate, setDayDate] = useState(() => isoDate(new Date()));

    const toast = useCallback((message, kind = 'info') => {
        if (!message) return;
        setNotice({ message, kind, timestamp: Date.now() });
    }, []);

    // Dismiss toast
    const dismissToast = useCallback(() => {
        setNotice(null);
    }, []);

    // Auto-dismiss toast after timeout
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => {
            setNotice(null);
        }, notice.kind === 'error' ? 6000 : 3500);
        return () => clearTimeout(timer);
    }, [notice]);

    // Sync state with URL hash
    useEffect(() => {
        const handleHashChange = () => {
            const nextRoute = parseHashRoute(window.location.hash);
            setActiveRoute(nextRoute);
        };

        window.addEventListener('hashchange', handleHashChange);
        // Ensure hash is in sync on mount
        if (!window.location.hash) {
            window.location.hash = `#${activeRoute}`;
        }

        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [activeRoute]);

    const navigateTo = useCallback((route) => {
        if (window.location.hash !== `#${route}`) {
            window.location.hash = `#${route}`;
        }
        setActiveRoute(route);
    }, []);

    // 15-second health polling
    useEffect(() => {
        if (!authed) return;

        async function pollHealth() {
            try {
                const res = await api('/api/admin/health');
                setHealth(res || { status: 'ONLINE' });
            } catch {
                setHealth({ status: 'DEGRADED' });
            }
        }

        pollHealth();
        const interval = setInterval(pollHealth, 15000);
        return () => clearInterval(interval);
    }, [authed]);

    if (!authed) {
        return <Login onLogin={() => setAuthed(true)} />;
    }

    const currentConfig = ROUTE_CONFIG[activeRoute] || ROUTE_CONFIG.channel;

    return (
        <AppLayout
            activeRoute={activeRoute}
            onNavigate={navigateTo}
            notice={notice}
            onDismissToast={dismissToast}
        >
            <Header
                eyebrow={currentConfig.eyebrow}
                title={currentConfig.title}
                description={currentConfig.description}
                health={health}
                location="Санкт-Петербург"
            />

            {/* Keep-alive Tab Containers (preserve scroll, uncommitted form inputs, and state) */}
            <div
                className="v2-tab-pane"
                style={{ display: activeRoute === 'channel' ? 'block' : 'none' }}
                aria-hidden={activeRoute !== 'channel'}
            >
                <ChannelTab toast={toast} />
            </div>

            <div
                className="v2-tab-pane"
                style={{ display: activeRoute === 'crm' ? 'block' : 'none' }}
                aria-hidden={activeRoute !== 'crm'}
            >
                <CrmTab toast={toast} />
            </div>

            <div
                className="v2-tab-pane"
                style={{ display: activeRoute === 'studio' ? 'block' : 'none' }}
                aria-hidden={activeRoute !== 'studio'}
            >
                <StudioTab toast={toast} />
            </div>

            <div
                className="v2-tab-pane"
                style={{ display: activeRoute === 'providers' ? 'block' : 'none' }}
                aria-hidden={activeRoute !== 'providers'}
            >
                <ProvidersTab toast={toast} />
            </div>

            <div
                className="v2-tab-pane"
                style={{ display: activeRoute === 'content' ? 'block' : 'none' }}
                aria-hidden={activeRoute !== 'content'}
            >
                <ContentTab toast={toast} />
            </div>

            <div
                className="v2-tab-pane"
                style={{ display: activeRoute === 'simulation' ? 'block' : 'none' }}
                aria-hidden={activeRoute !== 'simulation'}
            >
                <SimulationTab
                    dayDate={dayDate}
                    setDayDate={setDayDate}
                    toast={toast}
                />
            </div>
        </AppLayout>
    );
}

export default App;
