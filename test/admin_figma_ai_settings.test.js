import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AI_SETTINGS_PATH = path.resolve(process.cwd(), 'admin-linear/src/components/AiSettingsTab.jsx');

test('Figma AI Settings (Настройка ИИ) Redesign - Node 13:1719 Contracts', async (t) => {
    assert.ok(fs.existsSync(AI_SETTINGS_PATH), 'AiSettingsTab.jsx must exist');
    const source = fs.readFileSync(AI_SETTINGS_PATH, 'utf8');

    await t.test('1. Layout has 1042px container and 2 columns (393px and 592px)', () => {
        assert.ok(source.includes('max-w-[1042px]'), 'Container must have max-w-[1042px]');
        assert.ok(source.includes('w-[393px]') || source.includes('max-w-[393px]'), 'Left column must be 393px');
        assert.ok(source.includes('w-[592px]') || source.includes('max-w-[592px]') || source.includes('flex-1'), 'Right column must have 592px or flex-1 in container');
    });

    await t.test('2. Left column implements Prompts header and Новый промпт button', () => {
        assert.ok(source.includes('Промпты'), 'Left column title must be Промпты');
        assert.ok(source.includes('Новый промпт'), 'Must have button Новый промпт');
        assert.ok(source.includes('bg-[#292e5e]'), 'Button must use Figma #292e5e color');
    });

    await t.test('3. Left column implements prompt cards with Style A and Style B tokens', () => {
        assert.ok(source.includes('rounded-[23px]'), 'Prompt card must have rounded-[23px]');
        assert.ok(source.includes('bg-[#000212]') || source.includes('#000212'), 'Style A must use #000212 fill');
        assert.ok(source.includes('#8693ff'), 'Style A must use #8693ff border');
        assert.ok(source.includes('h-[108px]') || source.includes('min-h-[108px]'), 'Inner content box must be 108px high');
        assert.ok(source.includes('rounded-[20px]'), 'Inner content box must have rounded-[20px]');
    });

    await t.test('4. Right column implements surface selector tabs (Личка, Тг-канал, Инициатива)', () => {
        assert.ok(source.includes('Личка'), 'Must have Личка tab');
        assert.ok(source.includes('Тг-канал'), 'Must have Тг-канал tab');
        assert.ok(source.includes('Инициатива'), 'Must have Инициатива tab');
        assert.ok(source.includes('#232425'), 'Active surface tab must use #232425');
        assert.ok(source.includes('rounded-[12px]'), 'Active surface tab must have rounded-[12px]');
    });

    await t.test('5. Right column implements Rules header and Добавить правило button', () => {
        assert.ok(source.includes('Правила'), 'Rules header must be Правила');
        assert.ok(source.includes('Добавить правило'), 'Must have button Добавить правило');
    });

    await t.test('6. Rule card implements Instructions sub-box and parameter cards (Токены, Темп)', () => {
        assert.ok(source.includes('Инструкции'), 'Must have Инструкции subheader');
        assert.ok(source.includes('Токены') || source.includes('max_tokens'), 'Must have Токены parameter card');
        assert.ok(source.includes('Темп') || source.includes('temperature'), 'Must have Темп parameter card');
        assert.ok(source.includes('w-[288px]') || source.includes('w-[272px]'), 'Sub-cards must follow 288px / 272px dimensions');
    });

    await t.test('7. Connects to real /api/admin/lera-profile backend', () => {
        assert.ok(source.includes('/api/admin/lera-profile'), 'Must fetch and save via /api/admin/lera-profile');
    });

    await t.test('8. Canon and system prompts always go first in prompt lists', () => {
        assert.ok(source.includes('sortPrompts'), 'Must implement sortPrompts helper');
        assert.ok(source.includes('prompt_bio'), 'prompt_bio must be registered as canon');
        assert.ok(source.includes('is_canonical'), 'Must support is_canonical flag');
        assert.ok(source.includes('Канон и биография'), 'Title must be Канон и биография');
    });

    await t.test('9. Left column header dropdown allows switching between Промпты and Провайдеры', () => {
        assert.ok(source.includes('leftTab'), 'Must manage leftTab state');
        assert.ok(source.includes('leftMenuOpen'), 'Must manage leftMenuOpen state');
        assert.ok(source.includes('Провайдеры'), 'Dropdown must include Провайдеры option');
        assert.ok(source.includes('Новый провайдер'), 'Action button must change to Новый провайдер');
    });

    await t.test('10. Providers stack supports primary activation, fallback reordering, and provider modal', () => {
        assert.ok(source.includes('/api/admin/providers'), 'Must connect to /api/admin/providers API');
        assert.ok(source.includes('handleActivateProvider'), 'Must support activating primary provider');
        assert.ok(source.includes('handleMoveFallback'), 'Must support reordering fallback priority');
        assert.ok(source.includes('providerModalOpen'), 'Must implement provider modal');
        assert.ok(source.includes('Сделать основным'), 'Must render Сделать основным action');
    });

    await t.test('11. Rules support configuring primary provider and fallback chain', () => {
        assert.ok(source.includes('provider_id'), 'Rule modal and state must support provider_id');
        assert.ok(source.includes('fallback_provider_ids'), 'Rule modal and state must support fallback_provider_ids');
        assert.ok(source.includes('ruleSelectedFallbackIds'), 'Must manage ruleSelectedFallbackIds selection');
        assert.ok(source.includes('Цепочка фоллбэков'), 'Must have fallback chain selector');
    });

    await t.test('12. Rule card renders Посмотреть сырой промпт button in right sub-card area', () => {
        assert.ok(source.includes('Посмотреть сырой промпт'), 'Must have Посмотреть сырой промпт button');
        assert.ok(source.includes('handleOpenRawPrompt'), 'Must wire click to handleOpenRawPrompt');
        assert.ok(source.includes('/api/admin/raw-prompt-preview'), 'Must call /api/admin/raw-prompt-preview');
    });

    await t.test('13. Implements RawPromptModal with Radiant context, history, and full payload view', () => {
        assert.ok(source.includes('rawPromptModalOpen'), 'Must manage rawPromptModalOpen state');
        assert.ok(source.includes('Сырой промпт при запросе'), 'Must render modal title');
        assert.ok(source.includes('rawPromptTab'), 'Must manage tab switching between full, system, radiant, history');
        assert.ok(source.includes('handleCopyRawPrompt'), 'Must implement handleCopyRawPrompt');
    });
});

