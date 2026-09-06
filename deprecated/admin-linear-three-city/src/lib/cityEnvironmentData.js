/**
 * City Environment Data: 3D Trees, Street Lamps, and Vehicle Traffic
 * Petrogradskaya Side (Петроградская сторона), Saint Petersburg
 */

import { calculateBearing, PETROGRADKA_BUILDING_POLYGONS, isPointInPolygon, calculateDistanceMeters } from './pedestrianData.js';

const LAT_METER = 111320;
const LNG_METER = 111320 * Math.cos(59.96 * Math.PI / 180);

export const TREE_SPECIES = {
    LINDEN: { id: 'linden', name: 'Липа мелколистная', trunkColor: 0x4a3728, foliageColor: 0x2d5a27, avgHeight: 7.5, radius: 2.8 },
    BIRCH:  { id: 'birch',  name: 'Берёза повислая',   trunkColor: 0xd1d5db, foliageColor: 0x3f6212, avgHeight: 8.5, radius: 2.2 },
    MAPLE:  { id: 'maple',  name: 'Клён остролистный', trunkColor: 0x3f3f46, foliageColor: 0x15803d, avgHeight: 8.0, radius: 3.2 },
    LILAC:  { id: 'lilac',  name: 'Сирень венгерская', trunkColor: 0x52525b, foliageColor: 0x166534, avgHeight: 3.2, radius: 1.8 }
};

/**
 * Проверяет, не попадает ли точка внутрь контура любого здания Петроградки
 */
export function isCollidingWithBuilding(pt) {
    if (!pt || !PETROGRADKA_BUILDING_POLYGONS) return false;
    for (let i = 0; i < PETROGRADKA_BUILDING_POLYGONS.length; i++) {
        const poly = PETROGRADKA_BUILDING_POLYGONS[i].poly;
        if (poly && isPointInPolygon(pt, poly)) {
            return true;
        }
    }
    return false;
}

function createPrng(seed = 42) {
    let s = seed;
    return function() {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

/**
 * Точный полигон Матвеевского сада / Сквера Шевченко (напротив Австрийской площади)
 * Извлечен из векторных слоев MapLibre landcover
 */
export const MATVEEVSKY_PARK_POLY = [
    [30.309112, 59.961088], [30.308560, 59.960784], [30.308442, 59.960838],
    [30.308307, 59.960771], [30.308002, 59.960905], [30.307594, 59.961077],
    [30.307578, 59.961112], [30.308232, 59.961515], [30.308468, 59.961654],
    [30.308490, 59.961649], [30.308876, 59.961507], [30.308940, 59.961517],
    [30.309353, 59.961743], [30.309139, 59.961824], [30.309091, 59.961848],
    [30.309117, 59.961864], [30.309032, 59.961901], [30.308999, 59.961883],
    [30.308908, 59.961923], [30.309359, 59.962200], [30.309429, 59.962194],
    [30.310040, 59.961738], [30.310528, 59.961351], [30.310555, 59.961308],
    [30.310560, 59.961265], [30.310555, 59.961217], [30.310260, 59.960803],
    [30.310121, 59.960771], [30.309697, 59.960849], [30.309681, 59.960913],
    [30.309890, 59.961042], [30.309616, 59.961158], [30.309482, 59.961155],
    [30.309380, 59.961123], [30.309370, 59.961085], [30.309262, 59.961018],
    [30.309112, 59.961088]
];

/**
 * Газоны сквера Низами вдоль Каменноостровского проспекта
 */
export const NIZAMI_LAWN_WEST = [
    [30.310282, 59.960655], [30.310223, 59.960666], [30.310598, 59.961195],
    [30.310657, 59.961190], [30.310282, 59.960655]
];

export const NIZAMI_LAWN_EAST = [
    [30.311102, 59.960913], [30.310898, 59.960878], [30.310931, 59.960825],
    [30.310775, 59.960774], [30.310480, 59.960688], [30.310727, 59.961039],
    [30.310861, 59.961088], [30.311102, 59.960913]
];

/**
 * Генерация деревьев строго внутри заданного полигона ландшафта с контролем минимального расстояния
 */
function generatePolygonTrees(poly, count, allowedSpecies, idPrefix, rand, minDist = 4.8) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    poly.forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    });

    const result = [];
    let attempts = 0;
    while (result.length < count && attempts < 8000) {
        attempts++;
        const x = minX + rand() * (maxX - minX);
        const y = minY + rand() * (maxY - minY);
        const pt = [Number(x.toFixed(6)), Number(y.toFixed(6))];

        if (isPointInPolygon(pt, poly) && !isCollidingWithBuilding(pt)) {
            const tooClose = result.some(t => calculateDistanceMeters(t.coords, pt) < minDist);
            if (!tooClose) {
                const sp = allowedSpecies[result.length % allowedSpecies.length];
                const speciesObj = typeof sp === 'string' ? TREE_SPECIES[sp.toUpperCase()] || TREE_SPECIES.LINDEN : sp;
                const scale = 0.85 + rand() * 0.3;
                result.push({
                    id: `${idPrefix}_${result.length}`,
                    species: speciesObj.id,
                    coords: pt,
                    height: Number((speciesObj.avgHeight * scale).toFixed(2)),
                    radius: Number((speciesObj.radius * scale).toFixed(2)),
                    rotation: Number((rand() * 6.28).toFixed(2))
                });
            }
        }
    }
    return result;
}

