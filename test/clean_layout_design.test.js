import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('admin v2 styles contain frameless container rules, 32px vertical section gaps, and horizontal bento layout', () => {
    const css = fs.readFileSync('admin-v2/src/feature-components.css', 'utf8');
    const mainJsx = fs.readFileSync('admin-v2/src/main.jsx', 'utf8');

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
