import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PromptAssemblyMap } from '@/features/channel/PromptAssemblyMap.jsx';

export const LERA_PROMPT_MODULES = [
    { key: 'core', label: '01 · Ядро личности', description: 'Возраст, город, учёба и базовый характер Леры.' },
    { key: 'common', label: '02 · Речь и общие правила', description: 'Манера общения, формат Telegram и ограничения.' },
    { key: 'casual', label: '03 · Обычный диалог', description: 'Правила режима CASUAL.' },
    { key: 'erotic', label: '04 · Интимный диалог', description: 'Правила режима EROTIC.' },
    { key: 'joke', label: '05 · Шутки и реакции', description: 'Правила режима JOKE.' }
];

export function ProductionPromptModulesPanel({
    profilePromptBlocks = {},
    setProfilePromptBlocks,
    onSave,
    onReset
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Маршрутизация ответов"
                title="Модули маршрутизации Production"
                description="Общие правила Production разделены на реальные модули core/common/casual/erotic/joke. Профиль Леры редактируется отдельной вкладкой."
                action={
                    <div className="prompt-header-actions">
                        <Button size="sm" variant="outline" onClick={onReset}>
                            Сбросить к дефолту
                        </Button>
                        <Button size="sm" onClick={onSave}>
                            Сохранить модули
                        </Button>
                    </div>
                }
            />
            <PromptAssemblyMap />
            <div className="prompt-modules-editor">
                {LERA_PROMPT_MODULES.map(def => (
                    <div className="prompt-module-block" key={def.key}>
                        <div className="prompt-module-header">
                            <strong>{def.label}</strong>
                            <span>{def.description}</span>
                        </div>
                        <textarea
                            value={profilePromptBlocks[def.key] || ''}
                            onChange={e => setProfilePromptBlocks({
                                ...profilePromptBlocks,
                                [def.key]: e.target.value
                            })}
                            rows={4}
                        />
                    </div>
                ))}
            </div>
            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Все изменения применяются ко всем новым входящим сообщениям пользователей.</span>
                <Button onClick={onSave}>Сохранить модули</Button>
            </div>
        </Card>
    );
}

export const ProductionPromptModules = ProductionPromptModulesPanel;
export const PromptEditor = ProductionPromptModulesPanel;
export default ProductionPromptModulesPanel;
