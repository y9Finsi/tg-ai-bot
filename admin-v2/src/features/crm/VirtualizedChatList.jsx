import React, { useRef, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge.jsx';
import { formatTime } from '@/lib/dateUtils.js';
import { calculateVirtualWindow } from '@/lib/virtualizer.js';
import { cn } from '@/lib/utils.js';

export function VirtualizedChatList({ conversations = [], userName = 'Пользователь' }) {
    const messagesEndRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [conversations.length]);

    if (!conversations.length) {
        return <div className="empty-state">История переписки пуста.</div>;
    }

    return (
        <div
            ref={containerRef}
            className="crm-chat-window virtualized-chat-window"
            style={{ overflowY: 'auto', maxHeight: 520, position: 'relative', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
            {conversations.map((conv, idx) => {
                const isUser = conv.role === 'user' || conv.kind === 'user_text';
                const key = conv.id ?? `msg-${idx}`;
                const text = conv.text || conv.user_text || conv.parsed_response || conv.raw_response || '—';

                return (
                    <div
                        className={cn('chat-bubble-row', isUser ? 'user-side' : 'lera-side')}
                        key={key}
                    >
                        <div className="chat-bubble" style={{ maxWidth: '85%', wordBreak: 'break-word' }}>
                            <div className="chat-bubble-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                                <strong style={{ fontSize: 12 }}>{isUser ? (userName || 'Пользователь') : 'Лера (Бот)'}</strong>
                                <span style={{ fontSize: 10, opacity: 0.7 }}>{formatTime(conv.created_at)}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{text}</p>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                {conv.model && (
                                    <Badge variant="muted" className="chat-model-badge" style={{ fontSize: 10 }}>
                                        {conv.model}
                                    </Badge>
                                )}
                                {conv.latency_ms && (
                                    <span style={{ fontSize: 10, opacity: 0.6 }}>{conv.latency_ms} мс</span>
                                )}
                                {conv.event_type && conv.event_type !== 'MESSAGE' && (
                                    <Badge variant="blue" style={{ fontSize: 10 }}>{conv.event_type}</Badge>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={messagesEndRef} style={{ height: 1 }} />
        </div>
    );
}

export const VirtualizedChatHistory = VirtualizedChatList;
export default VirtualizedChatList;
