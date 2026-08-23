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
    assert.match(ui, /Черновик — тест — публикация/);
    assert.match(ui, /Сохранить как новый/);
    assert.match(ui, /JSON\.stringify\(\{ intent: activeIntent \}\)/);
    assert.doesNotMatch(ui, /prompt-studio\/publish'.{0,160}config: activeConfig/);
});

test('Sandbox separates unsaved local candidate from saved draft and Production', () => {
    const ui = read('admin-v2/src/main.jsx');

    assert.match(ui, /const savedDraftConfig = normalizeStudioConfig\(activeState\?\.draft\?\.config \|\| productionConfig\);/);
    assert.match(ui, /const hasUnsavedEdits = JSON\.stringify\(activeConfig\) !== JSON\.stringify\(savedDraftConfig\);/);
    assert.match(ui, /const draftDiffersFromProduction = JSON\.stringify\(savedDraftConfig\) !== JSON\.stringify\(productionConfig\);/);
    assert.match(ui, /Сначала сохрани локальные изменения в черновик/);
});

test('Sandbox edits only production intents and explains publication scope', () => {
    const ui = read('admin-v2/src/main.jsx');

    assert.match(ui, /const STUDIO_EDITABLE_INTENTS = \['CASUAL', 'EROTIC', 'JOKE'\]/);
    assert.match(ui, /STUDIO_EDITABLE_INTENTS\.map\(intent/);
    assert.match(ui, /AUTO — это маршрутизация Telegram, его не редактируем/);
    assert.match(ui, /Новые ответы всех пользователей этого intent получат сохранённый черновик/);
    assert.match(ui, /Тест ответов и публикация/);
    assert.match(ui, /Система: провайдеры и правила/);
});

test('Production no longer exposes legacy generation controls that bypass versioned intent configs', () => {
    const ui = read('admin-v2/src/main.jsx');

    assert.doesNotMatch(ui, /<span className="eyebrow">Режимы генерации<\/span>/);
    assert.doesNotMatch(ui, /routingSettings\[\`\$\{mode\}Temperature\`\]/);
    assert.match(ui, /function ProductionPromptModulesPanel/);
    assert.match(ui, /Живые тексты Production/);
    assert.match(ui, /публикация CASUAL \/ EROTIC \/ JOKE их не включает/);
    assert.doesNotMatch(ui, /CommandPalette|cmdOpen|Поиск.*⌘K/);
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

test('Sandbox comparison keeps generic A/B selection helper compatible', () => {
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

test('Sandbox defaults to frozen Production versus local candidate comparison', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /const \[comparisonMode, setComparisonMode\] = useState\('production'\)/);
    assert.match(source, /studioConfigToSandboxPreset\(productionConfig, `Production v\$\{productionVersion\} · \$\{activeIntent\}`\)/);
    assert.match(source, /studioConfigToSandboxPreset\(activeConfig, `Кандидат · \$\{activeIntent\}`\)/);
    assert.match(source, /api\('\/api\/sandbox\/ab-test'/);
    assert.match(source, /Production ↔ Черновик/);
    assert.match(source, /одинаковые intent, сообщение, историю и контекст/);
});

test('Sandbox keeps free A/B behind an expert disclosure and declares preset scope', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /Экспертный режим: свободный A\/B/);
    assert.match(source, /Наборы для старта/);
    assert.match(source, /Применение меняет локальные кандидаты; оно не сохраняет и не публикует/);
    assert.match(source, /AUTO, CASUAL, EROTIC и JOKE/);
});

test('Sandbox makes global Production rules a separate immediate-save surface', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /Общие правила Production/);
    assert.match(source, /Сохраняются сразу и влияют на будущие ответы всех пользователей/);
    assert.match(source, /function ProductionPromptModulesPanel/);
    assert.match(css, /\.studio-editor-layout \{ display: grid; grid-template-columns:/);
    assert.match(css, /\.studio-result-columns \{ display: grid; grid-template-columns: repeat\(2,/);
    assert.match(css, /@media \(max-width: 900px\)/);
});
