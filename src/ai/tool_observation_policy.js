export function shouldPersistToolObservation({ status, name } = {}) {
    return status === 'success' && name !== 'search_archive_memory';
}
