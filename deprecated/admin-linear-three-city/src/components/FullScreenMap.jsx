import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '@/lib/api.js';
import { 
    Plus, 
    Minus, 
    Crosshair, 
    MapPin, 
    Check, 
    Car, 
    Flame, 
    Coffee, 
    Briefcase, 
    Zap, 
    X,
    Sun,
    Sunset,
    Moon,
    Compass,
    Video,
    Home
} from 'lucide-react';
import { SPB_LOCATIONS, LOCATION_MAP } from '@/lib/simulationConstants.js';
import { calculateSpbSun } from '@/lib/solarCalculator.js';
import { 
    PETROGRADKA_PEDESTRIANS, 
    interpolatePedestrianPosition, 
    checkSocialProximity,
    AGENT_STATE,
    createLeraTransit,
    interpolateTransitPosition,
    findNavMeshPath
} from '@/lib/pedestrianData.js';
import { createPedestrianCustomLayer } from '@/lib/threePedestrianLayer.js';
import { ROAD_MARKINGS_GEOJSON } from '@/lib/roadMarkingsData.js';
import { ApartmentInteriorModal } from './ApartmentInteriorModal.jsx';

// Fixed NPC Coordinates in SPb [lng, lat]
const NPC_CONFIGS = {
    nastya: {
        id: 'nastya',
        name: 'Настя',
        role: 'Подруга · СПбГИК',
        icon: 'Н',
        color: 'from-rose-500 to-pink-500',
        borderColor: 'border-rose-400',
        badgeColor: 'bg-rose-500',
        coords: [30.312055, 59.961123], // Sidewalk at cafe Sloy [lng, lat]
        homeLocation: 'cafe_sloy'
    },
    max: {
        id: 'max',
        name: 'Макс',
        role: 'Клиент · Шоурум на ВО',
        icon: 'М',
        color: 'from-blue-500 to-cyan-500',
        borderColor: 'border-blue-400',
        badgeColor: 'bg-blue-500',
        coords: [30.31025, 59.95965], // Bolshoy Prospekt / Austrian Sq [lng, lat]
        homeLocation: 'showroom_work'
    }
};

// CARTO GL Vector Styles (Blazing fast, zero watermarks, crisp colors & 3D buildings)
const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const DARK_MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Native vector fill-extrusion architecture without 'fill-extrusion-pattern': facadePatternId (replaces registerAllFacadePatterns(map))
// Color themes for Day / Sunset / Night with crisp contrasting walls & roofs
const LIGHT_THEMES = {
    day: {
        label: 'День',
        icon: Sun,
        waterColor: '#38bdf8',
        parkColor: '#86efac',
        wallColor: '#ecdcb9', // Warm noble Petersburg ochre plaster base
        roofColor: '#596677', // Contrast slate-zinc standing seam tin roof
        buildingOpacity: 0.98,
        bgColor: '#f8fafc',
        lightColor: '#fffdf5',
        lightIntensity: 0.65
    },
    sunset: {
        label: 'Закат',
        icon: Sunset,
        waterColor: '#d97706',
        parkColor: '#15803d',
        wallColor: '#df8c58', // Golden sunset terracotta ochre
        roofColor: '#434857', // Cool dusk tin roof
        buildingOpacity: 0.98,
        bgColor: '#fef3c7',
        lightColor: '#ff8a3d',
        lightIntensity: 0.75
    },
    night: {
        label: 'Ночь',
        icon: Moon,
        waterColor: '#090d16',
        parkColor: '#064e3b',
        wallColor: '#1e2634', // Midnight graphite base
        roofColor: '#121620', // Dark titanium roof
        buildingOpacity: 0.98,
        bgColor: '#08090a',
        lightColor: '#93c5fd',
        lightIntensity: 0.35
    }
};

