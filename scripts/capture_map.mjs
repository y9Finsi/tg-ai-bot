import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
    const port = 9388;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_capture_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const targetScreenshotPath = '/Users/bogdan/.gemini/antigravity/brain/1dc79a49-7c96-4209-b2f0-8d9fe167617e/actual_maplibre_canvas.png';

    console.log(`[Capture] Launching Chrome on port ${port}...`);
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--use-gl=angle',
        '--enable-webgl',
        '--enable-webgl2',
        '--no-sandbox',
        '--window-size=1600,1000',
        'about:blank'
    ], { stdio: 'ignore' });

    let ws = null;

    const cleanup = () => {
        try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch (e) {}
        try { chrome.kill('SIGKILL'); } catch (e) {}
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        let version = null;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 150));
            try {
                const res = await fetch(`http://127.0.0.1:${port}/json/version`);
                if (res.ok) { version = await res.json(); break; }
            } catch (e) {}
        }
        if (!version) throw new Error('Could not connect to Chrome CDP');

        let pageTarget = null;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}/json/list`);
                if (res.ok) {
                    const list = await res.json();
                    pageTarget = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
                    if (pageTarget) break;
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 150));
        }

        if (!pageTarget) {
            const newRes = await fetch(`http://127.0.0.1:${port}/json/new`);
            pageTarget = await newRes.json();
        }

        console.log(`[Capture] Page target ready: ${pageTarget.url}`);
        ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

        let msgId = 1;
        const callbacks = new Map();
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = msgId++;
            callbacks.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.id && callbacks.has(msg.id)) {
                const { resolve, reject } = callbacks.get(msg.id);
                callbacks.delete(msg.id);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
            }
        };

        await new Promise((resolve) => ws.onopen = resolve);

        await send('Page.enable');
        await send('Runtime.enable');

        // Set session storage admin_key before navigate
        console.log('[Capture] Setting up auth and navigating...');
        await send('Page.navigate', { url: 'http://localhost:3000/' });
        await new Promise(r => setTimeout(r, 1000));

        await send('Runtime.evaluate', {
            expression: `
                sessionStorage.setItem('admin_key', 'dev_secret_key_123');
                localStorage.setItem('admin_key', 'dev_secret_key_123');
                location.hash = '#map';
                location.reload();
            `
        });

        console.log('[Capture] Waiting for MapLibre & Three.js to reload & render (5s)...');
        await new Promise(r => setTimeout(r, 5000));

        // Collect console logs
        const logs = [];
        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.method === 'Runtime.consoleAPICalled') {
                logs.push(`[${msg.params.type}] ` + msg.params.args.map(a => a.value || JSON.stringify(a)).join(' '));
            }
            if (msg.id && callbacks.has(msg.id)) {
                const { resolve, reject } = callbacks.get(msg.id);
                callbacks.delete(msg.id);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
            }
        };

        // Click Day button and fly to street zoom on Austrian Square / Bolshoy Prospekt
        console.log('[Capture] Flying to street level on Bolshoy Prospekt / Austrian Square...');
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const dayBtn = btns.find(b => b.textContent.includes('День'));
                    if (dayBtn) dayBtn.click();

                    // Click Cafe Sloy card so Lera walks to Cafe Sloy on the open avenue
                    const sloyBtn = btns.find(b => b.textContent.includes('Кафе «Слой»'));
                    if (sloyBtn) sloyBtn.click();

                    // Click Street view button to enter street inspection zoom
                    const streetBtn = btns.find(b => b.textContent.includes('Улица'));
                    if (streetBtn) {
                        streetBtn.click();
                        setTimeout(() => streetBtn.click(), 400);
                    }
                })()
            `
        });
        await new Promise(r => setTimeout(r, 4000));

        // Evaluate state
        const evalRes = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    try {
                        const map = window.__map;
                        const layer = map ? map.getLayer('3d-pedestrians') : null;
                        const pedImpl = layer?.implementation;
                        const charDiagn = [];
                        if (pedImpl?._characterMeshes && pedImpl?._camera) {
                            const cam = pedImpl._camera;
                            const el = cam.projectionMatrix ? Array.from(cam.projectionMatrix.elements) : null;
                            charDiagn.push({ id: '__CAMERA__', elements: el });
                            pedImpl._characterMeshes.forEach((mesh, id) => {
                                const wx = mesh.position.x;
                                const wy = mesh.position.y;
                                const wz = mesh.position.z;
                                // Multiply column-major matrix 4x4 with [wx, wy, wz, 1.0]
                                const cx = el[0]*wx + el[4]*wy + el[8]*wz + el[12];
                                const cy = el[1]*wx + el[5]*wy + el[9]*wz + el[13];
                                const cz = el[2]*wx + el[6]*wy + el[10]*wz + el[14];
                                const cw = el[3]*wx + el[7]*wy + el[11]*wz + el[15];

                                const ndc = {
                                    x: cx / cw,
                                    y: cy / cw,
                                    z: cz / cw,
                                    w: cw
                                };
                                const gltfModel = mesh.getObjectByName('gltf_model');
                                charDiagn.push({
                                    id,
                                    pos: { x: wx, y: wy, z: wz },
                                    scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
                                    ndc,
                                    hasGltf: !!gltfModel,
                                    gltfVisible: gltfModel?.visible,
                                    gltfScale: gltfModel ? { x: gltfModel.scale.x, y: gltfModel.scale.y, z: gltfModel.scale.z } : null
                                });
                            });
                        }
                        return {
                            hasMap: !!map,
                            hasPedLayer: !!layer,
                            renderCalls: pedImpl?._renderCalls,
                            lastRenderInfo: pedImpl?._lastRenderInfo,
                            characters: charDiagn,
                            mapErrors: window.__mapErrors || []
                        };
                    } catch (err) {
                        return { evalError: err.message, stack: err.stack };
                    }
                })()
            `,
            returnByValue: true
        });
        console.log('[Capture] Characters NDC & POS:');
        evalRes.result?.value?.characters?.forEach(c => {
            if (c.id === '__CAMERA__') {
                console.log('CAMERA ELEMENTS:', c.elements);
            } else {
                console.log(c.id, 'pos:', c.pos, 'ndc:', c.ndc, 'hasGltf:', c.hasGltf, 'scale:', c.scale, 'gltfScale:', c.gltfScale, 'gltfVisible:', c.gltfVisible);
            }
        });
        console.log('[Capture] Logs:', logs);

        // Take screenshot
        console.log('[Capture] Taking screenshot...');
        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true
        });

        fs.mkdirSync(path.dirname(targetScreenshotPath), { recursive: true });
        fs.writeFileSync(targetScreenshotPath, Buffer.from(screenshot.data, 'base64'));
        console.log(`[Capture] Saved screenshot to ${targetScreenshotPath} (${Math.round(screenshot.data.length * 0.75 / 1024)} KB)`);

        const currentSessionPath = '/Users/bogdan/.gemini/antigravity/brain/96f97063-34d8-4ab2-aad6-dce71965f9a3/actual_maplibre_canvas.png';
        try {
            fs.mkdirSync(path.dirname(currentSessionPath), { recursive: true });
            fs.writeFileSync(currentSessionPath, Buffer.from(screenshot.data, 'base64'));
        } catch {}

    } catch (err) {
        console.error('[Capture Error]', err);
    } finally {
        cleanup();
    }
}

main();
