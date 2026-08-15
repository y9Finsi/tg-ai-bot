import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticaClient } from '../src/memory/semantica_client.js';
import { createContextRetriever } from '../src/ai/context_retriever.js';

const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });

test('Semantica client sends tenant-scoped search and tolerates response shapes', async () => {
    let request;
    const client = new SemanticaClient({ baseUrl: 'http://semantica', mode: 'active', fetchImpl: async (url, options) => {
        request = { url, options };
        return response({ results: [{ fact_id: 7, fact: ' Любит чай ', score: .9 }, { id: 7, text: 'duplicate', score: .99 }, { text: 'noise', score: .2 }] });
    } });
    const results = await client.search({ userId: 42, query: 'чай' });
    assert.equal(request.url, 'http://semantica/context/search');
    assert.deepEqual(JSON.parse(request.options.body), { user_id: '42', query: 'чай', limit: 8, threshold: .65 });
    assert.equal(results.length, 1);
    assert.equal(results[0].text, 'Любит чай');
});

test('client requires tenant and disabled mode never calls network', async () => {
    let calls = 0;
    const client = new SemanticaClient({ mode: 'disabled', fetchImpl: async () => { calls++; } });
    await assert.rejects(() => client.search({ query: 'x' }), /requires userId/);
    assert.deepEqual(await client.search({ userId: 'u', query: 'x' }), []);
    assert.equal(calls, 0);
});

test('client skips blank semantic queries instead of sending a sidecar validation error', async () => {
    let calls = 0;
    const client = new SemanticaClient({
        baseUrl: 'http://semantica',
        mode: 'active',
        fetchImpl: async () => {
            calls++;
            return response({ results: [] });
        }
    });

    assert.deepEqual(await client.search({ userId: 'u', query: '   ' }), []);
    assert.equal(calls, 0);
});

test('retriever keeps core facts, uses repository in disabled mode, dedupes and compacts', async () => {
    const retriever = createContextRetriever({ mode: 'disabled', repository: {
        getCoreFacts: async () => [{ id: 1, fact: 'Имя: Маша' }],
        search: async () => [{ id: 2, fact: 'Любит чай' }, { id: 2, fact: 'duplicate' }]
    } });
    const result = await retriever({ userId: 9, query: 'чай' });
    assert.deepEqual(result.facts.map((item) => item.text), ['Имя: Маша', 'Любит чай']);
    assert.equal(result.trace.source, 'repository');
    assert.match(result.promptText, /Имя: Маша/);
});

test('shadow mode selects repository but exposes semantica candidates in trace', async () => {
    const result = await createContextRetriever({ mode: 'shadow', repository: {
        getCoreFacts: async () => [{ id: 'core', text: 'Питер' }],
        search: async () => [{ id: 'r', text: 'Работает в SMM', score: .8 }]
    }, client: { search: async () => [{ id: 's', text: 'Любит графы', score: .95 }] } })({ userId: 1, query: 'работа' });
    assert.equal(result.trace.source, 'repository');
    assert.equal(result.trace.shadow[0].id, 's');
    assert.equal(result.facts.at(-1).id, 'r');
});

test('active mode falls back to repository on Semantica failure and records reason', async () => {
    const result = await createContextRetriever({ mode: 'active', repository: {
        getCoreFacts: async () => [{ id: 'core', text: 'Питер' }],
        search: async () => [{ id: 'r', text: 'fallback', score: .9 }]
    }, client: { search: async () => { const error = new Error('boom'); error.name = 'AbortError'; throw error; } } })({ userId: 1, query: 'x' });
    assert.equal(result.trace.source, 'repository');
    assert.equal(result.trace.fallbackReason, 'timeout');
    assert.equal(result.facts.at(-1).text, 'fallback');
});

test('active mode merges semantic and repository candidates instead of hiding pending outbox facts', async () => {
    const result = await createContextRetriever({
        mode: 'active',
        repository: {
            getCoreFacts: async () => [],
            search: async () => [
                { id: 'pending-fact', text: 'Новый факт ещё не в индексе', score: .9 },
                { id: 'same-text', text: 'Общий факт', score: .7 }
            ]
        },
        client: {
            search: async () => [
                { id: 'semantic-fact', text: 'Связанный факт из графа', score: .95 },
                { id: 'same-text', text: 'Общий факт', score: .99 }
            ]
        }
    })({ userId: 1, query: 'факт' });

    assert.equal(result.trace.source, 'hybrid');
    assert.deepEqual(result.facts.map((fact) => fact.text), [
        'Связанный факт из графа',
        'Общий факт',
        'Новый факт ещё не в индексе'
    ]);
    assert.equal(result.facts.filter((fact) => fact.text === 'Общий факт').length, 1);
});

test('retriever requires tenant userId', async () => {
    const retriever = createContextRetriever({ repository: {} });
    await assert.rejects(() => retriever({ query: 'x' }), /requires userId/);
});

test('core facts bypass threshold and repository may use object contract', async () => {
    const result = await createContextRetriever({ mode: 'disabled', threshold: .9, repository: {
        getCoreFacts: async ({ userId }) => [{ id: `${userId}-core`, text: 'Профильный факт', score: .01 }],
        search: async ({ userId, query, limit, threshold }) => {
            assert.deepEqual({ userId, query, limit, threshold }, { userId: 'u', query: 'тема', limit: 8, threshold: .9 });
            return [{ id: 'weak', text: 'Слабый кандидат', score: .2 }];
        }
    } })({ userId: 'u', query: 'тема' });
    assert.deepEqual(result.facts.map((fact) => fact.text), ['Профильный факт']);
});

test('client aborts a slow sidecar request within configured 150ms floor', async () => {
    const client = new SemanticaClient({ baseUrl: 'http://slow', mode: 'active', timeoutMs: 1, fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }) });
    const started = Date.now();
    await assert.rejects(() => client.search({ userId: 1, query: 'x' }), { name: 'AbortError' });
    assert.ok(Date.now() - started >= 140);
});
