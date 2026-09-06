/**
 * yandexMapsLoader.js
 * 
 * Safe async loader for Yandex Maps JS API 3.0 with timeout & graceful error handling.
 */

let loadPromise = null;

export function loadYandexMaps3(apiKey = '953e2e92-bc7a-48bb-be96-fb2b70905464') {
    if (typeof window === 'undefined') return Promise.reject(new Error('SSR not supported'));

    if (window.ymaps3) {
        return window.ymaps3.ready.then(() => window.ymaps3);
    }

    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        // Fallback timeout if script fails or referer is blocked
        const timeoutId = setTimeout(() => {
            console.warn('[ZenlyMap] Yandex Maps 3.0 load timeout (5s) — referer check or network delay');
            reject(new Error('YANDEX_LOAD_TIMEOUT'));
        }, 5000);

        const script = document.createElement('script');
        script.id = 'yandex-maps-v3-script';
        script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
        script.async = true;

        script.onload = async () => {
            clearTimeout(timeoutId);
            try {
                if (!window.ymaps3) {
                    throw new Error('window.ymaps3 undefined after script load');
                }
                await window.ymaps3.ready;
                resolve(window.ymaps3);
            } catch (err) {
                console.warn('[ZenlyMap] Yandex Maps 3.0 ready failed:', err);
                reject(err);
            }
        };

        script.onerror = (err) => {
            clearTimeout(timeoutId);
            console.warn('[ZenlyMap] Failed to fetch Yandex Maps 3.0 script:', err);
            reject(err);
        };

        document.head.appendChild(script);
    });

    return loadPromise;
}
