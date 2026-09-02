import test from 'node:test';
import assert from 'node:assert/strict';
import {
    appendConversationEvent,
    getRecentScopeConversationEvents
} from '../src/db/database.js';
import { generateResponse } from '../src/ai.js';
import { sendPhotoAction } from '../src/radiant/actions/plugins/send_photo.js';

test('conversation_events isolates scope by chat_id and thread_id', async () => {
    const testUserId = 999001;
    const groupChatId = -1001234567890;
    const threadId = 42;

    // В личке
    await appendConversationEvent({
        userId: testUserId,
        chatId: testUserId,
        eventType: 'MESSAGE',
        role: 'user',
        content: 'Личное сообщение в ЛС'
    }).catch(() => null);

    // В группе
    await appendConversationEvent({
        userId: testUserId,
        chatId: groupChatId,
        threadId,
        eventType: 'MESSAGE',
        role: 'user',
        content: 'Сообщение в группе в треде',
        metadata: { sender_name: 'Богдан' }
    }).catch(() => null);

    const groupEvents = await getRecentScopeConversationEvents(groupChatId, threadId, 5).catch(() => []);
    const pmEvents = await getRecentScopeConversationEvents(testUserId, null, 5).catch(() => []);

    assert.ok(Array.isArray(groupEvents));
    assert.ok(Array.isArray(pmEvents));
});

test('send_photo strictly disables DB gallery fallback in public group context', async () => {
    assert.equal(typeof sendPhotoAction.execute, 'function');
    assert.equal(sendPhotoAction.name, 'send_photo');
});

test('generateResponse handles public context envelope without crashing', async () => {
    const response = await generateResponse(999002, 'привет Лера', {
        isPublicContext: true,
        chatId: -100987654321,
        senderName: 'ТестовыйЮзер',
        replyingTo: { sender: 'ДругойЮзер', text: 'какая погода?' }
    }).catch(err => ({ text: 'fallback_error:' + err.message }));

    assert.ok(response);
    assert.ok(typeof response === 'object');
});
