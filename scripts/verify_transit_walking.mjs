import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9337;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_zenly_walk_' + Date.now();
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

    console.log('1. Navigating...');
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

    // Click pin (if at cafe_sloy, click petrogradka_home; otherwise click cafe_sloy)
    console.log('2. Clicking target pin...');
    await send('Runtime.evaluate', {
        expression: `
            const pins = Array.from(document.querySelectorAll('.zenly-place-marker-anchor'));
            const target = pins.find(p => p.textContent.includes('Дом')) || pins.find(p => p.textContent.includes('СПбГИК'));
            if (target) (target.querySelector('div') || target).click();
        `
    });
    await new Promise(r => setTimeout(r, 1200));

    // Click "Идти" button
    console.log('3. Clicking [🚶‍♀️ Идти] button...');
    const walkClick = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const walkBtn = buttons.find(b => b.textContent.includes('Идти'));
                if (walkBtn) {
                    walkBtn.click();
                    return { clicked: true };
                }
                return { clicked: false, availableButtons: buttons.map(b => b.textContent.trim()) };
            })()
        `,
        returnByValue: true
    });
    console.log('Walk click result:', walkClick.result.value);
    await new Promise(r => setTimeout(r, 1500));

    // Click on Lera's friend pin to open her bottom sheet with transit progress bar
    console.log('4. Clicking on Lera pin to check transit status...');
    await send('Runtime.evaluate', {
        expression: `
            (() => {
                const leraBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Лера'));
                if (leraBtn) leraBtn.click();
            })()
        `
    });
    await new Promise(r => setTimeout(r, 1200));

    const shotWalk = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/zenly_walking_state.png', Buffer.from(shotWalk.data, 'base64'));
    console.log('5. Saved /tmp/zenly_walking_state.png');

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(console.error);
