/**
 * RADIANT Plugin: set_reaction
 * Ставит эмодзи-реакцию на сообщение пользователя в Telegram.
 */

export const setReactionAction = {
    name: 'set_reaction',
    title: 'Поставить эмодзи-реакцию в Telegram',
    description: 'Поставить эмодзи-реакцию (❤️, 🔥, 👍, 🥰, 😘, ⚡, 😴) на сообщение пользователя.',
    inputSchema: {
        type: 'object',
        properties: {
            emoji: {
                type: 'string',
                enum: ['❤️', '🔥', '👍', '🥰', '😘', '⚡', '😴'],
                description: 'Эмодзи для реакции'
            }
        },
        required: ['emoji']
    },
    async execute({ emoji }, context = {}) {
        const selectedEmoji = String(emoji || '❤️').trim();
        return {
            status: 'success',
            data: {
                emoji: selectedEmoji,
                summary: `Выбрана реакция ${selectedEmoji}`
            }
        };
    }
};
