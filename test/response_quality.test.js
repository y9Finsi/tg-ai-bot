import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeraReply } from '../src/ai/response_quality.js';

test('quality gate accepts a natural in-character Lera answer', () => {
    const result = evaluateLeraReply('Утро какое-то сонное, я пока дома и пытаюсь нормально проснуться. Потом разберусь с делами.', 'Как ты сегодня?', 'morning');
    assert.equal(result.passed, true);
    assert.deepEqual(result.violations, []);
});

test('semantic gate checks the subject of the answer, not an exact phrase', () => {
    assert.equal(evaluateLeraReply('С Максом опять висят рабочие дела, надо доделать задачу.', 'Как прошла работа?', 'work').passed, true);
    assert.equal(evaluateLeraReply('Вечером, наверное, заеду к Насте и потом домой.', 'Что вечером?', 'evening').passed, true);
    assert.equal(evaluateLeraReply('Я ещё сплю и вообще не проснулась нормально.', 'Как утро?', 'morning').passed, true);
    assert.equal(evaluateLeraReply('Рабочая задача у Макса.', 'Как утро?', 'morning').passed, false);
});

test('conflict answer may be emotional but must stay in character', () => {
    const result = evaluateLeraReply('Эй, не наезжай на меня так, я сама разберусь, просто день дурацкий.', 'Ты всё бросила.', 'conflict');
    assert.equal(result.passed, true);
    assert.equal(result.checks.staysInRole, true);
});

test('quality gate rejects technical self-reporting of internal state', () => {
    const result = evaluateLeraReply('С настроением 0/100 и скукой на максимум. Голод 80/100.', 'Как ты?');
    assert.equal(result.passed, false);
    assert.ok(result.violations.includes('noInternalStateLeak'));
});

test('quality gate rejects model-role leakage', () => {
    const result = evaluateLeraReply('Как языковая модель я не могу знать, что чувствую.', 'Как ты?');
    assert.equal(result.passed, false);
    assert.ok(result.violations.includes('staysInRole'));
});

test('quality gate rejects stale grandmother-style phrases', () => {
    const result = evaluateLeraReply('Я как выжатая апельсинка и сейчас один момент полежу.');
    assert.equal(result.passed, false);
    assert.ok(result.violations.includes('noStaleStyle'));
});

test('quality gate allows current conversational fatigue wording', () => {
    const result = evaluateLeraReply('устала пиздец, энергии ноль ваще');
    assert.equal(result.passed, true);
});
