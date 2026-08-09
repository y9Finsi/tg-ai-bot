import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tabs from '@radix-ui/react-tabs';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { CircleHelp, CloudRain, Database, ExternalLink, EyeOff, FileText, HeartPulse, ListTree, Lock, MessageSquare, MoreHorizontal, Play, RefreshCw, ShieldAlert, Sparkles, Sun, Terminal, UserRound, WandSparkles, X, Users, Settings2, Image, Radio, CheckCircle2, Utensils, Zap, Droplets, Heart, BatteryCharging, Flame, CircleAlert, Wallet, MapPin, Calendar, BarChart3, Tag, CreditCard, Backpack, Shirt, Umbrella, Package, ArrowRight, CircleCheck, CircleOff, Info, Pencil, Search, Command } from 'lucide-react';
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
    ['core', 'Core Persona', 'Постоянная личность Леры.'],
    ['common', 'Общие правила', 'Правила, контекст и ограничения для всех режимов.'],
    ['casual', 'CASUAL', 'Бытовой разговор, флирт и подколки.'],
    ['erotic', 'EROTIC', 'Интимная стилистика и правила горячего диалога.'],
    ['joke', 'JOKE', 'Юмор, мемы и шутки без обязательной связи с комнатой или занятием.']
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

function formatDay(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)); }
function formatTime(value) { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function mskDateParts(value = new Date()) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value])); }
function isoDate(value) { const parts = mskDateParts(value); return `${parts.year}-${parts.month}-${parts.day}`; }
function taskName(value) { return TASK_NAMES[value] || String(value || 'Событие').replaceAll('_', ' ').toLowerCase(); }
function eventName(value) { return EVENT_NAMES[value] || String(value || 'Событие').replaceAll('_', ' ').toLowerCase(); }
function cn(...values) { return values.filter(Boolean).join(' '); }
const CHANNEL_TOPIC_KEYS = ['thoughts', 'flirt', 'life', 'jokes', 'questions'];
function normalizeTopicShares(topics, rawWeights = {}) {
    const active = [...new Set((topics || []).filter(topic => CHANNEL_TOPIC_KEYS.includes(topic)))];
    const safeTopics = active.length ? active : ['thoughts'];
    const shares = Object.fromEntries(CHANNEL_TOPIC_KEYS.map(topic => [topic, 0]));
    const entries = safeTopics.map(topic => ({ topic, weight: Math.max(0, Number(rawWeights[topic]) || 0) }));
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
    const otherTopics = active.filter(topic => topic !== changedTopic);
    const remaining = 100 - nextValue;
    const otherTotal = otherTopics.reduce((sum, topic) => sum + Math.max(0, Number(weights[topic]) || 0), 0);
    const source = Object.fromEntries(otherTopics.map(topic => [topic, otherTotal > 0
        ? (Math.max(0, Number(weights[topic]) || 0) / otherTotal) * remaining
        : remaining / otherTopics.length]));
    return normalizeTopicShares(active, { ...source, [changedTopic]: nextValue });
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
    if (disabled) return <Button size={size} variant="outline" disabled aria-disabled="true">{children}</Button>;
    return <AlertDialog.Root><AlertDialog.Trigger asChild><Button size={size} variant={variant}>{children}</Button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel asChild><Button>Отмена</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="danger" onClick={onConfirm}>{confirmText || 'Подтвердить'}</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
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
        ['01', 'Образ Леры', channelForm.inheritLeraPrompt !== false ? '7 модулей из «Настроек LLM» подключены' : 'Отключён для канала', 'inherit'],
        ['02', 'Контекст дня', channelForm.includeDayContext !== false ? 'Факты, состояние, погода и планы на сейчас' : 'Отключён для канала', 'day'],
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
                <div className={cn('prompt-source-card', `prompt-source-${kind}`, channel && kind === 'inherit' && channelForm.inheritLeraPrompt === false && 'is-disabled', channel && kind === 'day' && channelForm.includeDayContext === false && 'is-disabled')}>
                    <span>{number}</span><div><strong>{title}</strong><small>{text}</small></div>
                    {channel && kind === 'inherit' && <label className="prompt-source-toggle"><input type="checkbox" checked={channelForm.inheritLeraPrompt !== false} onChange={event => onChannelChange({ ...channelForm, inheritLeraPrompt: event.target.checked })} /> Наследовать</label>}
                    {channel && kind === 'day' && <label className="prompt-source-toggle"><input type="checkbox" checked={channelForm.includeDayContext !== false} onChange={event => onChannelChange({ ...channelForm, includeDayContext: event.target.checked })} /> Добавлять</label>}
                </div>
                {index < blocks.length - 1 && <ArrowRight className="prompt-flow-arrow" size={16} />}
            </React.Fragment>)}
        </div>
        <div className={cn('prompt-day-preview', channel && channelForm.includeDayContext === false && 'is-disabled')}>
            <div><span className="eyebrow">Аналитика дня</span><strong>{contextLoading ? 'Собираю аналитику…' : 'Что модель реально получает о дне Леры'}</strong></div>
            <Button size="sm" variant="outline" onClick={loadDayContext} disabled={contextLoading}><RefreshCw size={14} /> Обновить</Button>
            <pre>{contextLoading ? 'Загружаю подтверждённые факты, состояние, причины и планы…' : dayContext || 'Аналитика дня пока недоступна.'}</pre>
        </div>
        <p className="prompt-assembly-note">{channel ? 'В канал передаются общий образ Леры и её контекст дня. Память и история личных переписок не передаются: они принадлежат конкретному собеседнику, а не публичному каналу.' : 'Здесь показан общий контекст дня. Личная память и история добавляются только для того пользователя, который написал Лере; точный состав отправленного запроса доступен во вкладке «Диалоги».'}</p>
    </div>;
}

function LlmPanel({ toast }) {
    const [logs, setLogs] = useState([]); const [selected, setSelected] = useState(null); const [loading, setLoading] = useState(false);

    async function loadLogs() { setLoading(true); try { const data = await api('/api/admin/prompt-logs?limit=30'); setLogs(data.logs || []); } finally { setLoading(false); } }
    async function choose(id) { const data = await api(`/api/admin/prompt-logs/${id}`); setSelected(data); }
    async function judge() { if (!selected) return; const result = await api(`/api/admin/prompt-logs/${selected.log.id}/judge`, { method: 'POST' }); setSelected({ ...selected, quality: result.judge.quality }); }
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

    useEffect(() => { loadLogs(); }, []);

    return (
        <div className="llm-super-panel">
            <div className="llm-layout-v2">
                <Card>
                    <CardHeader eyebrow="Диалоги и LLM" title="Почему Лера ответила так" description="Сначала выбери сообщение. Технические детали открываются только по запросу. Ключи и секреты скрыты." action={<div className="inline-controls"><ConfirmAction title="Удалить всю историю диалогов?" description="Будут удалены сообщения всех пользователей из chat_history и conversation_events. Технические prompt-логи останутся." confirmText="Удалить всё" variant="danger" onConfirm={clearChatHistory}>Очистить историю</ConfirmAction><Button size="icon" aria-label="Обновить логи" onClick={loadLogs}><RefreshCw size={15} /></Button></div>} />
                    <div className="llm-list">
                        {loading ? <div className="empty-state">Загружаю…</div> : logs.map(log => (
                            <button className={cn('llm-row', selected?.log?.id === log.id && 'selected')} onClick={() => choose(log.id)} key={log.id}>
                                <MessageSquare size={15} />
                                <div><strong>{log.user_text || 'Системный вызов'}</strong><span>{log.kind} · {formatTime(log.created_at)} · {log.model || '—'}</span></div>
                                <QualityBadge log={log} />
                            </button>
                        ))}
                    </div>
                </Card>
                <Card className="llm-detail">
                    <CardHeader eyebrow="Разбор ответа" title={selected?.log?.user_text || 'Выбери сообщение'} description={selected ? `${selected.log.kind || 'LLM'} · ${selected.log.mode || '—'} · ${selected.log.provider_name || '—'} · ${selected.log.latency_ms || 0} мс` : 'Здесь будет цепочка контекста, ответа и проверки качества.'} />
                    {selected ? (
                        <div className="llm-sections">
                            <div className="answer-box">
                                <span>Ответ Леры</span>
                                <p>{selected.layers?.parsed_response || selected.layers?.raw_response || '—'}</p>
                                <div className="quality-row">
                                    <QualityBadge log={selected} />
                                    <Button size="sm" onClick={judge}><CheckCircle2 size={14} /> Проверить качество</Button>
                                </div>
                            </div>
                            <details><summary>Контекст дня</summary><pre>{selected.layers?.radiant_context || '—'}</pre></details>
                            <details><summary>Память пользователя</summary><pre>{JSON.stringify(selected.layers?.memory_used || [], null, 2)}</pre></details>
                            <details><summary>Usage и стоимость</summary><pre>{JSON.stringify({ usage: selected.log.usage, costUsd: selected.log.cost_usd, mode: selected.log.mode, provider: selected.log.provider_name, model: selected.log.model }, null, 2)}</pre></details>
                            <details><summary>Полный prompt</summary><pre>{selected.layers?.system_prompt || '—'}</pre></details>
                        </div>
                    ) : (
                        <div className="empty-state"><Sparkles size={22} /><span>Выбери вызов слева</span></div>
                    )}
                </Card>
            </div>

        </div>
    );
}

