import React from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';

export function RelationshipEditor({
    relationshipForm,
    setRelationshipForm,
    relationshipEvents = [],
    onSave
}) {
    return (
        <div className="crm-section relationship-section">
            <h3>Динамические отношения</h3>
            <div className="inline-controls">
                <label>
                    Trust
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={relationshipForm.trust}
                        onChange={event => setRelationshipForm({ ...relationshipForm, trust: Number(event.target.value) })}
                    />
                </label>
                <label>
                    Affection
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={relationshipForm.affection}
                        onChange={event => setRelationshipForm({ ...relationshipForm, affection: Number(event.target.value) })}
                    />
                </label>
                <label>
                    Irritation
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={relationshipForm.irritation}
                        onChange={event => setRelationshipForm({ ...relationshipForm, irritation: Number(event.target.value) })}
                    />
                </label>
                <Button onClick={onSave}>Сохранить</Button>
            </div>
            <div className="facts-list">
                {relationshipEvents.length ? (
                    relationshipEvents.map(event => (
                        <div className="managed-row" key={event.id}>
                            <Database size={15} />
                            <div>
                                <strong>{event.event_type} · intensity {Number(event.intensity || 0).toFixed(2)}</strong>
                                <span>
                                    trust {Number(event.trust_delta || 0).toFixed(1)} · affection {Number(event.affection_delta || 0).toFixed(1)} · irritation {Number(event.irritation_delta || 0).toFixed(1)}
                                </span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="empty-state">Relationship events ещё не накопились.</div>
                )}
            </div>
        </div>
    );
}

export default RelationshipEditor;