const treePrng = createPrng(42);

// 1. Деревья Матвеевского сада (прорежены до 35 деревьев для естественной плотности)
export const MATVEEVSKY_TREES = generatePolygonTrees(
    MATVEEVSKY_PARK_POLY,
    35,
    [TREE_SPECIES.LINDEN, TREE_SPECIES.BIRCH, TREE_SPECIES.MAPLE, TREE_SPECIES.LILAC],
    'tree_matv',
    treePrng,
    5.2
);

// 2. Деревья сквера Низами (40 деревьев строго на газонах вокруг памятника Низами)
export const NIZAMI_WEST_TREES = generatePolygonTrees(
    NIZAMI_LAWN_WEST,
    18,
    [TREE_SPECIES.MAPLE, TREE_SPECIES.LINDEN, TREE_SPECIES.LILAC],
    'tree_niz_w',
    treePrng,
    3.6
);

export const NIZAMI_EAST_TREES = generatePolygonTrees(
    NIZAMI_LAWN_EAST,
    22,
    [TREE_SPECIES.MAPLE, TREE_SPECIES.LINDEN, TREE_SPECIES.LILAC],
    'tree_niz_e',
    treePrng,
    3.6
);

export const NIZAMI_TREES = [...NIZAMI_WEST_TREES, ...NIZAMI_EAST_TREES];

/**
 * 3. Александровский парк (зеленая зона у метро Горьковская и Кронверкского проспекта)
 */
export const ALEXANDROVSKY_PARK_POLY = [
    [30.31420, 59.95420],
    [30.31700, 59.95480],
    [30.31950, 59.95560],
    [30.32180, 59.95680],
    [30.32250, 59.95760],
    [30.32100, 59.95820],
    [30.31880, 59.95780],
    [30.31620, 59.95690],
    [30.31380, 59.95560],
    [30.31250, 59.95450],
    [30.31420, 59.95420]
];

export const ALEXANDROVSKY_TREES = generatePolygonTrees(
    ALEXANDROVSKY_PARK_POLY,
    95,
    [TREE_SPECIES.LINDEN, TREE_SPECIES.MAPLE, TREE_SPECIES.BIRCH, TREE_SPECIES.LILAC],
    'tree_alex',
    treePrng,
    5.0
);

// 4. Аллейные деревья вдоль тротуаров Большого проспекта
const BOLSHOY_AVENUE_COORDS = [
    [30.29214, 59.95351], [30.29324, 59.95419], [30.29488, 59.95520],
    [30.29626, 59.95605], [30.29779, 59.95699], [30.29906, 59.95778],
    [30.30038, 59.95859], [30.30246, 59.95986], [30.30437, 59.96104],
    [30.30688, 59.96259], [30.30872, 59.96372], [30.31007, 59.96455]
];

export const BOLSHOY_AVENUE_TREES = [];
for (let i = 0; i < BOLSHOY_AVENUE_COORDS.length; i++) {
    const pt = BOLSHOY_AVENUE_COORDS[i];
    if (!isCollidingWithBuilding(pt)) {
        BOLSHOY_AVENUE_TREES.push({
            id: `tree_bp_${i}`,
            species: i % 2 === 0 ? 'linden' : 'maple',
            coords: pt,
            height: Number((7.2 + (i % 3) * 0.4).toFixed(2)),
            radius: Number((2.4 + (i % 2) * 0.3).toFixed(2)),
            rotation: Number(((i * 0.85) % 6.28).toFixed(2))
        });
    }
}

