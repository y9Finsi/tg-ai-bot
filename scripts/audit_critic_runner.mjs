import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function main() {
    const port = 9395;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_critic_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const targetScreenshotPath = '/Users/bogdan/.gemini/antigravity/brain/1dc79a49-7c96-4209-b2f0-8d9fe167617e/actual_maplibre_canvas.png';
    const currentArtifactDir = '/Users/bogdan/.gemini/antigravity/brain/fae4ae1e-18ed-4ecd-9c29-880ab166c889';

    console.log(`[Critic] Launching Chrome on port ${port}...`);
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

        const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await listRes.json();
        let pageTarget = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);

        ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        let msgId = 1;
        const callbacks = new Map();
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = msgId++;
            callbacks.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });

        const consoleLogs = [];
        const exceptions = [];

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.method === 'Runtime.consoleAPICalled') {
                consoleLogs.push({
                    type: msg.params.type,
                    text: msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || JSON.stringify(a))).join(' ')
                });
            }
            if (msg.method === 'Runtime.exceptionThrown') {
                exceptions.push(msg.params.exceptionDetails);
            }
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

        console.log('[Critic] Navigating to http://localhost:3000/#map...');
        await send('Page.navigate', { url: 'http://localhost:3000/' });
        await new Promise(r => setTimeout(r, 800));

        await send('Runtime.evaluate', {
            expression: `
                sessionStorage.setItem('admin_key', 'dev_secret_key_123');
                localStorage.setItem('admin_key', 'dev_secret_key_123');
                location.hash = '#map';
            `
        });

        console.log('[Critic] Waiting for initial render & GLTF caching (4.5s)...');
        await new Promise(r => setTimeout(r, 4500));

        // Click Day button
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const dayBtn = btns.find(b => b.textContent.includes('День'));
                    if (dayBtn) dayBtn.click();
                })()
            `
        });
        await new Promise(r => setTimeout(r, 800));

        // 1. Measure FPS and performance
        console.log('[Critic] Measuring live rendering performance (FPS)...');
        const fpsResult = await send('Runtime.evaluate', {
            expression: `
                new Promise((resolve) => {
                    let frames = 0;
                    const start = performance.now();
                    function countFrame(now) {
                        frames++;
                        if (now - start >= 1000) {
                            const elapsed = (now - start) / 1000;
                            resolve({ fps: Math.round(frames / elapsed), frames, elapsed });
                        } else {
                            requestAnimationFrame(countFrame);
                        }
                    }
                    requestAnimationFrame(countFrame);
                })
            `,
            awaitPromise: true,
            returnByValue: true
        });
        console.log('[Critic] FPS Measurement:', fpsResult.result?.value);

        // 2. Teleport / Position Lera to Austrian Square / Bolshoy Prospekt so all characters are in the primary frame
        console.log('[Critic] Positioning view & characters around Austrian Square, Bolshoy Prospekt & Cafe Sloy...');
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const map = window.__map;
                    if (map) {
                        // Center on Austrian Square / Bolshoy Prospekt / Sloy
                        map.jumpTo({
                            center: [30.3112, 59.9604],
                            zoom: 17.6,
                            pitch: 55,
                            bearing: 30
                        });
                    }
                })()
            `
        });
        await new Promise(r => setTimeout(r, 2000));

        // Also test clicking Cafe Sloy card to walk/teleport Lera to Cafe Sloy
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const sloyCard = btns.find(b => b.textContent.includes('Кафе «Слой»'));
                    if (sloyCard) sloyCard.click();
                })()
            `
        });
        await new Promise(r => setTimeout(r, 2000));

        // 3. Inspect 3D Characters, GLTF Integrity, Plumbob, and Materials
        const sceneAudit = await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const map = window.__map;
                    const layer = map?.getLayer('3d-pedestrians');
                    const impl = layer?.implementation;
                    
                    const charIds = ['lera', 'nastya', 'max', 'alina', 'dmitry', 'polina', 'ekaterina', 'sergey'];
                    const characters = {};

                    if (impl) {
                        for (const id of charIds) {
                            const mesh = impl.getMesh(id);
                            if (mesh) {
                                const gltf = mesh.getObjectByName('gltf_model');
                                const plumbob = mesh.getObjectByName('plumbob');
                                
                                // Inspect GLTF meshes and materials
                                let meshCount = 0;
                                let skinnedMeshCount = 0;
                                let materials = [];
                                let insideOutIssues = 0;

                                if (gltf) {
                                    gltf.traverse((child) => {
                                        if (child.isMesh) {
                                            meshCount++;
                                            if (child.isSkinnedMesh) skinnedMeshCount++;
                                            if (child.material) {
                                                const mats = Array.isArray(child.material) ? child.material : [child.material];
                                                mats.forEach(m => {
                                                    materials.push({
                                                        name: m.name,
                                                        type: m.type,
                                                        side: m.side, // 0: FrontSide, 1: BackSide, 2: DoubleSide
                                                        depthTest: m.depthTest,
                                                        depthWrite: m.depthWrite
                                                    });
                                                });
                                            }
                                        }
                                    });
                                }

                                characters[id] = {
                                    id,
                                    visible: mesh.visible,
                                    position: { x: Number(mesh.position.x.toFixed(2)), y: Number(mesh.position.y.toFixed(2)), z: Number(mesh.position.z.toFixed(2)) },
                                    coords: mesh.userData?.currentCoords,
                                    hasGltf: !!gltf,
                                    meshCount,
                                    skinnedMeshCount,
                                    hasPlumbob: !!plumbob,
                                    plumbobVisible: plumbob ? plumbob.visible : false,
                                    plumbobPos: plumbob ? { x: Number(plumbob.position.x.toFixed(2)), y: Number(plumbob.position.y.toFixed(2)), z: Number(plumbob.position.z.toFixed(2)) } : null,
                                    plumbobMaterial: plumbob ? {
                                        color: plumbob.material?.color?.getHexString(),
                                        emissive: plumbob.material?.emissive?.getHexString(),
                                        emissiveIntensity: plumbob.material?.emissiveIntensity
                                    } : null,
                                    materialSample: materials.slice(0, 3)
                                };
                            }
                        }
                    }

                    // Check building layer styles (walls and roofs)
                    const wallLayer = map?.getLayer('3d-buildings');
                    const roofLayer = map?.getLayer('3d-buildings-roof');

                    return {
                        hasMap: !!map,
                        center: map?.getCenter(),
                        zoom: map?.getZoom(),
                        pitch: map?.getPitch(),
                        bearing: map?.getBearing(),
                        renderStats: impl?._lastRenderInfo,
                        totalRenderCalls: impl?._renderCalls,
                        buildingStyles: {
                            wallColor: wallLayer ? map.getPaintProperty('3d-buildings', 'fill-extrusion-color') : null,
                            wallOpacity: wallLayer ? map.getPaintProperty('3d-buildings', 'fill-extrusion-opacity') : null,
                            roofColor: roofLayer ? map.getPaintProperty('3d-buildings-roof', 'fill-extrusion-color') : null,
                            roofOpacity: roofLayer ? map.getPaintProperty('3d-buildings-roof', 'fill-extrusion-opacity') : null
                        },
                        characters
                    };
                })()
            `,
            returnByValue: true
        });

        console.log('[Critic] Scene Audit Details:\n', JSON.stringify(sceneAudit.result?.value, null, 2));

        // 4. Capture required primary screenshot
        console.log('[Critic] Capturing primary canvas screenshot...');
        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true
        });

        fs.mkdirSync(path.dirname(targetScreenshotPath), { recursive: true });
        fs.writeFileSync(targetScreenshotPath, Buffer.from(screenshot.data, 'base64'));
        console.log(`[Critic] Saved primary screenshot to ${targetScreenshotPath} (${Math.round(screenshot.data.length * 0.75 / 1024)} KB)`);

        // Also save to current session artifact directory for embedding in walkthrough
        const artifactPath = path.join(currentArtifactDir, 'actual_maplibre_canvas.png');
        fs.writeFileSync(artifactPath, Buffer.from(screenshot.data, 'base64'));
        console.log(`[Critic] Also saved to current artifact path: ${artifactPath}`);

        // 5. Capture close-up on Cafe Sloy with Nastya and Lera
        console.log('[Critic] Moving camera to close-up on Cafe Sloy and capturing detail shot...');
        await send('Runtime.evaluate', {
            expression: `
                (() => {
                    const map = window.__map;
                    if (map) {
                        map.jumpTo({
                            center: [30.3122, 59.96115],
                            zoom: 18.5,
                            pitch: 60,
                            bearing: 45
                        });
                    }
                })()
            `
        });
        await new Promise(r => setTimeout(r, 2000));

        const detailScreenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true
        });
        const detailPath = path.join(currentArtifactDir, 'detail_cafe_sloy_close.png');
        fs.writeFileSync(detailPath, Buffer.from(detailScreenshot.data, 'base64'));
        console.log(`[Critic] Saved detail close-up screenshot to ${detailPath}`);

        // Report console errors and exceptions
        console.log('[Critic] WebGL / Shader / Three.js Console Logs:');
        const relevantLogs = consoleLogs.filter(l => 
            l.type === 'error' || 
            l.type === 'warning' || 
            l.text.toLowerCase().includes('webgl') || 
            l.text.toLowerCase().includes('three') || 
            l.text.toLowerCase().includes('shader') ||
            l.text.toLowerCase().includes('gltf')
        );
        console.log(relevantLogs.length === 0 ? '  (None - 100% clean)' : relevantLogs);
        console.log('[Critic] Uncaught Exceptions:', exceptions.length === 0 ? '  (None - 0 exceptions)' : exceptions);

    } catch (err) {
        console.error('[Critic Error]', err);
    } finally {
        cleanup();
    }
}

main();
