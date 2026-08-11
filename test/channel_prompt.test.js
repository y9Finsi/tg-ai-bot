import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChannelSystemPrompt } from '../src/channel_prompt.js';

test('channel prompt can safely inherit Lera and the current day without user-private data', () => {
    const prompt = buildChannelSystemPrompt({
        time: 'вторник, 5 августа, 16:00',
        timeOfDay: 'день',
        topic: 'thoughts',
        recentPosts: [{ topic: 'life', text: '[Лера отправила личное фото: "смотри новую авку"]' }]
    });

    assert.doesNotMatch(prompt, /Лера отправила личное фото/i);
    assert.doesNotMatch(prompt, /chat_history|conversation_events|OBSERVER DIGEST/i);
    assert.doesNotMatch(prompt, /petrogradka_home|location_id|sim_queue|prompt_flirthot/i);
    assert.match(prompt, /ПУБЛИЧНЫЕ ПАРАМЕТРЫ/);
    assert.match(prompt, /ПОСЛЕДНИЕ ПУБЛИЧНЫЕ ПОСТЫ/);
});

test('channel prompt ignores legacy full personality and day-context arguments', () => {
    const prompt = buildChannelSystemPrompt({
        topic: 'life',
        leraPrompt: 'Лера говорит живо и иронично.',
        dayContext: '[ЧТО ТОЧНО ПРОИЗОШЛО]\n- Лера закончила работу.'
    });

    assert.doesNotMatch(prompt, /ОБЩИЙ ОБРАЗ ЛЕРЫ/);
    assert.doesNotMatch(prompt, /Лера говорит живо и иронично/);
    assert.doesNotMatch(prompt, /КОНТЕКСТ ТЕКУЩЕГО ДНЯ/);
    assert.doesNotMatch(prompt, /Лера закончила работу/);
    assert.match(prompt, /ПУБЛИЧНЫЕ ПАРАМЕТРЫ/);
});

test('channel prompt accepts editor blocks but excludes secret-looking values', () => {
    const prompt = buildChannelSystemPrompt({
        topic: 'life',
        promptBlocks: {
            voice: 'пиши мягче и короче',
            cta: 'в конце задай один вопрос',
            context: 'API_KEY=super-secret'
        }
    });

    assert.match(prompt, /НАСТРОЙКИ РЕДАКТОРА/);
    assert.match(prompt, /пиши мягче и короче/);
    assert.match(prompt, /в конце задай один вопрос/);
    assert.doesNotMatch(prompt, /super-secret/);
});
