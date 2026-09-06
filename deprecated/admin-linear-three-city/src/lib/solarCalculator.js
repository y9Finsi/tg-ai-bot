/**
 * @file solarCalculator.js
 * @description Astronomical solar position calculator for Saint Petersburg (59.95° N, 30.31° E).
 * Calculates solar declination, local solar time, hour angle, solar elevation, azimuth,
 * daylight phases, MapLibre GL directional lighting parameters, and ground shadows.
 *
 * Coordinates:
 * - Latitude: 59.95° N
 * - Longitude: 30.31° E
 * - Standard Timezone: UTC+3 (MSK, LSTM = 45° E)
 */

// Saint Petersburg geographic coordinates & timezone constants
export const SPB_LATITUDE = 59.95;
export const SPB_LONGITUDE = 30.31;
export const SPB_TIMEZONE_OFFSET = 3; // UTC+3 (MSK)
export const SPB_LSTM = SPB_TIMEZONE_OFFSET * 15; // 45° standard meridian

export const SPB_COORDINATES = Object.freeze({
    latitude: SPB_LATITUDE,
    longitude: SPB_LONGITUDE,
    timezone: SPB_TIMEZONE_OFFSET,
    lstm: SPB_LSTM
});

// Nighttime directional moonlight configuration (SE azimuth 145°, elevation 32°)
export const MOONLIGHT_CONFIG = Object.freeze({
    azimuth: 145,
    elevation: 32,
    color: '#93c5fd',
    intensity: 0.38
});

// Daylight phases definition and lighting characteristics
export const DAYLIGHT_PHASES = Object.freeze({
    day: {
        key: 'day',
        label: 'День',
        description: 'Ясный дневной свет',
        color: '#fffdf5',
        intensity: 0.72,
        minElevation: 25,
        shadowOpacity: 0.42
    },
    morning_afternoon: {
        key: 'morning_afternoon',
        label: 'Утро / День',
        description: 'Теплый дневной свет',
        color: '#fff5e6',
        intensity: 0.78,
        minElevation: 10,
        shadowOpacity: 0.38
    },
    golden_hour: {
        key: 'golden_hour',
        label: 'Золотой час',
        description: 'Золотисто-янтарный закат / рассвет',
        color: '#ff8a3d',
        intensity: 0.85,
        minElevation: 0,
        shadowOpacity: 0.45
    },
    twilight: {
        key: 'twilight',
        label: 'Сумерки',
        description: 'Индиго-фиолетовые сумерки',
        color: '#c084fc',
        intensity: 0.48,
        minElevation: -6,
        shadowOpacity: 0.18
    },
    night: {
        key: 'night',
        label: 'Ночь',
        description: 'Прохладный лунный свет',
        color: '#93c5fd',
        intensity: 0.38,
        minElevation: -90,
        shadowOpacity: 0.26
    }
});

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Converts degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
    return deg * DEG_TO_RAD;
}

/**
 * Converts radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
export function radToDeg(rad) {
    return rad * RAD_TO_DEG;
}

/**
 * Calculates day of year (1..366) for a given date.
 * @param {Date} [date=new Date()]
 * @returns {number}
 */
export function getDayOfYear(date = new Date()) {
    const year = date.getFullYear();
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    let dayOfYear = date.getDate();
    for (let i = 0; i < date.getMonth(); i++) {
        dayOfYear += daysInMonth[i];
    }
    return dayOfYear;
}

/**
 * 1. Solar declination δ = 23.45° * sin((360/365) * (dayOfYear - 81) * deg)
 * Cooper's approximation formula.
 * @param {number} [dayOfYear=246] - Day of the year (1..365, default 246: Sept 3)
 * @returns {number} Declination angle δ in degrees (-23.45° to +23.45°)
 */
export function calculateDeclination(dayOfYear = 246) {
    const angleDeg = (360 / 365) * (dayOfYear - 81);
    return 23.45 * Math.sin(degToRad(angleDeg));
}

/**
 * Calculates the Equation of Time (EoT) in minutes.
 * Accounts for Earth's orbital eccentricity and axial tilt.
 * @param {number} [dayOfYear=246]
 * @returns {number} Equation of Time in minutes
 */
export function calculateEquationOfTime(dayOfYear = 246) {
    const bRad = degToRad((360 / 365) * (dayOfYear - 81));
    return 9.87 * Math.sin(2 * bRad) - 7.53 * Math.cos(bRad) - 1.5 * Math.sin(bRad);
}

