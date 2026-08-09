import { UtilitySelector } from './utility_selector.js';
import { createHash } from 'node:crypto';

function moscowDate(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
}

export class ForecastService {
    static buildNodes({ state, weather, npc = {}, now = new Date() }) {
        const location = state.location_id || 'petrogradka_home';
        const candidates = UtilitySelector.candidates({ state, npc, now });
        const selected = candidates.slice(0, 4);
        const nodes = selected.map((candidate, index) => ({
            intentKey: `UTILITY_${index + 1}`,
            taskType: candidate.taskType,
            locationId: ['BUY_FOOD_STORE', 'WORK_LAPTOP', 'SOCIAL_NASTYA'].includes(candidate.taskType)
                ? (candidate.taskType === 'BUY_FOOD_STORE' ? 'vkusvill_lenina' : candidate.taskType === 'SOCIAL_NASTYA' ? 'bar_rubinsteina' : 'cafe_sloy')
                : location,
            plannedStart: new Date(now.getTime() + index * 60 * 60 * 1000),
            durationMinutes: 60,
            metadata: { score: candidate.score, reason: candidate.reason, weather_status: weather?.status || 'unavailable' }
        }));
        if (Number(state.needs?.hunger || 0) > 50 && !nodes.some(node => node.taskType === 'BUY_FOOD_STORE')) {
            nodes.push({
                intentKey: 'FOOD', taskType: 'BUY_FOOD_STORE', locationId: 'vkusvill_lenina',
                plannedStart: new Date(now.getTime() + nodes.length * 60 * 60 * 1000), durationMinutes: 40,
                metadata: { score: Number(state.needs.hunger) * 1.2, reason: 'food utility', weather_status: weather?.status || 'unavailable' }
            });
        }
        return nodes.length ? nodes : [{ intentKey: 'UTILITY_1', taskType: 'IDLE_HOME_REST', locationId: location, plannedStart: now, durationMinutes: 30 }];
    }

    static edgesFor(nodes) { return nodes.slice(1).map((_, index) => [index, index + 1, 'INTENT']); }
    static fingerprint(nodes = [], edges = []) {
        const stablePayload = JSON.stringify({
            nodes: nodes.map(node => ({
                intentKey: node.intentKey,
                taskType: node.taskType,
                locationId: node.locationId,
                durationMinutes: node.durationMinutes
            })),
            edges
        });
        return createHash('sha256').update(stablePayload).digest('hex');
    }
    static dateFor(now) { return moscowDate(now); }
}
