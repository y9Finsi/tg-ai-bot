import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SANDBOX_HISTORY_LIMIT,
    assembleSandboxSystemBase,
    extractMediaTriggers,
    migratePresetToCurrent,
    normalizeSandboxHistory,
    requestSamplingForProvider
} from '../src/ai/sandbox_service.js';
import { buildLlmRequestParams } from '../src/ai/llm_client.js';
import { ContextBuilder } from '../src/ai/context_builder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('sandbox keeps exactly ten newest messages and annotates excluded rows', () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ id: `m${index}`, role: index % 2 ? 'assistant' : 'user', content: `message ${index}` }));
    const result = normalizeSandboxHistory(history);

    assert.equal(result.historyLimit, SANDBOX_HISTORY_LIMIT);
    assert.deepEqual(result.historyIncluded.map(item => item.id), ['m2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']);
    assert.deepEqual(result.historyExcluded.map(item => item.excludedReason), ['context_window_limit', 'context_window_limit']);
});

test('preset migration fills missing schema fields and ignores unknown fields', () => {
    const result = migratePresetToCurrent({ version: 0, name: 'Legacy', sampling: { temperature: 4, seed: 42, top_k: 20, unknown: true }, unknownRoot: true });

    assert.equal(result.migrated, true);
    assert.equal(result.preset.version, 3);
    assert.equal(result.preset.sampling.temperature, 2);
    assert.equal(result.preset.sampling.seed, 42);
    assert.equal(result.preset.sampling.top_p, 0.95);
    assert.equal('unknownRoot' in result.preset, false);
    assert.equal('unknown' in result.preset.sampling, false);
    assert.equal('top_k' in result.preset.sampling, false);
});

test('media trigger parser extracts one or several image tags without generation', () => {
    assert.deepEqual(extractMediaTriggers('ok [IMAGE: girl in cafe] then [image: rainy window]'), [
        { type: 'IMAGE', description: 'girl in cafe' },
        { type: 'IMAGE', description: 'rainy window' }
    ]);
});

test('sandbox omits absent memory and media-preview instructions by default', () => {
    const prompt = assembleSandboxSystemBase({
        basePrompt: 'BASE',
        contextText: 'CONTEXT'
    });

    assert.equal(prompt, 'BASE\n\nCONTEXT');
    assert.doesNotMatch(prompt, /Память пользователя не подключена/i);
    assert.doesNotMatch(prompt, /SANDBOX MEDIA PREVIEW/);
});

test('sandbox media preview is explicitly opt-in', () => {
    const prompt = assembleSandboxSystemBase({
        basePrompt: 'BASE',
        mediaPreview: true
    });

    assert.match(prompt, /SANDBOX MEDIA PREVIEW/);
});

test('unsupported sampler values are skipped while seed is sent only with declared capability', () => {
    const preset = migratePresetToCurrent({ sampling: { seed: 7, repetition_penalty: 1.2 } }).preset;
    const unsupported = requestSamplingForProvider(preset.sampling, { sampling_capabilities: {} });
    const supported = requestSamplingForProvider(preset.sampling, { sampling_capabilities: { seed: true, repetition_penalty: true } });

    assert.deepEqual(unsupported.skippedParams.sort(), ['frequency_penalty', 'max_tokens', 'presence_penalty', 'repetition_penalty', 'seed', 'temperature', 'top_p']);
    assert.equal(Object.hasOwn(unsupported.samplingExtraBody, 'seed'), false);
    assert.equal(unsupported.seed, null);
    assert.equal(supported.seed, 7);
    assert.equal(Object.hasOwn(supported.samplingExtraBody, 'seed'), false);
    assert.equal(supported.samplingExtraBody.repetition_penalty, 1.2);
});

test('sandbox sends only sampling parameters declared by the selected provider', () => {
    const preset = migratePresetToCurrent({ sampling: { temperature: 0.6, top_p: 0.8, max_tokens: 120, presence_penalty: 0.2, frequency_penalty: 0.3 } }).preset;
    const generation = requestSamplingForProvider(preset.sampling, { sampling_capabilities: { temperature: true, max_tokens: true } });
    const payload = buildLlmRequestParams({
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }],
        calculatedMaxTokens: 200,
        traceContext: generation
    });

    assert.equal(payload.temperature, 0.6);
    assert.equal(payload.max_tokens, 120);
    assert.equal('top_p' in payload, false);
    assert.equal('presence_penalty' in payload, false);
    assert.equal('frequency_penalty' in payload, false);
    assert.equal(generation.samplingStatus.top_p.capability, 'unsupported');
    assert.equal(generation.samplingStatus.top_p.request, 'skipped');
});

test('incomplete transit context stays truthful instead of inventing a destination', () => {
    const analysis = ContextBuilder.toAnalysis({
        user: { first_name: 'Богдан' },
        state: { needs: {} },
        location: { name: 'Квартира на Петроградке' },
        activeTask: { task_type: 'TRAVEL', status: 'IN_TRANSIT' },
        transit: { from: 'petrogradka_home', to: undefined },
        mood: 50,
        inventory: [],
        weather: {},
        facts: [],
        commitments: [],
        currentTime: '2026-08-09T10:04:00+03:00'
    });

    assert.match(analysis, /Текущий статус: В дороге/);
    assert.doesNotMatch(analysis, /Едет в дома/);
});

test('A/B AUTO classifier is built once and both variants receive the frozen route', () => {
    const source = read('src/ai/sandbox_service.js');
    const abBody = source.slice(source.indexOf('export async function generateSandboxAbTest'), source.length);

    assert.match(abBody, /const frozen = await buildFrozenContext\(input\)/);
    assert.match(abBody, /Promise\.allSettled\(\s*\[\s*generateVariant\(frozen, configs\.A, 'A'\),\s*generateVariant\(frozen, configs\.B, 'B'\)/s);
    assert.equal((source.match(/classifyIntent\(/g) || []).length, 1);
    assert.match(source, /sharedByVariants: true/);
});

test('sandbox preset stores module toggles and applies history as an explicit module', () => {
    const preset = migratePresetToCurrent({ prompt_modules: { context: false, history: false } }).preset;

    assert.equal(preset.prompt_modules.context, false);
    assert.equal(preset.prompt_modules.history, false);
    assert.equal(preset.prompt_modules.core, true);
    const source = read('src/ai/sandbox_service.js');
    assert.match(source, /enabledModules\.history === false \? \[\] : frozen\.historyIncluded/);
});

test('sandbox code has no production history, Telegram, image generation, or prompt-log writes', () => {
    const source = read('src/ai/sandbox_service.js');
    for (const forbidden of ['saveChatHistory', 'saveMemory', 'sendMessage', 'generateImage', 'savePromptLog']) {
        assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`));
    }
    assert.match(source, /trace: false/);
});
