import OpenAI from 'openai';
import {
    getUser, addApiCost,
    getActiveAiProvider, getUserMemories, getMemorySettings,
    getLeraPhotoCandidates, getSentPhotos,
    getRecentConversationEvents, formatConversationEvent, getRecentSimulationReflections,
    savePromptLog, applyUserRelationshipEvent, getInitiativeDailyCounts,
    getActiveDialogueEvents, getContentCandidates,
    getLeraProfile
} from './database.js';
import { getRoutedSystemPrompt } from './prompts.js';
import { PHOTO_INTENT_REGEX, VOICE_INTENT_REGEX, IMAGE_STYLES } from './constants/intents.js';
import { requestLlmCompletion } from './ai/llm_client.js';
import { extractFactsInBackground } from './ai/memory_extractor.js';
import { ContextBuilder } from './ai/context_builder.js';
import { validateUserCommand } from './ai/command_gate.js';
import { evaluateLeraReply, getQualityFallback, requiresReplyRetry } from './ai/response_quality.js';
import { classifyIntent, getModeGenerationParams, getModeIntentConfig, getRoutingSettings } from './ai/intent_router.js';
import { computeClimaxState, getClimaxPromptInstruction, CLIMAX_STAGES } from './ai/climax_engine.js';
import { judgeLeraReply } from './ai/response_judge.js';
import { cleanResponseText } from './utils/response_text.js';
import { generateLeraPhoto } from './services/image_generator.js';
import { generateLeraVoice } from './services/voice_generator.js';
import { actionRegistry, executeAction } from './radiant/actions/index.js';
import { createContextRetriever } from './ai/context_retriever.js';
import { buildMemoryRetrievalQuery } from './ai/memory_query.js';
import { shouldPersistToolObservation } from './ai/tool_observation_policy.js';
import { memoryRepository } from './memory/memory_repository.js';
// --- 1. КОНСТАНТЫ И ДИНАМИЧЕСКИЙ КЛИЕНТ ИИ ---

const rateLimitMap = new Map();
setInterval(() => rateLimitMap.clear(), 60 * 1000);

let activeProviderCache = null;
let openaiClientInstance = null;
const contextRetriever = createContextRetriever({ repository: memoryRepository });

export { buildMemoryRetrievalQuery };

function normalizeMemoryForPrompt(memory, index) {
    const text = String(memory?.text ?? memory?.fact ?? memory?.normalizedText ?? '').trim();
    return {
        ...memory,
        id: String(memory?.id ?? `legacy-${index}`),
        text,
        fact: text,
        score: Number.isFinite(Number(memory?.score)) ? Number(memory.score) : 1
    };
}

function legacyRetrievalResult(memories, query, startedAt, fallbackReason) {
    const facts = (Array.isArray(memories) ? memories : [])
        .map(normalizeMemoryForPrompt)
        .filter(fact => fact.text);
    return {
        facts,
        coreFacts: [],
        promptText: facts.map(fact => `- ${fact.text}`).join('\n'),
        trace: {
            query_text: query,
            source: 'legacy_repository',
            strategy: 'legacy_repository_fallback',
            latency_ms: Date.now() - startedAt,
            latency: Date.now() - startedAt,
            fallbackReason,
            selected: facts,
            candidates: facts.map((fact, index) => ({
                ...fact,
                candidateRank: index + 1,
                selected: true,
                selectedRank: index + 1,
                finalScore: fact.score,
                exclusionReason: null
            })),
            shadow: [],
            metadata: {
                source: 'legacy_repository',
                latency_ms: Date.now() - startedAt,
                fallbackReason
            }
        }
    };
}

function persistMemoryRetrieval(userId, memoryRetrieval) {
    if (!memoryRetrieval?.trace) return;
    memoryRepository.recordRetrieval({
        userId,
        queryText: memoryRetrieval.trace.query_text,
        strategy: memoryRetrieval.trace.strategy,
        requestedLimit: memoryRetrieval.trace.metadata?.limit || memoryRetrieval.facts?.length || 0,
        contextText: memoryRetrieval.promptText,
        metadata: {
            ...(memoryRetrieval.trace.metadata || {}),
            source: memoryRetrieval.trace.source,
            fallbackReason: memoryRetrieval.trace.fallbackReason || null
        },
        selectedFacts: memoryRetrieval.facts || [],
        candidates: memoryRetrieval.trace.candidates || []
    }).catch(error => {
        console.warn('[MEMORY RETRIEVAL LOG ERROR]:', error.message);
    });
}

function getMoscowHour() {
    return Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false
    }).format(new Date()));
}

function isUsableTelegramPhotoId(value) {
    if (typeof value !== 'string') return false;
    const photoId = value.trim();
    if (!photoId || photoId === '[object Object]') return false;
    // Telegram file_id characters, plus a normal remote URL accepted by sendPhoto.
    return /^https?:\/\/\S+$/.test(photoId) || /^[A-Za-z0-9_-]+$/.test(photoId);
}

const FORBIDDEN_STARTERS = [
    { pattern: /^(я тут|я щас?|я вот)\b/i, label: 'я тут / я ща' },
    { pattern: /^(бля|блять)\b/i, label: 'бля' },
    { pattern: /^(ну кароч|кароче|короче)\b/i, label: 'короче / кароч' },
    { pattern: /^(ну блин|блин)\b/i, label: 'ну блин' },
    { pattern: /^(слушай|слышь)\b/i, label: 'слушай' },
    { pattern: /^(ахахах|хахах)\b/i, label: 'ахахах' },
    { pattern: /^(пипец|пипяу|пепец)\b/i, label: 'пипец / пипяу' }
];

export async function reloadAIClient() {
    try {
        activeProviderCache = await getActiveAiProvider();
        if (activeProviderCache) {
            openaiClientInstance = new OpenAI({
                baseURL: activeProviderCache.base_url,
                apiKey: activeProviderCache.api_key,
                defaultHeaders: {
                    'HTTP-Referer': 'https://t.me/your_bot',
                    'X-Title': 'Telegram AI Bot',
                }
            });
        } else {
            openaiClientInstance = new OpenAI({
                baseURL: 'https://inference.dahl.global/v1',
                apiKey: process.env.OPENROUTER_API_KEY || 'sk-placeholder',
                defaultHeaders: {
                    'HTTP-Referer': 'https://t.me/your_bot',
                    'X-Title': 'Telegram AI Bot',
                }
            });
        }
    } catch (e) {
        console.error('❌ Ошибка перезагрузки ИИ-провайдера:', e);
    }
    return activeProviderCache;
}

export async function getOpenAIClientAndModel() {
    if (!openaiClientInstance) {
        await reloadAIClient();
    }
    const model = activeProviderCache?.model_name || 'deepseek/deepseek-chat';
    return { client: openaiClientInstance, model };
}

export { PHOTO_INTENT_REGEX, extractFactsInBackground };

// --- 2. ВСПОМОГАТЕЛЬНЫЕ ХЕЛПЕРЫ ---

async function loadRecentReflections(limit = 3) {
    try {
        return await getRecentSimulationReflections(limit);
    } catch (error) {
        console.error('[REFLECTION CONTEXT ERROR]:', error.message);
        return [];
    }
}

function getFormattedTimeMSK() {
    const now = new Date();
    const timeString = now.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    return `\n\n[КОНТЕКСТ ВРЕМЕНИ И ДАТЫ]: Сейчас: ${timeString} (MSK).`;
}

