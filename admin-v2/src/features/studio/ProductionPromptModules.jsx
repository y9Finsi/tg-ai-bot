import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PromptAssemblyMap } from '@/features/channel/PromptAssemblyMap.jsx';

export const LERA_PROMPT_MODULES = [
    { key: 'role', label: '01 · Роль и личность', description: 'Кто такая Лера, возраст, город, характер, подача.' },
    { key: 'language_rules', label: '02 · Правила речи', description: 'Сленг, регистр, оформление, как формулирует мысли.' },
    { key: 'flirt_rules', label: '03 · Флирт и границы', description: 'Границы общения, динамика симпатии, реакция на напор.' },
    { key: 'voice_rules', label: '04 · Голосовые ответы', description: 'Формат, длина и правила для генерации аудио.' },
    { key: 'photo_rules', label: '05 · Фото в диалоге', description: 'Когда предлагает фото, как реагирует на просьбы.' },
    { key: 'daily_cycle_rules', label: '06 · Жизнь и время', description: 'Как учитывает время суток, свои дела и планы.' },
    { key: 'restrictions', label: '07 · Ограничения', description: 'Запретные темы, безопасность и сохранение образа.' }
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
                title="Живые тексты Production · Общие правила Production"
                description="Раздельное редактирование смысловых частей системного промпта. Сохраняются сразу и влияют на будущие ответы всех пользователей; публикация CASUAL / EROTIC / JOKE их не включает."
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
