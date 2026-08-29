import {
    getInitiativeSchedulerUsers,
    getActiveDialogueEvents,
    getInitiativeDailyCounts,
    getContentCandidates,
    getCompletedEvent,
    getActiveMute,
    updateConversationEventMetadata,
    getInitiativeStages,
    toLocalDateString
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
    const latestDate = toLocalDateString(latestEvent?.local_date);
    return Boolean(latestDate && latestDate < today);
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

export function chooseInitiativeKind({
    ageSeconds,
    state,
    latestEvent,
    counts,
    stageKinds = [],
    newMoscowDay = false,
    initiativeLimit = INITIATIVE_LIMIT,
    isColdStart = false
}) {
    const initiativesAvailable = counts.initiatives < initiativeLimit;
    if (!initiativesAvailable) return null;

    if (isColdStart) {
        if (stageKinds.includes('cold_start')) return null;
        return 'cold_start';
    }

    // Если 4-дневный пинг уже был отправлен — больше не пишем пока юзер сам не напишет
    if (stageKinds.includes('ignore_4d')) {
        return null;
    }

    // Если было отправлено напоминание ignore_1 (или open):
    // Включается блокировка инициатив на 4 дня (345600 сек)
    if (stageKinds.includes('ignore_1') || stageKinds.includes('open')) {
        // Если прошло 4+ дня (345600 сек) с момента игнора — отправляем дерзкий пинг ignore_4d
        if (ageSeconds >= 345600 && !stageKinds.includes('ignore_4d')) {
            return 'ignore_4d';
        }
        // В противном случае блокировка на 4 дня (не шлем new_day, не шлем спам)
        return null;
    }

    // Шаг 1: Новый день — если сегодня ещё не здоровались и юзер не в блоке 4 дней
    if (newMoscowDay && !stageKinds.includes('new_day')) {
        return 'new_day';
    }

    // Шаг 2: Напоминание через 15 минут (900 сек), если юзер проигнорил реплику Леры или утренний new_day
    if ((state === 'IGNORED' || stageKinds.includes('new_day')) && !stageKinds.includes('ignore_1')) {
        if (ageSeconds >= 900 && ageSeconds <= 7200) {
            return 'ignore_1';
        }
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
            const newMoscowDay = isNewMoscowDay(latest);
            const latestMeta = eventMetadata(latest);
            if (!newMoscowDay && latestMeta.kind === 'cold_start') continue;
            const clock = getMoscowClock();
            const hourMsk = Number(clock.hour);
            const isColdStart = !latest.id || !latest.occurred_at;

            if (isColdStart) {
                // Разрешаем первое касание в дневное время с 11:00 до 21:00 МСК
                if (hourMsk < 11 || hourMsk >= 21) continue;
                // Не раньше 5 минут после регистрации / очистки диалога
                if (Number(latest.age_seconds || 0) < 300) continue;

                const counts = await getInitiativeDailyCounts(latest.user_id);
                const initiativeLimit = getEffectiveInitiativeLimit(latest, routingSettings);
                const stageKinds = await getInitiativeStages(latest.user_id, 0);

                const kind = chooseInitiativeKind({
                    ageSeconds: Number(latest.age_seconds || 0),
                    state: 'CLOSED',
                    latestEvent: null,
                    counts,
                    dialogueHasContent: false,
                    contentAvailable: false,
                    stageKinds,
                    newMoscowDay: false,
                    initiativeLimit,
                    isColdStart: true
                });
                if (!kind) continue;

                await queue.add('initiative', {
                    userId: Number(latest.user_id),
                    chatId: Number(latest.user_id),
                    anchorEventId: 0,
                    initiativeKind: 'cold_start',
                    contentCandidateIds: []
                }, {
                    jobId: `initiative-${latest.user_id}-0-cold_start`,
                    attempts: 3
                });
                continue;
            }

            if (newMoscowDay && Number(clock.hour) < NEW_DAY_START_HOUR_MSK) continue;
            const ignoredAnchorId = ['ignore_1', 'ignore_2', 'ignore_4d'].includes(latestMeta.kind)
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
            if (['content_4h', 'idle_4h'].includes(kind) && (hourMsk < 11 || hourMsk >= 21)) continue;
            const candidates = kind === 'content_4h'
                || (kind === 'open' && !dialogue.some(event => event.event_type === 'CONTENT') && counts.content < CONTENT_LIMIT)
                ? contentCandidates
                : [];
            const todayDate = `${clock.year}-${clock.month}-${clock.day}`;
            await queue.add('initiative', {
                userId: Number(latest.user_id),
                chatId: Number(latest.user_id),
                anchorEventId: Number(anchor.id),
                initiativeKind: kind,
                contentCandidateIds: candidates.map(item => Number(item.id))
            }, {
                jobId: newMoscowDay
                    ? `initiative-${latest.user_id}-${todayDate}-new_day`
                    : `initiative-${latest.user_id}-${anchor.id}-${kind}`,
                attempts: 3
            });
        } catch (error) {
            console.warn(`[INITIATIVE SCHEDULER] user ${latest.user_id}:`, error.message);
        }
    }
}

