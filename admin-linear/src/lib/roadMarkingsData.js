/**
 * Petrogradskaya Side Road Markings & Pedestrian Crosswalks GeoJSON
 *
 * Provides high-precision road network markings:
 * 1. Road Dividing Lines (centerlines) along Bolshoy and Kamennoostrovsky avenues
 *    with `line-dasharray: [4, 4]`.
 * 2. Pedestrian Crosswalks («зебры») at key intersections:
 *    - Bolshoy Prospekt & Lenina
 *    - Bolshoy Prospekt & Kamennoostrovsky (Leo Tolstoy Square)
 *    - Kamennoostrovsky & Kronverksky (Gorkovskaya)
 *    - Near Matveyevsky Garden & Skver Nizami
 *
 * Includes both LineString representations and mathematically generated
 * Polygon zebra stripes oriented along traffic flow.
 */

const LAT_METER = 111320;
const LNG_METER = 111320 * Math.cos(59.96 * Math.PI / 180); // ~55727m at 59.96° N

/**
 * Generates polygon rectangles for zebra crosswalk stripes along a line crossing the road.
 *
 * @param {[number, number]} p1 - [lng, lat]
 * @param {[number, number]} p2 - [lng, lat]
 * @param {Object} options
 * @returns {Array<Array<[number, number]>>} Array of polygon coordinate rings
 */
function generateZebraPolygons(p1, p2, options = {}) {
    const {
        stripeWidth = 0.45,   // meters
        stripeGap = 0.55,     // meters
        stripeLength = 4.2    // meters (length along traffic)
    } = options;

    const dxM = (p2[0] - p1[0]) * LNG_METER;
    const dyM = (p2[1] - p1[1]) * LAT_METER;
    const lenM = Math.hypot(dxM, dyM);

    if (lenM < 2) return [];

    // Unit vector along crosswalk line
    const ux = dxM / lenM;
    const uy = dyM / lenM;

    // Perpendicular unit vector (along traffic flow)
    const nx = -uy;
    const ny = ux;

    const pitch = stripeWidth + stripeGap;
    const numStripes = Math.max(3, Math.floor(lenM / pitch));
    const step = lenM / numStripes;

    const polygons = [];

    for (let i = 0; i < numStripes; i++) {
        const dist = (i + 0.5) * step;
        const cxM = p1[0] * LNG_METER + ux * dist;
        const cyM = p1[1] * LAT_METER + uy * dist;

        const halfW = stripeWidth / 2;
        const halfL = stripeLength / 2;

        // 4 corners of rectangular stripe
        const corners = [
            [-halfW, -halfL],
            [halfW, -halfL],
            [halfW, halfL],
            [-halfW, halfL],
            [-halfW, -halfL]
        ];

        const ring = corners.map(([ox, oy]) => {
            const pxM = cxM + ux * ox + nx * oy;
            const pyM = cyM + uy * ox + ny * oy;
            return [
                Number((pxM / LNG_METER).toFixed(7)),
                Number((pyM / LAT_METER).toFixed(7))
            ];
        });

        polygons.push(ring);
    }

    return polygons;
}

// -------------------------------------------------------------
// 1. Road Dividing Lines (Centerlines)
// -------------------------------------------------------------

/**
 * Bolshoy Prospekt P.S. Centerline (From Sportivnaya to Leo Tolstoy Square)
 */
const BOLSHOY_CENTERLINE = [
    [30.291055, 59.952760],
    [30.292203, 59.953460],
    [30.293303, 59.954140],
    [30.294944, 59.955150],
    [30.296324, 59.956000],
    [30.297855, 59.956941],
    [30.299125, 59.957732],
    [30.300448, 59.958542],
    [30.302528, 59.959812],
    [30.304439, 59.960993],
    [30.306951, 59.962544],
    [30.308791, 59.963674],
    [30.310141, 59.964504],
    [30.311822, 59.965535]
];

/**
 * Kamennoostrovsky Prospekt Centerline (From Kronverksky / Gorkovskaya to Karpovka)
 */
