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
                        <strong>{adminStats?.stats?.total_users ?? adminStats?.stats?.totalUsers ?? usersCount}</strong>
                    </div>
                    <div className="crm-metric-card">
                        <span>⚡ Активные (24ч)</span>
                        <strong>{adminStats?.stats?.active_24h ?? adminStats?.stats?.activeToday ?? '0'}</strong>
                    </div>
                    <div className="crm-metric-card">
                        <span>💎 Premium подписчики</span>
                        <strong>{adminStats?.stats?.premium_users ?? premiumCount}</strong>
                    </div>
                    <div className="crm-metric-card">
                        <span>💰 Доход (Рубли / Stars)</span>
                        <strong>
                            {adminStats?.stats?.total_revenue_rub ? `${Number(adminStats.stats.total_revenue_rub).toLocaleString('ru-RU')} ₽` : '0 ₽'}
                            {adminStats?.stats?.total_revenue_stars ? ` · ${adminStats.stats.total_revenue_stars} ⭐` : ''}
                        </strong>
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
