import React from 'react';

export function Card({ variant = 'default', className = '', children }) { return <section className={['ui-card', `ui-card-${variant}`, className].filter(Boolean).join(' ')}>{children}</section>; }
export function CardHeader({ eyebrow, title, description, action }) {
    return <div className="card-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>;
}
