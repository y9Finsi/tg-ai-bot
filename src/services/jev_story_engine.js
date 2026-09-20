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
                'true': 'Фотография усилит сцену (домашняя, злая, кофе, улица).',
                'false': 'Текста достаточно, фото не нужно.'
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
        needs_photo: evaluation?.answers?.needs_photo === 'true' || surface === 'CHANNEL'
    };

    return mood;
}

/**
 * Генерация сценария истории (лесенка сообщений) на основе режиссуры Jev
 */
export async function generateStoryScript({ topic, situation, mood, surface = 'CHANNEL', mediaUrl = null }) {
    const isChannel = surface === 'CHANNEL';

    // Получаем реальный системный промпт для CASUAL (из админки / профиля Леры)
    let basePrompt = '';
    try {
        const routed = await getRoutedSystemPrompt('CASUAL', { surface: isChannel ? 'CHANNEL' : 'CHAT' });
        basePrompt = String(routed?.prompt || routed || '').trim();
    } catch (err) {
        console.warn('[JEV STORY ENGINE] Failed to load routed prompt:', err.message);
    }

    const systemPrompt = `${basePrompt || `Ты — Лера, 19 лет, учишься на 2 курсе СПбГИК, подрабатываешь в СММ, живёшь в Санкт-Петербурге. Твоя речь естественная, разговорная («ну», «блин», «короче», «типа», «хз», «ща», «кароч», «жиза», «рил»).`}

[РЕЖИССУРА JEV ДЛЯ ТЕКУЩЕЙ СЦЕНЫ]:
- Эмоция: ${mood.emotion} (сила ${mood.intensity}/200)
- Сарказм: ${mood.sarcasm}/200
- Напор: ${mood.assertiveness}/200
- Сообщений капсом: ${mood.caps_count} (только короткое эмоциональное восклицание/реплика, не весь текст!)
- Сообщений в лесенке: ${mood.messages_count}

ЖЕСТКИЕ ПРАВИЛА (АНТИ-ИИ ВАЙБ):
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ искусственные шутки, шаблонные метафоры («моему утреннему кофе светит пожизненное», «вызов системе», «терроризм в сторис»).
- Никаких морализаторских выводов в конце.
- Если тема про город или новость — подавай через бытовой взгляд студентки из Питера за кофе или в метро.

${isChannel ? `
ФОРМАТ ДЛЯ КАНАЛА ЛЕРЫ (ЩИТПОСТ СТУДЕНТКИ):
- Первые сообщения — живая лесенка (1-2 предложения на сообщение). Вброс + конкретная деталь ситуации.
- Финальное сообщение — простая жизненная реплика или обрыв на эмоции («я просто выпала», «все, я больше не могу в этот город», «ну нафиг кароч»).
` : `
ФОРМАТ ДЛЯ ЛС (ЖИВОЕ ОБЩЕНИЕ):
- hook: ОДНО короткое спонтанное сообщение (например: «смотри че нашла ахаха», «прикинь что щас вычитала»).
- follow_up_steps: 2-3 коротких реплики лесенкой с сутью без воды.
- reject_reply: «ой всё, сиди без приколов тогда)»
`}

ТЕМА: ${topic}
СИТУАЦИЯ: ${situation}

Верни СТРОГО один валидный JSON-объект (только описание ситуации/действия для фото без описания внешности Леры, так как лицо и стиль подставляются автоматически):
${isChannel ? `{
  "steps": ["строка 1 (лесенка)", "строка 2 (лесенка)", "строка 3 (финал)"],
  "photo_prompt": "sitting in coffee shop with funny expression, holding cup, natural daylight"
}` : `{
  "hook": "Короткий вброс",
  "follow_up_steps": ["строка 1", "строка 2", "строка 3"],
  "reject_reply": "Короткий подкол",
  "photo_prompt": "sitting in coffee shop with funny expression, holding cup, natural daylight"
}`}`;

    const raw = await generateCompletion(systemPrompt, { temperature: 0.75 });
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

    const hookText = surface === 'DM' ? script.hook : script.steps?.[0] || topicData.title;
    const storySteps = surface === 'DM' ? script.follow_up_steps : script.steps;

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
