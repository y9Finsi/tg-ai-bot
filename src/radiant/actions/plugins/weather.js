/**
 * RADIANT Plugin: weather
 * Возвращает текущую погоду в Санкт-Петербурге или любом запрошенном городе.
 */

import { WeatherService } from '../../weather_service.js';

const CITY_COORDINATES_CACHE = new Map([
    ['санкт-петербург', { latitude: 59.93, longitude: 30.31, name: 'Санкт-Петербург' }],
    ['питер', { latitude: 59.93, longitude: 30.31, name: 'Санкт-Петербург' }],
    ['спб', { latitude: 59.93, longitude: 30.31, name: 'Санкт-Петербург' }],
    ['москва', { latitude: 55.75, longitude: 37.61, name: 'Москва' }],
    ['сочи', { latitude: 43.59, longitude: 39.72, name: 'Сочи' }]
]);

async function getCoordinatesForCity(cityName) {
    const norm = String(cityName || '').trim().toLowerCase();
    if (!norm || norm === 'санкт-петербург' || norm === 'питер' || norm === 'спб') {
        return { latitude: 59.93, longitude: 30.31, name: 'Санкт-Петербург' };
    }

    if (CITY_COORDINATES_CACHE.has(norm)) {
        return CITY_COORDINATES_CACHE.get(norm);
    }

    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ru&format=json`;
        const res = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const data = await res.json();
            const hit = data.results?.[0];
            if (hit) {
                const coord = { latitude: hit.latitude, longitude: hit.longitude, name: hit.name || cityName };
                CITY_COORDINATES_CACHE.set(norm, coord);
                return coord;
            }
        }
    } catch {
        // Fallback
    }

    return { latitude: 59.93, longitude: 30.31, name: cityName || 'Санкт-Петербург' };
}

export const weatherAction = {
    name: 'weather',
    title: 'Погода',
    description: 'Получает актуальную текущую погоду в Санкт-Петербурге или любом другом указанном городе: температуру в градусах, дождь или осадки.',
    inputSchema: {
        type: 'object',
        properties: {
            city: {
                type: 'string',
                description: 'Город (например, Санкт-Петербург, Сочи, Москва)'
            }
        }
    },
    timeoutMs: 5000,
    config: {
        provider: 'open_meteo'
    },

    async execute(args = {}, context = {}) {
        const cityParam = String(args.city || '').trim();
        const isSpb = !cityParam || ['санкт-петербург', 'питер', 'спб'].includes(cityParam.toLowerCase());

        if (isSpb) {
            const snapshot = await WeatherService.getSnapshot();
            const temp = snapshot.temperature_c !== null ? `${Math.round(snapshot.temperature_c)}°C` : 'неизвестно';
            const isRaining = snapshot.is_raining === true ? 'идёт дождь' : 'без осадков';

            return {
                status: 'success',
                data: {
                    text: `Погода в Санкт-Петербурге сейчас: ${temp}, ${isRaining}.`,
                    city: 'Санкт-Петербург',
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

        // Запрос погоды для указанного города
        const { latitude, longitude, name: resolvedCity } = await getCoordinatesForCity(cityParam);
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,rain,weather_code,temperature_2m&timezone=auto`;
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const current = data.current || {};
            const tempVal = current.temperature_2m !== undefined ? current.temperature_2m : null;
            const temp = tempVal !== null ? `${Math.round(tempVal)}°C` : 'неизвестно';
            const isRaining = (Number(current.rain || current.precipitation || 0) > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(Number(current.weather_code))) ? 'идёт дождь' : 'без осадков';

            return {
                status: 'success',
                data: {
                    text: `Погода в городе ${resolvedCity} сейчас: ${temp}, ${isRaining}.`,
                    city: resolvedCity,
                    temperature_c: tempVal,
                    is_raining: isRaining.includes('дождь'),
                    fetched_at: new Date().toISOString()
                },
                meta: {
                    provider: 'open_meteo',
                    cached: false
                }
            };
        } catch (err) {
            return {
                status: 'error',
                data: null,
                error: {
                    code: 'WEATHER_FETCH_ERROR',
                    message: `Не удалось получить погоду для ${resolvedCity}: ${err.message}`
                }
            };
        }
    }
};

