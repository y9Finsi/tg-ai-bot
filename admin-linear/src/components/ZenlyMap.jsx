/**
 * ZenlyMap.jsx
 * 
 * Zenly-style Interactive Map of Saint Petersburg (Petrogradka & Center).
 * Features:
 * - Dual Engine Architecture: MapLibre GL 3D (Vector + 3D buildings) + Yandex Maps 3.0
 * - 14 Saint Petersburg Points of Interest with zero-drift bottom anchors
 * - Real Transit System: Walk with ETA, Taxi with fare deduction, Admin cheat teleport
 * - Glowing Neon Route Line (GeoJSON LineString) from Lera to destination
 * - Dynamic Sun of SPb (calculateSpbSun): Day (Carto Voyager) ⇄ Night (Carto Dark Matter)
 * - Clean Zenly Bottom Sheet for in-place actions, vitals, and transit choices
 * - Places Catalog modal with instant search and category filtering
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
    Crosshair, 
    Plus, 
    Minus, 
    Zap, 
    Navigation,
    Sun,
    Sunset,
    Moon,
    Sparkles,
    Compass
} from 'lucide-react';
import { api } from '@/lib/api.js';
import { SPB_LOCATIONS, LOCATION_MAP } from '@/lib/simulationConstants.js';
import { calculateSpbSun } from '@/lib/solarCalculator.js';
import { ZenlyFriendPin } from './ZenlyFriendPin.jsx';
import { ZenlyPlacePin } from './ZenlyPlacePin.jsx';
import { ZenlyBottomSheet } from './ZenlyBottomSheet.jsx';
import { ZenlyPlacesCatalogModal } from './ZenlyPlacesCatalogModal.jsx';
import { loadYandexMaps3 } from '@/lib/yandexMapsLoader.js';

// SPb Petrogradka Coordinates [lng, lat]
const PETROGRADKA_CENTER = [30.31448, 59.96175];
const YANDEX_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY || '953e2e92-bc7a-48bb-be96-fb2b70905464';

// MapLibre Styles
const MAPLIBRE_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const MAPLIBRE_STYLE_DAY = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Configure MapLibre web worker endpoint to local bundle
if (typeof window !== 'undefined') {
    try {
        maplibregl.setWorkerUrl('/assets/maplibre-gl-worker.mjs');
    } catch (e) {
        console.warn('[ZenlyMap] Worker config notice:', e);
    }
}

export function ZenlyMap({
    currentLocation = 'petrogradka_home',
    transit = null,
    snapshot = null,
    weather = null,
    needs = {},
    activeTask = null,
    onLocationChanged,
    toast
}) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef(new Map());

    const [activeEngine, setActiveEngine] = useState('loading'); // 'yandex' | 'maplibre' | 'loading'
    const [is3D, setIs3D] = useState(true);
    const [themeMode, setThemeMode] = useState('auto'); // 'auto' | 'day' | 'sunset' | 'night'
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [isCatalogOpen, setIsCatalogOpen] = useState(false);

    // Markers portal containers state { [id]: domElement }
    const [portalNodes, setPortalNodes] = useState({});

    // Calculate SPb Sun position & phase
    const sunData = useMemo(() => calculateSpbSun(), []);

    // Determine active map style based on themeMode and SPb sun
    const effectiveTheme = useMemo(() => {
        if (themeMode !== 'auto') return themeMode;
        if (sunData.phase === 'day' || sunData.phase === 'morning_afternoon') return 'day';
        if (sunData.phase === 'golden_hour') return 'sunset';
        return 'night';
    }, [themeMode, sunData.phase]);

    const activeMapStyle = effectiveTheme === 'day' ? MAPLIBRE_STYLE_DAY : MAPLIBRE_STYLE_DARK;

    // Calculate Lera Coordinates
    const currentLocObj = LOCATION_MAP[currentLocation] || SPB_LOCATIONS[0];
    let leraLng = currentLocObj?.lng || PETROGRADKA_CENTER[0];
    let leraLat = currentLocObj?.lat || PETROGRADKA_CENTER[1];

    if (transit?.path?.length && Number.isFinite(transit.progress)) {
        const segIdx = Math.min(
            transit.path.length - 2,
            Math.floor(transit.progress * (transit.path.length - 1))
        );
        if (segIdx >= 0 && transit.path[segIdx] && transit.path[segIdx + 1]) {
            const segT = (transit.progress * (transit.path.length - 1)) - segIdx;
            const p1 = transit.path[segIdx];
            const p2 = transit.path[segIdx + 1];
            leraLng = p1[0] + (p2[0] - p1[0]) * segT;
            leraLat = p1[1] + (p2[1] - p1[1]) * segT;
        }
    } else if (transit?.coordinate && Array.isArray(transit.coordinate)) {
        // [lat, lng] from backend transit
        leraLat = transit.coordinate[0];
        leraLng = transit.coordinate[1];
    }

    // Dynamic Friends Array (Lera + Nastya + Max)
    const npcs = snapshot?.npcs || {};
    const friends = useMemo(() => [
        {
            id: 'lera',
            name: 'Лера',
            role: 'Студентка СПбГИК · 19 лет',
            avatar: snapshot?.profile?.avatar || null,
            coords: [leraLng, leraLat],
            battery: Math.min(100, Math.max(12, Math.round(needs?.energy || 84))),
            status: transit ? `В пути в ${LOCATION_MAP[transit.to]?.shortName || 'место'}` : (activeTask?.title || activeTask?.description || currentLocObj?.name || 'Дома на Петроградке'),
            timeInPlace: transit ? 'В пути' : '35м',
            address: currentLocObj?.address || currentLocObj?.district || 'Петроградская сторона',
            color: '#8b5cf6',
            isMoving: Boolean(transit),
            speed: transit ? 4.8 : 0,
            needs: needs,
            isLeader: true
        },
        {
            id: 'nastya',
            name: npcs?.nastya?.name || 'Настя',
            role: 'Подруга · СПбГИК',
            avatar: null,
            coords: [30.30155, 59.96025], // At Cafe Sloy
            battery: 76,
            status: 'В кофейне «Слой» ☕',
            timeInPlace: '48м',
            address: 'ул. Ленина, 20 / Большой пр.',
            color: '#ec4899',
            isMoving: false,
            speed: 0
        },
        {
            id: 'max',
            name: npcs?.max?.name || 'Макс',
            role: 'Клиент · Шоурум ВО',
            avatar: null,
            coords: [30.24204, 59.92440], // Sevcable / Showroom
            battery: 91,
            status: 'Севкабель Порт 👗',
            timeInPlace: '1ч 20м',
            address: 'Кожевенная линия, 40',
            color: '#3b82f6',
            isMoving: false,
            speed: 0
        }
    ], [activeTask, currentLocObj, leraLat, leraLng, needs, npcs, snapshot, transit]);

    // All 14 SPb Places
    const places = SPB_LOCATIONS;

    // Route Line GeoJSON management
    const updateRouteLine = useCallback((map, fromCoords, toCoords) => {
        if (!map) return;
        const geojson = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [fromCoords, toCoords]
            }
        };
        const source = map.getSource('route-path-source');
        if (source) {
            source.setData(geojson);
        } else {
            try {
                map.addSource('route-path-source', {
                    type: 'geojson',
                    data: geojson
                });
                map.addLayer({
                    id: 'route-path-glow',
                    type: 'line',
                    source: 'route-path-source',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#38bdf8',
                        'line-width': 8,
                        'line-opacity': 0.45,
                        'line-blur': 3
                    }
                });
                map.addLayer({
                    id: 'route-path-line',
                    type: 'line',
                    source: 'route-path-source',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#0284c7',
                        'line-width': 3.5,
                        'line-dasharray': [2, 1.5],
                        'line-opacity': 0.95
                    }
                });
            } catch (e) {
                console.warn('[ZenlyMap] Error adding route layer:', e);
            }
        }
    }, []);

    const clearRouteLine = useCallback((map) => {
        if (!map) return;
        const source = map.getSource('route-path-source');
        if (source) {
            source.setData({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [] }
            });
        }
    }, []);

    // Draw active transit route if Lera is currently traveling
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || activeEngine !== 'maplibre') return;

        if (transit && transit.from && transit.to) {
            const fromLoc = LOCATION_MAP[transit.from];
            const toLoc = LOCATION_MAP[transit.to];
            if (fromLoc && toLoc) {
                updateRouteLine(map, [fromLoc.lng, fromLoc.lat], [toLoc.lng, toLoc.lat]);
                return;
            }
        }

        if (selectedPlace) {
            updateRouteLine(map, [leraLng, leraLat], [selectedPlace.lng, selectedPlace.lat]);
        } else if (!transit) {
            clearRouteLine(map);
        }
    }, [activeEngine, clearRouteLine, leraLat, leraLng, selectedPlace, transit, updateRouteLine]);

    // Handle Starting Transit (Walk or Taxi)
    const handleStartTransit = useCallback(async (targetLocId, mode, durationMinutes, costRubles = 0) => {
        try {
            const targetLoc = LOCATION_MAP[targetLocId];
            const targetName = targetLoc?.shortName || targetLocId;

            if (mode === 'taxi' && costRubles > 0) {
                const currentWalletRubles = snapshot?.state?.wallet?.rubles || snapshot?.state?.wallet_rubles || 0;
                if (currentWalletRubles < costRubles) {
                    toast?.(`У Леры недостаточно рублей на такси (${costRubles} ₽, есть ${currentWalletRubles} ₽)`, 'warning');
                } else {
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ rublesDelta: -costRubles })
                    });
                }
            }

            // Push TRAVEL task into Radiant queue
            await api('/api/admin/radiant/queue/push', {
                method: 'POST',
                body: JSON.stringify({
                    taskType: 'TRAVEL',
                    targetLocation: targetLocId,
                    durationMinutes: Math.max(3, durationMinutes),
                    priority: 95
                })
            });

            const modeLabel = mode === 'taxi' ? '🚕 Такси вызвано' : '🚶‍♀️ Лера пошла пешком';
            toast?.(`${modeLabel} в «${targetName}» (~${durationMinutes} мин)`, 'success');
            
            setSelectedPlace(null);
            onLocationChanged?.();
        } catch (err) {
            toast?.(`Ошибка отправки: ${err.message}`, 'error');
        }
    }, [onLocationChanged, snapshot, toast]);

    // Handle Admin Cheat Teleport
    const handleTeleport = useCallback(async (targetLocId) => {
        try {
            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ locationId: targetLocId })
            });
            const locName = LOCATION_MAP[targetLocId]?.name || targetLocId;
            toast?.(`⚡ Мгновенный перенос: ${locName}`, 'success');
            setSelectedPlace(null);
            onLocationChanged?.();
        } catch (err) {
            toast?.(`Ошибка перемещения: ${err.message}`, 'error');
        }
    }, [onLocationChanged, toast]);

    // Handle Contextual In-Place Action
    const handleInPlaceAction = useCallback(async (actionKey) => {
        try {
            const locId = currentLocation || 'petrogradka_home';
            switch (actionKey) {
                case 'sleep':
                    await api('/api/admin/radiant/queue/push', {
                        method: 'POST',
                        body: JSON.stringify({
                            taskType: 'SLEEP_NIGHT',
                            targetLocation: locId,
                            durationMinutes: 120,
                            priority: 90
                        })
                    });
                    toast?.('Лера легла спать (+восстановление сил)', 'success');
                    break;
                case 'shower':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ hygieneDelta: 40, moodDelta: 10 })
                    });
                    toast?.('Лера сходила в душ (+свежесть и настроение)', 'success');
                    break;
                case 'work_laptop':
                    await api('/api/admin/radiant/queue/push', {
                        method: 'POST',
                        body: JSON.stringify({
                            taskType: 'WORK_LAPTOP',
                            targetLocation: locId,
                            durationMinutes: 45,
                            priority: 75
                        })
                    });
                    toast?.('Лера работает за ноутбуком над SMM', 'info');
                    break;
                case 'coffee_filter':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ hungerDelta: -20, energyDelta: 25, rublesDelta: -190 })
                    });
                    toast?.('Выпит фильтр-кофей в «Слое» (-190 ₽, +бодрость)', 'success');
                    break;
                case 'croissant':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ hungerDelta: -45, moodDelta: 15, rublesDelta: -240 })
                    });
                    toast?.('Миндальный круассан съеден (-240 ₽, сытость +45%)', 'success');
                    break;
                case 'chat_nastya':
                    await api('/api/admin/radiant/queue/push', {
                        method: 'POST',
                        body: JSON.stringify({
                            taskType: 'SOCIAL_NASTYA',
                            targetLocation: 'cafe_sloy',
                            durationMinutes: 30,
                            priority: 80
                        })
                    });
                    toast?.('Лера болтает с Настей в кофейне «Слой»', 'info');
                    break;
                case 'study_lecture':
                    await api('/api/admin/radiant/queue/push', {
                        method: 'POST',
                        body: JSON.stringify({
                            taskType: 'STUDY',
                            targetLocation: 'spbgik',
                            durationMinutes: 90,
                            priority: 85
                        })
                    });
                    toast?.('Лера на лекции в СПбГИК', 'info');
                    break;
                case 'study_library':
                    await api('/api/admin/radiant/queue/push', {
                        method: 'POST',
                        body: JSON.stringify({
                            taskType: 'STUDY_LIBRARY',
                            targetLocation: 'spbgik',
                            durationMinutes: 60,
                            priority: 75
                        })
                    });
                    toast?.('Лера готовится к зачету в библиотеке', 'info');
                    break;
                case 'work_shift':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ rublesDelta: 1500, fatigueDelta: 30 })
                    });
                    toast?.('Смена в шоуруме завершена (+1500 ₽ на карту)', 'success');
                    break;
                case 'take_reels':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ moodDelta: 15, fatigueDelta: 10 })
                    });
                    toast?.('Снято видео для сторис в шоуруме', 'success');
                    break;
                case 'buy_groceries':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ hungerDelta: -60, rublesDelta: -320 })
                    });
                    toast?.('Куплен готовый обед во ВкусВилле (-320 ₽, сытость +60%)', 'success');
                    break;
                case 'cocktail':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ rublesDelta: -550, moodDelta: 25, fatigueDelta: 10 })
                    });
                    toast?.('Коктейль на Рубинштейна (-550 ₽, +настроение)', 'success');
                    break;
                case 'chill_walk':
                    await api('/api/admin/radiant/mutate', {
                        method: 'POST',
                        body: JSON.stringify({ moodDelta: 20, fatigueDelta: -10 })
                    });
                    toast?.('Прогулка на свежем воздухе (+настроение)', 'success');
                    break;
                default:
                    break;
            }
            onLocationChanged?.();
        } catch (err) {
            toast?.(`Ошибка действия: ${err.message}`, 'error');
        }
    }, [currentLocation, onLocationChanged, toast]);

    // Fast simulation tick
    const handleFastForward = useCallback(async () => {
        try {
            await api('/api/admin/radiant/tick', { method: 'POST' });
            toast?.('Шаг симуляции (+15 мин)', 'success');
            onLocationChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }, [onLocationChanged, toast]);

    // Helper to fly/pan to coordinates
    const flyToCoordinates = useCallback((coords, zoom = 16.5) => {
        if (!mapInstanceRef.current) return;
        const [lng, lat] = coords;

        if (activeEngine === 'yandex') {
            const map = mapInstanceRef.current;
            map.setLocation({
                center: [lng, lat],
                zoom,
                duration: 800
            });
        } else if (activeEngine === 'maplibre') {
            const map = mapInstanceRef.current;
            map.flyTo({
                center: [lng, lat],
                zoom,
                speed: 1.2,
                curve: 1.4,
                essential: true
            });
        }
    }, [activeEngine]);

    // Toggle 3D Tilt
    const handleToggle3D = useCallback(() => {
        const next3D = !is3D;
        setIs3D(next3D);

        if (!mapInstanceRef.current) return;

        if (activeEngine === 'yandex') {
            const map = mapInstanceRef.current;
            map.setLocation({
                tilt: next3D ? (42 * Math.PI) / 180 : 0,
                duration: 600
            });
        } else if (activeEngine === 'maplibre') {
            const map = mapInstanceRef.current;
            map.easeTo({
                pitch: next3D ? 45 : 0,
                duration: 600
            });
        }
    }, [activeEngine, is3D]);

    // Zoom Controls
    const handleZoom = useCallback((delta) => {
        if (!mapInstanceRef.current) return;

        if (activeEngine === 'yandex') {
            const map = mapInstanceRef.current;
            const currentZoom = map.zoom || 16;
            map.setLocation({
                zoom: Math.min(19, Math.max(12, currentZoom + delta)),
                duration: 300
            });
        } else if (activeEngine === 'maplibre') {
            const map = mapInstanceRef.current;
            if (delta > 0) map.zoomIn({ duration: 300 });
            else map.zoomOut({ duration: 300 });
        }
    }, [activeEngine]);

    // Cycle Map Theme
    const handleCycleTheme = useCallback(() => {
        const order = ['auto', 'day', 'sunset', 'night'];
        const nextIdx = (order.indexOf(themeMode) + 1) % order.length;
        const next = order[nextIdx];
        setThemeMode(next);
        const labels = {
            auto: 'Авто (по солнцу СПб)',
            day: 'День (Carto Voyager)',
            sunset: 'Закат',
            night: 'Ночь (Dark Matter)'
        };
        toast?.(`Тема карты: ${labels[next]}`, 'info');
    }, [themeMode, toast]);

    // SETUP MAPLIBRE MARKERS WITH STRICT BOTTOM ANCHOR
    const setupMarkersForMapLibre = useCallback((map) => {
        const newNodes = {};
        friends.forEach(f => {
            let entry = markersRef.current.get(f.id);
            if (!entry?.domEl) {
                const el = document.createElement('div');
                el.className = 'zenly-friend-marker-anchor';
                const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat(f.coords)
                    .addTo(map);
                markersRef.current.set(f.id, { marker, domEl: el });
                newNodes[f.id] = el;
            } else {
                entry.marker.setLngLat(f.coords);
                newNodes[f.id] = entry.domEl;
            }
        });

        places.forEach(p => {
            let entry = markersRef.current.get(p.id);
            if (!entry?.domEl) {
                const el = document.createElement('div');
                el.className = 'zenly-place-marker-anchor';
                const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([p.lng, p.lat])
                    .addTo(map);
                markersRef.current.set(p.id, { marker, domEl: el });
                newNodes[p.id] = el;
            } else {
                newNodes[p.id] = entry.domEl;
            }
        });
        setPortalNodes(newNodes);
    }, [friends, places]);

    // INITIALIZE MAPLIBRE GL 3D VECTOR MAP
    const initMapLibre = useCallback(() => {
        if (!mapContainerRef.current) return;
        mapContainerRef.current.innerHTML = '';

        const maplibre = new maplibregl.Map({
            container: mapContainerRef.current,
            style: activeMapStyle,
            center: [leraLng, leraLat],
            zoom: 16.3,
            pitch: is3D ? 45 : 0,
            bearing: -12,
            antialias: true
        });

        mapInstanceRef.current = maplibre;
        setActiveEngine('maplibre');

        requestAnimationFrame(() => maplibre?.resize());
        setTimeout(() => maplibre?.resize(), 100);
        setTimeout(() => maplibre?.resize(), 300);

        setupMarkersForMapLibre(maplibre);

        maplibre.on('style.load', () => {
            maplibre.resize();
            try {
                if (!maplibre.getLayer('zenly-3d-buildings')) {
                    maplibre.addLayer({
                        id: 'zenly-3d-buildings',
                        source: 'carto',
                        'source-layer': 'building',
                        type: 'fill-extrusion',
                        minzoom: 14,
                        paint: {
                            'fill-extrusion-color': effectiveTheme === 'day' ? '#e2e8f0' : '#181b24',
                            'fill-extrusion-height': ['get', 'render_height'],
                            'fill-extrusion-base': ['get', 'render_min_height'],
                            'fill-extrusion-opacity': 0.85
                        }
                    });
                }
                // Apply astronomical sun directional light
                if (typeof maplibre.setLight === 'function' && sunData?.mapLight) {
                    maplibre.setLight(sunData.mapLight);
                }
            } catch (e) {
                console.warn('[ZenlyMap] Layer notice:', e);
            }
        });
    }, [activeMapStyle, effectiveTheme, is3D, leraLat, leraLng, setupMarkersForMapLibre, sunData]);

    // INITIALIZE YANDEX MAPS 3.0 ON DEMAND
    const initYandexMaps = useCallback(async () => {
        if (!mapContainerRef.current) return;
        toast?.('Подключение к Яндекс Картам 3.0...', 'info');
        try {
            const ymaps3Lib = await loadYandexMaps3(YANDEX_API_KEY);
            mapContainerRef.current.innerHTML = '';
            const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker } = ymaps3Lib;

            const ymap = new YMap(
                mapContainerRef.current,
                {
                    location: {
                        center: [leraLng, leraLat],
                        zoom: 16.2,
                        tilt: is3D ? (42 * Math.PI) / 180 : 0
                    },
                    mode: 'vector'
                }
            );

            ymap.addChild(new YMapDefaultSchemeLayer({ theme: effectiveTheme === 'day' ? 'light' : 'dark' }));
            ymap.addChild(new YMapDefaultFeaturesLayer());

            mapInstanceRef.current = ymap;
            setActiveEngine('yandex');

            // Setup Yandex DOM markers
            const newNodes = {};
            friends.forEach(f => {
                const el = document.createElement('div');
                el.className = 'zenly-friend-marker-anchor';
                const marker = new YMapMarker({ coordinates: f.coords, draggable: false }, el);
                ymap.addChild(marker);
                markersRef.current.set(f.id, { marker, domEl: el });
                newNodes[f.id] = el;
            });
            places.forEach(p => {
                const el = document.createElement('div');
                el.className = 'zenly-place-marker-anchor';
                const marker = new YMapMarker({ coordinates: [p.lng, p.lat], draggable: false }, el);
                ymap.addChild(marker);
                markersRef.current.set(p.id, { marker, domEl: el });
                newNodes[p.id] = el;
            });
            setPortalNodes(newNodes);
            toast?.('Яндекс Карты 3.0 активированы!', 'success');
        } catch (err) {
            console.warn('[ZenlyMap] Yandex Maps 3.0 load error:', err);
            toast?.('API 3.0 недоступен, возврат на MapLibre GL 3D', 'warning');
            initMapLibre();
        }
    }, [effectiveTheme, friends, is3D, leraLat, leraLng, places, toast, initMapLibre]);

    // Initial mount
    useEffect(() => {
        initMapLibre();

        return () => {
            markersRef.current.clear();
            if (mapInstanceRef.current && typeof mapInstanceRef.current.remove === 'function') {
                mapInstanceRef.current.remove();
            }
        };
    }, []);

    // React to Map Theme changes
    useEffect(() => {
        if (activeEngine === 'maplibre' && mapInstanceRef.current) {
            try {
                mapInstanceRef.current.setStyle(activeMapStyle);
            } catch (e) {
                console.warn('[ZenlyMap] Style update error:', e);
            }
        }
    }, [activeEngine, activeMapStyle]);

    // Update marker positions on state change (e.g. Lera walking)
    useEffect(() => {
        if (!mapInstanceRef.current) return;

        if (activeEngine === 'maplibre') {
            friends.forEach(f => {
                const entry = markersRef.current.get(f.id);
                if (entry?.marker) {
                    entry.marker.setLngLat(f.coords);
                }
            });
        } else if (activeEngine === 'yandex') {
            friends.forEach(f => {
                const entry = markersRef.current.get(f.id);
                if (entry?.marker) {
                    entry.marker.update({ coordinates: f.coords });
                }
            });
        }
    }, [leraLng, leraLat, activeEngine, friends]);

    return (
        <div className="relative w-full h-[calc(100vh-52px)] bg-[#090b10] overflow-hidden select-none">
            {/* MAP CANVAS CONTAINER WITH GUARANTEED EXPLICIT HEIGHT */}
            <div 
                ref={mapContainerRef} 
                style={{ height: 'calc(100vh - 52px)', width: '100%' }}
                className="w-full h-full" 
            />

            {/* ZENLY TOP STATUS & ACTION BAR */}
            <div className="absolute top-4 left-0 right-0 w-full z-30 flex flex-col items-center pointer-events-none gap-2 px-4">
                {/* Search & Status Pill */}
                <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#111319]/85 backdrop-blur-xl border border-white/15 shadow-2xl text-xs font-semibold text-white">
                    <div className="flex items-center gap-1.5 text-indigo-400">
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Петроградка · СПб</span>
                    </div>

                    <span className="text-white/20">|</span>

                    {/* Weather badge */}
                    <div className="flex items-center gap-1 text-white/80">
                        <span>{weather?.condition === 'rain' ? '🌧️' : '☀️'}</span>
                        <span>{weather?.temp ? `${weather.temp > 0 ? `+${weather.temp}` : weather.temp}°C` : '+18°C'}</span>
                    </div>

                    <span className="text-white/20">|</span>

                    {/* SPb Sun Theme Switcher */}
                    <button
                        onClick={handleCycleTheme}
                        className="cursor-pointer px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white flex items-center gap-1 transition-colors"
                        title="Режим солнца и темы карты (нажми для смены)"
                    >
                        {themeMode === 'day' && <Sun className="w-3 h-3 text-amber-400" />}
                        {themeMode === 'sunset' && <Sunset className="w-3 h-3 text-orange-400" />}
                        {themeMode === 'night' && <Moon className="w-3 h-3 text-indigo-300" />}
                        {themeMode === 'auto' && <Sparkles className="w-3 h-3 text-sky-400" />}
                        <span>
                            {themeMode === 'auto' ? 'Авто' : (themeMode === 'day' ? 'День' : (themeMode === 'sunset' ? 'Закат' : 'Ночь'))}
                        </span>
                    </button>

                    <span className="text-white/20">|</span>

                    {/* Engine toggle badge */}
                    <div 
                        onClick={() => {
                            if (activeEngine === 'yandex') {
                                toast?.('Переключение на MapLibre GL 3D', 'info');
                                initMapLibre();
                            } else {
                                initYandexMaps();
                            }
                        }}
                        className="cursor-pointer px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-mono font-bold text-white/90 flex items-center gap-1 transition-colors"
                        title="Переключить движок карты (MapLibre / Яндекс)"
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${activeEngine === 'yandex' ? 'bg-amber-400' : 'bg-sky-400'}`} />
                        {activeEngine === 'yandex' ? 'Яндекс 3D' : 'MapLibre'}
                    </div>

                    <span className="text-white/20">|</span>

                    {/* Catalog button */}
                    <button
                        onClick={() => setIsCatalogOpen(true)}
                        className="cursor-pointer px-2.5 py-0.5 rounded-full bg-indigo-600/60 hover:bg-indigo-600 text-[11px] font-bold text-white flex items-center gap-1 transition-all"
                    >
                        <Compass className="w-3 h-3" />
                        <span>Места ({places.length})</span>
                    </button>
                </div>

                {/* ZENLY QUICK FRIENDS ROW (CHIPS) */}
                <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto max-w-full px-2 py-1 scrollbar-none">
                    {friends.map(friend => {
                        const isSelected = selectedFriend?.id === friend.id;
                        return (
                            <button
                                key={friend.id}
                                onClick={() => {
                                    flyToCoordinates(friend.coords, 17);
                                    setSelectedFriend(friend);
                                    setSelectedPlace(null);
                                }}
                                className={`px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold transition-all backdrop-blur-xl border cursor-pointer ${
                                    isSelected
                                        ? 'bg-white text-black border-white shadow-xl scale-105'
                                        : 'bg-[#151720]/85 text-white/90 border-white/15 hover:bg-white/10 hover:scale-102'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: friend.color }} />
                                <span>{friend.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                    isSelected ? 'bg-black/10 text-black' : 'bg-white/10 text-white/70'
                                }`}>
                                    {friend.battery}%
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ZENLY FLOATING ACTION BUTTONS (FABS) ON RIGHT SIDE */}
            <div className="absolute right-4 bottom-8 z-30 flex flex-col items-center gap-3">
                {/* 🎯 Locate / Center on Lera */}
                <button
                    onClick={() => {
                        flyToCoordinates([leraLng, leraLat], 17.2);
                        setSelectedFriend(friends[0]);
                        setSelectedPlace(null);
                    }}
                    className="w-12 h-12 rounded-full bg-[#12141c]/90 hover:bg-[#1e2230] active:scale-90 transition-all backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center text-white cursor-pointer group"
                    title="Найти Леру"
                >
                    <Crosshair className="w-5 h-5 text-indigo-400 group-hover:rotate-45 transition-transform" />
                </button>

                {/* 📐 3D / 2D Perspective Toggle */}
                <button
                    onClick={handleToggle3D}
                    className="w-12 h-12 rounded-full bg-[#12141c]/90 hover:bg-[#1e2230] active:scale-90 transition-all backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center text-white font-mono font-black text-xs cursor-pointer"
                    title="Переключить 3D / 2D"
                >
                    <span className={is3D ? 'text-amber-400' : 'text-white/60'}>
                        {is3D ? '3D' : '2D'}
                    </span>
                </button>

                {/* ⚡ Step Simulation (+15m) */}
                <button
                    onClick={handleFastForward}
                    className="w-12 h-12 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-90 transition-all backdrop-blur-xl border border-emerald-500/40 shadow-2xl flex items-center justify-center text-emerald-400 cursor-pointer"
                    title="Шаг симуляции (+15 минут)"
                >
                    <Zap className="w-5 h-5" />
                </button>

                {/* Zoom In & Out */}
                <div className="flex flex-col rounded-full bg-[#12141c]/90 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden">
                    <button
                        onClick={() => handleZoom(1)}
                        className="w-12 h-10 hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center text-white/80 cursor-pointer"
                        title="Приблизить"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <div className="h-[1px] bg-white/10" />
                    <button
                        onClick={() => handleZoom(-1)}
                        className="w-12 h-10 hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center text-white/80 cursor-pointer"
                        title="Отдалить"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* REACT PORTALS: RENDER ZENLY FRIEND PINS */}
            {friends.map(friend => {
                const node = portalNodes[friend.id];
                if (!node) return null;

                return createPortal(
                    <ZenlyFriendPin
                        friend={friend}
                        isSelected={selectedFriend?.id === friend.id}
                        onClick={(f) => {
                            flyToCoordinates(f.coords, 17);
                            setSelectedFriend(f);
                            setSelectedPlace(null);
                        }}
                    />,
                    node
                );
            })}

            {/* REACT PORTALS: RENDER ALL 14 ZENLY PLACE PINS */}
            {places.map(place => {
                const node = portalNodes[place.id];
                if (!node) return null;

                return createPortal(
                    <ZenlyPlacePin
                        place={place}
                        isSelected={selectedPlace?.id === place.id || currentLocation === place.id}
                        onClick={(p) => {
                            flyToCoordinates([p.lng, p.lat], 16.8);
                            setSelectedPlace(p);
                            setSelectedFriend(null);
                        }}
                    />,
                    node
                );
            })}

            {/* ZENLY BOTTOM SHEET CARD (DRAWER FOR TRANSIT OR CHARACTER ACTIONS) */}
            {(selectedFriend || selectedPlace) && (
                <ZenlyBottomSheet
                    friend={selectedFriend}
                    selectedPlace={selectedPlace}
                    currentLocationId={currentLocation}
                    transit={transit}
                    wallet={{
                        rubles: snapshot?.state?.wallet?.rubles || snapshot?.state?.wallet_rubles || 0,
                        stars: snapshot?.state?.wallet?.stars || snapshot?.state?.wallet_stars || 0
                    }}
                    onClose={() => {
                        setSelectedFriend(null);
                        setSelectedPlace(null);
                        clearRouteLine(mapInstanceRef.current);
                    }}
                    onStartTransit={handleStartTransit}
                    onTeleport={handleTeleport}
                    onInPlaceAction={handleInPlaceAction}
                    onFastForward={handleFastForward}
                />
            )}

            {/* PLACES CATALOG MODAL */}
            <ZenlyPlacesCatalogModal
                isOpen={isCatalogOpen}
                onClose={() => setIsCatalogOpen(false)}
                leraCoords={[leraLng, leraLat]}
                currentLocationId={currentLocation}
                onSelectPlace={(place) => {
                    flyToCoordinates([place.lng, place.lat], 17);
                    setSelectedPlace(place);
                    setSelectedFriend(null);
                }}
            />
        </div>
    );
}

export default ZenlyMap;
