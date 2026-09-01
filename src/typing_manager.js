const typingChats = new Map();
const TYPING_REFRESH_MS = 4000;

function getTypingErrorMessage(error) {
    return error?.response?.description || error?.description || error?.message || String(error);
}

export async function sendTypingAction(bot, chatId, action = 'typing') {
    try {
        await bot.telegram.sendChatAction(chatId, action);
        return true;
    } catch (error) {
        console.warn(`[TYPING ACTION ERROR] chat ${chatId} (${action}): ${getTypingErrorMessage(error)}`);
        return false;
    }
}

async function refreshTypingAction(state, chatId) {
    const action = state.action || 'typing';
    const sent = await sendTypingAction(state.bot, chatId, action);
    if (sent && !state.successLogged) {
        state.successLogged = true;
        console.info(`[TYPING ACTION OK] chat ${chatId} (${action})`);
    }
}

export function startTyping(bot, chatId, requestId, action = 'typing') {
    if (chatId == null || !requestId) return;

    const key = String(chatId);
    let state = typingChats.get(key);
    if (!state) {
        state = {
            bot,
            action,
            requestIds: new Set(),
            interval: null,
            successLogged: false
        };
        typingChats.set(key, state);
        state.interval = setInterval(() => {
            void refreshTypingAction(state, chatId);
        }, TYPING_REFRESH_MS);
        state.interval.unref?.();
    } else {
        state.action = action;
    }

    state.requestIds.add(String(requestId));
    void refreshTypingAction(state, chatId);
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
