import React from 'react';

/**
 * Reusable Figma Frame 221 List Item Row
 * Matches Figma 14:2253 exactly:
 * - h-[61px], bg-[#1b1d22], border border-white/[0.07], rounded-[16px]
 * - px-4 py-2 (left 16px, right 8px, top/bottom 8px)
 * - 9-dots icon + title (#bdbdbd, 15px) + subtitle (white/50, 14px)
 * - action pill button: rounded-full, px-4 py-2, text-white, 16px
 */
export function FigmaListItemRow({
    title,
    subtitle,
    actionLabel,
    actionVariant = 'blue', // 'blue' | 'green' | 'red'
    onAction,
    loading = false,
    className = '',
    rightContent
}) {
    const variantStyles = {
        blue: 'bg-[#292e5e] hover:bg-[#343b78] active:bg-[#22264e]',
        green: 'bg-[#28583b] hover:bg-[#326e4a] active:bg-[#1f452e]',
        red: 'bg-[#582828] hover:bg-[#6e3232] active:bg-[#461f1f]'
    };

    const buttonClass = variantStyles[actionVariant] || variantStyles.blue;

    return (
        <div className={`h-[61px] w-full bg-[#1b1d22] border border-white/[0.07] rounded-[16px] pl-4 pr-2 py-2 flex items-center justify-between gap-2 shrink-0 select-none transition-colors hover:border-white/15 ${className}`}>
            {/* Left: Drag dots + Texts */}
            <div className="flex items-center gap-4 min-w-0 flex-1">
                <img 
                    src="/assets/icon_dots9.svg" 
                    alt="" 
                    className="w-6 h-6 shrink-0 opacity-80" 
                    aria-hidden="true"
                />
                <div className="flex flex-col min-w-0 justify-center">
                    <span className="text-[15px] font-medium text-[#bdbdbd] truncate leading-tight">
                        {title}
                    </span>
                    {subtitle && (
                        <span className="text-[14px] font-normal text-white/50 truncate leading-tight mt-0.5">
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>

            {/* Right: Contextual Pill Button */}
            {rightContent ? (
                rightContent
            ) : actionLabel ? (
                <button
                    type="button"
                    onClick={onAction}
                    disabled={loading}
                    className={`shrink-0 px-4 py-2 rounded-full text-[16px] font-normal text-white leading-none transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${buttonClass}`}
                >
                    {loading ? '...' : actionLabel}
                </button>
            ) : null}
        </div>
    );
}

export default FigmaListItemRow;
