export const pendingFollowupMap = new Map();

let followupQueueInstance = null;

export function setFollowupQueue(queue) {
    followupQueueInstance = queue;
}

export function getFollowupQueue() {
    return followupQueueInstance;
}

async function resolveQueue() {
    if (followupQueueInstance) return followupQueueInstance;
    try {
        const queueMod = await import('../queue.js');
        if (queueMod?.aiQueue) {
            followupQueueInstance = queueMod.aiQueue;
        }
    } catch {
        // ignore if queue.js cannot be loaded yet
    }
    return followupQueueInstance;
}

export async function enqueueFollowupPromise(userId, chatId, { delayMinutes = 15, topic = '', sendPhoto = false, anchorEventId = null } = {}) {
    const numericUserId = Number(userId);
    const numericChatId = Number(chatId || userId);
    if (!numericUserId) throw new Error('Не указан userId для отложенного обещания');

    const delayMs = Math.min(Math.max(parseInt(delayMinutes, 10) || 5, 1), 48 * 60) * 60 * 1000;
    const dueAt = Date.now() + delayMs;

    const pendingEntry = {
        topic,
        sendPhoto: Boolean(sendPhoto),
        dueAt,
        scheduledAt: Date.now(),
        anchorEventId: anchorEventId ? Number(anchorEventId) : null
    };

    const jobId = `followup-${numericUserId}`;
    const queue = await resolveQueue();

    if (queue) {
        try {
            const existingJob = await queue.getJob(jobId);
            if (existingJob) {
                await existingJob.remove().catch(() => {});
            }
        } catch {
            // ignore
        }

        try {
            await queue.add('followup-promise', {
                userId: numericUserId,
                chatId: numericChatId,
                topic,
                sendPhoto: Boolean(sendPhoto),
                scheduledAt: Date.now(),
                anchorEventId: anchorEventId ? Number(anchorEventId) : null
            }, {
                jobId,
                delay: delayMs,
                removeOnComplete: true,
                removeOnFail: true
            });
        } catch (qErr) {
            console.warn(`[FOLLOWUP QUEUE WARN] user ${numericUserId}: не удалось добавить в Redis (${qErr.message})`);
            pendingFollowupMap.delete(String(numericUserId));
            throw qErr;
        }
    }

    pendingFollowupMap.set(String(numericUserId), pendingEntry);

    console.log(`⏱️ [FOLLOWUP PROMISE ENQUEUED] user ${numericUserId}: тема "${topic}", возврат через ${delayMinutes} мин`);
}

export async function cancelFollowupPromise(userId) {
    const key = String(userId);
    pendingFollowupMap.delete(key);
    try {
        const queue = await resolveQueue();
        if (queue) {
            const job = await queue.getJob(`followup-${userId}`);
            if (job) await job.remove().catch(() => {});
        }
    } catch {}
}

export function getPendingFollowup(userId) {
    const key = String(userId);
    const entry = pendingFollowupMap.get(key);
    if (!entry) return null;
    if (Date.now() > entry.dueAt + 120000) {
        pendingFollowupMap.delete(key);
        return null;
    }
    return entry;
}
