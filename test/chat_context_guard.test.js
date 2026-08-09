import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContextBuilder } from '../src/ai/context_builder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('day context is background only and an unclear message requires clarification', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: { task_type: 'SOCIAL_NASTYA' },
        transit: null,
        inventory: [],
        weather: { is_raining: false },
        mood: 70,
        facts: [],
        commitments: [],
        user: { first_name: 'Богдан' }
    });

    assert.match(prompt, /\[КОНТЕКСТ\]/);
    assert.match(prompt, /Используй контекст только когда он уместен/);
    assert.match(prompt, /Не придумывай факты или подробности событий/);
    assert.match(prompt, /События уже произошли; планы — только намерения/);
});

test('sleeping context overrides outdoor clothing with natural home sleepwear', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: { task_type: 'SLEEP_NIGHT' },
        transit: null,
        inventory: [
            { item_type: 'clothes', item_id: 'trench_coat', is_equipped: true, quantity: 1, properties: { slot: 'outerwear' } },
            { item_type: 'clothes', item_id: 'white_sneakers', is_equipped: true, quantity: 1, properties: { slot: 'shoes' } }
        ],
        weather: { is_raining: false },
        mood: 70,
        facts: [],
        commitments: [],
        user: { first_name: 'Богдан' }
    });

    assert.match(prompt, /Текущий статус: Спит/);
    assert.match(prompt, /Одежда дома: Oversized футболка \/ пижама/);
    assert.doesNotMatch(prompt, /trench|sneaker|плащ|кроссовк/i);
});

test('pause guidance and historical events do not expose live micro-actions', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: null,
        transit: null,
        inventory: [],
        weather: { is_raining: false },
        mood: 70,
        facts: [
            { event_type: 'TASK_COMPLETED', payload: { taskType: 'GO_TO_BATHROOM' } },
            { event_type: 'TASK_COMPLETED', payload: { taskType: 'SHOWER_HOME' } },
            { event_type: 'TASK_COMPLETED', payload: { taskType: 'SOCIAL_NASTYA' } }
        ],
        commitments: [],
        user: { first_name: 'Богдан' },
        preMessageGapSeconds: 2 * 3600
    });

    assert.match(prompt, /Пауза в диалоге: возвращение к диалогу/);
    assert.doesNotMatch(prompt, /0–15 минут|30 минут–3 часа|4–8 часов|Больше 8 часов/);
    assert.match(prompt, /Лера приняла душ/);
    assert.match(prompt, /Лера увиделась с Настей/);
    assert.doesNotMatch(prompt, /идёт в туалет|сходила в туалет/);
});

test('newline-separated replies are split into Telegram bubbles', () => {
    const queue = fs.readFileSync(path.join(root, 'src', 'queue.js'), 'utf8');

    assert.match(queue, /splitResponseMessages/);
    assert.match(queue, /utils\/response_text\.js/);
});

test('location-and-Nastya answer is not baked into the standard dialogue examples', () => {
    const examples = fs.readFileSync(path.join(root, 'src', 'prompts', 'lera_examples.txt'), 'utf8');

    assert.doesNotMatch(examples, /Да я тут с Настей застряла/);
});