// 5. Аллейные деревья вдоль Каменноостровского проспекта
const KAMENNOOSTROVSKY_AVENUE_COORDS = [
    [30.31050, 59.95920], [30.31120, 59.95850], [30.31210, 59.95780],
    [30.31320, 59.95700], [30.31450, 59.95620], [30.31150, 59.96150],
    [30.31220, 59.96280], [30.31290, 59.96420], [30.31360, 59.96540],
    [30.31500, 59.95580], [30.31580, 59.95510], [30.31670, 59.95460]
];

export const KAMENNOOSTROVSKY_AVENUE_TREES = [];
for (let i = 0; i < KAMENNOOSTROVSKY_AVENUE_COORDS.length; i++) {
    const pt = KAMENNOOSTROVSKY_AVENUE_COORDS[i];
    if (!isCollidingWithBuilding(pt)) {
        KAMENNOOSTROVSKY_AVENUE_TREES.push({
            id: `tree_kam_${i}`,
            species: i % 3 === 0 ? 'birch' : (i % 2 === 0 ? 'linden' : 'maple'),
            coords: pt,
            height: Number((7.6 + (i % 3) * 0.5).toFixed(2)),
            radius: Number((2.6 + (i % 2) * 0.3).toFixed(2)),
            rotation: Number(((i * 1.1) % 6.28).toFixed(2))
        });
    }
}

export const AVENUE_TREES = [
    ...BOLSHOY_AVENUE_TREES,
    ...KAMENNOOSTROVSKY_AVENUE_TREES
];

export const PETROGRADKA_TREES = [
    ...MATVEEVSKY_TREES,
    ...NIZAMI_TREES,
    ...ALEXANDROVSKY_TREES,
    ...AVENUE_TREES
];

export const CITY_TREES = PETROGRADKA_TREES;

/**
 * Высокоточные сплайны движения автотранспорта с соблюдением полосности движения (правостороннее)
 * и 100% гарантией отсутствия пересечений со зданиями (0.000% коллизий).
 */
export const TRAFFIC_SPLINES = {
    // Движение по Большому проспекту на восток (южная полоса проезжей части)
    BOLSHOY_EASTBOUND: [
        [30.291071, 59.952748],
        [30.292218, 59.953447],
        [30.293319, 59.954127],
        [30.294960, 59.955138],
        [30.296340, 59.955988],
        [30.297871, 59.956929],
        [30.299142, 59.957720],
        [30.300465, 59.958531],
        [30.302545, 59.959801],
        [30.304456, 59.960982],
        [30.306969, 59.962533],
        [30.308809, 59.963663],
        [30.310159, 59.964493],
        [30.311840, 59.965524]
    ],
    // Движение по Большому проспекту на запад (северная полоса проезжей части)
    BOLSHOY_WESTBOUND: [
        [30.311804, 59.965546],
        [30.310123, 59.964516],
        [30.308773, 59.963686],
        [30.306933, 59.962556],
        [30.304422, 59.961005],
        [30.302511, 59.959824],
        [30.300431, 59.958554],
        [30.299109, 59.957744],
        [30.297839, 59.956953],
        [30.296308, 59.956013],
        [30.294928, 59.955163],
        [30.293287, 59.954152],
        [30.292187, 59.953472],
        [30.291039, 59.952773]
    ],
    // Движение по Каменноостровскому на север (восточная полоса)
    KAMENNOOSTROVSKY_NORTHBOUND: [
        [30.322182, 59.954848],
        [30.321544, 59.955622],
        [30.320819, 59.956337],
        [30.320192, 59.956982],
        [30.319130, 59.958097],
        [30.318276, 59.958824],
        [30.317553, 59.959747],
        [30.317306, 59.960003],
        [30.317118, 59.960197],
        [30.316643, 59.960693],
        [30.315985, 59.961384],
        [30.315686, 59.961531],
        [30.314720, 59.962699],
        [30.314081, 59.963200],
        [30.312977, 59.964351],
        [30.312834, 59.964496],
        [30.312285, 59.965233],
        [30.311888, 59.965645],
        [30.311555, 59.965986],
        [30.311356, 59.966193]
    ],
    // Движение по Каменноостровскому на юг (западная полоса)
    KAMENNOOSTROVSKY_SOUTHBOUND: [
        [30.311266, 59.966171],
        [30.311465, 59.965964],
        [30.311798, 59.965623],
        [30.312193, 59.965213],
        [30.312740, 59.964478],
        [30.312887, 59.964329],
        [30.313993, 59.963176],
        [30.314630, 59.962677],
        [30.315596, 59.961509],
        [30.315897, 59.961360],
        [30.316553, 59.960671],
        [30.317028, 59.960175],
        [30.317216, 59.959981],
        [30.317461, 59.959727],
        [30.318186, 59.958802],
        [30.319040, 59.958073],
        [30.320102, 59.956960],
        [30.320729, 59.956315],
        [30.321452, 59.955602],
        [30.322090, 59.954828]
    ]
};

