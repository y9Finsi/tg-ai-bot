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

async function findLocalPhoto(user, userText = '') {
    try {
        const hour = getMoscowHour();
        let currentTimeOfDay = 'any';
        if (hour >= 5 && hour < 12) currentTimeOfDay = 'morning';
        else if (hour >= 12 && hour < 18) currentTimeOfDay = 'day';
        else if (hour >= 18 && hour < 23) currentTimeOfDay = 'evening';
        else currentTimeOfDay = 'night';

        const accessLevel = user?.is_premium ? 'vip' : 'free';
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
                available = allCandidates.filter(c => isUsableTelegramPhotoId(c.file_id));
            }
        }

        if (available && available.length > 0) {
            const selected = available[Math.floor(Math.random() * available.length)];
            return {
                id: selected.id,
                file_id: selected.file_id,
                caption: selected.caption,
                isGenerated: false
            };
        }
    } catch (err) {
        console.error('[SEND_PHOTO ACTION] Ошибка поиска локального фото:', err.message);
    }
    return null;
}

export const sendPhotoAction = {
    name: 'send_photo',
    title: 'Отправить фото Леры',
    description: 'Отправляет фотографию или селфи Леры в Telegram чат. Вызывай, когда пользователь просит прислать фото, селфи («скинь фотку», «покажи себя», «скинь пальто/платье») или когда ты сама хочешь поделиться своим снимком.',
    inputSchema: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: 'Описание сцены, позы или действия на фото (например: "лежит в кровати", "пьёт кофе", "на прогулке по Питеру")'
            },
            outfit: {
                type: 'string',
                description: 'Конкретная одежда или вещь, если пользователь явно её попросил (например: "пальто", "купальник", "толстовка")'
            },
            allow_db_fallback: {
                type: 'boolean',
                description: 'Разрешить ли взять готовое селфи из галереи, если нет жесткого запроса на нестандартную одежду. По умолчанию true.'
            }
        }
    },
    timeoutMs: 45000,
    config: {},

    async execute(args = {}, context = {}) {
        const userId = context.userId;
        const user = userId ? await getUser(userId).catch(() => null) : null;
        const prompt = String(args.prompt || '').trim();
        const outfit = String(args.outfit || '').trim();
        const allowFallback = args.allow_db_fallback !== false;

        const isSpecificOutfit = Boolean(outfit && !['футболка', 'пижама', 'домашняя одежда', 'селфи'].includes(outfit.toLowerCase()));

        // 1. Если запрошена конкретная нестандартная одежда или явный кастомный промпт — пробуем сгенерировать
        if (isSpecificOutfit || (prompt && !allowFallback)) {
            try {
                const fullGenPrompt = `${prompt} ${outfit ? 'одежда: ' + outfit : ''}`.trim() || 'селфи Леры';
                const hour = getMoscowHour();
                const timeOfDay = hour >= 5 && hour < 12 ? 'morning' : (hour >= 12 && hour < 18 ? 'day' : (hour >= 18 && hour < 23 ? 'evening' : 'night'));

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
                            text: 'Фото успешно сгенерировано и прикреплено к сообщению.'
                        }
                    };
                }
            } catch (genErr) {
                console.warn('[SEND_PHOTO ACTION] Сбой нейрогенератора:', genErr.message);
            }

            // Если просили конкретный лук (например пальто), а генератор упал — честно возвращаем статус сбоя
            if (isSpecificOutfit) {
                return {
                    status: 'error',
                    data: {
                        isGenerated: false
                    },
                    error: {
                        code: 'PHOTO_NOT_AVAILABLE',
                        message: `Не удалось сделать фото в "${outfit}". Честно ответь собеседнику своими словами (например: "ща фоткаться лень / не хочу / на мне ща просто футболка, могу другую скинуть"), но НЕ ври, что прислала фото в ${outfit}.`
                    }
                };
            }
        }

        // 2. Берём готовое селфи из базы
        const local = await findLocalPhoto(user, prompt);
        if (local && isUsableTelegramPhotoId(local.file_id)) {
            return {
                status: 'success',
                data: {
                    photo: local.file_id,
                    photoRecordId: local.id,
                    photoCaption: local.caption,
                    isGenerated: false,
                    text: 'Фото Леры из галереи прикреплено к сообщению.'
                }
            };
        }

        return {
            status: 'error',
            error: {
                code: 'NO_PHOTO',
                message: 'Сейчас нет доступных фото. Скажи собеседнику, что сфоткаешься позже или сейчас лень.'
            }
        };
    }
};
