import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api.js';

const NEEDS_CONFIG = [
    {
        id: 'hunger',
        label: 'Голод',
        gradientStyle: 'linear-gradient(90deg, #28583b 0%, rgba(86, 190, 128, 0) 100%)'
    },
    {
        id: 'boredom',
        label: 'Скука',
        gradientStyle: 'linear-gradient(90deg, #582828 0%, rgba(190, 86, 86, 0) 100%)'
    },
    {
        id: 'bladder',
        label: 'Туалет',
        gradientStyle: 'linear-gradient(90deg, #583e28 0%, rgba(190, 135, 86, 0) 100%)'
    },
    {
        id: 'fatigue',
        label: 'Усталость',
        gradientStyle: 'linear-gradient(90deg, #28583b 0%, rgba(86, 190, 128, 0) 100%)'
    },
    {
        id: 'hygiene',
        label: 'Свежесть',
        gradientStyle: 'linear-gradient(90deg, #28583b 0%, rgba(86, 190, 128, 0) 100%)'
    },
    {
        id: 'horny',
        label: 'Влечение',
        gradientStyle: 'linear-gradient(90deg, #582854 0%, rgba(190, 86, 181, 0) 100%)'
    }
];

export function NeedsPanel({ needs = {}, onNeedsChanged, toast }) {
    const [localNeeds, setLocalNeeds] = useState(needs);
    const [editingKey, setEditingKey] = useState(null);
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

    return (
        <section className="w-[1005px] mx-auto select-none">
            {/* Header: "Состояние" (13:2131, 20px Medium White) */}
            <h2 className="text-[20px] font-medium text-white leading-tight mb-5">
                Состояние
            </h2>

            {/* 6 Indicator Cards Grid matching Figma 13:2130 (1005x92px, gap 10px) */}
            <div className="grid grid-cols-6 gap-[10px]">
                {NEEDS_CONFIG.map(cfg => {
                    const rawVal = localNeeds[cfg.id] ?? 50;
                    const val = Math.round(rawVal);
                    const isSaving = savingKey === cfg.id;
                    const isEditing = editingKey === cfg.id;

                    return (
                        <div
                            key={cfg.id}
                            className="w-full h-[92px] bg-[#000212]/37 border border-[#8693ff]/25 rounded-[23px] p-2 flex flex-col justify-between relative"
                        >
                            {/* Card Top: Label (Frame 201, 141x27px, text 16px white) */}
                            <div className="px-1 pt-1 flex items-center justify-between">
                                <span className="text-[16px] font-normal text-white leading-tight">
                                    {cfg.label}
                                </span>
                            </div>

                            {/* Card Bottom: Value Pill with Figma Linear Gradient (Component 41, 141x43px, r:20px) */}
                            <div 
                                className="h-[43px] rounded-[20px] px-3 flex items-center justify-between shadow-inner cursor-pointer select-none"
                                style={{ background: cfg.gradientStyle }}
                                onClick={() => setEditingKey(isEditing ? null : cfg.id)}
                                title="Нажмите, чтобы изменить значение"
                            >
                                <span className="text-[16px] font-normal text-white/72">
                                    {val}%
                                </span>
                                {isSaving && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-ping" />
                                )}
                            </div>

                            {/* Inline Slider Popover when editing */}
                            {isEditing && (
                                <div className="absolute -top-12 left-0 right-0 z-30 bg-[#1b1d22] border border-white/20 rounded-xl p-2 shadow-2xl flex items-center gap-2">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={val}
                                        onChange={(e) => handleNeedChange(cfg.id, e.target.value)}
                                        className="w-full accent-[#8693ff] cursor-pointer"
                                    />
                                    <span className="text-xs font-mono text-white/80 w-8 text-right">
                                        {val}%
                                    </span>
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
