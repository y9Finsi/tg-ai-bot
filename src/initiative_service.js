import {
    getInitiativeSchedulerUsers,
    getActiveDialogueEvents,
    getInitiativeDailyCounts,
    getContentCandidates,
    getCompletedEvent,
    getActiveMute,
    updateConversationEventMetadata,
    getInitiativeStages
} from './database.js';
import { classifyInitiativeState, getRoutingSettings } from './ai/intent_router.js';

export const INITIATIVE_LIMIT = 3;
export const CONTENT_LIMIT = 3;
const NEW_DAY_START_HOUR_MSK = 9;

function getMoscowClock(now = new Date()) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function isNewMoscowDay(latestEvent, now = new Date()) {
    const clock = getMoscowClock(now);
    const today = `${clock.year}-${clock.month}-${clock.day}`;
    return String(latestEvent?.local_date || '') < today;
}

export function getEffectiveInitiativeLimit(user, settings = {}) {
    const rawPersonalLimit = user?.initiative_limit;
    const personalLimit = Number(rawPersonalLimit);
    if (rawPersonalLimit !== null && rawPersonalLimit !== undefined && rawPersonalLimit !== ''
        && Number.isInteger(personalLimit) && personalLimit >= 0) {
        return Math.min(personalLimit, 20);
    }
    const globalLimit = Number(settings.initiativeLimit);
    return Number.isInteger(globalLimit) && globalLimit >= 0
        ? Math.min(globalLimit, 20)
        : INITIATIVE_LIMIT;
}

export function chooseInitiativeKind({ ageSeconds, state, latestEvent, counts, dialogueHasContent, contentAvailable, stageKinds = [], newMoscowDay = false, initiativeLimit = INITIATIVE_LIMIT }) {
    const initiativesAvailable = counts.initiatives < initiativeLimit;
    if (!initiativesAvailable) return null;
    if (newMoscowDay) return 'new_day';
    if (state === 'IGNORED') {
        if (ageSeconds >= 10800) return null;
        if (ageSeconds >= 7200 && !stageKinds.includes('ignore_2')) return 'ignore_2';
        if (ageSeconds >= 300 && ageSeconds <= 3600 && !stageKinds.includes('ignore_1')) return 'ignore_1';
        return null;
    }
    if (state === 'OPEN' && ageSeconds >= 300 && ageSeconds <= 3600 && !stageKinds.includes('open')) {
        return 'open';
    }
    if (ageSeconds >= 14400
        && latestEvent?.event_type !== 'CONTENT'
        && counts.content < CONTENT_LIMIT
        && contentAvailable
        && !stageKinds.includes('content_4h')) {
        return 'content_4h';
    }
    return null;
}

function eventMetadata(event) {
    if (!event?.metadata) return {};
    if (typeof event.metadata === 'object') return event.metadata;
    try { return JSON.parse(event.metadata); } catch { return {}; }
}

async function resolveState(anchor, dialogue) {
    if (anchor.event_type === 'CONTENT') return 'CLOSED';
    const cached = eventMetadata(anchor).initiative_state;
    if (['IGNORED', 'OPEN', 'CLOSED'].includes(cached)) return cached;
    const history = dialogue
        .filter(event => event.content && ['MESSAGE', 'INITIATIVE'].includes(event.event_type))
        .map(event => ({ role: event.role, content: event.content }));
    const result = await classifyInitiativeState({ userId: anchor.user_id, history });
    const state = ['IGNORED', 'OPEN', 'CLOSED'].includes(result.state) ? result.state : 'CLOSED';
    await updateConversationEventMetadata(anchor.id, { initiative_state: state }).catch(() => null);
    return state;
}

export async function enqueuePersonalInitiatives(queue) {
    const latestEvents = await getInitiativeSchedulerUsers();
    const routingSettings = await getRoutingSettings();
    for (const latest of latestEvents) {
        try {
            if (latest.is_blocked || await getActiveMute(latest.user_id)) continue;
            const latestMeta = eventMetadata(latest);
            if (latestMeta.kind === 'new_day') continue;
            const clock = getMoscowClock();
            const newMoscowDay = isNewMoscowDay(latest);
            if (newMoscowDay && Number(clock.hour) < NEW_DAY_START_HOUR_MSK) continue;
            const ignoredAnchorId = ['ignore_1', 'ignore_2'].includes(latestMeta.kind)
                ? Number(latestMeta.anchor_event_id)
                : null;
            const anchor = ignoredAnchorId
                ? await getCompletedEvent(ignoredAnchorId, latest.user_id)
                : latest;
            if (!anchor) continue;
            const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(anchor.occurred_at).getTime()) / 1000));
            const dialogue = await getActiveDialogueEvents(latest.user_id, anchor.occurred_at);
            const counts = await getInitiativeDailyCounts(latest.user_id);
            const initiativeLimit = getEffectiveInitiativeLimit(latest, routingSettings);
            const state = newMoscowDay
                ? 'CLOSED'
                : anchor.role === 'user' ? 'CLOSED' : await resolveState(anchor, dialogue);
            const contentCandidates = !newMoscowDay && counts.content < CONTENT_LIMIT
                ? await getContentCandidates(latest.user_id, 'initiative', 4)
                : [];
            const stageKinds = await getInitiativeStages(latest.user_id, anchor.id);
            const kind = chooseInitiativeKind({
                ageSeconds,
                state,
                latestEvent: latest,
                counts,
                dialogueHasContent: dialogue.some(event => event.event_type === 'CONTENT'),
                contentAvailable: contentCandidates.length > 0,
                stageKinds,
                newMoscowDay,
                initiativeLimit
            });
            if (!kind) continue;
            const candidates = kind === 'content_4h'
                || (kind === 'open' && !dialogue.some(event => event.event_type === 'CONTENT') && counts.content < CONTENT_LIMIT)
                ? contentCandidates
                : [];
            await queue.add('initiative', {
                userId: Number(latest.user_id),
                chatId: Number(latest.user_id),
                anchorEventId: Number(anchor.id),
                initiativeKind: kind,
                contentCandidateIds: candidates.map(item => Number(item.id))
            }, {
                jobId: `initiative-${latest.user_id}-${anchor.id}-${kind}`,
                attempts: 3
            });
        } catch (error) {
            console.warn(`[INITIATIVE SCHEDULER] user ${latest.user_id}:`, error.message);
        }
    }
}
