/**
 * General UI and DOM helper functions.
 */

export function copyToClipboard(text, onSuccess) {
    if (!text) return;
    const value = typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(() => onSuccess && onSuccess()).catch(() => {});
    }
}

export function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function getKindBadgeVariant(kind = '') {
    const k = String(kind).toUpperCase();
    if (k.includes('EROTIC')) return 'red';
    if (k.includes('CASUAL') || k.includes('CHAT')) return 'blue';
    if (k.includes('JOKE')) return 'yellow';
    if (k.includes('MEMORY')) return 'purple';
    if (k.includes('CHANNEL') || k.includes('OBSERVER')) return 'green';
    return 'default';
}
