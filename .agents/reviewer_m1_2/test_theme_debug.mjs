import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9338;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_theme_debug_' + Date.now();
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
    const consoleLogs = [];

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            callbacks.get(msg.id)(msg.result, msg.error);
            callbacks.delete(msg.id);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
            consoleLogs.push(`[${msg.params.type}] ${text}`);
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
    await new Promise(r => setTimeout(r, 1200));

    await send('Runtime.evaluate', {
        expression: `
            sessionStorage.setItem('admin_key', '${adminKey}');
            localStorage.setItem('admin_key', '${adminKey}');
            location.reload();
        `
    });
    await new Promise(r => setTimeout(r, 2000));

    // Click "Карта СПб"
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
            if (mapBtn) mapBtn.click();
        `
    });

    // Wait until map is ready
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 200));
        const check = await send('Runtime.evaluate', {
            expression: `Boolean(window.__map && window.__mapLoaded && window.__map.getLayer('3d-buildings'))`,
            returnByValue: true
        });
        if (check.result.value) break;
    }

    // List all buttons on map view
    const buttonsInfo = await send('Runtime.evaluate', {
        expression: `
            Array.from(document.querySelectorAll('button')).map(b => ({
                text: b.textContent.trim(),
                title: b.title,
                classes: b.className
            }))
        `,
        returnByValue: true
    });
    console.log('Available buttons on Map View:', JSON.stringify(buttonsInfo.result.value, null, 2));

    // Inspect map before click
    const beforeDay = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const map = window.__map;
                return {
                    pattern: map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern'),
                    styleUrl: map.getStyle().sprite
                };
            })()
        `,
        returnByValue: true
    });
    console.log('Before Day click:', beforeDay.result.value);

    // Find button with title 'Дневное освещение' or text 'День'
    const clickDay = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.title === 'Дневное освещение' || b.textContent.trim() === 'День');
                if (btn) {
                    btn.click();
                    return { clicked: true, text: btn.textContent, title: btn.title };
                }
                return { clicked: false };
            })()
        `,
        returnByValue: true
    });
    console.log('Click Day result:', clickDay.result.value);

    // Wait for React state update and map style change
    console.log('Waiting 5s for Day style to settle...');
    await new Promise(r => setTimeout(r, 5000));

    const afterDay = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const map = window.__map;
                const bLayer = map.getLayer('3d-buildings');
                const divLayer = map.getLayer('road-dividing-lines');
                const zebraLayer = map.getLayer('road-crosswalk-stripes');
                const style = map.getStyle();
                const layerIds = style ? style.layers.map(l => l.id) : [];
                const bIdx = layerIds.indexOf('3d-buildings');
                const divIdx = layerIds.indexOf('road-dividing-lines');
                const zebraIdx = layerIds.indexOf('road-crosswalk-stripes');
                return {
                    pattern: bLayer ? map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern') : null,
                    hasDividing: Boolean(divLayer),
                    hasZebra: Boolean(zebraLayer),
                    bIdx,
                    divIdx,
                    zebraIdx,
                    roadUnderBuildings: (divIdx < bIdx && zebraIdx < bIdx),
                    hasImageDay: map.hasImage('spb-facade-day'),
                    hasImageSunset: map.hasImage('spb-facade-sunset'),
                    hasImageNight: map.hasImage('spb-facade-night')
                };
            })()
        `,
        returnByValue: true
    });
    console.log('After Day click audit:', afterDay.result.value);
    console.log('Console logs during test:\n', consoleLogs.join('\n'));

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
