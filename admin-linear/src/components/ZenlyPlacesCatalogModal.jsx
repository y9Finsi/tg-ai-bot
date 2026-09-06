/**
 * ZenlyPlacesCatalogModal.jsx
 *
 * Full catalog modal of Saint Petersburg locations in Zenly aesthetic.
 * Allows filtering by category, search by name or district,
 * viewing distance from Lera, and selecting a place for routing.
 */

import React, { useState, useMemo } from 'react';
import { 
    X, 
    Search, 
    Compass,
    ArrowRight
} from 'lucide-react';
import { 
    SPB_LOCATIONS, 
    LOCATION_CATEGORIES, 
    calculateDistanceKm 
} from '@/lib/simulationConstants.js';

export function ZenlyPlacesCatalogModal({
    isOpen,
    onClose,
    leraCoords,
    currentLocationId,
    onSelectPlace
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');

    const filteredLocations = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return SPB_LOCATIONS.map(place => {
            const dist = leraCoords 
                ? calculateDistanceKm(leraCoords[1], leraCoords[0], place.lat, place.lng)
                : null;
            return { ...place, distKm: dist };
        }).filter(place => {
            const matchesCategory = selectedCategory === 'all' || place.category === selectedCategory;
            const matchesSearch = !query || 
                place.name.toLowerCase().includes(query) ||
                place.shortName.toLowerCase().includes(query) ||
                place.district.toLowerCase().includes(query) ||
                (place.address && place.address.toLowerCase().includes(query));
            return matchesCategory && matchesSearch;
        }).sort((a, b) => {
            if (a.id === currentLocationId) return -1;
            if (b.id === currentLocationId) return 1;
            if (a.distKm !== null && b.distKm !== null) return a.distKm - b.distKm;
            return 0;
        });
    }, [searchQuery, selectedCategory, leraCoords, currentLocationId]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-lg max-h-[85vh] bg-[#111319]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400">
                            <Compass className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white tracking-tight">Локации Санкт-Петербурга</h2>
                            <p className="text-[11px] text-white/50">Каталог мест Леры ({SPB_LOCATIONS.length} точек)</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white/70"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Search & Category Filter */}
                <div className="p-3 border-b border-white/10 space-y-2.5 bg-black/20">
                    <div className="relative">
                        <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск по местам, улицам, районам..."
                            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-hidden focus:border-indigo-400 transition-colors"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Category tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {LOCATION_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-tight whitespace-nowrap transition-all border cursor-pointer ${
                                    selectedCategory === cat.id
                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {cat.icon} {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Locations list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {filteredLocations.length === 0 ? (
                        <div className="py-12 text-center text-white/40 text-xs">
                            Ничего не найдено по запросу «{searchQuery}»
                        </div>
                    ) : (
                        filteredLocations.map(place => {
                            const isHere = place.id === currentLocationId;
                            return (
                                <div 
                                    key={place.id}
                                    onClick={() => {
                                        onSelectPlace(place);
                                        onClose();
                                    }}
                                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                                        isHere 
                                            ? 'bg-indigo-950/40 border-indigo-500/50 hover:bg-indigo-950/60' 
                                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0">
                                            {place.icon}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                                                    {place.name}
                                                </h4>
                                                {isHere && (
                                                    <span className="text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-1.5 py-0.2 rounded-full">
                                                        Здесь
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-white/50 mt-0.5">{place.address || place.district}</p>
                                            <p className="text-[10px] text-white/40 mt-1 line-clamp-1">{place.description}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {place.distKm !== null && (
                                            <span className="text-[11px] font-mono font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                                                {place.distKm < 1 
                                                    ? `${Math.round(place.distKm * 1000)} м` 
                                                    : `${place.distKm.toFixed(1)} км`}
                                            </span>
                                        )}
                                        <div className="text-[10px] text-white/40 flex items-center gap-1 group-hover:text-indigo-400 transition-colors">
                                            <span>Маршрут</span>
                                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default ZenlyPlacesCatalogModal;
