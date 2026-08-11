import { getLeraContent } from './database.js';

const CONTENT_STATUS_MARKER = '📚 Каталог Леры';
const CONTENT_STATUS_SEPARATOR = '────────';

export const CONTENT_CHANNEL_GUIDE = `короче, сюда можно кидать то, чем я потом смогу поделиться в диалоге или когда сама напишу

как делать пост:

— один пост = один материал
— можно загрузить музыку, видео, гифку, фото или файл
— тикток, ютуб, яндекс музыку и посты из других каналов можно кидать ссылкой
— сверху обязательно напиши обычными словами, что это за штука и какой у неё вайб
— никаких тегов и технических подписей не надо, я сама всё распознаю и подпишу пост
— голосовые и кружки пока не беру

например:

трек который я последнее время постоянно слушаю, спокойный вечерний вайб

или:

оч смешной тикток про работу, я с него выпала

после публикации я допишу снизу, распознала ли материал и добавила ли его в каталог

если попрошу добавить описание — просто отредачь этот же пост, удалять и отправлять заново не надо`;

export function stripContentChannelStatus(value = '') {
    const text = String(value || '').trim();
    const markerIndex = text.indexOf(`\n\n${CONTENT_STATUS_SEPARATOR}\n${CONTENT_STATUS_MARKER}`);
    return (markerIndex >= 0 ? text.slice(0, markerIndex) : text).trim();
}

function entityUrl(post, sourceText) {
    const entity = [...(post.entities || []), ...(post.caption_entities || [])]
        .find(item => item.type === 'text_link' || item.type === 'url');
    if (!entity) return null;
    return entity.type === 'text_link'
        ? entity.url
        : sourceText.slice(entity.offset, entity.offset + entity.length);
}

function isBareUrlDescription(description, url) {
    if (!description || !url) return false;
    const normalizedDescription = description
        .replace(/[<>()]/g, '')
        .replaceAll('[', '')
        .replaceAll(']', '')
        .trim();
    return normalizedDescription === String(url).trim();
}

export function extractContentFromChannelPost(post) {
    if (!post) return null;
    const sourceText = stripContentChannelStatus(post.caption || post.text || '');
    const url = entityUrl(post, post.text || post.caption || '');
    const description = isBareUrlDescription(sourceText, url) ? '' : sourceText;
    const common = {
        description,
        sourceChannelId: post.chat?.id || null,
        sourceMessageId: post.message_id || null
    };
    if (post.audio) return { ...common, telegramType: 'audio', telegramFileId: post.audio.file_id };
    if (post.video) return { ...common, telegramType: 'video', telegramFileId: post.video.file_id };
    if (post.animation) return { ...common, telegramType: 'animation', telegramFileId: post.animation.file_id };
    if (post.document) return { ...common, telegramType: 'document', telegramFileId: post.document.file_id };
    if (post.photo?.length) return { ...common, telegramType: 'photo', telegramFileId: post.photo.at(-1).file_id };

    return url ? { ...common, telegramType: 'link', url } : null;
}

function contentTypeLabel(content) {
    if (content.telegram_type !== 'link') {
        return {
            audio: 'музыка',
            video: 'видео',
            animation: 'гифка',
            document: 'файл',
            photo: 'фото'
        }[content.telegram_type] || content.telegram_type;
    }

    try {
        const host = new URL(content.url).hostname.replace(/^www\./, '').toLowerCase();
        if (host.includes('tiktok.com')) return 'TikTok';
        if (host.includes('youtube.com') || host === 'youtu.be') return 'YouTube';
        if (host.includes('music.yandex.')) return 'Яндекс Музыка';
        if (host === 't.me' || host.endsWith('.t.me')) return 'пост Telegram';
    } catch {
        // Для неизвестной или нестандартной ссылки остаётся общий тип.
    }
    return 'ссылка';
}

function usageLabel(content) {
    const targets = [];
    if (content.allow_in_dialogue ?? content.allowInDialogue) targets.push('в диалоге');
    if (content.allow_initiative ?? content.allowInitiative) targets.push('когда пишу первая');
    return targets.length ? targets.join(' и ') : 'пока нигде';
}

export function formatContentChannelPost(content, { duplicate = false, maxLength = 4096 } = {}) {
    const description = stripContentChannelStatus(content.description || '');
    const hasDescription = Boolean(description);
    const enabled = content.enabled !== false && hasDescription && !duplicate;
    const status = duplicate
        ? `⚠️ уже есть в каталоге под номером #${content.id}`
        : enabled
            ? `✅ добавила в каталог под номером #${content.id}`
            : '⚠️ сохранила, но пока выключила — допиши сверху нормальное описание';
    const sourceLine = content.telegram_type === 'link' && content.url
        ? `\nссылка: ${content.url}`
        : '';
    const serviceBlock = `${CONTENT_STATUS_SEPARATOR}\n${CONTENT_STATUS_MARKER}\n${status}\nтип: ${contentTypeLabel(content)}\nможно использовать: ${usageLabel(content)}${sourceLine}`;
    const reservedLength = serviceBlock.length + 2;
    const visibleDescription = description.slice(0, Math.max(0, maxLength - reservedLength)).trim();
    return `${visibleDescription ? `${visibleDescription}\n\n` : ''}${serviceBlock}`.slice(0, maxLength);
}

export async function editContentChannelPost(telegram, post, content, options = {}) {
    const isTextPost = typeof post.text === 'string' && !post.caption;
    const maxLength = isTextPost ? 4096 : 1024;
    const text = formatContentChannelPost(content, { ...options, maxLength });
    try {
        if (isTextPost) {
            return await telegram.editMessageText(post.chat.id, post.message_id, undefined, text);
        }
        return await telegram.editMessageCaption(post.chat.id, post.message_id, undefined, text);
    } catch (error) {
        if (/message is not modified/i.test(error?.message || '')) return null;
        throw error;
    }
}

export async function sendCatalogContent(telegram, chatId, contentOrId) {
    const content = typeof contentOrId === 'object' ? contentOrId : await getLeraContent(contentOrId);
    if (!content || !content.enabled) throw new Error('Контент не найден или выключен');
    const fileId = content.telegram_file_id;
    switch (content.telegram_type) {
        case 'audio': return telegram.sendAudio(chatId, fileId);
        case 'video': return telegram.sendVideo(chatId, fileId);
        case 'animation': return telegram.sendAnimation(chatId, fileId);
        case 'document': return telegram.sendDocument(chatId, fileId);
        case 'photo': return telegram.sendPhoto(chatId, fileId);
        case 'link': return telegram.sendMessage(chatId, content.url);
        default: throw new Error(`Неподдерживаемый тип контента: ${content.telegram_type}`);
    }
}
