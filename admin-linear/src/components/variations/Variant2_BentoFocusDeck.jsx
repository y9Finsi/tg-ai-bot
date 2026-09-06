import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
    Sparkles,
    Check,
    X,
    Sliders,
    MessageSquare,
    Send,
    Clock,
    CloudRain,
    Heart,
    MapPin,
    User,
    ChevronRight,
    Copy,
    RefreshCw,
    Zap,
    Shield,
    Flame,
    CheckCheck,
    Radio,
    Laptop,
    Hash,
    Terminal,
    Volume2,
    BookOpen,
    Eye,
    BellRing,
    Share2,
    SlidersHorizontal,
    Plus
} from 'lucide-react';

// =============================================================================
// НАЧАЛЬНЫЕ МОДУЛИ БЕНТО-ДЕКА (3 СЛОЯ: ЛС, КАНАЛ, ИНИЦИАТИВА)
// =============================================================================
export const DEFAULT_BENTO_MODULES = [
    {
        id: 'dm_base',
        title: 'Базовый диалог и сленг',
        layer: 'CHAT',
        layerName: 'Личка',
        layerIcon: 'MessageSquare',
        layerColor: '#5e6ad2',
        enabled: true,
        conditions: ['1-на-1', 'Канон'],
        conditionBadges: [
            { icon: 'User', label: '1-на-1' },
            { icon: 'Flame', label: 'СПб Канон' }
        ],
        text: 'В личных сообщениях общается естественно, тепло и коротко: ну, блин, короче, типа, слушай, хз, чето, ща, кароч, жиза, рофл, рил. Без канцелярита и смайликов. Мысли делит лесенкой через ||| (2-3 коротких баббла). Не занудствует, держит дружеский удар.',
        tokens: 72,
        previewReply: 'ну ща, пару минут буквально|||фильтр допью на Чкаловской и отвечу нормально'
    },
    {
        id: 'dm_evening',
        title: 'Вечерняя меланхолия',
        layer: 'CHAT',
        layerName: 'Личка',
        layerIcon: 'MessageSquare',
        layerColor: '#5e6ad2',
        enabled: true,
        conditions: ['🕒 Вечер', '🌧️ Дождь'],
        conditionBadges: [
            { icon: 'Clock', label: '18:00 - 23:00' },
            { icon: 'CloudRain', label: 'Дождь в СПб' }
        ],
        text: 'Если на часах вечер и в Петербурге идет дождь ({weather}), появляется нотка мягкой меланхолии. Упоминает стук капель по карнизу на Петроградке, горячий кофе и мокрые троллейбусные провода.',
        tokens: 58,
        previewReply: 'слушай, на Петроградке такой ливень стеной|||сижу у окна, кофе уже остыл, а выходить вообще не вариант'
    },
    {
        id: 'dm_intimate',
        title: 'Доверительный круг',
        layer: 'CHAT',
        layerName: 'Личка',
        layerIcon: 'MessageSquare',
        layerColor: '#5e6ad2',
        enabled: true,
        conditions: ['❤️ Близость ≥ 3'],
        conditionBadges: [
            { icon: 'Heart', label: 'Близость ≥ 3' }
        ],
        text: 'При высоком уровне доверия общается как со старым близким другом: делится забавными фейлами на парах в СПбГИК, скидывает треки, иронично ворчит на верстку и проявляет искреннюю заботу.',
        tokens: 64,
        previewReply: 'только между нами: препод по медиа сегодня выдал такой кринж, что я чуть кофе не подавилась|||ща расскажу кароч'
    },
    {
        id: 'channel_lifestyle',
        title: 'Городские наблюдения',
        layer: 'CHANNEL',
        layerName: 'Канал',
        layerIcon: 'Radio',
        layerColor: '#38bdf8',
        enabled: true,
        conditions: ['📍 Петроградка', 'Без адресата'],
        conditionBadges: [
            { icon: 'MapPin', label: 'Петроградка' },
            { icon: 'Share2', label: 'Публично' }
        ],
        text: 'В Telegram-канале @lera_spb пишет как живая петербургская студентка: ироничные заметки о городе, прохожих и питерских кофейнях. Текст монолитный без |||, завершается открытым вопросом к подписчикам.',
        tokens: 66,
        previewReply: 'кароч, дождь на Чкаловской начался ровно в тот момент, когда я вышла без зонта. классика. сижу в кофейне у Света, наблюдаю за людьми. вы как сегодня, живы?'
    },
    {
        id: 'channel_morning',
        title: 'Утренний кофе и пары',
        layer: 'CHANNEL',
        layerName: 'Канал',
        layerIcon: 'Radio',
        layerColor: '#38bdf8',
        enabled: false,
        conditions: ['🕒 08:00 - 11:00', 'СПбГИК'],
        conditionBadges: [
            { icon: 'Clock', label: '08:00 - 11:00' },
            { icon: 'BookOpen', label: 'СПбГИК' }
        ],
        text: 'Утренний пост перед парами. Сонный вайб: спешка на первую пару в институте культуры, поиск спасительного флэт уайта и легкая самоирония над тем, как тяжело просыпаться в сером Петербурге.',
        tokens: 54,
        previewReply: 'первая пара через 15 минут, а я все еще пытаюсь понять, зачем выбрала специальность с парами в 9 утра. кофе спаси, пожалуйста.'
    },
    {
        id: 'init_spontaneous',
        title: 'Спонтанный пинг',
        layer: 'INITIATIVE',
        layerName: 'Инициатива',
        layerIcon: 'BellRing',
        layerColor: '#f59e0b',
        enabled: true,
        conditions: ['⌛ Молчание > 18ч', '❤️ Близость ≥ 2'],
        conditionBadges: [
            { icon: 'Clock', label: 'Пауза > 18ч' },
            { icon: 'Heart', label: 'Близость ≥ 2' }
        ],
        text: 'Инициирует диалог первой, если собеседник долго молчит. Короткий ненавязчивый вопрос в стиле заботливой подруги, без душноты и обид: спросить как дела, упомянуть погоду или смешной момент дня.',
        tokens: 60,
        previewReply: 'слушай, ты куда пропал? у нас тут ливень с залива пришел, захвати зонт если на улице'
    },
    {
        id: 'init_night_spin',
        title: 'Ночной сплин',
        layer: 'INITIATIVE',
        layerName: 'Инициатива',
        layerIcon: 'BellRing',
        layerColor: '#f59e0b',
        enabled: true,
        conditions: ['🕒 23:00 - 03:00', 'Ночной Питер'],
        conditionBadges: [
            { icon: 'Clock', label: '23:00 - 03:00' },
            { icon: 'Flame', label: 'Ночь СПб' }
        ],
        text: 'Поздний пинг ночью во время бессонницы или долгой работы за кодом. Тихое наблюдение за пустыми проспектами, мягкий интерес к тому, спит ли собеседник, и обсуждение музыки в наушниках.',
        tokens: 56,
        previewReply: 'тоже не спишь? за окном троллейбусы уже не ходят, сижу код верстаю под эмбиент. ты как?'
    }
];

