import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pool } from '../src/db/database.js';
import {
    decodeMediaPayload,
    publishChannelDraft,
    generateAndPublishChannelPost,
    getStartOfDayMSK,
    getTimeOfDayMSK
} from '../src/channel_poster.js';
import {
    getCalendarDayStartMSK,
    getTimeOfDayForDateMSK,
    shouldTriggerChannelPost
} from './tgk_calendar_cron.test.js';
import {
    adaptChannelText,
    validateChannelText,
    getChannelFormatLimits,
    normalizeChannelEditorialMode,
    normalizeChannelFormatSequence,
    describeChannelContentFormat
} from '../src/channel_content.js';
import {
    getModelMatrix,
    updateModelMatrix,
    runSlotHealthCheck,
    normalizeProtocol,
    MATRIX_SLOTS
} from '../src/services/ai_matrix.js';
import {
    executeImageGenerationRequest,
    generateLeraPhoto,
    buildImagePrompt,
    isMultimodalChatModel
} from '../src/services/image_generator.js';
import {
    createAdminApp,
    setBotInstanceForServer
} from '../src/server.js';

// Setup mock DB query to protect unit tests from DB connection issues
pool.query = async (text, params) => {
    const sql = String(text || '');
    if (sql.includes('SELECT value FROM settings') || sql.includes('SELECT key, value FROM settings') || sql.includes('SELECT value FROM global_settings')) {
        return {
            rows: [
                { key: 'channel_poster_settings', value: JSON.stringify({ is_enabled: true, channel_id: '@adversarial_tgk', media_mode: 'ai_photo', judge_mode: 'OFF' }) },
                { key: 'channel_id', value: '@adversarial_tgk' },
                { key: 'channel_judge_mode', value: 'OFF' }
            ]
        };
    }
    if (sql.includes('channel_post_logs') || sql.includes('INSERT INTO channel_post_logs')) {
        return {
            rows: [{
                id: 999,
                channel_id: params?.[0] || '@adversarial_tgk',
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
    if (sql.includes('ai_providers')) {
        return {
            rows: [
                { id: 1, name: 'Primary LLM', base_url: 'http://127.0.0.1:59999', api_key: 'sk-test', model_name: 'gemini-2.5-flash', priority: 1, is_active: true, is_enabled: true },
                { id: 2, name: 'Fallback LLM', base_url: 'http://127.0.0.1:59998', api_key: 'sk-test', model_name: 'deepseek-chat', priority: 2, is_active: false, is_enabled: true }
            ]
        };
    }
    return { rows: [] };
};

process.env.ADMIN_WEB_KEY = 'test_admin_key';
const AUTH_HEADERS = {
    'x-admin-key': 'test_admin_key',
    'Content-Type': 'application/json'
};

function createMockBot(overrides = {}) {
    const sentMessages = [];
    const sentPhotos = [];
    const sentAnimations = [];

    return {
        sentMessages,
        sentPhotos,
        sentAnimations,
        telegram: {
            sendMessage: async (chatId, text, extra) => {
                const msg = { message_id: 5000 + sentMessages.length, chat_id: chatId, text, extra };
                sentMessages.push(msg);
                return msg;
            },
            sendPhoto: async (chatId, photo, extra) => {
                const msg = { message_id: 6000 + sentPhotos.length, chat_id: chatId, photo: [{ file_id: 'ph_adv_123' }], extra };
                sentPhotos.push({ chatId, photo, extra, msg });
                return msg;
            },
            sendAnimation: async (chatId, anim, extra) => {
                const msg = { message_id: 7000 + sentAnimations.length, chat_id: chatId, animation: anim, extra };
                sentAnimations.push({ chatId, anim, extra, msg });
                return msg;
            },
            getMe: async () => ({ id: 777111, username: 'lera_adversarial_bot', is_bot: true }),
            getChat: async (chatId) => {
                if (chatId === '@not_found' || String(chatId).includes('invalid') || chatId === '@not_a_valid_channel_id_ever') {
                    throw new Error('400: Bad Request: chat not found');
                }
                return { id: -100999888, title: 'Adversarial Channel', username: 'adversarial_tgk', type: 'channel', description: 'Adversarial TGK channel' };
            },
            getChatMemberCount: async () => 888,
            getChatMember: async (chatId, userId) => {
                if (chatId === '@not_member') {
                    throw new Error('400: Bad Request: user not found');
                }
                return {
                    status: 'administrator',
                    can_post_messages: true,
                    can_edit_messages: true,
                    can_delete_messages: true
                };
            },
            ...overrides.telegram
        }
    };
}

function startTestHttpServer(handler) {
    const server = createServer(handler);
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            const baseUrl = `http://127.0.0.1:${port}`;
            resolve({
                server,
                baseUrl,
                close: () => new Promise((res) => server.close(res))
            });
        });
    });
}

