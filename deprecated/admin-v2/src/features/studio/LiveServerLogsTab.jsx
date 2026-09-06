import React, { useState, useEffect } from 'react';
import { RefreshCw, Terminal, Download } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';
import { downloadTextFile } from '@/lib/helpers.js';

export function LiveServerLogsTab({ toast }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);

    async function loadLogs() {
        setLoading(true);
        try {
            const res = await api('/api/admin/logs?limit=100');
            setLogs(res.logs || res.lines || []);
        } catch (err) {
            setLogs([]);
            if (toast) toast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadLogs();
    }, []);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(loadLogs, 3000);
        return () => clearInterval(interval);
    }, [autoRefresh]);

    return (
        <Card>
            <CardHeader
                eyebrow="Диагностика"
                title="Live Server Logs (Поток логов сервера)"
                description="События HTTP-сервера, вызовы LLM провайдеров и фоновые задачи."
                action={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={e => setAutoRefresh(e.target.checked)}
                            />
                            Авто-обновление (3с)
                        </label>
                        <Button size="sm" variant="outline" onClick={loadLogs} disabled={loading}>
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Обновить
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadTextFile('server-logs.txt', logs.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n'))}
                        >
                            <Download size={13} /> Скачать
                        </Button>
                    </div>
                }
            />

            <div
                className="server-logs-terminal"
                style={{
                    background: '#090d16',
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    padding: 14,
                    borderRadius: 8,
                    maxHeight: 480,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    marginTop: 12
                }}
            >
                {logs.length ? (
                    logs.map((line, idx) => {
                        const text = typeof line === 'string' ? line : JSON.stringify(line);
                        const isErr = text.includes('ERROR') || text.includes('ERR') || text.includes('Failed');
                        const isWarn = text.includes('WARN');
                        return (
                            <div
                                key={idx}
                                style={{
                                    color: isErr ? '#f87171' : isWarn ? '#fbbf24' : '#cbd5e1',
                                    lineHeight: 1.6,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all'
                                }}
                            >
                                {text}
                            </div>
                        );
                    })
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, opacity: 0.6 }}>Логи не обнаружены.</div>
                )}
            </div>
        </Card>
    );
}

export default LiveServerLogsTab;
