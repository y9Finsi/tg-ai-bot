import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTypeSafeClassifierQuestions, buildTypeSafeJudgeQuestions } from '../src/services/typesafe_client.js';
import { detectPendingPromises } from '../src/radiant/actions/tool_plan.js';
import { parseJudgeVerdict, JUDGE_CODES } from '../src/ai/response_judge.js';

test('buildTypeSafeClassifierQuestions includes previous and current message tool instructions', () => {
    const questions = buildTypeSafeClassifierQuestions({ includeToolPlan: true });
    assert.ok(questions.primary_tool, 'primary_tool question must exist');
    assert.ok(questions.primary_tool.instructions.includes('Проверь предыдущие реплики на тулы и текущую на тул'), 'Should instruct to check previous and current messages for tools');
    assert.ok(questions.primary_tool.instructions.includes('PREVIOUS_PROMISE'), 'Should mention PREVIOUS_PROMISE source');
    assert.ok(questions.promise_recovery, 'promise_recovery question must exist');
});

test('buildTypeSafeJudgeQuestions includes unfulfilled_tool question', () => {
    const questions = buildTypeSafeJudgeQuestions();
    assert.ok(questions.unfulfilled_tool, 'unfulfilled_tool question must exist in judge questions');
    assert.equal(questions.unfulfilled_tool.type, 'choice');
    assert.ok(questions.unfulfilled_tool.criteria.send_content, 'Should include send_content criteria');
    assert.ok(questions.unfulfilled_tool.criteria.send_photo, 'Should include send_photo criteria');
    assert.ok(questions.unfulfilled_tool.criteria.send_voice, 'Should include send_voice criteria');
    assert.ok(JUDGE_CODES.includes('GHOST_DELIVERY'), 'JUDGE_CODES must include GHOST_DELIVERY');
});

test('detectPendingPromises detects promises within recent messages and resolves when fulfilled', () => {
    const historyWithoutTool = [
        { role: 'assistant', content: 'выползла за кофе наконец', occurred_at: new Date(Date.now() - 60000) },
        { role: 'assistant', content: 'щас сижу слушаю одну и залипла чёт ||| скину тебе кажется зайдет', occurred_at: new Date(Date.now() - 40000) },
        { role: 'user', content: 'о, давай послушаю', occurred_at: new Date(Date.now() - 20000) }
    ];

    const unfulfilled = detectPendingPromises(historyWithoutTool, []);
    assert.equal(unfulfilled.length, 1);
    assert.equal(unfulfilled[0].tool, 'send_content');
    assert.equal(unfulfilled[0].source, 'PREVIOUS_PROMISE');

    const fulfilledEvents = [
        { event_type: 'CONTENT', occurred_at: new Date(Date.now() - 10000) }
    ];
    const fulfilled = detectPendingPromises(historyWithoutTool, fulfilledEvents);
    assert.equal(fulfilled.length, 0, 'Once content event is recorded, promise must be fulfilled');
});

test('parseJudgeVerdict recognizes REJECT:GHOST_DELIVERY correctly', () => {
    const parsed = parseJudgeVerdict(JSON.stringify({
        verdict: 'REJECT:GHOST_DELIVERY',
        reason: 'Лера пообещала скинуть трек, но send_content не был вызван',
        relationship_event: { type: 'NEUTRAL', intensity: 0 }
    }));
    assert.equal(parsed.passed, false);
    assert.equal(parsed.code, 'GHOST_DELIVERY');
    assert.ok(parsed.reason.includes('send_content'));
});
