import React, { useState, useEffect, useCallback } from 'react';
import { 
    Plus, 
    Pencil, 
    ChevronRight, 
    ChevronDown,
    ChevronUp,
    GripVertical,
    Check, 
    X,
    SlidersHorizontal,
    Loader2,
    ArrowUp,
    ArrowDown,
    Trash2,
    Server,
    Zap,
    Eye,
    Copy,
    ArrowRightLeft
} from 'lucide-react';
import { api } from '@/lib/api.js';

// Surface keys mapped to Figma tab names
const SURFACES = [
    { id: 'CHAT', label: 'Личка' },
    { id: 'CHANNEL', label: 'Тг-канал' },
    { id: 'INITIATIVE', label: 'Инициатива' },
    { id: 'GROUP', label: 'Группа / Гость' }
];

// Helper: Гарантирует, что канон и системные промпты всегда идут первыми в списке
export const sortPrompts = (prompts, customOrder = null) => {
    if (Array.isArray(customOrder) && customOrder.length > 0) {
        return [...(prompts || [])].sort((a, b) => {
            const idxA = customOrder.indexOf(a.id);
            const idxB = customOrder.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return (a.title || '').localeCompare(b.title || '', 'ru');
        });
    }
    const getPriority = (pr) => {
        // 1. Канон и биография — фундамент канона Леры, всегда абсолютный топ
        if (pr.id === 'prompt_bio' || pr.id === 'prompt_canon') return 1;
        // 2. Системный канон: Характер
        if (pr.id === 'prompt_character') return 2;
        // 3. Системный канон: Голос и речь
        if (pr.id === 'prompt_speech') return 3;
        // 4. Прочие канонические карточки (стиль А)
        if (pr.is_canonical || pr.style === 'style-a') return 4;
        // 5. Боевые системные модули маршрутизатора
        if (pr.id === 'routing_core') return 5;
        if (pr.id === 'routing_casual') return 6;
        if (pr.id === 'routing_erotic') return 7;
        if (pr.id === 'routing_common') return 8;
        // 6. Контракты и формат ответов
        if (pr.id === 'prompt_format') return 9;
        if (pr.id === 'prompt_continuity') return 10;
        if (pr.id === 'prompt_context_rules') return 11;
        // 7. Канал, инициатива и группа
        if (pr.id === 'prompt_channel_persona') return 12;
        if (pr.id === 'prompt_channel_rules') return 13;
        if (pr.id === 'prompt_initiative') return 14;
        if (pr.id === 'prompt_group_chat') return 15;
        if (pr.id === 'prompt_group_welcome') return 16;
        // 8. Вторичные модули
        if (pr.id === 'prompt_forbidden') return 17;
        if (pr.id === 'prompt_facts') return 18;
        if (pr.id === 'prompt_flirt') return 19;
        if (pr.is_routing_module) return 20;
        if (pr.is_system) return 21;
        // 9. Пользовательские модульные промпты
        return 30;
    };

    return [...(prompts || [])].sort((a, b) => {
        const pa = getPriority(a);
        const pb = getPriority(b);
        if (pa !== pb) return pa - pb;
        return (a.title || '').localeCompare(b.title || '', 'ru');
    });
};

