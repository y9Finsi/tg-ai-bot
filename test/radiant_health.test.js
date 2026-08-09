import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRadiantHealthStatus } from '../src/radiant/health_status.js';

test('recent successful tick recovers the engine despite a stale error string', () => {
    assert.equal(resolveRadiantHealthStatus({
        tickAgeSeconds: 60,
        workerRunning: true,
        lastTickError: 'ошибка предыдущего тика'
    }), 'ONLINE');
});

test('active queue anomalies remain degraded', () => {
    assert.equal(resolveRadiantHealthStatus({
        tickAgeSeconds: 60,
        workerRunning: true,
        duplicateRoots: 1
    }), 'DEGRADED');
    assert.equal(resolveRadiantHealthStatus({
        tickAgeSeconds: 60,
        workerRunning: true,
        stalledTasks: 1
    }), 'DEGRADED');
});

test('without a recent success the health state is degraded only when an error exists', () => {
    assert.equal(resolveRadiantHealthStatus({
        tickAgeSeconds: null,
        workerRunning: true,
        lastTickError: 'ошибка'
    }), 'DEGRADED');
    assert.equal(resolveRadiantHealthStatus({
        tickAgeSeconds: null,
        workerRunning: true
    }), 'OFFLINE');
});
