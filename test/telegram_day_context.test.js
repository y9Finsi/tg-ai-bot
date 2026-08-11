import test from 'node:test';
import assert from 'node:assert/strict';
import { runTelegramDaySmoke } from '../src/radiant/telegram_day_smoke.js';

test('24-hour day and Telegram conversation share one evolving context stream', () => {
    const smoke = runTelegramDaySmoke();
    assert.equal(smoke.day.end.getTime() - smoke.day.start.getTime(), 24 * 60 * 60 * 1000);
    assert.equal(smoke.checkpoints.length, 4);
    assert.ok(smoke.day.intervals.length >= 5);
    assert.ok(smoke.day.intervals.some(item => item.taskType === 'SLEEP_NIGHT'));
    assert.equal(smoke.checkpoints[0].prompt.includes('Доброе утро'), false);
    assert.match(smoke.checkpoints[0].prompt, /\[СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ\]/);
    assert.match(smoke.checkpoints[1].prompt, /\[ГЛАВНЫЕ СОБЫТИЯ ЗА ДЕНЬ/);
    assert.match(smoke.checkpoints[2].prompt, /В плане:/);
    assert.notEqual(smoke.checkpoints[0].prompt, smoke.checkpoints[1].prompt);
    assert.notEqual(smoke.checkpoints[1].prompt, smoke.checkpoints[2].prompt);
});

test('Telegram context does not turn an uncompleted plan into a completed fact', () => {
    const smoke = runTelegramDaySmoke();
    const evening = smoke.checkpoints[2].prompt;
    assert.match(evening, /События из аналитики уже завершились\. Говори о них в прошедшем времени/);
    assert.doesNotMatch(evening, /SOCIAL_MEETING_COMPLETED.*Встреча/);
    assert.doesNotMatch(evening, /ЧЕГО МЫ НЕ ЗНАЕМ|причина не установлена/);
    assert.doesNotMatch(evening, /TASK_COMPLETED|SOCIAL_MEETING_COMPLETED|locationId|taskType|\{"/);
});

test('same day smoke is deterministic for repeated Telegram context checks', () => {
    const first = runTelegramDaySmoke();
    const second = runTelegramDaySmoke();
    assert.deepEqual(first.day.intervals, second.day.intervals);
    assert.deepEqual(first.checkpoints.map(item => item.facts), second.checkpoints.map(item => item.facts));
});
