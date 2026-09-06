import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export function PromptLogsTab({ toast }) {
    const [logs, setLogs] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);

    async function loadLogs() {
        setLoading(true);
        try {
            const result = await api('/api/admin/prompt-logs?limit=80');
            setLogs(result.logs || []);
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    async function openLog(id) {
        try {
            const result = await api(`/api/admin/prompt-logs/${id}`);
            setSelected(result.log || null);
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    useEffect(() => { loadLogs(); }, []);

    return (
        <Card>
            <CardHeader
                eyebrow="Диалоги"
                title="Логи диалогов и Prompt Inspector"
                description="Список реальных ответов Леры. Технические слои открываются только у выбранной записи."
                action={<Button size="sm" variant="outline" onClick={loadLogs} disabled={loading}><RefreshCw size={13} /> Обновить</Button>}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(320px, 1.5fr)', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 560, overflowY: 'auto' }}>
                    {logs.map(log => (
                        <button key={log.id} type="button" className="managed-row" onClick={() => openLog(log.id)} style={{ textAlign: 'left', color: 'inherit', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <strong>{log.first_name || log.username || `User ${log.user_id || '—'}`}</strong>
                                <span style={{ fontSize: 11, opacity: .65 }}>{new Date(log.created_at).toLocaleString('ru-RU')}</span>
                            </div>
                            <div style={{ fontSize: 12, marginTop: 4, opacity: .8 }}>{log.user_text || 'Без текста'}</div>
                            <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                                <Badge variant="muted">{log.mode || '—'}</Badge>
                                <Badge variant={log.error_text ? 'red' : 'green'}>{log.error_text ? 'Ошибка' : 'OK'}</Badge>
                                {log.model && <span style={{ fontSize: 11, opacity: .7 }}>{log.model}</span>}
                            </div>
                        </button>
                    ))}
                    {!logs.length && <div className="empty-state">Логи диалогов пока пусты.</div>}
                </div>
                <div className="prompt-log-detail" style={{ minWidth: 0 }}>
                    {selected ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Eye size={15} /><strong>Детали вызова #{selected.id}</strong></div>
                            <div style={{ padding: 12, background: 'rgba(0,0,0,.22)', borderRadius: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                <strong>Пользователь:</strong>{'\n'}{selected.user_text || '—'}{'\n\n'}
                                <strong>Ответ:</strong>{'\n'}{selected.parsed_response || selected.raw_response || '—'}
                            </div>
                            <details style={{ marginTop: 10 }}>
                                <summary>Экспертные слои промпта и трассировка</summary>
                                <pre style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify({
                                    system_prompt: selected.system_prompt,
                                    messages: selected.messages,
                                    radiant_context: selected.radiant_context,
                                    memory_used: selected.memory_used,
                                    generation_trace: selected.generation_trace
                                }, null, 2)}</pre>
                            </details>
                        </>
                    ) : <div className="empty-state" style={{ minHeight: 220 }}>Выбери диалог слева.</div>}
                </div>
            </div>
        </Card>
    );
}

export default PromptLogsTab;
