export function buildMemoryRetrievalQuery({
    userText = '',
    lastLeraText = '',
    routingMode = 'CASUAL'
} = {}) {
    return [userText, lastLeraText, routingMode]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join('\n');
}
