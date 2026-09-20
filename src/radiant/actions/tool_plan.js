export const READ_ONLY_TOOLS = new Set([
    'search_archive_memory',
    'get_channel_posts',
    'weather',
    'spb_places',
    'web_search'
]);

export const TOOL_PLAN_NAMES = new Set([
    'search_archive_memory',
    'get_channel_posts',
    'weather',
    'spb_places',
    'web_search',
    'send_photo',
    'send_voice',
    'send_content',
    'schedule_reminder',
    'schedule_followup',
    'record_open_thread',
    'record_friend',
    'relay_message_to_friend',
    'set_reaction'
]);

export const TOOL_CATALOG = Object.freeze({
    search_archive_memory: { kind: 'READ', route: 'MEMORY', prefetchable: true, purpose: 'Прошлые факты, обещания и конкретные воспоминания пользователя.', triggers: ['что ты обо мне знаешь', 'что ты помнишь', 'ты говорила', 'ты обещала', 'мы обсуждали'] },
    get_channel_posts: { kind: 'READ', route: 'CHANNEL', prefetchable: true, purpose: 'Реальные опубликованные посты канала Леры.' },
    weather: { kind: 'READ', route: 'WEATHER', prefetchable: true, purpose: 'Актуальная погода для города или рекомендации.' },
    spb_places: { kind: 'READ', route: 'PLACES', prefetchable: true, purpose: 'Места и заведения на локальной карте Петербурга.' },
    web_search: { kind: 'READ', route: 'WEB', prefetchable: true, purpose: 'Свежие события, афиша, новости и расписания.' },
    send_photo: { kind: 'SIDE_EFFECT', route: 'MEDIA', prefetchable: false, purpose: 'Отправить реальную фотографию Леры.', triggers: ['скинь фото', 'дай фоточку', 'пришли селфи'] },
    send_voice: { kind: 'SIDE_EFFECT', route: 'MEDIA', prefetchable: false, purpose: 'Отправить голосовое сообщение Леры.' },
    send_content: { kind: 'SIDE_EFFECT', route: 'CONTENT', prefetchable: false, purpose: 'Отправить сохранённую ссылку, статью, трек, мем, видео или другой материал из закладок.', triggers: ['скинь трек', 'покажи мем', 'скинь ссылку', 'дай почитать', 'что за статья', 'скинь сайт'] },
    schedule_reminder: { kind: 'SIDE_EFFECT', route: 'REMINDER', prefetchable: false, purpose: 'Напомнить пользователю о его просьбе.', triggers: ['напомни', 'пни', 'через 10 минут'] },
    schedule_followup: { kind: 'SIDE_EFFECT', route: 'FOLLOWUP', prefetchable: false, purpose: 'Запланировать возвращение Леры по её обещанию.' },
    record_open_thread: { kind: 'SIDE_EFFECT', route: 'MEMORY_WRITE', prefetchable: false, purpose: 'Записать обещание пользователя.' },
    record_friend: { kind: 'SIDE_EFFECT', route: 'SOCIAL_WRITE', prefetchable: false, purpose: 'Записать друга или знакомого.' },
    relay_message_to_friend: { kind: 'SIDE_EFFECT', route: 'SOCIAL_SEND', prefetchable: false, purpose: 'Передать сообщение другому человеку.' },
    set_reaction: { kind: 'SIDE_EFFECT', route: 'REACTION', prefetchable: false, purpose: 'Поставить Telegram-реакцию.' }
});

const PROMISE_PATTERNS = [
    { name: 'send_photo', pattern: /(?:(?:скину|пришлю|отправлю|покажу|кину).{0,50}(?:фот|селфи|фоточку)|(?:фот|селфи|фоточку).{0,50}(?:скину|пришлю|отправлю|покажу|кину))/iu },
    { name: 'send_voice', pattern: /(?:(?:скину|запишу|пришлю|скажу|кину).{0,50}(?:войс|голос|гс)|(?:войс|голос|гс).{0,50}(?:скину|запишу|пришлю|скажу|кину))/iu },
    { name: 'send_content', pattern: /(?:(?:скину|пришлю|покажу|отправлю|кину).{0,50}(?:трек|мем|видос|материал|видео|ссылк\w*|стать\w*|сайт|почитать|линк)|(?:трек|мем|видос|материал|видео|ссылк\w*|стать\w*|сайт|линк).{0,50}(?:скину|пришлю|покажу|отправлю|кину))/iu },
    { name: 'schedule_followup', pattern: /(?:напишу|вернусь|отпишусь|напомню|скину потом|зайду позже)/iu }
];

export function detectPendingPromises(history = [], toolEvents = []) {
    const lastAssistant = [...history].reverse().find(item => item?.role === 'assistant' || item?.role === 'lera');
    if (!lastAssistant?.content) return [];
    const promise = PROMISE_PATTERNS.find(item => item.pattern.test(String(lastAssistant.content)));
    if (!promise) return [];
    const expectedTypes = {
        send_photo: ['PHOTO'],
        send_voice: ['VOICE'],
        send_content: ['CONTENT'],
        schedule_followup: ['FOLLOWUP', 'INITIATIVE']
    }[promise.name] || [];
    const fulfilled = toolEvents.some(event => {
        const type = String(event?.event_type || event?.metadata?.tool_name || '').toUpperCase();
        return expectedTypes.some(expected => type.includes(expected));
    });
    if (fulfilled) return [];
    return [{
        tool: promise.name,
        source: 'PREVIOUS_PROMISE',
        promiseText: String(lastAssistant.content).slice(0, 500),
        status: 'UNFULFILLED'
    }];
}

