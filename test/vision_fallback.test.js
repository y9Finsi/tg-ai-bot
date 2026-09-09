import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMultimodalMessages, stripImageUrlsFromMessages, extractTextToolCalls } from '../src/ai/llm_client.js';

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

test('extractTextToolCalls parses standard <tool_call> and DeepSeek DSML tool calls', () => {
    // 1. JSON tool call
    const jsonText = 'щас\n<tool_call>{"name":"send_content","arguments":{"category":"music"}}</tool_call>';
    const calls1 = extractTextToolCalls(jsonText);
    assert.equal(calls1.length, 1);
    assert.equal(calls1[0].function.name, 'send_content');
    assert.deepEqual(JSON.parse(calls1[0].function.arguments), { category: 'music' });

    // 2. DeepSeek DSML tool call
    const dsmlText = `щас скину
<｜DSML｜tool_calls>
<｜DSML｜invoke name="send_content">
<｜DSML｜parameter name="category" string="true">music</｜DSML｜parameter>
<｜DSML｜parameter name="query" string="true">инди рок</｜DSML｜parameter>
</｜DSML｜invoke>
<｜DSML｜invoke name="relay_message_to_friend">
<｜DSML｜parameter name="target" string="true">Ютя</｜DSML｜parameter>
<｜DSML｜parameter name="message" string="true">Богдан обиделся</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>`;
    const calls2 = extractTextToolCalls(dsmlText);
    assert.equal(calls2.length, 2);
    assert.equal(calls2[0].function.name, 'send_content');
    assert.deepEqual(JSON.parse(calls2[0].function.arguments), { category: 'music', query: 'инди рок' });
    assert.equal(calls2[1].function.name, 'relay_message_to_friend');
    assert.deepEqual(JSON.parse(calls2[1].function.arguments), { target: 'Ютя', message: 'Богдан обиделся' });
});
