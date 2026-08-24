import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = file => {
    if (file === 'admin-v2/src/main.jsx') {
        const srcDir = fileURLToPath(new URL('admin-v2/src', root));
        const collect = dir => {
            let out = '';
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) out += collect(full);
                else if (item.name.endsWith('.jsx') || item.name.endsWith('.js')) {
                    out += fs.readFileSync(full, 'utf8') + '\n';
                }
            }
            return out;
        };
        return collect(srcDir);
    }
    return fs.readFileSync(file, 'utf8');
};

test('admin P1 routes each operational domain into an explicit workspace class', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /content-super-container admin-domain-page/);
    assert.match(source, /crm-super-container admin-domain-page/);
    assert.match(source, /simulation-super-container admin-domain-page/);
});

test('admin P2 keeps the shared interaction and responsive contracts', () => {
    const css = read('admin-v2/src/feature-components.css');
    const source = read('admin-v2/src/main.jsx');

    assert.doesNotMatch(css, /transition\s*:\s*all/);
    assert.doesNotMatch(source, /transition-all/);
    assert.match(css, /:where\(button\):focus-visible/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /@media \(max-width: 460px\)/);
    assert.match(css, /scrollbar-gutter: stable/);
    assert.match(css, /min-height: 36px/);
});

test('admin cleanup uses the canonical design system and semantic states', () => {
    const css = read('admin-v2/src/design-system.css');
    const source = read('admin-v2/src/main.jsx');
    const button = read('admin-v2/src/components/ui/button.jsx');
    const badge = read('admin-v2/src/components/ui/badge.jsx');

    assert.match(css, /--admin-canvas:/);
    assert.match(css, /--admin-accent:/);
    assert.match(css, /\.admin-badge-success/);
    assert.match(css, /\.toast-v2-error/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(button, /admin-button/);
    assert.match(badge, /admin-badge/);
});

test('admin P3 splits node_modules into a vendor chunk', () => {
    const vite = read('admin-v2/vite.config.js');

    assert.match(vite, /manualChunks\(id\)/);
    assert.match(vite, /id\.includes\('node_modules'\) \? 'vendor' : undefined/);
});

test('admin diary and operational views share the diary header contract', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /Header/);
    assert.match(css, /\.diary-shell \.v2-header h1,\s*\.diary-shell \.diary-page-heading h1/);
    assert.match(css, /\.diary-shell \.v2-header p,\s*\.diary-shell \.diary-page-heading p/);
});

test('current decision keeps its content in a vertical, readable state panel', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /CurrentDecision/);
    assert.match(css, /\.diary-shell \.diary-home > \.needs-card \{\s*display: flex !important;\s*flex-direction: column/);
    assert.match(css, /\.diary-shell \.decision-compact-card \{\s*display: grid !important/);
});

test('kanban buttons have a stable full-width card layout and diary palette', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /KanbanBoard/);
    assert.match(css, /\.diary-shell \.kanban-item \{\s*display: flex !important/);
    assert.match(css, /width: 100% !important;\s*min-width: 0 !important;\s*min-height: 0 !important;/);
    assert.match(css, /\.diary-shell \.kanban-item-active \.progress i \{\s*background: var\(--diary-accent\)/);
});
