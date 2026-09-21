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

    assert.match(prompt, /## КОНТЕКСТ/);
    assert.match(prompt, /Используй её только когда она уместна/);
    assert.match(prompt, /Не добавляй к аналитике выдуманные факты/);
    assert.match(prompt, /События из аналитики уже завершились\. Говори о них в прошедшем времени/);
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

    assert.match(prompt, /Пауза: возвращение к диалогу/);
    assert.doesNotMatch(prompt, /0–15 минут|30 минут–3 часа|4–8 часов|Больше 8 часов/);
    assert.match(prompt, /Лера приняла душ/);
    assert.match(prompt, /Лера увиделась с Настей/);
    assert.doesNotMatch(prompt, /идёт в туалет|сходила в туалет/);
});

test('a short pause makes the recent conversation stronger than a greeting or schedule', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: { task_type: 'SLEEP_NIGHT' },
        transit: null,
        inventory: [],
        weather: { is_raining: false },
        mood: 70,
        facts: [],
        commitments: [],
        user: { first_name: 'Богдан' },
        preMessageGapSeconds: 5 * 60
    });

    assert.match(prompt, /Непрерывность диалога/);
    assert.match(prompt, /важнее расписания и приветствия пользователя/);
    assert.match(prompt, /Не объявляй, что наступило утро, Лера уснула или только проснулась/);
});

test('newline-separated replies are split into Telegram bubbles', () => {
    const queue = fs.readFileSync(path.join(root, 'src', 'queue.js'), 'utf8');

    assert.match(queue, /splitResponseMessages/);
    assert.match(queue, /utils\/response_text\.js/);
});

test('formatHumanGap correctly humanizes time pauses', async () => {
    const { formatHumanGap } = await import('../src/ai.js');
    assert.equal(formatHumanGap(45), 'меньше минуты');
    assert.equal(formatHumanGap(600), '10 мин.');
    assert.equal(formatHumanGap(3600), '1 ч.');
    assert.equal(formatHumanGap(6660), '1 ч. 51 мин.');
    assert.equal(formatHumanGap(7200), '2 ч.');
    assert.equal(formatHumanGap(86400 + 7200), '1 дн. 2 ч.');
});

test('long pauses provide transient activity completion guidance', () => {
    const prompt = ContextBuilder.toPrompt({
        state: { needs: {}, physiology: {}, active_modifiers: [] },
        location: { name: 'Квартира на Петроградке' },
        activeTask: null,
        transit: null,
        inventory: [],
        weather: { is_raining: false },
        mood: 70,
        facts: [],
        commitments: [],
        user: { first_name: 'Богдан' },
        preMessageGapSeconds: 6660 // 1 hour 51 mins
    });

    assert.match(prompt, /Прошедшее время: после предыдущей реплики прошло 1 ч\. 51 мин\. назад/);
    assert.match(prompt, /Короткие бытовые процессы собеседника \(еда, чай\/кофе, душ, короткая дорога\) давно завершены/);
});