// Быстрые Radiant переменные
const RADIANT_VARIABLES = [
    { tag: '{weather}', label: 'Погода', desc: 'дождь в СПб, +9°C' },
    { tag: '{time}', label: 'Время', desc: '19:42' },
    { tag: '{user_name}', label: 'Имя', desc: 'Богдан' },
    { tag: '{location}', label: 'Локация', desc: 'Петроградка' },
    { tag: '{intimacy}', label: 'Близость', desc: 'Lvl 4' }
];

// Доступные условия Radiant для добавления/переключения
const AVAILABLE_CONDITIONS = [
    { label: '🕒 Вечер', id: 'time_evening' },
    { label: '🌧️ Дождь', id: 'weather_rain' },
    { label: '❤️ Близость ≥ 3', id: 'intimacy_high' },
    { label: '📍 Петроградка', id: 'loc_petro' },
    { label: '⌛ Молчание > 18ч', id: 'silence_18h' }
];

// Сленг-пресеты канона
const CANON_SLANG_PRESETS = ['ну', 'блин', 'короче', 'типа', 'слушай', 'хз', 'чето', 'ща', 'кароч', 'жиза', 'рофл', 'рил', 'поребрик', 'парадная'];

export default function Variant2_BentoFocusDeck({
    profile,
    onChange,
    toast,
    temperature = 0.66,
    setTemperature,
    maxTokens = 300,
    setMaxTokens,
    typingDelay = true,
    setTypingDelay,
    onExecuteDryRun
}) {
    // Состояние модулей
    const [modules, setModules] = useState(DEFAULT_BENTO_MODULES);
    const [activeModuleId, setActiveModuleId] = useState('dm_evening');
    
    // Фильтр слоев для нижнего дека: ALL, CHAT, CHANNEL, INITIATIVE
    const [layerFilter, setLayerFilter] = useState('ALL');

    // Симулятор телефона: активный таб ('CHAT' | 'CHANNEL' | 'INITIATIVE')
    const [simTab, setSimTab] = useState('CHAT');
    const [simInput, setSimInput] = useState('');
    const [simMessages, setSimMessages] = useState([
        { id: 1, sender: 'user', text: 'Ты где сейчас? Как погода на Петроградке?', time: '19:40' },
        { id: 2, sender: 'lera', text: 'слушай, на Петроградке такой ливень стеной', time: '19:41' },
        { id: 3, sender: 'lera', text: 'сижу у окна, кофе уже остыл, а выходить вообще не вариант', time: '19:41' }
    ]);
    const [simLoading, setSimLoading] = useState(false);

    // Активный модуль для Hero Focus Area
    const activeModule = useMemo(() => {
        return modules.find(m => m.id === activeModuleId) || modules[0];
    }, [modules, activeModuleId]);

    const textareaRef = useRef(null);

    // Подсчет токенов (примерная эвристика: ~3.4 знака на токен для русского)
    const estimatedTokens = useMemo(() => {
        if (!activeModule?.text) return 0;
        return Math.round(activeModule.text.trim().length / 3.4);
    }, [activeModule?.text]);

    // Общая статистика активных модулей
    const stats = useMemo(() => {
        const enabledCount = modules.filter(m => m.enabled).length;
        const totalTokens = modules
            .filter(m => m.enabled)
            .reduce((sum, m) => sum + (Math.round((m.text || '').length / 3.4) || m.tokens), 0);
        return { enabledCount, totalTokens };
    }, [modules]);

    // Переключение свитча ON/OFF для модуля
    const handleToggleModule = useCallback((id, e) => {
        if (e) e.stopPropagation();
        setModules(prev => prev.map(m => {
            if (m.id === id) {
                const updated = { ...m, enabled: !m.enabled };
                return updated;
            }
            return m;
        }));
    }, []);

    // Изменение текста в Hero Focus Area
    const handleUpdateText = useCallback((newText) => {
        setModules(prev => prev.map(m => {
            if (m.id === activeModuleId) {
                return { ...m, text: newText };
            }
            return m;
        }));
    }, [activeModuleId]);

    // Вставка быстрой переменной в позицию курсора
    const handleInsertVariable = useCallback((tag) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            handleUpdateText((activeModule.text || '') + ' ' + tag);
            return;
        }
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const currentText = activeModule.text || '';
        const updated = currentText.substring(0, start) + tag + currentText.substring(end);
        handleUpdateText(updated);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 0);
    }, [activeModule.text, handleUpdateText]);

    // Добавление / удаление Radiant условия
    const handleToggleCondition = useCallback((conditionLabel) => {
        setModules(prev => prev.map(m => {
            if (m.id === activeModuleId) {
                const exists = m.conditions.includes(conditionLabel);
                const nextConditions = exists
                    ? m.conditions.filter(c => c !== conditionLabel)
                    : [...m.conditions, conditionLabel];
                return { ...m, conditions: nextConditions };
            }
            return m;
        }));
    }, [activeModuleId]);

    // Переключение таба телефона с динамическим обновлением сценария
    const handleSwitchSimTab = (tab) => {
        setSimTab(tab);
        if (tab === 'CHAT') {
            const activeDm = modules.find(m => m.layer === 'CHAT' && m.enabled) || modules[0];
            const replies = (activeDm.previewReply || 'ну ща, кофе допью и напишу').split('|||');
            setSimMessages([
                { id: 1, sender: 'user', text: 'Привет! Чем занимаешься?', time: '19:40' },
                ...replies.map((r, i) => ({
                    id: 2 + i,
                    sender: 'lera',
                    text: r.trim(),
                    time: '19:41'
                }))
            ]);
        }
    };

    // Отправка сообщения в симулятор
    const handleSendSimMessage = (e) => {
        e?.preventDefault();
        if (!simInput.trim() || simLoading) return;
        const userMsg = simInput.trim();
        setSimInput('');
        const now = '19:42';
        setSimMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: userMsg, time: now }]);
        setSimLoading(true);

        setTimeout(() => {
            let replyParts = [];
            if (activeModule.layer === 'CHAT' && activeModule.enabled) {
                replyParts = (activeModule.previewReply || 'да нормально все, в целом жиза').split('|||');
            } else {
                replyParts = ['ну слушай, ща подумаю', 'в целом норм идея, давай позже обсудим'];
            }
            const newLeraMsgs = replyParts.map((part, idx) => ({
                id: Date.now() + 10 + idx,
                sender: 'lera',
                text: part.trim(),
                time: now
            }));
            setSimMessages(prev => [...prev, ...newLeraMsgs]);
            setSimLoading(false);
        }, 600);
    };

    // Фильтрация модулей для нижней сетки
    const filteredModules = useMemo(() => {
        if (layerFilter === 'ALL') return modules;
        return modules.filter(m => m.layer === layerFilter);
    }, [modules, layerFilter]);

    return (
        <div className="w-full bg-[#0b0d10] text-[#f3f4f6] font-sans antialiased p-4 sm:p-6 lg:p-7 space-y-6">
            
            {/* ============================================================= */}
            {/* ВЕРХНЯЯ СТУДИЙНАЯ ШАПКА: СТАТУС, СТАТИСТИКА И ДЕЙСТВИЯ          */}
            {/* ============================================================= */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-[#181c26] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-center text-[#5e6ad2] shrink-0">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-base sm:text-lg font-semibold text-[#f3f4f6] tracking-tight">
                                Студия Характера Леры
                            </h1>
                            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#5e6ad2]/15 text-[#8a95f5] border border-[#5e6ad2]/30 shadow-xs">
                                Bento Focus Deck
                            </span>
                        </div>
                        <p className="text-xs text-[#9ca3af] mt-0.5">
                            Асимметричная фокус-колода: точечное редактирование правил и живой симулятор слоев
                        </p>
                    </div>
                </div>

                {/* Быстрая статистика сборки */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <div className="px-3 py-1.5 rounded-xl bg-[#13161e] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-[#9ca3af]">Активных модулей:</span>
                        <span className="font-mono font-medium text-[#f3f4f6]">{stats.enabledCount} / {modules.length}</span>
                    </div>

                    <div className="px-3 py-1.5 rounded-xl bg-[#13161e] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-2 text-xs">
                        <Hash className="w-3.5 h-3.5 text-[#5e6ad2]" />
                        <span className="text-[#9ca3af]">Промпт-бюджет:</span>
                        <span className="font-mono font-medium text-[#f3f4f6]">~{stats.totalTokens} тк</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => toast?.('Канонический профиль синхронизирован', 'success')}
                        className="px-3.5 py-1.5 rounded-xl bg-[#5e6ad2] hover:bg-[#6b78e5] active:scale-[0.98] text-white text-xs font-medium transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] flex items-center gap-1.5 cursor-pointer"
                    >
                        <Check className="w-3.5 h-3.5" />
                        <span>Сохранить в БД</span>
                    </button>
                </div>
            </header>

            {/* ============================================================= */}
            {/* АСИММЕТРИЧНАЯ БЕНТО-СЕТКА: РЯД 1 (HERO FOCUS + КАНОН ПАСПОРТ)   */}
            {/* ============================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
                
                {/* --------------------------------------------------------- */}
                {/* 1. HERO FOCUS AREA (lg:col-span-2)                        */}
                {/* --------------------------------------------------------- */}
                <div className="lg:col-span-2 rounded-2xl bg-[#13161e] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] p-5 flex flex-col justify-between space-y-4 hover:border-white/[0.12] transition-colors relative group">
                    
                    {/* Шапка Hero карточки */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                            <span
                                className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md border"
                                style={{
                                    backgroundColor: `${activeModule.layerColor}15`,
                                    borderColor: `${activeModule.layerColor}40`,
                                    color: activeModule.layerColor
                                }}
                            >
                                {activeModule.layerName}
                            </span>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-semibold text-[#f3f4f6] tracking-tight">
                                    {activeModule.title}
                                </h2>
                                <span className={`w-2 h-2 rounded-full ${activeModule.enabled ? 'bg-emerald-400' : 'bg-[#6b7280]'}`} />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Счетчик токенов */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#181c26] border border-white/[0.06] text-xs font-mono">
                                <span className="text-[#9ca3af]">Токены:</span>
                                <span className="text-[#f3f4f6] font-semibold">{estimatedTokens}</span>
                                <span className="text-[#6b7280]">/ 300</span>
                            </div>

                            {/* Свитч активности в Hero Area */}
                            <button
                                type="button"
                                onClick={(e) => handleToggleModule(activeModule.id, e)}
                                className={`flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                                    activeModule.enabled
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                        : 'bg-[#181c26] border-white/[0.08] text-[#9ca3af]'
                                }`}
                            >
                                <span>{activeModule.enabled ? 'Активно' : 'Отключено'}</span>
                                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                                    activeModule.enabled ? 'bg-emerald-400 text-black font-bold' : 'bg-[#6b7280] text-white'
                                }`}>
                                    {activeModule.enabled ? '✓' : '×'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Просторная Textarea (14px, line-height 1.6, фокус без лишних рамок) */}
                    <div className="flex-1 flex flex-col space-y-2">
                        <div className="flex items-center justify-between text-xs text-[#9ca3af] px-1">
                            <span className="font-medium text-[#f3f4f6]/80">Инструкция правила</span>
                            <span className="text-[11px] font-mono text-[#6b7280]">
                                {activeModule.text?.length || 0} знаков
                            </span>
                        </div>
                        <div className="rounded-xl bg-[#181c26] border border-white/[0.06] focus-within:border-[#5e6ad2] focus-within:ring-1 focus-within:ring-[#5e6ad2]/30 p-3.5 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <textarea
                                ref={textareaRef}
                                value={activeModule.text || ''}
                                onChange={(e) => handleUpdateText(e.target.value)}
                                placeholder="Напишите инструкцию для этого правила..."
                                rows={5}
                                className="w-full bg-transparent text-[14px] leading-[1.6] text-[#f3f4f6] placeholder:text-[#6b7280] resize-none focus:outline-none font-sans selection:bg-[#5e6ad2]/30"
                            />
                        </div>
                    </div>

                    {/* Подвал Hero: Radiant условия и быстрые переменные */}
                    <div className="space-y-3 pt-2">
                        {/* Radiant Чипсы условий */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
                                <span className="flex items-center gap-1.5 font-medium text-[#9ca3af]">
                                    <Clock className="w-3.5 h-3.5 text-[#5e6ad2]" />
                                    <span>Условия активации Radiant:</span>
                                </span>
                                <span className="text-[11px] text-[#6b7280]">Кликните, чтобы включить/выключить</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {AVAILABLE_CONDITIONS.map(cond => {
                                    const isActive = activeModule.conditions.includes(cond.label);
                                    return (
                                        <button
                                            key={cond.id}
                                            type="button"
                                            onClick={() => handleToggleCondition(cond.label)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                                                isActive
                                                    ? 'bg-[#5e6ad2]/20 border-[#5e6ad2]/50 text-[#f3f4f6] shadow-xs'
                                                    : 'bg-[#181c26] border-white/[0.06] text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-white/[0.04]'
                                            }`}
                                        >
                                            <span>{cond.label}</span>
                                            {isActive && <span className="ml-1.5 text-[10px] text-[#8a95f5]">●</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Быстрые переменные подстановки */}
                        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04] flex-wrap">
                            <span className="text-xs text-[#6b7280] font-mono flex items-center gap-1">
                                <Terminal className="w-3 h-3 text-[#5e6ad2]" />
                                <span>Вставить:</span>
                            </span>
                            {RADIANT_VARIABLES.map(v => (
                                <button
                                    key={v.tag}
                                    type="button"
                                    onClick={() => handleInsertVariable(v.tag)}
                                    title={`${v.label} — пример: ${v.desc}`}
                                    className="px-2 py-0.5 rounded-md bg-[#181c26] hover:bg-[#5e6ad2]/20 text-[#8a95f5] hover:text-white border border-white/[0.06] hover:border-[#5e6ad2]/40 text-xs font-mono transition-all cursor-pointer"
                                >
                                    +{v.tag}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --------------------------------------------------------- */}
                {/* 2. КОМПАКТНЫЙ ПАСПОРТ КАНОНА (lg:col-span-1)              */}
                {/* --------------------------------------------------------- */}
                <div className="lg:col-span-1 rounded-2xl bg-[#13161e] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] p-5 flex flex-col justify-between space-y-4 hover:border-white/[0.12] transition-colors">
                    
                    {/* Шапка паспорта с аватаром Леры */}
                    <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
                        <div className="relative">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#5e6ad2] to-[#8a95f5] flex items-center justify-center font-bold text-white text-base shadow-sm">
                                Л
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#13161e]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h3 className="text-sm font-semibold text-[#f3f4f6]">Лера</h3>
                                <span className="text-xs text-[#9ca3af]">· 19 лет</span>
                            </div>
                            <p className="text-[11px] text-[#9ca3af]">СПбГИК (2 курс) · Петроградка</p>
                            <p className="text-[10px] text-[#6b7280]">SMM & Frontend-энтузиастка</p>
                        </div>
                    </div>

                    {/* Догмы канона (жесткие инварианты) */}
                    <div className="space-y-2.5 flex-1">
                        <div className="flex items-center justify-between text-xs text-[#9ca3af]">
                            <span className="font-semibold text-[#f3f4f6] uppercase tracking-wider text-[10px]">
                                Догмы канона
                            </span>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                Зафиксировано
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="p-2.5 rounded-xl bg-[#181c26] border border-white/[0.06] flex items-start gap-2.5">
                                <Shield className="w-4 h-4 text-[#5e6ad2] shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-medium text-[#f3f4f6]">Zero-Emoji правило</div>
                                    <p className="text-[11px] text-[#9ca3af] leading-tight mt-0.5">
                                        Строгий запрет на смайлики и графические эмодзи. Чувства передаются только живым языком.
                                    </p>
                                </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-[#181c26] border border-white/[0.06] flex items-start gap-2.5">
                                <MapPin className="w-4 h-4 text-[#5e6ad2] shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-medium text-[#f3f4f6]">Локация: Петроградка</div>
                                    <p className="text-[11px] text-[#9ca3af] leading-tight mt-0.5">
                                        Спешелти кофе у Спортивной, мокрый гранит, дворы-колодцы, пары на Дворцовой набережной.
                                    </p>
                                </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-[#181c26] border border-white/[0.06] flex items-start gap-2.5">
                                <Volume2 className="w-4 h-4 text-[#5e6ad2] shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-medium text-[#f3f4f6]">Сленг и естественный ритм</div>
                                    <p className="text-[11px] text-[#9ca3af] leading-tight mt-0.5">
                                        Короткие реплики без канцелярита: ну, блин, короче, типа, хз, чето, ща, кароч, жиза, рофл, рил.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Чипсы сленга канона */}
                    <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
                        <span className="text-[11px] text-[#6b7280] font-mono">Маркеры речи:</span>
                        <div className="flex flex-wrap gap-1">
                            {CANON_SLANG_PRESETS.map(w => (
                                <span
                                    key={w}
                                    className="px-1.5 py-0.5 rounded bg-[#181c26] border border-white/[0.06] text-[10px] font-mono text-[#9ca3af]"
                                >
                                    {w}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

            </div>

            {/* ============================================================= */}
            {/* АСИММЕТРИЧНАЯ БЕНТО-СЕТКА: РЯД 2 (СЕТКА ПЛИТОК + PHONE SIM)     */}
            {/* ============================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                
                {/* --------------------------------------------------------- */}
                {/* 3. СЕТКА МОДУЛЬНЫХ ПЛИТОК 3 СЛОЕВ (lg:col-span-2)         */}
                {/* --------------------------------------------------------- */}
                <div className="lg:col-span-2 rounded-2xl bg-[#13161e] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] p-5 space-y-4 hover:border-white/[0.12] transition-colors">
                    
                    {/* Шапка модулей + Переключатель слоев */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                        <div>
                            <h3 className="text-sm font-semibold text-[#f3f4f6]">
                                Модули характера по слоям
                            </h3>
                            <p className="text-xs text-[#9ca3af]">
                                Клик по плитке открывает её в Hero Focus Area для детальной настройки
                            </p>
                        </div>

                        {/* Фильтр слоев */}
                        <div className="flex items-center bg-[#181c26] p-1 rounded-xl border border-white/[0.06] text-xs font-medium">
                            {[
                                { id: 'ALL', label: 'Все слои' },
                                { id: 'CHAT', label: '💬 Личка' },
                                { id: 'CHANNEL', label: '📢 Канал' },
                                { id: 'INITIATIVE', label: '⚡ Инициатива' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setLayerFilter(tab.id)}
                                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                        layerFilter === tab.id
                                            ? 'bg-[#5e6ad2] text-white font-semibold shadow-xs'
                                            : 'text-[#9ca3af] hover:text-[#f3f4f6]'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Сетка компактных плиток (2 колонки) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredModules.map(module => {
                            const isSelected = module.id === activeModuleId;
                            return (
                                <div
                                    key={module.id}
                                    onClick={() => setActiveModuleId(module.id)}
                                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 relative group ${
                                        isSelected
                                            ? 'bg-[#181c26] border-[#5e6ad2] ring-1 ring-[#5e6ad2]/50 shadow-md'
                                            : 'bg-[#181c26]/60 hover:bg-[#181c26] border-white/[0.06] hover:border-white/[0.12]'
                                    } ${!module.enabled ? 'opacity-60' : ''}`}
                                >
                                    {/* Шапка плитки: бейдж слоя + заголовок + свитч */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="text-[9px] font-mono px-1.5 py-0.2 rounded border"
                                                    style={{
                                                        backgroundColor: `${module.layerColor}15`,
                                                        borderColor: `${module.layerColor}40`,
                                                        color: module.layerColor
                                                    }}
                                                >
                                                    {module.layerName}
                                                </span>
                                                {isSelected && (
                                                    <span className="text-[10px] font-mono text-[#8a95f5] font-semibold">
                                                        [В фокусе]
                                                    </span>
                                                )}
                                            </div>
                                            <h4 className="text-xs font-semibold text-[#f3f4f6] truncate">
                                                {module.title}
                                            </h4>
                                        </div>

                                        {/* Функциональный свитч ON/OFF */}
                                        <button
                                            type="button"
                                            onClick={(e) => handleToggleModule(module.id, e)}
                                            className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer shrink-0 border ${
                                                module.enabled
                                                    ? 'bg-[#5e6ad2] border-[#5e6ad2]'
                                                    : 'bg-[#13161e] border-white/[0.1]'
                                            }`}
                                            title={module.enabled ? 'Отключить правило' : 'Включить правило'}
                                        >
                                            <span
                                                className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                                    module.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                                                }`}
                                            />
                                        </button>
                                    </div>

                                    {/* Превью текста правила (2 строки с обрезкой) */}
                                    <p className="text-xs text-[#9ca3af] line-clamp-2 leading-relaxed">
                                        {module.text}
                                    </p>

                                    {/* Чипсы условий модуля */}
                                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px] font-mono">
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {module.conditions.map(c => (
                                                <span
                                                    key={c}
                                                    className="px-1.5 py-0.5 rounded bg-white/[0.03] text-[#9ca3af] border border-white/[0.04]"
                                                >
                                                    {c}
                                                </span>
                                            ))}
                                        </div>
                                        <span className="text-[#6b7280] shrink-0">
                                            ~{Math.round((module.text || '').length / 3.4)}тк
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Поясняющая подсказка в стиле Linear */}
                    <div className="p-3 rounded-xl bg-[#181c26]/40 border border-white/[0.04] flex items-center justify-between text-xs text-[#9ca3af]">
                        <span className="flex items-center gap-2">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-[#5e6ad2]" />
                            <span>Правила комбинируются на лету при компиляции системного промпта</span>
                        </span>
                        <span className="text-[11px] font-mono text-[#6b7280]">
                            ⌘S для быстрого сохранения
                        </span>
                    </div>
                </div>

                {/* --------------------------------------------------------- */}
                {/* 4. PHONE SIMULATOR (lg:col-span-1)                        */}
                {/* --------------------------------------------------------- */}
                <div className="lg:col-span-1 rounded-2xl bg-[#13161e] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] p-5 flex flex-col items-center justify-between space-y-4 hover:border-white/[0.12] transition-colors">
                    
                    <div className="w-full flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                            <Laptop className="w-4 h-4 text-[#5e6ad2]" />
                            <h3 className="text-sm font-semibold text-[#f3f4f6]">Phone Simulator</h3>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            LIVE
                        </span>
                    </div>

                    {/* Аутентичный корпус смартфона (Apple Design Bezel) */}
                    <div className="w-full max-w-[320px] rounded-[36px] bg-[#0b0d10] border-2 border-white/[0.12] shadow-2xl overflow-hidden flex flex-col p-2.5 relative">
                        
                        {/* Dynamic Island / Верхний спикер */}
                        <div className="w-20 h-4 bg-black rounded-full mx-auto mb-1 flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-[#181c26] ml-auto mr-2" />
                        </div>

                        {/* Status bar */}
                        <div className="flex items-center justify-between px-3 text-[10px] text-[#9ca3af] font-mono pb-1">
                            <span>19:42</span>
                            <div className="flex items-center gap-1">
                                <span>5G</span>
                                <span className="w-4 h-2 rounded-xs border border-[#9ca3af] flex items-center p-0.2">
                                    <span className="w-2.5 h-full bg-[#9ca3af] rounded-2xs" />
                                </span>
                            </div>
                        </div>

                        {/* Переключатель табов вверху симулятора */}
                        <div className="grid grid-cols-3 gap-1 p-1 bg-[#181c26] rounded-xl border border-white/[0.06] mb-2 text-[10px] font-medium">
                            <button
                                type="button"
                                onClick={() => handleSwitchSimTab('CHAT')}
                                className={`py-1 rounded-lg transition-all cursor-pointer ${
                                    simTab === 'CHAT' ? 'bg-[#5e6ad2] text-white font-semibold' : 'text-[#9ca3af] hover:text-[#f3f4f6]'
                                }`}
                            >
                                💬 Личка
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSwitchSimTab('CHANNEL')}
                                className={`py-1 rounded-lg transition-all cursor-pointer ${
                                    simTab === 'CHANNEL' ? 'bg-[#5e6ad2] text-white font-semibold' : 'text-[#9ca3af] hover:text-[#f3f4f6]'
                                }`}
                            >
                                📢 Канал
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSwitchSimTab('INITIATIVE')}
                                className={`py-1 rounded-lg transition-all cursor-pointer ${
                                    simTab === 'INITIATIVE' ? 'bg-[#5e6ad2] text-white font-semibold' : 'text-[#9ca3af] hover:text-[#f3f4f6]'
                                }`}
                            >
                                ⚡ Пуш
                            </button>
                        </div>

                        {/* Telegram Header */}
                        <div className="flex items-center justify-between px-2 py-1.5 bg-[#13161e] rounded-xl border border-white/[0.06] mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#5e6ad2] to-[#8a95f5] flex items-center justify-center text-white font-bold text-xs">
                                    Л
                                </div>
                                <div className="leading-tight">
                                    <div className="text-xs font-semibold text-[#f3f4f6]">Лера</div>
                                    <div className="text-[9px] text-emerald-400 font-mono">в сети</div>
                                </div>
                            </div>
                            <span className="text-[10px] text-[#6b7280] font-mono">
                                {simTab === 'CHAT' ? 'ЛС' : simTab === 'CHANNEL' ? '@lera_spb' : 'Push'}
                            </span>
                        </div>

                        {/* Тело симулятора: Содержимое зависит от выбранного таба */}
                        <div className="h-[260px] overflow-y-auto p-2 space-y-2 bg-[#090b0e] rounded-xl border border-white/[0.04] text-xs">
                            
                            {/* ТАБ 1: ЧАТ 1-НА-1 В ЛС */}
                            {simTab === 'CHAT' && (
                                <div className="space-y-2">
                                    <div className="text-center">
                                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-[#6b7280]">
                                            Сегодня
                                        </span>
                                    </div>
                                    {simMessages.map(msg => (
                                        <div
                                            key={msg.id}
                                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] rounded-2xl px-3 py-1.5 leading-relaxed text-xs shadow-xs ${
                                                    msg.sender === 'user'
                                                        ? 'bg-[#5e6ad2] text-white rounded-tr-xs'
                                                        : 'bg-[#182533] text-[#f3f4f6] rounded-tl-xs border border-white/[0.06]'
                                                }`}
                                            >
                                                <p>{msg.text}</p>
                                                <div className="flex items-center justify-end gap-1 mt-0.5 text-[9px] text-white/50 font-mono">
                                                    <span>{msg.time}</span>
                                                    {msg.sender === 'user' && <CheckCheck className="w-3 h-3" />}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {simLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-[#182533] text-[#9ca3af] rounded-2xl rounded-tl-xs px-3 py-1.5 text-xs flex items-center gap-1.5 border border-white/[0.06]">
                                                <RefreshCw className="w-3 h-3 animate-spin text-[#5e6ad2]" />
                                                <span>Лера печатает...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ТАБ 2: ПОСТ В TELEGRAM-КАНАЛЕ */}
                            {simTab === 'CHANNEL' && (
                                <div className="space-y-2.5">
                                    <div className="p-2.5 rounded-xl bg-[#13161e] border border-white/[0.06] space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-[#5e6ad2] flex items-center justify-center text-white text-[10px] font-bold">
                                                Л
                                            </div>
                                            <div>
                                                <div className="text-[11px] font-semibold text-[#f3f4f6]">Лера · Петроградка live</div>
                                                <div className="text-[9px] text-[#6b7280]">1.4k подписчиков · 19:35</div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-[#f3f4f6] leading-relaxed">
                                            кароч, дождь на Чкаловской начался ровно в тот момент, когда я вышла без зонта. классика. сижу в кофейне у Света, наблюдаю за людьми. вы как сегодня, живы?
                                        </p>
                                        <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.04] text-[10px]">
                                            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.04] text-[#9ca3af]">❤️ 142</span>
                                            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.04] text-[#9ca3af]">☕️ 89</span>
                                            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.04] text-[#9ca3af]">☔️ 45</span>
                                            <span className="ml-auto text-[9px] text-[#6b7280]">28 коммент.</span>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-[10px] text-[#6b7280] font-mono">
                                            Пост сгенерирован по модулю «Городские наблюдения»
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* ТАБ 3: СПОНТАННЫЙ PUSH (ИНИЦИАТИВА) */}
                            {simTab === 'INITIATIVE' && (
                                <div className="space-y-2.5 pt-2">
                                    <div className="p-2.5 rounded-xl bg-[#181c26] border border-white/[0.08] space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between text-[10px] font-mono text-[#8a95f5]">
                                            <span>⚡ RADIANT TRIGGER</span>
                                            <span className="text-emerald-400">ACTIVE</span>
                                        </div>
                                        <div className="text-[10px] text-[#9ca3af] space-y-0.5 font-mono">
                                            <div>🌧️ Погода: Дождь в СПб</div>
                                            <div>🕒 Время: 19:42 (Вечер)</div>
                                            <div>⌛ Молчание: 19ч 15мин</div>
                                        </div>
                                    </div>

                                    {/* Уведомление на экране блокировки */}
                                    <div className="p-3 rounded-xl bg-[#182533] border border-white/[0.1] shadow-lg space-y-1">
                                        <div className="flex items-center justify-between text-[10px] text-white/70 font-mono">
                                            <span className="font-semibold text-white">Telegram · Лера</span>
                                            <span>сейчас</span>
                                        </div>
                                        <p className="text-xs text-white leading-tight font-sans">
                                            слушай, ты как там? на Чкаловской ливень начался стеной, захвати зонт если еще на улице
                                        </p>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Инпут чата симулятора */}
                        {simTab === 'CHAT' && (
                            <form onSubmit={handleSendSimMessage} className="mt-2 flex items-center gap-1.5">
                                <input
                                    type="text"
                                    value={simInput}
                                    onChange={(e) => setSimInput(e.target.value)}
                                    placeholder="Сообщение для Леры..."
                                    className="flex-1 bg-[#13161e] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-[#f3f4f6] placeholder:text-[#6b7280] focus:outline-none focus:border-[#5e6ad2]"
                                />
                                <button
                                    type="submit"
                                    disabled={simLoading || !simInput.trim()}
                                    className="p-2 rounded-xl bg-[#5e6ad2] hover:bg-[#6b78e5] text-white transition-all disabled:opacity-40 cursor-pointer shrink-0"
                                >
                                    <Send className="w-3 h-3" />
                                </button>
                            </form>
                        )}
                        {simTab !== 'CHAT' && (
                            <button
                                type="button"
                                onClick={() => handleSwitchSimTab(simTab)}
                                className="mt-2 w-full py-1.5 rounded-xl bg-[#181c26] hover:bg-[#5e6ad2] text-white text-xs font-medium transition-colors border border-white/[0.08] flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <Zap className="w-3 h-3 text-[#8a95f5]" />
                                <span>Симулировать новый отклик</span>
                            </button>
                        )}

                    </div>

                </div>

            </div>

        </div>
    );
}