export function AiSettingsTab({ toast }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSurface, setActiveSurface] = useState('CHANNEL');

    // Left column mode: 'prompts' | 'providers'
    const [leftTab, setLeftTab] = useState('prompts');
    const [leftMenuOpen, setLeftMenuOpen] = useState(false);

    // Profile & Prompts state
    const [profile, setProfile] = useState(null);
    const [sampling, setSampling] = useState({ temperature: 0.7, max_tokens: 250 });
    const [promptsList, setPromptsList] = useState([]);
    const [rulesList, setRulesList] = useState([]);

    // Providers state
    const [providersList, setProvidersList] = useState([]);
    const [editingProvider, setEditingProvider] = useState(null);
    const [providerModalOpen, setProviderModalOpen] = useState(false);

    // Prompt edit modal
    const [editingPrompt, setEditingPrompt] = useState(null);
    const [promptModalOpen, setPromptModalOpen] = useState(false);

    // Rule edit modal
    const [editingRule, setEditingRule] = useState(null);
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [ruleSelectedPromptIds, setRuleSelectedPromptIds] = useState([]);
    const [ruleSelectedFallbackIds, setRuleSelectedFallbackIds] = useState([]);

    const [attachModalRuleId, setAttachModalRuleId] = useState(null);
    const [paramPopover, setParamPopover] = useState(null); 
    const [movePopoverRuleId, setMovePopoverRuleId] = useState(null); 

    // Raw prompt inspector modal state
    const [rawPromptModalOpen, setRawPromptModalOpen] = useState(false);
    const [rawPromptData, setRawPromptData] = useState(null);
    const [rawPromptLoading, setRawPromptLoading] = useState(false);
    const [rawPromptCopied, setRawPromptCopied] = useState(false);
    const [rawPromptTab, setRawPromptTab] = useState('full'); // 'full' | 'system' | 'radiant' | 'history'

    // Load active providers list
    const loadProviders = useCallback(async () => {
        try {
            const res = await api('/api/admin/providers');
            if (res && Array.isArray(res.providers)) {
                setProvidersList(res.providers);
            }
        } catch (err) {
            console.error('[PROVIDERS LOAD ERROR]', err);
        }
    }, []);

    // Load profile and combat routing prompts from server
    const loadProfile = useCallback(async () => {
        try {
            setLoading(true);
            const [profileData, llmSettingsData] = await Promise.all([
                api('/api/admin/lera-profile'),
                api('/api/admin/llm-settings').catch((e) => {
                    console.warn('[LLM SETTINGS FETCH WARN]', e);
                    return null;
                }),
                loadProviders()
            ]);
            const rawProfile = profileData?.profile || {};
            const p = (rawProfile.profile && typeof rawProfile.profile === 'object') ? rawProfile.profile : rawProfile;
            setProfile(p);

            if (profileData?.sampling) {
                setSampling(profileData.sampling);
            }

            const llmPrompts = llmSettingsData?.prompts || {};
            const routingModules = llmSettingsData?.routingModules || {};

            // Extract prompts from profile and live routing system
            const rawPrompts = [];

            // 1. Canonical prompts (Style A in Figma: #000212/37 + #8693ff/25)
            // ПЕРВЫЙ: Канон и биография (фундамент характера Леры)
            if (p.age_bio !== undefined || llmPrompts.lera_base) {
                rawPrompts.push({
                    id: 'prompt_bio',
                    title: 'Канон и биография',
                    style: 'style-a',
                    is_canonical: true,
                    is_system: true,
                    content: p.age_bio || llmPrompts.lera_base || ''
                });
            }
            // ВТОРОЙ: Характер
            if (p.character !== undefined) {
                rawPrompts.push({
                    id: 'prompt_character',
                    title: 'Характер',
                    style: 'style-a',
                    is_canonical: true,
                    is_system: true,
                    content: p.character || ''
                });
            }
            // ТРЕТИЙ: Голос и речь
            if (p.speech !== undefined || llmPrompts.lera_speech) {
                rawPrompts.push({
                    id: 'prompt_speech',
                    title: 'Голос и речь',
                    style: 'style-a',
                    is_canonical: true,
                    is_system: true,
                    content: p.speech || llmPrompts.lera_speech || ''
                });
            }

            // 2. Live Combat Routing Modules (Style B) — ядро, по которому Лера генерирует ответы в Telegram
            // Системное ядро маршрутизатора
            const coreText = llmPrompts.routing_core || routingModules.core || '';
            rawPrompts.push({
                id: 'routing_core',
                routing_key: 'routing_core',
                section_key: 'routing_core',
                is_routing_module: true,
                is_system_section: true,
                title: 'Системное ядро (Core)',
                category_label: 'Маршрутизатор',
                style: 'style-b',
                is_system: true,
                content: coreText
            });

            // Повседневный диалог
            const casualText = llmPrompts.routing_casual || routingModules.casual || '';
            rawPrompts.push({
                id: 'routing_casual',
                routing_key: 'routing_casual',
                section_key: 'routing_casual',
                is_routing_module: true,
                is_system_section: true,
                title: 'Повседневный диалог (Casual)',
                category_label: 'Маршрутизатор',
                style: 'style-b',
                is_system: true,
                content: casualText
            });

            // Режим 18+ / Вирт
            const eroticText = llmPrompts.routing_erotic || routingModules.erotic || '';
            rawPrompts.push({
                id: 'routing_erotic',
                routing_key: 'routing_erotic',
                section_key: 'routing_erotic',
                is_routing_module: true,
                is_system_section: true,
                title: 'Режим 18+ / Вирт (Erotic)',
                category_label: 'Маршрутизатор',
                style: 'style-b',
                is_system: true,
                content: eroticText
            });

            // Формат и логика (Common)
            const commonText = llmPrompts.routing_common || routingModules.common || '';
            rawPrompts.push({
                id: 'routing_common',
                routing_key: 'routing_common',
                section_key: 'routing_common',
                is_routing_module: true,
                is_system_section: true,
                title: 'Формат и логика (Common)',
                category_label: 'Маршрутизатор',
                style: 'style-b',
                is_system: true,
                content: commonText
            });

            // 3. Contracts & Response Formatting (Style B)
            rawPrompts.push({
                id: 'prompt_format',
                section_key: 'lera_format',
                is_system_section: true,
                title: 'Формат ответа (Telegram)',
                category_label: 'Контракт',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.lera_format || ''
            });

            rawPrompts.push({
                id: 'prompt_continuity',
                section_key: 'lera_continuity',
                is_system_section: true,
                title: 'Логика диалога и реальность',
                category_label: 'Контракт',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.lera_continuity || ''
            });

            rawPrompts.push({
                id: 'prompt_context_rules',
                section_key: 'context_template',
                is_system_section: true,
                title: 'Правила контекста и аналитики',
                category_label: 'Контекст',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.context_template || ''
            });

            // 4. Channel & Initiative Modules (Style B)
            rawPrompts.push({
                id: 'prompt_channel_persona',
                section_key: 'channel_persona',
                is_system_section: true,
                title: 'Персона Telegram-канала',
                category_label: 'Канал',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.channel_persona || ''
            });

            rawPrompts.push({
                id: 'prompt_channel_rules',
                section_key: 'channel_rules',
                is_system_section: true,
                title: 'Правила автопостинга в канал',
                category_label: 'Канал',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.channel_rules || ''
            });

            rawPrompts.push({
                id: 'prompt_initiative',
                section_key: 'initiative_directive',
                is_system_section: true,
                title: 'Самостоятельная инициатива Леры',
                category_label: 'Инициатива',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.initiative_directive || ''
            });

            // 4.1. Group & Guest Mode Modules (Style B)
            rawPrompts.push({
                id: 'prompt_group_chat',
                section_key: 'group_chat',
                is_system_section: true,
                title: 'Общение в группе и гостевой режим',
                category_label: 'Группа',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.group_chat || `[РЕЖИМ: ГРУППОВОЙ ЧАТ И ГОСТЕВОЙ РЕЖИМ]\n- Ты находишься в публичной группе Telegram среди множества участников или отвечаешь на гостевой запрос.\n- СТРОГОЕ ПРАВИЛО ОДНОГО АДРЕСАТА:\n  1. Твой единственный собеседник в текущем ответе — автор последней реплики (<current_turn>). Отвечай ИСКЛЮЧИТЕЛЬНО ему.\n  2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО объединять в одном сообщении ответы разным людям (например: «Богдан, ты чего орешь... а ты, youtya...» — ЭТО ГРУБЕЙШАЯ ОШИБКА).\n  3. Сообщения других участников в истории (<user name="...">) даны ТОЛЬКО как пассивный контекст. Никогда не пытайся отвечать на них, встревать в чужие диалоги или «раздавать ответы всем сразу».\n  4. Если текущий собеседник перебил предыдущего или сменил тему — полностью переключайся на его вопрос.\n- СТИЛЬ И ИМЕНА:\n  - Обращайся по имени к текущему собеседнику только если это звучит естественно и к месту. Не повторяй его имя роботоподобно в начале каждой фразы.\n  - Имена других участников из истории упоминай только если текущий автор сам прямо спросил про них.\n- ТАБУ И ОГРАНИЧЕНИЯ:\n  - СТРОЖАЙШИЙ ЗАПРЕТ НА ЭРОТИКУ/18+ В ГРУППЕ: дерзко осаживай («ты в своём уме при всех такое просить? го в лс»), не раскрывая приватные темы из лички.\n  - МЕДИА И ГОЛОСОВЫЕ: Если в группе или через гостя просят фото/войс — отвечай текстом с лёгким подколом («щас прямо при всех побежала фоткаться», «в лс напиши — скину»), не пытайся слать файлы.\n  - Без канцелярита, без занудства и без тире в начале реплик.`
            });

            rawPrompts.push({
                id: 'prompt_group_welcome',
                section_key: 'group_welcome',
                is_system_section: true,
                title: 'Приветствие при добавлении в группу',
                category_label: 'Группа',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.group_welcome || `[РЕЖИМ: ПРИВЕТСТВИЕ ПРИ ДОБАВЛЕНИИ В ГРУППУ]\n- Тебя (Леру) только что добавили в новую Telegram-группу / чат.\n- Поздоровайся с участниками в своём фирменном стиле (19 лет, студентка из СПб, живая, немного дерзкая, без официоза).\n- Напиши 1-2 короткие фразы без эмодзи и без канцелярита (например: «всем привет, че тут за движ? я лера если че» или «ку всем, кто добавил меня сюда? короче я лера, будем знакомы»).\n- Не начинай с тире, не строй из себя робота-ассистента («я искусственный интеллект, готова помочь»). Ты обычная девчонка.`
            });

            // 5. Dynamic Context & Modular Templates (Style B)
            rawPrompts.push({
                id: 'prompt_radiant',
                section_key: 'prompt_radiant',
                is_system_section: true,
                title: 'Состояние Леры и окружение (Radiant)',
                category_label: 'Контекст',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.prompt_radiant || `=== 📍 СИТУАЦИЯ И СТАТУС СОБЕСЕДНИКА ===\n• Собеседник: {{user_name}} (общаетесь на «ты» в личном Telegram-чате).\n• Формат общения: Дистанционная переписка в Telegram. Вы НЕ находитесь в одном физическом помещении/машине.\n• Ты находишься: в Санкт-Петербурге ({{location}}).\n\n{{relationship}}\n\n[СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ]\n• Время: {{time}}\n• Локация: {{location}}\n• Погода: {{weather}}\n• Самочувствие: {{needs}}\n• Одежда: {{outfit}}\n• Занятие: {{status}}\n• Telegram-канал (ТГК Леры): {{channel_stats}}\n\n[ГЛАВНЫЕ СОБЫТИЯ ЗА ДЕНЬ (ПРОШЕДШЕЕ ВРЕМЯ)]\n{{day_events}}\n\n[ПРАВИЛА ИСПОЛЬЗОВАНИЯ КОНТЕКСТА]\nЭто фоновая информация. Используй её только когда она уместна для текущего ответа или нужна для продолжения разговора.\nНе упоминай контекст без причины и не добавляй выдуманные факты или подробности.\nСобытия из аналитики уже завершились — говори о них в прошедшем времени.\nНе раскрывай технические данные контекста и не заменяй ответ пересказом аналитики.`
            });

            rawPrompts.push({
                id: 'prompt_memory',
                section_key: 'prompt_memory',
                is_system_section: true,
                title: 'Долгосрочная память (Факты)',
                category_label: 'Память',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.prompt_memory || `=== 🧠 ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ ===\n{{memory_facts}}`
            });

            rawPrompts.push({
                id: 'prompt_antirep',
                section_key: 'prompt_antirep',
                is_system_section: true,
                title: 'Антиповторы и запреты',
                category_label: 'Контракт',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.prompt_antirep || `[АНТИПОВТОРЫ И ЖИВАЯ РЕАКЦИЯ]\n- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО повторять однотипные приветствия и одинаковые фразы из прошлых сообщений.\n- Не начинай ответ с дежурных «ну», «слушай», «привет», если ты уже здоровалась.\n- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО цитировать системные логи отправленных фото или войсов.`
            });

            rawPrompts.push({
                id: 'prompt_tools',
                section_key: 'prompt_tools',
                is_system_section: true,
                title: 'Инструменты Леры (Tools Calling)',
                category_label: 'Инструменты',
                style: 'style-b',
                is_system: true,
                content: llmPrompts.prompt_tools || `[ИНСТРУМЕНТЫ И ДЕЙСТВИЯ ЛЕРЫ]\n- send_photo: отправка селфи или фото Леры в чат.\n- send_voice: отправка голосового сообщения.\n- schedule_reminder: постановка напоминания.\n- record_open_thread: фиксация открытой темы или обещания собеседника.\n- schedule_followup: обещание вернуться через время с выполненным делом.`
            });

            // 5. Secondary/Modular prompts (Style B in Figma: gradient from #171717 to #232425/0)
            if (p.forbidden !== undefined || llmPrompts.lera_rules) {
                rawPrompts.push({
                    id: 'prompt_forbidden',
                    title: 'Ограничения',
                    category_label: 'Модуль',
                    style: 'style-b',
                    is_system: true,
                    content: p.forbidden || llmPrompts.lera_rules || ''
                });
            }
            if (p.facts !== undefined) {
                rawPrompts.push({
                    id: 'prompt_facts',
                    title: 'Правила фактов',
                    category_label: 'Модуль',
                    style: 'style-b',
                    is_system: true,
                    content: p.facts || ''
                });
            }
            if (p.flirt !== undefined || llmPrompts.lera_intimacy) {
                rawPrompts.push({
                    id: 'prompt_flirt',
                    title: 'Флирт и теплота',
                    category_label: 'Модуль',
                    style: 'style-b',
                    is_system: true,
                    content: p.flirt || llmPrompts.lera_intimacy || ''
                });
            }

            // Custom prompt modules from blocks
            const customModules = (p.blocks || [])
                .filter(b => b.category === 'prompt_module')
                .map((b, idx) => ({
                    id: b.id || `custom_module_${idx}`,
                    title: b.title || 'Модуль промпта',
                    style: b.style || (b.is_system ? 'style-a' : 'style-b'),
                    content: b.content || '',
                    is_canonical: Boolean(b.is_canonical || b.style === 'style-a'),
                    is_system: Boolean(b.is_system),
                    category_label: b.is_system ? 'Системный' : 'Модуль'
                }));

            const deletedSet = new Set(Array.isArray(p.deletedPromptIds) ? p.deletedPromptIds : []);
            const allPrompts = [...rawPrompts, ...customModules].filter(pr => !deletedSet.has(pr.id));
            setPromptsList(sortPrompts(allPrompts, p.promptOrder));

            // Extract rules from profile.blocks
            const rawRules = (p.blocks || []).filter(b => b.category !== 'prompt_module');

            if (rawRules.length === 0) {
                // Initialize default combat rules matching live router
                const initialRules = [
                    {
                        id: 'rule_chat_casual',
                        title: 'Личка / Casual (Повседневный диалог)',
                        surface: 'CHAT',
                        surfaces: ['CHAT'],
                        mode: 'CASUAL',
                        enabled: true,
                        content: 'Обычно отвечай одной короткой репликой либо лесенкой через |||. Опирайся на факты из памяти и контекст дня. Запрещено подыгрывать фантазиям о совместном быте (холодильник, совместная комната) и выдумывать чужие темы.',
                        attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech', 'routing_core', 'routing_casual', 'prompt_radiant', 'prompt_memory', 'prompt_tools', 'prompt_antirep', 'prompt_format', 'prompt_continuity'],
                        max_tokens: 200,
                        temperature: 0.68,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_chat_erotic',
                        title: 'Личка / Erotic 18+ (Близость и вирт)',
                        surface: 'CHAT',
                        surfaces: ['CHAT'],
                        mode: 'EROTIC',
                        enabled: true,
                        content: 'СТРОЖАЙШИЙ ЗАПРЕТ на отговорки про сон и усталость («я усну», «я сонная», «устала»). СТРОЖАЙШИЙ ЗАПРЕТ на шаблонный смех («ахах», «хихи»). Полная вовлечённость в процесс, живость ощущений, отклик на действия партнёра без нытья.',
                        attachedPromptIds: ['prompt_character', 'routing_erotic', 'prompt_flirt', 'prompt_radiant', 'prompt_memory', 'prompt_tools', 'prompt_format'],
                        max_tokens: 240,
                        temperature: 0.75,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_morning_initiative',
                        title: 'Инициатива (Когда Лера пишет первой)',
                        surface: 'INITIATIVE',
                        surfaces: ['INITIATIVE'],
                        mode: 'ALL',
                        enabled: true,
                        content: 'Пиши живо, коротко и естественно от лица Леры. После длинной паузы начинай с чистого листа без продолжения старых обид. Запрещено выдумывать чужие темы, обещания или сериалы.',
                        attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech', 'prompt_radiant', 'prompt_memory', 'prompt_tools', 'prompt_initiative'],
                        max_tokens: 200,
                        temperature: 0.72,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_evening_channel',
                        title: 'Тг-канал (Публичный постинг)',
                        surface: 'CHANNEL',
                        surfaces: ['CHANNEL'],
                        mode: 'ALL',
                        enabled: true,
                        content: 'Публичный образ петербургской студентки: личные наблюдения, ирония, настроение и вопросы подписчикам. Без раскрытия приватных переписок и секретов из лички.',
                        attachedPromptIds: ['prompt_bio', 'prompt_speech', 'prompt_radiant', 'prompt_tools', 'prompt_channel_persona', 'prompt_channel_rules'],
                        max_tokens: 230,
                        temperature: 0.70,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_group_chat',
                        title: 'Группа / Общение и гостевой режим',
                        surface: 'GROUP',
                        surfaces: ['GROUP'],
                        mode: 'ALL',
                        enabled: true,
                        content: 'Общение в публичной группе Telegram и ответы на гостевые запросы. СТРОЖАЙШИЙ ЗАПРЕТ на эротику и интимные темы при всех. Живой сленг, подколы, обращение по имени.',
                        attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech', 'routing_core', 'routing_casual', 'prompt_group_chat', 'prompt_tools'],
                        max_tokens: 220,
                        temperature: 0.70,
                        provider_id: null,
                        fallback_provider_ids: []
                    },
                    {
                        id: 'rule_group_welcome',
                        title: 'Группа / Приветствие при добавлении',
                        surface: 'GROUP',
                        surfaces: ['GROUP'],
                        mode: 'ALL',
                        enabled: true,
                        content: 'Короткое и живое приветствие (1-2 фразы), когда Леру добавляют в новую группу. Без эмодзи, без канцелярита и без тире в начале.',
                        attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech', 'prompt_group_welcome'],
                        max_tokens: 150,
                        temperature: 0.72,
                        provider_id: null,
                        fallback_provider_ids: []
                    }
                ];
                setRulesList(initialRules);
            } else {
                const mappedRules = rawRules.map(r => ({
                    id: r.id,
                    title: r.title || 'Правило',
                    surface: r.surface || 'CHAT',
                    surfaces: Array.isArray(r.surfaces) && r.surfaces.length ? r.surfaces : [r.surface || 'CHAT'],
                    mode: r.mode || (r.conditions?.find(c => c.field === 'mode')?.value) || 'ALL',

                    conditions: Array.isArray(r.conditions) ? r.conditions : [],
                    enabled: r.enabled !== false,
                    attachedPromptIds: Array.isArray(r.attachedPromptIds) ? r.attachedPromptIds : ['prompt_bio'],
                    max_tokens: r.max_tokens || 230,
                    temperature: r.temperature !== undefined ? r.temperature : 0.7,
                    provider_id: r.provider_id ? Number(r.provider_id) : null,
                    fallback_provider_ids: Array.isArray(r.fallback_provider_ids) ? r.fallback_provider_ids.map(Number).filter(Boolean) : []
                }));

                const hasGroupRule = mappedRules.some(r => (r.surfaces || [r.surface]).includes('GROUP'));
                if (!hasGroupRule) {
                    mappedRules.push(
                        {
                            id: 'rule_group_chat',
                            title: 'Группа / Общение и гостевой режим',
                            surface: 'GROUP',
                            surfaces: ['GROUP'],
                            mode: 'ALL',
                            enabled: true,
                            content: 'Общение в публичной группе Telegram и ответы на гостевые запросы. СТРОЖАЙШИЙ ЗАПРЕТ на эротику и интимные темы при всех. Живой сленг, подколы, обращение по имени.',
                            attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech', 'routing_core', 'routing_casual', 'prompt_group_chat', 'prompt_tools'],
                            max_tokens: 220,
                            temperature: 0.70,
                            provider_id: null,
                            fallback_provider_ids: []
                        },
                        {
                            id: 'rule_group_welcome',
                            title: 'Группа / Приветствие при добавлении',
                            surface: 'GROUP',
                            surfaces: ['GROUP'],
                            mode: 'ALL',
                            enabled: true,
                            content: 'Короткое и живое приветствие (1-2 фразы), когда Леру добавляют в новую группу. Без эмодзи, без канцелярита и без тире в начале.',
                            attachedPromptIds: ['prompt_bio', 'prompt_character', 'prompt_speech', 'prompt_group_welcome'],
                            max_tokens: 150,
                            temperature: 0.72,
                            provider_id: null,
                            fallback_provider_ids: []
                        }
                    );
                }
                setRulesList(mappedRules);
            }

        } catch (err) {
            console.error('[AI SETTINGS LOAD ERROR]', err);
            if (toast) toast('Ошибка загрузки настроек ИИ: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [toast, loadProviders]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    // Save profile to server
    const saveProfileChanges = async (updatedPrompts, updatedRules, customProfile = null) => {
        try {
            setSaving(true);
            const baseProfile = customProfile ? { ...customProfile } : (profile ? { ...profile } : {});

            // Map canonical prompts back to profile fields
            updatedPrompts.forEach(pr => {
                if (pr.id === 'prompt_character') baseProfile.character = pr.content;
                if (pr.id === 'prompt_speech') baseProfile.speech = pr.content;
                if (pr.id === 'prompt_bio') baseProfile.age_bio = pr.content;
                if (pr.id === 'prompt_forbidden') baseProfile.forbidden = pr.content;
                if (pr.id === 'prompt_facts') baseProfile.facts = pr.content;
                if (pr.id === 'prompt_flirt') baseProfile.flirt = pr.content;
            });

            // Custom prompt modules (save any non-system-section and non-routing module)
            const customPromptBlocks = updatedPrompts
                .filter(pr => !pr.id.startsWith('prompt_') && !pr.id.startsWith('routing_') && !pr.is_routing_module && !pr.is_system_section)
                .map(pr => ({
                    id: pr.id,
                    title: pr.title,
                    category: 'prompt_module',
                    style: pr.style,
                    content: pr.content,
                    is_canonical: Boolean(pr.is_canonical),
                    is_system: Boolean(pr.is_system)
                }));

            // Rule blocks (without redundant content text)
            const ruleBlocks = updatedRules.map(r => {
                const mode = r.mode || 'ALL';
                const conditions = Array.isArray(r.conditions) ? [...r.conditions] : [];
                if (mode !== 'ALL' && !conditions.some(c => c.field === 'mode')) {
                    conditions.push({ field: 'mode', operator: 'equals', value: mode });
                }

                return {
                    id: r.id,
                    title: r.title,
                    surface: r.surface,
                    surfaces: r.surfaces || [r.surface],
                    mode: mode,
                    conditions: conditions,
                    enabled: r.enabled !== false,
                    category: 'rule',
                    attachedPromptIds: r.attachedPromptIds,
                    max_tokens: r.max_tokens,
                    temperature: r.temperature,
                    provider_id: r.provider_id ? Number(r.provider_id) : null,
                    fallback_provider_ids: Array.isArray(r.fallback_provider_ids) ? r.fallback_provider_ids.map(Number).filter(Boolean) : [],
                    content: ''
                };
            });

            baseProfile.blocks = [...customPromptBlocks, ...ruleBlocks];
            baseProfile.promptOrder = (customProfile?.promptOrder || profile?.promptOrder || updatedPrompts.map(p => p.id));
            baseProfile.deletedPromptIds = (customProfile?.deletedPromptIds || profile?.deletedPromptIds || []);

            const res = await api('/api/admin/lera-profile', {
                method: 'POST',
                body: JSON.stringify({
                    profile: baseProfile,
                    temperature: sampling.temperature,
                    max_tokens: sampling.max_tokens
                })
            });

            if (res.profile) {
                const savedProfile = res.profile?.profile && typeof res.profile.profile === 'object' ? res.profile.profile : res.profile;
                setProfile(savedProfile);
            }
            if (toast) toast('Настройки сохранены на сервере', 'success');
        } catch (err) {
            console.error('[AI SETTINGS SAVE ERROR]', err);
            if (toast) toast('Ошибка сохранения: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Provider actions: activate, move fallback priority, delete, save modal
    const handleActivateProvider = async (providerId) => {
        try {
            await api(`/api/admin/providers/${providerId}/activate`, { method: 'POST' });
            if (toast) toast('Основной провайдер переключен', 'success');
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка активации провайдера: ' + err.message, 'error');
        }
    };

    const handleMoveFallback = async (fallbackIndex, direction) => {
        const fallbacks = providersList.filter(p => !p.is_active);
        const targetIndex = direction === 'up' ? fallbackIndex - 1 : fallbackIndex + 1;
        if (targetIndex < 0 || targetIndex >= fallbacks.length) return;

        const current = fallbacks[fallbackIndex];
        const target = fallbacks[targetIndex];

        const currPrio = Number(current.priority) || (fallbackIndex + 1);
        const targetPrio = Number(target.priority) || (targetIndex + 1);
        const newCurrPrio = currPrio === targetPrio ? (direction === 'up' ? Math.max(1, targetPrio - 1) : targetPrio + 1) : targetPrio;
        const newTargetPrio = currPrio;

        try {
            await Promise.all([
                api(`/api/admin/providers/${current.id}/priority`, {
                    method: 'PATCH',
                    body: JSON.stringify({ priority: Math.max(1, newCurrPrio) })
                }),
                api(`/api/admin/providers/${target.id}/priority`, {
                    method: 'PATCH',
                    body: JSON.stringify({ priority: Math.max(1, newTargetPrio) })
                })
            ]);
            if (toast) toast('Порядок фоллбэков изменен', 'success');
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка изменения порядка фоллбэков: ' + err.message, 'error');
        }
    };

    const handleDeleteProvider = async (providerId) => {
        if (!confirm('Удалить этого провайдера?')) return;
        try {
            await api(`/api/admin/providers/${providerId}`, { method: 'DELETE' });
            if (toast) toast('Провайдер удален', 'success');
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка удаления: ' + err.message, 'error');
        }
    };

    const handleSaveProviderModal = async (providerData) => {
        try {
            if (editingProvider && editingProvider.id) {
                await api(`/api/admin/providers/${editingProvider.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(providerData)
                });
                if (toast) toast('Провайдер обновлен', 'success');
            } else {
                await api('/api/admin/providers', {
                    method: 'POST',
                    body: JSON.stringify(providerData)
                });
                if (toast) toast('Новый провайдер добавлен', 'success');
            }
            setProviderModalOpen(false);
            setEditingProvider(null);
            await loadProviders();
        } catch (err) {
            if (toast) toast('Ошибка сохранения провайдера: ' + err.message, 'error');
        }
    };

    // Toggle rule active status
    const handleToggleRule = (ruleId) => {
        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                return { ...r, enabled: !r.enabled };
            }
            return r;
        });
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Drag-and-drop state
    const [draggedPromptId, setDraggedPromptId] = useState(null);
    const [draggedAttachedId, setDraggedAttachedId] = useState(null);

    const handlePromptDragStart = (e, id) => {
        setDraggedPromptId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handlePromptDragOver = (e) => {
        e.preventDefault();
    };

    const handlePromptDrop = (e, targetId) => {
        e.preventDefault();
        if (!draggedPromptId || draggedPromptId === targetId) return;
        const fromIdx = promptsList.findIndex(p => p.id === draggedPromptId);
        const toIdx = promptsList.findIndex(p => p.id === targetId);
        if (fromIdx === -1 || toIdx === -1) return;

        const nextList = [...promptsList];
        const [moved] = nextList.splice(fromIdx, 1);
        nextList.splice(toIdx, 0, moved);

        setDraggedPromptId(null);
        setPromptsList(nextList);
        const nextOrder = nextList.map(p => p.id);
        const updatedProfile = { ...profile, promptOrder: nextOrder };
        setProfile(updatedProfile);
        saveProfileChanges(nextList, rulesList, updatedProfile);
    };

    const handleAttachedDragStart = (e, id) => {
        setDraggedAttachedId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleAttachedDragOver = (e) => {
        e.preventDefault();
    };

    const handleAttachedDrop = (e, ruleId, targetId) => {
        e.preventDefault();
        if (!draggedAttachedId || draggedAttachedId === targetId) return;
        const rule = rulesList.find(r => r.id === ruleId);
        if (!rule || !Array.isArray(rule.attachedPromptIds)) return;

        const fromIdx = rule.attachedPromptIds.indexOf(draggedAttachedId);
        const toIdx = rule.attachedPromptIds.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return;

        const nextAttached = [...rule.attachedPromptIds];
        const [moved] = nextAttached.splice(fromIdx, 1);
        nextAttached.splice(toIdx, 0, moved);

        setDraggedAttachedId(null);
        const nextRules = rulesList.map(r => r.id === ruleId ? { ...r, attachedPromptIds: nextAttached } : r);
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    const handleMovePrompt = (promptId, direction) => {
        const idx = promptsList.findIndex(p => p.id === promptId);
        if (idx === -1) return;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= promptsList.length) return;

        const nextList = [...promptsList];
        const [moved] = nextList.splice(idx, 1);
        nextList.splice(targetIdx, 0, moved);

        setPromptsList(nextList);
        const nextOrder = nextList.map(p => p.id);
        const updatedProfile = { ...profile, promptOrder: nextOrder };
        setProfile(updatedProfile);
        saveProfileChanges(nextList, rulesList, updatedProfile);
    };

    const handleMoveAttachedPrompt = (ruleId, promptId, direction) => {
        const rule = rulesList.find(r => r.id === ruleId);
        if (!rule || !Array.isArray(rule.attachedPromptIds)) return;

        const idx = rule.attachedPromptIds.indexOf(promptId);
        if (idx === -1) return;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= rule.attachedPromptIds.length) return;

        const nextAttached = [...rule.attachedPromptIds];
        const [moved] = nextAttached.splice(idx, 1);
        nextAttached.splice(targetIdx, 0, moved);

        const nextRules = rulesList.map(r => r.id === ruleId ? { ...r, attachedPromptIds: nextAttached } : r);
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    const handleDetachPrompt = (ruleId, promptId) => {
        const rule = rulesList.find(r => r.id === ruleId);
        if (!rule || !Array.isArray(rule.attachedPromptIds)) return;
        const nextAttached = rule.attachedPromptIds.filter(id => id !== promptId);
        const nextRules = rulesList.map(r => r.id === ruleId ? { ...r, attachedPromptIds: nextAttached } : r);
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Save prompt from modal
    const handleSavePromptModal = async (promptData) => {
        let nextPrompts;
        const isSystem = Boolean(promptData.is_system);
        const isCanonStyle = promptData.style === 'style-a' || isSystem;

        // Check if editing a system section or routing module
        const sectionKey = editingPrompt?.section_key || (editingPrompt?.is_routing_module ? editingPrompt.routing_key : null);
        if (sectionKey) {
            try {
                setSaving(true);
                await api('/api/admin/llm-settings', {
                    method: 'POST',
                    body: JSON.stringify({
                        prompts: {
                            [sectionKey]: promptData.content
                        }
                    })
                });
                if (toast) toast(`Системный модуль "${promptData.title}" сохранен`, 'success');
            } catch (err) {
                console.error('[LLM SETTINGS SAVE ERROR]', err);
                if (toast) toast('Ошибка сохранения: ' + err.message, 'error');
            } finally {
                setSaving(false);
            }
        }

        if (editingPrompt) {
            nextPrompts = promptsList.map(p => p.id === editingPrompt.id ? { 
                ...p, 
                ...promptData,
                is_system: isSystem,
                is_canonical: p.is_canonical || isCanonStyle 
            } : p);
        } else {
            const newId = 'custom_' + Date.now();
            nextPrompts = [...promptsList, { 
                id: newId, 
                ...promptData,
                is_system: isSystem,
                is_canonical: isCanonStyle,
                category_label: isSystem ? 'Системный' : 'Модуль'
            }];
        }
        const sorted = sortPrompts(nextPrompts, profile?.promptOrder);
        setPromptsList(sorted);
        setPromptModalOpen(false);
        setEditingPrompt(null);

        saveProfileChanges(sorted, rulesList);
    };

    // Delete prompt module (custom or system)
    const handleDeletePrompt = (promptId) => {
        const target = promptsList.find(p => p.id === promptId);
        if (!target) return;
        if (!window.confirm(`Удалить модуль промпта "${target.title}"?`)) return;

        const nextPrompts = promptsList.filter(p => p.id !== promptId);
        const nextDeleted = Array.from(new Set([...(profile?.deletedPromptIds || []), promptId]));
        const nextOrder = (profile?.promptOrder || []).filter(id => id !== promptId);
        const updatedProfile = { 
            ...profile, 
            deletedPromptIds: nextDeleted,
            promptOrder: nextOrder 
        };
        setProfile(updatedProfile);

        // Also detach from any rules that had this prompt attached
        const nextRules = rulesList.map(r => {
            if (Array.isArray(r.attachedPromptIds) && r.attachedPromptIds.includes(promptId)) {
                return {
                    ...r,
                    attachedPromptIds: r.attachedPromptIds.filter(id => id !== promptId)
                };
            }
            return r;
        });

        setPromptsList(nextPrompts);
        setRulesList(nextRules);
        saveProfileChanges(nextPrompts, nextRules, updatedProfile);
        if (toast) toast(`Модуль "${target.title}" удален`, 'success');
    };

    // Open modal for new rule
    const openAddRuleModal = () => {
        setEditingRule(null);
        const firstCanon = promptsList.find(p => p.id === 'prompt_bio')?.id || promptsList[0]?.id || 'prompt_bio';
        setRuleSelectedPromptIds([firstCanon]);
        setRuleSelectedFallbackIds([]);
        setRuleModalOpen(true);
    };

    // Open modal for editing existing rule
    const openEditRuleModal = (rule) => {
        setEditingRule(rule);
        setRuleSelectedPromptIds(rule.attachedPromptIds || []);
        setRuleSelectedFallbackIds(Array.isArray(rule.fallback_provider_ids) ? rule.fallback_provider_ids : []);
        setRuleModalOpen(true);
    };

    // Save rule from modal
    const handleSaveRuleModal = (ruleData) => {
        let nextRules;
        if (editingRule && editingRule.id) {
            nextRules = rulesList.map(r => r.id === editingRule.id ? { ...r, ...ruleData } : r);
        } else {
            const newId = 'rule_' + Date.now();
            nextRules = [...rulesList, { id: newId, ...ruleData }];
        }
        setRulesList(nextRules);
        setRuleModalOpen(false);
        setEditingRule(null);
        saveProfileChanges(promptsList, nextRules);
    };

    // Duplicate existing rule (optionally directly to another surface/section)
    const handleDuplicateRule = (rule, targetSurface = null) => {
        const newId = 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const targetSurf = targetSurface || rule.surface || activeSurface;
        const targetLabel = SURFACES.find(s => s.id === targetSurface)?.label;
        const duplicatedRule = {
            ...rule,
            id: newId,
            title: targetSurface && targetSurface !== rule.surface
                ? `${rule.title} (${targetLabel || targetSurface})`
                : `${rule.title} (копия)`,
            surface: targetSurf,
            surfaces: targetSurface ? [targetSurface] : (Array.isArray(rule.surfaces) && rule.surfaces.length ? [...rule.surfaces] : [targetSurf]),
            mode: rule.mode || 'ALL',
            conditions: Array.isArray(rule.conditions) ? JSON.parse(JSON.stringify(rule.conditions)) : [],
            attachedPromptIds: Array.isArray(rule.attachedPromptIds) ? [...rule.attachedPromptIds] : ['prompt_bio'],
            max_tokens: rule.max_tokens || 230,
            temperature: rule.temperature !== undefined ? rule.temperature : 0.7,
            provider_id: rule.provider_id ? Number(rule.provider_id) : null,
            fallback_provider_ids: Array.isArray(rule.fallback_provider_ids) ? [...rule.fallback_provider_ids] : [],
            enabled: true,
            category: 'rule'
        };

        let nextRules;
        if (targetSurface && targetSurface !== activeSurface) {
            nextRules = [...rulesList, duplicatedRule];
        } else {
            const ruleIdx = rulesList.findIndex(r => r.id === rule.id);
            nextRules = [...rulesList];
            if (ruleIdx !== -1) {
                nextRules.splice(ruleIdx + 1, 0, duplicatedRule);
            } else {
                nextRules.push(duplicatedRule);
            }
        }

        setRulesList(nextRules);
        setMovePopoverRuleId(null);
        saveProfileChanges(promptsList, nextRules);
        const destLabel = targetSurface ? ` в раздел «${targetLabel}»` : '';
        if (toast) toast(`Правило «${duplicatedRule.title}» создано${destLabel}`, 'success');
    };

    // Move rule to another surface / section
    const handleMoveRule = (ruleId, targetSurface) => {
        const targetSurfaceObj = SURFACES.find(s => s.id === targetSurface);
        const targetRule = rulesList.find(r => r.id === ruleId);
        if (!targetRule) return;

        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                return {
                    ...r,
                    surface: targetSurface,
                    surfaces: [targetSurface]
                };
            }
            return r;
        });

        setRulesList(nextRules);
        setMovePopoverRuleId(null);
        saveProfileChanges(promptsList, nextRules);
        if (toast) toast(`Правило «${targetRule.title}» перенесено в раздел «${targetSurfaceObj?.label || targetSurface}»`, 'success');
    };

    // Delete rule
    const handleDeleteRule = (ruleId) => {
        const target = rulesList.find(r => r.id === ruleId);
        if (!target) return;
        if (!window.confirm(`Удалить боевое правило «${target.title}»?`)) return;

        const nextRules = rulesList.filter(r => r.id !== ruleId);
        setRulesList(nextRules);
        setMovePopoverRuleId(null);
        saveProfileChanges(promptsList, nextRules);
        if (toast) toast(`Правило «${target.title}» удалено`, 'success');
    };

    // Attach/detach prompt IDs in a rule
    const handleToggleAttachPrompt = (ruleId, promptId) => {
        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                const current = r.attachedPromptIds || [];
                const updated = current.includes(promptId)
                    ? current.filter(id => id !== promptId)
                    : [...current, promptId];
                return { ...r, attachedPromptIds: updated };
            }
            return r;
        });
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Open raw prompt inspector for a specific rule
    const handleOpenRawPrompt = async (rule) => {
        try {
            setRawPromptLoading(true);
            setRawPromptModalOpen(true);
            setRawPromptData(null);
            setRawPromptCopied(false);
            setRawPromptTab('full');

            const ruleSurface = (Array.isArray(rule.surfaces) && rule.surfaces.length)
                ? (rule.surfaces.includes(activeSurface) ? activeSurface : rule.surfaces[0])
                : (rule.surface || activeSurface);

            const ruleMode = (rule.mode && rule.mode !== 'ALL')
                ? rule.mode
                : (ruleSurface === 'CHAT' ? 'CASUAL' : 'ALL');

            const res = await api('/api/admin/raw-prompt-preview', {
                method: 'POST',
                body: JSON.stringify({
                    ruleId: rule.id,
                    surface: ruleSurface,
                    mode: ruleMode
                })
            });

            if (res && res.success) {
                setRawPromptData(res);
            } else {
                if (toast) toast('Не удалось сформировать сырой промпт', 'error');
            }
        } catch (err) {
            console.error('[RAW PROMPT FETCH ERROR]', err);
            if (toast) toast(err.message || 'Ошибка загрузки сырого промпта', 'error');
        } finally {
            setRawPromptLoading(false);
        }
    };

    const handleCopyRawPrompt = (textToCopy) => {
        if (!textToCopy) return;
        navigator.clipboard?.writeText(textToCopy);
        setRawPromptCopied(true);
        if (toast) toast('Сырой промпт скопирован в буфер', 'success');
        setTimeout(() => setRawPromptCopied(false), 2000);
    };

    // Update single parameter (tokens or temperature)
    const handleUpdateParam = (ruleId, field, value) => {
        const nextRules = rulesList.map(r => {
            if (r.id === ruleId) {
                return { ...r, [field]: value };
            }
            return r;
        });
        setRulesList(nextRules);
        saveProfileChanges(promptsList, nextRules);
    };

    // Filter rules by active surface
    const activeRules = rulesList.filter(r => {
        if (Array.isArray(r.surfaces) && r.surfaces.length) {
            return r.surfaces.includes(activeSurface);
        }
        return (r.surface || 'CHAT') === activeSurface;
    });

    if (loading) {
        return (
            <div className="w-full h-96 flex items-center justify-center text-white/50 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Загрузка настроек ИИ...</span>
            </div>
        );
    }

    return (
        <main className="flex-1 w-full flex flex-col items-center animate-in fade-in duration-150">
            <div className="w-full max-w-[1042px] pl-[20px] pr-[17px] pt-[34px] pb-[60px] flex gap-[20px]">

                {/* LEFT COLUMN: ПРОМПТЫ / ПРОВАЙДЕРЫ (Figma Frame 205, width: 393px, padding: left/right 8px) */}
                <section className="w-[393px] px-2 flex-shrink-0 flex flex-col gap-[24px]">
                    {/* Header (Figma Frame 201, width: 377px) with dropdown menu */}
                    <div className="w-[377px] h-[38px] flex items-center justify-between relative">
                        {/* Dropdown Title Trigger */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setLeftMenuOpen(prev => !prev)}
                                className="flex items-center gap-1.5 text-[16px] font-medium text-white tracking-normal select-none cursor-pointer hover:text-white/80 transition-colors py-1 px-2 -ml-2 rounded-xl hover:bg-white/5"
                            >
                                <span>{leftTab === 'prompts' ? 'Промпты' : 'Провайдеры'}</span>
                                <ChevronDown className={`w-4 h-4 text-white/60 transition-transform duration-200 ${leftMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {leftMenuOpen && (
                                <div className="absolute top-[42px] left-0 z-50 w-44 bg-[#1b1b1b] border border-white/10 rounded-[18px] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLeftTab('prompts');
                                            setLeftMenuOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-[14px] rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                            leftTab === 'prompts' ? 'bg-[#292e5e] text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                    >
                                        <span>Промпты</span>
                                        {leftTab === 'prompts' && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLeftTab('providers');
                                            setLeftMenuOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-[14px] rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                            leftTab === 'providers' ? 'bg-[#292e5e] text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                    >
                                        <span>Провайдеры</span>
                                        {leftTab === 'providers' && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Action Button */}
                        {leftTab === 'prompts' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingPrompt(null);
                                    setPromptModalOpen(true);
                                }}
                                className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                            >
                                <span>Новый промпт</span>
                                <Plus className="w-4 h-4 text-white stroke-[1.5]" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingProvider(null);
                                    setProviderModalOpen(true);
                                }}
                                className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                            >
                                <span>Новый провайдер</span>
                                <Plus className="w-4 h-4 text-white stroke-[1.5]" />
                            </button>
                        )}
                    </div>

                    {/* Content: Prompts Stack or Providers Stack */}
                    {leftTab === 'prompts' ? (
                        /* Prompts Stack (Figma Frame 213 for Style A & Frame 216 for Style B) */
                        <div className="flex flex-col gap-[24px]">
                            {/* Frame 213: Style A Cards (gap: 7px) */}
                            {promptsList.filter(p => p.style === 'style-a').length > 0 && (
                                <div className="flex flex-col gap-[7px]">
                                    {promptsList.filter(p => p.style === 'style-a').map((item) => (
                                        <div
                                            key={item.id}
                                            draggable={true}
                                            onDragStart={(e) => handlePromptDragStart(e, item.id)}
                                            onDragOver={handlePromptDragOver}
                                            onDrop={(e) => handlePromptDrop(e, item.id)}
                                            className={`w-[377px] min-h-[158px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-[#000212]/37 border border-[#8693ff]/25 ${draggedPromptId === item.id ? 'opacity-40 border-dashed border-[#8693ff]' : ''}`}
                                        >
                                            {/* Card Header (Frame 201) */}
                                            <div className="px-2 py-1 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 overflow-hidden pr-2">
                                                    <GripVertical className="w-3.5 h-3.5 text-white/30 cursor-grab active:cursor-grabbing shrink-0" />
                                                    <span className="text-[16px] font-medium text-white truncate select-none">
                                                        {item.title}
                                                    </span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-normal select-none shrink-0">
                                                        {item.category_label || 'Канон'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={promptsList.indexOf(item) === 0}
                                                        onClick={() => handleMovePrompt(item.id, 'up')}
                                                        title="Переместить выше при сборке"
                                                        className="p-1 text-white/40 hover:text-white disabled:opacity-20 disabled:hover:text-white/40 cursor-pointer rounded hover:bg-white/5"
                                                    >
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={promptsList.indexOf(item) === promptsList.length - 1}
                                                        onClick={() => handleMovePrompt(item.id, 'down')}
                                                        title="Переместить ниже при сборке"
                                                        className="p-1 text-white/40 hover:text-white disabled:opacity-20 disabled:hover:text-white/40 cursor-pointer rounded hover:bg-white/5"
                                                    >
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingPrompt(item);
                                                            setPromptModalOpen(true);
                                                        }}
                                                        title="Редактировать промпт"
                                                        className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5 shrink-0"
                                                    >
                                                        <Pencil className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeletePrompt(item.id)}
                                                        title="Удалить промпт"
                                                        className="p-1 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded-lg hover:bg-white/5 shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Card Content (Component 41) */}
                                            <div className="w-full h-[108px] rounded-[20px] p-3 flex flex-col justify-start overflow-hidden bg-[#1d1f2f]/39">
                                                <p className="text-[16px] font-normal leading-relaxed line-clamp-4 select-none text-white/72">
                                                    {item.content || 'Промпт не заполнен'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Frame 216: Style B Cards (gap: 14px) */}
                            {promptsList.filter(p => p.style !== 'style-a').length > 0 && (
                                <div className="flex flex-col gap-[14px]">
                                    {promptsList.filter(p => p.style !== 'style-a').map((item) => (
                                        <div
                                            key={item.id}
                                            draggable={true}
                                            onDragStart={(e) => handlePromptDragStart(e, item.id)}
                                            onDragOver={handlePromptDragOver}
                                            onDrop={(e) => handlePromptDrop(e, item.id)}
                                            className={`w-[377px] min-h-[158px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 ${draggedPromptId === item.id ? 'opacity-40 border-dashed border-[#8693ff]' : ''}`}
                                        >
                                            {/* Card Header (Frame 201) */}
                                            <div className="px-2 py-1 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 overflow-hidden pr-2">
                                                    <GripVertical className="w-3.5 h-3.5 text-white/30 cursor-grab active:cursor-grabbing shrink-0" />
                                                    <span className="text-[16px] font-medium text-white truncate select-none">
                                                        {item.title}
                                                    </span>
                                                    {item.category_label ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-normal select-none shrink-0">
                                                            {item.category_label}
                                                        </span>
                                                    ) : item.is_routing_module ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-normal select-none shrink-0">
                                                            Маршрутизатор
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={promptsList.indexOf(item) === 0}
                                                        onClick={() => handleMovePrompt(item.id, 'up')}
                                                        title="Переместить выше при сборке"
                                                        className="p-1 text-white/40 hover:text-white disabled:opacity-20 disabled:hover:text-white/40 cursor-pointer rounded hover:bg-white/5"
                                                    >
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={promptsList.indexOf(item) === promptsList.length - 1}
                                                        onClick={() => handleMovePrompt(item.id, 'down')}
                                                        title="Переместить ниже при сборке"
                                                        className="p-1 text-white/40 hover:text-white disabled:opacity-20 disabled:hover:text-white/40 cursor-pointer rounded hover:bg-white/5"
                                                    >
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingPrompt(item);
                                                            setPromptModalOpen(true);
                                                        }}
                                                        title="Редактировать промпт"
                                                        className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5 shrink-0"
                                                    >
                                                        <Pencil className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeletePrompt(item.id)}
                                                        title="Удалить промпт"
                                                        className="p-1 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded-lg hover:bg-white/5 shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Card Content (Component 41) */}
                                            <div className="w-full h-[108px] rounded-[20px] p-3 flex flex-col justify-start overflow-hidden bg-[#272727]">
                                                <p className="text-[16px] font-normal leading-relaxed line-clamp-4 select-none text-white/45">
                                                    {item.content || 'Промпт не заполнен'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Providers Stack (Figma 377px width cards) */
                        <div className="flex flex-col gap-[20px]">
                            {/* Primary Provider */}
                            {providersList.find(p => p.is_active) ? (() => {
                                const primaryProvider = providersList.find(p => p.is_active);
                                return (
                                    <div className="flex flex-col gap-[7px]">
                                        <div className="text-[12px] uppercase tracking-wider font-semibold text-[#8693ff] px-2 flex items-center gap-1.5">
                                            <Zap className="w-3.5 h-3.5" />
                                            <span>Основной провайдер</span>
                                        </div>
                                        <div className="w-[377px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-[#000212]/37 border border-[#8693ff]/30 shadow-[0_0_20px_rgba(134,147,255,0.07)]">
                                            {/* Card Header */}
                                            <div className="px-2 py-1.5 flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className="text-[16px] font-medium text-white truncate select-none">
                                                        {primaryProvider.name}
                                                    </span>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#8693ff]/20 text-[#8693ff] border border-[#8693ff]/40 select-none flex-shrink-0">
                                                        Активен
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingProvider(primaryProvider);
                                                            setProviderModalOpen(true);
                                                        }}
                                                        title="Редактировать провайдера"
                                                        className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                                                    >
                                                        <Pencil className="w-4 h-4 stroke-[1.5]" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Card Content */}
                                            <div className="w-full rounded-[20px] p-3.5 flex flex-col gap-2 bg-[#1d1f2f]/39">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[11px] text-white/40 font-medium">Модель</span>
                                                    <span className="text-[14px] font-mono font-medium text-white/90 truncate select-none">
                                                        {primaryProvider.model_name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-[12px] text-white/50 pt-1 border-t border-white/5">
                                                    <span className="truncate max-w-[220px]" title={primaryProvider.base_url}>
                                                        {primaryProvider.base_url}
                                                    </span>
                                                    <span>{Math.round((primaryProvider.timeout_ms || 15000) / 1000)}с таймаут</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })() : (
                                <div className="w-[377px] p-4 rounded-[20px] bg-[#1d1f2f]/30 border border-white/10 text-center text-xs text-white/50">
                                    Нет активного основного провайдера.
                                </div>
                            )}

                            {/* Fallback Providers */}
                            {(() => {
                                const fallbacks = providersList.filter(p => !p.is_active);
                                return (
                                    <div className="flex flex-col gap-[10px]">
                                        <div className="text-[12px] uppercase tracking-wider font-semibold text-white/50 px-2 flex items-center justify-between">
                                            <span>Цепочка фоллбэков ({fallbacks.length})</span>
                                            <span className="text-[11px] text-white/30 font-normal">Приоритет: сверху вниз</span>
                                        </div>

                                        {fallbacks.length > 0 ? (
                                            <div className="flex flex-col gap-[12px]">
                                                {fallbacks.map((prov, idx) => (
                                                    <div
                                                        key={prov.id}
                                                        className="w-[377px] rounded-[23px] p-2 flex flex-col gap-1 transition-all bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 hover:border-white/20"
                                                    >
                                                        {/* Card Header */}
                                                        <div className="px-2 py-1.5 flex items-center justify-between">
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="text-[15px] font-medium text-white truncate select-none">
                                                                    {prov.name}
                                                                </span>
                                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/70 select-none flex-shrink-0">
                                                                    Фоллбэк #{idx + 1}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-1">
                                                                {/* Up Reorder */}
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={() => handleMoveFallback(idx, 'up')}
                                                                    title="Поднять приоритет фоллбэка"
                                                                    className="p-1 text-white/50 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <ArrowUp className="w-3.5 h-3.5" />
                                                                </button>
                                                                {/* Down Reorder */}
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === fallbacks.length - 1}
                                                                    onClick={() => handleMoveFallback(idx, 'down')}
                                                                    title="Понизить приоритет фоллбэка"
                                                                    className="p-1 text-white/50 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <ArrowDown className="w-3.5 h-3.5" />
                                                                </button>
                                                                {/* Edit */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingProvider(prov);
                                                                        setProviderModalOpen(true);
                                                                    }}
                                                                    title="Редактировать провайдера"
                                                                    className="p-1 text-white/50 hover:text-white transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                                                                </button>
                                                                {/* Delete */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteProvider(prov.id)}
                                                                    title="Удалить провайдера"
                                                                    className="p-1 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Card Content */}
                                                        <div className="w-full rounded-[20px] p-3 flex flex-col gap-2 bg-[#272727]">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[11px] text-white/40 font-medium">Модель</span>
                                                                <span className="text-[13px] font-mono text-white/80 truncate select-none">
                                                                    {prov.model_name}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-[11px] text-white/45 pt-1 border-t border-white/5">
                                                                <span className="truncate max-w-[200px]" title={prov.base_url}>
                                                                    {prov.base_url}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleActivateProvider(prov.id)}
                                                                    className="px-2.5 py-1 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-[11px] font-medium text-white cursor-pointer transition-all active:scale-95 flex-shrink-0"
                                                                >
                                                                    Сделать основным
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="w-[377px] p-4 rounded-[20px] bg-[#171717]/50 border border-white/5 text-center text-xs text-white/40 italic">
                                                Нет резервных провайдеров. Нажмите «Новый провайдер», чтобы добавить фоллбэк на случай сбоев.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </section>

                {/* RIGHT COLUMN: ПРАВИЛА (Figma Frame 208, width: 592px) */}
                <section className="w-[592px] flex-shrink-0 flex flex-col gap-[24px]">
                    {/* Surface Selector Tabs (Figma Frame 212) */}
                    <div className="flex items-center gap-[10px]">
                        {SURFACES.map((surf) => {
                            const isActive = activeSurface === surf.id;
                            return (
                                <button
                                    key={surf.id}
                                    type="button"
                                    onClick={() => {
                                        setActiveSurface(surf.id);
                                        setMovePopoverRuleId(null);
                                        setParamPopover(null);
                                    }}
                                    className={`h-[38px] px-4 text-[16px] font-normal flex items-center justify-center cursor-pointer transition-all ${
                                        isActive
                                            ? 'rounded-[12px] bg-[#232425] border border-[#353636] text-white shadow-inner'
                                            : 'rounded-full text-white/58 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {surf.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Rules Section (Figma Frame 206, padding left/right 8px) */}
                    <div className="px-2 flex flex-col gap-[16px]">
                        {/* Rules Header (Figma Frame 201, width: 586px) */}
                        <div className="w-[586px] h-[38px] flex items-center justify-between">
                            <h2 className="text-[16px] font-medium text-white tracking-normal select-none">
                                Правила
                            </h2>
                            <button
                                type="button"
                                onClick={openAddRuleModal}
                                className="h-[38px] px-4 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-[16px] font-normal flex items-center justify-center cursor-pointer transition-all active:scale-98 shadow-sm"
                            >
                                Добавить правило
                            </button>
                        </div>

                        {/* Rules List (Component 43 & Frame 202, width: 586px) */}
                        <div className="flex flex-col gap-[16px]">
                            {activeRules.map((rule) => {
                                const attachedPrompts = promptsList.filter(p => 
                                    (rule.attachedPromptIds || []).includes(p.id)
                                );

                                return (
                                    <div
                                        key={rule.id}
                                        className="w-[586px] min-h-[199px] rounded-[23px] bg-gradient-to-b from-[#171717] to-[#232425]/0 border border-white/10 p-2 flex flex-col gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                                    >
                                        {/* Rule Header (Frame 201) */}
                                        <div className="px-2 py-1.5 flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <span 
                                                    onClick={() => openEditRuleModal(rule)}
                                                    className="text-[16px] font-medium text-white select-none cursor-pointer hover:text-white/80 transition-colors truncate"
                                                >
                                                    {rule.title}
                                                </span>
                                                {rule.mode === 'EROTIC' && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#ff5c8d]/20 text-[#ff7fa8] font-medium select-none flex-shrink-0">
                                                        Erotic (18+)
                                                    </span>
                                                )}
                                                {rule.mode === 'CASUAL' && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#8693ff]/20 text-[#8693ff] font-medium select-none flex-shrink-0">
                                                        Casual
                                                    </span>
                                                )}
                                                {(!rule.mode || rule.mode === 'ALL') && (
                                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-normal select-none flex-shrink-0">
                                                        Все режимы
                                                    </span>
                                                )}
                                            </div>

                                            {/* Right controls: Move, Duplicate, Edit, Delete, Toggle */}
                                            <div className="flex items-center gap-1 shrink-0 relative">
                                                {/* Move to surface button & Popover */}
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMovePopoverRuleId(movePopoverRuleId === rule.id ? null : rule.id)}
                                                        title="Перенести или скопировать в другой раздел"
                                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                                            movePopoverRuleId === rule.id
                                                                ? 'bg-[#8693ff]/25 text-[#8693ff]'
                                                                : 'text-white/40 hover:text-white hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <ArrowRightLeft className="w-3.5 h-3.5 stroke-[1.75]" />
                                                    </button>

                                                    {movePopoverRuleId === rule.id && (
                                                        <>
                                                            <div 
                                                                className="fixed inset-0 z-30" 
                                                                onClick={() => setMovePopoverRuleId(null)} 
                                                            />
                                                            <div className="absolute top-8 right-0 z-40 w-60 bg-[#19191b] border border-white/15 rounded-2xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2.5 backdrop-blur-md">
                                                                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                                                                    <span className="text-[12px] font-medium text-white/90">
                                                                        Раздел правила
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setMovePopoverRuleId(null)}
                                                                        className="text-white/40 hover:text-white cursor-pointer"
                                                                    >
                                                                        <X className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>

                                                                {/* Move to section */}
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[11px] text-white/40 font-medium px-1">
                                                                        Перенести в раздел:
                                                                    </span>
                                                                    {SURFACES.filter(s => s.id !== activeSurface).map((s) => (
                                                                        <button
                                                                            key={s.id}
                                                                            type="button"
                                                                            onClick={() => handleMoveRule(rule.id, s.id)}
                                                                            className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-[#8693ff]/20 hover:text-[#8693ff] text-white/80 text-[12px] font-medium flex items-center justify-between transition-colors cursor-pointer"
                                                                        >
                                                                            <span>{s.label}</span>
                                                                            <ArrowRightLeft className="w-3.5 h-3.5 opacity-60" />
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {/* Duplicate to section */}
                                                                <div className="border-t border-white/10 pt-1.5 flex flex-col gap-1">
                                                                    <span className="text-[11px] text-white/40 font-medium px-1">
                                                                        Скопировать в раздел:
                                                                    </span>
                                                                    {SURFACES.filter(s => s.id !== activeSurface).map((s) => (
                                                                        <button
                                                                            key={s.id}
                                                                            type="button"
                                                                            onClick={() => handleDuplicateRule(rule, s.id)}
                                                                            className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/70 hover:text-white text-[12px] font-medium flex items-center justify-between transition-colors cursor-pointer"
                                                                        >
                                                                            <span>{s.label}</span>
                                                                            <Copy className="w-3.5 h-3.5 opacity-60" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Duplicate in place */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDuplicateRule(rule)}
                                                    title="Дублировать правило"
                                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                                >
                                                    <Copy className="w-3.5 h-3.5 stroke-[1.75]" />
                                                </button>

                                                {/* Edit */}
                                                <button
                                                    type="button"
                                                    onClick={() => openEditRuleModal(rule)}
                                                    title="Настройки правила"
                                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                                                >
                                                    <Pencil className="w-3 h-3 stroke-[1.75]" />
                                                </button>

                                                {/* Delete */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    title="Удалить правило"
                                                    className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                                                </button>

                                                {/* Toggle Icon (Circle Checkmark) */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleRule(rule.id)}
                                                    title={rule.enabled ? 'Правило активно (кликните, чтобы отключить)' : 'Правило отключено (кликните, чтобы включить)'}
                                                    className={`w-6 h-6 ml-1 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                                                        rule.enabled
                                                            ? 'bg-white text-black shadow-sm'
                                                            : 'border border-white/30 text-transparent hover:border-white/60'
                                                    }`}
                                                >
                                                    <Check className="w-4 h-4 stroke-[2.5]" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Rule Provider & Fallback Badge Row */}
                                        <div className="px-2 pb-1 flex items-center gap-2">
                                            {rule.provider_id ? (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#8693ff]/10 border border-[#8693ff]/25 text-[12px] text-white/80">
                                                    <Server className="w-3 h-3 text-[#8693ff]" />
                                                    <span className="font-medium">
                                                        {providersList.find(p => Number(p.id) === Number(rule.provider_id))?.name || `Провайдер #${rule.provider_id}`}
                                                    </span>
                                                    {Array.isArray(rule.fallback_provider_ids) && rule.fallback_provider_ids.length > 0 && (
                                                        <span className="text-[#8693ff] font-medium text-[11px]">
                                                            (+{rule.fallback_provider_ids.length} {rule.fallback_provider_ids.length === 1 ? 'фоллбэк' : 'фоллбэка'})
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/5 text-[12px] text-white/45">
                                                    <Server className="w-3 h-3 opacity-40" />
                                                    <span>Провайдер: Глобальный</span>
                                                    {Array.isArray(rule.fallback_provider_ids) && rule.fallback_provider_ids.length > 0 && (
                                                        <span className="text-[#8693ff]/80 font-medium text-[11px]">
                                                            (+{rule.fallback_provider_ids.length} {rule.fallback_provider_ids.length === 1 ? 'фоллбэк' : 'фоллбэка'})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Rule Content Row (Frame 199) */}
                                        <div className="flex items-stretch gap-2">
                                            {/* Left Sub-card: Инструкции (Frame 193, width: 288px) */}
                                            <div className="w-[288px] min-h-[145px] bg-[#272727] rounded-[20px] p-2 flex flex-col gap-1">
                                                {/* Header (Frame 111) */}
                                                <div className="flex items-center justify-between px-1 py-1">
                                                    <span className="text-[16px] font-medium text-[#9a9a9a] select-none">
                                                        Инструкции
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAttachModalRuleId(rule.id)}
                                                        title="Выбрать прикрепленные инструкции"
                                                        className="p-1 text-[#9a9a9a] hover:text-white transition-colors cursor-pointer rounded-md hover:bg-white/5"
                                                    >
                                                        <ChevronRight className="w-5 h-5 stroke-[1.5]" />
                                                    </button>
                                                </div>

                                                {/* Attached Prompts List (Frame 112) */}
                                                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                                                    {attachedPrompts.length > 0 ? (
                                                        attachedPrompts.map((ap, apIdx) => (
                                                            <div
                                                                key={ap.id}
                                                                draggable={true}
                                                                onDragStart={(e) => handleAttachedDragStart(e, ap.id)}
                                                                onDragOver={handleAttachedDragOver}
                                                                onDrop={(e) => handleAttachedDrop(e, rule.id, ap.id)}
                                                                className={`w-full bg-[#171616] border border-white/[0.07] rounded-[16px] p-2 flex flex-col gap-1 transition-all ${draggedAttachedId === ap.id ? 'opacity-40 border-dashed border-[#8693ff]' : ''}`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5 overflow-hidden pr-1">
                                                                        <GripVertical className="w-3.5 h-3.5 text-white/30 cursor-grab active:cursor-grabbing shrink-0" />
                                                                        <span className="text-[14px] font-medium text-[#bdbdbd] truncate select-none">
                                                                            {ap.title}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-0.5 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            disabled={apIdx === 0}
                                                                            onClick={() => handleMoveAttachedPrompt(rule.id, ap.id, 'up')}
                                                                            title="Выше в промпте"
                                                                            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 disabled:hover:text-white/40 cursor-pointer rounded hover:bg-white/5"
                                                                        >
                                                                            <ChevronUp className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={apIdx === attachedPrompts.length - 1}
                                                                            onClick={() => handleMoveAttachedPrompt(rule.id, ap.id, 'down')}
                                                                            title="Ниже в промпте"
                                                                            className="p-0.5 text-white/40 hover:text-white disabled:opacity-20 disabled:hover:text-white/40 cursor-pointer rounded hover:bg-white/5"
                                                                        >
                                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingPrompt(ap);
                                                                                setPromptModalOpen(true);
                                                                            }}
                                                                            title="Редактировать промпт"
                                                                            className="p-0.5 text-white/40 hover:text-white transition-opacity cursor-pointer rounded hover:bg-white/5"
                                                                        >
                                                                            <Pencil className="w-3 h-3 stroke-[1.5]" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDetachPrompt(rule.id, ap.id)}
                                                                            title="Открепить от правила"
                                                                            className="p-0.5 text-white/40 hover:text-red-400 transition-colors cursor-pointer rounded hover:bg-white/5"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[12px] text-white/50 truncate px-1 select-none">
                                                                    {ap.content || 'Пустой текст'}
                                                                </p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div 
                                                            onClick={() => setAttachModalRuleId(rule.id)}
                                                            className="text-[13px] text-white/30 italic py-6 text-center cursor-pointer hover:text-white/50 select-none"
                                                        >
                                                            Нажмите › чтобы прикрепить инструкции
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Sub-cards: Токены & Темп (Frame 200, width: 272px) */}
                                            <div className="w-[272px] flex flex-col gap-2 relative">
                                                {/* Card 1: Токены (Component 41) */}
                                                <button
                                                    type="button"
                                                    onClick={() => setParamPopover(
                                                        paramPopover?.ruleId === rule.id && paramPopover?.type === 'tokens'
                                                            ? null
                                                            : { ruleId: rule.id, type: 'tokens', value: rule.max_tokens || 230 }
                                                    )}
                                                    className="h-[68.5px] rounded-[20px] bg-[#272727] hover:bg-[#303030] text-white/50 hover:text-white/80 font-semibold text-[16px] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 select-none"
                                                >
                                                    <span>Токены {rule.max_tokens || 230}</span>
                                                    <ChevronRight className="w-4 h-4 text-white/50 stroke-[2]" />
                                                </button>

                                                {/* Card 2: Темп (Component 42) */}
                                                <button
                                                    type="button"
                                                    onClick={() => setParamPopover(
                                                        paramPopover?.ruleId === rule.id && paramPopover?.type === 'temp'
                                                            ? null
                                                            : { ruleId: rule.id, type: 'temp', value: rule.temperature !== undefined ? rule.temperature : 0.7 }
                                                    )}
                                                    className="h-[68.5px] rounded-[20px] bg-[#272727] hover:bg-[#303030] text-[#9a9a9a] hover:text-white/80 font-semibold text-[16px] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 select-none"
                                                >
                                                    <span>Темп: {rule.temperature !== undefined ? String(rule.temperature).replace('.', ',') : '0,7'}</span>
                                                    <ChevronRight className="w-4 h-4 text-white/50 stroke-[2]" />
                                                </button>

                                                {/* Card 3: Посмотреть сырой промпт (в пустой области под Токенами и Темпом) */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenRawPrompt(rule)}
                                                    title="Посмотреть полный сформированный промпт со всеми данными Radiant"
                                                    className="w-full py-2.5 px-3 rounded-[16px] bg-[#272727] hover:bg-[#323232] border border-white/[0.06] hover:border-white/15 text-[#9a9a9a] hover:text-white text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 select-none group"
                                                >
                                                    <Eye className="w-4 h-4 text-[#8693ff] group-hover:scale-110 transition-transform stroke-[2]" />
                                                    <span>Посмотреть сырой промпт</span>
                                                </button>

                                                {/* Parameter Popover */}
                                                {paramPopover && paramPopover.ruleId === rule.id && (
                                                    <div className="absolute top-0 right-0 z-30 w-full bg-[#1e1e1e] border border-white/10 rounded-[20px] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2">
                                                        <div className="flex items-center justify-between text-xs text-white/70 font-medium">
                                                            <span>
                                                                {paramPopover.type === 'tokens' ? 'Лимит токенов' : 'Температура креативности'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setParamPopover(null)}
                                                                className="text-white/40 hover:text-white"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>

                                                        {paramPopover.type === 'tokens' ? (
                                                            <div className="flex flex-col gap-2">
                                                                <input
                                                                    type="range"
                                                                    min="50"
                                                                    max="1200"
                                                                    step="10"
                                                                    value={paramPopover.value}
                                                                    onChange={(e) => setParamPopover({ ...paramPopover, value: Number(e.target.value) })}
                                                                    className="w-full accent-[#292e5e] cursor-pointer"
                                                                />
                                                                <div className="flex items-center justify-between">
                                                                    <input
                                                                        type="number"
                                                                        value={paramPopover.value}
                                                                        onChange={(e) => setParamPopover({ ...paramPopover, value: Number(e.target.value) })}
                                                                        className="w-20 bg-[#121212] border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleUpdateParam(rule.id, 'max_tokens', paramPopover.value);
                                                                            setParamPopover(null);
                                                                        }}
                                                                        className="px-3 py-1 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-xs font-medium cursor-pointer"
                                                                    >
                                                                        Применить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                <input
                                                                    type="range"
                                                                    min="0.1"
                                                                    max="1.5"
                                                                    step="0.05"
                                                                    value={paramPopover.value}
                                                                    onChange={(e) => setParamPopover({ ...paramPopover, value: Number(e.target.value) })}
                                                                    className="w-full accent-[#292e5e] cursor-pointer"
                                                                />
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm font-semibold text-white px-2">
                                                                        {String(paramPopover.value).replace('.', ',')}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleUpdateParam(rule.id, 'temperature', paramPopover.value);
                                                                            setParamPopover(null);
                                                                        }}
                                                                        className="px-3 py-1 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-white text-xs font-medium cursor-pointer"
                                                                    >
                                                                        Применить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {activeRules.length === 0 && (
                                <div className="text-center py-12 text-white/40 text-sm italic">
                                    Нет правил для поверхности {SURFACES.find(s => s.id === activeSurface)?.label}. Нажмите «Добавить правило».
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* MODAL: Создание / Редактирование промпта */}
            {promptModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                {editingPrompt ? 'Редактировать промпт' : 'Новый модуль промпта'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setPromptModalOpen(false);
                                    setEditingPrompt(null);
                                }}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleSavePromptModal({
                                    title: formData.get('title'),
                                    style: formData.get('style'),
                                    content: formData.get('content'),
                                    is_system: formData.get('is_system') === 'on'
                                });
                            }}
                            className="flex flex-col gap-4"
                        >
                            {editingPrompt?.is_routing_module && (
                                <div className="text-[12px] text-[#8693ff] bg-[#8693ff]/10 border border-[#8693ff]/20 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                                    <span className="font-medium">Боевой системный модуль:</span>
                                    <span className="text-white/80">изменения сразу обновляют боевой конвейер диалога Леры.</span>
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Название промпта</label>
                                <input
                                    name="title"
                                    defaultValue={editingPrompt?.title || ''}
                                    placeholder="например, Характер, Ограничения..."
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Стиль карточки (акцент)</label>
                                <select
                                    name="style"
                                    defaultValue={editingPrompt?.style || 'style-b'}
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50 cursor-pointer"
                                >
                                    <option value="style-a">Стиль A (Синий фон #000212 — Канон/Системный)</option>
                                    <option value="style-b">Стиль B (Темный градиент #171717 — Модульный)</option>
                                </select>
                            </div>

                            <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-white/80 py-1">
                                <input
                                    type="checkbox"
                                    name="is_system"
                                    defaultChecked={Boolean(editingPrompt?.is_system || editingPrompt?.is_canonical || editingPrompt?.style === 'style-a')}
                                    className="w-4 h-4 rounded border-white/20 bg-[#202020] text-[#8693ff] focus:ring-0 cursor-pointer"
                                />
                                <span>Сделать системным промптом (Канон / Системный приоритет)</span>
                            </label>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-white/60 font-medium">Текст системной инструкции</label>
                                    {editingPrompt?.id === 'prompt_radiant' && (
                                        <span className="text-[10px] text-[#8693ff]/80 font-mono">
                                            Шаблоны: &#123;&#123;user_name&#125;&#125;, &#123;&#123;relationship&#125;&#125;, &#123;&#123;time&#125;&#125;, &#123;&#123;channel_stats&#125;&#125;, &#123;&#123;day_events&#125;&#125;
                                        </span>
                                    )}
                                </div>
                                <textarea
                                    name="content"
                                    defaultValue={editingPrompt?.content || ''}
                                    placeholder="Опишите инструкции для персонажа..."
                                    rows={10}
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl p-3.5 text-xs font-mono text-white leading-relaxed focus:outline-none focus:border-[#8693ff]/50 resize-y"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPromptModalOpen(false);
                                        setEditingPrompt(null);
                                    }}
                                    className="px-4 py-2 rounded-full hover:bg-white/5 text-sm text-white/70 hover:text-white cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Создание / Редактирование правила */}
            {ruleModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                {editingRule?.id ? 'Настройка правила' : 'Новое правило'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setRuleModalOpen(false);
                                    setEditingRule(null);
                                }}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const selectedSurfaces = SURFACES
                                    .map(s => s.id)
                                    .filter(sId => formData.get(`surf_${sId}`) === 'on');

                                handleSaveRuleModal({
                                    title: formData.get('title'),
                                    surfaces: selectedSurfaces.length ? selectedSurfaces : [activeSurface],
                                    surface: selectedSurfaces[0] || activeSurface,
                                    mode: formData.get('mode') || 'ALL',
                                    provider_id: formData.get('provider_id') ? Number(formData.get('provider_id')) : null,
                                    fallback_provider_ids: ruleSelectedFallbackIds,
                                    enabled: editingRule?.enabled !== false,
                                    attachedPromptIds: ruleSelectedPromptIds.length ? ruleSelectedPromptIds : (promptsList.length ? [promptsList[0].id] : ['prompt_bio']),
                                    max_tokens: Number(formData.get('max_tokens')) || 230,
                                    temperature: Number(formData.get('temperature')) || 0.7,
                                    content: ''
                                });
                            }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Название правила</label>
                                <input
                                    name="title"
                                    defaultValue={editingRule?.title || ''}
                                    placeholder="например, Вечер / тг канал"
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>



                            {/* Выбор инструкций/промптов */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium flex items-center justify-between">
                                    <span>Прикрепленные промпты (инструкции)</span>
                                    <span className="text-[11px] text-white/40">{ruleSelectedPromptIds.length} выбрано</span>
                                </label>
                                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                                    {promptsList.map((pr) => {
                                        const isChecked = ruleSelectedPromptIds.includes(pr.id);
                                        return (
                                            <div
                                                key={pr.id}
                                                onClick={() => {
                                                    setRuleSelectedPromptIds(prev =>
                                                        prev.includes(pr.id)
                                                            ? prev.filter(id => id !== pr.id)
                                                            : [...prev, pr.id]
                                                    );
                                                }}
                                                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                    isChecked
                                                        ? 'bg-[#1e233d] border-[#8693ff]/40 text-white'
                                                        : 'bg-[#202020] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-white">{pr.title}</span>
                                                        {(pr.is_canonical || pr.style === 'style-a') && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-normal select-none">
                                                                Канон
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[11px] text-white/40 truncate">{pr.content}</span>
                                                </div>
                                                <div
                                                    className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                                                        isChecked ? 'bg-white text-black' : 'border border-white/30 text-transparent'
                                                    }`}
                                                >
                                                    <Check className="w-3 h-3 stroke-[2.5]" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Раздел / Поверхности применения</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {SURFACES.map((s) => {
                                        const isChecked = (editingRule?.surfaces || [activeSurface]).includes(s.id);
                                        return (
                                            <label
                                                key={s.id}
                                                className="flex items-center gap-2 p-2.5 rounded-xl bg-[#202020] border border-white/10 cursor-pointer hover:bg-white/5 has-[:checked]:border-[#8693ff]/50 has-[:checked]:bg-[#1e233d] transition-all"
                                            >
                                                <input
                                                    type="checkbox"
                                                    name={`surf_${s.id}`}
                                                    defaultChecked={isChecked}
                                                    className="rounded accent-[#8693ff]"
                                                />
                                                <span className="text-xs text-white/90">{s.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Режим диалога (Casual / Erotic) */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Режим диалога (условие правила)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'ALL', label: 'Все режимы' },
                                        { id: 'CASUAL', label: 'Casual' },
                                        { id: 'EROTIC', label: 'Erotic (18+)' }
                                    ].map((m) => {
                                        const isSelected = (editingRule?.mode || 'ALL') === m.id;
                                        return (
                                            <label
                                                key={m.id}
                                                className="flex items-center gap-2 p-2.5 rounded-xl bg-[#202020] border border-white/10 cursor-pointer hover:bg-white/5 has-[:checked]:border-[#8693ff]/50 has-[:checked]:bg-[#1e233d]"
                                            >
                                                <input
                                                    type="radio"
                                                    name="mode"
                                                    value={m.id}
                                                    defaultChecked={isSelected}
                                                    className="accent-[#8693ff]"
                                                />
                                                <span className="text-xs text-white/90">{m.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Выбор основного провайдера для правила */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium flex items-center justify-between">
                                    <span>Основной AI провайдер (override)</span>
                                    <span className="text-[11px] text-white/40">Опционально</span>
                                </label>
                                <select
                                    name="provider_id"
                                    defaultValue={editingRule?.provider_id || ''}
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50 cursor-pointer"
                                >
                                    <option value="">По умолчанию (Глобальный активный)</option>
                                    {providersList.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} — {p.model_name} {p.is_active ? '(Глобальный основной)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Цепочка фоллбэков для правила */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium flex items-center justify-between">
                                    <span>Цепочка фоллбэков правила (резервные AI)</span>
                                    <span className="text-[11px] text-white/40">{ruleSelectedFallbackIds.length} выбрано</span>
                                </label>
                                {providersList.length > 0 ? (
                                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                                        {providersList.map((p) => {
                                            const isChecked = ruleSelectedFallbackIds.includes(Number(p.id));
                                            const orderIndex = ruleSelectedFallbackIds.indexOf(Number(p.id));
                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setRuleSelectedFallbackIds(prev =>
                                                            prev.includes(Number(p.id))
                                                                ? prev.filter(id => id !== Number(p.id))
                                                                : [...prev, Number(p.id)]
                                                        );
                                                    }}
                                                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                        isChecked
                                                            ? 'bg-[#1e233d] border-[#8693ff]/40 text-white'
                                                            : 'bg-[#202020] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                                                        <span className="text-xs font-medium text-white truncate">{p.name}</span>
                                                        <span className="text-[11px] font-mono text-white/40 truncate">({p.model_name})</span>
                                                        {isChecked && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-medium flex-shrink-0">
                                                                Шаг #{orderIndex + 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                                                            isChecked ? 'bg-white text-black' : 'border border-white/30 text-transparent'
                                                        }`}
                                                    >
                                                        <Check className="w-3 h-3 stroke-[2.5]" />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span className="text-xs text-white/40 italic">Нет настроенных провайдеров</span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Лимит токенов</label>
                                    <input
                                        type="number"
                                        name="max_tokens"
                                        defaultValue={editingRule?.max_tokens || 230}
                                        min="50"
                                        max="1500"
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Температура</label>
                                    <input
                                        type="number"
                                        name="temperature"
                                        step="0.05"
                                        min="0.1"
                                        max="1.5"
                                        defaultValue={editingRule?.temperature !== undefined ? editingRule.temperature : 0.7}
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRuleModalOpen(false);
                                        setEditingRule(null);
                                    }}
                                    className="px-4 py-2 rounded-full hover:bg-white/5 text-sm text-white/70 hover:text-white cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? 'Сохранение...' : 'Сохранить правило'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Добавление / Редактирование AI провайдера */}
            {providerModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                {editingProvider?.id ? 'Настройка провайдера' : 'Новый AI провайдер'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setProviderModalOpen(false);
                                    setEditingProvider(null);
                                }}
                                className="text-white/40 hover:text-white cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                handleSaveProviderModal({
                                    name: formData.get('name'),
                                    base_url: formData.get('base_url'),
                                    api_key: formData.get('api_key'),
                                    model_name: formData.get('model_name'),
                                    timeout_ms: Number(formData.get('timeout_ms')) || 15000
                                });
                            }}
                            className="flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Название провайдера</label>
                                <input
                                    name="name"
                                    defaultValue={editingProvider?.name || ''}
                                    placeholder="например, OpenRouter (Claude), Together (DeepSeek)..."
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">Base URL (OpenAI-совместимый endpoint)</label>
                                <input
                                    name="base_url"
                                    defaultValue={editingProvider?.base_url || 'https://openrouter.ai/api/v1'}
                                    placeholder="https://openrouter.ai/api/v1"
                                    required
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs text-white/60 font-medium">API Ключ</label>
                                <input
                                    type="password"
                                    name="api_key"
                                    defaultValue={editingProvider?.api_key || ''}
                                    placeholder={editingProvider ? 'Оставьте пустым, чтобы не менять' : 'sk-or-v1-...'}
                                    required={!editingProvider}
                                    className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-[#8693ff]/50"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Идентификатор модели</label>
                                    <input
                                        name="model_name"
                                        defaultValue={editingProvider?.model_name || ''}
                                        placeholder="anthropic/claude-3.5-sonnet"
                                        required
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-white/60 font-medium">Таймаут (мс)</label>
                                    <input
                                        type="number"
                                        name="timeout_ms"
                                        defaultValue={editingProvider?.timeout_ms || 15000}
                                        step="1000"
                                        min="2000"
                                        max="60000"
                                        className="bg-[#202020] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#8693ff]/50"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProviderModalOpen(false);
                                        setEditingProvider(null);
                                    }}
                                    className="px-4 py-2 rounded-full hover:bg-white/5 text-sm text-white/70 hover:text-white cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all active:scale-95"
                                >
                                    {editingProvider ? 'Сохранить изменения' : 'Добавить провайдера'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Выбор прикрепленных инструкций (Инструкции >) */}
            {attachModalRuleId && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-[#151515] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-lg font-medium text-white">
                                Прикрепить инструкции
                            </h3>
                            <button
                                type="button"
                                onClick={() => setAttachModalRuleId(null)}
                                className="text-white/40 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-white/60">
                            Выберите модули промптов, которые должны войти в состав этого правила:
                        </p>

                        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                            {promptsList.map((pr) => {
                                const currentRule = rulesList.find(r => r.id === attachModalRuleId);
                                const isAttached = (currentRule?.attachedPromptIds || []).includes(pr.id);

                                return (
                                    <div
                                        key={pr.id}
                                        onClick={() => handleToggleAttachPrompt(attachModalRuleId, pr.id)}
                                        className={`p-3 rounded-[16px] border flex items-center justify-between cursor-pointer transition-all ${
                                            isAttached
                                                ? 'bg-[#1e233d] border-[#8693ff]/40 text-white'
                                                : 'bg-[#1c1c1c] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{pr.title}</span>
                                                {(pr.is_canonical || pr.style === 'style-a') && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8693ff]/20 text-[#8693ff] font-normal select-none">
                                                        Канон
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-white/40 truncate">{pr.content}</span>
                                        </div>

                                        <div
                                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                                isAttached
                                                    ? 'bg-white text-black'
                                                    : 'border border-white/30 text-transparent'
                                            }`}
                                        >
                                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setAttachModalRuleId(null)}
                                className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer"
                            >
                                Готово
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Просмотр сырого промпта (со всеми данными Radiant, памятью и историей) */}
            {rawPromptModalOpen && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] bg-[#151515] border border-white/10 rounded-[24px] flex flex-col overflow-hidden text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#191919]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-[#8693ff]/10 text-[#8693ff] border border-[#8693ff]/20">
                                    <Eye className="w-5 h-5 stroke-[2]" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-semibold text-white">
                                            Сырой промпт при запросе
                                        </h3>
                                        {rawPromptData?.surface && (
                                            <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#252525] border border-white/10 text-white font-medium">
                                                {SURFACES.find(s => s.id === rawPromptData.surface)?.label || rawPromptData.surface}
                                            </span>
                                        )}
                                        {rawPromptData?.rule?.title && (
                                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-white/80">
                                                {rawPromptData.rule.title}
                                            </span>
                                        )}
                                        {rawPromptData?.mode && rawPromptData.mode !== 'ALL' && (
                                            <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                                                rawPromptData.mode === 'EROTIC'
                                                    ? 'bg-[#ff5588]/15 text-[#ff88aa] border border-[#ff5588]/30'
                                                    : 'bg-[#8693ff]/15 text-[#a8b3ff] border border-[#8693ff]/30'
                                            }`}>
                                                {rawPromptData.mode}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-white/50 mt-0.5">
                                        Честный снимок всего payload, уходящего в LLM в Telegram со всеми слоями Radiant и памятью
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {rawPromptData && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const text = rawPromptTab === 'system'
                                                ? rawPromptData.systemPrompt
                                                : rawPromptTab === 'radiant'
                                                ? rawPromptData.radiantContext
                                                : rawPromptTab === 'history'
                                                ? JSON.stringify(rawPromptData.history, null, 2)
                                                : rawPromptData.fullPromptText;
                                            handleCopyRawPrompt(text);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/15 border border-white/10 text-xs font-medium text-white/80 hover:text-white transition-all cursor-pointer"
                                    >
                                        <Copy className="w-3.5 h-3.5 stroke-[2]" />
                                        <span>{rawPromptCopied ? 'Скопировано' : 'Скопировать'}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setRawPromptModalOpen(false)}
                                    className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Top Parameters HUD Banner */}
                        {rawPromptData?.generationParams && (
                            <div className="px-6 py-2.5 bg-[#121212] border-b border-white/5 flex flex-wrap items-center justify-between text-xs text-white/60 gap-3">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white/40">Провайдер:</span>
                                        <span className="text-white font-medium">{rawPromptData.generationParams.provider_name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white/40">Модель:</span>
                                        <span className="text-[#a8b3ff] font-mono">{rawPromptData.generationParams.model}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white/40">Температура:</span>
                                        <span className="text-white font-medium">{rawPromptData.generationParams.temperature}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white/40">Токены:</span>
                                        <span className="text-white font-medium">{rawPromptData.generationParams.max_tokens}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-white/40">Оценка токенов payload:</span>
                                    <span className="px-2 py-0.5 rounded-md bg-white/[0.08] text-white/90 font-mono text-[11px]">
                                        ~{rawPromptData.estimatedTokens || 0} tok
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* View Tabs */}
                        <div className="px-6 pt-3 bg-[#151515] border-b border-white/5 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setRawPromptTab('full')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all cursor-pointer border-b-2 ${
                                    rawPromptTab === 'full'
                                        ? 'border-[#8693ff] text-white bg-white/[0.04]'
                                        : 'border-transparent text-white/50 hover:text-white/80'
                                }`}
                            >
                                Полный Payload ({rawPromptData?.messages?.length || 0} сообщений)
                            </button>
                            <button
                                type="button"
                                onClick={() => setRawPromptTab('system')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all cursor-pointer border-b-2 ${
                                    rawPromptTab === 'system'
                                        ? 'border-[#8693ff] text-white bg-white/[0.04]'
                                        : 'border-transparent text-white/50 hover:text-white/80'
                                }`}
                            >
                                Системный промпт
                            </button>
                            <button
                                type="button"
                                onClick={() => setRawPromptTab('radiant')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all cursor-pointer border-b-2 ${
                                    rawPromptTab === 'radiant'
                                        ? 'border-[#8693ff] text-white bg-white/[0.04]'
                                        : 'border-transparent text-white/50 hover:text-white/80'
                                }`}
                            >
                                Сводка Radiant (СПб, Погода, Нужды)
                            </button>
                            <button
                                type="button"
                                onClick={() => setRawPromptTab('history')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all cursor-pointer border-b-2 ${
                                    rawPromptTab === 'history'
                                        ? 'border-[#8693ff] text-white bg-white/[0.04]'
                                        : 'border-transparent text-white/50 hover:text-white/80'
                                }`}
                            >
                                История и Память
                            </button>
                        </div>

                        {/* Modal Body / Code Viewport */}
                        <div className="flex-1 overflow-y-auto p-6 bg-[#0d0d0d] font-mono text-xs leading-relaxed select-text">
                            {rawPromptLoading ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-3 text-white/50">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#8693ff]" />
                                    <span>Собираем реальные данные Radiant и промпта...</span>
                                </div>
                            ) : rawPromptData ? (
                                <>
                                    {rawPromptTab === 'full' && (
                                        <div className="flex flex-col gap-4">
                                            {rawPromptData.messages?.map((m, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className={`p-4 rounded-xl border ${
                                                        m.role === 'system'
                                                            ? 'bg-[#14141c] border-[#8693ff]/20 text-[#d8dcff]'
                                                            : m.role === 'user'
                                                            ? 'bg-[#1b1915] border-amber-500/20 text-amber-100/90'
                                                            : 'bg-[#141d17] border-emerald-500/20 text-emerald-100/90'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[11px] font-semibold uppercase tracking-wider opacity-75">
                                                        <span>Роль: {m.role}</span>
                                                        <span className="text-[10px] lowercase opacity-50 font-normal">
                                                            {typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length} символов
                                                        </span>
                                                    </div>
                                                    <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 break-words">
                                                        {typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p?.type === 'text' ? (p.text || '') : p?.type === 'image_url' ? `[Изображение]` : JSON.stringify(p)).join('\n') : JSON.stringify(m.content, null, 2)}
                                                    </pre>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {rawPromptTab === 'system' && (
                                        <div className="p-4 rounded-xl bg-[#14141c] border border-[#8693ff]/20 text-[#d8dcff]">
                                            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 break-words">
                                                {rawPromptData.systemPrompt}
                                            </pre>
                                        </div>
                                    )}

                                    {rawPromptTab === 'radiant' && (
                                        <div className="flex flex-col gap-4">
                                            <div className="p-4 rounded-xl bg-[#171a22] border border-cyan-500/20 text-cyan-100/90">
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 mb-2">
                                                    Форматированный блок для модели:
                                                </div>
                                                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 break-words">
                                                    {rawPromptData.radiantContext}
                                                </pre>
                                            </div>

                                            {rawPromptData.radiantLayers && (
                                                <div className="p-4 rounded-xl bg-[#121212] border border-white/5 text-white/70">
                                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-2">
                                                        Сырые слои симуляции (JSON):
                                                    </div>
                                                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-4 text-white/60">
                                                        {JSON.stringify(rawPromptData.radiantLayers, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {rawPromptTab === 'history' && (
                                        <div className="flex flex-col gap-4">
                                            <div className="p-4 rounded-xl bg-[#18161f] border border-purple-500/20 text-purple-100/90">
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-400 mb-2">
                                                    === 🧠 ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ ===
                                                </div>
                                                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 break-words">
                                                    {rawPromptData.memories}
                                                </pre>
                                            </div>

                                            <div className="p-4 rounded-xl bg-[#121212] border border-white/5 text-white/80">
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-2">
                                                    Последние реплики диалога (Multi-turn):
                                                </div>
                                                <div className="flex flex-col gap-2 mt-2">
                                                    {rawPromptData.history?.map((h, i) => (
                                                        <div key={i} className="flex items-start gap-2 text-xs">
                                                            <span className="font-semibold text-white/50 uppercase w-20 flex-shrink-0">
                                                                {h.role}:
                                                            </span>
                                                            <span className="text-white/90 break-words">{h.content}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="h-48 flex items-center justify-center text-white/30 italic">
                                    Нет данных для отображения
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-3 bg-[#151515] border-t border-white/10 flex items-center justify-between">
                            <span className="text-xs text-white/40">
                                Эндпоинт: <span className="font-mono text-white/60">/api/admin/raw-prompt-preview</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setRawPromptModalOpen(false)}
                                className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#343b75] text-sm text-white font-medium cursor-pointer transition-all"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
