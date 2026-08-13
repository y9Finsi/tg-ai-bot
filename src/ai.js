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
import { judgeLeraReply } from './ai/response_judge.js';
import { cleanResponseText } from './utils/response_text.js';
// --- 1. КОНСТАНТЫ И ДИНАМИЧЕСКИЙ КЛИЕНТ ИИ ---

const rateLimitMap = new Map();
setInterval(() => rateLimitMap.clear(), 60 * 1000);

let activeProviderCache = null;
let openaiClientInstance = null;

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
    if (preselectedPhoto) {
        return preselectedPhoto;
    }

    // Исключительно подбираем готовое фото Леры из базы данных
    const dbPhoto = await getFreeLocalPhotoStream(user, imagePrompt);
    if (dbPhoto) {
        return dbPhoto;
    }

    return null;
}

// --- 3. ПАЙПЛАЙН AI ДВИЖКА ---

async function buildMessagePayload(user, userId, { userText, photoUrls = [], isInitiative, routingMode = 'CASUAL', initiativeReason = null, initiativeKind = null, contentCandidates = [], batchId = null, eventIds = [], preMessageGapSeconds = null, firstMessageAt = null }) {
    const productionRoutingSettings = await getRoutingSettings();
    const productionIntentConfig = getModeIntentConfig(routingMode, productionRoutingSettings);
    const [baseSystemPromptText, conversationEvents, memories] = await Promise.all([
        getRoutedSystemPrompt(routingMode, productionIntentConfig),
        getRecentConversationEvents(userId, 10).catch(() => []),
        getUserMemories(userId, 30).catch(() => [])
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
    const gapSeconds = Number.isFinite(Number(preMessageGapSeconds))
        ? Math.max(0, Number(preMessageGapSeconds))
        : (lastEvent ? Math.max(0, Math.floor((new Date(firstMessageAt || now).getTime() - new Date(lastEvent.occurred_at).getTime()) / 1000)) : 0);
    let modeInstruction = `\n\n[ИНСТРУКЦИЯ ПО ФОТОГРАФИЯМ И КИНУТЫМ МЕДИА]:
Добавляй в конец ответа тег [IMAGE: краткое описание фото на английском] только если пользователь просит фото или ты уже естественно предложила/пообещала прислать его в тексте.
- Не присылай несвязанное фото сама по себе и никогда не отвечай одним тегом [IMAGE: ...] без обычной текстовой реплики.
- Если пользователь просит фото, или если ты сама в тексте говоришь «ща скину», «держи фотку», «покажусь», «глянь фотку» и т.п., ты ОБЯЗАНА ДОБАВИТЬ ТЕГ [IMAGE: ...] в самый конец сообщения! Без этого тега фото не отправится!`;

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

    if (isInitiative) {
        const initiativePrompt = productionRoutingSettings.initiativePrompt
            ? `\n\n[ОБЩИЕ ПРАВИЛА ИНИЦИАТИВ]\n${productionRoutingSettings.initiativePrompt}`
            : '';
        modeInstruction = `\n\n[ТИП ИНИЦИАТИВЫ]: ${initiativeKind || 'open'}\n[ПРИЧИНА]: ${initiativeReason || 'естественное продолжение разговора'}\nНе раскрывай приватные данные других пользователей.${initiativePrompt}`;
    }

    if (contentCandidates.length > 0) {
        const catalog = contentCandidates.map(item =>
            `- [CONTENT: ${item.id}] ${item.telegram_type}: ${item.description || 'без описания'}`
        ).join('\n');
        modeInstruction += `\n\n[ДОСТУПНЫЙ КОНТЕНТ]\n${catalog}\n${productionRoutingSettings.contentPrompt}`;
    }

    const lastLeraText = [...priorEvents].reverse().find(event => event.role === 'lera' && event.content)?.content || '';
    let tamagotchiInstruction = "";
    let radiantContextText = "";
    let radiantLayers = {};
    try {
        const detailedContext = await ContextBuilder.buildTelegramContextDetailed(userId, {
            overrides: { preMessageGapSeconds: gapSeconds, previousActivityAt: lastEvent?.occurred_at, currentTime }
        });
        const radiantContext = detailedContext.text;
        radiantContextText = radiantContext;
        radiantLayers = detailedContext.layers;
        const memoryText = memories.length > 0
            ? memories.map(m => `- ${m.fact}`).join('\n')
            : 'Пока нет сохраненных фактов о пользователе.';

        const promptModules = productionIntentConfig?.promptModules || {};
        tamagotchiInstruction = [
            promptModules.context === false ? '' : `\n\n${radiantContext}`,
            promptModules.memory === false ? '' : `\n\n=== 🧠 ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ ===\n${memoryText}`
        ].filter(Boolean).join('');
    } catch (tamagotchiErr) {
        console.error("⚠️ Ошибка формирования контекста Леры:", tamagotchiErr.message);
    }

    // Формируем компактный текстовый блок истории сообщений с таймстампами и паузами
    const chatHistoryEvents = priorEvents.filter(ev =>
        ev.content && (ev.event_type === 'MESSAGE' || ev.event_type === 'INITIATIVE')
    ).slice(-10);

    let historyInstruction = "";
    if (productionIntentConfig?.promptModules?.history !== false) {
        if (chatHistoryEvents.length > 0) {
            let prevTime = null;
            const formattedLines = [];
            chatHistoryEvents.forEach(ev => {
                const isLera = ev.role === 'lera' || ev.role === 'assistant';
                const roleLabel = isLera ? 'Лера' : 'Собеседник';
                const initLabel = ev.event_type === 'INITIATIVE' ? ' (написала первой)' : '';
                const timestamp = ev.occurred_at || ev.created_at;
                let timeStr = '';
                let gapNote = '';
                if (timestamp) {
                    const date = new Date(timestamp);
                    if (!isNaN(date.getTime())) {
                        const hours = String(date.getHours()).padStart(2, '0');
                        const mins = String(date.getMinutes()).padStart(2, '0');
                        timeStr = `${hours}:${mins}`;
                        if (prevTime) {
                            const diffMin = Math.floor((date.getTime() - prevTime.getTime()) / 60000);
                            if (diffMin >= 15) {
                                const gapText = diffMin < 60 ? `${diffMin} мин` : `${Math.floor(diffMin / 60)} ч`;
                                gapNote = ` [пауза ${gapText}]`;
                            }
                        }
                        prevTime = date;
                    }
                }
                const prefix = timeStr ? `${timeStr}${gapNote} ` : '';
                formattedLines.push(`• ${prefix}${roleLabel}${initLabel}: ${ev.content}`);
            });
            historyInstruction = `\n\n=== 💬 ПОСЛЕДНИЕ СООБЩЕНИЯ ДИАЛОГА (КОНТЕКСТ) ===\n${formattedLines.join('\n')}\n(История выше дана только для понимания контекста разговора и пауз. В новом ответе не копируй этот формат и пиши только обычную реплику Леры).`;
        }
    }

    const systemPrompt = baseSystemPromptText + mediaLogInstruction + tamagotchiInstruction + modeInstruction + historyInstruction;
    const messages = [{ role: 'system', content: systemPrompt }];

    // Передаем последнее текущее сообщение пользователя (с поддержкой Vision)
    if (!isInitiative && userText) {
        const lastMsg = messages.at(-1);
        if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userText) {
            if (Array.isArray(photoUrls) && photoUrls.length > 0) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: userText || 'Посмотри на фото' },
                        ...photoUrls.map(url => ({ type: 'image_url', image_url: { url } }))
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
        recentReplyTexts: priorEvents
            .filter(event => event.role === 'lera' || event.role === 'assistant')
            .map(event => event.content)
            .filter(Boolean)
            .slice(-5),
        memories,
        systemPrompt,
        radiantContext: radiantContextText,
        judgeLeraRules: baseSystemPromptText,
        leraState: tamagotchiInstruction ? radiantLayers : null
    };
}

async function processLlmOutput(userId, user, rawText, isPhotoRequest, existingRecommendationPost = null, preselectedPhoto = null, contentCandidates = []) {
    let workingText = rawText || '';
    let imagePrompt = null;
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

    let photoSendPayload = null;
    let photoRecordId = null;
    let photoCaption = null;
    let showBuyButton = false;
    let finalAiText = cleanResponseText(workingText);

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
                photoSendPayload = photoObj;
            }
        }
    }

    return {
        text: finalAiText,
        photo: photoSendPayload,
        photoRecordId,
        photoCaption,
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

async function runAiEngine(userId, { userText = null, photoUrls = [], isInitiative = false, routingMode = 'CASUAL', classifierResult = null, initiativeReason = null, initiativeKind = null, anchorEventId = null, contentCandidates = [], commandGate = null, batchId = null, eventIds = [], preMessageGapSeconds = null, firstMessageAt = null } = {}) {
    const user = await getUser(userId);
    if (!user) return null;

    // 1. Формирование контекста сообщений (с параллельными запросами БД)
    const {
        messages, isPhotoRequest, recommendationPost, preselectedPhoto, lastLeraText,
        recentReplyTexts, memories, leraState, systemPrompt, radiantContext, judgeLeraRules
    } = await buildMessagePayload(user, userId, { userText, photoUrls, isInitiative, routingMode, initiativeReason, initiativeKind, contentCandidates, batchId, eventIds, preMessageGapSeconds, firstMessageAt });
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
            memoryUsed: (memories || []).map(m => m.fact || m),
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
            profileVersion: extra.profileVersion,
            surface: isInitiative ? 'INITIATIVE' : 'CHAT',
            judgeMode: extra.judgeMode || (isInitiative ? routingSettings?.initiativeJudgeMode : routingSettings?.judgeMode),
            judgeVerdict: extra.judgeVerdict || null,
            judgeCode: extra.judgeCode || null,
            ...extra
        }).catch(() => null);
    };

    // 2. Вызов нейросети через модуль llm_client
    let llmResult;
    try {
        llmResult = await requestLlmCompletion(user, messages, isPhotoRequest, getOpenAIClientAndModel, generationParams);
    } catch (llmErr) {
        writePromptLog({ errorText: llmErr.message });
        throw llmErr;
    }

    let { rawText, usage } = llmResult;
    let { model, providerName, latencyMs } = llmResult;
    if (!rawText) {
        writePromptLog({ model, providerName, latencyMs, errorText: 'Пустой ответ от LLM' });
        return { text: "❌ Произошла ошибка на стороне нейросети.", photo: null, recommendationPost: null };
    }

    // 3. Чистка текста и генерация/выборка фото
    let { text, photo, photoRecordId, photoCaption, recommendationPost: finalRecPost, showBuyButton, contentId } = await processLlmOutput(userId, user, rawText, isPhotoRequest, recommendationPost, preselectedPhoto, contentCandidates);
    const generationTrace = [{
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
        relationshipEvent
    });

    const normalizeReply = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const looksLikeGreeting = /^(привет|приветик|здравствуй|доброе утро|добрый вечер|хай|хелло)/i.test(String(userText || '').trim());
    const greetingPrefix = /^(приветик?|здравствуй(?:те)?|доброе утро|добрый вечер|хай|хелло)[!,.\s-]*/i;
    const repeatsGreeting = !looksLikeGreeting
        && greetingPrefix.test(text || '')
        && greetingPrefix.test(lastLeraText || '');
    const qualityIssues = evaluateLeraReply(text, userText, null, {
        mode: routingMode,
        recentReplies: recentReplyTexts
    }).violations;
    const needsQualityRetry = !isInitiative && requiresReplyRetry(qualityIssues);
    const activeJudgeMode = isInitiative ? judgeSettings.initiativeJudgeMode : judgeSettings.judgeMode;
    const judgeNeedsRetry = activeJudgeMode === 'ENFORCE' && judgeResult.passed === false;
    let blockedByJudge = false;
    if ((isInitiative && judgeNeedsRetry) || (!isInitiative && userText && (
        (lastLeraText && (normalizeReply(text) === normalizeReply(lastLeraText) || repeatsGreeting) && !looksLikeGreeting)
        || needsQualityRetry
        || judgeNeedsRetry
    ))) {
        const retryReason = judgeNeedsRetry
            ? `judge_${judgeResult.code || 'rejected'}`
            : needsQualityRetry
            ? qualityIssues.includes('format') ? 'response_format' : 'recent_repeat'
            : repeatsGreeting ? 'repeated_greeting' : 'exact_repeat';
        const retryInstruction = qualityIssues.includes('format')
            ? 'СТОП: в предыдущем ответе склеились две отдельные фразы. Перепиши ответ заново. Между каждой отдельной короткой репликой поставь буквальный разделитель ||| с пробелами по краям: первая реплика ||| вторая реплика. Не склеивай слова, не используй переносы строк и не добавляй пояснений.'
            : judgeNeedsRetry
            ? `Проверка качества отклонила предыдущий ответ: ${judgeResult.code || 'REJECTED'}. Перепиши его по последней реплике пользователя, сохрани характер Леры и не повторяй предыдущий вариант.`
            : needsQualityRetry
            ? qualityIssues.includes('nonEmpty')
                ? 'СТОП: предыдущий ответ оказался пустым после обработки медиа-тегов. Ответь текстом именно на последнюю реплику пользователя. Фото можно добавлять только после нормальной текстовой подписи.'
                : 'СТОП: предыдущий ответ повторяет недавнюю фразу. Перепиши ответ именно на последнюю реплику и не повторяй недавний текст.'
            : 'СТОП: предыдущий ответ совпал с прошлой репликой. Сгенерируй новый ответ именно на последнюю CURRENT_MESSAGE. Не повторяй приветствие и прошлый текст.';
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
        ({ text, photo, photoRecordId, photoCaption, recommendationPost: finalRecPost, showBuyButton, contentId } = await processLlmOutput(
            userId, user, rawText, isPhotoRequest, recommendationPost, preselectedPhoto, contentCandidates
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
                relationshipEvent: retryJudge.relationshipEvent || null
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
        recentReplies: recentReplyTexts
    });
    if (!isInitiative && userText && !(photo && !text) && !finalQuality.passed) {
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

    if (!isInitiative && userText && !looksLikeGreeting && greetingPrefix.test(text || '') && greetingPrefix.test(lastLeraText || '')) {
        text = text.replace(greetingPrefix, '').trim();
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
        extractFactsInBackground(userId, userText).catch(mErr =>
            console.error(`⚠️ Ошибка фонового извлечения памяти (${userId}):`, mErr.message)
        );
    }
    return {
        text: text || "",
        blockedByJudge,
        photo,
        photoRecordId,
        recommendationPost: finalRecPost,
        showBuyButton,
        contentId,
        initiativeKind,
        anchorEventId,
        debugInfo: {
            state_snapshot: leraState,
            memory_used: (memories && memories.length > 0) ? memories.map(m => m.fact || m) : "Память пока пуста (в БД PostgreSQL для этого юзера еще нет фактов)",
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
    try {
        const events = await getRecentConversationEvents(userId, 3).catch(() => []);
        const history = events
            .filter(event => event.status === 'COMPLETED'
                && event.content
                && (event.event_type === 'MESSAGE' || event.event_type === 'INITIATIVE'))
            .map(event => ({
                role: event.role === 'lera' || event.role === 'assistant' ? 'assistant' : 'user',
                content: event.content
            }));
        classifierResult = await classifyIntent({ userId, userText: text, history });
        routingMode = ['CASUAL', 'EROTIC', 'JOKE'].includes(classifierResult.mode)
            ? classifierResult.mode
            : 'CASUAL';
        const usage = classifierResult.usage || {};
        const classifierCost = (Number(usage.prompt_tokens || 0) * 0.13 / 1000000)
            + (Number(usage.completion_tokens || 0) * 0.28 / 1000000);
        if (classifierCost > 0) await addApiCost(userId, classifierCost);
    } catch (routingError) {
        console.error('[INTENT ROUTER] fallback to CASUAL:', routingError.message);
        classifierResult = { mode: 'CASUAL', error: routingError.message };
    }

    if (classifierResult?.mode === 'REACTION') {
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

    return await runAiEngine(userId, {
        userText: text,
        photoUrls: envelope.photoUrls || [],
        isInitiative: false,
        routingMode,
        classifierResult,
        contentCandidates,
        commandGate: command.isCommand ? command : null,
        batchId: envelope.batchId,
        eventIds: envelope.eventIds || [],
        preMessageGapSeconds: envelope.preMessageGapSeconds,
        firstMessageAt: envelope.firstMessageAt
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
