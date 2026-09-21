import { query, getActiveAiProvider } from '../db/database.js';
import { getCachedOpenAIClient, generateCompletion } from '../ai/llm_client.js';
import { evaluateTypeSafe, buildTypeSafeClassifierQuestions } from './typesafe_client.js';
import { markTopicUsed } from './topic_harvester.js';
import { generateLeraPhoto } from './image_generator.js';
import { getRoutedSystemPrompt } from '../prompts.js';
import fs from 'fs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Оценка темы через Jev: определяет эмоциональный вектор, сарказм, капс и формат
 */
export async function directStoryWithJev({ topic, situation, surface = 'CHANNEL', hasSourceMedia = false }) {
    console.log(`[JEV STORY ENGINE] Режиссура темы для ${surface}: "${topic}"`);

    // Вопросы для Jev режиссуры
    const questions = {
        emotion: {
            type: 'choice',
            instructions: 'Какая главная эмоция Леры подходит к этой ситуации?',
            criteria: {
                AMUSEMENT: 'Смех, ор, желание подколоть, абсурд тренда.',
                ANGER: 'Злость, бешенство, наезд, хамство ситуации.',
                CONFUSION: 'Обалдение, ахуй, непонимание происходящего.',
                WARMTH: 'Уют, ностальгия, тепло, умиротворение.',
                IRRITATION: 'Раздражение от тупости, срыв планов, усталость.',
                CURIOSITY: 'Любопытство, интересная находка, необычный факт.'
            }
        },
        intensity: {
            type: 'score',
            instructions: 'Насколько сильная эмоция?',
            criteria: ['50 легко', '100 заметно', '150 сильно', '200 максимальный напор']
        },
        sarcasm: {
            type: 'score',
            instructions: 'Сколько сарказма и иронии в подаче?',
            criteria: ['0 нет', '50 легкая ирония', '100 заметный сарказм', '150 едко', '200 максимальный яд']
        },
        assertiveness: {
            type: 'score',
            instructions: 'Насколько напористая подача?',
            criteria: ['50 спокойно', '100 уверенно', '150 жестко', '200 ультимативно']
        },
        caps_count: {
            type: 'choice',
            instructions: 'Сколько сообщений оправдано написать капсом для передачи накала?',
            criteria: {
                '0': 'Капс не нужен, подача спокойная.',
                '1': 'Одно вводное экспрессивное сообщение капсом.',
                '2': 'Два сообщения капсом (очень сильная злость или ор).'
            }
        },
        messages_count: {
            type: 'choice',
            instructions: 'Сколько сообщений в лесенке лучше всего раскрывают тему?',
            criteria: {
                '2': 'Короткий вброс и вывод (2 сообщения).',
                '3': 'Классика: зацепка, разгон, вывод (3 сообщения).',
                '4': 'Развернутая драматургия с деталями (4 сообщения).'
            }
        },
        needs_photo: {
            type: 'choice',
            instructions: 'Нужна ли контекстная реалистичная фотография Леры к этой ситуации?',
            criteria: {
                'true': 'Фотография усилит сцену (домашняя, эмоция, улица, кофе, учеба).',
                'false': 'Текста достаточно, фото не нужно.'
            }
        },
        source_delivery: {
            type: 'choice',
            instructions: 'Как подать источник новости (если он есть)?',
            criteria: {
                NONE: 'Вообще без ссылок, пересказать своими словами (натурально, 40% случаев).',
                COMMENTS: 'Написать ссылку в комментариях под постом/реакцией (25% случаев).',
                SEPARATE_MSG: 'Скинуть ссылку отдельным коротким сообщением в конце лесенки (20% случаев).',
                INLINE_LINK: 'Вшить гиперссылку в одно слово в тексте (15% случаев).'
            }
        },
        delivery_format: {
            type: 'choice',
            instructions: 'В каком формате подать историю в личном сообщении?',
            criteria: {
                DIRECT_SHARE: 'Сразу отправить мысль/новость лесенкой из 2-3 сообщений без выпрашивания (живой шеринг с другом, 75% случаев).',
                INTRIGUE_HOOK: 'Короткий интригующий вброс с вопросом («смотри че нашла», «прикинь че было», 25% случаев).'
            }
        }
    };

    let evaluation = null;
    try {
        const typesafeRes = await query('SELECT * FROM ai_providers WHERE (name ILIKE $1 OR name ILIKE $2) AND is_enabled = true LIMIT 1', ['%typesafe%', '%jev%']);
        const provider = typesafeRes.rows[0];
        if (provider) {
            evaluation = await evaluateTypeSafe({
                provider,
                state: `Тема: ${topic}. Ситуация: ${situation}. Среда публикации: ${surface}. Персонаж: Лера, 19 лет, студентка СПбГИК, СММ-щица в Питере.`,
                questions
            });
        }
    } catch (err) {
        console.warn('[JEV STORY ENGINE] Fallback evaluation:', err.message);
    }

    // Дефолтные безопасные значения при сбое Jev: в большинстве случаев (70-75%) — чистый текст без картинок!
    let mediaMode = 'none';
    const rand = Math.random();
    if (hasSourceMedia && rand < 0.45) {
        mediaMode = 'source_media';
    } else if (rand < 0.12 || (evaluation?.answers?.needs_photo === 'true' && rand < 0.25)) {
        mediaMode = 'ai_photo';
    } else {
        mediaMode = 'none';
    }

    // Способ подачи источника (link_delivery):
    // Девочки в Telegram не вшивают гиперссылки в каждом посте.
    // Если есть картинка/видео из источника (source_media) -> ссылка не нужна, достаточно самого медиа!
    // Варианты подачи:
    // - 'none': вообще без ссылок (пересказать своими словами)
    // - 'comments': скинуть ссылку в комментарии под постом
    // - 'separate_message': отдельное короткое сообщение со ссылкой ("если че вот: https://...")
    // - 'inline_hyperlink': аккуратная гиперссылка в 1 слове
    let linkDelivery = 'none';
    if (mediaMode === 'source_media') {
        // Если медиа из источника, в 80% случаев без ссылок, в 20% — ссылку можно кинуть в комментарии
        linkDelivery = Math.random() < 0.20 ? 'comments' : 'none';
    } else if (evaluation?.answers?.source_delivery) {
        const sd = evaluation.answers.source_delivery.toUpperCase();
        if (sd === 'COMMENTS') linkDelivery = 'comments';
        else if (sd === 'SEPARATE_MSG') linkDelivery = 'separate_message';
        else if (sd === 'INLINE_LINK') linkDelivery = 'inline_hyperlink';
        else linkDelivery = 'none';
    } else {
        const linkRand = Math.random();
        if (linkRand < 0.40) {
            linkDelivery = 'none';
        } else if (linkRand < 0.65) {
            linkDelivery = 'comments';
        } else if (linkRand < 0.85) {
            linkDelivery = 'separate_message';
        } else {
            linkDelivery = 'inline_hyperlink';
        }
    }

    const mood = {
        emotion: evaluation?.answers?.emotion || 'AMUSEMENT',
        intensity: Number(evaluation?.answers?.intensity) || 120,
        sarcasm: Number(evaluation?.answers?.sarcasm) || 100,
        assertiveness: Number(evaluation?.answers?.assertiveness) || 100,
        caps_count: parseInt(evaluation?.answers?.caps_count, 10) || (surface === 'CHANNEL' ? 1 : 0),
        messages_count: parseInt(evaluation?.answers?.messages_count, 10) || 3,
        needs_photo: mediaMode === 'ai_photo',
        media_mode: mediaMode,
        link_delivery: linkDelivery,
        delivery_format: evaluation?.answers?.delivery_format || (Math.random() < 0.25 ? 'INTRIGUE_HOOK' : 'DIRECT_SHARE')
    };

    return mood;
}

