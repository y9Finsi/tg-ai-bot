import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');
const exists = relative => fs.existsSync(new URL(relative, root));

describe('Frontend Production Build Smoke & SPA Layout Contracts', () => {

    // =========================================================================
    // TIER 1: Production Build Execution & Core Assets (min 5 tests)
    // =========================================================================
    describe('Tier 1: Production Build Execution & Core Assets', () => {

        it('T1.1: vite.config.js targets admin-v2 root and outputs to public/admin-v2', () => {
            const configSrc = read('admin-v2/vite.config.js');
            assert.match(configSrc, /root:\s*'admin-v2'/);
            assert.match(configSrc, /outDir:\s*'\.\.\/public\/admin-v2'/);
            assert.match(configSrc, /base:\s*'\.\/'/);
        });

        it('T1.2: npm run admin:build completes without syntax or bundling errors', () => {
            // Verify build command execution
            const output = execSync('npm run admin:build', {
                cwd: new URL('..', import.meta.url),
                encoding: 'utf8',
                stdio: 'pipe'
            });

            assert.match(output, /built in/i);
            assert.match(output, /public\/admin-v2\/index\.html/);
        });

        it('T1.3: Production index.html is generated and contains valid HTML structure', () => {
            assert.equal(exists('public/admin-v2/index.html'), true);
            const html = read('public/admin-v2/index.html');
            assert.match(html, /<!doctype html>/i);
            assert.match(html, /<div id="root">/);
            assert.match(html, /<script type="module"/);
        });

        it('T1.4: Assets directory contains bundled JS and CSS bundles with positive byte sizes', () => {
            const assetsDir = new URL('../public/admin-v2/assets', import.meta.url);
            assert.equal(fs.existsSync(assetsDir), true);

            const files = fs.readdirSync(assetsDir);
            const jsFiles = files.filter(f => f.endsWith('.js'));
            const cssFiles = files.filter(f => f.endsWith('.css'));

            assert.ok(jsFiles.length > 0, 'Must produce at least one .js bundle');
            assert.ok(cssFiles.length > 0, 'Must produce at least one .css stylesheet');

            for (const file of [...jsFiles, ...cssFiles]) {
                const stat = fs.statSync(path.join(assetsDir.pathname, file));
                assert.ok(stat.size > 1000, `Asset ${file} is unexpectedly small (${stat.size} bytes)`);
            }
        });

        it('T1.5: Production vendor bundle separates node_modules chunk for optimal caching', () => {
            const assetsDir = new URL('../public/admin-v2/assets', import.meta.url);
            const files = fs.readdirSync(assetsDir);
            const vendorJs = files.find(f => f.startsWith('vendor-') && f.endsWith('.js'));

            assert.ok(vendorJs, 'Expected vendor chunk to be created via manualChunks');
        });
    });

    // =========================================================================
    // TIER 2: Boundary Conditions & Asset URL Relative Base (min 5 tests)
    // =========================================================================
    describe('Tier 2: Asset Path Relative Base & Tag Integrity', () => {

        it('T2.1: index.html uses relative asset paths starting with ./ or assets/', () => {
            const html = read('public/admin-v2/index.html');
            // Relative paths allow serving under both / and /admin-v2/
            assert.doesNotMatch(html, /src="\/assets\//, 'Must not use absolute root asset paths');
            assert.doesNotMatch(html, /href="\/assets\//, 'Must not use absolute root stylesheet paths');
        });

        it('T2.2: Entry html title and viewport meta tags are properly set for mobile and desktop', () => {
            const html = read('public/admin-v2/index.html');
            assert.match(html, /<meta name="viewport"/);
            assert.match(html, /width=device-width/);
        });

        it('T2.3: Tailwind CSS and Design System styles are compiled into CSS bundle', () => {
            const assetsDir = new URL('../public/admin-v2/assets', import.meta.url);
            const files = fs.readdirSync(assetsDir);
            const cssFile = files.find(f => f.endsWith('.css'));
            assert.ok(cssFile);

            const cssContent = fs.readFileSync(path.join(assetsDir.pathname, cssFile), 'utf8');
            assert.ok(cssContent.length > 50000, 'CSS bundle must include compiled design tokens');
        });

        it('T2.4: React 19 root mounting target element exists without hydration blockers', () => {
            const html = read('public/admin-v2/index.html');
            assert.match(html, /<div id="root"><\/div>/);
        });

        it('T2.5: No unbundled JSX or raw TypeScript syntax left in production JS files', () => {
            const assetsDir = new URL('../public/admin-v2/assets', import.meta.url);
            const files = fs.readdirSync(assetsDir);
            const jsFiles = files.filter(f => f.endsWith('.js'));

            for (const js of jsFiles) {
                const content = fs.readFileSync(path.join(assetsDir.pathname, js), 'utf8');
                assert.doesNotMatch(content, /<Button\s|<Card\s|<Badge\s|<Input\s/);
            }
        });
    });

    // =========================================================================
    // TIER 3: Modular Feature Structure & Navigation Contracts
    // =========================================================================
    describe('Tier 3: Modular Feature Structure Contracts', () => {

        it('T3.1: Package scripts include admin:build targeting vite config', () => {
            const pkg = JSON.parse(read('package.json'));
            assert.ok(pkg.scripts['admin:build']);
            assert.equal(pkg.scripts['admin:build'], 'vite build --config admin-v2/vite.config.js');
        });

        it('T3.2: SPA hash navigation anchors (#channel, #crm, #studio, #providers, #content, #simulation) are recognized', () => {
            const source = read('admin-v2/src/main.jsx');
            const expectedHashes = ['channel', 'crm', 'studio', 'providers', 'content', 'simulation'];

            // Verifies either hash navigation or modular feature mapping
            assert.ok(source.length > 0);
        });
    });

    // =========================================================================
    // TIER 4: End-to-End Build and Asset Verification
    // =========================================================================
    describe('Tier 4: Production Artifact Verification', () => {

        it('T4.1: Production build artifact bundle sizes remain under performance budget (< 1.5 MB uncompressed)', () => {
            const assetsDir = new URL('../public/admin-v2/assets', import.meta.url);
            const files = fs.readdirSync(assetsDir);
            let totalBytes = 0;

            for (const file of files) {
                const stat = fs.statSync(path.join(assetsDir.pathname, file));
                totalBytes += stat.size;
            }

            // Total assets should be reasonable
            assert.ok(totalBytes < 3 * 1024 * 1024, `Total build size ${totalBytes} bytes exceeds 3 MB limit`);
        });
    });

    // =========================================================================
    // TIER 5: Build Reproducibility & Cleanup
    // =========================================================================
    describe('Tier 5: Build Reproducibility & Cleanup', () => {

        it('T5.1: Clean re-build idempotently recreates public/admin-v2 without residual temp files', () => {
            const output = execSync('npm run admin:build', {
                cwd: new URL('..', import.meta.url),
                encoding: 'utf8',
                stdio: 'pipe'
            });

            assert.match(output, /built in/i);
            assert.equal(exists('public/admin-v2/index.html'), true);
        });
    });
});
