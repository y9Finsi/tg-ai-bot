import React, { useState } from 'react';
import { Terminal, CircleAlert, BrainCircuit, ListCollapse } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { LiveServerLogsTab } from './LiveServerLogsTab.jsx';
import { ErrorsAuditTab } from './ErrorsAuditTab.jsx';
import { SimulationRationaleTab } from './SimulationRationaleTab.jsx';

export function LlmPanel({ toast }) {
    const [subTab, setSubTab] = useState('server-logs');

    return (
        <div className="llm-panel-container admin-domain-page">
            <div className="crm-subnav">
                <Button
                    variant={subTab === 'server-logs' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('server-logs')}
                >
                    <Terminal size={14} /> 💻 Live Server Logs
                </Button>
                <Button
                    variant={subTab === 'errors' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('errors')}
                >
                    <CircleAlert size={14} /> ⚠️ Ошибки и Аварии
                </Button>
                <Button
                    variant={subTab === 'rationale' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSubTab('rationale')}
                >
                    <BrainCircuit size={14} /> 🧠 Обоснование решений GOAP
                </Button>
            </div>

            {subTab === 'server-logs' && <LiveServerLogsTab toast={toast} />}
            {subTab === 'errors' && <ErrorsAuditTab toast={toast} />}
            {subTab === 'rationale' && <SimulationRationaleTab toast={toast} />}
        </div>
    );
}

export const LogsPanel = LlmPanel;
export default LlmPanel;
