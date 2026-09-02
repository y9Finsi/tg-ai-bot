/**
 * RADIANT Plugin: send_photo
 * Отправляет фото Леры: подбирает готовое селфи из галереи базы данных
 * либо генерирует новое фото через AI, если запрошен конкретный лук / ситуация.
 */

import { generateLeraPhoto } from '../../../services/image_generator.js';
import { getLeraPhotoCandidates, getSentPhotos, getUser } from '../../../db/database.js';

function isUsableTelegramPhotoId(fileId) {
    if (!fileId || typeof fileId !== 'string') return false;
    const trimmed = fileId.trim();
    if (trimmed.length < 10) return false;
    return /^[A-Za-z0-9_-]+$/.test(trimmed) || /^https?:\/\//i.test(trimmed);
}

function getMoscowHour() {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Moscow',
        hour: 'numeric',
        hour12: false
    });
    return parseInt(formatter.format(new Date()), 10);
}

async function findLocalPhoto(user, { prompt = '', outfit = '', currentContext = null } = {}) {
    try {
        const hour = getMoscowHour();
        let currentTimeOfDay = 'any';
        if (hour >= 5 && hour < 12) currentTimeOfDay = 'morning';
        else if (hour >= 12 && hour < 18) currentTimeOfDay = 'day';
        else if (hour >= 18 && hour < 23) currentTimeOfDay = 'evening';
        else currentTimeOfDay = 'night';

        const accessLevel = user?.is_premium ? 'vip' : 'free';
        const sentPhotoIds = user ? await getSentPhotos(user) : [];

        // Получаем всех кандидатов галереи
        const candidates = await getLeraPhotoCandidates({ access_level: accessLevel, time_of_day: null });
        if (!candidates || candidates.length === 0) return null;

        // Исключаем уже отправленные фото (строгий запрет повторов)
        const unspent = candidates.filter(c => isUsableTelegramPhotoId(c.file_id)
            && !sentPhotoIds.includes(String(c.id)) && !sentPhotoIds.includes(String(c.file_id)));

        if (unspent.length === 0) {
            return null; // Нет уникальных несмотренных фото в базе
        }

        const queryText = [
            prompt,
            outfit,
            currentContext?.location?.name,
            currentContext?.status?.text,
            currentContext?.action?.text
        ].filter(Boolean).join(' ').toLowerCase();

        const isHomeBedRequest = /кроват|спат|сон|сонн|дома|квартир|петроградк|пижам|плед|одеял|ночь|перед сном/iu.test(queryText);
        const isStreetRequest = /улиц|гуля|прогулк|город|парк|кафе|кофе|магаз|шоурум/iu.test(queryText);
        const isHotRequest = /секси|голая|нюдс|вирт|грудь|попа|постель|hot|эротик/iu.test(queryText);

        // Скорим каждого несмотренного кандидата
        const scored = unspent.map(c => {
            let score = 0;
            const photoText = [
                c.caption || '',
                Array.isArray(c.tags) ? c.tags.join(' ') : '',
                c.prompt || ''
            ].join(' ').toLowerCase();

            // 1. Время суток
            const photoTod = String(c.time_of_day || 'any').toLowerCase();
            if (photoTod === currentTimeOfDay) {
                score += 3;
            } else if (photoTod === 'any') {
                score += 1;
            } else {
                score -= 2;
            }

            // 2. Локация и обстановка
            const photoIsHome = /кроват|дом|квартир|пижам|мешок|сон/iu.test(photoText);
            const photoIsStreet = /гуля|улиц|город|парк|набережн/iu.test(photoText);
            const photoIsHotOrAhegao = /hot|ахегао|язык|эротик/iu.test(photoText);

            if (isHomeBedRequest) {
                if (photoIsHome) score += 4;
                if (photoIsStreet) score -= 10;
                if (photoIsHotOrAhegao && !isHotRequest) score -= 8;
            } else if (isStreetRequest) {
                if (photoIsStreet) score += 4;
                if (photoIsHome) score -= 6;
            }

            if (isHotRequest) {
                if (photoIsHotOrAhegao) score += 5;
            } else {
                if (photoIsHotOrAhegao && (c.explicitness > 20 || /ахегао|язык/iu.test(photoText))) score -= 5;
            }

            return { candidate: c, score };
        });

        // Сортируем по убыванию очков
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];

        // Если лучший кандидат имеет надежный скор (>= 2)
        if (best && best.score >= 2) {
            return {
                id: best.candidate.id,
                file_id: best.candidate.file_id,
                caption: best.candidate.caption,
                isGenerated: false
            };
        }

        return null;
    } catch (err) {
        console.error('[SEND_PHOTO ACTION] Ошибка поиска локального фото:', err.message);
        return null;
    }
}

