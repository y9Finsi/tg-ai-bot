import { getSettingsByPrefix, setSetting } from '../db/database.js';

export const EMOTION_TYPES = [
    'ANGER', 'IRRITATION', 'SADNESS', 'SURPRISE', 'CURIOSITY', 'AMUSEMENT',
    'WARMTH', 'AFFECTION', 'DISAPPOINTMENT', 'CONFUSION', 'EMBARRASSMENT',
    'PRIDE', 'ANXIETY', 'BOREDOM'
];

export const DEFAULT_EMOTION_SETTINGS = Object.freeze({
    CHAT: { allowCaps: true, allowSwearing: true, maxIntensity: 200, prompt: 'Выражай эмоции живо, но не превращай каждую реплику в спектакль.' },
    CHANNEL: { allowCaps: false, allowSwearing: false, maxIntensity: 90, prompt: 'Для публичного канала выражай эмоции сдержанно и без прямых нападок на читателя.' },
    INITIATIVE: { allowCaps: true, allowSwearing: true, maxIntensity: 150, prompt: 'Инициатива может быть эмоциональной, но остаётся естественной и короткой.' },
    GROUP: { allowCaps: true, allowSwearing: false, maxIntensity: 120, prompt: 'В группе сохраняй эмоциональность, но не раскрывай личную напряжённость публично.' }
});

const EMOTION_LABELS = {
    ANGER: 'злость', IRRITATION: 'раздражение', SADNESS: 'грусть', SURPRISE: 'удивление',
    CURIOSITY: 'любопытство', AMUSEMENT: 'смешливость', WARMTH: 'теплота', AFFECTION: 'нежность',
    DISAPPOINTMENT: 'разочарование', CONFUSION: 'растерянность', EMBARRASSMENT: 'смущение',
    PRIDE: 'гордость', ANXIETY: 'тревога', BOREDOM: 'скука'
};

export async function getEmotionSettings() {
    const raw = await getSettingsByPrefix('emotion_surface_').catch(() => ({}));
    return Object.fromEntries(Object.entries(DEFAULT_EMOTION_SETTINGS).map(([surface, fallback]) => {
        let stored = {};
        try { stored = JSON.parse(raw['emotion_surface_' + surface] || '{}'); } catch { /* fallback */ }
        return [surface, { ...fallback, ...(stored && typeof stored === 'object' ? stored : {}) }];
    }));
}

export async function updateEmotionSettings(input = {}) {
    const current = await getEmotionSettings();
    const next = Object.fromEntries(Object.entries(DEFAULT_EMOTION_SETTINGS).map(([surface, fallback]) => [
        surface,
        {
            ...fallback,
            ...(current[surface] || {}),
            ...(input[surface] || {}),
            maxIntensity: Math.max(0, Math.min(200, Number(input[surface]?.maxIntensity ?? current[surface]?.maxIntensity ?? fallback.maxIntensity))),
            allowCaps: input[surface]?.allowCaps === undefined ? Boolean(current[surface]?.allowCaps ?? fallback.allowCaps) : Boolean(input[surface].allowCaps),
            allowSwearing: input[surface]?.allowSwearing === undefined ? Boolean(current[surface]?.allowSwearing ?? fallback.allowSwearing) : Boolean(input[surface].allowSwearing)
        }
    ]));
    await Promise.all(Object.entries(next).map(([surface, value]) => setSetting('emotion_surface_' + surface, JSON.stringify(value))));
    return next;
}

function intensityValue(answer, fallback = 0) {
    const value = answer?.score ?? answer?.value ?? answer?.choice ?? fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(200, parsed <= 4 ? parsed * 50 : parsed));
}

function score200(answer, fallback = 0) {
    const parsed = Number(answer?.score ?? answer?.value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(200, parsed <= 4 ? parsed * 50 : parsed));
}

export function normalizeEmotionProfile(raw = {}, { surface = 'CHAT', settings = DEFAULT_EMOTION_SETTINGS } = {}) {
    const surfaceSettings = settings[surface] || DEFAULT_EMOTION_SETTINGS.CHAT;
    const emotions = [];
    for (const key of ['emotion_1', 'emotion_2', 'emotion_3']) {
        const answer = raw[key] || {};
        const type = String(answer.choice || '').toUpperCase();
        if (!EMOTION_TYPES.includes(type)) continue;
        const intensity = Math.min(surfaceSettings.maxIntensity, intensityValue(raw[key + '_intensity'], intensityValue(answer, 0)));
        if (intensity >= 20 && !emotions.some(item => item.type === type)) emotions.push({ type, intensity });
    }
    emotions.sort((a, b) => b.intensity - a.intensity);
    const reason = String(raw.emotion_reason || raw.reason || '').trim().slice(0, 500);
    const triggers = Array.isArray(raw.emotion_triggers) ? raw.emotion_triggers.slice(0, 5) : [];
    const expression = {
        sarcasm: score200(raw.expression_sarcasm),
        warmth: score200(raw.expression_warmth),
        brevity: score200(raw.expression_brevity),
        assertiveness: score200(raw.expression_assertiveness),
        capsAllowed: Boolean(surfaceSettings.allowCaps && Number(raw.caps_allowed?.noul ?? 0) >= 0.65),
        swearingAllowed: Boolean(surfaceSettings.allowSwearing)
    };
    return { emotions, reason, triggers, expression, surface, expiresInMinutes: Math.max(5, Math.min(240, score200(raw.emotion_expiry, 60))) };
}

export function renderEmotionOverlay(profile) {
    if (!profile?.emotions?.length) return '';
    const labels = profile.emotions.map(item => (EMOTION_LABELS[item.type] || item.type) + ' ' + item.intensity + '/200').join(', ');
    const expression = profile.expression || {};
    return '[ТЕКУЩАЯ ЭМОЦИОНАЛЬНАЯ РЕАКЦИЯ ЛЕРЫ]\n' +
        'Эмоции: ' + labels + '.\n' +
        'Причина: ' + (profile.reason || 'реакция на текущий контекст') + '.\n' +
        (profile.triggers?.length ? 'Триггеры: ' + profile.triggers.join(', ') + '.\n' : '') +
        'Проявляй это через тон, длину и поведение, но не называй цифры и внутренние параметры. ' +
        'Сарказм: ' + expression.sarcasm + '/200; теплота: ' + expression.warmth + '/200; краткость: ' + expression.brevity + '/200; напористость: ' + expression.assertiveness + '/200. ' +
        (expression.capsAllowed ? 'Капс допустим только точечно. ' : 'Не используй капс. ') +
        (expression.swearingAllowed ? 'Мат допустим в характере и по ситуации.' : 'Не используй мат.');
}
