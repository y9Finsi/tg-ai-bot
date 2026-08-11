import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLeraReply, getQualityFallback, requiresReplyRetry } from '../src/ai/response_quality.js';
import { ContextBuilder } from '../src/ai/context_builder.js';
import { normalizeIntent, isExplicitJokeRequest } from '../src/ai/intent_router.js';

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

test('intent router accepts Cyrillic lookalikes in an intent label', () => {
    assert.equal(normalizeIntent('EROТIC'), 'EROTIC');
});

test('JOKE requires an explicit joke request in the current user message', () => {
    assert.equal(isExplicitJokeRequest('расскажи анекдот'), true);
    assert.equal(isExplicitJokeRequest('ну другое тогда чтонибудь'), false);
    assert.equal(isExplicitJokeRequest('давай'), false);
});

test('an empty reply after media parsing is retried instead of falling back immediately', () => {
    const quality = evaluateLeraReply('', 'ну другое тогда чтонибудь', null, { mode: 'JOKE' });

    assert.ok(quality.violations.includes('nonEmpty'));
    assert.equal(requiresReplyRetry(quality.violations), true);
});

test('production media instruction forbids tag-only or unrelated image responses', () => {
    const engine = fs.readFileSync(path.join(root, 'src', 'ai.js'), 'utf8');

    assert.match(engine, /Не присылай несвязанное фото сама по себе/);
    assert.match(engine, /никогда не отвечай одним тегом \[IMAGE/);
});

test('a valid media-only reply is not rejected after the IMAGE tag is parsed', () => {
    const engine = fs.readFileSync(path.join(root, 'src', 'ai.js'), 'utf8');

    assert.match(engine, /const isMediaOnlyReply = Boolean\(photo\) && !text/);
    assert.match(engine, /Boolean\(userText\) && !isMediaOnlyReply/);
    assert.match(engine, /!\(photo && !text\) && !finalQuality\.passed/);
});

test('a photo is recorded only after Telegram accepts it', () => {
    const engine = fs.readFileSync(path.join(root, 'src', 'ai.js'), 'utf8');
    const queue = fs.readFileSync(path.join(root, 'src', 'queue.js'), 'utf8');

    assert.doesNotMatch(engine, /recordPhotoSent/);
    assert.match(queue, /await bot\.telegram\.sendPhoto\(chatId, response\.photo\);[\s\S]{0,300}recordPhotoSent\(userId, response\.photoRecordId\)/);
});

test('clearing history invalidates stale queued responses and excludes older events', () => {
    const db = fs.readFileSync(path.join(root, 'src', 'db', 'database.js'), 'utf8');
    const queue = fs.readFileSync(path.join(root, 'src', 'queue.js'), 'utf8');

    assert.match(db, /chat_history_cleared_at TIMESTAMPTZ/);
    assert.match(db, /occurred_at > COALESCE\(\(/);
    assert.match(queue, /historyClearedAtBeforeGeneration/);
    assert.match(queue, /historyClearedAtAfterGeneration/);
});
