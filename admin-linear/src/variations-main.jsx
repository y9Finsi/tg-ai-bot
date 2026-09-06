import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { 
    LayoutGrid, 
    Kanban, 
    Layers, 
    Sparkles, 
    Plus, 
    Trash2, 
    Check, 
    SlidersHorizontal, 
    MessageSquare, 
    Send, 
    Clock, 
    Shield, 
    Volume2, 
    UserCheck, 
    ChevronRight, 
    ChevronDown, 
    Maximize2, 
    Copy, 
    RefreshCw, 
    ArrowLeft, 
    Zap,
    ExternalLink,
    AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api.js';
import Variant1_MinimalKanban from '@/components/variations/Variant1_MinimalKanban.jsx';
import Variant2_BentoFocusDeck from '@/components/variations/Variant2_BentoFocusDeck.jsx';
import Variant3_StudioIDE from '@/components/variations/Variant3_StudioIDE.jsx';

// =============================================================================
// СЛОИ ПРОЕКЦИЙ ХАРАКТЕРА (SURFACES)
// =============================================================================
export const SURFACES = [
    { id: 'CHAT', label: 'Диалог ЛС (CHAT)', short: 'ЛС', desc: 'Приватный диалог 1-на-1, близость, быстрый темп и легкий флирт' },
    { id: 'CHANNEL', label: 'Канал (CHANNEL)', short: 'ТГК', desc: 'Публичные авторские посты в Telegram-канал, без интимных тайн' },
    { id: 'INITIATIVE', label: 'Инициатива (INIT)', short: 'INIT', desc: 'Спонтанные сообщения первой по суточному циклу, погоде и времени' },
    { id: 'ALL', label: 'Все слои (ALL)', short: 'ALL', desc: 'Сквозной обзор всех правил и проекций' }
];

// =============================================================================
// НАЧАЛЬНЫЕ МОДУЛИ ХАРАКТЕРА (С УЧЕТОМ СЛОЕВ ЛС / ТГК / ИНИЦИАТИВЫ)
// =============================================================================
const INITIAL_MODULES = [
    // Колонка 1: Ядро личности
    { 
        id: 'm_bio', 
        column: 'identity', 
        title: 'Легенда и учеба', 
        tag: 'identity', 
        surface: 'ALL',
        enabled: true, 
        text: 'Лере 19 лет, учится на 2 курсе СПбГИК в Питере. Подрабатывает SMM и версткой.' 
    },
    { 
        id: 'm_geo', 
        column: 'identity', 
        title: 'Петроградка и вайб СПб', 
        tag: 'vibe', 
        surface: 'ALL',
        enabled: true, 
        text: 'Живет на Петроградке. Любит спешелти кофе, серые дворы-колодцы, винил и питерские крыши.' 
    },
    { 
        id: 'm_public_image', 
        column: 'identity', 
        title: 'Публичный образ (ТГК)', 
        tag: 'channel', 
        surface: 'CHANNEL',
        enabled: true, 
        text: 'В канале выглядит как живая петербургская студентка: ироничные заметки за кофе, наблюдения за сессией и странными прохожими.' 
    },
    { 
        id: 'm_char', 
        column: 'identity', 
        title: 'Психотип и характер', 
        tag: 'personality', 
        surface: 'ALL',
        enabled: true, 
        text: 'Живая, теплая, слегка рассеянная, местами дерзкая и острая на язык. Самоирония без уныния.' 
    },
    { 
        id: 'm_role', 
        column: 'identity', 
        title: 'Роль: Coding Partner (ЛС)', 
        tag: 'partner', 
        surface: 'CHAT',
        enabled: true, 
        text: 'В личке: близкий напарник в коде и жизни. Не робот-помощник, а живой друг на равных.' 
    },

    // Колонка 2: Речевой код
    { 
        id: 'm_slang', 
        column: 'voice', 
        title: 'Разговорные маркеры', 
        tag: 'slang', 
        surface: 'ALL',
        enabled: true, 
        text: 'Использует естественные частицы и сленг: ну, блин, короче, типа, хз, чето, ща, кароч, жиза, рофл, рил.' 
    },
    { 
        id: 'm_spb', 
        column: 'voice', 
        title: 'Питерский код', 
        tag: 'spb', 
        surface: 'ALL',
        enabled: true, 
        text: 'Редко и к месту проскакивают питерские словечки: кура, поребрик, парадная, шаверма, бадлон.' 
    },
    { 
        id: 'm_ladder', 
        column: 'voice', 
        title: 'Телеграм-лесенка ||| (ЛС)', 
        tag: 'ladder', 
        surface: 'CHAT',
        enabled: true, 
        text: 'В личке форматирует мысли как короткие сообщения мессенджера через ||| (2-4 реплики в очереди).' 
    },
    { 
        id: 'm_channel_post', 
        column: 'voice', 
        title: 'Подача постов (ТГК)', 
        tag: 'channel', 
        surface: 'CHANNEL',
        enabled: true, 
        text: 'В канале пишет целостные емкие авторские посты без дробления через |||, с ярким первым панчем и вопросом к подписчикам.' 
    },
    { 
        id: 'm_concise', 
        column: 'voice', 
        title: 'Анти-канцелярит и краткость', 
        tag: 'style', 
        surface: 'ALL',
        enabled: true, 
        text: 'Никаких простыней текста, вводных слов ("конечно", "безусловно") и академических лекций. Максимум 1-2 фразы на мысль.' 
    },

    // Колонка 3: Границы и безопасность
    { 
        id: 'm_no_emoji', 
        column: 'guardrails', 
        title: 'Zero-Emoji запрет', 
        tag: 'strict', 
        surface: 'ALL',
        enabled: true, 
        text: 'Строгий запрет на графические эмодзи и текстовые смайлики (никаких :), :D, 😂). Эмоции передаются исключительно словами и пунктуацией.' 
    },
    { 
        id: 'm_flirt_dm', 
        column: 'guardrails', 
        title: 'Приватный флирт (ЛС)', 
        tag: 'boundaries', 
        surface: 'CHAT',
        enabled: true, 
        text: 'В личке допустим теплый игривый флирт, дружеская симпатия без сервильности, пошлости и кринжа.' 
    },
    { 
        id: 'm_channel_boundary', 
        column: 'guardrails', 
        title: 'Границы публичности (ТГК)', 
        tag: 'safety', 
        surface: 'CHANNEL',
        enabled: true, 
        text: 'В канале строго запрещено раскрывать личные переписки, секреты пользователей, интимные детали и приватные координаты.' 
    },
    { 
        id: 'm_initiative_rules', 
        column: 'guardrails', 
        title: 'Спонтанные сообщения (INIT)', 
        tag: 'initiative', 
        surface: 'INITIATIVE',
        enabled: true, 
        text: 'Инициатива пингует по суточному циклу (утро/вечер) или погоде. Без спама и навязчивости.' 
    }
];

export const ARCHETYPE_TEMPLATES = {
    canon: {
        label: 'Канон (СПбГИК)',
        description: 'Сбалансированный каноничный характер студентки из Питера'
    },
    rebel: {
        label: 'Дерзкая',
        description: 'Больше иронии, подколов, легкой вредности и сленга'
    },
    melancholy: {
        label: 'Ночная меланхолия',
        description: 'Больше питерской погоды, кофе, мыслей про жизнь и дождь'
    },
    gentle: {
        label: 'Мягкая подруга',
        description: 'Более теплая, участливая и заботливая подача'
    }
};

// =============================================================================
// КОМПОНЕНТ КАРТОЧКИ МОДУЛЯ (KANBAN CARD)
// =============================================================================
function KanbanModuleCard({ module, activeSurface, onToggle, onEdit, onDelete, onMove }) {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(module.text);
    const [title, setTitle] = useState(module.title);

    const handleSave = () => {
        onEdit(module.id, { title, text });
        setIsEditing(false);
    };

    const isCurrentSurface = activeSurface === 'ALL' || module.surface === 'ALL' || module.surface === activeSurface;

    return (
        <div className={`group rounded-2xl border transition-all duration-150 p-3.5 flex flex-col gap-2.5 ${
            !isCurrentSurface
                ? 'bg-[#0b0d12]/40 border-white/[0.02] opacity-40 hover:opacity-80'
                : module.enabled 
                ? 'bg-[#12151c] border-white/[0.08] hover:border-white/[0.16] shadow-xs' 
                : 'bg-[#0e1015]/60 border-white/[0.03] opacity-50 hover:opacity-80'
        }`}>
            {/* Шапка карточки: Title слева, iOS Toggle справа */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-white/90 tracking-tight truncate">
                        {module.title}
                    </span>
                    {!isCurrentSurface && (
                        <span className="text-[9px] font-mono text-white/30 shrink-0">
                            (не в проекции)
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => onToggle(module.id)}
                    className={`w-8 h-4.5 rounded-full p-0.5 flex items-center transition-all cursor-pointer shrink-0 ${
                        module.enabled ? 'bg-[#5e6ad2] justify-end' : 'bg-white/15 justify-start'
                    }`}
                    title={module.enabled ? 'Отключить модуль' : 'Включить модуль'}
                >
                    <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs block transition-transform"></span>
                </button>
            </div>

            {/* Тело карточки */}
            {isEditing ? (
                <div className="space-y-2 pt-1">
                    <input 
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-[#090b0e] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#5e6ad2]"
                        placeholder="Название модуля"
                    />
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={3}
                        className="w-full bg-[#090b0e] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/90 focus:outline-none focus:border-[#5e6ad2] resize-none"
                    />
                    <div className="flex justify-end gap-1.5">
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="px-2 py-0.5 rounded text-[11px] text-white/50 hover:text-white cursor-pointer"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-2.5 py-0.5 rounded bg-[#5e6ad2] text-white text-[11px] font-medium cursor-pointer"
                        >
                            Сохранить
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-white/70 leading-relaxed font-sans line-clamp-3 group-hover:line-clamp-none transition-all">
                    {module.text}
                </p>
            )}

            {/* Нижний бар карточки: чипсы тегов, бейдж слоя и счетчик символов */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px]">
                <div className="flex items-center gap-1.5">
                    {/* Селектор слоя для модуля */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            const order = ['ALL', 'CHAT', 'CHANNEL', 'INITIATIVE'];
                            const idx = order.indexOf(module.surface || 'ALL');
                            const next = order[(idx + 1) % order.length];
                            onEdit(module.id, { surface: next });
                        }}
                        className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                            module.surface === 'CHANNEL' 
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                                : module.surface === 'CHAT' 
                                ? 'bg-[#5e6ad2]/20 text-[#8b95f6] border border-[#5e6ad2]/40' 
                                : module.surface === 'INITIATIVE' 
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                                : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                        }`}
                        title="Слой проекции (кликните для смены: ALL -> ЛС -> ТГК -> INIT)"
                    >
                        {module.surface === 'ALL' ? 'ALL' : (module.surface === 'CHAT' ? 'ЛС' : (module.surface === 'CHANNEL' ? 'ТГК' : 'INIT'))}
                    </button>

                    <span className="font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40 border border-white/[0.05]">
                        #{module.tag}
                    </span>

                    <button
                        type="button"
                        onClick={() => setIsEditing(!isEditing)}
                        className="p-1 rounded text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                        title="Редактировать"
                    >
                        <Maximize2 className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(module.id)}
                        className="p-1 rounded text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Удалить"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>

                <div className="flex items-center gap-2 font-mono text-white/40">
                    <span>{module.text.length} ch</span>
                    {onMove && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {module.column !== 'identity' && (
                                <button
                                    type="button"
                                    onClick={() => onMove(module.id, module.column === 'guardrails' ? 'voice' : 'identity')}
                                    className="hover:text-white px-0.5 cursor-pointer"
                                    title="Переместить левее"
                                >
                                    ←
                                </button>
                            )}
                            {module.column !== 'guardrails' && (
                                <button
                                    type="button"
                                    onClick={() => onMove(module.id, module.column === 'identity' ? 'voice' : 'guardrails')}
                                    className="hover:text-white px-0.5 cursor-pointer"
                                    title="Переместить правее"
                                >
                                    →
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// ВАРИАНТ 1: АТОМАРНЫЙ КАНБАН-КОНСТРУКТОР ПРОМПТА
// =============================================================================
function KanbanModularStudio({ 
    modules, 
    onToggleModule, 
    onEditModule, 
    onDeleteModule, 
    onMoveModule, 
    onAddModule,
    assembledPrompt,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    typingDelay,
    setTypingDelay,
    sandboxInput,
    setSandboxInput,
    sandboxLoading,
    sandboxResult,
    onExecuteDryRun,
    activeSurface,
    setActiveSurface
}) {
    const [showFullPrompt, setShowFullPrompt] = useState(false);
    const [copied, setCopied] = useState(false);

    const identityModules = modules.filter(m => m.column === 'identity');
    const voiceModules = modules.filter(m => m.column === 'voice');
    const guardrailsModules = modules.filter(m => m.column === 'guardrails');

    const handleCopy = () => {
        navigator.clipboard.writeText(assembledPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-4">
            {/* ПАНЕЛЬ ПЕРЕКЛЮЧЕНИЯ СЛОЕВ ПРОЕКЦИЙ (ЛС / ТГК / ИНИЦИАТИВА) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0e1117] border border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#5e6ad2]"></span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">Слой проекции характера:</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#5e6ad2]/20 text-[#8b95f6] border border-[#5e6ad2]/30">
                                {SURFACES.find(s => s.id === activeSurface)?.short || activeSurface}
                            </span>
                        </div>
                        <p className="text-[11px] text-white/40">
                            {SURFACES.find(s => s.id === activeSurface)?.desc}
                        </p>
                    </div>
                </div>

                <div className="flex items-center bg-[#12151c] p-1 rounded-xl border border-white/[0.06] overflow-x-auto">
                    {SURFACES.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setActiveSurface(s.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                                activeSurface === s.id 
                                    ? 'bg-[#5e6ad2] text-white shadow-xs font-semibold' 
                                    : 'text-white/40 hover:text-white'
                            }`}
                        >
                            <span>{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 4 Колонки Канбана */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 items-start">
                {/* ---------------- КОЛОНКА 1: ЯДРО ЛИЧНОСТИ ---------------- */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.07] p-3.5 space-y-3 flex flex-col">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-[#5e6ad2] px-1.5 py-0.5 rounded bg-[#5e6ad2]/10 border border-[#5e6ad2]/20">
                                01
                            </span>
                            <h3 className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5 text-[#5e6ad2]" />
                                Ядро личности
                            </h3>
                        </div>
                        <span className="text-[10px] font-mono text-white/40">
                            {identityModules.filter(m => m.enabled).length}/{identityModules.length}
                        </span>
                    </div>

                    <div className="space-y-2.5">
                        {identityModules.map(module => (
                            <KanbanModuleCard
                                key={module.id}
                                module={module}
                                activeSurface={activeSurface}
                                onToggle={onToggleModule}
                                onEdit={onEditModule}
                                onDelete={onDeleteModule}
                                onMove={onMoveModule}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => onAddModule('identity')}
                        className="w-full py-2 rounded-xl border border-dashed border-white/10 hover:border-white/20 text-white/40 hover:text-white text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Plus className="w-3 h-3" />
                        Добавить модуль личности
                    </button>
                </div>

                {/* ---------------- КОЛОНКА 2: ГОЛОС И СЛЕНГ ---------------- */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.07] p-3.5 space-y-3 flex flex-col">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-[#5e6ad2] px-1.5 py-0.5 rounded bg-[#5e6ad2]/10 border border-[#5e6ad2]/20">
                                02
                            </span>
                            <h3 className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
                                <Volume2 className="w-3.5 h-3.5 text-[#5e6ad2]" />
                                Голос и сленг
                            </h3>
                        </div>
                        <span className="text-[10px] font-mono text-white/40">
                            {voiceModules.filter(m => m.enabled).length}/{voiceModules.length}
                        </span>
                    </div>

                    <div className="space-y-2.5">
                        {voiceModules.map(module => (
                            <KanbanModuleCard
                                key={module.id}
                                module={module}
                                activeSurface={activeSurface}
                                onToggle={onToggleModule}
                                onEdit={onEditModule}
                                onDelete={onDeleteModule}
                                onMove={onMoveModule}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => onAddModule('voice')}
                        className="w-full py-2 rounded-xl border border-dashed border-white/10 hover:border-white/20 text-white/40 hover:text-white text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Plus className="w-3 h-3" />
                        Добавить модуль голоса
                    </button>
                </div>

                {/* ---------------- КОЛОНКА 3: ГРАНИЦЫ И БЕЗОПАСНОСТЬ ---------------- */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.07] p-3.5 space-y-3 flex flex-col">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-[#5e6ad2] px-1.5 py-0.5 rounded bg-[#5e6ad2]/10 border border-[#5e6ad2]/20">
                                03
                            </span>
                            <h3 className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-[#5e6ad2]" />
                                Границы и правила
                            </h3>
                        </div>
                        <span className="text-[10px] font-mono text-white/40">
                            {guardrailsModules.filter(m => m.enabled).length}/{guardrailsModules.length}
                        </span>
                    </div>

                    <div className="space-y-2.5">
                        {guardrailsModules.map(module => (
                            <KanbanModuleCard
                                key={module.id}
                                module={module}
                                activeSurface={activeSurface}
                                onToggle={onToggleModule}
                                onEdit={onEditModule}
                                onDelete={onDeleteModule}
                                onMove={onMoveModule}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => onAddModule('guardrails')}
                        className="w-full py-2 rounded-xl border border-dashed border-white/10 hover:border-white/20 text-white/40 hover:text-white text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Plus className="w-3 h-3" />
                        Добавить правило
                    </button>
                </div>

                {/* ---------------- КОЛОНКА 4: СБОРКА И СЛОЕВОЙ СИМУЛЯТОР ---------------- */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.07] p-3.5 space-y-3.5 flex flex-col">
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-[#5e6ad2] px-1.5 py-0.5 rounded bg-[#5e6ad2]/10 border border-[#5e6ad2]/20">
                                04
                            </span>
                            <h3 className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-[#5e6ad2]" />
                                {activeSurface === 'CHANNEL' ? 'Симулятор ТГК' : (activeSurface === 'INITIATIVE' ? 'Симулятор Инициативы' : 'Симулятор ЛС')}
                            </h3>
                        </div>
                        <span className="text-[10px] font-mono text-[#5e6ad2]">
                            {activeSurface}
                        </span>
                    </div>

                    {/* Скомпилированный промпт для активного слоя */}
                    <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-white/90">Проекция: {activeSurface}</span>
                            <span className="text-[11px] font-mono text-[#8b95f6]">
                                ~{Math.ceil(assembledPrompt.length / 4)} токенов
                            </span>
                        </div>

                        {/* Индикатор бюджета токенов */}
                        <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-[#5e6ad2] to-[#7a88ef] rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(5, Math.round((assembledPrompt.length / 4 / 4096) * 100)))}%` }}
                            />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-white/40 pt-1">
                            <span>Модулей в слое: {modules.filter(m => m.enabled && (activeSurface === 'ALL' || m.surface === 'ALL' || m.surface === activeSurface)).length}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                    <Copy className="w-3 h-3" />
                                    <span>{copied ? 'Скопировано' : 'Копировать'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowFullPrompt(!showFullPrompt)}
                                    className="hover:text-white cursor-pointer"
                                >
                                    {showFullPrompt ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>

                        {showFullPrompt && (
                            <div className="text-[11px] font-mono text-white/60 bg-[#090b0e] p-2.5 rounded-lg border border-white/[0.05] leading-relaxed max-h-52 overflow-y-auto">
                                <pre className="whitespace-pre-wrap font-mono">{assembledPrompt}</pre>
                            </div>
                        )}
                    </div>

                    {/* Параметры генерации */}
                    <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-3.5 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-white/60">Температура:</span>
                            <span className="font-mono text-white font-semibold">{temperature}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {[0.5, 0.66, 0.85, 1.0].map(val => (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setTemperature(val)}
                                    className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-colors cursor-pointer ${
                                        temperature === val ? 'bg-[#5e6ad2] text-white font-bold' : 'bg-white/[0.04] text-white/50 hover:text-white'
                                    }`}
                                >
                                    {val}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]">
                            <span className="text-white/60">Макс. токенов:</span>
                            <span className="font-mono text-white font-semibold">{maxTokens}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {[150, 300, 500].map(val => (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setMaxTokens(val)}
                                    className={`flex-1 py-1 rounded-lg text-[10px] font-mono transition-colors cursor-pointer ${
                                        maxTokens === val ? 'bg-[#5e6ad2] text-white font-bold' : 'bg-white/[0.04] text-white/50 hover:text-white'
                                    }`}
                                >
                                    {val}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* АДАПТИВНЫЙ СИМУЛЯТОР В ЗАВИСИМОСТИ ОТ СЛОЯ */}
                    {activeSurface === 'CHANNEL' ? (
                        /* СИМУЛЯТОР ПОСТА В ТЕЛЕГРАМ-КАНАЛЕ */
                        <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-3.5 space-y-3 flex flex-col">
                            <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.05]">
                                <span className="font-semibold text-white/90">Превью поста канала</span>
                                {sandboxResult && (
                                    <span className="font-mono text-[10px] text-emerald-400">
                                        {sandboxResult.latencyMs || 240}ms
                                    </span>
                                )}
                            </div>

                            <div className="bg-[#090b0e] border border-white/[0.06] rounded-xl p-3 space-y-2.5 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-[#5e6ad2] flex items-center justify-center font-bold text-[10px] text-white">
                                        Л
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-white truncate">Лера · Петроградка live</p>
                                        <p className="text-[10px] text-white/40">1.4k подписчиков · сегодня в 17:40</p>
                                    </div>
                                </div>

                                <div className="text-white/90 leading-relaxed font-sans pt-1">
                                    {sandboxLoading ? (
                                        <div className="flex items-center gap-2 text-white/50 py-2">
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5e6ad2]" />
                                            <span>Генерация авторского поста по правилам ТГК...</span>
                                        </div>
                                    ) : sandboxResult?.reply ? (
                                        sandboxResult.reply.replace(/\|\|\|/g, '\n\n')
                                    ) : (
                                        'кароч, вышла из института на Петроградке, а тут такой дождь, что даже мой любимый спешелти не спасает. сижу в кофейне у Спортивной, слушаю шум капель по крыше и думаю: вы как вообще переживаете питерскую осень?'
                                    )}
                                </div>

                                {/* Реакции на пост в канале */}
                                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.04]">
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-white/70">
                                        ❤️ 142
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-white/70">
                                        ☕️ 89
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-white/70">
                                        ☔️ 45
                                    </span>
                                    <span className="ml-auto text-[10px] text-white/40">
                                        💬 23 комментария
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onExecuteDryRun('Напиши авторский пост в канал про дождь и сессию')}
                                disabled={sandboxLoading}
                                className="w-full py-2 rounded-xl bg-[#5e6ad2] hover:bg-[#5e6ad2]/90 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <Zap className="w-3.5 h-3.5" />
                                <span>Сгенерировать пост для канала</span>
                            </button>
                        </div>
                    ) : activeSurface === 'INITIATIVE' ? (
                        /* СИМУЛЯТОР СПОНТАННОЙ ИНИЦИАТИВЫ */
                        <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-3.5 space-y-3 flex flex-col">
                            <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.05]">
                                <span className="font-semibold text-white/90">Спонтанное событие (Push)</span>
                                {sandboxResult && (
                                    <span className="font-mono text-[10px] text-emerald-400">
                                        {sandboxResult.latencyMs || 240}ms
                                    </span>
                                )}
                            </div>

                            {/* Карточка Radiant контекста */}
                            <div className="p-2.5 rounded-xl bg-[#090b0e] border border-white/[0.06] space-y-2 text-xs">
                                <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                                    <span>Radiant Context:</span>
                                    <span className="text-emerald-400">TRIGGER ACTIVE</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                    <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04] text-white/70">
                                        ⏰ Время: 18:42 (Вечер)
                                    </div>
                                    <div className="p-1.5 rounded bg-white/[0.02] border border-white/[0.04] text-white/70">
                                        ☔️ Погода: Дождь в СПб
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-[#182533] text-white border border-white/10 text-xs leading-relaxed">
                                    <div className="text-[10px] font-mono text-[#8b95f6] mb-1">
                                        Спонтанное ЛС от Леры:
                                    </div>
                                    {sandboxLoading ? (
                                        <div className="flex items-center gap-2 text-white/50">
                                            <RefreshCw className="w-3 h-3 animate-spin text-[#5e6ad2]" />
                                            <span>Моделирование спонтанной реплики...</span>
                                        </div>
                                    ) : sandboxResult?.reply ? (
                                        sandboxResult.reply.replace(/\|\|\|/g, ' ')
                                    ) : (
                                        'слушай, ты как там? на Чкаловской ливень начался стеной, захвати зонт если еще на улице'
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onExecuteDryRun('Смоделируй спонтанную инициативу: вечер, дождь на Петроградке')}
                                disabled={sandboxLoading}
                                className="w-full py-2 rounded-xl bg-[#5e6ad2] hover:bg-[#5e6ad2]/90 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <Zap className="w-3.5 h-3.5" />
                                <span>Симулировать спонтанный пинг</span>
                            </button>
                        </div>
                    ) : (
                        /* СИМУЛЯТОР ПРИВАТНОГО ДИАЛОГА В ЛС */
                        <div className="rounded-2xl bg-[#12151c] border border-white/[0.08] p-3.5 space-y-3 flex flex-col">
                            <div className="flex items-center justify-between text-xs pb-1 border-b border-white/[0.05]">
                                <span className="font-semibold text-white/90">Telegram chats (Личка)</span>
                                {sandboxResult && (
                                    <span className="font-mono text-[10px] text-emerald-400">
                                        {sandboxResult.latencyMs || 240}ms
                                    </span>
                                )}
                            </div>

                            {/* Разделитель даты Today */}
                            <div className="flex justify-center">
                                <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-white/40 font-mono">
                                    Today
                                </span>
                            </div>

                            {/* Бабблы сообщений */}
                            <div className="min-h-[140px] max-h-[220px] overflow-y-auto space-y-2 p-1 font-sans text-xs">
                                <div className="flex justify-end">
                                    <div className="bg-[#5e6ad2] text-white rounded-2xl rounded-tr-xs px-3.5 py-2 max-w-[85%] leading-relaxed shadow-xs flex flex-col items-end gap-0.5">
                                        <span>{sandboxInput || 'Привет, пойдешь за кофе?'}</span>
                                        <span className="text-[9px] text-white/60 font-mono flex items-center gap-0.5">
                                            18:30 <Check className="w-2.5 h-2.5 stroke-[3]" />
                                        </span>
                                    </div>
                                </div>

                                {sandboxLoading ? (
                                    <div className="flex justify-start">
                                        <div className="bg-[#182533] text-white/70 rounded-2xl rounded-tl-xs px-3.5 py-2 text-xs flex items-center gap-2">
                                            <RefreshCw className="w-3 h-3 animate-spin text-[#5e6ad2]" />
                                            <span>Лера печатает...</span>
                                        </div>
                                    </div>
                                ) : sandboxResult?.reply ? (
                                    <div className="space-y-1">
                                        {sandboxResult.reply.split('|||').map((part, idx) => (
                                            <div key={idx} className="flex justify-start">
                                                <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3.5 py-2 max-w-[85%] leading-relaxed shadow-xs flex flex-col items-start gap-0.5">
                                                    <span>{part.trim()}</span>
                                                    <span className="text-[9px] text-white/40 font-mono self-end">18:31</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <div className="flex justify-start">
                                            <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3.5 py-2 max-w-[85%] leading-relaxed shadow-xs flex flex-col items-start gap-0.5">
                                                <span>ну ща, подожди пару минут</span>
                                                <span className="text-[9px] text-white/40 font-mono self-end">18:31</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-start">
                                            <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3.5 py-2 max-w-[85%] leading-relaxed shadow-xs flex flex-col items-start gap-0.5">
                                                <span>допью фильтр на Петроградке и решим</span>
                                                <span className="text-[9px] text-white/40 font-mono self-end">18:31</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Чипсы быстрых реплик */}
                            <div className="flex flex-wrap gap-1">
                                {['Привет, как дела?', 'Где ты сейчас?', 'Пойдем за кофе?'].map(txt => (
                                    <button
                                        key={txt}
                                        type="button"
                                        onClick={() => setSandboxInput(txt)}
                                        className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-white/60 hover:text-white transition-colors cursor-pointer"
                                    >
                                        {txt}
                                    </button>
                                ))}
                            </div>

                            {/* Поле ввода и кнопка теста */}
                            <div className="flex items-center gap-1.5 pt-1">
                                <input
                                    type="text"
                                    value={sandboxInput}
                                    onChange={(e) => setSandboxInput(e.target.value)}
                                    placeholder="Message..."
                                    className="flex-1 bg-[#090b0e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#5e6ad2]"
                                />
                                <button
                                    type="button"
                                    onClick={() => onExecuteDryRun(sandboxInput)}
                                    disabled={sandboxLoading}
                                    className="px-3.5 py-2 rounded-xl bg-[#5e6ad2] hover:bg-[#5e6ad2]/90 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
                                >
                                    {sandboxLoading ? '...' : <Send className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// ВАРИАНТ 2: BENTO STUDIO PRO (МОДУЛЬНАЯ МОЗАИКА APPLE / RAYCAST)
// =============================================================================
function BentoStudioPro({ 
    modules, 
    onToggleModule, 
    onEditModule, 
    onDeleteModule, 
    assembledPrompt,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    sandboxInput,
    setSandboxInput,
    sandboxLoading,
    sandboxResult,
    onExecuteDryRun
}) {
    const [slangDensity, setSlangDensity] = useState('medium');
    const identityModules = modules.filter(m => m.column === 'identity');
    const voiceModules = modules.filter(m => m.column === 'voice');
    const guardrailsModules = modules.filter(m => m.column === 'guardrails');

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                {/* HERO BENTO (7 cols): Паспорт личности и легенда */}
                <div className="md:col-span-7 rounded-2xl bg-[#0e1117] border border-white/[0.08] p-4 flex flex-col justify-between space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#5e6ad2]/15 text-[#8b95f6] border border-[#5e6ad2]/30 font-semibold">
                                    CORE IDENTITY
                                </span>
                                <h3 className="text-sm font-semibold text-white">Паспорт личности и легенда</h3>
                            </div>
                            <p className="text-xs text-white/50">
                                Базовые константы персонажа: возраст, локация, статус и вайб общения
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-white/40">
                                {identityModules.filter(m => m.enabled).length} модулей
                            </span>
                        </div>
                    </div>

                    {/* Модульные плашки ядра */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {identityModules.map(module => (
                            <div 
                                key={module.id} 
                                className={`p-3 rounded-xl border transition-all ${
                                    module.enabled 
                                        ? 'bg-[#12151c] border-white/[0.08]' 
                                        : 'bg-white/[0.02] border-white/[0.04] opacity-50'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-white/90">{module.title}</span>
                                    <button 
                                        type="button"
                                        onClick={() => onToggleModule(module.id)}
                                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center cursor-pointer ${
                                            module.enabled ? 'bg-[#5e6ad2] border-[#5e6ad2]' : 'border-white/20'
                                        }`}
                                    >
                                        {module.enabled && <Check className="w-2.5 h-2.5 stroke-[3] text-white" />}
                                    </button>
                                </div>
                                <p className="text-xs text-white/60 leading-relaxed line-clamp-2">
                                    {module.text}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[11px] text-white/40">
                        <span>Санкт-Петербург · Петроградская сторона</span>
                        <span>Coding Partner & SMM</span>
                    </div>
                </div>

                {/* BENTO 2 (5 cols): Voice Matrix & Slang */}
                <div className="md:col-span-5 rounded-2xl bg-[#0e1117] border border-white/[0.08] p-4 flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                                VOICE & LEXICON
                            </span>
                            <span className="text-xs font-mono text-white/40">Лесенка |||</span>
                        </div>
                        <h3 className="text-sm font-semibold text-white">Речевой код и сленг</h3>
                    </div>

                    <div className="space-y-2">
                        {voiceModules.map(module => (
                            <div 
                                key={module.id}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                                    module.enabled ? 'bg-[#12151c] border-white/[0.07] text-white/90' : 'bg-white/[0.02] border-white/[0.03] text-white/40'
                                }`}
                            >
                                <span className="font-medium truncate max-w-[220px]">{module.title}</span>
                                <button
                                    type="button"
                                    onClick={() => onToggleModule(module.id)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                                        module.enabled ? 'bg-[#5e6ad2] text-white' : 'bg-white/5 text-white/30'
                                    }`}
                                >
                                    {module.enabled ? 'ВКЛ' : 'ВЫКЛ'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#12151c] border border-white/[0.05] flex items-center justify-between text-xs">
                        <span className="text-white/60">Плотность сленга:</span>
                        <div className="flex gap-1">
                            {['low', 'medium', 'high'].map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setSlangDensity(d)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase cursor-pointer ${
                                        slangDensity === d ? 'bg-[#5e6ad2] text-white font-bold' : 'text-white/40 hover:text-white'
                                    }`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* BENTO 3 (4 cols): Guardrails Shield */}
                <div className="md:col-span-4 rounded-2xl bg-[#0e1117] border border-white/[0.08] p-4 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                            GUARDRAILS
                        </span>
                        <h3 className="text-sm font-semibold text-white">Ограничения и безопасность</h3>
                    </div>

                    <div className="space-y-2">
                        {guardrailsModules.map(module => (
                            <div 
                                key={module.id} 
                                className={`p-2.5 rounded-xl border text-xs ${
                                    module.enabled ? 'bg-[#12151c] border-white/[0.07]' : 'bg-white/[0.02] border-white/[0.03] opacity-50'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-white/90">{module.title}</span>
                                    <button 
                                        type="button"
                                        onClick={() => onToggleModule(module.id)}
                                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center cursor-pointer ${
                                            module.enabled ? 'bg-[#5e6ad2] border-[#5e6ad2]' : 'border-white/20'
                                        }`}
                                    >
                                        {module.enabled && <Check className="w-2.5 h-2.5 stroke-[3] text-white" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-white/50 mt-1 line-clamp-2">{module.text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* BENTO 4 (8 cols): Live Telegram Sandbox */}
                <div className="md:col-span-8 rounded-2xl bg-[#0e1117] border border-white/[0.08] p-4 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold">
                                LIVE PLAYGROUND
                            </span>
                            <h3 className="text-sm font-semibold text-white">Тестирование в режиме реального времени</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono text-white/50">
                            <span>T: {temperature}</span>
                            <span>Max: {maxTokens}</span>
                            {sandboxResult && <span className="text-emerald-400">{sandboxResult.latencyMs || 240}ms</span>}
                        </div>
                    </div>

                    {/* Чат */}
                    <div className="bg-[#090b0e] border border-white/[0.06] rounded-xl p-3 min-h-[140px] max-h-[180px] overflow-y-auto space-y-2 text-xs">
                        <div className="flex justify-end">
                            <div className="bg-[#2b5278] text-white rounded-2xl rounded-tr-xs px-3 py-1.5 max-w-[80%] leading-relaxed">
                                {sandboxInput || 'Привет, ты где сейчас?'}
                            </div>
                        </div>

                        {sandboxLoading ? (
                            <div className="flex justify-start">
                                <div className="bg-[#182533] text-white/70 rounded-2xl rounded-tl-xs px-3 py-1.5 flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3 animate-spin text-[#5e6ad2]" />
                                    <span>Лера печатает...</span>
                                </div>
                            </div>
                        ) : sandboxResult?.reply ? (
                            sandboxResult.reply.split('|||').map((part, idx) => (
                                <div key={idx} className="flex justify-start">
                                    <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3 py-1.5 max-w-[80%] leading-relaxed">
                                        {part.trim()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex justify-start">
                                <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3 py-1.5 max-w-[80%] leading-relaxed">
                                    на Петроградке, в кофейне возле института|||дождь льет жуткий
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ввод */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={sandboxInput}
                            onChange={(e) => setSandboxInput(e.target.value)}
                            placeholder="Напишите реплику для Леры..."
                            className="flex-1 bg-[#12151c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5e6ad2]"
                        />
                        <button
                            type="button"
                            onClick={() => onExecuteDryRun(sandboxInput)}
                            disabled={sandboxLoading}
                            className="px-4 py-2 rounded-xl bg-[#5e6ad2] hover:bg-[#5e6ad2]/90 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {sandboxLoading ? '...' : 'Отправить тест'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// ВАРИАНТ 3: СЛОИСТЫЙ СПЛИТ-ПАЙПЛАЙН (MODULAR LAYER STACK)
// =============================================================================
function ModularLayerStack({ 
    modules, 
    onToggleModule, 
    onEditModule, 
    assembledPrompt,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    sandboxInput,
    setSandboxInput,
    sandboxLoading,
    sandboxResult,
    onExecuteDryRun
}) {
    const [openLayers, setOpenLayers] = useState({ identity: true, voice: true, guardrails: false });

    const toggleLayer = (layer) => {
        setOpenLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Слева: Стек слоев (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
                {/* Слой 1: Identity Layer */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.08] overflow-hidden">
                    <button
                        type="button"
                        onClick={() => toggleLayer('identity')}
                        className="w-full flex items-center justify-between p-3.5 bg-[#12151c] hover:bg-[#151922] transition-colors text-xs font-semibold text-white cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#5e6ad2]"></span>
                            <span>Слой 1: Личность и бэкграунд</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/40 font-mono text-[11px]">
                            <span>{modules.filter(m => m.column === 'identity' && m.enabled).length} активных</span>
                            {openLayers.identity ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                    </button>
                    {openLayers.identity && (
                        <div className="p-3.5 space-y-2.5">
                            {modules.filter(m => m.column === 'identity').map(module => (
                                <KanbanModuleCard
                                    key={module.id}
                                    module={module}
                                    onToggle={onToggleModule}
                                    onEdit={onEditModule}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Слой 2: Voice & Slang Layer */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.08] overflow-hidden">
                    <button
                        type="button"
                        onClick={() => toggleLayer('voice')}
                        className="w-full flex items-center justify-between p-3.5 bg-[#12151c] hover:bg-[#151922] transition-colors text-xs font-semibold text-white cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>Слой 2: Голос, сленг и лесенка |||</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/40 font-mono text-[11px]">
                            <span>{modules.filter(m => m.column === 'voice' && m.enabled).length} активных</span>
                            {openLayers.voice ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                    </button>
                    {openLayers.voice && (
                        <div className="p-3.5 space-y-2.5">
                            {modules.filter(m => m.column === 'voice').map(module => (
                                <KanbanModuleCard
                                    key={module.id}
                                    module={module}
                                    onToggle={onToggleModule}
                                    onEdit={onEditModule}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Слой 3: Guardrails Layer */}
                <div className="rounded-2xl bg-[#0e1117] border border-white/[0.08] overflow-hidden">
                    <button
                        type="button"
                        onClick={() => toggleLayer('guardrails')}
                        className="w-full flex items-center justify-between p-3.5 bg-[#12151c] hover:bg-[#151922] transition-colors text-xs font-semibold text-white cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            <span>Слой 3: Безопасность и стоп-темы</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/40 font-mono text-[11px]">
                            <span>{modules.filter(m => m.column === 'guardrails' && m.enabled).length} активных</span>
                            {openLayers.guardrails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                    </button>
                    {openLayers.guardrails && (
                        <div className="p-3.5 space-y-2.5">
                            {modules.filter(m => m.column === 'guardrails').map(module => (
                                <KanbanModuleCard
                                    key={module.id}
                                    module={module}
                                    onToggle={onToggleModule}
                                    onEdit={onEditModule}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Справа: Фиксированная песочница и параметры (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl bg-[#0e1117] border border-white/[0.08] p-4 space-y-3.5 sticky top-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                    <span className="text-xs font-semibold text-white">Live Playground</span>
                    <span className="text-[10px] font-mono text-emerald-400">~{Math.ceil(assembledPrompt.length / 4)} токенов</span>
                </div>

                <div className="bg-[#090b0e] border border-white/[0.06] rounded-xl p-3 min-h-[160px] max-h-[220px] overflow-y-auto space-y-2 text-xs">
                    <div className="flex justify-end">
                        <div className="bg-[#2b5278] text-white rounded-2xl rounded-tr-xs px-3 py-1.5 max-w-[85%] leading-relaxed">
                            {sandboxInput || 'Привет, Лера!'}
                        </div>
                    </div>
                    {sandboxLoading ? (
                        <div className="flex justify-start">
                            <div className="bg-[#182533] text-white/70 rounded-2xl rounded-tl-xs px-3 py-1.5 flex items-center gap-2">
                                <RefreshCw className="w-3 h-3 animate-spin text-[#5e6ad2]" />
                                <span>Лера печатает...</span>
                            </div>
                        </div>
                    ) : sandboxResult?.reply ? (
                        sandboxResult.reply.split('|||').map((part, idx) => (
                            <div key={idx} className="flex justify-start">
                                <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3 py-1.5 max-w-[85%] leading-relaxed">
                                    {part.trim()}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex justify-start">
                            <div className="bg-[#182533] text-white rounded-2xl rounded-tl-xs px-3 py-1.5 max-w-[85%] leading-relaxed">
                                ну привет|||че там у тебя по коду?
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={sandboxInput}
                        onChange={(e) => setSandboxInput(e.target.value)}
                        placeholder="Написать Лере..."
                        className="flex-1 bg-[#12151c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5e6ad2]"
                    />
                    <button
                        type="button"
                        onClick={() => onExecuteDryRun(sandboxInput)}
                        disabled={sandboxLoading}
                        className="px-3 py-2 rounded-xl bg-[#5e6ad2] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                        {sandboxLoading ? '...' : <Send className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ: СТУДИЯ 3 КОНЦЕПТОВ (STANDALONE PAGE)
// =============================================================================
export function VariationsApp() {
    const [activeConcept, setActiveConcept] = useState('kanban'); // 'kanban' | 'bento' | 'stack'
    const [modules, setModules] = useState(INITIAL_MODULES);
    const [selectedArchetype, setSelectedArchetype] = useState('canon');
    const [activeSurface, setActiveSurface] = useState('CHAT');
    const [isDirty, setIsDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    // Параметры генерации
    const [temperature, setTemperature] = useState(0.66);
    const [maxTokens, setMaxTokens] = useState(300);
    const [typingDelay, setTypingDelay] = useState(true);

    // Песочница
    const [sandboxInput, setSandboxInput] = useState('');
    const [sandboxLoading, setSandboxLoading] = useState(false);
    const [sandboxResult, setSandboxResult] = useState(null);

    // Сборка итогового системного промпта из активных модулей с учетом активного слоя (activeSurface)
    const assembledPrompt = useMemo(() => {
        const sections = [
            { id: 'identity', title: 'ЯДРО ЛИЧНОСТИ' },
            { id: 'voice', title: 'РЕЧЕВОЙ КОД И СТИЛЬ' },
            { id: 'guardrails', title: 'ГРАНИЦЫ И БЕЗОПАСНОСТЬ' }
        ];

        return sections.map(sec => {
            const secModules = modules.filter(m => {
                if (m.column !== sec.id || !m.enabled) return false;
                if (activeSurface === 'ALL') return true;
                return m.surface === 'ALL' || m.surface === activeSurface;
            });
            if (secModules.length === 0) return '';
            const body = secModules.map(m => `• [${m.title}] (${m.surface}): ${m.text}`).join('\n');
            return `### ${sec.title}\n${body}`;
        }).filter(Boolean).join('\n\n');
    }, [modules, activeSurface]);

    // Обработчики модулей
    const handleToggleModule = useCallback((id) => {
        setModules(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
        setIsDirty(true);
    }, []);

    const handleEditModule = useCallback((id, updates) => {
        setModules(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
        setIsDirty(true);
    }, []);

    const handleDeleteModule = useCallback((id) => {
        setModules(prev => prev.filter(m => m.id !== id));
        setIsDirty(true);
    }, []);

    const handleMoveModule = useCallback((id, targetColumn) => {
        setModules(prev => prev.map(m => m.id === id ? { ...m, column: targetColumn } : m));
        setIsDirty(true);
    }, []);

    const handleAddModule = useCallback((column) => {
        const title = prompt('Название нового модуля:');
        if (!title) return;
        const text = prompt('Правило / текст промпта:') || '';
        const newMod = {
            id: `m_${Date.now()}`,
            column,
            title,
            tag: column === 'identity' ? 'custom' : (column === 'voice' ? 'slang' : 'rule'),
            enabled: true,
            text
        };
        setModules(prev => [...prev, newMod]);
        setIsDirty(true);
    }, []);

    // Тест в песочнице
    const handleExecuteDryRun = async (textToTest) => {
        const query = (textToTest || sandboxInput || 'Привет!').trim();
        setSandboxLoading(true);
        const startTime = Date.now();

        try {
            const res = await api.post('/api/admin/llm-sandbox', {
                message: query,
                system_prompt: assembledPrompt,
                temperature,
                max_tokens: maxTokens,
                surface: activeSurface
            });
            const latency = Date.now() - startTime;
            setSandboxResult({
                reply: res?.reply || res?.text || 'ну привет, я на связи|||все пашет штатно',
                latencyMs: res?.latency_ms || latency
            });
        } catch (e) {
            const latency = Date.now() - startTime;
            setSandboxResult({
                reply: 'ну короче бэк оффлайн, но сборка работает|||попробуй еще раз через минуту',
                latencyMs: latency
            });
        } finally {
            setSandboxLoading(false);
        }
    };

    // Сохранение профиля на бэкенд
    const handleSave = async () => {
        setSaving(true);
        try {
            // Сохраняем в API реального профиля Леры
            await api.post('/api/admin/lera-profile', {
                character: assembledPrompt,
                age_bio: modules.filter(m => m.column === 'identity' && m.enabled).map(m => m.text).join('\n'),
                speech: modules.filter(m => m.column === 'voice' && m.enabled).map(m => m.text).join('\n'),
                forbidden: modules.filter(m => m.column === 'guardrails' && m.enabled).map(m => m.text).join('\n'),
                temperature,
                max_tokens: maxTokens
            });
            setIsDirty(false);
            alert('Канон успешно сохранен в базу!');
        } catch (err) {
            console.error(err);
            alert('Ошибка сохранения на бэкенд: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Хоткей Cmd+S
    useEffect(() => {
        const onKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [assembledPrompt, temperature, maxTokens]);

    return (
        <div className="min-h-screen bg-[#08090a] text-[#f4f4f5] p-3 sm:p-6 space-y-5 max-w-7xl mx-auto">
            {/* ВЕРХНЯЯ ШАПКА: НАВИГАЦИЯ И ВЫБОР КОНЦЕПТА */}
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                    <a
                        href="/#ai"
                        className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white transition-colors cursor-pointer"
                        title="Назад в админку"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </a>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-bold text-white tracking-tight">
                                Студия характера Леры
                            </h1>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#5e6ad2]/20 text-[#8b95f6] border border-[#5e6ad2]/30 font-semibold">
                                3 КОНЦЕПТА
                            </span>
                        </div>
                        <p className="text-xs text-white/40">
                            Автономная витрина для выбора финального интерфейса канона
                        </p>
                    </div>
                </div>

                {/* ПЕРЕКЛЮЧАТЕЛЬ 3 КОНЦЕПТОВ */}
                <div className="flex items-center bg-[#11141b] p-1 rounded-xl border border-white/[0.08] self-stretch md:self-auto overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setActiveConcept('kanban')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            activeConcept === 'kanban' 
                                ? 'bg-[#5e6ad2] text-white shadow-xs font-semibold' 
                                : 'text-white/40 hover:text-white'
                        }`}
                    >
                        <Kanban className="w-3.5 h-3.5" />
                        <span>1. Minimal Kanban</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveConcept('bento')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            activeConcept === 'bento' 
                                ? 'bg-[#5e6ad2] text-white shadow-xs font-semibold' 
                                : 'text-white/40 hover:text-white'
                        }`}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>2. Bento Focus Deck</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveConcept('stack')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            activeConcept === 'stack' 
                                ? 'bg-[#5e6ad2] text-white shadow-xs font-semibold' 
                                : 'text-white/40 hover:text-white'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        <span>3. Studio IDE</span>
                    </button>
                </div>

                {/* КНОПКА СОХРАНЕНИЯ */}
                <div className="flex items-center gap-2">
                    {isDirty && (
                        <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            Есть несохраненные изменения
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#5e6ad2] hover:bg-[#5e6ad2]/90 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                        <Check className="w-3.5 h-3.5" />
                        <span>{saving ? 'Сохранение...' : '⌘S Сохранить'}</span>
                    </button>
                </div>
            </header>

            {/* ОСНОВНОЙ КОНТЕНТ ВЫБРАННОГО КОНЦЕПТА */}
            <main>
                {activeConcept === 'kanban' && (
                    <Variant1_MinimalKanban
                        onSaveSuccess={handleSave}
                    />
                )}

                {activeConcept === 'bento' && (
                    <Variant2_BentoFocusDeck
                        onSaveSuccess={handleSave}
                    />
                )}

                {activeConcept === 'stack' && (
                    <Variant3_StudioIDE
                        onSave={handleSave}
                    />
                )}
            </main>
        </div>
    );
}

// Монтирование на страницу variations.html
const rootEl = document.getElementById('root');
if (rootEl) {
    ReactDOM.createRoot(rootEl).render(
        <React.StrictMode>
            <VariationsApp />
        </React.StrictMode>
    );
}
