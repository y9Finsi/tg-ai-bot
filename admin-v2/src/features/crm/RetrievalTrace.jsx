import React from 'react';
import { CircleAlert, RefreshCw, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { formatTime } from '@/lib/dateUtils.js';

export function RetrievalTrace({ retrievals = [], loading, error, onRetry }) {
    if (loading) {
        return (
            <div className="memory-insight-state" role="status">
                <RefreshCw size={18} className="animate-spin" />
                <span>Загрузка response traces…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="memory-insight-state is-error" role="alert">
                <CircleAlert size={18} />
                <span>{error}</span>
                {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Повторить</Button>}
            </div>
        );
    }

    if (!retrievals.length) {
        return (
            <div className="empty-state" style={{ minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                <p>Трассировок ответов для данного пользователя пока нет.</p>
            </div>
        );
    }

    return (
        <div className="retrieval-trace-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {retrievals.map((item, idx) => (
                <div
                    key={item.id || idx}
                    className="managed-row"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 14, background: 'rgba(0,0,0,0.25)', borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Badge variant={item.fallback_triggered ? 'yellow' : 'blue'}>
                                {item.model || 'Основная модель'}
                            </Badge>
                            {item.fallback_triggered && <Badge variant="red">Fallback сработал</Badge>}
                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                                {formatTime(item.created_at || item.timestamp)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                            {item.latency_ms !== undefined && <span>⏱️ {item.latency_ms} мс</span>}
                            {item.tokens_used !== undefined && <span>🔤 {item.tokens_used} токенов</span>}
                        </div>
                    </div>

                    {(item.query_text || item.user_message) && (
                        <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: 6, width: '100%' }}>
                            <strong>Запрос:</strong> {item.query_text || item.user_message}
                        </div>
                    )}

                    {item.metadata && (
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            <strong>Метаданные:</strong> {JSON.stringify(item.metadata)}
                        </div>
                    )}

                    {item.traces && item.traces.length > 0 && (
                        <div style={{ width: '100%', fontSize: 12 }}>
                            <span style={{ color: 'var(--blue)', fontWeight: 600 }}>Кандидаты и скоринг ({item.traces.length}):</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                {item.traces.map((trace, tIdx) => (
                                    <div key={tIdx} style={{ fontSize: 11, padding: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
                                        <span>Ранг #{trace.candidate_rank ?? tIdx + 1}: </span>
                                        <strong>{trace.fact || trace.text || 'Факт'}</strong>
                                        {trace.final_score !== undefined && <span> (Score: {Number(trace.final_score).toFixed(2)})</span>}
                                        {trace.exclusion_reason && <span style={{ color: '#f87171' }}> [Исключен: {trace.exclusion_reason}]</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {item.facts_retrieved && item.facts_retrieved.length > 0 && (
                        <div style={{ width: '100%', fontSize: 12 }}>
                            <span style={{ color: 'var(--blue)', fontWeight: 600 }}>Использованные факты из памяти ({item.facts_retrieved.length}):</span>
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                {item.facts_retrieved.map((fact, fIdx) => (
                                    <li key={fIdx} style={{ color: '#cbd5e1' }}>
                                        {typeof fact === 'string' ? fact : fact.text || fact.fact || JSON.stringify(fact)}
                                        {fact.score !== undefined && <span style={{ opacity: 0.6 }}> (score: {Number(fact.score).toFixed(2)})</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {item.rationale && (
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            <em>Обоснование:</em> {item.rationale}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default RetrievalTrace;
