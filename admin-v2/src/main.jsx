import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tabs from '@radix-ui/react-tabs';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { CircleHelp, CloudRain, Database, Download, ExternalLink, EyeOff, FileImage, FileText, HeartPulse, ListTree, Lock, MessageSquare, MoreHorizontal, Play, RefreshCw, ShieldAlert, Sparkles, Sun, Terminal, Upload, UserRound, WandSparkles, X, Users, Settings2, Image, Radio, CheckCircle2, Utensils, Zap, Droplets, Heart, BatteryCharging, Flame, CircleAlert, Wallet, MapPin, Calendar, BarChart3, Tag, CreditCard, Backpack, Shirt, Umbrella, Package, ArrowRight, ArrowUp, ArrowDown, CircleCheck, CircleOff, Info, Pencil, Command, Search, Copy, Check, Pause, Trash2, Clock, Coins, Cpu, Layers, AlertTriangle, XCircle, Filter, Activity, ChevronRight, ChevronDown, User, SlidersHorizontal, Plus, Globe, Server, Network, Brain, BrainCircuit, GitBranch, Gauge, ShieldCheck } from 'lucide-react';
import './styles.css';
import { Button } from './components/ui/button.jsx';
import { Badge } from './components/ui/badge.jsx';
import { Card, CardHeader } from './components/ui/card.jsx';
import { appendSandboxExchange, getSandboxSelectedResult } from './sandbox_chat.js';

const TASK_NAMES = { SLEEP_NIGHT: 'Ночной сон', SLEEP_EXHAUSTED: 'Аварийный сон', EAT_BREAKFAST: 'Завтрак', EAT_LUNCH: 'Обед', EAT_DINNER: 'Ужин', EMERGENCY_EAT: 'Аварийная еда', EAT_FOOD_HOME: 'Еда дома', BUY_FOOD_STORE: 'Покупка еды', WORK_LAPTOP: 'Работа', TRAVEL: 'Дорога', SOCIAL_NASTYA: 'Встреча с Настей', LEISURE_HOME: 'Отдых дома', IDLE_HOME_REST: 'Пауза дома', GO_TO_BATHROOM: 'Туалет', SHOWER_HOME: 'Душ', PREPARE_FOR_OUTING: 'Сборы' };
const EVENT_NAMES = { TASK_COMPLETED: 'Задача завершена', ROOT_TASK_COMPLETED: 'Цепочка завершена', INTERRUPT_ACCEPTED: 'Прерывание', RANDOM_EVENT: 'Случайное событие', WORK_REQUEST_CREATED: 'Макс прислал работу', SOCIAL_MEETING_PROPOSED: 'Настя предложила встречу', COMMITMENT_MISSED: 'План пропущен' };
const WEEKDAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const LERA_PROMPT_MODULES = [
    ['lera_base', 'Личность Леры', 'Кто она, как воспринимает мир и что для неё важно.'],
    ['lera_speech', 'Речь и стиль', 'Тон, длина фраз, словарь и характерные речевые привычки.'],
    ['lera_intimacy', 'Близость и границы', 'Как Лера ведёт интимные темы и где останавливается.'],
    ['lera_jokes', 'Юмор и лёгкость', 'Шутки, самоирония и допустимая игривость.'],
    ['lera_examples', 'Примеры ответов', 'Обычные диалоговые примеры для ориентира модели.'],
    ['lera_virt_examples', 'Примеры в роли', 'Примеры для более личного и выразительного общения.'],
    ['lera_rules', 'Правила и границы', 'Обязательные правила ответа и ограничения поведения.']
];
const ROUTING_PROMPT_MODULES = [
    ['core', 'Идентичность (Core)', 'Базовый статус человека (не бот, не ассистент, живой человек).'],
    ['common', 'Речь и правила (Common)', 'Стиль речи, сленг, краткость, без эмодзи, лесенка |||, правила фото.'],
    ['casual', 'CASUAL', 'Бытовое общение: слушать собеседника, отвечать на вопросы, делиться своим к месту.'],
    ['erotic', 'EROTIC', 'Интимный режим: страсть, близость, без жалоб на усталость.'],
    ['joke', 'JOKE', 'Юмор, мемы и шутки строго по явной просьбе пользователя.']
];
const CONTEXT_TEMPLATE_HELP = `Доступные плейсхолдеры:
{{CONTEXT_PARTNER}} — имя собеседника
{{CONTEXT_PAUSE}} — пауза в диалоге
{{CONTEXT_PAUSE_GUIDANCE}} — пояснение о влиянии паузы
{{CONTEXT_ANALYSIS}} — состояние Леры, окружение и события дня`;
const CHANNEL_PROMPT_MODULES = [
    ['voice', 'Голос Леры', 'Как звучит автор: тон, ритм и лексика.'],
    ['context', 'Контекст поста', 'Какие темы, наблюдения и детали можно использовать.'],
    ['restrictions', 'Ограничения', 'Что не писать, какие факты не выдумывать и чего избегать.'],
    ['cta', 'Финальный акцент', 'Вопрос, мысль или мягкий призыв в конце поста.']
];

const DEFAULT_JUDGE_PROMPT = `Ты — строгий аудитор ответов персонажа Лера (19 лет, СПб, живой разговорный сленг, без канцелярита, заумности и эмодзи).
Проверь кандидат-ответ перед отправкой пользователю на грубый брак:
- IGNORES_USER: ответ полностью игнорирует суть последней реплики пользователя.
- BROKEN_LOGIC: бессмыслица, галлюцинации, противоречие собственным словам (например, на вопрос "что делаешь?" ответ "я не против").
- OUT_OF_CHARACTER: тон робота, чтение нотаций/морали, книжный стиль, признание себя ИИ.
- REPETITION: дословный повтор недавней фразы из истории.
- INVENTED_FACT: выдумывание событий, которых нет в контексте дня.
- FORMAT: технический мусор, служебные теги наружу, сломанная лесенка.

ОБЯЗАТЕЛЬНО ПРОВЕРЯЙ ПРЕДЫДУЩИЕ СООБЩЕНИЯ ЛЕРЫ, чтобы не было противоречий с тем, что она сказала и где находится.
Если ответ нормальный — верни PASS.`;

const DEFAULT_CHANNEL_JUDGE_PROMPT = `Проверяй публичный пост строго. Отклоняй любой конкретный факт, которого нет в подтвержденных публичных фактах. Отклоняй личные переписки, приватные детали, встречи, техно-слова и служебные теги.`;

function formatDay(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
function formatTime(value) { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(value));
}

function memoryGraphData(payload) {
    const graph = payload?.graph || payload || {};
    return {
        nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
        edges: Array.isArray(graph.edges) ? graph.edges : (Array.isArray(graph.links) ? graph.links : [])
    };
}

function MemoryGraph({ graph, loading, error, onRetry }) {
    if (loading) return <div className="memory-insight-state"><RefreshCw size={16} className="spin" /> Загружаю граф памяти…</div>;
    if (error) return <div className="memory-insight-state is-error" role="alert"><CircleAlert size={16} /> <span>{error}</span><Button size="sm" variant="outline" onClick={onRetry}>Повторить</Button></div>;
    if (!graph.nodes.length) return <div className="memory-insight-state"><BrainCircuit size={18} /> В графе пока нет связанных фактов.</div>;

    const width = 720;
    const height = Math.max(230, Math.ceil(graph.nodes.length / 4) * 96 + 42);
    const positions = Object.fromEntries(graph.nodes.map((node, index) => [String(node.id ?? node.key ?? index), {
        x: 92 + (index % 4) * 174,
        y: 54 + Math.floor(index / 4) * 96
    }]));
    const point = value => positions[String(value)] || positions[String(value?.id)] || null;
    return <div className="memory-graph-wrap">
        <svg className="memory-graph-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Граф фактов памяти пользователя">
            <g className="memory-graph-edges">{graph.edges.map((edge, index) => {
                const source = point(edge.source ?? edge.from ?? edge.source_id);
                const target = point(edge.target ?? edge.to ?? edge.target_id);
                return source && target ? <line key={`${edge.id || index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> : null;
            })}</g>
            <g>{graph.nodes.map((node, index) => {
                const position = positions[String(node.id ?? node.key ?? index)];
                const inactive = node.is_active === false || node.active === false;
                const superseded = Boolean(node.superseded || node.is_superseded);
                return <g className={cn('memory-graph-node', inactive && 'is-inactive', superseded && 'is-superseded')} key={String(node.id ?? node.key ?? index)} transform={`translate(${position.x}, ${position.y})`}>
                    <circle r="22" />
                    <text className="memory-graph-node-type" textAnchor="middle" y="4">{String(node.type || node.kind || 'fact').slice(0, 10)}</text>
                    <text className="memory-graph-node-label" textAnchor="middle" y="43">{String(node.label || node.fact || node.text || node.name || 'Без названия').slice(0, 24)}</text>
                </g>;
            })}</g>
        </svg>
        <div className="memory-graph-legend"><span><i className="is-active" /> Активен</span><span><i className="is-inactive" /> Неактивен</span><span><i className="is-superseded" /> Superseded</span><span><GitBranch size={13} /> Связь</span></div>
    </div>;
}

function RetrievalTrace({ retrievals, loading, error, onRetry }) {
    if (loading) return <div className="memory-insight-state"><RefreshCw size={16} className="spin" /> Загружаю trace…</div>;
    if (error) return <div className="memory-insight-state is-error" role="alert"><CircleAlert size={16} /> <span>{error}</span><Button size="sm" variant="outline" onClick={onRetry}>Повторить</Button></div>;
    if (!retrievals.length) return <div className="memory-insight-state"><Gauge size={18} /> Ответов с trace для этого пользователя пока нет.</div>;
    return <div className="retrieval-trace-list">{retrievals.map((item, index) => {
        const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        const traces = Array.isArray(item.traces) ? item.traces : [];
        const selected = traces.filter(trace => trace.selected === true);
        const source = metadata.source || item.source || item.provider || '—';
        const latency = metadata.latency_ms ?? item.latency_ms ?? item.latencyMs ?? '—';
        const fallbackReason = metadata.fallbackReason || metadata.fallback_reason || item.fallbackReason || item.fallback_reason || item.error || null;
        const status = String(item.status || '').toUpperCase();
        const fallback = Boolean(fallbackReason) || status === 'FAILED';
        const factLabel = trace => trace.normalized_text || trace.trace?.text || trace.trace?.fact || 'Факт недоступен';
        const scoreLabel = trace => Number.isFinite(Number(trace.final_score))
            ? Number(trace.final_score).toFixed(3)
            : '—';
        return <article className="retrieval-trace-card" key={item.id || item.request_id || index}>
            <div className="retrieval-trace-head"><div><strong>{item.created_at || item.createdAt ? formatDate(item.created_at || item.createdAt) : `Trace #${index + 1}`}</strong><span>{item.query_text || item.query || item.user_text || item.request || 'Запрос без текста'}</span></div><Badge variant={fallback ? 'yellow' : 'green'}>{fallback ? (status === 'FAILED' ? 'Ошибка' : 'Fallback') : 'Выбрано'}</Badge></div>
            <div className="retrieval-trace-meta"><span><Database size={13} /> source: {source}</span><span><Clock size={13} /> latency: {latency} мс</span><span><ShieldCheck size={13} /> strategy: {item.strategy || '—'}</span><span><Gauge size={13} /> fallback: {fallbackReason || 'нет'}</span></div>
            {fallbackReason && <small className="trace-error">Причина fallback: {fallbackReason}</small>}
            <div className="retrieval-facts"><span className="retrieval-label">Selected facts ({selected.length})</span>{selected.length ? selected.map((trace, traceIndex) => <div className="retrieval-fact" key={trace.id || trace.memory_fact_id || traceIndex}><span><strong>{trace.memory_type || 'FACT'}</strong> · {factLabel(trace)}</span><code>{scoreLabel(trace)}</code></div>) : <small>Факты не выбраны</small>}</div>
            {traces.length > 0 && <details className="retrieval-candidates"><summary>Кандидаты и причины ({traces.length})</summary><div className="retrieval-facts">{traces.map((trace, traceIndex) => <div className={cn('retrieval-fact', trace.selected && 'is-selected')} key={`candidate-${trace.id || trace.memory_fact_id || traceIndex}`}><span><strong>#{trace.candidate_rank || traceIndex + 1}</strong> {trace.memory_type || 'FACT'} · {factLabel(trace)}{trace.exclusion_reason ? ` · ${trace.exclusion_reason}` : ''}</span><code>{scoreLabel(trace)}</code></div>)}</div></details>}
        </article>;
    })}</div>;
}
function mskDateParts(value = new Date()) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value])); }
function isoDate(value) { const parts = mskDateParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function taskName(value) { return TASK_NAMES[value] || String(value || 'Событие').replaceAll('_', ' ').toLowerCase(); }
function eventName(value) { return EVENT_NAMES[value] || String(value || 'Событие').replaceAll('_', ' ').toLowerCase(); }
function cn(...values) { return values.filter(Boolean).join(' '); }
const CHANNEL_TOPIC_KEYS = ['thoughts', 'flirt', 'life', 'jokes', 'questions', 'meme', 'repost'];
function normalizeTopicShares(topics, rawWeights = {}) {
    const active = [...new Set((topics || []).filter(topic => CHANNEL_TOPIC_KEYS.includes(topic)))];
    const safeTopics = active.length ? active : ['thoughts'];
    const shares = Object.fromEntries(CHANNEL_TOPIC_KEYS.map(topic => [topic, 0]));
    const entries = safeTopics.map(topic => ({ topic, weight: Math.max(1, Number(rawWeights[topic]) || 1) }));
    const total = entries.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) {
        const base = Math.floor(100 / safeTopics.length);
        let remainder = 100 - base * safeTopics.length;
        for (const topic of safeTopics) {
            shares[topic] = base + (remainder > 0 ? 1 : 0);
            remainder -= 1;
        }
        return shares;
    }
    let assigned = 0;
    for (const entry of entries) {
        entry.exact = (entry.weight / total) * 100;
        entry.value = Math.floor(entry.exact);
        assigned += entry.value;
    }
    entries.sort((a, b) => (b.exact - b.value) - (a.exact - a.value))
        .slice(0, 100 - assigned)
        .forEach(entry => { entry.value += 1; });
    for (const entry of entries) shares[entry.topic] = entry.value;
    return shares;
}
function redistributeTopicShare(topics, weights, changedTopic, requestedValue) {
    const active = topics.filter(topic => CHANNEL_TOPIC_KEYS.includes(topic));
    if (!active.includes(changedTopic)) return normalizeTopicShares(active, weights);
    if (active.length === 1) return normalizeTopicShares(active, { [changedTopic]: 100 });
    const nextValue = Math.max(0, Math.min(100, Number(requestedValue) || 0));
    return normalizeTopicShares(active, { ...weights, [changedTopic]: nextValue });
}
function formatCountdown(minutes) { const value = Math.max(0, Math.round(Number(minutes) || 0)); if (value < 1) return 'меньше минуты'; const hours = Math.floor(value / 60); const rest = value % 60; return hours ? `${hours} ч ${rest ? `${rest} мин` : ''}`.trim() : `${rest} мин`; }
function rowTaskType(row) { return row.taskType || row.task_type || row.payload?.taskType; }
function itemMeta(item, catalog = []) {
    const catalogItem = catalog.find(entry => entry.id === item.item_id);
    return {
        ...item,
        name: catalogItem?.name || String(item.item_id || 'Предмет').replaceAll('_', ' '),
        properties: { ...(catalogItem?.properties || {}), ...(item.properties || {}) }
    };
}
function itemEffects(item) {
    const props = item.properties || {};
    const values = [];
    if (props.hunger_restore) values.push(`сытость +${props.hunger_restore}`);
    if (props.mood_boost) values.push(`настроение +${props.mood_boost}`);
    if (props.rain_resist) values.push('защита от дождя');
    if (props.warmth) values.push(`тепло +${props.warmth}`);
    if (item.item_type === 'toy') values.push('игровой эффект пока не подключён');
    return values.length ? values.join(' · ') : 'эффект не указан';
}
const LOCATION_NAMES = { petrogradka_home: 'дом на Петроградке', showroom_work: 'шоурум', cafe_sloy: 'кафе «Слой»', vkusvill_lenina: 'ВкусВилл на Ленина', bar_rubinsteina: 'бар на Рубинштейна' };
function formatLocation(loc) { if (!loc) return ''; return LOCATION_NAMES[loc] || String(loc).replaceAll('_', ' '); }
function taskSource(row) {
    if (row.invitation) return 'Приглашение';
    if (row.sourceLabel) return row.sourceLabel;
    const raw = String(row.source || row.created_by || row.createdBy || '');
    if (raw === 'GOAP' || raw === 'GOAP_PLANNER') return 'План действий';
    if (raw === 'UTILITY_SELECTOR') return 'План дня';
    if (raw === 'DAILY_ROUTINE') return 'Распорядок';
    if (raw.startsWith('NEEDS_')) return 'Потребность';
    if (row.kind === 'forecast') return 'План дня';
    if (row.kind === 'commitment') return 'Обязательство';
    return row.source || 'Факт';
}
function formatReason(reason) {
    if (!reason) return '';
    const text = String(reason);
    if (text.includes('MAX_DEADLINE_MISSED')) return 'срочный дедлайн';
    if (text.includes('WORK_DEADLINE')) return 'рабочая задача';
    if (text.includes('WORK_REQUEST_CREATED')) return 'запрос по работе';
    if (text.includes('SOCIAL_MEETING_PROPOSED')) return 'предложение встречи';
    if (text.includes('hygiene utility')) return 'гигиена';
    if (text.includes('food utility')) return 'приём пищи';
    if (text.includes('private relief utility')) return 'личный отдых';
    if (text.includes('boredom utility')) return 'досуг';
    if (text.includes('bladder utility')) return 'туалет';
    if (text.includes('sleep utility')) return 'отдых и сон';
    if (text.includes('idle fallback')) return 'свободное время';
    if (text.includes('commitment:')) return text.replace('commitment:', 'по обязательству:').trim();
    if (text.includes('routine:')) return text.replace('routine:', 'по расписанию:').trim();
    return text.replaceAll('_', ' ').toLowerCase();
}
function formatCancelReason(row, staleForecast) {
    if (row.cancelReason) {
        const r = String(row.cancelReason);
        if (r === 'MAX_DEADLINE_MISSED') return 'Лера не успела выполнить до дедлайна';
        if (r === 'TIME_WINDOW_PASSED') return 'Время для задачи прошло';
        if (r === 'DUPLICATE_ACTIVE_ROOT') return 'Заменена более актуальной задачей';
        return r;
    }
    if (staleForecast) return 'План изменился: не успела сделать в отведённое время';
    return 'задача больше не актуальна';
}

async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('AUTH');
    if (!response.ok || data.success === false) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

function Progress({ value, tone = 'blue' }) { return <div className="progress"><i className={`progress-${tone}`} style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} /></div>; }

function ConfirmAction({ title, description, confirmText, onConfirm, children, variant = 'outline', disabled = false, size }) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    async function confirm(event) {
        event.preventDefault();
        setPending(true);
        try {
            const completed = await onConfirm?.();
            if (completed !== false) setOpen(false);
        } finally {
            setPending(false);
        }
    }
    if (disabled) return <Button size={size} variant="outline" disabled aria-disabled="true">{children}</Button>;
    return <AlertDialog.Root open={open} onOpenChange={nextOpen => { if (!pending) setOpen(nextOpen); }}><AlertDialog.Trigger asChild><Button size={size} variant={variant}>{children}</Button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel asChild><Button disabled={pending}>Отмена</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="danger" loading={pending} onClick={confirm}>{pending ? 'Выполняю…' : confirmText || 'Подтвердить'}</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
}

function Toast({ notice, onDismiss }) {
    const isError = notice.kind === 'error';
    const Icon = isError ? CircleAlert : notice.kind === 'info' ? Info : CircleCheck;
    return <div className={cn('toast-v2', `toast-v2-${notice.kind}`)} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}><Icon size={17} aria-hidden="true" /><span>{notice.message}</span><button type="button" className="toast-v2-dismiss" aria-label="Закрыть уведомление" onClick={onDismiss}><X size={16} /></button></div>;
}

function Login({ onLogin }) {
    const [key, setKey] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const keyRef = useRef(null);
    useEffect(() => { if (error) keyRef.current?.focus(); }, [error]);
    async function submit(event) {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ key }) });
            onLogin();
        } catch {
            setError('Не удалось войти. Проверь ключ админки.');
        } finally {
            setLoading(false);
        }
    }
    return <div className="login-screen"><form className="login-box" onSubmit={submit} noValidate><div className="brand-mark">Л</div><div className="eyebrow">RADIANT LERA</div><h1>Дневник Леры</h1><p>Панель наблюдения за жизнью, решениями и диалогами.</p><label className="form-field" htmlFor="admin-key">Ключ админки<input ref={keyRef} id="admin-key" name="admin-key" autoFocus autoComplete="current-password" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder="Введите ключ" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'admin-key-error' : undefined} /></label><Button variant="primary" loading={loading}>{loading ? 'Вхожу…' : 'Войти'}</Button>{error && <div id="admin-key-error" className="error-text" role="alert">{error}</div>}</form></div>;
}

