import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export const DEFAULT_JUDGE_PROMPT = `Ты проверяешь ответ Леры пользователю перед отправкой.
Оценивай по шкале от 1 до 10 следующие критерии:
1. Соответствие образу (19 лет, студентка из СПб, живой тон)
2. Естественность речи (отсутствие роботизированности и канцелярита)
3. Соблюдение личных границ и характера
4. Отсутствие галлюцинаций фактов памяти

Если ответ нарушает образ (слишком формальный, услужливый, фальшивый), верни VERDICT: REJECT с кодом ошибки и предложением исправления.
Если ответ хороший, верни VERDICT: APPROVE.`;

export const DEFAULT_CHANNEL_JUDGE_PROMPT = `Ты проверяешь пост Леры для публичного Telegram-канала.
Критерии:
1. Пост написан от первого лица, легко, живо, как в реальном ТГК
2. Соответствует выбранной теме и не содержит запрещенных тем
3. Нет клише блогеров («Всем привет!», «Ставьте лайки»)
4. Не раскрывает интимных секретов или чужой приватной информации

Верни VERDICT: APPROVE или VERDICT: REJECT.`;

export function LeraJudgeSettings({
    judgeForm = {},
    setJudgeForm,
    onSave,
    onResetJudgePrompt
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Контроль качества"
                title="AI-судья ответа (Автоматический ревьюер)"
                description="Второй слой ИИ, проверяющий сгенерированные ответы и посты перед отправкой."
            />
            <div className="channel-settings-grid judge-fields-grid">
                <label>
                    Режим работы Judge
                    <select
                        value={judgeForm.mode || 'ENFORCE'}
                        onChange={e => setJudgeForm({ ...judgeForm, mode: e.target.value })}
                    >
                        <option value="OFF">OFF (Отключен)</option>
                        <option value="OBSERVE">Наблюдение: только лог (OBSERVE)</option>
                        <option value="ENFORCE">Проверка и один retry (ENFORCE)</option>
                    </select>
                </label>
                <label>
                    Модель Judge
                    <input
                        value={judgeForm.model || ''}
                        placeholder="gpt-4o-mini / gemini-2.5-flash"
                        onChange={e => setJudgeForm({ ...judgeForm, model: e.target.value })}
                    />
                </label>
                <label>
                    Таймаут (мс)
                    <input
                        type="number"
                        min="1000"
                        max="20000"
                        step="500"
                        value={judgeForm.timeoutMs || 5000}
                        onChange={e => setJudgeForm({ ...judgeForm, timeoutMs: Number(e.target.value) })}
                    />
                </label>
                <label>
                    Макс токенов
                    <input
                        type="number"
                        min="50"
                        max="1000"
                        value={judgeForm.maxTokens || 150}
                        onChange={e => setJudgeForm({ ...judgeForm, maxTokens: Number(e.target.value) })}
                    />
                </label>
            </div>

            <div className="context-template-editor" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Системный промпт Judge для ЛС:</span>
                    <Button size="xs" variant="outline" onClick={onResetJudgePrompt}>
                        Сбросить к дефолту
                    </Button>
                </div>
                <textarea
                    value={judgeForm.prompt || DEFAULT_JUDGE_PROMPT}
                    rows={6}
                    onChange={e => setJudgeForm({ ...judgeForm, prompt: e.target.value })}
                />
            </div>

            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Judge перепроверяет ответы в фоне. При ENFORCE ответ будет отправлен на повторную генерацию при критических ошибках.</span>
                <Button onClick={onSave}>Сохранить настройки Judge</Button>
            </div>
        </Card>
    );
}

export const LeraJudgeSettingsEditor = LeraJudgeSettings;
export default LeraJudgeSettings;
