import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMemoryRetrievalQuery } from '../src/ai/memory_query.js';
import { shouldPersistToolObservation } from '../src/ai/tool_observation_policy.js';
import { MemoryRepository } from '../src/memory/memory_repository.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = relative => {
    if (relative === 'admin-v2/src/main.jsx') {
        const srcDir = fileURLToPath(new URL('admin-v2/src', root));
        const collect = dir => {
            let out = '';
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) out += collect(full);
                else if (item.name.endsWith('.jsx') || item.name.endsWith('.js')) {
                    out += fs.readFileSync(full, 'utf8') + '\n';
                }
            }
            return out;
        };
        return collect(srcDir);
    }
    return fs.readFileSync(new URL(relative, root), 'utf8');
};

test('memory retrieval query uses only topical user text', () => {
    assert.equal(
        buildMemoryRetrievalQuery({
            userText: '  какой дизайн я делаю сейчас CASUAL  ',
            lastLeraText: '\nСлушай, я дома\n',
            routingMode: 'EROTIC'
        }),
        'какой дизайн делаю сейчас'
    );
    assert.equal(
        buildMemoryRetrievalQuery({ userText: 'тема', lastLeraText: '', routingMode: '' }),
        'тема'
    );
});

test('only successful native tools create observations, archive search stays read-only', () => {
    assert.equal(shouldPersistToolObservation({ status: 'success', name: 'weather' }), true);
    assert.equal(shouldPersistToolObservation({ status: 'failed', name: 'weather' }), false);
    assert.equal(shouldPersistToolObservation({ status: 'success', name: 'search_archive_memory' }), false);

    const aiSource = read('src/ai.js');
    assert.match(aiSource, /shouldPersistToolObservation\(\{ status: execRes\?\.status, name \}\)/);
});

