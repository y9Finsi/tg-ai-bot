import React from 'react';

export function ProgressBar({ value, tone = 'blue' }) {
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));
    return (
        <div className="progress">
            <i className={`progress-${tone}`} style={{ width: `${clamped}%` }} />
        </div>
    );
}

export const Progress = ProgressBar;
export default ProgressBar;