/**
 * Генерация сценария истории (лесенка сообщений) на основе режиссуры Jev
 */
export async function generateStoryScript({ topic, situation, mood, surface = 'CHANNEL', mediaUrl = null, sourceUrl = null }) {
    const isChannel = surface === 'CHANNEL';

    // Получаем реальный системный промпт режиссёра из админки (Story Director)
    let directorPrompt = '';
    try {
        const { getStoryDirectorPrompt } = await import('../prompts.js');
        directorPrompt = await getStoryDirectorPrompt();
    } catch (err) {
        console.warn('[JEV STORY ENGINE] Failed to load story director prompt:', err.message);
    }

    // Подтягиваем правила речи и характера Леры из базы
    let leraSpeechRules = '';
    try {
        const { getLeraProfile, getLeraProfileProjection } = await import('../db/database.js');
        const prof = await getLeraProfile();
        if (prof?.profile) {
            leraSpeechRules = getLeraProfileProjection(prof.profile, surface === 'CHANNEL' ? 'CHANNEL' : 'DM');
        }
    } catch (e) {
        console.warn('[JEV STORY ENGINE] Warning loading speech rules:', e.message);
    }

    const isDirectShare = surface === 'DM' && mood.delivery_format === 'DIRECT_SHARE';
    const isAiPhotoNeeded = mood.media_mode === 'ai_photo' || (mood.needs_photo === true && mood.media_mode !== 'source_media');

    let sourceLinkHint = '';
    if (sourceUrl) {
        if (mood.link_delivery === 'separate_message') {
            sourceLinkHint = `
[ССЫЛКА НА ИСТОЧНИК — ОТДЕЛЬНЫМ СООБЩЕНИЕМ]:
- URL: ${sourceUrl}
- Добавь ссылку отдельным последним сообщением в массив steps!
- Напиши непринужденно, как делятся ссылкой в телеграме (без канцелярита и слова «Источник»):
  Примеры для последнего сообщения:
  «если че вот: ${sourceUrl}»
  «пруф тут: ${sourceUrl}»
  «глянуть можно здесь: ${sourceUrl}»
  «вот: ${sourceUrl}»
- В предыдущих сообщениях лесенки никаких ссылок ставить не нужно!
`;
        } else if (mood.link_delivery === 'inline_hyperlink') {
            sourceLinkHint = `
[ССЫЛКА НА ИСТОЧНИК — АККУРАТНАЯ ГИПЕРССЫЛКА]:
- URL: ${sourceUrl}
- Можешь аккуратно вшить гиперссылку в 1-2 слова в теле одного из сообщений через HTML-тег: <a href="${sourceUrl}">текст</a>.
- Примеры: «<a href="${sourceUrl}">тут новость</a>», «<a href="${sourceUrl}">в первоисточнике</a>».
- Не делай ссылку длинной фразой, не пиши «Источник: ссылка».
`;
        } else {
            sourceLinkHint = `
[ССЫЛКА НА ИСТОЧНИК — НЕ ТРЕБУЕТСЯ]:
- Для этой темы ссылку давать НЕ НУЖНО. Перескажи суть или поделись мнением исключительно своими словами. Никаких ссылок и тегов <a href>!
`;
        }
    }

    const photoInstruction = isAiPhotoNeeded ? `
[ПРАВИЛА ДЛЯ PHOTO_PROMPT]:
- ТРЕБОВАНИЕ: Живой, динамичный, реалистичный кадр (POV от первого лица, вид на кофе/ноутбук/конспект, отражение в стекле вагона метро или мокром асфальте, шаг по улице, легкий смаз в движении, питерская атмосфера).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: "standing in room looking at phone", "holding phone looking at camera", "sitting at desk looking at smartphone" и любые статичные позы манекена.
- Описывай позу, действие, свет и обстановку на английском без упоминания внешности, лица или имени Леры.
- Поле "photo_prompt": "cinematic candid mobile photo, [детали сцены и ракурса]"
` : `
[ФОТО НЕ ТРЕБУЕТСЯ]:
- Для этой темы публикация будет чисто текстовой (щитпост / живые мысли).
- Поле "photo_prompt" верни строго как null.
`;

    const systemPrompt = `${directorPrompt || `Ты — режиссёр сценариев для Леры (19 лет, студентка СПбГИК в Питере).`}

${leraSpeechRules ? `[ПРАВИЛА РЕЧИ И ХАРАКТЕРА ЛЕРЫ]:\n${leraSpeechRules}\n` : ''}

[РЕЖИССУРА JEV ДЛЯ ТЕКУЩЕЙ СЦЕНЫ]:
- Эмоция: ${mood.emotion} (сила ${mood.intensity}/200)
- Сарказм: ${mood.sarcasm}/200
- Напор: ${mood.assertiveness}/200
- Сообщений капсом: ${mood.caps_count} (только короткое эмоциональное восклицание/акцент, не весь текст!)
- Сообщений в лесенке: ${mood.messages_count}
- Формат подачи: ${isChannel ? 'CHANNEL_LADDER' : mood.delivery_format}
- Формат медиа: ${isAiPhotoNeeded ? 'AI_PHOTO' : (mood.media_mode === 'source_media' ? 'SOURCE_MEDIA' : 'TEXT_ONLY')}
${sourceLinkHint}
${photoInstruction}

ТЕМА: ${topic}
СИТУАЦИЯ: ${situation}

Верни СТРОГО один валидный JSON-объект.
${isChannel ? `{
  "steps": [
    "строка 1 (вброс/реакция: я щас просто выпала с новости)",
    "строка 2 (конкретная деталь ситуации)",
    "строка 3 (финал/приземление)"
  ],
  "photo_prompt": ${isAiPhotoNeeded ? '"cinematic candid mobile photo, dynamic angle of scene"' : 'null'}
}` : (isDirectShare ? `{
  "format": "DIRECT_SHARE",
  "steps": [
    "строка 1 (смотри че щас вычитала)",
    "строка 2 (само мясо новости или ситуации)",
    "строка 3 (реакция или финал)"
  ],
  "photo_prompt": ${isAiPhotoNeeded ? '"cinematic candid mobile photo, dynamic angle of scene"' : 'null'}
}` : `{
  "format": "INTRIGUE_HOOK",
  "hook": "Короткий интригующий вброс с вопросом или зацепкой",
  "follow_up_steps": ["строка 1 (мясо истории)", "строка 2 (финал)"],
  "reject_reply": "Короткий подкол",
  "photo_prompt": ${isAiPhotoNeeded ? '"cinematic candid mobile photo, dynamic angle of scene"' : 'null'}
}`)}`;

    let ruleTemp = 0.75;
    let ruleTokens = 2500;
    let ruleProviderId = null;
    try {
        const { getLeraProfile } = await import('../db/database.js');
        const prof = await getLeraProfile();
        const directorRule = (prof?.profile?.blocks || []).find(b =>
            b.category === 'rule' && (b.surfaces || [b.surface] || []).includes('DIRECTOR')
        );
        if (directorRule) {
            if (directorRule.temperature !== undefined) ruleTemp = Number(directorRule.temperature);
            if (directorRule.max_tokens !== undefined) ruleTokens = Math.max(1500, Number(directorRule.max_tokens));
            if (directorRule.provider_id) ruleProviderId = Number(directorRule.provider_id);
        }
    } catch (ruleErr) {
        console.warn('[JEV STORY ENGINE] Warning reading DIRECTOR rule:', ruleErr.message);
    }

    const raw = await generateCompletion(systemPrompt, {
        temperature: ruleTemp,
        max_tokens: ruleTokens,
        providerId: ruleProviderId
    });
    let cleanJson = String(raw || '{}')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    const objMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (objMatch) cleanJson = objMatch[0];

    try {
        const parsed = JSON.parse(cleanJson);
        const steps = Array.isArray(parsed.steps) ? parsed.steps :
                      Array.isArray(parsed.messages) ? parsed.messages :
                      Array.isArray(parsed.story_steps) ? parsed.story_steps :
                      Array.isArray(parsed.ladder) ? parsed.ladder : null;
        if (steps && steps.length > 0) {
            parsed.steps = steps;
            return parsed;
        }
    } catch (jsonErr) {
        console.error('[JEV STORY ENGINE PARSE ERROR]:', jsonErr.message, 'Raw length:', String(raw || '').length, 'Snippet:', String(raw || '').slice(0, 300));
    }

    // Если парсинг не удался или шаги пусты, ни в коем случае не шлем сухой заголовок новости с описанием!
    // Формируем живую лесенку от лица Леры с реакцией на новость
    const fallbackFirst = `я щас просто выпала с новости: ${topic.toLowerCase().replace(/[.!?]+$/, '')}`;
    const fallbackSecond = situation.length > 150 ? situation.slice(0, 150).trim() + '...' : situation;
    const fallbackThird = `сижу перевариваю это кароч`;
    const fallbackSteps = [fallbackFirst, fallbackSecond, fallbackThird];

    if (sourceUrl && mood.link_delivery === 'separate_message') {
        fallbackSteps.push(`если че вот: ${sourceUrl}`);
    }

    return {
        steps: fallbackSteps,
        hook: fallbackFirst,
        follow_up_steps: fallbackSteps.slice(1),
        photo_prompt: null
    };
}

