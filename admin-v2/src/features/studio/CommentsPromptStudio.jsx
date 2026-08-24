import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export function CommentsPromptStudio({
    commentsPrompt,
    setCommentsPrompt,
    onSave
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Публичные дискуссии"
                title="Промпт-студия комментариев в Telegram-канале"
                description="Настройка тональности, дерзости и правил ответов подписчикам в комментариях к постам."
            />
            <div className="context-template-editor" style={{ marginTop: 12 }}>
                <label className="classifier-prompt-editor">
                    Инструкции для комментариев и реакций:
                    <textarea
                        value={commentsPrompt || ''}
                        placeholder="Например: общайся коротко, подкалывай за глупые вопросы, люби питерцев, не отвечай на откровенный спам..."
                        rows={8}
                        onChange={e => setCommentsPrompt(e.target.value)}
                    />
                </label>
            </div>
            <div className="channel-action-bar" style={{ marginTop: 16 }}>
                <span>Используется при обработке комментариев в привязанной группе канала.</span>
                <Button onClick={onSave}>Сохранить промпт комментариев</Button>
            </div>
        </Card>
    );
}

export const CommentsPromptStudioPanel = CommentsPromptStudio;
export default CommentsPromptStudio;
