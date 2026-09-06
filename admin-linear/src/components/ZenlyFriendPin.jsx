/**
 * ZenlyFriendPin.jsx
 * 
 * Authentic Zenly-style character avatar pin on the map.
 * Features:
 * - Playful puffy round avatar with live radar pulse ring
 * - Battery percentage badge (🔋 86%) with dynamic state colors
 * - Activity status pill («В кофейне ☕», «Едет на самокате 🛴», «Спит 💤»)
 * - Time in current place («Здесь 35м»)
 * - Multi-emoji burst fountain on reactions (🔥, ❤️, ☕, 🥐, ⚡)
 */

import React, { useState, useEffect } from 'react';

export function ZenlyFriendPin({
    friend,
    isSelected = false,
    onClick,
    reactionEmojis = []
}) {
    const {
        id,
        name,
        avatar,
        battery = 84,
        status = 'На связи',
        timeInPlace = '35м',
        color = '#ec4899', // Zenly vibrant pink/indigo/emerald
        isMoving = false,
        speed = 0
    } = friend;

    // Battery color calculation
    let batteryBg = 'bg-emerald-500';
    let batteryText = 'text-emerald-300';
    if (battery < 20) {
        batteryBg = 'bg-rose-500 animate-pulse';
        batteryText = 'text-rose-300';
    } else if (battery < 45) {
        batteryBg = 'bg-amber-500';
        batteryText = 'text-amber-300';
    }

    return (
        <div 
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(friend);
            }}
            className="relative flex flex-col items-center cursor-pointer select-none group transition-transform duration-200 hover:scale-110 active:scale-95 pb-1"
        >
            {/* EMOJI BURST FOUNTAIN PARTICLES */}
            {reactionEmojis.map((reaction) => (
                <span
                    key={reaction.id}
                    className="absolute pointer-events-none text-2xl font-bold animate-in fade-in"
                    style={{
                        animation: `zenly-emoji-float 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
                        left: `calc(50% + ${reaction.offsetX}px)`,
                        bottom: '54px',
                        zIndex: 100
                    }}
                >
                    {reaction.emoji}
                </span>
            ))}

            {/* TOP STATUS PILL */}
            <div className="mb-1.5 flex flex-col items-center pointer-events-none">
                <div className="px-2.5 py-1 rounded-full bg-[#0e1117]/90 backdrop-blur-md border border-white/20 shadow-xl shadow-black/60 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-xs font-semibold text-white tracking-tight">
                        {status}
                    </span>
                    {isMoving && speed > 0 && (
                        <span className="text-[10px] font-mono font-bold text-sky-300 bg-sky-500/20 px-1.5 py-0.2 rounded-full">
                            {speed} км/ч
                        </span>
                    )}
                </div>

                {/* Sub-pill with time in place */}
                {timeInPlace && !isMoving && (
                    <span className="text-[9px] font-medium text-white/70 bg-black/60 px-1.5 py-0.2 rounded-full border border-white/10 mt-0.5 shadow-sm">
                        {timeInPlace}
                    </span>
                )}
            </div>

            {/* AVATAR BUBBLE WITH RADAR RING */}
            <div className="relative">
                {/* Zenly Live Pulse Ring */}
                <div 
                    className="absolute -inset-1.5 rounded-full opacity-75 animate-ping pointer-events-none"
                    style={{ backgroundColor: color }}
                />

                {/* Main Puffy Circle */}
                <div 
                    className={`relative w-13 h-13 rounded-full p-1 bg-gradient-to-tr shadow-2xl transition-all ${
                        isSelected 
                            ? 'ring-3 ring-white ring-offset-2 ring-offset-black scale-110' 
                            : 'hover:ring-2 hover:ring-white/60'
                    }`}
                    style={{ 
                        backgroundImage: `linear-gradient(135deg, ${color}, #6366f1)` 
                    }}
                >
                    <div className="w-full h-full rounded-full overflow-hidden bg-[#181a20] flex items-center justify-center border border-white/20">
                        {avatar ? (
                            <img src={avatar} alt={name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xl font-black text-white drop-shadow">
                                {name.charAt(0)}
                            </span>
                        )}
                    </div>

                    {/* BATTERY BADGE (Bottom-Right) */}
                    <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#0a0c10] border border-white/25 shadow-lg flex items-center gap-1 text-[10px] font-bold text-white">
                        <span className={`w-1.5 h-1.5 rounded-full ${batteryBg}`} />
                        <span className={batteryText}>{battery}%</span>
                    </div>

                    {/* PLUMBOB / LEADER BADGE FOR LERA */}
                    {id === 'lera' && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-xs flex items-center justify-center animate-bounce">
                            💎
                        </div>
                    )}
                </div>
            </div>

            {/* NAME LABEL */}
            <span className="mt-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs border border-white/10 text-[11px] font-bold text-white tracking-tight shadow-md">
                {name}
            </span>

            {/* POINTER ARROW */}
            <div className="w-2 h-2 -mt-1 rotate-45 bg-black/80 border-r border-b border-white/10" />
        </div>
    );
}

export default ZenlyFriendPin;
