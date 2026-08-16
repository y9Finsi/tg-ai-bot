import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting, setSetting, getLeraProfile, getLeraProfileProjection } from './db/database.js';
import { ALL_PROMPT_SECTIONS, PROMPT_SECTIONS, ROUTING_PROMPT_SECTIONS } from './prompt_sections.js';

export { ALL_PROMPT_SECTIONS, PROMPT_SECTIONS, ROUTING_PROMPT_SECTIONS };

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
    'lera_jokes',
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
for (const [key, filename] of Object.entries(PROMPT_SECTIONS)) {
    promptsCache[key] = loadPromptFile(filename);
}

for (const [key, filename] of Object.entries(ROUTING_PROMPT_SECTIONS)) {
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

        for (const [key, filename] of Object.entries(PROMPT_SECTIONS)) {
            const dbVal = await getSetting(`prompt_${key}`, null);
            if (dbVal !== null && dbVal !== undefined && dbVal.trim() !== '') {
                promptsCache[key] = dbVal;
            }
        }
        for (const [key] of Object.entries(ROUTING_PROMPT_SECTIONS)) {
            const dbVal = await getSetting(`prompt_${key}`, null);
            if (dbVal !== null && dbVal !== undefined && dbVal.trim() !== '') {
                promptsCache[key] = dbVal;
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
        if (ALL_PROMPT_SECTIONS[key] !== undefined && typeof text === 'string') {
            const cleanText = text.trim();
            promptsCache[key] = cleanText;
            await setSetting(`prompt_${key}`, cleanText);
            const filename = ALL_PROMPT_SECTIONS[key];
            savePromptFile(filename, cleanText);
        }
    }
    return getLeraPrompts();
}

export async function getRoutingPromptModules() {
    if (!isDbInitialized) {
        await initPromptsFromDb().catch(() => { });
    }
    return {
        core: sanitizeLegacyIdentity(promptsCache.routing_core),
        common: promptsCache.routing_common,
        casual: promptsCache.routing_casual,
        erotic: promptsCache.routing_erotic,
        joke: promptsCache.routing_joke
    };
}

export async function getRoutedSystemPrompt(mode = 'CASUAL', config = {}) {
    const modules = await getRoutingPromptModules();
    const normalizedMode = ['CASUAL', 'EROTIC', 'JOKE'].includes(mode) ? mode : 'CASUAL';
    const selected = normalizedMode === 'EROTIC' ? modules.erotic : normalizedMode === 'JOKE' ? modules.joke : modules.casual;
    const enabled = config.promptModules || config.prompt_modules || {};
    const blocks = [
        enabled.core === false ? '' : modules.core,
        enabled.common === false ? '' : modules.common,
        enabled.intent === false ? '' : selected
    ].filter(Boolean);
    blocks.push(CONVERSATION_CONTINUITY_CONTRACT);
    blocks.push(RESPONSE_FORMAT_CONTRACT);
    try {
        const profile = await getLeraProfile();
        blocks.unshift(`[КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ · ВЕРСИЯ ${profile.version}]\n${getLeraProfileProjection(profile.profile, 'CHAT')}`);
    } catch {
        // Runtime keeps the file-based prompt fallback if DB profile is unavailable.
    }
    if (config.systemOverlay || config.system_overlay) {
        blocks.push(`[SYSTEM PROMPT OVERLAY]\n${String(config.systemOverlay || config.system_overlay).trim()}`);
    }
    return blocks.join('\n\n');
}

export function getContextPromptTemplate() {
    return promptsCache.context_template || loadPromptFile(PROMPT_SECTIONS.context_template);
}

export const promptTemplates = {
    get prompt_flirthot() {
        return getCompiledFlirtHotPrompt();
    }
};
