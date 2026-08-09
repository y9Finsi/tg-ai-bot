import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanResponseText, findResponseFormatIssues, splitResponseMessages } from '../src/utils/response_text.js';

test('response cleaner removes dash variants and decorative guillemets', () => {
    const cleaned = cleanResponseText('«ну — типа»\n- вот ‒ ещё ― строка ️');
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
            'я Лера и живу на Петроградке, учусь, иногда',
            'работаю с соцсетями и вечно куда то бегу с',
            'холодным кофе в руках',
            'Люблю долго гулять по городу, искать странные',
            'дворики, слушать музыку в наушниках и фотографировать всякую фигню, которая потом почему то кажется важной Иногда начинаю собирать шкаф или рисовать, а через полчаса уже сижу на кухне и думаю, зачем вообще в это ввязалась'
        ]
    );
});

test('response splitter keeps the first three ladder bubbles when limiting a long reply', () => {
    assert.deepEqual(
        splitResponseMessages('раз ||| два ||| три ||| четыре ||| пять ||| шесть ||| семь'),
        ['раз', 'два', 'три', 'четыре', 'пять', 'шесть семь']
    );
});

test('response splitter creates a fallback ladder for a long reply without delimiters', () => {
    assert.deepEqual(
        splitResponseMessages('подрабатываю в небольшой дизайн студии, помогаю с соцсетками и картинками. там норм атмосфера, но иногда заказчики такое присылают, что хочется плакать'),
        [
            'подрабатываю в небольшой дизайн студии, помогаю',
            'с соцсетками и картинками',
            'там норм атмосфера, но иногда заказчики такое',
            'присылают, что хочется плакать'
        ]
    );
});

test('response splitter separates an attached conversational pivot', () => {
    assert.deepEqual(
        splitResponseMessages('да, вот видишь, ты меня понимаешькстати, хочешь кофе. я себе сейчас налила, но могу и тебе сделать мысленный'),
        [
            'да',
            'вот видишь, ты меня понимаешь',
            'кстати, хочешь кофе',
            'я себе сейчас налила, но могу и тебе сделать',
            'мысленный'
        ]
    );
});

test('response splitter creates short conversational ladder pieces', () => {
    assert.deepEqual(
        splitResponseMessages('да, вот видишь, ты меня понимаешькстати, хочешь кофе. я себе сейчас налила, но могу и тебе сделать мысленный'),
        [
            'да',
            'вот видишь, ты меня понимаешь',
            'кстати, хочешь кофе',
            'я себе сейчас налила, но могу и тебе сделать',
            'мысленный'
        ]
    );
});

test('response format validator detects glued conversational phrases without rewriting text', () => {
    assert.deepEqual(
        findResponseFormatIssues('хахахах блин, ты прямо как взаправдукак ощущения'),
        ['attached_conversational_boundary']
    );
    assert.deepEqual(
        splitResponseMessages('хахахах блин, ты прямо как взаправдукак ощущения'),
        ['хахахах блин, ты прямо как взаправдукак ощущения']
    );
});

test('response format validator does not flag normal words or grammar', () => {
    assert.deepEqual(findResponseFormatIssues('я не знаю, как это ощущается'), []);
    assert.deepEqual(findResponseFormatIssues('никак не могу понять'), []);
    assert.deepEqual(findResponseFormatIssues('знаешь как дела'), []);
});

test('response format validator trusts newline-separated raw replies', () => {
    assert.deepEqual(
        findResponseFormatIssues('ты прямо как взаправду\nкак ощущения'),
        []
    );
});