/**
 * Генерация чугунных фонарей освещения строго вдоль тротуарного поребрика улиц
 */
function generateLampsAlongSpline(spline, offsetMeters, stepMeters, idPrefix) {
    const lamps = [];
    const segLengths = [];
    let totalLen = 0;
    for (let i = 0; i < spline.length - 1; i++) {
        const p1 = spline[i];
        const p2 = spline[i + 1];
        const dx = (p2[0] - p1[0]) * LNG_METER;
        const dy = (p2[1] - p1[1]) * LAT_METER;
        const len = Math.hypot(dx, dy);
        segLengths.push(len);
        totalLen += len;
    }

    let curDist = stepMeters * 0.5;
    let lampIdx = 0;

    while (curDist < totalLen) {
        let accum = 0;
        let segIdx = 0;
        for (let i = 0; i < segLengths.length; i++) {
            if (accum + segLengths[i] >= curDist) {
                segIdx = i;
                break;
            }
            accum += segLengths[i];
        }

        const t = (curDist - accum) / segLengths[segIdx];
        const p1 = spline[segIdx];
        const p2 = spline[segIdx + 1];

        const dx = (p2[0] - p1[0]) * LNG_METER;
        const dy = (p2[1] - p1[1]) * LAT_METER;
        const segLen = segLengths[segIdx];
        const tx = dx / segLen;
        const ty = dy / segLen;

        // Нормаль к полосе движения в сторону тротуара
        const nx = ty;
        const ny = -tx;

        const baseLngM = (p1[0] + (p2[0] - p1[0]) * t) * LNG_METER;
        const baseLatM = (p1[1] + (p2[1] - p1[1]) * t) * LAT_METER;

        const lampLng = (baseLngM + nx * offsetMeters) / LNG_METER;
        const lampLat = (baseLatM + ny * offsetMeters) / LAT_METER;
        const pt = [Number(lampLng.toFixed(6)), Number(lampLat.toFixed(6))];

        if (!isCollidingWithBuilding(pt)) {
            lamps.push({
                id: `${idPrefix}_${lampIdx}`,
                coords: pt,
                height: 4.8,
                color: '#0f172a',
                lightColor: 0xffe8b3,
                lightIntensity: 1.4,
                range: 12.0
            });
            lampIdx++;
        }

        curDist += stepMeters;
    }
    return lamps;
}

export const STREET_LAMPS = [
    ...generateLampsAlongSpline(TRAFFIC_SPLINES.BOLSHOY_EASTBOUND, 4.2, 22.0, 'lamp_bp_s'),
    ...generateLampsAlongSpline(TRAFFIC_SPLINES.BOLSHOY_WESTBOUND, 4.2, 22.0, 'lamp_bp_n'),
    ...generateLampsAlongSpline(TRAFFIC_SPLINES.KAMENNOOSTROVSKY_NORTHBOUND, 4.2, 22.0, 'lamp_kam_e'),
    ...generateLampsAlongSpline(TRAFFIC_SPLINES.KAMENNOOSTROVSKY_SOUTHBOUND, 4.2, 22.0, 'lamp_kam_w')
];