async function getFreeLocalPhotoStream(user = null, userText = '') {
    try {
        const isPremium = user && user.is_premium;
        const accessLevel = isPremium ? 'vip' : 'free';

        const hour = getMoscowHour();
        let currentTimeOfDay = 'day';
        if (hour >= 5 && hour < 12) currentTimeOfDay = 'morning';
        else if (hour >= 12 && hour < 18) currentTimeOfDay = 'day';
        else if (hour >= 18 && hour < 23) currentTimeOfDay = 'evening';
        else currentTimeOfDay = 'night';

        const sentPhotoIds = user ? await getSentPhotos(user) : [];

        let candidates = await getLeraPhotoCandidates({ access_level: accessLevel, time_of_day: currentTimeOfDay });
        let available = [];

        if (candidates && candidates.length > 0) {
            available = candidates.filter(c => isUsableTelegramPhotoId(c.file_id)
                && !sentPhotoIds.includes(String(c.id)) && !sentPhotoIds.includes(String(c.file_id)));
        }

        if (available.length === 0) {
            const allCandidates = await getLeraPhotoCandidates({ access_level: accessLevel, time_of_day: null });
            if (allCandidates && allCandidates.length > 0) {
                available = allCandidates.filter(c => isUsableTelegramPhotoId(c.file_id)
                    && !sentPhotoIds.includes(String(c.id)) && !sentPhotoIds.includes(String(c.file_id)));
            }

            if (available.length === 0 && allCandidates && allCandidates.length > 0) {
                const lastSent = sentPhotoIds[sentPhotoIds.length - 1];
                available = allCandidates.filter(c => isUsableTelegramPhotoId(c.file_id)
                    && String(c.id) !== String(lastSent) && String(c.file_id) !== String(lastSent));
                if (available.length === 0) {
                    available = allCandidates.filter(c => isUsableTelegramPhotoId(c.file_id));
                }
            }
        }

        if (available && available.length > 0) {
            let selectedPhoto = null;

            if (available.length === 1) {
                selectedPhoto = available[0];
            } else {
                const photoOptionsText = available.map(c => `- ID ${c.id} [${c.time_of_day || 'любое время'}]: ${c.caption || (c.tags ? c.tags.join(', ') : '') || 'Фото Леры'}`).join('\n');

                try {
                    const selectionPrompt = `Пользователь написал в чат: "${userText || 'пришли фото'}".
Доступные варианты фотографий Леры:
${photoOptionsText}

Выбери ТОЛЬКО ОДИН ID фотографии, сюжет которой наиболее логично подходит под контекст.
Ответь СТРОГО одной цифрой ID (например: 5).`;

                    const aiRes = await requestLlmCompletion(user || { roleplay_mode: 'flirthot' }, [
                        { role: 'system', content: 'Ты классификатор и подборщик релевантного фото. Выдавай только ID числом.' },
                        { role: 'user', content: selectionPrompt }
                    ], false, getOpenAIClientAndModel, { trace: true, userId: user?.telegram_id || 0, kind: 'PHOTO_SELECTOR', userText });

                    const aiChoiceText = aiRes?.rawText || '';
                    const matchedId = parseInt(aiChoiceText.replace(/[^0-9]/g, ''), 10);
                    selectedPhoto = available.find(c => c.id === matchedId);
                } catch (selectErr) {
                    console.error("[PHOTO SELECTOR ERROR]", selectErr.message);
                }

                if (!selectedPhoto) {
                    selectedPhoto = available[Math.floor(Math.random() * available.length)];
                }
            }

            if (selectedPhoto && isUsableTelegramPhotoId(selectedPhoto.file_id)) {
                const photoTime = selectedPhoto.time_of_day || 'any';
                const isDifferentTime = photoTime !== 'any' && photoTime !== currentTimeOfDay;
                return {
                    id: selectedPhoto.id,
                    file_id: selectedPhoto.file_id,
                    caption: selectedPhoto.caption,
                    tags: selectedPhoto.tags,
                    time_of_day: photoTime,
                    isDifferentTime
                };
            }
        }

        // No unfiltered fallback: free users must never receive premium/vip rows.
    } catch (err) {
        console.error("Ошибка загрузки фото Леры:", err);
    }
    return null;
}

async function generatePhotoForPrompt(user, imagePrompt, preselectedPhoto = null) {
    // 1. Пробуем динамическую генерацию через Gemini с мастер-референсом Леры
    if (imagePrompt && typeof imagePrompt === 'string' && imagePrompt.trim()) {
        try {
            const hour = getMoscowHour();
            const currentTimeOfDay = hour >= 5 && hour < 12 ? 'morning' : (hour >= 12 && hour < 18 ? 'day' : (hour >= 18 && hour < 23 ? 'evening' : 'night'));
            const generated = await generateLeraPhoto({
                prompt: imagePrompt,
                timeOfDay: currentTimeOfDay,
                user,
                bot: null,
                saveToDb: true,
                source: 'chat'
            });
            if (generated && generated.buffer) {
                return {
                    source: generated.buffer,
                    filename: generated.filename || 'photo.jpg',
                    file_id: generated.file_id || null,
                    id: generated.savedPhoto?.id || null,
                    caption: generated.caption,
                    isGenerated: true
                };
            }
        } catch (genErr) {
            console.warn('[AI CHAT PHOTO] Сбой динамической генерации, переключаемся на fallback фото:', genErr.message);
        }
    }

    if (preselectedPhoto) {
        return preselectedPhoto;
    }

    // 2. Мягкий fallback на готовое фото Леры из базы данных
    const dbPhoto = await getFreeLocalPhotoStream(user, imagePrompt);
    if (dbPhoto) {
        return dbPhoto;
    }

    return null;
}

async function generateVoiceForText(user, voiceText) {
    if (voiceText && typeof voiceText === 'string' && voiceText.trim()) {
        try {
            const generated = await generateLeraVoice({ text: voiceText });
            if (generated && generated.buffer) {
                return {
                    source: generated.buffer,
                    buffer: generated.buffer,
                    filename: generated.filename || 'voice.ogg',
                    mimeType: generated.mimeType,
                    text: voiceText.trim(),
                    isGenerated: true
                };
            }
        } catch (vErr) {
            console.warn('[AI CHAT VOICE] Сбой динамической генерации голоса:', vErr.message);
        }
    }
    return null;
}

// --- 3. ПАЙПЛАЙН AI ДВИЖКА ---