export function FullScreenMap({
    currentLocation = 'petrogradka_home',
    transit = null,
    snapshot = null,
    weather = null,
    needs = null,
    activeTask = null,
    onLocationChanged,
    toast
}) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({});
    const leraMarkerRef = useRef(null);
    const npcMarkersRef = useRef({});

    const [selectedLoc, setSelectedLoc] = useState(null);
    const [moving, setMoving] = useState(false);
    const [is3D, setIs3D] = useState(true);
    const [isLeraSelected, setIsLeraSelected] = useState(false);
    const [activeNpcMenu, setActiveNpcMenu] = useState(null);
    const [timeMode, setTimeMode] = useState('auto'); // 'auto' | 'day' | 'sunset' | 'night'
    const [isFading, setIsFading] = useState(false);
    const [selectedPedestrian, setSelectedPedestrian] = useState(null);
    const [isApartmentOpen, setIsApartmentOpen] = useState(false);
    const [isFollowCamActive, setIsFollowCamActive] = useState(false);
    const [leraTransitState, setLeraTransitState] = useState(null);
    const pedestrianMarkersRef = useRef([]);

    const isLeraSelectedRef = useRef(false);
    const activeNpcMenuRef = useRef(null);
    const currentStyleRef = useRef(MAP_STYLE_URL);
    const threePedLayerRef = useRef(null);
    const proximityCooldownsRef = useRef(new Map());
    const leraCoordsRef = useRef([SPB_LOCATIONS[0].lng, SPB_LOCATIONS[0].lat]);
    const leraTransitRef = useRef(null);
    const isFollowCamActiveRef = useRef(false);
    isFollowCamActiveRef.current = isFollowCamActive;

    const activeLoc = LOCATION_MAP[currentLocation] || SPB_LOCATIONS[0];
    const previewLoc = selectedLoc || activeLoc;
    const isTransit = Boolean(transit || leraTransitState);

    // Helper to update DOM marker ground shadows dynamically
    const updateMarkerShadows = useCallback((shadow) => {
        if (!shadow) return;
        const shadowEls = document.querySelectorAll('.geo-ground-shadow');
        shadowEls.forEach(el => {
            el.style.transform = `translate(${shadow.offsetX}px, ${shadow.offsetY}px) scaleX(${Math.min(2.5, 0.8 + shadow.length * 0.2)})`;
            el.style.backgroundColor = `rgba(0, 0, 0, ${shadow.opacity})`;
            el.style.filter = `blur(${Math.min(6, shadow.blur)}px)`;
        });
    }, []);

    // Compute astronomical solar position for Saint Petersburg
    const getSunData = useCallback(() => {
        let hour;
        if (timeMode === 'day') hour = 13;
        else if (timeMode === 'sunset') hour = 19.2;
        else if (timeMode === 'night') hour = 23;
        else hour = undefined; // Real-time automatic SPb clock time
        return calculateSpbSun(hour);
    }, [timeMode]);

    const [sunData, setSunData] = useState(() => getSunData());
    const sunDataRef = useRef(sunData);
    sunDataRef.current = sunData;

    // Compute effective lighting theme
    const getEffectiveTheme = useCallback(() => {
        if (timeMode === 'day') return 'day';
        if (timeMode === 'sunset') return 'sunset';
        if (timeMode === 'night') return 'night';
        const sun = getSunData();
        if (sun.phase === 'night') return 'night';
        if (sun.phase === 'golden_hour' || sun.phase === 'twilight') return 'sunset';
        return 'day';
    }, [timeMode, getSunData]);

    const effectiveTheme = getEffectiveTheme();
    const effectiveThemeRef = useRef(effectiveTheme);
    effectiveThemeRef.current = effectiveTheme;

    // Synchronize sun calculations & directional lighting on interval / mode change
    useEffect(() => {
        const update = () => {
            const next = getSunData();
            setSunData(next);
            sunDataRef.current = next;
            if (mapInstanceRef.current && mapInstanceRef.current.setLight) {
                mapInstanceRef.current.setLight(next.mapLight);
            }
            updateMarkerShadows(next.shadow);
        };
        update();

        if (timeMode === 'auto') {
            const timer = setInterval(update, 60000);
            return () => clearInterval(timer);
        }
    }, [timeMode, getSunData, updateMarkerShadows]);

    // Keep refs synchronized
    useEffect(() => {
        isLeraSelectedRef.current = isLeraSelected;
    }, [isLeraSelected]);

    useEffect(() => {
        activeNpcMenuRef.current = activeNpcMenu;
    }, [activeNpcMenu]);

    // Apply 3D Lighting & Layer Colors
    const applyThemeToMap = useCallback((map, themeKey) => {
        if (!map) return;
        const theme = LIGHT_THEMES[themeKey] || LIGHT_THEMES.day;

        const executeApply = () => {
            if (!mapInstanceRef.current) return;
            const hasCarto = map.getSource('carto');
            const hasOfm = map.getSource('openmaptiles');

            if (!hasCarto && !hasOfm) {
                requestAnimationFrame(executeApply);
                return;
            }

            try {
                // 1. Water coloring
                if (map.getLayer('water')) {
                    map.setPaintProperty('water', 'fill-color', theme.waterColor);
                }
                // 2. Parks coloring
                if (map.getLayer('park')) {
                    map.setPaintProperty('park', 'fill-color', theme.parkColor);
                }

                // 3. 3D Buildings: Solid walls in authentic SPb ochre/sandstone palette
                if (!map.getLayer('3d-buildings')) {
                    map.addLayer({
                        id: '3d-buildings',
                        source: hasCarto ? 'carto' : 'openmaptiles',
                        'source-layer': 'building',
                        type: 'fill-extrusion',
                        minzoom: 14,
                        paint: {
                            'fill-extrusion-color': theme.wallColor,
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                14, 0,
                                14.5, ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]
                            ],
                            'fill-extrusion-base': 0,
                            'fill-extrusion-opacity': theme.buildingOpacity || 0.98
                        }
                    });
                } else {
                    map.setPaintProperty('3d-buildings', 'fill-extrusion-color', theme.wallColor);
                    map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', theme.buildingOpacity || 0.98);
                }

                // 4. Dedicated Tin Roof Layer: Contrast zinc-slate metal capping
                if (!map.getLayer('3d-buildings-roof')) {
                    map.addLayer({
                        id: '3d-buildings-roof',
                        source: hasCarto ? 'carto' : 'openmaptiles',
                        'source-layer': 'building',
                        type: 'fill-extrusion',
                        minzoom: 14,
                        paint: {
                            'fill-extrusion-color': theme.roofColor,
                            'fill-extrusion-base': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                14, 0,
                                14.5, ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]
                            ],
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                14, 0,
                                14.5, ['+', ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14], 0.15]
                            ],
                            'fill-extrusion-opacity': 1.0
                        }
                    });
                } else {
                    map.setPaintProperty('3d-buildings-roof', 'fill-extrusion-color', theme.roofColor);
                    map.setPaintProperty('3d-buildings-roof', 'fill-extrusion-opacity', 1.0);
                }

                // 5. Road Markings & Pedestrian Zebras (Inserted immediately beneath '3d-buildings')
                if (!map.getSource('spb-road-markings')) {
                    map.addSource('spb-road-markings', {
                        type: 'geojson',
                        data: ROAD_MARKINGS_GEOJSON
                    });
                }

                const beforeLayerId = '3d-buildings';
                const isNight = themeKey === 'night';
                const isSunset = themeKey === 'sunset';
                const markingColor = isNight ? '#e2e8f0' : (isSunset ? '#fef3c7' : '#ffffff');
                const dividingOpacity = isNight ? 0.72 : (isSunset ? 0.82 : 0.88);
                const zebraOpacity = isNight ? 0.76 : (isSunset ? 0.85 : 0.92);

                // A. Road dividing lines (dashed centerlines along Bolshoy and Kamennoostrovsky)
                if (!map.getLayer('road-dividing-lines')) {
                    map.addLayer({
                        id: 'road-dividing-lines',
                        source: 'spb-road-markings',
                        type: 'line',
                        filter: ['==', ['get', 'type'], 'centerline'],
                        paint: {
                            'line-color': markingColor,
                            'line-width': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                13, 1.2,
                                15, 2.5,
                                17, 3.8
                            ],
                            'line-dasharray': [4, 4],
                            'line-opacity': dividingOpacity
                        }
                    }, beforeLayerId);
                } else {
                    map.setPaintProperty('road-dividing-lines', 'line-color', markingColor);
                    map.setPaintProperty('road-dividing-lines', 'line-opacity', dividingOpacity);
                }

                // B. Pedestrian crosswalks: geometric zebra stripe polygons
                if (!map.getLayer('road-crosswalk-stripes')) {
                    map.addLayer({
                        id: 'road-crosswalk-stripes',
                        source: 'spb-road-markings',
                        type: 'fill',
                        filter: ['==', ['get', 'type'], 'zebra_stripe'],
                        paint: {
                            'fill-color': markingColor,
                            'fill-opacity': zebraOpacity
                        }
                    }, beforeLayerId);
                } else {
                    map.setPaintProperty('road-crosswalk-stripes', 'fill-color', markingColor);
                    map.setPaintProperty('road-crosswalk-stripes', 'fill-opacity', zebraOpacity);
                }

                // C. Pedestrian crosswalks: dashed transverse lines (cleanly replaced by geometric zebra stripes)
                if (!map.getLayer('road-crosswalk-lines')) {
                    map.addLayer({
                        id: 'road-crosswalk-lines',
                        source: 'spb-road-markings',
                        type: 'line',
                        filter: ['==', ['get', 'type'], 'zebra_line'],
                        paint: {
                            'line-color': markingColor,
                            'line-width': 1,
                            'line-dasharray': [1, 1],
                            'line-opacity': 0
                        }
                    }, beforeLayerId);
                } else {
                    map.setPaintProperty('road-crosswalk-lines', 'line-color', markingColor);
                    map.setPaintProperty('road-crosswalk-lines', 'line-opacity', 0);
                }

                // 4. Directional solar / lunar lighting (MapLibre GL map-space directional lighting)
                if (map.setLight) {
                    const currentSun = sunDataRef.current || calculateSpbSun();
                    map.setLight(currentSun.mapLight);
                }

                // 5. GTA 3D Pedestrians Custom Layer (sharing WebGL depth buffer with 3d-buildings)
                if (!map.getLayer('3d-pedestrians') && threePedLayerRef.current) {
                    map.addLayer(threePedLayerRef.current);
                }
            } catch (err) {
                console.warn('[MapLibre Theme Apply Error]', err);
            }
        };

        requestAnimationFrame(executeApply);
    }, []);

    // Apply theme changes dynamically when mode or solar time shifts
    useEffect(() => {
        if (mapInstanceRef.current) {
            applyThemeToMap(mapInstanceRef.current, effectiveTheme);
        }
    }, [effectiveTheme, applyThemeToMap]);

    // Create Lera Floating Tag HTML (anchored above 3D character head & Plumbob)
    function createLeraMarkerElement(selected, inTransit) {
        const el = document.createElement('div');
        el.className = 'sims-lera-container cursor-pointer select-none';
        el.style.width = '110px';
        el.style.height = '32px';

        el.innerHTML = `
            <div class="relative flex flex-col items-center select-none w-full h-full pointer-events-auto">
                <div class="lera-tag px-2.5 py-1 rounded-full bg-[#0e1013]/95 backdrop-blur-md border ${selected ? 'border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.7)]' : 'border-white/25 text-white'} text-[10px] font-semibold tracking-tight shadow-xl flex items-center gap-1.5 whitespace-nowrap transition-all duration-150 hover:scale-105">
                    <span class="lera-label-text">Лера</span>
                    <span class="lera-dot text-emerald-400 text-[9px] ${selected ? '' : 'hidden'}">●</span>
                    <span class="lera-status-icon text-[9px]">${inTransit ? '🚶' : '✨'}</span>
                </div>
            </div>
        `;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            setIsLeraSelected(prev => {
                const next = !prev;
                isLeraSelectedRef.current = next;
                const tag = el.querySelector('.lera-tag');
                const dot = el.querySelector('.lera-dot');
                if (tag) {
                    if (next) {
                        tag.classList.add('border-emerald-400', 'text-emerald-300', 'shadow-[0_0_15px_rgba(52,211,153,0.7)]');
                        tag.classList.remove('border-white/25', 'text-white');
                        dot?.classList.remove('hidden');
                    } else {
                        tag.classList.remove('border-emerald-400', 'text-emerald-300', 'shadow-[0_0_15px_rgba(52,211,153,0.7)]');
                        tag.classList.add('border-white/25', 'text-white');
                        dot?.classList.add('hidden');
                    }
                }
                toast?.(next ? 'Лера выбрана! Кликните на здание или точку для перемещения' : 'Выбор снят', 'info');
                return next;
            });
        });

        return el;
    }

    // Initialize MapLibre GL Map on mount
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        // Set worker URL to guaranteed local endpoint
        maplibregl.setWorkerUrl('/assets/maplibre-gl-worker.mjs');

        const initialLoc = activeLoc;
        const initialTheme = getEffectiveTheme();
        const initialStyle = initialTheme === 'night' ? DARK_MAP_STYLE_URL : MAP_STYLE_URL;
        currentStyleRef.current = initialStyle;

        let map;
        try {
            const defaultCenter = initialLoc.id === 'petrogradka_home' ? [30.3105, 59.9598] : [initialLoc.lng, initialLoc.lat];
            map = new maplibregl.Map({
                container: mapContainerRef.current,
                style: initialStyle,
                center: defaultCenter, // Austrian Square / Bolshoy & Kamennoostrovsky hub
                zoom: 16.3, // Authentic isometric street view showing citizens, traffic & trees
                pitch: 52, // Sims 52° isometric camera angle
                bearing: -15, // Sims isometric perspective
                maxPitch: 70,
                minZoom: 11,
                maxZoom: 21.5,
                attributionControl: false
            });
            if (typeof window !== 'undefined') window.__map = map;
        } catch (err) {
            console.error('[MapLibre Initialization Failed]', err);
            if (typeof window !== 'undefined') window.__mapError = err.message + '\n' + (err.stack || '');
            return;
        }

        // Ensure canvas expands to exact pixel size of container
        requestAnimationFrame(() => map.resize());
        setTimeout(() => map.resize(), 200);

        if (typeof window !== 'undefined') window.__mapErrors = [];
        map.on('error', (e) => {
            console.warn('[MapLibre Event Error]', e?.error?.message || e);
            if (typeof window !== 'undefined') window.__mapErrors.push(e?.error?.message || String(e));
        });

        const onStyleReady = () => {
            console.log('[MapLibre STYLE READY]');
            if (typeof window !== 'undefined') window.__mapLoaded = true;
            map.resize();
            applyThemeToMap(map, effectiveThemeRef.current);
        };

        map.on('style.load', onStyleReady);
        map.on('load', onStyleReady);

        // Click on map terrain
        map.on('click', (e) => {
            if (activeNpcMenuRef.current) {
                setActiveNpcMenu(null);
                return;
            }
            if (isLeraSelectedRef.current) {
                // Find closest location
                let closest = SPB_LOCATIONS[0];
                let minDist = Infinity;
                SPB_LOCATIONS.forEach(loc => {
                    const d = Math.hypot(loc.lat - e.lngLat.lat, loc.lng - e.lngLat.lng);
                    if (d < minDist) {
                        minDist = d;
                        closest = loc;
                    }
                });
                handleTeleport(closest);
            }
        });

        // Pause follow camera when user manually drags map
        map.on('dragstart', () => {
            if (isFollowCamActiveRef.current) {
                isFollowCamActiveRef.current = false;
                setIsFollowCamActive(false);
            }
        });

        mapInstanceRef.current = map;
        if (typeof window !== 'undefined') window.__map = map;

        // 1. Add Location Markers
        SPB_LOCATIONS.forEach(loc => {
            const el = document.createElement('div');
            el.className = 'custom-spb-location cursor-pointer select-none';
            el.innerHTML = `
                <div class="relative flex flex-col items-center select-none" style="width: 54px; height: 52px;">
                    <div class="w-8 h-8 rounded-xl bg-[#121418] border border-white/20 text-white/90 hover:border-white/60 hover:bg-[#1a1d24] hover:scale-110 flex items-center justify-center text-base shadow-xl shadow-black/90 transition-all duration-150">
                        ${loc.icon}
                    </div>
                    <div class="mt-0.5 px-1.5 py-0.5 rounded bg-[#08090a]/95 border border-white/15 text-[9px] font-semibold text-white/90 whitespace-nowrap shadow-md">
                        ${loc.shortName}
                    </div>
                    <div class="w-1.5 h-1.5 rounded-full bg-white/70 shadow mt-0.5"></div>
                </div>
            `;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isLeraSelectedRef.current) {
                    handleTeleport(loc);
                } else {
                    setSelectedLoc(loc);
                    if (loc.id === 'petrogradka_home') {
                        setIsApartmentOpen(true);
                    }
                    map.flyTo({
                        center: [loc.lng, loc.lat],
                        zoom: Math.max(map.getZoom(), 15.5),
                        pitch: 50,
                        duration: 1000
                    });
                }
            });

            const marker = new maplibregl.Marker({
                element: el,
                anchor: 'bottom'
            })
            .setLngLat([loc.lng, loc.lat])
            .addTo(map);

            markersRef.current[loc.id] = marker;
        });

        // 1b. Initialize GTA 3D Pedestrian Custom Layer
        const threeLayer = createPedestrianCustomLayer();
        threePedLayerRef.current = threeLayer;

        if (map.isStyleLoaded() && !map.getLayer('3d-pedestrians')) {
            try {
                map.addLayer(threeLayer);
            } catch (err) {
                console.warn('[MapLibre] Failed to add 3d-pedestrians layer:', err);
            }
        }

        // 2. Add Sims Lera Floating Tag
        const leraEl = createLeraMarkerElement(isLeraSelectedRef.current, isTransit);
        const leraMarker = new maplibregl.Marker({
            element: leraEl,
            anchor: 'bottom',
            offset: [0, -20] // Anchored right above 3D character head
        })
        .setLngLat([initialLoc.lng, initialLoc.lat])
        .addTo(map);

        leraMarkerRef.current = leraMarker;

        // 3. Add NPC Markers (Настя & Макс)
        Object.values(NPC_CONFIGS).forEach(npc => {
            const el = document.createElement('div');
            el.className = `custom-npc-${npc.id} cursor-pointer select-none transition-all duration-200`;
            el.innerHTML = `
                <div class="npc-pill flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0e1013]/95 backdrop-blur-md border ${npc.borderColor} text-white shadow-lg transition-transform duration-150 hover:scale-105">
                    <div class="w-4 h-4 rounded-full bg-gradient-to-tr ${npc.color} flex items-center justify-center text-[9px] font-bold text-white shadow">
                        ${npc.icon}
                    </div>
                    <span class="text-[9px] font-medium tracking-tight whitespace-nowrap">${npc.name}</span>
                    <span class="text-[8px] opacity-75">${npc.id === 'nastya' ? '☕' : '💼'}</span>
                </div>
            `;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                setActiveNpcMenu(npc);
            });

            const npcMarker = new maplibregl.Marker({
                element: el,
                anchor: 'bottom',
                offset: [0, -20]
            })
            .setLngLat(npc.coords)
            .addTo(map);

            npcMarkersRef.current[npc.id] = npcMarker;
        });

        // 4. Add Sims-Style Speech & Thought Bubbles for 3D Pedestrians on Petrogradka
        const pedMarkers = [];
        const startTime = Date.now();

        PETROGRADKA_PEDESTRIANS.forEach(ped => {
            const initialPos = interpolatePedestrianPosition(ped, 0);
            const el = document.createElement('div');
            el.className = `sims-pedestrian-${ped.id} cursor-pointer select-none group pointer-events-auto`;
            el.innerHTML = `
                <div class="relative flex flex-col items-center select-none" style="min-width: 36px;">
                    <!-- Floating Thought / Social Speech Bubble -->
                    <div class="ped-bubble px-2 py-0.5 rounded-full bg-[#0e1013]/95 backdrop-blur-md border border-white/20 text-white shadow-xl flex items-center gap-1.5 transition-all duration-200 group-hover:scale-105">
                        <span class="ped-bubble-icon text-[11px]">${initialPos.thought}</span>
                        <span class="ped-bubble-text hidden text-[10px] text-white/95 max-w-[210px] truncate leading-tight font-medium"></span>
                    </div>
                    <!-- Name Tag on Hover -->
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 px-1.5 py-0.5 rounded bg-black/90 text-[8px] text-neutral-300 font-medium whitespace-nowrap shadow pointer-events-none">
                        ${ped.name} · ${ped.role}
                    </div>
                </div>
            `;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                setSelectedPedestrian(ped);
            });

            const marker = new maplibregl.Marker({
                element: el,
                anchor: 'bottom',
                offset: [0, -18] // Anchored right above 3D character head
            })
            .setLngLat(initialPos.coords)
            .addTo(map);

            pedMarkers.push({
                ped,
                marker,
                el,
                lastThought: initialPos.thought
            });
        });
        pedestrianMarkersRef.current = pedMarkers;

        // Map click handler for 3D character raycast selection
        map.on('click', (e) => {
            if (threePedLayerRef.current) {
                const clickedId = threePedLayerRef.current.raycastCharacter(e.point);
                if (clickedId === 'lera') {
                    setIsLeraSelected(prev => {
                        const next = !prev;
                        isLeraSelectedRef.current = next;
                        toast?.(next ? 'Лера выбрана! Кликните на здание или точку для перемещения' : 'Выбор снят', 'info');
                        return next;
                    });
                } else if (clickedId) {
                    const ped = PETROGRADKA_PEDESTRIANS.find(p => p.id === clickedId);
                    if (ped) {
                        setSelectedPedestrian(ped);
                    }
                }
            }
        });

        // Animate GTA 3D pedestrians and social simulation at ~30 FPS
        let animationFrameId;
        let lastFrameTime = 0;
        const proximityCooldowns = proximityCooldownsRef.current;

        const animatePedestrians = (timestamp) => {
            if (timestamp - lastFrameTime > 33) {
                lastFrameTime = timestamp;
                const now = Date.now();
                const elapsed = now - startTime;

                let leraPos = leraCoordsRef.current || [initialLoc.lng, initialLoc.lat];
                let leraSpeed = 0;
                let leraBearing = 180;
                let leraGaitPhase = 0;
                let leraInTransit = Boolean(isTransit);

                if (leraTransitRef.current) {
                    const tPos = interpolateTransitPosition(leraTransitRef.current, now);
                    leraPos = tPos.coords;
                    leraCoordsRef.current = tPos.coords;
                    leraSpeed = tPos.speed;
                    leraBearing = tPos.bearing;
                    leraGaitPhase = tPos.gaitPhase;
                    leraInTransit = true;

                    if (leraMarkerRef.current) {
                        leraMarkerRef.current.setLngLat(leraPos);
                        const leraText = document.querySelector('.sims-lera-container .lera-label-text');
                        const leraIcon = document.querySelector('.sims-lera-container .lera-status-icon');
                        if (leraText && leraTransitRef.current) {
                            leraText.textContent = leraTransitRef.current.targetAction || `Иду в ${leraTransitRef.current.targetName}`;
                        }
                        if (leraIcon) leraIcon.textContent = '🚶';
                    }

                    if (isFollowCamActiveRef.current && map) {
                        map.easeTo({
                            center: leraPos,
                            duration: 150,
                            easing: t => t
                        });
                    }

                    if (tPos.isFinished) {
                        const targetName = leraTransitRef.current?.targetName;
                        leraTransitRef.current = null;
                        setLeraTransitState(null);
                        const leraText = document.querySelector('.sims-lera-container .lera-label-text');
                        const leraIcon = document.querySelector('.sims-lera-container .lera-status-icon');
                        if (leraText) leraText.textContent = 'Лера';
                        if (leraIcon) leraIcon.textContent = '✨';
                        onLocationChanged?.();
                        toast?.(`Лера дошла: ${targetName || 'на место'}`, 'success');
                    }
                } else if (isFollowCamActiveRef.current && map) {
                    map.easeTo({
                        center: leraPos,
                        duration: 200,
                        easing: t => t
                    });
                }

                const leraState = {
                    id: 'lera',
                    coords: leraPos,
                    inTransit: leraInTransit,
                    bearing: leraBearing,
                    speed: leraSpeed,
                    gaitPhase: leraGaitPhase
                };

                // 1. Calculate positions and states for 10 citizens
                const states = PETROGRADKA_PEDESTRIANS.map(ped => {
                    return interpolatePedestrianPosition(ped, elapsed);
                });

                // 1b. Include fixed NPCs (Nastya and Max) for 3D character rendering
                const npcStates = Object.values(NPC_CONFIGS).map(npc => ({
                    id: npc.id,
                    name: npc.name,
                    coords: npc.coords,
                    speed: 0,
                    state: AGENT_STATE.IDLE_STOP,
                    bearing: 180,
                    gaitPhase: 0,
                    model3d: npc.id === 'nastya' ? { jacketColor: '#f472b6', pantsColor: '#fda4af' } : { jacketColor: '#312e81', pantsColor: '#38bdf8' }
                }));
                const allPedStates = [...states, ...npcStates];

                // 2. Check Social Proximity (<15m) triggering greetings & dialogues
                const greetings = checkSocialProximity(states, leraState, proximityCooldowns, now);

                // 3. Update Three.js 3D character meshes and kinematics
                if (threePedLayerRef.current) {
                    threePedLayerRef.current.updateCharacters(allPedStates, leraState, sunDataRef.current, greetings, now);
                }

                // 4. Update DOM floating speech bubbles and NPC markers with zoom-awareness
                const currentZoom = map.getZoom();
                const isStreetZoom = currentZoom >= 16.0;
                // Dynamically scale vertical offset based on 3D character screen height across zoom levels (snug fit over heads)
                const charOffset = Math.round(18 * Math.pow(2, Math.max(14.0, currentZoom) - 17.2));
                const zoomFade = isStreetZoom ? Math.min(1.0, (currentZoom - 16.0) / 0.5) : 0;

                pedMarkers.forEach(item => {
                    const pos = states.find(s => s.id === item.ped.id);
                    if (!pos) return;

                    item.marker.setLngLat(pos.coords);
                    item.marker.setOffset([0, -charOffset]);

                    if (!isStreetZoom) {
                        item.el.style.display = 'none';
                        return;
                    }

                    item.el.style.display = '';
                    item.el.style.opacity = zoomFade.toFixed(2);
                    item.el.style.pointerEvents = zoomFade > 0.5 ? 'auto' : 'none';
                    if (item.el.firstElementChild) {
                        item.el.firstElementChild.style.transform = `scale(${(0.72 + 0.28 * zoomFade).toFixed(2)})`;
                    }

                    const activeGreet = greetings.find(g => (g.idA === item.ped.id || g.idB === item.ped.id) && g.expiresAt > now);
                    const bubbleEl = item.el.querySelector('.ped-bubble');
                    const iconEl = item.el.querySelector('.ped-bubble-icon');
                    const textEl = item.el.querySelector('.ped-bubble-text');

                    if (activeGreet) {
                        const text = activeGreet.idA === item.ped.id ? activeGreet.dialogueA : activeGreet.dialogueB;
                        if (textEl) {
                            textEl.textContent = `"${text}"`;
                            textEl.classList.remove('hidden');
                        }
                        if (iconEl) iconEl.textContent = '💬';
                        if (bubbleEl) {
                            bubbleEl.classList.add('border-indigo-400/80', 'bg-[#181a20]/95');
                        }
                    } else {
                        if (textEl) textEl.classList.add('hidden');
                        if (iconEl && pos.thought !== item.lastThought) {
                            item.lastThought = pos.thought;
                            iconEl.textContent = pos.thought;
                        }
                        if (bubbleEl) {
                            bubbleEl.classList.remove('border-indigo-400/80', 'bg-[#181a20]/95');
                        }
                    }
                });

                // Update NPC Markers (Настя & Макс)
                Object.values(NPC_CONFIGS).forEach(npc => {
                    const marker = npcMarkersRef.current[npc.id];
                    if (!marker) return;

                    const npcState = npcStates.find(s => s.id === npc.id);
                    if (npcState) {
                        marker.setLngLat(npcState.coords);
                    }
                    const npcOffset = Math.round(20 * Math.pow(2, Math.max(14.0, currentZoom) - 17.2));
                    marker.setOffset([0, -npcOffset]);

                    const el = marker.getElement();
                    if (el) {
                        if (!isStreetZoom) {
                            el.style.display = 'none';
                        } else {
                            el.style.display = '';
                            el.style.opacity = zoomFade.toFixed(2);
                            el.style.pointerEvents = zoomFade > 0.5 ? 'auto' : 'none';
                            if (el.firstElementChild) {
                                el.firstElementChild.style.transform = `scale(${(0.75 + 0.25 * zoomFade).toFixed(2)})`;
                            }
                        }
                    }
                });

                if (leraMarkerRef.current) {
                    leraMarkerRef.current.setLngLat(leraPos);
                    const leraOffset = Math.round(18 * Math.pow(2, Math.max(14.0, currentZoom) - 17.2));
                    leraMarkerRef.current.setOffset([0, -leraOffset]);

                    const el = leraMarkerRef.current.getElement();
                    if (el) {
                        if (!isStreetZoom) {
                            el.style.display = 'none';
                        } else {
                            el.style.display = '';
                            el.style.opacity = zoomFade.toFixed(2);
                            el.style.pointerEvents = zoomFade > 0.5 ? 'auto' : 'none';
                            if (el.firstElementChild) {
                                el.firstElementChild.style.transform = `scale(${(0.75 + 0.25 * zoomFade).toFixed(2)})`;
                            }
                        }
                    }
                }
            }
            animationFrameId = requestAnimationFrame(animatePedestrians);
        };
        animationFrameId = requestAnimationFrame(animatePedestrians);

        // Resize handler
        const handleResize = () => map.resize();
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            pedMarkers.forEach(item => item.marker.remove());
            Object.values(npcMarkersRef.current).forEach(m => m.remove());
            if (leraMarkerRef.current) {
                leraMarkerRef.current.remove();
                leraMarkerRef.current = null;
            }
            if (threePedLayerRef.current && map.getLayer('3d-pedestrians')) {
                try {
                    map.removeLayer('3d-pedestrians');
                } catch (e) {}
            }
            window.removeEventListener('resize', handleResize);
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    // Update theme when timeMode changes
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        const map = mapInstanceRef.current;
        const themeKey = effectiveTheme;
        const targetStyle = themeKey === 'night' ? DARK_MAP_STYLE_URL : MAP_STYLE_URL;

        if (currentStyleRef.current !== targetStyle) {
            setIsFading(true);
            currentStyleRef.current = targetStyle;
            map.setStyle(targetStyle);

            const onDone = () => {
                applyThemeToMap(map, themeKey);
                setTimeout(() => setIsFading(false), 200);
            };
            map.once('styledata', onDone);
            setTimeout(onDone, 300);
        } else {
            applyThemeToMap(map, themeKey);
        }
    }, [effectiveTheme, applyThemeToMap]);

    // Update Lera position when currentLocation changes
    useEffect(() => {
        if (leraTransitRef.current) return;
        const targetPos = [activeLoc.lng, activeLoc.lat];
        leraCoordsRef.current = targetPos;
        if (!leraMarkerRef.current || !mapInstanceRef.current) return;
        leraMarkerRef.current.setLngLat(targetPos);
    }, [currentLocation, activeLoc]);

    // Handle transit prop from backend
    useEffect(() => {
        if (transit && !leraTransitRef.current) {
            const fromLoc = transit.from ? (LOCATION_MAP[transit.from] || activeLoc) : activeLoc;
            const toLoc = transit.to ? (LOCATION_MAP[transit.to] || activeLoc) : activeLoc;
            const fromPos = [fromLoc.lng, fromLoc.lat];
            const toPos = [toLoc.lng, toLoc.lat];
            const tr = createLeraTransit(fromPos, toPos, transit.duration || 22, {
                targetName: toLoc.shortName || toLoc.name,
                targetAction: transit.action || `Иду в ${toLoc.shortName || toLoc.name} ☕`
            });
            leraTransitRef.current = tr;
            setLeraTransitState(tr);
        }
    }, [transit, activeLoc]);

    // Pedestrian walk transit / move command
    async function handleTeleport(loc) {
        if (!loc || moving) return;
        setMoving(true);
        try {
            const fromPos = leraCoordsRef.current || [activeLoc.lng, activeLoc.lat];
            const toPos = [loc.lng, loc.lat];

            // Build smooth zero-collision sidewalk transit mission
            const tr = createLeraTransit(fromPos, toPos, 22, {
                targetName: loc.shortName || loc.name,
                targetAction: `Иду в ${loc.shortName || loc.name} ☕`
            });
            leraTransitRef.current = tr;
            setLeraTransitState(tr);
            setSelectedLoc(loc);
            setIsLeraSelected(false);

            // Activate 3rd-person follow cam
            setIsFollowCamActive(true);
            isFollowCamActiveRef.current = true;

            if (mapInstanceRef.current) {
                mapInstanceRef.current.easeTo({
                    center: fromPos,
                    zoom: Math.max(mapInstanceRef.current.getZoom(), 17.5),
                    pitch: 58,
                    duration: 600
                });
            }

            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ locationId: loc.id })
            });
            toast?.(`Лера отправилась в: ${loc.name}`, 'success');
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setMoving(false);
        }
    }

    // NPC action triggers
    async function handleNpcAction(npc, actionType, payload) {
        try {
            if (actionType === 'queue') {
                await api('/api/admin/radiant/queue/push', {
                    method: 'POST',
                    body: JSON.stringify({
                        taskType: payload.taskType,
                        targetLocation: payload.target,
                        durationMinutes: 45,
                        priority: 80
                    })
                });
                toast?.(`Запланировано: ${payload.label}`, 'success');
                const targetLoc = LOCATION_MAP[payload.target];
                if (targetLoc) {
                    handleTeleport(targetLoc);
                }
            } else if (actionType === 'god') {
                await api('/api/admin/radiant/god-mode', {
                    method: 'POST',
                    body: JSON.stringify({ action: payload.action })
                });
                toast?.(`Триггер: ${payload.label}`, 'success');
            }
            setActiveNpcMenu(null);
            onLocationChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    function handleZoomIn() {
        mapInstanceRef.current?.zoomIn();
    }

    function handleZoomOut() {
        mapInstanceRef.current?.zoomOut();
    }

    function handleRecenter() {
        const target = activeLoc;
        mapInstanceRef.current?.flyTo({
            center: [target.lng, target.lat],
            zoom: 15.5,
            pitch: is3D ? 50 : 0,
            duration: 800
        });
        setSelectedLoc(null);
    }

    function toggle3DMode() {
        const next = !is3D;
        setIs3D(next);
        mapInstanceRef.current?.easeTo({
            pitch: next ? 50 : 0,
            duration: 600
        });
        toast?.(next ? '3D Симс-режим (50° наклон)' : '2D плоский вид', 'info');
    }

    const currentTheme = LIGHT_THEMES[getEffectiveTheme()];

    return (
        <div className="relative w-full h-[calc(100vh-52px)] bg-[#08090a] overflow-hidden select-none">
            {/* Cinematic Transition Fade Overlay */}
            <div 
                className={`absolute inset-0 bg-[#08090a] pointer-events-none transition-opacity duration-200 z-[500] ${
                    isFading ? 'opacity-80' : 'opacity-0'
                }`} 
            />

            {/* MapLibre 3D WebGL Canvas with guaranteed explicit height and static className */}
            <div 
                ref={mapContainerRef} 
                style={{ height: 'calc(100vh - 52px)', width: '100%' }}
                className="w-full h-full" 
            />

            {/* SIMS SELECTION BANNER (Top-Center) */}
            {isLeraSelected && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#0e1013]/95 backdrop-blur-md border border-emerald-400/50 shadow-2xl shadow-black/90 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </div>
                    <span className="text-xs font-semibold text-white tracking-tight">Лера выбрана</span>
                    <span className="text-xs text-white/60 hidden sm:inline">· кликните на любое здание или точку для перемещения</span>
                    <button
                        onClick={() => setIsLeraSelected(false)}
                        className="ml-1 text-[10px] text-white/50 hover:text-white px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                    >
                        Отмена
                    </button>
                </div>
            )}

            {/* FLOATING HUD (Top-Left): Location Status & Day/Night Mode Switcher */}
            <div className="absolute top-4 left-4 z-[1000] max-w-sm w-[calc(100%-2rem)] sm:w-auto space-y-2">
                <div className="rounded-2xl bg-[#0e1013]/90 backdrop-blur-md border border-white/[0.06] p-3 shadow-2xl shadow-black/80 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider font-mono">
                                {isTransit ? 'Транзит' : 'Локация'}
                            </span>
                        </div>
                        <span className="text-[11px] text-white/50 font-mono">
                            СПб · {activeLoc.district}
                        </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">{activeLoc.icon}</span>
                        <div>
                            <h3 className="text-sm font-semibold text-white tracking-tight leading-tight">
                                {activeLoc.name}
                            </h3>
                            <p className="text-xs text-white/50">
                                {activeLoc.description}
                            </p>
                        </div>
                    </div>

                    {isTransit && transit && (
                        <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-white/70">
                                <div className="flex items-center gap-1.5">
                                    <Car className="w-3.5 h-3.5 text-[#5e6ad2] stroke-[1.5]" />
                                    <span>В пути ({LOCATION_MAP[transit.to]?.shortName || transit.to})</span>
                                </div>
                                <span className="font-mono text-xs text-[#5e6ad2]">{transit.progress_percent || 0}%</span>
                            </div>
                            <div className="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                                <div 
                                    className="bg-[#5e6ad2] h-full rounded-full transition-all duration-300"
                                    style={{ width: `${Math.max(5, transit.progress_percent || 0)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Day / Sunset / Night Switcher */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0e1013]/85 backdrop-blur-md border border-white/[0.06] shadow-xl w-fit">
                    <button
                        onClick={() => setTimeMode('day')}
                        title="Дневное освещение"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            getEffectiveTheme() === 'day' && timeMode === 'day'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm'
                                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                        } transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]`}
                    >
                        <Sun className="w-3 h-3 stroke-[1.5]" />
                        <span>День</span>
                    </button>
                    <button
                        onClick={() => setTimeMode('sunset')}
                        title="Золотой закат"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            getEffectiveTheme() === 'sunset' && timeMode === 'sunset'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                        } transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]`}
                    >
                        <Sunset className="w-3 h-3 stroke-[1.5]" />
                        <span>Закат</span>
                    </button>
                    <button
                        onClick={() => setTimeMode('night')}
                        title="Ночной неон"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            getEffectiveTheme() === 'night' && timeMode === 'night'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                                : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                        } transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]`}
                    >
                        <Moon className="w-3 h-3 stroke-[1.5]" />
                        <span>Ночь</span>
                    </button>
                    <button
                        onClick={() => setTimeMode('auto')}
                        title="Авто-синхронизация по астрономическому времени СПб"
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono ${
                            timeMode === 'auto'
                                ? 'bg-white/10 text-white font-semibold'
                                : 'text-white/40 hover:text-white'
                        } transition-[background-color,color,transform] duration-150 active:scale-[0.96]`}
                    >
                        Авто
                    </button>
                </div>

                {/* Real-time Astronomical Solar Telemetry */}
                <div 
                    title={`Астрономический калькулятор СПб (59.95° N, 30.31° E):\nФаза: ${sunData.phaseInfo?.label || sunData.phase}\nВысота (α): ${sunData.elevation > 0 ? `+${sunData.elevation}` : sunData.elevation}°\nАзимут (θ): ${sunData.azimuth}°\nТень: длина ${sunData.shadow.length}x, направление ${sunData.shadow.azimuth}°`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0e1013]/85 backdrop-blur-md border border-white/[0.06] shadow-xl text-[10px] font-mono text-white/70 w-fit select-none"
                >
                    <span className="text-amber-400 text-xs">
                        {sunData.phase === 'night' ? '🌙' : (sunData.phase === 'golden_hour' ? '🌅' : '☀️')}
                    </span>
                    <span className="text-white/90 font-medium">СПб · {sunData.phaseInfo?.label || sunData.phase}</span>
                    <span className="text-white/20">·</span>
                    <span className="text-sky-300">α {sunData.elevation > 0 ? `+${sunData.elevation}` : sunData.elevation}°</span>
                    <span className="text-amber-300">θ {sunData.azimuth}°</span>
                    <span className="text-white/20 hidden sm:inline">·</span>
                    <span className="text-emerald-300 hidden sm:inline">тень {sunData.shadow.length}x</span>
                </div>
            </div>

            {/* FLOATING CONTROLS (Top-Right): Zoom, 3D Toggle & Recenter */}
            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
                <div className="flex flex-col rounded-xl bg-[#0e1013]/90 backdrop-blur-md border border-white/[0.06] p-1 shadow-xl shadow-black/80 space-y-1">
                    <button
                        onClick={handleZoomIn}
                        title="Приблизить"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] transition-[background-color,color,transform] duration-150 active:scale-[0.96]"
                    >
                        <Plus className="w-4 h-4 stroke-[1.5]" />
                    </button>
                    <button
                        onClick={handleZoomOut}
                        title="Отдалить"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.06] transition-[background-color,color,transform] duration-150 active:scale-[0.96]"
                    >
                        <Minus className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>

                <button
                    onClick={toggle3DMode}
                    title="Переключить 3D здания / 2D"
                    className={`w-10 h-10 rounded-xl bg-[#0e1013]/90 backdrop-blur-md border shadow-xl shadow-black/80 flex items-center justify-center font-mono text-xs font-bold transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] ${
                        is3D 
                            ? 'border-emerald-500/50 text-emerald-400 shadow-emerald-500/20' 
                            : 'border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                    }`}
                >
                    3D
                </button>

                <button
                    onClick={handleRecenter}
                    title="Вернуться к Лере"
                    className="w-10 h-10 rounded-xl bg-[#0e1013]/90 backdrop-blur-md border border-white/[0.06] hover:border-white/20 shadow-xl shadow-black/80 flex items-center justify-center text-white/80 hover:text-white transition-[background-color,border-color,transform] duration-150 active:scale-[0.96]"
                >
                    <Crosshair className="w-4 h-4 text-[#5e6ad2] stroke-[1.5]" />
                </button>

                {/* Follow Cam (3rd-person camera lock) */}
                <button
                    onClick={() => {
                        const next = !isFollowCamActive;
                        setIsFollowCamActive(next);
                        isFollowCamActiveRef.current = next;
                        if (next && mapInstanceRef.current) {
                            const pos = leraCoordsRef.current || [activeLoc.lng, activeLoc.lat];
                            mapInstanceRef.current.easeTo({
                                center: pos,
                                zoom: Math.max(mapInstanceRef.current.getZoom(), 17.5),
                                pitch: 58,
                                duration: 600
                            });
                            toast?.('Follow Cam активна: камера следит за Лерой', 'info');
                        } else {
                            toast?.('Follow Cam отключена', 'info');
                        }
                    }}
                    title={isFollowCamActive ? "Отключить Follow Cam" : "Включить Follow Cam (слежение от 3-го лица)"}
                    className={`w-10 h-10 rounded-xl backdrop-blur-md border shadow-xl shadow-black/80 flex flex-col items-center justify-center text-[9px] font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] ${
                        isFollowCamActive
                            ? 'bg-[#5e6ad2] border-[#5e6ad2] text-white shadow-[#5e6ad2]/30 ring-2 ring-[#5e6ad2]/40'
                            : 'bg-[#0e1013]/90 border-white/[0.06] text-white/80 hover:text-white hover:border-white/20'
                    }`}
                >
                    <Video className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span className="text-[8px] mt-0.5">След.</span>
                </button>

                {/* Enter Apartment Shortcut */}
                <button
                    onClick={() => setIsApartmentOpen(true)}
                    title="Зайти в квартиру Леры"
                    className="w-10 h-10 rounded-xl bg-[#0e1013]/90 hover:bg-amber-500/15 backdrop-blur-md border border-white/[0.06] hover:border-amber-500/30 shadow-xl shadow-black/80 flex flex-col items-center justify-center text-[9px] font-semibold text-white/80 hover:text-amber-300 transition-all duration-150 active:scale-[0.96]"
                >
                    <Home className="w-3.5 h-3.5 text-amber-400 stroke-[1.5]" />
                    <span className="text-[8px] mt-0.5">Дом</span>
                </button>

                <button
                    onClick={() => {
                        const map = mapInstanceRef.current;
                        if (!map) return;
                        const z = map.getZoom();
                        if (z < 16.5) {
                            map.flyTo({ zoom: 17.8, pitch: 58, bearing: -15, duration: 700 });
                        } else if (z < 19.2) {
                            map.flyTo({ zoom: 20.2, pitch: 62, bearing: -15, duration: 700 });
                        } else {
                            map.flyTo({ zoom: 15.5, pitch: 45, bearing: -15, duration: 700 });
                        }
                    }}
                    title="Переключить: Улица 3D / Осмотр людей / Район"
                    className="w-10 h-10 rounded-xl bg-[#0e1013]/90 backdrop-blur-md border border-white/[0.06] hover:border-white/20 shadow-xl shadow-black/80 flex flex-col items-center justify-center text-[9px] font-semibold text-white/80 hover:text-white transition-[background-color,border-color,transform] duration-150 active:scale-[0.96]"
                >
                    <span className="text-[10px]">🚶</span>
                    <span className="text-[8px] text-white/60">Улица</span>
                </button>
            </div>

            {/* SIMS NPC ACTION MODAL / BUBBLE */}
            {activeNpcMenu && (
                <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div className="max-w-xs w-full rounded-3xl bg-[#0e1013]/95 border border-white/15 p-4 shadow-2xl shadow-black/90 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${activeNpcMenu.color} flex items-center justify-center text-xs font-bold text-white shadow-sm`}>
                                    {activeNpcMenu.icon}
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold text-white">{activeNpcMenu.name}</h4>
                                    <span className="text-[10px] text-white/50">{activeNpcMenu.role}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveNpcMenu(null)}
                                className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/[0.04] transition-[background-color,color,transform] duration-150 active:scale-[0.96]"
                            >
                                <X className="w-3.5 h-3.5 stroke-[1.5]" />
                            </button>
                        </div>

                        <div className="space-y-1.5 pt-1">
                            {activeNpcMenu.id === 'nastya' ? (
                                <>
                                    <button
                                        onClick={() => handleNpcAction(activeNpcMenu, 'queue', {
                                            label: 'Позвать в «Слой»',
                                            taskType: 'HANG_NASTYA',
                                            target: 'cafe_sloy'
                                        })}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-white transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] text-left"
                                    >
                                        <Coffee className="w-3.5 h-3.5 text-amber-300 stroke-[1.5] shrink-0" />
                                        <span>Позвать в «Слой» (Кофе)</span>
                                    </button>
                                    <button
                                        onClick={() => handleNpcAction(activeNpcMenu, 'god', {
                                            label: 'Драма Насти (+50%)',
                                            action: 'NASTYA_DRAMA_50'
                                        })}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-300 transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] text-left"
                                    >
                                        <Flame className="w-3.5 h-3.5 stroke-[1.5] shrink-0" />
                                        <span>Устроить драму (+50%)</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleNpcAction(activeNpcMenu, 'queue', {
                                            label: 'Обсудить проект на ВО',
                                            taskType: 'CLIENT_WORK',
                                            target: 'showroom_work'
                                        })}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-white transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] text-left"
                                    >
                                        <Briefcase className="w-3.5 h-3.5 text-blue-300 stroke-[1.5] shrink-0" />
                                        <span>Обсудить проект на ВО</span>
                                    </button>
                                    <button
                                        onClick={() => handleNpcAction(activeNpcMenu, 'god', {
                                            label: 'Срочный дедлайн (+40%)',
                                            action: 'CLIENT_DEADLINE_40'
                                        })}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-medium text-amber-300 transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] text-left"
                                    >
                                        <Zap className="w-3.5 h-3.5 stroke-[1.5] shrink-0" />
                                        <span>Сдать дедлайн (+40%)</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* GTA / THE SIMS 3D CITIZEN INSPECTOR CARD */}
            {selectedPedestrian && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[1001] w-[92%] max-w-sm rounded-3xl bg-[#08090a]/95 backdrop-blur-xl border border-white/15 p-4 shadow-2xl shadow-black/90 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${selectedPedestrian.color} border-2 border-white/80 flex items-center justify-center text-xl shadow-md shrink-0`}>
                                {selectedPedestrian.avatar}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-white tracking-tight truncate">{selectedPedestrian.name}</h4>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-medium whitespace-nowrap">
                                        {selectedPedestrian.role}
                                    </span>
                                </div>
                                <p className="text-xs text-white/50 mt-1 leading-relaxed line-clamp-2">
                                    {selectedPedestrian.bio}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedPedestrian(null)}
                            className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-[background-color,color,transform] duration-150 active:scale-[0.96] shrink-0"
                        >
                            <X className="w-4 h-4 stroke-[1.5]" />
                        </button>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                            <span className="text-white/40">Мысли:</span>
                            <span className="text-sm">{selectedPedestrian.thoughts?.slice(0, 4).join(' ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (mapInstanceRef.current && selectedPedestrian.waypoints?.[0]) {
                                        mapInstanceRef.current.flyTo({
                                            center: selectedPedestrian.waypoints[0],
                                            zoom: 16.5,
                                            pitch: 50,
                                            duration: 1000
                                        });
                                    }
                                }}
                                className="flex items-center gap-1 text-[10px] font-medium text-white/70 hover:text-white px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 transition-all duration-150 active:scale-[0.96]"
                            >
                                <Crosshair className="w-3 h-3 stroke-[1.5]" />
                                <span>Фокус</span>
                            </button>
                            <span className="text-[10px] text-emerald-400/90 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                3D GTA Житель
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* FLOATING BOTTOM DOCK: Location quick select & teleport */}
            <div className="absolute bottom-4 left-4 right-4 z-[1000] max-w-4xl mx-auto pb-[env(safe-area-inset-bottom)]">
                <div className="rounded-3xl bg-[#0e1013]/92 backdrop-blur-md border border-white/[0.06] p-3 shadow-2xl shadow-black/90 space-y-2.5">
                    {/* Selected Location Preview Bar */}
                    {previewLoc && (
                        <div className="flex items-center justify-between gap-3 px-1">
                            <div className="flex items-center gap-2 text-xs truncate">
                                <span className="text-base">{previewLoc.icon}</span>
                                <span className="font-semibold text-white tracking-tight">{previewLoc.name}</span>
                                <span className="text-white/50 hidden sm:inline">· {previewLoc.description}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                {previewLoc.id === 'petrogradka_home' && (
                                    <button
                                        onClick={() => setIsApartmentOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold tracking-tight shadow-sm transition-all duration-150 active:scale-[0.96] shrink-0"
                                    >
                                        <Home className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Зайти в квартиру</span>
                                    </button>
                                )}

                                {previewLoc.id !== currentLocation ? (
                                    <button
                                        onClick={() => handleTeleport(previewLoc)}
                                        disabled={moving || Boolean(leraTransitState)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5e6ad2] hover:bg-[#6d78e3] text-white text-xs font-semibold tracking-tight shadow-md transition-[background-color,transform] duration-150 active:scale-[0.96] disabled:opacity-50 shrink-0"
                                    >
                                        <MapPin className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>{moving ? 'Перемещение...' : leraTransitState ? `Идёт в ${previewLoc.shortName}...` : `Отправить Леру в ${previewLoc.shortName}`}</span>
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                                        <Check className="w-3 h-3 stroke-[1.5]" />
                                        <span>Лера здесь</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Location Cards Dock */}
                    <div className="flex overflow-x-auto sm:grid sm:grid-cols-6 gap-1.5 no-scrollbar pb-0.5">
                        {SPB_LOCATIONS.map(loc => {
                            const isCur = loc.id === currentLocation;
                            const isSel = loc.id === previewLoc?.id;

                            return (
                                <button
                                    key={loc.id}
                                    onClick={() => {
                                        setSelectedLoc(loc);
                                        if (mapInstanceRef.current) {
                                            mapInstanceRef.current.flyTo({
                                                center: [loc.lng, loc.lat],
                                                zoom: 15.5,
                                                pitch: 50,
                                                duration: 1000
                                            });
                                        }
                                    }}
                                    className={`min-w-[130px] sm:min-w-0 relative flex flex-col items-start p-2.5 rounded-xl border text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] ${
                                        isCur
                                            ? 'bg-[#5e6ad2]/15 border-[#5e6ad2]/40 text-white ring-1 ring-[#5e6ad2]/30'
                                            : isSel
                                            ? 'bg-white/[0.08] border-white/25 text-white'
                                            : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.05] hover:border-white/15'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full mb-1.5">
                                        <span className="text-base">{loc.icon}</span>
                                        {isCur && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        )}
                                    </div>
                                    <span className="text-xs font-semibold tracking-tight leading-tight truncate w-full">
                                        {loc.shortName}
                                    </span>
                                    <span className="text-[10px] text-white/50 truncate w-full mt-0.5">
                                        {loc.district}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* APARTMENT INTERIOR MODAL (Cozy Linear UI Room View) */}
            <ApartmentInteriorModal
                isOpen={isApartmentOpen}
                onClose={() => setIsApartmentOpen(false)}
                snapshot={snapshot}
                weather={weather}
                needs={needs}
                activeTask={activeTask}
            />
        </div>
    );
}
