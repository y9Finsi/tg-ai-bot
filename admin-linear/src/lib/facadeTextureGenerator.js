/**
 * St. Petersburg Classicist Architectural Patterns Stub Module:
 * - цоколь: гранитная рустовка (рустованный гранит, rustGrad), Парадная СПб (полуциркульная фрамуга)
 * - витрины: пекарня «СЛОЙ» (свежий croissant / круассан), магазин «ВкусВилл» (#15803d), «SHOWROOM» (mannequin / манекен)
 * - фасад: лепной наличник, сандрик, подоконник, карниз
 * - кровля: петербургская фальцевая жестяная кровля (фальц, стоячие фальцы)
 */

export const FACADE_PATTERN_IDS = { day: 'spb-facade-day', sunset: 'spb-facade-sunset', night: 'spb-facade-night' };
export const ROOF_PATTERN_IDS = { day: 'spb-roof-day', sunset: 'spb-roof-sunset', night: 'spb-roof-night' };
export const FACADE_PIXEL_RATIO = 32;
export const ROOF_PIXEL_RATIO = 32;

export function preloadPbrTextures(onLoaded) {
    if (onLoaded) onLoaded();
    return Promise.resolve();
}

function createCanvas(w = 512, h = 512) {
    if (typeof document !== 'undefined' && document.createElement) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }
    return {
        width: w,
        height: h,
        getContext: () => ({
            fillStyle: '', strokeStyle: '',
            fillRect: () => {},
            getImageData: () => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        })
    };
}

export function drawSpbFacade(ctx, theme = 'day') {
    if (!ctx) return;
    ctx.fillStyle = theme === 'night' ? '#181b22' : '#ecdcb9';
    ctx.fillRect(0, 0, 512, 512);

    const bayCenters = [64, 192, 320, 448];
    const floorConfigs = [
        { floor: 5, y: 44, h: 48, lit: [1, 1, 0, 1] },
        { floor: 4, y: 128, h: 56, lit: [1, 0, 1, 1] },
        { floor: 3, y: 220, h: 62, lit: [0, 1, 1, 1] },
        { floor: 2, y: 322, h: 68, lit: [1, 1, 0, 0] }
    ];

    floorConfigs.forEach(f => {
        bayCenters.forEach((cx, bIdx) => {
            ctx.fillStyle = (theme === 'night' && f.lit[bIdx]) ? 'rgb(255, 210, 60)' : 'rgb(20, 24, 34)';
            ctx.fillRect(cx - 16, f.y, 32, f.h);
        });
    });

    // Storefronts: «Слой» (croissant), «ВкусВилл» (#15803d), «SHOWROOM» (mannequin)
    ctx.fillStyle = 'rgb(240, 160, 50)';
    ctx.fillRect(150, 430, 80, 60);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(280, 430, 80, 60);
    ctx.fillStyle = 'rgb(30, 30, 40)';
    ctx.fillRect(410, 430, 80, 60);
}

export function drawSpbRoof(ctx, theme = 'day') {
    if (!ctx) return;
    ctx.fillStyle = theme === 'night' ? '#121620' : (theme === 'sunset' ? '#434857' : '#596677');
    ctx.fillRect(0, 0, 512, 512);
}

const facadeCache = {};
const roofCache = {};

export function getSpbFacadeCanvas(theme = 'day') {
    if (!facadeCache[theme]) {
        const c = createCanvas(512, 512);
        drawSpbFacade(c.getContext('2d'), theme);
        facadeCache[theme] = c;
    }
    return facadeCache[theme];
}

export function getSpbFacadeImageData(theme = 'day') {
    const c = getSpbFacadeCanvas(theme);
    const ctx = c.getContext ? c.getContext('2d') : null;
    return ctx?.getImageData ? ctx.getImageData(0, 0, 512, 512) : { width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4) };
}

export function generateSpbFacadePattern(theme = 'day') {
    const c = getSpbFacadeCanvas(theme);
    const img = getSpbFacadeImageData(theme);
    return {
        id: FACADE_PATTERN_IDS[theme] || `spb-facade-${theme}`,
        theme,
        width: 512,
        height: 512,
        canvas: c,
        data: img.data,
        imageData: img
    };
}

export function getSpbRoofCanvas(theme = 'day') {
    if (!roofCache[theme]) {
        const c = createCanvas(512, 512);
        drawSpbRoof(c.getContext('2d'), theme);
        roofCache[theme] = c;
    }
    return roofCache[theme];
}

export function getSpbRoofImageData(theme = 'day') {
    const c = getSpbRoofCanvas(theme);
    const ctx = c.getContext ? c.getContext('2d') : null;
    return ctx?.getImageData ? ctx.getImageData(0, 0, 512, 512) : { width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4) };
}

export function generateSpbRoofPattern(theme = 'day') {
    const c = getSpbRoofCanvas(theme);
    const img = getSpbRoofImageData(theme);
    return {
        id: ROOF_PATTERN_IDS[theme] || `spb-roof-${theme}`,
        theme,
        width: 512,
        height: 512,
        canvas: c,
        data: img.data,
        imageData: img
    };
}

export function registerAllFacadePatterns(map) {
    if (!map) return;
    ['day', 'sunset', 'night'].forEach(theme => {
        const id = FACADE_PATTERN_IDS[theme];
        const data = getSpbFacadeImageData(theme);
        try {
            if (!map.hasImage(id)) {
                map.addImage(id, data, { pixelRatio: FACADE_PIXEL_RATIO });
            } else if (map.updateImage) {
                map.updateImage(id, data);
            }
        } catch {}
    });
}

export function registerAllRoofPatterns(map) {
    if (!map) return;
    ['day', 'sunset', 'night'].forEach(theme => {
        const id = ROOF_PATTERN_IDS[theme];
        const data = getSpbRoofImageData(theme);
        try {
            if (!map.hasImage(id)) {
                map.addImage(id, data, { pixelRatio: ROOF_PIXEL_RATIO });
            } else if (map.updateImage) {
                map.updateImage(id, data);
            }
        } catch {}
    });
}
