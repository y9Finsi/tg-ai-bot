import React, { useRef, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge.jsx';
import { formatTime } from '@/lib/dateUtils.js';
import { calculateVirtualWindow } from '@/lib/virtualizer.js';
import { cn } from '@/lib/utils.js';

export function VirtualizedChatList({ conversations = [], userName = 'Пользователь' }) {
    const containerRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(480);

    const itemHeight = 90; // Average message bubble height in px

    useEffect(() => {
        if (containerRef.current) {
            setViewportHeight(containerRef.current.clientHeight || 480);
            // Scroll to bottom on initial load
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [conversations.length]);

    const handleScroll = (e) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const {
        startIndex,
        endIndex,
        topSpacerHeight,
        bottomSpacerHeight
    } = calculateVirtualWindow({
        totalCount: conversations.length,
        itemHeight,
        viewportHeight,
        scrollTop,
        overscan: 6
    });

    const visibleItems = conversations.slice(startIndex, endIndex);

    if (!conversations.length) {
        return <div className="empty-state">История переписки пуста.</div>;
    }

    return (
        <div
            ref={containerRef}
            className="crm-chat-window virtualized-chat-window"
            onScroll={handleScroll}
            style={{ overflowY: 'auto', maxHeight: 520, position: 'relative', padding: 12 }}
        >
            {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}

            {visibleItems.map((conv, idx) => {
                const isUser = conv.role === 'user' || conv.kind === 'user_text';
                const key = conv.id ?? `msg-${startIndex + idx}`;

                return (
                    <div
                        className={cn('chat-bubble-row', isUser ? 'user-side' : 'lera-side')}
                        key={key}
                    >
                        <div className="chat-bubble">
                            <div className="chat-bubble-header">
                                <strong>{isUser ? (userName || 'Пользователь') : 'Лера (Бот)'}</strong>
                                <span>{formatTime(conv.created_at)}</span>
                            </div>
                            <p>{conv.text || conv.user_text || conv.parsed_response || '—'}</p>
                            {conv.model && (
                                <Badge variant="muted" className="chat-model-badge">
                                    {conv.model}
                                </Badge>
                            )}
                        </div>
                    </div>
                );
            })}

            {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
        </div>
    );
}

export const VirtualizedChatHistory = VirtualizedChatList;
export default VirtualizedChatList;
