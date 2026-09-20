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
export async function directStoryWithJev({ topic, situation, surface = 'CHANNEL' }) {
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

    // Дефолтные безопасные значения при сбое Jev
    const mood = {
        emotion: evaluation?.answers?.emotion || 'AMUSEMENT',
        intensity: Number(evaluation?.answers?.intensity) || 120,
        sarcasm: Number(evaluation?.answers?.sarcasm) || 100,
        assertiveness: Number(evaluation?.answers?.assertiveness) || 100,
        caps_count: parseInt(evaluation?.answers?.caps_count, 10) || (surface === 'CHANNEL' ? 1 : 0),
        messages_count: parseInt(evaluation?.answers?.messages_count, 10) || 3,
        needs_photo: evaluation?.answers?.needs_photo === 'true' || surface === 'CHANNEL',
        delivery_format: evaluation?.answers?.delivery_format || (Math.random() < 0.25 ? 'INTRIGUE_HOOK' : 'DIRECT_SHARE')
    };

    return mood;
}

/**
 * Генерация сценария истории (лесенка сообщений) на основе режиссуры Jev
 */
export async function generateStoryScript({ topic, situation, mood, surface = 'CHANNEL', mediaUrl = null }) {
    const isChannel = surface === 'CHANNEL';

    // Получаем реальный системный промпт режиссёра из админки (Story Director)
    let directorPrompt = '';
    try {
        const { getStoryDirectorPrompt } = await import('../prompts.js');
        directorPrompt = await getStoryDirectorPrompt();
    } catch (err) {
        console.warn('[JEV STORY ENGINE] Failed to load story director prompt:', err.message);
    }

    const isDirectShare = surface === 'DM' && mood.delivery_format === 'DIRECT_SHARE';

    const systemPrompt = `${directorPrompt || `Ты — режиссёр сценариев для Леры (19 лет, студентка СПбГИК в Питере).`}

[РЕЖИССУРА JEV ДЛЯ ТЕКУЩЕЙ СЦЕНЫ]:
- Эмоция: ${mood.emotion} (сила ${mood.intensity}/200)
- Сарказм: ${mood.sarcasm}/200
- Напор: ${mood.assertiveness}/200
- Сообщений капсом: ${mood.caps_count} (только короткое эмоциональное восклицание/акцент, не весь текст!)
- Сообщений в лесенке: ${mood.messages_count}
- Формат подачи: ${isChannel ? 'CHANNEL_LADDER' : mood.delivery_format}

ТЕМА: ${topic}
СИТУАЦИЯ: ${situation}

Верни СТРОГО один валидный JSON-объект.
Внимание к photo_prompt: напиши ТОЛЬКО краткое описание позы/действия и окружения под тему (на английском), БЕЗ описания внешности, лица или имени Леры (они подставляются автоматически):
${isChannel ? `{
  "steps": [
    "строка 1 (вброс/реакция: я щас просто выпала с новости)",
    "строка 2 (конкретная деталь ситуации)",
    "строка 3 (финал/приземление)"
  ],
  "photo_prompt": "candid shot holding phone, emotional reaction, urban background"
}` : (isDirectShare ? `{
  "format": "DIRECT_SHARE",
  "steps": [
    "строка 1 (смотри че щас вычитала)",
    "строка 2 (само мясо новости или ситуации)",
    "строка 3 (реакция или финал)"
  ],
  "photo_prompt": "candid shot sitting at desk, emotional reaction"
}` : `{
  "format": "INTRIGUE_HOOK",
  "hook": "Короткий интригующий вброс с вопросом или зацепкой",
  "follow_up_steps": ["строка 1 (мясо истории)", "строка 2 (финал)"],
  "reject_reply": "Короткий подкол",
  "photo_prompt": "candid shot sitting at desk, emotional reaction"
}`)}`;

    let ruleTemp = 0.75;
    let ruleTokens = 1200;
    let ruleProviderId = null;
    try {
        const { getLeraProfile } = await import('../db/database.js');
        const prof = await getLeraProfile();
        const directorRule = (prof?.profile?.blocks || []).find(b =>
            b.category === 'rule' && (b.surfaces || [b.surface] || []).includes('DIRECTOR')
        );
        if (directorRule) {
            if (directorRule.temperature !== undefined) ruleTemp = Number(directorRule.temperature);
            if (directorRule.max_tokens !== undefined) ruleTokens = Number(directorRule.max_tokens);
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
    const cleanJson = String(raw || '{}').replace(/^```json/i, '').replace(/```$/i, '').trim();
    try {
        return JSON.parse(cleanJson);
    } catch {
        return { steps: [topic, situation], hook: topic, follow_up_steps: [situation] };
    }
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
        surface
    });

    const script = await generateStoryScript({
        topic: topicData.title,
        situation: topicData.situation,
        mood,
        surface,
        mediaUrl: topicData.media_url
    });

    const format = script.format || (surface === 'DM' ? 'INTRIGUE_HOOK' : 'CHANNEL_LADDER');
    const hookText = format === 'INTRIGUE_HOOK' ? (script.hook || topicData.title) : (script.steps?.[0] || topicData.title);
    const storySteps = format === 'INTRIGUE_HOOK' ? (script.follow_up_steps || []) : (script.steps || []);

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
            photo_prompt: script.photo_prompt || null,
            reject_reply: script.reject_reply || null,
            media_id: topicData.media_id || null,
            media_url: topicData.media_url || null
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

    const steps = typeof story.story_steps === 'string' ? JSON.parse(story.story_steps) : (story.story_steps || []);
    const meta = typeof story.metadata === 'string' ? JSON.parse(story.metadata) : (story.metadata || {});

    console.log(`[JEV STORY ENGINE] Публикация истории #${story.id} в канал ${channelId}...`);

    for (let i = 0; i < steps.length; i++) {
        const text = steps[i];
        await bot.telegram.sendMessage(channelId, text);
        await sleep(1800);
    }

    // Если требуется фото — используем единый генератор generateLeraPhoto со стилем из админки и мастер-референсом лица
    if (meta.photo_prompt) {
        try {
            console.log(`[JEV STORY ENGINE] Генерация фото Леры через единый generateLeraPhoto...`);
            const photoResult = await generateLeraPhoto({
                prompt: meta.photo_prompt,
                bot,
                source: 'channel_story',
                saveToDb: true
            });

            if (photoResult?.buffer) {
                await bot.telegram.sendPhoto(channelId, { source: photoResult.buffer });
                await sleep(2000);
            }
        } catch (imgErr) {
            console.warn('[JEV STORY ENGINE] Photo gen warning:', imgErr.message);
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
