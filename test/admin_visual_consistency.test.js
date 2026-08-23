import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('admin-v2/src/design-system.css', 'utf8');

test('admin visual system exposes one typography scale and semantic palette', () => {
    for (const token of [
        '--admin-font-size-xs',
        '--admin-font-size-sm',
        '--admin-font-size-md',
        '--admin-font-size-lg',
        '--admin-font-size-xl',
        '--admin-font-size-2xl',
        '--admin-leading-tight',
        '--admin-leading-normal',
        '--admin-tracking-heading',
    ]) {
        assert.match(css, new RegExp(`${token}:`));
    }

    for (const token of [
        '--admin-text',
        '--admin-text-muted',
        '--admin-text-subtle',
        '--admin-surface-1',
        '--admin-surface-2',
        '--admin-surface-3',
        '--admin-success',
        '--admin-warning',
        '--admin-danger',
    ]) {
        assert.match(css, new RegExp(`${token}:`));
    }
});

test('shared headings, controls, cards and badges consume canonical tokens', () => {
    assert.match(css, /\.diary-shell :where\(\.v2-header h1, \.diary-page-heading h1/);
    assert.match(css, /font-size: var\(--admin-font-size-2xl\) !important/);
    assert.match(css, /padding: var\(--admin-card-padding\) !important/);
    assert.match(css, /padding: var\(--admin-space-2\) var\(--admin-space-3\) !important/);
    assert.match(css, /font-size: var\(--admin-font-size-xs\) !important/);
    assert.match(css, /background: var\(--admin-surface-3\) !important/);
});

test('kanban uses the same six-track desktop contract and responsive collapse', () => {
    assert.match(css, /\.diary-shell :where\(\.kanban-board\) \{\s*grid-template-columns: var\(--admin-grid-columns\)/);
    assert.match(css, /@media \(max-width: 1100px\) \{\s*\.diary-shell :where\(\.kanban-board\)/s);
    assert.match(css, /@media \(max-width: 760px\) \{\s*\.diary-shell :where\(\.kanban-board\)/s);
    assert.match(css, /@media \(max-width: 520px\) \{\s*\.diary-shell :where\(\s*\.v2-header h1/);
});

test('canonical interaction layer avoids global transition and old theme colors', () => {
    const canonical = css.slice(css.indexOf('Canonical typography'));

    assert.doesNotMatch(canonical, /transition\s*:\s*all/);
    assert.doesNotMatch(canonical, /#6366f1|#a855f7|#60a5fa|#c084fc|#f472b6/);
});
