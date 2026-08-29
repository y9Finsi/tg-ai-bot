import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, UserCheck, ShieldAlert, MessageSquare, Wrench, Terminal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { SandboxPanel } from './SandboxPanel.jsx';
import { ProductionPromptModules } from './ProductionPromptModules.jsx';
import { LeraProfileEditor } from './LeraProfileEditor.jsx';
import { LeraJudgeSettings, DEFAULT_JUDGE_PROMPT } from './LeraJudgeSettings.jsx';
import { ActionsManager } from './ActionsManager.jsx';
import { LlmPanel } from './LlmPanel.jsx';

export function StudioTab({ toast }) {
    const [activeStudioTab, setActiveStudioTab] = useState('sandbox');

    const [profilePromptBlocks, setProfilePromptBlocks] = useState({});
    const [profileForm, setProfileForm] = useState({});
    const [profileVersions, setProfileVersions] = useState([]);
    const [judgeForm, setJudgeForm] = useState({
        mode: 'ENFORCE',
        model: '',
        timeoutMs: 5000,
        maxTokens: 150,
        prompt: DEFAULT_JUDGE_PROMPT
    });

    async function loadStudioData() {
        try {
            const [profileRes, settingsRes] = await Promise.allSettled([
                api('/api/admin/lera-profile'),
                api('/api/admin/llm-settings')
            ]);
            if (profileRes.status === 'fulfilled') {
                setProfileForm(profileRes.value.profile?.profile || {});
                setProfileVersions(profileRes.value.versions || []);
            }
            if (settingsRes.status === 'fulfilled') {
                setProfilePromptBlocks(settingsRes.value.routingModules || {});
                const routing = settingsRes.value.routingSettings || {};
                setJudgeForm({
                    mode: routing.judgeMode || 'ENFORCE',
                    model: routing.judgeModel || '',
                    timeoutMs: routing.judgeTimeoutMs || 5000,
                    maxTokens: routing.judgeMaxTokens || 150,
                    prompt: routing.judgePrompt || DEFAULT_JUDGE_PROMPT
                });
            }
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function savePromptBlocks() {
        try {
            await api('/api/admin/llm-settings', {
                method: 'POST',
                body: JSON.stringify({
                    prompts: {
                        routing_core: profilePromptBlocks.core || '',
                        routing_common: profilePromptBlocks.common || '',
                        routing_casual: profilePromptBlocks.casual || '',
                        routing_erotic: profilePromptBlocks.erotic || '',
                        routing_joke: profilePromptBlocks.joke || ''
                    }
                })
            });
            if (toast) toast('Модули промпта сохранены');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveProfile() {
        try {
            await api('/api/admin/lera-profile', {
                method: 'POST',
                body: JSON.stringify({ profile: profileForm })
            });
            if (toast) toast('Профиль Леры успешно сохранён');
            loadStudioData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function rollbackProfile(versionId) {
        try {
            await api(`/api/admin/lera-profile/rollback/${versionId}`, { method: 'POST' });
            if (toast) toast(`Откат к версии #${versionId} выполнен`);
            loadStudioData();
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveJudgeSettings() {
        try {
            await api('/api/admin/llm-settings', {
                method: 'POST',
                body: JSON.stringify({
                    routingSettings: {
                        judgeMode: judgeForm.mode,
                        judgeModel: judgeForm.model,
                        judgeTimeoutMs: Number(judgeForm.timeoutMs),
                        judgeMaxTokens: Number(judgeForm.maxTokens),
                        judgePrompt: judgeForm.prompt
                    }
                })
            });
            if (toast) toast('Настройки AI Judge успешно сохранены');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    useEffect(() => {
        loadStudioData();
    }, []);

    return (
        <div className="studio-super-container admin-domain-page">
            <div className="crm-subnav">
                <Button
                    variant={activeStudioTab === 'sandbox' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('sandbox')}
                >
                    <Sparkles size={14} /> 🧪 AI Sandbox (A/B Тесты)
                </Button>
                <Button
                    variant={activeStudioTab === 'production-prompts' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('production-prompts')}
                >
                    <SlidersHorizontal size={14} /> 📝 Модули Промпта
                </Button>
                <Button
                    variant={activeStudioTab === 'lera-profile' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('lera-profile')}
                >
                    <UserCheck size={14} /> 👤 Профиль и Биография
                </Button>
                <Button
                    variant={activeStudioTab === 'judge' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('judge')}
                >
                    <ShieldAlert size={14} /> ⚖️ AI Judge
                </Button>
                <Button
                    variant={activeStudioTab === 'actions' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('actions')}
                >
                    <Wrench size={14} /> 🔧 Инструменты / MCP
                </Button>
                <Button
                    variant={activeStudioTab === 'diagnostics' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('diagnostics')}
                >
                    <Terminal size={14} /> 📊 Логи и Трассировка
                </Button>
            </div>

            <div style={{ marginTop: 14 }}>
                {activeStudioTab === 'sandbox' && <SandboxPanel toast={toast} />}
                {activeStudioTab === 'production-prompts' && (
                    <ProductionPromptModules
                        profilePromptBlocks={profilePromptBlocks}
                        setProfilePromptBlocks={setProfilePromptBlocks}
                        onSave={savePromptBlocks}
                        onReset={() => setProfilePromptBlocks({})}
                    />
                )}
                {activeStudioTab === 'lera-profile' && (
                    <LeraProfileEditor
                        profileForm={profileForm}
                        setProfileForm={setProfileForm}
                        versions={profileVersions}
                        onRollback={rollbackProfile}
                        onSave={saveProfile}
                        toast={toast}
                    />
                )}
                {activeStudioTab === 'judge' && (
                    <LeraJudgeSettings
                        judgeForm={judgeForm}
                        setJudgeForm={setJudgeForm}
                        onSave={saveJudgeSettings}
                        onResetJudgePrompt={() => setJudgeForm(prev => ({ ...prev, prompt: DEFAULT_JUDGE_PROMPT }))}
                    />
                )}
                {activeStudioTab === 'actions' && <ActionsManager toast={toast} />}
                {activeStudioTab === 'diagnostics' && <LlmPanel toast={toast} />}
            </div>
        </div>
    );
}

export default StudioTab;
