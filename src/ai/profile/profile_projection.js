import { normalizeLeraProfile } from './profile_normalizer.js';
import { evaluateRules } from './rule_evaluator.js';
import { normalizeSurface, getSurfacePolicy } from './surface_policy.js';

export function buildProfileText(profile, surface) {
    const p = normalizeLeraProfile(profile); const mode = normalizeSurface(surface);
    const override = p.surfacePrompts?.[mode] || {};
    const character = override.character || p.character;
    const speech = override.speech || p.speech;
    const instructions = override.instructions ? [`Инструкции поверхности: ${override.instructions}`] : [];
    if (mode === 'CHANNEL') return [`Публичный образ: ${p.public_image}`, `Голос и речь: ${speech}`, `Допустимые темы и флирт: ${p.flirt}`, `Публичные ограничения: ${p.forbidden}`, `Правила фактов: ${p.facts}`, `Характер канала: ${character}`, ...instructions].join('\n');
    if (mode === 'COMMENTS') return [`Публичный образ в комментариях: ${p.public_image}`, `Голос и стиль общения: ${speech}`, `Вайб и подколы: ${p.flirt}`, `Границы публичности: ${p.forbidden}`, `Правила фактов: ${p.facts}`, `Характер комментариев: ${character}`, ...instructions].join('\n');
    if (mode === 'GROUP') return [`Канон и биография: ${p.age_bio}`, `Характер в группе: ${character}`, `Речь: ${speech}`, 'Публичная группа: без эротики и интима при всех.', `Ограничения: ${p.forbidden}`, `Правила фактов: ${p.facts}`, ...instructions].join('\n');
    if (mode === 'INITIATIVE') return [`Личность: ${p.age_bio}`, `Характер: ${character}`, `Голос и подача: ${speech}`, `Флирт и теплота: ${p.flirt}`, `Ограничения: ${p.forbidden}`, ...instructions].join('\n');
    return [`Канон и биография: ${p.age_bio}`, `Характер: ${character}`, `Речь: ${speech}`, `Флирт: ${p.flirt}`, `Ограничения: ${p.forbidden}`, `Правила фактов: ${p.facts}`, ...instructions].join('\n');
}

export function getLeraProfileProjectionDetails(profile, surface = 'CHAT', context = {}) {
    const normalized = normalizeLeraProfile(profile); const mode = normalizeSurface(surface);
    const evaluation = evaluateRules(normalized.blocks, { ...context, surface: mode });
    const text = `${buildProfileText(normalized, mode)}${evaluation.active.length ? `\n\nМодульные правила:\n${evaluation.active.map(rule => `- [${rule.title}]: ${rule.content}`).join('\n')}` : ''}`;
    return { text, surface: mode, activeRules: evaluation.active, skippedRules: evaluation.skipped, policy: getSurfacePolicy(mode), profile: normalized };
}
