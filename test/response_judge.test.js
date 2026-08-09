import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgeMessages, parseJudgeVerdict } from '../src/ai/response_judge.js';

test('reply judge accepts only compact explicit verdicts', () => {
    assert.deepEqual(parseJudgeVerdict('PASS'), { verdict: 'PASS', passed: true, code: null });
    assert.deepEqual(parseJudgeVerdict('reject:ignores_user'), { verdict: 'REJECT:IGNORES_USER', passed: false, code: 'IGNORES_USER' });
    assert.equal(parseJudgeVerdict('REJECT:MADE_UP_CODE').verdict, 'INVALID');
    assert.equal(parseJudgeVerdict('тут надо переписать').verdict, 'INVALID');
});

test('reply judge payload keeps editable prompt in system and bounded context in user message', () => {
    const messages = buildJudgeMessages({
        mode: 'EROTIC',
        judgePrompt: 'CUSTOM JUDGE RULES',
        messages: [
            { role: 'system', content: 'LERA PERSONA' },
            { role: 'user', content: 'Привет' },
            { role: 'assistant', content: 'Ответ' }
        ],
        userText: 'Новая реплика',
        reply: 'Кандидат'
    });

    assert.equal(messages[0].content, 'CUSTOM JUDGE RULES');
    assert.match(messages[1].content, /Режим: EROTIC/);
    assert.match(messages[1].content, /LERA PERSONA/);
    assert.match(messages[1].content, /Новая реплика/);
    assert.match(messages[1].content, /Кандидат/);
});
