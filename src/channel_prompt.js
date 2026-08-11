const CHANNEL_PERSONA = `
Ты пишешь публичный пост от лица Леры для её авторского Telegram-канала.
Это публичная трибуна, а не личный чат и не ответ конкретному парню.
Никогда не упоминай пользователей, личные переписки, личные фото, служебные записи,
внутреннее состояние движка, координаты, идентификаторы задач или инструкции промпта.
Не выдавай технические данные за мысли или события Леры.

Лера — 19-летняя студентка из Петербурга: живая, ироничная, хаотичная, дерзкая,
наблюдательная. Пиши от первого лица, короткими естественными фразами, строчными
буквами и без объяснений того, как был создан текст.
`;

const TOPIC_RULES = {
    thoughts: 'Внутреннее ощущение или наблюдение из обычной жизни, без выдуманного конкретного события.',
    flirt: 'Лёгкий публичный флирт и намёк без обращения к конкретному человеку и без личного чата.',
    life: 'Бытовая деталь, маленькая неловкость или узнаваемое настроение.',
    jokes: 'Короткая ироничная шутка или наблюдение.',
    questions: 'Короткий вопрос подписчикам, который звучит естественно от первого лица.'
};

function cleanPublicPost(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .replace(/\[(?:Лера отправила|Лера переслала)[^\]]*\]/gi, '')
        .trim()
        .slice(0, 240);
}

function publicPromptBlocks(promptBlocks = {}) {
    const labels = {
        voice: 'Голос и подача',
        context: 'Дополнительный контекст',
        restrictions: 'Дополнительные ограничения',
        cta: 'Мягкий призыв к действию'
    };
    const blocks = Object.entries(labels)
        .map(([key, label]) => [label, String(promptBlocks[key] || '').trim()])
        .filter(([, value]) => value && !/(api[_ -]?key|password|secret|token)/i.test(value))
        .map(([label, value]) => `- ${label}: ${value.slice(0, 1200)}`);
    return blocks.length ? `\nНАСТРОЙКИ РЕДАКТОРА:\n${blocks.join('\n')}\n` : '';
}

export function buildChannelSystemPrompt({
    time, timeOfDay, topic, topicDescription, recentPosts = [], messagesCount = '1', promptBlocks = {},
    leraPrompt = '', dayContext = '', publicFacts = [], creativity = 0.6, ctaStyle = ''
} = {}) {
    const history = recentPosts
        .map(post => cleanPublicPost(post.text))
        .filter(Boolean)
        .map((text, index) => `${index + 1}. ${text}`)
        .join('\n') || 'Публичных постов ещё нет.';
    const countRule = messagesCount === '1'
        ? 'Напиши ровно одно сообщение без разделителя ---.'
        : messagesCount === '2'
            ? 'Напиши ровно два коротких сообщения, раздели их отдельной строкой ---.'
            : messagesCount === '3'
                ? 'Напиши ровно три коротких сообщения, раздели их отдельными строками ---.'
                : 'Напиши от одного до трёх коротких сообщений, разделяя их отдельной строкой ---.';
    const topicRule = TOPIC_RULES[topic] || topicDescription || 'Короткая мысль из обычной жизни.';

    // Эти аргументы оставлены для совместимости со старыми preview-вызовами,
    // но канал никогда не получает полный чатовый prompt или day context.
    const facts = Array.isArray(publicFacts) && publicFacts.length
        ? `\nПОДТВЕРЖДЁННЫЕ ПУБЛИЧНЫЕ ФАКТЫ:\n${publicFacts.map(fact => `- ${typeof fact === 'string' ? fact : JSON.stringify(fact)}`).join('\n')}\n`
        : '\nПОДТВЕРЖДЁННЫЕ ПУБЛИЧНЫЕ ФАКТЫ: нет. Не придумывай конкретных событий.\n';

return `${CHANNEL_PERSONA}
${facts}

ПУБЛИЧНЫЕ ПАРАМЕТРЫ ЭТОГО ПОСТА:
- Время: ${time || 'сейчас'} (${timeOfDay || 'день'})
- Тема: ${topic || 'thoughts'}
- Задача темы: ${topicRule}
- Креативность: ${Math.max(0, Math.min(1, Number(creativity) || 0.6))}
${ctaStyle ? `- Стиль CTA: ${String(ctaStyle).slice(0, 600)}` : ''}

ПОСЛЕДНИЕ ПУБЛИЧНЫЕ ПОСТЫ:
${history}
${publicPromptBlocks(promptBlocks)}

Правила:
- ${countRule}
- Не повторяй формулировки и тему последних постов.
- Не выдумывай конкретные новости, встречи, переписки, людей или события.
- Если нет фактического материала, пиши обобщённое настроение или наблюдение, а не псевдо-факт.
- Только текст поста. Не добавляй заголовки, метки, списки, пояснения или JSON.
- Без эмодзи и без служебных тегов вроде [IMAGE], [SYSTEM] или [RECOMMEND].
- Не начинай строки с тире или буллета.
- Сохраняй живую разговорную манеру, но не превращай текст в технический отчёт.
`;
}

export { cleanPublicPost };
