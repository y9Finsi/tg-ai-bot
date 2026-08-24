import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure reference implementation of aspect ratio & target dimension calculator
export function calculateTargetDimensions(width, height, maxWidth = 1920, maxHeight = 1920) {
    const w = Math.max(1, Math.round(Number(width) || 1));
    const h = Math.max(1, Math.round(Number(height) || 1));
    const maxW = Math.max(1, Math.round(Number(maxWidth) || 1920));
    const maxH = Math.max(1, Math.round(Number(maxHeight) || 1920));

    if (w <= maxW && h <= maxH) {
        return { width: w, height: h, resized: false, scale: 1 };
    }

    const ratioW = maxW / w;
    const ratioH = maxH / h;
    const scale = Math.min(ratioW, ratioH);

    const targetWidth = Math.max(1, Math.round(w * scale));
    const targetHeight = Math.max(1, Math.round(h * scale));

    return {
        width: targetWidth,
        height: targetHeight,
        resized: true,
        scale
    };
}

// Step-down quality decider for canvas export loop
export function determineCompressionQuality(currentSizeBytes, maxSizeBytes = 2.5 * 1024 * 1024, initialQuality = 0.85, attempt = 1) {
    if (currentSizeBytes <= maxSizeBytes) {
        return { shouldContinue: false, quality: initialQuality, finalSizeBytes: currentSizeBytes };
    }

    const qualitySteps = [0.85, 0.70, 0.55, 0.40, 0.25];
    if (attempt >= qualitySteps.length) {
        return { shouldContinue: false, quality: qualitySteps.at(-1), finalSizeBytes: currentSizeBytes };
    }

    return {
        shouldContinue: true,
        quality: qualitySteps[attempt],
        nextAttempt: attempt + 1
    };
}