/**
 * Создание запланированной истории в pending_stories
 */
export async function createPendingStory({ topicId, userId = null, surface = 'DM' }) {
    let topicData = null;
    if (topicId) {
        const res = await query('SELECT * FROM content_topics WHERE id = $1 LIMIT 1', [topicId]);
        topicData = res.rows[0];
    }

    if (!topicData) {
        throw new Error('Тема не найдена');
    }

    const mood = await directStoryWithJev({
        topic: topicData.title,
        situation: topicData.situation,
        surface,
        hasSourceMedia: Boolean(topicData.media_url)
    });

    const script = await generateStoryScript({
        topic: topicData.title,
        situation: topicData.situation,
        mood,
        surface,
        mediaUrl: topicData.media_url,
        sourceUrl: topicData.source_url
    });

    const format = script.format || (surface === 'DM' ? 'INTRIGUE_HOOK' : 'CHANNEL_LADDER');
    const rawSteps = (Array.isArray(script.steps) && script.steps.length)
        ? script.steps
        : (Array.isArray(script.messages) && script.messages.length)
            ? script.messages
            : (Array.isArray(script.story_steps) && script.story_steps.length)
                ? script.story_steps
                : (Array.isArray(script.ladder) && script.ladder.length)
                    ? script.ladder
                    : [];

    const filteredSteps = rawSteps
        .map(s => String(s || '').trim())
        .filter(s => s && !s.toLowerCase().includes('photo_prompt_placeholder'));

    const effectiveSteps = filteredSteps.length > 0
        ? filteredSteps
        : [topicData.title, topicData.situation].filter(Boolean);

    const hookText = format === 'INTRIGUE_HOOK'
        ? (script.hook || effectiveSteps[0] || topicData.title)
        : (effectiveSteps[0] || topicData.title);

    const storySteps = format === 'INTRIGUE_HOOK'
        ? ((Array.isArray(script.follow_up_steps) && script.follow_up_steps.length)
            ? script.follow_up_steps
            : effectiveSteps.slice(1))
        : effectiveSteps;

    const finalMediaMode = mood.media_mode || (script.photo_prompt ? 'ai_photo' : 'none');

    const topicMeta = typeof topicData.metadata === 'string' ? JSON.parse(topicData.metadata) : (topicData.metadata || {});
    const mediaType = topicMeta.media_type || (topicData.media_url?.includes('.mp4') ? 'video' : 'photo');

    const inserted = await query(`
        INSERT INTO pending_stories (
            topic_id, surface, user_id, hook_text, story_steps,
            status, jev_emotions, metadata, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'WAITING_TRIGGER', $6, $7, NOW() + INTERVAL '24 hours', NOW())
        RETURNING *
    `, [
        topicData.id,
        surface,
        userId,
        hookText,
        JSON.stringify(storySteps || []),
        JSON.stringify(mood),
        JSON.stringify({
            delivery_format: format,
            media_mode: finalMediaMode,
            media_type: mediaType,
            link_delivery: mood.link_delivery || 'none',
            photo_prompt: script.photo_prompt || null,
            reject_reply: script.reject_reply || null,
            media_id: topicData.media_id || null,
            media_url: topicData.media_url || null,
            source_url: topicData.source_url || null
        })
    ]);

    return inserted.rows[0];
}

