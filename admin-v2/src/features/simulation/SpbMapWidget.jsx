import React, { useState } from 'react';
import { MapPin, Navigation, Compass } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export const SPB_LOCATIONS = [
    {
        id: 'petrogradka_home',
        name: 'Квартира на Петроградке',
        shortName: 'Дом (Петроградка)',
        district: 'Петроградский район',
        icon: '🏠',
        coords: { x: 42, y: 35 },
        description: 'Уютная съёмная квартира, ноутбук, гардероб и отдых.'
    },
    {
        id: 'cafe_sloy',
        name: 'Кофейня «Слой»',
        shortName: 'Кафе «Слой»',
        district: 'Петроградская сторона',
        icon: '☕',
        coords: { x: 55, y: 28 },
        description: 'Любимый кофе, миндальные круассаны и встречи с Настей.'
    },
    {
        id: 'vkusvill_lenina',
        name: 'ВкусВилл на Ленина',
        shortName: 'ВкусВилл',
        district: 'Петроградская сторона',
        icon: '🛒',
        coords: { x: 30, y: 40 },
        description: 'Продукты, готовая еда и перекусы на скорую руку.'
    },
    {
        id: 'showroom_work',
        name: 'Шоурум Макса',
        shortName: 'Шоурум (В.О.)',
        district: 'Васильевский остров',
        icon: '👗',
        coords: { x: 25, y: 65 },
        description: 'Шоурум одежды на ВО, съёмки контента и рабочие задачи.'
    },
    {
        id: 'bar_rubinsteina',
        name: 'Бар на Рубинштейна',
        shortName: 'Бар (Рубинштейна)',
        district: 'Центральный район',
        icon: '🍸',
        coords: { x: 75, y: 72 },
        description: 'Коктейли, вечерняя тусовка и общение с друзьями.'
    },
    {
        id: 'spbgik',
        name: 'СПбГИК (Институт культуры)',
        shortName: 'СПбГИК',
        district: 'Дворцовая набережная',
        icon: '🎓',
        coords: { x: 52, y: 55 },
        description: '2 курс кафедры медиа, лекции и студенческие пары.'
    }
];

export function SpbMapWidget({ currentLocation = 'petrogradka_home', isTransit = false, onLocationChanged, toast }) {
    const [moving, setMoving] = useState(false);
    const [selectedLoc, setSelectedLoc] = useState(null);

    const activeLoc = SPB_LOCATIONS.find(l => l.id === currentLocation) || SPB_LOCATIONS[0];
    const previewLoc = selectedLoc || activeLoc;

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
                eyebrow="Локация и Карта СПб"
                title="Где Лера находится"
                description={`Текущая точка: ${activeLoc.name} (${activeLoc.district})`}
                action={
                    <Badge variant={isTransit ? 'yellow' : 'green'}>
                        {isTransit ? '🚶 В пути...' : `📍 ${activeLoc.shortName}`}
                    </Badge>
                }
            />

            {/* Interactive SVG / Map Grid */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: 220,
                    background: 'radial-gradient(ellipse at center, #1e293b 0%, #090d16 100%)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    userSelect: 'none'
                }}
            >
                {/* Simplified Neva river visual vector */}
                <svg
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.25 }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                >
                    <path
                        d="M 0 50 Q 30 45, 50 60 T 100 65"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="8"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 45 60 Q 55 40, 60 0"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="6"
                        strokeLinecap="round"
                    />
                </svg>

                {/* Location Pins */}
                {SPB_LOCATIONS.map(loc => {
                    const isCurrent = loc.id === currentLocation;
                    const isHovered = selectedLoc?.id === loc.id;

                    return (
                        <button
                            key={loc.id}
                            onClick={() => setSelectedLoc(loc)}
                            style={{
                                position: 'absolute',
                                left: `${loc.coords.x}%`,
                                top: `${loc.coords.y}%`,
                                transform: 'translate(-50%, -50%)',
                                background: isCurrent ? '#3b82f6' : (isHovered ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.85)'),
                                border: isCurrent ? '2px solid #60a5fa' : '1px solid var(--border)',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 16,
                                fontSize: 11,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: isCurrent ? '0 0 14px rgba(59,130,246,0.6)' : 'none',
                                zIndex: isCurrent ? 10 : 2
                            }}
                        >
                            <span>{loc.icon}</span>
                            <span>{loc.shortName}</span>
                            {isCurrent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />}
                        </button>
                    );
                })}
            </div>

            {/* Selected Location Info & Quick Move Button */}
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
                    <span style={{ fontSize: 16 }}>{previewLoc.icon}</span>
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
