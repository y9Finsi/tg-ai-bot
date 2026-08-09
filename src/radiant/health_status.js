export function resolveRadiantHealthStatus({
    tickAgeSeconds = null,
    workerRunning = false,
    lastTickError = null,
    duplicateRoots = 0,
    stalledTasks = 0
} = {}) {
    const stale = tickAgeSeconds === null || tickAgeSeconds > 15 * 60;
    const hasRecentSuccessfulTick = tickAgeSeconds !== null && !stale;
    const activeQueueProblems = duplicateRoots > 0 || stalledTasks > 0;

    if (activeQueueProblems) return 'DEGRADED';
    if (hasRecentSuccessfulTick && workerRunning) return 'ONLINE';
    if (lastTickError) return 'DEGRADED';
    return 'OFFLINE';
}
