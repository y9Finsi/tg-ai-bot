import React from 'react';

export function Button({ variant = 'outline', size = 'default', className = '', children, loading = false, disabled = false, ...props }) {
    return <button className={['ui-button', `ui-button-${variant}`, `ui-button-${size}`, loading && 'ui-button-loading', className].filter(Boolean).join(' ')} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{children}</button>;
}
