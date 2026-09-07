import React from 'react';

/**
 * Top bar navigation matching Figma 13:1935 & 13:1936
 * - Sticky on scroll (sticky top-0 z-50) with smooth backdrop-blur gradient fade
 * - Centered button group pill: bg-[#1b1d22]/90 rounded-full p-2
 * - Tabs: Пульт, Настройка ИИ, Карта СПб
 * - Active tab: bg-[#292e5e] border border-[#434771] text-white rounded-full px-4 py-2 text-[16px]
 */
export function Header({
    activeTab = 'overview',
    onTabChange
}) {
    return (
        <header className="sticky top-0 z-50 w-full flex items-center justify-center select-none pointer-events-none pt-3 pb-5">
            {/* Smooth gradient backdrop blur transition layer */}
            <div 
                className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#0c0c0c] via-[#0c0c0c]/85 to-transparent backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]" 
                aria-hidden="true"
            />

            {/* Centered Figma Button Group (13:1936, 357x54px) */}
            <nav className="relative z-10 pointer-events-auto w-[357px] h-[54px] inline-flex items-center justify-between bg-[#1b1d22]/90 backdrop-blur-xl rounded-full p-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-white/[0.08]">
                <button
                    type="button"
                    onClick={() => onTabChange('overview')}
                    className={`h-[38px] px-4 rounded-full text-[16px] font-normal transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center ${
                        activeTab === 'overview'
                            ? 'bg-[#292e5e] border border-[#434771] text-white shadow-sm'
                            : 'text-white/58 hover:text-white border border-transparent'
                    }`}
                >
                    Пульт
                </button>

                <button
                    type="button"
                    onClick={() => onTabChange('ai')}
                    className={`h-[38px] px-4 rounded-full text-[16px] font-normal transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center ${
                        activeTab === 'ai'
                            ? 'bg-[#292e5e] border border-[#434771] text-white shadow-sm'
                            : 'text-white/58 hover:text-white border border-transparent'
                    }`}
                >
                    Настройка ИИ
                </button>

                <button
                    type="button"
                    onClick={() => onTabChange('map')}
                    className={`h-[38px] px-4 rounded-full text-[16px] font-normal transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center ${
                        activeTab === 'map'
                            ? 'bg-[#292e5e] border border-[#434771] text-white shadow-sm'
                            : 'text-white/58 hover:text-white border border-transparent'
                    }`}
                >
                    Карта СПб
                </button>
            </nav>
        </header>
    );
}

export default Header;
