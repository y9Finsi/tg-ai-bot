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

test('root admin serves the React diary homepage while legacy admin remains isolated', () => {
    const server = read('src/server.js');
    assert.match(server, /app\.use\('\/legacy-admin', express\.static\(path\.join\(__dirname, '\.\.\/public\/admin'\)\)\)/);
    assert.match(server, /app\.use\(express\.static\(path\.join\(__dirname, '\.\.\/public\/admin-v2'\)/);
    assert.match(server, /app\.get\('\/', \(req, res\) =>/);
    assert.match(server, /public\/admin-v2\/index\.html/);
});

test('diary homepage composes the Figma frame from live needs and kanban data', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /NeedsPanel/);
    assert.match(source, /KanbanBoard/);
    assert.match(css, /grid-template-columns: 298px minmax\(0, 632px\)/);
    assert.match(css, /grid-template-areas:\s*"headline headline"\s*"needs needs"\s*"bento kanban"/);
    assert.match(css, /grid-template-rows: auto 123px auto/);
    assert.match(css, /\.diary-home > \.needs-card > \.needs-compact-grid \{[\s\S]*overflow-x: auto;/);
    assert.match(css, /\.diary-home > \.needs-card > \.needs-compact-grid \{[\s\S]*overflow-y: hidden;/);
    assert.match(css, /\.diary-home \.need-compact-item \{[\s\S]*flex: 1 0 140px;/);
    assert.match(css, /height: 123px/);
    assert.match(css, /grid-template-columns: 1fr 1fr/);
    assert.match(css, /grid-template-rows: 190px 110px 120px/);
    assert.match(css, /\.diary-tabbar button\[data-state="active"\]/);
    assert.match(css, /\.diary-tabs-root \{\s+position: sticky;/);
    assert.match(css, /\.diary-tabs-root \{[\s\S]*justify-content: center;/);
    assert.match(css, /\.diary-tabbar \{[\s\S]*border-radius: 8px;/);
    assert.match(css, /\.diary-home \.kanban-list \{[\s\S]*overflow-y: auto;/);
    assert.match(css, /\.diary-home \.kanban-item-planned \{[\s\S]*background: rgba\(251, 191, 36, \.08\);/);
    assert.match(css, /\.diary-home \.kanban-item-active \{[\s\S]*background: rgba\(59, 130, 246, \.08\);/);
    assert.match(css, /\.diary-home \.kanban-item-done \{[\s\S]*background: rgba\(34, 197, 94, \.08\);/);
    assert.match(css, /\.diary-home \.kanban-item-cancelled \{[\s\S]*background: #2a2b30;/);
    assert.match(css, /\.diary-home \.kanban-item-active \.progress \{[\s\S]*height: 4px;[\s\S]*background: #1e3a8a;/);
    assert.match(css, /\.diary-home \.decision-symbol \{[\s\S]*font-size: 20px;/);
    assert.match(css, /\.diary-home \.decision-compact-body \{[\s\S]*flex-wrap: wrap;/);
    assert.match(css, /\.diary-home \.bento-cycle-head small \{[\s\S]*white-space: normal;/);
    assert.match(css, /\.diary-home \.bento-cycle-bar \{[\s\S]*height: 4px;/);
    assert.doesNotMatch(source, /bento-cycle-ticks/);
});

test('all admin sections stay reachable through one navigation surface', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /ChannelTab/);
    assert.match(source, /CrmTab/);
    assert.match(source, /StudioTab/);
    assert.match(source, /ProvidersTab/);
    assert.match(source, /ContentTab/);
    assert.match(source, /SimulationTab/);
    assert.match(css, /One navigation surface for the home and all operational sections/);
    assert.match(css, /\.diary-shell \.v2-header \{\s+padding-right: 16px;/);
});

test('all admin tabs share one responsive workspace container without clipping the diary', () => {
    const css = read('admin-v2/src/feature-components.css');

    assert.match(css, /--workspace-max: 990px;/);
    assert.match(css, /\.diary-shell \.v2-header \{[\s\S]*calc\(\(100% - var\(--workspace-max\)\) \/ 2\)/);
    assert.match(css, /\.diary-shell \.v2-content:not\(\.diary-home\) \{[\s\S]*width: min\(var\(--workspace-max\), calc\(100% - var\(--workspace-inline-space\)\)\);/);
    assert.match(css, /@media \(min-width: 761px\) \{[\s\S]*\.diary-home \{\s+width: min\(var\(--workspace-max\), calc\(100% - var\(--workspace-inline-space\)\)\);\s+grid-template-columns: minmax\(298px, \.9fr\) minmax\(0, 1\.9fr\);/);
    assert.match(css, /\.diary-home \{[\s\S]*overflow: visible;/);
    assert.match(css, /\.diary-shell \.management-tabs \{[\s\S]*overflow-x: auto;/);
    assert.match(css, /\.diary-shell \.managed-row \{\s+grid-template-columns: 20px minmax\(0, 1fr\) auto auto auto;/);
    assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.diary-shell \.managed-row \{\s+grid-template-columns: 20px minmax\(0, 1fr\);/);
    assert.match(css, /\.diary-shell \.llm-layout-v2 \{\s+align-items: start;/);
    assert.match(css, /\.diary-shell \.llm-detail \{\s+min-height: 0;/);
    assert.match(css, /\.diary-home \{\s+grid-template-rows: auto 123px auto;/);
    assert.match(css, /\.diary-home \.decision-compact-card \{\s+height: auto;/);
    assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.diary-home > \.needs-card > \.needs-compact-grid \{\s+display: grid;\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(css, /\.diary-home \.need-compact-item \{\s+flex: none;\s+min-width: 0;\s+height: 112px;/);
});

test('Figma home typography keeps the compact 990px reference proportions', () => {
    const css = read('admin-v2/src/feature-components.css');

    assert.match(css, /\.diary-home > \.kanban-card > \.card-header h2 \{\s+margin: 4px 0;\s+font-size: 20px;\s+line-height: 28px;/);
    assert.match(css, /\.diary-home > \.kanban-card > \.card-header p \{\s+max-width: 672px;\s+color: #9ca0b0;\s+font-size: 14px;\s+line-height: 20px;/);
});

test('Figma kanban cards preserve their status-specific composition and mobile wrapping', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /KanbanBoard/);
    assert.match(css, /\.diary-home \.kanban-item > span,[\s\S]*overflow-wrap: anywhere;/);
    assert.match(css, /@media \(max-width: 460px\) \{[\s\S]*grid-template-columns: 1fr auto 1fr;/);
    assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.diary-home \.bento-left \{[\s\S]*grid-template-rows: auto auto auto auto;/);
});

test('admin v2 build uses relative assets so root and /admin-v2 work from one artifact', () => {
    const vite = read('admin-v2/vite.config.js');
    assert.match(vite, /base: '\.\/'/);
});

test('kanban active card renders decision reason subtext and detail modal on click', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /TaskDetailModal/);
    assert.match(css, /\.task-card-reason/);
    assert.match(css, /\.task-detail-dialog/);
});

test('mood summary keeps its score and wrapped state readable', () => {
    const css = read('admin-v2/src/feature-components.css');

    assert.match(css, /\.diary-home \.bento-mood \{\s+grid-template-rows: auto auto minmax\(0, 1fr\);/);
    assert.match(css, /\.diary-home \.bento-mood strong \{[\s\S]*white-space: nowrap;/);
    assert.match(css, /\.diary-home \.bento-mood small \{[\s\S]*overflow-wrap: anywhere;/);
});
