import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
    getModelMatrix,
    updateModelMatrix,
    runSlotHealthCheck,
    normalizeProtocol,
    MATRIX_SLOTS
} from '../src/services/ai_matrix.js';
import { executeImageGenerationRequest, buildImagePrompt } from '../src/services/image_generator.js';
import { createAdminApp } from '../src/server.js';

process.env.ADMIN_WEB_KEY = 'test_admin_key';
const AUTH_HEADERS = {
    'x-admin-key': 'test_admin_key',
    'Content-Type': 'application/json'
};

function startTestServer() {
    const app = createAdminApp();
    const server = createServer(app);
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            const baseUrl = `http://127.0.0.1:${port}`;
            resolve({
                server,
                baseUrl,
                close: () => new Promise((res) => server.close(res))
            });
        });
    });
}

test('normalizeProtocol standardizes protocol strings', () => {
    assert.equal(normalizeProtocol('/chat/completions'), '/chat/completions');
    assert.equal(normalizeProtocol('chat_completions'), '/chat/completions');
    assert.equal(normalizeProtocol('chat'), '/chat/completions');
    assert.equal(normalizeProtocol('/images/generations'), '/images/generations');
    assert.equal(normalizeProtocol('images_generations'), '/images/generations');
    assert.equal(normalizeProtocol('image'), '/images/generations');
    assert.equal(normalizeProtocol('/audio/speech'), '/audio/speech');
    assert.equal(normalizeProtocol('audio_speech'), '/audio/speech');
});

test('MATRIX_SLOTS defines all 6 standard AI slots', () => {
    assert.deepEqual(MATRIX_SLOTS, [
        'core_dialogue',
        'style_classifier',
        'judge',
        'text_to_image',
        'image_to_image',
        'voice'
    ]);
});

test('getModelMatrix returns all 6 AI slots with required contracts', async () => {
    const result = await getModelMatrix();
    assert.ok(result.success, 'Result must indicate success');
    assert.ok(result.ok, 'Result must indicate ok');
    assert.ok(result.matrix, 'Matrix object must be present');
    assert.ok(result.slots, 'Slots object must be present');
    assert.ok(Array.isArray(result.available_providers), 'available_providers must be an array');

    // 1. Core Dialogue
    const core = result.matrix.core_dialogue;
    assert.ok(core, 'Core dialogue slot must exist');
    assert.ok('active_provider_id' in core, 'Core must have active_provider_id');
    assert.ok(Array.isArray(core.fallbacks), 'Core fallbacks must be an array');
    assert.ok(Array.isArray(core.providers), 'Core providers must be an array');

    // 2. Style Classifier
    const classifier = result.matrix.style_classifier;
    assert.ok(classifier, 'Style classifier slot must exist');
    assert.ok('model' in classifier, 'Classifier must have model');
    assert.ok('timeout_ms' in classifier, 'Classifier must have timeout_ms');

    // 3. Judge
    const judge = result.matrix.judge;
    assert.ok(judge, 'Judge slot must exist');
    assert.ok('mode' in judge, 'Judge must have mode');
    assert.ok('prompt' in judge, 'Judge must have prompt');

    // 4. Text-to-Image
    const t2i = result.matrix.text_to_image;
    assert.ok(t2i, 'Text-to-Image slot must exist');
    assert.ok('protocol' in t2i, 'T2I must have protocol');
    assert.ok(['/images/generations', '/chat/completions'].includes(t2i.protocol));

    // 5. Image-to-Image
    const i2i = result.matrix.image_to_image;
    assert.ok(i2i, 'Image-to-Image slot must exist');
    assert.equal(i2i.protocol, '/chat/completions');
    assert.equal(i2i.requires_reference, true);

    // 6. Voice
    const voice = result.matrix.voice;
    assert.ok(voice, 'Voice slot must exist');
    assert.ok('model' in voice, 'Voice must have model');
    assert.ok('voice_name' in voice || 'voice' in voice, 'Voice must have voice name');
});

