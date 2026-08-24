import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';

export function BusinessMetrics({
    adminStats,
    usersCount,
    premiumCount,
    freeMode,
    onToggleFreeMode,
    onResetLimitsAll
}) {
    return (
        <div className="crm-metrics-layout">
            <Card>
                <CardHeader
                    eyebrow="Бизнес-аналитика · Продажи"
                    title="Ключевые метрики CRM и Продажи"
                    description="Сводка активных клиентов, продажи подписок, промокоды и общий доход."
                />
                <div className="crm-metrics-grid">
                    <div className="crm-metric-card">
                        <span>👥 Всего пользователей</span>
                        <strong>{adminStats?.stats?.totalUsers ?? usersCount}</strong>
                    </div>
                    <div className="crm-metric-card">
                        <span>⚡ Активные сегодня</span>
                        <strong>{adminStats?.stats?.activeToday ?? '—'}</strong>
                    </div>
                    <div className="crm-metric-card">
                        <span>💎 Premium подписчики</span>
                        <strong>{premiumCount}</strong>
                    </div>
                    <div className="crm-metric-card">
                        <span>💰 Доход Stars & Рубли</span>
                        <strong>{adminStats?.stats?.totalRevenue ?? '⭐ / ₽'}</strong>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Глобальное управление"
                    title="Массовые сбросы и Режим Воронки"
                    description="Действия затронут лимиты и тарифы всех пользователей приложения."
                />
                <div className="inline-controls">
                    <Button
                        variant={freeMode ? 'warning' : 'outline'}
                        onClick={onToggleFreeMode}
                    >
                        {freeMode ? 'Free Mode ВКЛЮЧЁН (Безлимит)' : 'Free Mode ВЫКЛЮЧЁН'}
                    </Button>
                    <ConfirmAction
                        title="Сбросить лимиты ВСЕМ?"
                        description="У всех пользователей текстовый баланс сбросится на 10 запросов."
                        confirmText="Сбросить всем"
                        variant="warning"
                        onConfirm={onResetLimitsAll}
                    >
                        Сбросить лимиты всем юзерам (10 💬)
                    </ConfirmAction>
                </div>
            </Card>
        </div>
    );
}

export default BusinessMetrics;
