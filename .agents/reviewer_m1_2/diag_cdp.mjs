import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9336;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_diag_' + Date.now();
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

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) break;
        } catch (e) {}
    }

    const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();
    const logs = [];

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            callbacks.get(msg.id)(msg.result, msg.error);
            callbacks.delete(msg.id);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
            logs.push(`[CONSOLE ${msg.params.type}] ${text}`);
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            logs.push(`[EXCEPTION] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description || ''}`);
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

    const envContent = fs.readFileSync('.env', 'utf8');
    const keyMatch = envContent.match(/ADMIN_WEB_KEY=([^\r\n]+)/);
    const adminKey = keyMatch ? keyMatch[1] : 'master_key';

    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));

    await send('Runtime.evaluate', {
        expression: `
            sessionStorage.setItem('admin_key', '${adminKey}');
            localStorage.setItem('admin_key', '${adminKey}');
            location.reload();
        `
    });
    await new Promise(r => setTimeout(r, 2500));

    const pageInfo = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
                return {
                    url: location.href,
                    title: document.title,
                    buttons,
                    hasMap: Boolean(window.__map),
                    hasCanvas: Boolean(document.querySelector('.maplibregl-canvas')),
                    rootHtml: document.getElementById('root')?.innerHTML?.slice(0, 300)
                };
            })()
        `,
        returnByValue: true
    });

    console.log('Page state before click:', JSON.stringify(pageInfo.result.value, null, 2));

    // Try clicking map tab
    const clickRes = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
                if (mapBtn) {
                    mapBtn.click();
                    return { clicked: true, text: mapBtn.textContent };
                }
                return { clicked: false, allButtons: buttons.map(b => b.textContent) };
            })()
        `,
        returnByValue: true
    });
    console.log('Click result:', JSON.stringify(clickRes.result.value, null, 2));

    await new Promise(r => setTimeout(r, 4000));

    const afterClick = await send('Runtime.evaluate', {
        expression: `
            (() => {
                return {
                    hasMap: Boolean(window.__map),
                    mapLoaded: window.__mapLoaded,
                    mapError: window.__mapError,
                    mapErrors: window.__mapErrors,
                    canvas: Boolean(document.querySelector('.maplibregl-canvas')),
                    windowKeys: Object.keys(window).filter(k => k.startsWith('__'))
                };
            })()
        `,
        returnByValue: true
    });
    console.log('After click state:', JSON.stringify(afterClick.result.value, null, 2));
    console.log('Logs collected:\n' + logs.join('\n'));

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
