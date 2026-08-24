import React from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';

export function UserMemoryFacts({
    facts = [],
    factText,
    setFactText,
    onAddFact,
    onToggleFact,
    onDeleteFact
}) {
    return (
        <div className="crm-section memory-section">
            <h3>Память и Факты о пользователе</h3>
            <div className="inline-controls">
                <input
                    value={factText}
                    onChange={event => setFactText(event.target.value)}
                    placeholder="Новый факт (например, Любит аниме и кофе)"
                />
                <Button onClick={onAddFact}>Добавить факт</Button>
            </div>
            <div className="facts-list">
                {facts.length ? (
                    facts.map(fact => (
                        <div className="managed-row" key={fact.id}>
                            <Database size={15} />
                            <div>
                                <strong>{fact.fact}</strong>
                                <span>{fact.source || 'manual'} · {fact.is_active === false ? 'выключен' : 'активен'}</span>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onToggleFact(fact.id, fact.is_active === false)}
                            >
                                {fact.is_active === false ? 'Включить' : 'Выключить'}
                            </Button>
                            {onDeleteFact && (
                                <ConfirmAction
                                    title="Удалить факт?"
                                    description="Факт перестанет использоваться в памяти пользователя."
                                    confirmText="Удалить"
                                    variant="danger"
                                    onConfirm={() => onDeleteFact(fact.id)}
                                >
                                    Удалить
                                </ConfirmAction>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="empty-state">Фактов в памяти не найдено.</div>
                )}
            </div>
        </div>
    );
}

export default UserMemoryFacts;
