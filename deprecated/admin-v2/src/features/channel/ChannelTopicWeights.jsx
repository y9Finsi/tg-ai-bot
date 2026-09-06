import React from 'react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { TOPIC_LABELS, TOPIC_PROMPT_RULES, normalizeTopicShares } from '@/lib/topicUtils.js';
import { cn } from '@/lib/utils.js';

export function ChannelTopicWeights({ channelForm, setChannelForm, onSave }) {
    const shares = normalizeTopicShares(channelForm.topics, channelForm.topicWeights);
    const totalShare = Object.values(shares).reduce((sum, value) => sum + value, 0);

    return (
        <Card>
            <CardHeader
                eyebrow="Тема следующего поста"
                title="Один режим для одного черновика"
                description="Перед генерацией выбирается одна активная тема — и добавляется в задание для ИИ."
            />
            <div className="topic-distribution-summary topic-prompt-explainer">
                <div>
                    <strong>Что увидит ИИ · Как это работает</strong>
                    <span>Это не набор промптов: «Тема: выбранная тема» и короткая задача для неё. Личность Леры, контекст дня и правила берутся из конструктора.</span>
                </div>
                <div className="topic-presets-actions">
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                            setChannelForm({
                                ...channelForm,
                                topics: ['thoughts', 'flirt', 'life', 'jokes', 'questions', 'meme', 'repost'],
                                topicWeights: { thoughts: 2, flirt: 2, life: 2, jokes: 2, questions: 2, meme: 2, repost: 2 }
                            });
                        }}
                    >
                        Все темы
                    </Button>
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                            setChannelForm({
                                ...channelForm,
                                topics: ['thoughts', 'life', 'jokes'],
                                topicWeights: { thoughts: 2, life: 2, jokes: 2, flirt: 2, questions: 2, meme: 2, repost: 2 }
                            });
                        }}
                    >
                        Мысли и жизнь
                    </Button>
                    <Badge variant="blue">Итого: {totalShare}%</Badge>
                </div>
            </div>

            <div className="topic-weights-grid topic-cards-grid">
                {Object.entries(TOPIC_LABELS).map(([topicKey, topicName]) => {
                    const isEnabled = (channelForm.topics || []).includes(topicKey);
                    const currentShare = shares[topicKey] ?? 0;
                    const currentWeight = channelForm.topicWeights?.[topicKey] ?? 2;

                    return (
                        <div className={cn('topic-card-item', isEnabled && 'is-active')} key={topicKey}>
                            <div className="topic-card-header">
                                <label className="topic-card-check">
                                    <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        onChange={event => {
                                            const checked = event.target.checked;
                                            let nextTopics = checked
                                                ? [...channelForm.topics, topicKey]
                                                : channelForm.topics.filter(t => t !== topicKey);
                                            if (!nextTopics.length) nextTopics = [topicKey];
                                            const nextWeights = {
                                                ...channelForm.topicWeights,
                                                [topicKey]: channelForm.topicWeights?.[topicKey] || 2
                                            };
                                            setChannelForm({
                                                ...channelForm,
                                                topics: nextTopics,
                                                topicWeights: nextWeights
                                            });
                                        }}
                                    />
                                    <strong>{topicName}</strong>
                                </label>
                                <Badge variant={isEnabled ? 'blue' : 'muted'}>
                                    {isEnabled ? `${currentShare}%` : 'выключена'}
                                </Badge>
                            </div>
                            <div className="topic-card-rule">{TOPIC_PROMPT_RULES[topicKey]}</div>
                            <div className="topic-card-priority-row">
                                <span className="topic-priority-label">Частота:</span>
                                <div className="topic-priority-buttons">
                                    {[
                                        { label: 'Редко', val: 1 },
                                        { label: 'Обычно', val: 2 },
                                        { label: 'Часто', val: 4 }
                                    ].map(p => (
                                        <button
                                            key={p.val}
                                            type="button"
                                            disabled={!isEnabled}
                                            className={cn(
                                                'topic-priority-btn',
                                                isEnabled && currentWeight === p.val && 'is-selected'
                                            )}
                                            onClick={() => {
                                                setChannelForm({
                                                    ...channelForm,
                                                    topicWeights: {
                                                        ...channelForm.topicWeights,
                                                        [topicKey]: p.val
                                                    }
                                                });
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="topic-prompt-explainer">
                <span className="eyebrow">Как это работает</span>
                <strong>Для выбранной темы в промпт попадёт задача:</strong>
                <p>
                    «{Object.entries(TOPIC_LABELS)
                        .filter(([key]) => (channelForm.topics || []).includes(key))
                        .map(([key, label]) => `${label} — ${TOPIC_PROMPT_RULES[key]}`)
                        .join('» · «')}»
                </p>
            </div>

            <div className="channel-action-bar">
                <span>Выключенная тема не участвует в посте. Проценты вероятности вычисляются автоматически.</span>
                {onSave && <Button onClick={onSave}>Сохранить распределение</Button>}
            </div>
        </Card>
    );
}

export default ChannelTopicWeights;
