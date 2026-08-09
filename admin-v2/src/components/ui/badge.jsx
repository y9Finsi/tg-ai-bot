import React from 'react';

export function Badge({ variant = 'muted', className = '', children }) {
    return <span className={['ui-badge', `ui-badge-${variant}`, className].filter(Boolean).join(' ')}>{children}</span>;
}
