import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { LeraCharacterBlock } from './components/LeraCharacterBlock.jsx';

function StudioApp() {
    return (
        <div className="min-h-screen bg-[#08090a] p-6 max-w-7xl mx-auto">
            <LeraCharacterBlock toast={(msg) => console.log(msg)} />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <StudioApp />
    </React.StrictMode>
);
