import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
    const port = 9342;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_test_profile_m1_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    // Target screenshot paths
    const agentScreenshotDir = '/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/challenger_m1_2';
    fs.mkdirSync(agentScreenshotDir, { recursive: true });
    const agentScreenshotPath = path.join(agentScreenshotDir, 'm1_cdp_verification.png');
    const tmpScreenshotPath = '/tmp/m1_facades_road_markings.png';

    console.log(`[CDP M1] Launching headless Chrome on port ${port}...`);
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--use-gl=angle',
        '--enable-webgl',
        '--enable-webgl2',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1440,900',
        'about:blank'
    ], { stdio: 'ignore' });

    let ws = null;

    const cleanup = () => {
        try {
            if (ws && ws.readyState === WebSocket.OPEN) ws.close();
        } catch (e) {}
        try {
            chrome.kill('SIGKILL');
        } catch (e) {}
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {}
    };

    process.on('SIGINT', () => { cleanup(); process.exit(1); });
    process.on('SIGTERM', () => { cleanup(); process.exit(1); });

    try {
        // Wait for CDP to be ready
        let version = null;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 150));
            try {
                const res = await fetch(`http://127.0.0.1:${port}/json/version`);
                if (res.ok) {
                    version = await res.json();
                    break;
                }
            } catch (e) {}
        }

        if (!version) {
            throw new Error(`Failed to connect to Chrome CDP on port ${port}`);
        }
        console.log(`[CDP M1] Chrome CDP active: ${version.Browser}`);

        // Wait for a valid web page target (ignore browser_ui, service_worker, etc.)
        let pageTarget = null;
        for (let i = 0; i < 30; i++) {
            try {
                const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
                if (targetsRes.ok) {
                    const targets = await targetsRes.json();
                    pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
                    if (pageTarget) break;
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 150));
        }

        if (!pageTarget) {
            const newRes = await fetch(`http://127.0.0.1:${port}/json/new`);
            pageTarget = await newRes.json();
        }

        console.log(`[CDP M1] Connected to page target: ${pageTarget.title || pageTarget.url}`);

        ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        let msgId = 1;
        const callbacks = new Map();
        const consoleLogs = [];
        const consoleErrors = [];
        const networkErrors = [];

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.id && callbacks.has(msg.id)) {
                    const cb = callbacks.get(msg.id);
                    callbacks.delete(msg.id);
                    cb(msg.result, msg.error);
                }
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
                    consoleLogs.push({ type: msg.params.type, text });
                    if (msg.params.type === 'error') {
                        consoleErrors.push(text);
                    }
                }
                if (msg.method === 'Runtime.exceptionThrown') {
                    const exc = (msg.params.exceptionDetails?.text || '') + ' ' + (msg.params.exceptionDetails?.exception?.description || '');
                    consoleErrors.push(exc);
                }
                if (msg.method === 'Network.responseReceived') {
                    const url = msg.params?.response?.url || '';
                    const status = msg.params?.response?.status || 200;
                    if (status >= 400) {
                        networkErrors.push({ url, status, statusText: msg.params.response.statusText });
                    }
                }
            } catch (err) {
                console.error('[CDP WS error in handler]', err);
            }
        };

        function send(method, params = {}, timeoutMs = 15000) {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                const timer = setTimeout(() => {
                    callbacks.delete(id);
                    reject(new Error(`CDP command '${method}' timed out after ${timeoutMs}ms`));
                }, timeoutMs);

                callbacks.set(id, (res, err) => {
                    clearTimeout(timer);
                    if (err) reject(new Error(err.message || JSON.stringify(err)));
                    else resolve(res);
                });
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        });

        await send('Runtime.enable');
        await send('Page.enable');
        await send('Network.enable');

        // Extract master key from .env
        const envContent = fs.readFileSync('.env', 'utf8');
        const keyMatch = envContent.match(/ADMIN_WEB_KEY=([^\r\n]+)/);
        const adminKey = keyMatch ? keyMatch[1] : 'master_key';

        // Pre-inject authentication credentials before page scripts execute
        await send('Page.addScriptToEvaluateOnNewDocument', {
            source: `
                try {
                    sessionStorage.setItem('admin_key', '${adminKey}');
                    localStorage.setItem('admin_key', '${adminKey}');
                } catch (e) {}
            `
        });

        console.log('[CDP M1] Navigating to http://localhost:3000...');
        await send('Page.navigate', { url: 'http://localhost:3000' });

        // Wait for page UI buttons to appear
        let uiReady = false;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 200));
            const check = await send('Runtime.evaluate', {
                expression: `Boolean(document.querySelector('button'))`,
                returnByValue: true
            });
            if (check.result?.value) {
                uiReady = true;
                break;
            }
        }
        if (!uiReady) {
            throw new Error('Timeout waiting for UI buttons on localhost:3000');
        }

        // Switch to "Карта СПб" tab
        console.log('[CDP M1] Switching to "Карта СПб" tab...');
        const switched = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
                    if (mapBtn) {
                        mapBtn.click();
                        return true;
                    }
                    return false;
                })()
            `,
            returnByValue: true
        });

        if (!switched.result?.value) {
            throw new Error('Failed to find and click "Карта СПб" button');
        }

        // Wait for MapLibre instance and building/roof layers to be loaded
        console.log('[CDP M1] Waiting for MapLibre canvas and building/roof layers...');
        let mapReady = false;
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 250));
            const check = await send('Runtime.evaluate', {
                expression: `
                    (() => {
                        const m = window.__map;
                        if (!m) return false;
                        const c = document.querySelector('.maplibregl-canvas');
                        if (!c) return false;
                        const hasBuildings = Boolean(m.getLayer && m.getLayer('3d-buildings'));
                        const hasRoof = Boolean(m.getLayer && m.getLayer('3d-buildings-roof'));
                        return hasBuildings && hasRoof;
                    })()
                `,
                returnByValue: true
            });
            if (check.result?.value) {
                mapReady = true;
                break;
            }
        }

        if (!mapReady) {
            throw new Error('Timeout waiting for MapLibre 3d-buildings and 3d-buildings-roof layers to initialize');
        }

        // Allow render pass to settle
        await new Promise(r => setTimeout(r, 2000));

        // Combined audit of WebGL 2.0 context, MapLibre layers, pattern registrations, and canvas snapshot
        console.log('[CDP M1] Running unified Map & WebGL 2.0 audit and capturing canvas snapshot...');
        const auditEval = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const map = window.__map;
                    if (!map) return { error: 'window.__map is undefined' };

                    const canvas = document.querySelector('.maplibregl-canvas');
                    if (!canvas) return { error: 'Canvas .maplibregl-canvas not found' };

                    // 1. Capture WebGL Canvas snapshot before querying GL state
                    const screenshotDataUrl = canvas.toDataURL('image/png');

                    // 2. WebGL 2.0 Context Inspection
                    const gl = map.painter?.context?.gl;

                    let glError = -1;
                    let glVersion = 'unknown';
                    let glRenderer = 'unknown';
                    let isWebGL2 = false;

                    if (gl) {
                        glError = gl.getError();
                        glVersion = gl.getParameter(gl.VERSION) || 'unknown';
                        glRenderer = gl.getParameter(gl.RENDERER) || 'unknown';
                        isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) ||
                                   (typeof glVersion === 'string' && glVersion.includes('WebGL 2.0'));
                    }

                    // 3. Sprite Image Registration (Day, Sunset, Night)
                    const facadeImages = {
                        day: map.hasImage('spb-facade-day'),
                        sunset: map.hasImage('spb-facade-sunset'),
                        night: map.hasImage('spb-facade-night')
                    };

                    const roofImages = {
                        day: map.hasImage('spb-roof-day'),
                        sunset: map.hasImage('spb-roof-sunset'),
                        night: map.hasImage('spb-roof-night')
                    };

                    // 4. Source & Layer Audits
                    const hasRoadSource = Boolean(map.getSource('spb-road-markings'));
                    const bLayer = map.getLayer('3d-buildings');
                    const rLayer = map.getLayer('3d-buildings-roof');
                    const divLayer = map.getLayer('road-dividing-lines');
                    const zebraStripesLayer = map.getLayer('road-crosswalk-stripes');
                    const zebraLinesLayer = map.getLayer('road-crosswalk-lines');

                    const style = map.getStyle();
                    const layerIds = style ? style.layers.map(l => l.id) : [];

                    const bIdx = layerIds.indexOf('3d-buildings');
                    const rIdx = layerIds.indexOf('3d-buildings-roof');
                    const divIdx = layerIds.indexOf('road-dividing-lines');
                    const stripesIdx = layerIds.indexOf('road-crosswalk-stripes');
                    const linesIdx = layerIds.indexOf('road-crosswalk-lines');

                    const currentFacadePattern = bLayer ? map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern') : null;
                    const currentRoofPattern = rLayer ? map.getPaintProperty('3d-buildings-roof', 'fill-extrusion-pattern') : null;

                    return {
                        hasCanvas: Boolean(canvas),
                        canvasDimensions: { width: canvas.width, height: canvas.height },
                        screenshotDataUrl,
                        webgl: {
                            isWebGL2,
                            glError,
                            glVersion,
                            glRenderer
                        },
                        facadeImages,
                        roofImages,
                        hasRoadSource,
                        layers: {
                            has3dBuildings: Boolean(bLayer),
                            has3dBuildingsRoof: Boolean(rLayer),
                            hasDividingLines: Boolean(divLayer),
                            hasZebraStripes: Boolean(zebraStripesLayer),
                            hasZebraLines: Boolean(zebraLinesLayer)
                        },
                        patterns: {
                            currentFacadePattern,
                            currentRoofPattern
                        },
                        layerOrder: {
                            bIdx,
                            rIdx,
                            divIdx,
                            stripesIdx,
                            linesIdx,
                            roadUnderBuildings: (divIdx < bIdx && stripesIdx < bIdx && linesIdx < bIdx),
                            roofAboveBuildings: (rIdx > bIdx)
                        },
                        mapErrors: window.__mapErrors || []
                    };
                })()
            `,
            returnByValue: true
        });

        const audit = auditEval.result?.value;
        const dataUri = audit.screenshotDataUrl;
        delete audit.screenshotDataUrl; // Remove huge base64 from audit printout

        console.log('[CDP M1] Map Audit Result:', JSON.stringify(audit, null, 2));

        // Save verification screenshot
        if (dataUri && dataUri.startsWith('data:image/png;base64,')) {
            const base64Data = dataUri.replace(/^data:image\/png;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(agentScreenshotPath, imgBuffer);
            fs.writeFileSync(tmpScreenshotPath, imgBuffer);
            console.log(`[CDP M1] Screenshot saved to ${agentScreenshotPath} (${imgBuffer.length} bytes)`);
            console.log(`[CDP M1] Screenshot saved to ${tmpScreenshotPath}`);
        } else {
            console.warn('[CDP M1] Warning: Failed to extract valid screenshot data URL');
        }

        // Test texture HTTP assets loading directly
        console.log('[CDP M1] Validating static texture assets accessibility...');
        const textures = [
            '/textures/yellow_plaster_diff_1k.jpg',
            '/textures/granite_wall_diff_1k.jpg',
            '/textures/box_profile_metal_sheet_diff_1k.jpg'
        ];
        const textureChecks = [];
        for (const relUrl of textures) {
            try {
                const res = await fetch(`http://localhost:3000${relUrl}`);
                const buf = await res.arrayBuffer();
                textureChecks.push({
                    url: relUrl,
                    status: res.status,
                    ok: res.ok,
                    bytes: buf.byteLength,
                    contentType: res.headers.get('content-type')
                });
            } catch (e) {
                textureChecks.push({ url: relUrl, ok: false, error: e.message });
            }
        }

        console.log('[CDP M1] Texture Fetch Checks:', JSON.stringify(textureChecks, null, 2));

        // Validate all requirements
        const failures = [];

        if (!audit.hasCanvas) {
            failures.push('Map canvas element .maplibregl-canvas not found in DOM');
        }
        if (!audit.webgl.isWebGL2) {
            failures.push(`Expected WebGL 2.0 context, but got isWebGL2=${audit.webgl.isWebGL2} (Version: ${audit.webgl.glVersion})`);
        }
        if (audit.webgl.glError !== 0) {
            failures.push(`WebGL gl.getError() returned ${audit.webgl.glError} (expected 0 / NO_ERROR)`);
        }
        if (!audit.facadeImages.day || !audit.facadeImages.sunset || !audit.facadeImages.night) {
            failures.push(`Missing facade images in sprite: ${JSON.stringify(audit.facadeImages)}`);
        }
        if (!audit.roofImages.day || !audit.roofImages.sunset || !audit.roofImages.night) {
            failures.push(`Missing roof images in sprite: ${JSON.stringify(audit.roofImages)}`);
        }
        if (!audit.hasRoadSource) {
            failures.push('Missing road markings GeoJSON source: spb-road-markings');
        }
        if (!audit.layers.has3dBuildings) {
            failures.push('Missing layer: 3d-buildings');
        }
        if (!audit.layers.has3dBuildingsRoof) {
            failures.push('Missing layer: 3d-buildings-roof');
        }
        if (!audit.layers.hasDividingLines || !audit.layers.hasZebraStripes || !audit.layers.hasZebraLines) {
            failures.push(`Missing road marking layers: ${JSON.stringify(audit.layers)}`);
        }
        if (!audit.layerOrder.roadUnderBuildings) {
            failures.push(`Road markings are not beneath 3d-buildings in layer stack: ${JSON.stringify(audit.layerOrder)}`);
        }
        if (!audit.layerOrder.roofAboveBuildings) {
            failures.push(`3d-buildings-roof is not above 3d-buildings in layer stack: ${JSON.stringify(audit.layerOrder)}`);
        }

        // Check network errors for textures/assets
        const criticalNetworkErrors = networkErrors.filter(e => !e.canceled && (e.status >= 400 || e.errorText));
        if (criticalNetworkErrors.length > 0) {
            failures.push(`Network request failures detected: ${JSON.stringify(criticalNetworkErrors)}`);
        }

        for (const t of textureChecks) {
            if (!t.ok || t.status !== 200 || t.bytes === 0) {
                failures.push(`Texture asset failed to load: ${t.url} (status ${t.status || t.error})`);
            }
        }

        if (audit.mapErrors && audit.mapErrors.length > 0) {
            failures.push(`MapLibre errors recorded: ${JSON.stringify(audit.mapErrors)}`);
        }

        console.log('\n================ VERIFICATION SUMMARY ================');
        console.log(`WebGL 2.0 Active:     ${audit.webgl.isWebGL2}`);
        console.log(`WebGL gl.getError():  ${audit.webgl.glError} (0 = NO_ERROR)`);
        console.log(`WebGL Version:        ${audit.webgl.glVersion}`);
        console.log(`WebGL Renderer:       ${audit.webgl.glRenderer}`);
        console.log(`3D Buildings Layer:   ${audit.layers.has3dBuildings} (Pattern: ${audit.patterns.currentFacadePattern})`);
        console.log(`3D Roof Layer:        ${audit.layers.has3dBuildingsRoof} (Pattern: ${audit.patterns.currentRoofPattern})`);
        console.log(`Road Markings:        ${audit.hasRoadSource && audit.layers.hasDividingLines && audit.layers.hasZebraStripes}`);
        console.log(`Layer Ordering:       Road < Buildings < Roof (roadUnder=${audit.layerOrder.roadUnderBuildings}, roofAbove=${audit.layerOrder.roofAboveBuildings})`);
        console.log(`Network Failures:     ${criticalNetworkErrors.length}`);
        console.log(`Textures Valid:       ${textureChecks.every(t => t.ok)}`);
        console.log(`Screenshot Captured:  ${agentScreenshotPath}`);
        console.log('======================================================\n');

        cleanup();

        if (failures.length > 0) {
            console.error('[CDP M1] VERIFICATION FAILED WITH REASONS:');
            failures.forEach(f => console.error(`  - ${f}`));
            process.exit(1);
        } else {
            console.log('[CDP M1] ALL EMPIRICAL VERIFICATION CHECKS PASSED PERFECTLY (APPROVE)!');
            process.exit(0);
        }
    } catch (err) {
        cleanup();
        console.error('[CDP M1] Unhandled Exception during CDP verification:', err);
        process.exit(1);
    }
}

main();
