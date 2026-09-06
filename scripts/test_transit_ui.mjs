import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9334;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_transit_test_' + Date.now();
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
    const adminKey = keyMatch ? keyMatch[1] : 'master_key';

    await send('Network.setCookie', {
        name: 'admin_session',
        value: 'valid',
        domain: 'localhost',
        path: '/'
    });

    console.log('Navigating to http://localhost:3000...');
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
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
            if (mapBtn) mapBtn.click();
        `
    });
    await new Promise(r => setTimeout(r, 2000));

    // Click on "Места (14)" button to open catalog
    console.log('Opening Places catalog...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const catalogBtn = buttons.find(b => b.textContent.includes('Места'));
            if (catalogBtn) catalogBtn.click();
        `
    });
    await new Promise(r => setTimeout(r, 1000));

    const catalogScreenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/catalog_modal_state.png', Buffer.from(catalogScreenshot.data, 'base64'));
    console.log('Saved /tmp/catalog_modal_state.png');

    // Click on Cafe Sloy in the list to select route
    console.log('Selecting Cafe Sloy for routing...');
    await send('Runtime.evaluate', {
        expression: `
            const items = Array.from(document.querySelectorAll('div'));
            const sloy = items.find(d => d.textContent.includes('Кофейня «Слой»') && d.querySelector('button, .cursor-pointer, .group'));
            if (sloy) {
                sloy.click();
            } else {
                // fallback: click any element containing «Слой»
                const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent === 'Кофейня «Слой»');
                if (el) el.click();
            }
        `
    });
    await new Promise(r => setTimeout(r, 1500));

    const transitDrawerScreenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/transit_drawer_state.png', Buffer.from(transitDrawerScreenshot.data, 'base64'));
    console.log('Saved /tmp/transit_drawer_state.png');

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);
