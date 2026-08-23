import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');

test('admin P1 routes each operational domain into an explicit workspace class', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /`admin-view-\$\{view\}`/);
    assert.match(source, /content-super-container admin-domain-page/);
    assert.match(source, /crm-super-container admin-domain-page/);
    assert.match(source, /system-super-layout admin-domain-page/);
    assert.match(source, /system-card-danger/);
    assert.match(source, /system-card-expert/);
});

test('admin P2 keeps the shared interaction and responsive contracts', () => {
    const css = read('admin-v2/src/styles.css');
    const source = read('admin-v2/src/main.jsx');

    assert.doesNotMatch(css, /transition\s*:\s*all/);
    assert.doesNotMatch(source, /transition-all/);
    assert.match(css, /:where\(button\):focus-visible/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /@media \(max-width: 460px\)/);
    assert.match(css, /scrollbar-gutter: stable/);
    assert.match(css, /min-height: 36px/);
});

test('admin P3 splits node_modules into a vendor chunk', () => {
    const vite = read('admin-v2/vite.config.js');

    assert.match(vite, /manualChunks\(id\)/);
    assert.match(vite, /id\.includes\('node_modules'\) \? 'vendor' : undefined/);
});