test('fact extraction reads typed facts first and archives typed ids before legacy fallback', () => {
    const source = read('src/ai/memory_extractor.js');
    assert.match(source, /typedRepository\.listFacts\(userId/);
    assert.match(source, /typedRepository\.archiveFact\(userId, id/);
    assert.ok(source.indexOf('typedRepository.listFacts(userId') < source.indexOf('getUserMemories(userId, 30)'));
    assert.ok(source.indexOf('typedRepository.archiveFact(userId, id') < source.indexOf('deactivateUserMemory(id, userId)'));
});

test('recordToolObservation persists a bounded typed fact with tenant and idempotency provenance', async () => {
    const repository = new MemoryRepository({
        poolImpl: {},
        queryImpl: async () => ({ rows: [] })
    });
    let captured;
    repository.createFact = async input => {
        captured = input;
        return { id: 'fact-1' };
    };

    const result = await repository.recordToolObservation({
        userId: 42,
        toolName: 'weather',
        queryText: 'какая погода',
        resultText: '  Санкт-Петербург, дождь  ',
        callId: 'call-7',
        sourceEventId: 99,
        metadata: { provider: 'test' }
    });

    assert.deepEqual(result, { id: 'fact-1' });
    assert.equal(captured.userId, 42);
    assert.equal(captured.type, 'TOOL_OBSERVATION');
    assert.equal(captured.payload.tool_name, 'weather');
    assert.equal(captured.payload.query, 'какая погода');
    assert.equal(captured.payload.result, 'Санкт-Петербург, дождь');
    assert.equal(captured.sourceEventId, 99);
    assert.equal(captured.idempotencyKey, 'tool:weather:call-7');
    assert.deepEqual(captured.provenance, {
        source: 'native_tool',
        tool_name: 'weather',
        call_id: 'call-7'
    });
});

test('empty tool results do not create memory facts', async () => {
    const repository = new MemoryRepository({
        poolImpl: {},
        queryImpl: async () => ({ rows: [] })
    });
    let writes = 0;
    repository.createFact = async () => {
        writes += 1;
        return {};
    };

    assert.equal(await repository.recordToolObservation({
        userId: 42,
        toolName: 'weather',
        resultText: '   '
    }), null);
    assert.equal(writes, 0);
});

test('outbox worker starts after database readiness and stops before database close', () => {
    const botSource = read('src/bot.js');
    const start = botSource.indexOf('initDatabaseTables()');
    const shutdown = botSource.indexOf('async function gracefulShutdown');
    const readyBlock = botSource.slice(start, shutdown);
    const shutdownBlock = botSource.slice(shutdown);

    assert.match(readyBlock, /createMemoryOutboxWorker\(/);
    assert.match(readyBlock, /memoryOutboxWorker\.start\(\)/);
    assert.ok(readyBlock.indexOf('await') < readyBlock.indexOf('memoryOutboxWorker.start()'));
    assert.match(shutdownBlock, /await memoryOutboxWorker\?\.stop\(\)/);
    assert.ok(shutdownBlock.indexOf('await memoryOutboxWorker?.stop()') < shutdownBlock.indexOf('await closeDB()'));
});

test('simulation retrieves only global precedents and records their ids in the decision trace', () => {
    const repositorySource = read('src/memory/memory_repository.js');
    const simulationSource = read('src/workers/simulation_worker.js');
    const methodStart = repositorySource.indexOf('async getSimulationPrecedents(');
    const methodEnd = repositorySource.indexOf('\n    async recordToolObservation(', methodStart);
    const method = repositorySource.slice(methodStart, methodEnd);

    assert.match(method, /WHERE user_id = \$1/);
    assert.match(method, /memory_type = ANY\(\$2::text\[\]\)/);
    assert.match(method, /\[tenantId, PRECEDENT_TYPES, DEFAULT_CANDIDATE_LIMIT\]/);
    assert.match(simulationSource, /getSimulationPrecedents\([\s\S]*\{ userId: '0', limit: 5 \}/);
    assert.match(simulationSource, /precedentIds/);
    assert.match(simulationSource, /simulation:decision:\$\{tickAt\.toISOString\(\)\}/);
    assert.equal((simulationSource.match(/getSimulationPrecedents\(/g) || []).length, 1);
});

test('simulation merges active Semantica precedents before lexical Postgres fallback', async () => {
    const repository = new MemoryRepository({
        poolImpl: {},
        queryImpl: async () => ({ rows: [] }),
        semanticaClient: {
            mode: 'active',
            search: async () => [{
                id: 'semantic-decision-1',
                text: 'Ранее после работы Лера выбрала отдых дома',
                score: 0.91,
                memory: {
                    memory_id: 'semantic-decision-1',
                    status: 'active',
                    metadata: { memory_type: 'DECISION_TRACE' }
                }
            }]
        }
    });

    const precedents = await repository.getSimulationPrecedents('отдых дома', {
        userId: '0',
        limit: 5
    });

    assert.equal(precedents[0].id, 'semantic-decision-1');
    assert.equal(precedents[0].source, 'semantica');
    assert.equal(precedents[0].score, 0.91);
});

test('admin retrieval trace consumes the persisted query, metadata and candidate traces', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /item\.query_text/);
    assert.match(source, /item\.metadata/);
    assert.match(source, /item\.traces/);
    assert.match(source, /trace\.candidate_rank/);
    assert.match(source, /trace\.exclusion_reason/);
    assert.match(source, /trace\.final_score/);
});

test('prompt debug memory_used is always the exact injected fact array', () => {
    const source = read('src/ai.js');
    assert.match(source, /memory_used:\s*\(memories \|\| \[\]\)\.map/);
    assert.doesNotMatch(source, /Память пока пуста/);
});

test('user memory cleanup removes every memory surface and enqueues one tenant purge', () => {
    const source = read('src/db/database.js');
    const userStart = source.indexOf('export async function clearUserMemories');
    const userEnd = source.indexOf('\nexport async function getAllRecentConversationEvents', userStart);
    const userBlock = source.slice(userStart, userEnd);

    assert.match(userBlock, /DELETE FROM memory_retrieval_log WHERE user_id = \$1/);
    assert.match(userBlock, /DELETE FROM memory_outbox WHERE user_id = \$1/);
    assert.match(userBlock, /DELETE FROM memory_fact WHERE user_id = \$1/);
    assert.match(userBlock, /DELETE FROM user_memories WHERE user_id = \$1/);
    assert.match(userBlock, /purge_user: true/);
    assert.match(userBlock, /idempotencyKey: `purge:user:\$\{String\(userId\)\}`/);

    const allStart = source.indexOf('export async function clearAllUserMemories');
    const allEnd = source.indexOf('\n// =========================================================================', allStart);
    const allBlock = source.slice(allStart, allEnd);

    assert.match(allBlock, /FROM memory_fact/);
    assert.match(allBlock, /FROM user_memories/);
    assert.match(allBlock, /FROM memory_outbox/);
    assert.match(allBlock, /FROM memory_retrieval_log/);
    assert.match(allBlock, /DELETE FROM memory_retrieval_log/);
    assert.match(allBlock, /DELETE FROM memory_outbox/);
    assert.match(allBlock, /DELETE FROM memory_fact/);
    assert.match(allBlock, /DELETE FROM user_memories/);
    assert.match(allBlock, /for \(const row of users\.rows\)/);
    assert.match(allBlock, /purge:user:\$\{String\(row\.user_id\)\}/);
});
