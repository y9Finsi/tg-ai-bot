import { TASK_DEFINITIONS } from './task_catalog.js';
import { personalityModifiers } from './personality.js';

const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

function hourMSK(now = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(now));
}

export class UtilitySelector {
    static candidates({ state = {}, npc = {}, now = new Date(), excludedTaskTypes = [], personality = {} } = {}) {
        const needs = state.needs || {};
        const hour = hourMSK(now);
        const isWorkWindow = hour >= 11 && hour <= 18;
        const maxUrgency = Number(npc.max_client?.state_json?.deadline_urgency || npc.max_client?.deadline_urgency || 0);
        const drama = Number(npc.nastya?.state_json?.drama_level || npc.nastya?.drama_level || 0);
        const candidates = [
            { taskType: 'GO_TO_BATHROOM', score: clamp(Number(needs.bladder) * 1.3), reason: 'bladder utility', threshold: 50 },
            { taskType: 'EMERGENCY_EAT', score: clamp(Number(needs.hunger) * 1.2), reason: 'food utility', threshold: 40 },
            { taskType: 'SLEEP_EXHAUSTED', score: clamp(Number(needs.fatigue) * 1.15 + (hour >= 23 || hour < 7 ? 20 : 0)), reason: 'sleep utility', threshold: 90 },
            { taskType: 'SHOWER_HOME', score: clamp(100 - Number(needs.hygiene)), reason: 'hygiene utility', threshold: 40 },
            { taskType: 'LEISURE_HOME', score: clamp(Number(needs.boredom) * 0.9), reason: 'leisure utility', threshold: 50 },
            { taskType: 'PRIVATE_RELIEF', score: clamp(Number(needs.horny) * 0.8), reason: 'private relief utility', threshold: 70 },
            { taskType: 'WORK_LAPTOP', score: clamp(maxUrgency * 0.8 + (isWorkWindow ? 20 : 0) + (Number(state.wallet_rubles) < 1000 ? 15 : 0)), reason: 'work utility', threshold: 45 },
            { taskType: 'SOCIAL_NASTYA', score: clamp(drama * 0.7 + (hour >= 18 && hour <= 22 ? 15 : 0)), reason: 'social utility', threshold: 50 },
            { taskType: 'IDLE_HOME_REST', score: 10, reason: 'idle fallback', threshold: 0 }
        ];
        const excluded = new Set(excludedTaskTypes);
        return candidates.map(candidate => ({ ...candidate, score: clamp(candidate.score + personalityModifiers({ personality, taskType: candidate.taskType, state, now })) }))
            .filter(candidate => !excluded.has(candidate.taskType))
            .filter(candidate => candidate.score >= candidate.threshold)
            .sort((a, b) => b.score - a.score || a.taskType.localeCompare(b.taskType));
    }

    static select(input = {}) {
        const [candidate] = this.candidates(input);
        if (!candidate) return { taskType: 'IDLE_HOME_REST', score: 10, reason: 'idle fallback' };
        const definition = TASK_DEFINITIONS[candidate.taskType] || TASK_DEFINITIONS.IDLE_HOME_REST;
        return { ...candidate, durationMinutes: definition.durationMinutes, priority: definition.priority };
    }
}
