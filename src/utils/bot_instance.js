/**
 * Singleton holder for active Telegraf Telegram bot instance.
 * Allows radiant actions and services to dispatch direct messages (e.g. PM photo delivery from groups)
 * without circular dependencies.
 */

let activeBotInstance = null;

export function setBotInstance(bot) {
    if (bot) {
        activeBotInstance = bot;
    }
}

export function getBotInstance() {
    return activeBotInstance;
}