const STUDIO_INTENTS = ['AUTO', 'CASUAL', 'EROTIC', 'JOKE'];
const STUDIO_INTENT_LABELS = { AUTO: 'AUTO', CASUAL: 'CASUAL', JOKE: 'JOKE', EROTIC: 'EROTIC' };
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
    return <details className="sandbox-compare"><summary>Сравнить изменения <span>{changes.length ? `${changes.length} различий` : 'нет различий'}</span></summary>{changes.length ? <div>{changes.map(([label, left, right]) => <span key={label}><strong>{label}</strong>{String(left)} → {String(right)}</span>)}</div> : <p>Конфигурации одинаковые.</p>}</details>;
}
function SandboxPromptModules({ config, onChange }) {
    return <details className="studio-section"><summary>Модули промпта <span>{STUDIO_MODULES.filter(([key]) => config.promptModules[key] !== false).length} / {STUDIO_MODULES.length} включено</span></summary><div className="studio-module-list">{STUDIO_MODULES.map(([key, label, description]) => <label className="studio-module-row" key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={config.promptModules[key] !== false} onChange={event => onChange(updateStudioModule(config, key, event.target.checked))} /></label>)}</div></details>;
}
function SandboxSamplingControls({ intent, config, providers, onChange }) {
    const sampling = config.sampling;
    const selectedProvider = providers.find(provider => Number(provider.id) === Number(config.model?.provider_id)) || providers.find(provider => provider.is_active) || providers[0];
    const capabilities = selectedProvider?.sampling_capabilities || {};
    const field = (key, min, max, step = 0.01, withRange = true) => <label className="studio-sampling-field" key={key}><span><b>{STUDIO_SAMPLER_LABELS[key]}</b><input type="number" min={min} max={max} step={step} value={sampling[key] ?? ''} onChange={event => onChange(updateStudioSampling(config, key, event.target.value === '' ? null : Number(event.target.value)))} /></span>{withRange && <input aria-label={STUDIO_SAMPLER_LABELS[key]} type="range" min={min} max={max} step={step} value={sampling[key] ?? 0} onChange={event => onChange(updateStudioSampling(config, key, Number(event.target.value)))} />}</label>;
    return <section className="studio-sampling-card">
        <div className="studio-section-heading"><div><span className="eyebrow">Параметры генерации</span><h3>Конфигурация {STUDIO_INTENT_LABELS[intent]}</h3></div><Badge variant="muted">Черновик</Badge></div>
        {intent === 'AUTO' && <div className="studio-info-note">AUTO запускает classifier один раз; A/B используют один resolved intent.</div>}
        <div className="studio-sampling-grid">{field('temperature', 0, 2)}{field('top_p', 0, 1)}{field('max_tokens', 20, 1200, 10, false)}</div>
        <details className="studio-sampling-advanced"><summary>Дополнительные параметры</summary><div className="studio-sampling-grid">{field('presence_penalty', -2, 2, 0.1)}{field('frequency_penalty', -2, 2, 0.1)}{field('repetition_penalty', 1, 2, 0.05)}{field('seed', -2147483648, 2147483647, 1, false)}</div></details>
        <div className="studio-provider-line"><span>{selectedProvider?.name || 'Активный провайдер'} · {selectedProvider?.model_name || 'модель по умолчанию'}</span>{STUDIO_CAPABILITY_KEYS.map(key => <Badge key={key} variant={capabilities[key] ? 'green' : 'muted'}>{STUDIO_SAMPLER_LABELS[key]} {capabilities[key] ? 'отправлен' : 'пропущен'}</Badge>)}</div>
    </section>;
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
    const [activeIntent, setActiveIntent] = useState('AUTO');
    const [abConfig, setAbConfig] = useState(() => cloneSandboxPreset());
    const [providers, setProviders] = useState([]); const [presets, setPresets] = useState([]);
    const [history, setHistory] = useState([]); const [draftText, setDraftText] = useState(''); const [draftRole, setDraftRole] = useState('user');
    const [userText, setUserText] = useState('привет, чем занимаешься?'); const [submittedMessage, setSubmittedMessage] = useState(''); const [abMode, setAbMode] = useState(true); const [selectedVariant, setSelectedVariant] = useState('A'); const [editingVariant, setEditingVariant] = useState('A'); const [mediaPreview, setMediaPreview] = useState(false);
    const [context, setContext] = useState({ current_time: getMoscowDateTimeLocal(), pre_message_gap_seconds: 0, location_id: 'petrogradka_home', mood: 50, status: { task_type: 'IDLE_HOME_REST' }, outfit_text: '', weather: { text: '', is_raining: false }, daily_facts: [] });
    const [result, setResult] = useState(null); const [loading, setLoading] = useState(false); const [presetName, setPresetName] = useState(''); const [activePresetId, setActivePresetId] = useState(null);
    const [editingResponse, setEditingResponse] = useState(null); const [editedResponse, setEditedResponse] = useState('');
    const [userQuery, setUserQuery] = useState(''); const [foundUsers, setFoundUsers] = useState([]); const [selectedContextUser, setSelectedContextUser] = useState(null); const [loadingUserContext, setLoadingUserContext] = useState(false);
    const run = async (action, success) => { try { const response = await action(); if (success) toast?.(success); return response; } catch (error) { toast?.(error.message === 'AUTH' ? 'Сессия админки истекла. Войдите снова.' : error.message, 'error'); return null; } };
    const activeConfig = draftConfigs[activeIntent] || cloneSandboxPreset();
    const editingB = abMode && editingVariant === 'B';
    const editableConfig = editingB ? abConfig : activeConfig;
    const activeState = studioState?.intents?.[activeIntent];
    const productionConfig = activeState?.production?.config || activeConfig;
    const draftVersion = activeState?.draft?.version || '—';
    const productionVersion = activeState?.production?.version || '—';
    // draftConfigs changes immediately while studioState is only refreshed after a save.
    // Compare against Production directly so newly moved sliders are not treated as synced.
    const isDirty = JSON.stringify(activeConfig) !== JSON.stringify(productionConfig);
    const load = async () => {
        const [studioData, providerData, presetData] = await Promise.all([
            run(() => api('/api/sandbox/prompt-studio')),
            run(() => api('/api/admin/providers')),
            run(() => api('/api/sandbox/presets'))
        ]);
        if (studioData) {
            setStudioState(studioData);
            const configs = studioConfigsFromState(studioData);
            setDraftConfigs(configs);
            setAbConfig(cloneSandboxPreset(configs[activeIntent] || STUDIO_DEFAULT_CONFIG));
        }
        if (providerData) setProviders(providerData.providers || []);
        if (presetData) setPresets(presetData.presets || []);
    };
    useEffect(() => { load(); }, []);
    const normalizedContext = { ...context, current_time: context.current_time ? `${context.current_time}:00+03:00` : undefined };
    function updateActiveConfig(next) {
        setDraftConfigs(current => ({ ...current, [activeIntent]: normalizeStudioConfig(next) }));
    }
    function selectIntent(intent) {
        setActiveIntent(intent);
        setAbConfig(cloneSandboxPreset(draftConfigs[intent] || STUDIO_DEFAULT_CONFIG));
        setEditingVariant('A');
        setSelectedVariant('A');
        setResult(null);
        setSubmittedMessage('');
        setEditingResponse(null);
    }
    function updateEditableConfig(next) {
        if (editingB) setAbConfig(normalizeStudioConfig(next));
        else updateActiveConfig(next);
    }
    function continueSandboxChat(selectedResult, label, message = submittedMessage) {
        const userMessage = String(message || '').trim();
        const assistantMessage = selectedResult?.response?.trim();
        if (!userMessage || !assistantMessage || selectedResult?.error) return;
        setHistory(current => appendSandboxExchange(current, userMessage, assistantMessage));
        setUserText('');
        setSubmittedMessage('');
        setResult(null);
        setEditingResponse(null);
        toast?.(label ? `Вариант ${label} добавлен в чат` : 'Ответ добавлен в чат');
    }
    function beginResponseEdit(selectedResult) {
        if (!selectedResult?.response || selectedResult?.error) return;
        setEditedResponse(selectedResult.response);
        setEditingResponse(abMode ? selectedVariant : 'A');
    }
    function cancelResponseEdit() {
        setEditingResponse(null);
        setEditedResponse('');
    }
    function saveResponseEdit() {
        const nextResponse = editedResponse.trim();
        if (!nextResponse) return toast?.('Ответ не может быть пустым', 'error');
        const variant = abMode ? selectedVariant : 'A';
        setResult(current => {
            if (!current) return current;
            if (abMode) {
                return {
                    ...current,
                    variants: {
                        ...current.variants,
                        [variant]: { ...current.variants?.[variant], response: nextResponse, rawResponse: nextResponse }
                    }
                };
            }
            return { ...current, response: nextResponse, rawResponse: nextResponse };
        });
        setEditingResponse(null);
        toast?.('Ответ отредактирован только в Sandbox');
    }
    async function requestGeneration({ message, requestHistory, commitPendingResult = false }) {
        setLoading(true);
        setSubmittedMessage(message);
        setResult(null);
        setSelectedVariant('A');
        setEditingResponse(null);
        const variantA = studioConfigToSandboxPreset(activeConfig, `Variant A · ${activeIntent}`);
        const variantB = studioConfigToSandboxPreset(abConfig, `Variant B · ${activeIntent}`);
        try {
            const body = { userId: selectedContextUser?.user?.telegram_id || null, history: requestHistory, userText: message, routingMode: activeIntent, mediaPreview, contextOverrides: normalizedContext, preset: variantA, variantA, variantB };
            if (commitPendingResult) setHistory(requestHistory);
            const response = await run(() => api(abMode ? '/api/sandbox/ab-test' : '/api/sandbox/generate', { method: 'POST', body: JSON.stringify(body) }));
            if (response?.error || abMode) setResult(response);
            else if (response) continueSandboxChat(response, '', message);
        } finally {
            setLoading(false);
        }
    }
    async function generate() {
        const message = userText.trim();
        if (!message) return toast?.('Введите сообщение для Sandbox', 'error');
        const selectedResult = getSandboxSelectedResult(result, abMode, selectedVariant);
        const shouldCommitPendingResult = Boolean(submittedMessage && selectedResult?.response && !selectedResult.error);
        const nextHistory = shouldCommitPendingResult
            ? appendSandboxExchange(history, submittedMessage, selectedResult.response)
            : history;
        await requestGeneration({ message, requestHistory: nextHistory, commitPendingResult: shouldCommitPendingResult });
    }
    async function regenerate() {
        if (!submittedMessage || loading) return;
        await requestGeneration({ message: submittedMessage, requestHistory: history });
    }
    function applyPreset(config, id = null, name = '') {
        const rawConfigs = config?.intent_configs || config?.intentConfigs;
        const nextConfigs = rawConfigs
            ? Object.fromEntries(STUDIO_INTENTS.map(intent => [intent, normalizeStudioConfig(rawConfigs[intent] || draftConfigs[intent] || STUDIO_DEFAULT_CONFIG)]))
            : { ...draftConfigs, [activeIntent]: normalizeStudioConfig(config) };
        setDraftConfigs(nextConfigs);
        setAbConfig(cloneSandboxPreset(nextConfigs[activeIntent] || STUDIO_DEFAULT_CONFIG));
        setActivePresetId(id);
        setPresetName(name || config?.name || '');
        setResult(null);
    }
    function applyQuickPreset(name, changes) {
        const next = { ...activeConfig, sampling: { ...activeConfig.sampling, ...(changes || {}) } };
        updateActiveConfig(next);
        setAbConfig(cloneSandboxPreset(next));
        setActivePresetId(null);
        setPresetName(name);
        setResult(null);
    }
    async function saveDraft() {
        const response = await run(() => api('/api/sandbox/prompt-studio/draft', { method: 'POST', body: JSON.stringify({ intent: activeIntent, config: activeConfig }) }), `${activeIntent} draft сохранён`);
        if (response?.intents) {
            setStudioState(response);
            setDraftConfigs(studioConfigsFromState(response));
        }
    }
    async function publishIntent() {
        const response = await run(() => api('/api/sandbox/prompt-studio/publish', { method: 'POST', body: JSON.stringify({ intent: activeIntent, config: activeConfig }) }), `${activeIntent} опубликован в Production`);
        if (response?.intents) {
            setStudioState(response);
            setDraftConfigs(studioConfigsFromState(response));
        }
    }
    async function savePreset() {
        const name = presetName.trim();
        if (!name) return toast?.('Введите имя пресета', 'error');
        const config = studioConfigsToSandboxPreset(draftConfigs, name);
        const method = activePresetId ? 'PATCH' : 'POST';
        const path = activePresetId ? `/api/sandbox/presets/${activePresetId}` : '/api/sandbox/presets';
        const response = await run(() => api(path, { method, body: JSON.stringify({ name, config }) }), activePresetId ? 'Пресет обновлён' : 'Пресет сохранён');
        if (response?.preset) {
            setActivePresetId(response.preset.id);
            setPresetName(response.preset.name || name);
            await load();
        }
    }
    async function deletePreset(id) {
        const response = await run(() => api(`/api/sandbox/presets/${id}`, { method: 'DELETE' }), 'Пресет удалён');
        if (response) {
            if (activePresetId === id) { setActivePresetId(null); setPresetName(''); }
            await load();
        }
    }
    async function searchSandboxUsers() {
        const query = userQuery.trim();
        if (!query) return setFoundUsers([]);
        const response = await run(() => api(`/api/sandbox/users?q=${encodeURIComponent(query)}`));
        if (response) setFoundUsers(response.users || []);
    }
    async function loadSandboxUserContext(user) {
        setLoadingUserContext(true);
        try {
            const response = await run(() => api(`/api/sandbox/users/${user.telegram_id}/context`));
            if (!response) return;
            setHistory(response.history || []);
            setSelectedContextUser(response);
            setFoundUsers([]);
            setUserQuery('');
            setResult(null);
            setSubmittedMessage('');
            toast?.(`Контекст ${response.user.first_name || response.user.telegram_id} загружен только для Sandbox`);
        } finally {
            setLoadingUserContext(false);
        }
    }
    function resetSandboxChat() {
        setHistory([]);
        setSelectedContextUser(null);
        setResult(null);
        setSubmittedMessage('');
        setFoundUsers([]);
        setUserQuery('');
        setEditingResponse(null);
    }
    const visibleIncluded = new Set((result?.historyIncluded || history.slice(-10)).map(item => String(item.id)));
    const selectedChatResult = getSandboxSelectedResult(result, abMode, selectedVariant);
    const activeProvider = providers.find(provider => Number(provider.id) === Number(activeConfig.model?.provider_id)) || providers.find(provider => provider.is_active) || providers[0];
    const productionChanges = getSandboxConfigChanges(productionConfig, activeConfig);
    return <div className="studio-shell sandbox-panel">
        <div className="studio-topbar">
            <div><span className="eyebrow">AI Sandbox / Редактор промптов</span><h2>Тестируй ответ как диалог, публикуй как версию</h2><p>Изменения живут в черновике, пока ты явно не сохранишь и не опубликуешь их.</p></div>
            <div className="studio-topbar-meta"><Badge variant={isDirty ? 'yellow' : 'green'}>{isDirty ? 'Есть изменения' : 'Синхронизировано'}</Badge><span>{STUDIO_INTENT_LABELS[activeIntent]} · черновик v{draftVersion} · production v{productionVersion}</span></div>
        </div>
        <div className="studio-status-strip" aria-label="Статус текущей Sandbox-сессии"><Badge variant="blue">{activeProvider?.name || 'Активный провайдер'} · {activeProvider?.model_name || 'модель по умолчанию'}</Badge><Badge>{selectedContextUser ? `Контекст: ${selectedContextUser.user.first_name || selectedContextUser.user.telegram_id}` : 'Контекст пользователя: не подключён'}</Badge><Badge>История: {history.length}</Badge>{mediaPreview && <Badge variant="yellow">Превью медиа</Badge>}</div>
        <div className="studio-workbench">
            <aside className="studio-sidebar">
                <section className="studio-card studio-editor-card">
                    <div className="studio-section-heading"><div><span className="eyebrow">Редактирование</span><h3>Intent и варианты</h3></div><Badge variant="blue">{activeIntent}</Badge></div>
                    <div className="studio-intent-tabs" role="tablist" aria-label="Intent">
                        {STUDIO_INTENTS.map(intent => <button type="button" role="tab" aria-selected={activeIntent === intent} key={intent} title={intent === 'AUTO' ? 'Classifier выберет режим' : intent === 'CASUAL' ? 'Обычный разговор' : intent === 'JOKE' ? 'Шутки и ирония' : 'Интимный диалог'} className={cn('studio-intent-tab', activeIntent === intent && 'is-active')} onClick={() => selectIntent(intent)}>{intent}</button>)}
                    </div>
                    <div className="studio-version-grid"><div><span>Черновик</span><strong>v{draftVersion}</strong></div><div><span>Production</span><strong>v{productionVersion}</strong></div></div>
                    {isDirty && <div className="studio-publish-review"><strong>К публикации: {productionChanges.length ? `${productionChanges.length} изменений` : 'конфигурация синхронизирована'}</strong>{productionChanges.length > 0 && <span>{productionChanges.slice(0, 3).map(([label]) => label).join(' · ')}{productionChanges.length > 3 ? ` и ещё ${productionChanges.length - 3}` : ''}</span>}</div>}
                    <div className="studio-action-row"><Button variant="outline" onClick={saveDraft}><CheckCircle2 size={14} />Сохранить черновик</Button><Button variant="outline" onClick={() => document.getElementById('sandbox-preset-name')?.focus()}><Tag size={14} />Сохранить как пресет</Button><ConfirmAction title={`Опубликовать ${activeIntent} в Production?`} description={<><span>Черновик v{draftVersion} станет Production-версией выбранного intent. Остальные intent не изменятся.</span>{productionChanges.length > 0 && <span className="dialog-review">Изменения: {productionChanges.map(([label]) => label).join(', ')}.</span>}</>} confirmText="Опубликовать" variant="primary" disabled={!isDirty} onConfirm={publishIntent}>Опубликовать</ConfirmAction></div>
                    <div className="studio-editor-divider" />
                    <div className="studio-variant-panel-heading"><div><span className="eyebrow">Варианты Sandbox</span><h3>{editingB ? 'Конфигурация варианта B' : 'Конфигурация варианта A'}</h3></div><label className="studio-ab-switch"><input type="checkbox" checked={abMode} onChange={event => { setAbMode(event.target.checked); if (!event.target.checked) { setEditingVariant('A'); setSelectedVariant('A'); } }} aria-label="Сравнивать ответы A/B" /><span className="studio-ab-switch-track" aria-hidden="true"><span className="studio-ab-switch-thumb" /></span><span>A/B-тест</span></label></div>
                    <div className="studio-variant-tabs" role="tablist" aria-label="Редактируемый вариант">
                        <button type="button" role="tab" aria-selected={editingVariant === 'A'} className={cn('studio-variant-tab', editingVariant === 'A' && 'is-active')} onClick={() => setEditingVariant('A')}>Вариант A</button>
                        {abMode && <button type="button" role="tab" aria-selected={editingVariant === 'B'} className={cn('studio-variant-tab', editingVariant === 'B' && 'is-active')} onClick={() => setEditingVariant('B')}>Вариант B</button>}
                    </div>
                    <p className="studio-section-copy">A и B получают одинаковые сообщение, историю, контекст и intent.</p>
                    <SandboxSamplingControls intent={activeIntent} config={editableConfig} providers={providers} onChange={updateEditableConfig} />
                </section>
                <SandboxPromptModules config={editableConfig} onChange={updateEditableConfig} />
                <details className="studio-section">
                    <summary>Переопределения контекста <span>{context.location_id ? 'заданы' : 'не заданы'}</span></summary>
                    <div className="studio-section-copy">Смысловые значения для текущего теста. Production и Telegram не меняются.</div>
                    <div className="studio-context-grid">
                        <label>Время<input type="datetime-local" value={context.current_time} onChange={event => setContext({ ...context, current_time: event.target.value })} /></label>
                        <label>Пауза, сек.<input type="number" min="0" value={context.pre_message_gap_seconds} onChange={event => setContext({ ...context, pre_message_gap_seconds: Number(event.target.value) })} /></label>
                        <label>Настроение<input type="number" min="0" max="100" value={context.mood} onChange={event => setContext({ ...context, mood: Number(event.target.value) })} /></label>
                        <label>Локация<select value={context.location_id} onChange={event => setContext({ ...context, location_id: event.target.value })}><option value="petrogradka_home">Квартира на Петроградке</option><option value="cafe_sloy">Кофейня «Слой»</option><option value="showroom_work">Шоурум Макса</option><option value="vkusvill_lenina">ВкусВилл</option><option value="bar_rubinsteina">Бар на Рубинштейна</option></select></label>
                        <label>Занятие<select value={context.status.task_type} onChange={event => setContext({ ...context, status: { task_type: event.target.value } })}><option value="SLEEP_NIGHT">Спит</option><option value="WORK_LAPTOP">Работает</option><option value="IDLE_HOME_REST">Свободна дома</option></select></label>
                        <label>Погода<input value={context.weather.text} placeholder="например, дождь" onChange={event => setContext({ ...context, weather: { ...context.weather, text: event.target.value } })} /></label>
                    </div>
                    <label className="studio-textarea-field">События дня<textarea value={context.daily_facts.join('\n')} placeholder="По одному событию на строку" onChange={event => setContext({ ...context, daily_facts: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} /></label>
                </details>
                <details className="studio-section">
                    <summary>Контекст пользователя <span>{selectedContextUser ? 'загружен' : 'необязательно'}</span></summary>
                    <div className="studio-section-copy">Подключает историю и память конкретного пользователя только к этому Sandbox-чату.</div>
                    <div className="sandbox-user-search"><input value={userQuery} placeholder="ID, @username или имя" onChange={event => setUserQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') searchSandboxUsers(); }} /><Button size="sm" variant="outline" onClick={searchSandboxUsers}>Найти</Button></div>
                    {foundUsers.length > 0 && <div className="sandbox-user-results">{foundUsers.map(user => <button key={user.telegram_id} disabled={loadingUserContext} onClick={() => loadSandboxUserContext(user)}><strong>{user.first_name || 'Без имени'}</strong><span>@{user.username || '—'} · {user.telegram_id}</span></button>)}</div>}
                </details>
                <details className="studio-section">
                    <summary>Пресеты <span>{presets.length + STUDIO_QUICK_PRESETS.length} доступно</span></summary>
                    <div className="studio-quick-presets">{STUDIO_QUICK_PRESETS.map(([name, changes]) => <button key={name} className={cn('studio-preset-button', presetName === name && 'is-active')} onClick={() => applyQuickPreset(name, changes)}><strong>{name}</strong><span>Быстрый пресет</span></button>)}</div>
                    {presets.length > 0 && <div className="studio-saved-presets">{presets.map(item => <div className={cn('studio-saved-preset', activePresetId === item.id && 'is-active')} key={item.id}><button onClick={() => applyPreset(item.config, item.id, item.name)}><strong>{item.name}</strong><span>{item.config?.intent_configs ? '4 intent' : 'старый формат'}</span></button><button aria-label={`Удалить пресет ${item.name}`} onClick={() => deletePreset(item.id)}><X size={14} /></button></div>)}</div>}
                    <div className="studio-preset-save"><input id="sandbox-preset-name" aria-label="Имя пресета" value={presetName} placeholder="Имя нового пресета" onChange={event => { setPresetName(event.target.value); if (activePresetId) setActivePresetId(null); }} /><Button size="sm" onClick={savePreset}>{activePresetId ? 'Обновить' : 'Сохранить'}</Button></div>
                </details>
                <details className="studio-section studio-advanced">
                    <summary>Дополнительно <span>провайдер, добавка, медиа</span></summary>
                    <label className="studio-textarea-field">Системная добавка<textarea value={activeConfig.systemOverlay} placeholder="Опциональная добавка к system prompt" onChange={event => updateActiveConfig({ ...activeConfig, systemOverlay: event.target.value })} /></label>
                    <label>Превью медиа<input type="checkbox" checked={mediaPreview} onChange={event => setMediaPreview(event.target.checked)} /></label>
                    <div className="studio-section-copy">Возможности провайдера подсвечены в параметрах генерации. Неподдержанные параметры будут показаны в «Почему такой ответ?».</div>
                </details>
            </aside>
            <main className="studio-chat-column">
                <Card className="studio-chat-card">
                    <CardHeader eyebrow="Диалог Sandbox" title="Живой диалог, а не лог" description="Текущий intent: выбранный режим уйдёт в Sandbox. В AUTO classifier выполнится один раз и будет общим для A/B." action={<Button size="sm" variant="outline" onClick={resetSandboxChat}>Новый чат</Button>} />
                    {selectedContextUser && <div className="sandbox-context-chip"><Users size={14} /><span>Контекст: <strong>{selectedContextUser.user.first_name || selectedContextUser.user.telegram_id}</strong> · {selectedContextUser.history.length} сообщений · {selectedContextUser.activeMemoryCount} фактов</span><Button size="icon" variant="outline" aria-label="Отключить контекст пользователя" onClick={() => { setSelectedContextUser(null); setHistory([]); }}><X size={14} /></Button></div>}
                    <div className="sandbox-history sandbox-chat-history">
                        {!history.length && !submittedMessage && <div className="sandbox-chat-empty">Напиши Лере первое сообщение — начнём чистую Sandbox-сессию.</div>}
                        {history.length > 0 && <div className="sandbox-history-window">Окно истории: {visibleIncluded.size} / {history.length} сообщений</div>}
                        {history.map(item => <div key={item.id} className={cn('sandbox-history-row', item.role === 'assistant' ? 'sandbox-history-assistant' : 'sandbox-history-user', !visibleIncluded.has(String(item.id)) && 'sandbox-history-excluded')}><div className="sandbox-history-bubble"><strong>{item.role === 'assistant' ? 'Лера' : selectedContextUser?.user?.first_name || 'Богдан'}</strong><span>{item.content}</span><small>{visibleIncluded.has(String(item.id)) ? 'В окне истории' : 'Вне окна истории'}</small></div></div>)}
                        {submittedMessage && <>
                            <div className="sandbox-current-message"><div className="sandbox-current-message-bubble"><strong>{selectedContextUser?.user?.first_name || 'Богдан'}</strong><span>{submittedMessage}</span></div></div>
                            {result?.classifier && <div className="sandbox-classifier-note"><Badge variant="green">Определён intent: {result.resolvedIntent}</Badge>{activeIntent === 'AUTO' && <span>Classifier выполнен один раз для обоих вариантов.</span>}</div>}
                            {loading && <div className="sandbox-typing-bubble">Лера печатает…</div>}
                            {!loading && result && <>
                                <div className="sandbox-result-toolbar">
                                    {abMode && <div className="sandbox-result-tabs" role="tablist" aria-label="Ответы A/B">
                                        <button type="button" role="tab" aria-selected={selectedVariant === 'A'} className={cn('sandbox-result-tab', selectedVariant === 'A' && 'is-active')} onClick={() => setSelectedVariant('A')}>Вариант A</button>
                                        <button type="button" role="tab" aria-selected={selectedVariant === 'B'} className={cn('sandbox-result-tab', selectedVariant === 'B' && 'is-active')} onClick={() => setSelectedVariant('B')}>Вариант B</button>
                                    </div>}
                                    <Button size="sm" variant="outline" className="sandbox-regenerate-button" aria-label="Перегенерировать ответ" title="Перегенерировать ответ" onClick={regenerate} disabled={loading}><RefreshCw size={14} />Перегенерировать</Button>
                                </div>
                                <div className="sandbox-chat-answers">
                                    <SandboxResultCard
                                        label={abMode ? selectedVariant : 'A'}
                                        result={selectedChatResult}
                                        sharedIntent={result.resolvedIntent || '—'}
                                        isEditing={editingResponse === (abMode ? selectedVariant : 'A')}
                                        draftResponse={editedResponse}
                                        onDraftChange={setEditedResponse}
                                        onEdit={() => beginResponseEdit(selectedChatResult)}
                                        onCancelEdit={cancelResponseEdit}
                                        onSaveEdit={saveResponseEdit}
                                        onChoose={() => continueSandboxChat(selectedChatResult, abMode ? selectedVariant : '')}
                                    />
                                </div>
                                {abMode && <SandboxCompareChanges variantA={activeConfig} variantB={abConfig} />}
                            </>}
                        </>}
                    </div>
                    <div className="sandbox-send-row studio-composer"><input aria-label="Сообщение для Леры" value={userText} placeholder="Напишите Лере…" onChange={event => setUserText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') generate(); }} /><span className="studio-composer-intent">{activeIntent}</span><Button className="sandbox-send-button" onClick={generate} disabled={loading}><Play size={14} />{loading ? 'Генерирую…' : 'Сгенерировать'}</Button></div>
                    <details className="sandbox-history-editor studio-history-editor"><summary>Редактор истории <span>{history.length} сообщений</span></summary><div className="sandbox-history-edit-list">{history.map((item, index) => <div key={item.id} className="sandbox-history-edit-row"><select value={item.role} onChange={event => setHistory(history.map((entry, itemIndex) => itemIndex === index ? { ...entry, role: event.target.value } : entry))}><option value="user">Пользователь</option><option value="assistant">Лера</option></select><input value={item.content} onChange={event => setHistory(history.map((entry, itemIndex) => itemIndex === index ? { ...entry, content: event.target.value } : entry))} /><Button size="icon" variant="outline" aria-label="Удалить сообщение" onClick={() => setHistory(history.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></Button></div>)}</div><div className="sandbox-compose-row"><select value={draftRole} onChange={event => setDraftRole(event.target.value)}><option value="user">Пользователь</option><option value="assistant">Лера</option></select><input value={draftText} placeholder="Добавить прошлое сообщение" onChange={event => setDraftText(event.target.value)} /><Button size="sm" variant="outline" onClick={() => { if (draftText.trim()) { setHistory([...history, { id: `local-${Date.now()}`, role: draftRole, content: draftText.trim() }]); setDraftText(''); } }}>Добавить</Button></div></details>
                </Card>
            </main>
        </div>
    </div>;
}
function AiSandboxPromptStudio({ toast }) {
    return <div className="llm-super-panel"><SandboxPanel toast={toast} /><details className="sandbox-production-settings"><summary>Провайдеры, routing и production-prompts</summary><LlmSettingsPanel toast={toast} /></details></div>;
}

function LlmSettingsPanel({ toast }) {
    const [providers, setProviders] = useState([]);
    const [providerForm, setProviderForm] = useState({ name: '', base_url: '', api_key: '', model_name: '' });
    const [providerResults, setProviderResults] = useState([]);
    const [promptData, setPromptData] = useState(null);
    const [promptModules, setPromptModules] = useState({});
    const [promptParams, setPromptParams] = useState({ temperature: 0.7, presence_penalty: 0.1, frequency_penalty: 0.1 });
    const [routingSettings, setRoutingSettings] = useState({});
    const [routingModules, setRoutingModules] = useState({});
    const run = async (action, success) => { try { const result = await action(); if (success && toast) toast(success); return result; } catch (error) { if (toast) toast(error.message, 'error'); return null; } };
    async function loadProviders() { const result = await run(() => api('/api/admin/providers')); if (result) setProviders(result.providers || []); }
    async function loadPrompts() {
        const result = await run(() => api('/api/admin/llm-settings'));
        if (result) {
            setPromptData(result);
            setPromptModules(result.prompts || {});
            setPromptParams(result.llmParams || result.defaultParams || promptParams);
            setRoutingSettings(result.routingSettings || {});
            setRoutingModules(result.routingModules || {});
        }
    }
    async function savePrompts() {
        const result = await run(() => api('/api/admin/llm-settings', { method: 'POST', body: JSON.stringify({ ...promptParams, prompts: { ...promptModules, ...Object.fromEntries(Object.entries(routingModules).map(([key, value]) => [`routing_${key}`, value])) }, routingSettings }) }), 'Настройки LLM сохранены');
        if (result) {
            setPromptData(result);
            setPromptModules(result.prompts || promptModules);
            setPromptParams(result.llmParams || promptParams);
            setRoutingSettings(result.routingSettings || routingSettings);
            setRoutingModules(result.routingModules || routingModules);
        }
    }
    useEffect(() => { loadProviders(); loadPrompts(); }, []);
    async function toggleProviderCapability(provider, key, enabled) {
        const samplingCapabilities = { ...(provider.sampling_capabilities || {}), [key]: enabled };
        await run(() => api(`/api/admin/providers/${provider.id}/capabilities`, { method: 'PATCH', body: JSON.stringify({ samplingCapabilities }) }), 'Capabilities обновлены');
        loadProviders();
    }
    return <div className="llm-super-panel">
        <Card className="llm-config-card">
            <CardHeader eyebrow="Настройки LLM" title="Провайдеры и цепочка генерации" description="Настройте порядок резервных моделей и проверьте доступность цепочки. Ключи не показываются после добавления." />
            <div className="provider-section">
                <div className="inline-controls provider-form">
                    {[['name','Имя'],['base_url','Base URL'],['api_key','API key'],['model_name','Модель']].map(([key, placeholder]) => (
                        <input key={key} type={key === 'api_key' ? 'password' : 'text'} value={providerForm[key]} placeholder={placeholder} onChange={event => setProviderForm({ ...providerForm, [key]: event.target.value })} />
                    ))}
                    <Button onClick={() => run(() => api('/api/admin/providers', { method: 'POST', body: JSON.stringify(providerForm) }), 'Провайдер добавлен').then(loadProviders)}>Добавить</Button>
                    <Button variant="outline" onClick={() => run(() => api('/api/admin/providers/test', { method: 'POST' }), 'Проверка завершена').then(result => setProviderResults(result?.results || []))}>Проверить цепочку</Button>
                </div>
                {providerResults.map(result => <div className={cn('management-note', result.status === 'FAILED' && 'management-note-error')} key={result.id}><strong>{result.name}</strong>: {result.status} {result.durationMs ? `· ${result.durationMs} ms` : ''} {result.error ? `— Ошибка: ${result.error}` : ''}</div>)}
                <div className="providers-grid">
                    {providers.map(provider => <div className="managed-row provider-managed-row" key={provider.id}><Settings2 size={15} /><div><strong>{provider.name}</strong><span>{provider.model_name} · {provider.base_url}</span></div><Badge variant={provider.is_active ? 'green' : 'muted'}>{provider.is_active ? 'Активен' : 'Резерв'}</Badge><Button size="sm" onClick={() => run(() => api(`/api/admin/providers/${provider.id}/activate`, { method: 'POST' }), 'Провайдер активирован').then(loadProviders)}>Активировать</Button><ConfirmAction title="Удалить провайдера?" description="Провайдер будет удалён из цепочки LLM." confirmText="Удалить" variant="danger" onConfirm={() => run(() => api(`/api/admin/providers/${provider.id}`, { method: 'DELETE' }), 'Провайдер удалён').then(loadProviders)}>Удалить</ConfirmAction><details className="provider-capabilities"><summary>Sampling capabilities</summary><div>{STUDIO_CAPABILITY_KEYS.map(key => <label className="sandbox-check" key={key}>{STUDIO_SAMPLER_LABELS[key]}<input type="checkbox" checked={!!provider.sampling_capabilities?.[key]} onChange={event => toggleProviderCapability(provider, key, event.target.checked)} /></label>)}</div></details></div>)}
                </div>
            </div>
        </Card>
        <Card className="llm-config-card routing-panel">
            <CardHeader
                eyebrow="Two-Stage Routing"
                title={routingSettings.enabled ? 'Маршрутизация включена' : 'Legacy Monolithic Prompt'}
                description="Сначала классифицируется стиль, затем собирается специализированный prompt. Команды, фото и другие tools остаются backend-логикой."
                action={<div className="routing-header-actions"><Badge variant={routingSettings.enabled ? 'green' : 'yellow'}>{routingSettings.enabled ? 'Активен routing' : 'Активен legacy'}</Badge><Button onClick={() => setRoutingSettings({ ...routingSettings, enabled: !routingSettings.enabled })}>{routingSettings.enabled ? 'Переключить на legacy' : 'Включить routing'}</Button></div>}
            />

            <div className="routing-section routing-toggle-card">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Аварийный переключатель</span><strong>{routingSettings.enabled ? 'Two-Stage Routing' : 'Legacy Monolithic Prompt'}</strong><small>Меняет только способ сборки prompt. История, память, игровые данные и провайдеры не затрагиваются.</small></div>
                    <Badge variant={routingSettings.enabled ? 'green' : 'yellow'}>{routingSettings.enabled ? 'Работает' : 'Резервный путь'}</Badge>
                </div>
            </div>

            <div className="routing-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Классификатор</span><strong>Определяет один из трёх стилей</strong><small>Вызывается после backend-проверок на каждом сообщении. При ошибке используется CASUAL.</small></div>
                    <Badge variant="blue">CASUAL · EROTIC · JOKE</Badge>
                </div>
                <div className="routing-fields-grid">
                    <label>Provider классификатора<select value={routingSettings.classifierProviderId || ''} onChange={event => setRoutingSettings({ ...routingSettings, classifierProviderId: event.target.value })}><option value="">Текущая цепочка + fallback</option>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model_name}</option>)}</select></label>
                    <label>Модель классификатора<input value={routingSettings.classifierModel || ''} placeholder="Модель провайдера" onChange={event => setRoutingSettings({ ...routingSettings, classifierModel: event.target.value })} /></label>
                    <label>Timeout, мс<input type="number" min="1000" max="60000" value={routingSettings.classifierTimeoutMs ?? 7000} onChange={event => setRoutingSettings({ ...routingSettings, classifierTimeoutMs: Number(event.target.value) })} /></label>
                    <label>Max tokens<input type="number" min="1" max="8" value={routingSettings.classifierMaxTokens ?? 3} onChange={event => setRoutingSettings({ ...routingSettings, classifierMaxTokens: Number(event.target.value) })} /></label>
                </div>
                <label className="classifier-prompt-editor">Prompt классификатора<textarea value={routingSettings.classifierPrompt || ''} placeholder="Верни строго одно слово: CASUAL, EROTIC или JOKE." onChange={event => setRoutingSettings({ ...routingSettings, classifierPrompt: event.target.value })} /></label>
                <div className="field-hint">Здесь редактируется инструкция именно для микро-вызова классификации, а не prompt ответа Леры.</div>
            </div>

            <div className="routing-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Режимы генерации</span><strong>Параметры основного ответа</strong><small>Выбирается только один стилевой модуль. Игровой контекст и память добавляются всегда.</small></div>
                </div>
                <div className="routing-mode-grid">
                    {[
                        ['casual', 'CASUAL', 'Быт, флирт, обычные вопросы и инициатива.', 'blue'],
                        ['erotic', 'EROTIC', 'Контекстное продолжение горячего диалога.', 'rose'],
                        ['joke', 'JOKE', 'Шутка, мем или ирония на один ответ.', 'amber']
                    ].map(([mode, label, description, tone]) => <div className={cn('routing-mode-card', `routing-mode-card-${tone}`)} key={mode}>
                        <div className="routing-mode-head"><strong>{label}</strong><Badge>{description}</Badge></div>
                        <div className="routing-mode-fields">
                            <label>Temperature<input type="number" min="0" max="2" step="0.01" value={routingSettings[`${mode}Temperature`] ?? ''} onChange={event => setRoutingSettings({ ...routingSettings, [`${mode}Temperature`]: Number(event.target.value) })} /></label>
                            <label>Max tokens<input type="number" min="20" max="1200" value={routingSettings[`${mode}MaxTokens`] ?? ''} onChange={event => setRoutingSettings({ ...routingSettings, [`${mode}MaxTokens`]: Number(event.target.value) })} /></label>
                        </div>
                    </div>)}
                </div>
            </div>

            <div className="routing-section">
                <div className="routing-section-head">
                    <div><span className="eyebrow">Модули prompt</span><strong>Что получает основная модель</strong><small>Core Persona и общие правила загружаются всегда. Из трёх стилевых карточек выбирается одна.</small></div>
                    <Badge variant="blue">5 модулей</Badge>
                </div>
                <div className="routing-module-note">Игровой контекст, текущее время, память пользователя и очищенная история добавляются сервером автоматически и не дублируются в этих полях. Старый «Промпт Леры» сохранён только для аварийного legacy-пути.</div>
                <div className="context-template-editor">
                    <div className="routing-section-head">
                        <div><span className="eyebrow">Контекст собеседника и дня</span><strong>Шаблон динамического контекста</strong><small>Редактируется один раз, а значения подставляются сервером для каждого сообщения.</small></div>
                        <Badge variant="blue">4 плейсхолдера</Badge>
                    </div>
                    <label className="classifier-prompt-editor">
                        Шаблон контекста
                        <textarea
                            value={promptModules.context_template || ''}
                            placeholder="Используйте плейсхолдеры из подсказки ниже."
                            onChange={event => setPromptModules({ ...promptModules, context_template: event.target.value })}
                        />
                    </label>
                    <pre className="field-hint context-template-help">{CONTEXT_TEMPLATE_HELP}</pre>
                </div>
                <PromptModulesEditor modules={routingModules} onChange={setRoutingModules} definitions={ROUTING_PROMPT_MODULES} />
                <details className="prompt-expert-details"><summary>Экспертный JSON модулей routing</summary><pre>{JSON.stringify(routingModules, null, 2)}</pre></details>
            </div>

            <div className="routing-save-row"><span>Изменения применяются после сохранения.</span><Button variant="primary" onClick={savePrompts}>Сохранить настройки routing</Button></div>
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
    const [userForm, setUserForm] = useState({ textBalance: 10, imageBalance: 0 });

    const [facts, setFacts] = useState([]);
    const [factText, setFactText] = useState('');
    const [factUserId, setFactUserId] = useState('');

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
                imageBalance: result.user.image_balance ?? 0
            });
            setFactUserId(String(id));
            setFacts(result.facts || []);
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

    function addPresetBalance(addText, addImg) {
        const newText = (Number(userForm.textBalance) || 0) + addText;
        const newImg = (Number(userForm.imageBalance) || 0) + addImg;
        setUserForm({ textBalance: newText, imageBalance: newImg });
        userAction('set_balances', { textBalance: newText, imageBalance: newImg });
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
            body: JSON.stringify({ isActive })
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
                                                <Button size="sm" variant="outline" onClick={() => addPresetBalance(0, 50)}>+50 🖼️</Button>
                                            </div>
                                            <div className="inline-controls" style={{ marginTop: 12 }}>
                                                <label>Текстовый баланс<input type="number" value={userForm.textBalance} onChange={event => setUserForm({ ...userForm, textBalance: event.target.value })} /></label>
                                                <label>Баланс фото<input type="number" value={userForm.imageBalance} onChange={event => setUserForm({ ...userForm, imageBalance: event.target.value })} /></label>
                                                <Button size="sm" onClick={() => userAction('set_balances', userForm)}>Сохранить баланс</Button>
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
                                                        <ConfirmAction title="Удалить факт?" description="Факт перестанет использоваться в памяти пользователя." confirmText="Удалить" variant="danger" onConfirm={() => run(() => api(`/api/admin/memory/facts/${fact.id}`, { method: 'DELETE' }), 'Факт удалён').then(loadFacts)}>Удалить</ConfirmAction>
                                                    </div>
                                                )) : <div className="empty-state">Фактов в памяти не найдено.</div>}
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
        temperature: 1.1,
        inheritLeraPrompt: true,
        includeDayContext: true,
        promptBlocks: { voice: '', context: '', restrictions: '', cta: '' }
    });
    const [channelDraft, setChannelDraft] = useState(null);
    const [draftText, setDraftText] = useState('');

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
            temperature: result.settings?.temperature ?? 1.1,
            inheritLeraPrompt: result.settings?.inherit_lera_prompt !== false,
            includeDayContext: result.settings?.include_day_context !== false,
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

    async function generateDraft() {
        const result = await run(() => api('/api/admin/channel/draft', { method: 'POST' }));
        if (result?.draft) {
            setChannelDraft(result.draft);
            setDraftText(result.draft.text || '');
            if (toast) toast('Черновик готов — проверьте текст перед публикацией');
        }
    }

    async function publishDraft() {
        if (!channelDraft || !draftText.trim()) return;
        const result = await run(() => api('/api/admin/channel/publish-draft', {
            method: 'POST',
            body: JSON.stringify({ text: draftText.trim(), topic: channelDraft.topic, provenance: channelDraft.provenance })
        }), 'Пост опубликован');
        if (result) {
            setChannelDraft(null);
            setDraftText('');
            loadChannel();
        }
    }

    async function updatePhoto(photo, values) {
        await run(() => api(`/api/admin/photos/${photo.id}`, { method: 'PATCH', body: JSON.stringify(values) }), 'Метаданные фото сохранены');
        loadPhotos();
    }

    useEffect(() => {
        loadPhotos();
        loadChannel();
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
        questions: 'Вопросы аудитории'
    };
    const TOPIC_PROMPT_RULES = {
        thoughts: 'внутреннее ощущение или наблюдение из обычной жизни',
        flirt: 'лёгкий публичный флирт без обращения к конкретному человеку',
        life: 'бытовая деталь, маленькая неловкость или настроение',
        jokes: 'короткая ироничная шутка или наблюдение',
        questions: 'естественный вопрос подписчикам от первого лица'
    };

    return (
        <div className="content-super-container">
            <div className="crm-subnav">
                <Button variant={contentTab === 'photos' ? 'primary' : 'outline'} size="sm" onClick={() => setContentTab('photos')}>
                    <Image size={14} /> 🖼️ Галерея и Загрузка фото ({photos.length})
                </Button>
                <Button variant={contentTab === 'channel' ? 'primary' : 'outline'} size="sm" onClick={() => setContentTab('channel')}>
                    <Radio size={14} /> 📢 Автопостинг и Канал
                </Button>
            </div>

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

            {contentTab === 'channel' && (
                <div className="content-channel-layout">
                    <Card>
                        <CardHeader eyebrow="Настройки автопостинга" title="Параметры Telegram-канала" description="Расписание публикаций, режим медиа и включение." />
                        <div className="channel-settings-grid">
                            <label>Channel ID<input value={channelForm.channelId} placeholder="-100123456789" onChange={event => setChannelForm({ ...channelForm, channelId: event.target.value })} /></label>
                            <label>Ссылка на канал<input value={channelForm.channelUrl} placeholder="t.me/..." onChange={event => setChannelForm({ ...channelForm, channelUrl: event.target.value })} /></label>
                            <label>Частота (ч)<input type="number" min="1" max="168" value={channelForm.frequencyHours} onChange={event => setChannelForm({ ...channelForm, frequencyHours: event.target.value })} /></label>
                            <label>Сообщений<select value={channelForm.messagesCount} onChange={event => setChannelForm({ ...channelForm, messagesCount: event.target.value })}><option value="1">1 сообщение</option><option value="2">2 сообщения</option><option value="3">3 сообщения</option><option value="random">Случайно (1-3)</option></select></label>
                            <label>Медиа-режим<select value={channelForm.mediaMode} onChange={event => setChannelForm({ ...channelForm, mediaMode: event.target.value })}><option value="none">Без фото (только текст)</option><option value="db_photo">Прикреплять фото из базы</option></select></label>
                            <label>Температура <span>{Number(channelForm.temperature).toFixed(1)}</span><input type="range" min="0" max="2" step="0.1" value={channelForm.temperature} onChange={event => setChannelForm({ ...channelForm, temperature: Number(event.target.value) })} /></label>
                            <label className="channel-enabled"><input type="checkbox" checked={channelForm.isEnabled} onChange={event => setChannelForm({ ...channelForm, isEnabled: event.target.checked })} /> Автопостинг активен</label>
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
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Тема следующего поста" title="Один режим для одного черновика" description="Это не набор промптов и не темы, которые ИИ обязан смешать. Перед генерацией выбирается одна активная тема — и добавляется в задание для ИИ." />
                        <div className="topic-distribution-summary">
                            <div>
                                <strong>Что увидит ИИ</strong>
                                <span>«Тема: выбранная тема» и короткая задача для неё. Личность Леры, контекст дня и правила берутся из конструктора ниже.</span>
                            </div>
                            <Badge variant="blue">Итого: {Object.values(normalizeTopicShares(channelForm.topics, channelForm.topicWeights)).reduce((sum, value) => sum + value, 0)}%</Badge>
                        </div>
                        <div className="topic-weights-grid">
                            {Object.entries(TOPIC_LABELS).map(([topicKey, topicName]) => (
                                <div className="topic-weight-row" key={topicKey}>
                                    <div className="topic-weight-header">
                                        <label className="topic-enabled"><input type="checkbox" checked={channelForm.topics.includes(topicKey)} onChange={event => {
                                            const enabled = event.target.checked;
                                            const nextTopics = enabled
                                                ? [...channelForm.topics, topicKey]
                                                : channelForm.topics.filter(topic => topic !== topicKey);
                                            const safeTopics = nextTopics.length ? nextTopics : [topicKey];
                                            const nextWeights = enabled
                                                ? redistributeTopicShare(safeTopics, channelForm.topicWeights, topicKey, Math.max(10, Math.round(100 / safeTopics.length)))
                                                : normalizeTopicShares(safeTopics, channelForm.topicWeights);
                                            setChannelForm({ ...channelForm, topics: safeTopics, topicWeights: nextWeights });
                                        }} /><strong>{topicName}</strong></label>
                                        <span>{channelForm.topics.includes(topicKey) ? `${channelForm.topicWeights?.[topicKey] ?? 0}%` : 'выключена'}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        disabled={!channelForm.topics.includes(topicKey)}
                                        value={channelForm.topicWeights?.[topicKey] ?? 0}
                                        onChange={event => setChannelForm({
                                            ...channelForm,
                                            topicWeights: redistributeTopicShare(channelForm.topics, channelForm.topicWeights, topicKey, event.target.value)
                                        })}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="topic-prompt-explainer">
                            <span className="eyebrow">Как это работает</span>
                            <strong>Для выбранной темы в промпт попадёт задача:</strong>
                            <p>«{Object.entries(TOPIC_LABELS).filter(([key]) => channelForm.topics.includes(key)).map(([key, label]) => `${label} — ${TOPIC_PROMPT_RULES[key]}`).join('» · «')}»</p>
                        </div>
                        <div className="channel-action-bar"><span>Выключенная тема не участвует в выборе. При изменении одной доли остальные автоматически перераспределяются.</span><Button onClick={saveChannel}>Сохранить распределение</Button></div>
                    </Card>

                    <Card>
                        <CardHeader eyebrow="Конструктор промпта" title="Управляемая генерация" description="Личность Леры и контекст дня подключены ниже — вы сразу видите, из каких блоков собирается пост." />
                        <PromptAssemblyMap channelForm={channelForm} onChannelChange={setChannelForm} />
                        <PromptModulesEditor modules={channelForm.promptBlocks} onChange={promptBlocks => setChannelForm({ ...channelForm, promptBlocks })} definitions={CHANNEL_PROMPT_MODULES} />
                        <div className="channel-action-bar">
                            <span>Черновик не отправляется в Telegram.</span>
                            <Button variant="primary" onClick={generateDraft}><WandSparkles size={15} /> Сгенерировать черновик</Button>
                        </div>
                        {channelDraft && <div className="channel-draft-card">
                            <div className="channel-post-header"><Badge variant="blue">{TOPIC_LABELS[channelDraft.topic] || channelDraft.topic}</Badge><span>Проверьте перед публикацией</span></div>
                            <textarea value={draftText} onChange={event => setDraftText(event.target.value)} aria-label="Текст черновика поста" />
                            <div className="channel-action-bar">
                                <Button variant="outline" onClick={generateDraft}><RefreshCw size={15} /> Сгенерировать заново</Button>
                                <ConfirmAction title="Опубликовать отредактированный черновик?" description="Текст будет отправлен в Telegram-канал. После отправки редактирование Telegram-поста пока не поддержано." confirmText="Опубликовать" onConfirm={publishDraft}>Опубликовать в Telegram</ConfirmAction>
                            </div>
                        </div>}
                    </Card>

                    <Card>
                        <CardHeader eyebrow="История публикаций" title="Что уже ушло в канал" description="Карточки показывают текст и безопасное объяснение, на основе чего он был создан." />
                        <div className="channel-feed-grid">
                            {channelHistory.length ? channelHistory.map(post => (
                                <div className="channel-post-card" key={post.id || post.created_at}>
                                    <div className="channel-post-header">
                                        <Badge variant="blue">{TOPIC_LABELS[post.topic] || post.topic || 'Пост'}</Badge>
                                        <span>{formatTime(post.created_at)}</span>
                                    </div>
                                    <p className="channel-post-text">{post.text}</p>
                                    <details className="post-provenance">
                                        <summary>Почему этот пост</summary>
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
                    {[['DB', diagnostics?.db?.ok], ['Redis', diagnostics?.redis?.ok], ['Worker', diagnostics?.worker?.running]].map(([label, ok]) => (
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

function CommandPalette({ open, onClose, onViewChange, onRefresh }) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const items = useMemo(() => {
        const allItems = [
            { id: 'nav-diary', type: 'page', title: 'Дневник и Обзор', section: 'Раздел', action: () => onViewChange('diary'), icon: FileText, shortcut: '⌘1' },
            { id: 'nav-dialogs', type: 'page', title: 'Диалоги и Логи', section: 'Раздел', action: () => onViewChange('dialogs'), icon: MessageSquare, shortcut: '⌘2' },
            { id: 'nav-llm-settings', type: 'page', title: 'AI Sandbox & Prompts', section: 'Раздел', action: () => onViewChange('llm-settings'), icon: Settings2, shortcut: '⌘3' },
            { id: 'nav-crm', type: 'page', title: 'CRM Пользователей', section: 'Раздел', action: () => onViewChange('crm'), icon: Users, shortcut: '⌘4' },
            { id: 'nav-content', type: 'page', title: 'Контент и Канал', section: 'Раздел', action: () => onViewChange('content'), icon: Image, shortcut: '⌘5' },
            { id: 'nav-inventory', type: 'page', title: 'Рюкзак Леры', section: 'Раздел', action: () => onViewChange('inventory'), icon: Backpack, shortcut: '⌘6' },
            { id: 'nav-system', type: 'page', title: 'Движок и Операции', section: 'Раздел', action: () => onViewChange('system'), icon: Zap, shortcut: '⌘7' },
            { id: 'act-refresh', type: 'action', title: 'Обновить состояние системы', section: 'Команда', action: () => onRefresh(), icon: RefreshCw, shortcut: '⌘R' },
            { id: 'act-sandbox', type: 'action', title: 'Запустить AI Sandbox', section: 'Команда', action: () => onViewChange('llm-settings'), icon: WandSparkles },
            { id: 'act-god', type: 'action', title: 'God Mode и управление', section: 'Команда', action: () => onViewChange('system'), icon: ShieldAlert }
        ];
        if (!query.trim()) return allItems;
        const q = query.toLowerCase();
        return allItems.filter(item => item.title.toLowerCase().includes(q) || item.section.toLowerCase().includes(q));
    }, [query, onViewChange, onRefresh]);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    useEffect(() => {
        if (!open) return;
        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % (items.length || 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + items.length) % (items.length || 1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (items[selectedIndex]) {
                    items[selectedIndex].action();
                    onClose();
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, items, selectedIndex, onClose]);

    if (!open) return null;

    return (
        <div className="cmd-palette-overlay" onClick={onClose}>
            <div className="cmd-palette-modal" onClick={e => e.stopPropagation()}>
                <div className="cmd-palette-search">
                    <Search size={16} className="cmd-search-icon" />
                    <input
                        autoFocus
                        placeholder="Поиск по разделам и командам... (Escape закрыть)"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <kbd>ESC</kbd>
                </div>
                <div className="cmd-palette-list">
                    {items.length === 0 ? (
                        <div className="cmd-palette-empty">Ничего не найдено</div>
                    ) : (
                        items.map((item, idx) => {
                            const IconComp = item.icon;
                            return (
                                <div
                                    key={item.id}
                                    className={cn('cmd-palette-item', idx === selectedIndex && 'selected')}
                                    onClick={() => { item.action(); onClose(); }}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                >
                                    <IconComp size={16} />
                                    <span className="cmd-item-title">{item.title}</span>
                                    <span className="cmd-item-section">{item.section}</span>
                                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

function App() {
    const [authenticated, setAuthenticated] = useState(null); const [day] = useState(() => isoDate(new Date())); const [view, setView] = useState('diary'); const [data, setData] = useState(null); const [readOnly, setReadOnly] = useState(true); const [notice, setNotice] = useState(null); const [cmdOpen, setCmdOpen] = useState(false); const toastTimerRef = useRef(null);
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
    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCmdOpen(prev => !prev);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
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
                            <Button variant="outline" className="cmd-trigger-btn" onClick={() => setCmdOpen(true)}>
                                <Search size={14} /> <span>Поиск</span> <kbd>⌘K</kbd>
                            </Button>
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
            <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onViewChange={setView} onRefresh={() => refreshData.current && refreshData.current()} />
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
