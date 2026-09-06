/**
 * World Map & Location Graph for Radiant LERA Engine (Saint Petersburg)
 *
 * `coordinates` are real lat/lng (used by the public Leaflet map).
 * `map_pos` is a normalized 0..100 position on the stylized admin canvas.
 */

export const LOCATIONS = {
    petrogradka_home: {
        id: 'petrogradka_home',
        name: 'Квартира на Петроградке (Дом Бенуа)',
        short_name: 'Дом',
        icon: '🏠',
        district: 'Петроградская сторона',
        type: 'home',
        is_indoor: true,
        coordinates: [59.96175, 30.31448],
        map_pos: { x: 30, y: 42 },
        travel_times: {
            vkusvill_lenina: 12,
            cafe_sloy: 12,
            showroom_work: 30,
            bar_rubinsteina: 40,
            spbgik: 25,
            matveevsky_garden: 5,
            metro_gorkovskaya: 10,
            metro_chkalovskaya: 15
        }
    },
    vkusvill_lenina: {
        id: 'vkusvill_lenina',
        name: 'ВкусВилл на Ленина',
        short_name: 'ВкусВилл',
        icon: '🛒',
        district: 'Петроградская сторона',
        type: 'shop',
        is_indoor: true,
        coordinates: [59.96105, 30.30148],
        map_pos: { x: 16, y: 30 },
        travel_times: {
            petrogradka_home: 12,
            cafe_sloy: 3,
            matveevsky_garden: 8
        }
    },
    cafe_sloy: {
        id: 'cafe_sloy',
        name: 'Кофейня «Слой»',
        short_name: 'Слой',
        icon: '☕',
        district: 'Петроградская сторона',
        type: 'cafe',
        is_indoor: true,
        coordinates: [59.96025, 30.30155],
        map_pos: { x: 44, y: 22 },
        travel_times: {
            petrogradka_home: 12,
            vkusvill_lenina: 3,
            matveevsky_garden: 8
        }
    },
    spbgik: {
        id: 'spbgik',
        name: 'СПбГИК (Институт культуры)',
        short_name: 'СПбГИК',
        icon: '🎓',
        district: 'Дворцовая набережная',
        type: 'study',
        is_indoor: true,
        coordinates: [59.94460, 30.32350],
        map_pos: { x: 55, y: 55 },
        travel_times: {
            petrogradka_home: 25,
            petropavlovka: 15,
            bar_rubinsteina: 20
        }
    },
    showroom_work: {
        id: 'showroom_work',
        name: 'Шоурум одежды Макса (Севкабель)',
        short_name: 'Шоурум',
        icon: '👗',
        district: 'Васильевский остров',
        type: 'work',
        is_indoor: true,
        coordinates: [59.92440, 30.24204],
        map_pos: { x: 14, y: 68 },
        travel_times: {
            petrogradka_home: 30,
            sevcable_port: 2,
            new_holland: 25
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
        coordinates: [59.92805, 30.34295],
        map_pos: { x: 76, y: 74 },
        travel_times: {
            petrogradka_home: 40,
            spbgik: 20,
            sennaya_sq: 15
        }
    },
    sevcable_port: {
        id: 'sevcable_port',
        name: 'Севкабель Порт (набережная)',
        short_name: 'Севкабель',
        icon: '🌊',
        district: 'Васильевский остров',
        type: 'culture',
        is_indoor: false,
        coordinates: [59.92440, 30.24204],
        map_pos: { x: 14, y: 68 },
        travel_times: {
            showroom_work: 2,
            petrogradka_home: 30
        }
    },
    new_holland: {
        id: 'new_holland',
        name: 'Остров Новая Голландия',
        short_name: 'Новая Голландия',
        icon: '🌲',
        district: 'Адмиралтейский район',
        type: 'park',
        is_indoor: false,
        coordinates: [59.92950, 30.28900],
        map_pos: { x: 35, y: 65 },
        travel_times: {
            petrogradka_home: 30,
            sennaya_sq: 20
        }
    },
    petropavlovka: {
        id: 'petropavlovka',
        name: 'Петропавловская крепость',
        short_name: 'Петропавловка',
        icon: '🏰',
        district: 'Петроградская сторона',
        type: 'culture',
        is_indoor: false,
        coordinates: [59.95000, 30.31600],
        map_pos: { x: 48, y: 48 },
        travel_times: {
            petrogradka_home: 15,
            spbgik: 15,
            metro_gorkovskaya: 8
        }
    },
    metro_gorkovskaya: {
        id: 'metro_gorkovskaya',
        name: 'Метро Горьковская (Александровский парк)',
        short_name: 'Горьковская',
        icon: '🚇',
        district: 'Петроградская сторона',
        type: 'metro',
        is_indoor: true,
        coordinates: [59.95610, 30.31880],
        map_pos: { x: 45, y: 45 },
        travel_times: {
            petrogradka_home: 10,
            petropavlovka: 8
        }
    },
    metro_chkalovskaya: {
        id: 'metro_chkalovskaya',
        name: 'Метро Чкаловская',
        short_name: 'Чкаловская',
        icon: '🚇',
        district: 'Петроградская сторона',
        type: 'metro',
        is_indoor: true,
        coordinates: [59.96100, 30.29200],
        map_pos: { x: 20, y: 25 },
        travel_times: {
            petrogradka_home: 15,
            cafe_sloy: 8
        }
    },
    matveevsky_garden: {
        id: 'matveevsky_garden',
        name: 'Матвеевский сад',
        short_name: 'Матвеевский сквер',
        icon: '🌳',
        district: 'Петроградская сторона',
        type: 'park',
        is_indoor: false,
        coordinates: [59.95950, 30.31100],
        map_pos: { x: 38, y: 35 },
        travel_times: {
            petrogradka_home: 5,
            cafe_sloy: 8
        }
    },
    sennaya_sq: {
        id: 'sennaya_sq',
        name: 'Сенная площадь',
        short_name: 'Сенная',
        icon: '🏛️',
        district: 'Адмиралтейский район',
        type: 'culture',
        is_indoor: false,
        coordinates: [59.92720, 30.31750],
        map_pos: { x: 50, y: 70 },
        travel_times: {
            bar_rubinsteina: 15,
            new_holland: 20
        }
    },
    lopukhinsky_garden: {
        id: 'lopukhinsky_garden',
        name: 'Лопухинский сад',
        short_name: 'Лопухинский сад',
        icon: '🌿',
        district: 'Петроградская сторона',
        type: 'park',
        is_indoor: false,
        coordinates: [59.97600, 30.30150],
        map_pos: { x: 30, y: 10 },
        travel_times: {
            petrogradka_home: 20
        }
    }
};

/**
 * Calculates travel duration and transit penalties based on weather & outfit.
 */
export function calculateHaversineDistanceKm(coords1, coords2) {
    if (!coords1 || !coords2) return 1;
    const [lat1, lon1] = coords1;
    const [lat2, lon2] = coords2;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calculateTravelInfo(fromLocationId, toLocationId, weather = {}, equippedItem = null) {
    const fromLoc = LOCATIONS[fromLocationId] || LOCATIONS.petrogradka_home;
    const toLoc = LOCATIONS[toLocationId] || LOCATIONS.petrogradka_home;
    
    let baseDuration = fromLoc.travel_times?.[toLocationId];
    if (baseDuration === undefined) {
        const distKm = calculateHaversineDistanceKm(fromLoc.coordinates, toLoc.coordinates);
        // ~12-14 mins per km walk, minimum 5 mins
        baseDuration = Math.max(5, Math.round(distKm * 14));
    }

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
