import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('admin v2 styles contain frameless container rules, 32px vertical section gaps, and horizontal bento layout', () => {
    const css = fs.readFileSync('admin-v2/src/feature-components.css', 'utf8');
    const root = new URL('..', import.meta.url);
    const readAdminSrc = () => {
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
    };
    const mainJsx = readAdminSrc();

    // Check frameless card container CSS rule
    assert.ok(css.includes('ui-card-frameless'), 'feature-components.css should define ui-card-frameless class');

    // Check increased vertical section spacing (32px bottom margins)
    assert.ok(css.includes('margin-bottom:32px'), 'feature-components.css should specify 32px bottom margins for main section cards');

    // Check horizontal Bento grid layout rules and responsive breakpoints
    assert.ok(css.includes('bento-needs-layout'), 'feature-components.css should contain bento-needs-layout');
    assert.ok(css.includes('@media(max-width:950px)'), 'feature-components.css should contain 950px responsive breakpoint');

    // Check main.jsx uses frameless containers
    assert.ok(mainJsx.includes('ui-card-frameless'), 'main.jsx should apply ui-card-frameless to main container cards');
});
