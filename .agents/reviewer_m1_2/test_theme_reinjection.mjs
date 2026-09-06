import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
    const port = 9337;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = '/tmp/chrome_theme_test_' + Date.now();
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
    const mapErrors = [];

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

    // Click on "Карта СПб"
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const mapBtn = buttons.find(b => b.textContent.includes('Карта СПб'));
            if (mapBtn) mapBtn.click();
        `
    });

    // Wait until window.__map and style is ready
    let mapReady = false;
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 200));
        const check = await send('Runtime.evaluate', {
            expression: `Boolean(window.__map && window.__mapLoaded && window.__map.getLayer('3d-buildings'))`,
            returnByValue: true
        });
        if (check.result.value) {
            mapReady = true;
            break;
        }
    }

    if (!mapReady) {
        console.error('Map failed to become ready initially');
        chrome.kill();
        process.exit(1);
    }

    console.log('Map is ready! Testing initial Night state...');

    const getAudit = async () => {
        const audit = await send('Runtime.evaluate', {
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
                    const pattern = bLayer ? map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern') : null;
                    return {
                        has3dBuildings: Boolean(bLayer),
                        hasDividing: Boolean(divLayer),
                        hasZebra: Boolean(zebraLayer),
                        pattern,
                        bIdx,
                        divIdx,
                        zebraIdx,
                        roadUnderBuildings: (divIdx < bIdx && zebraIdx < bIdx)
                    };
                })()
            `,
            returnByValue: true
        });
        return audit.result.value;
    };

    const initialAudit = await getAudit();
    console.log('Initial Audit (Night):', initialAudit);

    // Click "День" button
    console.log('Switching to Day theme...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const dayBtn = buttons.find(b => b.textContent.includes('День'));
            if (dayBtn) dayBtn.click();
        `
    });

    // Wait for style reload and theme re-injection
    await new Promise(r => setTimeout(r, 3000));
    const dayAudit = await getAudit();
    console.log('Day Theme Audit:', dayAudit);

    // Click "Закат" button
    console.log('Switching to Sunset theme...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const sunsetBtn = buttons.find(b => b.textContent.includes('Закат'));
            if (sunsetBtn) sunsetBtn.click();
        `
    });

    await new Promise(r => setTimeout(r, 1500));
    const sunsetAudit = await getAudit();
    console.log('Sunset Theme Audit:', sunsetAudit);

    // Click "Ночь" button
    console.log('Switching back to Night theme...');
    await send('Runtime.evaluate', {
        expression: `
            const buttons = Array.from(document.querySelectorAll('button'));
            const nightBtn = buttons.find(b => b.textContent.includes('Ночь'));
            if (nightBtn) nightBtn.click();
        `
    });

    await new Promise(r => setTimeout(r, 3000));
    const nightAudit2 = await getAudit();
    console.log('Night Theme Audit (after roundtrip):', nightAudit2);

    chrome.kill();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const passes = 
        initialAudit.roadUnderBuildings &&
        dayAudit.roadUnderBuildings &&
        sunsetAudit.roadUnderBuildings &&
        nightAudit2.roadUnderBuildings &&
        dayAudit.pattern === 'spb-facade-day' &&
        sunsetAudit.pattern === 'spb-facade-sunset' &&
        nightAudit2.pattern === 'spb-facade-night';

    if (passes) {
        console.log('THEME RE-INJECTION AND LAYER ORDERING VERIFIED ACROSS ALL THEMES!');
        process.exit(0);
    } else {
        console.error('THEME RE-INJECTION CHECK FAILED!');
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
