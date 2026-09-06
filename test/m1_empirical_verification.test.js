import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { 
    ROAD_DIVIDING_LINES_GEOJSON, 
    CROSSWALKS_GEOJSON, 
    ROAD_MARKINGS_GEOJSON, 
    INTERSECTION_CROSSWALKS 
} from '../admin-linear/src/lib/roadMarkingsData.js';
import { 
    FACADE_PATTERN_IDS, 
    generateSpbFacadePattern, 
    getSpbFacadeCanvas, 
    getSpbFacadeImageData, 
    registerAllFacadePatterns 
} from '../admin-linear/src/lib/facadeTextureGenerator.js';

// Earth radius for Haversine metric
const R_EARTH = 6371000;

function haversine([lng1, lat1], [lng2, lat2]) {
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLam = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

function computePlanarArea(ring) {
    const lat0 = 59.96;
    const lngM = Math.PI * R_EARTH * Math.cos(lat0 * Math.PI / 180) / 180;
    const latM = Math.PI * R_EARTH / 180;
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const x1 = ring[i][0] * lngM;
        const y1 = ring[i][1] * latM;
        const x2 = ring[i + 1][0] * lngM;
        const y2 = ring[i + 1][1] * latM;
        sum += (x1 * y2 - x2 * y1);
    }
    return Math.abs(sum) / 2;
}

/**
 * Headless Chrome runner to render the exact 512x512 procedural canvas and inspect pixel data.
 */
async function sampleNightFacadePixels() {
    const port = 9338;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_test_facade_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + tmpDir,
        '--no-first-run',
        'about:blank'
    ], { stdio: 'ignore' });

    try {
        let version = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 150));
            try {
                const res = await fetch('http://127.0.0.1:' + port + '/json/version');
                if (res.ok) { version = await res.json(); break; }
            } catch (e) {}
        }

        if (!version) {
            throw new Error('Could not connect to Chrome CDP on port ' + port);
        }

        const targetsRes = await fetch('http://127.0.0.1:' + port + '/json/list');
        const targets = await targetsRes.json();
        const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
        await new Promise(r => { ws.onopen = r; });

        let msgId = 1;
        function send(method, params = {}) {
            return new Promise((resolve) => {
                const curId = msgId++;
                const handler = (event) => {
                    const msg = JSON.parse(event.data);
                    if (msg.id === curId) {
                        ws.removeEventListener('message', handler);
                        resolve(msg.result);
                    }
                };
                ws.addEventListener('message', handler);
                ws.send(JSON.stringify({ id: curId, method, params }));
            });
        }

        const facadeSrc = fs.readFileSync('admin-linear/src/lib/facadeTextureGenerator.js', 'utf8')
            .replace(/export\s+const\s+/g, 'const ')
            .replace(/export\s+function\s+/g, 'function ');

        const evalRes = await send('Runtime.evaluate', {
            expression: `
                (function() {
                    ${facadeSrc}
                    const canvas = document.createElement('canvas');
                    canvas.width = 512;
                    canvas.height = 512;
                    const ctx = canvas.getContext('2d');
                    drawSpbFacade(ctx, 'night');

                    const imgData = ctx.getImageData(0, 0, 512, 512);
                    function getPixel(x, y) {
                        const idx = (Math.floor(y) * 512 + Math.floor(x)) * 4;
                        return {
                            r: imgData.data[idx],
                            g: imgData.data[idx + 1],
                            b: imgData.data[idx + 2],
                            a: imgData.data[idx + 3]
                        };
                    }

                    const bayCenters = [64, 192, 320, 448];
                    const floorConfigs = [
                        { floor: 5, y: 44, w: 38, h: 48 },
                        { floor: 4, y: 128, w: 42, h: 56 },
                        { floor: 3, y: 220, w: 44, h: 62 },
                        { floor: 2, y: 322, w: 46, h: 68 }
                    ];
                    const litMatrix = [
                        [true,  true,  false, true ], // Floor 5: 3/4
                        [true,  false, true,  true ], // Floor 4: 3/4
                        [false, true,  true,  true ], // Floor 3: 3/4
                        [true,  true,  false, false]  // Floor 2: 2/4 (Total: 11 / 16)
                    ];

                    const windows = [];
                    floorConfigs.forEach((cfg, fIdx) => {
                        bayCenters.forEach((cx, bIdx) => {
                            const isLitExpected = litMatrix[fIdx][bIdx];
                            // Sample slightly offset from center to avoid center mullion
                            const sampleX = cx - 6;
                            const sampleY = cfg.y + Math.round(cfg.h * 0.55);
                            const pixel = getPixel(sampleX, sampleY);
                            windows.push({
                                floor: cfg.floor,
                                bay: bIdx,
                                cx,
                                cy: sampleY,
                                isLitExpected,
                                pixel
                            });
                        });
                    });

                    // Storefronts
                    const sloy = getPixel(192, 460);
                    const vkusvill = getPixel(320, 460);
                    const showroom = getPixel(448, 460);

                    return { windows, sloy, vkusvill, showroom };
                })()
            `,
            returnByValue: true
        });

        ws.close();
        return evalRes.result.value;
    } finally {
        chrome.kill();
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {}
    }
}

