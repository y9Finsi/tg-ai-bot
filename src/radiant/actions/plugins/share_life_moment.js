/**
 * RADIANT Plugin: share_life_moment
 * Инструмент для органичного шеринга историями, темами дня, мемами и моментами из жизни Леры.
 * Включает в себя режиссера Jev (эмоциональные шкалы, капс, лесенка, контекстное фото).
 */

import { query } from '../../../db/database.js';
import { directStoryWithJev, generateStoryScript } from '../../../services/jev_story_engine.js';
import { markTopicUsed } from '../../../services/topic_harvester.js';

export const shareLifeMomentAction = {
    name: 'share_life_moment',
    title: 'Поделиться моментом из жизни / темой',
    description: 'Поделиться с собеседником или каналом свежей темой, инфоповодом, мемом из ленты или историей из своей жизни (СПбГИК, СММ, город, тикток, бытовой тупняк). Вызывай органично к слову во время разговора или когда хочешь спонтанно рассказать о себе, не дожидаясь расспросов.',
    inputSchema: {
        type: 'object',
        properties: {
            topic_id: {
                type: 'integer',
                description: 'ID темы из банка тем (если берешь тему из доступных тем дня).'
            },
            topic_title: {
                type: 'string',
                description: 'Краткое название темы или инцидента.'
            },
            situation: {
                type: 'string',
                description: 'Суть того, чем хочешь поделиться (что произошло, что увидела, какой мем/тренд).'
            },
            mode: {
                type: 'string',
                enum: ['DIRECT_SHARE', 'INTRIGUE'],
                description: 'DIRECT_SHARE — сразу рассказать историю/мысль (по умолчанию, без дурацких вопросов). INTRIGUE — закинуть интригующий крючок в 1 строку (только для неожиданных масштабных историй).'
            },
            surface: {
                type: 'string',
                enum: ['DM', 'CHANNEL'],
                description: 'Где происходит публикация: DM (личка) или CHANNEL (канал Леры).'
            }
        },
        required: ['situation']
    },
    timeoutMs: 15000,
    config: {},

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        const surface = String(args.surface || (context.isPublic ? 'CHANNEL' : 'DM')).toUpperCase();
        const mode = args.mode || 'DIRECT_SHARE';
        const situation = String(args.situation || '').trim();
        let topicTitle = String(args.topic_title || '').trim();
        let topicId = args.topic_id ? Number(args.topic_id) : null;
        let mediaUrl = null;

        // Если передан topic_id — подтягиваем данные из content_topics
        if (topicId) {
            try {
                const topicRes = await query('SELECT * FROM content_topics WHERE id = $1 LIMIT 1', [topicId]);
                if (topicRes.rows[0]) {
                    const row = topicRes.rows[0];
                    if (!topicTitle) topicTitle = row.title;
                    mediaUrl = row.media_url;
                }
            } catch (err) {
                console.warn('[SHARE LIFE MOMENT] Ошибка чтения topic_id:', err.message);
            }
        }

        if (!topicTitle) {
            topicTitle = situation.slice(0, 60);
        }

        console.log(`[SHARE LIFE MOMENT] Режиссура момента: "${topicTitle}" (mode: ${mode}, surface: ${surface})`);

        try {
            // 1. Режиссер Jev рассчитывает эмоциональную подачу
            const mood = await directStoryWithJev({
                topic: topicTitle,
                situation,
                surface
            });

            // 2. Генератор сценария собирает живые реплики
            const script = await generateStoryScript({
                topic: topicTitle,
                situation,
                mood,
                surface,
                mediaUrl
            });

            // Если был topic_id — помечаем тему как использованную
            if (topicId) {
                await markTopicUsed(topicId, surface === 'CHANNEL' ? 'channel' : 'dm_initiative').catch(() => {});
            }

            // Записываем историю в pending_stories для фиксации в админке
            const hookText = surface === 'DM' ? (mode === 'INTRIGUE' ? script.hook : (script.follow_up_steps?.[0] || script.hook)) : script.steps?.[0];
            const steps = surface === 'DM' ? (script.follow_up_steps || [script.hook]) : (script.steps || []);

            const pendingRes = await query(`
                INSERT INTO pending_stories (
                    topic_id, surface, user_id, hook_text, story_steps,
                    status, jev_emotions, metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                RETURNING id
            `, [
                topicId,
                surface,
                userId,
                hookText || topicTitle,
                JSON.stringify(steps),
                mode === 'INTRIGUE' ? 'HOOK_SENT_AWAITING_REPLY' : 'COMPLETED',
                JSON.stringify(mood),
                JSON.stringify({
                    mode,
                    photo_prompt: script.photo_prompt || null,
                    reject_reply: script.reject_reply || null,
                    media_url: mediaUrl
                })
            ]);

            return {
                status: 'success',
                data: {
                    story_id: pendingRes.rows[0]?.id,
                    mode,
                    surface,
                    mood,
                    script,
                    media_url: mediaUrl
                }
            };
        } catch (err) {
            console.error('[SHARE LIFE MOMENT ERROR]:', err.message);
            return {
                status: 'error',
                error: {
                    code: 'DIRECTOR_FAILED',
                    message: err.message
                }
            };
        }
    }
};