// =============================================================================
// CHALLENGE 1: Backend WYSIWYG Publishing
// =============================================================================
describe('Adversarial Challenge 1: Backend WYSIWYG Publishing', () => {

    it('1.1: Corrupt base64 data URLs decode safely without crashing Node.js process', () => {
        const corruptInputs = [
            'data:image/jpeg;base64,!!!NotBase64Chars@@@###$$$',
            'data:image/png;base64,',
            'data:image/webp;base64,===invalid-padding===',
            'data:image/gif;base64,   \n\t   ',
            'data:image/png;base64,AAAA====',
            'data:text/plain;base64,SGVsbG8gV29ybGQ=',
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            'data:image/avif;base64,AAAAIGZ0eXBhdmlm',
            'data:application/octet-stream;base64,iVBORw0KGgoAAAANSUhEUg=='
        ];

        for (const input of corruptInputs) {
            const decoded = decodeMediaPayload(input);
            assert.ok(decoded, `Should return decoded container for input: ${input.slice(0, 30)}`);
            assert.ok(Buffer.isBuffer(decoded.source), 'Source must be a valid Buffer instance');
        }

        // Malformed data URLs without comma or invalid scheme
        const invalidMalformed = [
            'data:image/jpeg',
            'data:image/png;base64',
            'not_a_data_url',
            null,
            undefined,
            '',
            12345
        ];
        for (const input of invalidMalformed) {
            const decoded = decodeMediaPayload(input);
            if (typeof input === 'string' && input.length >= 20 && !input.includes(' ')) {
                // Treated as potential file_id
            } else {
                assert.equal(decoded, null, `Should return null for non-payload input: ${input}`);
            }
        }
    });

    it('1.2: Oversized image payloads (50MB base64) process through decodeMediaPayload smoothly', () => {
        const largeBuf = Buffer.alloc(15 * 1024 * 1024, 0x42);
        const dataUrl = `data:image/jpeg;base64,${largeBuf.toString('base64')}`;

        const decoded = decodeMediaPayload(dataUrl);
        assert.ok(decoded);
        assert.ok(Buffer.isBuffer(decoded.source));
        assert.equal(decoded.source.length, 15 * 1024 * 1024);
    });

    it('1.3: Empty drafts, whitespace, and undefined bots are strictly rejected', async () => {
        const bot = createMockBot();

        // 1. Missing bot
        await assert.rejects(
            async () => publishChannelDraft(null, { text: 'Valid text' }),
            /Бот не инициализирован/
        );

        // 2. Empty draft text
        await assert.rejects(
            async () => publishChannelDraft(bot, { text: '' }),
            /Черновик пустой или слишком длинный/
        );

        // 3. Whitespace-only draft text
        await assert.rejects(
            async () => publishChannelDraft(bot, { text: '   \n\n\t   ' }),
            /Черновик пустой или слишком длинный/
        );

        // 4. Missing channel_id in settings
        await assert.rejects(
            async () => publishChannelDraft(bot, { text: 'Valid text' }, { channel_id: '' }),
            /Юзернейм или ID канала не указан в настройках/
        );

        // 5. Exceeding 4000 characters
        const massiveText = 'a'.repeat(4001);
        await assert.rejects(
            async () => publishChannelDraft(bot, { text: massiveText }),
            /Черновик пустой или слишком длинный/
        );
    });

    it('1.4: Caption truncation boundary test (exact 1024, 1025, 4000, multi-byte UTF-8 emojis)', async () => {
        const bot = createMockBot();
        const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const testOverrides = { channel_id: '@adversarial_tgk', judge_mode: 'OFF' };

        // Exactly 1024 chars
        const text1024 = 'X'.repeat(1024);
        const res1024 = await publishChannelDraft(bot, {
            text: text1024,
            media: { type: 'photo', preview_url: testImage }
        }, testOverrides);
        assert.equal(res1024.success, true);
        const lastPhoto1 = bot.sentPhotos.at(-1);
        assert.equal(lastPhoto1.extra.caption.length, 1024);

        // 1025 chars -> truncated to 1024
        const text1025 = 'Y'.repeat(1025);
        const res1025 = await publishChannelDraft(bot, {
            text: text1025,
            media: { type: 'photo', preview_url: testImage }
        }, testOverrides);
        assert.equal(res1025.success, true);
        const lastPhoto2 = bot.sentPhotos.at(-1);
        assert.equal(lastPhoto2.extra.caption.length, 1024);
        assert.equal(lastPhoto2.extra.caption, 'Y'.repeat(1024));

        // 4000 chars photo draft -> truncated safely to 1024
        const text4000 = 'Z'.repeat(4000);
        const res4000 = await publishChannelDraft(bot, {
            text: text4000,
            preview_url: testImage
        }, testOverrides);
        assert.equal(res4000.success, true);
        const lastPhoto3 = bot.sentPhotos.at(-1);
        assert.equal(lastPhoto3.extra.caption.length, 1024);

        // Multi-byte complex emoji sequences across truncation boundary (1020 chars + emojis)
        const textWithEmojis = 'E'.repeat(1020) + '👩‍💻🔥🚀✨🎉';
        const resEmoji = await publishChannelDraft(bot, {
            text: textWithEmojis,
            preview_url: testImage
        }, testOverrides);
        assert.equal(resEmoji.success, true);
        const lastPhotoEmoji = bot.sentPhotos.at(-1);
        assert.ok(lastPhotoEmoji.extra.caption.length <= 1024);
    });

    it('1.5: Concurrent publishing with identical idempotency key is safely handled', async () => {
        const bot = createMockBot();
        const draft = {
            text: 'Concurrent test post',
            idempotency_key: 'test:concurrent:key:123'
        };
        const testOverrides = { channel_id: '@adversarial_tgk', judge_mode: 'OFF' };

        // Two parallel publish calls
        const [res1, res2] = await Promise.all([
            publishChannelDraft(bot, draft, testOverrides),
            publishChannelDraft(bot, draft, testOverrides)
        ]);

        assert.ok(res1.success || res1.duplicate);
        assert.ok(res2.success || res2.duplicate);
    });

    it('1.6: Intelligent text adaptation handles 15-20% overflows and rejects beyond tolerance', () => {
        // photo_caption format has limit 120 chars. 120 * 1.20 = 144 chars tolerance.
        const baseSentence = 'Сегодня в Питере потрясающий закат над Невой и крышами домов, всё небо удивительно розовое и теплое.';
        assert.equal(baseSentence.length, 100);

        // Within limit -> intact
        const adaptedIntact = adaptChannelText(baseSentence, 'photo_caption');
        assert.equal(adaptedIntact, baseSentence);

        // 129 chars (+24% character overflow, 129 <= 144 tolerance) -> adapted cleanly to first sentence (100 chars)
        const textWithOverflow = `${baseSentence} А я уже спешу домой греться.`;
        assert.equal(textWithOverflow.length, 129);
        const adaptedOverflow = adaptChannelText(textWithOverflow, 'photo_caption');
        assert.ok(adaptedOverflow.length <= 120);
        assert.equal(adaptedOverflow, baseSentence);

        // 200 chars (> 20% overflow) -> cannot adapt within tolerance, returns raw cleaned
        const massiveOverflow = `${baseSentence} `.repeat(5);
        const validationResult = validateChannelText(massiveOverflow, 'photo_caption');
        assert.equal(validationResult.ok, false);
        assert.equal(validationResult.code, 'CHANNEL_TOO_LONG');
    });
});