const KAMENNOOSTROVSKY_CENTERLINE = [
    [30.322136, 59.954838], // Gorkovskaya south
    [30.321498, 59.955612],
    [30.320774, 59.956326], // Kronverksky intersection
    [30.320147, 59.956971],
    [30.319085, 59.958085],
    [30.318231, 59.958813],
    [30.317507, 59.959737],
    [30.317261, 59.959992],
    [30.317073, 59.960186],
    [30.316598, 59.960682], // Austrian Square / Mira st.
    [30.315941, 59.961372],
    [30.315641, 59.961520],
    [30.314675, 59.962688], // Along Skver Nizami
    [30.314037, 59.963188],
    [30.312932, 59.964340], // Between Skver Nizami & Sad Petrova
    [30.312787, 59.964487],
    [30.312239, 59.965223], // South of Leo Tolstoy Square
    [30.311843, 59.965634], // Center of Leo Tolstoy Square
    [30.311510, 59.965975], // North of Leo Tolstoy Square
    [30.311311, 59.966182]  // Towards Karpovka / Petrogradskaya
];

// -------------------------------------------------------------
// 2. Pedestrian Crosswalk Definitions at Key Intersections
// -------------------------------------------------------------

export const INTERSECTION_CROSSWALKS = [
    // ---------------------------------------------------------
    // A. Bolshoy Prospekt & Lenina Street
    // ---------------------------------------------------------
    {
        id: 'crosswalk_bolshoy_lenina_west',
        name: 'Большой пр. / ул. Ленина (запад)',
        intersection: 'Большой проспект & ул. Ленина',
        p1: [30.29986, 59.95822],
        p2: [30.30004, 59.95814]
    },
    {
        id: 'crosswalk_bolshoy_lenina_east',
        name: 'Большой пр. / ул. Ленина (восток)',
        intersection: 'Большой проспект & ул. Ленина',
        p1: [30.30036, 59.95858],
        p2: [30.30054, 59.95850]
    },
    {
        id: 'crosswalk_lenina_north',
        name: 'ул. Ленина (северный створ)',
        intersection: 'Большой проспект & ул. Ленина',
        p1: [30.30030, 59.95862],
        p2: [30.30048, 59.95874]
    },
    {
        id: 'crosswalk_shamsheva',
        name: 'Большой пр. / ул. Шамшева',
        intersection: 'Большой проспект & ул. Шамшева',
        p1: [30.30431, 59.96103],
        p2: [30.30449, 59.96095]
    },

    // ---------------------------------------------------------
    // B. Bolshoy Prospekt & Kamennoostrovsky (Leo Tolstoy Square)
    // ---------------------------------------------------------
    {
        id: 'crosswalk_bolshoy_approach_tolstoy',
        name: 'Большой пр. перед пл. Льва Толстого',
        intersection: 'Большой пр. & Каменноостровский пр.',
        p1: [30.31171, 59.96556],
        p2: [30.31189, 59.96548]
    },
    {
        id: 'crosswalk_kamennoostrovsky_south_square',
        name: 'Каменноостровский пр. (юг пл. Льва Толстого)',
        intersection: 'Большой пр. & Каменноостровский пр.',
        p1: [30.312126, 59.965196],
        p2: [30.312352, 59.965250]
    },
    {
        id: 'crosswalk_kamennoostrovsky_north_square',
        name: 'Каменноостровский пр. (север к метро Петроградская)',
        intersection: 'Большой пр. & Каменноостровский пр.',
        p1: [30.311397, 59.965948],
        p2: [30.311623, 59.966002]
    },
    {
        id: 'crosswalk_lev_tolstoy_street',
        name: 'ул. Льва Толстого (восток площади)',
        intersection: 'Большой пр. & Каменноостровский пр.',
        p1: [30.31205, 59.96555],
        p2: [30.31205, 59.96565]
    },

    // ---------------------------------------------------------
    // C. Kamennoostrovsky & Kronverksky (Gorkovskaya)
    // ---------------------------------------------------------
    {
        id: 'crosswalk_kamennoostrovsky_kronverksky',
        name: 'Каменноостровский пр. / Кронверкский пр.',
        intersection: 'Каменноостровский пр. & Кронверкский пр.',
        p1: [30.32062, 59.95642],
        p2: [30.32085, 59.95625]
    },
    {
        id: 'crosswalk_kronverksky_roadway',
        name: 'Кронверкский пр. (створ проезжей части)',
        intersection: 'Каменноостровский пр. & Кронверкский пр.',
        p1: [30.32006, 59.95646],
        p2: [30.32008, 59.95658]
    },

    // ---------------------------------------------------------
    // D. Near Matveyevsky Garden & Skver Nizami
    // ---------------------------------------------------------
    {
        id: 'crosswalk_matveyevsky_garden_main',
        name: 'Большой пр. у Матвеевского сада',
        intersection: 'Большой пр. у Матвеевского сада',
        p1: [30.30686, 59.96258],
        p2: [30.30704, 59.96250]
    },
    {
        id: 'crosswalk_matveyevsky_kronverkskaya',
        name: 'Кронверкская ул. у входа в сад',
        intersection: 'Большой пр. у Матвеевского сада',
        p1: [30.30740, 59.96210],
        p2: [30.30758, 59.96222]
    },
    {
        id: 'crosswalk_skver_nizami_kamennoostrovsky',
        name: 'Каменноостровский пр. у сквера Низами',
        intersection: 'Каменноостровский пр. & сквер Низами',
        p1: [30.315535, 59.961486],
        p2: [30.315747, 59.961554]
    },
    {
        id: 'crosswalk_skver_nizami_north',
        name: 'Каменноостровский пр. (северная аллея Низами)',
        intersection: 'Каменноостровский пр. & сквер Низами',
        p1: [30.314569, 59.962654],
        p2: [30.314781, 59.962722]
    }
];

