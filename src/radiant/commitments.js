const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export const COMMITMENT_STATUS = Object.freeze({
    PLANNED: 'PLANNED', READY: 'READY', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED',
    MISSED: 'MISSED', CANCELLED: 'CANCELLED', RESCHEDULED: 'RESCHEDULED'
});

export function commitmentPriority(commitment, now = new Date()) {
    if (!commitment?.dueAt) return clamp(commitment?.priority || 0);
    const remaining = (new Date(commitment.dueAt).getTime() - new Date(now).getTime()) / 60000;
    const urgency = remaining <= 0 ? 45 : remaining <= 120 ? 35 : remaining <= 360 ? 22 : remaining <= 1440 ? 12 : 0;
    const travel = Number(commitment.travelMinutes || 0);
    const preparation = Number(commitment.preparationMinutes || 0);
    const feasibility = remaining <= travel + preparation + Number(commitment.durationMinutes || 0) ? 18 : 0;
    return clamp(Number(commitment.priority || 0) + urgency + feasibility);
}

export function normalizeCommitment(input = {}) {
    const commitment = {
        id: input.id || null,
        type: input.type || 'PERSONAL_TASK',
        title: String(input.title || input.type || 'Дело'),
        status: input.status || COMMITMENT_STATUS.PLANNED,
        priority: clamp(input.priority || 0),
        date: input.date || null,
        createdAt: input.createdAt || null,
        dueAt: input.dueAt || null,
        plannedStart: input.plannedStart || null,
        durationMinutes: Math.max(5, Number(input.durationMinutes || 30)),
        preparationMinutes: Math.max(0, Number(input.preparationMinutes || 0)),
        travelMinutes: Math.max(0, Number(input.travelMinutes || 0)),
        targetLocation: input.targetLocation || 'petrogradka_home',
        origin: input.origin || 'SYSTEM',
        interruptible: input.interruptible !== false,
        canBeRescheduled: input.canBeRescheduled !== false,
        consequenceOnMiss: input.consequenceOnMiss || null,
        metadata: input.metadata || {}
    };
    return { ...commitment, computedPriority: commitmentPriority(commitment) };
}

export function rankCommitments(commitments = [], now = new Date()) {
    return commitments.map(commitment => normalizeCommitment({ ...commitment, computedPriority: commitmentPriority(commitment, now) }))
        .filter(commitment => ![COMMITMENT_STATUS.COMPLETED, COMMITMENT_STATUS.CANCELLED, COMMITMENT_STATUS.MISSED].includes(commitment.status))
        .sort((a, b) => b.computedPriority - a.computedPriority || String(a.dueAt).localeCompare(String(b.dueAt)) || String(a.id).localeCompare(String(b.id)));
}

export function commitmentStatusAt(commitment, now = new Date()) {
    if ([COMMITMENT_STATUS.COMPLETED, COMMITMENT_STATUS.CANCELLED, COMMITMENT_STATUS.MISSED].includes(commitment.status)) return commitment.status;
    if (commitment.dueAt && new Date(now) > new Date(commitment.dueAt)) return COMMITMENT_STATUS.MISSED;
    return commitment.status || COMMITMENT_STATUS.PLANNED;
}

export function dailyCommitmentTemplates({ profile, date, maxUrgency = 0, dramaLevel = 0 } = {}) {
    const result = [];
    if (profile?.isWorkday && Number(maxUrgency) >= 20) {
        result.push({ type: 'WORK_DEADLINE', title: 'Рабочая задача для Макса', priority: 55, date, plannedStart: `${date}T10:00:00+03:00`, dueAt: `${date}T18:00:00+03:00`, durationMinutes: 120, preparationMinutes: 10, targetLocation: 'showroom_work', origin: 'NPC_MAX_CLIENT', consequenceOnMiss: 'MAX_DEADLINE_MISSED' });
    }
    if (profile?.dayType === 'FRIDAY' && Number(dramaLevel) >= 35) {
        result.push({ type: 'SOCIAL_MEETING', title: 'Вечерняя встреча с Настей', priority: 48, date, plannedStart: `${date}T19:00:00+03:00`, dueAt: `${date}T19:00:00+03:00`, durationMinutes: 90, preparationMinutes: 20, travelMinutes: 40, targetLocation: 'bar_rubinsteina', origin: 'NPC_NASTYA', consequenceOnMiss: 'NASTYA_DISAPPOINTED' });
    }
    return result.map(normalizeCommitment);
}

export function commitmentFromNpcEvent(event, { date } = {}) {
    if (!event) return null;
    const eventDate = date || String(event.occurredAt || '').slice(0, 10);
    const base = event.type === 'SOCIAL_MEETING_PROPOSED'
        ? { type: 'SOCIAL_MEETING', title: 'Встреча с Настей', priority: 60, durationMinutes: 90, preparationMinutes: 20, travelMinutes: 40, targetLocation: 'bar_rubinsteina', origin: 'NPC_NASTYA' }
        : event.type === 'WORK_REQUEST_CREATED'
            ? { type: 'WORK_DEADLINE', title: 'Рабочая задача для Макса', priority: 60, durationMinutes: 120, preparationMinutes: 10, targetLocation: 'showroom_work', origin: 'NPC_MAX_CLIENT' }
            : null;
    if (!base) return null;
    return normalizeCommitment({
        ...base,
        date: eventDate,
        plannedStart: event.plannedStart,
        dueAt: event.dueAt,
        metadata: { sourceEventId: event.sourceEventId || null, npcId: event.npcId }
    });
}
