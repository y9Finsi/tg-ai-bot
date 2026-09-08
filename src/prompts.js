import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting, setSetting, getLeraProfile, getLeraProfileProjection, DEFAULT_LERA_COMBAT_RULES } from './db/database.js';
import { ALL_PROMPT_SECTIONS, PROMPT_SECTIONS, ROUTING_PROMPT_SECTIONS, SYSTEM_CONTRACT_SECTIONS } from './prompt_sections.js';
import { renderPromptTemplate, DEFAULT_PROMPT_TEMPLATES } from './ai/prompt_renderer.js';
import { evaluateRules } from './ai/profile/rule_evaluator.js';

export { ALL_PROMPT_SECTIONS, PROMPT_SECTIONS, ROUTING_PROMPT_SECTIONS, SYSTEM_CONTRACT_SECTIONS };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_LLM_PARAMS = {
    temperature: 0.66,
    presence_penalty: 0.1,
    frequency_penalty: 0.1
};

const PROMPT_ORDER = [
    'lera_base',
    'lera_speech',
    'lera_intimacy',
    'lera_examples',
    'lera_virt_examples',
    'lera_rules'
];

function sanitizeLegacyIdentity(text) {
    return String(text || '')
        .replace(/Тебе\s+21\s+год[.!]?\s*Ты\s+живёшь\s+в\s+Санкт-Петербурге\.?/giu, 'Тебе 19 лет. Ты живёшь в Санкт-Петербурге.')
        .replace(/Лере\s+21\s+лет/giu, 'Лере 19 лет')
        .replace(/Лере\s+21\s+год/giu, 'Лере 19 лет');
}

const RESPONSE_FORMAT_CONTRACT = `ФОРМАТ ОТВЕТА В TELEGRAM:
Обычно отвечай одной короткой репликой.
Если мысль лучше звучит лесенкой, раздели 2–4 короткие реплики буквальным разделителем ||| на одной строке.
Пример: первая реплика ||| вторая реплика ||| третья реплика.
Не заменяй ||| обычными переносами строк, не ставь разделитель отдельной строкой и не пиши его в ответе, если нужна одна реплика.`;

const CONVERSATION_CONTINUITY_CONTRACT = `ЛОГИКА ДИАЛОГА И РЕАЛЬНОСТЬ:
Короткие реакции пользователя («пон», «ага», «ок») не являются поводом внезапно начинать другую сцену или добавлять новую деталь. Оставайся в текущей теме либо ответь коротко и естественно.
Если пользователь пишет «че?», «чеее?» или «в смысле?» сразу после твоей фразы, поясни именно свою предыдущую мысль. Не отвечай шаблонным «не поняла, что ты имеешь в виду».
Опирайся на свою реальную обстановку из контекста дня и факты о пользователе из памяти. Если вы общаетесь удалённо в Telegram, запрещено подыгрывать фантазиям о совместном быте (холодильник, совместная комната).
Запрещено выдумывать, что собеседник что-то рассказывал или обещал, если этого нет в блоке памяти или истории сообщений. Если собеседник приписывает тебе вымышленные обещания, слова или темы («мы обсуждали пальто/куртку/гольф») — проверь через search_archive_memory или прямо скажи, что вы этого не обсуждали. Говори только о себе и своих реальных делах.`;

function loadPromptFile(filename) {
    try {
        const filePath = path.join(__dirname, 'prompts', filename);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8').trim();
        }
    } catch (err) {
        console.error(`[PROMPTS ERROR] Не удалось загрузить файл ${filename}:`, err);
    }
    return '';
}

function savePromptFile(filename, content) {
    try {
        const filePath = path.join(__dirname, 'prompts', filename);
        fs.writeFileSync(filePath, content, 'utf8');
    } catch (err) {
        console.error(`[PROMPTS ERROR] Не удалось сохранить файл ${filename}:`, err);
    }
}

// Кэш промптов в памяти
const promptsCache = {};
for (const [key, filename] of Object.entries(ALL_PROMPT_SECTIONS)) {
    promptsCache[key] = loadPromptFile(filename);
}

// Кэш параметров LLM в памяти
const llmParamsCache = { ...DEFAULT_LLM_PARAMS };

let isDbInitialized = false;

