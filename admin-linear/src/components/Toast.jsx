import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function Toast({ notice, onDismiss }) {
    if (!notice) return null;

    const isError = notice.kind === 'error';
    const isSuccess = notice.kind === 'success';

    return (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-[#14171b] border border-white/10 shadow-2xl text-sm max-w-md animate-in fade-in slide-in-from-bottom-3 duration-200">
            {isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 stroke-[1.5]" />
            ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 stroke-[1.5]" />
            ) : (
                <Info className="w-4 h-4 text-[#5e6ad2] shrink-0 stroke-[1.5]" />
            )}
            <span className="text-[#f4f4f5] text-xs font-medium leading-tight flex-1">
                {notice.message}
            </span>
            <button
                onClick={onDismiss}
                className="text-white/40 hover:text-white transition-colors p-1 -mr-1"
            >
                <X className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
        </div>
    );
}
