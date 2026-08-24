import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    CHANNEL_CONTENT_FORMATS,
    CHANNEL_EDITORIAL_MODES,
    DEFAULT_REFERENCE_FORMAT_SEQUENCE,
    getChannelFormatLimits,
    describeChannelContentFormat,
    normalizeChannelEditorialMode,
    normalizeChannelFormatSequence,
    adaptChannelText,
    validateChannelText,
    selectChannelContentFormat
} from '../src/channel_content.js';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

export function adaptChannelTextRef(text, contentFormat = 'life_observation', editorialMode = 'reference_short') {
    return validateChannelText(text, contentFormat, editorialMode);
}

describe('Intelligent Channel Text Adaptation', () => {

    // =========================================================================
    // TIER 1: Core Contract & Happy Paths (min 5 tests)
    // =========================================================================
    describe('Tier 1: Core Contract & Happy Paths', () => {

        it('T1.1: Format limits match required specification for all 7 formats', () => {
            const expectedLimits = {
                short_thought: { maxChars: 160, maxLines: 3, maxParagraphs: 1 },
                photo_caption: { maxChars: 120, maxLines: 2, maxParagraphs: 1 },
                life_observation: { maxChars: 240, maxLines: 4, maxParagraphs: 2 },
                long_monologue: { maxChars: 500, maxLines: 8, maxParagraphs: 3 },
                question: { maxChars: 160, maxLines: 2, maxParagraphs: 1 },
                meme_caption: { maxChars: 140, maxLines: 2, maxParagraphs: 1 },
                repost_reaction: { maxChars: 160, maxLines: 3, maxParagraphs: 1 }
            };

            for (const [format, expected] of Object.entries(expectedLimits)) {
                const actual = getChannelFormatLimits(format);
                assert.deepEqual(actual, expected, `Mismatch in limits for format ${format}`);
            }
        });

        it('T1.2: Text exactly at limit passes without modification', () => {
            const shortThought = 'А'.repeat(160);
            const res = adaptChannelTextRef(shortThought, 'short_thought');
            assert.equal(res.ok, true);
            assert.equal(res.text.length, 160);
        });

        it('T1.3: Normalizes excess whitespace and tabs into single space', () => {
            const messy = 'Сижу    на  паре   в   СПбГИК.\t\tПреподаватель   жжет.';
            const res = adaptChannelTextRef(messy, 'short_thought');
            assert.equal(res.ok, true);
            assert.equal(res.text, 'Сижу на паре в СПбГИК. Преподаватель жжет.');
        });

        it('T1.4: Minor overflow (10% over limit) truncates cleanly at sentence boundary', () => {
            // short_thought limit is 160. Text is 176 chars (2 sentences).
            const sentence1 = 'Сегодня на Невском опять пошел дождь, промокли кеды и настроение на нуле.'; // 73 chars
            const sentence2 = 'Купила горячий кофе на Сенной, стало немного теплее жить.'; // 57 chars
            const sentence3 = 'Поеду домой спать.'; // 18 chars
            const fullText = `${sentence1} ${sentence2} ${sentence3}`; // 73 + 1 + 57 + 1 + 18 = 150 chars

            // Let's add extra sentence pushing it to 175 chars (within 20% overflow of 160)
            const extraOverflow = `${sentence1} ${sentence2}. А в метро куча людей и духота.`; // ~170 chars

            const res = adaptChannelTextRef(extraOverflow, 'short_thought');
            assert.equal(res.ok, true, 'Should adapt 10% overflow successfully');
            assert.ok(res.text.length <= 160, `Adapted text length ${res.text.length} must be <= 160`);
            assert.ok(res.text.endsWith('.'), 'Should end with clean sentence terminator');
        });

        it('T1.5: photo_caption format collapses multiple linebreaks into single line', () => {
            const multiLine = 'Первая строка\n\nВторая строка\n\nТретья';
            const res = adaptChannelTextRef(multiLine, 'photo_caption');
            assert.equal(res.ok, true);
            assert.equal(res.text.includes('\n'), false, 'photo_caption must be single line');
            assert.equal(res.text, 'Первая строка Вторая строка Третья');
        });
    });

    // =========================================================================
    // TIER 2: Boundary Conditions & Overflow Tolerance (min 5 tests)
    // =========================================================================
    describe('Tier 2: Boundary Conditions & Tolerance Thresholds', () => {

        it('T2.1: Exactly 20% overflow adapts if sentence/clause break is present', () => {
            // limit = 160, +20% = 192 chars
            const base140 = 'Гуляю по набережной Фонтанки, смотрю на воду и думаю о том, как быстро пролетает лето в Питере.'; // 96 chars
            const extra40 = ' Вечером надо доделать презентацию.'; // 35 chars -> 131 chars
            const overflow = ' И еще купить молока в Дикси.'; // 29 chars -> 160 chars
            const tail = ' А потом.'; // 9 chars -> 169 chars

            const text = `${base140}${extra40}${overflow}${tail}`;
            const res = adaptChannelTextRef(text, 'short_thought');
            assert.equal(res.ok, true);
            assert.ok(res.text.length <= 160);
        });

        it('T2.2: Hard rejection when text exceeds 20% overflow (e.g. 210 chars for 160 limit)', () => {
            const wayTooLong = 'Это очень длинный текст, который значительно превышает допустимый лимит символов для короткой мысли. '.repeat(3);
            const res = adaptChannelTextRef(wayTooLong, 'short_thought');
            assert.equal(res.ok, false);
            assert.equal(res.code, 'CHANNEL_TOO_LONG');
        });

        it('T2.3: Empty or blank string returns CHANNEL_EMPTY', () => {
            const res1 = adaptChannelTextRef('', 'life_observation');
            assert.equal(res1.ok, false);
            assert.equal(res1.code, 'CHANNEL_EMPTY');

            const res2 = adaptChannelTextRef('   \n\t  ', 'photo_caption');
            assert.equal(res2.ok, false);
            assert.equal(res2.code, 'CHANNEL_EMPTY');
        });

        it('T2.4: life_observation format preserves up to 2 paragraphs while normalizing lines', () => {
            const twoPara = 'Первый абзац о погоде в Питере.\n\nВторой абзац о планах на вечер.';
            const res = adaptChannelTextRef(twoPara, 'life_observation');
            assert.equal(res.ok, true);
            const paragraphs = res.text.split(/\n\s*\n/).filter(Boolean);
            assert.equal(paragraphs.length, 2);
        });

        it('T2.5: Format not in reference_short triggers CHANNEL_FORMAT_MISMATCH under reference_short mode', () => {
            const valRes = validateChannelText('Текст монолога', 'long_monologue', 'reference_short');
            assert.equal(valRes.ok, false);
            assert.equal(valRes.code, 'CHANNEL_FORMAT_MISMATCH');

            const valResMix = validateChannelText('Текст монолога', 'long_monologue', 'legacy_mix');
            assert.equal(valResMix.ok, true);
        });
    });

    // =========================================================================
    // TIER 3: Cross-Feature Interactions & Format Selection
    // =========================================================================
    describe('Tier 3: Cross-Feature Interactions', () => {

        it('T3.1: selectChannelContentFormat respects editorial mode and cycling sequence', () => {
            const format1 = selectChannelContentFormat({
                recentPosts: [{ provenance: { content_format: 'photo_caption' } }],
                hasMedia: false,
                editorialMode: 'reference_short',
                formatSequence: DEFAULT_REFERENCE_FORMAT_SEQUENCE
            });

            assert.equal(format1, 'short_thought', 'Next format after photo_caption should be short_thought');

            const format2 = selectChannelContentFormat({
                recentPosts: [{ provenance: { content_format: 'short_thought' } }],
                hasMedia: false,
                editorialMode: 'reference_short',
                formatSequence: DEFAULT_REFERENCE_FORMAT_SEQUENCE
            });

            assert.equal(format2, 'life_observation', 'Next format after short_thought should be life_observation');
        });

        it('T3.2: describeChannelContentFormat returns non-empty descriptive guidelines for every format', () => {
            for (const format of CHANNEL_CONTENT_FORMATS) {
                const desc = describeChannelContentFormat(format);
                assert.ok(typeof desc === 'string' && desc.length > 10, `Missing description for ${format}`);
            }
        });
    });

    // =========================================================================
    // TIER 4: Realistic Channel Copy Scenarios
    // =========================================================================
    describe('Tier 4: Realistic Channel Copy Scenarios', () => {

        it('T4.1: Real colloquial post with emojis, punctuation and hashtags adapts cleanly', () => {
            const rawPost = `  кароч пришла в кофейню на Рубинштейна ☕️✨
            бариста перепутал сироп, но получилось даже вкуснее обычного латте!
            щас посижу полчаса и побегу на учебу в СПбГИК 🏃‍♀️ #питер  `;

            const res = adaptChannelTextRef(rawPost, 'life_observation');
            assert.equal(res.ok, true);
            assert.ok(res.text.includes('кароч пришла в кофейню'));
            assert.ok(res.text.length <= 240);
        });
    });

    // =========================================================================
    // TIER 5: Adversarial Unicode & Stress Tests
    // =========================================================================
    describe('Tier 5: Adversarial & Unicode Edge Variations', () => {

        it('T5.1: Handles emoji sequences, zero-width joiners, and non-breaking spaces without corrupting characters', () => {
            const unicodeText = 'Питер\u00A0— город\u200B дождей 🌧️👩‍🎓❤️. Все мокрое.';
            const res = adaptChannelTextRef(unicodeText, 'short_thought');
            assert.equal(res.ok, true);
            assert.ok(res.text.includes('Питер'));
            assert.ok(res.text.includes('🌧️'));
        });

        it('T5.2: Text without any punctuation in overflow zone falls back to word boundary', () => {
            // 175 chars of words without periods
            const words = 'слово '.repeat(30).trim(); // ~180 chars
            const res = adaptChannelTextRef(words, 'short_thought');
            assert.equal(res.ok, true);
            assert.ok(res.text.length <= 160);
        });
    });
});
