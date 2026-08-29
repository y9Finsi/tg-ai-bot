import React, { useState, useEffect } from 'react';
import { Wrench, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export function ActionsManager({ toast }) {
    const [tools, setTools] = useState([]);
    const [loading, setLoading] = useState(false);
    const [testingName, setTestingName] = useState(null);
    const [testResult, setTestResult] = useState(null);

    async function loadTools() {
        setLoading(true);
        try {
            const res = await api('/api/admin/tools');
            setTools(res.tools || []);
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    async function toggleTool(toolName) {
        try {
            const res = await api(`/api/admin/tools/${encodeURIComponent(toolName)}/toggle`, {
                method: 'POST'
            });
            setTools(current => current.map(t => (t.name === toolName || t.id === toolName) ? { ...t, enabled: res.tool?.enabled ?? !t.enabled } : t));
            toast?.(`Статус инструмента «${toolName}» обновлён`);
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    async function testTool(toolName) {
        setTestingName(toolName);
        setTestResult(null);
        try {
            const res = await api(`/api/admin/tools/${encodeURIComponent(toolName)}/test`, {
                method: 'POST',
                body: JSON.stringify({ args: {}, context: { userId: 0, test: true } })
            });
            setTestResult({ toolName, success: true, result: res.result });
            toast?.(`Инструмент «${toolName}» успешно выполнен`);
        } catch (err) {
            setTestResult({ toolName, success: false, error: err.message });
            toast?.(`Ошибка теста: ${err.message}`, 'error');
        } finally {
            setTestingName(null);
        }
    }

    useEffect(() => {
        loadTools();
    }, []);

    return (
        <Card>
            <CardHeader
                eyebrow="Tool Calling & MCP"
                title="Менеджер действий и инструментов Леры"
                description="Разрешенные действия модели: отправка фото, генерация голоса, сохранение фактов, вызов активностей и MCP адаптеры."
                action={
                    <Button size="sm" variant="outline" onClick={loadTools} disabled={loading}>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Обновить
                    </Button>
                }
            />

            {testResult && (
                <div style={{ margin: '12px 0', padding: 12, background: testResult.success ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: 8, border: `1px solid ${testResult.success ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13, color: testResult.success ? '#4ade80' : '#f87171' }}>
                            Тест инструмента «{testResult.toolName}»: {testResult.success ? 'Успешно' : 'Ошибка'}
                        </strong>
                        <Button size="xs" variant="outline" onClick={() => setTestResult(null)}>Закрыть</Button>
                    </div>
                    <pre style={{ margin: '8px 0 0', fontSize: 11, background: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 6, overflowX: 'auto' }}>
                        {JSON.stringify(testResult.result || testResult.error, null, 2)}
                    </pre>
                </div>
            )}

            <div className="managed-grid" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tools.map(tool => {
                    const toolName = tool.name || tool.id;
                    const isEnabled = tool.enabled !== false;
                    return (
                        <div className="managed-row" key={toolName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Wrench size={16} />
                                <div>
                                    <strong>{tool.title || tool.label || toolName}</strong>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                                        {tool.description || 'Действие модели'} · <code>{toolName}</code>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Badge variant={isEnabled ? 'green' : 'muted'}>
                                    {isEnabled ? 'Активен' : 'Выключен'}
                                </Badge>
                                <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => testTool(toolName)}
                                    disabled={testingName === toolName}
                                >
                                    {testingName === toolName ? 'Тест…' : 'Тест'}
                                </Button>
                                <Button
                                    size="xs"
                                    variant={isEnabled ? 'outline' : 'primary'}
                                    onClick={() => toggleTool(toolName)}
                                >
                                    {isEnabled ? 'Выключить' : 'Включить'}
                                </Button>
                            </div>
                        </div>
                    );
                })}
                {!tools.length && (
                    <div className="empty-state">Инструменты не загружены. Нажмите «Обновить».</div>
                )}
            </div>
        </Card>
    );
}

export const ActionsManagerPanel = ActionsManager;
export default ActionsManager;
