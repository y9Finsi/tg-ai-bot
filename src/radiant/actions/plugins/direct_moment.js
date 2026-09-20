/**
 * RADIANT Plugin: direct_moment
 * Нативный инструмент режиссера для Леры.
 * Позволяет срежиссировать живой момент, мем, ситуацию или историю:
 * - Эмоциональные шкалы Jev (эмоция, интенсивность 50-200, сарказм 0-200, напор 50-200, капс)
 * - Драматургия сцены: entry_message -> buildup -> climax -> resolution (abrupt vs summary)
 * - По умолчанию 85% DIRECT_SHARE (сразу лесенкой без лишних вопросов)
 * - 15% HOOK_THEN_STORY (двухэтапный пендинг с TTL 45 мин)
 * - Подбор фото из lera_photos (быстро для ЛС) или генерация через NEW IMAGE (для канала)
 */

import { query } from '../../../db/database.js';
import { directStoryWithJev, generateStoryScript } from '../../../services/jev_story_engine.js';
import { markTopicUsed } from '../../../services/topic_harvester.js';

export const directMomentAction = {
    name: 'direct_moment',
    title: 'Режиссер момента / истории',
    description: 'Срежиссировать и отправить живую историю, мем, инфоповод или момент из жизни в диалог или канал с драматургией (вход, разгон, кульминация, финал), шкалами Jev и фото.',
    inputSchema: {
        type: 'object',
        properties: {
            topic_id: {
                type: 'integer',
                description: 'ID темы из банка content_topics (если берется готовая тема дня).'
            },
            topic: {
                type: 'string',
                description: 'Краткое название темы/момента (например: "Очередь за пышками на Большой Конюшенной" или "Мем про прод в пятницу").'
            },
            situation: {
                type: 'string',
                description: 'Суть происходящего: что случилось, что увидела, какой прикол.'
            },
            surface: {
                type: 'string',
                enum: ['DM', 'CHANNEL'],
                description: 'Куда направлен контент: DM (личка юзеру) или CHANNEL (телеграм-канал).'
            },
            delivery: {
                type: 'string',
                enum: ['DIRECT_SHARE', 'HOOK_THEN_STORY'],
                description: 'DIRECT_SHARE — рассказать сразу лесенкой без лишних вопросов (85% случаев). HOOK_THEN_STORY — интригующий хук в 1 строку с ожиданием реакции собеседника (только для редких сплетен/шока).'
            },
            emotion: {
                type: 'string',
                enum: ['AMUSEMENT', 'ANGER', 'CONFUSION', 'WARMTH', 'IRRITATION', 'CURIOSITY'],
                description: 'Главная эмоция момента (по шкале Jev).'
            },
            intensity: {
                type: 'integer',
                description: 'Интенсивность эмоции (50–200).'
            },
            sarcasm: {
                type: 'integer',
                description: 'Уровень сарказма и иронии (0–200).'
            },
            assertiveness: {
                type: 'integer',
                description: 'Напор подачи (50–200).'
            },
            caps_count: {
                type: 'integer',
                description: 'Количество сообщений капсом для накала (0, 1 или 2).'
            },
            dramaturgy: {
                type: 'object',
                properties: {
                    entry_message: { type: 'string', description: 'Точка входа / стартовая эмоция' },
                    buildup: { type: 'array', items: { type: 'string' }, description: 'Разгон / контекст ситуации' },
                    climax: { type: 'string', description: 'Кульминация / панчлайн' },
                    resolution: { type: 'string', description: 'Финал / реакция' },
                    ending_style: { type: 'string', enum: ['abrupt', 'summary'], description: 'abrupt — живой обрыв на полуслове; summary — цельный вывод' }
                },
                description: 'Драматургическая структура истории'
            },
            needs_photo: {
                type: 'boolean',
                description: 'Нужно ли контекстное фото к истории.'
            },
            photo_mode: {
                type: 'string',
                enum: ['CATALOG', 'FRESH_AI'],
                description: 'CATALOG — взять готовое селфи из lera_photos (быстро для ЛС). FRESH_AI — сгенерировать новое через NEW IMAGE.'
            }
        },
        required: ['situation']
    },
    timeoutMs: 25000,
    config: {},

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        const isPublic = Boolean(context.isPublic);
        const surface = String(args.surface || (isPublic ? 'CHANNEL' : 'DM')).toUpperCase();
        // В ЛС по умолчанию DIRECT_SHARE (85%), если явно не запрошен хук
        const delivery = args.delivery || (surface === 'DM' ? 'DIRECT_SHARE' : 'DIRECT_SHARE');
        const situation = String(args.situation || '').trim();
        let topicTitle = String(args.topic || args.topic_title || '').trim();
        let topicId = args.topic_id ? Number(args.topic_id) : null;
        let mediaUrl = null;

        if (topicId) {
            try {
                const topicRes = await query('SELECT * FROM content_topics WHERE id = $1 LIMIT 1', [topicId]);
                if (topicRes.rows[0]) {
                    const row = topicRes.rows[0];
                    if (!topicTitle) topicTitle = row.title;
                    mediaUrl = row.media_url;
                }
            } catch (err) {
                console.warn('[DIRECT MOMENT] Ошибка чтения topic_id:', err.message);
            }
        }

        if (!topicTitle) {
            topicTitle = situation.slice(0, 50);
        }

        console.log(`🎬 [DIRECT MOMENT] Режиссура сцены: "${topicTitle}" (surface: ${surface}, delivery: ${delivery})`);

        try {
            // 1. Оценка настроения через Jev
            let mood = {
                emotion: args.emotion || 'AMUSEMENT',
                intensity: Number(args.intensity) || 120,
                sarcasm: Number(args.sarcasm) || 90,
                assertiveness: Number(args.assertiveness) || 100,
                caps_count: args.caps_count !== undefined ? Number(args.caps_count) : (surface === 'CHANNEL' ? 1 : 0),
                needs_photo: args.needs_photo !== undefined ? Boolean(args.needs_photo) : true
            };

            if (!args.emotion || !args.intensity) {
                const jevMood = await directStoryWithJev({
                    topic: topicTitle,
                    situation,
                    surface
                });
                mood = { ...mood, ...jevMood };
            }

            // 2. Формирование драматургии и сценария
            let script = null;
            let dramaturgy = args.dramaturgy || null;

            if (dramaturgy && dramaturgy.entry_message && dramaturgy.climax) {
                const steps = [
                    dramaturgy.entry_message,
                    ...(dramaturgy.buildup || []),
                    dramaturgy.climax,
                    ...(dramaturgy.resolution ? [dramaturgy.resolution] : [])
                ];
                script = {
                    hook: dramaturgy.entry_message,
                    follow_up_steps: steps.slice(1),
                    steps,
                    reject_reply: 'ну лан, проехали тогда)',
                    photo_prompt: `Lera 19yo realistic candid photo, emotion: ${mood.emotion}`
                };
            } else {
                script = await generateStoryScript({
                    topic: topicTitle,
                    situation,
                    mood,
                    surface,
                    mediaUrl
                });

                dramaturgy = {
                    entry_message: script.hook || script.steps?.[0] || topicTitle,
                    buildup: (script.follow_up_steps || script.steps || []).slice(0, -1),
                    climax: (script.follow_up_steps || script.steps || []).slice(-1)[0] || '',
                    resolution: surface === 'CHANNEL' ? (script.steps?.slice(-1)[0] || null) : null,
                    ending_style: surface === 'CHANNEL' ? 'summary' : 'abrupt'
                };
            }

            // 3. Отправка в канал
            if (surface === 'CHANNEL') {
                const pendingRes = await query(`
                    INSERT INTO pending_stories (
                        topic_id, surface, user_id, hook_text, story_steps,
                        dramaturgy, status, jev_emotions, metadata, created_at
                    ) VALUES ($1, 'CHANNEL', NULL, $2, $3, $4, 'READY_FOR_CHANNEL', $5, $6, NOW())
                    RETURNING id
                `, [
                    topicId,
                    script.steps?.[0] || topicTitle,
                    JSON.stringify(script.steps || []),
                    JSON.stringify(dramaturgy),
                    JSON.stringify(mood),
                    JSON.stringify({
                        photo_prompt: script.photo_prompt || null,
                        media_url: mediaUrl,
                        photo_mode: args.photo_mode || 'FRESH_AI'
                    })
                ]);

                if (topicId) {
                    await markTopicUsed(topicId, 'channel').catch(() => {});
                }

                return {
                    status: 'success',
                    data: {
                        story_id: pendingRes.rows[0]?.id,
                        surface: 'CHANNEL',
                        mood,
                        dramaturgy,
                        steps: script.steps,
                        photo_prompt: script.photo_prompt
                    }
                };
            }

            // 4. Отправка в ЛС: DIRECT_SHARE (сразу все шаги) или HOOK_THEN_STORY (пендинг)
            const allSteps = script.steps || [script.hook, ...(script.follow_up_steps || [])];
            const hookText = delivery === 'HOOK_THEN_STORY' ? script.hook : (allSteps[0] || topicTitle);
            const followUpSteps = delivery === 'HOOK_THEN_STORY' 
                ? (script.follow_up_steps || allSteps.slice(1))
                : allSteps;

            const pendingRes = await query(`
                INSERT INTO pending_stories (
                    topic_id, surface, user_id, hook_text, story_steps,
                    dramaturgy, status, jev_emotions, metadata, expires_at, created_at
                ) VALUES ($1, 'DM', $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '45 minutes', NOW())
                RETURNING id
            `, [
                topicId,
                userId,
                hookText,
                JSON.stringify(followUpSteps),
                JSON.stringify(dramaturgy),
                delivery === 'HOOK_THEN_STORY' ? 'AWAITING_USER_REPLY' : 'COMPLETED',
                JSON.stringify(mood),
                JSON.stringify({
                    delivery,
                    reject_reply: script.reject_reply || 'ну лан, проехали тогда)',
                    photo_prompt: script.photo_prompt || null,
                    photo_mode: args.photo_mode || 'CATALOG',
                    media_url: mediaUrl
                })
            ]);

            if (topicId) {
                await markTopicUsed(topicId, 'dm_initiative').catch(() => {});
            }

            return {
                status: 'success',
                data: {
                    story_id: pendingRes.rows[0]?.id,
                    surface: 'DM',
                    delivery,
                    mood,
                    dramaturgy,
                    hook: hookText,
                    steps: allSteps,
                    follow_up_steps: followUpSteps,
                    reject_reply: script.reject_reply
                }
            };
        } catch (err) {
            console.error('❌ [DIRECT MOMENT ERROR]:', err.message);
            return {
                status: 'error',
                error: {
                    code: 'DIRECT_MOMENT_FAILED',
                    message: err.message
                }
            };
        }
    }
};
