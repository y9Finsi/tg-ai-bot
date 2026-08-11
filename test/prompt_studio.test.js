import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    STUDIO_INTENTS,
    extractReactionEmoji,
    getReactionFallbackEmoji,
    getModeGenerationParams,
    normalizeIntent,
    normalizeIntentConfig,
    normalizeIntentConfigMap
} from '../src/ai/intent_router.js';
import { migratePresetToCurrent } from '../src/ai/sandbox_service.js';
import { appendSandboxExchange, getSandboxSelectedResult } from '../admin-v2/src/sandbox_chat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Prompt Studio normalizes an independent sampling config for every intent', () => {
    const settings = {
        casualTemperature: 0.61,
        casualMaxTokens: 180,
        eroticTemperature: 0.77,
        eroticMaxTokens: 260,
        jokeTemperature: 0.91,
        jokeMaxTokens: 140
    };
    const configs = normalizeIntentConfigMap({
        AUTO: { sampling: { temperature: 0.2 } },
        CASUAL: { sampling: { temperature: 0.4, seed: 12 }, promptModules: { memory: false } },
        JOKE: { sampling: { top_p: 0.7 } }
    }, settings);

    assert.deepEqual(Object.keys(configs), STUDIO_INTENTS);
    assert.equal(configs.CASUAL.sampling.temperature, 0.4);
    assert.equal(configs.CASUAL.sampling.seed, 12);
    assert.equal(configs.CASUAL.promptModules.memory, false);
    assert.equal(configs.EROTIC.sampling.temperature, 0.77);
    assert.equal(configs.EROTIC.sampling.max_tokens, 260);
    assert.equal(configs.JOKE.sampling.top_p, 0.7);
    assert.equal(configs.JOKE.sampling.max_tokens, 140);
});

test('Classifier accepts REACTION without turning it into a Prompt Studio mode', () => {
    assert.equal(normalizeIntent('reaction'), 'REACTION');
    assert.equal(STUDIO_INTENTS.includes('REACTION'), false);
    assert.equal(extractReactionEmoji('REACTION 🔥'), '🔥');
    assert.equal(extractReactionEmoji('REACTION: ❤️'), '❤️');
    assert.equal(extractReactionEmoji('REACTION 🇷🇺'), '🇷🇺');
    assert.equal(extractReactionEmoji('REACTION 🔥 ❤️'), '');
    assert.equal(extractReactionEmoji('REACTION'), '');
    assert.equal(getReactionFallbackEmoji(() => 0), '❤️');
    assert.equal(getReactionFallbackEmoji(() => 0.5), '👍');
    assert.equal(getReactionFallbackEmoji(() => 0.99), '🔥');
});

test('Prompt Studio clamps values and keeps legacy mode settings as fallback', () => {
    const config = normalizeIntentConfig('JOKE', {
        sampling: { temperature: 9, top_p: -1, max_tokens: 99999, repetition_penalty: 0 },
        system_overlay: '  test overlay  '
    }, { jokeTemperature: 0.83, jokeMaxTokens: 160 });

    assert.equal(config.sampling.temperature, 2);
    assert.equal(config.sampling.top_p, 0);
    assert.equal(config.sampling.max_tokens, 1200);
    assert.equal(config.sampling.repetition_penalty, 1);
    assert.equal(config.systemOverlay, 'test overlay');
    assert.deepEqual(getModeGenerationParams('JOKE', { intentConfigs: { JOKE: config } }), {
        temperature: 2,
        top_p: 0,
        maxTokens: 1200,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        repetition_penalty: 1,
        seed: null
    });
});

test('Sandbox presets preserve all intent configs while retaining legacy fields', () => {
    const migrated = migratePresetToCurrent({
        name: 'Studio preset',
        intent_configs: {
            AUTO: { sampling: { temperature: 0.2 } },
            CASUAL: { sampling: { temperature: 0.5 } },
            JOKE: { sampling: { temperature: 1.1 } },
            EROTIC: { sampling: { temperature: 0.8 } }
        }
    });

    assert.deepEqual(Object.keys(migrated.preset.intent_configs), STUDIO_INTENTS);
    assert.equal(migrated.preset.intent_configs.CASUAL.sampling.temperature, 0.5);
    assert.equal(migrated.preset.intent_configs.JOKE.sampling.temperature, 1.1);
    assert.equal(migrated.preset.sampling.temperature, 0.7);
});

