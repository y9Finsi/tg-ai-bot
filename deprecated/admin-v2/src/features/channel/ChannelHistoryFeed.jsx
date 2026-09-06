import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';
import { TOPIC_LABELS } from '@/lib/topicUtils.js';
import { formatTime } from '@/lib/dateUtils.js';

export function ChannelHistoryFeed({ history = [], onDeletePost }) {
    return (
        <Card>
            <CardHeader
                eyebrow="История публикаций"
                title="Что уже ушло в канал"
                description="Карточки показывают текст, медиа и объяснение, на основе чего был создан пост."
            />
            <div className="channel-feed-grid">
                {history.length ? history.map(post => (
                    <div className="channel-post-card" key={post.id || post.created_at}>
                        <div className="channel-post-header">
                            <Badge variant="blue">{TOPIC_LABELS[post.topic] || post.topic || 'Пост'}</Badge>
                            <span>{formatTime(post.created_at)}</span>
                        </div>
                        {post.photo_url && (
                            <div className="channel-history-media-thumb">
                                <img
                                    src={post.photo_url.startsWith('http') ? post.photo_url : `/api/admin/telegram-preview?file_id=${encodeURIComponent(post.photo_url)}`}
                                    alt="Медиа к посту"
                                    onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                                />
                            </div>
                        )}
                        <p className="channel-post-text">{post.text}</p>
                        <details className="post-provenance">
                            <summary>Почему этот пост</summary>
                            <span>Статус: {post.status || (post.provenance?.published ? 'PUBLISHED' : 'DRAFT')}</span>
                            <span>Медиа: {post.media_mode || 'none'}</span>
                            <span>Judge: {post.provenance?.judge_verdict || 'не запускался'}{post.provenance?.judge_code ? ` · ${post.provenance.judge_code}` : ''}</span>
                            <span>Попытка: {post.provenance?.attempt || 1}</span>
                            <span>Профиль: v{post.provenance?.profile_version || '—'}</span>
                            <span>Тема: {TOPIC_LABELS[post.provenance?.topic || post.topic] || post.topic || 'Пост'}</span>
                            <span>Температура: {post.provenance?.temperature ?? 'по умолчанию'}</span>
                            <span>Блоки: {post.provenance?.prompt_blocks?.join(', ') || 'стандартный голос Леры'}</span>
                            <span>Модель: {post.provenance?.model || 'не сохранена'}</span>
                        </details>
                        {onDeletePost && (
                            <ConfirmAction
                                title="Удалить запись истории?"
                                description="Удалится только запись в админке. Telegram-сообщение останется в канале."
                                confirmText="Удалить запись"
                                variant="danger"
                                onConfirm={() => onDeletePost(post.id)}
                            >
                                Удалить запись истории
                            </ConfirmAction>
                        )}
                    </div>
                )) : <div className="empty-state">История постов пуста.</div>}
            </div>
        </Card>
    );
}

export const DraftList = ChannelHistoryFeed;
export default ChannelHistoryFeed;
