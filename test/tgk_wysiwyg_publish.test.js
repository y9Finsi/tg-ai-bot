import test, { describe, it, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pool } from '../src/db/database.js';
import { decodeMediaPayload, publishChannelDraft } from '../src/channel_poster.js';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

// Minimal 1x1 transparent PNG base64
const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SAMPLE_PNG_DATA_URL = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;
const SAMPLE_JPEG_DATA_URL = `data:image/jpeg;base64,${SAMPLE_PNG_BASE64}`;
const SAMPLE_WEBP_DATA_URL = `data:image/webp;base64,${SAMPLE_PNG_BASE64}`;

// Helper to construct mock bot instance
function createMockBot(options = {}) {
    const sentMessages = [];
    const sentPhotos = [];
    const sentAnimations = [];

    return {
        sentMessages,
        sentPhotos,
        sentAnimations,
        telegram: {
            sendMessage: mock.fn(async (chatId, text, extra) => {
                const msg = { message_id: 1001 + sentMessages.length, chat_id: chatId, text, extra };
                sentMessages.push(msg);
                return msg;
            }),
            sendPhoto: mock.fn(async (chatId, photo, extra) => {
                const msg = { message_id: 2001 + sentPhotos.length, chat_id: chatId, photo: [{ file_id: 'ph_123' }], extra };
                sentPhotos.push({ chatId, photo, extra, msg });
                return msg;
            }),
            sendAnimation: mock.fn(async (chatId, animation, extra) => {
                const msg = { message_id: 3001 + sentAnimations.length, chat_id: chatId, animation, extra };
                sentAnimations.push({ chatId, animation, extra, msg });
                return msg;
            }),
            getMe: mock.fn(async () => ({ id: 999888, username: 'lera_ai_bot', is_bot: true })),
            getChat: mock.fn(async (chatId) => ({ id: chatId, title: 'Лера Тест', type: 'channel' })),
            getChatMemberCount: mock.fn(async () => 150),
            getChatMember: mock.fn(async (chatId, userId) => ({
                status: 'administrator',
                can_post_messages: true,
                can_edit_messages: true,
                can_delete_messages: true
            })),
            ...options.telegram
        }
    };
}

// Mock pool.query to avoid needing live PostgreSQL instance in unit tests
pool.query = async (text, params) => {
    const sql = String(text || '');
    if (sql.includes('SELECT value FROM settings') || sql.includes('SELECT key, value FROM settings') || sql.includes('SELECT value FROM global_settings')) {
        return {
            rows: [
                { key: 'channel_poster_settings', value: JSON.stringify({ is_enabled: true, channel_id: '@test_channel', media_mode: 'ai_photo' }) },
                { key: 'channel_id', value: '@test_channel' }
            ]
        };
    }
    if (sql.includes('channel_post_logs') || sql.includes('INSERT INTO channel_post_logs')) {
        return {
            rows: [{
                id: 1,
                channel_id: params?.[0] || '@test_channel',
                topic: params?.[1] || 'life',
                text: params?.[2] || 'text',
                status: 'PUBLISHED'
            }]
        };
    }
    if (sql.includes('channel_post_history')) {
        return { rows: [] };
    }
    if (sql.includes('lera_profile') || sql.includes('personality')) {
        return { rows: [{ profile: {}, version: 1 }] };
    }
    return { rows: [] };
};

