import { EventEmitter } from 'node:events';

export const devtoolEvents = new EventEmitter();
devtoolEvents.setMaxListeners(100);

export function publishDevtoolEvent(type, payload = {}) {
    const event = { type, timestamp: new Date().toISOString(), ...payload };
    devtoolEvents.emit('event', event);
    return event;
}