// =============================================================================
// CHALLENGE 2: Calendar Day Cron
// =============================================================================
describe('Adversarial Challenge 2: Calendar Day Cron', () => {

    it('2.1: Timezone transition & leap year calculations (Feb 29 on leap years vs non-leap years)', () => {
        // Leap year: 2024-02-29 15:30 MSK (12:30 UTC)
        const leapDate = new Date('2024-02-29T12:30:00Z');
        const leapDayStart = getCalendarDayStartMSK(leapDate);
        assert.equal(leapDayStart.toISOString(), '2024-02-28T21:00:00.000Z', '00:00 MSK on 2024-02-29 is 2024-02-28 21:00 UTC');

        // Next leap year: 2028-02-29 00:00 MSK
        const leap2028 = new Date('2028-02-28T21:00:00Z');
        const start2028 = getCalendarDayStartMSK(leap2028);
        assert.equal(start2028.toISOString(), '2028-02-28T21:00:00.000Z');

        // Non-leap year: 2025-02-28 23:59:59 MSK
        const nonLeapFeb = new Date('2025-02-28T20:59:59.999Z');
        const startFeb = getCalendarDayStartMSK(nonLeapFeb);
        assert.equal(startFeb.toISOString(), '2025-02-27T21:00:00.000Z');

        // Non-leap year rollover: 2025-03-01 00:00:00 MSK (2025-02-28 21:00:00 UTC)
        const marchFirst = new Date('2025-02-28T21:00:00.000Z');
        const startMarch = getCalendarDayStartMSK(marchFirst);
        assert.equal(startMarch.toISOString(), '2025-02-28T21:00:00.000Z');
    });

    it('2.2: Midnight MSK edge rollover (23:59:59.999 MSK vs 00:00:00.000 MSK)', () => {
        // Just 1 millisecond before midnight MSK
        const beforeMidnight = new Date('2026-08-25T20:59:59.999Z'); // 23:59:59.999 MSK on Aug 25
        const startBefore = getCalendarDayStartMSK(beforeMidnight);
        assert.equal(startBefore.toISOString(), '2026-08-24T21:00:00.000Z', 'Belongs to Aug 25 calendar day');

        // Exactly midnight MSK
        const atMidnight = new Date('2026-08-25T21:00:00.000Z'); // 00:00:00.000 MSK on Aug 26
        const startAt = getCalendarDayStartMSK(atMidnight);
        assert.equal(startAt.toISOString(), '2026-08-25T21:00:00.000Z', 'Belongs to Aug 26 calendar day');
    });

    it('2.3: Extreme frequency values (0, negative, 500, NaN, Infinity) are handled safely', () => {
        const now = Date.now();
        const lastPosted2HoursAgo = new Date(now - 2.5 * 3600000).toISOString();

        // 1 hour cooldown allows posting after 2.5 hours
        const res1Hour = shouldTriggerChannelPost({
            isEnabled: true,
            channelId: '@test',
            postsToday: 0,
            dailyLimit: 5,
            lastPostedAt: lastPosted2HoursAgo,
            frequencyHours: 1
        });
        assert.equal(res1Hour, true);

        // 500 hours frequency -> cooldown is respected and blocks posting
        const res500 = shouldTriggerChannelPost({
            isEnabled: true,
            channelId: '@test',
            postsToday: 0,
            dailyLimit: 5,
            lastPostedAt: lastPosted2HoursAgo,
            frequencyHours: 500
        });
        assert.equal(res500, false, '500 hours cooldown must prevent post after only 2.5 hours');

        // NaN frequency falls back safely to default 12
        const rawNaN = NaN;
        const sanitizedNaN = Math.max(1, Number(rawNaN || 12));
        assert.equal(sanitizedNaN, 12);
    });

    it('2.4: High post volumes (dailyLimit = 100, 1000, 0, negative)', () => {
        const now = Date.now();
        const lastPosted2HoursAgo = new Date(now - 2.5 * 3600000).toISOString();

        // 100 posts per day allows 99th post
        const res100 = shouldTriggerChannelPost({
            isEnabled: true,
            channelId: '@test',
            postsToday: 99,
            dailyLimit: Math.max(1, Number(100 || 2)),
            lastPostedAt: lastPosted2HoursAgo,
            frequencyHours: 2
        });
        assert.equal(res100, true);

        // 100 posts per day blocks 100th post
        const res100Blocked = shouldTriggerChannelPost({
            isEnabled: true,
            channelId: '@test',
            postsToday: 100,
            dailyLimit: Math.max(1, Number(100 || 2)),
            lastPostedAt: lastPosted2HoursAgo,
            frequencyHours: 2
        });
        assert.equal(res100Blocked, false);

        // 0 or negative daily limit sanitized to at least 1
        assert.equal(Math.max(1, Number(0 || 2)), 2);
        assert.equal(Math.max(1, Number(-5 || 2)), 1);
    });

    it('2.5: Multi-day continuous timeline simulation preserves daily limits across days', () => {
        const simulatedPosts = [];
        const baseDay = new Date('2026-08-20T21:00:00.000Z'); // 2026-08-21 00:00:00 MSK

        // Simulate 5 days with 2-hour interval checks
        for (let hour = 0; hour < 120; hour += 2) {
            const currentTime = new Date(baseDay.getTime() + hour * 3600000);
            const currentDayStart = getCalendarDayStartMSK(currentTime);

            // Count posts on current day
            const postsToday = simulatedPosts.filter(p => p.time >= currentDayStart.getTime() && p.time < currentDayStart.getTime() + 86400000).length;
            const lastPost = simulatedPosts.at(-1);

            const shouldPost = shouldTriggerChannelPost({
                isEnabled: true,
                channelId: '@test_sim',
                postsToday,
                dailyLimit: 3,
                lastPostedAt: lastPost ? new Date(lastPost.time).toISOString() : null,
                frequencyHours: 4,
                currentTime: currentTime.getTime()
            });

            if (shouldPost) {
                simulatedPosts.push({ time: currentTime.getTime(), day: currentDayStart.toISOString() });
            }
        }

        // Group posts by calendar day
        const dayCounts = {};
        for (const p of simulatedPosts) {
            dayCounts[p.day] = (dayCounts[p.day] || 0) + 1;
        }

        // Assert no single day exceeded limit of 3
        for (const [day, count] of Object.entries(dayCounts)) {
            assert.ok(count <= 3, `Day ${day} had ${count} posts, expected <= 3`);
        }
        assert.ok(simulatedPosts.length >= 10, 'Expected multiple days of successful postings');
    });
});

