export const DEFAULT_PERSONALITY = Object.freeze({
    discipline: 55,
    sociability: 55,
    procrastination: 35,
    homebody: 45,
    spontaneity: 30,
    rainSensitivity: 50
});

const clamp = value => Math.max(-25, Math.min(25, Number(value) || 0));

export function normalizePersonality(input = {}) {
    return Object.fromEntries(Object.entries({ ...DEFAULT_PERSONALITY, ...input }).map(([key, value]) => [key, Math.max(0, Math.min(100, Number(value) || 0))]));
}

export function personalityModifiers({ personality = DEFAULT_PERSONALITY, taskType, state = {}, now = new Date() } = {}) {
    const traits = normalizePersonality(personality);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(now));
    const modifiers = {
        WORK_LAPTOP: clamp((traits.discipline - 50) * 0.25 - (traits.procrastination - 50) * 0.2),
        SOCIAL_NASTYA: clamp((traits.sociability - 50) * 0.3),
        INVITE_BAR_NASTYA: clamp((traits.sociability - 50) * 0.3),
        LEISURE_HOME: clamp((traits.procrastination - 50) * 0.2 + (traits.homebody - 50) * 0.15),
        IDLE_HOME_REST: clamp((traits.homebody - 50) * 0.15),
        TRAVEL: clamp((50 - traits.homebody) * 0.1 - (traits.rainSensitivity - 50) * 0.1)
    };
    if (hour >= 23 || hour < 7) modifiers.WORK_LAPTOP = Math.min(modifiers.WORK_LAPTOP, -10);
    if (state.location_id !== 'petrogradka_home') modifiers.IDLE_HOME_REST = Math.min(modifiers.IDLE_HOME_REST, -5);
    return Number(modifiers[taskType] || 0);
}
