/**
 * Autonomous Radiant AI for NPCs (Nastya & Max Client)
 */

export class NPCRadiantEngine {
    /**
     * Ticks background stats for NPCs (called by simulation_worker every 5 minutes).
     */
    static processNpcTicks(npcStates, elapsedMinutes = 5, tickAt = new Date()) {
        const ticks = elapsedMinutes / 5;
        const interrupts = [];

        // 1. Nastya (Friend - Drama & Bar invites)
        const nastyaState = npcStates.nastya?.state_json || { drama_level: 40, cooldown_until: null };
        nastyaState.drama_level = Math.min(100, (nastyaState.drama_level || 40) + (0.5 * ticks));

        const now = new Date(tickAt);
        const mskParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Moscow', hour: '2-digit', weekday: 'short', hour12: false
        }).formatToParts(now);
        const hour = Number(mskParts.find(part => part.type === 'hour')?.value) % 24;
        const weekday = mskParts.find(part => part.type === 'weekday')?.value;
        const isBarTimeWindow = hour >= 18 && hour <= 22;
        const isCooldownActive = nastyaState.cooldown_until && new Date(nastyaState.cooldown_until) > now;

        if (nastyaState.drama_level >= 85 && isBarTimeWindow && !isCooldownActive) {
            interrupts.push({
                taskType: 'INVITE_BAR_NASTYA',
                targetLocation: 'bar_rubinsteina',
                durationMinutes: 120,
                priority: 80,
                createdBy: 'NPC_NASTYA'
            });
            // 48 hour cooldown
            nastyaState.cooldown_until = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
            nastyaState.drama_level = 30;
        }

        // 2. Max (SMM Client - Deadline Urgency)
        const maxState = npcStates.max_client?.state_json || { deadline_urgency: 20, cooldown_until: null };
        const isWorkDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
        const isWorkHours = hour >= 11 && hour <= 18;

        if (isWorkDay && isWorkHours) {
            maxState.deadline_urgency = Math.min(100, (maxState.deadline_urgency || 20) + (1.0 * ticks));
        }

        const isMaxCooldown = maxState.cooldown_until && new Date(maxState.cooldown_until) > now;
        if (maxState.deadline_urgency >= 75 && !isMaxCooldown) {
            interrupts.push({
                taskType: 'SMM_EDITS_REQUIRED',
                targetLocation: 'petrogradka_home',
                durationMinutes: 60,
                priority: 75,
                createdBy: 'NPC_MAX_CLIENT'
            });
            // 24 hour cooldown
            maxState.cooldown_until = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
            maxState.deadline_urgency = 20;
        }

        return {
            tickAt: now,
            updatedNpcs: {
                nastya: nastyaState,
                max_client: maxState
            },
            interrupts,
            events: interrupts.map(interrupt => ({
                type: interrupt.taskType === 'INVITE_BAR_NASTYA' ? 'SOCIAL_MEETING_PROPOSED' : 'WORK_REQUEST_CREATED',
                npcId: interrupt.createdBy === 'NPC_NASTYA' ? 'nastya' : 'max_client',
                reason: interrupt.createdBy,
                occurredAt: now.toISOString(),
                payload: { taskType: interrupt.taskType, targetLocation: interrupt.targetLocation },
                plannedStart: new Date(now.getTime() + (interrupt.taskType === 'INVITE_BAR_NASTYA' ? 60 : 15) * 60000).toISOString(),
                dueAt: new Date(now.getTime() + (interrupt.taskType === 'INVITE_BAR_NASTYA' ? 120 : 360) * 60000).toISOString()
            })),
            rationale: interrupts.map(interrupt => ({ category: 'NPC_EVENT', title: interrupt.taskType, explanation: interrupt.createdBy }))
        };
    }
}
