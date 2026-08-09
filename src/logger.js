import { EventEmitter } from 'events';

class LoggerEmitter extends EventEmitter {}
export const logEmitter = new LoggerEmitter();

const MAX_LOGS = 500;
const logHistory = [];

function formatLogItem(type, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
    return {
        id: Date.now() + Math.random(),
        timestamp,
        type,
        message
    };
}

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function (...args) {
    originalLog.apply(console, args);
    const item = formatLogItem('INFO', args);
    pushLog(item);
};

console.error = function (...args) {
    originalError.apply(console, args);
    const item = formatLogItem('ERROR', args);
    pushLog(item);
};

console.warn = function (...args) {
    originalWarn.apply(console, args);
    const item = formatLogItem('WARN', args);
    pushLog(item);
};

function pushLog(item) {
    logHistory.push(item);
    if (logHistory.length > MAX_LOGS) {
        logHistory.shift();
    }
    logEmitter.emit('log', item);
}

export function getRecentLogs() {
    return logHistory;
}