export const sendPhotoAction = {
    name: 'send_photo',
    title: 'Отправить фото Леры',
    description: 'Отправляет реальную фотографию или селфи Леры в чат. Вызывай ТОЛЬКО когда просьба соответствует реальной жизни и обычной одежде девушки (домашняя, уличная, повседневная). НЕ вызывай для вымышленных костюмов, косплеев или абсурдных фантазий — на них реагируй текстовым отказом с сарказмом.',
    inputSchema: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: 'Описание сцены, позы или действия на фото с учётом твоей текущей обстановки, локации и времени суток (например: "лежит в кровати на Петроградке, лениво улыбается", "пьёт кофе у окна", "стоит в душе, вода стекает по телу", "гуляет по улице").'
            },
            outfit: {
                type: 'string',
                description: 'Одежда на фото: укажи свою текущую одежду из контекста [СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ] (например: "oversized футболка", "пижама", "тренч", "полотенце / без одежды") либо вещь, которую прямо попросил собеседник (например: "пальто", "купальник").'
            },
            time_of_day: {
                type: 'string',
                enum: ['morning', 'day', 'evening', 'night'],
                description: 'Время суток на фото (morning, day, evening, night) в соответствии с текущим временем и контекстом.'
            },
            allow_db_fallback: {
                type: 'boolean',
                description: 'Разрешить ли взять подходящее селфи из галереи, если нет жесткого запроса на нестандартную одежду. По умолчанию true.'
            }
        }
    },
    timeoutMs: 120000,
    config: {},

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        const user = userId ? await getUser(userId).catch(() => null) : null;
        let prompt = String(args.prompt || '').trim();
        const isPublic = Boolean(context.isPublicContext || context.currentContext?.isPublicContext);
        const allowFallback = isPublic ? false : (args.allow_db_fallback !== false);

        // 1. Автоматическое определение времени суток
        const hour = getMoscowHour();
        let timeOfDay = args.time_of_day;
        if (!timeOfDay) {
            timeOfDay = hour >= 5 && hour < 12 ? 'morning' : (hour >= 12 && hour < 18 ? 'day' : (hour >= 18 && hour < 23 ? 'evening' : 'night'));
        }

        // 2. Автоматическое обогащение одеждой из текущего контекста тамагочи, если LLM не передала outfit
        if (!outfit && context.currentContext) {
            const ctxOutfit = context.currentContext.outfit?.text || context.currentContext.outfitText;
            if (ctxOutfit && typeof ctxOutfit === 'string') {
                outfit = ctxOutfit;
            }
        }

        const isSpecificOutfit = Boolean(outfit && !['футболка', 'пижама', 'домашняя одежда', 'селфи', 'oversized_tshirt', 'oversized футболка'].includes(outfit.toLowerCase()));

        // 3. Если запрошена конкретная нестандартная одежда или явный кастомный промпт — пробуем сгенерировать
        if (isSpecificOutfit || (prompt && !allowFallback)) {
            try {
                const locationText = context.currentContext?.location?.name || context.currentContext?.location || '';
                const locationPrompt = locationText ? `локация: ${locationText}` : '';
                const fullGenPrompt = `${prompt} ${outfit ? 'одежда: ' + outfit : ''} ${locationPrompt}`.trim() || 'селфи Леры';

                const generated = await generateLeraPhoto({
                    prompt: fullGenPrompt,
                    timeOfDay,
                    user,
                    bot: null,
                    saveToDb: true,
                    source: 'chat'
                });

                if (generated && (generated.buffer || generated.file_id)) {
                    return {
                        status: 'success',
                        data: {
                            photo: generated.buffer ? { source: generated.buffer, filename: generated.filename || 'photo.jpg' } : generated.file_id,
                            photoRecordId: generated.savedPhoto?.id || null,
                            photoCaption: generated.caption || null,
                            isGenerated: true,
                            text: `Фото успешно создано (лук: ${outfit || 'по контексту'}, время: ${timeOfDay}). Прикреплено к сообщению.`
                        }
                    };
                }
            } catch (genErr) {
                console.warn('[SEND_PHOTO ACTION] Сбой нейрогенератора:', genErr.message);
            }

            if (isSpecificOutfit) {
                return {
                    status: 'error',
                    data: {
                        isGenerated: false
                    },
                    error: {
                        code: 'PHOTO_NOT_AVAILABLE',
                        message: `Не удалось сделать фото в "${outfit}". Честно ответь собеседнику своими словами от лица Леры (например: "ща фоткаться лень / не хочу / на мне ща просто футболка, могу другую скинуть"), но НЕ ври, что прислала фото в ${outfit}.`
                    }
                };
            }
        }

        // 4. Ищем подходящее готовое селфи из базы под текущий контекст
        const local = allowFallback ? await findLocalPhoto(user, { prompt, outfit, currentContext: context.currentContext }) : null;
        if (local && isUsableTelegramPhotoId(local.file_id)) {
            return {
                status: 'success',
                data: {
                    photo: local.file_id,
                    photoRecordId: local.id,
                    photoCaption: local.caption,
                    isGenerated: false,
                    text: `Фото Леры из галереи (${timeOfDay}) прикреплено к сообщению.`
                }
            };
        }

        // 5. Если в базе нет подходящего по смыслу фото — пробуем динамическую AI генерацию под текущую ситуацию
        try {
            const locationText = context.currentContext?.location?.name || context.currentContext?.location || '';
            const locationPrompt = locationText ? `локация: ${locationText}` : '';
            const fullGenPrompt = `${prompt} ${outfit ? 'одежда: ' + outfit : ''} ${locationPrompt}`.trim() || 'селфи Леры';

            const generated = await generateLeraPhoto({
                prompt: fullGenPrompt,
                timeOfDay,
                user,
                bot: null,
                saveToDb: true,
                source: 'chat'
            });

            if (generated && (generated.buffer || generated.file_id)) {
                return {
                    status: 'success',
                    data: {
                        photo: generated.buffer ? { source: generated.buffer, filename: generated.filename || 'photo.jpg' } : generated.file_id,
                        photoRecordId: generated.savedPhoto?.id || null,
                        photoCaption: generated.caption || null,
                        isGenerated: true,
                        text: `Фото успешно создано (лук: ${outfit || 'по контексту'}, время: ${timeOfDay}). Прикреплено к сообщению.`
                    }
                };
            }
        } catch (genErr) {
            console.warn('[SEND_PHOTO ACTION] Сбой нейрогенератора при фоллбэке:', genErr.message);
        }

        // 6. Если и в базе нет подходящего, и генератор недоступен — возвращаем честный статус отказа
        return {
            status: 'error',
            error: {
                code: 'NO_PHOTO',
                message: 'Сейчас нет подходящего фото Леры под эту обстановку. Честно ответь собеседнику своими словами от лица Леры (например: темно в комнате / свет уже выключен / лень сейчас фоткаться / сфоткаешься позже / нет под рукой фотика), не притворяясь, что фото отправлено.'
            }
        };
    }
};