function ProfileCard({ profile }) {
    if (!profile) return null;
    const selectedTime = new Date(profile.at || Date.now()).toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
    const nextMeal = Object.entries(profile.mealWindows || {}).find(([, window]) => window && window.start > selectedTime);
    const nextLabel = nextMeal ? `${nextMeal[0] === 'breakfast' ? 'Завтрак' : nextMeal[0] === 'lunch' ? 'Обед' : 'Ужин'} · ${nextMeal[1]?.start || ''}` : `Сон · ${profile.sleepWindow?.start || '23:00'}`;
    const windows = [
        ['Сон', profile.sleepWindow ? `${profile.sleepWindow.start || '23:00'}–${profile.sleepWindow.end || '07:30'}` : '23:00–07:30'],
        ['Еда', Object.values(profile.mealWindows || {}).map(window => window?.start).filter(Boolean).join(' · ') || 'не указано'],
        [profile.isWorkday ? 'Работа' : 'Отдых', profile.isWorkday ? (profile.workWindows || []).map(window => `${window?.start}–${window?.end}`).join(' · ') : 'гибко в течение дня']
    ];
    return (
        <div className="profile-compact-card">
            <div className="profile-compact-header">
                <div className="profile-compact-title">
                    <span className="eyebrow">Режим дня</span>
                    <strong>{WEEKDAY_NAMES[(profile.weekday || 1) % 7]}, {profile.date}</strong>
                    <Badge variant="blue">{profile.isWorkday ? 'Рабочий день' : 'Выходной'}</Badge>
                </div>
                <div className="profile-compact-status">
                    <span>Сейчас ({selectedTime}): <strong>{profile.timeWindow === 'WORK' ? 'Рабочее время' : profile.timeWindow === 'NIGHT_SLEEP' ? 'Ночной сон' : profile.timeWindow === 'EVENING' ? 'Вечер' : 'Утро и бытовые дела'}</strong></span>
                    <small>Ближайшее окно: {nextLabel}</small>
                </div>
            </div>
            <div className="routine-strip profile-compact-strip">
                {windows.map(([label, value]) => (
                    <div className="routine-chip" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StatCard({ label, value, detail, icon: Icon, tone = 'blue' }) { return <Card className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={17} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></Card>; }

const NEED_LABELS = {
    hunger: ['Голод', '0 — сыта, 100 — необходим приём пищи', 'голод', Utensils],
    fatigue: ['Усталость', '0 — полна сил, 100 — необходим сон', 'усталость', Zap],
    boredom: ['Скука', '0 — увлечена, 100 — нужен досуг', 'скука', Sparkles],
    hygiene: ['Свежесть', '100 — чистая, 0 — требуется душ', 'гигиена', Droplets],
    bladder: ['Туалет', '0 — комфортно, 100 — срочно в туалет', 'туалет', CircleAlert],
    horny: ['Влечение', '0 — спокойствие, 100 — романтический импульс', 'личное напряжение', Flame]
};

function getCycleMeta(cycleDay) {
    const day = Math.max(1, Math.min(28, Math.round(Number(cycleDay || 3))));
    if (day <= 5) return { day, phase: 'Менструация', hint: 'Спад энергии · Требуется покой', tone: 'red' };
    if (day <= 11) return { day, phase: 'Фолликулярная фаза', hint: 'Подъём сил и активности', tone: 'green' };
    if (day <= 14) return { day, phase: 'Овуляция', hint: 'Пик гормонов и влечения (+2%/тик)', tone: 'purple' };
    if (day <= 22) return { day, phase: 'Лютеиновая фаза', hint: 'Устойчивое состояние', tone: 'blue' };
    return { day, phase: 'ПМС', hint: 'Эмоциональная чувствительность', tone: 'yellow' };
}

function needStatus(key, value) {
    const num = Number(value || 0);
    if (key === 'hygiene') {
        if (num <= 30) return { label: 'Срочно нужен душ', valueText: `${num}/100`, tone: 'red' };
        if (num <= 60) return { label: 'Умеренная свежесть', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Чистая и свежая', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'fatigue') {
        if (num >= 80) return { label: 'Критический сон', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Заметная усталость', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Полна сил', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'hunger') {
        if (num >= 80) return { label: 'Сильный голод', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Пора перекусить', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Сыта', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'boredom') {
        if (num >= 80) return { label: 'Сильная скука', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Нужен новый стимул', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Увлечена', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'bladder') {
        if (num >= 80) return { label: 'Срочно в туалет', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Есть потребность', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Комфортно', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'horny') {
        if (num >= 80) return { label: 'Высокое напряжение', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Заметный импульс', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Спокойно', valueText: `${num}/100`, tone: 'green' };
    }
    return { label: `${num}/100`, valueText: `${num}/100`, tone: 'blue' };
}

function NeedsPanel({ state, profile, activeTask, health, rationale }) {
    const needs = state?.needs || {};
    const entries = Object.entries(NEED_LABELS).map(([key, [label, hint, shortName, IconComponent]]) => ({
        key, label, hint, shortName, IconComponent: IconComponent || Sparkles,
        value: Number(needs[key] ?? (key === 'hygiene' ? 100 : 0)),
        status: needStatus(key, needs[key] ?? (key === 'hygiene' ? 100 : 0))
    }));
    const attention = entries.filter(item => (item.key === 'hygiene' ? item.value <= 30 : item.value >= 70));
    const influence = [...entries].sort((a, b) => (b.key === 'hygiene' ? 100 - b.value : b.value) - (a.key === 'hygiene' ? 100 - a.value : a.value)).slice(0, 3);
    const mood = Number(state?.mood ?? 0);
    const moodLabel = mood >= 70 ? 'хорошее настроение' : mood >= 45 ? 'спокойное состояние' : mood >= 25 ? 'напряжённое состояние' : 'тяжёлое состояние';
    const cycleDay = Number(state?.physiology?.cycle_day ?? 3);
    const cycleMeta = getCycleMeta(cycleDay);

    return (
        <Card className="needs-card bento-needs-card ui-card-frameless">
            <CardHeader eyebrow="Состояние Леры" title="Потребности и Цикл Леры" description="Физиологические нужды, менструальный цикл, эмоциональный фон и финансы." />
            <ProfileCard profile={profile} />
            <div className="needs-compact-grid">
                {entries.map(item => {
                    const IconComp = item.IconComponent;
                    const critical = item.status.tone === 'red';
                    const warning = item.status.tone === 'yellow';
                    const toneClass = critical ? 'need-icon-critical' : warning ? 'need-icon-warning' : 'need-icon-good';
                    const barTone = item.key === 'hygiene' ? (critical ? 'red' : warning ? 'yellow' : 'green') : (critical ? 'red' : warning ? 'yellow' : 'purple');
                    return (
                        <div className={cn('need-compact-item', `need-${item.key}`, critical && 'need-compact-critical')} key={item.key} title={item.hint}>
                            <div className="need-compact-head">
                                <div className="need-title-group">
                                    <span className={cn('need-icon-badge', toneClass)}><IconComp size={13} /></span>
                                    <strong>{item.label}</strong>
                                </div>
                            </div>
                            <div className="need-compact-foot">
                                <div className={cn('need-status', `need-status-${item.status.tone}`)}><span>{item.status.label}</span><em>{item.value}%</em></div>
                                <Progress value={item.value} tone={barTone} />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bento-needs-layout needs-overview">
                <div className="bento-left">
                    <div className="bento-stat-card bento-location-card">
                        <div className="bento-stat-header">
                            <span className="bento-icon bento-icon-blue"><MapPin size={18} /></span>
                            <span>Текущее местоположение</span>
                        </div>
                        <strong className="bento-location-name">{formatLocation(state?.location_name) || state?.location_name || 'дом на Петроградке'}</strong>
                        <span className="bento-location-sub">Лера находится здесь</span>
                    </div>

                    <div className="bento-stat-row">
                        <div className="bento-stat-card bento-mood">
                            <div className="bento-stat-header">
                                <span className="bento-icon bento-icon-purple"><HeartPulse size={15} /></span>
                                <span>Настроение</span>
                            </div>
                            <strong>{mood}/100</strong>
                            <small>{moodLabel}</small>
                        </div>

                        <div className="bento-stat-card">
                            <div className="bento-stat-header">
                                <span className="bento-icon bento-icon-yellow"><Wallet size={15} /></span>
                                <span>Деньги</span>
                            </div>
                            <strong>{Number(state?.wallet_rubles || 0).toLocaleString('ru-RU')} ₽</strong>
                        </div>
                    </div>

                    <div className="bento-stat-card bento-cycle-card">
                        <div className="bento-stat-header">
                            <span className="bento-icon bento-icon-pink"><Calendar size={15} /></span>
                            <span>Трекер цикла</span>
                            <Badge variant={cycleMeta.tone} style={{ marginLeft: 'auto' }}>{cycleMeta.phase}</Badge>
                        </div>
                        <div className="bento-cycle-head">
                            <strong>День {cycleMeta.day} из 28</strong>
                            <small>{cycleMeta.hint}</small>
                        </div>
                        <div className="bento-cycle-bar">
                            <div className="bento-cycle-progress" style={{ width: `${(cycleMeta.day / 28) * 100}%` }} />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function useInventorySnapshot(toast) {
    const [snapshot, setSnapshot] = useState({ inventory: [], catalog: [], activity: [], loading: true });
    const refresh = async () => {
        try {
            const result = await api('/api/admin/inventory');
            setSnapshot({ inventory: result.inventory || [], catalog: result.catalog || [], activity: result.activity || [], loading: false });
            return result;
        } catch (error) {
            setSnapshot(current => ({ ...current, loading: false }));
            if (toast) toast(error.message, 'error');
            return null;
        }
    };
    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, 20000);
        return () => clearInterval(timer);
    }, []);
    return { ...snapshot, refresh };
}

function InventoryWidget({ state, weather, onOpenInventory, toast }) {
    const { inventory, catalog, loading } = useInventorySnapshot(toast);
    const items = inventory.map(item => itemMeta(item, catalog));
    const foodServings = items.filter(item => item.item_type === 'food' && Number(item.quantity) > 0).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const outfit = items.filter(item => item.item_type === 'clothes' && item.is_equipped && Number(item.quantity) > 0);
    const rainProtected = outfit.some(item => item.properties?.rain_resist === true);
    const hunger = Number(state?.needs?.hunger || 0);
    const alerts = [
        hunger >= 50 && foodServings === 0 ? { tone: 'red', text: 'Голод растёт, а еды дома нет — движку понадобится магазин или помощь Насти.' } : null,
        weather?.is_raining && !rainProtected ? { tone: 'yellow', text: 'На улице дождь, а защиты от него нет.' } : null
    ].filter(Boolean);

    return (
        <Card className="inventory-widget">
            <div className="inventory-widget-head">
                <div>
                    <div className="eyebrow">Контекст следующего шага</div>
                    <h2><Backpack size={18} /> Рюкзак Леры</h2>
                    <p>{loading ? 'Проверяю, что у Леры с собой…' : 'Наряд, защита от дождя и запас еды.'}</p>
                </div>
                <div className="inventory-widget-actions">
                    <Button size="sm" variant="primary" onClick={onOpenInventory}>Открыть рюкзак <ArrowRight size={14} /></Button>
                </div>
            </div>
            <div className="inventory-widget-grid">
                <div className="inventory-widget-stat">
                    <span className="inventory-stat-icon"><Shirt size={17} /></span>
                    <div><span>Наряд</span><strong>{outfit.length ? outfit.map(item => item.name).join(' · ') : 'Не выбран'}</strong><small>{rainProtected ? 'Есть защита от дождя' : 'Защиты от дождя нет'}</small></div>
                </div>
                <div className="inventory-widget-stat">
                    <span className="inventory-stat-icon inventory-stat-food"><Utensils size={17} /></span>
                    <div><span>Запас еды</span><strong>{foodServings ? `${foodServings} ${foodServings === 1 ? 'порция' : 'порции'}` : 'Нет запасов'}</strong><small>{foodServings ? `Хватит на ${foodServings} ${foodServings === 1 ? 'приём' : 'приёма'} пищи` : 'Нужно пополнить запасы'}</small></div>
                </div>
            </div>
            {alerts.length > 0 && <div className="inventory-alerts">{alerts.map(alert => <div className={cn('inventory-alert', `inventory-alert-${alert.tone}`)} key={alert.text}><CircleAlert size={15} /> {alert.text}</div>)}</div>}
        </Card>
    );
}

function InventoryPanel({ state, weather, toast }) {
    const { inventory, catalog, activity, loading, refresh } = useInventorySnapshot(toast);
    const [section, setSection] = useState('carried');
    const items = inventory.map(item => itemMeta(item, catalog));
    const clothing = items.filter(item => item.item_type === 'clothes');
    const stock = items.filter(item => item.item_type !== 'clothes');
    const foodServings = items.filter(item => item.item_type === 'food' && Number(item.quantity) > 0).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const rainProtected = clothing.some(item => item.is_equipped && Number(item.quantity) > 0 && item.properties?.rain_resist === true);
    const hunger = Number(state?.needs?.hunger || 0);

    async function changeOutfit(item, equipped) {
        try {
            await api(`/api/admin/inventory/${equipped ? 'unequip' : 'equip'}`, { method: 'POST', body: JSON.stringify({ itemId: item.item_id }) });
            await refresh();
            toast?.(equipped ? 'Вещь снята' : 'Наряд обновлён');
        } catch (error) {
            toast?.(error.message, 'error');
        }
    }

    return (
        <div className="inventory-page">
            <Card className="inventory-hero">
                <CardHeader eyebrow="Инвентарь Леры" title="Рюкзак, гардероб и запасы" description="Показывает только вещи, которые участвуют в её повседневных решениях." action={<Button size="sm" variant="outline" onClick={refresh}><RefreshCw size={14} /> Обновить</Button>} />
                <div className="inventory-summary">
                    <div><span><Utensils size={15} /> Еда</span><strong>{foodServings ? `${foodServings} порц.` : 'Нет'}</strong><small>{foodServings ? `хватит на ${foodServings} приёма пищи` : 'для еды нужен магазин или помощь Насти'}</small></div>
                    <div><span><Umbrella size={15} /> Дождь</span><strong>{rainProtected ? 'Защита есть' : 'Защиты нет'}</strong><small>{weather?.is_raining ? 'сейчас идёт дождь' : 'дождя сейчас нет'}</small></div>
                    <div><span><HeartPulse size={15} /> Голод</span><strong>{hunger}/100</strong><small>{hunger >= 50 && !foodServings ? 'нужно пополнить еду' : 'запасы проверены'}</small></div>
                </div>
            </Card>

            <div className="inventory-section-tabs" role="tablist" aria-label="Разделы рюкзака">
                <Button size="sm" variant={section === 'carried' ? 'primary' : 'outline'} onClick={() => setSection('carried')}>С собой</Button>
                <Button size="sm" variant={section === 'stock' ? 'primary' : 'outline'} onClick={() => setSection('stock')}>Запасы</Button>
            </div>

            {section === 'carried' && <Card className="inventory-section-card">
                <CardHeader eyebrow="Гардероб" title="Что Лера носит сейчас" description="Наряд влияет на поездки: защита от дождя предотвращает мокрую одежду и раздражение." />
                <div className="inventory-items-grid">
                    {clothing.map(item => (
                        <article className={cn('inventory-item-card', item.is_equipped && 'inventory-item-equipped', Number(item.quantity) <= 0 && 'inventory-item-empty')} key={item.item_id}>
                            <div className="inventory-item-icon"><Shirt size={20} /></div>
                            <div className="inventory-item-topline"><Badge variant={item.is_equipped ? 'green' : 'muted'}>{item.is_equipped ? 'Надето' : 'В гардеробе'}</Badge><span>слот: {item.properties?.slot || 'верх'}</span></div>
                            <h3>{item.name}</h3>
                            <p>{itemEffects(item)}</p>
                            <div className="inventory-item-foot"><span>{Number(item.quantity) > 0 ? `в наличии: ${item.quantity}` : 'Нет в наличии'}</span>{item.is_equipped ? <Button size="sm" variant="outline" onClick={() => changeOutfit(item, true)}>Снять</Button> : <Button size="sm" variant="primary" disabled={Number(item.quantity) <= 0} onClick={() => changeOutfit(item, false)}>Надеть</Button>}</div>
                        </article>
                    ))}
                    {!loading && clothing.length === 0 && <div className="empty-state">В гардеробе пока нет одежды.</div>}
                </div>
            </Card>}

            {section === 'stock' && <div className="inventory-stock-layout">
                <Card className="inventory-section-card">
                    <CardHeader eyebrow="Запасы дома" title="Еда и личные вещи" description="Еда списывается движком после фактически завершённого приёма пищи." />
                    <div className="inventory-stock-list">
                        {stock.map(item => (
                            <div className="inventory-stock-row" key={item.item_id}>
                                <span className="inventory-item-icon">{item.item_type === 'food' ? <Utensils size={18} /> : <Package size={18} />}</span>
                                <div><strong>{item.name}</strong><span>{itemEffects(item)}</span>{item.item_type === 'toy' && <small><Info size={12} /> Это сохранённая вещь: отдельного игрового действия для неё пока нет.</small>}</div>
                                <Badge variant={Number(item.quantity) > 0 ? 'blue' : 'muted'}>{Number(item.quantity) > 0 ? `${item.quantity} шт.` : 'Нет'}</Badge>
                            </div>
                        ))}
                        {!loading && stock.length === 0 && <div className="empty-state">Запасы пока пусты.</div>}
                    </div>
                </Card>
                <Card className="inventory-activity-card">
                    <CardHeader eyebrow="История движка" title="Автоматические изменения" description="Только события, зафиксированные после действий Леры." />
                    <div className="inventory-activity-list">
                        {activity.length ? activity.map((entry, index) => {
                            const meta = itemMeta({ item_id: entry.itemId, item_type: entry.type === 'consumed' ? 'food' : '' }, catalog);
                            const label = entry.type === 'consumed' ? `Съела: ${meta.name}` : entry.type === 'added' ? `Купила: ${meta.name}` : entry.type === 'received' ? `Получила: ${meta.name}` : `Надела: ${meta.name}`;
                            return <div className="inventory-activity-row" key={`${entry.at}-${entry.itemId}-${index}`}><span>{entry.type === 'consumed' ? <CircleCheck size={15} /> : <Package size={15} />}</span><div><strong>{label}</strong><small>{entry.taskType ? taskName(entry.taskType) : 'изменение инвентаря'} · {entry.at ? formatTime(entry.at) : 'время не указано'}</small></div></div>;
                        }) : <div className="empty-state">Автоматических изменений ещё не было.</div>}
                    </div>
                </Card>
            </div>}
        </div>
    );
}

function TaskCard({ row, column, clockAt, rationale, onSelectTask }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const type = rowTaskType(row);
    const label = row.label || taskName(type);
    const start = row.planned_start || row.start;
    const startAt = start ? new Date(start).getTime() : null;
    const referenceNow = clockAt ? new Date(clockAt).getTime() : now;
    const isSameDay = clockAt && startAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(startAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(clockAt)) : false;
    const untilStart = isSameDay && startAt ? Math.ceil((startAt - referenceNow) / 60000) : null;
    const remainingSnapshot = column === 'active' ? Number(row.remaining_minutes ?? row.remainingMinutes ?? 0) : null;
    const elapsedSinceSnapshot = column === 'active' && clockAt ? Math.max(0, (now - new Date(clockAt).getTime()) / 60000) : 0;
    const remaining = column === 'active' ? Math.max(0, remainingSnapshot - elapsedSinceSnapshot) : null;
    const duration = column === 'active' ? Number(row.duration_minutes ?? row.durationMinutes ?? 0) : 0;
    const progress = column === 'active' && duration > 0 ? Math.max(Number(row.progress_percent ?? row.progressPercent ?? 0), Math.min(100, ((duration - remaining) / duration) * 100)) : null;
    const isOverdue = column === 'planned' && row.overdue;
    const staleForecast = column === 'planned' && row.kind === 'forecast' && untilStart !== null && untilStart < 0;
    const endLabel = column === 'done' ? `Завершено в ${row.occurredAt ? formatTime(row.occurredAt) : row.start ? formatTime(row.start) : 'течение дня'}` : column === 'active' ? `Завершится через ${formatCountdown(remaining)}` : isOverdue ? `Просрочено с ${start ? formatTime(start) : 'начала дня'}` : staleForecast ? 'План изменился: не успела сделать' : untilStart !== null && untilStart > 0 ? `Начнётся через ${formatCountdown(untilStart)}` : untilStart !== null ? 'Должна начаться сейчас' : `Начало: ${start ? formatTime(start) : 'время не указано'}`;
    const inviter = row.invitation ? <span className={`task-inviter task-inviter-${row.inviterTone || 'blue'}`}>{row.inviter}</span> : null;
    const source = row.invitation ? 'Приглашение' : taskSource(row);
    const reasonText = formatReason(row.reason);
    const locText = formatLocation(row.target_location || row.targetLocation);
    const plannedMeta = reasonText ? `${source.toLowerCase()}: ${reasonText}` : source.toLowerCase();

    const validRationale = (rationale || []).filter(item => !['TASK_ADVANCE_SKIPPED', 'QUEUE_REPAIR'].includes(item.category));
    const lastRationale = validRationale.at(-1);
    const decisionReason = formatDecisionReason(lastRationale, type);
    const handleClick = () => { if (onSelectTask) onSelectTask(row); };

    if (column === 'active') {
        return (
            <article className="kanban-item kanban-item-active" onClick={handleClick}>
                <div className="task-card-title"><strong>{label}</strong></div>
                <span className="task-card-time">{endLabel}</span>
                <Progress value={progress} tone="blue" />
                <small className="task-card-reason">причина: {decisionReason}</small>
                <small className="task-card-location">{locText ? `локация: ${locText}` : 'локация не указана'}</small>
            </article>
        );
    }

    if (column === 'done') {
        return <article className="kanban-item kanban-item-done" onClick={handleClick}><div className="task-card-title"><strong>{label}</strong></div><span className="task-card-time">{endLabel}</span></article>;
    }

    if (column === 'cancelled') {
        return <article className={cn('kanban-item', 'kanban-item-cancelled', row.invitation && 'kanban-invitation')} onClick={handleClick}>{inviter}<div className="task-card-title"><strong>{label}</strong></div><small>причина: {formatCancelReason(row, staleForecast)}</small></article>;
    }

    return <article className={cn('kanban-item', 'kanban-item-planned', (isOverdue || staleForecast) && 'kanban-item-overdue', row.invitation && 'kanban-invitation')} onClick={handleClick}><div className="task-card-title"><strong>{label}</strong></div><span className="task-card-time">{endLabel}</span><small>{plannedMeta}</small></article>;
}

function TaskDetailModal({ task, onClose, health, state, rationale = [] }) {
    if (!task) return null;
    const type = rowTaskType(task);
    const label = task.label || taskName(type);
    const validRationale = (rationale || []).filter(item => !['TASK_ADVANCE_SKIPPED', 'QUEUE_REPAIR'].includes(item.category));
    const lastRationale = validRationale.at(-1);
    const decisionReason = formatDecisionReason(lastRationale, type);
    const willingness = Number(health?.state?.willingness ?? health?.willingness?.value ?? 0);
    const willingnessNote = willingness <= 15 ? 'истощение' : willingness <= 50 ? 'умеренный ресурс' : 'высокий ресурс';
    const sharpNeeds = Object.entries(state?.needs || {}).filter(([key, value]) => (key === 'hygiene' ? Number(value) <= 30 : Number(value) >= 70)).map(([key]) => NEED_LABELS[key]?.[0] || key);
    const locText = formatLocation(task.target_location || task.targetLocation) || state?.location_name || 'дом на Петроградке';

    return (
        <AlertDialog.Root open={Boolean(task)} onOpenChange={open => !open && onClose()}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="dialog-overlay" />
                <AlertDialog.Content className="dialog-content task-detail-dialog">
                    <div className="task-detail-header">
                        <div className="task-detail-title-group">
                            <span className="bento-icon bento-icon-blue"><Sparkles size={16} /></span>
                            <div>
                                <AlertDialog.Title className="task-detail-title">{label}</AlertDialog.Title>
                                <span className="task-detail-subtitle">{taskSource(task)} · {locText}</span>
                            </div>
                        </div>
                        <Badge variant={task.status === 'IN_PROGRESS' ? 'blue' : task.status === 'COMPLETED' ? 'green' : 'yellow'}>
                            {task.status || 'В процессе'}
                        </Badge>
                    </div>

                    <AlertDialog.Description className="task-detail-body">
                        <div className="task-detail-section">
                            <strong>Причина выборки / Мотивация</strong>
                            <p>{decisionReason}</p>
                        </div>

                        <div className="task-detail-grid">
                            <div><span>Состояние потребностей</span><strong>{sharpNeeds.length ? sharpNeeds.join(', ') : 'В норме'}</strong></div>
                            <div><span>Ресурс Леры</span><strong>{willingness}% ({willingnessNote})</strong></div>
                            <div><span>Локация</span><strong>{locText}</strong></div>
                        </div>

                        <details className="task-detail-tech">
                            <summary>Техническая информация задачи</summary>
                            <pre>{JSON.stringify(task, null, 2)}</pre>
                        </details>
                    </AlertDialog.Description>

                    <div className="dialog-actions">
                        <AlertDialog.Cancel asChild>
                            <Button variant="primary" onClick={onClose}>Закрыть</Button>
                        </AlertDialog.Cancel>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}

function Timeline({ items }) {
    return <div className="timeline">{items?.length ? items.map(item => <article className="timeline-item" key={`${item.id}-${item.at}`}><div className={cn('timeline-dot', item.type === 'RANDOM_EVENT' && 'dot-yellow', item.type === 'COMMITMENT_MISSED' && 'dot-red')} /><time>{formatTime(item.at)}</time><div className="timeline-content"><strong>{item.title || eventName(item.type)}</strong><span>{item.source}</span><details><summary>Технические данные</summary><pre>{JSON.stringify(item.payload || {}, null, 2)}</pre></details></div></article>) : <div className="empty-state">За этот день ещё нет подтверждённых событий.</div>}</div>;
}

function DaySummary({ summary }) {
    if (!summary) return null;
    const rows = [['Работа', `${Math.round(summary.workMinutes || 0)} мин`], ['Дорога', `${Math.round(summary.travelMinutes || 0)} мин`], ['Сон', `${Math.round(summary.sleepMinutes || 0)} мин`], ['Плановая еда', summary.plannedMeals || 0], ['Аварийная еда', summary.emergencyMeals || 0], ['Пропущенные планы', summary.missedCommitments || 0]];
    return <Card className="day-summary"><CardHeader eyebrow="Итог дня" title="Как прошёл день" description="Короткий срез фактов. Прогноз и намерения сюда не попадают." /><div className="summary-grid">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="summary-footer"><span>Фактов: {summary.facts || 0}</span><span>Случайных событий: {summary.randomEvents || 0}</span><span>Настроение: {summary.finalMood ?? '—'}/100</span></div></Card>;
}

function isStaleForecast(row, clockAt) {
    if (!row || row.kind !== 'forecast') return false;
    const start = row.planned_start || row.start;
    if (!start || !clockAt) return false;
    const startAt = new Date(start).getTime();
    const referenceNow = new Date(clockAt).getTime();
    const isSameDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(startAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(referenceNow));
    return isSameDay && Math.ceil((startAt - referenceNow) / 60000) < 0;
}

function KanbanBoard({ schedule = [], activeTask = null, clockAt = null, health, state, rationale }) {
    const [selectedTask, setSelectedTask] = useState(null);
    const facts = schedule.filter(row => row.kind === 'fact');
    const scheduleActive = schedule.filter(row => ['IN_PROGRESS', 'IN_TRANSIT'].includes(row.status));
    const activeType = activeTask?.task_type || activeTask?.taskType;
    const fallbackActive = activeType ? [{ ...activeTask, label: taskName(activeType), kind: 'active', status: 'IN_PROGRESS', taskType: activeType }] : [];
    const inProgress = scheduleActive.length > 0 ? scheduleActive : fallbackActive;
    const isCancelledRow = row => Boolean(row.cancelReason || row.overdue || isStaleForecast(row, clockAt));
    const planned = schedule.filter(row => ['forecast', 'commitment'].includes(row.kind) && !row.matchedFact && !isCancelledRow(row) && row.taskType !== 'IDLE_HOME_REST');
    const cancelled = schedule.filter(row => ['forecast', 'commitment'].includes(row.kind) && !row.matchedFact && isCancelledRow(row));
    const columns = [
        ['planned', 'Предстоит', planned, 'Живые планы и приглашения'],
        ['active', 'В процессе', inProgress, 'Что Лера делает прямо сейчас'],
        ['done', 'Сделано', facts, 'План и подтверждённый результат'],
        ['cancelled', 'Отменено', cancelled, 'Не произошло или больше не актуально']
    ];
    return (
        <Card className="kanban-card ui-card-frameless">
            <CardHeader eyebrow="Жизнь задач" title="Что происходит с планами" description="Каждая карточка проходит путь от приглашения или плана к выполнению, факту или понятной причине отмены." />
            <div className="kanban-board">
                {columns.map(([key, title, rows, hint]) => (
                    <section className={`kanban-column kanban-${key}`} key={key}>
                        <div className="kanban-column-head">
                            <div><strong>{title}</strong><span>{hint}</span></div>
                            <span className="kanban-count" aria-label={`${rows.length} задач`}>{rows.length}</span>
                        </div>
                        <div className="kanban-list">
                            {rows.length ? rows.map((row, index) => (
                                <TaskCard row={row} column={key} clockAt={clockAt} rationale={rationale} onSelectTask={setSelectedTask} key={row.id || `${key}-${row.label}-${index}`} />
                            )) : <div className="kanban-empty">{key === 'active' ? 'Сейчас Лера свободна. Движок ещё не выбрал следующую задачу.' : 'Пока пусто'}</div>}
                        </div>
                    </section>
                ))}
            </div>
            <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} health={health} state={state} rationale={rationale} />
        </Card>
    );
}

function formatDecisionReason(item, taskType) {
    if (taskType === 'SLEEP_EXHAUSTED') return 'Экстренное восстановление сил: критическая усталость (100/100).';
    if (taskType === 'SHOWER_HOME') return 'Гигиеническая процедура: необходимо принять душ.';
    if (taskType === 'EMERGENCY_EAT') return 'Аварийная еда: критический уровень голода.';
    if (!item) return 'Режим дня, потребности и текущий статус планов.';
    if (item.category === 'UTILITY_SELECTOR') return item.explanation || 'Выбрано движком по приоритету потребностей.';
    if (item.category === 'DAILY_ROUTINE') return item.explanation || 'Плановый шаг по расписанию дня.';
    if (item.category === 'GOAP_PLANNER') return item.explanation || 'Шаг цепочки выполнения цели.';
    if (item.category === 'INTERRUPT') return item.explanation || 'Экстренное прерывание по физиологии.';
    return item.explanation && !item.explanation.includes('TASK_ADVANCE_SKIPPED') ? item.explanation : 'Режим дня и текущие потребности.';
}

function CurrentDecision({ activeTask, health, state, rationale = [] }) {
    const current = activeTask?.task_type || activeTask?.taskType || 'Свободна';
    const sharpNeeds = Object.entries(state?.needs || {}).filter(([key, value]) => (key === 'hygiene' ? Number(value) <= 30 : Number(value) >= 70)).map(([key]) => NEED_LABELS[key]?.[0] || key);
    const validRationale = rationale.filter(item => !['TASK_ADVANCE_SKIPPED', 'QUEUE_REPAIR'].includes(item.category));
    const lastRationale = validRationale.at(-1);
    const reasonText = formatDecisionReason(lastRationale, current);
    const willingness = Number(health?.state?.willingness ?? health?.willingness?.value ?? 0);
    const willingnessNote = willingness <= 15 ? 'истощение' : willingness <= 50 ? 'умеренный ресурс' : 'высокий ресурс';

    return (
        <div className="bento-stat-card decision-compact-card">
            <div className="decision-compact-head">
                <div className="decision-title-group">
                    <span className="bento-icon bento-icon-blue"><Sparkles size={14} /></span>
                    <strong className="decision-task-name">{taskName(current)}</strong>
                </div>
                <span>сейчас выбрана</span>
            </div>
            <i className="decision-symbol" aria-hidden="true">=</i>
            <div className="decision-compact-body">
                <div className="decision-row-main">
                    <div className="decision-pill"><strong>{sharpNeeds.length ? sharpNeeds.join(', ') : 'в норме'}</strong><span>потребности</span></div>
                    <i className="decision-symbol" aria-hidden="true">+</i>
                    <div className="decision-pill"><strong>{willingness}% ({willingnessNote})</strong><span>ресурс</span></div>
                </div>
                <div className="decision-row-sub">
                    <div className="decision-pill decision-pill-reason"><strong>{reasonText}</strong><span>система</span></div>
                </div>
            </div>
        </div>
    );
}

function TimelineFilters({ items, onExport }) {
    const [filter, setFilter] = useState('ALL');
    const filters = [['ALL', 'Все'], ['TASK_COMPLETED', 'Действия'], ['INTERRUPT_ACCEPTED', 'Прерывания'], ['RANDOM_EVENT', 'Случайные'], ['WORK_REQUEST_CREATED', 'NPC'], ['COMMITMENT_MISSED', 'Пропуски']];
    const filtered = filter === 'ALL' ? items : items.filter(item => item.type === filter);
    return <><div className="filter-row">{filters.map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? 'primary' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}<Button size="sm" className="filter-export" onClick={() => onExport(filtered)}><FileText size={14} /> Экспорт</Button></div><Timeline items={filtered} /></>;
}

function NpcPanel({ timeline }) {
    const npcs = [{ id: 'nastya', name: 'Настя', role: 'подруга', color: 'pink' }, { id: 'max', name: 'Макс', role: 'клиент', color: 'blue' }];
    return <Card><CardHeader eyebrow="NPC" title="Люди вокруг Леры" description="Сигналы и события, которые повлияли на день." /><div className="npc-list">{npcs.map(npc => { const events = timeline.filter(item => (npc.id === 'max' ? item.type.includes('WORK') || item.source.includes('MAX') : item.type.includes('SOCIAL') || item.source.includes('NASTYA'))); return <div className="npc-card" key={npc.id}><div className={`npc-avatar npc-${npc.color}`}>{npc.name[0]}</div><div><strong>{npc.name}</strong><span>{npc.role}</span><small>{events.length ? `${events.length} сигналов за день` : 'Сигналов нет'}</small></div></div>; })}</div></Card>;
}

function RandomEventLab({ day }) {
    const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
    async function load() { setLoading(true); try { setData(await api(`/api/admin/radiant/random-events?at=${encodeURIComponent(`${day}T18:00:00+03:00`)}`)); } finally { setLoading(false); } }
    useEffect(() => { load(); }, [day]);
    return <Card><CardHeader eyebrow="Random Event Lab" title="Почему событие сработает или не сработает" description="Условия, окно, cooldown и последствия. Здесь ничего не запускается." action={<Button size="icon" aria-label="Обновить random events" onClick={load}><RefreshCw size={15} /></Button>} />{loading ? <div className="empty-state">Проверяю условия…</div> : <div className="random-list">{data?.events?.map(event => <div className="random-card" key={event.id}><div><div className="random-title"><strong>{event.title}</strong><Badge variant={event.eligible ? 'green' : 'muted'}>{event.eligible ? 'доступно' : 'заблокировано'}</Badge></div><span>{event.id} · вероятность {Math.round(event.probability * 100)}% · cooldown {event.cooldownMinutes} мин</span><small>{event.reason}</small></div><div className="checks">{[['Окно', event.checks.inWindow], ['Условие', event.checks.condition], ['Cooldown', !event.checks.cooldownActive]].map(([label, ok]) => <Badge key={label} variant={ok ? 'green' : 'red'}>{label}: {ok ? 'да' : 'нет'}</Badge>)}</div></div>) || <div className="empty-state">Каталог не загрузился.</div>}</div>}</Card>;
}

function PersonalityLab({ data, toast }) {
    const [selected, setSelected] = useState(null); const [traits, setTraits] = useState(data?.personality || {}); const [saving, setSaving] = useState(false);
    useEffect(() => setTraits(data?.personality || {}), [data?.personality]);
    async function save() { setSaving(true); try { await api('/api/admin/personality', { method: 'POST', body: JSON.stringify({ personality: traits }) }); toast('Характер сохранён'); } finally { setSaving(false); } }
    return <Card><CardHeader eyebrow="Personality Lab" title="Характер и влияние на выбор" description="Измени черту, посмотри preview utility и сохрани. Изменение попадёт в audit." action={<Button variant="primary" onClick={save}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button>} /><div className="traits traits-lab">{Object.entries(traits).map(([key, value]) => <button key={key} className={cn('trait-row', selected === key && 'selected')} onClick={() => setSelected(key)}><div><span>{key}</span><strong>{value}</strong></div><input aria-label={key} type="range" min="0" max="100" value={value} onChange={event => setTraits({ ...traits, [key]: Number(event.target.value) })} /><Progress value={value} tone="purple" /></button>)}</div><div className="personality-preview"><h3>Влияние на utility</h3>{(data?.personalityPreview || []).map(item => <div key={item.taskType}><span>{taskName(item.taskType)}</span><strong className={item.modifier >= 0 ? 'positive' : 'negative'}>{item.modifier > 0 ? '+' : ''}{Number(item.modifier).toFixed(1)}</strong></div>)}</div></Card>;
}

function SimulationLab() {
    const [seed, setSeed] = useState('admin-lab'); const [result, setResult] = useState(null); const [compare, setCompare] = useState(null); const [loading, setLoading] = useState(false); const [start, setStart] = useState('2026-08-07T00:00:00+03:00'); const [discipline, setDiscipline] = useState(55);
    async function run() { setLoading(true); try { const body = { start, hours: 24, seed, personality: { discipline: Number(discipline) } }; const [first, second] = await Promise.all([api('/api/admin/radiant/simulation-lab', { method: 'POST', body: JSON.stringify(body) }), api('/api/admin/radiant/simulation-lab', { method: 'POST', body: JSON.stringify({ ...body, seed: `${seed}-compare` }) })]); setResult(first); setCompare({ first: first.summary, second: second.summary }); } finally { setLoading(false); } }
    const diff = (key) => Number(compare?.first?.[key] || 0) - Number(compare?.second?.[key] || 0);
    return <Card className="simulation-lab"><CardHeader eyebrow="Simulation Lab" title="Сравнить два дня за 24 часа" description="Оба прогона offline. Меняй дату, seed и характер, чтобы понять, что именно изменило жизнь." action={<Button variant="primary" onClick={run}><Play size={14} /> {loading ? 'Считаю…' : 'Запустить сравнение'}</Button>} /><div className="lab-controls"><label>Дата и время старта<input value={start} onChange={event => setStart(event.target.value)} /></label><label>Seed<input value={seed} onChange={event => setSeed(event.target.value)} /></label><label>Дисциплина<input type="number" min="0" max="100" value={discipline} onChange={event => setDiscipline(event.target.value)} /></label><Badge variant="green">writes: 0</Badge><Badge variant="green">Telegram: 0</Badge></div>{result && <><div className="summary-grid lab-summary">{[['Сон', result.summary.sleepMinutes + ' мин'], ['Работа', result.summary.workMinutes + ' мин'], ['Еда', result.summary.plannedMeals], ['Emergency', result.summary.emergencyMeals], ['Travel', result.summary.travelMinutes + ' мин'], ['Факты', result.summary.facts]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="compare-table"><div><strong>Метрика</strong><strong>Основной</strong><strong>Сравнение</strong><strong>Разница</strong></div>{['workMinutes','sleepMinutes','plannedMeals','emergencyMeals','travelMinutes','randomEvents','missedCommitments'].map(key => <div key={key}><span>{key}</span><span>{compare.first[key] ?? 0}</span><span>{compare.second[key] ?? 0}</span><strong className={diff(key) === 0 ? '' : diff(key) > 0 ? 'positive' : 'negative'}>{diff(key) > 0 ? '+' : ''}{diff(key)}</strong></div>)}</div><details className="lab-details"><summary>Полный результат основного прогона</summary><pre>{JSON.stringify(result, null, 2)}</pre></details></>}</Card>;
}

function Commitments({ items }) { return <div className="commitment-list">{items?.length ? items.map(item => <div className="commitment" key={item.id}><div className="commitment-main"><Badge variant={item.status === 'MISSED' ? 'red' : item.status === 'COMPLETED' ? 'green' : 'blue'}>{item.status}</Badge><strong>{item.title}</strong><span>{item.origin} · {item.target_location || 'дом'}</span></div><div className="commitment-due"><span>Дедлайн</span><strong>{item.due_at ? formatTime(item.due_at) : '—'}</strong></div></div>) : <div className="empty-state">Активных планов на этот день нет.</div>}</div>; }

function QualityBadge({ log }) { const quality = log?.quality; if (!quality) return <Badge>Проверить</Badge>; return <Badge variant={quality.passed ? 'green' : 'red'}>{quality.passed ? 'Качество: OK' : 'Есть проблема'}</Badge>; }

function PromptModulesEditor({ modules, onChange, definitions, prefix }) {
    return <div className="prompt-modules-grid">
        {definitions.map(([key, label, description], index) => (
            <details className="prompt-module-card" key={key} open={index === 0}>
                <summary>
                    <span className="prompt-module-index">{String(index + 1).padStart(2, '0')}</span>
                    <span>{label}</span>
                    <small>{description}</small>
                </summary>
                <label>
                    <span className="prompt-module-label">{label}<em>{(modules[key] || '').length} знаков</em></span>
                    <textarea
                        value={modules[key] || ''}
                        placeholder={`Добавьте: ${description.toLowerCase()}`}
                        onChange={event => onChange({ ...modules, [key]: event.target.value })}
                    />
                </label>
            </details>
        ))}
    </div>;
}

function PromptAssemblyMap({ channelForm, onChannelChange }) {
    const channel = Boolean(channelForm);
    const [dayContext, setDayContext] = useState('');
    const [contextLoading, setContextLoading] = useState(true);
    async function loadDayContext() {
        setContextLoading(true);
        try {
            const result = await api('/api/admin/prompt-day-context');
            setDayContext(result.context || '');
        } finally {
            setContextLoading(false);
        }
    }
    useEffect(() => { loadDayContext(); }, []);
    const blocks = channel ? [
        ['01', 'Публичный Образ Леры', channelForm.publicProfileEnabled === false ? 'Отключён для канала' : 'Голос, публичный образ и ограничения из единого профиля', 'public-profile'],
        ['02', 'Факты дня · Контекст дня отключён', channelForm.publicFactsEnabled ? 'Передаются только факты, добавленные редактором' : 'Не используются: только настроение и наблюдения', 'public-facts'],
        ['03', 'Правила канала', 'Тема, последние посты и блоки ниже', 'channel']
    ] : [
        ['01', 'Постоянная личность', '7 редактируемых модулей ниже', 'base'],
        ['02', 'Контекст дня', 'Добавляется автоматически для каждого ответа', 'day'],
        ['03', 'Диалог и память', 'История переписки и память конкретного собеседника', 'dialog']
    ];
    return <div className="prompt-assembly">
        <div className="prompt-assembly-head"><div><span className="eyebrow">Как собирается запрос</span><strong>{channel ? 'Публичный prompt канала' : 'Prompt личного ответа'}</strong></div><Badge variant="blue">{channel ? 'перед генерацией' : 'при каждом сообщении'}</Badge></div>
        <div className="prompt-assembly-flow">
            {blocks.map(([number, title, text, kind], index) => <React.Fragment key={title}>
                <div className={cn('prompt-source-card', `prompt-source-${kind}`)}>
                    <span>{number}</span><div><strong>{title}</strong><small>{text}</small></div>
                    {channel && kind === 'public-profile' && <label className="prompt-source-toggle"><input type="checkbox" checked={channelForm.publicProfileEnabled !== false} onChange={event => onChannelChange({ ...channelForm, publicProfileEnabled: event.target.checked })} /> Использовать</label>}
                    {channel && kind === 'public-facts' && <label className="prompt-source-toggle"><input type="checkbox" checked={Boolean(channelForm.publicFactsEnabled)} onChange={event => onChannelChange({ ...channelForm, publicFactsEnabled: event.target.checked })} /> Использовать</label>}
                </div>
                {index < blocks.length - 1 && <ArrowRight className="prompt-flow-arrow" size={16} />}
            </React.Fragment>)}
        </div>
        <div className={cn('prompt-day-preview', channel && 'is-disabled')}>
            <div><span className="eyebrow">Аналитика дня</span><strong>{contextLoading ? 'Собираю аналитику…' : 'Что модель реально получает о дне Леры'}</strong></div>
            <Button size="sm" variant="outline" onClick={loadDayContext} disabled={contextLoading}><RefreshCw size={14} /> Обновить</Button>
            <pre>{channel ? 'Для канала day context отключён. Используются только факты, которые редактор явно добавил в «Публичные факты дня».' : (contextLoading ? 'Загружаю подтверждённые факты, состояние, причины и планы…' : dayContext || 'Аналитика дня пока недоступна.')}</pre>
        </div>
        <p className="prompt-assembly-note">{channel ? 'В канал передаётся только публичная проекция единого профиля, явные публичные факты и история постов канала. Старые inheritLeraPrompt/includeDayContext сохранены только для совместимости API и принудительно выключены. Личная память, переписки, relationship-контекст и observer digest не передаются.' : 'Здесь показан общий контекст дня. Личная память и история добавляются только для того пользователя, который написал Лере; точный состав отправленного запроса доступен во вкладке «Диалоги».'}</p>
    </div>;
}

function formatRelativeTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 30) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays === 1) return `вчера ${formatTime(value)}`;
    return formatDate(value);
}

function copyToClipboard(text, onSuccess) {
    if (!text) return;
    const value = typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(() => onSuccess && onSuccess()).catch(() => {});
    }
}

function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

function getKindBadgeVariant(kind = '') {
    const k = String(kind).toUpperCase();
    if (k.includes('EROTIC')) return 'red';
    if (k.includes('CASUAL') || k.includes('CHAT')) return 'blue';
    if (k.includes('JOKE')) return 'yellow';
    if (k.includes('MEMORY')) return 'purple';
    if (k.includes('CHANNEL') || k.includes('OBSERVER')) return 'green';
    return 'default';
}

function LiveServerLogsTab({ toast }) {
    const [streamLogs, setStreamLogs] = useState([]);
    const [status, setStatus] = useState('connecting');
    const [levelFilter, setLevelFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const terminalBodyRef = useRef(null);
    const eventSourceRef = useRef(null);
    const pausedLogsRef = useRef([]);

    async function loadInitialLogs() {
        try {
            const data = await api('/api/admin/logs?level=');
            if (data?.logs) {
                setStreamLogs(data.logs);
            }
        } catch {
            // Ignore initial load failure
        }
    }

    useEffect(() => {
        loadInitialLogs();

        let es = null;
        try {
            es = new EventSource('/api/admin/logs/stream', { withCredentials: true });
            eventSourceRef.current = es;

            es.onopen = () => {
                setStatus('connected');
            };

            es.onmessage = (event) => {
                if (!event.data) return;
                try {
                    const item = JSON.parse(event.data);
                    if (item.timestamp) {
                        if (isPaused) {
                            pausedLogsRef.current.push(item);
                            if (pausedLogsRef.current.length > 500) pausedLogsRef.current.shift();
                        } else {
                            setStreamLogs(prev => {
                                const next = [...prev, item];
                                if (next.length > 600) next.shift();
                                return next;
                            });
                        }
                    }
                } catch {
                    // Ignore non-json lines or heartbeats
                }
            };

            es.onerror = () => {
                setStatus('disconnected');
            };
        } catch {
            setStatus('disconnected');
        }

        return () => {
            if (es) es.close();
        };
    }, [isPaused]);

    useEffect(() => {
        if (autoScroll && terminalBodyRef.current) {
            terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
        }
    }, [streamLogs, autoScroll]);

    function togglePause() {
        if (isPaused) {
            if (pausedLogsRef.current.length) {
                setStreamLogs(prev => [...prev, ...pausedLogsRef.current].slice(-600));
                pausedLogsRef.current = [];
            }
            setIsPaused(false);
            if (toast) toast('Стрим логов возобновлён');
        } else {
            setIsPaused(true);
            if (toast) toast('Стрим логов на паузе');
        }
    }

    function clearTerminal() {
        setStreamLogs([]);
        pausedLogsRef.current = [];
        if (toast) toast('Консоль очищена');
    }

    function downloadLogs() {
        const text = streamLogs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`).join('\n');
        downloadTextFile(`lera-server-${isoDate(new Date())}.log`, text);
        if (toast) toast('Логи выгружены в файл');
    }

    const filteredLogs = streamLogs.filter(item => {
        if (levelFilter !== 'ALL' && item.type !== levelFilter) return false;
        if (search && !String(item.message || '').toLowerCase().includes(search.toLowerCase()) && !String(item.type || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <Card className="server-terminal-card">
            <CardHeader
                eyebrow="Real-time Server Stream"
                title="Живая консоль сервера"
                description="Поток событий Node.js, Telegram Bot, PostgreSQL, Redis, BullMQ и AI вызовов."
                action={
                    <div className="terminal-actions-bar">
                        <div className={cn('live-stream-badge', status === 'connected' ? (isPaused ? 'is-paused' : 'is-live') : 'is-offline')}>
                            <span className="live-pulse-dot" />
                            <span>{status === 'connected' ? (isPaused ? 'ПАУЗА' : 'LIVE STREAM') : 'ОФФЛАЙН'}</span>
                        </div>
                        <Button size="sm" variant={isPaused ? 'warning' : 'outline'} onClick={togglePause}>
                            {isPaused ? <><Play size={13} /> Возобновить</> : <><Pause size={13} /> Пауза</>}
                        </Button>
                        <Button size="sm" variant={autoScroll ? 'primary' : 'outline'} onClick={() => setAutoScroll(!autoScroll)}>
                            {autoScroll ? 'Автоскролл: ВКЛ' : 'Автоскролл: ВЫКЛ'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={clearTerminal}>
                            <Trash2 size={13} /> Очистить
                        </Button>
                        <Button size="sm" variant="outline" onClick={downloadLogs}>
                            <Download size={13} /> Скачать
                        </Button>
                    </div>
                }
            />

            <div className="terminal-filter-toolbar">
                <div className="terminal-level-tabs">
                    {['ALL', 'INFO', 'WARN', 'ERROR'].map(lvl => (
                        <button
                            key={lvl}
                            className={cn('terminal-filter-btn', levelFilter === lvl && 'is-active', `lvl-${lvl.toLowerCase()}`)}
                            onClick={() => setLevelFilter(lvl)}
                        >
                            {lvl === 'ALL' ? 'Все уровни' : lvl}
                            <span className="count-pill">
                                {lvl === 'ALL' ? streamLogs.length : streamLogs.filter(l => l.type === lvl).length}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="terminal-search-box">
                    <Search size={14} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Поиск по тексту лога..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="clear-search-btn" onClick={() => setSearch('')}>
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            <div className="server-terminal-screen" ref={terminalBodyRef}>
                {filteredLogs.length === 0 ? (
                    <div className="terminal-empty">
                        <Terminal size={26} />
                        <span>{search || levelFilter !== 'ALL' ? 'Нет логов по заданному фильтру' : 'Ожидание новых событий от сервера...'}</span>
                    </div>
                ) : (
                    <div className="terminal-lines-container">
                        {filteredLogs.map((item, idx) => (
                            <div key={item.id || idx} className={cn('terminal-log-line', `line-${(item.type || 'info').toLowerCase()}`)}>
                                <span className="line-num">{idx + 1}</span>
                                <time className="line-time">{item.timestamp ? formatTime(item.timestamp) : '—'}</time>
                                <span className={cn('line-level-badge', `badge-${(item.type || 'info').toLowerCase()}`)}>
                                    {item.type || 'INFO'}
                                </span>
                                <span className="line-message">{item.message}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="terminal-footer-info">
                <span>Буфер: {filteredLogs.length} / {streamLogs.length} событий</span>
                <span>Статус SSE: {status}</span>
            </div>
        </Card>
    );
}

function ErrorsAuditTab({ logs = [], onSelectLog }) {
    const [activeKind, setActiveKind] = useState('ALL');

    const failedLogs = useMemo(() => {
        return logs.filter(log => {
            const hasError = Boolean(log.error_text);
            const gateRefused = log.command_gate_status === 'COMMAND_REFUSED';
            const qualityFailed = log.judge_verdict && !['PASS', 'OK', 'ACCEPT'].includes(log.judge_verdict);
            return hasError || gateRefused || qualityFailed;
        });
    }, [logs]);

    const errorStats = useMemo(() => {
        let llmErrors = 0;
        let gateRefusals = 0;
        let qualityViolations = 0;
        failedLogs.forEach(log => {
            if (log.error_text) llmErrors++;
            if (log.command_gate_status === 'COMMAND_REFUSED') gateRefusals++;
            if (log.judge_verdict && !['PASS', 'OK', 'ACCEPT'].includes(log.judge_verdict)) qualityViolations++;
        });
        return { total: failedLogs.length, llmErrors, gateRefusals, qualityViolations };
    }, [failedLogs]);

    const filtered = failedLogs.filter(log => {
        if (activeKind === 'GATE' && log.command_gate_status !== 'COMMAND_REFUSED') return false;
        if (activeKind === 'LLM' && !log.error_text) return false;
        if (activeKind === 'QUALITY' && (!log.judge_verdict || ['PASS', 'OK', 'ACCEPT'].includes(log.judge_verdict))) return false;
        return true;
    });

    return (
        <div className="errors-audit-layout">
            <div className="errors-kpi-row">
                <div className="error-kpi-card is-total">
                    <AlertTriangle size={18} />
                    <div>
                        <strong>{errorStats.total}</strong>
                        <span>Всего сбоев</span>
                    </div>
                </div>
                <div className="error-kpi-card is-danger">
                    <XCircle size={18} />
                    <div>
                        <strong>{errorStats.llmErrors}</strong>
                        <span>Ошибок LLM API</span>
                    </div>
                </div>
                <div className="error-kpi-card is-warning">
                    <ShieldAlert size={18} />
                    <div>
                        <strong>{errorStats.gateRefusals}</strong>
                        <span>Command Gate Refusals</span>
                    </div>
                </div>
                <div className="error-kpi-card is-purple">
                    <Activity size={18} />
                    <div>
                        <strong>{errorStats.qualityViolations}</strong>
                        <span>Нарушений качества</span>
                    </div>
                </div>
            </div>

            <Card className="errors-list-card">
                <CardHeader
                    eyebrow="Audit & Security"
                    title="Журнал сбоев и отказов"
                    description="Детализированный список запросов с ошибками генерации, блокировками команд и нарушениями поведения."
                    action={
                        <div className="inline-controls">
                            {[['ALL', 'Все'], ['GATE', 'Gate Refusals'], ['LLM', 'LLM Errors'], ['QUALITY', 'Качество']].map(([k, label]) => (
                                <Button
                                    key={k}
                                    size="sm"
                                    variant={activeKind === k ? 'primary' : 'outline'}
                                    onClick={() => setActiveKind(k)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    }
                />

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <CheckCircle2 size={32} style={{ color: 'var(--green)' }} />
                        <strong>Сбоев и критических ошибок не обнаружено</strong>
                        <span>Все последние {logs.length} LLM-запросов выполнены штатно.</span>
                    </div>
                ) : (
                    <div className="errors-items-list">
                        {filtered.map(log => (
                            <div key={log.id} className="error-audit-item" onClick={() => onSelectLog && onSelectLog(log.id)}>
                                <div className="error-audit-header">
                                    <div className="error-audit-title">
                                        {log.command_gate_status === 'COMMAND_REFUSED' && <Badge variant="red">COMMAND REFUSED</Badge>}
                                        {log.error_text && <Badge variant="red">ERROR</Badge>}
                                        {log.judge_verdict && log.judge_verdict !== 'OK' && <Badge variant="yellow">{log.judge_verdict}</Badge>}
                                        <strong>{log.user_text || 'Системный вызов'}</strong>
                                    </div>
                                    <div className="error-audit-meta">
                                        <span>{log.username ? `@${log.username}` : (log.first_name || `User #${log.user_id}`)}</span>
                                        <span>·</span>
                                        <span>{formatRelativeTime(log.created_at)}</span>
                                    </div>
                                </div>
                                {log.command_gate_reason && (
                                    <div className="error-detail-box is-gate">
                                        <strong>Причина отказа гейта:</strong>
                                        <p>{log.command_gate_reason}</p>
                                    </div>
                                )}
                                {log.error_text && (
                                    <div className="error-detail-box is-llm">
                                        <strong>Ошибка LLM:</strong>
                                        <p>{log.error_text}</p>
                                    </div>
                                )}
                                <div className="error-audit-footer">
                                    <span>{log.provider_name || 'LLM'} · {log.model || '—'} · {log.latency_ms || 0} мс</span>
                                    <Button size="sm" variant="outline"><ChevronRight size={13} /> Открыть разбор</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

function SimulationRationaleTab({ toast }) {
    const [traces, setTraces] = useState([]);
    const [loading, setLoading] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [search, setSearch] = useState('');

    async function loadRationale() {
        setLoading(true);
        try {
            const result = await api('/api/admin/radiant/rationale?limit=100');
            setTraces(result.traces || []);
        } catch (e) {
            if (toast) toast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadRationale();
    }, []);

    const categories = useMemo(() => {
        const set = new Set();
        traces.forEach(t => t.category && set.add(t.category));
        return ['ALL', ...Array.from(set)];
    }, [traces]);

    const filtered = traces.filter(t => {
        if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            const inTitle = String(t.title || '').toLowerCase().includes(q);
            const inExp = String(t.explanation || '').toLowerCase().includes(q);
            if (!inTitle && !inExp) return false;
        }
        return true;
    });

    return (
        <Card className="rationale-panel-card">
            <CardHeader
                eyebrow="GOAP & Radiant Engine"
                title="Обоснование решений Леры (Rationale)"
                description="Логи автономного планировщика: почему Лера выбрала определенное действие, как изменились голод, усталость, настроение и планы."
                action={
                    <div className="inline-controls">
                        <Button size="sm" variant="outline" onClick={loadRationale} disabled={loading}>
                            <RefreshCw size={13} className={cn(loading && 'spin-icon')} /> Обновить
                        </Button>
                    </div>
                }
            />

            <div className="terminal-filter-toolbar">
                <div className="terminal-level-tabs">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            className={cn('terminal-filter-btn', categoryFilter === cat && 'is-active')}
                            onClick={() => setCategoryFilter(cat)}
                        >
                            {cat === 'ALL' ? 'Все категории' : cat}
                            <span className="count-pill">
                                {cat === 'ALL' ? traces.length : traces.filter(t => t.category === cat).length}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="terminal-search-box">
                    <Search size={14} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Поиск по решениям и мотивам..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="clear-search-btn" onClick={() => setSearch('')}>
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="empty-state">Загружаю цепочку решений…</div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">Решений по фильтру не найдено.</div>
            ) : (
                <div className="rationale-feed-list">
                    {filtered.map(item => (
                        <div key={item.id} className="rationale-card-item">
                            <div className="rationale-item-head">
                                <div className="rationale-item-badges">
                                    <Badge variant="blue">{item.category || 'DECISION'}</Badge>
                                    <strong>{item.title}</strong>
                                </div>
                                <time className="rationale-time">{formatDate(item.timestamp)}</time>
                            </div>
                            <p className="rationale-explanation">{item.explanation}</p>
                            {item.payload && Object.keys(item.payload).length > 0 && (
                                <details className="rationale-payload-box">
                                    <summary>Параметры и состояние (Payload)</summary>
                                    <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                                </details>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function LogsPanel({ toast }) {
    const [activeTab, setActiveTab] = useState('prompts');
    const [logs, setLogs] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [limit, setLimit] = useState(50);
    const [searchQuery, setSearchQuery] = useState('');
    const [kindFilter, setKindFilter] = useState('ALL');
    const [groupMode, setGroupMode] = useState('timeline');
    const [inspectorTab, setInspectorTab] = useState('overview');
    const [copiedKey, setCopiedKey] = useState(null);

    async function loadLogs() {
        setLoading(true);
        try {
            const data = await api(`/api/admin/prompt-logs?limit=${limit}`);
            setLogs(data.logs || []);
        } finally {
            setLoading(false);
        }
    }

    async function choose(id) {
        try {
            const data = await api(`/api/admin/prompt-logs/${id}`);
            setSelected(data);
            if (activeTab !== 'prompts') {
                setActiveTab('prompts');
            }
        } catch (e) {
            if (toast) toast(e.message, 'error');
        }
    }

    async function judge() {
        if (!selected) return;
        try {
            const result = await api(`/api/admin/prompt-logs/${selected.log.id}/judge`, { method: 'POST' });
            setSelected({ ...selected, quality: result.judge.quality });
            if (toast) toast(result.judge.explanation || 'Качество проверено');
        } catch (e) {
            if (toast) toast(e.message, 'error');
        }
    }

    async function clearChatHistory() {
        try {
            const result = await api('/api/admin/chat-history/clear', { method: 'POST', body: JSON.stringify({}) });
            setLogs([]);
            setSelected(null);
            if (toast) toast(`История очищена: удалено ${result.deleted || 0} сообщений`);
        } catch (error) {
            if (toast) toast(error.message, 'error');
        }
    }

    function handleCopy(text, key) {
        copyToClipboard(text, () => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
            if (toast) toast('Скопировано в буфер обмена');
        });
    }

    useEffect(() => {
        loadLogs();
    }, [limit]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (kindFilter === 'CHAT') {
                const k = String(log.kind || '').toUpperCase();
                if (!['CHAT', 'CASUAL', 'EROTIC', 'JOKE'].includes(k)) return false;
            } else if (kindFilter === 'MEMORY') {
                if (String(log.kind || '').toUpperCase() !== 'MEMORY') return false;
            } else if (kindFilter === 'CHANNEL') {
                const k = String(log.kind || '').toUpperCase();
                if (!k.includes('CHANNEL') && !k.includes('OBSERVER')) return false;
            } else if (kindFilter === 'ERRORS') {
                const hasError = Boolean(log.error_text);
                const gateRefused = log.command_gate_status === 'COMMAND_REFUSED';
                const qualityFailed = log.judge_verdict && !['PASS', 'OK', 'ACCEPT'].includes(log.judge_verdict);
                if (!hasError && !gateRefused && !qualityFailed) return false;
            }

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const text = String(log.user_text || '').toLowerCase();
                const preview = String(log.preview || '').toLowerCase();
                const user = String(log.username || log.first_name || log.user_id || '').toLowerCase();
                const model = String(log.model || '').toLowerCase();
                const kind = String(log.kind || '').toLowerCase();
                if (!text.includes(q) && !preview.includes(q) && !user.includes(q) && !model.includes(q) && !kind.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }, [logs, kindFilter, searchQuery]);

    const usersGrouped = useMemo(() => {
        const groups = {};
        filteredLogs.forEach(log => {
            const key = log.user_id ? String(log.user_id) : 'system';
            if (!groups[key]) {
                groups[key] = {
                    userId: log.user_id,
                    username: log.username,
                    firstName: log.first_name,
                    items: [],
                    lastDate: log.created_at
                };
            }
            groups[key].items.push(log);
        });
        return Object.values(groups).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
    }, [filteredLogs]);

    const failuresCount = useMemo(() => {
        return logs.filter(l => Boolean(l.error_text) || l.command_gate_status === 'COMMAND_REFUSED').length;
    }, [logs]);

    return (
        <div className="super-logs-workspace">
            <div className="logs-main-tab-nav">
                <button
                    className={cn('logs-nav-tab', activeTab === 'prompts' && 'is-active')}
                    onClick={() => setActiveTab('prompts')}
                >
                    <MessageSquare size={15} />
                    <span>Диалоги & LLM</span>
                    <span className="tab-pill">{logs.length}</span>
                </button>

                <button
                    className={cn('logs-nav-tab', activeTab === 'stream' && 'is-active')}
                    onClick={() => setActiveTab('stream')}
                >
                    <Terminal size={15} />
                    <span>Live Терминал Сервера</span>
                    <span className="live-mini-dot" />
                </button>

                <button
                    className={cn('logs-nav-tab', activeTab === 'errors' && 'is-active', failuresCount > 0 && 'has-failures')}
                    onClick={() => setActiveTab('errors')}
                >
                    <AlertTriangle size={15} />
                    <span>Ошибки & Сбои</span>
                    {failuresCount > 0 && <span className="tab-pill is-danger">{failuresCount}</span>}
                </button>

                <button
                    className={cn('logs-nav-tab', activeTab === 'rationale' && 'is-active')}
                    onClick={() => setActiveTab('rationale')}
                >
                    <Cpu size={15} />
                    <span>GOAP & Rationale</span>
                </button>
            </div>

            {activeTab === 'stream' && <LiveServerLogsTab toast={toast} />}
            {activeTab === 'errors' && <ErrorsAuditTab logs={logs} onSelectLog={choose} />}
            {activeTab === 'rationale' && <SimulationRationaleTab toast={toast} />}

            {activeTab === 'prompts' && (
                <div className="llm-super-panel">
                    <div className="logs-toolbar-strip">
                        <div className="logs-search-wrapper">
                            <Search size={14} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Поиск сообщений, @username, модели, ID..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        <div className="logs-kind-chips">
                            {[
                                ['ALL', 'Все'],
                                ['CHAT', '💬 Диалоги'],
                                ['MEMORY', '🧠 Память'],
                                ['CHANNEL', '📢 Канал'],
                                ['ERRORS', '⚠️ Только сбои']
                            ].map(([k, label]) => (
                                <button
                                    key={k}
                                    className={cn('kind-chip-btn', kindFilter === k && 'is-active')}
                                    onClick={() => setKindFilter(k)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="logs-grouping-selector">
                            <span className="group-label">Группировка:</span>
                            <div className="group-buttons">
                                <button
                                    className={cn('group-btn', groupMode === 'timeline' && 'is-active')}
                                    onClick={() => setGroupMode('timeline')}
                                    title="Хронологическая лента"
                                >
                                    <Clock size={13} /> Лента
                                </button>
                                <button
                                    className={cn('group-btn', groupMode === 'users' && 'is-active')}
                                    onClick={() => setGroupMode('users')}
                                    title="Группировка по собеседникам"
                                >
                                    <Users size={13} /> Собеседники
                                </button>
                            </div>
                        </div>

                        <div className="logs-right-actions">
                            <select
                                className="limit-select"
                                value={limit}
                                onChange={e => setLimit(Number(e.target.value))}
                            >
                                <option value={30}>30 записей</option>
                                <option value={50}>50 записей</option>
                                <option value={100}>100 записей</option>
                            </select>

                            <ConfirmAction
                                title="Удалить всю историю диалогов?"
                                description="Будут удалены сообщения всех пользователей из chat_history и conversation_events. Технические prompt-логи останутся."
                                confirmText="Удалить всё"
                                variant="danger"
                                onConfirm={clearChatHistory}
                            >
                                Очистить историю
                            </ConfirmAction>

                            <Button size="icon" aria-label="Обновить логи" onClick={loadLogs} disabled={loading}>
                                <RefreshCw size={14} className={cn(loading && 'spin-icon')} />
                            </Button>
                        </div>
                    </div>

                    <div className="llm-layout-v2">
                        <Card className="llm-list-card">
                            <CardHeader
                                eyebrow="Prompt Stream"
                                title={groupMode === 'users' ? `Пользователи (${usersGrouped.length})` : `Вызовы (${filteredLogs.length})`}
                                description="Сначала выбери сообщение. Технические детали открываются только по запросу. Ключи и секреты скрыты."
                            />
                            <div className="llm-list">
                                {loading ? (
                                    <div className="empty-state">Загружаю логи…</div>
                                ) : filteredLogs.length === 0 ? (
                                    <div className="empty-state">
                                        <Sparkles size={24} />
                                        <span>Логов по текущему фильтру не найдено.</span>
                                    </div>
                                ) : groupMode === 'users' ? (
                                    usersGrouped.map(group => (
                                        <div key={group.userId || 'system'} className="user-dialog-group-card">
                                            <div className="user-group-head">
                                                <div className="user-avatar-circle">
                                                    {group.username ? group.username.charAt(0).toUpperCase() : (group.firstName ? group.firstName.charAt(0).toUpperCase() : 'U')}
                                                </div>
                                                <div className="user-group-info">
                                                    <strong>{group.firstName || group.username ? `${group.firstName || ''} (@${group.username || 'unknown'})` : `User #${group.userId || 'System'}`}</strong>
                                                    <span>{group.items.length} сообщений · {formatRelativeTime(group.lastDate)}</span>
                                                </div>
                                            </div>
                                            <div className="user-group-messages">
                                                {group.items.map(log => (
                                                    <button
                                                        className={cn(
                                                            'llm-row',
                                                            selected?.log?.id === log.id && 'selected',
                                                            log.command_gate_status === 'COMMAND_REFUSED' && 'is-refused',
                                                            log.error_text && 'is-error'
                                                        )}
                                                        onClick={() => choose(log.id)}
                                                        key={log.id}
                                                    >
                                                        <div className="llm-row-icon">
                                                            {log.kind === 'MEMORY' ? <Brain size={14} /> : log.kind?.includes('CHANNEL') ? <Radio size={14} /> : <MessageSquare size={14} />}
                                                        </div>
                                                        <div className="llm-row-body">
                                                            <div className="llm-row-top">
                                                                <strong>{log.user_text || 'Системный вызов'}</strong>
                                                                <time>{formatTime(log.created_at)}</time>
                                                            </div>
                                                            {log.preview && <span className="llm-row-preview">«{log.preview}»</span>}
                                                            <div className="llm-row-badges">
                                                                <Badge variant={getKindBadgeVariant(log.kind)}>{log.kind || 'LLM'}</Badge>
                                                                {log.model && <span className="chip-model">{log.model}</span>}
                                                                {log.latency_ms && <span className="chip-metric">{log.latency_ms}ms</span>}
                                                                {log.command_gate_status === 'COMMAND_REFUSED' && <Badge variant="red">REFUSED</Badge>}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    filteredLogs.map(log => (
                                        <button
                                            className={cn(
                                                'llm-row',
                                                selected?.log?.id === log.id && 'selected',
                                                log.command_gate_status === 'COMMAND_REFUSED' && 'is-refused',
                                                log.error_text && 'is-error'
                                            )}
                                            onClick={() => choose(log.id)}
                                            key={log.id}
                                        >
                                            <div className="llm-row-icon">
                                                {log.kind === 'MEMORY' ? <Brain size={15} /> : log.kind?.includes('CHANNEL') ? <Radio size={15} /> : <MessageSquare size={15} />}
                                            </div>
                                            <div className="llm-row-body">
                                                <div className="llm-row-top">
                                                    <span className="llm-user-label">
                                                        {log.username ? `@${log.username}` : (log.first_name || (log.user_id ? `ID:${log.user_id}` : 'Система'))}
                                                    </span>
                                                    <time>{formatRelativeTime(log.created_at)}</time>
                                                </div>
                                                <strong className="llm-user-msg">{log.user_text || 'Системный запрос'}</strong>
                                                {log.preview && <span className="llm-row-preview">«{log.preview}»</span>}
                                                <div className="llm-row-badges">
                                                    <Badge variant={getKindBadgeVariant(log.kind)}>{log.kind || 'LLM'}</Badge>
                                                    {log.model && <span className="chip-model">{log.model}</span>}
                                                    {log.latency_ms ? <span className="chip-metric">{log.latency_ms}ms</span> : null}
                                                    {log.total_tokens ? <span className="chip-metric">{log.total_tokens}tok</span> : null}
                                                    {log.command_gate_status === 'COMMAND_REFUSED' && <Badge variant="red">REFUSED</Badge>}
                                                    {log.error_text && <Badge variant="red">ERROR</Badge>}
                                                </div>
                                            </div>
                                            <QualityBadge log={log} />
                                        </button>
                                    ))
                                )}
                            </div>
                        </Card>

                        <Card className="llm-detail-card">
                            <CardHeader
                                eyebrow="X-Ray Inspector"
                                title={selected?.log?.user_text || (selected ? 'Системный вызов' : 'Выбери запрос')}
                                description={selected ? `${selected.log.kind || 'LLM'} · ${selected.log.mode || '—'} · ${selected.log.provider_name || '—'} · ${formatDate(selected.log.created_at)}` : 'Полная цепочка генерации, слои промпта, контекст и проверка качества.'}
                                action={selected && (
                                    <div className="inline-controls">
                                        <Button size="sm" variant="outline" onClick={() => handleCopy(selected, 'full_json')}>
                                            {copiedKey === 'full_json' ? <><Check size={13} /> Скопировано</> : <><Copy size={13} /> JSON</>}
                                        </Button>
                                        <Button size="sm" onClick={judge}>
                                            <CheckCircle2 size={13} /> Проверить качество
                                        </Button>
                                    </div>
                                )}
                            />

                            {selected ? (
                                <div className="llm-detail-content">
                                    <div className="kpi-metrics-strip">
                                        <div className="kpi-metric-box">
                                            <span className="kpi-label">Провайдер / Модель</span>
                                            <strong className="kpi-value">{selected.log.provider_name || 'openai'} / {selected.log.model || '—'}</strong>
                                        </div>
                                        <div className="kpi-metric-box">
                                            <span className="kpi-label">Задержка</span>
                                            <strong className="kpi-value">{selected.log.latency_ms || 0} мс</strong>
                                        </div>
                                        <div className="kpi-metric-box">
                                            <span className="kpi-label">Токены (P / C / T)</span>
                                            <strong className="kpi-value">{selected.log.prompt_tokens || 0} / {selected.log.completion_tokens || 0} / {selected.log.total_tokens || 0}</strong>
                                        </div>
                                        <div className="kpi-metric-box">
                                            <span className="kpi-label">Стоимость</span>
                                            <strong className="kpi-value">${Number(selected.log.cost_usd || 0).toFixed(5)}</strong>
                                        </div>
                                        <div className="kpi-metric-box">
                                            <span className="kpi-label">Command Gate</span>
                                            <strong className={cn('kpi-value', selected.log.command_gate_status === 'COMMAND_REFUSED' && 'text-danger')}>
                                                {selected.log.command_gate_status || 'APPROVED'}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="inspector-subtabs-nav">
                                        {[
                                            ['overview', '💬 Сообщение & Ответ'],
                                            ['trace', '🔍 Трейс генерации'],
                                            ['assembly', '🧩 Сборка Prompt'],
                                            ['json', '📄 Raw Payload']
                                        ].map(([tabKey, tabTitle]) => (
                                            <button
                                                key={tabKey}
                                                className={cn('inspector-tab-btn', inspectorTab === tabKey && 'is-active')}
                                                onClick={() => setInspectorTab(tabKey)}
                                            >
                                                {tabTitle}
                                            </button>
                                        ))}
                                    </div>

                                    {inspectorTab === 'overview' && (
                                        <div className="inspector-tab-pane">
                                            <div className="dialog-view-container">
                                                <div className="dialog-user-bubble">
                                                    <div className="bubble-header">
                                                        <span>Сообщение собеседника</span>
                                                        <small>{selected.log.username ? `@${selected.log.username}` : (selected.log.first_name || `ID: ${selected.log.user_id}`)}</small>
                                                    </div>
                                                    <p>{selected.log.user_text || '—'}</p>
                                                </div>

                                                <div className="dialog-assistant-bubble">
                                                    <div className="bubble-header">
                                                        <span>Ответ Леры</span>
                                                        <Button size="icon" variant="ghost" onClick={() => handleCopy(selected.layers?.parsed_response || selected.layers?.raw_response, 'answer')}>
                                                            {copiedKey === 'answer' ? <Check size={12} /> : <Copy size={12} />}
                                                        </Button>
                                                    </div>
                                                    <p>{selected.layers?.parsed_response || selected.layers?.raw_response || '—'}</p>
                                                    <div className="answer-footer-row">
                                                        <QualityBadge log={selected} />
                                                        <span className="model-tag">{selected.log.model}</span>
                                                    </div>
                                                </div>

                                                {selected.log.error_text && (
                                                    <div className="error-alert-box">
                                                        <AlertTriangle size={16} />
                                                        <div>
                                                            <strong>Ошибка выполнения</strong>
                                                            <p>{selected.log.error_text}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {selected.log.command_gate_reason && (
                                                    <div className="error-alert-box is-gate">
                                                        <ShieldAlert size={16} />
                                                        <div>
                                                            <strong>Причина блокировки гейтом</strong>
                                                            <p>{selected.log.command_gate_reason}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {inspectorTab === 'trace' && (
                                        <div className="inspector-tab-pane">
                                            {(() => {
                                                const trace = selected.layers?.generation_trace || [];
                                                const first = trace.find(item => item.step === 'first');
                                                const retry = trace.find(item => item.step === 'retry');
                                                const fallback = trace.find(item => item.step === 'fallback');
                                                const judges = trace.filter(item => item.step === 'judge');
                                                const firstJudge = judges.find(item => item.phase === 'first');
                                                const relationship = trace.find(item => item.step === 'relationship');
                                                const relationshipEvent = firstJudge?.relationshipEvent;
                                                const formatRelationshipNumber = value => Number(value || 0).toFixed(1);
                                                const formatRelationshipDelta = value => {
                                                    const delta = Number(value || 0);
                                                    return `${delta >= 0 ? '+' : ''}${formatRelationshipNumber(delta)}`;
                                                };
                                                const finalAnswer = selected.layers?.parsed_response || selected.layers?.raw_response || '—';

                                                return (
                                                    <div className="generation-trace-visual">
                                                        {selected.log.kind === 'MEMORY' && (
                                                            <div className="trace-step-card is-memory">
                                                                <div className="trace-step-head">
                                                                    <Brain size={15} />
                                                                    <strong>Memory Extraction Pipeline</strong>
                                                                </div>
                                                                <p>{trace[0]?.step === 'retry' ? 'Первый ответ не распарсился — выполнен один retry.' : trace[0]?.step === 'failed' ? 'Extraction завершился ошибкой.' : 'Ответ памяти распарсился с первой попытки.'}</p>
                                                                {selected.log.error_text && <small className="trace-error">Ошибка: {selected.log.error_text}</small>}
                                                            </div>
                                                        )}

                                                        <div className="trace-step-card">
                                                            <div className="trace-step-head">
                                                                <span className="step-num">1</span>
                                                                <strong>Первый ответ</strong>
                                                            </div>
                                                            <p className="trace-text-content">{first?.response || 'Нет сохраненных данных первого драфта'}</p>
                                                        </div>

                                                        {judges.filter(item => item.phase === 'first').map((item, index) => (
                                                            <div key={`judge-first-${index}`} className="trace-step-card is-judge">
                                                                <div className="trace-step-head">
                                                                    <CheckCircle2 size={15} />
                                                                    <strong>Judge первого ответа: {item.verdict}{item.code ? ` (${item.code})` : ''}</strong>
                                                                </div>
                                                                {item.error && <small className="trace-error">{item.error}</small>}
                                                                {item.judgeMessages && (
                                                                    <details className="trace-details">
                                                                        <summary>Что передано судье</summary>
                                                                        <pre>{JSON.stringify(item.judgeMessages, null, 2)}</pre>
                                                                    </details>
                                                                )}
                                                            </div>
                                                        ))}

                                                        {firstJudge && (
                                                            <div className="trace-step-card is-relationship">
                                                                <div className="trace-step-head">
                                                                    <Heart size={15} />
                                                                    <strong>Relationship Judge</strong>
                                                                </div>
                                                                {relationshipEvent ? (
                                                                    <p>Событие: <strong>{relationshipEvent.type}</strong> (интенсивность {formatRelationshipNumber(relationshipEvent.intensity)})</p>
                                                                ) : (
                                                                    <p>Отношения остались нейтральными</p>
                                                                )}
                                                                {relationship?.deltas && (
                                                                    <div className="relationship-deltas-row">
                                                                        <span className="delta-chip">Доверие: {formatRelationshipDelta(relationship.deltas.trust)}</span>
                                                                        <span className="delta-chip">Симпатия: {formatRelationshipDelta(relationship.deltas.affection)}</span>
                                                                        <span className="delta-chip">Раздражение: {formatRelationshipDelta(relationship.deltas.irritation)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {retry && (
                                                            <div className="trace-step-card is-retry">
                                                                <div className="trace-step-head">
                                                                    <span className="step-num">2</span>
                                                                    <strong>Retry: {retry.reason || 'повтор'}</strong>
                                                                </div>
                                                                <p className="trace-text-content">{retry.response || 'Пустой ответ'}</p>
                                                                {retry.instruction && <small className="trace-note">{retry.instruction}</small>}
                                                            </div>
                                                        )}

                                                        {fallback && (
                                                            <div className="trace-step-card is-fallback">
                                                                <div className="trace-step-head">
                                                                    <ShieldAlert size={15} />
                                                                    <strong>Quality Fallback</strong>
                                                                </div>
                                                                <p>{fallback.response || '—'}</p>
                                                            </div>
                                                        )}

                                                        <div className="trace-step-card is-final">
                                                            <div className="trace-step-head">
                                                                <Sparkles size={15} />
                                                                <strong>Финальный ответ (Цепочка генерации)</strong>
                                                            </div>
                                                            <p className="trace-text-content">{finalAnswer}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {inspectorTab === 'assembly' && (
                                        <div className="inspector-tab-pane">
                                            <div className="assembly-sections-list">
                                                <details open className="assembly-accordion">
                                                    <summary>
                                                        <span>01. System Prompt Assembly</span>
                                                        <Button size="icon" variant="ghost" onClick={(e) => { e.preventDefault(); handleCopy(selected.layers?.system_prompt, 'sys_prompt'); }}>
                                                            {copiedKey === 'sys_prompt' ? <Check size={12} /> : <Copy size={12} />}
                                                        </Button>
                                                    </summary>
                                                    <pre className="assembly-code-box">{selected.layers?.system_prompt || '—'}</pre>
                                                </details>

                                                <details className="assembly-accordion">
                                                    <summary>
                                                        <span>02. Контекст дня (Radiant Day Context)</span>
                                                        <Button size="icon" variant="ghost" onClick={(e) => { e.preventDefault(); handleCopy(selected.layers?.radiant_context, 'day_ctx'); }}>
                                                            {copiedKey === 'day_ctx' ? <Check size={12} /> : <Copy size={12} />}
                                                        </Button>
                                                    </summary>
                                                    <pre className="assembly-code-box">{selected.layers?.radiant_context || 'Контекст дня отсутствует'}</pre>
                                                </details>

                                                <details className="assembly-accordion">
                                                    <summary>
                                                        <span>03. Память собеседника (Memory Used)</span>
                                                        <Badge variant="purple">{selected.layers?.memory_used?.length || 0} фактов</Badge>
                                                    </summary>
                                                    <pre className="assembly-code-box">{JSON.stringify(selected.layers?.memory_used || [], null, 2)}</pre>
                                                </details>

                                                <details className="assembly-accordion">
                                                    <summary>
                                                        <span>04. Физиология и состояние (Physics Snapshot)</span>
                                                    </summary>
                                                    <pre className="assembly-code-box">{JSON.stringify(selected.layers?.physics || {}, null, 2)}</pre>
                                                </details>

                                                <details className="assembly-accordion">
                                                    <summary>
                                                        <span>05. История диалога (Messages History)</span>
                                                        <Badge>{selected.layers?.messages?.length || 0} сообщений</Badge>
                                                    </summary>
                                                    <pre className="assembly-code-box">{JSON.stringify(selected.layers?.messages || [], null, 2)}</pre>
                                                </details>
                                            </div>
                                        </div>
                                    )}

                                    {inspectorTab === 'json' && (
                                        <div className="inspector-tab-pane">
                                            <div className="raw-json-header">
                                                <span>Полный JSON объекта вызова</span>
                                                <Button size="sm" variant="outline" onClick={() => handleCopy(selected, 'raw_full')}>
                                                    {copiedKey === 'raw_full' ? <><Check size={13} /> Скопировано</> : <><Copy size={13} /> Копировать всё</>}
                                                </Button>
                                            </div>
                                            <pre className="admin-code-editor">{JSON.stringify(selected, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <Sparkles size={28} />
                                    <strong>Выбери диалог или вызов слева</strong>
                                    <span>Здесь откроется детальный разбор генерации ответа Леры.</span>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

function LlmPanel(props) {
    return <LogsPanel {...props} />;
}

const STUDIO_INTENTS = ['AUTO', 'CASUAL', 'EROTIC', 'JOKE'];
const STUDIO_INTENT_LABELS = { AUTO: 'AUTO', CASUAL: 'CASUAL', JOKE: 'JOKE', EROTIC: 'EROTIC' };
const STUDIO_EDITABLE_INTENTS = ['CASUAL', 'EROTIC', 'JOKE'];
const STUDIO_INTENT_DESCRIPTIONS = {
    CASUAL: 'Обычные диалоги, бытовые вопросы, флирт и инициативы.',
    EROTIC: 'Продолжение интимного или горячего диалога.',
    JOKE: 'Шутка, мем или ирония на один ответ.'
};
const STUDIO_MODULES = [
    ['core', 'Base', 'Постоянная личность Леры.'],
    ['common', 'Speech', 'Речь, правила и границы.'],
    ['intent', 'Intent module', 'Модуль выбранного режима.'],
    ['context', 'Context', 'Состояние, место и события дня.'],
    ['memory', 'Memory', 'Долгосрочные факты пользователя.'],
    ['history', 'History', 'Последние сообщения диалога.']
];
const STUDIO_DEFAULT_CONFIG = {
    sampling: { temperature: 0.7, top_p: 0.95, max_tokens: 200, presence_penalty: 0.1, frequency_penalty: 0.1, repetition_penalty: 1, seed: null },
    promptModules: { core: true, common: true, intent: true, context: true, memory: true, history: true },
    systemOverlay: '',
    model: { provider_id: null, model: null }
};
const STUDIO_QUICK_PRESETS = [
    ['Default', {}],
    ['Creative', { temperature: 1.15, top_p: 0.98, max_tokens: 320 }],
    ['Strict', { temperature: 0.35, top_p: 0.65, repetition_penalty: 1.25 }]
];
const STUDIO_SAMPLER_LABELS = { temperature: 'Temperature', top_p: 'Top P', max_tokens: 'Max Tokens', presence_penalty: 'Presence Penalty', frequency_penalty: 'Frequency Penalty', repetition_penalty: 'Repetition Penalty', seed: 'Seed' };
const STUDIO_CAPABILITY_KEYS = Object.keys(STUDIO_SAMPLER_LABELS);
function cloneSandboxPreset(value = STUDIO_DEFAULT_CONFIG) { return JSON.parse(JSON.stringify(value)); }
function normalizeStudioConfig(value = {}) {
    const raw = value || {};
    return {
        ...cloneSandboxPreset(STUDIO_DEFAULT_CONFIG),
        ...raw,
        sampling: { ...STUDIO_DEFAULT_CONFIG.sampling, ...(raw.sampling || {}) },
        promptModules: { ...STUDIO_DEFAULT_CONFIG.promptModules, ...(raw.promptModules || raw.prompt_modules || {}) },
        model: { ...STUDIO_DEFAULT_CONFIG.model, ...(raw.model || {}) },
        systemOverlay: raw.systemOverlay ?? raw.system_overlay ?? ''
    };
}
function studioConfigToSandboxPreset(config, name = 'Sandbox draft') {
    const normalized = normalizeStudioConfig(config);
    return { version: 3, name, sampling: normalized.sampling, model: normalized.model, prompt_modules: normalized.promptModules, system_overlay: normalized.systemOverlay };
}
function updateStudioSampling(config, key, value) { return { ...config, sampling: { ...config.sampling, [key]: value } }; }
function updateStudioModule(config, key, enabled) { return { ...config, promptModules: { ...config.promptModules, [key]: enabled } }; }
function studioPresetForIntent(item, intent) { return normalizeStudioConfig(item?.config?.intent_configs?.[intent] || item?.config || {}); }
function getMoscowDateTimeLocal(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const value = type => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
function SandboxRawPrompt({ title, result }) {
    const payload = { actualSystemPrompt: result?.systemPrompt || '', messages: result?.messages || [], providerPayload: result?.providerPayload || {}, resolvedIntent: result?.why?.intent || null, resolvedSampling: result?.samplingStatus || {}, skippedParameters: result?.skippedParams || [], latencyMs: result?.latencyMs || 0, usage: result?.usage || {} };
    return <details className="studio-debug"><summary><Terminal size={14} /> {title}</summary><p>Фактический запрос, который ушёл в provider. Секреты и скрытые рассуждения не показываются.</p><pre>{JSON.stringify(payload, null, 2)}</pre></details>;
}
function SandboxResultCard({ label, result, sharedIntent, onChoose, isEditing = false, draftResponse = '', onDraftChange, onEdit, onCancelEdit, onSaveEdit }) {
    if (!result) return null;
    if (result.error) return <article className="sandbox-result-bubble sandbox-result-error"><div className="sandbox-result-heading"><span>Вариант {label}</span><Badge variant="red">{sharedIntent}</Badge></div><strong>Ошибка генерации</strong><p>{result.error}</p></article>;
    const usage = result.usage || {};
    return <article className="sandbox-result-bubble"><div className="sandbox-result-heading"><span>Вариант {label}</span><Badge variant="blue">{sharedIntent}</Badge></div>
        {isEditing
            ? <textarea className="sandbox-answer-editor" aria-label={`Отредактировать ответ варианта ${label}`} value={draftResponse} onChange={event => onDraftChange?.(event.target.value)} />
            : <div className="sandbox-answer">{result.response || 'Пустой ответ'}</div>}
        <div className="studio-result-meta"><span>{result.provider?.name || 'Провайдер'} · {result.provider?.model || 'Модель'}</span><span>{result.latencyMs || 0} мс</span><span>{usage.completion_tokens || 0} токенов ответа</span></div>
        {result.skippedParams?.length > 0 && <div className="sandbox-warning">Пропущено провайдером: {result.skippedParams.join(', ')}</div>}
        <details className="sandbox-why"><summary>Почему такой ответ?</summary><div><span><strong>Intent</strong>{result.why?.intent || sharedIntent}</span><span><strong>Параметры генерации</strong>{Object.entries(result.why?.sampling || {}).filter(([, item]) => item?.request === 'sent').map(([key, item]) => `${key}: ${item.value}`).join(' · ') || '—'}</span><span><strong>Промпт</strong>{(result.why?.prompt || []).join(' + ') || '—'}</span><span><strong>Контекст</strong>{result.why?.context ? 'подключён' : 'выкл.'} · история {result.why?.historyMessages || 0} · память {result.why?.memoryFacts || 0}</span></div></details>
        <div className="sandbox-result-actions">
            {isEditing
                ? <><Button size="sm" className="sandbox-save-answer-button" onClick={onSaveEdit}><CheckCircle2 size={14} />Сохранить ответ</Button><Button size="sm" variant="outline" onClick={onCancelEdit}>Отмена</Button></>
                : <><Button size="sm" variant="outline" className="sandbox-edit-answer-button" onClick={onEdit}><Pencil size={14} />Редактировать</Button>{onChoose && <Button size="sm" className="sandbox-choose-button" onClick={onChoose}><CircleCheck size={14} />Продолжить с вариантом {label}</Button>}</>}
            <SandboxRawPrompt title={`Отладка · Вариант ${label}`} result={result} />
        </div>
    </article>;
}
function getSandboxConfigChanges(baseConfig, nextConfig) {
    const base = normalizeStudioConfig(baseConfig);
    const next = normalizeStudioConfig(nextConfig);
    return [
        ['Модель', base.model?.model || 'по умолчанию', next.model?.model || 'по умолчанию'],
        ['Провайдер', base.model?.provider_id || 'активный', next.model?.provider_id || 'активный'],
        ...STUDIO_CAPABILITY_KEYS.map(key => [STUDIO_SAMPLER_LABELS[key], base.sampling[key] ?? '—', next.sampling[key] ?? '—']),
        ['Модули промпта', Object.entries(base.promptModules || {}).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'нет', Object.entries(next.promptModules || {}).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'нет'],
        ['Системная добавка', base.systemOverlay || '—', next.systemOverlay || '—']
    ].filter(([, left, right]) => JSON.stringify(left) !== JSON.stringify(right));
}
function SandboxCompareChanges({ variantA, variantB }) {
    const changes = getSandboxConfigChanges(variantA, variantB);
    return <section className={cn('sandbox-compare', !changes.length && 'is-identical')} aria-live="polite"><div className="sandbox-compare-summary"><strong>A/B-сравнение</strong><span>{changes.length ? `${changes.length} различий перед запуском` : 'Варианты идентичны — второй запрос не даст сравнения'}</span></div>{changes.length > 0 && <details><summary>Посмотреть различия</summary><div>{changes.map(([label, left, right]) => <span key={label}><strong>{label}</strong>{String(left)} → {String(right)}</span>)}</div></details>}</section>;
}
function SandboxPromptModules({ config, onChange }) {
    return <section className="studio-module-card">
        <div className="studio-section-heading"><div><span className="eyebrow">Состав prompt</span><h3>Модули кандидата</h3></div><Badge variant="muted">{STUDIO_MODULES.filter(([key]) => config.promptModules[key] !== false).length} / {STUDIO_MODULES.length}</Badge></div>
        <p className="studio-section-copy">Меняют только текущий локальный кандидат. Общие Production-правила — в отдельной вкладке.</p>
        <div className="studio-module-list">{STUDIO_MODULES.map(([key, label, description]) => <label className="studio-module-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={config.promptModules[key] !== false} onChange={event => onChange(updateStudioModule(config, key, event.target.checked))} /></label>)}</div>
    </section>;
}
function SandboxSamplingControls({ intent, config, productionConfig, providers, onChange }) {
    const sampling = config.sampling;
    const selectedProvider = providers.find(provider => Number(provider.id) === Number(config.model?.provider_id)) || providers.find(provider => provider.is_active) || providers[0];
    const capabilities = selectedProvider?.sampling_capabilities || {};
    const effects = { temperature: 'Выше — больше вариативности ответа.', top_p: 'Шире выбор слов; обычно не нужно крутить вместе с temperature.', max_tokens: 'Потолок длины ответа, а не желаемый стиль.', presence_penalty: 'Сильнее поощряет новые темы.', frequency_penalty: 'Снижает повтор слов и формулировок.', repetition_penalty: 'Дополнительно сдерживает повторы.', seed: 'Фиксирует случайность, если провайдер его поддерживает.' };
    const field = (key, min, max, step = 0.01, withRange = true) => {
        const supported = key === 'max_tokens' || Boolean(capabilities[key]);
        const productionValue = normalizeStudioConfig(productionConfig).sampling[key];
        const changed = JSON.stringify(sampling[key]) !== JSON.stringify(productionValue);
        return <label className="studio-sampling-field" key={key}><span><b>{STUDIO_SAMPLER_LABELS[key]}</b><input type="number" min={min} max={max} step={step} value={sampling[key] ?? ''} onChange={event => onChange(updateStudioSampling(config, key, event.target.value === '' ? null : Number(event.target.value)))} /></span><small>{effects[key]}</small>{withRange && <input aria-label={STUDIO_SAMPLER_LABELS[key]} type="range" min={min} max={max} step={step} value={sampling[key] ?? 0} onChange={event => onChange(updateStudioSampling(config, key, Number(event.target.value)))} />}<em className={cn(!supported && 'is-warning')}>{supported ? (changed ? `Production: ${productionValue ?? '—'}` : 'Как в Production') : 'Не отправится выбранному провайдеру'}</em></label>;
    };
    return <section className="studio-sampling-card">
        <div className="studio-section-heading"><div><span className="eyebrow">Параметры генерации</span><h3>Кандидат {STUDIO_INTENT_LABELS[intent]}</h3></div><Badge variant="muted">локально</Badge></div>
        <div className="studio-sampling-grid">{field('temperature', 0, 2)}{field('top_p', 0, 1)}{field('max_tokens', 20, 1200, 10, false)}</div>
        <details className="studio-sampling-advanced"><summary>Дополнительные параметры</summary><div className="studio-sampling-grid">{field('presence_penalty', -2, 2, 0.1)}{field('frequency_penalty', -2, 2, 0.1)}{field('repetition_penalty', 1, 2, 0.05)}{field('seed', -2147483648, 2147483647, 1, false)}</div></details>
        <div className="studio-provider-line"><span>{selectedProvider?.name || 'Активный провайдер'} · {selectedProvider?.model_name || 'модель по умолчанию'}</span><small>Параметры со статусом «не отправится» останутся в кандидате, но API провайдера их не получит.</small></div>
    </section>;
}
function ProductionPromptModulesPanel({ toast }) {
    const [promptModules, setPromptModules] = useState({});
    const [routingModules, setRoutingModules] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dayContext, setDayContext] = useState('');
    const [dayContextLoading, setDayContextLoading] = useState(true);
    async function load() {
        setLoading(true);
        try {
            const result = await api('/api/admin/llm-settings');
            setPromptModules(result.prompts || {});
            setRoutingModules(result.routingModules || {});
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }
    async function save() {
        setSaving(true);
        try {
            const result = await api('/api/admin/llm-settings', {
                method: 'POST',
                body: JSON.stringify({
                    prompts: {
                        ...promptModules,
                        ...Object.fromEntries(Object.entries(routingModules).map(([key, value]) => [`routing_${key}`, value]))
                    }
                })
            });
            setPromptModules(result.prompts || promptModules);
            setRoutingModules(result.routingModules || routingModules);
            toast?.('Живые тексты Production сохранены');
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setSaving(false);
        }
    }
    async function loadDayContext() {
        setDayContextLoading(true);
        try {
            const result = await api('/api/admin/prompt-day-context');
            setDayContext(result.context || '');
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setDayContextLoading(false);
        }
    }
    useEffect(() => { load(); loadDayContext(); }, []);
    return <section className="lera-control-center">
        <header className="lera-control-center-header">
            <div>
                <span className="eyebrow">Production · Настройки Леры</span>
                <h3>Личность, контекст и проверки — в одном месте</h3>
                <p>Здесь меняются постоянные правила Леры и сразу видно, какие данные уходят в чат, инициативу и публичный канал. публикация CASUAL / EROTIC / JOKE их не включает.</p>
            </div>
            <Badge variant="green">единый центр</Badge>
        </header>
        <div className="lera-control-center-map">
            <a href="#lera-profile"><strong>01</strong><span>Профиль</span><small>Канон и версии</small></a>
            <a href="#lera-day-context"><strong>02</strong><span>Контекст дня</span><small>Шаблон и факт дня</small></a>
            <a href="#lera-judge"><strong>03</strong><span>Judge</span><small>CHAT · INITIATIVE · CHANNEL</small></a>
            <a href="#lera-modes"><strong>04</strong><span>Режимы</span><small>CASUAL · EROTIC · JOKE</small></a>
        </div>
        <section id="lera-profile" className="lera-control-section">
            <div className="lera-control-section-heading"><div><span className="eyebrow">01 · Канон</span><h4>Профиль личности Леры</h4><p>Один источник истины для всех трёх поверхностей.</p></div><Badge variant="blue">редактируется ниже</Badge></div>
            <LeraProfileEditor toast={toast} />
        </section>
        <section id="lera-day-context" className="lera-control-section">
            <div className="lera-control-section-heading"><div><span className="eyebrow">02 · Динамика</span><h4>Контекст дня</h4><p>Шаблон управляет личными ответами. Сам день собирается автоматически из состояния Леры, событий и планов.</p></div><Badge variant="blue">CHAT · INITIATIVE</Badge></div>
            <div className="context-template-editor">
                <label className="classifier-prompt-editor">Шаблон контекста<textarea value={promptModules.context_template || ''} placeholder="Используйте плейсхолдеры из подсказки ниже." onChange={event => setPromptModules({ ...promptModules, context_template: event.target.value })} disabled={loading || saving} /></label>
                <pre className="field-hint context-template-help">{CONTEXT_TEMPLATE_HELP}</pre>
            </div>
            <div className="lera-day-context-preview">
                <div><span className="eyebrow">Фактический preview</span><strong>{dayContextLoading ? 'Загружаю текущий день…' : 'Что реально видит личный prompt'}</strong></div>
                <Button size="sm" variant="outline" onClick={loadDayContext} disabled={dayContextLoading}><RefreshCw size={14} /> Обновить</Button>
                <pre>{dayContextLoading ? '—' : dayContext || 'Контекст дня пока пуст.'}</pre>
            </div>
            <p className="lera-control-note">В CHANNEL этот приватный контекст не передаётся. Для канала используются только публичные факты, которые задаются в настройках автопостинга.</p>
        </section>
        <section id="lera-judge" className="lera-control-section">
            <div className="lera-control-section-heading"><div><span className="eyebrow">03 · Контроль качества</span><h4>Judge по поверхностям</h4><p>Отдельный режим для личного чата, инициатив и канала. Настройки сохраняются независимо.</p></div><Badge variant="yellow">канал: ENFORCE</Badge></div>
            <LeraJudgeSettingsEditor toast={toast} />
        </section>
        <section id="lera-modes" className="lera-control-section">
            <div className="lera-control-section-heading"><div><span className="eyebrow">04 · Режимная подача</span><h4>Тексты режимов</h4><p>Это не отдельные личности. Это дополнительные правила подачи поверх единого профиля.</p></div><Badge variant="muted">CASUAL · EROTIC · JOKE</Badge></div>
            <PromptModulesEditor modules={routingModules} onChange={setRoutingModules} definitions={ROUTING_PROMPT_MODULES} />
            <div className="studio-live-prompts-actions"><Button size="sm" variant="primary" onClick={save} disabled={loading || saving}>{saving ? 'Сохраняю…' : 'Сохранить контекст и режимы'}</Button></div>
            <details className="prompt-expert-details"><summary>Экспертный JSON модулей</summary><pre>{JSON.stringify(routingModules, null, 2)}</pre></details>
        </section>
    </section>;
}

const PROFILE_FIELDS = [
    ['age_bio', 'Возраст и биография'],
    ['character', 'Характер'],
    ['speech', 'Речь и словарь'],
    ['flirt', 'Допустимый флирт'],
    ['public_image', 'Публичный образ'],
    ['forbidden', 'Запрещённые темы и детали'],
    ['facts', 'Правила фактов и выдумок']
];

function LeraProfileEditor({ toast }) {
    const [profile, setProfile] = useState(null);
    const [draft, setDraft] = useState({});
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [preview, setPreview] = useState(null);
    async function load() {
        setLoading(true);
        try {
            const result = await api('/api/admin/lera-profile');
            setProfile(result.profile);
            setDraft(result.profile?.profile || {});
            setVersions(result.versions || []);
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }
    async function save() {
        setSaving(true);
        try {
            const result = await api('/api/admin/lera-profile', { method: 'POST', body: JSON.stringify({ profile: draft }) });
            setProfile(result.profile);
            setDraft(result.profile.profile);
            setVersions(await api('/api/admin/lera-profile').then(value => value.versions || []));
            toast?.('Профиль Леры сохранён');
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setSaving(false);
        }
    }
    async function rollback(id) {
        try {
            const result = await api(`/api/admin/lera-profile/rollback/${id}`, { method: 'POST', body: JSON.stringify({}) });
            setProfile(result.profile);
            setDraft(result.profile.profile);
            await load();
            toast?.('Профиль откатан в новую версию');
        } catch (error) {
            toast?.(error.message, 'error');
        }
    }
    async function previewProjection(surface) {
        try {
            const result = await api('/api/admin/lera-profile/preview', {
                method: 'POST',
                body: JSON.stringify({ profile: draft, surface })
            });
            setPreview(result);
        } catch (error) {
            toast?.(error.message, 'error');
        }
    }
    useEffect(() => { load(); }, []);
    return <div className="lera-profile-editor">
        <div className="lera-profile-meta"><strong>Канонический профиль · v{loading ? '…' : profile?.version || '—'}</strong><span>{profile?.author || '—'} · {formatDate(profile?.updated_at || profile?.created_at)}</span></div>
        <div className="studio-section-copy">Каждое сохранение создаёт новую версию. Чат, инициативы и канал получают разные проекции одного профиля.</div>
        <div className="context-template-editor">
            {PROFILE_FIELDS.map(([key, label]) => <label className="classifier-prompt-editor" key={key}>{label}<textarea value={draft[key] || ''} disabled={loading || saving} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        </div>
        <div className="studio-live-prompts-actions"><Button size="sm" variant="primary" onClick={save} disabled={loading || saving}>{saving ? 'Сохраняю…' : 'Сохранить новую версию'}</Button><Button size="sm" variant="outline" onClick={() => previewProjection('CHAT')}>Preview чата</Button><Button size="sm" variant="outline" onClick={() => previewProjection('INITIATIVE')}>Preview инициативы</Button><Button size="sm" variant="outline" onClick={() => previewProjection('CHANNEL')}>Preview канала</Button></div>
        {preview && <details className="prompt-expert-details" open><summary>Preview: {preview.surface} · v{preview.version}</summary><pre>{preview.projection}</pre></details>}
        <details className="prompt-expert-details"><summary>Версии, diff и откат</summary>
            <div className="studio-section-copy">Активная версия: v{profile?.version || '—'} · автор: {profile?.author || '—'} · изменена: {formatDate(profile?.updated_at || profile?.created_at)}</div>
            {versions.map(version => <div className="studio-provider-line" key={version.id}>
                <span>v{version.id} · {version.author} · {formatDate(version.created_at)} {version.is_active ? '· активна' : ''}</span>
                <span className="inline-controls">
                    <Button size="sm" variant="outline" onClick={() => setSelectedVersion(selectedVersion === version.id ? null : version.id)}>Diff</Button>
                    {!version.is_active && <Button size="sm" variant="outline" onClick={() => rollback(version.id)}>Откатить</Button>}
                </span>
                {selectedVersion === version.id && <div className="context-template-editor">{PROFILE_FIELDS.map(([key, label]) => {
                    const current = profile?.profile?.[key] || '';
                    const selected = version.profile?.[key] || '';
                    const changed = current !== selected;
                    return <div className="classifier-prompt-editor" key={key}><strong>{label} {changed ? '· изменено' : '· без изменений'}</strong>{changed && <><small>Текущая версия</small><pre>{current || '—'}</pre><small>v{version.id}</small><pre>{selected || '—'}</pre></>}</div>;
                })}</div>}
            </div>)}
        </details>
    </div>;
}

function LeraJudgeSettingsEditor({ toast }) {
    const [settings, setSettings] = useState({});
    const [providers, setProviders] = useState([]);
    const [channelSettings, setChannelSettings] = useState({});
    const [channelSaving, setChannelSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    async function load() {
        setLoading(true);
        try {
            const [llm, providerResult, channelResult] = await Promise.all([api('/api/admin/llm-settings'), api('/api/admin/providers'), api('/api/admin/channel/settings')]);
            setSettings(llm.routingSettings || {});
            setProviders(providerResult.providers || []);
            setChannelSettings(channelResult.settings || {});
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }
    async function save() {
        setSaving(true);
        try {
            const result = await api('/api/admin/llm-settings', { method: 'POST', body: JSON.stringify({ routingSettings: settings }) });
            setSettings(result.routingSettings || settings);
            toast?.('Режимы judge сохранены');
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setSaving(false);
        }
    }
    function update(key, value) { setSettings(current => ({ ...current, [key]: value })); }
    function updateChannel(key, value) { setChannelSettings(current => ({ ...current, [key]: value })); }
    async function saveChannel() {
        setChannelSaving(true);
        try {
            const body = {
                channelId: channelSettings.channel_id || '',
                channelUrl: channelSettings.channel_url || '',
                isEnabled: channelSettings.is_enabled === true,
                frequencyHours: channelSettings.frequency_hours || 4,
                topics: channelSettings.topics || ['thoughts'],
                topicWeights: channelSettings.topic_weights || {},
                messagesCount: channelSettings.messages_count || '1',
                mediaMode: channelSettings.media_mode || 'none',
                promptBlocks: channelSettings.prompt_blocks || {},
                temperature: channelSettings.temperature ?? 0.7,
                publicProfileEnabled: channelSettings.public_profile_enabled !== false,
                publicFactsEnabled: channelSettings.public_facts_enabled === true,
                publicFacts: channelSettings.public_facts || [],
                creativity: channelSettings.creativity ?? 0.6,
                ctaStyle: channelSettings.cta_style || '',
                judgeMode: channelSettings.judge_mode || 'ENFORCE',
                judgeProviderId: channelSettings.judge_provider_id || '',
                judgeModel: channelSettings.judge_model || '',
                judgePrompt: channelSettings.judge_prompt || '',
                judgeTimeoutMs: channelSettings.judge_timeout_ms || 5000,
                judgeMaxTokens: channelSettings.judge_max_tokens || 120
            };
            const result = await api('/api/admin/channel/settings', { method: 'POST', body: JSON.stringify(body) });
            setChannelSettings(result.settings || channelSettings);
            toast?.('Настройки channel-judge сохранены');
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setChannelSaving(false);
        }
    }
    useEffect(() => { load(); }, []);
    return <div className="lera-judge-editor">
        <div className="lera-judge-surface-grid">
            <div className="lera-judge-surface-card"><span>Личный чат</span><strong>{settings.judgeMode || 'OBSERVE'}</strong><small>Проверка обычных ответов пользователю</small><select value={settings.judgeMode || 'OBSERVE'} onChange={event => update('judgeMode', event.target.value)} disabled={loading || saving}><option value="OFF">OFF</option><option value="OBSERVE">OBSERVE</option><option value="ENFORCE">ENFORCE</option></select></div>
            <div className="lera-judge-surface-card"><span>Инициативы</span><strong>{settings.initiativeJudgeMode || 'OBSERVE'}</strong><small>Проверка сообщений, которые Лера пишет первой</small><select value={settings.initiativeJudgeMode || 'OBSERVE'} onChange={event => update('initiativeJudgeMode', event.target.value)} disabled={loading || saving}><option value="OFF">OFF</option><option value="OBSERVE">OBSERVE</option><option value="ENFORCE">ENFORCE</option></select></div>
            <div className="lera-judge-surface-card is-channel"><span>Публичный канал</span><strong>{channelSettings.judge_mode || 'ENFORCE'}</strong><small>Отказ → одна генерация заново → иначе черновик</small><Badge variant="yellow">публичная проверка</Badge></div>
        </div>
        <div className="routing-fields-grid judge-fields-grid">
            <label>Provider судьи<select value={settings.judgeProviderId || ''} onChange={event => update('judgeProviderId', event.target.value)} disabled={loading || saving}><option value="">Текущая цепочка + fallback</option>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model_name}</option>)}</select></label>
            <label>Модель судьи<input value={settings.judgeModel || ''} placeholder="Модель провайдера" onChange={event => update('judgeModel', event.target.value)} disabled={loading || saving} /></label>
            <label>Timeout, мс<input type="number" min="1000" max="60000" value={settings.judgeTimeoutMs ?? 5000} onChange={event => update('judgeTimeoutMs', Number(event.target.value))} disabled={loading || saving} /></label>
            <label>Max tokens<input type="number" min="40" max="120" value={settings.judgeMaxTokens ?? 80} onChange={event => update('judgeMaxTokens', Number(event.target.value))} disabled={loading || saving} /></label>
        </div>
        <div className="classifier-prompt-editor-wrap">
            <div className="classifier-prompt-editor-head">
                <label>Правила judge для CHAT и INITIATIVE</label>
                <Button size="xs" variant="outline" onClick={() => update('judgePrompt', DEFAULT_JUDGE_PROMPT)} disabled={loading || saving}>Вставить эталонный чеклист</Button>
            </div>
            <textarea value={settings.judgePrompt || ''} placeholder="Опиши, что считать ошибкой ответа." onChange={event => update('judgePrompt', event.target.value)} disabled={loading || saving} rows={8} />
        </div>
        <div className="studio-live-prompts-actions"><Button size="sm" variant="primary" onClick={save} disabled={loading || saving}>{saving ? 'Сохраняю…' : 'Сохранить настройки judge'}</Button></div>
        <div className="lera-channel-judge">
            <div className="lera-control-section-heading"><div><span className="eyebrow">Публичный канал</span><h4>Правила channel-judge</h4><p>Эти настройки применяются только к постам в ТГК. При ENFORCE плохой текст остаётся черновиком.</p></div><Badge variant={channelSettings.judge_mode === 'ENFORCE' ? 'yellow' : 'blue'}>{channelSettings.judge_mode || 'ENFORCE'}</Badge></div>
            <div className="routing-fields-grid judge-fields-grid">
                <label>Режим<select value={channelSettings.judge_mode || 'ENFORCE'} onChange={event => updateChannel('judge_mode', event.target.value)} disabled={loading || channelSaving}><option value="OFF">OFF</option><option value="OBSERVE">OBSERVE</option><option value="ENFORCE">ENFORCE</option></select></label>
                <label>Provider<select value={channelSettings.judge_provider_id || ''} onChange={event => updateChannel('judge_provider_id', event.target.value)} disabled={loading || channelSaving}><option value="">Текущая цепочка + fallback</option>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model_name}</option>)}</select></label>
                <label>Модель<input value={channelSettings.judge_model || ''} onChange={event => updateChannel('judge_model', event.target.value)} disabled={loading || channelSaving} /></label>
                <label>Timeout, мс<input type="number" min="1000" max="60000" value={channelSettings.judge_timeout_ms ?? 5000} onChange={event => updateChannel('judge_timeout_ms', Number(event.target.value))} disabled={loading || channelSaving} /></label>
                <label>Max tokens<input type="number" min="40" max="240" value={channelSettings.judge_max_tokens ?? 120} onChange={event => updateChannel('judge_max_tokens', Number(event.target.value))} disabled={loading || channelSaving} /></label>
            </div>
            <div className="classifier-prompt-editor-wrap">
                <div className="classifier-prompt-editor-head">
                    <label>Инструкция channel-judge</label>
                    <Button size="xs" variant="outline" onClick={() => updateChannel('judge_prompt', DEFAULT_CHANNEL_JUDGE_PROMPT)} disabled={loading || channelSaving}>Вставить эталонную инструкцию</Button>
                </div>
                <textarea value={channelSettings.judge_prompt || ''} placeholder="Проверяй публичный пост строго: не выдумывай события и приватные детали." onChange={event => updateChannel('judge_prompt', event.target.value)} disabled={loading || channelSaving} rows={4} />
            </div>
            <div className="studio-live-prompts-actions"><Button size="sm" variant="primary" onClick={saveChannel} disabled={loading || channelSaving}>{channelSaving ? 'Сохраняю…' : 'Сохранить channel-judge'}</Button></div>
        </div>
    </div>;
}
function studioConfigsFromState(state) {
    return Object.fromEntries(STUDIO_INTENTS.map(intent => [intent, normalizeStudioConfig(state?.intents?.[intent]?.draft?.config || {})]));
}
function studioConfigsToSandboxPreset(configs, name = 'Sandbox draft') {
    const normalized = Object.fromEntries(STUDIO_INTENTS.map(intent => [intent, normalizeStudioConfig(configs?.[intent] || {})]));
    const primary = normalized.AUTO;
    return {
        version: 3,
        name,
        sampling: primary.sampling,
        model: primary.model,
        prompt_modules: primary.promptModules,
        system_overlay: primary.systemOverlay,
        intent_configs: normalized
    };
}
function SandboxPanel({ toast }) {
    const [studioState, setStudioState] = useState(null);
    const [draftConfigs, setDraftConfigs] = useState(() => Object.fromEntries(STUDIO_INTENTS.map(intent => [intent, cloneSandboxPreset()])));
    const [activeIntent, setActiveIntent] = useState('CASUAL');
    const [workspaceStep, setWorkspaceStep] = useState('edit');
    const [comparisonMode, setComparisonMode] = useState('production');
    const [abConfig, setAbConfig] = useState(() => cloneSandboxPreset());
    const [providers, setProviders] = useState([]); const [presets, setPresets] = useState([]);
    const [history, setHistory] = useState([]); const [userText, setUserText] = useState('привет, чем занимаешься?'); const [submittedMessage, setSubmittedMessage] = useState('');
    const [mediaPreview, setMediaPreview] = useState(false); const [result, setResult] = useState(null); const [loading, setLoading] = useState(false);
    const [presetName, setPresetName] = useState(''); const [activePresetId, setActivePresetId] = useState(null);
    const [userQuery, setUserQuery] = useState(''); const [foundUsers, setFoundUsers] = useState([]); const [selectedContextUser, setSelectedContextUser] = useState(null); const [loadingUserContext, setLoadingUserContext] = useState(false);
    const [context, setContext] = useState({ current_time: getMoscowDateTimeLocal(), pre_message_gap_seconds: 0, location_id: 'petrogradka_home', mood: 50, status: { task_type: 'IDLE_HOME_REST' }, weather: { text: '', is_raining: false }, daily_facts: [] });
    const run = async (action, success) => { try { const response = await action(); if (success) toast?.(success); return response; } catch (error) { toast?.(error.message === 'AUTH' ? 'Сессия админки истекла. Войдите снова.' : error.message, 'error'); return null; } };
    const activeConfig = draftConfigs[activeIntent] || cloneSandboxPreset();
    const activeState = studioState?.intents?.[activeIntent];
    const productionConfig = normalizeStudioConfig(activeState?.production?.config || activeConfig);
    const savedDraftConfig = normalizeStudioConfig(activeState?.draft?.config || productionConfig);
    const draftVersion = activeState?.draft?.version || '—';
    const productionVersion = activeState?.production?.version || '—';
    const hasUnsavedEdits = JSON.stringify(activeConfig) !== JSON.stringify(savedDraftConfig);
    const draftDiffersFromProduction = JSON.stringify(savedDraftConfig) !== JSON.stringify(productionConfig);
    const productionChanges = getSandboxConfigChanges(productionConfig, savedDraftConfig);
    const activeProvider = providers.find(provider => Number(provider.id) === Number(activeConfig.model?.provider_id)) || providers.find(provider => provider.is_active) || providers[0];
    const normalizedContext = { ...context, current_time: context.current_time ? `${context.current_time}:00+03:00` : undefined };
    const load = async () => {
        const [studioData, providerData, presetData] = await Promise.all([run(() => api('/api/sandbox/prompt-studio')), run(() => api('/api/admin/providers')), run(() => api('/api/sandbox/presets'))]);
        if (studioData) { const configs = studioConfigsFromState(studioData); setStudioState(studioData); setDraftConfigs(configs); setAbConfig(cloneSandboxPreset(configs.CASUAL || STUDIO_DEFAULT_CONFIG)); }
        if (providerData) setProviders(providerData.providers || []);
        if (presetData) setPresets(presetData.presets || []);
    };
    useEffect(() => { load(); }, []);
    function updateActiveConfig(next) { setDraftConfigs(current => ({ ...current, [activeIntent]: normalizeStudioConfig(next) })); }
    function selectIntent(intent) { setActiveIntent(intent); setAbConfig(cloneSandboxPreset(draftConfigs[intent] || STUDIO_DEFAULT_CONFIG)); setResult(null); setSubmittedMessage(''); }
    function applyPreset(config, id = null, name = '') {
        const rawConfigs = config?.intent_configs || config?.intentConfigs;
        const nextConfigs = rawConfigs ? Object.fromEntries(STUDIO_INTENTS.map(intent => [intent, normalizeStudioConfig(rawConfigs[intent] || draftConfigs[intent] || STUDIO_DEFAULT_CONFIG)])) : { ...draftConfigs, [activeIntent]: normalizeStudioConfig(config) };
        setDraftConfigs(nextConfigs); setAbConfig(cloneSandboxPreset(nextConfigs[activeIntent])); setActivePresetId(id); setPresetName(name || config?.name || ''); setResult(null);
        toast?.('Набор применён только локально: он не сохранён и не опубликован');
    }
    function applyQuickPreset(name, changes) { updateActiveConfig({ ...activeConfig, sampling: { ...activeConfig.sampling, ...changes } }); setActivePresetId(null); setPresetName(name); }
    async function saveDraft() {
        const response = await run(() => api('/api/sandbox/prompt-studio/draft', { method: 'POST', body: JSON.stringify({ intent: activeIntent, config: activeConfig }) }), `${activeIntent}: черновик сохранён`);
        if (response?.intents) { setStudioState(response); setDraftConfigs(studioConfigsFromState(response)); }
    }
    async function publishIntent() {
        if (hasUnsavedEdits) return toast?.('Сначала сохрани локальные изменения в черновик', 'error');
        const response = await run(() => api('/api/sandbox/prompt-studio/publish', { method: 'POST', body: JSON.stringify({ intent: activeIntent }) }), `${activeIntent} опубликован в Production`);
        if (response?.intents) { setStudioState(response); setDraftConfigs(studioConfigsFromState(response)); }
        return Boolean(response?.intents);
    }
    async function savePreset() {
        const name = presetName.trim(); if (!name) return toast?.('Введите имя набора', 'error');
        const method = activePresetId ? 'PATCH' : 'POST'; const path = activePresetId ? `/api/sandbox/presets/${activePresetId}` : '/api/sandbox/presets';
        const response = await run(() => api(path, { method, body: JSON.stringify({ name, config: studioConfigsToSandboxPreset(draftConfigs, name) }) }), activePresetId ? 'Набор обновлён' : 'Набор сохранён');
        if (response?.preset) { setActivePresetId(response.preset.id); setPresetName(response.preset.name || name); await load(); }
    }
    async function deletePreset(id) { const response = await run(() => api(`/api/sandbox/presets/${id}`, { method: 'DELETE' }), 'Набор удалён'); if (response) { if (activePresetId === id) { setActivePresetId(null); setPresetName(''); } await load(); } }
    async function searchSandboxUsers() { const query = userQuery.trim(); if (!query) return setFoundUsers([]); const response = await run(() => api(`/api/sandbox/users?q=${encodeURIComponent(query)}`)); if (response) setFoundUsers(response.users || []); }
    async function loadSandboxUserContext(user) {
        setLoadingUserContext(true);
        try { const response = await run(() => api(`/api/sandbox/users/${user.telegram_id}/context`)); if (!response) return; setHistory(response.history || []); setSelectedContextUser(response); setFoundUsers([]); setUserQuery(''); setResult(null); toast?.(`Контекст ${response.user.first_name || response.user.telegram_id} подключён только к Sandbox`); } finally { setLoadingUserContext(false); }
    }
    async function compare() {
        const message = userText.trim(); if (!message) return toast?.('Введите сообщение для теста', 'error');
        const variantA = comparisonMode === 'production' ? studioConfigToSandboxPreset(productionConfig, `Production v${productionVersion} · ${activeIntent}`) : studioConfigToSandboxPreset(activeConfig, `Вариант A · ${activeIntent}`);
        const variantB = comparisonMode === 'production' ? studioConfigToSandboxPreset(activeConfig, `Кандидат · ${activeIntent}`) : studioConfigToSandboxPreset(abConfig, `Вариант B · ${activeIntent}`);
        setLoading(true); setSubmittedMessage(message); setResult(null);
        try {
            const body = { userId: selectedContextUser?.user?.telegram_id || null, history, userText: message, routingMode: activeIntent, mediaPreview, contextOverrides: normalizedContext, preset: variantB, variantA, variantB };
            const response = await run(() => api('/api/sandbox/ab-test', { method: 'POST', body: JSON.stringify(body) }));
            if (response) setResult(response);
        } finally { setLoading(false); }
    }
    function continueSandboxChat(resultItem, label) {
        if (!submittedMessage || !resultItem?.response || resultItem.error) return;
        setHistory(current => appendSandboxExchange(current, submittedMessage, resultItem.response)); setSubmittedMessage(''); setResult(null); setUserText(''); toast?.(`${label} добавлен в тестовую историю`);
    }
    const primaryAction = workspaceStep === 'edit'
        ? (hasUnsavedEdits ? <Button onClick={saveDraft}><CheckCircle2 size={15} />Сохранить черновик</Button> : <Button onClick={() => setWorkspaceStep('test')} disabled={!draftDiffersFromProduction}><Play size={15} />Сравнить с Production</Button>)
        : workspaceStep === 'test'
        ? <Button onClick={compare} disabled={loading}><Play size={15} />{loading ? 'Сравниваю…' : 'Сравнить с Production'}</Button>
        : workspaceStep === 'publish'
        ? <ConfirmAction title={`Опубликовать ${activeIntent} v${draftVersion}?`} description={<><span>Изменится только {activeIntent}. Новые ответы всех пользователей этого intent получат сохранённый черновик.</span><span className="dialog-review">История диалогов не переписывается. Несохранённые правки не войдут в публикацию.</span></>} confirmText="Опубликовать в Production" variant="primary" disabled={hasUnsavedEdits || !draftDiffersFromProduction} onConfirm={publishIntent}>Опубликовать v{draftVersion}</ConfirmAction>
        : null;
    return <div className="studio-shell studio-workspace">
        <header className="studio-workspace-header">
            <div><span className="eyebrow">AI Sandbox / Prompt Studio</span><h2>Черновик — тест — публикация</h2><p>Редактируешь только выбранный intent. AUTO — это маршрутизация Telegram, его не редактируем.</p></div>
            <div className="studio-header-actions"><Badge variant={hasUnsavedEdits ? 'yellow' : draftDiffersFromProduction ? 'blue' : 'green'}>{hasUnsavedEdits ? 'Локальные изменения' : draftDiffersFromProduction ? 'Черновик сохранён' : 'В Production'}</Badge>{primaryAction}</div>
        </header>
        <section className="studio-control-bar">
            <div className="studio-intent-tabs" role="tablist" aria-label="Выбранный intent">{STUDIO_EDITABLE_INTENTS.map(intent => <button type="button" role="tab" aria-selected={activeIntent === intent} key={intent} className={cn('studio-intent-tab', activeIntent === intent && 'is-active')} onClick={() => selectIntent(intent)}>{intent}</button>)}</div>
            <span className="studio-auto-note">AUTO → classifier выбирает CASUAL, EROTIC или JOKE</span>
            <div className="studio-version-summary"><span>Production <b>v{productionVersion}</b></span><span>Черновик <b>v{draftVersion}</b></span></div>
        </section>
        <Tabs.Root value={workspaceStep} onValueChange={setWorkspaceStep} className="studio-workspace-tabs">
                <Tabs.List aria-label="Шаги работы с prompt"><Tabs.Trigger value="edit">1. Редактирование</Tabs.Trigger><Tabs.Trigger value="test">2. Тест и сравнение</Tabs.Trigger><Tabs.Trigger value="publish">3. Проверка и публикация</Tabs.Trigger><Tabs.Trigger value="live">Настройки Леры</Tabs.Trigger></Tabs.List>
            <Tabs.Content value="edit" className="studio-workspace-content">
                <section className="studio-editor-layout">
                    <div className="studio-editor-main">
                        <section className="studio-candidate-card"><div className="studio-section-heading"><div><span className="eyebrow">Локальный кандидат</span><h3>{activeIntent}: что изменится в ответе</h3></div><Badge variant={hasUnsavedEdits ? 'yellow' : 'muted'}>{hasUnsavedEdits ? 'не сохранён' : `черновик v${draftVersion}`}</Badge></div><p className="studio-section-copy">{STUDIO_INTENT_DESCRIPTIONS[activeIntent]} Локальные изменения не видят пользователи, пока ты не сохранишь и не опубликуешь черновик.</p><label className="studio-textarea-field">System overlay<textarea value={activeConfig.systemOverlay} placeholder="Опциональная добавка только для этого intent" onChange={event => updateActiveConfig({ ...activeConfig, systemOverlay: event.target.value })} /></label></section>
                        <SandboxPromptModules config={activeConfig} onChange={updateActiveConfig} />
                    </div>
                    <SandboxSamplingControls intent={activeIntent} config={activeConfig} productionConfig={productionConfig} providers={providers} onChange={updateActiveConfig} />
                </section>
                <section className="studio-presets-library"><div className="studio-section-heading"><div><span className="eyebrow">Наборы для старта</span><h3>Пресеты — снимки всех intent</h3></div><Badge variant="muted">{presets.length + STUDIO_QUICK_PRESETS.length} наборов</Badge></div><p>Применение меняет локальные кандидаты; оно не сохраняет и не публикует. Полный набор затронет AUTO, CASUAL, EROTIC и JOKE.</p><div className="studio-preset-grid">{STUDIO_QUICK_PRESETS.map(([name, changes]) => <button key={name} className="studio-preset-button" onClick={() => applyQuickPreset(name, changes)}><strong>{name}</strong><span>Меняет текущий intent локально</span><em>Применить</em></button>)}{presets.map(item => <article className={cn('studio-saved-preset', activePresetId === item.id && 'is-active')} key={item.id}><button onClick={() => applyPreset(item.config, item.id, item.name)}><strong>{item.name}</strong><span>{formatDate(item.updated_at || item.created_at)} · AUTO / CASUAL / EROTIC / JOKE</span><em>{activePresetId === item.id ? 'Выбран' : 'Применить'}</em></button><button aria-label={`Удалить набор ${item.name}`} onClick={() => deletePreset(item.id)}><X size={15} /></button></article>)}</div><div className="studio-preset-save"><input id="sandbox-preset-name" aria-label="Имя набора" value={presetName} placeholder="Название нового набора" onChange={event => { setPresetName(event.target.value); if (activePresetId) setActivePresetId(null); }} /><Button size="sm" variant="outline" onClick={savePreset}>{activePresetId ? 'Обновить' : 'Сохранить как новый'}</Button></div></section>
            </Tabs.Content>
            <Tabs.Content value="test" className="studio-workspace-content">
                <section className="studio-compare-intro"><div><span className="eyebrow">Один замороженный тест</span><h3>{comparisonMode === 'production' ? 'Production ↔ Черновик' : 'Свободный A/B'}</h3><p>Оба ответа получают одинаковые intent, сообщение, историю и контекст.</p></div><Button variant="outline" onClick={() => { setHistory([]); setResult(null); setSubmittedMessage(''); }}>Новый тест</Button></section>
                <SandboxCompareChanges variantA={comparisonMode === 'production' ? productionConfig : activeConfig} variantB={comparisonMode === 'production' ? activeConfig : abConfig} />
                <details className="studio-test-conditions"><summary>Тестовые условия <span>только Sandbox</span></summary><div className="studio-context-grid"><label>Время<input type="datetime-local" value={context.current_time} onChange={event => setContext({ ...context, current_time: event.target.value })} /></label><label>Пауза, сек.<input type="number" min="0" value={context.pre_message_gap_seconds} onChange={event => setContext({ ...context, pre_message_gap_seconds: Number(event.target.value) })} /></label><label>Настроение<input type="number" min="0" max="100" value={context.mood} onChange={event => setContext({ ...context, mood: Number(event.target.value) })} /></label><label>Локация<select value={context.location_id} onChange={event => setContext({ ...context, location_id: event.target.value })}><option value="petrogradka_home">Квартира на Петроградке</option><option value="cafe_sloy">Кофейня «Слой»</option><option value="showroom_work">Шоурум Макса</option><option value="vkusvill_lenina">ВкусВилл</option></select></label></div><div className="sandbox-user-search"><input value={userQuery} placeholder="ID, @username или имя пользователя" onChange={event => setUserQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') searchSandboxUsers(); }} /><Button size="sm" variant="outline" onClick={searchSandboxUsers}>Подключить контекст</Button></div>{foundUsers.map(user => <button className="studio-user-result" key={user.telegram_id} disabled={loadingUserContext} onClick={() => loadSandboxUserContext(user)}>{user.first_name || 'Без имени'} · @{user.username || '—'}</button>)}<label className="studio-toggle-row">Превью медиа<input type="checkbox" checked={mediaPreview} onChange={event => setMediaPreview(event.target.checked)} /></label></details>
                <details className="studio-expert-panel"><summary>Экспертный режим: свободный A/B</summary><p>Вместо Production во втором тесте используется отдельный локальный вариант. На публикацию это не влияет.</p><label className="studio-textarea-field">System overlay варианта B<textarea value={abConfig.systemOverlay} onChange={event => setAbConfig({ ...abConfig, systemOverlay: event.target.value })} /></label><Button size="sm" variant="outline" onClick={() => setComparisonMode(current => current === 'production' ? 'ab' : 'production')}>{comparisonMode === 'production' ? 'Включить свободный A/B' : 'Вернуть Production ↔ Черновик'}</Button></details>
                <section className="studio-test-chat"><div className="studio-test-history">{history.map(item => <div key={item.id} className={cn('sandbox-history-row', item.role === 'assistant' ? 'sandbox-history-assistant' : 'sandbox-history-user')}><div className="sandbox-history-bubble"><strong>{item.role === 'assistant' ? 'Лера' : 'Пользователь'}</strong><span>{item.content}</span></div></div>)}{submittedMessage && <div className="sandbox-current-message"><div className="sandbox-current-message-bubble"><strong>Пользователь</strong><span>{submittedMessage}</span></div></div>}</div><div className="sandbox-send-row studio-composer"><input aria-label="Сообщение для Леры" value={userText} placeholder="Напишите сообщение для сравнения…" onChange={event => setUserText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') compare(); }} /><span className="studio-composer-intent">{activeIntent}</span><Button className="sandbox-send-button" onClick={compare} disabled={loading}><Play size={14} />{loading ? 'Сравниваю…' : 'Сравнить'}</Button></div></section>
                {result && <section className="studio-result-comparison"><div className="studio-result-toolbar"><span>{comparisonMode === 'production' ? `Production v${productionVersion} ↔ Кандидат` : 'Вариант A ↔ Вариант B'}</span><Button size="sm" variant="outline" className="sandbox-regenerate-button" onClick={compare}><RefreshCw size={14} />Повторить тест</Button></div><div className="studio-result-columns"><SandboxResultCard label={comparisonMode === 'production' ? `Production v${productionVersion}` : 'A'} result={result.variants?.A} sharedIntent={result.resolvedIntent || activeIntent} onChoose={() => continueSandboxChat(result.variants?.A, 'Production')} /><SandboxResultCard label={comparisonMode === 'production' ? 'Черновик' : 'B'} result={result.variants?.B} sharedIntent={result.resolvedIntent || activeIntent} onChoose={() => continueSandboxChat(result.variants?.B, 'Черновик')} /></div></section>}
            </Tabs.Content>
            <Tabs.Content value="publish" className="studio-workspace-content"><section className="studio-publish-page"><div className="studio-section-heading"><div><span className="eyebrow">Проверка перед публикацией</span><h3>{activeIntent}: Production v{productionVersion} → Черновик v{draftVersion}</h3></div><Badge variant={hasUnsavedEdits ? 'yellow' : draftDiffersFromProduction ? 'blue' : 'green'}>{hasUnsavedEdits ? 'сначала сохранить' : draftDiffersFromProduction ? 'готово к публикации' : 'без изменений'}</Badge></div><p>Изменится только {activeIntent}. Все новые ответы пользователей, для которых classifier выберет этот intent, получат новую версию. История и уже отправленные сообщения не переписываются.</p>{hasUnsavedEdits && <div className="studio-warning-note">Есть локальные правки. Публикация всегда берёт сохранённый черновик, поэтому сначала «Сохранить черновик».</div>}<div className="studio-diff-list">{productionChanges.length ? productionChanges.map(([label, before, after]) => <div key={label}><strong>{label}</strong><span>{String(before)} → {String(after)}</span></div>) : <span>Сохранённый черновик совпадает с Production.</span>}</div><div className="studio-publish-footer">{hasUnsavedEdits ? <Button onClick={saveDraft}><CheckCircle2 size={15} />Сохранить черновик</Button> : primaryAction}</div></section></Tabs.Content>
            <Tabs.Content value="live" className="studio-workspace-content"><section className="studio-live-page"><div><span className="eyebrow">Общие правила Production</span><h3>Сохраняются сразу и влияют на будущие ответы всех пользователей</h3><p>Это не часть черновика intent и не ждёт публикации CASUAL, EROTIC или JOKE.</p></div><ProductionPromptModulesPanel toast={toast} /></section></Tabs.Content>
        </Tabs.Root>
        <footer className="studio-workspace-footer"><span>{activeProvider?.name || 'Активный провайдер'} · {activeProvider?.model_name || 'модель по умолчанию'}</span><span>{selectedContextUser ? `Контекст: ${selectedContextUser.user.first_name || selectedContextUser.user.telegram_id}` : 'Контекст пользователя не подключён'} · история {history.length}</span></footer>
    </div>;
}
function CommentsPromptStudioPanel({ toast }) {
    const [postText, setPostText] = useState('сегодня такой странный день на Петроградке, еле до кофе дошла');
    const [commentText, setCommentText] = useState('Лера, ты опять до утра не спала?');
    const [isKnown, setIsKnown] = useState(true);
    const [userName, setUserName] = useState('Богдан');
    const [isDirectMention, setIsDirectMention] = useState(true);
    const [commentsPrompt, setCommentsPrompt] = useState('');
    const [decisionResult, setDecisionResult] = useState(null);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api('/api/admin/channel/settings').then(res => {
            if (res?.settings?.comments_prompt !== undefined) {
                setCommentsPrompt(res.settings.comments_prompt || '');
            }
        }).catch(() => {});
    }, []);

    async function saveCommentsPrompt() {
        setSaving(true);
        try {
            const current = await api('/api/admin/channel/settings');
            const body = {
                ...(current?.settings || {}),
                channelId: current?.channelId || '',
                channelUrl: current?.channelUrl || '',
                isEnabled: current?.settings?.is_enabled,
                frequencyHours: current?.settings?.frequency_hours,
                commentsPrompt
            };
            await api('/api/admin/channel/settings', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            toast?.('Инструкции комментариев сохранены');
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setSaving(false);
        }
    }

    async function testCommentDecision() {
        setTesting(true);
        setDecisionResult(null);
        try {
            const res = await api('/api/admin/channel/comments/test', {
                method: 'POST',
                body: JSON.stringify({
                    postText,
                    commentText,
                    isKnown,
                    userName,
                    isDirectMention
                })
            });
            if (res?.decision) {
                setDecisionResult(res.decision);
                toast?.('Решение ИИ сгенерировано');
            }
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setTesting(false);
        }
    }

    return (
        <div className="content-channel-layout" style={{ marginTop: 16 }}>
            <Card>
                <CardHeader eyebrow="Поверхность: Комментарии" title="💬 Правила и контекст для комментариев в ТГК" description="Базовый образ Леры проецируется для публичного общения в привязанном чате канала." />
                <div className="topic-prompt-explainer">
                    <span className="eyebrow">Базовые правила публичных комментариев</span>
                    <p>• <strong>Тон:</strong> 19-летняя студентка из СПб, живая, теплая, ироничная, легкий сленг (жиза, рил, кароч).</p>
                    <p>• <strong>Формат ответа:</strong> 1–2 коротких предложения, строчными буквами, без лишних смайликов внутри текста.</p>
                    <p>• <strong>Узнавание друзей:</strong> если юзер есть в личке бота — Лера знает его имя и воспоминания, может по-дружески подколоть.</p>
                    <p>• <strong>Сверхстрогая безопасность:</strong> СТРОЖАЙШЕ ЗАПРЕЩЕНО раскрывать приватные интимные подробности, фото или секреты из ЛС в публичном чате.</p>
                </div>
                <div className="context-template-editor" style={{ marginTop: 16 }}>
                    <label className="classifier-prompt-editor">Дополнительные инструкции для комментариев
                        <textarea
                            value={commentsPrompt}
                            placeholder="Например: чаще подкалывай за питерскую погоду, будь чуть более ироничной к хейтерам..."
                            onChange={e => setCommentsPrompt(e.target.value)}
                        />
                    </label>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button onClick={saveCommentsPrompt} disabled={saving} variant="primary">
                            <CheckCircle2 size={15} /> {saving ? 'Сохраняю…' : 'Сохранить инструкции'}
                        </Button>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader eyebrow="Песочница" title="🧪 Интерактивный тест ответа и реакции" description="Проверьте, как Лера среагирует на комментарий подписчика (знакомого или незнакомца)." />
                <div className="photo-upload-form">
                    <label>Пост в канале
                        <input value={postText} onChange={e => setPostText(e.target.value)} placeholder="Текст исходного поста" />
                    </label>
                    <label>Комментарий подписчика
                        <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Текст комментария" />
                    </label>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={isKnown} onChange={e => setIsKnown(e.target.checked)} />
                            Собеседник знаком из ЛС
                        </label>
                        {isKnown && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                Имя:
                                <input value={userName} onChange={e => setUserName(e.target.value)} style={{ width: 120 }} />
                            </label>
                        )}
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={isDirectMention} onChange={e => setIsDirectMention(e.target.checked)} />
                            Прямой тег / реплай на Леру
                        </label>
                    </div>
                    <Button onClick={testCommentDecision} disabled={testing} variant="primary">
                        <Play size={15} /> {testing ? 'Думаю…' : 'Протестировать решение ИИ'}
                    </Button>
                </div>

                {decisionResult && (
                    <div className="channel-draft-card" style={{ marginTop: 16 }}>
                        <div className="channel-post-header">
                            <Badge variant="blue">Решение ИИ</Badge>
                            {decisionResult.reaction && <span style={{ fontSize: 24 }}>{decisionResult.reaction}</span>}
                            <span>{decisionResult.reason || '—'}</span>
                        </div>
                        <div style={{ padding: 12, background: 'var(--bg-card-muted, rgba(255,255,255,0.04))', borderRadius: 8 }}>
                            <strong>Ответ Леры:</strong>
                            <p style={{ marginTop: 6, fontSize: 15 }}>{decisionResult.reply || '— (без текстового ответа)'}</p>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}

function ActionsManagerPanel({ toast }) {
    const [tools, setTools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [testingTool, setTestingTool] = useState(null);
    const [testArgs, setTestArgs] = useState('{}');
    const [testResult, setTestResult] = useState(null);
    const [testLoading, setTestLoading] = useState(false);
    const [editingTimeouts, setEditingTimeouts] = useState({});

    // Состояния модалки добавления
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addTab, setAddTab] = useState('mcp'); // 'mcp' | 'webhook'
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Поля MCP
    const [mcpUrl, setMcpUrl] = useState('');
    const [mcpHeaders, setMcpHeaders] = useState('');
    const [mcpDiscoveredTools, setMcpDiscoveredTools] = useState([]);
    const [mcpSelectedTools, setMcpSelectedTools] = useState({});
    const [isDiscoveringMcp, setIsDiscoveringMcp] = useState(false);

    // Поля Webhook
    const [webhookName, setWebhookName] = useState('');
    const [webhookDesc, setWebhookDesc] = useState('');
    const [webhookUrl, setWebhookUrl] = useState('');
    const [webhookMethod, setWebhookMethod] = useState('POST');
    const [webhookHeaders, setWebhookHeaders] = useState('');
    const [webhookSchema, setWebhookSchema] = useState('{\n  "type": "object",\n  "properties": {\n    "query": { "type": "string", "description": "Поисковый запрос" }\n  }\n}');

    const loadTools = async () => {
        setLoading(true);
        try {
            const data = await api('/api/admin/tools');
            if (data && data.tools) {
                setTools(data.tools);
                const timeouts = {};
                data.tools.forEach(t => { timeouts[t.name] = t.timeoutMs || 10000; });
                setEditingTimeouts(timeouts);
            }
        } catch (err) {
            toast?.(err.message || 'Ошибка загрузки навыков', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTools();
    }, []);

    const toggleTool = async (name) => {
        try {
            const res = await api(`/api/admin/tools/${name}/toggle`, { method: 'POST' });
            if (res?.tool) {
                setTools(prev => prev.map(t => t.name === name ? res.tool : t));
                toast?.(`Навык ${name} ${res.tool.enabled ? 'включен' : 'выключен'}`);
            }
        } catch (err) {
            toast?.(err.message, 'error');
        }
    };

    const deleteTool = async (name) => {
        if (!window.confirm(`Точно удалить пользовательский навык ${name}?`)) return;
        try {
            const res = await api(`/api/admin/tools/${name}`, { method: 'DELETE' });
            if (res?.success) {
                setTools(prev => prev.filter(t => t.name !== name));
                toast?.(`Навык ${name} удален`);
            }
        } catch (err) {
            toast?.(err.message, 'error');
        }
    };

    const saveTimeout = async (name) => {
        const timeoutMs = Number(editingTimeouts[name]);
        if (!timeoutMs || timeoutMs < 500) {
            toast?.('Таймаут должен быть не менее 500 мс', 'error');
            return;
        }
        try {
            const res = await api(`/api/admin/tools/${name}`, {
                method: 'PATCH',
                body: JSON.stringify({ timeoutMs })
            });
            if (res?.tool) {
                setTools(prev => prev.map(t => t.name === name ? res.tool : t));
                toast?.(`Таймаут для ${name} обновлен (${timeoutMs} мс)`);
            }
        } catch (err) {
            toast?.(err.message, 'error');
        }
    };

    const openTestModal = (tool) => {
        setTestingTool(tool);
        setTestResult(null);
        let defaultArgs = {};
        if (tool.name === 'web_search') defaultArgs = { query: 'Севкабель Порт события' };
        else if (tool.name === 'weather') defaultArgs = { city: 'Санкт-Петербург' };
        else if (tool.name === 'spb_places') defaultArgs = { query: 'Слой' };
        else if (tool.inputSchema?.properties) {
            Object.keys(tool.inputSchema.properties).forEach(k => { defaultArgs[k] = ''; });
        }
        setTestArgs(JSON.stringify(defaultArgs, null, 2));
    };

    const runTest = async () => {
        if (!testingTool) return;
        setTestLoading(true);
        setTestResult(null);
        let parsedArgs = {};
        try {
            parsedArgs = JSON.parse(testArgs);
        } catch {
            toast?.('Невалидный JSON аргументов', 'error');
            setTestLoading(false);
            return;
        }

        try {
            const data = await api(`/api/admin/tools/${testingTool.name}/test`, {
                method: 'POST',
                body: JSON.stringify({ args: parsedArgs })
            });
            setTestResult(data?.result || null);
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setTestLoading(false);
        }
    };

    const handleDiscoverMcp = async () => {
        if (!mcpUrl.trim()) {
            toast?.('Укажите URL MCP сервера', 'error');
            return;
        }
        setIsDiscoveringMcp(true);
        setMcpDiscoveredTools([]);
        try {
            let headers = {};
            if (mcpHeaders.trim()) {
                headers = JSON.parse(mcpHeaders);
            }
            const res = await api('/api/admin/tools/mcp/discover', {
                method: 'POST',
                body: JSON.stringify({ endpoint: mcpUrl.trim(), headers })
            });
            if (res?.tools) {
                setMcpDiscoveredTools(res.tools);
                const selected = {};
                res.tools.forEach(t => { selected[t.name] = true; });
                setMcpSelectedTools(selected);
                toast?.(`Найдено инструментов: ${res.tools.length}`);
            }
        } catch (err) {
            toast?.(err.message || 'Ошибка подключения к MCP серверу', 'error');
        } finally {
            setIsDiscoveringMcp(false);
        }
    };

    const handleImportMcpTools = async () => {
        const toolsToImport = mcpDiscoveredTools.filter(t => mcpSelectedTools[t.name]);
        if (!toolsToImport.length) {
            toast?.('Выберите хотя бы один инструмент для импорта', 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            let headers = {};
            if (mcpHeaders.trim()) headers = JSON.parse(mcpHeaders);

            for (const t of toolsToImport) {
                await api('/api/admin/tools/custom', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: t.name,
                        type: 'MCP',
                        description: t.description,
                        inputSchema: t.inputSchema,
                        config: {
                            url: mcpUrl.trim(),
                            originalToolName: t.name,
                            headers
                        },
                        timeoutMs: 12000,
                        enabled: true
                    })
                });
            }
            toast?.(`Успешно импортировано инструментов: ${toolsToImport.length}`);
            setIsAddModalOpen(false);
            setMcpDiscoveredTools([]);
            setMcpUrl('');
            loadTools();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateWebhook = async () => {
        if (!webhookName.trim() || !webhookUrl.trim()) {
            toast?.('Заполните имя и URL вебхука', 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            let headers = {};
            if (webhookHeaders.trim()) headers = JSON.parse(webhookHeaders);
            let inputSchema = {};
            if (webhookSchema.trim()) inputSchema = JSON.parse(webhookSchema);

            await api('/api/admin/tools/custom', {
                method: 'POST',
                body: JSON.stringify({
                    name: webhookName.trim(),
                    type: 'WEBHOOK',
                    description: webhookDesc.trim() || `Пользовательский вебхук ${webhookName}`,
                    inputSchema,
                    config: {
                        url: webhookUrl.trim(),
                        method: webhookMethod,
                        headers
                    },
                    timeoutMs: 10000,
                    enabled: true
                })
            });

            toast?.(`Вебхук-навык ${webhookName} успешно создан`);
            setIsAddModalOpen(false);
            setWebhookName('');
            setWebhookUrl('');
            setWebhookDesc('');
            loadTools();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="actions-manager-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: 18, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={18} /> Навыки и действия Леры (RADIANT Actions)
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7 }}>
                        Модульные инструменты: SYSTEM, MCP (Model Context Protocol) и кастомные Webhooks
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="primary" onClick={() => setIsAddModalOpen(true)}>
                        <Plus size={14} /> Добавить навык
                    </Button>
                    <Button size="sm" variant="outline" onClick={loadTools} loading={loading}>
                        <RefreshCw size={14} /> Обновить
                    </Button>
                </div>
            </div>

            {loading && !tools.length ? (
                <div style={{ padding: 32, textAlign: 'center', opacity: 0.6 }}>Загрузка навыков…</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                    {tools.map(tool => {
                        const isEnabled = tool.enabled !== false;
                        const isSystem = tool.type === 'SYSTEM';
                        const isMcp = tool.type === 'MCP';
                        const isWebhook = tool.type === 'WEBHOOK';

                        let badgeVariant = 'primary';
                        if (isMcp) badgeVariant = 'outline';
                        if (isWebhook) badgeVariant = 'green';

                        return (
                            <Card key={tool.name} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: isEnabled ? '1px solid var(--border-color, #333)' : '1px dashed #555' }}>
                                <CardHeader style={{ paddingBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <strong style={{ fontSize: 16 }}>{tool.title || tool.name}</strong>
                                                <Badge variant={badgeVariant}>{tool.type || 'SYSTEM'}</Badge>
                                            </div>
                                            <div style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.5, marginTop: 2 }}>
                                                {tool.name}
                                            </div>
                                            <div style={{ fontSize: 13, marginTop: 6, minHeight: 38, opacity: 0.85 }}>
                                                {tool.description}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Badge variant={isEnabled ? 'green' : 'gray'}>
                                                {isEnabled ? 'АКТИВЕН' : 'ОТКЛЮЧЕН'}
                                            </Badge>
                                            {!isSystem && (
                                                <button
                                                    onClick={() => deleteTool(tool.name)}
                                                    style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', opacity: 0.8, padding: 4 }}
                                                    title="Удалить навык"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                        <Clock size={14} style={{ opacity: 0.6 }} />
                                        <span>Таймаут (мс):</span>
                                        <input
                                            type="number"
                                            value={editingTimeouts[tool.name] ?? tool.timeoutMs ?? 10000}
                                            onChange={e => setEditingTimeouts({ ...editingTimeouts, [tool.name]: e.target.value })}
                                            style={{ width: 80, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                        />
                                        <Button size="xs" variant="outline" onClick={() => saveTimeout(tool.name)}>
                                            Сохранить
                                        </Button>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                        <Button
                                            size="sm"
                                            variant={isEnabled ? 'outline' : 'primary'}
                                            onClick={() => toggleTool(tool.name)}
                                            style={{ flex: 1 }}
                                        >
                                            {isEnabled ? 'Выключить' : 'Включить'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => openTestModal(tool)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                        >
                                            <Play size={13} /> Тестировать
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Modal: Добавить навык (MCP / Webhook) */}
            {isAddModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
                }}>
                    <div style={{
                        background: 'var(--card-bg, #1a1a1a)', borderRadius: 12, border: '1px solid var(--border-color, #333)',
                        width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Plus size={18} /> Добавить новый навык
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Переключатель табов MCP / Webhook */}
                        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color, #333)', paddingBottom: 10 }}>
                            <Button
                                size="sm"
                                variant={addTab === 'mcp' ? 'primary' : 'outline'}
                                onClick={() => setAddTab('mcp')}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Server size={14} /> MCP Server (JSON-RPC)
                            </Button>
                            <Button
                                size="sm"
                                variant={addTab === 'webhook' ? 'primary' : 'outline'}
                                onClick={() => setAddTab('webhook')}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Globe size={14} /> Custom Webhook (HTTP)
                            </Button>
                        </div>

                        {addTab === 'mcp' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>URL MCP Сервера (HTTP / SSE endpoint):</label>
                                    <input
                                        type="text"
                                        placeholder="http://mcp-server:3000/sse или http://127.0.0.1:8080/mcp"
                                        value={mcpUrl}
                                        onChange={e => setMcpUrl(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Заголовки (JSON, опционально, например Authorization):</label>
                                    <input
                                        type="text"
                                        placeholder='{"Authorization": "Bearer my_secret_token"}'
                                        value={mcpHeaders}
                                        onChange={e => setMcpHeaders(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                    />
                                </div>
                                <Button size="sm" variant="secondary" onClick={handleDiscoverMcp} loading={isDiscoveringMcp}>
                                    <Search size={14} /> Найти инструменты (tools/list)
                                </Button>

                                {mcpDiscoveredTools.length > 0 && (
                                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ fontSize: 13, fontWeight: 'bold' }}>Найденные инструменты ({mcpDiscoveredTools.length}):</div>
                                        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-color, #333)', padding: 8, borderRadius: 6 }}>
                                            {mcpDiscoveredTools.map(t => (
                                                <label key={t.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', padding: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(mcpSelectedTools[t.name])}
                                                        onChange={e => setMcpSelectedTools({ ...mcpSelectedTools, [t.name]: e.target.checked })}
                                                        style={{ marginTop: 3 }}
                                                    />
                                                    <div>
                                                        <strong>{t.name}</strong>
                                                        <div style={{ fontSize: 12, opacity: 0.7 }}>{t.description}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                        <Button size="sm" variant="primary" onClick={handleImportMcpTools} loading={isSubmitting}>
                                            Импортировать выбранные инструменты
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Имя действия (латиница, без пробелов):</label>
                                    <input
                                        type="text"
                                        placeholder="currency_rate"
                                        value={webhookName}
                                        onChange={e => setWebhookName(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Описание для Needle (когда вызывать):</label>
                                    <input
                                        type="text"
                                        placeholder="Узнать курс валют ЦБ РФ или криптовалюты"
                                        value={webhookDesc}
                                        onChange={e => setWebhookDesc(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ width: 100 }}>
                                        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Метод:</label>
                                        <select
                                            value={webhookMethod}
                                            onChange={e => setWebhookMethod(e.target.value)}
                                            style={{ width: '100%', padding: '8px 6px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: '#222', color: 'inherit' }}
                                        >
                                            <option value="POST">POST</option>
                                            <option value="GET">GET</option>
                                            <option value="PUT">PUT</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>URL Вебхука:</label>
                                        <input
                                            type="text"
                                            placeholder="https://my-webhook.service/api/currency"
                                            value={webhookUrl}
                                            onChange={e => setWebhookUrl(e.target.value)}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Заголовки (JSON, опционально):</label>
                                    <input
                                        type="text"
                                        placeholder='{"X-Api-Key": "secret"}'
                                        value={webhookHeaders}
                                        onChange={e => setWebhookHeaders(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'transparent', color: 'inherit' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>JSON Schema входных аргументов:</label>
                                    <textarea
                                        rows={4}
                                        value={webhookSchema}
                                        onChange={e => setWebhookSchema(e.target.value)}
                                        style={{ width: '100%', padding: 8, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, border: '1px solid var(--border-color, #444)', background: 'rgba(0,0,0,0.3)', color: 'inherit' }}
                                    />
                                </div>
                                <Button size="sm" variant="primary" onClick={handleCreateWebhook} loading={isSubmitting}>
                                    Создать вебхук-навык
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Test Modal / Dialog */}
            {testingTool && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
                }}>
                    <div style={{
                        background: 'var(--card-bg, #1a1a1a)', borderRadius: 12, border: '1px solid var(--border-color, #333)',
                        width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Play size={16} /> Тест навыка: <code>{testingTool.name}</code>
                            </h3>
                            <button onClick={() => setTestingTool(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div>
                            <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>Входные аргументы (JSON):</div>
                            <textarea
                                value={testArgs}
                                onChange={e => setTestArgs(e.target.value)}
                                rows={4}
                                style={{
                                    width: '100%', padding: 10, borderRadius: 6,
                                    fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid var(--border-color, #444)', color: 'inherit', resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <Button variant="outline" onClick={() => setTestingTool(null)}>Закрыть</Button>
                            <Button variant="primary" loading={testLoading} onClick={runTest}>
                                <Play size={14} /> Выполнить действие
                            </Button>
                        </div>

                        {testResult && (
                            <div style={{
                                marginTop: 8, padding: 14, borderRadius: 8,
                                background: testResult.status === 'success' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                                border: `1px solid ${testResult.status === 'success' ? '#2ecc71' : '#e74c3c'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Badge variant={testResult.status === 'success' ? 'green' : 'red'}>
                                        {testResult.status === 'success' ? 'SUCCESS' : 'ERROR'}
                                    </Badge>
                                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                                        {testResult.meta?.durationMs || 0} мс {testResult.meta?.cached ? '• КЭШ' : ''}
                                    </span>
                                </div>

                                {testResult.error ? (
                                    <div style={{ color: '#e74c3c', fontSize: 13 }}>
                                        <strong>{testResult.error.code}:</strong> {testResult.error.message}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                            {typeof testResult.data === 'string' ? testResult.data : testResult.data?.text || JSON.stringify(testResult.data, null, 2)}
                                        </div>
                                        {Array.isArray(testResult.data?.sources) && testResult.data.sources.length > 0 && (
                                            <div style={{ fontSize: 12, opacity: 0.85, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
                                                <strong>Источники:</strong>
                                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                                    {testResult.data.sources.map((s, i) => (
                                                        <li key={i}><a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#3498db' }}>{s.title || s.url}</a></li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <details style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                                    <summary style={{ cursor: 'pointer' }}>Показать полный JSON ответ</summary>
                                    <pre style={{ margin: '6px 0 0', padding: 8, background: 'rgba(0,0,0,0.4)', borderRadius: 4, overflowX: 'auto' }}>
                                        {JSON.stringify(testResult, null, 2)}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function AiSandboxPromptStudio({ toast }) {
    return <Tabs.Root className="llm-super-panel studio-area-tabs" defaultValue="sandbox">
        <Tabs.List className="studio-area-tablist" aria-label="Рабочая зона AI">
            <Tabs.Trigger value="sandbox"><WandSparkles size={15} />Тест ответов и публикация (DM)</Tabs.Trigger>
            <Tabs.Trigger value="actions"><Zap size={15} />Навыки Леры (Actions)</Tabs.Trigger>
            <Tabs.Trigger value="comments"><MessageSquare size={15} />Комменты ТГК</Tabs.Trigger>
            <Tabs.Trigger value="production"><ShieldAlert size={15} />Система: провайдеры и правила</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="sandbox"><SandboxPanel toast={toast} /></Tabs.Content>
        <Tabs.Content value="actions"><ActionsManagerPanel toast={toast} /></Tabs.Content>
        <Tabs.Content value="comments"><CommentsPromptStudioPanel toast={toast} /></Tabs.Content>
        <Tabs.Content value="production"><LlmSettingsPanel toast={toast} /></Tabs.Content>
    </Tabs.Root>;
}

function ImageGenerationTestPanel({ providers, toast }) {
    const bridgeImageModels = ['gemini-3-pro-image-preview-11-2025', 'gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-3.1-flash-image-preview'];
    const imageProviders = providers.filter(provider => String(provider.model_name || '').toLowerCase().includes('image') || String(provider.base_url || '').includes('gemini-web-to-api'));
    const [providerId, setProviderId] = useState('');
    const [model, setModel] = useState('');
    const [prompt, setPrompt] = useState('');
    const [size, setSize] = useState('1024x1024');
    const [reference, setReference] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!providerId && imageProviders[0]) setProviderId(String(imageProviders[0].id));
    }, [imageProviders, providerId]);
    const selectedProvider = imageProviders.find(provider => String(provider.id) === String(providerId));
    const modelOptions = selectedProvider && String(selectedProvider.base_url || '').includes('gemini-web-to-api')
        ? bridgeImageModels
        : selectedProvider?.model_name ? [selectedProvider.model_name] : [];
    useEffect(() => {
        if (!modelOptions.includes(model)) setModel(modelOptions[0] || '');
    }, [modelOptions, model]);

    function selectReference(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            toast?.('Референс должен быть меньше 10 МБ', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setReference({ name: file.name, dataUrl: String(reader.result), mimeType: file.type });
            setPreviewUrl(String(reader.result));
            setResult(null);
        };
        reader.readAsDataURL(file);
    }

    function clearReference() {
        setReference(null);
        setPreviewUrl('');
        setResult(null);
    }

    async function generate() {
        if (!prompt.trim()) return toast?.('Напиши, что сгенерировать', 'error');
        if (!providerId) return toast?.('Нет image-провайдера в цепочке', 'error');
        setLoading(true);
        setResult(null);
        try {
            const response = await api('/api/admin/image-generation/test', {
                method: 'POST',
                body: JSON.stringify({ providerId, model, prompt, size, imageDataUrl: reference?.dataUrl || null })
            });
            if (response.mode === 'generation' && response.b64Json) {
                const url = `data:${response.mimeType || 'image/png'};base64,${response.b64Json}`;
                setPreviewUrl(url);
                setResult({ kind: 'image', url, revisedPrompt: response.revisedPrompt });
                toast?.('Изображение готово');
            } else {
                if (response.imageDataUrl) {
                    setPreviewUrl(response.imageDataUrl);
                    setResult({ kind: 'image', url: response.imageDataUrl, revisedPrompt: prompt });
                } else {
                    setResult({ kind: 'text', content: response.content || 'Bridge вернул пустой ответ' });
                }
                toast?.('Ответ bridge получен');
            }
        } catch (error) {
            toast?.(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    return <Card className="image-generation-card">
        <CardHeader
            eyebrow="Gemini Web Bridge"
            title="Тест генерации изображений"
            description="Без референса используется images/generations. С референсом bridge получает multimodal chat-запрос."
            action={<Badge variant={imageProviders.length ? 'green' : 'yellow'}>{imageProviders.length ? `${imageProviders.length} image-провайдер${imageProviders.length === 1 ? '' : 'а'}` : 'Нет image-провайдера'}</Badge>}
        />
        <div className="image-generation-layout">
            <div className="image-generation-controls">
                <label>Image-провайдер
                    <select value={providerId} onChange={event => setProviderId(event.target.value)}>
                        {!imageProviders.length && <option value="">Добавь провайдер с image-моделью</option>}
                        {imageProviders.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
                    </select>
                </label>
                <label>Модель
                    <select value={model} onChange={event => setModel(event.target.value)}>
                        {!modelOptions.length && <option value="">Нет доступных моделей</option>}
                        {modelOptions.map(item => <option value={item} key={item}>{item}</option>)}
                    </select>
                </label>
                <label>Размер
                    <select value={size} onChange={event => setSize(event.target.value)}>
                        <option value="1024x1024">Квадрат · 1024×1024</option>
                        <option value="1536x1024">Альбом · 1536×1024</option>
                        <option value="1024x1536">Портрет · 1024×1536</option>
                    </select>
                </label>
                <label>Prompt<textarea value={prompt} placeholder="Например: Лера в Петербурге вечером, кинематографичный реализм…" onChange={event => setPrompt(event.target.value)} /></label>
                <div className="image-reference-picker">
                    <span className="field-label">Референс-картинка <small>необязательно</small></span>
                    <label className="image-upload-button"><Upload size={14} />{reference ? reference.name : 'Загрузить картинку'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectReference} /></label>
                    {reference && <Button type="button" size="sm" variant="outline" onClick={clearReference}>Убрать референс</Button>}
                </div>
                <Button type="button" onClick={generate} loading={loading} disabled={!imageProviders.length}><Sparkles size={14} />{loading ? 'Генерирую, это может занять несколько минут…' : 'Сгенерировать'}</Button>
            </div>
            <div className="image-generation-result" aria-live="polite">
                {result?.kind === 'image' && <><img src={result.url} alt="Сгенерированный результат" /><a className="image-download-link" href={result.url} download="gemini-generated.png"><Download size={14} />Скачать PNG</a>{result.revisedPrompt && <small>{result.revisedPrompt}</small>}</>}
                {result?.kind === 'text' && <div className="image-generation-text-result">{result.content}</div>}
                {!result && previewUrl
                    ? <div className="image-generation-reference-preview"><img src={previewUrl} alt="Загруженный референс" /><small>Референс загружен. После генерации здесь появится результат.</small></div>
                    : !result && <div className="image-generation-empty"><FileImage size={28} /><span>Здесь появится результат</span><small>Референс можно использовать для изменения или продолжения изображения.</small></div>}
            </div>
        </div>
    </Card>;
}

function LlmSettingsPanel({ toast }) {
    const [providers, setProviders] = useState([]);
    const [providerForm, setProviderForm] = useState({ name: '', base_url: '', api_key: '', model_name: '' });
    const [providerResults, setProviderResults] = useState([]);
    const [providerSubmitting, setProviderSubmitting] = useState(false);
    const [providerTesting, setProviderTesting] = useState(false);
    const [routingSettings, setRoutingSettings] = useState({});
    const [routingDefaults, setRoutingDefaults] = useState({});
    const [memorySettings, setMemorySettings] = useState({});
    const run = async (action, success) => { try { const result = await action(); if (success && toast) toast(success); return result; } catch (error) { if (toast) toast(error.message, 'error'); return null; } };
    async function loadProviders() { const result = await run(() => api('/api/admin/providers')); if (result) setProviders(result.providers || []); }
    async function loadPrompts() {
        const result = await run(() => api('/api/admin/llm-settings'));
        if (result) {
            setRoutingDefaults(result.routingDefaults || {});
            setRoutingSettings({
                ...(result.routingSettings || {}),
                initiativePrompt: result.routingSettings?.initiativePrompt || result.routingDefaults?.initiativePrompt || '',
                contentPrompt: result.routingSettings?.contentPrompt || result.routingDefaults?.contentPrompt || ''
            });
            setMemorySettings(result.memorySettings || {});
        }
    }
    async function savePrompts() {
        const result = await run(() => api('/api/admin/llm-settings', { method: 'POST', body: JSON.stringify({ routingSettings, memorySettings }) }), 'Настройки LLM сохранены');
        if (result) {
            setRoutingDefaults(result.routingDefaults || routingDefaults);
            setRoutingSettings({
                ...(result.routingSettings || routingSettings),
                initiativePrompt: result.routingSettings?.initiativePrompt || result.routingDefaults?.initiativePrompt || routingSettings.initiativePrompt || '',
                contentPrompt: result.routingSettings?.contentPrompt || result.routingDefaults?.contentPrompt || routingSettings.contentPrompt || ''
            });
            setMemorySettings(result.memorySettings || memorySettings);
        }
    }
    useEffect(() => { loadProviders(); loadPrompts(); }, []);
    async function toggleProviderCapability(provider, key, enabled) {
        const samplingCapabilities = { ...(provider.sampling_capabilities || {}), [key]: enabled };
        await run(() => api(`/api/admin/providers/${provider.id}/capabilities`, { method: 'PATCH', body: JSON.stringify({ samplingCapabilities }) }), 'Capabilities обновлены');
        loadProviders();
    }
    async function addProvider(event) {
        event.preventDefault();
        const missing = Object.entries(providerForm).find(([, value]) => !String(value || '').trim());
        if (missing) return toast?.('Заполни имя, Base URL, API key и модель', 'error');
        setProviderSubmitting(true);
        try {
            const result = await run(() => api('/api/admin/providers', { method: 'POST', body: JSON.stringify(providerForm) }), 'Провайдер добавлен');
            if (!result?.provider) return false;
            setProviderForm({ name: '', base_url: '', api_key: '', model_name: '' });
            await loadProviders();
            return true;
        } finally {
            setProviderSubmitting(false);
        }
    }
    async function testProviders() {
        setProviderTesting(true);
        try {
            const result = await run(() => api('/api/admin/providers/test', { method: 'POST' }), 'Проверка завершена');
            if (result) setProviderResults(result.results || []);
        } finally {
            setProviderTesting(false);
        }
    }
    async function moveProvider(provider, direction) {
        const index = providers.findIndex(item => item.id === provider.id);
        const neighbor = providers[index + direction];
        if (!neighbor) return;
        const result = await run(() => api(`/api/admin/providers/${provider.id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority: neighbor.priority }) }));
        if (!result) return false;
        const swapped = await run(() => api(`/api/admin/providers/${neighbor.id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority: provider.priority }) }), 'Порядок fallback обновлён');
        if (!swapped) return false;
        await loadProviders();
        return true;
    }
    async function deleteProvider(provider) {
        const result = await run(() => api(`/api/admin/providers/${provider.id}`, { method: 'DELETE' }), 'Провайдер удалён');
        if (!result) return false;
        await loadProviders();
        return true;
    }
    return <div className="llm-super-panel">
        <ImageGenerationTestPanel providers={providers} toast={toast} />
        <Card className="llm-config-card">
            <CardHeader eyebrow="Production" title="Провайдеры и fallback" description="Основной провайдер стоит первым. Ниже — резервные в порядке вызова. API-ключи после добавления не показываются." />
            <div className="provider-section">
                <form className="provider-form" onSubmit={addProvider}>
                    <label>Название<input name="name" value={providerForm.name} placeholder="Например, Mistral" onChange={event => setProviderForm({ ...providerForm, name: event.target.value })} /></label>
                    <label>Base URL<input name="base_url" type="url" value={providerForm.base_url} placeholder="https://api.example.com/v1" onChange={event => setProviderForm({ ...providerForm, base_url: event.target.value })} /></label>
                    <label>API key<input name="api_key" type="password" autoComplete="off" value={providerForm.api_key} placeholder="Сохраняется только на сервере" onChange={event => setProviderForm({ ...providerForm, api_key: event.target.value })} /></label>
                    <label>Модель<input name="model_name" value={providerForm.model_name} placeholder="Например, mistral-large-latest" onChange={event => setProviderForm({ ...providerForm, model_name: event.target.value })} /></label>
                    <div className="provider-form-actions"><Button type="submit" loading={providerSubmitting}>Добавить в цепочку</Button><Button type="button" variant="outline" loading={providerTesting} onClick={testProviders}>Проверить цепочку</Button></div>
                </form>
                {providerResults.map(result => <div className={cn('management-note', result.status === 'FAILED' && 'management-note-error')} key={result.id}><strong>{result.name}</strong>: {result.status} {result.durationMs ? `· ${result.durationMs} ms` : ''} {result.error ? `— Ошибка: ${result.error}` : ''}</div>)}
                <div className="providers-grid">
                    {!providers.length && <div className="provider-empty-state"><strong>Цепочка пока пустая</strong><span>Добавь основной провайдер выше — после этого можно собрать fallback.</span></div>}
                    {providers.map((provider, index) => <article className="provider-managed-row" key={provider.id}>
                        <div className="provider-row-main">
                            <span className="provider-row-icon" aria-hidden="true"><Settings2 size={15} /></span>
                            <div className="provider-row-title"><strong>{provider.name}</strong><span>{provider.model_name}</span></div>
                            <Badge variant={provider.is_active ? 'green' : 'muted'}>{provider.is_active ? 'Основной' : `Fallback ${index}`}</Badge>
                        </div>
                        <div className="provider-row-url" title={provider.base_url}>{provider.base_url}</div>
                        <div className="provider-row-actions">
                            <div className="provider-order-controls" aria-label={`Порядок ${provider.name} в цепочке`}>
                                <Button size="icon" variant="outline" aria-label={`Поднять ${provider.name} в цепочке`} title="Поднять в цепочке" disabled={provider.is_active || index <= 1} onClick={() => moveProvider(provider, -1)}><ArrowUp size={14} /></Button>
                                <Button size="icon" variant="outline" aria-label={`Опустить ${provider.name} в цепочке`} title="Опустить в цепочке" disabled={provider.is_active || index === providers.length - 1} onClick={() => moveProvider(provider, 1)}><ArrowDown size={14} /></Button>
                            </div>
                            <Button size="sm" variant="outline" disabled={provider.is_active} onClick={() => run(() => api(`/api/admin/providers/${provider.id}/activate`, { method: 'POST' }), 'Провайдер активирован').then(loadProviders)}>{provider.is_active ? 'Основной' : 'Сделать основным'}</Button>
                            <ConfirmAction title="Удалить провайдера?" description={provider.is_active ? 'Основной провайдер будет удалён, а первый fallback станет основным.' : 'Провайдер будет удалён из production-цепочки LLM.'} confirmText="Удалить" variant="danger" onConfirm={() => deleteProvider(provider)}>Удалить</ConfirmAction>
                        </div>
                        <details className="provider-capabilities"><summary>Параметры sampling</summary><div>{STUDIO_CAPABILITY_KEYS.map(key => <label className="sandbox-check" key={key}>{STUDIO_SAMPLER_LABELS[key]}<input type="checkbox" checked={!!provider.sampling_capabilities?.[key]} onChange={event => toggleProviderCapability(provider, key, event.target.checked)} /></label>)}</div></details>
                    </article>)}
                </div>
            </div>
        </Card>
        <Card className="llm-config-card routing-panel">
            <CardHeader
                eyebrow="Two-Stage Routing"
                title="Маршрутизация ответов"
                description="Сначала классифицируется стиль, затем собирается специализированный prompt. Команды, фото и другие tools остаются backend-логикой."
                action={<Badge variant="green">Активна</Badge>}
            />

            <div className="routing-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Классификатор</span><strong>Выбирает стиль или реакцию</strong><small>REACTION ставит реакцию на короткое затухающее сообщение без генерации текста. При ошибке используется CASUAL.</small></div>
                    <Badge variant="blue">CASUAL · EROTIC · JOKE · REACTION</Badge>
                </div>
                <div className="routing-fields-grid">
                    <label>Provider классификатора<select value={routingSettings.classifierProviderId || ''} onChange={event => setRoutingSettings({ ...routingSettings, classifierProviderId: event.target.value })}><option value="">Текущая цепочка + fallback</option>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model_name}</option>)}</select></label>
                    <label>Модель классификатора<input value={routingSettings.classifierModel || ''} placeholder="Модель провайдера" onChange={event => setRoutingSettings({ ...routingSettings, classifierModel: event.target.value })} /></label>
                    <label>Timeout, мс<input type="number" min="1000" max="60000" value={routingSettings.classifierTimeoutMs ?? 7000} onChange={event => setRoutingSettings({ ...routingSettings, classifierTimeoutMs: Number(event.target.value) })} /></label>
                    <label>Max tokens<input type="number" min="4" max="8" value={routingSettings.classifierMaxTokens ?? 4} onChange={event => setRoutingSettings({ ...routingSettings, classifierMaxTokens: Number(event.target.value) })} /></label>
                </div>
                <label className="classifier-prompt-editor">Prompt классификатора<textarea value={routingSettings.classifierPrompt || ''} placeholder="Верни CASUAL, EROTIC, JOKE или REACTION &lt;emoji&gt;." onChange={event => setRoutingSettings({ ...routingSettings, classifierPrompt: event.target.value })} /></label>
                <div className="field-hint">Здесь редактируется инструкция именно для микро-вызова классификации, а не prompt ответа Леры.</div>
            </div>

            <div className="routing-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Инициативы</span><strong>Когда Лера пишет первой</strong><small>Общий дневной лимит. Персональный лимит пользователя настраивается в его карточке CRM.</small></div>
                    <Badge variant="blue">Только инициативы</Badge>
                </div>
                <div className="routing-fields-grid">
                    <label>Общий лимит в сутки<input type="number" min="0" max="20" value={routingSettings.initiativeLimit ?? 3} onChange={event => setRoutingSettings({ ...routingSettings, initiativeLimit: Number(event.target.value) })} /></label>
                </div>
                <label className="classifier-prompt-editor">Основной prompt инициатив<textarea value={routingSettings.initiativePrompt || ''} onChange={event => setRoutingSettings({ ...routingSettings, initiativePrompt: event.target.value })} /></label>
                <div className="field-actions">
                    <Button size="sm" variant="outline" onClick={() => setRoutingSettings({ ...routingSettings, initiativePrompt: routingDefaults.initiativePrompt || '' })}>Вернуть стандартный prompt</Button>
                </div>
                <div className="field-hint">Это реальные базовые правила генерации. Они применяются только когда Лера пишет первой. Тип инициативы и причина подставляются автоматически.</div>
                <label className="classifier-prompt-editor">Правила отправки контента<textarea value={routingSettings.contentPrompt || ''} onChange={event => setRoutingSettings({ ...routingSettings, contentPrompt: event.target.value })} /></label>
                <div className="field-actions">
                    <Button size="sm" variant="outline" onClick={() => setRoutingSettings({ ...routingSettings, contentPrompt: routingDefaults.contentPrompt || '' })}>Вернуть стандартные правила контента</Button>
                </div>
                <div className="field-hint">Здесь настраивается, когда Лера выбирает материал, как делает подводку и что контент уходит отдельным сообщением после текста. Для конкретного файла отдельно работают флаги «В диалоге» и «В инициативе» в разделе «Каталог контента».</div>
                <details className="judge-transfer-details">
                    <summary>Как контент реально отправляется</summary>
                    <div className="judge-transfer-grid">
                        <div><span>Что получает модель</span><pre>{`[ДОСТУПНЫЙ КОНТЕНТ]
- [CONTENT: id] тип: описание
- максимум один материал
- тег [CONTENT: id] только в конце ответа`}</pre></div>
                        <div><span>Что делает бот после ответа</span><pre>{`1. Удаляет служебный тег из текста.
2. Отправляет текст существующей лесенкой.
3. Отправляет выбранный материал новым сообщением.
4. После успеха записывает CONTENT event и расходует контентный лимит.`}</pre></div>
                    </div>
                </details>
            </div>

            <div className="routing-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">AI-судья ответа</span><strong>Проверяет готовый ответ Леры</strong><small>Наблюдение только пишет verdict в лог. Проверка и retry один раз перегенерирует отклонённый ответ и перепроверяет его.</small></div>
                    <Badge variant={routingSettings.judgeMode === 'ENFORCE' ? 'yellow' : routingSettings.judgeMode === 'OBSERVE' ? 'blue' : 'muted'}>{routingSettings.judgeMode === 'ENFORCE' ? 'Проверка и retry' : routingSettings.judgeMode === 'OBSERVE' ? 'Наблюдение' : 'Выключен'}</Badge>
                </div>
                <div className="routing-fields-grid judge-fields-grid">
                    <label>Режим судьи<select value={routingSettings.judgeMode || 'OBSERVE'} onChange={event => setRoutingSettings({ ...routingSettings, judgeMode: event.target.value })}><option value="OFF">Выключен</option><option value="OBSERVE">Наблюдение: только лог</option><option value="ENFORCE">Проверка и один retry</option></select></label>
                    <label>Provider судьи<select value={routingSettings.judgeProviderId || ''} onChange={event => setRoutingSettings({ ...routingSettings, judgeProviderId: event.target.value })}><option value="">Текущая цепочка + fallback</option>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model_name}</option>)}</select></label>
                    <label>Модель судьи<input value={routingSettings.judgeModel || ''} placeholder="Модель провайдера" onChange={event => setRoutingSettings({ ...routingSettings, judgeModel: event.target.value })} /></label>
                    <label>Timeout, мс<input type="number" min="1000" max="60000" value={routingSettings.judgeTimeoutMs ?? 5000} onChange={event => setRoutingSettings({ ...routingSettings, judgeTimeoutMs: Number(event.target.value) })} /></label>
                    <label>Max tokens<input type="number" min="40" max="120" value={routingSettings.judgeMaxTokens ?? 80} onChange={event => setRoutingSettings({ ...routingSettings, judgeMaxTokens: Number(event.target.value) })} /></label>
                </div>
                <div className="classifier-prompt-editor-wrap">
                    <div className="classifier-prompt-editor-head">
                        <label>Инструкция судьи (Правила проверки)</label>
                        <Button size="xs" variant="outline" onClick={() => setRoutingSettings({ ...routingSettings, judgePrompt: DEFAULT_JUDGE_PROMPT })}>Вставить эталонный чеклист</Button>
                    </div>
                    <textarea value={routingSettings.judgePrompt || ''} placeholder="Верни JSON с verdict и relationship_event." onChange={event => setRoutingSettings({ ...routingSettings, judgePrompt: event.target.value })} rows={8} />
                </div>
                <div className="field-hint">Это единственное редактируемое правило для судьи. Ниже показан реальный облегченный вид данных, с которыми сравнивается ответ.</div>
                <details className="judge-transfer-details">
                    <summary>Как prompt передаётся судье</summary>
                    <div className="judge-transfer-grid">
                        <div><span>System message (~120 токенов)</span><pre>{(routingSettings.judgePrompt || DEFAULT_JUDGE_PROMPT) + '\n\nДополнительно верни relationship_event по последней реплике пользователя: тип NEUTRAL, SUPPORT, COMPLIMENT, AFFECTION, INSULT, DISRESPECT или APOLOGY и intensity 0.0–1.0. Формат результата: JSON {"verdict":"PASS","relationship_event":{"type":"NEUTRAL","intensity":0}}.'}</pre></div>
                        <div><span>User message (~150 токенов)</span><pre>{`Режим: {{CASUAL|EROTIC|JOKE}}\n\nКонтекст Леры на сегодня:\n• Локация: {{локация}}\n• Статус: {{действие}}\n• Самочувствие: {{самочувствие}}\n• Время: {{время}}\n\nДиалог:\n• {{последние 4 реплики}}\n\nПоследняя реплика пользователя:\n{{до 600 символов}}\n\nКандидат-ответ Леры:\n{{до 800 символов}}\n\nВерни только JSON: {"verdict":"PASS","relationship_event":{"type":"NEUTRAL","intensity":0}} или {"verdict":"REJECT:CODE","relationship_event":{"type":"NEUTRAL","intensity":0}}`}</pre></div>
                    </div>
                    <div className="field-hint">Контекст дня сжат до короткого статуса и локации. Это отдельный легкий LLM-вызов: при сбое судьи ответ безопасно пропускается дальше.</div>
                </details>
                <div className="field-hint">Коды reject: REPETITION, IGNORES_USER, OUT_OF_CHARACTER, STALE_CONTEXT, INVENTED_FACT, BROKEN_LOGIC, FORMAT.</div>
            </div>

            <div className="routing-section memory-settings-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Долгосрочная память</span><strong>Извлечение фактов о пользователе</strong><small>Запускается после ответа Леры и не задерживает Telegram. Без личного утверждения пользователя вызов вообще не делается.</small></div>
                    <Badge variant={memorySettings.is_enabled === false ? 'muted' : 'green'}>{memorySettings.is_enabled === false ? 'Выключена' : 'Активна'}</Badge>
                </div>
                <div className="memory-toggle-row">
                    <label className="sandbox-check">Включить extraction<input type="checkbox" checked={memorySettings.is_enabled !== false} onChange={event => setMemorySettings({ ...memorySettings, is_enabled: event.target.checked })} /></label>
                    <span className="field-hint">Если модель вернула не JSON, факт не сохранится. Raw-ответ, причина и retry будут видны в Prompt Inspector как <code>MEMORY</code>.</span>
                </div>
                <div className="routing-fields-grid memory-settings-grid">
                    <label>Provider памяти<select value={memorySettings.provider_id || ''} onChange={event => setMemorySettings({ ...memorySettings, provider_id: event.target.value })}><option value="">Текущий основной provider</option>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model_name}</option>)}</select></label>
                    <label>Модель<input value={memorySettings.model || ''} placeholder="Модель выбранного provider" onChange={event => setMemorySettings({ ...memorySettings, model: event.target.value })} /></label>
                    <label>Temperature<input type="number" min="0" max="2" step="0.01" value={memorySettings.temperature ?? 0.2} onChange={event => setMemorySettings({ ...memorySettings, temperature: Number(event.target.value) })} /></label>
                    <label>Timeout, мс<input type="number" min="1000" max="60000" value={memorySettings.timeout_ms ?? 10000} onChange={event => setMemorySettings({ ...memorySettings, timeout_ms: Number(event.target.value) })} /></label>
                    <label>Max tokens, первый<input type="number" min="80" max="1200" value={memorySettings.max_tokens ?? 400} onChange={event => setMemorySettings({ ...memorySettings, max_tokens: Number(event.target.value) })} /></label>
                    <label>Max tokens, retry<input type="number" min="80" max="1600" value={memorySettings.retry_max_tokens ?? 700} onChange={event => setMemorySettings({ ...memorySettings, retry_max_tokens: Number(event.target.value) })} /></label>
                </div>
                <label className="classifier-prompt-editor">Prompt extractor<textarea value={memorySettings.prompt || ''} placeholder="Верни строго JSON с new_facts и deactivate_ids." onChange={event => setMemorySettings({ ...memorySettings, prompt: event.target.value })} /></label>
                <details className="judge-transfer-details">
                    <summary>Что и как передаётся extractor</summary>
                    <div className="judge-transfer-grid">
                        <div><span>System message</span><pre>{memorySettings.prompt || 'Загрузится дефолтный prompt памяти.'}</pre></div>
                        <div><span>Подстановка перед запросом</span><pre>{`{{existing_facts}} → до 30 активных фактов пользователя\n{{user_text}} → одна новая реплика пользователя (до 4000 символов)\n\nОжидаемый ответ:\n{"new_facts":[],"deactivate_ids":[]}\n\nПри невалидном JSON: один retry с просьбой вернуть закрытый JSON. Потом только trace — без записи в память.`}</pre></div>
                    </div>
                </details>
            </div>

            <div className="routing-save-row"><span>Изменения применяются после сохранения.</span><Button variant="primary" onClick={savePrompts}>Сохранить настройки</Button></div>
        </Card>
    </div>;
}

function CrmPanel({ toast }) {
    const [crmTab, setCrmTab] = useState('clients');
    const [userFilter, setUserFilter] = useState('all');

    const [users, setUsers] = useState([]);
    const [userQuery, setUserQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [dossierTab, setDossierTab] = useState('balance');
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
    const [promoForm, setPromoForm] = useState({ code: '', maxActivations: 1, bonusRequests: 0, bonusImages: 0, discountPercent: 0 });

    const [adminStats, setAdminStats] = useState(null);
    const [freeMode, setFreeMode] = useState(false);

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

    async function loadUsers() {
        const result = await api(`/api/admin/users${userQuery ? `/search?q=${encodeURIComponent(userQuery)}` : '?limit=50'}`);
        setUsers(result.users || []);
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
        } else setMemoryGraphState({ loading: false, error: graphResult.reason?.message || 'Не удалось загрузить граф памяти.' });
        if (retrievalResult.status === 'fulfilled') {
            const payload = retrievalResult.value;
            setRetrievals(payload.retrievals || payload.results || payload.items || []);
            setRetrievalState({ loading: false, error: '' });
        } else setRetrievalState({ loading: false, error: retrievalResult.reason?.message || 'Не удалось загрузить response trace.' });
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

    async function loadCommerce() {
        const [packagesResult, promos] = await Promise.all([api('/api/admin/packages'), api('/api/admin/promocodes')]);
        setPackages(packagesResult.packages || {});
        setPromocodes(promos.promocodes || []);
    }

    async function addPromocode() {
        if (!promoForm.code.trim()) { if (toast) toast('Введите код промокода'); return; }
        await run(() => api('/api/admin/promocodes', {
            method: 'POST',
            body: JSON.stringify({
                ...promoForm,
                code: promoForm.code.trim(),
                maxActivations: Number(promoForm.maxActivations || 1),
                bonusRequests: Number(promoForm.bonusRequests || 0),
                bonusImages: Number(promoForm.bonusImages || 0),
                discountPercent: Number(promoForm.discountPercent || 0)
            })
        }), 'Промокод создан');
        setPromoForm({ code: '', maxActivations: 1, bonusRequests: 0, bonusImages: 0, discountPercent: 0 });
        loadCommerce();
    }

    async function loadMetrics() {
        const stats = await api('/api/admin/stats');
        setAdminStats(stats);
    }

    async function toggleFreeModeGlobal() {
        const result = await run(() => api('/api/admin/funnels/toggle-free-mode', { method: 'POST' }), 'Режим Free Mode изменён');
        if (result) setFreeMode(result.free_mode_enabled);
    }

    async function resetLimitsAll() {
        await run(() => api('/api/admin/funnels/reset-limits', { method: 'POST', body: JSON.stringify({ textCount: 10 }) }), 'Лимиты всем пользователям сброшены');
        loadUsers();
    }

    useEffect(() => {
        loadUsers();
        loadCommerce();
        loadMetrics();
    }, []);

    const filteredUsers = users.filter(u => {
        if (userFilter === 'premium') return u.is_premium;
        if (userFilter === 'blocked') return u.is_blocked;
        return true;
    });

    return (
        <div className="crm-super-container">
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
                        <Card>
                            <CardHeader eyebrow="Пользователи и Клиенты" title="Поиск и Клиенты" description="Поиск по ID, username или имени." />
                            <div className="crm-filter-bar">
                                {[['all', 'Все'], ['premium', 'Premium'], ['blocked', 'Заблокированные']].map(([val, lbl]) => (
                                    <button key={val} className={cn('crm-filter-btn', userFilter === val && 'active')} onClick={() => setUserFilter(val)}>
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                            <div className="inline-controls">
                                <input value={userQuery} onChange={event => setUserQuery(event.target.value)} placeholder="ID, username или имя" />
                                <Button onClick={loadUsers}>Найти</Button>
                                <Button variant="outline" onClick={() => { setUserQuery(''); loadUsers(); }}>Сброс</Button>
                            </div>
                            <div className="managed-grid user-list-grid">
                                {filteredUsers.map(user => (
                                    <button className={cn('managed-row', 'managed-row-button', selectedUser?.user?.telegram_id === user.telegram_id && 'selected')} key={user.telegram_id} onClick={() => openUser(user.telegram_id)}>
                                        <Users size={15} />
                                        <div>
                                            <strong>{user.first_name || 'Без имени'}</strong>
                                            <span>@{user.username || '—'} · {user.telegram_id}</span>
                                            <span className="user-balance-badge">💬 {user.free_requests_left ?? 0} · 🖼️ {user.image_balance ?? 0}</span>
                                            <span className="user-balance-badge">Инициативы: {user.initiatives_used_today ?? 0}/{user.initiative_limit_effective ?? 3} · осталось {user.initiatives_remaining_today ?? 0}</span>
                                        </div>
                                        <Badge variant={user.is_blocked ? 'red' : user.is_premium ? 'green' : 'blue'}>{user.is_blocked ? 'Заблокирован' : user.is_premium ? 'Premium' : 'Free'}</Badge>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>

                    <div className="crm-main">
                        {selectedUser ? (
                            <Card className="user-workspace-card">
                                <CardHeader
                                    eyebrow={`Пользователь #${selectedUser.user.telegram_id}`}
                                    title={selectedUser.user.first_name || 'Без имени'}
                                    description={`@{${selectedUser.user.username || 'без_юзернейма'}} · Зарегистрирован: ${selectedUser.user.created_at || '—'}`}
                                    action={
                                        <div className="dossier-header-actions">
                                            <Badge variant={selectedUser.user.is_blocked ? 'red' : selectedUser.user.is_premium ? 'green' : 'blue'}>
                                                {selectedUser.user.is_blocked ? 'Заблокирован' : selectedUser.user.is_premium ? 'Premium' : 'Free'}
                                            </Badge>
                                            <Button size="sm" variant={selectedUser.user.is_blocked ? 'primary' : 'warning'} onClick={() => userAction(selectedUser.user.is_blocked ? 'unblock' : 'block')}>
                                                {selectedUser.user.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                                            </Button>
                                        </div>
                                    }
                                />

                                <div className="dossier-subnav">
                                    <button className={cn('dossier-tab-btn', dossierTab === 'balance' && 'active')} onClick={() => setDossierTab('balance')}>⚙️ Балансы и Доступ</button>
                                    <button className={cn('dossier-tab-btn', dossierTab === 'memory' && 'active')} onClick={() => setDossierTab('memory')}>🧠 Память ({facts.length})</button>
                                    <button className={cn('dossier-tab-btn', dossierTab === 'memory-graph' && 'active')} onClick={() => setDossierTab('memory-graph')}><Network size={14} /> Memory Graph</button>
                                    <button className={cn('dossier-tab-btn', dossierTab === 'why' && 'active')} onClick={() => setDossierTab('why')}><BrainCircuit size={14} /> Почему ответила так</button>
                                    <button className={cn('dossier-tab-btn', dossierTab === 'relationship' && 'active')} onClick={() => setDossierTab('relationship')}>🫀 Отношения</button>
                                    <button className={cn('dossier-tab-btn', dossierTab === 'chat' && 'active')} onClick={() => setDossierTab('chat')}>💬 Диалоги ({selectedUser.conversations?.length || 0})</button>
                                    <button className={cn('dossier-tab-btn', dossierTab === 'payments' && 'active')} onClick={() => setDossierTab('payments')}>💳 Платежи ({selectedUser.payments?.length || 0})</button>
                                </div>

                                <div className="crm-workspace-sections">
                                    {dossierTab === 'balance' && (
                                        <div className="crm-section balance-section">
                                            <h3>Выдача и пресеты балансов</h3>
                                            <div className="preset-group">
                                                <span>Быстро добавить 💬 Текст:</span>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(10, 0)}>+10 💬</Button>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(50, 0)}>+50 💬</Button>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(100, 0)}>+100 💬</Button>
                                            </div>
                                            <div className="preset-group">
                                                <span>Быстро добавить 🖼️ Фото:</span>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 5)}>+5 🖼️</Button>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 20)}>+20 🖼️</Button>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 50, 0)}>+50 🖼️</Button>
                                            </div>
                                            <div className="preset-group">
                                                <span>Быстро добавить 🎙️ Голосовые:</span>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 0, 5)}>+5 🎙️</Button>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 0, 20)}>+20 🎙️</Button>
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 0, 50)}>+50 🎙️</Button>
                                            </div>
                                            <div className="inline-controls" style={{ marginTop: 12 }}>
                                                <label>Текстовый баланс<input type="number" value={userForm.textBalance} onChange={event => setUserForm({ ...userForm, textBalance: event.target.value })} /></label>
                                                <label>Баланс фото<input type="number" value={userForm.imageBalance} onChange={event => setUserForm({ ...userForm, imageBalance: event.target.value })} /></label>
                                                <label>Баланс голосовых<input type="number" value={userForm.voiceBalance} onChange={event => setUserForm({ ...userForm, voiceBalance: event.target.value })} /></label>
                                                <Button size="sm" onClick={() => userAction('set_balances', userForm)}>Сохранить баланс</Button>
                                            </div>
                                            <h3 style={{ marginTop: 24 }}>Инициативы</h3>
                                            <div className="field-hint">Сегодня использовано: {selectedUser.user.initiatives_used_today ?? 0}. Эффективный лимит: {selectedUser.user.initiative_limit_effective ?? 3}. Осталось: {selectedUser.user.initiatives_remaining_today ?? 0}.</div>
                                            <div className="inline-controls" style={{ marginTop: 12 }}>
                                                <label>Личный лимит в сутки<input type="number" min="0" max="20" value={initiativeLimitForm} placeholder="Общий лимит" onChange={event => setInitiativeLimitForm(event.target.value)} /></label>
                                                <Button size="sm" onClick={saveInitiativeLimit}>Сохранить лимит</Button>
                                                <Button size="sm" variant="outline" onClick={() => { setInitiativeLimitForm(''); saveInitiativeLimit(''); }}>Использовать общий</Button>
                                            </div>
                                        </div>
                                    )}

                                    {dossierTab === 'memory' && (
                                        <div className="crm-section memory-section">
                                            <h3>Память и Факты о пользователе</h3>
                                            <div className="inline-controls">
                                                <input value={factText} onChange={event => setFactText(event.target.value)} placeholder="Новый факт (например, Любит аниме и кофе)" />
                                                <Button onClick={addFact}>Добавить факт</Button>
                                            </div>
                                            <div className="facts-list">
                                                {facts.length ? facts.map(fact => (
                                                    <div className="managed-row" key={fact.id}>
                                                        <Database size={15} />
                                                        <div><strong>{fact.fact}</strong><span>{fact.source || 'manual'} · {fact.is_active === false ? 'выключен' : 'активен'}</span></div>
                                                        <Button size="sm" variant="outline" onClick={() => toggleFact(fact.id, fact.is_active === false)}>{fact.is_active === false ? 'Включить' : 'Выключить'}</Button>
                                                        <ConfirmAction title="Удалить факт?" description="Факт перестанет использоваться в памяти пользователя." confirmText="Удалить" variant="danger" onConfirm={() => run(() => api(`/api/admin/memory/facts/${fact.id}`, { method: 'DELETE', body: JSON.stringify({ userId: factUserId.trim() }) }), 'Факт удалён').then(loadFacts)}>Удалить</ConfirmAction>
                                                    </div>
                                                )) : <div className="empty-state">Фактов в памяти не найдено.</div>}
                                            </div>
                                        </div>
                                    )}

                                    {dossierTab === 'memory-graph' && (
                                        <div className="crm-section memory-graph-section">
                                            <div className="crm-section-heading"><div><span className="eyebrow">Структура памяти</span><h3>Memory Graph</h3><p>Типы узлов, активность, связи и факты, которые были заменены.</p></div><Button size="sm" variant="outline" onClick={() => loadMemoryInsights()}><RefreshCw size={14} /> Обновить</Button></div>
                                            <MemoryGraph graph={memoryGraph} loading={memoryGraphState.loading} error={memoryGraphState.error} onRetry={() => loadMemoryInsights()} />
                                        </div>
                                    )}

                                    {dossierTab === 'why' && (
                                        <div className="crm-section response-trace-section">
                                            <div className="crm-section-heading"><div><span className="eyebrow">Response trace</span><h3>Почему ответила так</h3><p>Источник, задержка, fallback, выбранные факты и оценки retrieval.</p></div><Button size="sm" variant="outline" onClick={() => loadMemoryInsights()}><RefreshCw size={14} /> Обновить</Button></div>
                                            <RetrievalTrace retrievals={retrievals} loading={retrievalState.loading} error={retrievalState.error} onRetry={() => loadMemoryInsights()} />
                                        </div>
                                    )}

                                    {dossierTab === 'relationship' && (
                                        <div className="crm-section relationship-section">
                                            <h3>Динамические отношения</h3>
                                            <div className="inline-controls">
                                                <label>Trust<input type="number" min="0" max="100" value={relationshipForm.trust} onChange={event => setRelationshipForm({ ...relationshipForm, trust: Number(event.target.value) })} /></label>
                                                <label>Affection<input type="number" min="0" max="100" value={relationshipForm.affection} onChange={event => setRelationshipForm({ ...relationshipForm, affection: Number(event.target.value) })} /></label>
                                                <label>Irritation<input type="number" min="0" max="100" value={relationshipForm.irritation} onChange={event => setRelationshipForm({ ...relationshipForm, irritation: Number(event.target.value) })} /></label>
                                                <Button onClick={saveRelationship}>Сохранить</Button>
                                            </div>
                                            <div className="facts-list">
                                                {(selectedUser.relationship?.events || []).map(event => (
                                                    <div className="managed-row" key={event.id}>
                                                        <Database size={15} />
                                                        <div><strong>{event.event_type} · intensity {Number(event.intensity).toFixed(2)}</strong><span>trust {Number(event.trust_delta).toFixed(1)} · affection {Number(event.affection_delta).toFixed(1)} · irritation {Number(event.irritation_delta).toFixed(1)}</span></div>
                                                    </div>
                                                ))}
                                                {!selectedUser.relationship?.events?.length && <div className="empty-state">Relationship events ещё не накопились.</div>}
                                            </div>
                                        </div>
                                    )}

                                    {dossierTab === 'chat' && (
                                        <div className="crm-section chat-section">
                                            <h3>История сообщений (Визуальный Мессенджер)</h3>
                                            <div className="crm-chat-window">
                                                {(selectedUser.conversations || []).length ? (selectedUser.conversations || []).map(conv => (
                                                    <div className={cn('chat-bubble-row', conv.role === 'user' || conv.kind === 'user_text' ? 'user-side' : 'lera-side')} key={conv.id}>
                                                        <div className="chat-bubble">
                                                            <div className="chat-bubble-header">
                                                                <strong>{conv.role === 'user' || conv.kind === 'user_text' ? (selectedUser.user.first_name || 'Пользователь') : 'Лера (Бот)'}</strong>
                                                                <span>{formatTime(conv.created_at)}</span>
                                                            </div>
                                                            <p>{conv.text || conv.user_text || conv.parsed_response || '—'}</p>
                                                            {conv.model && <Badge variant="muted" className="chat-model-badge">{conv.model}</Badge>}
                                                        </div>
                                                    </div>
                                                )) : <div className="empty-state">История переписки пуста.</div>}
                                            </div>
                                        </div>
                                    )}

                                    {dossierTab === 'payments' && (
                                        <div className="crm-section payments-section">
                                            <h3>История транзакций и покупок</h3>
                                            <div className="payments-list">
                                                {(selectedUser.payments || []).length ? (selectedUser.payments || []).map(pay => (
                                                    <div className="managed-row" key={pay.id}>
                                                        <CreditCard size={15} />
                                                        <div>
                                                            <strong>Пакет: {pay.package_id || 'Стандарт'}</strong>
                                                            <span>Сумма: {pay.amount_rub || pay.stars} ₽ / ⭐ · ID: {pay.id}</span>
                                                        </div>
                                                        <Badge variant="green">{pay.status || 'SUCCESS'}</Badge>
                                                    </div>
                                                )) : <div className="empty-state">Платежей не найдено.</div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ) : (
                            <Card className="empty-workspace-card">
                                <div className="empty-state">
                                    <Users size={32} />
                                    <h3>Выберите пользователя</h3>
                                    <p>Нажмите на любого пользователя в списке слева для просмотра профиля, выдачи баланса, чат-лога и управления памятью.</p>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {crmTab === 'promocodes' && (
                <div className="crm-commerce-layout">
                    <Card>
                        <CardHeader eyebrow="Тарифы" title="Действующие пакеты подписок" description="Настройки стоимости и объёма выданных запросов." />
                        <div className="packages-grid">
                            {Object.entries(packages).map(([key, value]) => (
                                <div className="managed-row" key={key}>
                                    <strong>{key}</strong>
                                    <span>{value.stars} ⭐ · {value.rub} ₽ · 💬 {value.text} текст · 🖼️ {value.img} фото</span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Промокоды" title="Продажи" description="Промокоды и Пакеты" />
                        <div className="inline-controls promo-form">
                            <input value={promoForm.code} placeholder="Код (например, LERA2026)" onChange={event => setPromoForm({ ...promoForm, code: event.target.value })} />
                            <input type="number" value={promoForm.bonusRequests} placeholder="Бонус 💬" onChange={event => setPromoForm({ ...promoForm, bonusRequests: event.target.value })} />
                            <input type="number" value={promoForm.bonusImages} placeholder="Бонус 🖼️" onChange={event => setPromoForm({ ...promoForm, bonusImages: event.target.value })} />
                            <input type="number" value={promoForm.maxActivations} placeholder="Активаций макс" onChange={event => setPromoForm({ ...promoForm, maxActivations: event.target.value })} />
                            <input type="number" value={promoForm.discountPercent} placeholder="Скидка %" onChange={event => setPromoForm({ ...promoForm, discountPercent: event.target.value })} />
                            <Button onClick={addPromocode}>Создать промокод</Button>
                        </div>
                        <div className="promocodes-list">
                            {promocodes.map(promo => (
                                <div className="managed-row" key={promo.id}>
                                    <Tag size={15} />
                                    <div>
                                        <strong>{promo.code}</strong>
                                        <span>💬 {promo.bonus_requests} запросов · 🖼️ {promo.bonus_images} фото · {promo.max_activations || 1} макс · {promo.discount_percent || 0}% скидка</span>
                                    </div>
                                    <ConfirmAction title="Удалить промокод?" description="Код больше нельзя будет активировать." confirmText="Удалить" variant="danger" onConfirm={() => run(() => api(`/api/admin/promocodes/${promo.id}`, { method: 'DELETE' }), 'Промокод удалён').then(loadCommerce)}>Удалить</ConfirmAction>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {crmTab === 'metrics' && (
                <div className="crm-metrics-layout">
                    <Card>
                        <CardHeader eyebrow="Бизнес-аналитика" title="Ключевые метрики CRM и Продаж" description="Сводка активных клиентов, подписок и общего дохода." />
                        <div className="crm-metrics-grid">
                            <div className="crm-metric-card">
                                <span>👥 Всего пользователей</span>
                                <strong>{adminStats?.stats?.totalUsers ?? users.length}</strong>
                            </div>
                            <div className="crm-metric-card">
                                <span>⚡ Активные сегодня</span>
                                <strong>{adminStats?.stats?.activeToday ?? '—'}</strong>
                            </div>
                            <div className="crm-metric-card">
                                <span>💎 Premium подписчики</span>
                                <strong>{users.filter(u => u.is_premium).length}</strong>
                            </div>
                            <div className="crm-metric-card">
                                <span>💰 Доход Stars & Рубли</span>
                                <strong>{adminStats?.stats?.totalRevenue ?? '⭐ / ₽'}</strong>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Глобальное управление" title="Массовые сбросы и Режим Воронки" description="Действия затронут лимиты и тарифы всех пользователей приложения." />
                        <div className="inline-controls">
                            <Button variant={freeMode ? 'warning' : 'outline'} onClick={toggleFreeModeGlobal}>
                                {freeMode ? 'Free Mode ВКЛЮЧЁН (Безлимит)' : 'Free Mode ВЫКЛЮЧЁН'}
                            </Button>
                            <ConfirmAction title="Сбросить лимиты ВСЕМ?" description="У всех пользователей текстовый баланс сбросится на 10 запросов." confirmText="Сбросить всем" variant="warning" onConfirm={resetLimitsAll}>
                                Сбросить лимиты всем юзерам (10 💬)
                            </ConfirmAction>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

function PhotoThumbnail({ photo }) {
    const [failed, setFailed] = useState(false);
    return <div className={cn('photo-thumbnail', failed && 'photo-thumbnail-fallback')}>
        {!failed && <img src={`/api/admin/photos/${photo.id}/preview`} alt={photo.caption || `Фото Леры №${photo.id}`} onError={() => setFailed(true)} />}
        {failed && <><Image size={24} /><span>Превью недоступно</span></>}
    </div>;
}

function PhotoMetaEditor({ photo, onSave }) {
    const [form, setForm] = useState({
        caption: photo.caption || '',
        tags: Array.isArray(photo.tags) ? photo.tags.join(', ') : '',
        outfit_tags: Array.isArray(photo.outfit_tags) ? photo.outfit_tags.join(', ') : '',
        access_level: photo.access_level || 'free',
        time_of_day: photo.time_of_day || 'any',
        explicitness: Number(photo.explicitness || 0)
    });
    return <details className="photo-edit-details">
        <summary>Изменить метаданные</summary>
        <div className="photo-edit-form">
            <input value={form.caption} placeholder="Описание" onChange={event => setForm({ ...form, caption: event.target.value })} />
            <input value={form.tags} placeholder="Теги через запятую" onChange={event => setForm({ ...form, tags: event.target.value })} />
            <input value={form.outfit_tags} placeholder="Теги наряда" onChange={event => setForm({ ...form, outfit_tags: event.target.value })} />
            <label>Откровенность<input type="number" min="0" max="100" value={form.explicitness} onChange={event => setForm({ ...form, explicitness: Number(event.target.value) })} /></label>
            <label>Доступ<select value={form.access_level} onChange={event => setForm({ ...form, access_level: event.target.value })}><option value="free">Free</option><option value="premium">Premium</option></select></label>
            <label>Время<select value={form.time_of_day} onChange={event => setForm({ ...form, time_of_day: event.target.value })}><option value="any">Любое</option><option value="day">День</option><option value="night">Ночь</option></select></label>
            <Button size="sm" onClick={() => onSave({
                ...form,
                tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
                outfit_tags: form.outfit_tags.split(',').map(tag => tag.trim()).filter(Boolean)
            })}>Сохранить</Button>
        </div>
    </details>;
}

function ContentPanel({ toast }) {
    const [contentTab, setContentTab] = useState('photos');
    const [photoFilter, setPhotoFilter] = useState('all');

    const [photos, setPhotos] = useState([]);
    const [photoForm, setPhotoForm] = useState({ file_id: '', caption: '', tags: '', outfit_tags: '', explicitness: 0, access_level: 'free', time_of_day: 'any' });
    const [photoFileName, setPhotoFileName] = useState('');
    const [catalog, setCatalog] = useState([]);
    const [contentSent, setContentSent] = useState([]);
    const [contentForm, setContentForm] = useState({ telegram_type: 'link', telegram_file_id: '', url: '', description: '', enabled: true, allow_in_dialogue: true, allow_initiative: true, allow_channel: false });
    const [contentChannelId, setContentChannelId] = useState('-1003729264804');

    const [channel, setChannel] = useState(null);
    const [channelHistory, setChannelHistory] = useState([]);
    const [channelForm, setChannelForm] = useState({
        channelId: '',
        channelUrl: '',
        frequencyHours: 4,
        messagesCount: '1',
        isEnabled: false,
        topics: ['thoughts', 'life'],
        topicWeights: { thoughts: 50, flirt: 0, life: 50, jokes: 0, questions: 0 },
        mediaMode: 'none',
        temperature: 0.7,
        inheritLeraPrompt: false,
        includeDayContext: false,
        publicProfileEnabled: true,
        publicFactsEnabled: false,
        publicFacts: [],
        creativity: 0.6,
        ctaStyle: '',
        judgeMode: 'ENFORCE',
        judgeProviderId: '',
        judgeModel: '',
        judgePrompt: '',
        judgeTimeoutMs: 5000,
        judgeMaxTokens: 120,
        promptBlocks: { voice: '', context: '', restrictions: '', cta: '' }
    });
    const [channelDraft, setChannelDraft] = useState(null);
    const [draftText, setDraftText] = useState('');
    const [draftMediaMode, setDraftMediaMode] = useState('inherit');
    const [draftTopic, setDraftTopic] = useState('random');
    const [generatingAiPreview, setGeneratingAiPreview] = useState(false);

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

    async function loadPhotos() {
        const result = await run(() => api('/api/admin/photos'));
        if (result) setPhotos(result.photos || []);
    }

    async function loadContent() {
        const result = await run(() => api('/api/admin/content'));
        if (result) {
            setCatalog(result.content || []);
            setContentSent(result.sent || []);
            setContentChannelId(result.contentChannelId || '-1003729264804');
        }
    }

    async function saveContentChannelId() {
        await run(() => api('/api/admin/content/settings', {
            method: 'PATCH',
            body: JSON.stringify({ content_channel_id: contentChannelId })
        }), 'Канал контента сохранён');
    }

    async function addContent() {
        const result = await run(() => api('/api/admin/content', {
            method: 'POST', body: JSON.stringify(contentForm)
        }), 'Контент добавлен');
        if (result) {
            setContentForm({ telegram_type: 'link', telegram_file_id: '', url: '', description: '', enabled: true, allow_in_dialogue: true, allow_initiative: true });
            loadContent();
        }
    }

    async function updateContent(item, values) {
        await run(() => api(`/api/admin/content/${item.id}`, { method: 'PATCH', body: JSON.stringify(values) }), 'Контент сохранён');
        loadContent();
    }

    async function addPhoto() {
        if (!photoForm.file_id.trim()) { if (toast) toast('Укажите Telegram file_id'); return; }
        await run(() => api('/api/admin/photos', {
            method: 'POST',
            body: JSON.stringify({
                ...photoForm,
                file_id: photoForm.file_id.trim(),
                explicitness: Number(photoForm.explicitness || 0),
                tags: photoForm.tags,
                outfit_tags: photoForm.outfit_tags,
                access_level: photoForm.access_level,
                time_of_day: photoForm.time_of_day
            })
        }), 'Фото добавлено в каталог');
        setPhotoForm({ file_id: '', caption: '', tags: '', outfit_tags: '', explicitness: 0, access_level: 'free', time_of_day: 'any' });
        loadPhotos();
    }

    async function uploadPhotoFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { if (toast) toast('Файл должен быть меньше 10 МБ'); return; }
        setPhotoFileName(file.name);
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result;
            const result = await run(() => api('/api/admin/photos/upload', {
                method: 'POST',
                body: JSON.stringify({
                    data: dataUrl,
                    filename: file.name,
                    caption: photoForm.caption || file.name,
                    access_level: photoForm.access_level,
                    time_of_day: photoForm.time_of_day,
                    explicitness: Number(photoForm.explicitness || 0),
                    tags: photoForm.tags ? photoForm.tags.split(',').map(t => t.trim()) : [],
                    outfit_tags: photoForm.outfit_tags ? photoForm.outfit_tags.split(',').map(t => t.trim()) : []
                })
            }), 'Файл загружен и зарегистрирован!');
            if (result) {
                event.target.value = '';
                setPhotoFileName('');
                loadPhotos();
            }
        };
        reader.readAsDataURL(file);
    }

    async function loadChannel() {
        const [result, history] = await Promise.all([
            api('/api/admin/channel/settings'),
            api('/api/admin/channel/history?limit=30')
        ]);
        setChannel(result);
        setChannelHistory(history.posts || []);
        const selectedTopics = result.settings?.topics || ['thoughts', 'life'];
        const tw = normalizeTopicShares(selectedTopics, result.settings?.topic_weights || { thoughts: 50, life: 50 });
        setChannelForm({
            channelId: result.channelId || '',
            channelUrl: result.channelUrl || '',
            frequencyHours: result.settings?.frequency_hours || 4,
            messagesCount: result.settings?.messages_count || '1',
            isEnabled: Boolean(result.settings?.is_enabled),
            topics: selectedTopics,
            topicWeights: tw,
            mediaMode: result.settings?.media_mode || 'none',
            temperature: result.settings?.temperature ?? 0.7,
            inheritLeraPrompt: false,
            includeDayContext: false,
            publicProfileEnabled: result.settings?.public_profile_enabled !== false,
            publicFactsEnabled: Boolean(result.settings?.public_facts_enabled),
            publicFacts: result.settings?.public_facts || [],
            creativity: result.settings?.creativity ?? 0.6,
            ctaStyle: result.settings?.cta_style || '',
            judgeMode: result.settings?.judge_mode || 'ENFORCE',
            judgeProviderId: result.settings?.judge_provider_id || '',
            judgeModel: result.settings?.judge_model || '',
            judgePrompt: result.settings?.judge_prompt || '',
            judgeTimeoutMs: result.settings?.judge_timeout_ms || 5000,
            judgeMaxTokens: result.settings?.judge_max_tokens || 120,
            commentsEnabled: result.settings?.comments_enabled !== false,
            reactionChance: result.settings?.reaction_chance ?? 40,
            commentChance: result.settings?.comment_chance ?? 15,
            recognizeUsers: result.settings?.recognize_users !== false,
            commentsPrompt: result.settings?.comments_prompt || '',
            promptBlocks: { voice: '', context: '', restrictions: '', cta: '', ...(result.settings?.prompt_blocks || {}) }
        });
    }

    async function saveChannel() {
        await run(() => api('/api/admin/channel/settings', {
            method: 'POST',
            body: JSON.stringify(channelForm)
        }), 'Настройки автопостинга сохранены');
        loadChannel();
    }

    async function generateDraft(override = {}) {
        const mode = override.mediaMode || (draftMediaMode === 'inherit' ? channelForm.mediaMode : draftMediaMode);
        const topic = override.topic || (draftTopic === 'random' ? undefined : draftTopic);
        const result = await run(() => api('/api/admin/channel/draft', {
            method: 'POST',
            body: JSON.stringify({
                media_mode: mode,
                topic: topic
            })
        }));
        if (result?.draft) {
            setChannelDraft(result.draft);
            setDraftText(result.draft.text || '');
            if (toast) toast('Черновик готов — проверьте текст и медиа перед публикацией');
        }
    }

    async function generateDraftAiPhoto() {
        if (!channelDraft || !draftText.trim()) return;
        setGeneratingAiPreview(true);
        try {
            const res = await api('/api/admin/channel/preview-ai-photo', {
                method: 'POST',
                body: JSON.stringify({
                    topic: channelDraft.topic || 'life',
                    text: draftText.trim()
                })
            });
            if (res?.preview_url) {
                setChannelDraft(prev => ({
                    ...prev,
                    media: {
                        type: 'ai_photo',
                        preview_url: res.preview_url,
                        file_id: res.file_id || null,
                        description: 'Сгенерированное ИИ-фото (Gemini)'
                    }
                }));
                if (toast) toast('AI-фото успешно сгенерировано для превью!');
            }
        } catch (e) {
            if (toast) toast(`Ошибка генерации фото: ${e.message}`, 'error');
        } finally {
            setGeneratingAiPreview(false);
        }
    }

    async function publishDraft() {
        if (!channelDraft || !draftText.trim()) return;
        const result = await run(() => api('/api/admin/channel/publish-draft', {
            method: 'POST',
            body: JSON.stringify({
                text: draftText.trim(),
                topic: channelDraft.topic,
                provenance: channelDraft.provenance,
                media_content_id: channelDraft.media_content_id,
                media: channelDraft.media
            })
        }), 'Пост опубликован в Telegram-канале');
        if (result) {
            setChannelDraft(null);
            setDraftText('');
            loadChannel();
        }
    }

    const [imageSettings, setImageSettings] = useState(null);
    const [imageProviders, setImageProviders] = useState([]);
    const [imageForm, setImageForm] = useState({
        provider_id: '',
        model: 'gemini-2.5-flash',
        style_prompt: '',
        auto_generate_channel: true,
        auto_save_catalog: true,
        master_reference_dataurl: ''
    });
    const [testPrompt, setTestPrompt] = useState('');
    const [testSaveToCatalog, setTestSaveToCatalog] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [testingImage, setTestingImage] = useState(false);

    async function loadImageSettings() {
        const [res, provRes] = await Promise.all([
            run(() => api('/api/admin/image-settings')),
            run(() => api('/api/admin/providers')).catch(() => ({ providers: [] }))
        ]);
        if (res?.settings) {
            setImageSettings(res.settings);
            setImageForm({
                provider_id: res.settings.provider_id || '',
                model: res.settings.model || 'gemini-2.5-flash',
                style_prompt: res.settings.style_prompt || '',
                auto_generate_channel: Boolean(res.settings.auto_generate_channel),
                auto_save_catalog: Boolean(res.settings.auto_save_catalog),
                master_reference_dataurl: res.settings.master_reference_dataurl || ''
            });
        }
        if (provRes?.providers) setImageProviders(provRes.providers);
    }

    async function saveImageSettings() {
        const saved = await run(() => api('/api/admin/image-settings', {
            method: 'POST',
            body: JSON.stringify({
                provider_id: imageForm.provider_id ? Number(imageForm.provider_id) : null,
                model: imageForm.model,
                style_prompt: imageForm.style_prompt,
                auto_generate_channel: imageForm.auto_generate_channel,
                auto_save_catalog: imageForm.auto_save_catalog
            })
        }), 'Настройки генерации сохранены');
        if (saved) loadImageSettings();
    }

    async function uploadMasterRef(file) {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            if (toast) toast('Файл больше 10 МБ', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result;
            await run(() => api('/api/admin/image-settings', {
                method: 'POST',
                body: JSON.stringify({ master_reference_dataurl: dataUrl })
            }), 'Мастер-референс успешно сохранён');
            loadImageSettings();
        };
        reader.readAsDataURL(file);
    }

    async function clearMasterRef() {
        await run(() => api('/api/admin/image-settings', {
            method: 'POST',
            body: JSON.stringify({ master_reference_dataurl: '' })
        }));
        await run(() => api('/api/admin/photos/unset-reference', { method: 'POST' }));
        if (toast) toast('Мастер-референс сброшен');
        loadImageSettings();
        loadPhotos();
    }

    async function setAsMasterRef(photoId) {
        await run(() => api(`/api/admin/photos/${photoId}/set-reference`, { method: 'POST' }), `Фото #${photoId} назначено мастер-референсом`);
        loadImageSettings();
        loadPhotos();
    }

    async function runImageTest() {
        if (!testPrompt.trim()) {
            if (toast) toast('Введите сюжет для генерации', 'error');
            return;
        }
        setTestingImage(true);
        setTestResult(null);
        try {
            const res = await api('/api/admin/image-generation/test', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: testPrompt.trim(),
                    providerId: imageForm.provider_id ? Number(imageForm.provider_id) : undefined,
                    model: imageForm.model,
                    saveToCatalog: testSaveToCatalog
                })
            });
            setTestResult(res);
            if (res?.success) {
                if (toast) toast(res.imageDataUrl ? 'Изображение успешно сгенерировано!' : 'Ответ получен');
                if (testSaveToCatalog) loadPhotos();
            }
        } catch (err) {
            setTestResult({ error: err.message });
            if (toast) toast(err.message, 'error');
        } finally {
            setTestingImage(false);
        }
    }

    async function updatePhoto(photo, values) {
        await run(() => api(`/api/admin/photos/${photo.id}`, { method: 'PATCH', body: JSON.stringify(values) }), 'Метаданные фото сохранены');
        loadPhotos();
    }

    const [voiceSettings, setVoiceSettings] = useState(null);
    const [voiceForm, setVoiceForm] = useState({
        provider_id: '',
        model: 'cosyvoice3',
        voice: 'female',
        prompt_text: '',
        auto_voice_messages: true,
        audio_sample_dataurl: ''
    });
    const [testVoiceText, setTestVoiceText] = useState('Привет! Я Лера, учусь в Питере на втором курсе. Как твои дела?');
    const [testVoiceSendTg, setTestVoiceSendTg] = useState(false);
    const [testVoiceResult, setTestVoiceResult] = useState(null);
    const [testingVoice, setTestingVoice] = useState(false);

    async function loadVoiceSettings() {
        const res = await run(() => api('/api/admin/voice-settings'));
        if (res?.settings) {
            setVoiceSettings(res.settings);
            setVoiceForm({
                provider_id: res.settings.provider_id || '',
                model: res.settings.model || 'cosyvoice3',
                voice: res.settings.voice || 'female',
                prompt_text: res.settings.prompt_text || '',
                auto_voice_messages: res.settings.auto_voice_messages !== false,
                audio_sample_dataurl: res.settings.audio_sample_dataurl || ''
            });
        }
    }

    async function saveVoiceSettings() {
        const saved = await run(() => api('/api/admin/voice-settings', {
            method: 'POST',
            body: JSON.stringify({
                provider_id: voiceForm.provider_id ? Number(voiceForm.provider_id) : null,
                model: voiceForm.model,
                voice: voiceForm.voice,
                prompt_text: voiceForm.prompt_text,
                auto_voice_messages: voiceForm.auto_voice_messages
            })
        }), 'Настройки голоса сохранены');
        if (saved) loadVoiceSettings();
    }

    async function uploadVoiceSample(file) {
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            if (toast) toast('Аудиофайл больше 20 МБ', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result;
            await run(() => api('/api/admin/voice-settings', {
                method: 'POST',
                body: JSON.stringify({ audio_sample_dataurl: dataUrl })
            }), 'Голосовой сэмпл Леры успешно сохранён');
            loadVoiceSettings();
        };
        reader.readAsDataURL(file);
    }

    async function clearVoiceSample() {
        await run(() => api('/api/admin/voice-settings', {
            method: 'POST',
            body: JSON.stringify({ audio_sample_dataurl: '' })
        }), 'Голосовой сэмпл сброшен');
        loadVoiceSettings();
    }

    async function runVoiceTest() {
        if (!testVoiceText.trim()) {
            if (toast) toast('Введите текст для озвучки', 'error');
            return;
        }
        setTestingVoice(true);
        setTestVoiceResult(null);
        try {
            const res = await api('/api/admin/voice-generation/test', {
                method: 'POST',
                body: JSON.stringify({
                    text: testVoiceText.trim(),
                    sendToTelegram: testVoiceSendTg
                })
            });
            setTestVoiceResult(res);
            if (res?.success) {
                if (toast) toast(res.telegramSent ? 'Голосовое отправлено в Telegram и готово к прослушиванию!' : 'Голос сгенерирован!');
            }
        } catch (err) {
            setTestVoiceResult({ error: err.message });
            if (toast) toast(err.message, 'error');
        } finally {
            setTestingVoice(false);
        }
    }

    useEffect(() => {
        loadPhotos();
        loadContent();
        loadChannel();
        loadImageSettings();
        loadVoiceSettings();
    }, []);

    const filteredPhotos = photos.filter(p => {
        if (photoFilter === 'free') return p.access_level === 'free';
        if (photoFilter === 'premium') return p.access_level === 'premium';
        if (photoFilter === 'spicy') return (p.explicitness || 0) >= 50;
        return true;
    });

    const TOPIC_LABELS = {
        thoughts: 'Мысли Леры',
        flirt: 'Флирт и Игривость',
        life: 'Личная жизнь',
        jokes: 'Юмор и Шутки',
        questions: 'Вопросы аудитории',
        meme: 'Мемы и картинки (#тгк)',
        repost: 'Репосты с мнением Леры'
    };
    const TOPIC_PROMPT_RULES = {
        thoughts: 'внутреннее ощущение или наблюдение из обычной жизни',
        flirt: 'лёгкий публичный флирт без обращения к конкретному человеку',
        life: 'бытовая деталь, маленькая неловкость или настроение',
        jokes: 'короткая ироничная шутка или наблюдение',
        questions: 'естественный вопрос подписчикам от первого лица',
        meme: 'дерзкая или смешная подпись к мему / картинке',
        repost: 'личное мнение и реакция на пересланный пост'
    };

    return (
        <div className="content-super-container">
            <div className="crm-subnav">
                <Button variant={contentTab === 'photos' ? 'primary' : 'outline'} size="sm" onClick={() => setContentTab('photos')}>
                    <Image size={14} /> 🖼️ Галерея и Загрузка фото ({photos.length})
                </Button>
                <Button variant={contentTab === 'image-gen' ? 'primary' : 'outline'} size="sm" onClick={() => { setContentTab('image-gen'); loadImageSettings(); }}>
                    <Sparkles size={14} /> 🎨 AI Генерация фото
                </Button>
                <Button variant={contentTab === 'voice-gen' ? 'primary' : 'outline'} size="sm" onClick={() => { setContentTab('voice-gen'); loadVoiceSettings(); }}>
                    🎙️ Голос (CosyVoice 3)
                </Button>
                <Button variant={contentTab === 'channel' ? 'primary' : 'outline'} size="sm" onClick={() => setContentTab('channel')}>
                    <Radio size={14} /> 📢 Автопостинг и Канал
                </Button>
                <Button variant={contentTab === 'catalog' ? 'primary' : 'outline'} size="sm" onClick={() => setContentTab('catalog')}>
                    Каталог контента ({catalog.length})
                </Button>
            </div>

            {contentTab === 'catalog' && (
                <div className="content-photos-layout">
                    <Card>
                        <CardHeader eyebrow="Источник каталога" title="Канал контента" description="Бот автоматически забирает из него музыку, TikTok, видео и ссылки. Тут же можно отправить в канал памятку с правилами." />
                        <div className="photo-upload-form">
                            <label>Telegram Channel ID<input value={contentChannelId} placeholder="-1003729264804" onChange={event => setContentChannelId(event.target.value)} /></label>
                            <Button onClick={saveContentChannelId}>Сохранить канал</Button>
                            <ConfirmAction
                                title="Опубликовать правила в канал?"
                                description="От имени Леры уйдёт один готовый пост с правилами оформления материалов."
                                confirmText="Опубликовать"
                                onConfirm={() => run(() => api('/api/admin/content/publish-guide', { method: 'POST', body: '{}' }), 'Правила опубликованы')}
                            >
                                Опубликовать правила
                            </ConfirmAction>
                            <Button variant="outline" onClick={() => run(() => api('/api/admin/initiatives/test', { method: 'POST', body: '{}' }), 'Инициатива в очереди: ответ может прийти в течение минуты')}>
                                Тест инициативы себе
                            </Button>
                        </div>
                    </Card>
                    <Card>
                        <CardHeader eyebrow="Музыка, TikTok и ссылки" title="Добавить материал" description="Посты из выбранного канала появляются здесь автоматически." />
                        <div className="photo-upload-form">
                            <label>Тип<select value={contentForm.telegram_type} onChange={event => setContentForm({ ...contentForm, telegram_type: event.target.value })}>{['link', 'audio', 'video', 'animation', 'document', 'photo'].map(type => <option key={type} value={type}>{type}</option>)}</select></label>
                            <input value={contentForm.telegram_file_id} placeholder="Telegram file_id для нативного медиа" onChange={event => setContentForm({ ...contentForm, telegram_file_id: event.target.value })} />
                            <input value={contentForm.url} placeholder="URL для link" onChange={event => setContentForm({ ...contentForm, url: event.target.value })} />
                            <input value={contentForm.description} placeholder="Короткое описание для Леры" onChange={event => setContentForm({ ...contentForm, description: event.target.value })} />
                            <label><input type="checkbox" checked={contentForm.allow_in_dialogue} onChange={event => setContentForm({ ...contentForm, allow_in_dialogue: event.target.checked })} /> В диалоге</label>
                            <label><input type="checkbox" checked={contentForm.allow_initiative} onChange={event => setContentForm({ ...contentForm, allow_initiative: event.target.checked })} /> В инициативе</label>
                            <label><input type="checkbox" checked={contentForm.allow_channel} onChange={event => setContentForm({ ...contentForm, allow_channel: event.target.checked })} /> В канале ТГК (#тгк)</label>
                            <Button onClick={addContent}>Добавить</Button>
                        </div>
                    </Card>
                    <Card>
                        <CardHeader eyebrow="Каталог" title="Доступные материалы" description="Описание определяет, сможет ли Лера естественно связать материал с ответом." />
                        <div className="photos-card-grid">
                            {catalog.length ? catalog.map(item => (
                                <div className="photo-card" key={item.id}>
                                    <div className="photo-card-header">
                                        <Badge variant={item.enabled ? 'green' : 'muted'}>{item.telegram_type}</Badge>
                                        {item.allow_channel && <Badge variant="blue">#тгк</Badge>}
                                        <span>#{item.id}</span>
                                    </div>
                                    <div className="photo-card-body">
                                        <input defaultValue={item.description} onBlur={event => updateContent(item, { description: event.target.value })} />
                                        <span className="photo-file-id">{item.url || item.telegram_file_id}</span>
                                        <label><input type="checkbox" checked={item.enabled} onChange={event => updateContent(item, { enabled: event.target.checked })} /> Включён</label>
                                        <label><input type="checkbox" checked={item.allow_in_dialogue} onChange={event => updateContent(item, { allow_in_dialogue: event.target.checked })} /> В диалоге</label>
                                        <label><input type="checkbox" checked={item.allow_initiative} onChange={event => updateContent(item, { allow_initiative: event.target.checked })} /> В инициативе</label>
                                        <label><input type="checkbox" checked={item.allow_channel} onChange={event => updateContent(item, { allow_channel: event.target.checked })} /> В канале ТГК</label>
                                    </div>
                                    <div className="photo-card-actions">
                                        <Button variant="outline" onClick={() => run(() => api(`/api/admin/content/${item.id}/test`, { method: 'POST', body: '{}' }), 'Отправлено админу')}>Тест себе</Button>
                                        <ConfirmAction title="Удалить материал?" description="История прежних отправок сохранится." confirmText="Удалить" variant="danger" onConfirm={() => run(() => api(`/api/admin/content/${item.id}`, { method: 'DELETE' }), 'Контент удалён').then(loadContent)}>Удалить</ConfirmAction>
                                    </div>
                                </div>
                            )) : <div className="empty-state">Материалов пока нет.</div>}
                        </div>
                    </Card>
                    <Card>
                        <CardHeader eyebrow="Журнал" title="Последние отправки" description="Тестовые отправки сюда не попадают и лимиты не расходуют." />
                        <div className="activity-list">{contentSent.length ? contentSent.map(row => <div className="activity-row" key={row.id}><strong>user {row.user_id}</strong><span>{row.telegram_type || 'content'} · {row.description || row.content || 'без описания'}</span><time>{formatDate(row.occurred_at)}</time></div>) : <div className="empty-state">Отправок пока нет.</div>}</div>
                    </Card>
                </div>
            )}

            {contentTab === 'photos' && (
                <div className="content-photos-layout">
                    <Card>
                        <CardHeader eyebrow="Добавление медиа" title="Загрузить новое фото Леры" description="Сначала добавьте описание, затем выберите изображение с компьютера." />
                        <div className="photo-upload-container">
                            <div className="photo-upload-form">
                                <input value={photoForm.caption} placeholder="Описание картинки" onChange={event => setPhotoForm({ ...photoForm, caption: event.target.value })} />
                                <input value={photoForm.tags} placeholder="Теги (например, домашнее, селфи)" onChange={event => setPhotoForm({ ...photoForm, tags: event.target.value })} />
                                <input value={photoForm.outfit_tags} placeholder="Теги наряда (например, пижама, бельё)" onChange={event => setPhotoForm({ ...photoForm, outfit_tags: event.target.value })} />
                                <label>Откровенность (0-100%)<input type="number" min="0" max="100" value={photoForm.explicitness} onChange={event => setPhotoForm({ ...photoForm, explicitness: Number(event.target.value) })} /></label>
                                <label>Доступ<select value={photoForm.access_level} onChange={event => setPhotoForm({ ...photoForm, access_level: event.target.value })}><option value="free">Free (Бесплатное)</option><option value="premium">Premium (Платное)</option></select></label>
                                <label>Время суток<select value={photoForm.time_of_day} onChange={event => setPhotoForm({ ...photoForm, time_of_day: event.target.value })}><option value="any">Любое</option><option value="day">День</option><option value="night">Ночь</option></select></label>
                            </div>
                            <div className="file-dropzone-box">
                                <div><strong>Изображение</strong><span>JPG, PNG или WEBP · до 10 МБ</span></div>
                                <input id="photo-upload-input" className="photo-file-input" type="file" accept="image/*" onChange={uploadPhotoFile} />
                                <label className="ui-button ui-button-primary photo-file-button" htmlFor="photo-upload-input">Выбрать изображение</label>
                                <span className="photo-file-name">{photoFileName || 'Файл не выбран'}</span>
                            </div>
                            <details className="photo-expert-details">
                                <summary>Экспертный режим · Telegram file_id</summary>
                                <div className="photo-expert-row">
                                    <input value={photoForm.file_id} placeholder="Telegram file_id" onChange={event => setPhotoForm({ ...photoForm, file_id: event.target.value })} />
                                    <Button onClick={addPhoto}>Добавить по file_id</Button>
                                </div>
                            </details>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Галерея карточек" title="Каталог фотографий Леры" description="Превью, метаданные и удаление фотографий из базы." />
                        <div className="crm-filter-bar">
                            {[['all', 'Все'], ['free', 'Free'], ['premium', 'Premium'], ['spicy', 'Откровенные 50+']].map(([val, lbl]) => (
                                <button key={val} className={cn('crm-filter-btn', photoFilter === val && 'active')} onClick={() => setPhotoFilter(val)}>
                                    {lbl}
                                </button>
                            ))}
                        </div>
                        <div className="photos-card-grid">
                            {filteredPhotos.length ? filteredPhotos.map(photo => (
                                <div className="photo-card" key={photo.id}>
                                    <div className="photo-card-header">
                                        <Badge variant={photo.access_level === 'premium' ? 'green' : 'blue'}>{photo.access_level}</Badge>
                                        <Badge variant={photo.explicitness >= 50 ? 'red' : 'muted'}>{photo.explicitness}%🌶️</Badge>
                                        {Boolean(photo.is_reference) && <Badge variant="purple">👑 Master Ref</Badge>}
                                    </div>
                                    <PhotoThumbnail photo={photo} />
                                    <div className="photo-card-body">
                                        <strong>{photo.caption || 'Без описания'}</strong>
                                        <div className="photo-tags-list">
                                            {Array.isArray(photo.outfit_tags) ? photo.outfit_tags.map(t => <span key={t} className="photo-tag-pill">👗 {t}</span>) : null}
                                        </div>
                                    </div>
                                    <PhotoMetaEditor photo={photo} onSave={values => updatePhoto(photo, values)} />
                                    <details className="photo-expert-details">
                                        <summary>Технические данные</summary>
                                        <span className="photo-file-id">{photo.file_id}</span>
                                    </details>
                                    <div className="photo-card-actions">
                                        <Button size="xs" variant={photo.is_reference ? 'secondary' : 'outline'} onClick={() => setAsMasterRef(photo.id)}>
                                            {photo.is_reference ? '👑 Активный референс' : '⭐ Сделать референсом'}
                                        </Button>
                                        <ConfirmAction title="Удалить фото?" description="Фото исчезнет из каталога." confirmText="Удалить" variant="danger" onConfirm={() => run(() => api(`/api/admin/photos/${photo.id}`, { method: 'DELETE' }), 'Фото удалено').then(loadPhotos)}>
                                            Удалить
                                        </ConfirmAction>
                                    </div>
                                </div>
                            )) : <div className="empty-state">Фотографии не найдены.</div>}
                        </div>
                    </Card>
                </div>
            )}

            {contentTab === 'image-gen' && (
                <div className="content-photos-layout">
                    <Card>
                        <CardHeader eyebrow="Настройки генерации" title="Параметры AI Генерации (Gemini / Imagen)" description="Провайдер, модель и авто-постинг фото Леры." />
                        <div className="channel-settings-grid">
                            <label>Провайдер для фото
                                <select value={imageForm.provider_id} onChange={e => setImageForm({ ...imageForm, provider_id: e.target.value })}>
                                    <option value="">Авто-поиск (Gemini / Image)</option>
                                    {imageProviders.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.model_name})</option>
                                    ))}
                                </select>
                            </label>
                            <label>Модель генерации
                                <input value={imageForm.model} placeholder="gemini-2.5-flash / imagen-3.0" onChange={e => setImageForm({ ...imageForm, model: e.target.value })} />
                            </label>
                            <label className="channel-enabled">
                                <input type="checkbox" checked={imageForm.auto_generate_channel} onChange={e => setImageForm({ ...imageForm, auto_generate_channel: e.target.checked })} />
                                <strong>Генерировать фото к постам в ТГК</strong>
                            </label>
                            <label className="channel-enabled">
                                <input type="checkbox" checked={imageForm.auto_save_catalog} onChange={e => setImageForm({ ...imageForm, auto_save_catalog: e.target.checked })} />
                                <strong>Авто-сохранять генерации в каталог</strong>
                            </label>
                        </div>
                        <div className="channel-action-bar">
                            <Button onClick={saveImageSettings}>Сохранить настройки</Button>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Внешность Леры" title="Мастер-референс внешности" description="Эталонное фото лица и стиля Леры, передаваемое в Gemini Vision при генерации." />
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
                            <div style={{ width: 140, height: 140, minWidth: 140, borderRadius: 10, border: '2px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
                                {imageForm.master_reference_dataurl ? (
                                    <img src={imageForm.master_reference_dataurl} alt="Master Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : imageSettings?.master_reference_photo?.id ? (
                                    <img src={`/api/admin/photos/${imageSettings.master_reference_photo.id}/preview`} alt="Master Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span style={{ fontSize: 11, color: '#888', textAlign: 'center', padding: 8 }}>Нет активного референса</span>
                                )}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <label className="ui-button ui-button-primary photo-file-button" style={{ display: 'inline-block', width: 'fit-content' }}>
                                    Загрузить фото с компьютера
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadMasterRef(e.target.files?.[0])} />
                                </label>
                                <div>
                                    <Button size="sm" variant="outline" onClick={clearMasterRef}>Сбросить референс</Button>
                                </div>
                                <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
                                    Либо перейдите во вкладку «🖼️ Галерея» и нажмите «⭐ Сделать референсом» на любой существующей карточке.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Промпт-пресет" title="Базовый стиль-промпт Леры" description="Описывает постоянную внешность, атмосферу СПб, стиль съемки на iPhone и реализм." />
                        <div className="context-template-editor" style={{ marginTop: 12 }}>
                            <textarea
                                value={imageForm.style_prompt}
                                rows={4}
                                placeholder="Realistic candid iPhone selfie of a 19-year-old Russian student girl named Lera from Saint Petersburg..."
                                onChange={e => setImageForm({ ...imageForm, style_prompt: e.target.value })}
                            />
                        </div>
                        <div className="channel-action-bar">
                            <Button onClick={saveImageSettings}>Сохранить стиль-промпт</Button>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            eyebrow="Песочница"
                            title="Тест генерации фото Леры"
                            description={
                                (imageSettings?.master_reference_dataurl || imageSettings?.master_reference_photo?.id)
                                    ? '🟢 Мастер-референс активен — лицо будет скопировано из эталона'
                                    : '⚠️ Мастер-референс не задан — будет сгенерировано случайное лицо'
                            }
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    style={{ flex: 1 }}
                                    value={testPrompt}
                                    placeholder="Сюжет: селфи в кофейне на Петроградке, кофе, осеннее пальто, легкая улыбка"
                                    onChange={e => setTestPrompt(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') runImageTest(); }}
                                />
                                <Button onClick={runImageTest} disabled={testingImage}>
                                    {testingImage ? 'Генерация...' : 'Сгенерировать'}
                                </Button>
                            </div>
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                    <input type="checkbox" checked={testSaveToCatalog} onChange={e => setTestSaveToCatalog(e.target.checked)} />
                                    Автоматически сохранить результат в каталог фото
                                </label>
                                <span style={{ fontSize: 12, color: (imageSettings?.master_reference_dataurl || imageSettings?.master_reference_photo?.id) ? '#4ade80' : '#fbbf24' }}>
                                    {(imageSettings?.master_reference_dataurl || imageSettings?.master_reference_photo?.id)
                                        ? '👑 Референс передаётся в Vision-слой'
                                        : '⚠️ Без референса'}
                                </span>
                            </div>

                            {testResult && (
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                                    {testResult.imageDataUrl ? (
                                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                            <img src={testResult.imageDataUrl} alt="Generated" style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }} />
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>
                                                    ✅ Фото готово ({testResult.mode === 'reference' ? 'С сохранением лица референса' : 'Текст-генерация без референса'})
                                                </div>
                                                <pre style={{ marginTop: 8, fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 6, maxHeight: 180, overflow: 'auto' }}>
                                                    {JSON.stringify({ model: testResult.model, mode: testResult.mode, savedPhotoId: testResult.savedPhoto?.id }, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#f87171' }}>
                                            {testResult.error || 'Ответ модели получен, но изображение не найдено.'}
                                            {testResult.raw && <pre style={{ marginTop: 8, fontSize: 11, color: '#aaa' }}>{testResult.raw}</pre>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {contentTab === 'voice-gen' && (
                <div className="content-photos-layout">
                    <Card>
                        <CardHeader eyebrow="Настройки озвучки" title="Параметры голосовых сообщений (CosyVoice 3)" description="Провайдер, модель TTS, системный голос и активность голосовых сообщений." />
                        <div className="channel-settings-grid">
                            <label>Провайдер для голоса
                                <select value={voiceForm.provider_id} onChange={e => setVoiceForm({ ...voiceForm, provider_id: e.target.value })}>
                                    <option value="">Авто-поиск (Hausmer / OpenAI Audio)</option>
                                    {imageProviders.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.model_name})</option>
                                    ))}
                                </select>
                            </label>
                            <label>Модель TTS
                                <input value={voiceForm.model} placeholder="cosyvoice3 / tts-1" onChange={e => setVoiceForm({ ...voiceForm, model: e.target.value })} />
                            </label>
                            <label>Голос (Voice Preset)
                                <input value={voiceForm.voice} placeholder="female / nova / alloy" onChange={e => setVoiceForm({ ...voiceForm, voice: e.target.value })} />
                            </label>
                            <label className="channel-enabled">
                                <input type="checkbox" checked={voiceForm.auto_voice_messages} onChange={e => setVoiceForm({ ...voiceForm, auto_voice_messages: e.target.checked })} />
                                <strong>Разрешить генерацию голосовых ответов</strong>
                            </label>
                        </div>
                        <div className="channel-action-bar">
                            <Button onClick={saveVoiceSettings}>Сохранить настройки голоса</Button>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Клонирование голоса" title="Сэмпл голоса Леры (Audio Reference)" description="Эталонное аудио тембра и интонации Леры для zero-shot / few-shot клонирования в CosyVoice 3." />
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
                            <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {voiceForm.audio_sample_dataurl ? (
                                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                                            🎙️ Активный голосовой сэмпл Леры
                                        </div>
                                        <audio controls src={voiceForm.audio_sample_dataurl} style={{ width: '100%' }} />
                                    </div>
                                ) : (
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.15)', color: '#888', fontSize: 12 }}>
                                        Сэмпл голоса Леры еще не загружен. Будет использоваться стандартный женский голос провайдера.
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <label className="ui-button ui-button-primary photo-file-button" style={{ display: 'inline-block', width: 'fit-content' }}>
                                        Загрузить аудиофайл (.mp3 / .wav / .ogg)
                                        <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => uploadVoiceSample(e.target.files?.[0])} />
                                    </label>
                                    {voiceForm.audio_sample_dataurl && (
                                        <Button size="sm" variant="outline" onClick={clearVoiceSample}>Сбросить сэмпл</Button>
                                    )}
                                </div>
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                                        Текст аудио-образца (Расшифровка сэмпла для CosyVoice 3)
                                    </label>
                                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                        Обязательно для точного клонирования: впишите дословно фразу, которую говорит Лера в загруженном выше аудиофайле.
                                    </span>
                                    <textarea
                                        rows={2}
                                        value={voiceForm.prompt_text}
                                        placeholder="Например: Привет! Как твои дела? Чем сегодня занимаешься?"
                                        onChange={e => setVoiceForm({ ...voiceForm, prompt_text: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 13 }}
                                    />
                                    <div style={{ marginTop: 4 }}>
                                        <Button size="sm" onClick={saveVoiceSettings}>Сохранить текст сэмпла</Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            eyebrow="Песочница"
                            title="Тестовая озвучка голосом Леры"
                            description="Проверка синтеза речи CosyVoice 3 перед отправкой пользователям."
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                            <textarea
                                value={testVoiceText}
                                rows={3}
                                placeholder="Текст, который Лера должна сказать..."
                                onChange={e => setTestVoiceText(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Button onClick={runVoiceTest} disabled={testingVoice}>
                                    {testingVoice ? 'Озвучивание...' : '🎙️ Озвучить текст'}
                                </Button>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                    <input type="checkbox" checked={testVoiceSendTg} onChange={e => setTestVoiceSendTg(e.target.checked)} />
                                    Отправить голосовое мне в Telegram (@admin)
                                </label>
                            </div>

                            {testVoiceResult && (
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                                    {testVoiceResult.audioDataUrl ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>
                                                ✅ Голосовое сообщение сгенерировано!
                                            </div>
                                            <audio controls autoPlay src={testVoiceResult.audioDataUrl} style={{ width: '100%', maxWidth: 400 }} />
                                            {testVoiceResult.telegramSent && (
                                                <div style={{ fontSize: 12, color: '#60a5fa' }}>
                                                    🚀 Также отправлено в Telegram админа!
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#f87171' }}>
                                            {testVoiceResult.error || 'Ошибка при генерации аудио.'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {contentTab === 'channel' && (
                <div className="content-channel-layout">
                    <Card>
                        <CardHeader eyebrow="Настройки автопостинга" title="Параметры Telegram-канала" description="Расписание публикаций, режим медиа и включение." />
                        <div className="channel-settings-grid">
                            <label>Channel ID<input value={channelForm.channelId} placeholder="-100123456789" onChange={event => setChannelForm({ ...channelForm, channelId: event.target.value })} /></label>
                            <label>Ссылка на канал<input value={channelForm.channelUrl} placeholder="t.me/..." onChange={event => setChannelForm({ ...channelForm, channelUrl: event.target.value })} /></label>
                            <label>Частота (ч)<input type="number" min="1" max="168" value={channelForm.frequencyHours} onChange={event => setChannelForm({ ...channelForm, frequencyHours: event.target.value })} /></label>
                            <label>Медиа-режим<select value={channelForm.mediaMode} onChange={event => setChannelForm({ ...channelForm, mediaMode: event.target.value })}><option value="none">Без фото (только текст)</option><option value="db_photo">Прикреплять фото из базы</option><option value="ai_photo">AI-генерация фото (Gemini)</option><option value="meme">Мемы и картинки из каталога (#тгк)</option></select></label>
                            <label>Температура <span>{Number(channelForm.temperature).toFixed(1)}</span><input type="range" min="0" max="2" step="0.1" value={channelForm.temperature} onChange={event => setChannelForm({ ...channelForm, temperature: Number(event.target.value) })} /></label>
                            <label>Креативность <span>{Number(channelForm.creativity).toFixed(1)}</span><input type="range" min="0" max="1" step="0.1" value={channelForm.creativity} onChange={event => setChannelForm({ ...channelForm, creativity: Number(event.target.value) })} /></label>
                            <label>Проверка канала<select value={channelForm.judgeMode} onChange={event => setChannelForm({ ...channelForm, judgeMode: event.target.value })}><option value="OFF">OFF</option><option value="OBSERVE">OBSERVE</option><option value="ENFORCE">ENFORCE</option></select></label>
                            <label>Judge model<input value={channelForm.judgeModel} placeholder="модель по умолчанию" onChange={event => setChannelForm({ ...channelForm, judgeModel: event.target.value })} /></label>
                            <label>CTA style<input value={channelForm.ctaStyle} placeholder="например: закончить вопросом" onChange={event => setChannelForm({ ...channelForm, ctaStyle: event.target.value })} /></label>
                            <label className="channel-enabled"><input type="checkbox" checked={channelForm.isEnabled} onChange={event => setChannelForm({ ...channelForm, isEnabled: event.target.checked })} /> Автопостинг активен</label>
                            <label className="channel-enabled"><input type="checkbox" checked={channelForm.publicProfileEnabled} onChange={event => setChannelForm({ ...channelForm, publicProfileEnabled: event.target.checked })} /> Публичная проекция профиля</label>
                            <label className="channel-enabled"><input type="checkbox" checked={channelForm.publicFactsEnabled} onChange={event => setChannelForm({ ...channelForm, publicFactsEnabled: event.target.checked })} /> Использовать публичные факты</label>
                        </div>
                        <div className="channel-action-bar">
                            <span>Настройки сохраняются отдельно от публикации.</span>
                            <Button onClick={saveChannel}>Сохранить настройки</Button>
                        </div>
                        <div className="channel-status" style={{ marginTop: 12 }}>
                            <Radio size={17} />
                            <strong>{channel?.settings?.is_enabled ? 'Автопостинг ВКЛЮЧЁН' : 'Автопостинг ВЫКЛЮЧЕН'}</strong>
                            <span>Интервал: {channel?.settings?.frequency_hours || 4} ч · Канал: {channel?.channelUrl || '—'}</span>
                        </div>
                        <div className="context-template-editor" style={{ marginTop: 16 }}>
                            <label className="classifier-prompt-editor">Подтверждённые публичные факты дня
                                <textarea value={(channelForm.publicFacts || []).map(fact => typeof fact === 'string' ? fact : JSON.stringify(fact)).join('\n')} placeholder="Один факт на строку: событие, дата, разрешённая формулировка, источник" onChange={event => setChannelForm({ ...channelForm, publicFacts: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} />
                            </label>
                            <label className="classifier-prompt-editor">Правила channel-judge
                                <textarea value={channelForm.judgePrompt} placeholder="Проверяй публичный пост строго..." onChange={event => setChannelForm({ ...channelForm, judgePrompt: event.target.value })} />
                            </label>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Интерактив в канале" title="💬 Комментарии и реакции" description="Автоответы подписчикам в привязанной группе обсуждений, умные эмодзи-реакции и узнавание собеседников из ЛС." />
                        <div className="channel-settings-grid">
                            <label className="channel-enabled">
                                <input type="checkbox" checked={channelForm.commentsEnabled} onChange={event => setChannelForm({ ...channelForm, commentsEnabled: event.target.checked })} />
                                <strong>Включить автоответы и реакции</strong>
                            </label>
                            <label className="channel-enabled">
                                <input type="checkbox" checked={channelForm.recognizeUsers} onChange={event => setChannelForm({ ...channelForm, recognizeUsers: event.target.checked })} />
                                <strong>Узнавать собеседников из ЛС</strong> (по имени и фактам памяти)
                            </label>
                            <label>Шанс эмодзи-реакции на коммент: <span>{channelForm.reactionChance}%</span>
                                <input type="range" min="0" max="100" step="5" value={channelForm.reactionChance} onChange={event => setChannelForm({ ...channelForm, reactionChance: Number(event.target.value) })} />
                            </label>
                            <label>Шанс случайного комментария в тред: <span>{channelForm.commentChance}%</span>
                                <input type="range" min="0" max="100" step="5" value={channelForm.commentChance} onChange={event => setChannelForm({ ...channelForm, commentChance: Number(event.target.value) })} />
                            </label>
                        </div>
                        <div className="context-template-editor" style={{ marginTop: 16 }}>
                            <label className="classifier-prompt-editor">Дополнительные инструкции для комментариев
                                <textarea
                                    value={channelForm.commentsPrompt}
                                    placeholder="Например: чаще подкалывай за питерскую погоду, будь чуть более ироничной к хейтерам..."
                                    onChange={event => setChannelForm({ ...channelForm, commentsPrompt: event.target.value })}
                                />
                            </label>
                        </div>
                        <div className="channel-action-bar">
                            <span>Прямые теги (@username) и реплаи на Леру получают 100% ответ. Интимные тайны в публичный чат не утекают.</span>
                            <Button onClick={saveChannel}>Сохранить настройки комментариев</Button>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Тема следующего поста" title="Один режим для одного черновика" description="Это не набор промптов и не темы, которые ИИ обязан смешать. Перед генерацией выбирается одна активная тема — и добавляется в задание для ИИ." />
                        <div className="topic-distribution-summary">
                            <div>
                                <strong>Что увидит ИИ</strong>
                                <span>«Тема: выбранная тема» и короткая задача для неё. Личность Леры, контекст дня и правила берутся из конструктора ниже.</span>
                            </div>
                            <div className="topic-presets-actions">
                                <Button size="xs" variant="outline" onClick={() => {
                                    setChannelForm({
                                        ...channelForm,
                                        topics: ['thoughts', 'flirt', 'life', 'jokes', 'questions', 'meme', 'repost'],
                                        topicWeights: { thoughts: 2, flirt: 2, life: 2, jokes: 2, questions: 2, meme: 2, repost: 2 }
                                    });
                                }}>Все темы</Button>
                                <Button size="xs" variant="outline" onClick={() => {
                                    setChannelForm({
                                        ...channelForm,
                                        topics: ['thoughts', 'life', 'jokes'],
                                        topicWeights: { thoughts: 2, life: 2, jokes: 2, flirt: 2, questions: 2, meme: 2, repost: 2 }
                                    });
                                }}>Мысли и жизнь</Button>
                                <Badge variant="blue">Итого: {Object.values(normalizeTopicShares(channelForm.topics, channelForm.topicWeights)).reduce((sum, value) => sum + value, 0)}%</Badge>
                            </div>
                        </div>
                        <div className="topic-weights-grid topic-cards-grid">
                            {Object.entries(TOPIC_LABELS).map(([topicKey, topicName]) => {
                                const isEnabled = channelForm.topics.includes(topicKey);
                                const shares = normalizeTopicShares(channelForm.topics, channelForm.topicWeights);
                                const currentShare = shares[topicKey] ?? 0;
                                const currentWeight = channelForm.topicWeights?.[topicKey] ?? 2;
                                return (
                                    <div className={cn('topic-card-item', isEnabled && 'is-active')} key={topicKey}>
                                        <div className="topic-card-header">
                                            <label className="topic-card-check">
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    onChange={event => {
                                                        const checked = event.target.checked;
                                                        let nextTopics = checked
                                                            ? [...channelForm.topics, topicKey]
                                                            : channelForm.topics.filter(t => t !== topicKey);
                                                        if (!nextTopics.length) nextTopics = [topicKey];
                                                        const nextWeights = { ...channelForm.topicWeights, [topicKey]: channelForm.topicWeights?.[topicKey] || 2 };
                                                        setChannelForm({ ...channelForm, topics: nextTopics, topicWeights: nextWeights });
                                                    }}
                                                />
                                                <strong>{topicName}</strong>
                                            </label>
                                            <Badge variant={isEnabled ? 'blue' : 'muted'}>
                                                {isEnabled ? `${currentShare}%` : 'выключена'}
                                            </Badge>
                                        </div>
                                        <div className="topic-card-rule">{TOPIC_PROMPT_RULES[topicKey]}</div>
                                        <div className="topic-card-priority-row">
                                            <span className="topic-priority-label">Частота:</span>
                                            <div className="topic-priority-buttons">
                                                {[
                                                    { label: 'Редко', val: 1 },
                                                    { label: 'Обычно', val: 2 },
                                                    { label: 'Часто', val: 4 }
                                                ].map(p => (
                                                    <button
                                                        key={p.val}
                                                        type="button"
                                                        disabled={!isEnabled}
                                                        className={cn('topic-priority-btn', isEnabled && currentWeight === p.val && 'is-selected')}
                                                        onClick={() => {
                                                            setChannelForm({
                                                                ...channelForm,
                                                                topicWeights: { ...channelForm.topicWeights, [topicKey]: p.val }
                                                            });
                                                        }}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="topic-prompt-explainer">
                            <span className="eyebrow">Как это работает</span>
                            <strong>Для выбранной темы в промпт попадёт задача:</strong>
                            <p>«{Object.entries(TOPIC_LABELS).filter(([key]) => channelForm.topics.includes(key)).map(([key, label]) => `${label} — ${TOPIC_PROMPT_RULES[key]}`).join('» · «')}»</p>
                        </div>
                        <div className="channel-action-bar">
                            <span>Выключенная тема не участвует в посте. Проценты вероятности вычисляются автоматически по выбранной частоте.</span>
                            <Button onClick={saveChannel}>Сохранить распределение</Button>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Конструктор промпта" title="Управляемая генерация" description="Личность Леры и контекст дня подключены ниже — вы сразу видите, из каких блоков собирается пост." />
                        <PromptAssemblyMap channelForm={channelForm} onChannelChange={setChannelForm} />
                        <PromptModulesEditor modules={channelForm.promptBlocks} onChange={promptBlocks => setChannelForm({ ...channelForm, promptBlocks })} definitions={CHANNEL_PROMPT_MODULES} />
                        <div className="channel-generator-controls">
                            <span>Черновик не отправляется в Telegram.</span>
                            <label className="channel-generator-select">
                                <span>Тема черновика:</span>
                                <select value={draftTopic} onChange={e => setDraftTopic(e.target.value)}>
                                    <option value="random">🎲 Случайная (по весам)</option>
                                    {Object.entries(TOPIC_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="channel-generator-select">
                                <span>Медиа-режим:</span>
                                <select value={draftMediaMode} onChange={e => setDraftMediaMode(e.target.value)}>
                                    <option value="inherit">⚙️ Из настроек ({channelForm.mediaMode === 'none' ? 'без фото' : channelForm.mediaMode === 'db_photo' ? 'фото из БД' : channelForm.mediaMode === 'ai_photo' ? 'AI-фото' : 'мем'})</option>
                                    <option value="none">📝 Без фото (только текст)</option>
                                    <option value="db_photo">🖼️ Фото из базы (lera_photos)</option>
                                    <option value="ai_photo">🤖 AI-генерация фото (Gemini)</option>
                                    <option value="meme">🎭 Мем / контент (#тгк)</option>
                                </select>
                            </label>
                            <Button variant="primary" onClick={() => generateDraft()}><WandSparkles size={15} /> Сгенерировать черновик</Button>
                        </div>
                        {channelDraft && <div className="channel-draft-card">
                            <div className="channel-post-header">
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <Badge variant="blue">{TOPIC_LABELS[channelDraft.topic] || channelDraft.topic}</Badge>
                                    {channelDraft.media?.type === 'photo' && <Badge variant="green">🖼️ Фото из базы</Badge>}
                                    {channelDraft.media?.type === 'ai_photo' && <Badge variant="purple">🤖 AI-фото (Gemini)</Badge>}
                                    {channelDraft.media?.type === 'meme' && <Badge variant="yellow">🎭 Мем</Badge>}
                                    {!channelDraft.media && <Badge variant="muted">📝 Без фото</Badge>}
                                </div>
                                <span>Проверьте перед публикацией</span>
                            </div>
                            <textarea value={draftText} onChange={event => setDraftText(event.target.value)} aria-label="Текст черновика поста" />
                            {channelDraft.media && (
                                <div className="channel-draft-media-box">
                                    {channelDraft.media.preview_url ? (
                                        <div className="channel-draft-media-preview-container">
                                            <img src={channelDraft.media.preview_url} alt="Медиа превью" className="channel-draft-media-img" />
                                            <div className="channel-draft-media-details">
                                                <strong>{channelDraft.media.type === 'photo' ? 'Фото Леры' : channelDraft.media.type === 'ai_photo' ? 'AI-фото (Gemini)' : 'Мем/контент'}</strong>
                                                <span>{channelDraft.media.description || channelDraft.media.caption || 'Медиа прикреплено к посту'}</span>
                                                <div className="channel-draft-media-actions">
                                                    <Button size="xs" variant="outline" onClick={() => setChannelDraft({ ...channelDraft, media: null, media_content_id: null })}>
                                                        Убрать медиа
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : channelDraft.media.type === 'ai_photo' ? (
                                        <div className="channel-draft-ai-placeholder">
                                            <div className="channel-draft-ai-text">
                                                <strong>🤖 AI-генерация фото включена</strong>
                                                <span>При публикации будет сгенерировано фото через Gemini под контекст поста. Вы можете сгенерировать превью прямо сейчас:</span>
                                            </div>
                                            <Button size="xs" variant="secondary" onClick={generateDraftAiPhoto} disabled={generatingAiPreview}>
                                                {generatingAiPreview ? <><RefreshCw size={13} className="animate-spin" /> Генерация превью...</> : <><Sparkles size={13} /> Сгенерировать AI-превью</>}
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                            <div className="channel-action-bar">
                                <Button variant="outline" onClick={() => generateDraft()}><RefreshCw size={15} /> Сгенерировать заново</Button>
                                <ConfirmAction title="Опубликовать отредактированный черновик?" description="Пост вместе с медиа будет отправлен в Telegram-канал." confirmText="Опубликовать" onConfirm={publishDraft}>Опубликовать в Telegram</ConfirmAction>
                            </div>
                        </div>}
                    </Card>

                    <Card>
                        <CardHeader eyebrow="История публикаций" title="Что уже ушло в канал" description="Карточки показывают текст, медиа и объяснение, на основе чего был создан пост." />
                        <div className="channel-feed-grid">
                            {channelHistory.length ? channelHistory.map(post => (
                                <div className="channel-post-card" key={post.id || post.created_at}>
                                    <div className="channel-post-header">
                                        <Badge variant="blue">{TOPIC_LABELS[post.topic] || post.topic || 'Пост'}</Badge>
                                        <span>{formatTime(post.created_at)}</span>
                                    </div>
                                    {post.photo_url && (
                                        <div className="channel-history-media-thumb">
                                            <img
                                                src={post.photo_url.startsWith('http') ? post.photo_url : `/api/admin/telegram-preview?file_id=${encodeURIComponent(post.photo_url)}`}
                                                alt="Медиа к посту"
                                                onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                                            />
                                        </div>
                                    )}
                                    <p className="channel-post-text">{post.text}</p>
                                    <details className="post-provenance">
                                        <summary>Почему этот пост</summary>
                                        <span>Статус: {post.status || (post.provenance?.published ? 'PUBLISHED' : 'DRAFT')}</span>
                                        <span>Медиа: {post.media_mode || 'none'}</span>
                                        <span>Judge: {post.provenance?.judge_verdict || 'не запускался'}{post.provenance?.judge_code ? ` · ${post.provenance.judge_code}` : ''}</span>
                                        <span>Попытка: {post.provenance?.attempt || 1}</span>
                                        <span>Профиль: v{post.provenance?.profile_version || '—'}</span>
                                        <span>Тема: {TOPIC_LABELS[post.provenance?.topic || post.topic] || post.topic || 'Пост'}</span>
                                        <span>Температура: {post.provenance?.temperature ?? 'по умолчанию'}</span>
                                        <span>Блоки: {post.provenance?.prompt_blocks?.join(', ') || 'стандартный голос Леры'}</span>
                                        <span>Модель: {post.provenance?.model || 'не сохранена'}</span>
                                    </details>
                                    <ConfirmAction title="Удалить запись истории?" description="Удалится только запись в админке. Telegram-сообщение останется в канале." confirmText="Удалить запись" variant="danger" onConfirm={() => run(() => api(`/api/admin/channel/history/${post.id}`, { method: 'DELETE' }), 'Запись истории удалена').then(loadChannel)}>
                                        Удалить запись истории
                                    </ConfirmAction>
                                </div>
                            )) : <div className="empty-state">История постов пуста.</div>}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

function SystemPanel({ readOnly, setReadOnly, toast }) {
    const [inventory, setInventory] = useState([]); const [inventoryForm, setInventoryForm] = useState({ itemId: '', itemType: 'food', quantity: 1, properties: '{}' });
    const [queue, setQueue] = useState([]); const [queueForm, setQueueForm] = useState({ taskType: 'LEISURE_HOME', targetLocation: 'petrogradka_home', durationMinutes: 30, priority: 50 }); const [godAction, setGodAction] = useState('RAIN_ON'); const [godValues, setGodValues] = useState({ hunger: '', fatigue: '', rubles: '', stars: '', cycle_day: '' });
    const [diagnostics, setDiagnostics] = useState(null); const [logs, setLogs] = useState([]); const [broadcast, setBroadcast] = useState(null); const [broadcastText, setBroadcastText] = useState('');

    const run = async (action, success) => { try { const result = await action(); if (success && toast) toast(success); return result; } catch (error) { if (toast) toast(error.message, 'error'); return null; } };

    async function tick() { await api('/api/admin/radiant/tick', { method: 'POST', body: JSON.stringify({}) }); if (toast) toast('Один завершённый тик выполнен'); }
    async function reset() { await api('/api/admin/radiant/reset-runtime', { method: 'POST', body: JSON.stringify({ request_id: `ui-reset-${Date.now()}` }) }); if (toast) toast('Runtime сброшен'); }

    async function loadInventory() { const result = await run(() => api('/api/admin/inventory')); if (result) setInventory(result.inventory || []); }
    async function addInventory() { if (readOnly) return; let properties; try { properties = JSON.parse(inventoryForm.properties || '{}'); } catch { if (toast) toast('Properties должны быть JSON'); return; } await run(() => api('/api/admin/inventory/add', { method: 'POST', body: JSON.stringify({ ...inventoryForm, quantity: Number(inventoryForm.quantity), properties }) }), 'Предмет добавлен'); setInventoryForm({ itemId: '', itemType: 'food', quantity: 1, properties: '{}' }); loadInventory(); }

    async function loadQueue() { const result = await run(() => api('/api/admin/queue')); if (result) setQueue(result.queue || []); }
    async function pushQueue() { await run(() => api('/api/admin/queue/push', { method: 'POST', body: JSON.stringify({ ...queueForm, durationMinutes: Number(queueForm.durationMinutes), priority: Number(queueForm.priority), request_id: `admin-ui-${Date.now()}` }) }), 'Задача добавлена в очередь'); loadQueue(); }
    async function repairQueue() { await run(() => api('/api/admin/radiant/queue/repair', { method: 'POST' }), 'Очередь проверена и исправлена').then(loadQueue); }

    async function loadOps() { const [diag, logData, status] = await Promise.all([api('/api/admin/diagnostics'), api('/api/admin/logs?level='), api('/api/admin/broadcast/status')]); setDiagnostics(diag); setLogs(logData.logs || []); setBroadcast(status); }
    async function godMode() { const needs = Object.fromEntries(Object.entries({ hunger: godValues.hunger, fatigue: godValues.fatigue }).filter(([, value]) => value !== '').map(([key, value]) => [key, Number(value)])); const physiology = godValues.cycle_day === '' ? undefined : { cycle_day: Number(godValues.cycle_day) }; await run(() => api('/api/admin/radiant/god-mode', { method: 'POST', body: JSON.stringify({ action: godAction, needs, physiology, rubles: godValues.rubles === '' ? undefined : Number(godValues.rubles), stars: godValues.stars === '' ? undefined : Number(godValues.stars), request_id: `admin-god-${Date.now()}` }) }), `God Mode: ${godAction} применён`).then(loadOps); }
    async function rebuildForecast() { await run(() => api('/api/admin/radiant/god-mode', { method: 'POST', body: JSON.stringify({ action: 'FORECAST_REBUILD', request_id: `forecast-${Date.now()}` }) }), 'Прогноз перестроен').then(loadOps); }
    async function cleanLogs() { await run(() => api('/api/admin/diagnostics/prune', { method: 'POST', body: JSON.stringify({ promptDays: 30, rationaleDays: 14, diaryDays: 90 }) }), 'Старые технические логи очищены').then(loadOps); }

    useEffect(() => { loadOps(); loadQueue(); loadInventory(); }, []);

    return (
        <div className="system-super-layout">
            <Card className="operations-card">
                <CardHeader eyebrow="Система" title="Контроль и безопасность" description="Сначала включён безопасный режим. Любое изменение требует подтверждения." action={<Button variant={readOnly ? 'primary' : 'warning'} onClick={() => setReadOnly(!readOnly)}>{readOnly ? <><Lock size={15} /> Только чтение</> : <><EyeOff size={15} /> Изменения разрешены</>}</Button>} />
                <div className="operation-grid">
                    <div className="operation-item">
                        <div className="operation-icon"><Play size={15} /></div>
                        <div><strong>Ручной тик</strong><span>Один завершённый шаг на 5 минут.</span></div>
                        <ConfirmAction title="Выполнить ручной тик?" description="Это изменит состояние реального движка и запишет фактические события." confirmText="Выполнить" onConfirm={tick} disabled={readOnly}>Выполнить тик</ConfirmAction>
                    </div>
                    <div className="operation-item">
                        <div className="operation-icon danger-icon"><ShieldAlert size={15} /></div>
                        <div><strong>Reset runtime</strong><span>Очистит очередь, факты, rationale и forecast.</span></div>
                        <ConfirmAction title="Сбросить runtime?" description="Пользователи, деньги и память сохранятся. Runtime-история будет очищена." confirmText="Сбросить" onConfirm={reset} variant="danger" disabled={readOnly}>Сбросить</ConfirmAction>
                    </div>
                </div>
                <div className="read-only-note"><CircleHelp size={15} /> {readOnly ? 'Режим только чтение: действия изменения отключены.' : 'Изменения разрешены до перезагрузки страницы.'}</div>
            </Card>

            <Card className="god-mode-card">
                <CardHeader eyebrow="God Mode" title="Прямое управление состоянием движка" description="Принудительное изменение физиологии, ресурсов и состояния симуляции." />
                <div className="inline-controls god-form">
                    <select value={godAction} onChange={event => setGodAction(event.target.value)}>
                        <option>RAIN_ON</option><option>RAIN_OFF</option><option>RAIN_AUTO</option><option>CYCLE_PMS</option><option>CYCLE_OVULATION</option><option>NASTYA_DRAMA_50</option><option>NASTYA_DRAMA</option><option>MAX_DEADLINE</option><option>SET_STATE</option>
                    </select>
                    <input placeholder="Голод" value={godValues.hunger} onChange={event => setGodValues({ ...godValues, hunger: event.target.value })} />
                    <input placeholder="Усталость" value={godValues.fatigue} onChange={event => setGodValues({ ...godValues, fatigue: event.target.value })} />
                    <input placeholder="Рубли" value={godValues.rubles} onChange={event => setGodValues({ ...godValues, rubles: event.target.value })} />
                    <input placeholder="Звёзды" value={godValues.stars} onChange={event => setGodValues({ ...godValues, stars: event.target.value })} />
                    <input placeholder="Цикл" value={godValues.cycle_day} onChange={event => setGodValues({ ...godValues, cycle_day: event.target.value })} />
                    <ConfirmAction title="Применить God Mode?" description="Это изменит реальное состояние движка и запишет rationale." confirmText="Применить" variant="warning" onConfirm={godMode}>Применить</ConfirmAction>
                </div>
            </Card>

            <Card className="queue-inventory-card">
                <CardHeader eyebrow="Очередь" title="Очередь задач GOAP" description="Техническое вмешательство в план действий — только при необходимости." />
                <div className="inline-controls">
                    <input value={queueForm.taskType} placeholder="TASK_TYPE" onChange={event => setQueueForm({ ...queueForm, taskType: event.target.value })} />
                    <input value={queueForm.targetLocation} placeholder="Локация" onChange={event => setQueueForm({ ...queueForm, targetLocation: event.target.value })} />
                    <input value={queueForm.durationMinutes} type="number" placeholder="Минуты" onChange={event => setQueueForm({ ...queueForm, durationMinutes: event.target.value })} />
                    <label>Приоритет<input value={queueForm.priority} type="number" onChange={event => setQueueForm({ ...queueForm, priority: event.target.value })} /></label>
                    <Button onClick={pushQueue}>Добавить</Button>
                    <Button variant="outline" onClick={repairQueue}>Починить</Button>
                </div>
                <div className="queue-list">
                    {queue.map(item => (
                        <div className="managed-row" key={item.id}>
                            <ListTree size={15} />
                            <div><strong>{taskName(item.task_type)}</strong><span>{item.status} · {item.duration_minutes} мин · {item.target_location}</span></div>
                            <ConfirmAction title="Завершить задачу?" description="Задача будет закрыта в очереди." confirmText="Завершить" onConfirm={() => run(() => api(`/api/admin/queue/${item.id}`, { method: 'DELETE' }), 'Задача закрыта').then(loadQueue)}>Закрыть</ConfirmAction>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="expert-inventory-card">
                <CardHeader eyebrow="Экспертный режим" title="Сырой CRUD инвентаря" description="Только для отладки и выдачи нестандартных предметов. В обычном сценарии используйте «Рюкзак Леры»." />
                <details>
                    <summary>Открыть техническое управление предметами</summary>
                    <div className="inline-controls expert-inventory-controls">
                        <input value={inventoryForm.itemId} placeholder="item_id" onChange={event => setInventoryForm({ ...inventoryForm, itemId: event.target.value })} />
                        <input value={inventoryForm.itemType} placeholder="item_type" onChange={event => setInventoryForm({ ...inventoryForm, itemType: event.target.value })} />
                        <input value={inventoryForm.quantity} type="number" onChange={event => setInventoryForm({ ...inventoryForm, quantity: event.target.value })} />
                        <input value={inventoryForm.properties} placeholder="properties JSON" onChange={event => setInventoryForm({ ...inventoryForm, properties: event.target.value })} />
                        <Button disabled={readOnly} onClick={addInventory}>Добавить</Button>
                    </div>
                    <div className="inventory-list">
                        {inventory.map(item => <div className="managed-row" key={item.id}><Database size={15} /><div><strong>{item.item_id}</strong><span>{item.item_type} · количество {item.quantity}</span></div></div>)}
                    </div>
                </details>
            </Card>

            <Card className="diagnostics-broadcast-card">
                <CardHeader eyebrow="Диагностика" title="Диагностика и Рассылка" description="Проверка работы БД, Redis, Воркера и управление очередью рассылок." />
                <div className="diagnostic-grid">
                    {[['DB', diagnostics?.db?.ok], ['Redis', diagnostics?.redis?.ok], ['Worker', diagnostics?.worker?.timerActive]].map(([label, ok]) => (
                        <div className="diagnostic-cell" key={label}><span>{label}</span><strong>{ok === undefined ? '—' : ok ? 'OK' : 'Ошибка'}</strong></div>
                    ))}
                </div>
                <div className="inline-controls">
                    <Button onClick={loadOps}>Обновить диагностику</Button>
                    <Button onClick={rebuildForecast}>Перестроить прогноз</Button>
                    <Button onClick={cleanLogs}>Очистить старые логи</Button>
                </div>
                <pre className="admin-code-editor">{JSON.stringify({ diagnostics, broadcast, logs: logs.slice(0, 20) }, null, 2)}</pre>
                <div className="inline-controls">
                    <input value={broadcastText} placeholder="Текст тестовой рассылки" onChange={event => setBroadcastText(event.target.value)} />
                    <ConfirmAction title="Поставить рассылку в очередь?" description="Сообщения будут отправлены пользователям." confirmText="Поставить" onConfirm={() => run(() => api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ text: broadcastText, segment: 'all' }) }), 'Рассылка поставлена в очередь')}>Поставить рассылку</ConfirmAction>
                </div>
                <div className="inline-controls">
                    <Button onClick={() => run(() => api('/api/admin/broadcast/control', { method: 'POST', body: JSON.stringify({ action: 'pause' }) }), 'Очередь рассылки остановлена').then(loadOps)}>Пауза рассылки</Button>
                    <Button onClick={() => run(() => api('/api/admin/broadcast/control', { method: 'POST', body: JSON.stringify({ action: 'resume' }) }), 'Очередь рассылки продолжена').then(loadOps)}>Продолжить</Button>
                </div>
            </Card>
        </div>
    );
}

function DiaryTabbar({ view, setView }) {
    return (
        <Tabs.Root className="diary-tabs-root" value={view} onValueChange={setView}>
            <Tabs.List className="diary-tabbar" aria-label="Разделы админки">
                <Tabs.Trigger value="diary"><FileText size={14} /> Дневник дня</Tabs.Trigger>
                <Tabs.Trigger value="dialogs"><MessageSquare size={14} /> Диалоги</Tabs.Trigger>
                <Tabs.Trigger value="llm-settings"><Settings2 size={14} /> AI Sandbox & Prompts</Tabs.Trigger>
                <Tabs.Trigger value="crm"><Users size={14} /> CRM Пользователей</Tabs.Trigger>
                <Tabs.Trigger value="content"><Image size={14} /> Контент и Канал</Tabs.Trigger>
                <Tabs.Trigger value="inventory"><Backpack size={14} /> Рюкзак Леры</Tabs.Trigger>
                <Tabs.Trigger value="system"><Zap size={14} /> Движок и Операции</Tabs.Trigger>
            </Tabs.List>
        </Tabs.Root>
    );
}

function App() {
    const [authenticated, setAuthenticated] = useState(null); const [day] = useState(() => isoDate(new Date())); const [view, setView] = useState('diary'); const [data, setData] = useState(null); const [readOnly, setReadOnly] = useState(true); const [notice, setNotice] = useState(null); const toastTimerRef = useRef(null);
    const counts = useMemo(() => ({ meals: data?.meals?.length || 0, sleep: data?.sleep?.length || 0, random: data?.randomEvents?.length || 0 }), [data]);
    useEffect(() => { api('/api/admin/session').then(result => setAuthenticated(result.authenticated)).catch(() => setAuthenticated(false)); }, []);
    const refreshData = useRef(null);
    refreshData.current = () => {
        const today = isoDate(new Date());
        const at = day === today ? new Date().toISOString() : `${day}T12:00:00+03:00`;
        api(`/api/admin/radiant/day?at=${encodeURIComponent(at)}`).then(setData).catch(error => toast(error.message, 'error'));
    };
    useEffect(() => { if (authenticated) refreshData.current(); }, [authenticated, day]);
    useEffect(() => {
        if (!authenticated) return;
        let cancelled = false;
        const refreshHealth = async () => {
            try {
                const health = await api('/api/admin/radiant/health');
                if (!cancelled) setData(current => current ? { ...current, health } : current);
            } catch {
                // The full day snapshot remains visible if a health refresh fails.
            }
        };
        const timer = setInterval(refreshHealth, 15000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [authenticated]);
    useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
    function dismissToast() { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); toastTimerRef.current = null; setNotice(null); }
    function toast(message, kind = 'success') {
        if (!message) return;
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setNotice({ message, kind });
        if (kind !== 'error') toastTimerRef.current = setTimeout(() => setNotice(null), 3200);
    }
    if (authenticated === null) return <div className="loading-screen">Загружаю дневник…</div>;
    if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;
    const state = data?.state || {}; const profile = data?.profile; const items = data?.timeline || [];
    function exportDay(selectedItems = items) { const body = selectedItems.map(item => `${formatTime(item.at)} — ${item.title}`).join('\n'); const blob = new Blob([`Дневник Леры · ${formatDay(`${day}T12:00:00+03:00`)}\n\n${body}`], { type: 'text/plain;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `lera-${day}.txt`; link.click(); URL.revokeObjectURL(link.href); }
    const viewTitle = view === 'diary' ? 'Дневник жизни' : view === 'dialogs' ? 'Диалоги' : view === 'llm-settings' ? 'AI Sandbox & Prompts' : view === 'crm' ? 'CRM Пользователей и Клиенты' : view === 'content' ? 'Контент и Telegram-канал' : view === 'inventory' ? 'Рюкзак Леры' : 'Движок и Оперативный Контроль';
    return (
        <div className="v2-shell diary-shell">
            <aside className="v2-sidebar">
                <div className="v2-brand">
                    <div className="brand-mark">Л</div>
                    <div>
                        <strong>Лера 2.0</strong>
                        <span>Control Center</span>
                    </div>
                </div>
                <div className="sidebar-date">
                    <Calendar size={14} />
                    <span>{formatDay(`${day}T12:00:00+03:00`)}</span>
                </div>
                <nav className="v2-nav">
                    <button data-state={view === 'diary' ? 'active' : 'inactive'} onClick={() => setView('diary')}><FileText size={15} /> <span>Обзор и Дневник</span></button>
                    <button data-state={view === 'dialogs' ? 'active' : 'inactive'} onClick={() => setView('dialogs')}><MessageSquare size={15} /> <span>Диалоги и Логи</span></button>
                    <button data-state={view === 'llm-settings' ? 'active' : 'inactive'} onClick={() => setView('llm-settings')}><Settings2 size={15} /> <span>AI Sandbox & Prompts</span></button>
                    <button data-state={view === 'crm' ? 'active' : 'inactive'} onClick={() => setView('crm')}><Users size={15} /> <span>CRM Пользователей</span></button>
                    <button data-state={view === 'content' ? 'active' : 'inactive'} onClick={() => setView('content')}><Image size={15} /> <span>Контент и Канал</span></button>
                    <button data-state={view === 'inventory' ? 'active' : 'inactive'} onClick={() => setView('inventory')}><Backpack size={15} /> <span>Рюкзак Леры</span></button>
                    <button data-state={view === 'system' ? 'active' : 'inactive'} onClick={() => setView('system')}><Zap size={15} /> <span>Движок и Система</span></button>
                </nav>
                <div className="sidebar-footer">
                    <span className="status-dot" />
                    <strong>{data?.health?.status || 'ONLINE'}</strong>
                    <small>{state.location_name || 'Санкт-Петербург'}</small>
                </div>
            </aside>
            <main className="v2-main"><DiaryTabbar view={view} setView={setView} />
                {view !== 'diary' && (
                    <header className="v2-header">
                        <div>
                            <div className="eyebrow">{view.toUpperCase()}</div>
                            <h1>{viewTitle}</h1>
                        </div>
                        <div className="header-actions">
                            <Badge variant={data?.health?.status === 'ONLINE' ? 'green' : 'yellow'}>
                                <span className="status-dot" /> {data?.health?.status || 'Проверка'}
                            </Badge>
                            <Badge>{state.location_name || '—'}</Badge>
                        </div>
                    </header>
                )}
                <div className={cn('v2-content', view === 'diary' && 'diary-home')}>
                    {view === 'diary' && (
                        <>
                            <NeedsPanel state={state} profile={profile} />
                            <InventoryWidget state={state} weather={data?.weather} toast={toast} onOpenInventory={() => setView('inventory')} />
                            {/* CurrentDecision stays in the kanban home composition. */}
                            <KanbanBoard schedule={data?.schedule} activeTask={data?.activeTask} clockAt={data?.at} health={data?.health} state={state} rationale={data?.rationale} />
                            <DaySummary summary={data?.summary} />
                        </>
                    )}
                    {view === 'dialogs' && <LlmPanel toast={toast} />}
                    {view === 'llm-settings' && <AiSandboxPromptStudio toast={toast} />}
                    {view === 'crm' && <CrmPanel toast={toast} />}
                    {view === 'content' && <ContentPanel toast={toast} />}
                    {view === 'inventory' && <InventoryPanel state={state} weather={data?.weather} toast={toast} />}
                    {view === 'system' && <SystemPanel readOnly={readOnly} setReadOnly={setReadOnly} toast={toast} />}
                </div>
            </main>
            {notice && <Toast notice={notice} onDismiss={dismissToast} />}
        </div>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("React ErrorBoundary caught error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="login-screen">
                    <div className="login-box">
                        <div className="brand-mark">Л</div>
                        <div className="eyebrow">ОШИБКА ИНТЕРФЕЙСА</div>
                        <h1>Не удалось отобразить дневник</h1>
                        <p>{this.state.error?.message || 'Произошла непредвиденная ошибка.'}</p>
                        <Button variant="primary" onClick={() => window.location.reload()}>Перезагрузить страницу</Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
