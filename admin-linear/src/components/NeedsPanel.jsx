import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api.js';
import { NEEDS_CONFIG, getNeedGradient, getNeedUrgencyLevel } from '@/lib/simulationConstants.js';

export function NeedsPanel({ needs = {}, onNeedsChanged, toast }) {
    const [localNeeds, setLocalNeeds] = useState(needs);
    const [editingKey, setEditingKey] = useState(null);
    const [savingKey, setSavingKey] = useState(null);
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        setLocalNeeds(needs);
    }, [needs]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    async function commitNeedChange(key, value) {
        const numVal = Math.max(0, Math.min(100, Number(value)));
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

    function handleSliderChange(key, value) {
        const numVal = Math.max(0, Math.min(100, Number(value)));
        setLocalNeeds(prev => ({ ...prev, [key]: numVal }));

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            commitNeedChange(key, numVal);
        }, 400);
    }

    function handlePresetClick(key, presetVal) {
        setLocalNeeds(prev => ({ ...prev, [key]: presetVal }));
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        commitNeedChange(key, presetVal);
    }

    return (
        <section className="w-[1005px] mx-auto select-none relative">
            {/* Header: "Состояние" (13:2131, 20px Medium White) */}
            <h2 className="text-[20px] font-medium text-white leading-tight mb-5">
                Состояние
            </h2>

            {/* Backdrop to close popover */}
            {editingKey && (
                <div 
                    className="fixed inset-0 z-20 cursor-default" 
                    onClick={() => setEditingKey(null)} 
                />
            )}

            {/* 6 Indicator Cards Grid matching Figma 13:2130 (1005x92px, gap 10px) */}
            <div className="grid grid-cols-6 gap-[10px]">
                {NEEDS_CONFIG.map(cfg => {
                    const rawVal = localNeeds[cfg.id] ?? 50;
                    const val = Math.round(rawVal);
                    const isSaving = savingKey === cfg.id;
                    const isEditing = editingKey === cfg.id;
                    const urgency = getNeedUrgencyLevel(cfg.id, val);
                    const dynamicGradient = getNeedGradient(cfg.id, val);

                    return (
                        <div
                            key={cfg.id}
                            className={`w-full h-[92px] bg-[#000212]/37 border rounded-[23px] p-2 flex flex-col justify-between relative transition-colors ${
                                urgency === 'critical'
                                    ? 'border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                                    : urgency === 'warning'
                                    ? 'border-amber-500/30'
                                    : 'border-[#8693ff]/25'
                            }`}
                        >
                            {/* Card Top: Label */}
                            <div className="px-1 pt-1 flex items-center justify-between">
                                <span className="text-[16px] font-normal text-white leading-tight">
                                    {cfg.label}
                                </span>
                                {urgency === 'critical' && (
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Критическое значение!" />
                                )}
                            </div>

                            {/* Card Bottom: Fully filled Value Pill with dynamic color gradient */}
                            <div 
                                className="h-[43px] rounded-[20px] px-3 flex items-center justify-between shadow-inner cursor-pointer select-none transition-all hover:brightness-110"
                                style={{ background: dynamicGradient }}
                                onClick={() => setEditingKey(isEditing ? null : cfg.id)}
                                title={`Нажмите, чтобы изменить значение (${cfg.description || ''})`}
                            >
                                <span className="text-[16px] font-medium text-white/90 drop-shadow-sm">
                                    {val}%
                                </span>
                                {isSaving ? (
                                    <span className="w-2 h-2 rounded-full bg-white/90 animate-ping" />
                                ) : urgency === 'critical' ? (
                                    <span className="text-xs text-rose-200/90 font-medium">SOS</span>
                                ) : urgency === 'warning' ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-300/80" />
                                ) : null}
                            </div>

                            {/* Inline Slider Popover with Presets */}
                            {isEditing && (
                                <div className="absolute -top-[72px] left-0 right-0 z-30 bg-[#1b1d22]/95 backdrop-blur-md border border-white/20 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={val}
                                            onChange={(e) => handleSliderChange(cfg.id, e.target.value)}
                                            className="w-full accent-[#8693ff] cursor-pointer"
                                        />
                                        <span className="text-xs font-mono font-medium text-white/90 w-8 text-right">
                                            {val}%
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/[0.08]">
                                        <button
                                            type="button"
                                            onClick={() => handlePresetClick(cfg.id, 0)}
                                            className="flex-1 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-[10px] text-white/70 hover:text-white transition-colors cursor-pointer"
                                        >
                                            0%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handlePresetClick(cfg.id, 50)}
                                            className="flex-1 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-[10px] text-white/70 hover:text-white transition-colors cursor-pointer"
                                        >
                                            50%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handlePresetClick(cfg.id, 100)}
                                            className="flex-1 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-[10px] text-white/70 hover:text-white transition-colors cursor-pointer"
                                        >
                                            100%
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default NeedsPanel;
