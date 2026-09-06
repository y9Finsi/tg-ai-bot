import React from 'react';
import { CircleAlert, Info, CircleCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export function Toast({ notice, onDismiss }) {
    if (!notice) return null;
    const isError = notice.kind === 'error';
    const Icon = isError ? CircleAlert : notice.kind === 'info' ? Info : CircleCheck;

    return (
        <div
            className={cn('toast-v2', `toast-v2-${notice.kind}`)}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
        >
            <Icon size={17} aria-hidden="true" />
            <span>{notice.message}</span>
            <button
                type="button"
                className="toast-v2-dismiss"
                aria-label="Закрыть уведомление"
                onClick={onDismiss}
            >
                <X size={16} />
            </button>
        </div>
    );
}

export default Toast;
