import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 
    ROAD_DIVIDING_LINES_GEOJSON, 
    CROSSWALKS_GEOJSON, 
    ROAD_MARKINGS_GEOJSON, 
    INTERSECTION_CROSSWALKS 
} from '../admin-linear/src/lib/roadMarkingsData.js';
import { 
    FACADE_PATTERN_IDS, 
    ROOF_PATTERN_IDS,
    FACADE_PIXEL_RATIO,
    ROOF_PIXEL_RATIO,
    generateSpbFacadePattern, 
    getSpbFacadeCanvas, 
    getSpbFacadeImageData, 
    registerAllFacadePatterns,
    generateSpbRoofPattern,
    getSpbRoofCanvas,
    getSpbRoofImageData,
    registerAllRoofPatterns
} from '../admin-linear/src/lib/facadeTextureGenerator.js';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

describe('Milestone 1: Facades & Road Network', () => {

    describe('Road Network Markings (roadMarkingsData.js)', () => {
        it('T1.1: ROAD_DIVIDING_LINES_GEOJSON contains Bolshoy and Kamennoostrovsky centerlines', () => {
            assert.equal(ROAD_DIVIDING_LINES_GEOJSON.type, 'FeatureCollection');
            assert.ok(ROAD_DIVIDING_LINES_GEOJSON.features.length >= 2);

            const bolshoy = ROAD_DIVIDING_LINES_GEOJSON.features.find(f => f.properties.id === 'centerline_bolshoy');
            const kamenn = ROAD_DIVIDING_LINES_GEOJSON.features.find(f => f.properties.id === 'centerline_kamennoostrovsky');

            assert.ok(bolshoy, 'Must have Bolshoy Prospekt centerline');
            assert.ok(kamenn, 'Must have Kamennoostrovsky Prospekt centerline');
            assert.equal(bolshoy.geometry.type, 'LineString');
            assert.equal(kamenn.geometry.type, 'LineString');
            assert.ok(bolshoy.geometry.coordinates.length >= 5);
            assert.ok(kamenn.geometry.coordinates.length >= 5);

            // Coordinates must be in Petrogradka bounds [30.28..30.33, 59.94..59.98]
            bolshoy.geometry.coordinates.forEach(([lng, lat]) => {
                assert.ok(lng >= 30.28 && lng <= 30.33, `Invalid lng: ${lng}`);
                assert.ok(lat >= 59.94 && lat <= 59.98, `Invalid lat: ${lat}`);
            });
        });

        it('T1.2: CROSSWALKS_GEOJSON covers all 4 required key intersections', () => {
            assert.equal(CROSSWALKS_GEOJSON.type, 'FeatureCollection');
            assert.ok(CROSSWALKS_GEOJSON.features.length >= 10);

            const intersections = new Set(INTERSECTION_CROSSWALKS.map(c => c.intersection));
            assert.ok(intersections.has('Большой проспект & ул. Ленина'));
            assert.ok(intersections.has('Большой пр. & Каменноостровский пр.'));
            assert.ok(intersections.has('Каменноостровский пр. & Кронверкский пр.'));
            assert.ok(intersections.has('Большой пр. у Матвеевского сада'));
            assert.ok(intersections.has('Каменноостровский пр. & сквер Низами'));

            // Check zebra stripe polygons exist
            const stripes = CROSSWALKS_GEOJSON.features.filter(f => f.properties.type === 'zebra_stripe');
            assert.ok(stripes.length > 20, 'Expected multiple individual geometric zebra stripe polygons');
            stripes.forEach(s => {
                assert.equal(s.geometry.type, 'Polygon');
                assert.equal(s.geometry.coordinates[0].length, 5, 'Polygon ring must have 5 points (closed)');
            });
        });

        it('T1.3: Combined ROAD_MARKINGS_GEOJSON bundles centerlines and zebras cleanly', () => {
            assert.equal(ROAD_MARKINGS_GEOJSON.type, 'FeatureCollection');
            assert.equal(
                ROAD_MARKINGS_GEOJSON.features.length,
                ROAD_DIVIDING_LINES_GEOJSON.features.length + CROSSWALKS_GEOJSON.features.length
            );
        });
    });

    describe('Procedural Facade & Roof Texture Generator (facadeTextureGenerator.js)', () => {
        it('T2.1: Exports required pattern IDs and interface methods', () => {
            assert.equal(FACADE_PATTERN_IDS.day, 'spb-facade-day');
            assert.equal(FACADE_PATTERN_IDS.sunset, 'spb-facade-sunset');
            assert.equal(FACADE_PATTERN_IDS.night, 'spb-facade-night');
            assert.equal(typeof generateSpbFacadePattern, 'function');
            assert.equal(typeof getSpbFacadeCanvas, 'function');
            assert.equal(typeof getSpbFacadeImageData, 'function');
            assert.equal(typeof registerAllFacadePatterns, 'function');

            // Roof pattern exports
            assert.equal(ROOF_PATTERN_IDS.day, 'spb-roof-day');
            assert.equal(ROOF_PATTERN_IDS.sunset, 'spb-roof-sunset');
            assert.equal(ROOF_PATTERN_IDS.night, 'spb-roof-night');
            assert.equal(typeof generateSpbRoofPattern, 'function');
            assert.equal(typeof getSpbRoofCanvas, 'function');
            assert.equal(typeof getSpbRoofImageData, 'function');
            assert.equal(typeof registerAllRoofPatterns, 'function');
            assert.equal(FACADE_PIXEL_RATIO, 32);
            assert.equal(ROOF_PIXEL_RATIO, 32);
        });

        it('T2.2: Generates 512x512 procedural facade textures with correct theme attributes', () => {
            ['day', 'sunset', 'night'].forEach(theme => {
                const pattern = generateSpbFacadePattern(theme);
                assert.equal(pattern.id, `spb-facade-${theme}`);
                assert.equal(pattern.theme, theme);
                assert.equal(pattern.width, 512);
                assert.equal(pattern.height, 512);
                assert.ok(pattern.canvas, 'Must provide canvas');
                assert.equal(pattern.canvas.width, 512);
                assert.equal(pattern.canvas.height, 512);
                assert.ok(pattern.data, 'Must provide pixel data buffer');
                assert.equal(pattern.data.length, 512 * 512 * 4, 'Buffer size must equal 512x512x4 (1048576 bytes)');
            });
        });

        it('T2.3: Generates 512x512 procedural seamed tin roof textures with correct theme attributes', () => {
            ['day', 'sunset', 'night'].forEach(theme => {
                const pattern = generateSpbRoofPattern(theme);
                assert.equal(pattern.id, `spb-roof-${theme}`);
                assert.equal(pattern.theme, theme);
                assert.equal(pattern.width, 512);
                assert.equal(pattern.height, 512);
                assert.ok(pattern.canvas, 'Must provide canvas');
                assert.equal(pattern.canvas.width, 512);
                assert.equal(pattern.canvas.height, 512);
                assert.ok(pattern.data, 'Must provide pixel data buffer');
                assert.equal(pattern.data.length, 512 * 512 * 4, 'Buffer size must equal 512x512x4 (1048576 bytes)');
            });
        });

        it('T2.4: Source code includes ground floor rustication, парадная, and architectural details', () => {
            const code = read('admin-linear/src/lib/facadeTextureGenerator.js');

            // Ground floor rustication
            assert.match(code, /рустовка|рустованный|rustGrad/i);
            // Парадная
            assert.match(code, /Парадная|фрамуга/i);
            // Storefront references & support
            assert.match(code, /СЛОЙ|С Л О Й/i);
            assert.match(code, /croissant|круассан/i);
            assert.match(code, /ВкусВилл/);
            assert.match(code, /#15803d/);
            assert.match(code, /SHOWROOM|S H O W R O O M/);
            assert.match(code, /mannequin|манекен/i);

            // Upper floor mouldings (сандрики, наличники, карнизы)
            assert.match(code, /наличник|сандрик|подоконник|карниз/i);
            // Seamed tin roof elements (фальц, стоячие фальцы)
            assert.match(code, /фальц|фальцевая|стоячие фальцы/i);
        });

        it('T2.5: registerAllFacadePatterns & registerAllRoofPatterns register with pixelRatio 32', () => {
            // Null-safe
            assert.doesNotThrow(() => registerAllFacadePatterns(null));
            assert.doesNotThrow(() => registerAllRoofPatterns(null));

            // Mock MapLibre map verifying pixelRatio passed in options
            const added = {};
            const optionsMap = {};
            const mockMap = {
                hasImage: (id) => Boolean(added[id]),
                addImage: (id, img, options) => { 
                    added[id] = img; 
                    optionsMap[id] = options;
                },
                updateImage: (id, img) => { added[id] = img; },
                removeImage: (id) => { delete added[id]; }
            };

            registerAllFacadePatterns(mockMap);
            assert.ok(added['spb-facade-day']);
            assert.ok(added['spb-facade-sunset']);
            assert.ok(added['spb-facade-night']);
            assert.equal(optionsMap['spb-facade-day']?.pixelRatio, 32);
            assert.equal(optionsMap['spb-facade-sunset']?.pixelRatio, 32);
            assert.equal(optionsMap['spb-facade-night']?.pixelRatio, 32);

            registerAllRoofPatterns(mockMap);
            assert.ok(added['spb-roof-day']);
            assert.ok(added['spb-roof-sunset']);
            assert.ok(added['spb-roof-night']);
            assert.equal(optionsMap['spb-roof-day']?.pixelRatio, 32);
            assert.equal(optionsMap['spb-roof-sunset']?.pixelRatio, 32);
            assert.equal(optionsMap['spb-roof-night']?.pixelRatio, 32);

            // Idempotent second call
            assert.doesNotThrow(() => registerAllFacadePatterns(mockMap));
            assert.doesNotThrow(() => registerAllRoofPatterns(mockMap));
        });
    });

    describe('MapLibre FullScreenMap Integration (FullScreenMap.jsx)', () => {
        it('T3.1: FullScreenMap imports road markings and 3D pedestrian layer', () => {
            const mapSrc = read('admin-linear/src/components/FullScreenMap.jsx');
            assert.match(mapSrc, /from\s+['"]@\/lib\/roadMarkingsData\.js['"]/);
            assert.match(mapSrc, /from\s+['"]@\/lib\/threePedestrianLayer\.js['"]/);
            assert.match(mapSrc, /ROAD_MARKINGS_GEOJSON/);
        });

        it('T3.2: 3d-buildings layer is assigned clean vector wallColor', () => {
            const mapSrc = read('admin-linear/src/components/FullScreenMap.jsx');
            assert.match(mapSrc, /'fill-extrusion-color':\s*theme\.wallColor/);
            assert.match(mapSrc, /map\.setPaintProperty\('3d-buildings',\s*'fill-extrusion-color'/);
        });

        it('T3.3: 3d-buildings-roof layer is dedicated seamed tin roof elevated +0.15m with roofColor', () => {
            const mapSrc = read('admin-linear/src/components/FullScreenMap.jsx');
            assert.match(mapSrc, /id:\s*'3d-buildings-roof'/);
            assert.match(mapSrc, /'fill-extrusion-color':\s*theme\.roofColor/);
            assert.match(mapSrc, /0\.15/);
            assert.match(mapSrc, /map\.setPaintProperty\('3d-buildings-roof',\s*'fill-extrusion-color'/);
        });

        it('T3.4: Road markings layers are inserted beneath 3d-buildings with adaptive styling', () => {
            const mapSrc = read('admin-linear/src/components/FullScreenMap.jsx');
            assert.match(mapSrc, /map\.addSource\('spb-road-markings'/);
            assert.match(mapSrc, /id:\s*'road-dividing-lines'/);
            assert.match(mapSrc, /id:\s*'road-crosswalk-stripes'/);
            assert.match(mapSrc, /id:\s*'road-crosswalk-lines'/);
            assert.match(mapSrc, /const beforeLayerId = '3d-buildings'/);
            assert.match(mapSrc, /markingColor/);
            assert.match(mapSrc, /dividingOpacity/);
            assert.match(mapSrc, /zebraOpacity/);
        });
    });
});
