import { spawn } from 'child_process';
import fs from 'fs';

async function test() {
    const port = 9342;
    const tmp = '/tmp/c_' + Date.now();
    const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless=new',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + tmp,
        '--no-first-run', '--use-gl=angle', '--enable-webgl',
        'about:blank'
    ]);
    await new Promise(r => setTimeout(r, 1000));
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    let id = 1;
    const send = (m, p={}) => new Promise((res, rej) => {
        const i = id++;
        const h = (e) => {
            const d = JSON.parse(e.data);
            if (d.id === i) { ws.removeEventListener('message', h); res(d.result); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: i, method: m, params: p }));
    });
    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable');
    await send('Page.enable');
    const adminKey = fs.readFileSync('.env', 'utf8').match(/ADMIN_WEB_KEY=([^\r\n]+)/)[1];
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1200));
    await send('Runtime.evaluate', { expression: `sessionStorage.setItem('admin_key', '${adminKey}'); location.reload();` });
    await new Promise(r => setTimeout(r, 1800));
    await send('Runtime.evaluate', { expression: `document.querySelectorAll('button')[1].click();` }); // Карта СПб
    await new Promise(r => setTimeout(r, 3000));
    
    // Check initial
    const init = await send('Runtime.evaluate', {
        expression: `window.__map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern')`,
        returnByValue: true
    });
    console.log('Initial pattern:', init.result.value);

    // Click Sunset button
    const clickSunset = await send('Runtime.evaluate', {
        expression: `(() => {
            const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Закат');
            if (!b) return 'Button not found';
            b.click();
            return 'Clicked: ' + b.textContent;
        })()`,
        returnByValue: true
    });
    console.log('Click result:', clickSunset.result.value);

    // Wait 5s
    await new Promise(r => setTimeout(r, 5000));
    const afterSunset = await send('Runtime.evaluate', {
        expression: `(() => {
            const map = window.__map;
            return {
                pattern: map.getPaintProperty('3d-buildings', 'fill-extrusion-pattern'),
                images: {
                    day: map.hasImage('spb-facade-day'),
                    sunset: map.hasImage('spb-facade-sunset'),
                    night: map.hasImage('spb-facade-night')
                },
                bIdx: map.getStyle().layers.findIndex(l => l.id === '3d-buildings'),
                divIdx: map.getStyle().layers.findIndex(l => l.id === 'road-dividing-lines')
            };
        })()`,
        returnByValue: true
    });
    console.log('After Sunset result:', afterSunset.result.value);

    chrome.kill();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}
test().catch(console.error);