/**
 * Calculates Local Solar Time (LST) from Saint Petersburg civil clock time (UTC+3).
 * Correction = (4 * (Longitude - LSTM) + EoT) / 60 hours.
 * @param {number} civilHour - Local civil hour (0..24, e.g. 13.5 for 13:30)
 * @param {number} [dayOfYear=246] - Day of the year
 * @param {number} [longitude=SPB_LONGITUDE] - Longitude in degrees East
 * @param {number} [lstm=SPB_LSTM] - Local standard time meridian (45° for UTC+3)
 * @returns {number} Local Solar Time in hours (0..24)
 */
export function calculateSolarTime(
    civilHour,
    dayOfYear = 246,
    longitude = SPB_LONGITUDE,
    lstm = SPB_LSTM
) {
    const eotMinutes = calculateEquationOfTime(dayOfYear);
    const longitudeCorrectionMinutes = 4 * (longitude - lstm);
    const totalCorrectionHours = (longitudeCorrectionMinutes + eotMinutes) / 60;
    const solarTime = civilHour + totalCorrectionHours;
    return ((solarTime % 24) + 24) % 24;
}

/**
 * 2. Hour angle ω = 15° * (solarTime - 12)
 * Normalized to [-180°, +180°].
 * ω < 0 in morning (East of meridian), ω = 0 at solar noon, ω > 0 in afternoon (West of meridian).
 * @param {number} solarTime - Local solar time in hours (0..24)
 * @returns {number} Hour angle ω in degrees
 */
export function calculateHourAngle(solarTime) {
    const normalizedTime = ((solarTime % 24) + 24) % 24;
    return 15 * (normalizedTime - 12);
}

/**
 * 3. Solar elevation α (altitude angle above horizon):
 * sin(α) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(ω)
 * @param {number} latDeg - Observer latitude in degrees
 * @param {number} decDeg - Solar declination in degrees
 * @param {number} hourAngleDeg - Solar hour angle in degrees
 * @returns {number} Elevation α in degrees (-90° to +90°)
 */
export function calculateElevation(latDeg, decDeg, hourAngleDeg) {
    const latRad = degToRad(latDeg);
    const decRad = degToRad(decDeg);
    const omegaRad = degToRad(hourAngleDeg);

    const sinAlpha = Math.sin(latRad) * Math.sin(decRad) +
                     Math.cos(latRad) * Math.cos(decRad) * Math.cos(omegaRad);

    const clampedSin = Math.max(-1, Math.min(1, sinAlpha));
    return radToDeg(Math.asin(clampedSin));
}

/**
 * 4. Solar azimuth θ (clockwise from North: 0° N, 90° E, 180° S, 270° W):
 * cos(θ) = (sin(dec)*cos(lat) - cos(dec)*sin(lat)*cos(ω)) / cos(α)
 * @param {number} latDeg - Observer latitude in degrees
 * @param {number} decDeg - Solar declination in degrees
 * @param {number} hourAngleDeg - Solar hour angle in degrees
 * @param {number} elevationDeg - Solar elevation in degrees
 * @returns {number} Azimuth θ in degrees (0..360, clockwise from North)
 */
export function calculateAzimuth(latDeg, decDeg, hourAngleDeg, elevationDeg) {
    const latRad = degToRad(latDeg);
    const decRad = degToRad(decDeg);
    const omegaRad = degToRad(hourAngleDeg);
    const alphaRad = degToRad(elevationDeg);

    const cosAlpha = Math.cos(alphaRad);
    const safeCosAlpha = Math.abs(cosAlpha) < 1e-7 ? 1e-7 : cosAlpha;

    let cosTheta = (Math.sin(decRad) * Math.cos(latRad) -
                    Math.cos(decRad) * Math.sin(latRad) * Math.cos(omegaRad)) / safeCosAlpha;

    cosTheta = Math.max(-1, Math.min(1, cosTheta));
    const thetaDeg = radToDeg(Math.acos(cosTheta));

    // Clockwise from North:
    // Before solar noon (hourAngle < 0): Sun is in the East (0°..180°)
    // After solar noon (hourAngle > 0): Sun is in the West (180°..360°)
    let azimuthDeg = thetaDeg;
    if (hourAngleDeg > 0) {
        azimuthDeg = (360 - thetaDeg) % 360;
    }

    return (azimuthDeg + 360) % 360;
}

/**
 * 5. Determines the phase of daylight based on elevation:
 * - elevation > 25°: 'day' (clear sunlight #fffdf5, intensity 0.72)
 * - elevation > 10°: 'morning_afternoon' (warm daylight #fff5e6, intensity 0.78)
 * - elevation > 0°: 'golden_hour' (amber/golden #ff8a3d, intensity 0.85)
 * - elevation > -6°: 'twilight' (indigo/purple #c084fc, intensity 0.48)
 * - elevation <= -6°: 'night' (cool moonlight from SE azimuth 145°, elevation 32°, color #93c5fd, intensity 0.38)
 *
 * @param {number} elevation - Solar elevation in degrees
 * @returns {'day' | 'morning_afternoon' | 'golden_hour' | 'twilight' | 'night'}
 */
