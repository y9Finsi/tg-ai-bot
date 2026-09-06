import React, { useState, useEffect } from 'react';
import { 
    Activity, 
    Utensils, 
    Moon, 
    Sparkles, 
    ShowerHead, 
    AlertCircle, 
    Heart, 
    Check 
} from 'lucide-react';
import { NEEDS_CONFIG } from '@/lib/simulationConstants.js';
import { api } from '@/lib/api.js';

const NEED_ICONS = {
    hunger: Utensils,
    fatigue: Moon,
    boredom: Sparkles,
    hygiene: ShowerHead,
    bladder: AlertCircle,
    horny: Heart
};

export function NeedsPanel({ needs = {}, onNeedsChanged, toast }) {
    const [localNeeds, setLocalNeeds] = useState(needs);
    const [savingKey, setSavingKey] = useState(null);

    useEffect(() => {
        setLocalNeeds(needs);
    }, [needs]);

    async function handleNeedChange(key, value) {
        const numVal = Math.max(0, Math.min(100, Number(value)));
        setLocalNeeds(prev => ({ ...prev, [key]: numVal }));
        setSavingKey(key);

        try {
            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ needs: { [key]: numVal } })
            });
            toast?.(`${key}: ${numVal}%`, 'success');
            onNeedsChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setTimeout(() => setSavingKey(null), 500);
        }
    }

    async function applyPreset(presetNeeds, label) {
        setLocalNeeds(prev => ({ ...prev, ...presetNeeds }));
        try {
            await api('/api/admin/radiant/mutate', {
                method: 'POST',
                body: JSON.stringify({ needs: presetNeeds })
            });
            toast?.(`Пресет: ${label}`, 'success');
            onNeedsChanged?.();
        } catch (err) {
            toast?.(err.message, 'error');
        }
    }

    return (
        <div className="bg-[#0e1013] border border-white/[0.06] rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#5e6ad2] stroke-[1.5]" />
                    <h3 className="text-sm font-semibold text-white tracking-tight">Потребности</h3>
                </div>
                <span className="text-[10px] text-white/50 font-mono">Слайдер прямого ввода</span>
            </div>

            {/* Sliders Grid - 2 columns inside 730px container */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {NEEDS_CONFIG.map(cfg => {
                    const Icon = NEED_ICONS[cfg.id] || Activity;
                    const val = Math.round(localNeeds[cfg.id] ?? (cfg.inverted ? 80 : 20));

                    const isAlert = cfg.inverted
                        ? val <= cfg.warningThreshold
                        : val >= cfg.warningThreshold;
                    const isCritical = cfg.inverted
                        ? val <= cfg.criticalThreshold
                        : val >= cfg.criticalThreshold;

                    let textColor = 'text-white/70';
                    if (isCritical) {
                        textColor = 'text-rose-400 font-semibold';
                    } else if (isAlert) {
                        textColor = 'text-amber-400 font-medium';
                    }

                    return (
                        <div key={cfg.id} className="space-y-1.5 group">
                            <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-white/60 group-hover:text-white/90 transition-colors">
                                    <Icon className="w-3.5 h-3.5 text-white/40 group-hover:text-white/70 stroke-[1.5] transition-colors" />
                                    <span>{cfg.label}</span>
                                </span>
                                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                    {savingKey === cfg.id && (
                                        <Check className="w-3 h-3 text-emerald-400 stroke-[1.5]" />
                                    )}
                                    <span className={textColor}>{val}%</span>
                                </div>
                            </div>

                            <div className="relative flex items-center">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={val}
                                    onChange={(e) => handleNeedChange(cfg.id, e.target.value)}
                                    className="w-full h-1 bg-white/[0.08] rounded-full appearance-none cursor-pointer accent-[#5e6ad2] hover:accent-[#6d78e3] transition-[accent-color]"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Presets - 4 columns in 1 line */}
            <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
                <span className="text-[10px] text-white/50 uppercase tracking-wider font-mono block">Быстрые сценарии</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                        onClick={() => applyPreset({ hunger: 10, fatigue: 15 }, 'Сыта и бодра')}
                        className="px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 text-[11px] text-white/70 hover:text-white text-center truncate transition-[background-color,border-color,transform] active:scale-[0.96]"
                    >
                        🥐 Покормить
                    </button>
                    <button
                        onClick={() => applyPreset({ hygiene: 100, bladder: 0 }, 'В душ')}
                        className="px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 text-[11px] text-white/70 hover:text-white text-center truncate transition-[background-color,border-color,transform] active:scale-[0.96]"
                    >
                        🚿 В душ
                    </button>
                    <button
                        onClick={() => applyPreset({ horny: 85, boredom: 20 }, 'Флирт')}
                        className="px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 text-[11px] text-white/70 hover:text-white text-center truncate transition-[background-color,border-color,transform] active:scale-[0.96]"
                    >
                        🔥 Флирт
                    </button>
                    <button
                        onClick={() => applyPreset({ fatigue: 85, hunger: 20 }, 'Сон')}
                        className="px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/10 text-[11px] text-white/70 hover:text-white text-center truncate transition-[background-color,border-color,transform] active:scale-[0.96]"
                    >
                        💤 Ко сну
                    </button>
                </div>
            </div>
        </div>
    );
}