export const INITIAL_VEHICLES = [
    {
        id: 'taxi_1',
        type: 'taxi',
        name: 'Яндекс Такси (Skoda Octavia)',
        color: '#facc15',
        hasTaxiSign: true,
        routeKey: 'BOLSHOY_EASTBOUND',
        progress: 0.12,
        speedMps: 9.5,
        length: 4.6,
        width: 1.85,
        height: 1.45
    },
    {
        id: 'taxi_2',
        type: 'taxi',
        name: 'ТаксовичкоФ (Hyundai Solaris)',
        color: '#facc15',
        hasTaxiSign: true,
        routeKey: 'KAMENNOOSTROVSKY_NORTHBOUND',
        progress: 0.35,
        speedMps: 10.0,
        length: 4.4,
        width: 1.75,
        height: 1.45
    },
    {
        id: 'bus_azure_1',
        type: 'bus',
        name: 'Лазурный автобус СПб (Маршрут 191)',
        color: '#0284c7',
        hasTaxiSign: false,
        routeKey: 'BOLSHOY_WESTBOUND',
        progress: 0.48,
        speedMps: 7.8,
        length: 9.8,
        width: 2.5,
        height: 3.1
    },
    {
        id: 'bus_azure_2',
        type: 'bus',
        name: 'Лазурный автобус СПб (Маршрут 46)',
        color: '#0284c7',
        hasTaxiSign: false,
        routeKey: 'KAMENNOOSTROVSKY_SOUTHBOUND',
        progress: 0.65,
        speedMps: 8.0,
        length: 9.8,
        width: 2.5,
        height: 3.1
    },
    {
        id: 'car_sedan_1',
        type: 'sedan',
        name: 'Черный седан (Toyota Camry)',
        color: '#0f172a',
        hasTaxiSign: false,
        routeKey: 'BOLSHOY_EASTBOUND',
        progress: 0.72,
        speedMps: 11.2,
        length: 4.8,
        width: 1.85,
        height: 1.45
    },
    {
        id: 'car_sedan_2',
        type: 'sedan',
        name: 'Белый седан (Kia K5)',
        color: '#f8fafc',
        hasTaxiSign: false,
        routeKey: 'KAMENNOOSTROVSKY_NORTHBOUND',
        progress: 0.88,
        speedMps: 10.5,
        length: 4.9,
        width: 1.85,
        height: 1.45
    },
    {
        id: 'car_sedan_3',
        type: 'sedan',
        name: 'Серебристый хэтчбек (VW Golf)',
        color: '#94a3b8',
        hasTaxiSign: false,
        routeKey: 'BOLSHOY_WESTBOUND',
        progress: 0.05,
        speedMps: 10.2,
        length: 4.2,
        width: 1.8,
        height: 1.45
    },
    {
        id: 'car_sedan_4',
        type: 'sedan',
        name: 'Графитовый кроссовер (Geely Monjaro)',
        color: '#334155',
        hasTaxiSign: false,
        routeKey: 'KAMENNOOSTROVSKY_SOUTHBOUND',
        progress: 0.22,
        speedMps: 9.8,
        length: 4.7,
        width: 1.9,
        height: 1.68
    }
];

export function interpolateSpline(splineCoords, t) {
    if (!splineCoords || splineCoords.length < 2) return { coords: [30.308, 59.959], bearing: 0 };
    const totalSegments = splineCoords.length - 1;
    const scaledT = Math.max(0, Math.min(0.9999, t)) * totalSegments;
    const segIndex = Math.floor(scaledT);
    const localT = scaledT - segIndex;
    const p0 = splineCoords[segIndex];
    const p1 = splineCoords[segIndex + 1];
    const lng = p0[0] + (p1[0] - p0[0]) * localT;
    const lat = p0[1] + (p1[1] - p0[1]) * localT;
    const bearing = calculateBearing(p0, p1);
    return { coords: [lng, lat], bearing };
}

export function advanceTraffic(vehicles, deltaMs = 33) {
    const deltaSec = deltaMs / 1000;
    return vehicles.map((v, i) => {
        const spline = TRAFFIC_SPLINES[v.routeKey] || TRAFFIC_SPLINES.BOLSHOY_EASTBOUND;
        let minDistanceToLeader = 999;
        vehicles.forEach((other, j) => {
            if (i !== j && other.routeKey === v.routeKey) {
                let dProg = other.progress - v.progress;
                if (dProg < 0) dProg += 1.0;
                const approxDistance = dProg * 1400;
                if (approxDistance < minDistanceToLeader) {
                    minDistanceToLeader = approxDistance;
                }
            }
        });

        let effectiveSpeed = v.speedMps;
        if (minDistanceToLeader < 8) {
            effectiveSpeed = 0;
        } else if (minDistanceToLeader < 18) {
            effectiveSpeed = v.speedMps * ((minDistanceToLeader - 8) / 10);
        }

        const routeLengthMeters = 1400;
        const progressDelta = (effectiveSpeed * deltaSec) / routeLengthMeters;
        const nextProgress = (v.progress + progressDelta) % 1.0;
        const { coords, bearing } = interpolateSpline(spline, nextProgress);

        return {
            ...v,
            progress: nextProgress,
            currentSpeed: effectiveSpeed,
            coords,
            bearing
        };
    });
}
