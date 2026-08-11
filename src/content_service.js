import { getLeraContent } from './database.js';

export function extractContentFromChannelPost(post) {
    if (!post) return null;
    const description = String(post.caption || post.text || '').trim();
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

    const entity = [...(post.entities || []), ...(post.caption_entities || [])]
        .find(item => item.type === 'text_link' || item.type === 'url');
    if (!entity) return null;
    const sourceText = post.text || post.caption || '';
    const url = entity.type === 'text_link'
        ? entity.url
        : sourceText.slice(entity.offset, entity.offset + entity.length);
    return url ? { ...common, telegramType: 'link', url } : null;
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
