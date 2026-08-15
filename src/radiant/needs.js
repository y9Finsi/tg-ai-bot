export const DEFAULT_NEEDS = { hunger: 20, fatigue: 10, boredom: 30, horny: 40, hygiene: 90, bladder: 0 };
export const DEFAULT_PHYSIOLOGY = { cycle_day: 3, arousal_level: 20, irritation: 0, refractory_period: false };

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const MODIFIER_MOOD = { WET_CLOTHES: -15, PMS_CRAMPS: -10, HANGOVER: -20 };

export function calculateMood(state = {}) {
    const needs = { ...DEFAULT_NEEDS, ...(state.needs || {}) };
    const modifierEffect = (state.active_modifiers || []).reduce((sum, modifier) => sum + (MODIFIER_MOOD[modifier] || 0), 0);
    return clamp(50
        + (needs.hygiene - 50) * 0.20
        - needs.hunger * 0.25
        - needs.fatigue * 0.25
        - needs.boredom * 0.15
        - needs.bladder * 0.15
        + modifierEffect);
}

export function normalizePhysiology(physiology = {}) {
    return { ...DEFAULT_PHYSIOLOGY, ...physiology, cycle_day: Math.max(1, Math.min(28, Math.round(Number(physiology.cycle_day || 3)))) };
}

export function cycleDayFromDate(anchorDate, now = new Date()) {
    if (!anchorDate) return 3;
    let anchorTime;
    if (anchorDate instanceof Date) {
        anchorTime = anchorDate.getTime();
    } else {
        const str = String(anchorDate).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            anchorTime = new Date(`${str.slice(0, 10)}T00:00:00+03:00`).getTime();
        } else {
            anchorTime = new Date(str).getTime();
        }
    }
    if (!Number.isFinite(anchorTime)) return 3;
    const current = new Date(now).getTime();
    const elapsedDays = Math.floor((current - anchorTime) / 86400000);
    return ((elapsedDays % 28) + 28) % 28 + 1;
}

export function applyCycleLifecycle(physiology, activeModifiers = []) {
    const phys = normalizePhysiology(physiology);
    const modifiers = new Set(activeModifiers);
    if (phys.cycle_day <= 2) modifiers.add('PMS_CRAMPS');
    else modifiers.delete('PMS_CRAMPS');
    return { physiology: phys, activeModifiers: [...modifiers] };
}

export function calculatePassiveNeedDecay(needs, physiology, activeModifiers, elapsedMinutes = 5, { sleeping = false } = {}) {
    const ticks = elapsedMinutes / 5;
    const lifecycle = applyCycleLifecycle(physiology, activeModifiers);
    const updated = { ...DEFAULT_NEEDS, ...needs };
    // Routine meals are spaced across the day; the old rate reached the
    // emergency threshold between breakfast and lunch even on a normal day.
    updated.hunger = clamp(updated.hunger + (sleeping ? 0.2 : 0.75) * ticks);
    updated.fatigue = clamp(updated.fatigue + (sleeping ? 0 : (lifecycle.physiology.cycle_day <= 2 ? 1.5 : 1)) * ticks);
    updated.boredom = clamp(updated.boredom + (sleeping ? 0.25 : 1.2) * ticks);
    updated.bladder = clamp(updated.bladder + (sleeping ? 0.5 : 2) * ticks);
    updated.hygiene = clamp(updated.hygiene - (sleeping ? 0.25 : 1) * ticks);
    updated.horny = clamp(updated.horny + (sleeping ? 0.2 : (lifecycle.physiology.cycle_day >= 12 && lifecycle.physiology.cycle_day <= 14 ? 2 : 1)) * ticks);
    if (lifecycle.activeModifiers.includes('WET_CLOTHES')) updated.fatigue = clamp(updated.fatigue + 1.5 * ticks);
    if (lifecycle.activeModifiers.includes('PMS_CRAMPS')) updated.fatigue = clamp(updated.fatigue + 2 * ticks);
    delete updated.mood;
    return { needs: updated, physiology: lifecycle.physiology, activeModifiers: lifecycle.activeModifiers };
}

export function checkNeedInterrupts(needs) {
    const interrupts = [];
    if (needs.bladder >= 85) interrupts.push({ taskType: 'GO_TO_BATHROOM', targetLocation: 'petrogradka_home', durationMinutes: 5, priority: 100, createdBy: 'NEEDS_BLADDER', importance: 2 });
    if (needs.hunger >= 80) interrupts.push({ taskType: 'EMERGENCY_EAT', targetLocation: 'petrogradka_home', durationMinutes: 30, priority: 90, createdBy: 'NEEDS_HUNGER', importance: 2 });
    if (needs.fatigue >= 90) interrupts.push({ taskType: 'SLEEP_EXHAUSTED', targetLocation: 'petrogradka_home', durationMinutes: 120, priority: 85, createdBy: 'NEEDS_FATIGUE', importance: 2 });
    return interrupts;
}

export function applyCompletedTaskEffects(needs, taskType, context = {}) {
    const updated = { ...DEFAULT_NEEDS, ...needs };
    const type = String(taskType || '');
    if (/EAT/.test(type) && !/BUY/.test(type) && context.foodAvailable !== false) updated.hunger = clamp(updated.hunger - Number(context.foodProperties?.hunger_restore ?? 55));
    if (/SLEEP/.test(type)) updated.fatigue = clamp(updated.fatigue - 70);
    if (/HYGIENE|SHOWER/.test(type)) updated.hygiene = 100;
    if (/BATHROOM/.test(type)) updated.bladder = 0;
    if (/LEISURE|REST|WALK/.test(type)) updated.boredom = clamp(updated.boredom - 35);
    if (/SOCIAL|BAR|NASTYA/.test(type)) { updated.boredom = clamp(updated.boredom - 45); updated.fatigue = clamp(updated.fatigue + 8); }
    if (/WORK|SMM|EDITS/.test(type)) { updated.boredom = clamp(updated.boredom + 8); updated.fatigue = clamp(updated.fatigue + 12); }
    delete updated.mood;
    return updated;
}