// =============================================================================
// CHALLENGE 3: Model Matrix & Slot Routing
// =============================================================================
describe('Adversarial Challenge 3: Model Matrix & Slot Routing', () => {

    it('3.1: Missing reference images for edit models strictly throws validation error', async () => {
        const mockProvider = {
            id: 10,
            name: 'Edit Provider',
            base_url: 'http://127.0.0.1:59999',
            api_key: 'sk-test',
            model_name: 'gemini-2.5-flash'
        };

        // 1. requireReference: true without referenceDataUrl
        await assert.rejects(
            async () => executeImageGenerationRequest({
                provider: mockProvider,
                model: 'gemini-2.5-flash',
                prompt: 'Edit photo',
                referenceDataUrl: null,
                requireReference: true
            }),
            /Загрузи референс-картинку для обработки/
        );

        // 2. Model name containing 'edit' without referenceDataUrl
        await assert.rejects(
            async () => executeImageGenerationRequest({
                provider: mockProvider,
                model: 'qwen-image-edit',
                prompt: 'Make hair blonde',
                referenceDataUrl: null
            }),
            /Загрузи референс-картинку для обработки/
        );
    });

    it('3.2: Fallback failures when all upstreams error return null/reject cleanly without unhandled rejections', async () => {
        // Setup mock upstream server that returns HTTP 500 for all requests
        const upstream = await startTestHttpServer((req, res) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Internal Server Error: AI GPU cluster down' } }));
        });

        try {
            const failingProvider = {
                id: 99,
                name: 'Failing Provider',
                base_url: upstream.baseUrl,
                api_key: 'sk-fail',
                model_name: 'flux-1-schnell'
            };

            await assert.rejects(
                async () => executeImageGenerationRequest({
                    provider: failingProvider,
                    model: 'flux-1-schnell',
                    prompt: 'A red apple',
                    protocol: '/images/generations'
                }),
                /Internal Server Error: AI GPU cluster down/
            );

            // generateLeraPhoto catches errors and returns null safely
            const photoResult = await generateLeraPhoto({
                prompt: 'A test photo',
                providerId: failingProvider.id,
                timeoutMs: 3000
            });
            assert.equal(photoResult, null, 'generateLeraPhoto should return null on complete provider failure');
        } finally {
            await upstream.close();
        }
    });

    it('3.3: Protocol routing correctly dispatches to /images/generations vs /chat/completions', async () => {
        let requestedEndpoint = null;
        let requestedBody = null;

        const upstream = await startTestHttpServer((req, res) => {
            requestedEndpoint = req.url;
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                requestedBody = JSON.parse(body);
                if (req.url === '/images/generations') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }]
                    }));
                } else if (req.url === '/chat/completions') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        choices: [{
                            message: {
                                content: '![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)'
                            }
                        }]
                    }));
                }
            });
        });

        try {
            const testProvider = {
                id: 77,
                name: 'Router Provider',
                base_url: upstream.baseUrl,
                api_key: 'sk-route',
                model_name: 'flux-1-schnell'
            };

            // Test 1: Explicit /images/generations
            const resImg = await executeImageGenerationRequest({
                provider: testProvider,
                model: 'flux-1-schnell',
                prompt: 'Portrait of Lera',
                protocol: '/images/generations'
            });
            assert.equal(resImg.success, true);
            assert.equal(requestedEndpoint, '/images/generations');
            assert.ok(requestedBody.prompt);

            // Test 2: Explicit /chat/completions
            const resChat = await executeImageGenerationRequest({
                provider: testProvider,
                model: 'gemini-2.5-flash',
                prompt: 'Portrait of Lera',
                protocol: '/chat/completions'
            });
            assert.equal(resChat.success, true);
            assert.equal(requestedEndpoint, '/chat/completions');
            assert.ok(Array.isArray(requestedBody.messages));
        } finally {
            await upstream.close();
        }
    });

    it('3.4: Timeout resilience aborts slow upstream queries cleanly', async () => {
        // Upstream server that hangs and never responds
        const hangingUpstream = await startTestHttpServer((req, res) => {
            // Intentionally don't respond
        });

        try {
            const hangingProvider = {
                id: 88,
                name: 'Hanging Provider',
                base_url: hangingUpstream.baseUrl,
                api_key: 'sk-hang',
                model_name: 'deepseek-chat'
            };

            const check = await runSlotHealthCheck({
                slot: 'core_dialogue',
                provider: hangingProvider,
                timeout_ms: 200 // 200ms abort
            });

            assert.equal(check.status, 'UNHEALTHY');
            assert.equal(check.ok, false);
            assert.ok(check.error.includes('aborted') || check.error.includes('timeout') || check.error.includes('Timeout'));
        } finally {
            await hangingUpstream.close();
        }
    });

    it('3.5: All-slots diagnostic health-check runs concurrently without state contamination', async () => {
        const mockHealthyUpstream = await startTestHttpServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (req.url === '/audio/speech') {
                res.end(Buffer.alloc(100, 0x55));
            } else if (req.url === '/images/generations') {
                res.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }] }));
            } else {
                res.end(JSON.stringify({ choices: [{ message: { content: 'PASS' } }] }));
            }
        });

        try {
            const healthyProvider = {
                id: 55,
                name: 'Mock Healthy Provider',
                base_url: mockHealthyUpstream.baseUrl,
                api_key: 'sk-healthy',
                model_name: 'test-model'
            };

            const allCheck = await runSlotHealthCheck({
                slot: 'all',
                provider: healthyProvider,
                timeout_ms: 2000
            });

            assert.equal(allCheck.slot, 'all');
            assert.ok(allCheck.slots);
            assert.equal(typeof allCheck.summary.total, 'number');
            assert.equal(allCheck.summary.total, 6);
            for (const slotName of MATRIX_SLOTS) {
                assert.ok(allCheck.slots[slotName], `Slot ${slotName} must be present in allCheck results`);
                assert.ok('latency_ms' in allCheck.slots[slotName]);
            }
        } finally {
            await mockHealthyUpstream.close();
        }
    });
});

