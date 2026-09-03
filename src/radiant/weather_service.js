const SPB = { latitude: 59.93, longitude: 30.31 };
const TTL_MS = 20 * 60 * 1000;
let override = null;

export class WeatherService {
    static cachedSnapshot = null;

    static setOverride(value) { override = value === null ? null : { is_raining: !!value, status: 'override', fetched_at: new Date().toISOString() }; }
    static clearOverride() { override = null; }
    static syncOverride(value) {
        if (!value) return this.clearOverride();
        override = { is_raining: !!value.is_raining, status: 'override', fetched_at: value.updated_at || new Date().toISOString() };
    }
    static async getSnapshot({ fetcher = globalThis.fetch, now = Date.now() } = {}) {
        if (override) return { ...override, coordinates: SPB };
        if (WeatherService.cachedSnapshot && (now - new Date(WeatherService.cachedSnapshot.fetched_at).getTime() <= TTL_MS)) {
            return WeatherService.cachedSnapshot;
        }
        try {
            const response = await fetcher(`https://api.open-meteo.com/v1/forecast?latitude=${SPB.latitude}&longitude=${SPB.longitude}&current=precipitation,rain,weather_code,temperature_2m&timezone=Europe%2FMoscow`);
            if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
            const data = await response.json();
            const current = data.current || {};
            WeatherService.cachedSnapshot = { is_raining: Number(current.rain || current.precipitation || 0) > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(Number(current.weather_code)), temperature_c: current.temperature_2m ?? null, weather_code: current.weather_code ?? null, status: 'fresh', fetched_at: new Date(now).toISOString(), coordinates: SPB };
            return WeatherService.cachedSnapshot;
        } catch (error) {
            return { is_raining: null, status: 'unavailable', error: error.message, coordinates: SPB };
        }
    }
}
