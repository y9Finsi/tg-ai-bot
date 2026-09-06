/**
 * Date and time formatting utilities for Europe/Moscow timezone.
 */

export function formatDay(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(new Date(value));
}

export function formatTime(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

export function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(value));
}

export function mskDateParts(value = new Date()) {
    return Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        })
            .formatToParts(new Date(value))
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value])
    );
}

export function isoDate(value) {
    const parts = mskDateParts(value);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftIsoDate(value, amount) {
    const date = new Date(`${value}T12:00:00+03:00`);
    date.setDate(date.getDate() + amount);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

export function formatRelativeTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 30) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays === 1) return `вчера ${formatTime(value)}`;
    return formatDate(value);
}

export function formatCountdown(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (value < 1) return 'меньше минуты';
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return hours ? `${hours} ч ${rest ? `${rest} мин` : ''}`.trim() : `${rest} мин`;
}

export function getMoscowDateTimeLocal(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const value = type => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
