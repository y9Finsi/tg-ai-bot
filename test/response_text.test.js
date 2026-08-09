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

test('response splitter removes one terminal period but keeps an ellipsis', () => {
    assert.deepEqual(
        splitResponseMessages('ну да. ||| нууу... ||| расскажи ещё.'),
        ['ну да', 'нууу...', 'расскажи ещё']
    );
});

test('response splitter breaks an oversized ladder part into sentence bubbles', () => {
    const longPart = 'я Лера и живу на Петроградке, учусь, иногда работаю с соцсетями и вечно куда то бегу с холодным кофе в руках. Люблю долго гулять по городу, искать странные дворики, слушать музыку в наушниках и фотографировать всякую фигню, которая потом почему то кажется важной. Иногда начинаю собирать шкаф или рисовать, а через полчаса уже сижу на кухне и думаю, зачем вообще в это ввязалась.';
    assert.deepEqual(
        splitResponseMessages(`привет ||| ${longPart}`),
        [
            'привет',
            'я Лера и живу на Петроградке, учусь, иногда работаю с соцсетями и вечно куда то бегу с холодным кофе в руках',
            'Люблю долго гулять по городу, искать странные дворики, слушать музыку в наушниках и фотографировать всякую фигню, которая потом почему то кажется важной',
            'Иногда начинаю собирать шкаф или рисовать, а через полчаса уже сижу на кухне и думаю, зачем вообще в это ввязалась'
        ]
    );
});

test('response splitter keeps the first three ladder bubbles when limiting a long reply', () => {
    assert.deepEqual(
        splitResponseMessages('раз ||| два ||| три ||| четыре ||| пять'),
        ['раз', 'два', 'три', 'четыре пять']
    );
});

test('response splitter creates a fallback ladder for a long reply without delimiters', () => {
    assert.deepEqual(
        splitResponseMessages('подрабатываю в небольшой дизайн студии, помогаю с соцсетками и картинками. там норм атмосфера, но иногда заказчики такое присылают, что хочется плакать'),
        [
            'подрабатываю в небольшой дизайн студии, помогаю с соцсетками и картинками',
            'там норм атмосфера, но иногда заказчики такое присылают, что хочется плакать'
        ]
    );
});
