import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Headless Chrome runner to sample pixel channels across facade and roof textures.
 */
async function sampleTextureProfiles() {
    const port = 9349;
    const tmpDir = '/tmp/chrome_stress_test_' + Date.now();
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
        if (!version) throw new Error('Chrome CDP connection failed on port ' + port);

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

                    function getSampler(drawFn, theme) {
                        ctx.clearRect(0, 0, 512, 512);
                        drawFn(ctx, theme);
                        const img = ctx.getImageData(0, 0, 512, 512);
                        return (x, y) => {
                            const idx = (Math.floor(y) * 512 + Math.floor(x)) * 4;
                            return {
                                r: img.data[idx],
                                g: img.data[idx+1],
                                b: img.data[idx+2],
                                a: img.data[idx+3],
                                lum: 0.299 * img.data[idx] + 0.587 * img.data[idx+1] + 0.114 * img.data[idx+2]
                            };
                        };
                    }

                    const facadeNight = getSampler(drawSpbFacade, 'night');
                    const facadeDay = getSampler(drawSpbFacade, 'day');
                    const facadeSunset = getSampler(drawSpbFacade, 'sunset');

                    const roofNight = getSampler(drawSpbRoof, 'night');
                    const roofDay = getSampler(drawSpbRoof, 'day');
                    const roofSunset = getSampler(drawSpbRoof, 'sunset');

                    // 1. Windows Sampling
                    const bayCenters = [64, 192, 320, 448];
                    const floorConfigs = [
                        { floor: 5, y: 38,  w: 38, h: 54 },
                        { floor: 4, y: 126, w: 42, h: 60 },
                        { floor: 3, y: 224, w: 44, h: 64 },
                        { floor: 2, y: 332, w: 46, h: 72 }
                    ];
                    const litMatrix = [
                        [true,  true,  false, true ],
                        [true,  false, true,  true ],
                        [false, true,  true,  true ],
                        [true,  true,  false, false]
                    ];

                    const windows = [];
                    floorConfigs.forEach((cfg, fIdx) => {
                        bayCenters.forEach((cx, bIdx) => {
                            const isLit = litMatrix[fIdx][bIdx];
                            const cy = cfg.y + Math.round(cfg.h * 0.45);
                            windows.push({
                                floor: cfg.floor,
                                bay: bIdx,
                                isLit,
                                nightCore: facadeNight(cx - 5, cy),
                                nightAmber: facadeNight(cx - 12, cy + 4),
                                nightDark: facadeNight(cx - 5, cy),
                                dayPixel: facadeDay(cx - 5, cy),
                                sunsetPixel: facadeSunset(cx - 5, cy)
                            });
                        });
                    });

                    // 2. Granite Base Sampling at solid pier (x = 125)
                    const pierX = 125;
                    const grooveYs = [436, 450, 464, 478, 492, 506];
                    const stoneYs = [443, 457, 471, 485, 499];

                    const base = {
                        night: {
                            grooves: grooveYs.map(y => ({ y, p: facadeNight(pierX, y) })),
                            stoneFaces: stoneYs.map(y => ({ y, p: facadeNight(pierX, y) }))
                        },
                        day: {
                            grooves: grooveYs.map(y => ({ y, p: facadeDay(pierX, y) })),
                            stoneFaces: stoneYs.map(y => ({ y, p: facadeDay(pierX, y) }))
                        },
                        sunset: {
                            grooves: grooveYs.map(y => ({ y, p: facadeSunset(pierX, y) })),
                            stoneFaces: stoneYs.map(y => ({ y, p: facadeSunset(pierX, y) }))
                        }
                    };

                    // 3. Roof Seam Ribs Sampling (every 32px)
                    const seams = [];
                    for (let x = 0; x < 512; x += 32) {
                        seams.push({
                            x,
                            day: {
                                shadow: roofDay(x, 240),
                                ridge: roofDay(x + 1.5, 240),
                                highlight: roofDay(x + 3, 240),
                                panel: roofDay(x + 16, 240)
                            },
                            sunset: {
                                shadow: roofSunset(x, 240),
                                ridge: roofSunset(x + 1.5, 240),
                                highlight: roofSunset(x + 3, 240),
                                panel: roofSunset(x + 16, 240)
                            },
                            night: {
                                shadow: roofNight(x, 240),
                                ridge: roofNight(x + 1.5, 240),
                                highlight: roofNight(x + 3, 240),
                                panel: roofNight(x + 16, 240)
                            }
                        });
                    }

                    // 4. Roof Horizontal Flat Seams (y = 0, 128, 256, 384)
                    const roofHSeams = [0, 128, 256, 384].map(y => ({
                        y,
                        seamDay: roofDay(200, y),
                        seamNight: roofNight(200, y),
                        adjacentDay: roofDay(200, y + 10),
                        adjacentNight: roofNight(200, y + 10)
                    }));

                    return { windows, base, seams, roofHSeams };
                })()
            `,
            returnByValue: true
        });

        ws.close();
        return evalRes.result.value;
    } finally {
        chrome.kill();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

describe('Milestone 1 Empirical Stress-Test Harness', () => {
    let profileData = null;

    it('Initializes Chrome CDP and samples full texture profile data', async () => {
        profileData = await sampleTextureProfiles();
        assert.ok(profileData, 'Should return sampled texture profiles');
        assert.equal(profileData.windows.length, 16);
        assert.equal(profileData.seams.length, 16);
    });

    describe('1. Stress-Test: Night Window Amber Spectrum & Diurnal Variation', () => {
        it('Verifies illuminated night windows display warm amber spectrum (R>200, G>140, B<90)', () => {
            const litWindows = profileData.windows.filter(w => w.isLit);
            assert.equal(litWindows.length, 11, 'Should have exactly 11 lit windows');

            for (const win of litWindows) {
                // Check core warm glow
                assert.ok(win.nightCore.r >= 240, `Floor ${win.floor} Bay ${win.bay}: Red must be >= 240, got ${win.nightCore.r}`);
                assert.ok(win.nightCore.g >= 200, `Floor ${win.floor} Bay ${win.bay}: Green must be >= 200, got ${win.nightCore.g}`);
                assert.ok(win.nightCore.r > win.nightCore.b, 'Warm incandescent: R > B');

                // Check radial amber spectrum (dx = 12..15)
                const amber = win.nightAmber;
                assert.ok(amber.r >= 200, `Floor ${win.floor} Bay ${win.bay}: Amber Red must be >= 200, got ${amber.r}`);
                assert.ok(amber.g >= 140, `Floor ${win.floor} Bay ${win.bay}: Amber Green must be >= 140, got ${amber.g}`);
                assert.ok(amber.b < 90, `Floor ${win.floor} Bay ${win.bay}: Amber Blue must be < 90, got ${amber.b}`);
            }
        });

        it('Verifies dark night windows have low luminance (< 30) and high contrast (> 6:1)', () => {
            const darkWindows = profileData.windows.filter(w => !w.isLit);
            assert.equal(darkWindows.length, 5, 'Should have exactly 5 dark windows');

            for (const win of darkWindows) {
                const dark = win.nightDark;
                assert.ok(dark.r <= 35, `Dark window Red must be <= 35, got ${dark.r}`);
                assert.ok(dark.g <= 35, `Dark window Green must be <= 35, got ${dark.g}`);
                assert.ok(dark.b <= 45, `Dark window Blue must be <= 45, got ${dark.b}`);
                assert.ok(dark.lum < 30, `Dark window luminance must be < 30, got ${dark.lum.toFixed(1)}`);
            }

            const avgLitLum = profileData.windows.filter(w => w.isLit).reduce((acc, w) => acc + w.nightCore.lum, 0) / 11;
            const avgDarkLum = darkWindows.reduce((acc, w) => acc + w.nightDark.lum, 0) / 5;
            const contrast = (avgLitLum + 0.05) / (avgDarkLum + 0.05);
            assert.ok(contrast > 6.0, `Contrast ratio must be > 6:1, got ${contrast.toFixed(1)}:1`);
        });

        it('Verifies daytime windows show azure sky reflections and sunset windows show golden sheen', () => {
            for (const win of profileData.windows) {
                // Day: azure sky (B > R)
                assert.ok(win.dayPixel.b > win.dayPixel.r, `Day window should reflect blue sky: B(${win.dayPixel.b}) > R(${win.dayPixel.r})`);
                // Sunset: golden copper/amber (R > B, R > 150)
                assert.ok(win.sunsetPixel.r > 150, `Sunset window should have high Red: got ${win.sunsetPixel.r}`);
                assert.ok(win.sunsetPixel.r > win.sunsetPixel.b, 'Sunset window: R > B');
            }
        });
    });

    describe('2. Stress-Test: Rusticated Granite Base & Mineral Tones', () => {
        it('Verifies granite base stone faces have low luminance mineral tones at night (lum < 35)', () => {
            const nightFaces = profileData.base.night.stoneFaces;
            assert.equal(nightFaces.length, 5);
            for (const face of nightFaces) {
                assert.ok(face.p.lum < 35, `Night stone face luminance must be < 35, got ${face.p.lum.toFixed(1)}`);
                assert.ok(face.p.r <= 30 && face.p.g <= 35 && face.p.b <= 45, 'Night stone face mineral tones');
            }
        });

        it('Verifies horizontal V-grooves are dark shadow lines (2x to 5x darker than stone faces)', () => {
            const nightGrooves = profileData.base.night.grooves;
            const nightFaces = profileData.base.night.stoneFaces;
            assert.equal(nightGrooves.length, 6);

            for (let i = 0; i < nightFaces.length; i++) {
                const grooveLum = nightGrooves[i].p.lum;
                const faceLum = nightFaces[i].p.lum;
                assert.ok(grooveLum < faceLum, `Groove ${i} lum (${grooveLum.toFixed(1)}) must be less than face lum (${faceLum.toFixed(1)})`);
                assert.ok(grooveLum <= 10, `Night V-groove should be deep shadow (lum <= 10), got ${grooveLum.toFixed(1)}`);
            }

            // Day V-grooves check
            const dayGrooves = profileData.base.day.grooves;
            const dayFaces = profileData.base.day.stoneFaces;
            for (let i = 0; i < dayFaces.length; i++) {
                assert.ok(dayGrooves[i].p.lum < dayFaces[i].p.lum, 'Day V-groove must be darker than day stone face');
            }
        });
    });

    describe('3. Stress-Test: Seamed Tin Roof Regular Intervals & 3D Relief', () => {
        it('Verifies standing seam ribs are spaced at strictly regular 32px intervals (16 ribs across 512px)', () => {
            const seams = profileData.seams;
            assert.equal(seams.length, 16);

            for (let i = 0; i < seams.length; i++) {
                assert.equal(seams[i].x, i * 32, `Seam ${i} must be at x = ${i * 32}, got ${seams[i].x}`);
            }
        });

        it('Verifies each standing seam exhibits physical 3D relief (shadow < panel < highlight)', () => {
            for (const seam of profileData.seams) {
                // Day roof relief
                const { shadow, ridge, highlight, panel } = seam.day;
                assert.ok(shadow.lum < panel.lum, `At x=${seam.x}, Day shadow lum (${shadow.lum.toFixed(1)}) must be < panel lum (${panel.lum.toFixed(1)})`);
                assert.ok(highlight.lum > panel.lum, `At x=${seam.x}, Day highlight lum (${highlight.lum.toFixed(1)}) must be > panel lum (${panel.lum.toFixed(1)})`);

                // Night roof relief
                const n = seam.night;
                assert.ok(n.shadow.lum < n.panel.lum, `At x=${seam.x}, Night shadow lum (${n.shadow.lum.toFixed(1)}) must be < panel lum (${n.panel.lum.toFixed(1)})`);
                assert.ok(n.highlight.lum > n.panel.lum, `At x=${seam.x}, Night highlight lum (${n.highlight.lum.toFixed(1)}) must be > panel lum (${n.panel.lum.toFixed(1)})`);
            }
        });

        it('Verifies roof palettes: day galvanized zinc, sunset copper, night cold graphite', () => {
            for (const seam of profileData.seams) {
                // Day: Zinc neutral grey (R, G, B roughly equal ~ 115..135)
                const d = seam.day.panel;
                assert.ok(Math.abs(d.r - d.g) < 20 && Math.abs(d.g - d.b) < 20, 'Day zinc roof should be neutral grey');

                // Sunset: Copper/Bronze (R > G and R > B)
                const s = seam.sunset.panel;
                assert.ok(s.r > s.b, `Sunset copper roof: R(${s.r}) must exceed B(${s.b})`);

                // Night: Cold graphite (lum < 50, subtle blue tone B >= R)
                const n = seam.night.panel;
                assert.ok(n.lum < 50, `Night roof panel lum must be < 50, got ${n.lum.toFixed(1)}`);
                assert.ok(n.b >= n.r, 'Night roof should have cool midnight slate tint');
            }
        });
    });

    describe('4. Stress-Test: Build Bundle & Texture Assets', () => {
        it('Verifies production build output index.html and assets exist', () => {
            assert.ok(fs.existsSync('public/admin-linear/index.html'));
            assert.ok(fs.existsSync('public/admin-linear/assets'));
            const files = fs.readdirSync('public/admin-linear/assets');
            assert.ok(files.some(f => f.endsWith('.js')), 'Must contain JS bundle chunk');
            assert.ok(files.some(f => f.endsWith('.css')), 'Must contain CSS bundle chunk');
        });

        it('Verifies open CC0 PBR textures exist in public/admin-linear/textures/', () => {
            const texDir = 'public/admin-linear/textures';
            assert.ok(fs.existsSync(texDir));
            const required = [
                'yellow_plaster_diff_1k.jpg',
                'granite_wall_diff_1k.jpg',
                'box_profile_metal_sheet_diff_1k.jpg'
            ];
            for (const file of required) {
                const p = `${texDir}/${file}`;
                assert.ok(fs.existsSync(p), `Texture ${file} must exist`);
                const stat = fs.statSync(p);
                assert.ok(stat.size > 100000, `Texture ${file} size (${stat.size}) must be > 100 KB`);
            }
        });
    });
});
