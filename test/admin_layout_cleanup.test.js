import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('admin-v2/src/design-system.css', 'utf8');
const featureCss = fs.readFileSync('admin-v2/src/feature-components.css', 'utf8');

test('admin layout has one six-track desktop grid contract', () => {
    assert.match(css, /--admin-grid-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /\.needs-compact-grid,\s*\.stat-grid,/);
    assert.match(css, /grid-template-columns:\s*var\(--admin-grid-columns\)\s*!important/);
    assert.match(css, /@media \(max-width: 1100px\)/);
    assert.match(css, /@media \(max-width: 760px\)/);
    assert.match(css, /@media \(max-width: 520px\)/);
});

test('feature containers do not override the shared grid contract at runtime', () => {
    assert.match(css, /html\.dark \.diary-shell \.bento-left \{\s*display:\s*flex/s);
    assert.match(css, /html\.dark \.diary-shell \.kanban-board \{\s*display:\s*grid/s);
    assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*!important/);
    assert.match(css, /html\.dark \.diary-shell \.ui-card-frameless \{/);
});

test('admin layout uses shared spacing, gutter, surfaces and control geometry', () => {
    assert.match(css, /--admin-workspace-gutter:\s*clamp\(16px,\s*3vw,\s*32px\)/);
    assert.match(css, /--admin-grid-gap:\s*var\(--admin-space-4\)/);
    assert.match(css, /--admin-card-padding:\s*var\(--admin-space-4\)/);
    assert.match(css, /padding:\s*var\(--admin-card-padding\)\s*!important/);
    assert.match(css, /border-radius:\s*var\(--admin-radius-lg\)\s*!important/);
    assert.match(css, /min-height:\s*var\(--admin-control\)/);
});

test('admin layout maps legacy color hooks to semantic diary tokens', () => {
    assert.match(css, /\.ui-badge-blue,\s*\.badge-blue,\s*\.stat-blue,\s*\.bento-icon-blue,\s*\.npc-blue/);
    assert.match(css, /background:\s*var\(--admin-surface-3\)\s*!important/);
    assert.doesNotMatch(css, /#6366f1|#a855f7|#60a5fa|rgba\(96,165,250/);
});

test('legacy styles.css is physically removed from the admin source tree', () => {
    assert.equal(fs.existsSync('admin-v2/src/styles.css'), false);
    assert.match(featureCss, /\.kanban-board/);
});
