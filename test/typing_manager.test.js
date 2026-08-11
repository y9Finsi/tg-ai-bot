import assert from 'node:assert/strict';
import test from 'node:test';
import { startTyping, stopTyping } from '../src/typing_manager.js';

test('typing manager sends the action immediately for a new AI request', async () => {
    const actions = [];
    const bot = {
        telegram: {
            async sendChatAction(chatId, action) {
                actions.push({ chatId, action });
            }
        }
    };

    startTyping(bot, 123, 'request-1');
    await new Promise(resolve => setImmediate(resolve));
    stopTyping(123, 'request-1');

    assert.deepEqual(actions, [{ chatId: 123, action: 'typing' }]);
});
