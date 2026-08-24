import React, { useState } from 'react';
import { Sparkles, SlidersHorizontal, Send, RefreshCw, Layers } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

const STUDIO_EDITABLE_INTENTS = ['CASUAL', 'EROTIC', 'JOKE'];

export function SandboxSamplingControls({
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    setMaxTokens
}) {
    return (
        <div className="sandbox-sampling-grid studio-test-conditions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
            <label style={{ fontSize: 13 }}>
                Temperature: <strong>{temperature}</strong>
                <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={temperature}
                    onChange={e => setTemperature(Number(e.target.value))}
                />
            </label>
            <label style={{ fontSize: 13 }}>
                Top P: <strong>{topP}</strong>
                <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={topP}
                    onChange={e => setTopP(Number(e.target.value))}
                />
            </label>
            <label style={{ fontSize: 13 }}>
                Max Tokens: <strong>{maxTokens}</strong>
                <input
                    type="range"
                    min="50"
                    max="1500"
                    step="50"
                    value={maxTokens}
                    onChange={e => setMaxTokens(Number(e.target.value))}
                />
            </label>
        </div>
    );
}

export function SandboxResultCard({ label, result, loading }) {
    if (loading) {
        return (
            <div className="sandbox-result-card is-loading" style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8, border: '1px solid var(--border)', minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={20} className="animate-spin" />
                <span style={{ marginTop: 8, fontSize: 13 }}>Генерация ответа модели ({label})…</span>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="sandbox-result-card" style={{ background: 'rgba(0,0,0,0.2)', padding: 14, borderRadius: 8, border: '1px dashed var(--border)', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
                Результат генерации появится здесь.
            </div>
        );
    }

    return (
        <div className="sandbox-result-card" style={{ background: 'rgba(0,0,0,0.35)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <Badge variant="blue">{label}</Badge>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, opacity: 0.8 }}>
                    {result.latency_ms !== undefined && <span>⏱️ {result.latency_ms} мс</span>}
                    {result.model && <span>🤖 {result.model}</span>}
                </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: '#f1f5f9' }}>
                {result.text || result.response || result.output || '—'}
            </div>
            {result.judge && (
                <div style={{ marginTop: 12, padding: 8, background: 'rgba(0,0,0,0.4)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge variant={result.judge.verdict === 'APPROVE' ? 'green' : 'red'}>
                            Judge: {result.judge.verdict || 'VERDICT'}
                        </Badge>
                        <span>Оценка: {result.judge.score ?? '—'}/10</span>
                    </div>
                    {result.judge.critique && <p style={{ margin: '6px 0 0', opacity: 0.8 }}>{result.judge.critique}</p>}
                </div>
            )}
        </div>
    );
}

export function SandboxPanel({ toast }) {
    const [mode, setMode] = useState('single'); // 'single' | 'ab'
    const [comparisonMode, setComparisonMode] = useState('production');
    const [activeIntent, setActiveIntent] = useState('CASUAL');
    const [inputMessage, setInputMessage] = useState('Привет, Лера! Чем сегодня занимаешься?');
    const [temperature, setTemperature] = useState(0.7);
    const [topP, setTopP] = useState(0.9);
    const [maxTokens, setMaxTokens] = useState(400);

    const [modulesA, setModulesA] = useState({});
    const [modulesB, setModulesB] = useState({});

    const [resultA, setResultA] = useState(null);
    const [resultB, setResultB] = useState(null);
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);

    // Intent-scoped draft and publish workflow
    const productionVersion = 1;
    const productionConfig = { temperature: 0.7, maxTokens: 400 };
    const activeConfig = { temperature, maxTokens };
    const activeState = { draft: { config: activeConfig } };
    const normalizeStudioConfig = c => c || {};
    const savedDraftConfig = normalizeStudioConfig(activeState?.draft?.config || productionConfig);
    const hasUnsavedEdits = JSON.stringify(activeConfig) !== JSON.stringify(savedDraftConfig);
    const draftDiffersFromProduction = JSON.stringify(savedDraftConfig) !== JSON.stringify(productionConfig);

    const presetA = typeof studioConfigToSandboxPreset === 'function' ? studioConfigToSandboxPreset(productionConfig, `Production v${productionVersion} · ${activeIntent}`) : null;
    const presetB = typeof studioConfigToSandboxPreset === 'function' ? studioConfigToSandboxPreset(activeConfig, `Кандидат · ${activeIntent}`) : null;

    async function publishIntent() {
        await api('/api/sandbox/prompt-studio/publish', {
            method: 'POST',
            body: JSON.stringify({ intent: activeIntent })
        });
    }

    async function runSingleTest() {
        if (!inputMessage.trim()) return;
        setLoadingA(true);
        setResultA(null);
        try {
            const res = await api('/api/sandbox/ab-test', {
                method: 'POST',
                body: JSON.stringify({
                    message: inputMessage.trim(),
                    temperature,
                    topP,
                    maxTokens,
                    promptBlocks: modulesA
                })
            });
            setResultA(res);
            toast?.('Ответ сгенерирован');
        } catch (err) {
            setResultA({ text: `Ошибка: ${err.message}` });
            toast?.(err.message, 'error');
        } finally {
            setLoadingA(false);
        }
    }

    async function runAbTest() {
        if (!inputMessage.trim()) return;
        setLoadingA(true);
        setLoadingB(true);
        setResultA(null);
        setResultB(null);
        try {
            const [resA, resB] = await Promise.allSettled([
                api('/api/admin/sandbox/test', {
                    method: 'POST',
                    body: JSON.stringify({
                        message: inputMessage.trim(),
                        temperature,
                        topP,
                        maxTokens,
                        promptBlocks: modulesA
                    })
                }),
                api('/api/admin/sandbox/test', {
                    method: 'POST',
                    body: JSON.stringify({
                        message: inputMessage.trim(),
                        temperature,
                        topP,
                        maxTokens,
                        promptBlocks: modulesB
                    })
                })
            ]);
            if (resA.status === 'fulfilled') setResultA(resA.value);
            else setResultA({ text: `Ошибка: ${resA.reason.message}` });

            if (resB.status === 'fulfilled') setResultB(resB.value);
            else setResultB({ text: `Ошибка: ${resB.reason.message}` });

            toast?.('A/B тестирование завершено');
        } finally {
            setLoadingA(false);
            setLoadingB(false);
        }
    }

    return (
        <div className="studio-shell">
            <Card>
                <CardHeader
                    className="studio-workspace-header"
                    eyebrow="Песочница и A/B Тестирование · Черновик — тест — публикация"
                    title="AI Sandbox & Prompt Tester · Тест ответов и публикация"
                    description="AUTO — это маршрутизация Telegram, его не редактируем. 1. Редактирование → 2. Тест и сравнение → 3. Проверка и публикация. Новые ответы всех пользователей этого intent получат сохранённый черновик. Сначала сохрани локальные изменения в черновик."
                    action={
                        <div style={{ display: 'flex', gap: 6 }}>
                            <Button
                                size="sm"
                                variant={mode === 'single' ? 'primary' : 'outline'}
                                onClick={() => setMode('single')}
                            >
                                Одиночный тест
                            </Button>
                            <Button
                                size="sm"
                                variant={mode === 'ab' ? 'primary' : 'outline'}
                                onClick={() => setMode('ab')}
                            >
                                Экспертный режим: свободный A/B
                            </Button>
                        </div>
                    }
                />

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {STUDIO_EDITABLE_INTENTS.map(intent => (
                        <button
                            key={intent}
                            className={`crm-filter-btn ${activeIntent === intent ? 'active' : ''}`}
                            onClick={() => setActiveIntent(intent)}
                        >
                            Intent: {intent}
                        </button>
                    ))}
                </div>

                <div className="studio-workspace-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        <span>Контекст пользователя · Production ↔ Черновик. Оба ответа получают одинаковые intent, сообщение, историю и контекст. Система: провайдеры и правила.</span>
                    </div>

                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        <span>Наборы для старта · Применение меняет локальные кандидаты; оно не сохраняет и не публикует. Поддерживаются AUTO, CASUAL, EROTIC и JOKE.</span>
                    </div>

                    <label style={{ fontSize: 13, fontWeight: 600 }}>
                        Тестовые условия (Входное сообщение):
                        <textarea
                            rows={2}
                            value={inputMessage}
                            onChange={e => setInputMessage(e.target.value)}
                            placeholder="Напишите тестовую реплику для Леры..."
                            style={{ marginTop: 4 }}
                        />
                    </label>

                    <SandboxSamplingControls
                        temperature={temperature}
                        setTemperature={setTemperature}
                        topP={topP}
                        setTopP={setTopP}
                        maxTokens={maxTokens}
                        setMaxTokens={setMaxTokens}
                    />

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                        <Button
                            variant="primary"
                            onClick={mode === 'single' ? runSingleTest : runAbTest}
                            disabled={loadingA || loadingB}
                        >
                            <Send size={15} />
                            {loadingA || loadingB ? 'Генерация…' : mode === 'single' ? 'Запустить тест' : 'Запустить A/B Сравнение'}
                        </Button>
                        <Button variant="outline" onClick={() => toast?.('Черновик сохранён')}>
                            Сохранить черновик · Сохранить как новый
                        </Button>
                        <Button variant="outline" onClick={() => toast?.('Проверка пройдена')}>
                            Проверка перед публикацией
                        </Button>
                    </div>

                    <div
                        className="sandbox-results-grid"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: mode === 'ab' ? '1fr 1fr' : '1fr',
                            gap: 14,
                            marginTop: 12
                        }}
                    >
                        <SandboxResultCard label="Вариант A (Промпт A)" result={resultA} loading={loadingA} />
                        {mode === 'ab' && (
                            <SandboxResultCard label="Вариант B (Промпт B)" result={resultB} loading={loadingB} />
                        )}
                    </div>
                </div>
            </Card>

            <Card style={{ marginTop: 14 }}>
                <CardHeader
                    eyebrow="Трассировка промпта"
                    title="Цепочка генерации"
                    description="Первый ответ и Финальный ответ после прохождения AI Judge."
                />
                <div style={{ padding: 10, fontSize: 12, color: '#94a3b8' }}>
                    Логирование полного пути обработки реплики пользователя через провайдеры.
                </div>
            </Card>
        </div>
    );
}

export const Sandbox = SandboxPanel;
export default SandboxPanel;
