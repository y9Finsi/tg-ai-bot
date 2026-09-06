import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9334;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_test_profile_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--use-gl=angle', '--enable-webgl',
        '--window-size=1440,900',
        'about:blank'
    ], { stdio: 'ignore' });

    // Wait for CDP to be ready
    let version = null;
    for (let i = 0; i < 30; i++) {
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
        console.error('Failed to connect to Chrome CDP');
        process.exit(1);
    }

    // Get list of targets
    const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            callbacks.get(msg.id)(msg.result, msg.error);
            callbacks.delete(msg.id);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            console.log('[BROWSER CONSOLE]', msg.params.type, ...msg.params.args.map(a => a.value || a.description));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
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

    // Get master key from .env
    const envContent = fs.readFileSync('.env', 'utf8');
    const keyMatch = envContent.match(/ADMIN_WEB_KEY=([^\r\n]+)/);
    const adminKey = keyMatch ? keyMatch[1] : 'master_key';

    // Navigate to localhost:3000
    console.log('Navigating to http://localhost:3000...');
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1200));

    // Inject sessionStorage admin_key
    await send('Runtime.evaluate', {
        expression: `
            sessionStorage.setItem('admin_key', '${adminKey}');
            localStorage.setItem('admin_key', '${adminKey}');
            location.reload();
        `
    });
    await new Promise(r => setTimeout(r, 1800));

    // Click on "Карта СПб" tab
    console.log('Switching to Map tab...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
            if (mapBtn) mapBtn.click();
        `
    });

    // Wait for MapLibre WebGL and vector tiles to load
    await new Promise(r => setTimeout(r, 3500));

    // Inspect map status BEFORE clicking Lera
    const beforeClick = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const canvas = document.querySelector('.maplibregl-canvas');
                const markers = document.querySelectorAll('.maplibregl-marker');
                return {
                    hasCanvas: Boolean(canvas),
                    canvasWidth: canvas ? canvas.offsetWidth : 0,
                    canvasHeight: canvas ? canvas.offsetHeight : 0,
                    markersCount: markers.length
                };
            })()
        `,
        returnByValue: true
    });
    console.log('Before clicking Lera:', JSON.stringify(beforeClick.result.value, null, 2));

    // Click on Lera marker!
    console.log('Testing click on Lera avatar...');
    const clickResult = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const leraContainer = document.querySelector('.sims-lera-container');
                if (leraContainer) {
                    leraContainer.click();
                    return { clicked: true, found: true };
                }
                return { clicked: false, found: false };
            })()
        `,
        returnByValue: true
    });
    console.log('Lera Click result:', JSON.stringify(clickResult.result.value, null, 2));

    await new Promise(r => setTimeout(r, 1000));

    // Inspect map status AFTER clicking Lera
    const afterClick = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const canvas = document.querySelector('.maplibregl-canvas');
                const banner = document.querySelector('.animate-in');
                const leraRing = document.querySelector('.lera-ring:not(.hidden)');
                return {
                    hasCanvas: Boolean(canvas),
                    canvasWidth: canvas ? canvas.offsetWidth : 0,
                    canvasHeight: canvas ? canvas.offsetHeight : 0,
                    leraSelectedBanner: Boolean(banner),
                    leraRingActive: Boolean(leraRing)
                };
            })()
        `,
        returnByValue: true
    });
    console.log('After clicking Lera (MAP DISAPPEAR CHECK):', JSON.stringify(afterClick.result.value, null, 2));

    // Capture screenshot
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/actual_maplibre_3d_state.png', Buffer.from(screenshot.data, 'base64'));
    console.log('Screenshot saved to /tmp/actual_maplibre_3d_state.png');

    chrome.kill();
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
}

main().catch(console.error);