export function getDaylightPhase(elevation) {
    if (elevation > 25) return 'day';
    if (elevation > 10) return 'morning_afternoon';
    if (elevation > 0) return 'golden_hour';
    if (elevation > -6) return 'twilight';
    return 'night';
}

/**
 * 6. MapLibre directional light parameters:
 * position: [radial, azimuth, polarAngle] where polarAngle = 90 - max(2, elevation)
 *
 * @param {number} azimuth - Light azimuth in degrees (0..360)
 * @param {number} elevation - Light elevation in degrees
 * @param {'day' | 'morning_afternoon' | 'golden_hour' | 'twilight' | 'night'} phase
 * @param {number} [radial=1.5] - Distance of light source
 * @returns {{
 *   anchor: 'map',
 *   color: string,
 *   intensity: number,
 *   position: [number, number, number]
 * }}
 */
export function calculateMapLight(azimuth, elevation, phase, radial = 1.5) {
    const isNight = phase === 'night';
    const effectiveAzimuth = isNight ? MOONLIGHT_CONFIG.azimuth : azimuth;
    const effectiveElevation = isNight ? MOONLIGHT_CONFIG.elevation : elevation;

    const phaseConfig = DAYLIGHT_PHASES[phase] || DAYLIGHT_PHASES.day;
    const color = isNight ? MOONLIGHT_CONFIG.color : phaseConfig.color;
    const intensity = isNight ? MOONLIGHT_CONFIG.intensity : phaseConfig.intensity;

    const clampedElevation = Math.max(2, effectiveElevation);
    const polarAngle = 90 - clampedElevation;

    return {
        anchor: 'map',
        color,
        intensity,
        position: [
            radial,
            Number(effectiveAzimuth.toFixed(2)),
            Number(polarAngle.toFixed(2))
        ]
    };
}

/**
 * 7. Ground shadow offset calculation:
 * shadowAzimuth = (azimuth + 180) % 360
 * shadowLength = cot(max(8, elevation))
 * Calculates shadow offset x, y, blur, opacity.
 *
 * @param {number} azimuth - Light azimuth in degrees
 * @param {number} elevation - Light elevation in degrees
 * @param {'day' | 'morning_afternoon' | 'golden_hour' | 'twilight' | 'night'} phase
 * @param {object} [options={}]
 * @param {number} [options.baseDistance=6] - Base height/distance scale in pixels
 * @returns {{
 *   azimuth: number,
 *   length: number,
 *   offsetX: number,
 *   offsetY: number,
 *   blur: number,
 *   opacity: number,
 *   unitX: number,
 *   unitY: number,
 *   cssDropShadow: string,
 *   boxShadow: string
 * }}
 */
export function calculateGroundShadow(azimuth, elevation, phase, options = {}) {
    const isNight = phase === 'night';
    const effectiveAzimuth = isNight ? MOONLIGHT_CONFIG.azimuth : azimuth;
    const effectiveElevation = isNight ? MOONLIGHT_CONFIG.elevation : elevation;

    const baseDistance = options.baseDistance ?? 6;
    const phaseConfig = DAYLIGHT_PHASES[phase] || DAYLIGHT_PHASES.day;
    const opacity = phaseConfig.shadowOpacity ?? 0.35;

    // Shadow cast in opposite direction to light source
    const shadowAzimuth = (effectiveAzimuth + 180) % 360;

    // shadowLength = cot(max(8, elevation)) = 1 / tan(max(8, elevation))
    const clampedElevation = Math.max(8, effectiveElevation);
    const clampedElevationRad = degToRad(clampedElevation);
    const shadowLength = 1 / Math.tan(clampedElevationRad);

    // Coordinate mapping (clockwise from North: 0° N -> -Y, 90° E -> +X, 180° S -> +Y, 270° W -> -X)
    const shadowAzRad = degToRad(shadowAzimuth);
    const unitX = Math.sin(shadowAzRad);
    const unitY = -Math.cos(shadowAzRad);

    const offsetX = Number((baseDistance * shadowLength * unitX).toFixed(2));
    const offsetY = Number((baseDistance * shadowLength * unitY).toFixed(2));
    const blur = Number((3 + shadowLength * 2.2).toFixed(2));

    return {
        azimuth: Number(shadowAzimuth.toFixed(2)),
        length: Number(shadowLength.toFixed(3)),
        offsetX,
        offsetY,
        blur,
        opacity,
        unitX: Number(unitX.toFixed(4)),
        unitY: Number(unitY.toFixed(4)),
        cssDropShadow: `drop-shadow(${offsetX}px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity}))`,
        boxShadow: `${offsetX}px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity})`
    };
}

