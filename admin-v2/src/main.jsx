import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import './design-system.css';
import './feature-components.css';
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx';
import { App } from './App.jsx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </StrictMode>
    );
}
