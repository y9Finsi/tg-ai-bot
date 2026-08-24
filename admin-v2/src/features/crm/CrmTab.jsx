import React, { useState, useEffect } from 'react';
import { Users, Tag, BarChart3, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { UserList } from './UserList.jsx';
import { UserDetailsDrawer } from './UserDetailsDrawer.jsx';
import { PromocodesManager } from './PromocodesManager.jsx';
import { BusinessMetrics } from './BusinessMetrics.jsx';
import { memoryGraphData } from './MemoryGraph.jsx';

export function CrmTab({ toast }) {
    const [crmTab, setCrmTab] = useState('clients');
    const [userFilter, setUserFilter] = useState('all');

    const [users, setUsers] = useState([]);
    const [userQuery, setUserQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [userForm, setUserForm] = useState({ textBalance: 10, imageBalance: 0, voiceBalance: 0 });
    const [initiativeLimitForm, setInitiativeLimitForm] = useState('');

    const [facts, setFacts] = useState([]);
    const [factText, setFactText] = useState('');
    const [factUserId, setFactUserId] = useState('');
    const [memoryGraph, setMemoryGraph] = useState({ nodes: [], edges: [] });
    const [memoryGraphState, setMemoryGraphState] = useState({ loading: false, error: '' });
    const [retrievals, setRetrievals] = useState([]);
    const [retrievalState, setRetrievalState] = useState({ loading: false, error: '' });
    const [relationshipForm, setRelationshipForm] = useState({ trust: 50, affection: 50, irritation: 0 });

    const [packages, setPackages] = useState({});
    const [promocodes, setPromocodes] = useState([]);

    const [adminStats, setAdminStats] = useState(null);
    const [freeMode, setFreeMode] = useState(false);
    const [loadError, setLoadError] = useState('');

    const run = async (action, success) => {
        try {
            const result = await action();
            if (success && toast) toast(success);
            return result;
        } catch (error) {
            if (toast) toast(error.message, 'error');
            return null;
        }
    };

    async function loadUsers(query = userQuery) {
        const result = await run(() => api(`/api/admin/users${query ? `/search?q=${encodeURIComponent(query)}` : '?limit=50'}`));
        if (result) setUsers(result.users || []);
        return result;
    }

    async function openUser(id) {
        const result = await run(() => api(`/api/admin/users/${id}/full`));
        if (result) {
            setSelectedUser(result);
            setUserForm({
                textBalance: result.user.free_requests_left ?? 10,
                imageBalance: result.user.image_balance ?? 0,
                voiceBalance: result.user.voice_balance ?? 0
            });
            setInitiativeLimitForm(result.user.initiative_limit === null || result.user.initiative_limit === undefined ? '' : String(result.user.initiative_limit));
            setFactUserId(String(id));
            setFacts(result.facts || []);
            setRelationshipForm({
                trust: Math.round(Number(result.relationship?.relationship?.trust ?? 50)),
                affection: Math.round(Number(result.relationship?.relationship?.affection ?? 50)),
                irritation: Math.round(Number(result.relationship?.relationship?.irritation ?? 0))
            });
            loadMemoryInsights(id);
        }
    }

    async function loadMemoryInsights(id = selectedUser?.user?.telegram_id) {
        if (!id) return;
        setMemoryGraphState({ loading: true, error: '' });
        setRetrievalState({ loading: true, error: '' });
        const [graphResult, retrievalResult] = await Promise.allSettled([
            api(`/api/admin/memory/graph/${id}`),
            api(`/api/admin/memory/retrievals/${id}?limit=20`)
        ]);
        if (graphResult.status === 'fulfilled') {
            setMemoryGraph(memoryGraphData(graphResult.value));
            setMemoryGraphState({ loading: false, error: '' });
        } else {
            setMemoryGraphState({ loading: false, error: graphResult.reason?.message || 'Не удалось загрузить граф памяти.' });
        }
        if (retrievalResult.status === 'fulfilled') {
            const payload = retrievalResult.value;
            setRetrievals(payload.retrievals || payload.results || payload.items || []);
            setRetrievalState({ loading: false, error: '' });
        } else {
            setRetrievalState({ loading: false, error: retrievalResult.reason?.message || 'Не удалось загрузить response trace.' });
        }
    }

    async function saveRelationship() {
        if (!selectedUser?.user?.telegram_id) return;
        const result = await run(() => api(`/api/admin/relationships/${selectedUser.user.telegram_id}`, {
            method: 'PATCH',
            body: JSON.stringify(relationshipForm)
        }), 'Отношения сохранены');
        if (result) {
            setSelectedUser({ ...selectedUser, relationship: { ...selectedUser.relationship, relationship: result.relationship } });
        }
    }

    async function userAction(action, extra = {}) {
        if (!selectedUser?.user?.telegram_id) return;
        const result = await run(() => api(`/api/admin/users/${selectedUser.user.telegram_id}/action`, {
            method: 'POST',
            body: JSON.stringify({ action, ...extra })
        }), 'Пользователь обновлён');
        if (result) setSelectedUser({ ...selectedUser, user: result.user });
    }

    async function saveInitiativeLimit(limitOverride) {
        if (!selectedUser?.user?.telegram_id) return;
        const nextLimit = limitOverride === undefined ? initiativeLimitForm : limitOverride;
        const result = await run(() => api(`/api/admin/users/${selectedUser.user.telegram_id}/initiative-settings`, {
            method: 'PATCH',
            body: JSON.stringify({ initiativeLimit: nextLimit === '' ? null : Number(nextLimit) })
        }), 'Лимит инициатив сохранён');
        if (result) {
            setSelectedUser({ ...selectedUser, user: result.user });
            setUsers(current => current.map(user => user.telegram_id === result.user.telegram_id ? { ...user, ...result.user } : user));
            setInitiativeLimitForm(result.user.initiative_limit === null || result.user.initiative_limit === undefined ? '' : String(result.user.initiative_limit));
        }
    }

    function addPresetBalance(addText, addImg, addVoice = 0) {
        const newText = (Number(userForm.textBalance) || 0) + addText;
        const newImg = (Number(userForm.imageBalance) || 0) + addImg;
        const newVoice = (Number(userForm.voiceBalance) || 0) + addVoice;
        setUserForm({ textBalance: newText, imageBalance: newImg, voiceBalance: newVoice });
        userAction('set_balances', { textBalance: newText, imageBalance: newImg, voiceBalance: newVoice });
    }

    async function loadFacts() {
        if (!factUserId.trim()) return;
        const result = await run(() => api(`/api/admin/memory/facts/${factUserId.trim()}`));
        if (result) setFacts(result.facts || []);
    }

    async function addFact() {
        if (!factUserId.trim()) { if (toast) toast('Выберите пользователя'); return; }
        if (!factText.trim()) { if (toast) toast('Введите текст факта'); return; }
        await run(() => api(`/api/admin/memory/facts/${factUserId.trim()}`, {
            method: 'POST',
            body: JSON.stringify({ fact: factText.trim() })
        }), 'Факт сохранён');
        setFactText('');
        loadFacts();
    }

    async function toggleFact(id, isActive) {
        await run(() => api(`/api/admin/memory/facts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ userId: factUserId.trim(), isActive })
        }), 'Статус факта обновлён');
        loadFacts();
    }

    async function deleteFact(id) {
        await run(() => api(`/api/admin/memory/facts/${id}`, {
            method: 'DELETE',
            body: JSON.stringify({ userId: factUserId.trim() })
        }), 'Факт удалён');
        loadFacts();
    }

    async function loadCommerce() {
        const result = await run(() => Promise.all([api('/api/admin/packages'), api('/api/admin/promocodes')]));
        if (result) {
            const [packagesResult, promos] = result;
            setPackages(packagesResult.packages || {});
            setPromocodes(promos.promocodes || []);
        }
        return result;
    }

    async function addPromocode(form) {
        await run(() => api('/api/admin/promocodes', {
            method: 'POST',
            body: JSON.stringify(form)
        }), 'Промокод создан');
        loadCommerce();
    }

    async function deletePromocode(id) {
        await run(() => api(`/api/admin/promocodes/${id}`, { method: 'DELETE' }), 'Промокод удалён');
        loadCommerce();
    }

    async function loadMetrics() {
        const stats = await run(() => api('/api/admin/stats'));
        if (stats) setAdminStats(stats);
        return stats;
    }

    async function toggleFreeModeGlobal() {
        const result = await run(() => api('/api/admin/funnels/toggle-free-mode', { method: 'POST' }), 'Режим Free Mode изменён');
        if (result) setFreeMode(result.free_mode_enabled);
    }

    async function resetLimitsAll() {
        await run(() => api('/api/admin/funnels/reset-limits', { method: 'POST', body: JSON.stringify({ textCount: 10 }) }), 'Лимиты всем пользователям сброшены');
        loadUsers();
    }

    async function loadWorkspace() {
        setLoadError('');
        const results = await Promise.all([loadUsers(), loadCommerce(), loadMetrics()]);
        if (results.every(result => !result)) setLoadError('Не удалось загрузить данные CRM. Проверь подключение к API и повтори попытку.');
    }

    useEffect(() => {
        loadWorkspace();
    }, []);

    return (
        <div className="crm-super-container admin-domain-page">
            {loadError && (
                <div className="memory-insight-state is-error" role="alert">
                    <CircleAlert size={16} /> <span>{loadError}</span>
                    <Button size="sm" variant="outline" onClick={loadWorkspace}>Повторить</Button>
                </div>
            )}
            <div className="crm-subnav">
                <Button variant={crmTab === 'clients' ? 'primary' : 'outline'} size="sm" onClick={() => setCrmTab('clients')}>
                    <Users size={14} /> 👥 Клиенты ({users.length})
                </Button>
                <Button variant={crmTab === 'promocodes' ? 'primary' : 'outline'} size="sm" onClick={() => setCrmTab('promocodes')}>
                    <Tag size={14} /> 🏷️ Промокоды и Тарифы ({promocodes.length})
                </Button>
                <Button variant={crmTab === 'metrics' ? 'primary' : 'outline'} size="sm" onClick={() => setCrmTab('metrics')}>
                    <BarChart3 size={14} /> 📊 Метрики бизнеса
                </Button>
            </div>

            {crmTab === 'clients' && (
                <div className="crm-split-layout">
                    <div className="crm-sidebar">
                        <UserList
                            users={users}
                            userFilter={userFilter}
                            setUserFilter={setUserFilter}
                            userQuery={userQuery}
                            setUserQuery={setUserQuery}
                            onSearch={loadUsers}
                            selectedUserId={selectedUser?.user?.telegram_id}
                            onSelectUser={openUser}
                        />
                    </div>

                    <div className="crm-main">
                        <UserDetailsDrawer
                            selectedUser={selectedUser}
                            userForm={userForm}
                            setUserForm={setUserForm}
                            initiativeLimitForm={initiativeLimitForm}
                            setInitiativeLimitForm={setInitiativeLimitForm}
                            facts={facts}
                            factText={factText}
                            setFactText={setFactText}
                            memoryGraph={memoryGraph}
                            memoryGraphState={memoryGraphState}
                            retrievals={retrievals}
                            retrievalState={retrievalState}
                            relationshipForm={relationshipForm}
                            setRelationshipForm={setRelationshipForm}
                            onSaveBalance={(values) => userAction('set_balances', values)}
                            onSaveInitiativeLimit={saveInitiativeLimit}
                            onAddPreset={addPresetBalance}
                            onAddFact={addFact}
                            onToggleFact={toggleFact}
                            onDeleteFact={deleteFact}
                            onSaveRelationship={saveRelationship}
                            onUserAction={userAction}
                            onReloadMemoryInsights={() => loadMemoryInsights()}
                        />
                    </div>
                </div>
            )}

            {crmTab === 'promocodes' && (
                <PromocodesManager
                    packages={packages}
                    promocodes={promocodes}
                    onCreatePromo={addPromocode}
                    onDeletePromo={deletePromocode}
                />
            )}

            {crmTab === 'metrics' && (
                <BusinessMetrics
                    adminStats={adminStats}
                    usersCount={users.length}
                    premiumCount={users.filter(u => u.is_premium).length}
                    freeMode={freeMode}
                    onToggleFreeMode={toggleFreeModeGlobal}
                    onResetLimitsAll={resetLimitsAll}
                />
            )}
        </div>
    );
}

export default CrmTab;