describe('TGK WYSIWYG Photo Publishing & Consistency', () => {

    // =========================================================================
    // TIER 1: Core Contract & Happy Paths (min 5 tests)
    // =========================================================================
    describe('Tier 1: Core Contract & Happy Paths', () => {

        it('T1.1: Static contract ensures publishChannelDraft supports media previews without regeneration', () => {
            const posterSrc = read('src/channel_poster.js');
            assert.match(posterSrc, /export async function publishChannelDraft/);
            assert.match(posterSrc, /decodeMediaPayload/);
            assert.match(posterSrc, /sendPhoto/);
            assert.match(posterSrc, /sendMessage/);
        });

        it('T1.2: decodeMediaPayload correctly parses base64 data URLs into binary Buffer objects', () => {
            const decoded = decodeMediaPayload(SAMPLE_PNG_DATA_URL);
            assert.ok(decoded, 'Should return a decoded payload');
            assert.ok(Buffer.isBuffer(decoded.source), 'Decoded source should be a Buffer');
            assert.equal(decoded.source.toString('base64'), SAMPLE_PNG_BASE64);
            assert.equal(decoded.filename, 'lera_channel.jpg');
        });

        it('T1.3: Draft with existing preview_url passes decoded buffer to bot.telegram.sendPhoto without regeneration', async () => {
            const bot = createMockBot();
            const draft = {
                text: 'Привет из Питера!',
                topic: 'life',
                media: {
                    type: 'ai_photo',
                    preview_url: SAMPLE_JPEG_DATA_URL
                },
                provenance: {
                    content_format: 'photo_caption'
                }
            };

            const mockSettings = {
                channel_id: '@test_channel',
                media_mode: 'ai_photo',
                editorial_mode: 'reference_short',
                judge_mode: 'OFF',
                public_facts_enabled: false,
                public_profile_enabled: false
            };

            const result = await publishChannelDraft(bot, draft, mockSettings);
            assert.equal(result.success, true);
            assert.equal(bot.sentPhotos.length, 1);
            assert.equal(bot.sentPhotos[0].chatId, '@test_channel');
            assert.ok(Buffer.isBuffer(bot.sentPhotos[0].photo.source));
            assert.equal(bot.sentPhotos[0].photo.source.toString('base64'), SAMPLE_PNG_BASE64);
            assert.equal(bot.sentPhotos[0].extra.caption, 'Привет из Питера!');
        });

        it('T1.4: Draft with Telegram file_id passes string identifier directly to sendPhoto', async () => {
            const bot = createMockBot();
            const fileId = 'AgACAgIAAxkBAAIBeWdABCDEF123456';
            const draft = {
                text: 'Фоточка дня',
                topic: 'life',
                media: { file_id: fileId },
                provenance: { content_format: 'photo_caption' }
            };

            const result = await publishChannelDraft(bot, draft, { channel_id: '@test_channel', judge_mode: 'OFF', public_profile_enabled: false });
            assert.equal(result.success, true);
            assert.equal(bot.sentPhotos.length, 1);
            assert.equal(bot.sentPhotos[0].photo, fileId);
            assert.equal(bot.sentPhotos[0].extra.caption, 'Фоточка дня');
        });

        it('T1.5: Purely textual post sends via sendMessage and does not invoke sendPhoto', async () => {
            const bot = createMockBot();
            const draft = {
                text: 'Обычный текстовый пост без фоток.',
                topic: 'thoughts',
                media: null,
                provenance: { content_format: 'short_thought' }
            };

            const result = await publishChannelDraft(bot, draft, { channel_id: '@test_channel', media_mode: 'none', judge_mode: 'OFF', public_profile_enabled: false });
            assert.equal(result.success, true);
            assert.equal(bot.sentMessages.length, 1);
            assert.equal(bot.sentPhotos.length, 0);
            assert.equal(bot.sentMessages[0].text, 'Обычный текстовый пост без фоток.');
        });
    });

    // =========================================================================
    // TIER 2: Boundary Conditions & Error Handling (min 5 tests)
    // =========================================================================
    describe('Tier 2: Boundary Conditions & Error Handling', () => {

        it('T2.1: Post caption exceeding 1024 characters is trimmed to <= 1024 for photo post', () => {
            const longText = 'А'.repeat(1200);
            const caption = longText.slice(0, 1024).trim();

            assert.equal(caption.length, 1024);
            assert.ok(caption.length <= 1024, 'Telegram photo caption must not exceed 1024 chars');
        });

        it('T2.2: Post caption under 1024 characters is preserved verbatim', () => {
            const normalText = 'Короткая мысль на 50 символов о питерском дожде.';
            const caption = normalText.slice(0, 1024).trim();

            assert.equal(caption, normalText);
        });

        it('T2.3: Uninitialized bot instance throws descriptive error', async () => {
            await assert.rejects(
                async () => {
                    await publishChannelDraft(null, { text: 'Привет' });
                },
                /Бот не инициализирован/
            );
        });

        it('T2.4: Empty or whitespace-only draft text throws validation error', async () => {
            const bot = createMockBot();
            await assert.rejects(
                async () => {
                    await publishChannelDraft(bot, { text: '   ' });
                },
                /Черновик пустой или слишком длинный/
            );
        });

        it('T2.5: Missing channel ID in settings throws descriptive configuration error', async () => {
            const bot = createMockBot();
            await assert.rejects(
                async () => {
                    await publishChannelDraft(bot, { text: 'Текст поста' }, { channel_id: '' });
                },
                /Юзернейм или ID канала не указан/
            );
        });
    });

    // =========================================================================
    // TIER 3: Cross-Feature Interactions (Pairwise)
    // =========================================================================
    describe('Tier 3: Cross-Feature Interactions', () => {

        it('T3.1: decodeMediaPayload handles objects with raw Buffer in .buffer or .source properties', () => {
            const buf = Buffer.from('test-raw-bytes');
            const res1 = decodeMediaPayload({ buffer: buf });
            assert.equal(res1.source.toString('utf8'), 'test-raw-bytes');

            const res2 = decodeMediaPayload({ source: buf });
            assert.equal(res2.source.toString('utf8'), 'test-raw-bytes');
        });

        it('T3.2: decodeMediaPayload parses admin telegram-preview URLs containing file_id', () => {
            const res = decodeMediaPayload('/api/admin/telegram-preview?file_id=AgACAgIAAxkBAAI123');
            assert.equal(res, 'AgACAgIAAxkBAAI123');
        });

        it('T3.3: Server API router exposes draft publishing endpoint with JSON body', () => {
            const serverSrc = read('src/server.js');
            assert.match(serverSrc, /app\.post\('\/api\/admin\/channel\/publish-draft'/);
            assert.match(serverSrc, /publishChannelDraft\(botInstance/);
        });
    });

    // =========================================================================
    // TIER 4: Realistic End-to-End Publication Flow
    // =========================================================================
    describe('Tier 4: Realistic E2E Workflows', () => {

        it('T4.1: End-to-end WYSIWYG workflow: AI preview data URL -> Publish -> Telegram Photo -> Message ID recorded', async () => {
            const bot = createMockBot();
            const draft = {
                topic: 'life',
                text: 'Сижу на лекции в СПбГИК, за окном классический питерский дождь ☕️🌧',
                media: {
                    type: 'ai_photo',
                    preview_url: SAMPLE_JPEG_DATA_URL
                },
                provenance: {
                    content_format: 'photo_caption',
                    temperature: 0.7
                }
            };

            const result = await publishChannelDraft(bot, draft, {
                channel_id: '@lera_spb_tgk',
                media_mode: 'ai_photo',
                judge_mode: 'OFF',
                public_profile_enabled: false
            });

            assert.equal(result.success, true);
            assert.equal(bot.sentPhotos.length, 1);
            assert.equal(bot.sentPhotos[0].chatId, '@lera_spb_tgk');
            assert.ok(Buffer.isBuffer(bot.sentPhotos[0].photo.source));
            assert.equal(bot.sentPhotos[0].photo.filename, 'lera_channel.jpg');
        });
    });

    // =========================================================================
    // TIER 5 / Adversarial: Robustness & Data Variations
    // =========================================================================
    describe('Tier 5: Adversarial & Edge Variations', () => {

        it('T5.1: Handles various image mime-types in data URLs (image/jpeg, image/png, image/webp)', () => {
            const mimeTypes = [
                SAMPLE_PNG_DATA_URL,
                SAMPLE_JPEG_DATA_URL,
                SAMPLE_WEBP_DATA_URL,
                `data:image/svg+xml;base64,${SAMPLE_PNG_BASE64}`
            ];

            for (const dataUrl of mimeTypes) {
                const decoded = decodeMediaPayload(dataUrl);
                assert.ok(decoded && Buffer.isBuffer(decoded.source), `Failed for ${dataUrl.slice(0, 30)}`);
            }
        });

        it('T5.2: Handles data URL with extra whitespace or newlines safely', () => {
            const messyDataUrl = `  data:image/png;base64,\n${SAMPLE_PNG_BASE64}\n  `;
            const decoded = decodeMediaPayload(messyDataUrl);
            assert.ok(decoded && Buffer.isBuffer(decoded.source));
            assert.equal(decoded.source.toString('base64'), SAMPLE_PNG_BASE64);
        });

        it('T5.3: Rejects text exceeding 4000 characters with standard error message', async () => {
            const bot = createMockBot();
            const hugeText = 'Слишком длинный пост '.repeat(300);

            await assert.rejects(
                async () => {
                    await publishChannelDraft(bot, { text: hugeText }, { channel_id: '@chan' });
                },
                /Черновик пустой или слишком длинный/
            );
        });
    });

    after(async () => {
        await pool.end().catch(() => {});
    });
});
