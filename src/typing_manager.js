const typingChats = new Map();
const TYPING_REFRESH_MS = 4000;

function getTypingErrorMessage(error) {
    return error?.response?.description || error?.description || error?.message || String(error);
}

export async function sendTypingAction(bot, chatId) {
    try {
        await bot.telegram.sendChatAction(chatId, 'typing');
        return true;
    } catch (error) {
        console.warn(`[TYPING ACTION ERROR] chat ${chatId}: ${getTypingErrorMessage(error)}`);
        return false;
    }
}

export function startTyping(bot, chatId, requestId) {
    if (chatId == null || !requestId) return;

    const key = String(chatId);
    let state = typingChats.get(key);
    if (!state) {
        state = {
            bot,
            requestIds: new Set(),
            interval: null
        };
        typingChats.set(key, state);
        state.interval = setInterval(() => {
            void sendTypingAction(state.bot, chatId);
        }, TYPING_REFRESH_MS);
        state.interval.unref?.();
    }

    state.requestIds.add(String(requestId));
    void sendTypingAction(state.bot, chatId);
}

export function stopTyping(chatId, requestId) {
    const key = String(chatId);
    const state = typingChats.get(key);
    if (!state) return;

    if (requestId) state.requestIds.delete(String(requestId));
    else state.requestIds.clear();

    if (state.requestIds.size > 0) return;
    clearInterval(state.interval);
    typingChats.delete(key);
}
