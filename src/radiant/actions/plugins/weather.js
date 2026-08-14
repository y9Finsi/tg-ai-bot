/**
 * RADIANT Plugin: weather
 * Возвращает текущую погоду в Санкт-Петербурге (температура, осадки, статус).
 */

import { WeatherService } from '../../weather_service.js';

export const weatherAction = {
    name: 'weather',
    description: 'Получает текущую и актуальную погоду в Санкт-Петербурге: температуру в градусах, дождь или осадки.',
    inputSchema: {
        type: 'object',
        properties: {
            city: {
                type: 'string',
                description: 'Город (по умолчанию Санкт-Петербург)'
            }
        }
    },
    timeoutMs: 5000,
    config: {
        provider: 'open_meteo'
    },

    async execute(args = {}, context = {}) {
        const snapshot = await WeatherService.getSnapshot();
        const temp = snapshot.temperature_c !== null ? `${Math.round(snapshot.temperature_c)}°C` : 'неизвестно';
        const isRaining = snapshot.is_raining === true ? 'идёт дождь' : 'без осадков';

        return {
            status: 'success',
            data: {
                text: `Погода в Санкт-Петербурге сейчас: ${temp}, ${isRaining}.`,
                temperature_c: snapshot.temperature_c,
                is_raining: snapshot.is_raining,
                status: snapshot.status,
                fetched_at: snapshot.fetched_at
            },
            meta: {
                provider: 'open_meteo',
                cached: snapshot.status === 'fresh' || snapshot.status === 'stale'
            }
        };
    }
};