/**
 * Astronomical solar calculator for Saint Petersburg.
 *
 * @param {number|Date} [hour] - Hour in Saint Petersburg civil time (0..24), or Date object.
 *                                Defaults to current Saint Petersburg time if omitted.
 * @param {number} [dayOfYear=246] - Day of year (1..365/366, default 246: September 3)
 * @param {object} [options={}]
 * @param {boolean} [options.isSolarTime=false] - If true, treats `hour` directly as Local Solar Time.
 * @param {number} [options.baseDistance=6] - Distance scale in pixels for ground shadow offset.
 * @param {number} [options.radial=1.5] - Distance multiplier for MapLibre directional light.
 *
 * @returns {{
 *   hour: number,
 *   dayOfYear: number,
 *   solarTime: number,
 *   declination: number,
 *   hourAngle: number,
 *   elevation: number,
 *   azimuth: number,
 *   phase: 'day' | 'morning_afternoon' | 'golden_hour' | 'twilight' | 'night',
 *   phaseInfo: object,
 *   light: {
 *     azimuth: number,
 *     elevation: number,
 *     color: string,
 *     intensity: number,
 *     isMoon: boolean
 *   },
 *   mapLight: {
 *     anchor: 'map',
 *     color: string,
 *     intensity: number,
 *     position: [number, number, number]
 *   },
 *   shadow: {
 *     azimuth: number,
 *     length: number,
 *     offsetX: number,
 *     offsetY: number,
 *     blur: number,
 *     opacity: number,
 *     unitX: number,
 *     unitY: number,
 *     cssDropShadow: string,
 *     boxShadow: string
 *   }
 * }}
 */
export function calculateSpbSun(hour, dayOfYear = 246, options = {}) {
    let civilHour;
    let dOfYear = dayOfYear;

    if (hour === undefined || hour === null) {
        const now = new Date();
        const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
        civilHour = (utcHours + SPB_TIMEZONE_OFFSET) % 24;
        dOfYear = getDayOfYear(now);
    } else if (hour instanceof Date) {
        const d = hour;
        const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
        civilHour = (utcHours + SPB_TIMEZONE_OFFSET) % 24;
        if (dayOfYear === 246) {
            dOfYear = getDayOfYear(d);
        }
    } else {
        civilHour = Number(hour);
    }

    // 1. Solar declination δ = 23.45° * sin((360/365) * (dayOfYear - 81) * deg)
    const declination = calculateDeclination(dOfYear);

    // 2. Solar time and hour angle ω = 15° * (solarTime - 12)
    const solarTime = options.isSolarTime
        ? ((civilHour % 24) + 24) % 24
        : calculateSolarTime(civilHour, dOfYear, SPB_LONGITUDE, SPB_LSTM);

    const hourAngle = calculateHourAngle(solarTime);

    // 3. Elevation α: sin(α) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(ω)
    const elevation = calculateElevation(SPB_LATITUDE, declination, hourAngle);

    // 4. Azimuth θ: cos(θ) = (sin(dec)*cos(lat) - cos(dec)*sin(lat)*cos(ω)) / cos(α)
    const azimuth = calculateAzimuth(SPB_LATITUDE, declination, hourAngle, elevation);

    // 5. Phases of daylight
    const phase = getDaylightPhase(elevation);
    const phaseInfo = DAYLIGHT_PHASES[phase];
    const isNight = phase === 'night';

    const effectiveLight = {
        azimuth: isNight ? MOONLIGHT_CONFIG.azimuth : Number(azimuth.toFixed(2)),
        elevation: isNight ? MOONLIGHT_CONFIG.elevation : Number(elevation.toFixed(2)),
        color: isNight ? MOONLIGHT_CONFIG.color : phaseInfo.color,
        intensity: isNight ? MOONLIGHT_CONFIG.intensity : phaseInfo.intensity,
        isMoon: isNight
    };

    // 6. MapLibre directional light parameters
    const mapLight = calculateMapLight(
        azimuth,
        elevation,
        phase,
        options.radial ?? 1.5
    );

    // 7. Ground shadow offset calculation
    const shadow = calculateGroundShadow(
        azimuth,
        elevation,
        phase,
        options
    );

    return {
        hour: Number(civilHour.toFixed(4)),
        dayOfYear: dOfYear,
        solarTime: Number(solarTime.toFixed(4)),
        declination: Number(declination.toFixed(2)),
        hourAngle: Number(hourAngle.toFixed(2)),
        elevation: Number(elevation.toFixed(2)),
        azimuth: Number(azimuth.toFixed(2)),
        phase,
        phaseInfo,
        light: effectiveLight,
        mapLight,
        shadow
    };
}
