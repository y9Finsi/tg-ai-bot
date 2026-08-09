/**
 * World Map & Location Graph for Radiant LERA Engine (Saint Petersburg)
 *
 * `coordinates` are real lat/lng (used by the public Leaflet map).
 * `map_pos` is a normalized 0..100 position on the stylized admin canvas.
 */

export const LOCATIONS = {
    petrogradka_home: {
        id: 'petrogradka_home',
        name: 'Квартира на Петроградке',
        short_name: 'Дом',
        icon: '🏠',
        district: 'Петроградская сторона',
        type: 'home',
        is_indoor: true,
        coordinates: [59.9589, 30.3049],
        map_pos: { x: 30, y: 42 },
        travel_times: {
            vkusvill_lenina: 15,
            cafe_sloy: 20,
            showroom_work: 30,
            bar_rubinsteina: 40
        }
    },
    vkusvill_lenina: {
        id: 'vkusvill_lenina',
        name: 'ВкусВилл на Большой Пушкарской',
        short_name: 'ВкусВилл',
        icon: '🛒',
        district: 'Петроградская сторона',
        type: 'shop',
        is_indoor: true,
        coordinates: [59.9563, 30.2986],
        map_pos: { x: 16, y: 30 },
        travel_times: {
            petrogradka_home: 15,
            cafe_sloy: 10
        }
    },
    cafe_sloy: {
        id: 'cafe_sloy',
        name: 'Кофейня Слой',
        short_name: 'Слой',
        icon: '☕',
        district: 'Петроградская сторона',
        type: 'cafe',
        is_indoor: true,
        coordinates: [59.9612, 30.3121],
        map_pos: { x: 44, y: 22 },
        travel_times: {
            petrogradka_home: 20,
            vkusvill_lenina: 10
        }
    },
    bar_rubinsteina: {
        id: 'bar_rubinsteina',
        name: 'Бар на улице Рубинштейна',
        short_name: 'Бар',
        icon: '🍸',
        district: 'Центральный район',
        type: 'bar',
        is_indoor: true,
        coordinates: [59.9294, 30.3437],
        map_pos: { x: 76, y: 74 },
        travel_times: {
            petrogradka_home: 40
        }
    },
    showroom_work: {
        id: 'showroom_work',
        name: 'Шоурум одежды Макса',
        short_name: 'Шоурум',
        icon: '👗',
        district: 'Васильевский остров',
        type: 'work',
        is_indoor: true,
        coordinates: [59.9386, 30.2731],
        map_pos: { x: 14, y: 68 },
        travel_times: {
            petrogradka_home: 30
        }
    }
};

/**
 * Calculates travel duration and transit penalties based on weather & outfit.
 */
export function calculateTravelInfo(fromLocationId, toLocationId, weather = {}, equippedItem = null) {
    const fromLoc = LOCATIONS[fromLocationId] || LOCATIONS.petrogradka_home;
    const baseDuration = fromLoc.travel_times[toLocationId] || 20;

    let extraModifiers = [];
    let moodPenalty = 0;

    if (weather.is_raining && (!equippedItem || !equippedItem.properties?.rain_resist)) {
        extraModifiers.push('WET_CLOTHES');
        moodPenalty += 15;
    }

    return {
        durationMinutes: baseDuration,
        targetLocation: toLocationId,
        extraModifiers,
        moodPenalty
    };
}

export function buildTransitRoute(fromLocationId, toLocationId) {
    const from = LOCATIONS[fromLocationId] || LOCATIONS.petrogradka_home;
    const to = LOCATIONS[toLocationId] || LOCATIONS.petrogradka_home;
    const midpoint = [
        Number(((from.coordinates[0] + to.coordinates[0]) / 2 + (from.coordinates[1] - to.coordinates[1]) * 0.018).toFixed(6)),
        Number(((from.coordinates[1] + to.coordinates[1]) / 2 + (to.coordinates[0] - from.coordinates[0]) * 0.018).toFixed(6))
    ];
    return [from.coordinates, midpoint, to.coordinates];
}

export function coordinateAtProgress(route, progressPercent = 0) {
    const points = Array.isArray(route) && route.length >= 2 ? route : [LOCATIONS.petrogradka_home.coordinates, LOCATIONS.petrogradka_home.coordinates];
    const progress = Math.max(0, Math.min(100, Number(progressPercent) || 0)) / 100;
    const scaled = progress * (points.length - 1);
    const index = Math.min(points.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = points[index]; const b = points[index + 1];
    return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
}