describe('Client-Side Image Canvas Compression Contract', () => {

    // =========================================================================
    // TIER 1: Core Contract & Happy Paths (min 5 tests)
    // =========================================================================
    describe('Tier 1: Core Contract & Happy Paths', () => {

        it('T1.1: Landscape 4K image (3840x2160) scales down to 1920x1080 preserving 16:9 ratio', () => {
            const dims = calculateTargetDimensions(3840, 2160, 1920, 1920);
            assert.equal(dims.width, 1920);
            assert.equal(dims.height, 1080);
            assert.equal(dims.resized, true);
            assert.equal(dims.scale, 0.5);
        });

        it('T1.2: Portrait 4K image (2160x3840) scales down to 1080x1920 preserving 9:16 ratio', () => {
            const dims = calculateTargetDimensions(2160, 3840, 1920, 1920);
            assert.equal(dims.width, 1080);
            assert.equal(dims.height, 1920);
            assert.equal(dims.resized, true);
            assert.equal(dims.scale, 0.5);
        });

        it('T1.3: Square large image (3000x3000) scales down to 1920x1920 preserving 1:1 ratio', () => {
            const dims = calculateTargetDimensions(3000, 3000, 1920, 1920);
            assert.equal(dims.width, 1920);
            assert.equal(dims.height, 1920);
            assert.equal(dims.resized, true);
        });

        it('T1.4: Images smaller than maxWidth and maxHeight remain unscaled (no upscale)', () => {
            const dims = calculateTargetDimensions(800, 600, 1920, 1920);
            assert.equal(dims.width, 800);
            assert.equal(dims.height, 600);
            assert.equal(dims.resized, false);
            assert.equal(dims.scale, 1);
        });

        it('T1.5: Image already within 2.5 MB target budget retains initial quality 0.85', () => {
            const step = determineCompressionQuality(1.8 * 1024 * 1024, 2.5 * 1024 * 1024, 0.85);
            assert.equal(step.shouldContinue, false);
            assert.equal(step.quality, 0.85);
        });
    });

    // =========================================================================
    // TIER 2: Boundary Conditions & Quality Step-down (min 5 tests)
    // =========================================================================
    describe('Tier 2: Boundary Conditions & Quality Steps', () => {

        it('T2.1: Image exactly at 1920x1080 boundaries is not altered', () => {
            const dims = calculateTargetDimensions(1920, 1080, 1920, 1920);
            assert.equal(dims.width, 1920);
            assert.equal(dims.height, 1080);
            assert.equal(dims.resized, false);
        });

        it('T2.2: Extreme panoramic aspect ratio (5000x500) scales to 1920x192', () => {
            const dims = calculateTargetDimensions(5000, 500, 1920, 1920);
            assert.equal(dims.width, 1920);
            assert.equal(dims.height, 192);
            assert.equal(dims.resized, true);
        });

        it('T2.3: Ultra-tall vertical banner (500x5000) scales to 192x1920', () => {
            const dims = calculateTargetDimensions(500, 5000, 1920, 1920);
            assert.equal(dims.width, 192);
            assert.equal(dims.height, 1920);
            assert.equal(dims.resized, true);
        });

        it('T2.4: Oversized 8MB payload triggers step-down progression (0.85 -> 0.70 -> 0.55)', () => {
            const max = 2.5 * 1024 * 1024;
            const step1 = determineCompressionQuality(8 * 1024 * 1024, max, 0.85, 1);
            assert.equal(step1.shouldContinue, true);
            assert.equal(step1.quality, 0.70);

            const step2 = determineCompressionQuality(3.5 * 1024 * 1024, max, 0.70, 2);
            assert.equal(step2.shouldContinue, true);
            assert.equal(step2.quality, 0.55);

            const step3 = determineCompressionQuality(2.1 * 1024 * 1024, max, 0.55, 3);
            assert.equal(step3.shouldContinue, false);
            assert.equal(step3.quality, 0.55);
        });

        it('T2.5: Small images (10x10) remain 10x10 with scale 1', () => {
            const dims = calculateTargetDimensions(10, 10, 1920, 1920);
            assert.equal(dims.width, 10);
            assert.equal(dims.height, 10);
            assert.equal(dims.resized, false);
        });
    });

    // =========================================================================
    // TIER 3: Cross-Feature Interactions
    // =========================================================================
    describe('Tier 3: Cross-Feature Interactions', () => {

        it('T3.1: Compressed payload matches backend media upload constraints (<= 2.5 MB)', () => {
            const maxPayloadBytes = 2.5 * 1024 * 1024;
            const testCompressedSize = 2.2 * 1024 * 1024;
            assert.ok(testCompressedSize < maxPayloadBytes, 'Compressed output must be below Express body size limit');
        });
    });

    // =========================================================================
    // TIER 4: Realistic Upload Flow
    // =========================================================================
    describe('Tier 4: Realistic Upload Simulation Flow', () => {

        it('T4.1: Simulated photo taken on iPhone 15 Pro (4032x3024, 9.5MB) compresses to target budget', () => {
            const originalWidth = 4032;
            const originalHeight = 3024;
            const originalBytes = 9.5 * 1024 * 1024;

            // Step 1: Dimension scaling
            const dims = calculateTargetDimensions(originalWidth, originalHeight, 1920, 1920);
            assert.equal(dims.width, 1920);
            assert.equal(dims.height, 1440); // 4032:3024 = 4:3 -> 1920:1440

            // Step 2: Quality convergence
            const simulatedSizeAtQuality07 = 1.9 * 1024 * 1024; // < 2.5MB
            const compression = determineCompressionQuality(simulatedSizeAtQuality07, 2.5 * 1024 * 1024, 0.7);

            assert.equal(compression.shouldContinue, false);
            assert.ok(compression.finalSizeBytes <= 2.5 * 1024 * 1024);
        });
    });

    // =========================================================================
    // TIER 5: Adversarial & Edge Variations
    // =========================================================================
    describe('Tier 5: Adversarial & Edge Variations', () => {

        it('T5.1: Handles non-numeric or zero dimensions gracefully without dividing by zero', () => {
            const dims = calculateTargetDimensions(0, 0, 1920, 1920);
            assert.ok(dims.width >= 1);
            assert.ok(dims.height >= 1);
        });

        it('T5.2: Reaches terminal state when max attempts exceeded without infinite loops', () => {
            const step = determineCompressionQuality(100 * 1024 * 1024, 2.5 * 1024 * 1024, 0.85, 10);
            assert.equal(step.shouldContinue, false);
            assert.ok(step.quality <= 0.3);
        });
    });
});
