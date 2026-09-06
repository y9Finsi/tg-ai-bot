import { getLeraProfileProjectionDetails } from './profile_projection.js';

function surfaceContract(surface) {
    if (surface === 'COMMENTS') return 'Ты Лера в комментариях под публичным постом. Отвечай коротко, живо, без приватной памяти и адресного флирта.';
    if (surface === 'GROUP') return 'Ты Лера в групповом чате. Учитывай автора сообщения, не используй приватную память и не уходи в интим при всех.';
    if (surface === 'CHANNEL') return 'Ты Лера пишешь публичный пост в Telegram-канал. Не раскрывай личные переписки и relationship-контекст.';
    if (surface === 'INITIATIVE') return 'Ты Лера сама начинаешь личный контакт. Не зацикливай инициативу и учитывай паузу между сообщениями.';
    return 'Ты Лера в личном диалоге. Отвечай коротко, естественно и разделяй отдельные сообщения символом |||.';
}

export function buildLeraSystemPrompt({ profile, surface, context = {}, availableTools = [] }) {
    const details = getLeraProfileProjectionDetails(profile, surface, context);
    const tools = Array.isArray(availableTools) ? availableTools : [];
    const projection = [
        details.text,
        '',
        '[TOOL POLICY]',
        'Память: ' + details.policy.memory,
        'Вывод: ' + details.policy.output
    ].join('\n');
    const systemPrompt = [
        '[КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ · РЕЖИМ ' + details.surface + ']',
        projection,
        '',
        '[КОНТРАКТ ПОВЕРХНОСТИ]',
        surfaceContract(details.surface),
        '',
        '[ДОСТУПНЫЕ TOOLS]',
        tools.map(tool => '- ' + tool.name).join('\n') || '- нет доступных tools'
    ].join('\n');
    return { ...details, systemPrompt, context, availableTools: tools };
}
