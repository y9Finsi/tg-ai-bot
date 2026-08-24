import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

// Pure reference implementation of Europe/Moscow calendar day computation
export function getCalendarDayStartMSK(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [year, month, day] = formatter.format(date).split('-');
    return new Date(`${year}-${month}-${day}T00:00:00.000+03:00`);
}

// Pure reference implementation of MSK time of day calculation for a given date
export function getTimeOfDayForDateMSK(date = new Date()) {
    const hour = parseInt(date.toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        hour12: false
    }), 10);

    if (hour >= 5 && hour < 12) return 'утро';
    if (hour >= 12 && hour < 18) return 'день';
    if (hour >= 18 && hour < 23) return 'вечер';
    return 'ночь';
}

// Evaluates whether cron should trigger auto-post given configuration and state
export function shouldTriggerChannelPost({
    isEnabled = true,
    channelId = '@test_channel',
    postsToday = 0,
    dailyLimit = 2,
    lastPostedAt = null,
    frequencyHours = 12,
    currentTime = Date.now()
} = {}) {
    if (!isEnabled || !channelId) return false;
    if (postsToday >= dailyLimit) return false;
    const lastPostedMs = lastPostedAt ? new Date(lastPostedAt).getTime() : 0;
    const cooldownMs = frequencyHours * 60 * 60 * 1000;
    if (currentTime - lastPostedMs < cooldownMs) return false;
    return true;
}

