import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);

describe('Zenly Map & Yandex 3.0 Interactive Architecture Contracts', () => {

    describe('1. Zenly Components Architecture & Integrity', () => {
        it('ZenlyFriendPin component exists and exports properly', () => {
            assert.ok(exists('admin-linear/src/components/ZenlyFriendPin.jsx'));
            const src = read('admin-linear/src/components/ZenlyFriendPin.jsx');
            assert.match(src, /export function ZenlyFriendPin/);
            assert.match(src, /batteryBg/);
            assert.match(src, /zenly-emoji-float/);
            assert.match(src, /animate-ping/);
        });

        it('ZenlyBottomSheet component exists and supports transit, vitals and in-place actions', () => {
            assert.ok(exists('admin-linear/src/components/ZenlyBottomSheet.jsx'));
            const src = read('admin-linear/src/components/ZenlyBottomSheet.jsx');
            assert.match(src, /export function ZenlyBottomSheet/);
            assert.match(src, /onStartTransit/);
            assert.match(src, /onTeleport/);
            assert.match(src, /onInPlaceAction/);
            assert.match(src, /onFastForward/);
            assert.match(src, /calculateTransitOptions/);
            assert.match(src, /petrogradka_home/);
            assert.match(src, /cafe_sloy/);
            assert.match(src, /spbgik/);
            assert.match(src, /showroom_work/);
        });

        it('ZenlyPlacesCatalogModal component exists and provides 14 locations search', () => {
            assert.ok(exists('admin-linear/src/components/ZenlyPlacesCatalogModal.jsx'));
            const src = read('admin-linear/src/components/ZenlyPlacesCatalogModal.jsx');
            assert.match(src, /export function ZenlyPlacesCatalogModal/);
            assert.match(src, /SPB_LOCATIONS/);
            assert.match(src, /LOCATION_CATEGORIES/);
            assert.match(src, /calculateDistanceKm/);
        });

        it('ZenlyPlacePin component exists and formats Petersburg locations', () => {
            assert.ok(exists('admin-linear/src/components/ZenlyPlacePin.jsx'));
            const src = read('admin-linear/src/components/ZenlyPlacePin.jsx');
            assert.match(src, /export function ZenlyPlacePin/);
            assert.match(src, /shortName/);
        });
    });

    describe('2. Yandex Maps 3.0 Loader & Fallback Contracts', () => {
        it('yandexMapsLoader provides safe timeout and error handling', () => {
            assert.ok(exists('admin-linear/src/lib/yandexMapsLoader.js'));
            const src = read('admin-linear/src/lib/yandexMapsLoader.js');
            assert.match(src, /api-maps\.yandex\.ru\/v3/);
            assert.match(src, /loadYandexMaps3/);
            assert.match(src, /YANDEX_LOAD_TIMEOUT/);
        });

        it('ZenlyMap component handles Yandex 3.0 with MapLibre fallback', () => {
            assert.ok(exists('admin-linear/src/components/ZenlyMap.jsx'));
            const src = read('admin-linear/src/components/ZenlyMap.jsx');
            assert.match(src, /export function ZenlyMap/);
            assert.match(src, /loadYandexMaps3/);
            assert.match(src, /initMapLibre/);
            assert.match(src, /initYandexMaps/);
            assert.match(src, /activeEngine/);
            assert.match(src, /ZenlyFriendPin/);
            assert.match(src, /ZenlyPlacePin/);
            assert.match(src, /ZenlyBottomSheet/);
        });
    });

    describe('3. Stylings & App Integration Contracts', () => {
        it('admin-linear/src/index.css includes zenly-emoji-float animation keyframes', () => {
            const css = read('admin-linear/src/index.css');
            assert.match(css, /@keyframes zenly-emoji-float/);
            assert.match(css, /transform:\s*translateY\(-130px\)/);
        });

       it('admin-linear/src/App.jsx mounts ZenlyMap on map tab', () => {
           const appSrc = read('admin-linear/src/App.jsx');
           assert.match(appSrc, /import \{ ZenlyMap \} from '@\/components\/ZenlyMap\.jsx'/);
           assert.match(appSrc, /<ZenlyMap/);
           assert.doesNotMatch(appSrc, /<FullScreenMap/);
       });

   });

    describe('4. SPb Locations, Transit & Solar Engine Calculations', () => {
        it('SPB_LOCATIONS contains exactly 14 verified locations with valid coordinates', async () => {
            const { SPB_LOCATIONS, LOCATION_MAP } = await import('../admin-linear/src/lib/simulationConstants.js');
            assert.equal(SPB_LOCATIONS.length, 14);
            const expectedIds = [
                'petrogradka_home', 'cafe_sloy', 'vkusvill_lenina', 'spbgik', 'showroom_work',
                'bar_rubinsteina', 'sevcable_port', 'new_holland', 'petropavlovka',
                'metro_gorkovskaya', 'metro_chkalovskaya', 'matveevsky_garden', 'sennaya_sq', 'lopukhinsky_garden'
            ];
            expectedIds.forEach(id => {
                assert.ok(LOCATION_MAP[id], `Location ${id} should exist`);
                assert.ok(LOCATION_MAP[id].lat > 59.8 && LOCATION_MAP[id].lat < 60.1, `Latitude for ${id} in SPb bounds`);
                assert.ok(LOCATION_MAP[id].lng > 30.1 && LOCATION_MAP[id].lng < 30.5, `Longitude for ${id} in SPb bounds`);
            });
        });

        it('calculateTransitOptions computes realistic walk minutes and taxi costs', async () => {
            const { calculateTransitOptions } = await import('../admin-linear/src/lib/simulationConstants.js');
            // From Petrogradka Home to Sloy (~0.7 km)
            const options = calculateTransitOptions([30.31448, 59.96175], [30.30155, 59.96025]);
            assert.ok(options.distKm > 0.5 && options.distKm < 1.2);
            assert.ok(options.walk.durationMinutes >= 5 && options.walk.durationMinutes <= 20);
            assert.equal(options.walk.costRubles, 0);
            assert.ok(options.taxi.durationMinutes >= 3 && options.taxi.durationMinutes <= 15);
            assert.ok(options.taxi.costRubles >= 180);
        });

        it('calculateSpbSun calculates solar phases and MapLibre lighting', async () => {
            const { calculateSpbSun } = await import('../admin-linear/src/lib/solarCalculator.js');
            const noonSun = calculateSpbSun(13.0); // 13:00 SPb
            assert.ok(noonSun.elevation > 15, 'Noon sun should be above horizon');
            assert.ok(['day', 'morning_afternoon'].includes(noonSun.phase));
            assert.equal(noonSun.mapLight.anchor, 'map');

            const nightSun = calculateSpbSun(1.0); // 01:00 SPb
            assert.equal(nightSun.phase, 'night');
            assert.ok(nightSun.light.isMoon, 'Night uses moonlight configuration');
        });
    });
});
