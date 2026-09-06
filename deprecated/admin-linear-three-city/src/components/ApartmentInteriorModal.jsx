/**
 * ApartmentInteriorModal.jsx
 * 
 * Full 3D Interactive Historic Apartment for Lera on Petrogradka.
 * Features:
 * - Real-time Three.js WebGL canvas (60 FPS, ACES Filmic, PBR herringbone floor, arched window)
 * - 3D Lera character avatar with animated walk, idle, jump & Plumbob
 * - Fast First-Person Mode: 3.2 m/s walk, 5.8 m/s sprint, Space jump physics & obstacle hopping
 * - The Sims Mode: Point-and-Click navigation (click to walk), visual target marker, wall cutaway
 * - Zoom In & Out: wheel zoom, pinch-to-zoom on touch, on-screen zoom buttons
 * - Orbit camera rotation in Sims mode (right-click drag / rotate buttons)
 * - Dynamic St. Petersburg daylight/sunset/night sky and outdoor rooftops silhouette
 * - Dual-phase Esc handling (1st Esc frees cursor & reveals HUD; 2nd Esc exits to street)
 * - Mobile dual-zone touch controls (virtual joystick + swipe look + pinch zoom)
 * - Zero GPU leaks (strict dispose lifecycle on unmount)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    X,
    Compass,
    Eye,
    Grid3X3,
    Sun,
    Sunset,
    Moon,
    CloudRain,
    Lightbulb,
    Laptop,
    Sparkles,
    Move,
    ZoomIn,
    ZoomOut,
    RotateCw,
    ArrowUp
} from 'lucide-react';
import { LeraRoomScene } from '@/lib/threeRoom/LeraRoomScene.js';
import { calculateSpbSun } from '@/lib/solarCalculator.js';

export function ApartmentInteriorModal({
    isOpen,
    onClose,
    snapshot = null,
    weather = null,
    needs = null,
    activeTask = null
}) {
    const containerRef = useRef(null);
    const sceneRef = useRef(null);

    // Mode: 'first_person' | 'sims'
    const [cameraMode, setCameraMode] = useState('first_person');
    const [isPointerLocked, setIsPointerLocked] = useState(false);

    // Light states
    const [isFloorLampOn, setIsFloorLampOn] = useState(true);
    const [isNightstandOn, setIsNightstandOn] = useState(true);
    const [isMacBookOn, setIsMacBookOn] = useState(true);

    // Mobile touch detection
    const [isTouchDevice, setIsTouchDevice] = useState(false);

    useEffect(() => {
        setIsTouchDevice(
            typeof window !== 'undefined' &&
            ('ontouchstart' in window || navigator.maxTouchPoints > 0)
        );
    }, []);

    // Sun and time of day in St. Petersburg
    const sun = calculateSpbSun(new Date());
    const isRaining = Boolean(weather?.is_raining || weather?.is_drizzling);

    let timeOfDayLabel = 'Ночь в СПб';
    let TimeIcon = Moon;
    if (sun.elevation > 0 && sun.phase === 'dawn') {
        timeOfDayLabel = 'Рассвет на Петроградке';
        TimeIcon = Sunset;
    } else if (sun.elevation > 12) {
        timeOfDayLabel = 'День в СПб';
        TimeIcon = Sun;
    } else if (sun.elevation > 0 && (sun.phase === 'dusk' || sun.elevation <= 12)) {
        timeOfDayLabel = 'Закат на Петроградке';
        TimeIcon = Sunset;
    }

    // Vitals
    const energy = needs?.energy?.value ?? needs?.fatigue?.value ?? 78;
    const hunger = needs?.hunger?.value ?? 34;
    const mood = needs?.mood?.value ?? needs?.boredom?.value ?? 85;
    const actionLabel = activeTask?.label || activeTask?.title || snapshot?.state?.current_action || 'Отдыхает в комнате';
    const currentThought = snapshot?.state?.current_thought || 'На Петроградке такой приятный свет сегодня...';

    // 1. Initialize 3D Scene when modal opens
    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        const scene = new LeraRoomScene(containerRef.current, {
            onLockChange: (locked) => {
                setIsPointerLocked(locked);
            }
        });
        sceneRef.current = scene;

        // Apply initial sun illumination
        scene.updateSun(sun);

        return () => {
            if (sceneRef.current) {
                sceneRef.current.dispose();
                sceneRef.current = null;
            }
        };
    }, [isOpen]);

    // Update sun if time or weather prop updates
    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.updateSun(sun);
        }
    }, [weather]);

    // 2. Dual-Phase Esc Handling (Emil Kowalski Craft UX)
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (document.pointerLockElement) {
                    // 1st Esc: PointerLock is active -> browser releases it, we stay in room
                    e.preventDefault();
                    sceneRef.current?.exitPointerLock();
                } else {
                    // 2nd Esc: Cursor is already free -> close room and return to street
                    onClose?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Mode Toggle Callback
    const handleSwitchMode = useCallback((mode) => {
        setCameraMode(mode);
        if (sceneRef.current) {
            sceneRef.current.setCameraMode(mode);
        }
    }, []);

    // PointerLock Request
    const handleEnterFirstPerson = useCallback(() => {
        if (cameraMode !== 'first_person') {
            handleSwitchMode('first_person');
        }
        sceneRef.current?.requestPointerLock();
    }, [cameraMode, handleSwitchMode]);

    // Zoom & Orbit Controls
    const handleZoomIn = useCallback(() => {
        sceneRef.current?.zoomIn();
    }, []);

    const handleZoomOut = useCallback(() => {
        sceneRef.current?.zoomOut();
    }, []);

    const handleRotateOrbit = useCallback(() => {
        sceneRef.current?.rotateOrbit(Math.PI * 0.25); // rotate 45 degrees
    }, []);

    const handleJump = useCallback(() => {
        sceneRef.current?.triggerJump();
    }, []);

    // Light Toggles
    const toggleFloorLamp = useCallback(() => {
        setIsFloorLampOn(prev => {
            const next = !prev;
            sceneRef.current?.toggleFloorLamp(next);
            return next;
        });
    }, []);

    const toggleNightstand = useCallback(() => {
        setIsNightstandOn(prev => {
            const next = !prev;
            sceneRef.current?.toggleBedsideLamp(next);
            return next;
        });
    }, []);

    const toggleMacBook = useCallback(() => {
        setIsMacBookOn(prev => {
            const next = !prev;
            sceneRef.current?.toggleMacBookGlow(next);
            return next;
        });
    }, []);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 backdrop-blur-lg animate-in fade-in duration-200 select-none"
            role="dialog"
            aria-modal="true"
            aria-label="3D Комната Леры"
        >
            <div className="relative w-full h-full max-w-[1540px] max-h-[96vh] m-2 sm:m-4 rounded-3xl bg-[#08090b] border border-white/10 shadow-2xl shadow-black overflow-hidden flex flex-col">
                
                {/* 3D WebGL Canvas Container */}
                <div 
                    ref={containerRef} 
                    className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
                    onClick={() => {
                        if (cameraMode === 'first_person' && !isPointerLocked && !isTouchDevice) {
                            handleEnterFirstPerson();
                        }
                    }}
                />

                {/* TOP FLOATING GLASS HEADER */}
                <div className="relative z-10 flex items-center justify-between p-3.5 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
                    {/* Left: Room Badge & Weather */}
                    <div className="flex items-center gap-3 pointer-events-auto">
                        <div className="w-9 h-9 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-lg shadow-inner">
                            🏠
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-semibold tracking-tight text-white">
                                    Комната Леры
                                </h2>
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                    3D The Sims & 1-е лицо
                                </span>
                            </div>
                            <span className="text-[11px] text-white/60 flex items-center gap-1.5 mt-0.5 font-sans">
                                <TimeIcon className="w-3 h-3 text-amber-400 stroke-[1.5]" />
                                {timeOfDayLabel} · {Math.round(sun.elevation)}° над горизонтом
                                {isRaining && (
                                    <>
                                        <span>·</span>
                                        <CloudRain className="w-3 h-3 text-sky-400 stroke-[1.5]" />
                                        <span className="text-sky-300">Дождь за окном</span>
                                    </>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* Right: Camera Mode Switcher, Zoom & Street Exit */}
                    <div className="flex items-center gap-2 pointer-events-auto">
                        {/* Mode Switcher Buttons */}
                        <div className="flex items-center p-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
                            <button
                                onClick={() => handleSwitchMode('first_person')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                                    cameraMode === 'first_person'
                                        ? 'bg-white/20 text-white shadow-sm'
                                        : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                                }`}
                                title="Вид от 1-го лица (WASD + Space прыжок + мышь)"
                            >
                                <Eye className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span className="hidden sm:inline">1-е лицо</span>
                            </button>

                            <button
                                onClick={() => handleSwitchMode('sims')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                                    cameraMode === 'sims'
                                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 shadow-sm'
                                        : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                                }`}
                                title="The Sims 45° Изометрия с клик-навигацией и Plumbob"
                            >
                                <Grid3X3 className="w-3.5 h-3.5 stroke-[1.5] text-emerald-400" />
                                <span className="hidden sm:inline">The Sims</span>
                            </button>
                        </div>

                        {/* Zoom & Orbit Toolbar */}
                        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
                            <button
                                onClick={handleZoomIn}
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                title="Приблизить камеру (+)"
                            >
                                <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={handleZoomOut}
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                title="Отдалить камеру (-)"
                            >
                                <ZoomOut className="w-3.5 h-3.5" />
                            </button>
                            {cameraMode === 'sims' && (
                                <button
                                    onClick={handleRotateOrbit}
                                    className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                    title="Повернуть ракурс (45°)"
                                >
                                    <RotateCw className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button
                                onClick={handleJump}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 transition-colors"
                                title="Прыжок (Space)"
                            >
                                <ArrowUp className="w-3 h-3" />
                                <span className="hidden md:inline">Прыжок</span>
                            </button>
                        </div>

                        {/* Light Controls Dropdown/Pills */}
                        <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
                            <button
                                onClick={toggleFloorLamp}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                    isFloorLampOn ? 'text-amber-300 bg-amber-500/20' : 'text-white/40 hover:text-white'
                                }`}
                                title="Торшер у кресла"
                            >
                                <Lightbulb className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={toggleNightstand}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                    isNightstandOn ? 'text-amber-300 bg-amber-500/20' : 'text-white/40 hover:text-white'
                                }`}
                                title="Ночник у кровати"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={toggleMacBook}
                                className={`p-1.5 rounded-lg text-xs transition-colors ${
                                    isMacBookOn ? 'text-sky-300 bg-sky-500/20' : 'text-white/40 hover:text-white'
                                }`}
                                title="Экран MacBook"
                            >
                                <Laptop className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Exit button */}
                        <button
                            onClick={onClose}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-xs font-medium text-white transition-all active:scale-[0.96] shadow-lg"
                        >
                            <Compass className="w-3.5 h-3.5 text-[#6366f1] stroke-[1.5]" />
                            <span className="hidden sm:inline">На улицу</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-[0.96]"
                            title="Закрыть (Esc)"
                        >
                            <X className="w-4 h-4 stroke-[1.5]" />
                        </button>
                    </div>
                </div>

                {/* CENTER OVERLAY: CLICK TO LOCK PROMPT (Only in 1st Person when cursor is free) */}
                {cameraMode === 'first_person' && !isPointerLocked && !isTouchDevice && (
                    <div 
                        className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                    >
                        <div 
                            onClick={handleEnterFirstPerson}
                            className="pointer-events-auto cursor-pointer p-5 rounded-2xl bg-black/75 backdrop-blur-xl border border-white/15 shadow-2xl text-center max-w-sm mx-4 hover:border-white/30 transition-all active:scale-[0.98] group"
                        >
                            <div className="w-11 h-11 mx-auto mb-3 rounded-2xl bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-[#818cf8] group-hover:scale-110 transition-transform">
                                <Move className="w-5 h-5 stroke-[1.5]" />
                            </div>
                            <h3 className="text-sm font-semibold text-white mb-1">
                                Кликни для осмотра от 1-го лица
                            </h3>
                            <p className="text-xs text-white/60 mb-3">
                                Быстрый бег, прыжки на Space, осмотр мышью
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-white/50">
                                <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 font-mono text-white/80">WASD</kbd>
                                <span>бег (3.2 м/с)</span>
                                <span className="mx-1">·</span>
                                <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 font-mono text-white/80">Space</kbd>
                                <span>прыжок</span>
                                <span className="mx-1">·</span>
                                <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 font-mono text-white/80">Shift</kbd>
                                <span>спринт</span>
                                <span className="mx-1">·</span>
                                <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 font-mono text-white/80">Esc</kbd>
                                <span>меню</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* THE SIMS MODE OVERLAY BADGE & HINTS */}
                {cameraMode === 'sims' && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/65 backdrop-blur-md border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2.5 pointer-events-none shadow-xl animate-in fade-in slide-in-from-top-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>Кликни по полу, чтобы отправить Леру · Колёсико: зум · Правая кнопка мыши: вращение</span>
                    </div>
                )}

                {/* MOBILE ON-SCREEN HINTS (TOUCHSCREEN) */}
                {isTouchDevice && (
                    <div className="absolute bottom-24 inset-x-4 z-10 flex justify-between pointer-events-none text-[11px] text-white/40">
                        <div className="px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-xs border border-white/10">
                            👈 Левый палец: движение
                        </div>
                        <div className="px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-xs border border-white/10">
                            {cameraMode === 'sims' ? 'Жест двумя пальцами: зум 🤏' : 'Правый палец: обзор 👉'}
                        </div>
                    </div>
                )}

                {/* SPACER */}
                <div className="flex-1 pointer-events-none" />

                {/* BOTTOM FLOATING GLASS HUD: LERA STATUS & VITALS */}
                <div className="relative z-10 p-3 sm:p-4 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-none">
                    <div className="pointer-events-auto max-w-4xl mx-auto rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-2xl">
                        
                        {/* Lera Action & Thought */}
                        <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-xs font-semibold text-white tracking-tight truncate">
                                    {actionLabel}
                                </span>
                                <span className="text-[10px] text-white/40">·</span>
                                <span className="text-[10px] text-white/50">Петроградская, ул. Ленина</span>
                            </div>
                            <p className="text-xs text-white/70 italic truncate">
                                «{currentThought}»
                            </p>
                        </div>

                        {/* Vitals Counters */}
                        <div className="flex items-center gap-3.5 w-full sm:w-auto justify-between sm:justify-end text-xs">
                            <div className="text-center">
                                <span className="text-[10px] text-white/45 block font-medium">Энергия</span>
                                <span className="font-bold text-amber-400">{energy}%</span>
                            </div>
                            <div className="w-px h-5 bg-white/10" />
                            <div className="text-center">
                                <span className="text-[10px] text-white/45 block font-medium">Сытость</span>
                                <span className="font-bold text-emerald-400">{100 - hunger}%</span>
                            </div>
                            <div className="w-px h-5 bg-white/10" />
                            <div className="text-center">
                                <span className="text-[10px] text-white/45 block font-medium">Настроение</span>
                                <span className="font-bold text-rose-400">{mood}%</span>
                            </div>
                            <div className="w-px h-5 bg-white/10" />
                            <button
                                onClick={onClose}
                                className="px-3.5 py-1.5 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-semibold shadow-lg shadow-[#6366f1]/25 transition-all duration-150 active:scale-[0.96]"
                            >
                                На карту
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ApartmentInteriorModal;
