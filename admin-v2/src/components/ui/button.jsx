import React from 'react';

export function Button({ variant = 'outline', size = 'default', className = '', children, ...props }) {
    return <button className={['ui-button', `ui-button-${variant}`, `ui-button-${size}`, className].filter(Boolean).join(' ')} {...props}>{children}</button>;
}
