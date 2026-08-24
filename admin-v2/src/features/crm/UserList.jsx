import React from 'react';
import { Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { cn } from '@/lib/utils.js';

export function UserList({
    users = [],
    userFilter,
    setUserFilter,
    userQuery,
    setUserQuery,
    onSearch,
    selectedUserId,
    onSelectUser
}) {
    const filteredUsers = users.filter(u => {
        if (userFilter === 'premium') return u.is_premium;
        if (userFilter === 'blocked') return u.is_blocked;
        return true;
    });

    return (
        <Card>
            <CardHeader
                eyebrow="Пользователи и Клиенты"
                title="Поиск и Клиенты"
                description="Поиск по ID, username или имени."
            />
            <div className="crm-filter-bar">
                {[['all', 'Все'], ['premium', 'Premium'], ['blocked', 'Заблокированные']].map(([val, lbl]) => (
                    <button
                        key={val}
                        className={cn('crm-filter-btn', userFilter === val && 'active')}
                        onClick={() => setUserFilter(val)}
                    >
                        {lbl}
                    </button>
                ))}
            </div>
            <div className="inline-controls">
                <input
                    value={userQuery}
                    onChange={event => setUserQuery(event.target.value)}
                    placeholder="ID, username или имя"
                    onKeyDown={e => { if (e.key === 'Enter') onSearch(); }}
                />
                <Button onClick={onSearch}>Найти</Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        setUserQuery('');
                        onSearch('');
                    }}
                >
                    Сброс
                </Button>
            </div>
            <div className="managed-grid user-list-grid">
                {filteredUsers.map(user => {
                    const isSelected = selectedUserId === user.telegram_id;
                    return (
                        <button
                            className={cn('managed-row', 'managed-row-button', isSelected && 'selected')}
                            key={user.telegram_id}
                            onClick={() => onSelectUser(user.telegram_id)}
                        >
                            <Users size={15} />
                            <div>
                                <strong>{user.first_name || 'Без имени'}</strong>
                                <span>@{user.username || '—'} · {user.telegram_id}</span>
                                <span className="user-balance-badge">
                                    💬 {user.free_requests_left ?? 0} · 🖼️ {user.image_balance ?? 0}
                                </span>
                                <span className="user-balance-badge">
                                    Инициативы: {user.initiatives_used_today ?? 0}/{user.initiative_limit_effective ?? 3} · осталось {user.initiatives_remaining_today ?? 0}
                                </span>
                            </div>
                            <Badge variant={user.is_blocked ? 'red' : user.is_premium ? 'green' : 'blue'}>
                                {user.is_blocked ? 'Заблокирован' : user.is_premium ? 'Premium' : 'Free'}
                            </Badge>
                        </button>
                    );
                })}
                {!filteredUsers.length && (
                    <div className="empty-state">Пользователи не найдены.</div>
                )}
            </div>
        </Card>
    );
}

export default UserList;
