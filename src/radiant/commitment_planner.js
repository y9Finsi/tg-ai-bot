import { commitmentPriority, commitmentStatusAt, COMMITMENT_STATUS, normalizeCommitment } from './commitments.js';
import { calculateTravelInfo, buildTransitRoute } from './world_map.js';

export function buildCommitmentChain(commitment, { state = {}, weather = {}, inventory = [] } = {}) {
    const item = normalizeCommitment(commitment);
    const location = state.location_id || 'petrogradka_home';
    const target = item.targetLocation || 'petrogradka_home';
    const chain = [];
    if (item.preparationMinutes > 0) chain.push({ taskType: 'PREPARE_FOR_OUTING', targetLocation: location, durationMinutes: item.preparationMinutes, priority: item.computedPriority, result: { commitmentId: item.id } });
    if (location !== target) {
        const travel = calculateTravelInfo(location, target, weather, inventory.find(entry => entry.is_equipped && entry.item_type === 'clothes'));
        chain.push({ taskType: 'TRAVEL', targetLocation: target, durationMinutes: travel.durationMinutes, priority: item.computedPriority + 5, transit: { fromLocation: location, toLocation: target, route: buildTransitRoute(location, target) }, result: { commitmentId: item.id, arrivalDeadline: item.dueAt } });
    }
    const actionType = item.type === 'SOCIAL_MEETING' ? 'SOCIAL_NASTYA' : item.type === 'WORK_DEADLINE' ? 'WORK_LAPTOP' : 'PERSONAL_TASK';
    chain.push({ taskType: actionType, targetLocation: target, durationMinutes: item.durationMinutes, priority: item.computedPriority, result: { commitmentId: item.id } });
    if (target !== 'petrogradka_home') {
        const returnTravel = calculateTravelInfo(target, 'petrogradka_home', weather, inventory.find(entry => entry.is_equipped && entry.item_type === 'clothes'));
        chain.push({ taskType: 'TRAVEL', targetLocation: 'petrogradka_home', durationMinutes: returnTravel.durationMinutes, priority: Math.max(1, item.computedPriority - 5), transit: { fromLocation: target, toLocation: 'petrogradka_home', route: buildTransitRoute(target, 'petrogradka_home') }, result: { commitmentId: item.id, returnTrip: true } });
    }
    return chain;
}

export function commitmentReady(commitment, now = new Date()) {
    const normalized = normalizeCommitment(commitment);
    return commitmentStatusAt(normalized, now) !== COMMITMENT_STATUS.MISSED && new Date(now).getTime() >= new Date(normalized.plannedStart || normalized.createdAt || now).getTime();
}

export function markCommitmentForTick(commitment, now = new Date()) {
    const normalized = normalizeCommitment(commitment);
    const status = commitmentStatusAt(normalized, now);
    return { ...normalized, status, computedPriority: commitmentPriority(normalized, now) };
}
