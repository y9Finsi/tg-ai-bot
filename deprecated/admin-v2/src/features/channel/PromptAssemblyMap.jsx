import React, { useState, useEffect } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { cn } from '@/lib/utils.js';

export const CHANNEL_PROMPT_MODULES = [
    { key: 'public_profile', label: 'Образ Леры', description: 'Голос Леры, публичный образ и ограничения' },
    { key: 'day_context', label: 'Контекст дня', description: 'События дня и текущее состояние' },
    { key: 'channel_rules', label: 'Ограничения', description: 'Правила канала и формат публикаций' }
];

export function PromptAssemblyMap({ channelForm, onChannelChange }) {
    const channel = Boolean(channelForm);
    const [dayContext, setDayContext] = useState('');
    const [contextLoading, setContextLoading] = useState(true);

    async function loadDayContext() {
        setContextLoading(true);
        try {
            const result = await api('/api/admin/prompt-day-context');
            setDayContext(result.context || '');
        } catch {
            setDayContext('');
        } finally {
            setContextLoading(false);
        }
    }

    useEffect(() => {
        loadDayContext();
    }, []);

    const blocks = channel ? [
        [
            '01',
            'Образ Леры',
            channelForm?.publicProfileEnabled === false
                ? 'Отключён для канала'
                : 'Голос Леры, публичный образ и ограничения из единого профиля',
            'public-profile'
        ],
        [
            '02',
            'Контекст дня',
            channelForm?.publicFactsEnabled
                ? 'Передаются только факты, добавленные редактором'
                : 'Не используются: только настроение и наблюдения',
            'public-facts'
        ],
        [
            '03',
            'Ограничения',
            'Тема, последние посты и правила публикаций',
            'channel'
        ]
    ] : [
        ['01', 'Личность Леры', '7 редактируемых модулей: Речь и стиль, Правила и границы', 'base'],
        ['02', 'Контекст дня', 'Добавляется автоматически для каждого ответа', 'day'],
        ['03', 'Диалог и память', 'История переписки и память конкретного собеседника', 'dialog']
    ];

    return (
        <div className="prompt-assembly">
            <div className="prompt-assembly-head">
                <div>
                    <span className="eyebrow">Конструктор промпта · Как собирается запрос</span>
                    <strong>{channel ? 'Публичный prompt канала' : 'Prompt личного ответа'}</strong>
                </div>
                <Badge variant="blue">{channel ? 'перед генерацией' : 'при каждом сообщении'}</Badge>
            </div>

            <div className="prompt-assembly-flow">
                {blocks.map(([number, title, text, kind], index) => (
                    <React.Fragment key={title}>
                        <div className={cn('prompt-source-card prompt-module-card', `prompt-source-${kind}`)}>
                            <span>{number}</span>
                            <div>
                                <strong>{title}</strong>
                                <small>{text}</small>
                            </div>
                            {channel && kind === 'public-profile' && onChannelChange && (
                                <label className="prompt-source-toggle">
                                    <input
                                        type="checkbox"
                                        checked={channelForm.publicProfileEnabled !== false}
                                        onChange={event => onChannelChange({ ...channelForm, publicProfileEnabled: event.target.checked, inheritLeraPrompt: event.target.checked })}
                                    /> Использовать
                                </label>
                            )}
                            {channel && kind === 'public-facts' && onChannelChange && (
                                <label className="prompt-source-toggle">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(channelForm.publicFactsEnabled)}
                                        onChange={event => onChannelChange({ ...channelForm, publicFactsEnabled: event.target.checked })}
                                    /> Использовать
                                </label>
                            )}
                        </div>
                        {index < blocks.length - 1 && <ArrowRight className="prompt-flow-arrow" size={16} />}
                    </React.Fragment>
                ))}
            </div>

            <div className={cn('prompt-day-preview', channel && 'is-disabled')}>
                <div>
                    <span className="eyebrow">Аналитика дня</span>
                    <strong>{contextLoading ? 'Собираю аналитику…' : 'Что модель реально получает о дне Леры'}</strong>
                </div>
                <Button size="sm" variant="outline" onClick={loadDayContext} disabled={contextLoading}>
                    <RefreshCw size={14} className={cn(contextLoading && 'spin-icon')} /> Обновить
                </Button>
                <pre>
                    {channel
                        ? 'Для канала day context отключён. Используются только факты, которые редактор явно добавил в «Публичные факты дня».'
                        : (contextLoading ? 'Загружаю подтверждённые факты, состояние, причины и планы…' : dayContext || 'Аналитика дня пока недоступна.')}
                </pre>
            </div>

            <p className="prompt-assembly-note">
                {channel
                    ? 'В канал передаётся только публичная проекция единого профиля, явные публичные факты и история постов канала. Старые inheritLeraPrompt/includeDayContext сохранены только для совместимости API и принудительно выключены. Личная память, переписки, relationship-контекст и observer digest не передаются.'
                    : 'Здесь показан общий контекст дня. Личная память и история добавляются только для того пользователя, который написал Леры; точный состав отправленного запроса доступен во вкладке «Диалоги».'}
            </p>
        </div>
    );
}

export default PromptAssemblyMap;
