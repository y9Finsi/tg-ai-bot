export const FOOD_PRICE_RUBLES = 250;

export const TASK_DEFINITIONS = {
    IDLE_HOME_REST: { category: 'utility', durationMinutes: 30, priority: 5 },
    GO_TO_BATHROOM: { category: 'utility', durationMinutes: 5, priority: 100 },
    EMERGENCY_EAT: { category: 'interrupt', durationMinutes: 30, priority: 90 },
    SLEEP_EXHAUSTED: { category: 'interrupt', durationMinutes: 120, priority: 85 },
    SLEEP_NIGHT: { category: 'routine', durationMinutes: 510, priority: 70 },
    EAT_BREAKFAST: { category: 'routine', durationMinutes: 20, priority: 72 },
    EAT_LUNCH: { category: 'routine', durationMinutes: 25, priority: 72 },
    EAT_DINNER: { category: 'routine', durationMinutes: 25, priority: 72 },
    REST_HOME: { category: 'utility', durationMinutes: 60, priority: 45 },
    SHOWER_HOME: { category: 'utility', durationMinutes: 20, priority: 55 },
    LEISURE_HOME: { category: 'utility', durationMinutes: 45, priority: 35 },
    PRIVATE_RELIEF: { category: 'utility', durationMinutes: 25, priority: 35 },
    WORK_LAPTOP: { category: 'utility', durationMinutes: 60, priority: 40 },
    SOCIAL_NASTYA: { category: 'utility', durationMinutes: 90, priority: 40 },
    INVITE_BAR_NASTYA: { category: 'interrupt', durationMinutes: 120, priority: 80 },
    SMM_EDITS_REQUIRED: { category: 'interrupt', durationMinutes: 60, priority: 75 },
    EQUIP_OUTFIT: { category: 'dependency', durationMinutes: 5, priority: 98 },
    BUY_FOOD_STORE: { category: 'dependency', durationMinutes: 10, priority: 94 },
    EAT_FOOD_HOME: { category: 'dependency', durationMinutes: 20, priority: 90 },
    ASK_NASTYA_FOR_FOOD: { category: 'dependency', durationMinutes: 10, priority: 88 },
    DESPERATE_EAT_TAP_WATER: { category: 'dependency', durationMinutes: 15, priority: 86 },
    TRAVEL: { category: 'transit', durationMinutes: 15, priority: 92 }
    ,PREPARE_FOR_OUTING: { category: 'commitment', durationMinutes: 20, priority: 50 },
    PERSONAL_TASK: { category: 'commitment', durationMinutes: 30, priority: 40 }
};

export function taskDefinition(taskType) {
    return TASK_DEFINITIONS[taskType] || { category: 'custom', durationMinutes: 30, priority: 50 };
}

export function applyTaskEffects(needs, taskType, context = {}) {
    const next = { ...needs };
    switch (taskType) {
        case 'EAT_FOOD_HOME':
        case 'EAT_BREAKFAST':
        case 'EAT_LUNCH':
        case 'EAT_DINNER':
        case 'DESPERATE_EAT_TAP_WATER':
            next.hunger = Math.max(0, Number(next.hunger || 0) - Number(context.hungerRestore || 55));
            break;
        case 'SLEEP_EXHAUSTED':
        case 'SLEEP_NIGHT':
        case 'REST_HOME':
            next.fatigue = Math.max(0, Number(next.fatigue || 0) - (taskType === 'REST_HOME' ? 35 : 70));
            break;
        case 'SHOWER_HOME':
            next.hygiene = 100;
            break;
        case 'GO_TO_BATHROOM':
            next.bladder = 0;
            break;
        case 'LEISURE_HOME':
            next.boredom = Math.max(0, Number(next.boredom || 0) - 35);
            break;
        case 'PRIVATE_RELIEF':
            next.horny = Math.max(0, Number(next.horny || 0) - 55);
            next.fatigue = Math.min(100, Number(next.fatigue || 0) + 15);
            break;
        case 'SOCIAL_NASTYA':
        case 'INVITE_BAR_NASTYA':
            next.boredom = Math.max(0, Number(next.boredom || 0) - 45);
            next.fatigue = Math.min(100, Number(next.fatigue || 0) + 8);
            break;
        case 'WORK_LAPTOP':
        case 'SMM_EDITS_REQUIRED':
            next.boredom = Math.min(100, Number(next.boredom || 0) + 8);
            next.fatigue = Math.min(100, Number(next.fatigue || 0) + 12);
            break;
        default:
            break;
    }
    delete next.mood;
    return next;
}