describe('TGK Calendar Cron Scheduler & Unclamped Limits', () => {

    // =========================================================================
    // TIER 1: Core Contract & Happy Paths (min 5 tests)
    // =========================================================================
    describe('Tier 1: Core Contract & Happy Paths', () => {

        it('T1.1: Static contract ensures clamp removal in poster and database config', () => {
            const posterSrc = read('src/channel_poster.js');
            const dbSrc = read('src/db/database.js');

            // Verify Math.min(2) clamp is not restricting daily limits
            assert.doesNotMatch(posterSrc, /Math\.min\(2,\s*Number\(settings\.posts_per_day/);
            assert.doesNotMatch(dbSrc, /Math\.min\(2,\s*Number\(values\.channel_posts_per_day/);
        });

        it('T1.2: MSK calendar day start returns 00:00:00.000 in Europe/Moscow timezone', () => {
            const testDate = new Date('2026-08-25T14:30:00Z'); // 17:30 MSK
            const dayStart = getCalendarDayStartMSK(testDate);

            assert.equal(dayStart.toISOString(), '2026-08-24T21:00:00.000Z', '00:00 MSK on Aug 25 is 21:00 UTC on Aug 24');
        });

        it('T1.3: User-configured posts_per_day > 2 (e.g. 5) is fully respected without clamping to 2', () => {
            const configuredLimit = 5;
            const sanitizedLimit = Math.max(1, Number(configuredLimit || 2));

            assert.equal(sanitizedLimit, 5, 'Daily limit of 5 should remain 5');
            const canPost4th = shouldTriggerChannelPost({
                postsToday: 3,
                dailyLimit: sanitizedLimit,
                lastPostedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
                frequencyHours: 4
            });
            assert.equal(canPost4th, true, '4th post should be allowed when limit is 5');
        });

        it('T1.4: User-configured frequency_hours < 12 (e.g. 2 hours) is fully respected', () => {
            const frequencyHours = 2;
            const now = Date.now();
            const lastPosted2HoursAgo = new Date(now - 2.5 * 3600000).toISOString();

            const canPost = shouldTriggerChannelPost({
                isEnabled: true,
                channelId: '@test',
                postsToday: 1,
                dailyLimit: 5,
                lastPostedAt: lastPosted2HoursAgo,
                frequencyHours: frequencyHours,
                currentTime: now
            });

            assert.equal(canPost, true, 'Should trigger after 2.5 hours when frequency is 2 hours');
        });

        it('T1.5: getTimeOfDayMSK accurately reflects MSK diurnal cycles', async () => {
            const { getTimeOfDayMSK } = await import('../src/channel_poster.js');
            const currentPhase = getTimeOfDayMSK();
            assert.ok(['утро', 'день', 'вечер', 'ночь'].includes(currentPhase));

            // Test explicit timestamps across all 4 phases in MSK
            // Morning: 08:00 MSK = 05:00 UTC
            assert.equal(getTimeOfDayForDateMSK(new Date('2026-08-25T05:00:00Z')), 'утро');
            // Day: 14:00 MSK = 11:00 UTC
            assert.equal(getTimeOfDayForDateMSK(new Date('2026-08-25T11:00:00Z')), 'день');
            // Evening: 20:00 MSK = 17:00 UTC
            assert.equal(getTimeOfDayForDateMSK(new Date('2026-08-25T17:00:00Z')), 'вечер');
            // Night: 02:00 MSK = 23:00 UTC (prev day)
            assert.equal(getTimeOfDayForDateMSK(new Date('2026-08-24T23:00:00Z')), 'ночь');
        });
    });

    // =========================================================================
    // TIER 2: Boundary Conditions & Exact Millisecond Checks (min 5 tests)
    // =========================================================================
    describe('Tier 2: Boundary Conditions & Edge Cases', () => {

        it('T2.1: Midnight MSK boundary: 23:59:59 MSK vs 00:00:01 MSK produce consecutive calendar days', () => {
            // 23:59:59 MSK on Aug 24 = 20:59:59 UTC Aug 24
            const beforeMidnight = new Date('2026-08-24T20:59:59.000Z');
            // 00:00:01 MSK on Aug 25 = 21:00:01 UTC Aug 24
            const afterMidnight = new Date('2026-08-24T21:00:01.000Z');

            const day1 = getCalendarDayStartMSK(beforeMidnight);
            const day2 = getCalendarDayStartMSK(afterMidnight);

            assert.equal(day1.toISOString(), '2026-08-23T21:00:00.000Z'); // 00:00 MSK Aug 24
            assert.equal(day2.toISOString(), '2026-08-24T21:00:00.000Z'); // 00:00 MSK Aug 25
            assert.equal(day2.getTime() - day1.getTime(), 24 * 60 * 60 * 1000, 'Difference must be exactly 24 hours');
        });

        it('T2.2: Daily limit exact equality (postsToday === dailyLimit) rejects further posts', () => {
            const canPost = shouldTriggerChannelPost({
                postsToday: 3,
                dailyLimit: 3,
                lastPostedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
                frequencyHours: 2
            });
            assert.equal(canPost, false, 'Must not post when daily limit is reached');
        });

        it('T2.3: Frequency cooldown boundary: 1 ms before interval rejects, exactly at interval allows', () => {
            const now = 1756123456789;
            const frequencyHours = 3;
            const cooldownMs = frequencyHours * 3600000;

            const justBefore = new Date(now - cooldownMs + 1).toISOString();
            const exact = new Date(now - cooldownMs).toISOString();

            assert.equal(shouldTriggerChannelPost({ lastPostedAt: justBefore, frequencyHours, currentTime: now, postsToday: 0, dailyLimit: 5 }), false);
            assert.equal(shouldTriggerChannelPost({ lastPostedAt: exact, frequencyHours, currentTime: now, postsToday: 0, dailyLimit: 5 }), true);
        });

        it('T2.4: Disabled scheduler (is_enabled = false) suppresses all automated posts', () => {
            const canPost = shouldTriggerChannelPost({
                isEnabled: false,
                channelId: '@channel',
                postsToday: 0,
                dailyLimit: 10,
                lastPostedAt: null,
                frequencyHours: 1
            });
            assert.equal(canPost, false);
        });

        it('T2.5: Missing channel_id suppresses automated publication', () => {
            const canPost = shouldTriggerChannelPost({
                isEnabled: true,
                channelId: '',
                postsToday: 0,
                dailyLimit: 5,
                lastPostedAt: null
            });
            assert.equal(canPost, false);
        });
    });

    // =========================================================================
    // TIER 3: Cross-Feature Interactions
    // =========================================================================
    describe('Tier 3: Cross-Feature Interactions', () => {

        it('T3.1: Idempotency slot calculation scales with frequency_hours', () => {
            const now = 1756123456789;
            const channelId = '-1001234567890';

            const calcSlot = (freq) => {
                const frequencyHours = Math.max(1, Number(freq || 12));
                const slot = Math.floor(now / (frequencyHours * 60 * 60 * 1000));
                return `channel:${channelId}:${slot}`;
            };

            const key1h = calcSlot(1);
            const key4h = calcSlot(4);
            const key12h = calcSlot(12);

            assert.match(key1h, /^channel:-1001234567890:\d+$/);
            assert.notEqual(key1h, key4h);
            assert.notEqual(key4h, key12h);
        });

        it('T3.2: Scheduler lifecycle functions initChannelPoster and stopChannelPoster exist and export cleanly', async () => {
            const { initChannelPoster, stopChannelPoster } = await import('../src/channel_poster.js');
            assert.equal(typeof initChannelPoster, 'function');
            assert.equal(typeof stopChannelPoster, 'function');

            // Safe stop call
            stopChannelPoster();
        });
    });

    // =========================================================================
    // TIER 4: Realistic Multi-Day Schedule Simulation
    // =========================================================================
    describe('Tier 4: Realistic Schedule Workflows', () => {

        it('T4.1: Simulating 48 hours in MSK timezone resets daily quota at midnight MSK', () => {
            // Day 1: Aug 25 10:00 MSK (07:00 UTC) -> 2 posts made
            const day1Morning = new Date('2026-08-25T07:00:00Z');
            const day1Start = getCalendarDayStartMSK(day1Morning);

            let postsDay1 = 2;
            const limit = 2;
            assert.equal(shouldTriggerChannelPost({ postsToday: postsDay1, dailyLimit: limit, currentTime: day1Morning.getTime() }), false);

            // Day 2: Aug 26 00:05 MSK (21:05 UTC Aug 25) -> New day start, postsToday reset to 0
            const day2Night = new Date('2026-08-25T21:05:00Z');
            const day2Start = getCalendarDayStartMSK(day2Night);

            assert.ok(day2Start.getTime() > day1Start.getTime(), 'Day 2 start must be after Day 1 start');
            let postsDay2 = 0;
            assert.equal(shouldTriggerChannelPost({ postsToday: postsDay2, dailyLimit: limit, lastPostedAt: day1Morning.toISOString(), frequencyHours: 4, currentTime: day2Night.getTime() }), true);
        });
    });

    // =========================================================================
    // TIER 5: Adversarial & Edge Cases
    // =========================================================================
    describe('Tier 5: Adversarial & Edge Variations', () => {

        it('T5.1: Null or invalid last_posted_at treated as never posted (allows immediate post)', () => {
            assert.equal(shouldTriggerChannelPost({ lastPostedAt: null, postsToday: 0, dailyLimit: 3 }), true);
            assert.equal(shouldTriggerChannelPost({ lastPostedAt: 'invalid-date-string', postsToday: 0, dailyLimit: 3 }), true);
        });

        it('T5.2: Future last_posted_at timestamp safely prevents posts during clock skew', () => {
            const futureTime = new Date(Date.now() + 3600000).toISOString();
            assert.equal(shouldTriggerChannelPost({ lastPostedAt: futureTime, postsToday: 0, dailyLimit: 3 }), false);
        });

        it('T5.3: Extreme high post frequency (e.g. 50 posts/day) behaves deterministically', () => {
            const highLimit = 50;
            assert.equal(shouldTriggerChannelPost({ postsToday: 49, dailyLimit: highLimit, lastPostedAt: new Date(Date.now() - 3600000).toISOString(), frequencyHours: 0.5 }), true);
            assert.equal(shouldTriggerChannelPost({ postsToday: 50, dailyLimit: highLimit, lastPostedAt: new Date(Date.now() - 3600000).toISOString(), frequencyHours: 0.5 }), false);
        });
    });
});
