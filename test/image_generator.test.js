import test from 'node:test';
import assert from 'node:assert/strict';
import { pickImageProvider } from '../src/services/image_generator.js';

test('pickImageProvider selects preferred provider when requested', () => {
    const providers = [
        { id: 1, name: 'OpenAI Text', model_name: 'gpt-4o', is_enabled: true, is_active: true },
        { id: 2, name: 'Gemini Image', model_name: 'gemini-2.5-flash', is_enabled: true, is_active: false }
    ];

    const picked = pickImageProvider(providers, 2);
    assert.equal(picked?.id, 2);
    assert.equal(picked?.name, 'Gemini Image');
});

test('pickImageProvider automatically finds gemini or image provider when no preferred is set', () => {
    const providers = [
        { id: 1, name: 'DeepSeek', model_name: 'deepseek-chat', is_enabled: true, is_active: true },
        { id: 3, name: 'Google Gemini', model_name: 'gemini-2.0-flash', is_enabled: true, is_active: false },
        { id: 4, name: 'DallE', model_name: 'imagen-3.0', is_enabled: true, is_active: false }
    ];

    const picked = pickImageProvider(providers, null);
    assert.equal(picked?.id, 3);
    assert.equal(picked?.name, 'Google Gemini');
});

test('pickImageProvider falls back to active provider when no image provider is found', () => {
    const providers = [
        { id: 10, name: 'Claude', model_name: 'claude-3-5-sonnet', is_enabled: true, is_active: true }
    ];

    const picked = pickImageProvider(providers, null);
    assert.equal(picked?.id, 10);
});