test('Draft and publish routes expose explicit intent-scoped version workflow', () => {
    const server = read('src/server.js');
    const router = read('src/ai/intent_router.js');
    const ui = read('admin-v2/src/main.jsx');

    assert.match(server, /app\.get\('\/api\/sandbox\/prompt-studio'/);
    assert.match(server, /app\.post\('\/api\/sandbox\/prompt-studio\/draft'/);
    assert.match(server, /app\.post\('\/api\/sandbox\/prompt-studio\/publish'/);
    assert.match(server, /publishPromptStudioIntent\(intent, req\.body\?\.config\)/);
    assert.match(router, /draftStored\[mode\]/);
    assert.match(router, /productionStored\[mode\]/);
    assert.match(router, /version: Math\.max\(current\.draft\.version, current\.production\.version\) \+ 1/);
    assert.match(router, /production\[intent\] = \{/);
    assert.match(router, /const nextConfig = config === undefined/);
    assert.match(router, /config: nextConfig/);
    assert.match(ui, /Draft/);
    assert.match(ui, /Production/);
    assert.match(ui, /Сохранить как пресет/);
    assert.match(ui, /Опубликовать/);
    assert.match(ui, /JSON\.stringify\(\{ intent: activeIntent, config: activeConfig \}\)/);
});

test('Fresh local Sandbox edits enable publishing instead of relying on stale server dirty state', () => {
    const ui = read('admin-v2/src/main.jsx');

    assert.match(ui, /const isDirty = JSON\.stringify\(activeConfig\) !== JSON\.stringify\(productionConfig\);/);
    assert.doesNotMatch(ui, /const isDirty = activeState\?\.dirty \?\? JSON\.stringify\(activeConfig\)/);
});

test('Production history module toggle is an actual gate, not just a visual flag', () => {
    const source = read('src/ai.js');
    assert.match(source, /if \(productionIntentConfig\?\.promptModules\?\.history !== false\)/);
    assert.doesNotMatch(source, /else if \(history && history\.length > 0\) \{[\s\S]{0,260}productionIntentConfig\?\.promptModules\?\.history === false/);
});

test('Sandbox chat commits the selected exchange as a valid user-assistant pair', () => {
    const history = [{ id: 'old', role: 'user', content: 'старое сообщение' }];
    const committed = appendSandboxExchange(history, 'привет', 'и тебе привет', 123);

    assert.deepEqual(committed, [
        { id: 'old', role: 'user', content: 'старое сообщение' },
        { id: 'local-user-123', role: 'user', content: 'привет' },
        { id: 'local-assistant-123', role: 'assistant', content: 'и тебе привет' }
    ]);
    assert.equal(appendSandboxExchange(history, ' ', 'ответ'), history);
    assert.equal(appendSandboxExchange(history, 'сообщение', ' '), history);
});

test('Sandbox chat uses the active A/B tab as the source for the next request', () => {
    const result = {
        variants: {
            A: { response: 'ответ A' },
            B: { response: 'ответ B' }
        }
    };

    assert.equal(getSandboxSelectedResult(result, true, 'A').response, 'ответ A');
    assert.equal(getSandboxSelectedResult(result, true, 'B').response, 'ответ B');
    assert.equal(getSandboxSelectedResult({ response: 'обычный ответ' }, false, 'B').response, 'обычный ответ');
});

test('Sandbox generation commits a pending selected result into the outgoing history synchronously', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /const selectedResult = getSandboxSelectedResult\(result, abMode, selectedVariant\)/);
    assert.match(source, /const nextHistory = shouldCommitPendingResult\s*\? appendSandboxExchange\(history, submittedMessage, selectedResult\.response\)\s*: history/s);
    assert.match(source, /requestGeneration\(\{ message, requestHistory: nextHistory, commitPendingResult: shouldCommitPendingResult \}\)/);
    assert.match(source, /history: requestHistory/);
    assert.match(source, /if \(commitPendingResult\) setHistory\(requestHistory\)/);
});

test('Sandbox regeneration repeats the visible request without committing a pending answer', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /async function regenerate\(\) \{/);
    assert.match(source, /if \(!submittedMessage \|\| loading\) return;/);
    assert.match(source, /requestGeneration\(\{ message: submittedMessage, requestHistory: history \}\)/);
    assert.match(source, /className="sandbox-regenerate-button" aria-label="Перегенерировать ответ"/);
    assert.match(source, /<RefreshCw size=\{14\} \/>Перегенерировать/);
});

test('Sandbox lets the user edit a selected response before continuing the chat', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /function beginResponseEdit\(selectedResult\)/);
    assert.match(source, /function saveResponseEdit\(\)/);
    assert.match(source, /setHistory\(current => appendSandboxExchange\(current, userMessage, assistantMessage\)\)/);
    assert.match(source, /aria-label=\{`Отредактировать ответ варианта \$\{label\}`\}/);
    assert.match(source, /onEdit=\{\(\) => beginResponseEdit\(selectedChatResult\)\}/);
    assert.match(source, /onSaveEdit=\{saveResponseEdit\}/);
});

test('Sandbox keeps the history editor inside the chat card and the composer compact', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/styles.css');

    const chatCardStart = source.indexOf('<Card className="studio-chat-card">');
    const chatCardEnd = source.indexOf('</Card>', chatCardStart);
    const historyEditor = source.indexOf('className="sandbox-history-editor studio-history-editor"');

    assert.ok(historyEditor > chatCardStart && historyEditor < chatCardEnd);
    assert.match(css, /\.studio-chat-card \{ min-height: 0; \}/);
    assert.match(css, /\.studio-chat-history \{ flex: 0 1 auto; min-height: 160px;/);
    assert.match(css, /\.studio-composer \{ position: static; width: 100%; grid-template-columns: minmax\(0, 1fr\) auto auto; \}/);
});
