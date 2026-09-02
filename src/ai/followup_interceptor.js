import { parseFollowupPromise } from './followup_promise.js';

export async function maybeScheduleFollowupPromise({
    text,
    userId,
    chatId = null,
    anchorEventId = null,
    isInitiative = false,
    isPublicContext = false,
    scheduleFollowupSucceeded = false,
    enqueue
} = {}) {
    if (isInitiative || isPublicContext || scheduleFollowupSucceeded) {
        return { scheduled: false, reason: 'guarded' };
    }

    const promise = parseFollowupPromise(text);
    if (!promise) {
        return { scheduled: false, reason: 'not_confident' };
    }

    try {
        await enqueue(userId, chatId || userId, {
            delayMinutes: promise.delayMinutes,
            topic: promise.topic,
            sendPhoto: promise.sendPhoto,
            anchorEventId
        });
        return { scheduled: true, promise };
    } catch (error) {
        console.warn(`[FOLLOWUP INTERCEPTOR ERROR] user ${userId}:`, error.message);
        return { scheduled: false, reason: 'enqueue_failed', error };
    }
}