test('updateModelMatrix updates slot parameters correctly', async () => {
    const updated = await updateModelMatrix({
        text_to_image: {
            model: 'flux-1-dev',
            protocol: '/images/generations',
            auto_generate_channel: false
        },
        image_to_image: {
            model: 'gemini-2.5-flash',
            style_prompt: 'Custom edit style'
        }
    });

    assert.ok(updated.success);
    assert.equal(updated.matrix.text_to_image.model, 'flux-1-dev');
    assert.equal(updated.matrix.text_to_image.protocol, '/images/generations');
    assert.equal(updated.matrix.text_to_image.auto_generate_channel, false);
    assert.equal(updated.matrix.image_to_image.model, 'gemini-2.5-flash');
    assert.equal(updated.matrix.image_to_image.requires_reference, true);
});

test('executeImageGenerationRequest enforces reference image for edit models or requireReference: true', async () => {
    const fakeProvider = {
        name: 'Test Edit Provider',
        base_url: 'https://api.example.com/v1',
        api_key: 'sk-fake',
        model_name: 'gemini-2.5-flash'
    };

    // Should throw if requireReference is true and no referenceDataUrl provided
    await assert.rejects(
        async () => {
            await executeImageGenerationRequest({
                provider: fakeProvider,
                model: 'gemini-2.5-flash',
                prompt: 'Edit hair to red',
                referenceDataUrl: null,
                requireReference: true
            });
        },
        /референс-картинку/
    );

    // Should also throw if model name contains 'edit' without referenceDataUrl
    await assert.rejects(
        async () => {
            await executeImageGenerationRequest({
                provider: fakeProvider,
                model: 'qwen-image-edit',
                prompt: 'Change dress color',
                referenceDataUrl: null
            });
        },
        /референс-картинку/
    );
});

