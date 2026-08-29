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

        // CartoDB Dark Matter tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = map;

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

        // Clear existing markers
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
                        background: ${isCurrent ? '#3b82f6' : 'rgba(15,23,42,0.9)'};
                        border: ${isCurrent ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)'};
                        box-shadow: ${isCurrent ? '0 0 16px rgba(59,130,246,0.8)' : '0 4px 10px rgba(0,0,0,0.5)'};
                        color: #ffffff;
                        padding: 3px 8px;
                        border-radius: 20px;
                        font-size: 11px;
                        font-weight: 600;
                        cursor: pointer;
                        white-space: nowrap;
                        transform: translate(-50%, -50%);
                    ">
                        <span>${loc.icon}</span>
                        <span>${loc.shortName}</span>
                        ${isCurrent ? '<span style="width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;animation:pulse 1.5s infinite;"></span>' : ''}
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
        <Card className="spb-map-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <CardHeader
                eyebrow="Интерактивная карта Санкт-Петербурга"
                title="Локация и маршрут Леры"
                description={`Текущая точка: ${activeLoc.name} · ${activeLoc.district}`}
                action={
                    <Badge variant={isTransit ? 'yellow' : 'green'}>
                        {isTransit ? '🚶 В пути...' : `📍 ${activeLoc.shortName}`}
                    </Badge>
                }
            />

            {/* Real Interactive Leaflet Map Container */}
            <div
                ref={mapContainerRef}
                style={{
                    width: '100%',
                    height: 260,
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
                    padding: '8px 12px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 12
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{previewLoc.icon}</span>
                    <div>
                        <strong style={{ color: '#f1f5f9' }}>{previewLoc.name}</strong>
                        <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>
                            {previewLoc.description}
                        </span>
                    </div>
                </div>

                {previewLoc.id !== currentLocation ? (
                    <Button
                        size="xs"
                        variant="primary"
                        disabled={moving}
                        onClick={() => moveTo(previewLoc.id)}
                    >
                        <Navigation size={12} /> {moving ? 'Перемещаем...' : 'Отправить сюда'}
                    </Button>
                ) : (
                    <Badge variant="blue">Лера уже здесь</Badge>
                )}
            </div>
        </Card>
    );
}

export default SpbMapWidget;
