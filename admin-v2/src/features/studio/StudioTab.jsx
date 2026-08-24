import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, UserCheck, ShieldAlert, MessageSquare, Wrench, Terminal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { api } from '@/lib/api.js';
import { SandboxPanel } from './SandboxPanel.jsx';
import { ProductionPromptModules } from './ProductionPromptModules.jsx';
import { LeraProfileEditor } from './LeraProfileEditor.jsx';
import { LeraJudgeSettings, DEFAULT_JUDGE_PROMPT } from './LeraJudgeSettings.jsx';
import { CommentsPromptStudio } from './CommentsPromptStudio.jsx';
import { ActionsManager } from './ActionsManager.jsx';
import { LlmPanel } from './LlmPanel.jsx';

export function StudioTab({ toast }) {
    const [activeStudioTab, setActiveStudioTab] = useState('sandbox');

    const [profilePromptBlocks, setProfilePromptBlocks] = useState({});
    const [profileForm, setProfileForm] = useState({});
    const [judgeForm, setJudgeForm] = useState({
        mode: 'ENFORCE',
        model: '',
        timeoutMs: 5000,
        maxTokens: 150,
        prompt: DEFAULT_JUDGE_PROMPT
    });
    const [commentsPrompt, setCommentsPrompt] = useState('');

    async function loadStudioData() {
        try {
            const [profileRes, judgeRes] = await Promise.allSettled([
                api('/api/admin/profile'),
                api('/api/admin/judge-settings')
            ]);
            if (profileRes.status === 'fulfilled') {
                const data = profileRes.value;
                setProfilePromptBlocks(data.prompt_blocks || data.promptBlocks || {});
                setProfileForm(data.profile || data);
                setCommentsPrompt(data.comments_prompt || '');
            }
            if (judgeRes.status === 'fulfilled') {
                const data = judgeRes.value;
                setJudgeForm(prev => ({
                    ...prev,
                    ...(data.settings || data)
                }));
            }
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function savePromptBlocks() {
        try {
            await api('/api/admin/profile/prompt-blocks', {
                method: 'POST',
                body: JSON.stringify({ promptBlocks: profilePromptBlocks })
            });
            if (toast) toast('Промпт-модули Леры сохранены');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveProfile() {
        try {
            await api('/api/admin/profile', {
                method: 'POST',
                body: JSON.stringify(profileForm)
            });
            if (toast) toast('Профиль Леры успешно сохранён');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveJudgeSettings() {
        try {
            await api('/api/admin/judge-settings', {
                method: 'POST',
                body: JSON.stringify(judgeForm)
            });
            if (toast) toast('Настройки AI Judge сохранены');
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveCommentsPrompt() {
        try {
            await api('/api/admin/channel/comments-prompt', {
                method: 'POST',
                body: JSON.stringify({ commentsPrompt })
            });
            if (toast) toast('Промпт комментариев сохранён');
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
                    variant={activeStudioTab === 'comments-studio' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveStudioTab('comments-studio')}
                >
                    <MessageSquare size={14} /> 💬 Студия Комментариев
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
                        onSave={saveProfile}
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
                {activeStudioTab === 'comments-studio' && (
                    <CommentsPromptStudio
                        commentsPrompt={commentsPrompt}
                        setCommentsPrompt={setCommentsPrompt}
                        onSave={saveCommentsPrompt}
                    />
                )}
                {activeStudioTab === 'actions' && <ActionsManager toast={toast} />}
                {activeStudioTab === 'diagnostics' && <LlmPanel toast={toast} />}
            </div>
        </div>
    );
}

export default StudioTab;