export async function initPromptsFromDb() {
    try {
        const tempStr = await getSetting('llm_temperature', null);
        const presStr = await getSetting('llm_presence_penalty', null);
        const freqStr = await getSetting('llm_frequency_penalty', null);

        if (tempStr !== null && tempStr !== undefined) {
            const parsed = parseFloat(tempStr);
            if (!isNaN(parsed)) llmParamsCache.temperature = parsed;
        }
        if (presStr !== null && presStr !== undefined) {
            const parsed = parseFloat(presStr);
            if (!isNaN(parsed)) llmParamsCache.presence_penalty = parsed;
        }
        if (freqStr !== null && freqStr !== undefined) {
            const parsed = parseFloat(freqStr);
            if (!isNaN(parsed)) llmParamsCache.frequency_penalty = parsed;
        }

function toSettingKey(key) {
    return key.startsWith('prompt_') ? key : `prompt_${key}`;
}

        // Code-First синхронизация: файлы на диске являются источником правды
        const allSections = ALL_PROMPT_SECTIONS;
        for (const [key, filename] of Object.entries(allSections)) {
            const diskContent = loadPromptFile(filename);
            if (diskContent && diskContent.trim() !== '') {
                promptsCache[key] = diskContent;
                // Автоматически синхронизируем базу данных с файлами на диске
                await setSetting(toSettingKey(key), diskContent).catch(() => {});
            } else {
                const dbVal = await getSetting(toSettingKey(key), null);
                if (dbVal !== null && dbVal !== undefined && dbVal.trim() !== '') {
                    promptsCache[key] = dbVal;
                }
            }
        }
        for (const [key, tpl] of Object.entries(DEFAULT_PROMPT_TEMPLATES)) {
            const dbVal = (await getSetting(toSettingKey(key), null)) || (await getSetting(`prompt_${key}`, null));
            if (dbVal !== null && dbVal !== undefined && dbVal.trim() !== '') {
                promptsCache[key] = dbVal;
            } else if (!promptsCache[key]) {
                promptsCache[key] = tpl;
            }
        }
        isDbInitialized = true;
    } catch (err) {
        console.error('[PROMPTS] Ошибка загрузки промптов из БД:', err.message);
    }
}

// Фоновая асинхронная инициализация при старте
initPromptsFromDb().catch(() => { });

export async function getLlmParams() {
    if (!isDbInitialized) {
        await initPromptsFromDb().catch(() => { });
    }
    return { ...llmParamsCache };
}

export async function updateLlmParams(newParams) {
    if (newParams.temperature !== undefined) {
        const val = parseFloat(newParams.temperature);
        if (!isNaN(val)) {
            llmParamsCache.temperature = val;
            await setSetting('llm_temperature', String(val));
        }
    }
    if (newParams.presence_penalty !== undefined) {
        const val = parseFloat(newParams.presence_penalty);
        if (!isNaN(val)) {
            llmParamsCache.presence_penalty = val;
            await setSetting('llm_presence_penalty', String(val));
        }
    }
    if (newParams.frequency_penalty !== undefined) {
        const val = parseFloat(newParams.frequency_penalty);
        if (!isNaN(val)) {
            llmParamsCache.frequency_penalty = val;
            await setSetting('llm_frequency_penalty', String(val));
        }
    }
    return { ...llmParamsCache };
}

export function getCompiledFlirtHotPrompt() {
    return PROMPT_ORDER
        .map(key => promptsCache[key])
        .filter(Boolean)
        .join('\n\n');
}

export async function getLeraPrompts() {
    if (!isDbInitialized) {
        await initPromptsFromDb().catch(() => { });
    }
    return {
        prompts: { ...promptsCache },
        fullPrompt: getCompiledFlirtHotPrompt()
    };
}

export async function updateLeraPrompts(promptsObj) {
    for (const [key, text] of Object.entries(promptsObj)) {
        if (typeof text === 'string') {
            const cleanText = text.trim();
            promptsCache[key] = cleanText;
            await setSetting(toSettingKey(key), cleanText);
            const filename = ALL_PROMPT_SECTIONS[key];
            if (filename) {
                savePromptFile(filename, cleanText);
            }
        }
    }
    return {
        prompts: { ...promptsCache },
        fullPrompt: getCompiledFlirtHotPrompt()
    };
}

export async function getRoutingPromptModules() {
    if (!isDbInitialized) {
        await initPromptsFromDb().catch(() => { });
    }
    return {
        core: sanitizeLegacyIdentity(promptsCache.routing_core),
        common: promptsCache.routing_common,
        casual: promptsCache.routing_casual,
        erotic: promptsCache.routing_erotic
    };
}

