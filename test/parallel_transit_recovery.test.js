import test from 'node:test';
import assert from 'node:assert/strict';
import { StateRepository } from '../src/db/state_repository.js';

test('pauseActiveTasksFor preserves active TRAVEL tasks during physiological recovery interrupts', async () => {
    let pausedQuery = null;
    const mockClient = {
        query: async (sql, params) => {
            if (sql.includes('SELECT * FROM sim_queue WHERE id = $1')) {
                return { rows: [{ id: params[0], task_type: 'SLEEP_EXHAUSTED' }] };
            }
            if (sql.includes('UPDATE sim_queue') && sql.includes("SET status = 'PAUSED'")) {
                pausedQuery = sql;
                return { rows: [] };
            }
            return { rows: [] };
        }
    };

    await StateRepository.pauseActiveTasksFor(mockClient, 999);
    assert.ok(pausedQuery, 'Update query should be executed');
    assert.ok(pausedQuery.includes("task_type <> 'TRAVEL'"), 'TRAVEL tasks should be excluded from pausing during physiological interrupts');
});

test('getActiveTransitTask queries active TRAVEL tasks in transit', async () => {
    let queriedSql = null;
    const mockClient = {
        query: async (sql) => {
            queriedSql = sql;
            return { rows: [{ id: 789, task_type: 'TRAVEL', status: 'IN_TRANSIT', remaining_minutes: 15, target_location: 'petrogradka_home' }] };
        }
    };

    const task = await StateRepository.getActiveTransitTask(mockClient);
    assert.ok(queriedSql.includes("task_type = 'TRAVEL'"), 'Query must filter by task_type = TRAVEL');
    assert.equal(task.id, 789);
    assert.equal(task.target_location, 'petrogradka_home');
});
