export const MEMORY_SCHEMA_VERSION = 1;

export const MEMORY_TYPE = Object.freeze({
    PROFILE: 'PROFILE',
    PREFERENCE: 'PREFERENCE',
    EPISODE: 'EPISODE',
    COMMITMENT: 'COMMITMENT',
    OPEN_THREAD: 'OPEN_THREAD',
    TOOL_OBSERVATION: 'TOOL_OBSERVATION',
    RELATIONSHIP_EVENT: 'RELATIONSHIP_EVENT',
    SIMULATION_OBSERVATION: 'SIMULATION_OBSERVATION',
    DECISION_TRACE: 'DECISION_TRACE'
});

export const MEMORY_TYPES = Object.freeze(Object.values(MEMORY_TYPE));

const memoryTypeSet = new Set(MEMORY_TYPES);
const legacyAliases = Object.freeze({
    LEGACY: MEMORY_TYPE.PROFILE
});

export function normalizeMemoryType(value, { allowLegacy = true } = {}) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (allowLegacy && legacyAliases[normalized]) return legacyAliases[normalized];
    return memoryTypeSet.has(normalized) ? normalized : null;
}

export function isMemoryType(value) {
    return normalizeMemoryType(value, { allowLegacy: false }) !== null;
}

export function assertMemoryType(value, options) {
    const normalized = normalizeMemoryType(value, options);
    if (!normalized) {
        throw new TypeError(`Unsupported memory type: ${String(value)}`);
    }
    return normalized;
}
