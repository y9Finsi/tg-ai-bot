import { hasItemType, getEquippedClothes, hasRainResistantEquipment } from './inventory.js';
import { calculateTravelInfo, buildTransitRoute } from './world_map.js';
import { calculateMood } from './needs.js';
import { FOOD_PRICE_RUBLES } from './task_catalog.js';
import { buildCommitmentChain } from './commitment_planner.js';

export class GOAPPlanner {
    static resolveGoalDependencies({ goalTaskType, state, inventory, weather, allowAskNastya = true, commitment = null }) {
        const subtasks = [];
        const location = state.location_id || 'petrogradka_home';
        const rubles = Number(state.wallet_rubles || 0);
        const equipped = getEquippedClothes(inventory);
        const travel = (targetLocation, priority) => {
            if (location === targetLocation) return;
            const info = calculateTravelInfo(location, targetLocation, weather, equipped);
            subtasks.push({ taskType: 'TRAVEL', targetLocation, durationMinutes: info.durationMinutes, priority, transit: { fromLocation: location, toLocation: targetLocation, route: buildTransitRoute(location, targetLocation) } });
        };
        if (goalTaskType === 'COMMITMENT') {
            return buildCommitmentChain(commitment, { state, weather, inventory });
        }
        if (['EMERGENCY_EAT', 'EAT', 'EAT_BREAKFAST', 'EAT_LUNCH', 'EAT_DINNER'].includes(goalTaskType)) {
            if (hasItemType(inventory, 'food')) { travel('petrogradka_home', 95); subtasks.push({ taskType: 'EAT_FOOD_HOME', targetLocation: 'petrogradka_home', durationMinutes: 20, priority: 90 }); }
            else if (rubles >= FOOD_PRICE_RUBLES) {
                if (weather?.is_raining && !hasRainResistantEquipment(inventory)) subtasks.push({ taskType: 'EQUIP_OUTFIT', targetLocation: location, durationMinutes: 5, priority: 98 });
                travel('vkusvill_lenina', 95);
                subtasks.push({ taskType: 'BUY_FOOD_STORE', targetLocation: 'vkusvill_lenina', durationMinutes: 10, priority: 94 });
                subtasks.push({ taskType: 'TRAVEL', targetLocation: 'petrogradka_home', durationMinutes: 15, priority: 92, transit: { fromLocation: 'vkusvill_lenina', toLocation: 'petrogradka_home', route: buildTransitRoute('vkusvill_lenina', 'petrogradka_home') } });
                subtasks.push({ taskType: 'EAT_FOOD_HOME', targetLocation: 'petrogradka_home', durationMinutes: 20, priority: 90 });
            } else {
                travel('petrogradka_home', 92);
                if (allowAskNastya) {
                    subtasks.push({ taskType: 'ASK_NASTYA_FOR_FOOD', targetLocation: 'petrogradka_home', durationMinutes: 10, priority: 88 });
                    subtasks.push({ taskType: 'EAT_FOOD_HOME', targetLocation: 'petrogradka_home', durationMinutes: 20, priority: 86 });
                } else {
                    subtasks.push({ taskType: 'DESPERATE_EAT_TAP_WATER', targetLocation: 'petrogradka_home', durationMinutes: 15, priority: 86 });
                }
            }
        }
        return subtasks;
    }

    static calculateWillingness(state, relationshipScore = 80) {
        const needs = state.needs || {};
        return Math.max(0, Math.min(100, Math.round(Number(relationshipScore) - Number(needs.hunger || 0) - Number(needs.fatigue || 0) + calculateMood(state))));
    }

    static explainWillingness(state, relationshipScore = 80) {
        const needs = state.needs || {}; const mood = calculateMood(state); const value = this.calculateWillingness(state, relationshipScore);
        return { value, formula: `${relationshipScore} - Голод(${needs.hunger || 0}) - Усталость(${needs.fatigue || 0}) + Настроение(${mood}) = ${value}%`, inputs: { relationshipScore, hunger: needs.hunger || 0, fatigue: needs.fatigue || 0, mood } };
    }

    static buildVisualChain({ queue = [], activeTask = null } = {}) {
        const rootId = activeTask?.root_task_id || activeTask?.id || null;
        const chain = rootId
            ? queue.filter(task => task.id === rootId || task.root_task_id === rootId || task.id === activeTask?.id)
            : queue;
        return { source: 'LIVE_QUEUE', steps: chain.map((task, index) => ({ name: task.task_type, location: task.target_location, durationMinutes: task.duration_minutes, remainingMinutes: task.remaining_minutes, priority: task.priority, status: task.status, createdBy: task.created_by, parentTaskId: task.parent_task_id, rootTaskId: task.root_task_id, transitProgress: task.transit_progress_percent, active: task.id === activeTask?.id || (!activeTask && index === 0) })) };
    }
}
