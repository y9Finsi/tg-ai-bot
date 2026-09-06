import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Lera Profile API in server.js supports sampling parameters and live dry-run endpoint', () => {
    const server = read('src/server.js');

    // GET /api/admin/lera-profile returns sampling
    assert.match(server, /app\.get\('\/api\/admin\/lera-profile'/);
    assert.match(server, /sampling:\s*\{/);
    assert.match(server, /temperature:\s*parseFloat\(tempVal\)/);
    assert.match(server, /max_tokens:\s*parseInt\(tokensVal/);

    // POST /api/admin/lera-profile saves sampling into settings
    assert.match(server, /app\.post\('\/api\/admin\/lera-profile'/);
    assert.match(server, /setSetting\('llm_temperature'/);
    assert.match(server, /setSetting\('llm_max_tokens'/);
    assert.match(server, /setSetting\('typing_delay_enabled'/);

    // POST /api/admin/llm-sandbox exists and evaluates output
    assert.match(server, /app\.post\('\/api\/admin\/llm-sandbox'/);
    assert.match(server, /getLeraProfileProjection/);
    assert.match(server, /getCachedOpenAIClient/);
    assert.match(server, /fullReply\.split\('\|\|\|'\)/);
    assert.match(server, /latencyMs:\s*durationMs/);
});

test('LeraCharacterBlock implements single-source canon, archetypes, projections, focus-mode and live dry-run', () => {
    const block = read('admin-linear/src/components/LeraCharacterBlock.jsx');

    // Archetype templates
    assert.match(block, /ARCHETYPE_TEMPLATES/);
    assert.match(block, /Канон/);
    assert.match(block, /Дерзкая/);
    assert.match(block, /Ночная меланхолия/);
    assert.match(block, /Мягкая подруга/);

    // Projection tabs (CHAT, CHANNEL, INITIATIVE)
    assert.match(block, /activeSurface/);
    assert.match(block, /Диалог ЛС \(CHAT\)/);
    assert.match(block, /Канал \(CHANNEL\)/);
    assert.match(block, /Инициатива \(INIT\)/);

    // Focus-mode modal support
    assert.match(block, /focusField/);
    assert.match(block, /Maximize2/);

    // Slang chips management
    assert.match(block, /handleRemoveSlang/);
    assert.match(block, /handleAddSlang/);

    // Floating action bar on dirty
    assert.match(block, /isDirty/);
    assert.match(block, /Есть несохраненные изменения/);

    // Live LLM Dry-Run
    assert.match(block, /\/api\/admin\/llm-sandbox/);
    assert.match(block, /latencyMs/);
});

test('AiSettingsTab uses one universal character kanban and preserves the separate channel kanban', () => {
    const aiTab = read('admin-linear/src/components/AiSettingsTab.jsx');
    const universal = read('admin-linear/src/components/UniversalPipelineBoard.jsx');

    // The universal kanban is the only visible character pipeline.
    assert.match(aiTab, /UniversalPipelineBoard/);
    assert.doesNotMatch(aiTab, /Формирование ответа в ЛС/);
    assert.doesNotMatch(aiTab, /LeraCharacterVariations|variations-main/);
    assert.match(universal, /1\. Промпты/);
    assert.match(universal, /2\. Runtime & Tools/);
    assert.match(universal, /3\. Providers/);
    assert.match(universal, /4\. Финальный raw prompt/);
    assert.match(universal, /CHAT/);
    assert.match(universal, /GROUP/);
    assert.match(universal, /CHANNEL/);
    assert.match(universal, /COMMENTS/);
    assert.match(universal, /INITIATIVE/);
    assert.match(universal, /PRESETS/);
    assert.match(universal, /Добавить prompt-модуль с условиями/);
    assert.match(universal, /CONDITION_FIELDS/);
    assert.match(universal, /Добавить AND-условие/);
    assert.match(universal, /api\(.+lera-profile/);
    assert.match(universal, /api\(.+lera-profile\/compile/);

    // Telegram channel autoposting remains a separate reusable flow.
    assert.match(aiTab, /Автопостинг в канал/);
    assert.match(aiTab, /handleTriggerChannelPost/);

    // No old fake dry run handler in AiSettingsTab.
    assert.doesNotMatch(aiTab, /handleExecuteDryRun/);
    assert.doesNotMatch(aiTab, /setDryRunResult/);
});
