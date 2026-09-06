import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9336;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_zenly_full_' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--enable-webgl',
        '--window-size=1440,900', 'about:blank'
    ], { stdio: 'ignore' });

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

    const envContent = fs.readFileSync('.env', 'utf8');
    const keyMatch = envContent.match(/ADMIN_WEB_KEY=([^\r\n]+)/);
    const adminKey = keyMatch ? keyMatch[1].trim() : 'master_key';

    await send('Network.setCookie', {
        name: 'admin_session',
        value: 'valid',
        domain: 'localhost',
        path: '/'
    });

    console.log('1. Navigating to localhost:3000...');
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));

    await send('Runtime.evaluate', {
        expression: `
            sessionStorage.setItem('admin_key', '${adminKey}');
            localStorage.setItem('admin_key', '${adminKey}');
            location.reload();
        `
    });
    await new Promise(r => setTimeout(r, 2000));

    // Switch to Map tab
    console.log('2. Switching to Map tab...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
            if (mapBtn) mapBtn.click();
        `
    });
    await new Promise(r => setTimeout(r, 2000));

    // Inspect place pins
    const pinsInspect = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const pins = Array.from(document.querySelectorAll('.zenly-place-marker-anchor'));
                return pins.map(p => p.textContent.trim());
            })()
        `,
        returnByValue: true
    });
    console.log('3. Found place pins:', pinsInspect.result.value);

    // Click on Cafe Sloy pin to open Transit drawer
    console.log('4. Clicking Cafe Sloy pin...');
    const clickResult = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const pins = Array.from(document.querySelectorAll('.zenly-place-marker-anchor'));
                const sloy = pins.find(p => p.textContent.includes('Слой'));
                if (sloy) {
                    const clickTarget = sloy.querySelector('div') || sloy;
                    clickTarget.click();
                    return { success: true, text: sloy.textContent.trim() };
                }
                return { success: false };
            })()
        `,
        returnByValue: true
    });
    console.log('Click result:', clickResult.result.value);
    await new Promise(r => setTimeout(r, 1200));

    // Capture transit drawer screenshot
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/zenly_transit_drawer.png', Buffer.from(shot1.data, 'base64'));
    console.log('5. Saved /tmp/zenly_transit_drawer.png');

    // Inspect drawer content
    const drawerInspect = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const drawer = document.querySelector('.animate-in');
                const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
                return {
                    hasDrawer: Boolean(drawer),
                    drawerText: drawer ? drawer.innerText.slice(0, 300) : null,
                    buttons
                };
            })()
        `,
        returnByValue: true
    });
    console.log('6. Drawer Inspection:', drawerInspect.result.value);

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);
