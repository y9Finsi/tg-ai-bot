import React, { useEffect, useState } from 'react';
import { Sparkles, SlidersHorizontal, Send, RefreshCw, Layers } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

const STUDIO_EDITABLE_INTENTS = ['CASUAL', 'EROTIC'];

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
    const [presets, setPresets] = useState([]);
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [publishCheck, setPublishCheck] = useState(null);

    const activeConfig = {
        name: `Sandbox · ${activeIntent}`,
        sampling: { temperature, top_p: topP, max_tokens: maxTokens },
        prompt_modules: { ...modulesA }
    };

    useEffect(() => {
        api('/api/sandbox/presets')
            .then(res => setPresets(res.presets || []))
            .catch(err => toast?.(err.message, 'error'));
    }, []);

    function applyPreset(preset) {
        const config = preset?.config || {};
        setSelectedPresetId(String(preset.id));
        setTemperature(Number(config.sampling?.temperature ?? 0.7));
        setTopP(Number(config.sampling?.top_p ?? 0.9));
        setMaxTokens(Number(config.sampling?.max_tokens ?? 400));
        setModulesA(config.prompt_modules || {});
        toast?.(`Пресет «${preset.name}» применён к варианту A`);
    }

    async function saveDraft() {
        await api('/api/sandbox/prompt-studio/draft', {
            method: 'POST',
            body: JSON.stringify({ intent: activeIntent, config: activeConfig })
        });
        toast?.('Черновик сохранён');
    }

    async function savePreset() {
        const name = window.prompt('Название нового пресета', `Мой ${activeIntent}`);
        if (!name?.trim()) return;
        const result = await api('/api/sandbox/presets', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim(), slot: activeIntent, config: activeConfig })
        });
        setPresets(prev => [result.preset, ...prev]);
        toast?.('Пресет сохранён');
    }

    async function publishIntent() {
        await api('/api/sandbox/prompt-studio/publish', {
            method: 'POST',
            body: JSON.stringify({ intent: activeIntent, config: activeConfig })
        });
        toast?.(`Промпт ${activeIntent} опубликован`);
        setPublishCheck(null);
    }

    async function checkBeforePublish() {
        const errors = [];
        if (!activeIntent) errors.push('Не выбран intent');
        if (!inputMessage.trim()) errors.push('Добавь тестовое сообщение');
        if (!resultA) errors.push('Сначала запусти тест варианта A');
        if (mode === 'ab' && !resultB) errors.push('Для A/B нужен результат варианта B');

        if (errors.length) {
            setPublishCheck({ ok: false, message: errors.join('. ') });
            toast?.(errors[0], 'error');
            return;
        }

        try {
            await saveDraft();
            setPublishCheck({
                ok: true,
                message: `Черновик ${activeIntent} проверен: тестовый ответ есть, конфигурация сохранена.`
            });
            toast?.('Проверка перед публикацией пройдена');
        } catch (err) {
            setPublishCheck({ ok: false, message: err.message });
            toast?.(err.message, 'error');
        }
    }

    async function runSingleTest() {
        if (!inputMessage.trim()) return;
        setLoadingA(true);
        setResultA(null);
        try {
            const res = await api('/api/sandbox/generate', {
                method: 'POST',
                body: JSON.stringify({
                    userText: inputMessage.trim(),
                    routingMode: activeIntent,
                    preset: activeConfig
                })
            });
            setResultA(res.variant || res);
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
            const response = await api('/api/sandbox/ab-test', {
                method: 'POST',
                body: JSON.stringify({
                    userText: inputMessage.trim(),
                    routingMode: activeIntent,
                    variantA: { ...activeConfig, prompt_modules: modulesA },
                    variantB: { ...activeConfig, prompt_modules: modulesB }
                })
            });
            const variants = response.variants || {};
            setResultA(variants.A);
            setResultB(variants.B);

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
                        <Button variant="outline" onClick={() => saveDraft().catch(err => toast?.(err.message, 'error'))}>
                            Сохранить черновик
                        </Button>
                        <Button variant="outline" onClick={() => savePreset().catch(err => toast?.(err.message, 'error'))}>
                            Сохранить как пресет
                        </Button>
                    </div>

                    <div className="studio-publish-check" style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <div>
                                <strong>Проверка перед публикацией</strong>
                                <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>
                                    Проверяем intent, тестовый ответ и сохраняем текущий черновик перед production.
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Button variant="outline" onClick={() => checkBeforePublish()}>
                                    Проверить
                                </Button>
                                <Button
                                    variant="primary"
                                    disabled={!publishCheck?.ok}
                                    onClick={() => publishIntent().catch(err => toast?.(err.message, 'error'))}
                                >
                                    Опубликовать
                                </Button>
                            </div>
                        </div>
                        {publishCheck && (
                            <div
                                role="status"
                                style={{ marginTop: 8, fontSize: 12, color: publishCheck.ok ? '#86efac' : '#fca5a5' }}
                            >
                                {publishCheck.message}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Пресеты:</span>
                        <select value={selectedPresetId} onChange={e => applyPreset(presets.find(item => String(item.id) === e.target.value))}>
                            <option value="">Выбрать пресет…</option>
                            {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                        </select>
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
