import React, { useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { api } from '@/lib/api.js';

export function SlotHealthPing({ slotKey, slotName, toast }) {
    const [pingState, setPingState] = useState({ loading: false, latency: null, status: null, error: null });

    async function pingSlot() {
        setPingState({ loading: true, latency: null, status: null, error: null });
        const start = Date.now();
        try {
            const res = await api('/api/admin/providers/ping', {
                method: 'POST',
                body: JSON.stringify({ slot: slotKey })
            });
            const latency = Date.now() - start;
            setPingState({ loading: false, latency, status: res.status || 'OK', error: null });
            toast?.(`${slotName || slotKey}: пинг успешен (${latency} мс)`);
        } catch (err) {
            const latency = Date.now() - start;
            setPingState({ loading: false, latency, status: 'ERROR', error: err.message });
            toast?.(`${slotName || slotKey}: ошибка пинга (${err.message})`, 'error');
        }
    }

    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Button size="xs" variant="outline" onClick={pingSlot} disabled={pingState.loading} title="Проверить доступность слота">
                <RefreshCw size={12} className={pingState.loading ? 'animate-spin' : ''} />
                {pingState.loading ? 'Ping…' : 'Ping'}
            </Button>
            {pingState.status === 'OK' && (
                <Badge variant="green">
                    <CheckCircle2 size={11} /> {pingState.latency} мс
                </Badge>
            )}
            {pingState.status === 'ERROR' && (
                <Badge variant="red" title={pingState.error || 'Сбой'}>
                    <CircleAlert size={11} /> Сбой
                </Badge>
            )}
        </div>
    );
}

export const HealthCheckButton = SlotHealthPing;
export default SlotHealthPing;
