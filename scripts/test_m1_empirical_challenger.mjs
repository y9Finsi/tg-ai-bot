import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    console.log('=== Starting Empirical Challenger 2 CDP Verification for M1 ===');
    const port = 9340;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_challenger_profile_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--use-gl=angle',
        '--enable-webgl',
        '--window-size=1440,900',
        'about:blank'
    ], { stdio: 'ignore' });

    // Wait for CDP readiness
    let version = null;
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) {
                version = await res.json();
                break;
            }
        } catch (e) {}
    }

    if (!version) {
        chrome.kill();
        throw new Error('Failed to connect to Chrome CDP on port ' + port);
    }

    const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();
    const consoleLogs = [];
    const consoleErrors = [];
    const webglErrors = [];

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            callbacks.get(msg.id)(msg.result, msg.error);
            callbacks.delete(msg.id);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            consoleLogs.push({ type: msg.params.type, text });
            if (msg.params.type === 'error' || text.toLowerCase().includes('webgl') || text.toLowerCase().includes('shader')) {
                if (msg.params.type === 'error') {
                    consoleErrors.push(text);
                }
                if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) {
                    webglErrors.push(text);
                }
            }
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            const exc = msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || '');
            consoleErrors.push(exc);
        }
    };

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            callbacks.set(id, (res, err) => {
                if (err) reject(err);
                else resolve(res);
            });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    await new Promise(r => { ws.onopen = r; });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');

    // Read admin key from .env
    const envContent = fs.readFileSync('.env', 'utf8');
    const keyMatch = envContent.match(/ADMIN_WEB_KEY=([^\r\n]+)/);
    const adminKey = keyMatch ? keyMatch[1].trim() : 'master_key';

    // Set cookie before navigation
    await send('Network.setCookie', {
        name: 'admin_key',
        value: adminKey,
        domain: 'localhost',
        path: '/'
    });

    console.log('Navigating to http://localhost:3000...');
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 2000));

    // Ensure storage keys are set as well
    await send('Runtime.evaluate', {
        expression: `
            sessionStorage.setItem('admin_key', '${adminKey}');
            localStorage.setItem('admin_key', '${adminKey}');
        `
    });

    // Switch to Map tab
    console.log('Switching to Map tab ("Карта СПб")...');
    const switchRes = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
                if (mapBtn) {
                    mapBtn.click();
                    return { clicked: true };
                }
                return { clicked: false, buttons: buttons.map(b => b.textContent.trim()) };
            })()
        `,
        returnByValue: true
    });
    console.log('Tab switch result:', switchRes.result.value);

    // Wait for MapLibre map and WebGL context to fully initialize
    console.log('Waiting for MapLibre WebGL canvas to render...');
    let mapLoaded = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const check = await send('Runtime.evaluate', {
            expression: `Boolean(window.__map && window.__map.loaded() && document.querySelector('.maplibregl-canvas'))`,
            returnByValue: true
        });
        if (check.result.value) {
            mapLoaded = true;
            break;
        }
    }

    if (!mapLoaded) {
        // Even if map.loaded() is false due to continuous tile streaming, check if window.__map exists
        const partialCheck = await send('Runtime.evaluate', {
            expression: `Boolean(window.__map)`,
            returnByValue: true
        });
        if (!partialCheck.result.value) {
            throw new Error('window.__map was never initialized after 15 seconds!');
        }
        console.log('window.__map is initialized (streaming vector tiles)...');
    } else {
        console.log('MapLibre map and canvas successfully loaded!');
    }

    // Additional settling time for vector tiles & pattern registration
    await new Promise(r => setTimeout(r, 2500));

    // =========================================================================
    // TEST 1: MapLibre WebGL Context & Shader Error Check
    // =========================================================================
    console.log('\n--- TEST 1: WebGL Context & Shader Error Audit ---');
    const webglAudit = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const canvas = document.querySelector('.maplibregl-canvas');
                if (!canvas) return { error: 'Canvas element not found' };

                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                if (!gl) return { error: 'WebGL context not found on canvas' };

                const glError = gl.getError();
                const isContextLost = gl.isContextLost();

                return {
                    width: canvas.width,
                    height: canvas.height,
                    glVersion: gl.getParameter(gl.VERSION),
                    glRenderer: gl.getParameter(gl.RENDERER),
                    glVendor: gl.getParameter(gl.VENDOR),
                    glError: glError, // 0 = NO_ERROR
                    isContextLost,
                    mapError: window.__mapError || null,
                    mapErrors: window.__mapErrors || []
                };
            })()
        `,
        returnByValue: true
    });
    console.log('WebGL Audit:', JSON.stringify(webglAudit.result.value, null, 2));

    // =========================================================================
    // TEST 2: Facade Pattern Registration in MapLibre Sprite Image Registry
    // =========================================================================
    console.log('\n--- TEST 2: Facade Pattern Registration Audit ---');
    const patternAudit = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const map = window.__map;
                if (!map) return { error: 'window.__map is null' };

                return {
                    hasDay: map.hasImage('spb-facade-day'),
                    hasSunset: map.hasImage('spb-facade-sunset'),
                    hasNight: map.hasImage('spb-facade-night'),
                    currentBuildingPattern: map.getLayer('3d-buildings')
                        ? map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern')
                        : null
                };
            })()
        `,
        returnByValue: true
    });
    console.log('Pattern Audit:', JSON.stringify(patternAudit.result.value, null, 2));

    // =========================================================================
    // TEST 3: Dynamic Pattern Switching (Day -> Sunset -> Night -> Day)
    // =========================================================================
    console.log('\n--- TEST 3: Dynamic Pattern Switching via UI Buttons ---');
    const themeSteps = [
        { label: 'День', expected: 'spb-facade-day' },
        { label: 'Закат', expected: 'spb-facade-sunset' },
        { label: 'Ночь', expected: 'spb-facade-night' },
        { label: 'День', expected: 'spb-facade-day' }
    ];

    const patternSwitchResults = [];
    for (const step of themeSteps) {
        console.log(`Clicking theme button "${step.label}"...`);
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btn = buttons.find(b => b.textContent.trim() === '${step.label}');
                    if (btn) btn.click();
                })()
            `
        });

        // Allow style reload and applyThemeToMap to complete
        await new Promise(r => setTimeout(r, 1200));

        const checkRes = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const map = window.__map;
                    if (!map) return { error: 'no map' };
                    const pattern = map.getLayer('3d-buildings')
                        ? map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern')
                        : null;
                    return {
                        pattern,
                        hasImage: map.hasImage(pattern),
                        hasBuildings: Boolean(map.getLayer('3d-buildings')),
                        hasDividing: Boolean(map.getLayer('road-dividing-lines')),
                        hasZebras: Boolean(map.getLayer('road-crosswalk-stripes')),
                        hasLines: Boolean(map.getLayer('road-crosswalk-lines'))
                    };
                })()
            `,
            returnByValue: true
        });

        const actual = checkRes.result.value?.pattern;
        const matches = actual === step.expected;
        const hasLayers = checkRes.result.value?.hasDividing && checkRes.result.value?.hasZebras && checkRes.result.value?.hasLines;

        patternSwitchResults.push({
            theme: step.label,
            expected: step.expected,
            applied: actual,
            matches,
            hasImage: checkRes.result.value?.hasImage,
            hasLayers
        });
    }
    console.log('Pattern Switch Results:', JSON.stringify(patternSwitchResults, null, 2));

    // =========================================================================
    // TEST 4: Road Markings GeoJSON Source, Layers, and Depth Ordering
    // =========================================================================
    console.log('\n--- TEST 4: Road Markings & Depth Ordering Audit ---');
    const roadAudit = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const map = window.__map;
                if (!map) return { error: 'window.__map is null' };

                const source = map.getSource('spb-road-markings');
                const style = map.getStyle();
                const layers = style ? style.layers : [];
                const layerIds = layers.map(l => l.id);

                const bLayer = map.getLayer('3d-buildings');
                const divLayer = map.getLayer('road-dividing-lines');
                const stripesLayer = map.getLayer('road-crosswalk-stripes');
                const linesLayer = map.getLayer('road-crosswalk-lines');

                const bIdx = layerIds.indexOf('3d-buildings');
                const divIdx = layerIds.indexOf('road-dividing-lines');
                const stripesIdx = layerIds.indexOf('road-crosswalk-stripes');
                const linesIdx = layerIds.indexOf('road-crosswalk-lines');

                return {
                    hasRoadSource: Boolean(source),
                    has3dBuildings: Boolean(bLayer),
                    hasDividingLines: Boolean(divLayer),
                    hasZebraStripes: Boolean(stripesLayer),
                    hasZebraLines: Boolean(linesLayer),
                    dividingFilter: divLayer ? map.getFilter('road-dividing-lines') : null,
                    stripesFilter: stripesLayer ? map.getFilter('road-crosswalk-stripes') : null,
                    linesFilter: linesLayer ? map.getFilter('road-crosswalk-lines') : null,
                    indices: {
                        '3d-buildings': bIdx,
                        'road-dividing-lines': divIdx,
                        'road-crosswalk-stripes': stripesIdx,
                        'road-crosswalk-lines': linesIdx
                    },
                    // Crucial requirement: road markings MUST be below 3d-buildings in the render tree
                    isBeneathBuildings: (divIdx < bIdx && stripesIdx < bIdx && linesIdx < bIdx)
                };
            })()
        `,
        returnByValue: true
    });
    console.log('Road Markings Audit:', JSON.stringify(roadAudit.result.value, null, 2));

    // =========================================================================
    // TEST 5: Camera Orbit & WebGL Stress Test (Bearing / Pitch manipulation)
    // =========================================================================
    console.log('\n--- TEST 5: Camera Orbit & WebGL Stress Test ---');
    const stressRes = await send('Runtime.evaluate', {
        expression: `
            (async () => {
                const map = window.__map;
                const canvas = document.querySelector('.maplibregl-canvas');
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

                const errorsBefore = gl.getError();

                // Rapid camera movements
                map.setPitch(60);
                map.setBearing(45);
                map.setZoom(16.5);
                map.triggerRepaint();

                await new Promise(r => setTimeout(r, 400));

                map.setPitch(30);
                map.setBearing(-30);
                map.setZoom(15.2);
                map.triggerRepaint();

                await new Promise(r => setTimeout(r, 400));

                map.setPitch(50);
                map.setBearing(-15);
                map.setZoom(15.8);
                map.triggerRepaint();

                await new Promise(r => setTimeout(r, 400));

                const errorsAfter = gl.getError();
                const isContextLost = gl.isContextLost();

                return {
                    errorsBefore,
                    errorsAfter,
                    isContextLost,
                    finalPitch: map.getPitch(),
                    finalBearing: map.getBearing(),
                    finalZoom: map.getZoom()
                };
            })()
        `,
        awaitPromise: true,
        returnByValue: true
    });
    console.log('Stress Test Result:', JSON.stringify(stressRes.result.value, null, 2));

    // =========================================================================
    // TEST 6: Capture Screenshot of Real WebGL Scene
    // =========================================================================
    console.log('\n--- TEST 6: Capture Screenshot of Real WebGL Scene ---');
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = '/tmp/m1_challenger2_webgl_verification.png';
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log('Screenshot successfully saved to:', screenshotPath);

    // Clean up chrome process
    chrome.kill();
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}

    // =========================================================================
    // EVALUATE EMPIRICAL FINDINGS
    // =========================================================================
    const failures = [];

    // 1. WebGL errors
    if (webglAudit.result.value?.glError !== 0) {
        failures.push(`WebGL error detected: ${webglAudit.result.value?.glError}`);
    }
    if (webglAudit.result.value?.isContextLost) {
        failures.push('WebGL context was lost!');
    }
    if (webglAudit.result.value?.mapError) {
        failures.push(`MapLibre error: ${webglAudit.result.value?.mapError}`);
    }

    // 2. Pattern registration
    if (!patternAudit.result.value?.hasDay || !patternAudit.result.value?.hasSunset || !patternAudit.result.value?.hasNight) {
        failures.push('Missing facade patterns in MapLibre image registry');
    }

    // 3. Dynamic pattern switching
    patternSwitchResults.forEach(r => {
        if (!r.matches || !r.hasImage || !r.hasLayers) {
            failures.push(`Pattern switch failed for theme "${r.theme}": applied=${r.applied}, expected=${r.expected}, hasImage=${r.hasImage}, hasLayers=${r.hasLayers}`);
        }
    });

    // 4. Road markings & depth ordering
    if (!roadAudit.result.value?.hasRoadSource) {
        failures.push('Missing GeoJSON source "spb-road-markings"');
    }
    if (!roadAudit.result.value?.hasDividingLines || !roadAudit.result.value?.hasZebraStripes || !roadAudit.result.value?.hasZebraLines) {
        failures.push('Missing road marking layers in MapLibre style');
    }
    if (!roadAudit.result.value?.isBeneathBuildings) {
        failures.push(`Road markings are NOT below 3d-buildings! Indices: ${JSON.stringify(roadAudit.result.value?.indices)}`);
    }

    // 5. Stress camera test
    if (stressRes.result.value?.errorsAfter !== 0) {
        failures.push(`WebGL errors occurred during camera stress test: ${stressRes.result.value?.errorsAfter}`);
    }

    console.log('\n=============================================================');
    console.log('FINAL EMPIRICAL CHALLENGE VERDICT:');
    if (failures.length > 0) {
        console.error('VERDICT: REQUEST_CHANGES');
        console.error('Detected Failures:', failures);
        process.exit(1);
    } else {
        console.log('VERDICT: APPROVE');
        console.log('All WebGL checks, pattern switching, road markings, and layer depth ordering PASSED.');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Challenger script execution failed:', err);
    process.exit(1);
});
