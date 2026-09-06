import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9333;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_test_profile_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--enable-webgl',
        '--window-size=1440,900', 'about:blank'
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

    // First navigate to login endpoint or set cookie
    await send('Network.setCookie', {
        name: 'admin_session',
        value: 'valid',
        domain: 'localhost',
        path: '/'
    });

    // Navigate to localhost:3000
    console.log('Navigating to http://localhost:3000...');
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));

    // Inject sessionStorage admin_key
    await send('Runtime.evaluate', {
        expression: `
            sessionStorage.setItem('admin_key', '${adminKey}');
            localStorage.setItem('admin_key', '${adminKey}');
            location.reload();
        `
    });
    await new Promise(r => setTimeout(r, 2000));

    // Check what is rendered
    const titleRes = await send('Runtime.evaluate', {
        expression: `document.title`
    });
    console.log('Document title:', titleRes.result.value);

    // Click on "Карта СПб" tab
    console.log('Switching to Map tab...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
            if (mapBtn) {
                mapBtn.click();
                console.log('Clicked Map Tab!');
            } else {
                console.log('Map button NOT found. Found buttons:', buttons.map(b => b.textContent.trim()));
            }
        `
    });

    await new Promise(r => setTimeout(r, 2000));

    // Check map container and MapLibre canvas
    const mapInspect = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const maplibreMap = document.querySelector('.maplibregl-map');
                const canvas = document.querySelector('.maplibregl-canvas');
                const friendPins = document.querySelectorAll('.zenly-friend-marker-anchor');
                const placePins = document.querySelectorAll('.zenly-place-marker-anchor');
                return {
                    hasMaplibreMap: Boolean(maplibreMap),
                    hasCanvas: Boolean(canvas),
                    canvasWidth: canvas ? canvas.offsetWidth : 0,
                    canvasHeight: canvas ? canvas.offsetHeight : 0,
                    friendPinsCount: friendPins.length,
                    placePinsCount: placePins.length,
                    bodyHtmlLength: document.body.innerHTML.length
                };
            })()
        `,
        returnByValue: true
    });
    console.log('Map Inspection:', JSON.stringify(mapInspect.result.value, null, 2));

    // Capture screenshot
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/actual_browser_state.png', Buffer.from(screenshot.data, 'base64'));
    console.log('Screenshot saved to /tmp/actual_browser_state.png');

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);
