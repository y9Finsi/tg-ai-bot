import test from 'node:test';
import assert from 'node:assert/strict';
import { actionRegistry, scheduleFollowupAction } from '../src/radiant/actions/index.js';
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

    // 4. Valid execution clamps delay_minutes (min: 3, max: 360)
    const testUserId = 999001;
    const resSuccess = await scheduleFollowupAction.execute(
        { delay_minutes: 2, topic: 'заварила кофе', send_photo: true },
        { userId: testUserId }
    );

    assert.equal(resSuccess.status, 'success');
    assert.equal(resSuccess.data.delay_minutes, 3, 'delay_minutes should be clamped to minimum 3');
    assert.equal(resSuccess.data.topic, 'заварила кофе');
    assert.equal(resSuccess.data.send_photo, true);

    // 5. getPendingFollowup should return the active promise
    const pending = getPendingFollowup(testUserId);
    assert.ok(pending, 'Pending followup should exist');
    assert.equal(pending.topic, 'заварила кофе');
    assert.equal(pending.sendPhoto, true);

    // 6. cancelFollowupPromise should clear it
    await cancelFollowupPromise(testUserId);
    const pendingAfterCancel = getPendingFollowup(testUserId);
    assert.equal(pendingAfterCancel, null, 'Pending followup should be cleared after cancel');
});
