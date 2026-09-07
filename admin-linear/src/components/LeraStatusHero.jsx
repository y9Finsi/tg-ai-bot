import React from 'react';
import { LOCATION_MAP, getCycleInfo } from '@/lib/simulationConstants.js';

/**
 * Lera Status Hero Banner matching Figma 15:2765
 * - Dimensions: 1005px x 250px, rounded-[19px]
 * - Background: SPB 3D map + Zenly badge
 * - Center: Avatar (99x100), name "Лера" (24px), handle "@geexy_bot" (16px)
 * - Bottom: 5 stat indicators with Figma SVGs:
 *   1) Clock 15:25
 *   2) Weather +16
 *   3) Wallet 122р
 *   4) Cycle phase 6д - Фолликулярная фаза
 *   5) Location Петроградка
 */
export function LeraStatusHero({ snapshot, activeTask, onOpenMap }) {
    const state = snapshot?.state || {};
    const locId = state?.location_id || 'petrogradka_home';
    const loc = LOCATION_MAP[locId] || { name: 'Петроградка', shortName: 'Петроградка' };
    const weather = snapshot?.weather || state?.weather || {};
    const cycleDay = state?.physiology?.cycle_day || 6;
    const cycle = getCycleInfo(cycleDay);
    const rubles = state?.wallet?.rubles ?? state?.wallet_rubles ?? 122;

    // SPB current local time (or state simulated time)
    const displayTime = state?.current_time 
        ? state.current_time.slice(0, 5)
        : new Date().toLocaleTimeString('ru-RU', {
            timeZone: 'Europe/Moscow',
            hour: '2-digit',
            minute: '2-digit'
        });

    const tempStr = weather?.temperature !== undefined 
        ? `${weather.temperature > 0 ? '+' : ''}${Math.round(weather.temperature)}` 
        : '+16';

    const cyclePhaseName = cycle?.phaseName || cycle?.badge || 'Фолликулярная фаза';

    return (
        <div 
            className="w-[1005px] h-[250px] mx-auto rounded-[19px] relative overflow-hidden bg-[#1b1d22] select-none"
            style={{
                backgroundImage: `url('/assets/hero_bg_clean_250.png')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            {/* Center Profile Info (Avatar + Name + Handle, pos y:16, 99x162) */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center">
                <div className="w-[99px] h-[100px] rounded-full overflow-hidden">
                    <img
                        src="/assets/lera_figma_avatar.png"
                        alt="Лера"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.currentTarget.src = '/assets/lera_avatar.png';
                        }}
                    />
                </div>

                <div className="mt-2 text-center">
                    <h1 className="text-[24px] font-normal text-white leading-tight">
                        Лера
                    </h1>
                    <p className="text-[16px] font-normal text-white/50 leading-tight mt-1">
                        @geexy_bot
                    </p>
                </div>
            </div>

            {/* Bottom Stats Container (15:2793, 641x40px, pos y:194) */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[641px] h-[40px] flex items-center justify-between text-white">
                {/* 1. Time */}
                <div className="flex items-center gap-1 px-2.5 py-2">
                    <img 
                        src="/assets/icon_clock.svg" 
                        alt="" 
                        className="w-5 h-5 opacity-90"
                    />
                    <span className="text-[15px] font-normal text-white">
                        {displayTime}
                    </span>
                </div>

                {/* 2. Weather */}
                <div className="flex items-center gap-1 px-2.5 py-2">
                    <img 
                        src="/assets/icon_weather.svg" 
                        alt="" 
                        className="w-5 h-5 opacity-90"
                    />
                    <span className="text-[15px] font-normal text-white">
                        {tempStr}
                    </span>
                </div>

                {/* 3. Wallet */}
                <div className="flex items-center gap-1 px-2.5 py-2">
                    <img 
                        src="/assets/icon_wallet.svg" 
                        alt="" 
                        className="w-5 h-5 opacity-90"
                    />
                    <span className="text-[15px] font-normal text-white">
                        {rubles}р
                    </span>
                </div>

                {/* 4. Cycle */}
                <div className="flex items-center gap-1 px-2.5 py-2">
                    <img 
                        src="/assets/icon_calendar.svg" 
                        alt="" 
                        className="w-5 h-5 opacity-90"
                    />
                    <span className="text-[15px] font-normal text-white truncate max-w-[210px]">
                        {cycleDay}д - {cyclePhaseName}
                    </span>
                </div>

                {/* 5. Location */}
                <div 
                    onClick={onOpenMap}
                    className="flex items-center gap-1 px-2.5 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                    title="Перейти к карте СПб"
                >
                    <img 
                        src="/assets/icon_nav.svg" 
                        alt="" 
                        className="w-5 h-5 opacity-90"
                    />
                    <span className="text-[15px] font-normal text-white">
                        {loc.shortName || loc.name}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default LeraStatusHero;