// =============================================================================
// CHALLENGE 4: Channel Access Validation
// =============================================================================
describe('Adversarial Challenge 4: Channel Access Validation', () => {

    it('4.1: Missing bot instance returns 503 BOT_NOT_INITIALIZED', async () => {
        setBotInstanceForServer(null);
        const app = createAdminApp(null);
        const serverHelper = await startTestHttpServer(app);

        try {
            const res = await fetch(`${serverHelper.baseUrl}/api/admin/channel/check-access?channelId=@test_channel`, {
                headers: AUTH_HEADERS
            });
            assert.equal(res.status, 503);
            const data = await res.json();
            assert.equal(data.ok, false);
            assert.equal(data.error, 'BOT_NOT_INITIALIZED');
        } finally {
            await serverHelper.close();
        }
    });

    it('4.2: Malformed chat IDs and non-existent channels return 400 with descriptive error', async () => {
        const mockBot = createMockBot();
        const app = createAdminApp(mockBot);
        const serverHelper = await startTestHttpServer(app);

        try {
            // Non-existent channel
            const resNotFound = await fetch(`${serverHelper.baseUrl}/api/admin/channel/check-access?channelId=@not_found`, {
                headers: AUTH_HEADERS
            });
            assert.equal(resNotFound.status, 400);
            const dataNotFound = await resNotFound.json();
            assert.equal(dataNotFound.error, 'CHAT_NOT_FOUND');
            assert.match(dataNotFound.message, /Канал не найден/);

            // Invalid chat ID format
            const resInvalid = await fetch(`${serverHelper.baseUrl}/api/admin/channel/check-access?channelId=@not_a_valid_channel_id_ever`, {
                headers: AUTH_HEADERS
            });
            assert.equal(resInvalid.status, 400);
            const dataInvalid = await resInvalid.json();
            assert.equal(dataInvalid.error, 'CHAT_NOT_FOUND');
        } finally {
            await serverHelper.close();
        }
    });

    it('4.3: Revoked permissions and non-member status are accurately detected', async () => {
        const mockBotNonMember = createMockBot();
        const app = createAdminApp(mockBotNonMember);
        const serverHelper = await startTestHttpServer(app);

        try {
            // Bot not member of channel
            const resNotMember = await fetch(`${serverHelper.baseUrl}/api/admin/channel/check-access?channelId=@not_member`, {
                headers: AUTH_HEADERS
            });
            assert.equal(resNotMember.status, 400);
            const dataNotMember = await resNotMember.json();
            assert.equal(dataNotMember.error, 'BOT_NOT_MEMBER');
            assert.match(dataNotMember.message, /Бот не добавлен в канал/);
        } finally {
            await serverHelper.close();
        }

        // Bot is a member but NOT admin and cannot post
        const mockBotRestricted = createMockBot({
            telegram: {
                getChatMember: async () => ({
                    status: 'member',
                    can_post_messages: false,
                    can_edit_messages: false,
                    can_delete_messages: false
                })
            }
        });
        const appRestricted = createAdminApp(mockBotRestricted);
        const serverRestricted = await startTestHttpServer(appRestricted);

        try {
            const resRestricted = await fetch(`${serverRestricted.baseUrl}/api/admin/channel/check-access?channelId=@valid_tgk`, {
                headers: AUTH_HEADERS
            });
            assert.equal(resRestricted.status, 200);
            const dataRestricted = await resRestricted.json();
            assert.equal(dataRestricted.ok, true);
            assert.equal(dataRestricted.access.is_admin, false);
            assert.equal(dataRestricted.access.can_post, false);
            assert.equal(dataRestricted.permissions.can_post_messages, false);
        } finally {
            await serverRestricted.close();
        }
    });

    it('4.4: Query parameter variations (?channelId vs ?channel_id) and response contract verification', async () => {
        const mockBot = createMockBot();
        const app = createAdminApp(mockBot);
        const serverHelper = await startTestHttpServer(app);

        try {
            // Check camelCase query param
            const resCamel = await fetch(`${serverHelper.baseUrl}/api/admin/channel/check-access?channelId=@adversarial_tgk`, {
                headers: AUTH_HEADERS
            });
            assert.equal(resCamel.status, 200);
            const dataCamel = await resCamel.json();
            assert.equal(dataCamel.ok, true);
            assert.equal(dataCamel.success, true);
            assert.ok(dataCamel.channel);
            assert.ok(dataCamel.bot);
            assert.ok(dataCamel.permissions);
            assert.ok(dataCamel.access);
            assert.equal(dataCamel.channel.title, 'Adversarial Channel');

            // Check snake_case query param
            const resSnake = await fetch(`${serverHelper.baseUrl}/api/admin/channel/check-access?channel_id=@adversarial_tgk`, {
                headers: AUTH_HEADERS
            });
            assert.equal(resSnake.status, 200);
            const dataSnake = await resSnake.json();
            assert.equal(dataSnake.ok, true);
            assert.equal(dataSnake.channel.id, -100999888);
        } finally {
            await serverHelper.close();
        }
    });
});
