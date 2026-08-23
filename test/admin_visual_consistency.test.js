import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('admin-v2/src/design-system.css', 'utf8');
const featureCss = fs.readFileSync('admin-v2/src/feature-components.css', 'utf8');

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
    assert.match(css, /html\.dark \.diary-shell \.kanban-board \{\s*display:\s*grid/s);
    assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*!important/);
    assert.match(css, /html\.dark \.diary-shell \.diary-home \.kanban-item \{\s*display:\s*grid\s*!important/s);
    assert.match(css, /html\.dark \.diary-shell \.diary-home \.kanban-item > \* \{\s*min-width:\s*0\s*!important/s);
    assert.doesNotMatch(css, /\.diary-shell :where\(\.kanban-board\)\s*\{\s*grid-template-columns:\s*var\(--admin-grid-columns\)/s);
    assert.match(css, /@media \(max-width: 1180px\) \{\s*html\.dark \.diary-shell \.kanban-board/s);
    assert.match(css, /@media \(max-width: 760px\) \{\s*html\.dark \.diary-shell \.kanban-board/s);
    assert.match(css, /@media \(max-width: 520px\) \{\s*\.diary-shell :where\(\s*\.v2-header h1/);
});

test('canonical interaction layer avoids global transition and old theme colors', () => {
    const canonical = css.slice(css.indexOf('Canonical typography'));

    assert.doesNotMatch(canonical, /transition\s*:\s*all/);
    assert.doesNotMatch(canonical, /#6366f1|#a855f7|#60a5fa|#c084fc|#f472b6/);
    assert.match(canonical, /\.schedule-detail/);
    assert.match(canonical, /background: var\(--admin-surface-3\) !important/);
});

test('all repeated admin card grids share the six-track contract', () => {
    for (const selector of [
        '.stat-grid',
        '.summary-grid',
        '.decision-summary',
        '.profile-window',
        '.diagnostic-grid',
        '.crm-metrics-grid',
        '.inventory-items-grid',
        '.photos-card-grid',
        '.topic-cards-grid',
        '.prompt-modules-grid',
    ]) {
        assert.match(css, new RegExp(`${selector.replace('.', '\\.')}[\\s,\\)]`));
    }

    assert.match(css, /grid-template-columns: var\(--admin-grid-columns\) !important/);
});

test('legacy runtime overrides cannot reintroduce blue accents or four-track primary boards', () => {
    assert.ok(css.includes('--primary: var(--admin-accent);'));
    assert.match(css, /\.crm-filter-btn\.active/);
    assert.match(css, /\.photo-file-button/);
    assert.match(css, /\.kanban-active \.kanban-item/);
    assert.doesNotMatch(featureCss, /\/\* 4-COLUMN KANBAN BOARD \*\//);
    assert.doesNotMatch(featureCss, /\/\* 4-COLUMN BENTO ROW/);
    assert.doesNotMatch(featureCss, /(?:\.kanban-board|kanban-board)[\s\S]{0,420}grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)\s*!important/);
});

test('mobile topbar gives the tablist its own non-overlapping row', () => {
    assert.match(featureCss, /@media \(max-width: 760px\) \{\s*html\.dark \.diary-shell \.v2-topbar \{/s);
    assert.match(featureCss, /grid-template-areas:\s*"brand status"\s*"tabs tabs"/s);
    assert.match(featureCss, /html\.dark \.diary-shell \.v2-topbar \.diary-tabs-root \{\s*grid-area: tabs/s);
    assert.match(featureCss, /html\.dark \.diary-shell \.v2-topbar \.diary-tabbar \{\s*width: 100% !important/s);
    assert.match(css, /html\.dark \.diary-shell \.v2-content\.diary-home \{\s*display:\s*flex !important/s);
    assert.match(css, /html\.dark \.diary-shell \.diary-home \.needs-compact-grid \{\s*grid-template-columns:\s*minmax\(0,\s*1fr\) !important/s);
});

test('runtime feature states stay in the monochrome canonical palette', () => {
    assert.match(featureCss, /html\.dark \.diary-shell \.diary-home \.kanban-item-active \.progress \{\s*background: var\(--admin-surface-3\) !important/s);
    assert.match(featureCss, /html\.dark \.diary-shell \.studio-workspace-tabs > \[role="tablist"\] \[role="tab"\]\[data-state="active"\]/s);
});

test('wide-screen tabs share one workspace frame and card padding', () => {
    assert.match(css, /html\.dark \.diary-shell :where\(\s*\.admin-domain-page,/s);
    assert.match(css, /padding-inline: 0 !important/);
    assert.match(css, /html\.dark \.diary-shell :where\(\.studio-workspace\)/s);
    assert.match(css, /html\.dark \.diary-shell :where\(\.ui-card, \[data-slot="card"\]\)/s);
    assert.match(css, /padding-inline: var\(--admin-card-padding\) !important/);
});

test('diary home resets the legacy grid shorthand on wide screens', () => {
    assert.match(css, /html\.dark \.diary-shell \.v2-content\.diary-home \{\s*display:\s*grid !important;\s*grid:\s*none !important;\s*grid-template-columns:\s*minmax\(0,\s*1fr\) !important/s);
    assert.match(css, /grid-template-rows:\s*none !important/);
    assert.match(css, /grid-template-areas:\s*none !important/);
    assert.match(css, /html\.dark \.diary-shell \.v2-content\.diary-home > \* \{\s*grid-area:\s*auto !important;\s*grid-column:\s*auto !important;\s*grid-row:\s*auto !important/s);
});

test('legacy feature accents resolve to the canonical neutral palette', () => {
    assert.match(css, /--blue:\s*var\(--admin-info\)\s*!important/);
    assert.match(css, /--purple:\s*var\(--admin-text-muted\)\s*!important/);
    assert.match(css, /html\.dark \.diary-shell :is\(\s*\.bento-location-sub/s);
    assert.match(css, /\.sandbox-result-bubble/);
    assert.match(css, /background:\s*var\(--admin-surface-2\)\s*!important/);
});

test('primary controls cannot reintroduce blue or purple gradients', () => {
    assert.match(css, /html\.dark \.diary-shell :is\(\.ui-button-primary, \.admin-button\.bg-primary, \.photo-file-button\)/);
    assert.match(css, /background-image:\s*none\s*!important/);
    assert.match(css, /background:\s*var\(--admin-text\)\s*!important/);
    assert.match(css, /html\.dark \.login-screen :is\(\.ui-button-primary, \.admin-button\.bg-primary, \.photo-file-button\)/);
    assert.match(css, /html\.dark \.login-screen \.brand-mark/);
});
