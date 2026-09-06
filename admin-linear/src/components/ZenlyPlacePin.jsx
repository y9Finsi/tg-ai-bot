/**
 * ZenlyPlacePin.jsx
 * 
 * Zenly-style map marker for Petersburg points of interest
 * (Дом Леры, Кафе «Слой», СПбГИК, Шоурум ВО и др.).
 */

import React from 'react';

export function ZenlyPlacePin({
    place,
    isSelected = false,
    onClick
}) {
    const {
        id,
        name,
        shortName,
        icon = '📍',
        district
    } = place;

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(place);
            }}
            className="relative flex flex-col items-center cursor-pointer select-none group transition-transform duration-200 hover:scale-110 active:scale-95 pb-0.5"
        >
            <div className={`px-2.5 py-1 rounded-2xl bg-[#0b0d13]/90 backdrop-blur-md border shadow-lg flex items-center gap-1.5 transition-all ${
                isSelected 
                    ? 'border-indigo-400 bg-indigo-950/80 shadow-indigo-500/20 ring-2 ring-indigo-400/40' 
                    : 'border-white/15 hover:border-white/30'
            }`}>
                <span className="text-sm">{icon}</span>
                <span className="text-[11px] font-semibold text-white/90 tracking-tight whitespace-nowrap">
                    {shortName || name}
                </span>
            </div>

            {/* Little anchor pointer dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm mt-0.5" />
        </div>
    );
}

export default ZenlyPlacePin;
