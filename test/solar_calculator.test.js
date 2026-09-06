import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SPB_LATITUDE,
    SPB_LONGITUDE,
    SPB_COORDINATES,
    MOONLIGHT_CONFIG,
    DAYLIGHT_PHASES,
    degToRad,
    radToDeg,
    getDayOfYear,
    calculateDeclination,
    calculateEquationOfTime,
    calculateSolarTime,
    calculateHourAngle,
    calculateElevation,
    calculateAzimuth,
    getDaylightPhase,
    calculateMapLight,
    calculateGroundShadow,
    calculateSpbSun
} from '../admin-linear/src/lib/solarCalculator.js';

describe('Solar Calculator - Saint Petersburg Astronomy', () => {

    it('1. Verifies Saint Petersburg geographic coordinates & constants', () => {
        assert.equal(SPB_LATITUDE, 59.95);
        assert.equal(SPB_LONGITUDE, 30.31);
        assert.equal(SPB_COORDINATES.latitude, 59.95);
        assert.equal(SPB_COORDINATES.longitude, 30.31);
        assert.equal(SPB_COORDINATES.timezone, 3);
        assert.equal(SPB_COORDINATES.lstm, 45);
    });

    it('2. Verifies Solar Declination δ calculation across key astronomical dates', () => {
        // Equinox (day 81): δ should be 0°
        const decEquinox = calculateDeclination(81);
        assert.ok(Math.abs(decEquinox) < 0.01, `Expected δ near 0 at equinox, got ${decEquinox}`);

        // Summer solstice (~day 172.25): δ should peak near +23.45°
        const decSummer = calculateDeclination(172);
        assert.ok(Math.abs(decSummer - 23.45) < 0.05, `Expected δ near +23.45° at summer solstice, got ${decSummer}`);

        // Winter solstice (~day 355): δ should bottom near -23.45°
        const decWinter = calculateDeclination(355);
        assert.ok(Math.abs(decWinter - (-23.45)) < 0.05, `Expected δ near -23.45° at winter solstice, got ${decWinter}`);

        // Default day 246 (Sept 3): δ ≈ +6.96°
        const decDefault = calculateDeclination(246);
        assert.ok(Math.abs(decDefault - 6.96) < 0.05, `Expected δ near 6.96° on day 246, got ${decDefault}`);
    });

    it('3. Verifies Local Solar Time and Hour Angle ω calculations', () => {
        // At day 246, longitude difference from 45° standard meridian is -14.69° (~ -58.76 min)
        // EoT on day 246 is ~ +1.16 min, so total offset is ~ -57.6 min (-0.96 hr).
        const solarTime12 = calculateSolarTime(12, 246);
        assert.ok(Math.abs(solarTime12 - 11.04) < 0.05, `Expected solar time ~11.04 for clock 12:00, got ${solarTime12}`);

        // Clock 12:58 (12.96 hr) should correspond to local solar noon (~12.00)
        const solarNoonCivil = 12 + 0.96;
        const solarNoonResult = calculateSolarTime(solarNoonCivil, 246);
        assert.ok(Math.abs(solarNoonResult - 12.00) < 0.05, `Expected solar noon ~12.00, got ${solarNoonResult}`);

        // Hour angle ω = 15° * (solarTime - 12)
        assert.equal(calculateHourAngle(12), 0); // Solar noon: ω = 0°
        assert.equal(calculateHourAngle(6), -90); // 6:00 solar time: ω = -90° (East)
        assert.equal(calculateHourAngle(18), 90); // 18:00 solar time: ω = +90° (West)
        assert.equal(calculateHourAngle(0), -180); // Midnight
    });

    it('4. Verifies Solar Elevation α calculations', () => {
        const dec = calculateDeclination(246); // ~6.96°
        // At solar noon (ω = 0), elevation = 90 - lat + dec = 90 - 59.95 + 6.96 = 37.01°
        const noonElevation = calculateElevation(SPB_LATITUDE, dec, 0);
        assert.ok(Math.abs(noonElevation - 37.01) < 0.05, `Expected noon elevation ~37.01°, got ${noonElevation}`);

        // At solar midnight (ω = 180° or -180°), elevation = -(90 - lat - dec) = -(90 - 59.95 - 6.96) = -23.09°
        const midnightElevation = calculateElevation(SPB_LATITUDE, dec, 180);
        assert.ok(Math.abs(midnightElevation - (-23.09)) < 0.05, `Expected midnight elevation ~ -23.09°, got ${midnightElevation}`);
    });

    it('5. Verifies Solar Azimuth θ clockwise from North', () => {
        const dec = calculateDeclination(246);

        // At solar noon (ω = 0), sun is directly South (azimuth = 180°)
        const noonElevation = calculateElevation(SPB_LATITUDE, dec, 0);
        const noonAzimuth = calculateAzimuth(SPB_LATITUDE, dec, 0, noonElevation);
        assert.ok(Math.abs(noonAzimuth - 180) < 0.05, `Expected azimuth 180° at solar noon, got ${noonAzimuth}`);

        // Morning (ω < 0): sun should be in eastern hemisphere (0° < θ < 180°)
        const morningEl = calculateElevation(SPB_LATITUDE, dec, -45);
        const morningAz = calculateAzimuth(SPB_LATITUDE, dec, -45, morningEl);
        assert.ok(morningAz > 0 && morningAz < 180, `Morning azimuth should be in East (0-180), got ${morningAz}`);

        // Afternoon (ω > 0): sun should be in western hemisphere (180° < θ < 360°)
        const afternoonEl = calculateElevation(SPB_LATITUDE, dec, 45);
        const afternoonAz = calculateAzimuth(SPB_LATITUDE, dec, 45, afternoonEl);
        assert.ok(afternoonAz > 180 && afternoonAz < 360, `Afternoon azimuth should be in West (180-360), got ${afternoonAz}`);

        // Symmetry: distance from South (180°) should be equal for equal morning/afternoon hour angles
        const morningDiff = Math.abs(180 - morningAz);
        const afternoonDiff = Math.abs(afternoonAz - 180);
        assert.ok(Math.abs(morningDiff - afternoonDiff) < 0.05, `Expected morning/afternoon azimuth symmetry around 180°`);
    });

    it('6. Verifies Daylight Phases and lighting color/intensity thresholds', () => {
        // > 25°: 'day' (#fffdf5, intensity 0.72)
        assert.equal(getDaylightPhase(25.1), 'day');
        assert.equal(DAYLIGHT_PHASES.day.color, '#fffdf5');
        assert.equal(DAYLIGHT_PHASES.day.intensity, 0.72);

        // > 10°: 'morning_afternoon' (#fff5e6, intensity 0.78)
        assert.equal(getDaylightPhase(25.0), 'morning_afternoon');
        assert.equal(getDaylightPhase(10.1), 'morning_afternoon');
        assert.equal(DAYLIGHT_PHASES.morning_afternoon.color, '#fff5e6');
        assert.equal(DAYLIGHT_PHASES.morning_afternoon.intensity, 0.78);

        // > 0°: 'golden_hour' (#ff8a3d, intensity 0.85)
        assert.equal(getDaylightPhase(10.0), 'golden_hour');
        assert.equal(getDaylightPhase(0.1), 'golden_hour');
        assert.equal(DAYLIGHT_PHASES.golden_hour.color, '#ff8a3d');
        assert.equal(DAYLIGHT_PHASES.golden_hour.intensity, 0.85);

        // > -6°: 'twilight' (#c084fc, intensity 0.48)
        assert.equal(getDaylightPhase(0.0), 'twilight');
        assert.equal(getDaylightPhase(-5.9), 'twilight');
        assert.equal(DAYLIGHT_PHASES.twilight.color, '#c084fc');
        assert.equal(DAYLIGHT_PHASES.twilight.intensity, 0.48);

        // <= -6°: 'night' (cool moonlight from SE azimuth 145°, elevation 32°, color #93c5fd, intensity 0.38)
        assert.equal(getDaylightPhase(-6.0), 'night');
        assert.equal(getDaylightPhase(-20.0), 'night');
        assert.equal(DAYLIGHT_PHASES.night.color, '#93c5fd');
        assert.equal(DAYLIGHT_PHASES.night.intensity, 0.38);
        assert.equal(MOONLIGHT_CONFIG.azimuth, 145);
        assert.equal(MOONLIGHT_CONFIG.elevation, 32);
    });

    it('7. Verifies MapLibre directional light parameters', () => {
        // Daytime test
        const lightDay = calculateMapLight(180, 35, 'day');
        assert.equal(lightDay.anchor, 'map');
        assert.equal(lightDay.color, '#fffdf5');
        assert.equal(lightDay.intensity, 0.72);
        // polarAngle = 90 - max(2, 35) = 55°
        assert.deepEqual(lightDay.position, [1.5, 180, 55]);

        // Twilight grazing angle clamp test (elevation = -2°, clamped to 2°)
        const lightTwilight = calculateMapLight(70, -2, 'twilight');
        assert.equal(lightTwilight.color, '#c084fc');
        // polarAngle = 90 - max(2, -2) = 90 - 2 = 88°
        assert.deepEqual(lightTwilight.position, [1.5, 70, 88]);

        // Nighttime test: moonlight from SE 145°, elevation 32°
        const lightNight = calculateMapLight(0, -20, 'night');
        assert.equal(lightNight.color, '#93c5fd');
        assert.equal(lightNight.intensity, 0.38);
        // polarAngle = 90 - max(2, 32) = 58°
        assert.deepEqual(lightNight.position, [1.5, 145, 58]);
    });

    it('8. Verifies Ground Shadow Offset and Length calculations', () => {
        // Sun at azimuth 180° (South), elevation 45°
        // shadowAzimuth = (180 + 180) % 360 = 0° (North)
        // shadowLength = cot(max(8, 45)) = cot(45°) = 1.0
        const shadowNoon = calculateGroundShadow(180, 45, 'day');
        assert.equal(shadowNoon.azimuth, 0);
        assert.equal(shadowNoon.length, 1.0);
        // pointing due North: unitX = 0, unitY = -1
        assert.equal(shadowNoon.offsetX, 0);
        assert.ok(shadowNoon.offsetY < 0, `offsetY should be negative (North), got ${shadowNoon.offsetY}`);
        assert.equal(shadowNoon.opacity, 0.42);

        // Clamping test: elevation below 8° (e.g. 2°) clamps to 8°
        // cot(8°) ≈ 7.115
        const shadowLow = calculateGroundShadow(90, 2, 'golden_hour');
        assert.ok(Math.abs(shadowLow.length - 7.115) < 0.01);
        // Sun at 90° (East) -> shadow at 270° (West) -> unitX = -1, unitY = 0
        assert.equal(shadowLow.azimuth, 270);
        assert.ok(shadowLow.offsetX < 0, `offsetX should be negative (West), got ${shadowLow.offsetX}`);
        assert.ok(Math.abs(shadowLow.offsetY) < 0.01);

        // Night test: moonlight at 145° SE, 32° elevation
        // shadowAzimuth = (145 + 180) % 360 = 325° (NW)
        // shadowLength = cot(32°) ≈ 1.600
        const shadowNight = calculateGroundShadow(0, -20, 'night');
        assert.equal(shadowNight.azimuth, 325);
        assert.ok(Math.abs(shadowNight.length - 1.600) < 0.01);
        assert.equal(shadowNight.opacity, 0.26);
    });

    it('9. Verifies calculateSpbSun main exported function', () => {
        // Noon civil time on Sept 3 (day 246)
        const sunNoon = calculateSpbSun(12, 246);
        assert.equal(sunNoon.hour, 12);
        assert.equal(sunNoon.dayOfYear, 246);
        assert.equal(sunNoon.phase, 'day');
        assert.ok(sunNoon.elevation > 25);
        assert.equal(sunNoon.mapLight.anchor, 'map');
        assert.equal(sunNoon.mapLight.color, '#fffdf5');
        assert.ok(sunNoon.shadow.length > 0);

        // Midnight civil time
        const sunMidnight = calculateSpbSun(0, 246);
        assert.equal(sunMidnight.phase, 'night');
        assert.equal(sunMidnight.light.isMoon, true);
        assert.equal(sunMidnight.light.color, '#93c5fd');
        assert.equal(sunMidnight.mapLight.position[1], 145); // Moon azimuth
        assert.equal(sunMidnight.mapLight.position[2], 58);  // Moon polar angle (90 - 32)
        assert.equal(sunMidnight.shadow.azimuth, 325);       // (145 + 180) % 360

        // Golden hour test (hour 19:00 on day 246)
        const sunEvening = calculateSpbSun(19, 246);
        assert.equal(sunEvening.phase, 'golden_hour');
        assert.equal(sunEvening.light.color, '#ff8a3d');
        assert.equal(sunEvening.light.intensity, 0.85);

        // Date object input support
        const testDate = new Date('2026-09-03T12:00:00+03:00');
        const sunFromDate = calculateSpbSun(testDate);
        assert.equal(sunFromDate.phase, 'day');

        // Parameterless call (uses current time)
        const currentSun = calculateSpbSun();
        assert.ok(currentSun.elevation !== undefined);
        assert.ok(currentSun.azimuth !== undefined);
        assert.ok(currentSun.phase !== undefined);
        assert.ok(currentSun.mapLight !== undefined);
        assert.ok(currentSun.shadow !== undefined);
    });
});
