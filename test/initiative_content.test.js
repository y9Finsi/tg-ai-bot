import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseInitiativeKind, getEffectiveInitiativeLimit } from '../src/initiative_service.js';
import {
    extractContentFromChannelPost,
    formatContentChannelPost,
    stripContentChannelStatus
} from '../src/content_service.js';

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

test('personal initiative limit overrides the global one and zero disables initiatives', () => {
    assert.equal(getEffectiveInitiativeLimit({ initiative_limit: null }, { initiativeLimit: 4 }), 4);
    assert.equal(getEffectiveInitiativeLimit({ initiative_limit: 1 }, { initiativeLimit: 4 }), 1);
    assert.equal(getEffectiveInitiativeLimit({ initiative_limit: 0 }, { initiativeLimit: 4 }), 0);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 600, state: 'OPEN', latestEvent: latestText,
        counts: available, initiativeLimit: 0
    }), null);
});

test('new Moscow day starts one plain initiative regardless of the old dialogue state', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 20 * 3600, state: 'IGNORED', latestEvent: latestText,
        counts: available, newMoscowDay: true, contentAvailable: true
    }), 'new_day');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 20 * 3600, state: 'CLOSED', latestEvent: latestText,
        counts: { initiatives: 3, content: 0 }, newMoscowDay: true
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

test('four-hour hybrid initiative falls back to text idle_4h when content is missing or full', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: available, contentAvailable: true
    }), 'content_4h');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: available, contentAvailable: false
    }), 'idle_4h');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: { initiatives: 0, content: 3 }, contentAvailable: true
    }), 'idle_4h');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: { initiatives: 3, content: 0 }, contentAvailable: true
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: available, contentAvailable: true, stageKinds: ['content_4h']
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 14400, state: 'CLOSED', latestEvent: latestText,
        counts: available, contentAvailable: false, stageKinds: ['idle_4h']
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

test('content channel turns a post into a readable catalog card', () => {
    const card = formatContentChannelPost({
        id: 12,
        telegram_type: 'audio',
        description: 'трек на спокойный вечер',
        enabled: true,
        allow_in_dialogue: true,
        allow_initiative: true
    }, { maxLength: 1024 });

    assert.match(card, /^трек на спокойный вечер/);
    assert.match(card, /📚 Каталог Леры/);
    assert.match(card, /✅ добавила в каталог под номером #12/);
    assert.match(card, /тип: музыка/);
    assert.match(card, /в диалоге и когда пишу первая/);
    assert.equal(stripContentChannelStatus(card), 'трек на спокойный вечер');
});

test('bare links are stored without a fake description and ask for one', () => {
    const extracted = extractContentFromChannelPost({
        chat: { id: -100123 },
        message_id: 8,
        text: 'https://music.yandex.ru/album/1/track/2',
        entities: [{ type: 'url', offset: 0, length: 40 }]
    });
    assert.equal(extracted.description, '');

    const card = formatContentChannelPost({
        id: 13,
        telegram_type: 'link',
        url: extracted.url,
        description: '',
        enabled: false,
        allow_in_dialogue: true,
        allow_initiative: true
    });
    assert.match(card, /сохранила, но пока выключила/);
    assert.match(card, /тип: Яндекс Музыка/);
    assert.match(card, /ссылка: https:\/\/music\.yandex\.ru/);
});
