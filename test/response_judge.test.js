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
        dayContext: 'Лера дома, вечер, дождь.',
        leraRules: 'LERA SPEECH AND RULES',
        messages: [
            { role: 'user', content: 'Привет' },
            { role: 'assistant', content: 'Ответ' }
        ],
        userText: 'Новая реплика',
        reply: 'Кандидат'
    });

    assert.match(messages[0].content, /^CUSTOM JUDGE RULES/);
    assert.match(messages[0].content, /relationship_event/);
    assert.match(messages[1].content, /Режим: EROTIC/);
    assert.match(messages[1].content, /Лера дома, вечер, дождь/);
    assert.match(messages[1].content, /LERA SPEECH AND RULES/);
    assert.match(messages[1].content, /Новая реплика/);
    assert.match(messages[1].content, /Кандидат/);
});

test('reply judge parses relationship event without changing PASS/REJECT semantics', () => {
    assert.deepEqual(
        parseJudgeVerdict('{"verdict":"PASS","relationship_event":{"type":"INSULT","intensity":0.8}}'),
        {
            verdict: 'PASS',
            passed: true,
            code: null,
            relationshipEvent: { type: 'INSULT', intensity: 0.8 },
            arousalEvent: null
        }
    );
    assert.deepEqual(
        parseJudgeVerdict('{"verdict":"PASS","relationship_event":{"type":"AFFECTION","intensity":0.9},"arousal_event":{"type":"KISS_TOUCH","intensity":0.7}}'),
        {
            verdict: 'PASS',
            passed: true,
            code: null,
            relationshipEvent: { type: 'AFFECTION', intensity: 0.9 },
            arousalEvent: { type: 'KISS_TOUCH', intensity: 0.7 }
        }
    );
    assert.deepEqual(
        parseJudgeVerdict('{"verdict":"REJECT:FORMAT","relationship_event":{"type":"APOLOGY","intensity":0.4}}').relationshipEvent,
        { type: 'APOLOGY', intensity: 0.4 }
    );
});

test('reply judge payload includes verified long-term memories when passed', () => {
    const messages = buildJudgeMessages({
        mode: 'CASUAL',
        surface: 'CHAT',
        memories: [
            { text: 'Пользователь работает дизайнером на фрилансе' },
            { text: 'Пользователь живёт в Санкт-Петербурге' }
        ],
        userText: 'Какой сериал',
        reply: 'Ну тот сериал'
    });

    assert.match(messages[1].content, /Долгосрочная память о пользователе/);
    assert.match(messages[1].content, /Пользователь работает дизайнером на фрилансе/);
    assert.match(messages[1].content, /Пользователь живёт в Санкт-Петербурге/);
});
