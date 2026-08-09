import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanResponseText, splitResponseMessages } from '../src/utils/response_text.js';

test('response cleaner removes dash variants and decorative guillemets', () => {
    const cleaned = cleanResponseText('«ну — типа»\n- вот ‒ ещё ― строка');
    assert.equal(cleaned, 'ну типа\nвот ещё строка');
});

test('response splitter restores the ladder for newline-separated replies', () => {
    assert.deepEqual(
        splitResponseMessages('привет\nкак ты?\nя тут'),
        ['привет', 'как ты?', 'я тут']
    );
});

test('response splitter uses the explicit Telegram ladder delimiter', () => {
    assert.deepEqual(
        splitResponseMessages('нууу... я Лера ||| расскажу о себе ||| только не длинным полотном'),
        ['нууу... я Лера', 'расскажу о себе', 'только не длинным полотном']
    );
});
