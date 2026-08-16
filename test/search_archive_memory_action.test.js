import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createSearchArchiveMemoryAction,
    searchArchiveMemoryAction
} from '../src/radiant/actions/plugins/search_archive_memory.js';

function makeRepository(facts = [{ id: '1', text: 'Пользователь любит старые виниловые пластинки.' }]) {
    const calls = [];
    return {
        calls,
        async searchArchiveMemory(request) {
            calls.push(request);
            return facts;
        }
    };
}

test('schema содержит только query и limit, без userId', () => {
    const properties = searchArchiveMemoryAction.inputSchema.properties;
    assert.deepEqual(Object.keys(properties).sort(), ['limit', 'query']);
    assert.deepEqual(searchArchiveMemoryAction.inputSchema.required, ['query']);
});

test('берёт tenant из context.userId и игнорирует args.userId', async () => {
    const repository = makeRepository();
    const action = createSearchArchiveMemoryAction({ repository });

    await action.execute({ query: 'винил', userId: 999 }, { userId: 42 });

    assert.equal(repository.calls.length, 1);
    assert.deepEqual(repository.calls[0], {
        userId: 42,
        query: 'винил',
        limit: 8,
        threshold: 0.2
    });
});

test('отклоняет отсутствующий или невалидный context.userId', async () => {
    const repository = makeRepository();
    const action = createSearchArchiveMemoryAction({ repository });

    await assert.rejects(() => action.execute({ query: 'что-то' }, {}), /numeric userId/);
    await assert.rejects(() => action.execute({ query: 'что-то' }, { userId: 'abc' }), /numeric userId/);
    assert.equal(repository.calls.length, 0);
});

test('нормализует лимит в диапазон 1..20 и вызывает repository ровно один раз', async () => {
    const repository = makeRepository([]);
    const action = createSearchArchiveMemoryAction({ repository });

    const result = await action.execute({ query: 'архив', limit: 99 }, { userId: '7' });

    assert.equal(repository.calls.length, 1);
    assert.equal(repository.calls[0].limit, 20);
    assert.equal(result.status, 'success');
    assert.equal(result.data.count, 0);
    assert.equal(result.meta.cached, false);
});

test('конфигурация read-only отключает кэш', () => {
    assert.equal(searchArchiveMemoryAction.config.provider, 'postgres_memory');
    assert.equal(searchArchiveMemoryAction.config.cacheTtlSeconds, 0);
    assert.equal(searchArchiveMemoryAction.config.method, 'POST');
    assert.equal(searchArchiveMemoryAction.timeoutMs, 2000);
});

test('два context.userId изолированы друг от друга', async () => {
    const repository = makeRepository([]);
    const action = createSearchArchiveMemoryAction({ repository });

    await action.execute({ query: 'общий запрос' }, { userId: 101 });
    await action.execute({ query: 'общий запрос' }, { userId: 202 });

    assert.deepEqual(repository.calls.map(call => call.userId), [101, 202]);
});

test('объединяет результаты Semantica и репозитория и возвращает явный вердикт при отсутствии', async () => {
    const semanticaClient = {
        async searchMemory({ query }) {
            if (query === 'кофе') return [{ id: 'sem-1', text: 'Пользователь пьет кофе по утрам' }];
            return [];
        }
    };
    const repository = makeRepository([]);
    const action = createSearchArchiveMemoryAction({ repository, semanticaClient });

    const found = await action.execute({ query: 'кофе' }, { userId: 500 });
    assert.equal(found.data.count, 1);
    assert.match(found.data.text, /Пользователь пьет кофе по утрам/);

    const notFound = await action.execute({ query: 'гольф' }, { userId: 500 });
    assert.equal(notFound.data.count, 0);
    assert.match(notFound.data.text, /НИЧЕГО не найдено/);
    assert.match(notFound.data.text, /Лера этого НЕ говорила/);
});

