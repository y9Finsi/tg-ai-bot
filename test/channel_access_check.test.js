import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAdminApp, setBotInstanceForServer } from '../src/server.js';

process.env.ADMIN_WEB_KEY = 'test_admin_key';
const AUTH_HEADERS = {
    'x-admin-key': 'test_admin_key'
};

function startTestApp(bot) {
    const app = createAdminApp(bot);
    const server = createServer(app);
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

test('GET /api/admin/channel/check-access returns 503 when bot is not initialized', async () => {
    setBotInstanceForServer(null);
    const testApp = await startTestApp(null);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=@testchannel`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 503);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.equal(data.error, 'BOT_NOT_INITIALIZED');
        assert.match(data.message, /не инициализирован/);
    } finally {
        await testApp.close();
    }
});

test('GET /api/admin/channel/check-access returns 400 when channelId is missing', async () => {
    const mockBot = {
        telegram: {
            getMe: async () => ({ id: 12345, username: 'lera_ai_bot', is_bot: true })
        }
    };
    const testApp = await startTestApp(mockBot);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.equal(data.error, 'CHANNEL_ID_REQUIRED');
    } finally {
        await testApp.close();
    }
});

test('GET /api/admin/channel/check-access returns 200 with administrator permissions and channel metadata', async () => {
    const mockBot = {
        telegram: {
            getMe: async () => ({
                id: 998877,
                username: 'lera_spb_bot',
                is_bot: true,
                can_join_groups: true
            }),
            getChat: async (chatId) => ({
                id: -1001234567890,
                title: 'Лера в Питере',
                username: 'lera_spb_tgk',
                type: 'channel',
                description: 'Официальный щитпост-канал Леры'
            }),
            getChatMemberCount: async (chatId) => 1420,
            getChatMember: async (chatId, userId) => ({
                status: 'administrator',
                can_post_messages: true,
                can_edit_messages: true,
                can_delete_messages: true
            })
        }
    };

    const testApp = await startTestApp(mockBot);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=@lera_spb_tgk`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 200);
        const data = await res.json();

        assert.equal(data.ok, true);
        assert.equal(data.success, true);

        // Check channel metadata
        assert.equal(data.channel.id, -1001234567890);
        assert.equal(data.channel.title, 'Лера в Питере');
        assert.equal(data.channel.username, 'lera_spb_tgk');
        assert.equal(data.channel.type, 'channel');
        assert.equal(data.channel.member_count, 1420);

        // Check bot metadata
        assert.equal(data.bot.id, 998877);
        assert.equal(data.bot.username, 'lera_spb_bot');

        // Check permissions
        assert.equal(data.permissions.status, 'administrator');
        assert.equal(data.permissions.can_post_messages, true);
        assert.equal(data.permissions.can_edit_messages, true);
        assert.equal(data.permissions.can_delete_messages, true);

        // Check access summary
        assert.equal(data.access.is_admin, true);
        assert.equal(data.access.can_post, true);
    } finally {
        await testApp.close();
    }
});

test('GET /api/admin/channel/check-access detects creator status with full access', async () => {
    const mockBot = {
        telegram: {
            getMe: async () => ({ id: 111, username: 'creator_bot' }),
            getChat: async (chatId) => ({ id: -100999, title: 'Owner Channel', type: 'channel' }),
            getChatMemberCount: async () => 50,
            getChatMember: async () => ({ status: 'creator' })
        }
    };

    const testApp = await startTestApp(mockBot);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=-100999`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ok, true);
        assert.equal(data.access.is_admin, true);
        assert.equal(data.access.can_post, true);
        assert.equal(data.permissions.status, 'creator');
    } finally {
        await testApp.close();
    }
});

test('GET /api/admin/channel/check-access accurately returns can_post = false when bot is regular member', async () => {
    const mockBot = {
        telegram: {
            getMe: async () => ({ id: 222, username: 'member_bot' }),
            getChat: async (chatId) => ({ id: -100888, title: 'Member Channel', type: 'channel' }),
            getChatMemberCount: async () => 200,
            getChatMember: async () => ({ status: 'member', can_post_messages: false })
        }
    };

    const testApp = await startTestApp(mockBot);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=-100888`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ok, true);
        assert.equal(data.access.is_admin, false);
        assert.equal(data.access.can_post, false);
        assert.equal(data.permissions.status, 'member');
        assert.equal(data.permissions.can_post_messages, false);
    } finally {
        await testApp.close();
    }
});

test('GET /api/admin/channel/check-access handles chat not found error', async () => {
    const mockBot = {
        telegram: {
            getMe: async () => ({ id: 333, username: 'test_bot' }),
            getChat: async () => { throw new Error('400: Bad Request: chat not found'); }
        }
    };

    const testApp = await startTestApp(mockBot);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=@nonexistent_channel_xyz`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.equal(data.error, 'CHAT_NOT_FOUND');
        assert.match(data.message, /Канал не найден/);
    } finally {
        await testApp.close();
    }
});

test('GET /api/admin/channel/check-access handles bot not a member error', async () => {
    const mockBot = {
        telegram: {
            getMe: async () => ({ id: 444, username: 'test_bot' }),
            getChat: async () => ({ id: -100777, title: 'Some Channel', type: 'channel' }),
            getChatMemberCount: async () => 10,
            getChatMember: async () => { throw new Error('400: Bad Request: user not found / bot is not a member'); }
        }
    };

    const testApp = await startTestApp(mockBot);
    try {
        const res = await fetch(`${testApp.baseUrl}/api/admin/channel/check-access?channelId=-100777`, {
            headers: AUTH_HEADERS
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.equal(data.error, 'BOT_NOT_MEMBER');
        assert.match(data.message, /Бот не добавлен в канал/);
    } finally {
        await testApp.close();
    }
});
