import React, { useState } from 'react';
import { X, Plus, Clock, MapPin, Zap } from 'lucide-react';
import { SPB_LOCATIONS } from '@/lib/simulationConstants.js';
import { api } from '@/lib/api.js';

const AVAILABLE_TASK_TYPES = [
    { id: 'COFFEE_SLOY', label: '☕ Кофе в «Слое» (Петроградка)', defaultLoc: 'cafe_sloy', defaultDuration: 30 },
    { id: 'WORK_SHOWROOM', label: '👗 Смена в шоуруме Макса (ВО)', defaultLoc: 'showroom_work', defaultDuration: 120 },
    { id: 'STUDY', label: '🎓 Пары в СПбГИК', defaultLoc: 'spbgik', defaultDuration: 90 },
    { id: 'HANG_NASTYA', label: '👯 Встреча с Настей', defaultLoc: 'cafe_sloy', defaultDuration: 60 },
    { id: 'BAR_EVENING', label: '🍸 Бар на Рубинштейна', defaultLoc: 'bar_rubinsteina', defaultDuration: 90 },
    { id: 'GROCERY_SHOP', label: '🛒 ВкусВилл на Ленина', defaultLoc: 'vkusvill_lenina', defaultDuration: 20 },
    { id: 'SHOWER', label: '🚿 Душ и уход', defaultLoc: 'petrogradka_home', defaultDuration: 20 },
    { id: 'EAT', label: '🍕 Перекус дома', defaultLoc: 'petrogradka_home', defaultDuration: 25 },
    { id: 'REST', label: '🛋️ Отдых и чилл дома', defaultLoc: 'petrogradka_home', defaultDuration: 45 },
    { id: 'SLEEP', label: '💤 Ночной сон', defaultLoc: 'petrogradka_home', defaultDuration: 480 },
    { id: 'CHANNEL_POST', label: '📱 Пост в Telegram-канал', defaultLoc: 'petrogradka_home', defaultDuration: 30 }
];

export function TaskModal({ isOpen, onClose, onTaskCreated, toast }) {
    if (!isOpen) return null;

    const [selectedType, setSelectedType] = useState('COFFEE_SLOY');
    const [targetLocation, setTargetLocation] = useState('cafe_sloy');
    const [durationMinutes, setDurationMinutes] = useState(30);
    const [priority, setPriority] = useState(60);
    const [submitting, setSubmitting] = useState(false);

    const handleTypeChange = (typeId) => {
        setSelectedType(typeId);
        const item = AVAILABLE_TASK_TYPES.find(t => t.id === typeId);
        if (item) {
            setTargetLocation(item.defaultLoc);
            setDurationMinutes(item.defaultDuration);
        }
    };

    async function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api('/api/admin/radiant/queue/push', {
                method: 'POST',
                body: JSON.stringify({
                    taskType: selectedType,
                    targetLocation,
                    durationMinutes: Number(durationMinutes),
                    priority: Number(priority)
                })
            });
            toast?.('Задача добавлена в очередь', 'success');
            onTaskCreated?.();
            onClose();
        } catch (err) {
            toast?.(err.message, 'error');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08090a]/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-[#0e1013] border border-white/[0.06] p-5 shadow-2xl shadow-black/80 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-[#5e6ad2] stroke-[1.5]" />
                        <h3 className="text-sm font-semibold text-white tracking-tight">Новая задача в расписание</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/40 hover:text-white transition-colors p-1 rounded-md"
                    >
                        <X className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Task type select */}
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1.5">Тип активности</label>
                        <select
                            value={selectedType}
                            onChange={(e) => handleTypeChange(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#5e6ad2]"
                        >
                            {AVAILABLE_TASK_TYPES.map(t => (
                                <option key={t.id} value={t.id} className="bg-[#14171b] text-white">
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Location select */}
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-white/40 stroke-[1.5]" />
                            <span>Целевая локация в СПб</span>
                        </label>
                        <select
                            value={targetLocation}
                            onChange={(e) => setTargetLocation(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#5e6ad2]"
                        >
                            {SPB_LOCATIONS.map(loc => (
                                <option key={loc.id} value={loc.id} className="bg-[#14171b] text-white">
                                    {loc.icon} {loc.name} ({loc.district})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Duration & Priority row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-white/50 mb-1.5 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-white/40 stroke-[1.5]" />
                                <span>Длительность</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="5"
                                    max="600"
                                    step="5"
                                    value={durationMinutes}
                                    onChange={(e) => setDurationMinutes(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#5e6ad2] font-mono"
                                />
                                <span className="text-xs text-white/50">мин</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-white/50 mb-1.5 flex items-center gap-1">
                                <Zap className="w-3 h-3 text-white/40 stroke-[1.5]" />
                                <span>Приоритет</span>
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#5e6ad2]"
                            >
                                <option value={30} className="bg-[#14171b] text-white">Обычный (30)</option>
                                <option value={60} className="bg-[#14171b] text-white">Средний (60)</option>
                                <option value={90} className="bg-[#14171b] text-white">Высокий (90)</option>
                                <option value={100} className="bg-[#14171b] text-white">Срочный (100)</option>
                            </select>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-white/60 hover:text-white text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96]"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-3.5 py-1.5 rounded-lg bg-[#5e6ad2] hover:bg-[#6d78e3] text-white text-xs font-medium tracking-tight shadow-sm transition-[background-color,transform] active:scale-[0.96] disabled:opacity-50"
                        >
                            {submitting ? 'Добавление...' : 'В очередь'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
