function asMessage(value) {
    return String(value || '').trim();
}

export function appendSandboxExchange(history, userMessage, assistantMessage, timestamp = Date.now()) {
    const user = asMessage(userMessage);
    const assistant = asMessage(assistantMessage);
    const currentHistory = Array.isArray(history) ? history : [];

    if (!user || !assistant) return currentHistory;

    return [...currentHistory,
        { id: `local-user-${timestamp}`, role: 'user', content: user },
        { id: `local-assistant-${timestamp}`, role: 'assistant', content: assistant }
    ];
}

export function getSandboxSelectedResult(result, abMode, selectedVariant = 'A') {
    if (!result) return null;
    return abMode ? result.variants?.[selectedVariant] || null : result;
}
