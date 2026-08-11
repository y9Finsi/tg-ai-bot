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

test('response splitter treats the explicit delimiter as a Telegram bubble boundary', () => {
    assert.deepEqual(
        splitResponseMessages('нууу... я Лера ||| расскажу о себе ||| только не длинным полотном'),
        ['нууу... я Лера', 'расскажу о себе', 'только не длинным полотном']
    );
});

test('response splitter keeps punctuation unchanged', () => {
    assert.deepEqual(
        splitResponseMessages('ну да.\nнууу...\nрасскажи ещё.'),
        ['ну да.', 'нууу...', 'расскажи ещё.']
    );
});

test('response splitter never cuts an oversized message itself', () => {
    const longPart = 'я Лера и живу на Петроградке, учусь, иногда работаю с соцсетями и вечно куда то бегу с холодным кофе в руках. Люблю долго гулять по городу, искать странные дворики, слушать музыку в наушниках и фотографировать всякую фигню, которая потом почему то кажется важной. Иногда начинаю собирать шкаф или рисовать, а через полчаса уже сижу на кухне и думаю, зачем вообще в это ввязалась.';
    assert.deepEqual(
        splitResponseMessages(longPart),
        [longPart]
    );
});

test('response splitter keeps every newline-separated message', () => {
    assert.deepEqual(
        splitResponseMessages('раз\nдва\nтри\nчетыре\nпять\nшесть\nсемь'),
        ['раз', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь']
    );
});

test('response splitter does not create fallback bubbles from punctuation', () => {
    assert.deepEqual(
        splitResponseMessages('подрабатываю в небольшой дизайн студии, помогаю с соцсетками и картинками. там норм атмосфера, но иногда заказчики такое присылают, что хочется плакать'),
        ['подрабатываю в небольшой дизайн студии, помогаю с соцсетками и картинками. там норм атмосфера, но иногда заказчики такое присылают, что хочется плакать']
    );
});

test('response splitter does not cut a normal question at an arbitrary word boundary', () => {
    assert.deepEqual(
        splitResponseMessages('ну окей... чем ты вообще занимаешься, когда не сидишь в телеграме в два ночи?'),
        ['ну окей... чем ты вообще занимаешься, когда не сидишь в телеграме в два ночи?']
    );
});

test('response splitter does not invent an attached conversational pivot boundary', () => {
    assert.deepEqual(
        splitResponseMessages('да, вот видишь, ты меня понимаешькстати, хочешь кофе. я себе сейчас налила, но могу и тебе сделать мысленный'),
        ['да, вот видишь, ты меня понимаешькстати, хочешь кофе. я себе сейчас налила, но могу и тебе сделать мысленный']
    );
});

test('response splitter does not divide short conversational text', () => {
    assert.deepEqual(
        splitResponseMessages('да, вот видишь, ты меня понимаешькстати, хочешь кофе. я себе сейчас налила, но могу и тебе сделать мысленный'),
        ['да, вот видишь, ты меня понимаешькстати, хочешь кофе. я себе сейчас налила, но могу и тебе сделать мысленный']
    );
});

test('response format validator no longer triggers a ladder retry', () => {
    assert.deepEqual(findResponseFormatIssues('хахахах блин, ты прямо как взаправдукак ощущения'), []);
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
