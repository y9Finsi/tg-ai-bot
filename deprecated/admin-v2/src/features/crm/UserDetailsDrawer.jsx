import React, { useState } from 'react';
import { Users, Network, BrainCircuit, CreditCard, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { cn } from '@/lib/utils.js';
import { UserBalanceManager } from './UserBalanceManager.jsx';
import { UserMemoryFacts } from './UserMemoryFacts.jsx';
import { MemoryGraph } from './MemoryGraph.jsx';
import { RetrievalTrace } from './RetrievalTrace.jsx';
import { RelationshipEditor } from './RelationshipEditor.jsx';
import { VirtualizedChatList } from './VirtualizedChatList.jsx';

export function UserDetailsDrawer({
    selectedUser,
    userForm,
    setUserForm,
    initiativeLimitForm,
    setInitiativeLimitForm,
    facts,
    factText,
    setFactText,
    memoryGraph,
    memoryGraphState,
    retrievals,
    retrievalState,
    relationshipForm,
    setRelationshipForm,
    onSaveBalance,
    onSaveInitiativeLimit,
    onAddPreset,
    onAddFact,
    onToggleFact,
    onDeleteFact,
    onSaveRelationship,
    onUserAction,
    onReloadMemoryInsights
}) {
    const [dossierTab, setDossierTab] = useState('balance');

    if (!selectedUser) {
        return (
            <Card className="empty-workspace-card">
                <div className="empty-state">
                    <Users size={32} />
                    <h3>Выберите пользователя</h3>
                    <p>Нажмите на любого пользователя в списке слева для просмотра профиля, выдачи баланса, чат-лога и управления памятью.</p>
                </div>
            </Card>
        );
    }

    const { user, relationship, conversations = [], payments = [] } = selectedUser;

    return (
        <Card className="user-workspace-card">
            <CardHeader
                eyebrow={`Пользователь #${user.telegram_id}`}
                title={user.first_name || 'Без имени'}
                description={`@{${user.username || 'без_юзернейма'}} · Зарегистрирован: ${user.created_at || '—'}`}
                action={
                    <div className="dossier-header-actions">
                        <Badge variant={user.is_blocked ? 'red' : user.is_premium ? 'green' : 'blue'}>
                            {user.is_blocked ? 'Заблокирован' : user.is_premium ? 'Premium' : 'Free'}
                        </Badge>
                        <Button
                            size="sm"
                            variant={user.is_blocked ? 'primary' : 'warning'}
                            onClick={() => onUserAction(user.is_blocked ? 'unblock' : 'block')}
                        >
                            {user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                        </Button>
                    </div>
                }
            />

            <div className="dossier-subnav">
                <button className={cn('dossier-tab-btn', dossierTab === 'balance' && 'active')} onClick={() => setDossierTab('balance')}>
                    ⚙️ Балансы и Доступ
                </button>
                <button className={cn('dossier-tab-btn', dossierTab === 'memory' && 'active')} onClick={() => setDossierTab('memory')}>
                    🧠 Память ({facts.length})
                </button>
                <button className={cn('dossier-tab-btn', dossierTab === 'memory-graph' && 'active')} onClick={() => setDossierTab('memory-graph')}>
                    <Network size={14} /> Memory Graph
                </button>
                <button className={cn('dossier-tab-btn', dossierTab === 'why' && 'active')} onClick={() => setDossierTab('why')}>
                    <BrainCircuit size={14} /> Почему ответила так
                </button>
                <button className={cn('dossier-tab-btn', dossierTab === 'relationship' && 'active')} onClick={() => setDossierTab('relationship')}>
                    🫀 Отношения
                </button>
                <button className={cn('dossier-tab-btn', dossierTab === 'chat' && 'active')} onClick={() => setDossierTab('chat')}>
                    💬 Диалоги ({conversations.length})
                </button>
                <button className={cn('dossier-tab-btn', dossierTab === 'payments' && 'active')} onClick={() => setDossierTab('payments')}>
                    💳 Платежи ({payments.length})
                </button>
            </div>

            <div className="crm-workspace-sections">
                {dossierTab === 'balance' && (
                    <UserBalanceManager
                        selectedUser={selectedUser}
                        userForm={userForm}
                        setUserForm={setUserForm}
                        initiativeLimitForm={initiativeLimitForm}
                        setInitiativeLimitForm={setInitiativeLimitForm}
                        onSaveBalance={onSaveBalance}
                        onSaveInitiativeLimit={onSaveInitiativeLimit}
                        onAddPreset={onAddPreset}
                    />
                )}

                {dossierTab === 'memory' && (
                    <UserMemoryFacts
                        facts={facts}
                        factText={factText}
                        setFactText={setFactText}
                        onAddFact={onAddFact}
                        onToggleFact={onToggleFact}
                        onDeleteFact={onDeleteFact}
                    />
                )}

                {dossierTab === 'memory-graph' && (
                    <div className="crm-section memory-graph-section">
                        <div className="crm-section-heading">
                            <div>
                                <span className="eyebrow">Структура памяти</span>
                                <h3>Memory Graph</h3>
                                <p>Типы узлов, активность, связи и факты, которые были заменены.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={onReloadMemoryInsights}>
                                <RefreshCw size={14} /> Обновить
                            </Button>
                        </div>
                        <MemoryGraph
                            graph={memoryGraph}
                            loading={memoryGraphState.loading}
                            error={memoryGraphState.error}
                            onRetry={onReloadMemoryInsights}
                        />
                    </div>
                )}

                {dossierTab === 'why' && (
                    <div className="crm-section response-trace-section">
                        <div className="crm-section-heading">
                            <div>
                                <span className="eyebrow">Response trace</span>
                                <h3>Почему ответила так</h3>
                                <p>Источник, задержка, fallback, выбранные факты и оценки retrieval.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={onReloadMemoryInsights}>
                                <RefreshCw size={14} /> Обновить
                            </Button>
                        </div>
                        <RetrievalTrace
                            retrievals={retrievals}
                            loading={retrievalState.loading}
                            error={retrievalState.error}
                            onRetry={onReloadMemoryInsights}
                        />
                    </div>
                )}

                {dossierTab === 'relationship' && (
                    <RelationshipEditor
                        relationshipForm={relationshipForm}
                        setRelationshipForm={setRelationshipForm}
                        relationshipEvents={relationship?.events || []}
                        onSave={onSaveRelationship}
                    />
                )}

                {dossierTab === 'chat' && (
                    <div className="crm-section chat-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ margin: 0 }}>История сообщений (Визуальный Мессенджер)</h3>
                            <ConfirmAction
                                title="Сбросить историю диалога?"
                                description="Контекст переписки пользователя будет очищен, бот начнет диалог с чистого листа."
                                confirmText="Очистить"
                                variant="danger"
                                onConfirm={async () => {
                                    try {
                                        await api('/api/admin/chat-history/clear', {
                                            method: 'POST',
                                            body: JSON.stringify({ userId: user.id || user.telegram_id })
                                        });
                                        onReloadMemoryInsights?.();
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                            >
                                Сбросить чат
                            </ConfirmAction>
                        </div>
                        <VirtualizedChatList
                            conversations={conversations}
                            userName={user.first_name || 'Пользователь'}
                        />
                        <div className="admin-chat-reply-box" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <input
                                id="admin-direct-msg-input"
                                placeholder={`Написать ${user.first_name || 'пользователю'} от лица бота...`}
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        const text = e.target.value.trim();
                                        e.target.value = '';
                                        try {
                                            await api('/api/admin/users/send-message', {
                                                method: 'POST',
                                                body: JSON.stringify({ userId: user.id || user.telegram_id, text })
                                            });
                                            onReloadMemoryInsights?.();
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }
                                }}
                            />
                            <Button
                                size="sm"
                                onClick={async () => {
                                    const input = document.getElementById('admin-direct-msg-input');
                                    if (input && input.value.trim()) {
                                        const text = input.value.trim();
                                        input.value = '';
                                        try {
                                            await api('/api/admin/users/send-message', {
                                                method: 'POST',
                                                body: JSON.stringify({ userId: user.id || user.telegram_id, text })
                                            });
                                            onReloadMemoryInsights?.();
                                        } catch (err) {
                                            console.error(err);
                                        }
                                    }
                                }}
                            >
                                Отправить
                            </Button>
                        </div>
                    </div>
                )}

                {dossierTab === 'payments' && (
                    <div className="crm-section payments-section">
                        <h3>История транзакций и покупок</h3>
                        <div className="payments-list">
                            {payments.length ? (
                                payments.map(pay => (
                                    <div className="managed-row" key={pay.id}>
                                        <CreditCard size={15} />
                                        <div>
                                            <strong>Пакет: {pay.package_id || 'Стандарт'}</strong>
                                            <span>Сумма: {pay.amount_rub || pay.stars} ₽ / ⭐ · ID: {pay.id}</span>
                                        </div>
                                        <Badge variant="green">{pay.status || 'SUCCESS'}</Badge>
                                    </div>
                                ))
                            ) : (
                                <div className="empty-state">Платежей не найдено.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

export const UserDossier = UserDetailsDrawer;
export default UserDetailsDrawer;
