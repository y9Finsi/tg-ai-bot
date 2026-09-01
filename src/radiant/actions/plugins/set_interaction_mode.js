/**
 * RADIANT Plugin: set_interaction_mode
 * Переключает режим взаимодействия и обновляет интимное действие/шкалу возбуждения.
 */

export const setInteractionModeAction = {
    name: 'set_interaction_mode',
    title: 'Установить режим взаимодействия',
    description: 'Установить режим взаимодействия (CASUAL, EROTIC, JOKE) и действие вирта.',
    inputSchema: {
        type: 'object',
        properties: {
            mode: {
                type: 'string',
                enum: ['CASUAL', 'EROTIC', 'JOKE'],
                description: 'Активный режим диалога'
            },
            arousal_action: {
                type: 'string',
                enum: ['NONE', 'KISS_TOUCH', 'ORAL_LICK', 'SEX_PENETRATION', 'CLIMAX_TRIGGER', 'COOL_DOWN'],
                description: 'Тип интимного действия'
            },
            intensity: {
                type: 'number',
                description: 'Интенсивность действия от 0.0 до 1.0'
            }
        },
        required: ['mode']
    },
    async execute({ mode, arousal_action = 'NONE', intensity = 0.5 }, context = {}) {
        return {
            status: 'success',
            data: {
                mode: mode || 'CASUAL',
                arousal_action: arousal_action || 'NONE',
                intensity: Number(intensity) || 0.5,
                summary: `Режим: ${mode}, действие: ${arousal_action}`
            }
        };
    }
};
