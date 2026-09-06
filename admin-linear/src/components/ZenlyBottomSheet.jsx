/**
 * ZenlyBottomSheet.jsx
 * 
 * Clean, authentic Zenly-style bottom sheet for:
 * - Character vitals, wallet, and contextual in-place actions
 * - Real location transit drawer (Walk ETA, Taxi with fare deduction, Admin teleport)
 * - Live transit progress bar when traveling
 */

import React from 'react';
import { 
    X, 
    Zap, 
    Battery, 
    MapPin, 
    Clock, 
    Coffee, 
    GraduationCap, 
    Home, 
    Navigation,
    Wallet,
    Footprints,
    Car,
    Sparkles,
    BedDouble,
    ShowerHead,
    Laptop,
    Briefcase
} from 'lucide-react';
import { 
    SPB_LOCATIONS, 
    LOCATION_MAP, 
    calculateTransitOptions 
} from '@/lib/simulationConstants.js';

export function ZenlyBottomSheet({
    friend,
    selectedPlace,
    currentLocationId,
    transit,
    wallet = { rubles: 0, stars: 0 },
    onClose,
    onStartTransit,
    onTeleport,
    onInPlaceAction,
    onFastForward
}) {
    if (!friend && !selectedPlace) return null;

    // SCENARIO 1: SELECTED DESTINATION PLACE (TRANSIT DRAWER)
    if (selectedPlace) {
        const currentLocObj = LOCATION_MAP[currentLocationId] || SPB_LOCATIONS[0];
        const isCurrentLocation = selectedPlace.id === currentLocationId;
        const options = calculateTransitOptions(
            [currentLocObj.lng, currentLocObj.lat],
            [selectedPlace.lng, selectedPlace.lat]
        );

        return (
            <div 
                className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-full max-w-md pointer-events-auto bg-[#101217]/95 backdrop-blur-2xl border-t border-x border-white/15 rounded-t-[32px] shadow-2xl shadow-black/90 px-5 pt-3 pb-6 animate-in slide-in-from-bottom duration-300">
                    <div className="w-10 h-1.5 bg-white/25 rounded-full mx-auto mb-3" />

                    {/* Place Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-2xl shrink-0 shadow-lg">
                                {selectedPlace.icon}
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white tracking-tight">{selectedPlace.name}</h3>
                                <p className="text-xs text-white/60 mt-0.5">{selectedPlace.address || selectedPlace.district}</p>
                            </div>
                        </div>

                        <button 
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white/80"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <p className="text-xs text-white/50 mt-2.5 line-clamp-2">
                        {selectedPlace.description}
                    </p>

                    {isCurrentLocation ? (
                        <div className="mt-4 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-center">
                            <span className="text-xs font-semibold text-indigo-300">
                                ✨ Лера уже находится здесь
                            </span>
                        </div>
                    ) : (
                        <>
                            {/* Transit Options Grid */}
                            <div className="grid grid-cols-2 gap-2.5 my-3.5">
                                {/* Walk option */}
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between text-xs text-white/70">
                                            <span className="flex items-center gap-1 font-semibold text-white">
                                                <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                                                Пешком
                                            </span>
                                            <span className="text-[10px] font-mono text-white/40">{options.distKm} км</span>
                                        </div>
                                        <div className="text-base font-extrabold text-white mt-1">
                                            ~{options.walk.durationMinutes} мин
                                        </div>
                                        <div className="text-[10px] text-white/50 mt-0.5">
                                            Бесплатно · -{options.walk.energyCost}% сил
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => onStartTransit?.(selectedPlace.id, 'walk', options.walk.durationMinutes)}
                                        className="mt-2.5 w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-emerald-950 cursor-pointer"
                                    >
                                        🚶‍♀️ Идти
                                    </button>
                                </div>

                                {/* Taxi option */}
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between text-xs text-white/70">
                                            <span className="flex items-center gap-1 font-semibold text-white">
                                                <Car className="w-3.5 h-3.5 text-amber-400" />
                                                Такси
                                            </span>
                                            <span className="text-[10px] font-mono text-amber-400 font-bold">
                                                {options.taxi.costRubles} ₽
                                            </span>
                                        </div>
                                        <div className="text-base font-extrabold text-white mt-1">
                                            ~{options.taxi.durationMinutes} мин
                                        </div>
                                        <div className="text-[10px] text-white/50 mt-0.5">
                                            Баланс: {wallet?.rubles || 0} ₽
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => onStartTransit?.(selectedPlace.id, 'taxi', options.taxi.durationMinutes, options.taxi.costRubles)}
                                        className="mt-2.5 w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-amber-950 cursor-pointer"
                                    >
                                        🚕 Заказать
                                    </button>
                                </div>
                            </div>

                            {/* Cheat Teleport for instant testing */}
                            <button
                                onClick={() => onTeleport?.(selectedPlace.id)}
                                className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                                Мгновенный телепорт (God Mode)
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // SCENARIO 2: LERA OR FRIEND PROFILE & IN-PLACE ACTIONS
    const {
        id,
        name,
        role = 'Друг',
        avatar,
        battery = 85,
        status = 'На связи',
        timeInPlace = '35м',
        address = 'Петроградская сторона',
        color = '#ec4899',
        isMoving = false,
        speed = 0,
        needs = {}
    } = friend;

    const isLera = id === 'lera';
    const locId = currentLocationId || 'petrogradka_home';

    // Battery bar color
    let batteryColor = '#10b981';
    if (battery < 20) batteryColor = '#f43f5e';
    else if (battery < 45) batteryColor = '#f59e0b';

    return (
        <div 
            className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="w-full max-w-md pointer-events-auto bg-[#101217]/95 backdrop-blur-2xl border-t border-x border-white/15 rounded-t-[32px] shadow-2xl shadow-black/90 px-5 pt-3 pb-6 animate-in slide-in-from-bottom duration-300">
                <div className="w-10 h-1.5 bg-white/25 rounded-full mx-auto mb-3" />

                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-12 h-12 rounded-full p-0.5 shadow-xl flex items-center justify-center"
                            style={{ background: `linear-gradient(135deg, ${color}, #6366f1)` }}
                        >
                            <div className="w-full h-full rounded-full overflow-hidden bg-[#181a20] flex items-center justify-center">
                                {avatar ? (
                                    <img src={avatar} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xl font-black text-white">{name.charAt(0)}</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-white tracking-tight">{name}</h3>
                                <span className="text-[10px] font-medium text-white/60 bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
                                    {role}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 text-xs text-white/70">
                                <span className="flex items-center gap-1 font-semibold text-emerald-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    {status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white/80"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* TRANSIT PROGRESS BANNER IF MOVING */}
                {transit && (
                    <div className="mt-3 p-3 rounded-2xl bg-sky-950/40 border border-sky-500/30">
                        <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 font-bold text-sky-300">
                                <Navigation className="w-3.5 h-3.5 animate-spin" />
                                В пути: {LOCATION_MAP[transit.from]?.shortName || transit.from} → {LOCATION_MAP[transit.to]?.shortName || transit.to}
                            </span>
                            <span className="font-mono font-extrabold text-sky-400">
                                {Math.round(transit.progress_percent || 0)}%
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                            <div 
                                className="h-full bg-sky-400 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, transit.progress_percent || 0))}%` }}
                            />
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                            <span className="text-[11px] text-white/60">Идет симуляция движения...</span>
                            <button
                                onClick={onFastForward}
                                className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                                <Zap className="w-3 h-3" />
                                +15 мин шаг
                            </button>
                        </div>
                    </div>
                )}

                {/* Vitals & Wallet Bar */}
                {isLera && (
                    <div className="grid grid-cols-3 gap-2 my-3">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-2 text-center">
                            <span className="text-[10px] text-white/50 block">Энергия</span>
                            <span className="text-xs font-mono font-bold text-amber-400">
                                {Math.round(needs?.energy ?? 80)}%
                            </span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-2 text-center">
                            <span className="text-[10px] text-white/50 block">Сытость</span>
                            <span className="text-xs font-mono font-bold text-emerald-400">
                                {Math.round(needs?.hunger ?? 60)}%
                            </span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-2 text-center">
                            <span className="text-[10px] text-white/50 block">Кошелек</span>
                            <span className="text-xs font-mono font-bold text-sky-300">
                                {wallet?.rubles || 0} ₽
                            </span>
                        </div>
                    </div>
                )}

                {/* CONTEXTUAL IN-PLACE ACTIONS */}
                {isLera && !transit && (
                    <div className="mt-2">
                        <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider block mb-2">
                            Действия в локации ({LOCATION_MAP[locId]?.shortName || 'Место'})
                        </span>

                        <div className="grid grid-cols-2 gap-2">
                            {/* Actions based on current place */}
                            {locId === 'petrogradka_home' && (
                                <>
                                    <button
                                        onClick={() => onInPlaceAction?.('sleep')}
                                        className="p-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <BedDouble className="w-4 h-4 text-indigo-400" />
                                        <span>Лечь спать (+сил)</span>
                                    </button>
                                    <button
                                        onClick={() => onInPlaceAction?.('shower')}
                                        className="p-2.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <ShowerHead className="w-4 h-4 text-sky-400" />
                                        <span>В душ (+свежесть)</span>
                                    </button>
                                    <button
                                        onClick={() => onInPlaceAction?.('work_laptop')}
                                        className="col-span-2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <Laptop className="w-4 h-4 text-purple-400" />
                                        <span>Сесть за ноутбук и SMM</span>
                                    </button>
                                </>
                            )}

                            {locId === 'cafe_sloy' && (
                                <>
                                    <button
                                        onClick={() => onInPlaceAction?.('coffee_filter')}
                                        className="p-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <Coffee className="w-4 h-4 text-amber-400" />
                                        <span>Фильтр-кофе (190 ₽)</span>
                                    </button>
                                    <button
                                        onClick={() => onInPlaceAction?.('croissant')}
                                        className="p-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <span>🥐 Круассан (240 ₽)</span>
                                    </button>
                                    <button
                                        onClick={() => onInPlaceAction?.('chat_nastya')}
                                        className="col-span-2 p-2.5 rounded-xl bg-pink-600/30 hover:bg-pink-600/50 border border-pink-500/30 text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <span>💬 Болтать с Настей (+настроение)</span>
                                    </button>
                                </>
                            )}

                            {locId === 'spbgik' && (
                                <>
                                    <button
                                        onClick={() => onInPlaceAction?.('study_lecture')}
                                        className="p-2.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <GraduationCap className="w-4 h-4 text-sky-400" />
                                        <span>Пойти на пару</span>
                                    </button>
                                    <button
                                        onClick={() => onInPlaceAction?.('study_library')}
                                        className="p-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <span>📚 В библиотеку</span>
                                    </button>
                                </>
                            )}

                            {locId === 'showroom_work' && (
                                <>
                                    <button
                                        onClick={() => onInPlaceAction?.('work_shift')}
                                        className="p-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <Briefcase className="w-4 h-4 text-emerald-400" />
                                        <span>Смена (+1500 ₽)</span>
                                    </button>
                                    <button
                                        onClick={() => onInPlaceAction?.('take_reels')}
                                        className="p-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-white text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <span>📸 Снять рилс</span>
                                    </button>
                                </>
                            )}

                            {locId === 'vkusvill_lenina' && (
                                <button
                                    onClick={() => onInPlaceAction?.('buy_groceries')}
                                    className="col-span-2 p-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/30 text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                                >
                                    <span>🥪 Купить готовый обед (320 ₽)</span>
                                </button>
                            )}

                            {locId === 'bar_rubinsteina' && (
                                <button
                                    onClick={() => onInPlaceAction?.('cocktail')}
                                    className="col-span-2 p-2.5 rounded-xl bg-pink-600/30 hover:bg-pink-600/50 border border-pink-500/30 text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                                >
                                    <span>🍸 Заказать коктейль (550 ₽)</span>
                                </button>
                            )}

                            {['new_holland', 'petropavlovka', 'matveevsky_garden', 'lopukhinsky_garden', 'sevcable_port'].includes(locId) && (
                                <button
                                    onClick={() => onInPlaceAction?.('chill_walk')}
                                    className="col-span-2 p-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/30 text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                                >
                                    <span>🌿 Погулять и отдохнуть (+настроение)</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ZenlyBottomSheet;