export function buildToolArgs(name, userText = '') {
    const query = String(userText || '').trim().slice(0, 1000);
    if (name === 'search_archive_memory' || name === 'get_channel_posts' || name === 'spb_places' || name === 'web_search') {
        return { query };
    }
    if (name === 'weather') return {};
    if (name === 'schedule_reminder') {
        const text = String(userText || '').trim();
        const unitFirst = text.match(/(секунд\w*|минут\w*|час\w*)\s+через\s+(\d+)/iu);
        const unitAfter = text.match(/через\s+(\d+)\s*(секунд\w*|минут\w*|час\w*)/iu);
        const match = unitFirst || unitAfter;
        const args = { reminder_text: text };
        if (match) {
            const unit = String(unitFirst ? match[1] : match[2]).toLowerCase();
            const amount = Number(unitFirst ? match[2] : match[1]);
            const prefix = unitFirst
                ? new RegExp('^.*?' + match[1] + '\\s+через\\s+' + match[2] + '\\s*', 'iu')
                : new RegExp('^.*?через\\s+' + match[1] + '\\s*' + match[2] + '\\s*', 'iu');
            args.reminder_text = text.replace(prefix, '').trim() || text;
            if (unit.startsWith('секунд')) args.delay_seconds = amount;
            else if (unit.startsWith('час')) args.delay_minutes = amount * 60;
            else args.delay_minutes = amount;
        }
        return args;
    }
    return {};
}

export function normalizeToolPlan({ toolName = 'NONE', confidence = null, secondaryToolName = 'NONE', secondaryConfidence = null, multipleActions = false, needsClarification = false, userText = '', pendingPromise = null, promiseRecoveryConfidence = null } = {}) {
    const promiseTool = pendingPromise?.tool && TOOL_PLAN_NAMES.has(pendingPromise.tool) ? pendingPromise.tool : 'NONE';
    const primaryName = toolName === 'NONE' && promiseTool !== 'NONE' && Number(promiseRecoveryConfidence) >= 0.65 ? promiseTool : toolName;
    const primaryConfidence = primaryName === promiseTool && toolName === 'NONE' ? promiseRecoveryConfidence : confidence;
    const recoveringPromise = promiseTool !== 'NONE' && primaryName === promiseTool && toolName === 'NONE';
    const primaryText = recoveringPromise ? (pendingPromise.promiseText || userText) : userText;
    const promiseMatchesSelectedTool = promiseTool !== 'NONE' && primaryName === promiseTool && Number(promiseRecoveryConfidence) >= 0.9;
    const recoveringWithHighConfidence = promiseMatchesSelectedTool;
    const effectiveNeedsClarification = Boolean(needsClarification) && !recoveringWithHighConfidence;
    const candidates = [
        { name: primaryName, confidence: primaryConfidence, source: promiseMatchesSelectedTool ? 'PREVIOUS_PROMISE' : 'CURRENT_MESSAGE' },
        ...(multipleActions ? [{ name: secondaryToolName, confidence: secondaryConfidence }] : [])
    ];
    const tools = [];
    for (const candidate of candidates) {
        const name = TOOL_PLAN_NAMES.has(candidate.name) ? candidate.name : null;
        const score = Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : null;
        if (!name || name === 'NONE' || effectiveNeedsClarification || tools.some(tool => tool.name === name)) continue;
        const kind = READ_ONLY_TOOLS.has(name) ? 'READ' : 'SIDE_EFFECT';
        const minConfidence = kind === 'READ' ? 0.7 : (name === 'send_photo' ? 0.55 : 0.9);
        if (score !== null && score < minConfidence) continue;
        tools.push({ name, args: buildToolArgs(name, candidate.source === 'PREVIOUS_PROMISE' ? primaryText : userText), kind, confidence: score, source: candidate.source || 'CURRENT_MESSAGE' });
        if (tools.length >= 2) break;
    }
    const name = tools[0]?.name || null;
    const kind = tools.length > 1 ? 'MULTI' : (tools[0]?.kind || 'NONE');
    const accepted = tools.length > 0;
    return {
        needed: accepted,
        name,
        args: tools[0]?.args || {},
        kind,
        confidence: tools[0]?.confidence ?? null,
        needsClarification: effectiveNeedsClarification,
        tools,
        allowedToolNames: tools.map(tool => tool.name)
    };
}

export function filterToolSchemas(schemas = [], toolPlan = null) {
    if (!toolPlan) return schemas;
    if (!toolPlan.needed) return [];
    const sideEffectNames = (toolPlan.tools || []).filter(tool => tool.kind === 'SIDE_EFFECT').map(tool => tool.name);
    if (sideEffectNames.length === 0) return [];
    return schemas.filter(schema => sideEffectNames.includes(schema.name));
}