/**
 * Публикация готовой истории лесенкой в канал Telegram
 */
export async function publishStoryToChannel(bot, channelId, storyId) {
    const res = await query('SELECT * FROM pending_stories WHERE id = $1 LIMIT 1', [storyId]);
    const story = res.rows[0];
    if (!story) throw new Error('История не найдена');

    let steps = typeof story.story_steps === 'string' ? JSON.parse(story.story_steps) : (story.story_steps || []);
    if (!Array.isArray(steps)) steps = [];
    steps = steps
        .map(s => String(s || '').trim())
        .filter(s => s && !s.toLowerCase().includes('photo_prompt_placeholder'));

    if (steps.length === 0 && story.hook_text) {
        steps = [story.hook_text];
    }

    const meta = typeof story.metadata === 'string' ? JSON.parse(story.metadata) : (story.metadata || {});

    console.log(`[JEV STORY ENGINE] Публикация истории #${story.id} в канал ${channelId}...`);

    let lastSentMessageId = null;

    for (let i = 0; i < steps.length; i++) {
        const text = steps[i];
        try {
            const sent = await bot.telegram.sendMessage(channelId, text, {
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true }
            });
            if (sent?.message_id) lastSentMessageId = sent.message_id;
        } catch (htmlErr) {
            console.warn('[JEV STORY ENGINE] HTML parse failed, falling back to plain text:', htmlErr.message);
            const sent = await bot.telegram.sendMessage(channelId, text);
            if (sent?.message_id) lastSentMessageId = sent.message_id;
        }
        await sleep(1800);
    }

    const mediaMode = meta.media_mode || (meta.photo_prompt ? 'ai_photo' : (meta.media_url ? 'source_media' : 'none'));
    const isVideo = meta.media_type === 'video' || (meta.media_url && String(meta.media_url).includes('.mp4'));

    // 1. Отправка оригинального медиа из источника (видео или фото)
    if (mediaMode === 'source_media' && meta.media_url) {
        try {
            console.log(`[JEV STORY ENGINE] Отправка оригинального медиа (${isVideo ? 'video' : 'photo'}) из источника в канал ${channelId}:`, meta.media_url);
            let sentMedia = null;
            if (isVideo) {
                sentMedia = await bot.telegram.sendVideo(channelId, meta.media_url);
            } else {
                sentMedia = await bot.telegram.sendPhoto(channelId, meta.media_url);
            }
            if (sentMedia?.message_id) lastSentMessageId = sentMedia.message_id;
            await sleep(2000);
        } catch (srcErr) {
            console.warn('[JEV STORY ENGINE] Ошибка отправки source_media:', srcErr.message);
        }
    }
    // 2. Генерация ИИ-фото Леры (только если реально выбран ai_photo)
    else if (mediaMode === 'ai_photo' && meta.photo_prompt) {
        try {
            console.log(`[JEV STORY ENGINE] Генерация живого фото Леры через единый generateLeraPhoto...`);
            const photoResult = await generateLeraPhoto({
                prompt: meta.photo_prompt,
                bot,
                source: 'channel_story',
                saveToDb: true
            });

            if (photoResult?.buffer) {
                const fallbackCaption = steps.length === 0 ? (story.hook_text || '').slice(0, 1024) : undefined;
                const sentPhoto = await bot.telegram.sendPhoto(channelId, { source: photoResult.buffer }, fallbackCaption ? { caption: fallbackCaption } : undefined);
                if (sentPhoto?.message_id) lastSentMessageId = sentPhoto.message_id;
                await sleep(2000);
            }
        } catch (imgErr) {
            console.warn('[JEV STORY ENGINE] Photo gen warning:', imgErr.message);
        }
    }

    // 3. Если Jev выбрал подачу ссылки в комментарии (link_delivery === 'comments')
    if (meta.source_url && meta.link_delivery === 'comments') {
        try {
            // Узнаем связанный чат комментариев канала через getChat
            const chatInfo = await bot.telegram.getChat(channelId);
            const linkedChatId = chatInfo?.linked_chat_id;
            if (linkedChatId) {
                // Небольшая задержка перед комментом, как живой человек
                await sleep(3000);
                const commentVariants = [
                    `если че вот: ${meta.source_url}`,
                    `источник тут: ${meta.source_url}`,
                    `глянуть можно здесь: ${meta.source_url}`,
                    `пруф: ${meta.source_url}`,
                    `вот: ${meta.source_url}`
                ];
                const commentText = commentVariants[Math.floor(Math.random() * commentVariants.length)];
                console.log(`[JEV STORY ENGINE] Отправка ссылки в комментарии (чат ${linkedChatId}) к посту ${lastSentMessageId}...`);
                await bot.telegram.sendMessage(linkedChatId, commentText, {
                    link_preview_options: { is_disabled: false }
                });
            } else {
                console.log(`[JEV STORY ENGINE] linked_chat_id для канала ${channelId} не найден (комментарии не привязаны)`);
            }
        } catch (commentErr) {
            console.warn('[JEV STORY ENGINE] Ошибка отправки ссылки в комментарии:', commentErr.message);
        }
    }

    await query("UPDATE pending_stories SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1", [story.id]);
    if (story.topic_id) {
        await markTopicUsed(story.topic_id, 'channel');
    }

    console.log(`[JEV STORY ENGINE] История #${story.id} успешно опубликована в канал!`);
    return true;
}