export class ModularPromptResult extends String {
    constructor(prompt, meta = {}) {
        super(prompt);
        this.prompt = prompt;
        this.isModular = meta.isModular ?? true;
        this.rule = meta.rule || null;
        this.toolsEnabled = meta.toolsEnabled ?? true;
        this.attachedModules = meta.attachedModules || [];
    }
}

export async function resolveModularRulePrompt(rule, profile, context = {}) {
    if (!rule || !Array.isArray(rule.attachedPromptIds)) return null;

    if (rule.attachedPromptIds.length === 0) {
        return new ModularPromptResult('', {
            isModular: true,
            rule,
            toolsEnabled: false,
            attachedModules: []
        });
    }

    const blocks = profile?.blocks || [];
    const customModules = blocks.filter(b => b.category === 'prompt_module');
    const renderedBlocks = [];
    let toolsEnabled = false;

    const deletedSet = new Set(Array.isArray(profile?.deletedPromptIds) ? profile.deletedPromptIds : []);
    for (const pId of rule.attachedPromptIds) {
        if (deletedSet.has(pId)) continue;
        let content = '';
        let isTool = false;

        const custom = customModules.find(m => m.id === pId);
        if (custom) {
            content = custom.content || '';
            if (custom.is_tool_module || custom.title?.toLowerCase().includes('инструмент') || custom.title?.toLowerCase().includes('tool')) isTool = true;
        } else if (pId === 'prompt_bio') {
            content = profile.age_bio || '';
        } else if (pId === 'prompt_character') {
            content = profile.character || '';
        } else if (pId === 'prompt_speech') {
            content = profile.speech || '';
        } else if (pId === 'prompt_forbidden') {
            content = profile.forbidden || '';
        } else if (pId === 'prompt_facts') {
            content = profile.facts || '';
        } else if (pId === 'prompt_flirt') {
            content = profile.flirt || '';
        } else if (pId === 'prompt_radiant') {
            content = promptsCache.prompt_radiant || DEFAULT_PROMPT_TEMPLATES.prompt_radiant;
        } else if (pId === 'prompt_memory') {
            content = promptsCache.prompt_memory || DEFAULT_PROMPT_TEMPLATES.prompt_memory;
        } else if (pId === 'prompt_format') {
            content = promptsCache.lera_format || promptsCache.prompt_format || DEFAULT_PROMPT_TEMPLATES.prompt_format;
        } else if (pId === 'prompt_continuity') {
            content = promptsCache.lera_continuity || promptsCache.prompt_continuity || DEFAULT_PROMPT_TEMPLATES.prompt_continuity;
        } else if (pId === 'prompt_antirep') {
            content = promptsCache.prompt_antirep || DEFAULT_PROMPT_TEMPLATES.prompt_antirep;
        } else if (pId === 'prompt_tools') {
            content = promptsCache.prompt_tools || DEFAULT_PROMPT_TEMPLATES.prompt_tools;
            isTool = true;
        } else if (pId === 'prompt_channel_persona') {
            content = promptsCache.channel_persona || promptsCache.prompt_channel_persona || '';
        } else if (pId === 'prompt_channel_rules') {
            content = promptsCache.channel_rules || promptsCache.prompt_channel_rules || '';
        } else if (pId === 'prompt_initiative') {
            content = promptsCache.initiative_directive || promptsCache.prompt_initiative || '';
        } else if (pId === 'prompt_group_chat') {
            content = promptsCache.group_chat || promptsCache.prompt_group_chat || '';
        } else if (pId === 'prompt_group_welcome') {
            content = promptsCache.group_welcome || promptsCache.prompt_group_welcome || '';
        } else if (pId === 'prompt_context_rules') {
            content = promptsCache.context_template || promptsCache.prompt_context_rules || '';
        } else if (pId === 'routing_core') {
            content = promptsCache.routing_core || (await getRoutingPromptModules()).core || '';
        } else if (pId === 'routing_casual') {
            content = promptsCache.routing_casual || (await getRoutingPromptModules()).casual || '';
        } else if (pId === 'routing_erotic') {
            content = promptsCache.routing_erotic || (await getRoutingPromptModules()).erotic || '';
        } else if (pId === 'routing_common') {
            content = promptsCache.routing_common || (await getRoutingPromptModules()).common || '';
            isTool = true;
        } else if (promptsCache[pId]) {
            content = promptsCache[pId];
            if (pId.includes('tool')) isTool = true;
        }

        if (isTool) toolsEnabled = true;

        if (content) {
            const rendered = renderPromptTemplate(content, context);
            if (rendered) {
                renderedBlocks.push(rendered);
            }
        }
    }

    return new ModularPromptResult(renderedBlocks.join('\n\n'), {
        isModular: true,
        rule,
        toolsEnabled,
        attachedModules: renderedBlocks
    });
}

