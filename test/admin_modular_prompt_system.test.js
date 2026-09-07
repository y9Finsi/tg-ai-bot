import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModularRulePrompt, ModularPromptResult, getRoutedSystemPrompt } from '../src/prompts.js';
import { renderPromptTemplate, DEFAULT_PROMPT_TEMPLATES } from '../src/ai/prompt_renderer.js';

test('ModularPromptResult behaves as string while exposing metadata', () => {
    const res = new ModularPromptResult('Hello world', {
        isModular: true,
        toolsEnabled: false,
        rule: { id: 'test_rule' }
    });

    assert.equal(String(res), 'Hello world');
    assert.equal(res.length, 11);
    assert.equal(res + ' test', 'Hello world test');
    assert.equal(res.isModular, true);
    assert.equal(res.toolsEnabled, false);
    assert.equal(res.rule.id, 'test_rule');
});

test('Rule with attachedPromptIds = [] produces strictly 0 characters', async () => {
    const emptyRule = {
        id: 'rule_empty',
        title: 'Empty Rule',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: []
    };
    const profile = { blocks: [] };
    const context = { time: '14:00', weather: 'ясно' };

    const res = await resolveModularRulePrompt(emptyRule, profile, context);

    assert.equal(res.isModular, true);
    assert.equal(String(res), '');
    assert.equal(res.length, 0);
    assert.equal(res.toolsEnabled, false);
});

test('Rule with custom prompt module contains ONLY that module', async () => {
    const customRule = {
        id: 'rule_custom',
        title: 'Custom Rule',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['custom_block_1']
    };
    const profile = {
        blocks: [
            {
                id: 'custom_block_1',
                category: 'prompt_module',
                title: 'Мой кастомный промпт',
                content: 'Ты дерзкий собеседник без правил.'
            }
        ]
    };

    const res = await resolveModularRulePrompt(customRule, profile, {});

    assert.equal(res.isModular, true);
    assert.equal(String(res), 'Ты дерзкий собеседник без правил.');
    assert.equal(res.toolsEnabled, false);
});

test('Rule with prompt_radiant correctly renders dynamic variables', async () => {
    const radiantRule = {
        id: 'rule_radiant',
        title: 'Radiant Rule',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['prompt_radiant']
    };
    const profile = { blocks: [] };
    const context = {
        time: 'вечер, 21:30',
        location: 'Бар на Рубинштейна',
        weather: 'дождь, +12°C',
        needs: 'сытость 90%, бодрость 60%',
        outfit: 'кожаная куртка и джинсы',
        status: 'пьет сидр с друзьями'
    };

    const res = await resolveModularRulePrompt(radiantRule, profile, context);

    assert.equal(res.isModular, true);
    const text = String(res);
    assert.match(text, /Время:\s+вечер, 21:30/);
    assert.match(text, /Локация:\s+Бар на Рубинштейна/);
    assert.match(text, /Погода:\s+дождь, \+12°C/);
    assert.match(text, /Самочувствие:\s+сытость 90%, бодрость 60%/);
    assert.match(text, /Одежда:\s+кожаная куртка и джинсы/);
    assert.match(text, /Занятие:\s+пьет сидр с друзьями/);
});

test('Rule with prompt_memory correctly renders memory facts', async () => {
    const memoryRule = {
        id: 'rule_mem',
        title: 'Memory Rule',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['prompt_memory']
    };
    const profile = { blocks: [] };
    const context = {
        memoryFacts: '- Пользователь фотограф из СПБ\n- Любит раф кофе'
    };

    const res = await resolveModularRulePrompt(memoryRule, profile, context);

    assert.equal(res.isModular, true);
    const text = String(res);
    assert.match(text, /ДОЛГОСРОЧНАЯ ПАМЯТЬ/);
    assert.match(text, /Пользователь фотограф из СПБ/);
    assert.match(text, /Любит раф кофе/);
});

test('Tools are enabled if and only if prompt_tools is attached', async () => {
    const withoutToolsRule = {
        id: 'rule_no_tools',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['prompt_radiant']
    };
    const withToolsRule = {
        id: 'rule_with_tools',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['prompt_radiant', 'prompt_tools']
    };
    const profile = { blocks: [] };

    const resWithout = await resolveModularRulePrompt(withoutToolsRule, profile, {});
    const resWith = await resolveModularRulePrompt(withToolsRule, profile, {});

    assert.equal(resWithout.toolsEnabled, false);
    assert.equal(resWith.toolsEnabled, true);
});

test('Attached prompt modules order is strictly preserved', async () => {
    const orderRule = {
        id: 'rule_order',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['custom_b', 'custom_a']
    };
    const profile = {
        blocks: [
            { id: 'custom_a', category: 'prompt_module', content: 'FIRST IN FILE' },
            { id: 'custom_b', category: 'prompt_module', content: 'SECOND IN FILE' }
        ]
    };

    const res = await resolveModularRulePrompt(orderRule, profile, {});
    const text = String(res);

    assert.equal(text, 'SECOND IN FILE\n\nFIRST IN FILE');
});

test('Deleted prompt modules are excluded from assembly', async () => {
    const rule = {
        id: 'rule_deleted',
        surface: 'CHAT',
        mode: 'CASUAL',
        attachedPromptIds: ['custom_1', 'custom_2']
    };
    const profile = {
        deletedPromptIds: ['custom_1'],
        blocks: [
            { id: 'custom_1', category: 'prompt_module', content: 'SHOULD BE EXCLUDED' },
            { id: 'custom_2', category: 'prompt_module', content: 'SHOULD BE INCLUDED' }
        ]
    };

    const res = await resolveModularRulePrompt(rule, profile, {});
    assert.equal(String(res), 'SHOULD BE INCLUDED');
});
