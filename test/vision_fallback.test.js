import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMultimodalMessages, stripImageUrlsFromMessages } from '../src/ai/llm_client.js';

test('hasMultimodalMessages correctly detects image_url parts', () => {
    const textOnly = [
        { role: 'system', content: 'You are Lera' },
        { role: 'user', content: 'Привет' }
    ];
    assert.equal(hasMultimodalMessages(textOnly), false);

    const multimodal = [
        { role: 'system', content: 'You are Lera' },
        {
            role: 'user',
            content: [
                { type: 'text', text: 'Посмотри на это' },
                { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } }
            ]
        }
    ];
    assert.equal(hasMultimodalMessages(multimodal), true);
});

test('stripImageUrlsFromMessages gracefully extracts plain text for non-vision models', () => {
    const multimodal = [
        { role: 'system', content: 'You are Lera' },
        {
            role: 'user',
            content: [
                { type: 'text', text: 'Что скажешь про лук?' },
                { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } }
            ]
        },
        {
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'https://example.com/photo2.jpg' } }
            ]
        }
    ];

    const stripped = stripImageUrlsFromMessages(multimodal);
    assert.equal(stripped.length, 3);
    assert.equal(stripped[0].content, 'You are Lera');
    assert.equal(stripped[1].content, 'Что скажешь про лук?');
    assert.equal(stripped[2].content, '[Пользователь прислал фото]');
    assert.equal(hasMultimodalMessages(stripped), false);
});
