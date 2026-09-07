import { normalizeSurface, SURFACES } from './surface_policy.js';

export const PROFILE_SCHEMA_VERSION = 2;

const DEFAULTS = {
    age_bio: 'Лере 19 лет. Она из Санкт-Петербурга, учится на 2 курсе СПбГИК и подрабатывает в SMM, хорошо разбирается во frontend и программировании.',
    character: 'Живая, тёплая, немного рассеянная, иногда вредная и дерзкая. Наблюдательная, с самоиронией.',
    speech: 'Говорит естественно и коротко: ну, блин, короче, типа, слушай, хз, чето, ща, кароч, жиза, рофл, рил. Без канцелярита и графических эмодзи.',
    flirt: 'Лёгкий флирт допустим в личном общении и инициативе. В публичном канале — только мягкие общие намёки без адресата.',
    public_image: 'Публично выглядит как живая петербургская студентка: личные наблюдения, ирония, настроение и вопросы подписчикам.',
    forbidden: 'Не раскрывать личные переписки, память пользователей, relationship-контекст, координаты, технические идентификаторы, внутренние задачи, приватные детали внешности, квартиры и одежды.',
    facts: 'Не выдавать выдуманные конкретные события за факты. Если подтверждённого факта нет, использовать обобщённое настроение, наблюдение или вопрос.'
};

const KNOWN_FIELDS = new Set(['surface', 'time.hour', 'time.period', 'weather.condition', 'weather.temperature', 'radiant.location', 'radiant.activity', 'relationship.level', 'conversation.gapSeconds', 'initiative.kind', 'user.isKnown']);
const NUMERIC_FIELDS = new Set(['time.hour', 'weather.temperature', 'relationship.level', 'conversation.gapSeconds']);

function normalizeConditionValue(field, operator, value) {
    const values = operator === 'in' || operator === 'between' ? (Array.isArray(value) ? value : String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)) : value;
    const cast = item => {
        if (NUMERIC_FIELDS.has(field)) {
            const number = Number(item);
            return Number.isFinite(number) ? number : item;
        }
        if (field === 'user.isKnown') {
            if (item === true || item === false) return item;
            if (String(item).toLowerCase() === 'true') return true;
            if (String(item).toLowerCase() === 'false') return false;
        }
        return item;
    };
    return Array.isArray(values) ? values.map(cast) : cast(values);
}

function typedCondition(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const field = String(value.field || '').trim();
    const operator = String(value.operator || 'equals').trim();
    if (!KNOWN_FIELDS.has(field) || !['equals', 'in', 'gte', 'lte', 'between'].includes(operator)) return null;
    return { field, operator, value: normalizeConditionValue(field, operator, value.value) };
}

export function normalizeRule(rule = {}, index = 0) {
    const legacy = Array.isArray(rule.conditions) ? rule.conditions : [];
    const conditions = legacy.map(typedCondition).filter(Boolean);
    const tags = [...(Array.isArray(rule.tags) ? rule.tags.map(String) : []), ...legacy.filter(item => typeof item === 'string').map(s => s.trim()).filter(Boolean)];
    return {
        id: String(rule.id || `rule_${index + 1}`),
        title: String(rule.title || 'Правило').slice(0, 120),
        surface: String(rule.surface || 'CHAT').toUpperCase() === 'ALL' ? 'ALL' : normalizeSurface(rule.surface || 'CHAT'),
        surfaces: Array.isArray(rule.surfaces) && rule.surfaces.length ? rule.surfaces : [rule.surface || 'CHAT'],
        mode: rule.mode || 'ALL',
        enabled: rule.enabled !== false,
        priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
        conditions: conditions.slice(0, 12),
        tags: [...new Set(tags)].slice(0, 24),
        content: String(rule.content || '').slice(0, 6000),
        category: String(rule.category || 'context_rule'),
        source: String(rule.source || 'admin'),
        attachedPromptIds: Array.isArray(rule.attachedPromptIds) ? rule.attachedPromptIds : [],
        max_tokens: rule.max_tokens !== undefined ? Number(rule.max_tokens) : undefined,
        temperature: rule.temperature !== undefined ? Number(rule.temperature) : undefined,
        provider_id: rule.provider_id ? Number(rule.provider_id) : null,
        fallback_provider_ids: Array.isArray(rule.fallback_provider_ids) ? rule.fallback_provider_ids.map(Number).filter(Boolean) : [],
        style: rule.style || undefined,
        is_system: rule.is_system !== undefined ? Boolean(rule.is_system) : undefined,
        is_canonical: rule.is_canonical !== undefined ? Boolean(rule.is_canonical) : undefined
    };
}

export function normalizeLeraProfile(profile = {}) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const result = { schemaVersion: PROFILE_SCHEMA_VERSION };
    for (const [key, fallback] of Object.entries(DEFAULTS)) result[key] = String(source[key] ?? fallback).trim().slice(0, 12000);
    result.identity = { ageBio: source.identity?.ageBio ?? result.age_bio, status: source.identity?.status ?? '', publicImage: source.identity?.publicImage ?? result.public_image };
    result.personality = { character: source.personality?.character ?? result.character, temperament: source.personality?.temperament ?? '', initiative: source.personality?.initiative ?? '' };
    result.voice = { speech: source.voice?.speech ?? result.speech, slang: source.voice?.slang ?? '', formatting: source.voice?.formatting ?? '' };
    result.intimacy = { flirt: source.intimacy?.flirt ?? result.flirt, allowedModes: source.intimacy?.allowedModes ?? [] };
    result.guardrails = { forbidden: source.guardrails?.forbidden ?? result.forbidden, facts: source.guardrails?.facts ?? result.facts, privacy: source.guardrails?.privacy ?? '' };
    const surfacePrompts = source.surfacePrompts || source.surface_prompts || {};
    result.surfacePrompts = Object.fromEntries(SURFACES.map(surface => {
        const value = surfacePrompts?.[surface] || {};
        return [surface, {
            character: typeof value.character === 'string' ? value.character.trim().slice(0, 12000) : '',
            speech: typeof value.speech === 'string' ? value.speech.trim().slice(0, 12000) : '',
            instructions: typeof value.instructions === 'string' ? value.instructions.trim().slice(0, 12000) : ''
        }];
    }));
    result.blocks = Array.isArray(source.blocks) ? source.blocks.map(normalizeRule) : Array.isArray(source.modules) ? source.modules.map(normalizeRule) : [];
    result.modules = result.blocks;
    result.deletedPromptIds = Array.isArray(source.deletedPromptIds) ? source.deletedPromptIds.map(String) : [];
    result.promptOrder = Array.isArray(source.promptOrder) ? source.promptOrder.map(String) : [];
    return result;
}

export { DEFAULTS, KNOWN_FIELDS };
