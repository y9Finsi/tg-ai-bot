import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseInitiativeKind } from '../src/initiative_service.js';
import { extractContentFromChannelPost } from '../src/content_service.js';

const available = { initiatives: 0, content: 0 };
const latestText = { event_type: 'MESSAGE' };

test('initiative scheduler respects the 5–60 minute OPEN window and one stage per anchor', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 299, state: 'OPEN', latestEvent: latestText,
        counts: available, contentAvailable: true
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 300, state: 'OPEN', latestEvent: latestText,
        counts: available, contentAvailable: true
    }), 'open');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 3601, state: 'OPEN', latestEvent: latestText,
        counts: available, contentAvailable: true
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 600, state: 'OPEN', latestEvent: latestText,
        counts: available, contentAvailable: true, stageKinds: ['open']
    }), null);
});

test('ignore chain follows the original anchor and closes after three hours', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 300, state: 'IGNORED', latestEvent: latestText,
        counts: available
    }), 'ignore_1');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 7200, state: 'IGNORED', latestEvent: latestText,
        counts: available, stageKinds: ['ignore_1']
    }), 'ignore_2');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 10800, state: 'IGNORED', latestEvent: latestText,
        counts: available, stageKinds: ['ignore_1']
    }), null);
});

test('four-hour content initiative consumes both capacity only when content exists', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: available, contentAvailable: true
    }), 'content_4h');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: { initiatives: 3, content: 0 }, contentAvailable: true
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: { initiatives: 0, content: 3 }, contentAvailable: true
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: { event_type: 'CONTENT' },
        counts: available, contentAvailable: true
    }), null);
});

test('content channel reads native media and URL only from Telegram entities', () => {
    assert.deepEqual(extractContentFromChannelPost({
        chat: { id: -100123 }, message_id: 5, caption: 'трек на вечер',
        audio: { file_id: 'audio-file' }
    }), {
        telegramType: 'audio', telegramFileId: 'audio-file', description: 'трек на вечер',
        sourceChannelId: -100123, sourceMessageId: 5
    });
    assert.deepEqual(extractContentFromChannelPost({
        chat: { id: -100123 }, message_id: 6, text: 'смотри https://example.com/a',
        entities: [{ type: 'url', offset: 7, length: 21 }]
    }), {
        telegramType: 'link', url: 'https://example.com/a', description: 'смотри https://example.com/a',
        sourceChannelId: -100123, sourceMessageId: 6
    });
    assert.equal(extractContentFromChannelPost({
        chat: { id: -100123 }, message_id: 7, text: 'https://example.com/no-entity'
    }), null);
});