/**
 * Классификация ответа пользователя на пендинг хук через Jev TypeSafe:
 * Возвращает: 'ACCEPT' (интересно / продолжай) | 'REJECT' (не интересно / отказ) | 'TOPIC_CHANGE' (вопрос / другая тема)
 */
export async function classifyPendingReply(userReplyText, hookText) {
    if (!userReplyText || typeof userReplyText !== 'string') return 'ACCEPT';
    const text = userReplyText.trim().toLowerCase();

    // Быстрые регулярки для очевидных согласий
    if (/^(давай|че там|что там|ну|ну и|рассказывай|жги|показывай|что за|че за|ого|огонь|ахах|хах|лол|кек|интрига|в смысле|серьезно|и че|и что|кидай|го|да|конечно|валяй)\b/i.test(text)) {
        return 'ACCEPT';
    }

    // Быстрые регулярки для очевидных отказов
    if (/^(не|нет|не хочу|не надо|не интересно|отстань|потом|занят|хватит|лень|пофиг|все равно)\b/i.test(text)) {
        return 'REJECT';
    }

    // Официальный Jev TypeSafe провайдер (evaluateTypeSafe)
    try {
        const typesafeRes = await query('SELECT * FROM ai_providers WHERE (name ILIKE $1 OR name ILIKE $2) AND is_enabled = true LIMIT 1', ['%typesafe%', '%jev%']);
        const provider = typesafeRes.rows[0];
        if (provider) {
            const ev = await evaluateTypeSafe({
                provider,
                state: `Сообщение Леры: "${hookText}". Ответ собеседника: "${userReplyText}".`,
                questions: {
                    pending_intent: {
                        type: 'choice',
                        instructions: 'Определи реакцию и намерение собеседника на реплику Леры:',
                        criteria: {
                            ACCEPT: 'Собеседнику интересно, согласен послушать, смеется или просит рассказать дальше.',
                            REJECT: 'Прямой отказ слушать, грубость или просьба отстать.',
                            TOPIC_CHANGE: 'Собеседник задал посторонний вопрос или переключился на другую тему.'
                        }
                    }
                },
                timeoutMs: 3000
            });

            const chosen = ev?.answers?.pending_intent;
            if (['ACCEPT', 'REJECT', 'TOPIC_CHANGE'].includes(chosen)) {
                return chosen;
            }
        }
    } catch (err) {
        console.warn('[CLASSIFY PENDING JEV WARNING]:', err.message);
    }

    // Безопасный дефолт: считаем что юзеру интересно
    return 'ACCEPT';
}

