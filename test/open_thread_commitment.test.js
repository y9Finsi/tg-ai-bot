import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { actionRegistry, recordOpenThreadAction } from '../src/radiant/actions/index.js';
import { chooseInitiativeKind } from '../src/initiative_service.js';

test('record_open_thread action registry and contract', () => {
    assert.ok(recordOpenThreadAction, 'recordOpenThreadAction should be exported');
    assert.equal(recordOpenThreadAction.name, 'record_open_thread');
    
    const registered = actionRegistry.get('record_open_thread');
    assert.ok(registered, 'record_open_thread must be registered in actionRegistry');
    assert.equal(registered.inputSchema.type, 'object');
    assert.ok(registered.inputSchema.required.includes('topic'), 'topic must be required');
});

test('chooseInitiativeKind: morning steal protection and maturation', () => {
    // 1. Обычный новый день без открытых тредов -> new_day
    const standardKind = chooseInitiativeKind({
        ageSeconds: 50000,
        state: 'CLOSED',
        latestEvent: { local_date: '2026-09-01' },
        counts: { initiatives: 0, content: 0 },
        stageKinds: [],
        newMoscowDay: true,
        initiativeLimit: 3,
        hasActiveOpenThread: false,
        openThreadAgeSeconds: 0
    });
    assert.equal(standardKind, 'new_day', 'Without active open thread, new_day should be chosen');

    // 2. Утро 09:00: открытый тред свежее 12 часов (например, 10 часов = 36000 сек после вечернего обещания в 23:00)
    // Защита от перехвата: ДОЛЖЕН ВЕРНУТЬ null, а НЕ new_day, чтобы не сжечь инициативу дня до полудня!
    const morningMaturingKind = chooseInitiativeKind({
        ageSeconds: 36000,
        state: 'CLOSED',
        latestEvent: { local_date: '2026-09-01' },
        counts: { initiatives: 0, content: 0 },
        stageKinds: [],
        newMoscowDay: true,
        initiativeLimit: 3,
        hasActiveOpenThread: true,
        openThreadAgeSeconds: 36000
    });
    assert.equal(morningMaturingKind, null, 'If open thread is < 12h in morning, must return null to wait for afternoon maturation');

    // 3. День 12:00: тред созрел (>= 12 часов / 43200 сек) -> open_thread
    const maturedKind = chooseInitiativeKind({
        ageSeconds: 50000,
        state: 'CLOSED',
        latestEvent: { local_date: '2026-09-01' },
        counts: { initiatives: 0, content: 0 },
        stageKinds: [],
        newMoscowDay: true,
        initiativeLimit: 3,
        hasActiveOpenThread: true,
        openThreadAgeSeconds: 45000
    });
    assert.equal(maturedKind, 'open_thread', 'Should select open_thread when thread is >= 12h');

    // 4. One-Shot защита: если open_thread уже был отправлен ранее, повторно не шлем
    const alreadyAskedKind = chooseInitiativeKind({
        ageSeconds: 50000,
        state: 'CLOSED',
        latestEvent: { local_date: '2026-09-01' },
        counts: { initiatives: 0, content: 0 },
        stageKinds: ['open_thread'],
        newMoscowDay: true,
        initiativeLimit: 3,
        hasActiveOpenThread: true,
        openThreadAgeSeconds: 45000
    });
    assert.equal(alreadyAskedKind, 'new_day', 'If open_thread was already staged, fall back to new_day');
});

test('lera_common prompt integrity: no broken sections, clean separation', () => {
    const promptContent = fs.readFileSync('src/prompts/lera_common.txt', 'utf8');
    assert.ok(promptContent.includes('RECORD_OPEN_THREAD'), 'Must contain RECORD_OPEN_THREAD section');
    assert.ok(promptContent.includes('record_open_thread'), 'Must reference record_open_thread tool');
    assert.ok(promptContent.includes('скинуть крутой трек'), 'Must contain example for track commitment');
    assert.ok(promptContent.includes('КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО говорить фразы робота'), 'Must forbid robot timer speech');

    // Проверка целостности файла (не должно быть разорванных слов вроде замеНАПОМИНАНИЯ)
    assert.ok(!promptContent.includes('замеНАПОМИНАНИЯ'), 'Prompt must not contain corrupted fragmented words');
    assert.ok(promptContent.includes('РАЗГРАНИЧЕНИЕ РАБОЧИХ ТЕКСТОВ И МЕДИА-КОНТЕНТА'), 'Work text boundary section must be intact');
    
    // Проверка на отсутствие дублей блока SCHEDULE_REMINDER
    const matches = promptContent.match(/НАПОМИНАНИЯ СОБЕСЕДНИКУ \(SCHEDULE_REMINDER\)/g);
    assert.equal(matches?.length, 1, 'SCHEDULE_REMINDER section must appear exactly once');
});
