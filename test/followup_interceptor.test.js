import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeScheduleFollowupPromise } from '../src/ai/followup_interceptor.js';
import { parseFollowupPromise } from '../src/ai/followup_promise.js';

const fixedNow = new Date('2026-09-02T12:00:00Z'); // 15:00 МСК

test('followup parser: recognizes relative and calendar promises', () => {
    assert.deepEqual(parseFollowupPromise('через 15 минут расскажу про работу', fixedNow), {
        delayMinutes: 15,
        timeType: 'relative',
        topic: 'про работу',
        sendPhoto: false
    });
    assert.deepEqual(parseFollowupPromise('вечером скину тебе фотку', fixedNow), {
        delayMinutes: 330,
        timeType: 'evening',
        topic: 'фотку',
        sendPhoto: true
    });
    assert.deepEqual(parseFollowupPromise('завтра напишу про поездку', fixedNow), {
        delayMinutes: 1170,
        timeType: 'tomorrow',
        topic: 'про поездку',
        sendPhoto: false
    });
});

test('followup parser: ignores vague promises and non-photo topics', () => {
    assert.equal(parseFollowupPromise('потом расскажу про работу', fixedNow), null);
    assert.equal(parseFollowupPromise('как-нибудь скину фотку', fixedNow), null);
    assert.equal(parseFollowupPromise('надо будет показать', fixedNow), null);
    assert.equal(parseFollowupPromise('через час напишу про', fixedNow), null);
    assert.equal(parseFollowupPromise('вечером скину тебе трек', fixedNow)?.sendPhoto, false);
});

test('followup interceptor: schedules only a confident private chat promise', async () => {
    const calls = [];
    const enqueue = async (...args) => calls.push(args);

    const result = await maybeScheduleFollowupPromise({
        text: 'вечером скину тебе фотку',
        userId: 42,
        chatId: 42,
        anchorEventId: 7,
        enqueue
    });

    assert.equal(result.scheduled, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 42);
    assert.equal(calls[0][1], 42);
    assert.equal(calls[0][2].sendPhoto, true);
});

test('followup interceptor: avoids duplicate after successful tool and skips public/initiative contexts', async () => {
    let calls = 0;
    const enqueue = async () => { calls += 1; };
    const promiseArgs = { text: 'через час напишу про кофе', userId: 42, enqueue };

    await maybeScheduleFollowupPromise({ ...promiseArgs, scheduleFollowupSucceeded: true });
    await maybeScheduleFollowupPromise({ ...promiseArgs, isPublicContext: true });
    await maybeScheduleFollowupPromise({ ...promiseArgs, isInitiative: true });

    assert.equal(calls, 0);
});

test('followup interceptor: falls back after a failed or missing tool call', async () => {
    let calls = 0;
    const enqueue = async () => { calls += 1; };

    await maybeScheduleFollowupPromise({
        text: 'через час напишу про кофе',
        userId: 42,
        enqueue,
        scheduleFollowupSucceeded: false
    });
    assert.equal(calls, 1);
});

test('followup interceptor: enqueue failure does not turn into a successful schedule', async () => {
    const result = await maybeScheduleFollowupPromise({
        text: 'через час напишу про кофе',
        userId: 42,
        enqueue: async () => { throw new Error('redis unavailable'); }
    });

    assert.equal(result.scheduled, false);
    assert.equal(result.reason, 'enqueue_failed');
});
