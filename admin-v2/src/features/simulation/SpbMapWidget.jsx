import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Compass } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export const SPB_LOCATIONS = [
    {
        id: 'petrogradka_home',
        name: 'Квартира на Петроградке',
        shortName: 'Дом',
        district: 'Петроградская сторона',
        icon: '🏠',
        lat: 59.9589,
        lng: 30.3049,
        description: 'Уютная съёмная квартира, ноутбук, гардероб и отдых.'
    },
    {
        id: 'cafe_sloy',
        name: 'Кофейня «Слой»',
        shortName: 'Кафе «Слой»',
        district: 'Петроградская сторона',
        icon: '☕',
        lat: 59.9612,
        lng: 30.3121,
        description: 'Любимый кофе, миндальные круассаны и встречи с Настей.'
    },
    {
        id: 'vkusvill_lenina',
        name: 'ВкусВилл на Ленина',
        shortName: 'ВкусВилл',
        district: 'Большая Пушкарская',
        icon: '🛒',
        lat: 59.9563,
        lng: 30.2986,
        description: 'Продукты, готовая еда и перекусы на скорую руку.'
    },
    {
        id: 'showroom_work',
        name: 'Шоурум Макса (ВО)',
        shortName: 'Шоурум',
        district: 'Васильевский остров',
        icon: '👗',
        lat: 59.9386,
        lng: 30.2731,
        description: 'Шоурум одежды на ВО, съёмки контента и рабочие смены.'
    },
    {
        id: 'bar_rubinsteina',
        name: 'Бар на Рубинштейна',
        shortName: 'Бар',
        district: 'Центральный район',
        icon: '🍸',
        lat: 59.9294,
        lng: 30.3437,
        description: 'Коктейли, вечерняя тусовка и общение с друзьями.'
    },
    {
        id: 'spbgik',
        name: 'СПбГИК (Институт культуры)',
        shortName: 'СПбГИК',
        district: 'Дворцовая набережная',
        icon: '🎓',
        lat: 59.9427,
        lng: 30.3197,
        description: '2 курс кафедры медиа, лекции и студенческие пары.'
    }
];

export function SpbMapWidget({ currentLocation = 'petrogradka_home', isTransit = false, onLocationChanged, toast }) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({});
    const [moving, setMoving] = useState(false);
    const [selectedLoc, setSelectedLoc] = useState(null);
    const [leafletReady, setLeafletReady] = useState(false);

    const activeLoc = SPB_LOCATIONS.find(l => l.id === currentLocation) || SPB_LOCATIONS[0];
    const previewLoc = selectedLoc || activeLoc;

    // Load Leaflet dynamically if not loaded
    useEffect(() => {
        if (window.L) {
            setLeafletReady(true);
            return;
        }

        // Add Leaflet CSS
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // Add Custom Dark Theme Style for OpenStreetMap Tiles
        if (!document.getElementById('leaflet-dark-style')) {
            const style = document.createElement('style');
            style.id = 'leaflet-dark-style';
            style.innerHTML = `
                .osm-dark-tiles {
                    filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%) !important;
                }
                .leaflet-container {
                    background: #090d16 !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Add Leaflet JS
        if (!document.getElementById('leaflet-js')) {
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => setLeafletReady(true);
            document.head.appendChild(script);
        } else {
            const checkL = setInterval(() => {
                if (window.L) {
                    clearInterval(checkL);
                    setLeafletReady(true);
                }
            }, 100);
        }
    }, []);

    // Initialize Leaflet Map
    useEffect(() => {
        if (!leafletReady || !mapContainerRef.current || mapInstanceRef.current) return;

        const L = window.L;
        const initialLoc = activeLoc;
        const map = L.map(mapContainerRef.current, {
            center: [initialLoc.lat, initialLoc.lng],
            zoom: 13,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            className: 'osm-dark-tiles'
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = map;

        // invalidateSize when rendered inside grid
        setTimeout(() => {
            map.invalidateSize();
        }, 200);

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [leafletReady]);

    // Update markers on map
    useEffect(() => {
        if (!leafletReady || !mapInstanceRef.current) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        Object.values(markersRef.current).forEach(m => m.remove());
        markersRef.current = {};

        SPB_LOCATIONS.forEach(loc => {
            const isCurrent = loc.id === currentLocation;
            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        background: ${isCurrent ? '#3b82f6' : 'rgba(15,23,42,0.92)'};
                        border: ${isCurrent ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.25)'};
                        box-shadow: ${isCurrent ? '0 0 16px rgba(59,130,246,0.9)' : '0 4px 10px rgba(0,0,0,0.6)'};
                        color: #ffffff;
                        padding: 3px 7px;
                        border-radius: 20px;
                        font-size: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        white-space: nowrap;
                        transform: translate(-50%, -50%);
                    ">
                        <span>${loc.icon}</span>
                        <span>${loc.shortName}</span>
                        ${isCurrent ? '<span style="width:5px;height:5px;border-radius:50%;background:#4ade80;display:inline-block;"></span>' : ''}
                    </div>
                `,
                iconSize: [0, 0]
            });

            const marker = L.marker([loc.lat, loc.lng], { icon: customIcon }).addTo(map);
            marker.on('click', () => {
                setSelectedLoc(loc);
                map.panTo([loc.lat, loc.lng], { animate: true, duration: 0.5 });
            });

            markersRef.current[loc.id] = marker;
        });

        if (activeLoc) {
            map.panTo([activeLoc.lat, activeLoc.lng], { animate: true, duration: 0.5 });
        }
    }, [leafletReady, currentLocation]);

    async function moveTo(locationId) {
        if (locationId === currentLocation) return;
        setMoving(true);
        try {
            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ locationId })
            });
            toast?.(`Лера перемещена в локацию: ${previewLoc.name}`);
            onLocationChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setMoving(false);
        }
    }

    return (
        <Card className="spb-map-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <CardHeader
                eyebrow="Интерактивная карта СПб"
                title="Локация Леры"
                description={`Точка: ${activeLoc.name}`}
                action={
                    <Badge variant={isTransit ? 'yellow' : 'green'} style={{ fontSize: 10 }}>
                        {isTransit ? '🚶 В пути...' : `📍 ${activeLoc.shortName}`}
                    </Badge>
                }
            />

            {/* Real Interactive Leaflet Map Container */}
            <div
                ref={mapContainerRef}
                style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 180,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    background: '#090d16'
                }}
            />

            {/* Selected Location Details & 1-Click Move Button */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 11
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15 }}>{previewLoc.icon}</span>
                    <strong style={{ color: '#f1f5f9' }}>{previewLoc.name}</strong>
                </div>

                {previewLoc.id !== currentLocation ? (
                    <Button
                        size="xs"
                        variant="primary"
                        disabled={moving}
                        onClick={() => moveTo(previewLoc.id)}
                    >
                        <Navigation size={11} /> {moving ? '...' : 'Отправить'}
                    </Button>
                ) : (
                    <Badge variant="blue" style={{ fontSize: 9 }}>Здесь</Badge>
                )}
            </div>
        </Card>
    );
}

export default SpbMapWidget;
