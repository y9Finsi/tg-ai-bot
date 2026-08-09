import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJudgeVerdict } from '../src/ai/response_judge.js';

test('reply judge accepts only compact explicit verdicts', () => {
    assert.deepEqual(parseJudgeVerdict('PASS'), { verdict: 'PASS', passed: true, code: null });
    assert.deepEqual(parseJudgeVerdict('reject:ignores_user'), { verdict: 'REJECT:IGNORES_USER', passed: false, code: 'IGNORES_USER' });
    assert.equal(parseJudgeVerdict('REJECT:MADE_UP_CODE').verdict, 'INVALID');
    assert.equal(parseJudgeVerdict('тут надо переписать').verdict, 'INVALID');
});
