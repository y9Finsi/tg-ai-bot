import test from 'node:test';
import assert from 'node:assert/strict';
import { SURFACE_POLICY, isToolAllowed } from '../src/ai/profile/surface_policy.js';
import { sendPhotoAction, groupPhotoCooldowns } from '../src/radiant/actions/plugins/send_photo.js';
import { setBotInstance } from '../src/utils/bot_instance.js';

test('1. SURFACE_POLICY allows send_photo in GROUP surface', () => {
    assert.ok(SURFACE_POLICY.GROUP.allowedTools.includes('send_photo'), 'send_photo must be in GROUP allowedTools');
    assert.equal(isToolAllowed('send_photo', 'GROUP'), true, 'isToolAllowed must return true for send_photo in GROUP');
});

test('2. send_photo in public group returns PM_CLOSED with deeplink if user has not started PM (403)', async () => {
    groupPhotoCooldowns.clear();

    const mockBot = {
        botInfo: { username: 'test_lera_bot' },
        telegram: {
            sendPhoto: async () => {
                const err = new Error("403 Forbidden: bot can't initiate conversation with a user");
                err.response = { error_code: 403 };
                throw err;
            }
        }
    };
    setBotInstance(mockBot);

    const result = await sendPhotoAction.execute(
        { prompt: 'селфи в зеркале', outfit: 'oversized футболка', time_of_day: 'day' },
        {
            userId: 777001,
            isPublicContext: true,
            bot: mockBot,
            _mockPhoto: { photo: 'mock_file_id', photoRecordId: 1 }
        }
    );

    assert.equal(result.status, 'error');
    assert.equal(result.error?.code, 'PM_CLOSED');
    assert.ok(result.error?.message.includes('https://t.me/test_lera_bot?start=gphoto'), 'Must contain gphoto deeplink');
});

test('3. send_photo in public group delivers to PM and marks sentToPm when PM is open', async () => {
    groupPhotoCooldowns.clear();

    let deliveredChatId = null;
    let deliveredCaption = null;
    const mockBot = {
        botInfo: { username: 'test_lera_bot' },
        telegram: {
            sendPhoto: async (chatId, photo, opts) => {
                deliveredChatId = chatId;
                deliveredCaption = opts?.caption;
                return { message_id: 12345 };
            }
        }
    };
    setBotInstance(mockBot);

    const result = await sendPhotoAction.execute(
        { prompt: 'селфи в зеркале', outfit: 'oversized футболка', time_of_day: 'day' },
        {
            userId: 888002,
            isPublicContext: true,
            bot: mockBot,
            _mockPhoto: { photo: 'mock_file_id', photoRecordId: 2 }
        }
    );

    assert.equal(result.status, 'success');
    assert.equal(result.data?.sentToPm, true);
    assert.equal(deliveredChatId, 888002);
    assert.ok(deliveredCaption.includes('в чате просил'));
});

test('4. send_photo in public group triggers COOLDOWN on repeated requests within 5 minutes', async () => {
    // Пользователь 888002 только что получил фото в тесте 3
    const mockBot = {
        botInfo: { username: 'test_lera_bot' },
        telegram: {
            sendPhoto: async () => ({ message_id: 12346 })
        }
    };

    const result = await sendPhotoAction.execute(
        { prompt: 'еще одно селфи', outfit: 'пижама', time_of_day: 'night' },
        {
            userId: 888002,
            isPublicContext: true,
            bot: mockBot,
            _mockPhoto: { photo: 'mock_file_id', photoRecordId: 3 }
        }
    );

    assert.equal(result.status, 'error');
    assert.equal(result.error?.code, 'COOLDOWN');
    assert.ok(result.error?.message.includes('только что'));
});