async function buildMessagePayload(user, userId, { userText, photoUrls = [], isInitiative, routingMode = 'CASUAL', initiativeReason = null, initiativeKind = null, contentCandidates = [], batchId = null, eventIds = [], preMessageGapSeconds = null, firstMessageAt = null, actionResult = null, climaxState = null }) {
    const productionRoutingSettings = await getRoutingSettings();
    const productionIntentConfig = getModeIntentConfig(routingMode, productionRoutingSettings);
    const [baseSystemPromptText, conversationEvents] = await Promise.all([
        getRoutedSystemPrompt(routingMode, productionIntentConfig),
        getRecentConversationEvents(userId, 10).catch(() => [])
    ]);

    const mediaLogInstruction = "\n\nПометки вида [Лера отправила личное фото: ...] в истории диалога — это служебные логи отправленных медиафайлов. Никогда не повторяй текст этих пометок в своих ответах!";

    let isPhotoRequest = false;
    let preselectedPhoto = null;

    if (!isInitiative && userText) {
        isPhotoRequest = PHOTO_INTENT_REGEX.test(userText);
    }

    const hour = getMoscowHour();
    const currentTimeOfDay = hour >= 5 && hour < 12
        ? 'morning'
        : (hour >= 12 && hour < 18 ? 'day' : (hour >= 18 && hour < 23 ? 'evening' : 'night'));

    const timeRuMap = {
        morning: 'утреннее (утро)',
        day: 'дневное (день)',
        evening: 'вечернее (вечер)',
        night: 'ночное (ночь)'
    };

    if (isPhotoRequest) {
        preselectedPhoto = await getFreeLocalPhotoStream(user, userText || '');
    }

    const now = new Date();
    // Передаём в ContextBuilder однозначный момент времени, а не локализованную
    // строку без timezone: иначе сервер в UTC может повторно прибавить смещение.
    const currentTime = now.toISOString();
    const currentBatchIds = new Set((eventIds || []).map(Number));
    const priorEvents = conversationEvents.filter(event => !currentBatchIds.has(Number(event.id)) && event.status === 'COMPLETED');
    const lastEvent = priorEvents.at(-1);
    const lastLeraText = [...priorEvents].reverse().find(event => event.role === 'lera' && event.content)?.content || '';
    const memoryQuery = buildMemoryRetrievalQuery({ userText, lastLeraText, routingMode });
    let memoryRetrieval;
    try {
        memoryRetrieval = await contextRetriever({
            userId,
            query: memoryQuery
        });
    } catch (memoryError) {
        const fallbackStartedAt = Date.now();
        const legacyMemories = await getUserMemories(userId, 30).catch(() => []);
        memoryRetrieval = legacyRetrievalResult(
            legacyMemories,
            memoryQuery,
            fallbackStartedAt,
            `typed_memory_error:${memoryError.message}`
        );
        console.warn(`[MEMORY RETRIEVAL FALLBACK] user ${userId}:`, memoryError.message);
    }
    const memories = memoryRetrieval.facts || [];
    const gapSeconds = Number.isFinite(Number(preMessageGapSeconds))
        ? Math.max(0, Number(preMessageGapSeconds))
        : (lastEvent ? Math.max(0, Math.floor((new Date(firstMessageAt || now).getTime() - new Date(lastEvent.occurred_at).getTime()) / 1000)) : 0);
    let modeInstruction = `\n\n[ИНСТРУКЦИЯ ПО ФОТОГРАФИЯМ И КИНУТЫМ МЕДИА]:
Добавляй в конец ответа тег [IMAGE: краткое описание фото на английском] только если пользователь просит фото или ты уже естественно предложила/пообещала прислать его в тексте.
- Не присылай несвязанное фото сама по себе и никогда не отвечай одним тегом [IMAGE: ...] без обычной текстовой реплики.
- Если пользователь просит фото, или если ты сама в тексте говоришь «ща скину», «держи фотку», «покажусь», «глянь фотку» и т.п., ты ОБЯЗАНА ДОБАВИТЬ ТЕГ [IMAGE: ...] в самый конец сообщения! Без этого тега фото не отправится!

[ИНСТРУКЦИЯ ПО ГОЛОСОВЫМ СООБЩЕНИЯМ]:
Если пользователь просит голосовое («скажи голосом», «наговори гс», «хочу услышать твой голос»), или если ты сама в особо живой, милый, ленивый или эмоциональный момент хочешь сказать фразу голосом, добавь тег [VOICE: текст реплики на русском].
- Текст внутри [VOICE: ...] будет озвучен твоим живым голосом.
- Ты можешь прислать текстовую реплику и следом войс (например: «слушай, ща наговорю [VOICE: Привет, ну как твои дела?]»), либо ответить только голосовым без лишнего текста (например: «[VOICE: Ой, мне так лень сейчас печатать, слушай...]»).`;

    if (preselectedPhoto) {
        const photoDesc = preselectedPhoto.caption || (preselectedPhoto.tags && preselectedPhoto.tags.length > 0 ? preselectedPhoto.tags.join(', ') : 'Твое личное фото');
        const photoTime = preselectedPhoto.time_of_day;
        const photoTimeRu = timeRuMap[photoTime] || photoTime;
        const currentRealTimeRu = timeRuMap[currentTimeOfDay] || currentTimeOfDay;

        modeInstruction += `\n\n[ГОТОВОЕ ФОТО ДЛЯ ОТПРАВКИ]:
Если ты прикрепляешь фото, будет отправлен кадр со следующим сюжетом:
- Описание кадра: "${photoDesc}"
- Время суток на фото: ${photoTimeRu} (сейчас реальное время: ${currentRealTimeRu})`;

        if (preselectedPhoto.isDifferentTime) {
            modeInstruction += `\n⚠️ ВАЖНОЕ ПРАВИЛО (Фото из другого времени суток / архив): Этот кадр сделан в другое время суток (${photoTimeRu}), а у вас сейчас ${currentRealTimeRu}.
Прочитай описание кадра выше и ОБЯЗАТЕЛЬНО объясни в тексте, почему ты скидываешь именно его (например: «Ой, нашла вот вчерашнее фото...», «Это я вчера вечером/с утра фоткалась», «Смотри, это вчера сделала фотку, когда...»). Опиши сюжет снимка своими словами!`;
        } else {
            modeInstruction += `\nОписанное выше фото подходит под ваше текущее время суток (${currentRealTimeRu}). Подпиши его естественно от первого лица, слегка опираясь на сюжет кадра.`;
        }
    }

    if (routingMode === 'EROTIC') {
        const climaxPrompt = getClimaxPromptInstruction(climaxState);
        modeInstruction += `\n\n[РЕЖИМ БЛИЗОСТИ И ВИРТА]:${climaxPrompt}
- СТРОЖАЙШИЙ ЗАПРЕТ НА ОТГОВОРКИ ПРО СОН И УСТАЛОСТЬ: В интимном контексте КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО говорить «я усну», «я засыпаю», «я сонная», «мозг отключается», «устала».
- СТРОЖАЙШИЙ ЗАПРЕТ НА СМЕХ («ахах», «хихи») И ШАБЛОННЫЕ ФРАЗЫ: Никаких «ахах ну ты и зверь/наглец».
- Полная вовлечённость в процесс, живость ощущений, отклик на действия партнёра без нытья и прерываний.`;
    }

    if (isInitiative) {
        const initiativePrompt = productionRoutingSettings.initiativePrompt
            ? `\n\n[ОБЩИЕ ПРАВИЛА ИНИЦИАТИВ]\n${productionRoutingSettings.initiativePrompt}`
            : '';
        const isNightOrLongGap = gapSeconds >= 14400;
        const freshDayRule = isNightOrLongGap
            ? '\nВАЖНО (ДЛИННАЯ ПАУЗА / НОВЫЙ ДЕНЬ): Прошло много времени с прошлого разговора. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО отвечать на старые ночные реплики или продолжать прошлые обиды/споры. Начинай сообщение с чистого листа в контексте текущего времени (утро/день).'
            : '';
        modeInstruction = `\n\n[ТИП ИНИЦИАТИВЫ]: ${initiativeKind || 'open'}\n[ПРИЧИНА]: ${initiativeReason || 'естественное продолжение разговора'}${freshDayRule}\nНе раскрывай приватные данные других пользователей.${initiativePrompt}`;
    }

    if (contentCandidates.length > 0) {
        const catalog = contentCandidates.map(item =>
            `- [CONTENT: ${item.id}] ${item.telegram_type}: ${item.description || 'без описания'}`
        ).join('\n');
        modeInstruction += `\n\n[ДОСТУПНЫЙ КОНТЕНТ]\n${catalog}\n${productionRoutingSettings.contentPrompt}`;
    }

    let tamagotchiInstruction = "";
    let radiantContextText = "";
    let radiantLayers = {};
    try {
        const detailedContext = await ContextBuilder.buildTelegramContextDetailed(userId, {
            overrides: { preMessageGapSeconds: gapSeconds, previousActivityAt: lastEvent?.occurred_at, currentTime, routingMode },
            actionResult,
            routingMode
        });
        const radiantContext = detailedContext.text;
        radiantContextText = radiantContext;
        radiantLayers = detailedContext.layers;
        const memoryText = memories.length > 0
            ? memories.slice(0, 5).map(m => `- ${m.text ?? m.fact ?? m.normalizedText ?? ''}`).filter(line => line !== '- ').join('\n')
            : 'Пока нет сохраненных фактов о пользователе.';

        const promptModules = productionIntentConfig?.promptModules || {};
        tamagotchiInstruction = [
            promptModules.context === false ? '' : `\n\n${radiantContext}`,
            promptModules.memory === false ? '' : `\n\n=== 🧠 ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ ===\n${memoryText}`
        ].filter(Boolean).join('');
    } catch (tamagotchiErr) {
        console.error("⚠️ Ошибка формирования контекста Леры:", tamagotchiErr.message);
    }

    // Формируем историю предыдущих сообщений для multi-turn контекста
    const chatHistoryEvents = priorEvents.filter(ev =>
        ev.content && (ev.event_type === 'MESSAGE' || ev.event_type === 'INITIATIVE')
    ).slice(-10);

    function normalizeTextForComparison(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    }

    function analyzeUserRepetitions(userText, priorEvents = []) {
        const currentNorm = normalizeTextForComparison(userText);
        if (!currentNorm) return { isRepeated: false, repeatCount: 0 };

        const recentUserEvents = priorEvents
            .filter(e => (e.role === 'user' || e.role === 'client') && e.content)
            .slice(-8);

        let matchCount = 0;
        for (const ev of recentUserEvents) {
            const pastNorm = normalizeTextForComparison(ev.content);
            if (!pastNorm) continue;
            if (pastNorm === currentNorm) {
                matchCount++;
            }
        }

        return {
            isRepeated: matchCount > 0,
            repeatCount: matchCount + 1
        };
    }

    function analyzeAssistantRepetitions(priorEvents = []) {
        const recentLeraEvents = priorEvents
            .filter(e => (e.role === 'lera' || e.role === 'assistant') && e.content && e.event_type !== 'REACTION')
            .slice(-5);

        if (recentLeraEvents.length < 2) return { hasRepetition: false, forbiddenStarters: [] };

        const detected = [];
        for (const starter of FORBIDDEN_STARTERS) {
            let count = 0;
            for (const ev of recentLeraEvents) {
                const firstMsg = String(ev.content).split('|||')[0].trim();
                if (starter.pattern.test(firstMsg)) {
                    count++;
                }
            }
            if (count >= 2) {
                detected.push(starter.label);
            }
        }

        return {
            hasRepetition: detected.length > 0,
            forbiddenStarters: detected
        };
    }

    const userRepetition = !isInitiative && userText ? analyzeUserRepetitions(userText, priorEvents) : { isRepeated: false };
    const assistantRepetition = analyzeAssistantRepetitions(priorEvents);
    const systemPrompt = baseSystemPromptText + mediaLogInstruction + tamagotchiInstruction + modeInstruction;
    const messages = [{ role: 'system', content: systemPrompt }];

    function sanitizeHistoryContent(raw) {
        let text = String(raw || '').trim();
        text = text.replace(/^\[\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\]\s*[^:]+:\s*/, '');
        text = text.replace(/^(?:\[Пользователь\]|\[Лера\]|Пользователь:|Лера:)\s*/i, '');
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/gi, '');
        return text.trim();
    }

    // Нативный multi-turn контекст диалога
    if (productionIntentConfig?.promptModules?.history !== false) {
        if (chatHistoryEvents.length > 0) {
            for (const ev of chatHistoryEvents) {
                const isLera = ev.role === 'lera' || ev.role === 'assistant';
                const cleanContent = sanitizeHistoryContent(ev.content);
                if (cleanContent) {
                    messages.push({
                        role: isLera ? 'assistant' : 'user',
                        content: cleanContent
                    });
                }
            }
        }
    }

    if (userRepetition.isRepeated && routingMode !== 'EROTIC') {
        const repetitionDirective = `⚠️ ПОЛЬЗОВАТЕЛЬ ПОВТОРЯЕТСЯ: он уже писал ровно это («${userText}») недавно в этом диалоге (${userRepetition.repeatCount}-й раз подряд).
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО отвечать так, будто это новое сообщение, здороваться заново или выдавать новую бытовую сводку!
Отреагируй дерзко, с подколом или удивлением в характере Леры:
- «?? ты уже это писал»
- «нахуй ты мне одно и то же пишешь?»
- «че? ты писал уже»
- «тебя заклинило ахах?» / «пластинку заело?»
- «ты робот что ли?»`;
        messages.push({ role: 'system', content: repetitionDirective });
    }

    if (assistantRepetition.hasRepetition) {
        const antiRepDirective = `⚠️ АНТИПОВТОР СТАРТА ФРАЗЫ: Твои недавние сообщения уже начинались со слов «${assistantRepetition.forbiddenStarters.join(', ')}».
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО начинать следующее сообщение с этих заезженных слов! Начни фразу свежо — сразу с прямого ответа, действия, вопроса или другой реакции.`;
        messages.push({ role: 'system', content: antiRepDirective });
    }

    if (isInitiative) {
        let initiativeDirective = '';
        if (initiativeKind === 'ignore_1' || initiativeKind === 'ignore_2') {
            initiativeDirective = `⚠️ ТЫ ПИШЕШЬ ПЕРВОЙ: СОБЕСЕДНИК ПРОИГНОРИЛ ТВОЮ РЕПЛИКУ И ЗАМОЛЧАЛ!
Задача Леры: напиши короткий, живой и слегка возмущенный или подкалывающий пинг:
- Напрямую спроси или подколи за игнор: «ты че игноришь?», «алоо ты куда пропал?», «ты че слился?», «аууу», «э», «че молчишь?»
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: продолжать старый спор, оправдываться или объяснять что-то длинно. Нужен именно короткий пинг за молчание.`;
        } else if (initiativeKind === 'new_day') {
            initiativeDirective = `⚠️ ТЫ ПИШЕШЬ ПЕРВОЙ: НАСТУПИЛ НОВЫЙ ДЕНЬ!
Задача Леры: сегодня вы ещё не общались. Прошлый ночной диалог закончен и закрыт.
- Начни новый день легко и естественно: напиши, чем сейчас занята (проснулась, пью кофе, собираюсь по делам в Питере) или просто коротко спроси как спалось / как настрой («доброе/утречко/привет», «как спалось?», «ты как там?»).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: мусолить ночную ссору, обижаться за вчерашнее или отвечать на старое ночное «споки».`;
        } else if (initiativeKind === 'idle_4h' || initiativeKind === 'content_4h') {
            initiativeDirective = `⚠️ ТЫ ПИШЕШЬ ПЕРВОЙ: ДНЕВНАЯ ПАУЗА (ПРОШЛО БОЛЬШЕ 4 ЧАСОВ)!
Задача Леры: с момента прошлого разговора прошло много времени.
- Смени тему и поделись своим текущим моментом/вайбом из дня в Питере (кофейня на Петроградке, работа над постом, трек, погода) и ненавязчиво спроси как его день («ты как там?», «как день ваще?», «че делаешь?»).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: продолжать старый конфликт или оправдываться за старые фразы.`;
        } else if (initiativeKind === 'cold_start') {
            initiativeDirective = `⚠️ ТЫ ПИШЕШЬ ПЕРВОЙ: ПЕРВОЕ ЗНАКОМСТВО / НЕТ ИСТОРИИ ПЕРЕПИСКИ!
Задача Леры: у вас с пользователем ещё нет переписки или она была очищена.
- Напиши первой коротко, легко, по-питерски и в своём характере: поздоровайся, спроси как дела/чем занят или поделись своим текущим моментом («привет! ты как ваще?», «хей, чем занят? я тут кофе пью / собираюсь по делам», «привет! как твой день?»).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: ссылаться на несуществующие прошлые разговоры или выдумывать, что вы уже о чем-то договаривались. Пиши естественно с чистого листа.`;
        } else if (initiativeKind === 'open') {
            initiativeDirective = `⚠️ ТЫ ПИШЕШЬ ПЕРВОЙ: ВОЗВРАТ К НЕЗАВЕРШЕННОЙ ТЕМЕ!
Задача Леры: диалог прервался недавно на полуслове. Естественно докинь мысль по теме последнего разговора или коротко подколи.`;
        } else {
            initiativeDirective = `⚠️ ТЫ ПИШЕШЬ ПЕРВОЙ: ${initiativeReason || 'естественное продолжение разговора'}`;
        }

        messages.push({ role: 'system', content: initiativeDirective });
        messages.push({
            role: 'user',
            content: `[СИСТЕМНОЕ СОБЫТИЕ: ${initiativeReason || 'Напиши сообщение первой в соответствии с инструкцией выше'}]`
        });
    }

    // Передаем последнее текущее сообщение пользователя (с поддержкой Vision)
    if (!isInitiative && userText) {
        let activePhotoUrls = Array.isArray(photoUrls) && photoUrls.length > 0 ? photoUrls : [];
        if (!activePhotoUrls.length) {
            const isPhotoContextQuestion = /фото|фотк|картинк|вид|смотр|глянь|что там|кто это|как тебе|селфи|лицо/i.test(userText);
            if (isPhotoContextQuestion) {
                const recentPhotoEvent = priorEvents.slice(-4).reverse().find(e => (e.event_type === 'PHOTO' || e.eventType === 'PHOTO') && e.metadata?.photo_url);
                if (recentPhotoEvent?.metadata?.photo_url) {
                    activePhotoUrls = [recentPhotoEvent.metadata.photo_url];
                }
            }
        }

        const lastMsg = messages.at(-1);
        if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userText) {
            if (activePhotoUrls.length > 0) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: userText || 'Посмотри на фото' },
                        ...activePhotoUrls.map(url => ({ type: 'image_url', image_url: { url } }))
                    ]
                });
            } else {
                messages.push({ role: 'user', content: userText });
            }
        }
    }

    return {
        messages,
        isPhotoRequest,
        preselectedPhoto,
        lastLeraText,
        hasRecentGreeting: userRepetition.hasRecentGreeting,
        recentReplyTexts: priorEvents
            .filter(event => event.role === 'lera' || event.role === 'assistant')
            .map(event => event.content)
            .filter(Boolean)
            .slice(-5),
        memories,
        memoryRetrieval,
        systemPrompt,
        radiantContext: radiantContextText,
        judgeLeraRules: baseSystemPromptText,
        leraState: tamagotchiInstruction ? radiantLayers : null
    };
}