describe('Empirical Verification: Milestone 1 (Facades & Road Network)', () => {

    describe('1. Procedural Facade Pixel Integrity (Night Theme Windows)', () => {
        let facadeData = null;

        it('1.1: Headless Chrome renders 512x512 night facade canvas and samples pixels', async () => {
            facadeData = await sampleNightFacadePixels();
            assert.ok(facadeData, 'Failed to extract pixel samples from night facade canvas');
            assert.equal(facadeData.windows.length, 16, 'Expected 16 window bays (4 floors x 4 bays)');
        });

        it('1.2: Illuminated windows show warm amber spectrum (high R+G, lower B)', () => {
            const litWindows = facadeData.windows.filter(w => w.isLitExpected);
            assert.equal(litWindows.length, 11, 'Expected exactly 11 illuminated windows out of 16 (~68.75%)');

            for (const win of litWindows) {
                const { r, g, b, a } = win.pixel;
                assert.equal(a, 255, `Floor ${win.floor} Bay ${win.bay}: Alpha must be 255`);
                // Red channel must be high
                assert.ok(r >= 180, `Floor ${win.floor} Bay ${win.bay}: Red channel must be >= 180, got ${r}`);
                // Green channel must be high
                assert.ok(g >= 120, `Floor ${win.floor} Bay ${win.bay}: Green channel must be >= 120, got ${g}`);
                // Warm amber: Red > Blue, Green > Blue
                assert.ok(r > b, `Floor ${win.floor} Bay ${win.bay}: Red (${r}) must exceed Blue (${b})`);
                assert.ok(g > b, `Floor ${win.floor} Bay ${win.bay}: Green (${g}) must exceed Blue (${b})`);
                // Red + Green must be significantly higher than Blue
                const amberFactor = (r + g) / 2 - b;
                assert.ok(amberFactor >= 50, `Floor ${win.floor} Bay ${win.bay}: Amber factor ((R+G)/2 - B) must be >= 50, got ${amberFactor}`);
            }
        });

        it('1.3: Dark windows show midnight darkness and high contrast against lit windows', () => {
            const darkWindows = facadeData.windows.filter(w => !w.isLitExpected);
            assert.equal(darkWindows.length, 5, 'Expected exactly 5 dark windows out of 16 (~31.25%)');

            for (const win of darkWindows) {
                const { r, g, b, a } = win.pixel;
                assert.equal(a, 255, `Floor ${win.floor} Bay ${win.bay}: Alpha must be 255`);
                // Individual channels must be dark
                assert.ok(r <= 50, `Floor ${win.floor} Bay ${win.bay}: Dark window Red must be <= 50, got ${r}`);
                assert.ok(g <= 50, `Floor ${win.floor} Bay ${win.bay}: Dark window Green must be <= 50, got ${g}`);
                assert.ok(b <= 60, `Floor ${win.floor} Bay ${win.bay}: Dark window Blue must be <= 60, got ${b}`);

                // Perceived luminance: 0.299*R + 0.587*G + 0.114*B
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                assert.ok(luminance < 40, `Floor ${win.floor} Bay ${win.bay}: Dark window luminance must be < 40, got ${luminance.toFixed(1)}`);
            }
        });

        it('1.4: Contrast ratio between lit and dark windows is greater than 5:1', () => {
            const litLuminances = facadeData.windows
                .filter(w => w.isLitExpected)
                .map(w => 0.299 * w.pixel.r + 0.587 * w.pixel.g + 0.114 * w.pixel.b);
            const darkLuminances = facadeData.windows
                .filter(w => !w.isLitExpected)
                .map(w => 0.299 * w.pixel.r + 0.587 * w.pixel.g + 0.114 * w.pixel.b);

            const avgLit = litLuminances.reduce((a, b) => a + b, 0) / litLuminances.length;
            const avgDark = darkLuminances.reduce((a, b) => a + b, 0) / darkLuminances.length;

            const contrastRatio = (avgLit + 0.05) / (avgDark + 0.05);
            assert.ok(contrastRatio >= 5.0, `Contrast ratio between lit (${avgLit.toFixed(1)}) and dark (${avgDark.toFixed(1)}) windows must be >= 5.0, got ${contrastRatio.toFixed(1)}`);
        });

        it('1.5: Night storefronts feature distinct interior glows', () => {
            const { sloy, vkusvill, showroom } = facadeData;

            // «Слой»: warm bakery amber
            assert.ok(sloy.r > 150, `«Слой» Red must be > 150, got ${sloy.r}`);
            assert.ok(sloy.g > 100, `«Слой» Green must be > 100, got ${sloy.g}`);
            assert.ok(sloy.r > sloy.b, `«Слой» Red (${sloy.r}) must exceed Blue (${sloy.b})`);

            // «ВкусВилл»: signature green branding
            assert.ok(vkusvill.g >= 100, `«ВкусВилл» Green must be >= 100, got ${vkusvill.g}`);
            assert.ok(vkusvill.g > vkusvill.r, `«ВкусВилл» Green (${vkusvill.g}) must exceed Red (${vkusvill.r})`);

            // Fashion Showroom: moody dark gallery base
            assert.ok(showroom.r <= 60 && showroom.g <= 60 && showroom.b <= 60, 'Showroom must feature sleek dark gallery base');
        });
    });

    describe('2. GeoJSON Coordinates & Geometric Integrity', () => {

        it('2.1: GeoJSON structures strictly conform to RFC 7946 specifications', () => {
            const collections = [
                { name: 'ROAD_DIVIDING_LINES_GEOJSON', data: ROAD_DIVIDING_LINES_GEOJSON },
                { name: 'CROSSWALKS_GEOJSON', data: CROSSWALKS_GEOJSON },
                { name: 'ROAD_MARKINGS_GEOJSON', data: ROAD_MARKINGS_GEOJSON }
            ];

            for (const col of collections) {
                assert.equal(col.data.type, 'FeatureCollection', `${col.name} must be a FeatureCollection`);
                assert.ok(Array.isArray(col.data.features), `${col.name} features must be an array`);
                assert.ok(col.data.features.length > 0, `${col.name} features must not be empty`);

                for (const f of col.data.features) {
                    assert.equal(f.type, 'Feature', `Every feature in ${col.name} must have type "Feature"`);
                    assert.ok(f.properties && typeof f.properties === 'object', 'Properties must be an object');
                    assert.ok(f.properties.id && typeof f.properties.id === 'string', 'Feature must have non-empty string ID');
                    assert.ok(f.geometry && typeof f.geometry === 'object', 'Geometry must be an object');
                    assert.ok(['LineString', 'Polygon', 'MultiPolygon'].includes(f.geometry.type), `Geometry type ${f.geometry.type} must be valid`);
                    assert.ok(Array.isArray(f.geometry.coordinates), 'Geometry coordinates must be an array');
                }
            }
        });

        it('2.2: All feature IDs across ROAD_MARKINGS_GEOJSON are strictly unique', () => {
            const ids = new Set();
            const duplicates = [];
            for (const f of ROAD_MARKINGS_GEOJSON.features) {
                if (ids.has(f.properties.id)) {
                    duplicates.push(f.properties.id);
                }
                ids.add(f.properties.id);
            }
            assert.equal(duplicates.length, 0, `Found duplicate feature IDs: ${duplicates.join(', ')}`);
        });

        it('2.3: All coordinates are valid numbers within Petrogradka bounds [lng: 30.28..30.33, lat: 59.94..59.98]', () => {
            function validateCoord([lng, lat], context) {
                assert.ok(typeof lng === 'number' && Number.isFinite(lng), `${context}: lng must be finite number, got ${lng}`);
                assert.ok(typeof lat === 'number' && Number.isFinite(lat), `${context}: lat must be finite number, got ${lat}`);
                // Strict RFC 7946 coordinate order [longitude, latitude]
                assert.ok(lng >= 30.28 && lng <= 30.33, `${context}: Longitude ${lng} out of Petrogradka bounds [30.28, 30.33]`);
                assert.ok(lat >= 59.94 && lat <= 59.98, `${context}: Latitude ${lat} out of Petrogradka bounds [59.94, 59.98]`);
            }

            for (const f of ROAD_MARKINGS_GEOJSON.features) {
                const geom = f.geometry;
                if (geom.type === 'LineString') {
                    geom.coordinates.forEach((pt, idx) => validateCoord(pt, `${f.properties.id} point ${idx}`));
                } else if (geom.type === 'Polygon') {
                    geom.coordinates.forEach((ring, rIdx) => {
                        ring.forEach((pt, pIdx) => validateCoord(pt, `${f.properties.id} ring ${rIdx} point ${pIdx}`));
                    });
                }
            }
        });

        it('2.4: Road dividing lines have non-zero length and continuous multi-point geometry', () => {
            for (const f of ROAD_DIVIDING_LINES_GEOJSON.features) {
                const coords = f.geometry.coordinates;
                assert.ok(coords.length >= 5, `${f.properties.name} must have at least 5 waypoints`);

                let totalLength = 0;
                for (let i = 0; i < coords.length - 1; i++) {
                    const segLen = haversine(coords[i], coords[i + 1]);
                    assert.ok(segLen > 0, `${f.properties.name} segment ${i} must have non-zero length`);
                    assert.ok(segLen >= 10, `${f.properties.name} segment ${i} should be at least 10m long, got ${segLen.toFixed(1)}m`);
                    totalLength += segLen;
                }

                // Bolshoy and Kamennoostrovsky are major avenues (> 1km long)
                assert.ok(totalLength >= 1000, `${f.properties.name} total length must be >= 1000m, got ${totalLength.toFixed(1)}m`);
            }
        });

        it('2.5: Pedestrian crosswalk line strings have realistic road crossing widths (10m..100m)', () => {
            const zebraLines = CROSSWALKS_GEOJSON.features.filter(f => f.geometry.type === 'LineString');
            assert.ok(zebraLines.length >= 10, `Expected at least 10 crosswalk lines, found ${zebraLines.length}`);

            for (const f of zebraLines) {
                const coords = f.geometry.coordinates;
                assert.equal(coords.length, 2, `${f.properties.name} crosswalk line must have exactly 2 endpoints`);
                const length = haversine(coords[0], coords[1]);
                assert.ok(length > 0, `${f.properties.name} must have non-zero length`);
                assert.ok(length >= 15 && length <= 100, `${f.properties.name} road width (${length.toFixed(1)}m) out of realistic range [15m..100m]`);
            }
        });

        it('2.6: Pedestrian zebra stripe polygons are closed rings with non-zero positive area', () => {
            const stripePolygons = CROSSWALKS_GEOJSON.features.filter(f => f.geometry.type === 'Polygon');
            assert.ok(stripePolygons.length >= 100, `Expected at least 100 zebra stripe polygons, found ${stripePolygons.length}`);

            for (const f of stripePolygons) {
                const ring = f.geometry.coordinates[0];
                assert.ok(ring.length >= 4, `${f.properties.id} polygon ring must have at least 4 points`);

                // Must be closed (first === last)
                const first = ring[0];
                const last = ring[ring.length - 1];
                assert.equal(first[0], last[0], `${f.properties.id}: Ring must be closed (lng mismatch: ${first[0]} vs ${last[0]})`);
                assert.equal(first[1], last[1], `${f.properties.id}: Ring must be closed (lat mismatch: ${first[1]} vs ${last[1]})`);

                // Area must be non-zero and within realistic stripe dimensions (0.45m x 4.2m ~= 1.89 m2)
                const area = computePlanarArea(ring);
                assert.ok(area > 0, `${f.properties.id} area must be strictly positive`);
                assert.ok(area >= 1.0 && area <= 3.0, `${f.properties.id} area (${area.toFixed(3)} m2) out of expected range [1.0 m2 .. 3.0 m2]`);
            }
        });

        it('2.7: Combined ROAD_MARKINGS_GEOJSON accurately matches sum of dividing lines and crosswalks', () => {
            const expectedCount = ROAD_DIVIDING_LINES_GEOJSON.features.length + CROSSWALKS_GEOJSON.features.length;
            assert.equal(ROAD_MARKINGS_GEOJSON.features.length, expectedCount);
        });
    });

    describe('3. Build and Integration Conformance', () => {
        it('3.1: vite production build bundle exists and is valid', () => {
            const htmlPath = 'public/admin-linear/index.html';
            assert.ok(fs.existsSync(htmlPath), 'Production build index.html must exist');
            const html = fs.readFileSync(htmlPath, 'utf8');
            assert.match(html, /<!doctype html>/i);
            assert.match(html, /<script type="module"/);
        });

        it('3.2: FullScreenMap imports and registers facade textures and road markings', () => {
            const source = fs.readFileSync('admin-linear/src/components/FullScreenMap.jsx', 'utf8');
            assert.match(source, /registerAllFacadePatterns\(map\)/);
            assert.match(source, /'fill-extrusion-pattern':\s*facadePatternId/);
            assert.match(source, /id:\s*'road-dividing-lines'/);
            assert.match(source, /id:\s*'road-crosswalk-stripes'/);
            assert.match(source, /id:\s*'road-crosswalk-lines'/);
            assert.match(source, /beforeLayerId\s*=\s*'3d-buildings'/);
        });
    });
});