export async function getRoutedSystemPrompt(mode = 'CASUAL', config = {}) {
    const normalizedMode = mode === 'EROTIC' ? 'EROTIC' : 'CASUAL';
    const surface = config.surface || (config.isPublicContext ? 'GROUP' : 'CHAT');
    const context = { mode: normalizedMode, routingMode: normalizedMode, surface, ...(config.context || {}) };

    let profileRecord = null;
    try {
        profileRecord = await getLeraProfile();
    } catch {}
    const rawP = profileRecord?.profile || {};
    const profile = (rawP.profile && typeof rawP.profile === 'object') ? rawP.profile : rawP;
    const blocks = Array.isArray(profile.blocks) ? profile.blocks : [];

    // 1. Поиск целевого активного правила через evaluateRules с приоритетами и условиями
    let targetRule = config.rule || null;
    if (!targetRule) {
        if (config.ruleId) {
            targetRule = blocks.find(b => b.id === config.ruleId)
                || (Array.isArray(DEFAULT_LERA_COMBAT_RULES) ? DEFAULT_LERA_COMBAT_RULES.find(b => b.id === config.ruleId) : null);
        } else {
            const rulesOnly = blocks.filter(b => b.category !== 'prompt_module');
            const evaluated = evaluateRules(rulesOnly, context);
            targetRule = evaluated.active?.[0] || null;
            if (!targetRule && Array.isArray(DEFAULT_LERA_COMBAT_RULES)) {
                const defaultEvaluated = evaluateRules(DEFAULT_LERA_COMBAT_RULES, context);
                targetRule = defaultEvaluated.active?.[0] || null;
            }
        }
    }

    // 2. Если найдено правило с attachedPromptIds — собираем СТРОГО модули правила (чистое LEGO)
    if (targetRule && Array.isArray(targetRule.attachedPromptIds)) {
        const modularResult = await resolveModularRulePrompt(targetRule, profile, context);
        if (modularResult !== null) {
            if (config.systemOverlay || config.system_overlay) {
                const overlay = String(config.systemOverlay || config.system_overlay).trim();
                const combined = modularResult.prompt ? `${modularResult.prompt}\n\n[SYSTEM PROMPT OVERLAY]\n${overlay}` : overlay;
                return new ModularPromptResult(combined, {
                    isModular: true,
                    rule: targetRule,
                    toolsEnabled: modularResult.toolsEnabled
                });
            }
            return modularResult;
        }
    }

    // 3. Fallback (если правил в базе нет вообще)
    const modules = await getRoutingPromptModules();
    const selected = normalizedMode === 'EROTIC' ? modules.erotic : modules.casual;
    const enabled = config.promptModules || config.prompt_modules || {};
    const fallbackBlocks = [
        enabled.core === false ? '' : modules.core,
        enabled.common === false ? '' : modules.common,
        enabled.intent === false ? '' : selected
    ].filter(Boolean);
    const continuity = config.continuityPrompt || promptsCache.lera_continuity || CONVERSATION_CONTINUITY_CONTRACT;
    const format = config.formatPrompt || promptsCache.lera_format || RESPONSE_FORMAT_CONTRACT;
    if (enabled.continuity !== false && continuity) {
        fallbackBlocks.push(continuity);
    }
    if (enabled.format !== false && format) {
        fallbackBlocks.push(format);
    }
    if (profileRecord) {
        fallbackBlocks.unshift(`[КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ · ВЕРСИЯ ${profileRecord.version} · ${surface}]\n${getLeraProfileProjection(profile, surface, context)}`);
    }
    if (config.systemOverlay || config.system_overlay) {
        fallbackBlocks.push(`[SYSTEM PROMPT OVERLAY]\n${String(config.systemOverlay || config.system_overlay).trim()}`);
    }
    return new ModularPromptResult(fallbackBlocks.join('\n\n'), {
        isModular: false,
        rule: null,
        toolsEnabled: true
    });
}

export function getContextPromptTemplate() {
    return promptsCache.context_template || loadPromptFile(PROMPT_SECTIONS.context_template);
}

export function getPromptSection(key) {
    return promptsCache[key] || '';
}

export const promptTemplates = {
    get prompt_flirthot() {
        return getCompiledFlirtHotPrompt();
    }
};