test('executeImageGenerationRequest routes to /images/generations when explicit protocol is set', async () => {
    let capturedUrl = null;
    let capturedBody = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(opts.body);
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }]
            })
        };
    };

    try {
        const fakeProvider = {
            name: 'Flux Provider',
            base_url: 'https://api.example.com/v1',
            api_key: 'sk-fake-key',
            model_name: 'flux-1-schnell'
        };

        const result = await executeImageGenerationRequest({
            provider: fakeProvider,
            model: 'flux-1-schnell',
            prompt: 'sunset on Neva river',
            protocol: '/images/generations'
        });

        assert.ok(capturedUrl.endsWith('/images/generations'), 'Should call /images/generations endpoint');
        assert.equal(capturedBody.model, 'flux-1-schnell');
        assert.ok(result.buffer, 'Should return parsed buffer');
        assert.equal(result.protocol, '/images/generations');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('executeImageGenerationRequest routes to /chat/completions when explicit protocol is /chat/completions', async () => {
    let capturedUrl = null;
    let capturedBody = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(opts.body);
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                choices: [{
                    message: {
                        content: '![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)'
                    }
                }]
            })
        };
    };

    try {
        const fakeProvider = {
            name: 'Gemini Bridge',
            base_url: 'https://api.example.com/v1',
            api_key: 'sk-fake-key',
            model_name: 'gemini-2.5-flash'
        };

        const result = await executeImageGenerationRequest({
            provider: fakeProvider,
            model: 'gemini-2.5-flash',
            prompt: 'sitting in cafe with coffee',
            referenceDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            protocol: '/chat/completions',
            requireReference: true
        });

        assert.ok(capturedUrl.endsWith('/chat/completions'), 'Should call /chat/completions endpoint');
        assert.equal(capturedBody.model, 'gemini-2.5-flash');
        assert.ok(capturedBody.messages[0].content.some(c => c.type === 'image_url'));
        assert.ok(result.buffer);
        assert.equal(result.protocol, '/chat/completions');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('runSlotHealthCheck performs diagnostic ping with status and latency', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('/chat/completions')) {
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    choices: [{ message: { content: 'PASS' } }]
                })
            };
        }
        if (urlStr.includes('/images/generations')) {
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    data: [{ url: 'https://example.com/fake.png' }]
                })
            };
        }
        if (urlStr.includes('/audio/speech')) {
            return {
                ok: true,
                status: 200,
                headers: { get: () => 'audio/mpeg' },
                arrayBuffer: async () => new Uint8Array(500).buffer
            };
        }
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ ok: true })
        };
    };

    try {
        const mockProvider = {
            id: 999,
            name: 'Mock Health Provider',
            base_url: 'https://api.example.com/v1',
            api_key: 'sk-test',
            model_name: 'mock-model'
        };

        // Core Dialogue check
        const coreCheck = await runSlotHealthCheck({
            slot: 'core_dialogue',
            provider: mockProvider
        });
        assert.equal(coreCheck.ok, true);
        assert.equal(coreCheck.status, 'HEALTHY');
        assert.ok(typeof coreCheck.latency_ms === 'number');

        // Text-to-Image check
        const t2iCheck = await runSlotHealthCheck({
            slot: 'text_to_image',
            provider: mockProvider,
            protocol: '/images/generations'
        });
        assert.equal(t2iCheck.ok, true);
        assert.equal(t2iCheck.status, 'HEALTHY');

        // Voice check
        const voiceCheck = await runSlotHealthCheck({
            slot: 'voice',
            provider: mockProvider
        });
        assert.equal(voiceCheck.ok, true);
        assert.equal(voiceCheck.status, 'HEALTHY');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('HTTP API: GET /api/admin/model-matrix, POST /api/admin/model-matrix and POST /api/admin/model-matrix/health-check', async () => {
    const originalFetch = globalThis.fetch;
    const testServer = await startTestServer();

    try {
        // 1. GET /api/admin/model-matrix
        const getRes = await originalFetch(`${testServer.baseUrl}/api/admin/model-matrix`, {
            headers: AUTH_HEADERS
        });
        assert.equal(getRes.status, 200);
        const getData = await getRes.json();
        assert.equal(getData.ok, true);
        assert.ok(getData.matrix.core_dialogue);
        assert.ok(getData.matrix.text_to_image);
        assert.ok(getData.matrix.image_to_image);
        assert.ok(getData.matrix.voice);

        // 2. POST /api/admin/model-matrix
        const postRes = await originalFetch(`${testServer.baseUrl}/api/admin/model-matrix`, {
            method: 'POST',
            headers: AUTH_HEADERS,
            body: JSON.stringify({
                text_to_image: {
                    model: 'dall-e-3',
                    protocol: '/images/generations'
                }
            })
        });
        assert.equal(postRes.status, 200);
        const postData = await postRes.json();
        assert.equal(postData.ok, true);
        assert.equal(postData.matrix.text_to_image.model, 'dall-e-3');

        // 3. POST /api/admin/model-matrix/health-check
        // Mock the outgoing fetch for health-check
        globalThis.fetch = async (url, opts) => {
            const urlStr = String(url);
            if (urlStr.startsWith(testServer.baseUrl)) {
                return originalFetch(url, opts);
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ choices: [{ message: { content: 'Ping OK' } }] })
            };
        };

        const healthRes = await originalFetch(`${testServer.baseUrl}/api/admin/model-matrix/health-check`, {
            method: 'POST',
            headers: AUTH_HEADERS,
            body: JSON.stringify({
                slot: 'core_dialogue',
                provider: {
                    id: 1,
                    name: 'Test LLM',
                    base_url: 'https://api.example.com/v1',
                    api_key: 'sk-test',
                    model_name: 'gpt-4o-mini'
                }
            })
        });
        assert.equal(healthRes.status, 200);
        const healthData = await healthRes.json();
        assert.equal(healthData.ok, true);
        assert.equal(healthData.status, 'HEALTHY');
    } finally {
        globalThis.fetch = originalFetch;
        await testServer.close();
    }
});
