import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api.js';
import { normalizeTopicShares } from '@/lib/topicUtils.js';
import { ChannelSettings } from './ChannelSettings.jsx';
import { ChannelCommentsConfig } from './ChannelCommentsConfig.jsx';
import { ChannelTopicWeights } from './ChannelTopicWeights.jsx';
import { ChannelDraftEditor } from './ChannelDraftEditor.jsx';
import { ChannelHistoryFeed } from './ChannelHistoryFeed.jsx';

export function ChannelTab({ toast }) {
    const [channel, setChannel] = useState(null);
    const [channelHistory, setChannelHistory] = useState([]);
    const [channelForm, setChannelForm] = useState({
        channelId: '',
        channelUrl: '',
        frequencyHours: 12,
        postsPerDay: 2,
        editorialMode: 'reference_short',
        formatSequence: ['photo_caption', 'short_thought', 'life_observation'],
        messagesCount: '1',
        isEnabled: false,
        topics: ['thoughts', 'life'],
        topicWeights: { thoughts: 50, flirt: 0, life: 50, jokes: 0, questions: 0 },
        mediaMode: 'none',
        temperature: 0.7,
        inheritLeraPrompt: false,
        includeDayContext: false,
        publicProfileEnabled: true,
        publicFactsEnabled: false,
        publicFacts: [],
        creativity: 0.6,
        ctaStyle: '',
        judgeMode: 'ENFORCE',
        judgeProviderId: '',
        judgeModel: '',
        judgePrompt: '',
        judgeTimeoutMs: 5000,
        judgeMaxTokens: 120,
        commentsEnabled: true,
        reactionChance: 40,
        commentChance: 15,
        recognizeUsers: true,
        commentsPrompt: '',
        promptBlocks: { voice: '', context: '', restrictions: '', cta: '' }
    });
    const [channelDraft, setChannelDraft] = useState(null);
    const [draftText, setDraftText] = useState('');
    const [generatingAiPreview, setGeneratingAiPreview] = useState(false);

    const run = async (action, success) => {
        try {
            const result = await action();
            if (success && toast) toast(success);
            return result;
        } catch (error) {
            if (toast) toast(error.message, 'error');
            return null;
        }
    };

    async function loadChannel() {
        try {
            const [result, history] = await Promise.all([
                api('/api/admin/channel/settings'),
                api('/api/admin/channel/history?limit=30')
            ]);
            setChannel(result);
            setChannelHistory(history.posts || []);
            const selectedTopics = result.settings?.topics || ['thoughts', 'life'];
            const tw = normalizeTopicShares(selectedTopics, result.settings?.topic_weights || { thoughts: 50, life: 50 });
            setChannelForm({
                channelId: result.channelId || '',
                channelUrl: result.channelUrl || '',
                frequencyHours: result.settings?.frequency_hours || 12,
                postsPerDay: result.settings?.posts_per_day || 2,
                editorialMode: result.settings?.editorial_mode || 'reference_short',
                formatSequence: result.settings?.format_sequence || ['photo_caption', 'short_thought', 'life_observation'],
                messagesCount: result.settings?.messages_count || '1',
                isEnabled: Boolean(result.settings?.is_enabled),
                topics: selectedTopics,
                topicWeights: tw,
                mediaMode: result.settings?.media_mode || 'none',
                temperature: result.settings?.temperature ?? 0.7,
                inheritLeraPrompt: false,
                includeDayContext: false,
                publicProfileEnabled: result.settings?.public_profile_enabled !== false,
                publicFactsEnabled: Boolean(result.settings?.public_facts_enabled),
                publicFacts: result.settings?.public_facts || [],
                creativity: result.settings?.creativity ?? 0.6,
                ctaStyle: result.settings?.cta_style || '',
                judgeMode: result.settings?.judge_mode || 'ENFORCE',
                judgeProviderId: result.settings?.judge_provider_id || '',
                judgeModel: result.settings?.judge_model || '',
                judgePrompt: result.settings?.judge_prompt || '',
                judgeTimeoutMs: result.settings?.judge_timeout_ms || 5000,
                judgeMaxTokens: result.settings?.judge_max_tokens || 120,
                commentsEnabled: result.settings?.comments_enabled !== false,
                reactionChance: result.settings?.reaction_chance ?? 40,
                commentChance: result.settings?.comment_chance ?? 15,
                recognizeUsers: result.settings?.recognize_users !== false,
                commentsPrompt: result.settings?.comments_prompt || '',
                promptBlocks: { voice: '', context: '', restrictions: '', cta: '', ...(result.settings?.prompt_blocks || {}) }
            });
        } catch (err) {
            if (toast) toast(err.message, 'error');
        }
    }

    async function saveChannel() {
        await run(() => api('/api/admin/channel/settings', {
            method: 'POST',
            body: JSON.stringify(channelForm)
        }), 'Настройки автопостинга сохранены');
        loadChannel();
    }

    async function generateDraft(override = {}) {
        const mode = override.mediaMode === 'inherit' ? channelForm.mediaMode : (override.mediaMode || channelForm.mediaMode);
        const topic = override.topic === 'random' ? undefined : (override.topic || undefined);
        const format = override.format === 'auto' ? undefined : (override.format || undefined);

        const result = await run(() => api('/api/admin/channel/draft', {
            method: 'POST',
            body: JSON.stringify({
                media_mode: mode,
                topic: topic,
                content_format: format
            })
        }));
        if (result?.draft) {
            setChannelDraft(result.draft);
            setDraftText(result.draft.text || '');
            if (toast) toast('Черновик готов — проверьте текст и медиа перед публикацией');
        }
    }

    async function generateDraftAiPhoto() {
        if (!channelDraft || !draftText.trim()) return;
        setGeneratingAiPreview(true);
        try {
            const res = await api('/api/admin/channel/preview-ai-photo', {
                method: 'POST',
                body: JSON.stringify({
                    topic: channelDraft.topic || 'life',
                    text: draftText.trim()
                })
            });
            if (res?.preview_url) {
                setChannelDraft(prev => ({
                    ...prev,
                    media: {
                        type: 'ai_photo',
                        preview_url: res.preview_url,
                        file_id: res.file_id || null,
                        description: 'Сгенерированное ИИ-фото (Gemini)'
                    }
                }));
                if (toast) toast('AI-фото успешно сгенерировано для превью!');
            }
        } catch (e) {
            if (toast) toast(`Ошибка генерации фото: ${e.message}`, 'error');
        } finally {
            setGeneratingAiPreview(false);
        }
    }

    async function publishDraft() {
        if (!channelDraft || !draftText.trim()) return;
        const result = await run(() => api('/api/admin/channel/publish-draft', {
            method: 'POST',
            body: JSON.stringify({
                text: draftText.trim(),
                topic: channelDraft.topic,
                provenance: channelDraft.provenance,
                media_content_id: channelDraft.media_content_id,
                media: channelDraft.media
            })
        }), 'Пост опубликован в Telegram-канале');
        if (result) {
            setChannelDraft(null);
            setDraftText('');
            loadChannel();
        }
    }

    async function deleteHistoryPost(postId) {
        await run(() => api(`/api/admin/channel/history/${postId}`, { method: 'DELETE' }), 'Запись истории удалена');
        loadChannel();
    }

    useEffect(() => {
        loadChannel();
    }, []);

    return (
        <div className="content-channel-layout admin-domain-page">
            <ChannelSettings
                channel={channel}
                channelForm={channelForm}
                setChannelForm={setChannelForm}
                onSave={saveChannel}
                toast={toast}
            />
            <ChannelCommentsConfig
                channelForm={channelForm}
                setChannelForm={setChannelForm}
                onSave={saveChannel}
            />
            <ChannelTopicWeights
                channelForm={channelForm}
                setChannelForm={setChannelForm}
                onSave={saveChannel}
            />
            <ChannelDraftEditor
                channelForm={channelForm}
                setChannelForm={setChannelForm}
                channelDraft={channelDraft}
                setChannelDraft={setChannelDraft}
                draftText={draftText}
                setDraftText={setDraftText}
                onGenerateDraft={generateDraft}
                onGenerateAiPhoto={generateDraftAiPhoto}
                onPublishDraft={publishDraft}
                generatingAiPreview={generatingAiPreview}
            />
            <ChannelHistoryFeed
                history={channelHistory}
                onDeletePost={deleteHistoryPost}
            />
        </div>
    );
}

export default ChannelTab;
