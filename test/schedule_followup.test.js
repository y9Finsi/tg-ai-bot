import test from 'node:test';
import assert from 'node:assert/strict';
import { actionRegistry, scheduleFollowupAction, scheduleReminderAction } from '../src/radiant/actions/index.js';
import { aiQueue, getPendingFollowup, cancelFollowupPromise } from '../src/queue.js';

test('schedule_followup: contract and schema verification', () => {
    assert.equal(scheduleFollowupAction.name, 'schedule_followup');
    assert.ok(scheduleFollowupAction.description.length > 10);
    assert.ok(scheduleFollowupAction.inputSchema.properties.delay_minutes);
    assert.ok(scheduleFollowupAction.inputSchema.properties.topic);
    assert.ok(scheduleFollowupAction.inputSchema.properties.send_photo);
    assert.deepEqual(scheduleFollowupAction.inputSchema.required, ['delay_minutes', 'topic']);

    const registered = actionRegistry.get('schedule_followup');
    assert.ok(registered, 'schedule_followup should be registered in actionRegistry');
});

test('schedule_reminder: contract and schema verification', () => {
    assert.equal(scheduleReminderAction.name, 'schedule_reminder');
    assert.ok(scheduleReminderAction.description.length > 10);
    assert.ok(scheduleReminderAction.inputSchema.properties.delay_seconds);
    assert.ok(scheduleReminderAction.inputSchema.properties.delay_minutes);
    assert.ok(scheduleReminderAction.inputSchema.properties.reminder_text);
    assert.deepEqual(scheduleReminderAction.inputSchema.required, ['reminder_text']);

    const registered = actionRegistry.get('schedule_reminder');
    assert.ok(registered, 'schedule_reminder should be registered in actionRegistry');
});

test('schedule_followup: validation and execution checks', async () => {
    // Mock queue methods to avoid live Redis connection wait in unit tests
    aiQueue.getJob = async () => null;
    aiQueue.add = async (name, data, opts) => ({ id: opts?.jobId || 'test-job', data });

    // 1. Missing userId
    const resNoUser = await scheduleFollowupAction.execute({ delay_minutes: 10, topic: 'тест' }, {});
    assert.equal(resNoUser.status, 'error');
    assert.equal(resNoUser.error.code, 'NO_USER');

    // 2. Public context for unknown/unstarted user returns PM_NOT_STARTED
    const resPublicUnstarted = await scheduleFollowupAction.execute(
        { delay_minutes: 10, topic: 'тест' },
        { userId: 888777999, isPublicContext: true }
    );
    assert.equal(resPublicUnstarted.status, 'error');
    assert.equal(resPublicUnstarted.error.code, 'PM_NOT_STARTED');

    // 3. Empty topic blocked
    const resEmptyTopic = await scheduleFollowupAction.execute(
        { delay_minutes: 10, topic: '' },
        { userId: 12345 }
    );
    assert.equal(resEmptyTopic.status, 'error');
    assert.equal(resEmptyTopic.error.code, 'EMPTY_TOPIC');

    // 4. Valid execution with small delay (min: 1)
    const testUserId = 999001;
    const resSuccess = await scheduleFollowupAction.execute(
        { delay_minutes: 1, topic: 'заварить кофе', send_photo: false },
        { userId: testUserId }
    );

    assert.equal(resSuccess.status, 'success');
    assert.equal(resSuccess.data.delay_minutes, 1);
    assert.equal(resSuccess.data.topic, 'заварить кофе');
    assert.equal(resSuccess.data.send_photo, false);

    // 5. getPendingFollowup should return the active promise
    const pending = getPendingFollowup(testUserId);
    assert.ok(pending, 'Pending followup should exist');
    assert.equal(pending.topic, 'заварить кофе');
    assert.equal(pending.sendPhoto, false);

    const resLongDelay = await scheduleFollowupAction.execute(
        { delay_minutes: 2880, topic: 'завтра показать результат', send_photo: false },
        { userId: testUserId }
    );
    assert.equal(resLongDelay.status, 'success');
    assert.equal(resLongDelay.data.delay_minutes, 2880);

    // 6. A new explicit promise replaces the old one for the same user.
    const replacedPending = getPendingFollowup(testUserId);
    assert.ok(replacedPending, 'Replacement followup should exist');
    assert.equal(replacedPending.topic, 'завтра показать результат');
    assert.ok(replacedPending.dueAt - replacedPending.scheduledAt <= 2880 * 60 * 1000);
    assert.ok(replacedPending.dueAt - replacedPending.scheduledAt >= 2880 * 60 * 1000 - 1000);

    // 7. cancelFollowupPromise should clear it
    await cancelFollowupPromise(testUserId);
    const pendingAfterCancel = getPendingFollowup(testUserId);
    assert.equal(pendingAfterCancel, null, 'Pending followup should be cleared after cancel');
});

test('schedule_reminder: validation and execution checks', async () => {
    aiQueue.getJob = async () => null;
    let addedJob = null;
    aiQueue.add = async (name, data, opts) => {
        addedJob = { name, data, opts };
        return { id: opts?.jobId || 'test-job', data };
    };

    // 1. Missing userId
    const resNoUser = await scheduleReminderAction.execute({ reminder_text: 'написать Маше' }, {});
    assert.equal(resNoUser.status, 'error');
    assert.equal(resNoUser.error.code, 'NO_USER');

    // 2. Empty reminder blocked
    const resEmpty = await scheduleReminderAction.execute({ reminder_text: '' }, { userId: 12345 });
    assert.equal(resEmpty.status, 'error');
    assert.equal(resEmpty.error.code, 'EMPTY_REMINDER');

    // 3. Second-based reminder (10 seconds)
    const resSeconds = await scheduleReminderAction.execute(
        { delay_seconds: 10, reminder_text: 'написать Маше писька' },
        { userId: 952039543 }
    );
    assert.equal(resSeconds.status, 'success');
    assert.equal(resSeconds.data.delay_seconds, 10);
    assert.equal(resSeconds.data.reminder_text, 'написать Маше писька');
    assert.equal(addedJob?.name, 'user-reminder');
    assert.equal(addedJob?.opts?.delay, 10000);

    // 4. Minute-based reminder (15 minutes)
    const resMinutes = await scheduleReminderAction.execute(
        { delay_minutes: 15, reminder_text: 'проверить духовку' },
        { userId: 952039543 }
    );
    assert.equal(resMinutes.status, 'success');
    assert.equal(resMinutes.data.delay_seconds, 900);
    assert.equal(addedJob?.opts?.delay, 900000);
});
