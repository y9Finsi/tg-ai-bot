const MEMORY_QUERY_STOP_WORDS = new Set([
    'а', 'без', 'бы', 'в', 'во', 'вот', 'вы', 'да', 'давай', 'для', 'до',
    'же', 'за', 'и', 'из', 'или', 'как', 'ко', 'мне', 'мы', 'на', 'не',
    'но', 'ну', 'о', 'об', 'от', 'по', 'под', 'про', 'с', 'со', 'так',
    'то', 'у', 'уже', 'что', 'это', 'я'
]);

function normalizeMemoryQueryText(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\b(?:CASUAL|EROTIC|JOKE|VISION|INITIATIVE)\b/giu, ' ')
        .replace(/[|{}\[\]"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildMemoryRetrievalQuery({ userText = '' } = {}) {
    const normalized = normalizeMemoryQueryText(userText);
    if (!normalized) return '';

    const tokens = normalized
        .split(/\s+/)
        .map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(token => token.length >= 2)
        .filter(token => !MEMORY_QUERY_STOP_WORDS.has(token.toLocaleLowerCase('ru-RU')));

    return tokens.length ? tokens.join(' ') : normalized;
}
