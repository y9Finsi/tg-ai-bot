/**
 * RADIANT Plugin: send_voice
 * Озвучивает реплику живым голосовым сообщением (войсом) Леры через CosyVoice.
 */

import { generateLeraVoice } from '../../../services/voice_generator.js';

export const sendVoiceAction = {
    name: 'send_voice',
    title: 'Отправить голосовое сообщение',
    description: 'Озвучить реплику живым голосовым сообщением (войсом) Леры.',
    inputSchema: {
        type: 'object',
        properties: {
            voice_text: {
                type: 'string',
                description: 'Текст на русском языке, который будет озвучен голосом Леры'
            }
        },
        required: ['voice_text']
    },
    async execute({ voice_text }, context = {}) {
        const text = String(voice_text || '').trim();
        if (!text) {
            return {
                status: 'error',
                error: { message: 'Текст для озвучки не указан' }
            };
        }

        try {
            const voiceRes = await generateLeraVoice({ text });
            if (voiceRes && voiceRes.buffer) {
                return {
                    status: 'success',
                    data: {
                        text,
                        voice: {
                            source: voiceRes.buffer,
                            buffer: voiceRes.buffer,
                            filename: voiceRes.filename || 'voice.ogg',
                            mimeType: voiceRes.mimeType
                        },
                        summary: `Озвучено голосовое сообщение (${text.length} симв.)`
                    }
                };
            }
            return {
                status: 'error',
                error: { message: 'Генерация голоса недоступна' }
            };
        } catch (err) {
            return {
                status: 'error',
                error: { message: `Ошибка синтеза речи: ${err.message}` }
            };
        }
    }
};
