const DASH_CHARACTERS = /[-\u058A\u05BE\u1400\u1806\u2010-\u2015\u2E17\u2E1A\u2E3A-\u2E3B\u2E40\u301C\u3030\u30A0\uFE31-\uFE32\uFE58\uFE63\uFF0D]/gu;
const DECORATIVE_QUOTES = /[«»“”„‟]/gu;
export function cleanResponseText(rawText) {
    if (!rawText) return '';
    let text = String(rawText);

    // Удаляем любые блоки мыслей модели: <think>...</think>, </think> и всё до него
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/^[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/<think>[\s\S]*/gi, '').trim();

    // Удаляем специальные токены и разметку моделей (DeepSeek, ChatGPT и др.)
    text = text.replace(/<[｜|][\s\S]*?[｜|]>/g, '').trim();
    text = text.replace(/<\/?context>/gi, '').trim();
    text = text.replace(/<\/?[a-z0-9_-]+(?:\s+[^>]*)?>/gi, '').trim();

    // Удаляем галлюцинированные системные заголовки и инструкции
    text = text.replace(/##\s*(?:История диалога|Текущее сообщение|Текущий запрос|Дополнительная информация|Погода|Последние новости|ИСТОРИЯ ДИАЛОГА|ПОСЛЕДНЕЕ СООБЩЕНИЕ)[\s\S]*?(?=(?:\r?\n\r?\n)|$)/gi, '').trim();
    text = text.replace(/\[(?:Пользователь|Собеседник|Лера)[^\]]*\]:?/gi, '').trim();
    text = text.replace(/^(?:Пользователь|Собеседник|Лера):\s*/gim, '').trim();

    text = text.replace(/\[IMAGE:[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[IMAGE:[\s\S]*/gi, '').trim();
    text = text.replace(/\[RECOMMEND\]/gi, '').trim();
    text = text.replace(/\[SYSTEM\]:?/gi, '').trim();
    text = text.replace(/SYSTEM:?/gi, '').trim();
    text = text.replace(/\[СИСТЕМНАЯ ЗАДАЧА[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[СИСТЕМНАЯ КОМАНДА[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[СИСТЕМНЫЙ БЛОК[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[СИСТЕМНОЕ СОБЫТИЕ[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[Лера отправила[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[Лера переслала[\s\S]*?\]/gi, '').trim();
    text = text.replace(/\[D:[^\]]+\]|\[(?:M|R|PHOTO|VOICE|VIDEO|STICKER|INITIATIVE|REMEMBER|FORGET|MUTE|SYSTEM)[^\]]*\]/gi, '').trim();
    text = text.replace(/Лера отправила личное фото:?[\s\S]*/gi, '').trim();
    text = text.replace(/Лера переслала пост:?[\s\S]*/gi, '').trim();
    text = text.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fa5\uac00-\ud7af]+/g, '');

    try {
        text = text.replace(/\p{Extended_Pictographic}/gu, '');
        text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '');
    } catch {
        text = text.replace(/[\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u2600-\u26FF\u2700-\u27BF]/g, '');
    }

    text = text.replace(/[()]+/g, '');
    text = text.replace(DASH_CHARACTERS, ' ');
    text = text.replace(DECORATIVE_QUOTES, '');
    text = text.replace(/[\uFE0E\uFE0F\u20E3]/gu, '');
    return text
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

export function splitResponseMessages(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    return raw
        .split(/\r?\n+|\s*(?:\|{2,4}|[｜]{2,4}|\\\|\\\|\\\|)\s*/)
        .map(part => part.replace(/\|{2,4}|[｜]{2,4}/g, '').trim())
        .filter(Boolean);
}

export function findResponseFormatIssues(text) {
    return [];
}