async function processLlmOutput(userId, user, rawText, isPhotoRequest, existingRecommendationPost = null, preselectedPhoto = null, contentCandidates = [], isVoiceRequest = false, recentReplies = []) {
    let workingText = rawText || '';
    let imagePrompt = null;
    let voiceText = null;
    let contentId = null;

    const contentMatch = workingText.match(/\[CONTENT:\s*(\d+)\s*\]/i);
    if (contentMatch) {
        const selectedId = Number(contentMatch[1]);
        if (contentCandidates.some(item => Number(item.id) === selectedId)) contentId = selectedId;
        workingText = workingText.replace(/\[CONTENT:\s*\d+\s*\]/gi, '').trim();
    }

    const fullMatch = workingText.match(/\[IMAGE:([\s\S]*?)\]/i);
    if (fullMatch) {
        imagePrompt = fullMatch[1].trim();
        workingText = workingText.replace(/\[IMAGE:[\s\S]*?\]/gi, '').trim();
    } else {
        const unclosedMatch = workingText.match(/\[IMAGE:([\s\S]*)/i);
        if (unclosedMatch) {
            imagePrompt = unclosedMatch[1].trim();
            workingText = workingText.replace(/\[IMAGE:[\s\S]*/gi, '').trim();
        }
    }

    const fullVoiceMatch = workingText.match(/\[VOICE:([\s\S]*?)\]/i);
    if (fullVoiceMatch) {
        voiceText = fullVoiceMatch[1].trim();
        workingText = workingText.replace(/\[VOICE:[\s\S]*?\]/gi, '').trim();
    } else {
        const unclosedVoiceMatch = workingText.match(/\[VOICE:([\s\S]*)/i);
        if (unclosedVoiceMatch) {
            voiceText = unclosedVoiceMatch[1].trim();
            workingText = workingText.replace(/\[VOICE:[\s\S]*/gi, '').trim();
        }
    }

    let photoSendPayload = null;
    let photoRecordId = null;
    let photoCaption = null;
    let voicePayload = null;
    let showBuyButton = false;
    let finalAiText = cleanResponseText(workingText);

    // Мягкая очистка застрявших вводных префиксов на старте, если они дублируются с прошлым сообщением
    if (Array.isArray(recentReplies) && recentReplies.length > 0 && finalAiText) {
        const lastLeraMsg = recentReplies[recentReplies.length - 1] || '';
        const lastStarter = String(lastLeraMsg).split('|||')[0].trim();
        for (const starter of FORBIDDEN_STARTERS) {
            if (starter.pattern.test(lastStarter) && starter.pattern.test(finalAiText)) {
                finalAiText = finalAiText.replace(starter.pattern, '').replace(/^[,\s—-]+/, '').trim();
                if (finalAiText.length > 0) {
                    finalAiText = finalAiText.charAt(0).toLowerCase() + finalAiText.slice(1);
                }
                break;
            }
        }
    }

    if (imagePrompt) {
        const photoObj = await generatePhotoForPrompt(user, imagePrompt, preselectedPhoto);

        if (photoObj) {
            if (typeof photoObj === 'string') {
                photoSendPayload = photoObj;
            } else if (photoObj && photoObj.file_id) {
                photoSendPayload = photoObj.file_id;
                photoRecordId = photoObj.id || photoObj.file_id;
                photoCaption = photoObj.caption;
            } else if (photoObj && photoObj.source) {
                photoSendPayload = { source: photoObj.source, filename: photoObj.filename || 'photo.jpg' };
                photoRecordId = photoObj.id || null;
                photoCaption = photoObj.caption || null;
            }
        }
    }

    // Озвучка: если есть тег [VOICE] или прямой запрос на голосовое
    const targetVoiceText = voiceText || (isVoiceRequest ? finalAiText : null);
    if (targetVoiceText) {
        voicePayload = await generateVoiceForText(user, targetVoiceText);
    }

    return {
        text: finalAiText,
        photo: photoSendPayload,
        photoRecordId,
        photoCaption,
        voice: voicePayload,
        voiceText: targetVoiceText || null,
        recommendationPost: existingRecommendationPost,
        showBuyButton,
        contentId
    };
}

async function recordAiTransaction(userId, usage) {
    let cost = 0;
    if (usage) {
        cost = (usage.prompt_tokens * 0.13 / 1000000) + (usage.completion_tokens * 0.28 / 1000000);
        await addApiCost(userId, cost);
    }
    return cost;
}

// --- 4. ДЕКЛАРАТИВНЫЙ ЕДИНЫЙ ДВИЖОК ---

async function runAiEngine(userId, { userText = null, photoUrls = [], isInitiative = false, routingMode = 'CASUAL', isVoiceRequest = false, classifierResult = null, actionRouting = null, initiativeReason = null, initiativeKind = null, anchorEventId = null, contentCandidates = [], commandGate = null, batchId = null, eventIds = [], preMessageGapSeconds = null, firstMessageAt = null, climaxState = null } = {}) {
    const user = await getUser(userId);
    if (!user) return null;

    let resolvedActionRouting = actionRouting;

    // 1. Формирование контекста сообщений (с параллельными запросами БД)
    const {
        messages, isPhotoRequest, recommendationPost, preselectedPhoto, lastLeraText,
        recentReplyTexts, memories, leraState, systemPrompt, radiantContext, judgeLeraRules,
        hasRecentGreeting, memoryRetrieval
    } = await buildMessagePayload(user, userId, {
        userText, photoUrls, isInitiative, routingMode, initiativeReason,
        initiativeKind, contentCandidates, batchId, eventIds, preMessageGapSeconds,
        firstMessageAt, actionResult: resolvedActionRouting?.actionResult || null,
        climaxState
    });
    persistMemoryRetrieval(userId, memoryRetrieval);
    const routingSettings = await getRoutingSettings();
    const generationParams = getModeGenerationParams(routingMode, routingSettings);

    // Логирование вызова LLM в prompt_logs. Никогда не блокирует генерацию ответа.
    const writePromptLog = (extra = {}) => {
        const promptTokens = Number(extra.usage?.prompt_tokens || 0);
        const completionTokens = Number(extra.usage?.completion_tokens || 0);
        savePromptLog({
            userId,
            kind: isInitiative ? 'INITIATIVE' : 'CHAT',
            mode: routingMode,
            userText,
            systemPrompt,
            radiantContext,
            messages,
            stateSnapshot: leraState || {},
            memoryUsed: (memories || []).map(m => m.text || m.fact || m.normalizedText || m),
            isPhotoRequest,
            commandGateStatus: commandGate?.code || null,
            commandGateReason: commandGate?.accepted ? null : commandGate?.willingness ? `Willingness ${commandGate.willingness.value}%` : null,
            costUsd: extra.costUsd ?? ((promptTokens * 0.13 / 1000000) + (completionTokens * 0.28 / 1000000)),
            routingMode,
            classifier: classifierResult ? {
                mode: classifierResult.mode,
                providerName: classifierResult.providerName,
                model: classifierResult.model,
                latencyMs: classifierResult.latencyMs,
                usage: classifierResult.usage
            } : null,
            actionTrace: resolvedActionRouting?.trace || null,
            profileVersion: extra.profileVersion,
            surface: isInitiative ? 'INITIATIVE' : 'CHAT',
            judgeMode: extra.judgeMode || (isInitiative ? routingSettings?.initiativeJudgeMode : routingSettings?.judgeMode),
            judgeVerdict: extra.judgeVerdict || null,
            judgeCode: extra.judgeCode || null,
            ...extra
        }).catch(() => null);
    };

    // 1.5. Формирование динамических схем инструментов для Native Tool Calling
    let formattedTools = [];
    if (!isInitiative) {
        try {
            const activeSchemas = actionRegistry.getSchemas({ userId });
            formattedTools = activeSchemas.map(s => ({
                type: 'function',
                function: {
                    name: s.name,
                    description: `${s.title ? s.title + ': ' : ''}${s.description}`,
                    parameters: s.inputSchema || { type: 'object', properties: {} }
                }
            }));
            if (formattedTools.length > 0) {
                generationParams.tools = formattedTools;
            }
        } catch (e) {
            console.warn('[TOOLS REGISTRY ERROR]:', e.message);
        }
    }

    // 2. Вызов нейросети через модуль llm_client
    let llmResult;
    try {
        llmResult = await requestLlmCompletion(user, messages, isPhotoRequest, getOpenAIClientAndModel, generationParams);
    } catch (llmErr) {
        writePromptLog({ errorText: llmErr.message });
        if (isInitiative) {
            return { text: "", photo: null, recommendationPost: null, blockedByJudge: true };
        }
        // Попытка быстрого повторного запроса для чата
        try {
            llmResult = await requestLlmCompletion(user, messages, isPhotoRequest, getOpenAIClientAndModel, generationParams);
        } catch (retryErr) {
            writePromptLog({ errorText: `Chat LLM retry failed: ${retryErr.message}` });
            const fallbackText = getQualityFallback(routingMode, {
                userText,
                recentReplies: recentReplyTexts,
                lastAssistantText: lastLeraText,
                reason: 'NETWORK_ERROR'
            });
            return { text: fallbackText, photo: null, recommendationPost: null };
        }
    }

    // Обработка Native Tool Calling (параллельный запуск всех запрошенных действий через Promise.allSettled)
    if (Array.isArray(llmResult?.tool_calls) && llmResult.tool_calls.length > 0) {
        const toolExecutionPromises = llmResult.tool_calls.map(async (tc) => {
            const funcName = tc.function?.name;
            let funcArgs = {};
            try {
                funcArgs = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {});
            } catch (e) {
                funcArgs = {};
            }
            console.log(`⚡ [NATIVE TOOL CALL] Запуск действия "${funcName}":`, funcArgs);
            const execRes = await executeAction({
                name: funcName,
                args: funcArgs,
                context: { userId, userText }
            });
            let toolResultContent = '';
            if (execRes.status === 'success') {
                const d = execRes.data;
                if (typeof d === 'string') {
                    toolResultContent = d;
                } else if (d?.text) {
                    toolResultContent = d.text;
                    if (Array.isArray(d.sources) && d.sources.length > 0) {
                        toolResultContent += '\nИсточники: ' + d.sources.map(s => `${s.title}: ${s.url}`).join(', ');
                    }
                } else if (d?.summary) {
                    toolResultContent = d.summary;
                } else {
                    const cleanObj = { ...d };
                    delete cleanObj.groundingMetadata;
                    toolResultContent = JSON.stringify(cleanObj);
                }
            } else {
                toolResultContent = `Ошибка: ${execRes.error?.message || 'Действие недоступно'}`;
            }

            return {
                name: funcName,
                content: toolResultContent,
                execRes,
                callId: tc.id || null
            };
        });

        const settledResults = await Promise.allSettled(toolExecutionPromises);
        for (const settled of settledResults) {
            if (settled.status === 'fulfilled') {
                const { name, content, execRes } = settled.value;
                if (shouldPersistToolObservation({ status: execRes?.status, name })) {
                    memoryRepository.recordToolObservation({
                        userId,
                        toolName: name,
                        queryText: userText,
                        resultText: content,
                        callId: settled.value.callId || null,
                        sourceEventId: eventIds.at(-1) || null
                    }).catch(error => {
                        console.warn(`[TOOL MEMORY OBSERVATION ERROR] ${name}:`, error.message);
                    });
                }
                messages.push({
                    role: 'system',
                    content: `[РЕАЛЬНЫЕ СВЕЖИЕ ДАННЫЕ ИЗ ИНСТРУМЕНТА ${name}]:\n${content}\n\nВАЖНО: Обязательно используй эти реальные факты для ответа собеседнику, пересказав их своими словами в живом характере Леры (сленг, лесенка). Не говори, что ничего не знаешь, факты выше — настоящие и свежие!`
                });
            }
        }

        try {
            const finalLlmResult = await requestLlmCompletion(user, messages, isPhotoRequest, getOpenAIClientAndModel, { ...generationParams, tools: null });
            if (finalLlmResult?.rawText) {
                llmResult = finalLlmResult;
            }
        } catch (finalErr) {
            console.warn('[TOOL FOLLOWUP ERROR]:', finalErr.message);
        }
    }

    let { rawText, usage } = llmResult;
    let { model, providerName, latencyMs } = llmResult;
    if (!rawText || !rawText.trim()) {
        if (isInitiative) {
            writePromptLog({ model, providerName, latencyMs, errorText: 'Пустой ответ от LLM (инициатива пропущена)' });
            return { text: "", photo: null, recommendationPost: null, blockedByJudge: true };
        }
        // Попытка быстрого повторного запроса для чата
        try {
            llmResult = await requestLlmCompletion(user, messages, isPhotoRequest, getOpenAIClientAndModel, generationParams);
            rawText = llmResult?.rawText || '';
            usage = llmResult?.usage || usage;
            model = llmResult?.model || model;
            providerName = llmResult?.providerName || providerName;
            latencyMs = llmResult?.latencyMs || latencyMs;
        } catch (retryErr) {
            // ignore
        }
        if (!rawText || !rawText.trim()) {
            writePromptLog({ model, providerName, latencyMs, errorText: 'Пустой ответ от LLM' });
            const fallbackText = getQualityFallback(routingMode, {
                userText,
                recentReplies: recentReplyTexts,
                lastAssistantText: lastLeraText,
                reason: 'EMPTY_RESPONSE'
            });
            return { text: fallbackText, photo: null, recommendationPost: null };
        }
    }

    // 3. Чистка текста и генерация/выборка фото и голоса
    let { text, photo, photoRecordId, photoCaption, voice, recommendationPost: finalRecPost, showBuyButton, contentId } = await processLlmOutput(userId, user, rawText, isPhotoRequest, recommendationPost, preselectedPhoto, contentCandidates, isVoiceRequest, recentReplyTexts);
    const generationTrace = [{
        step: 'memory_retrieval',
        query: memoryRetrieval?.trace?.query_text || '',
        strategy: memoryRetrieval?.trace?.strategy || null,
        source: memoryRetrieval?.trace?.source || null,
        metadata: memoryRetrieval?.trace?.metadata || {},
        selectedFacts: memoryRetrieval?.facts || [],
        candidates: memoryRetrieval?.trace?.candidates || [],
        fallbackReason: memoryRetrieval?.trace?.fallbackReason || null
    }, {
        step: 'first',
        response: text,
        rawResponse: rawText,
        providerName,
        model,
        latencyMs,
        usage
    }];
    const judgeConversation = messages.slice();
    const judgeSettings = routingSettings;
    // A valid media-only reply has no prose for the judge to evaluate. It must
    // reach Telegram instead of being rejected solely because the IMAGE tag was removed.
    const isMediaOnlyReply = Boolean(photo) && !text;
    const shouldJudge = !isInitiative && Boolean(userText);
    const shouldJudgeChat = Boolean(userText) && !isMediaOnlyReply;
    const shouldJudgeSurface = isInitiative || shouldJudgeChat;
    let judgeResult = shouldJudgeSurface
        ? await judgeLeraReply({
            userId,
            mode: routingMode,
            surface: isInitiative ? 'INITIATIVE' : 'CHAT',
            messages: judgeConversation,
            userText,
            reply: text,
            dayContext: radiantContext,
            leraRules: judgeLeraRules,
            settings: judgeSettings
        })
        : { skipped: true, verdict: 'SKIPPED', passed: true, code: null };
    const relationshipEvent = judgeResult.relationshipEvent || null;
    const arousalEvent = judgeResult.arousalEvent || null;
    generationTrace.push({
        step: 'judge',
        phase: 'first',
        verdict: judgeResult.verdict || (judgeResult.skipped ? 'SKIPPED' : 'ERROR'),
        code: judgeResult.code || null,
        model: judgeResult.model || null,
        providerName: judgeResult.providerName || null,
        latencyMs: judgeResult.latencyMs || 0,
        usage: judgeResult.usage || {},
        error: judgeResult.error || null,
        judgeMessages: judgeResult.judgeMessages || null,
        relationshipEvent,
        arousalEvent
    });

    const normalizeReply = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const qualityIssues = evaluateLeraReply(text, userText, null, {
        mode: routingMode,
        recentReplies: recentReplyTexts
    }).violations;
    const needsQualityRetry = !isInitiative && requiresReplyRetry(qualityIssues);
    const activeJudgeMode = isInitiative ? judgeSettings.initiativeJudgeMode : judgeSettings.judgeMode;
    const judgeNeedsRetry = activeJudgeMode === 'ENFORCE' && judgeResult.passed === false;
    let blockedByJudge = false;
    if ((isInitiative && judgeNeedsRetry) || (!isInitiative && userText && (
        (lastLeraText && normalizeReply(text) === normalizeReply(lastLeraText))
        || needsQualityRetry
        || judgeNeedsRetry
    ))) {
        const retryReason = judgeNeedsRetry
            ? `judge_${judgeResult.code || 'rejected'}`
            : needsQualityRetry
            ? qualityIssues.includes('format') ? 'response_format' : 'recent_repeat'
            : 'exact_repeat';
        const forbiddenPhrase = text || lastLeraText || '';
        const retryInstruction = qualityIssues.includes('format')
            ? 'СТОП: в предыдущем ответе склеились две отдельные фразы. Перепиши ответ заново. Между каждой отдельной короткой репликой поставь буквальный разделитель ||| с пробелами по краям: первая реплика ||| вторая реплика. Не склеивай слова, не используй переносы строк и не добавляй пояснений.'
            : judgeNeedsRetry
            ? `Проверка качества отклонила предыдущий ответ: ${judgeResult.code || 'REJECTED'}. Перепиши его по последней реплике пользователя, сохрани характер Леры и не повторяй предыдущий вариант.`
            : needsQualityRetry
            ? qualityIssues.includes('nonEmpty')
                ? 'СТОП: предыдущий ответ оказался пустым после обработки медиа-тегов. Ответь текстом именно на последнюю реплику пользователя. Фото можно добавлять только после нормальной текстовой подписи.'
                : `СТОП: фраза «${forbiddenPhrase}» уже была отправлена недавно. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО повторять её дословно! Ответь на вопрос другими словами, добавь новую деталь о том, что делаешь/чувствуешь, либо слегка подколи собеседника («ты уже спрашивал ахах / я ж только что сказала»), если он переспрашивает то же самое.`
            : `СТОП: предыдущий ответ совпал с прошлой репликой «${forbiddenPhrase}». Сгенерируй новый живой ответ именно на последнюю CURRENT_MESSAGE другими словами. Не повторяй прошлый текст.`;
        const retryMessages = [
            messages[0],
            { role: 'system', content: retryInstruction },
            ...messages.slice(1)
        ];
        const firstUsage = usage || {};
        let retry;
        try {
            retry = await requestLlmCompletion(user, retryMessages, isPhotoRequest, getOpenAIClientAndModel, generationParams);
        } catch (retryErr) {
            generationTrace.push({
                step: 'retry',
                reason: retryReason,
                instruction: retryInstruction,
                error: retryErr.message
            });
            writePromptLog({
                kind: 'RETRY_ERROR',
                model,
                providerName,
                latencyMs,
                rawResponse: rawText,
                parsedResponse: text,
                usage,
                generationTrace,
                errorText: `Retry failed: ${retryErr.message}`
            });
            throw retryErr;
        }
        rawText = retry.rawText || rawText;
        usage = {
            prompt_tokens: Number(firstUsage.prompt_tokens || 0) + Number(retry.usage?.prompt_tokens || 0),
            completion_tokens: Number(firstUsage.completion_tokens || 0) + Number(retry.usage?.completion_tokens || 0),
            total_tokens: Number(firstUsage.total_tokens || 0) + Number(retry.usage?.total_tokens || 0)
        };
        model = retry.model || model;
        providerName = retry.providerName || providerName;
        latencyMs = retry.latencyMs || latencyMs;
        ({ text, photo, photoRecordId, photoCaption, voice, recommendationPost: finalRecPost, showBuyButton, contentId } = await processLlmOutput(
            userId, user, rawText, isPhotoRequest, recommendationPost, preselectedPhoto, contentCandidates, isVoiceRequest, recentReplyTexts
        ));
        generationTrace.push({
            step: 'retry',
            reason: retryReason,
            instruction: retryInstruction,
            response: text,
            rawResponse: rawText,
            providerName,
            model,
            latencyMs,
            usage: retry.usage || {}
        });
        const isRetryMediaOnlyReply = Boolean(photo) && !text;
        if (shouldJudgeSurface && !isRetryMediaOnlyReply && activeJudgeMode !== 'OFF') {
            const retryJudge = await judgeLeraReply({
                userId,
                mode: routingMode,
                surface: isInitiative ? 'INITIATIVE' : 'CHAT',
                messages: judgeConversation,
                userText,
                reply: text,
                dayContext: radiantContext,
                leraRules: judgeLeraRules,
                settings: judgeSettings
            });
            generationTrace.push({
                step: 'judge',
                phase: 'retry',
                verdict: retryJudge.verdict || 'ERROR',
                code: retryJudge.code || null,
                model: retryJudge.model || null,
                providerName: retryJudge.providerName || null,
                latencyMs: retryJudge.latencyMs || 0,
                usage: retryJudge.usage || {},
                error: retryJudge.error || null,
                judgeMessages: retryJudge.judgeMessages || null,
                relationshipEvent: retryJudge.relationshipEvent || null,
                arousalEvent: retryJudge.arousalEvent || null
            });
            if (activeJudgeMode === 'ENFORCE' && retryJudge.passed === false) {
                if (isInitiative) {
                    blockedByJudge = true;
                    text = '';
                    photo = null;
                    photoCaption = null;
                    finalRecPost = null;
                } else {
                    text = getQualityFallback(routingMode, {
                        userText,
                        recentReplies: recentReplyTexts,
                        lastAssistantText: lastLeraText
                    });
                    photo = null;
                    photoCaption = null;
                    finalRecPost = null;
                    generationTrace.push({
                        step: 'fallback',
                        reason: [`judge_${retryJudge.code || 'rejected'}`],
                        response: text
                    });
                }
            }
        }
        // The final log below must contain the exact retry messages, not the first call.
        messages.splice(0, messages.length, ...retryMessages);
    }

    const finalQuality = evaluateLeraReply(text, userText, null, {
        mode: routingMode,
        recentReplies: recentReplyTexts,
        hasRecentGreeting
    });
    if (!isInitiative && userText && !(photo && !text) && !(voice && !text) && !finalQuality.passed) {
        text = getQualityFallback(routingMode, {
            userText,
            recentReplies: recentReplyTexts,
            lastAssistantText: lastLeraText
        });
        photo = null;
        photoCaption = null;
        voice = null;
        finalRecPost = null;
        generationTrace.push({
            step: 'fallback',
            reason: finalQuality.violations,
            response: text
        });
    }

    if (shouldJudge && relationshipEvent && relationshipEvent.type !== 'NEUTRAL' && relationshipEvent.intensity > 0) {
        try {
            const relationship = await applyUserRelationshipEvent(userId, relationshipEvent, userText);
            generationTrace.push({
                step: 'relationship',
                event: relationship.event,
                deltas: relationship.deltas,
                state: relationship
            });
        } catch (relationshipError) {
            generationTrace.push({
                step: 'relationship',
                event: relationshipEvent,
                error: relationshipError.message
            });
            console.error(`[RELATIONSHIP ERROR] user ${userId}:`, relationshipError.message);
        }
    }

    if (photo && (text === "..." || !text)) {
        text = "";
    }

    if (finalRecPost && (!text || text === "...")) {
        text = "о, зацени че в новостях вычитала 👇";
    }

    // 4. Логирование и БД (с учётом отправленной фотографии в истории)
    await recordAiTransaction(userId, usage);
    console.log(`🤖 [${isInitiative ? 'AI INITIATIVE' : 'BOT'} ${userId}]: ${text}`);

    // 4.1 Полный лог промпта и ответа для инспектора (в фоне, не блокирует ответ)
    const fallbackReasons = generationTrace
        .filter(item => item.step === 'fallback')
        .flatMap(item => Array.isArray(item.reason) ? item.reason : [item.reason])
        .filter(Boolean);
    const activeProfile = await getLeraProfile().catch(() => null);
    writePromptLog({
        kind: (!isInitiative && typeof messages[1]?.content === 'string' && messages[1]?.content?.startsWith('СТОП: предыдущий ответ')) ? 'RETRY' : (isInitiative ? 'INITIATIVE' : 'CHAT'),
        model,
        providerName,
        latencyMs,
        rawResponse: rawText,
        parsedResponse: text,
        usage,
        generationTrace,
        memoryRetrieval: memoryRetrieval?.trace || null,
        profileVersion: activeProfile?.version || null,
        judgeVerdict: generationTrace.filter(item => item.step === 'judge').at(-1)?.verdict || null,
        judgeCode: generationTrace.filter(item => item.step === 'judge').at(-1)?.code || null,
        errorText: blockedByJudge
            ? `Blocked by judge: ${generationTrace.filter(item => item.step === 'judge').at(-1)?.code || 'REJECTED'}`
            : fallbackReasons.length
            ? `Fallback: ${fallbackReasons.join(', ')}`
            : null
    });

    // 5. Асинхронная экстракция долгосрочных фактов в память в фоне (не блокирует ответ)
    if (!isInitiative && userText) {
        extractFactsInBackground(userId, userText, {
            sourceEventId: eventIds.at(-1) || null
        }).catch(mErr =>
            console.error(`⚠️ Ошибка фонового извлечения памяти (${userId}):`, mErr.message)
        );
    }
    return {
        text: text || "",
        routingMode,
        climaxState,
        blockedByJudge,
        photo,
        photoRecordId,
        voice,
        recommendationPost: finalRecPost,
        showBuyButton,
        contentId,
        initiativeKind,
        anchorEventId,
        debugInfo: {
            state_snapshot: leraState,
            memory_used: (memories && memories.length > 0) ? memories.map(m => m.text || m.fact || m.normalizedText || m) : "Память пока пуста (в БД PostgreSQL для этого юзера еще нет фактов)",
            memory_retrieval: memoryRetrieval?.trace || null,
            rawPrompt: messages,
            rawText,
            usage
        }
    };
}

// --- 5. ЭКСПОРТИРУЕМЫЕ ФУНКЦИИ-ОБЕРТКИ ---

export async function generateResponse(userId, text, envelope = {}) {
    const userReqs = rateLimitMap.get(userId) || 0;
    if (userReqs >= 10) {
        return { text: "⏳ Вы превысили лимит запросов (10/мин). Подождите немного.", photo: null, showBuyButton: false };
    }
    rateLimitMap.set(userId, userReqs + 1);

    console.log(`\n[USER ${userId}]: ${text}`);
    const user = await getUser(userId);

    if (VOICE_INTENT_REGEX.test(text)) {
        return {
            text: "💬 Мои голосовые сообщения доступны только в VIP-пакете! Приобрети его в магазине, чтобы услышать мой стон... 😈",
            photo: null,
            showBuyButton: true
        };
    }

    const command = await validateUserCommand(text, { userId, batchId: envelope.batchId });
    if (command.isCommand && !command.accepted) {
        savePromptLog({
            userId,
            kind: 'COMMAND_GATE',
            mode: 'strict-command-gate',
            userText: text,
            rawResponse: 'COMMAND_REFUSED',
            parsedResponse: 'COMMAND_REFUSED',
            stateSnapshot: { willingness: command.willingness },
            commandGateStatus: command.code,
            commandGateReason: `Willingness ${command.willingness?.value ?? 0}%`,
            latencyMs: 0
        }).catch(() => null);
        return {
            text: 'не сейчас, я реально на нуле и сначала разберусь со своими делами',
            photo: null,
            showBuyButton: false,
            command: command.code,
            willingness: command.willingness
        };
    }

    let routingMode = 'CASUAL';
    let classifierResult = null;
    let actionRouting = null;

    const events = await getRecentConversationEvents(userId, 6).catch(() => []);
    const lastLeraEvent = events
        .filter(e => e.status === 'COMPLETED' && (e.role === 'lera' || e.role === 'assistant'))
        .slice(-1)[0];
    const lastWasReaction = lastLeraEvent?.event_type === 'REACTION' || lastLeraEvent?.metadata?.mode === 'REACTION';
    const allowReaction = !lastWasReaction;

    const history = events
        .filter(event => event.status === 'COMPLETED'
            && event.content
            && (event.event_type === 'MESSAGE' || event.event_type === 'INITIATIVE' || event.event_type === 'REACTION'))
        .map(event => ({
            role: event.role === 'lera' || event.role === 'assistant' ? 'assistant' : 'user',
            content: event.event_type === 'REACTION' ? `[реакция ${event.content}]` : event.content,
            event_type: event.event_type
        }));

    // Определяем активный режим сессии (TTL = 5 минут = 300 секунд)
    const EROTIC_SESSION_TTL_SECONDS = 300;
    const lastCompletedEvent = events.filter(e => e.status === 'COMPLETED').slice(-1)[0];
    const lastEventTime = lastCompletedEvent?.occurred_at ? new Date(lastCompletedEvent.occurred_at).getTime() : 0;
    const now = Date.now();
    const gapSeconds = lastEventTime > 0 ? Math.max(0, Math.floor((now - lastEventTime) / 1000)) : Infinity;
    const lastMode = lastCompletedEvent?.metadata?.mode || lastCompletedEvent?.roleplay_mode || 'CASUAL';
    const isEroticSceneActive = gapSeconds < EROTIC_SESSION_TTL_SECONDS && lastMode === 'EROTIC';
    const activeMode = isEroticSceneActive ? 'EROTIC' : 'CASUAL';

    // 1. Классификация намерения и режима диалога (CASUAL, EROTIC, JOKE, REACTION)
    try {
        classifierResult = await classifyIntent({ userId, userText: text, history, activeMode, allowReaction });
        routingMode = ['CASUAL', 'EROTIC', 'JOKE'].includes(classifierResult.mode)
            ? classifierResult.mode
            : 'CASUAL';
        const usage = classifierResult.usage || {};
        const classifierCost = (Number(usage.prompt_tokens || 0) * 0.13 / 1000000)
            + (Number(usage.completion_tokens || 0) * 0.28 / 1000000);
        if (classifierCost > 0) await addApiCost(userId, classifierCost);
    } catch (routingError) {
        console.error('[INTENT ROUTER] fallback:', routingError.message);
        classifierResult = { mode: activeMode === 'EROTIC' ? 'EROTIC' : 'CASUAL', error: routingError.message };
        routingMode = classifierResult.mode;
    }

    const hasIncomingPhoto = Array.isArray(envelope.photoUrls) && envelope.photoUrls.length > 0;
    if (classifierResult?.mode === 'REACTION' && allowReaction && !hasIncomingPhoto && !envelope.forceText) {
        const reactionEmoji = classifierResult.reactionEmoji;
        savePromptLog({
            userId,
            kind: 'CHAT_REACTION',
            mode: 'REACTION',
            userText: text,
            rawResponse: `REACTION:${reactionEmoji}`,
            parsedResponse: `REACTION:${reactionEmoji}`,
            classifier: {
                mode: classifierResult.mode,
                providerName: classifierResult.providerName,
                model: classifierResult.model,
                latencyMs: classifierResult.latencyMs,
                usage: classifierResult.usage
            },
            latencyMs: classifierResult.latencyMs || 0,
            usage: classifierResult.usage || {}
        }).catch(() => null);
        return {
            text: '',
            photo: null,
            reactionEmoji,
            reactionRequested: true,
            routingMode: 'REACTION',
            debugInfo: {
                rawText: `REACTION:${reactionEmoji}`,
                usage: classifierResult.usage || {}
            }
        };
    }

    let contentCandidates = [];
    const isPhotoRequest = PHOTO_INTENT_REGEX.test(text);
    const isVoiceRequest = VOICE_INTENT_REGEX.test(text);
    if (routingMode === 'CASUAL' && !isPhotoRequest) {
        const [counts, dialogue] = await Promise.all([
            getInitiativeDailyCounts(userId).catch(() => ({ content: 3 })),
            getActiveDialogueEvents(userId).catch(() => [])
        ]);
        const dialogueHasContent = Number(envelope.preMessageGapSeconds || 0) <= 3600
            && dialogue.some(event => event.event_type === 'CONTENT');
        if (counts.content < 3 && !dialogueHasContent) {
            contentCandidates = await getContentCandidates(userId, 'dialogue', 4).catch(() => []);
        }
    }

    let finalRoutingMode = routingMode;
    let climaxState = null;
    if (finalRoutingMode === 'EROTIC') {
        climaxState = computeClimaxState({
            recentEvents: events,
            userText: text,
            isEroticMode: true
        });
        if (climaxState.isFinished) {
            finalRoutingMode = 'CASUAL';
            climaxState = null;
        }
    }

    return await runAiEngine(userId, {
        userText: text,
        photoUrls: envelope.photoUrls || [],
        isInitiative: false,
        routingMode: finalRoutingMode,
        isVoiceRequest,
        classifierResult,
        actionRouting,
        contentCandidates,
        commandGate: command.isCommand ? command : null,
        batchId: envelope.batchId,
        eventIds: envelope.eventIds || [],
        preMessageGapSeconds: envelope.preMessageGapSeconds,
        firstMessageAt: envelope.firstMessageAt,
        climaxState
    });
}

export async function generateAiInitiativeResponse(userId, reason = null, options = {}) {
    return await runAiEngine(userId, {
        isInitiative: true,
        routingMode: 'CASUAL',
        initiativeReason: reason,
        initiativeKind: options.initiativeKind || 'open',
        anchorEventId: options.anchorEventId || null,
        contentCandidates: options.contentCandidates || []
    });
}