// -------------------------------------------------------------
// 3. Build GeoJSON FeatureCollections
// -------------------------------------------------------------

/**
 * GeoJSON FeatureCollection for road centerlines (dashed lines)
 */
export const ROAD_DIVIDING_LINES_GEOJSON = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: {
                id: 'centerline_bolshoy',
                type: 'centerline',
                road: 'Большой проспект П.С.',
                name: 'Разделительная полоса — Большой проспект'
            },
            geometry: {
                type: 'LineString',
                coordinates: BOLSHOY_CENTERLINE
            }
        },
        {
            type: 'Feature',
            properties: {
                id: 'centerline_kamennoostrovsky',
                type: 'centerline',
                road: 'Каменноостровский проспект',
                name: 'Разделительная полоса — Каменноостровский проспект'
            },
            geometry: {
                type: 'LineString',
                coordinates: KAMENNOOSTROVSKY_CENTERLINE
            }
        }
    ]
};

/**
 * GeoJSON FeatureCollection for pedestrian crosswalks:
 * - LineString features with `type: 'zebra_line'`
 * - MultiPolygon features with `type: 'zebra_stripe'` (individual white bars)
 */
export const CROSSWALKS_GEOJSON = {
    type: 'FeatureCollection',
    features: []
};

// Populate crosswalk features
INTERSECTION_CROSSWALKS.forEach(cw => {
    // 1. Line feature
    CROSSWALKS_GEOJSON.features.push({
        type: 'Feature',
        properties: {
            id: cw.id,
            type: 'zebra_line',
            name: cw.name,
            intersection: cw.intersection
        },
        geometry: {
            type: 'LineString',
            coordinates: [cw.p1, cw.p2]
        }
    });

    // 2. Geometric zebra stripe polygons
    const stripes = generateZebraPolygons(cw.p1, cw.p2);
    stripes.forEach((ring, idx) => {
        CROSSWALKS_GEOJSON.features.push({
            type: 'Feature',
            properties: {
                id: `${cw.id}_stripe_${idx}`,
                type: 'zebra_stripe',
                name: `${cw.name} (полоса ${idx + 1})`,
                intersection: cw.intersection
            },
            geometry: {
                type: 'Polygon',
                coordinates: [ring]
            }
        });
    });
});

/**
 * Combined GeoJSON FeatureCollection for all road markings
 */
export const ROAD_MARKINGS_GEOJSON = {
    type: 'FeatureCollection',
    features: [
        ...ROAD_DIVIDING_LINES_GEOJSON.features,
        ...CROSSWALKS_GEOJSON.features
    ]
};
