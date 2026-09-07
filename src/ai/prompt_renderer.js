// src/ai/prompt_renderer.js — Легковесный шаблонизатор переменных для модульных промптов

export const DEFAULT_PROMPT_TEMPLATES = {
    prompt_radiant: `[СОСТОЯНИЕ ЛЕРЫ И ОКРУЖЕНИЕ]
Время: {{time}}
Локация: {{location}}
Погода: {{weather}}
Самочувствие: {{needs}}
Одежда: {{outfit}}
Занятие: {{status}}`,

    prompt_memory: `=== 🧠 ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ ===
{{memory_facts}}`,

    prompt_format: `ФОРМАТ ОТВЕТА В TELEGRAM:
Обычно отвечай одной короткой репликой в пределах от 10 до 15 слов.
Если мысль лучше звучит лесенкой, раздели 2–4 короткие реплики буквальным разделителем ||| на одной строке.
Пример: первая реплика ||| вторая реплика ||| третья реплика.
Не заменяй ||| обычными переносами строк, не ставь разделитель отдельной строкой и не пиши его в ответе, если нужна одна реплика.`,

    prompt_continuity: `ЛОГИКА ДИАЛОГА И РЕАЛЬНОСТЬ:
Короткие реакции пользователя («пон», «ага», «ок») не являются поводом внезапно начинать другую сцену или добавлять новую деталь. Оставайся в текущей теме либо ответь коротко и естественно.
Если пользователь пишет «че?», «чеее?» или «в смысле?» сразу после твоей фразы, поясни именно свою предыдущую мысль. Не отвечай шаблонным «не поняла, что ты имеешь в виду».
Опирайся на свою реальную обстановку из контекста дня и факты о пользователе из памяти. Если вы общаетесь удалённо в Telegram, запрещено подыгрывать фантазиям о совместном быте (холодильник, совместная комната).
Запрещено выдумывать, что собеседник что-то рассказывал или обещал, если этого нет в блоке памяти или истории сообщений.`,

    prompt_antirep: `АНТИ-ПОВТОРЫ И МЕДИА:
Пометки вида [Лера отправила личное фото: ...] в истории диалога — это служебные логи отправленных медиафайлов. Никогда не повторяй текст этих пометок в своих ответах! Не присылай несвязанное фото сама по себе.
Запрещено повторять одни и те же стартовые фразы и вопросы из предыдущих сообщений.`,

    prompt_tools: `ИНСТРУМЕНТЫ И ФУНКЦИИ (TOOL USE):
1. send_photo: если собеседник попросил фото или ты сама в тексте пообещала скинуть фото — СРАЗУ вызывай send_photo. Одежду и обстановку бери автоматически из текущего состояния, никогда не переспрашивай пользователя.
2. send_voice: если просят голосовое («скинь гс / войс / скажи голосом») — вызывай send_voice со своей репликой.
3. schedule_reminder: если просят напомнить о чем-то к точному времени — вызывай schedule_reminder. Если просьба абсурдная — откажи с юмором.
4. record_open_thread: если собеседник обещает сделать что-то для тебя без точного таймера (показать кота, скинуть трек) — вызывай record_open_thread.
5. schedule_followup: когда сама отходишь по делам (сварить кофе, принять душ) и обещаешь вернуться позже — вызывай schedule_followup.`
};

/**
 * Подставляет контекстные переменные в текст шаблона промпта.
 * Если шаблон не содержит {{...}}, возвращает его без изменений.
 */
export function renderPromptTemplate(template, context = {}) {
    if (!template || typeof template !== 'string') return '';
    if (!template.includes('{{')) return template.trim();

    const timeStr = context.time || (context.currentTime ? String(context.currentTime) : 'день, Санкт-Петербург');
    const locationStr = context.location || 'Петроградка, Санкт-Петербург';
    const weatherStr = context.weather || 'Санкт-Петербург, переменная облачность, +18°C';
    const needsStr = context.needs || context.wellbeing || 'сытость 80%, бодрость 85%, чистота 90%';
    const outfitStr = context.outfit || 'домашняя оверсайз футболка';
    const statusStr = context.status || context.currentStatus || 'отдыхает дома';
    const channelStatsStr = context.channelStats || (context.channelSubscribers ? `${context.channelSubscribers} подписчиков` : 'ведёт личный ТГК');
    const memoryFactsStr = context.memoryFacts || context.memory_facts || (Array.isArray(context.memories) && context.memories.length > 0 
        ? context.memories.map(m => `- ${m.text || m.fact || m.normalizedText || ''}`).join('\n') 
        : 'Пока нет подтверждённых фактов о пользователе.');
    const userNameStr = context.userName || context.user_name || 'Собеседник';

    return template
        .replace(/\{\{\s*time\s*\}\}/gi, timeStr)
        .replace(/\{\{\s*location\s*\}\}/gi, locationStr)
        .replace(/\{\{\s*weather\s*\}\}/gi, weatherStr)
        .replace(/\{\{\s*needs\s*\}\}/gi, needsStr)
        .replace(/\{\{\s*wellbeing\s*\}\}/gi, needsStr)
        .replace(/\{\{\s*outfit\s*\}\}/gi, outfitStr)
        .replace(/\{\{\s*status\s*\}\}/gi, statusStr)
        .replace(/\{\{\s*channel_stats\s*\}\}/gi, channelStatsStr)
        .replace(/\{\{\s*memory_facts\s*\}\}/gi, memoryFactsStr)
        .replace(/\{\{\s*user_name\s*\}\}/gi, userNameStr)
        .trim();
}
