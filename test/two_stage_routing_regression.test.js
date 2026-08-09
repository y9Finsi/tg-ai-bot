import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLeraReply, getQualityFallback } from '../src/ai/response_quality.js';
import { ContextBuilder } from '../src/ai/context_builder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sleeping context gives text-only guidance without erotic pause examples', () => {
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
        user: { first_name: 'Богдан' }
    });

    assert.match(prompt, /Состояние сна: можно коротко сказать/i);
    assert.match(prompt, /Не имитируй голос, слух, шёпот, дыхание или звуки/i);
    assert.doesNotMatch(prompt, /\.\.\.ммм/i);
    assert.doesNotMatch(prompt, /ты че не слышишь/i);
});

test('CASUAL fallback does not include erotic examples or erotic speech rule', () => {
    const promptsSource = fs.readFileSync(path.join(root, 'src', 'prompts.js'), 'utf8');
    const speech = fs.readFileSync(path.join(root, 'src', 'prompts', 'lera_speech.txt'), 'utf8');
    const casualExamples = fs.readFileSync(path.join(root, 'src', 'prompts', 'lera_examples.txt'), 'utf8');

    assert.doesNotMatch(promptsSource, /routing_casual:\s*\(\)\s*=>\s*\[[^\]]*lera_virt_examples/i);
    assert.doesNotMatch(speech, /возбуждена[\s\S]{0,120}многоточиями/i);
    assert.doesNotMatch(casualExamples, /ПРИМЕРЫ ДИАЛОГОВ ДЛЯ ВИРТА/i);
});

test('CASUAL quality gate does not try to script linguistic style', () => {
    const samples = [
        '...чё',
        '...ммм...',
        '...ты че не слышишь...',
        'тише, я сплю'
    ];

    for (const sample of samples) {
        const result = evaluateLeraReply(sample, 'привет', null, { mode: 'CASUAL' });
        assert.equal(result.passed, true, sample);
    }
});

test('CASUAL allows ordinary sleeping wording', () => {
    const result = evaluateLeraReply('я спала ващето, ты че не спишь', 'привет', null, { mode: 'CASUAL' });
    assert.equal(result.passed, true);
});

test('EROTIC is not blocked by erotic punctuation rules', () => {
    const result = evaluateLeraReply('...ммм... блин...', 'продолжай', null, { mode: 'EROTIC' });
    assert.equal(result.passed, true);
});

test('CASUAL quality gate does not hardcode age semantics', () => {
    const result = evaluateLeraReply('мне 19', 'сколько тебе?', null, { mode: 'CASUAL' });
    assert.equal(result.passed, true);
});

test('CASUAL rejects repeated sleep question from recent replies', () => {
    const result = evaluateLeraReply(
        'ты че не спишь',
        'привет',
        null,
        { mode: 'CASUAL', recentReplies: ['ты че не спишь'] }
    );
    assert.equal(result.passed, false);
    assert.ok(result.violations.includes('noRecentRepeat'));
});

test('quality fallback is safe for CASUAL and JOKE', () => {
    const casualFallback = getQualityFallback('CASUAL');
    const jokeFallback = getQualityFallback('JOKE');

    assert.equal(evaluateLeraReply(casualFallback, '?', null, { mode: 'CASUAL' }).passed, true);
    assert.equal(evaluateLeraReply(jokeFallback, 'пошути', null, { mode: 'JOKE' }).passed, true);
    assert.doesNotMatch(casualFallback, /\.\.\.|ммм|слышишь|мне 19/i);
});