/**
 * Обработка пендинг-истории пользователя в queue.js
 * Использует SELECT FOR UPDATE для исключения race condition.
 */
export async function handleUserPendingStory(bot, userId, chatId, incomingText) {
    try {
        const res = await query(`
            SELECT * FROM pending_stories
            WHERE user_id = $1 AND status = 'AWAITING_USER_REPLY' AND expires_at > NOW()
            ORDER BY id DESC LIMIT 1
            FOR UPDATE
        `, [userId]);

        const story = res.rows[0];
        if (!story) return null; // Нет активного пендинга

        const meta = typeof story.metadata === 'string' ? JSON.parse(story.metadata) : (story.metadata || {});
        const steps = typeof story.story_steps === 'string' ? JSON.parse(story.story_steps) : (story.story_steps || []);
        const hookText = story.hook_text;

        const intent = await classifyPendingReply(incomingText, hookText);
        console.log(`🎭 [PENDING STORY INTENT] User ${userId}, Intent: ${intent}`);

        if (intent === 'REJECT') {
            await query("UPDATE pending_stories SET status = 'REJECTED', completed_at = NOW() WHERE id = $1", [story.id]);
            const rejectText = meta.reject_reply || 'ну лан, проехали тогда)';
            await bot.telegram.sendMessage(chatId, rejectText);
            return { handled: true, status: 'REJECTED' };
        }

        if (intent === 'ACCEPT') {
            await query("UPDATE pending_stories SET status = 'STORY_SENT', completed_at = NOW() WHERE id = $1", [story.id]);
            // Отправляем шаги лесенкой с паузами
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                await bot.telegram.sendChatAction(chatId, 'typing').catch(() => {});
                await sleep(Math.min(Math.max(step.length * 20, 800), 2200));
                await bot.telegram.sendMessage(chatId, step);
            }

            // Если привязано готовое фото из базы — подтягиваем и отправляем без задержки
            if (meta.photo_mode === 'CATALOG' || meta.needs_photo) {
                try {
                    const photoRes = await query('SELECT file_id, url FROM lera_photos WHERE enabled = true ORDER BY RANDOM() LIMIT 1');
                    const ph = photoRes.rows[0];
                    if (ph?.file_id || ph?.url) {
                        await bot.telegram.sendChatAction(chatId, 'upload_photo').catch(() => {});
                        await bot.telegram.sendPhoto(chatId, ph.file_id || ph.url);
                    }
                } catch (phErr) {
                    console.warn('[PENDING PHOTO WARN]:', phErr.message);
                }
            }

            return { handled: true, status: 'STORY_SENT' };
        }

        // TOPIC_CHANGE: помечаем историю как COMPLETED, даем основному диалогу ответить на вопрос с мостиком
        await query("UPDATE pending_stories SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1", [story.id]);
        return { handled: false, bridge_context: `Кстати, ты только что хотела рассказать собеседнику историю: "${hookText}". Ответь на его вопрос, и если к месту — вторым коротким сообщением дорасскажи эту тему.` };
    } catch (err) {
        console.error('[HANDLE PENDING STORY ERROR]:', err.message);
        return null;
    }
}
