import React from 'react';
import { 
    FastForward, 
    RotateCw, 
    CloudSun, 
    CloudRain, 
    Clock, 
    Sparkles, 
    LayoutDashboard, 
    Map, 
    Play, 
    Pause 
} from 'lucide-react';
import { getCycleInfo } from '@/lib/simulationConstants.js';

export function Header({
    activeTab = 'overview',
    onTabChange,
    snapshot,
    isPaused,
    onTogglePause,
    onTick,
    onRefresh,
    loading,
    autoRefresh,
    setAutoRefresh
}) {
    const state = snapshot?.state || {};
    const weather = snapshot?.weather || state?.weather || {};
    const cycleDay = state?.physiology?.cycle_day || 3;
    const cycle = getCycleInfo(cycleDay);
    const rubles = state?.wallet?.rubles ?? state?.wallet_rubles ?? 0;
    const stars = state?.wallet?.stars ?? state?.wallet_stars ?? 0;

    // SPB current local time
    const spbTime = new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <header className="sticky top-0 z-40 w-full bg-[#08090a]/90 backdrop-blur-md border-b border-white/[0.06] px-4 lg:px-6 h-[52px] flex items-center">
            <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between gap-4">
                {/* Left section: Logo & Tab Switcher */}
                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#5e6ad2] shadow-sm">
                            <Sparkles className="w-3.5 h-3.5 stroke-[1.5]" />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold tracking-tight text-white">Лера</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono text-white/40 border border-white/[0.06] bg-white/[0.02]">
                                <span className={`w-1 h-1 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                                {isPaused ? 'пауза' : 'live'}
                            </span>
                        </div>
                    </div>

                    {/* Linear Segmented Tab Control */}
                    <nav className="flex items-center p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <button
                            onClick={() => onTabChange('overview')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                                activeTab === 'overview'
                                    ? 'bg-white/[0.08] text-white shadow-sm border border-white/[0.08]'
                                    : 'text-white/50 hover:text-white/80 border border-transparent'
                            }`}
                        >
                            <LayoutDashboard className="w-3.5 h-3.5 stroke-[1.5]" />
                            <span>Пульт</span>
                        </button>

                        <button
                            onClick={() => onTabChange('map')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                                activeTab === 'map'
                                    ? 'bg-white/[0.08] text-white shadow-sm border border-white/[0.08]'
                                    : 'text-white/50 hover:text-white/80 border border-transparent'
                            }`}
                        >
                            <Map className="w-3.5 h-3.5 stroke-[1.5]" />
                            <span>Карта СПб</span>
                        </button>
                    </nav>
                </div>

                {/* Right section: Vitals & Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                    {/* Time & Weather */}
                    <div className="hidden md:flex items-center gap-3 text-xs text-white/50 border-r border-white/[0.06] pr-3 mr-1">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <Clock className="w-3 h-3 text-white/50 stroke-[1.5]" />
                            <span>{spbTime}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px]">
                            {weather?.is_raining ? (
                                <CloudRain className="w-3 h-3 text-sky-400 stroke-[1.5]" />
                            ) : (
                                <CloudSun className="w-3 h-3 text-amber-300 stroke-[1.5]" />
                            )}
                            <span className="text-white/70">{weather?.temperature ? `${weather.temperature > 0 ? '+' : ''}${weather.temperature}°C` : '+16°C'}</span>
                        </div>
                    </div>

                    {/* Cycle & Wallet Pill */}
                    <div className="hidden lg:flex items-center gap-2 text-[11px]">
                        <span className={`px-2 py-0.5 rounded border ${cycle.color} font-medium`}>
                            {cycleDay}д · {cycle.badge}
                        </span>
                        <div className="px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] font-mono text-white/70">
                            <span>₽{Number(rubles).toLocaleString('ru-RU')}</span>
                            <span className="text-amber-400 ml-1.5">★{stars}</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            title="Авто-обновление каждые 5 сек"
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border cursor-pointer transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] ${
                                autoRefresh
                                    ? 'bg-[#5e6ad2]/15 border-[#5e6ad2]/30 text-[#8a95f5]'
                                    : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white/70'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-[#5e6ad2] animate-pulse' : 'bg-white/20'}`} />
                            <span>5s</span>
                        </button>

                        <button
                            onClick={onRefresh}
                            disabled={loading}
                            title="Обновить данные (R)"
                            className="p-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-white/60 hover:text-white transition-[background-color,color,transform] active:scale-[0.96] disabled:opacity-50"
                        >
                            <RotateCw className={`w-3.5 h-3.5 stroke-[1.5] ${loading ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                            onClick={onTogglePause}
                            title="Пауза / Возобновить симуляцию (Пробел)"
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-[background-color,border-color,color,transform] active:scale-[0.96] ${
                                isPaused
                                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-300 hover:bg-amber-500/20'
                                    : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.07]'
                            }`}
                        >
                            {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                            <span className="hidden sm:inline">{isPaused ? 'Старт' : 'Пауза'}</span>
                        </button>

                        <button
                            onClick={onTick}
                            title="Шаг времени +15 минут (T)"
                            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#5e6ad2] hover:bg-[#6d78e3] text-white border border-[#5e6ad2]/50 text-xs font-medium tracking-tight shadow-sm transition-[background-color,transform] active:scale-[0.96]"
                        >
                            <FastForward className="w-3.5 h-3.5 fill-current" />
                            <span>+15м</span>
                            <kbd className="hidden sm:inline-block ml-1 text-[9px] bg-black/30 px-1 rounded font-mono text-white/70">T</kbd>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
