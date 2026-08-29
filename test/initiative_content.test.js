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

test('initiative scheduler respects the 15m ignore reminder window', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 899, state: 'IGNORED', latestEvent: latestText,
        counts: available
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 900, state: 'IGNORED', latestEvent: latestText,
        counts: available
    }), 'ignore_1');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 7201, state: 'IGNORED', latestEvent: latestText,
        counts: available
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

test('cold start initiative triggers when user has no conversation history', () => {
    assert.equal(chooseInitiativeKind({
        ageSeconds: 600, state: 'CLOSED', latestEvent: null,
        counts: available, isColdStart: true
    }), 'cold_start');
    assert.equal(chooseInitiativeKind({
        ageSeconds: 600, state: 'CLOSED', latestEvent: null,
        counts: available, isColdStart: true, stageKinds: ['cold_start']
    }), null);
    assert.equal(chooseInitiativeKind({
        ageSeconds: 600, state: 'CLOSED', latestEvent: null,
        counts: { initiatives: 3, content: 0 }, isColdStart: true
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

test('toLocalDateString formats Date objects and date strings correctly', async () => {
    const { toLocalDateString } = await import('../src/database.js');
    assert.equal(toLocalDateString(new Date('2026-08-18T00:00:00.000Z')), '2026-08-18');
    assert.equal(toLocalDateString('2026-08-18'), '2026-08-18');
    assert.equal(toLocalDateString(null), '');
});

test('ignore chain follows 15m reminder, 4-day block and ignore_4d', () => {
    // Меньше 15 минут (900s) — ждём
    assert.equal(chooseInitiativeKind({
        ageSeconds: 800, state: 'IGNORED', latestEvent: latestText,
        counts: available
    }), null);

    // 15 минут (900s) — напоминание ignore_1
    assert.equal(chooseInitiativeKind({
        ageSeconds: 900, state: 'IGNORED', latestEvent: latestText,
        counts: available
    }), 'ignore_1');

    // После отправки ignore_1 — блокировка на 4 дня (например через 1 день, 2 дня)
    assert.equal(chooseInitiativeKind({
        ageSeconds: 86400, state: 'IGNORED', latestEvent: latestText,
        counts: available, stageKinds: ['ignore_1']
    }), null);

    // В новый день во время 4-дневного блока — тоже ничего не шлём
    assert.equal(chooseInitiativeKind({
        ageSeconds: 2 * 86400, state: 'IGNORED', latestEvent: latestText,
        counts: available, stageKinds: ['ignore_1'], newMoscowDay: true
    }), null);

    // Через 4 дня (345600s) — дерзкий пинг ignore_4d
    assert.equal(chooseInitiativeKind({
        ageSeconds: 345600, state: 'IGNORED', latestEvent: latestText,
        counts: available, stageKinds: ['ignore_1']
    }), 'ignore_4d');

    // После отправки ignore_4d — полная остановка
    assert.equal(chooseInitiativeKind({
        ageSeconds: 5 * 86400, state: 'IGNORED', latestEvent: latestText,
        counts: available, stageKinds: ['ignore_1', 'ignore_4d']
    }), null);
});

test('content channel reads native media and URL only from Telegram entities', () => {
    assert.deepEqual(extractContentFromChannelPost({
        chat: { id: -100123 }, message_id: 5, caption: 'трек на вечер',
        audio: { file_id: 'audio-file' }
    }), {
        telegramType: 'audio', telegramFileId: 'audio-file', description: 'трек на вечер',
        allowChannel: false,
        sourceChannelId: -100123, sourceMessageId: 5
    });
    assert.deepEqual(extractContentFromChannelPost({
        chat: { id: -100123 }, message_id: 6, text: 'смотри https://example.com/a',
        entities: [{ type: 'url', offset: 7, length: 21 }]
    }), {
        telegramType: 'link', url: 'https://example.com/a', description: 'смотри https://example.com/a',
        allowChannel: false,
        sourceChannelId: -100123, sourceMessageId: 6
    });
    assert.deepEqual(extractContentFromChannelPost({
        chat: { id: -100123 }, message_id: 9, caption: 'смешной кот #тгк',
        photo: [{ file_id: 'photo-1' }, { file_id: 'photo-2' }]
    }), {
        telegramType: 'photo', telegramFileId: 'photo-2', description: 'смешной кот',
        allowChannel: true,
        sourceChannelId: -100123, sourceMessageId: 9
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
