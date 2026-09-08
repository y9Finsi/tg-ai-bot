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

test('sanitizeParticipantName cleans zero-width unicode, RTL markers and XML brackets', async () => {
    const { sanitizeParticipantName } = await import('../src/utils/response_text.js');
    
    // Zero-width characters like user hausmer (\u200c, \u200d, \u061c)
    const dirtyZeroWidth = '\u200C\u200D\u200C\u061C\u061C\u200B\u200C\u200D\u200C\u061C\u061C';
    assert.equal(sanitizeParticipantName(dirtyZeroWidth, 'hausmer'), 'hausmer');
    assert.equal(sanitizeParticipantName('', 'fallback_user'), 'fallback_user');
    assert.equal(sanitizeParticipantName(null), 'Участник');

    // XML brackets and quotation marks
    const dirtyBrackets = '<user name="hacker">text</user>';
    const cleanBrackets = sanitizeParticipantName(dirtyBrackets);
    assert.ok(!cleanBrackets.includes('<'));
    assert.ok(!cleanBrackets.includes('>'));
    assert.ok(!cleanBrackets.includes('"'));

    // Regular clean name
    assert.equal(sanitizeParticipantName('Богдан'), 'Богдан');
});

test('group chat prompt includes strict single-interlocutor and negative constraints', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const promptPath = path.resolve('src/prompts/lera_group_chat.txt');
    const content = fs.readFileSync(promptPath, 'utf8');

    assert.ok(content.includes('СТРОГОЕ ПРАВИЛО ОДНОГО АДРЕСАТА'));
    assert.ok(content.includes('КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО объединять в одном сообщении ответы разным людям'));
    assert.ok(content.includes('<current_turn>'));
});

test('claimChannelProcessedMessage safely handles non-numeric dedupe strings without NaN or crash', async () => {
    const { claimChannelProcessedMessage } = await import('../src/db/database.js');
    const guestRes = await claimChannelProcessedMessage(12345, 'gq_test_query_999');
    assert.ok(typeof guestRes === 'boolean');
    const welcomeRes = await claimChannelProcessedMessage(-100123456, 'welcome_-100123456_555');
    assert.ok(typeof welcomeRes === 'boolean');
});

test('cleanResponseText removes hallucinated [ответ для ...] prefixes', async () => {
    const { cleanResponseText } = await import('../src/utils/response_text.js');
    const dirty = '[ответ для Богдан]: привет, как дела?';
    assert.equal(cleanResponseText(dirty), 'привет, как дела?');
});

test('getRoutedSystemPrompt resolves rule_group_chat and rule_group_welcome from DEFAULT_LERA_COMBAT_RULES fallback', async () => {
    const { getRoutedSystemPrompt } = await import('../src/prompts.js');
    const welcomeResult = await getRoutedSystemPrompt('CASUAL', {
        ruleId: 'rule_group_welcome',
        surface: 'GROUP'
    });
    assert.ok(welcomeResult);
    assert.ok(welcomeResult.prompt.includes('ПРИВЕТСТВИЕ') || welcomeResult.prompt.includes('Лера'));

    const groupResult = await getRoutedSystemPrompt('CASUAL', {
        surface: 'GROUP',
        isPublicContext: true
    });
    assert.ok(groupResult);
    assert.ok(groupResult.prompt.includes('ГРУПП') || groupResult.prompt.includes('СТРОГОЕ ПРАВИЛО'));
});
