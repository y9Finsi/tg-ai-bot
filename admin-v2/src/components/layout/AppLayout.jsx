import React from 'react';
import { Sidebar } from './Sidebar.jsx';
import { Toast } from '@/components/ui/Toast.jsx';

export function AppLayout({
    activeRoute,
    onNavigate,
    notice,
    onDismissToast,
    children
}) {
    return (
        <div className="v2-shell diary-shell v2-spa-layout">
            <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} />
            <main className="v2-main-workspace" role="main">
                {children}
            </main>
            {notice && <Toast notice={notice} onDismiss={onDismissToast} />}
        </div>
    );
}

export default AppLayout;
