const MOSCOW_TIME_ZONE = 'Europe/Moscow';
const MAX_FOLLOWUP_DELAY_MINUTES = 48 * 60;

const FUTURE_ACTION_RE = /(?<![\p{L}\p{N}_])(?:скину|напишу|расскажу|пришлю|вернусь|доеду|черкану|покажу)(?![\p{L}\p{N}_])/iu;
const RELATIVE_TIME_RE = /через\s+(?:\d+(?:[.,]\d+)?\s*(?:минут(?:у|ы)?|мин|час(?:а|ов)?|часик(?:а)?)|полчаса|часик(?:а)?|час)(?=[\s.,!?;:)]|$)/iu;
const CALENDAR_TIME_RE = /(?<![\p{L}\p{N}_])завтра(?:\s+(?:утром|днём|днем|вечером|ночью))?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])вечером(?![\p{L}\p{N}_])/iu;
const RECIPIENT_AND_FILLER_RE = /(?<![\p{L}\p{N}_])(?:я|мне|тебе|тебя|потом|позже|как-нибудь|когда-нибудь|давай|ща|сейчас|короче|ну)(?![\p{L}\p{N}_])/igu;
const TOPIC_FILLER_RE = /(?<![\p{L}\p{N}_])(?:блин|ок|ага|ладно|ахах|любой|любую|любое|какой-нибудь|какой нибудь)(?![\p{L}\p{N}_])/igu;
const TOPIC_STOPWORDS = new Set([
    'а', 'в', 'во', 'да', 'до', 'и', 'из', 'к', 'на', 'по', 'с', 'со', 'у', 'через',
    'что', 'это', 'там', 'тебе', 'тебя', 'я', 'мне', 'потом', 'позже', 'про',
    'что-нибудь', 'что нибудь', 'кое-что', 'кое что', 'блин', 'ок', 'ага', 'ладно', 'а'
]);

function getMoscowParts(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MOSCOW_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)]));
    return values;
}

function localWallTimeMs(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
}

function addLocalDays(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return {
        ...parts,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
    };
}

function delayToLocalTime(now, daysFromToday, hour, minute) {
    const current = getMoscowParts(now);
    const targetDate = addLocalDays(current, daysFromToday);
    const targetWallMs = Date.UTC(targetDate.year, targetDate.month - 1, targetDate.day, hour, minute, 0);
    const delayMs = targetWallMs - localWallTimeMs(current);
    return Math.max(1, Math.ceil(delayMs / 60000));
}

function parseDelayMinutes(text, now) {
    const relativeMatch = text.match(/через\s+(\d+(?:[.,]\d+)?)\s*(минут(?:у|ы)?|мин|час(?:а|ов)?|часик(?:а)?)/iu);
    if (relativeMatch) {
        const amount = Number(relativeMatch[1].replace(',', '.'));
        const isHour = relativeMatch[2].startsWith('час');
        const delayMinutes = Math.ceil(amount * (isHour ? 60 : 1));
        return delayMinutes >= 1 && delayMinutes <= MAX_FOLLOWUP_DELAY_MINUTES
            ? { delayMinutes, timeType: 'relative' }
            : null;
    }

    if (/через\s+полчаса(?=[\s.,!?;:)]|$)/iu.test(text)) {
        return { delayMinutes: 30, timeType: 'relative' };
    }
    if (/через\s+(?:часик(?:а)?|час)(?=[\s.,!?;:)]|$)/iu.test(text)) {
        return { delayMinutes: 60, timeType: 'relative' };
    }

    const isTomorrow = /(?<![\p{L}\p{N}_])завтра(?![\p{L}\p{N}_])/iu.test(text);
    const isEvening = /(?<![\p{L}\p{N}_])вечером(?![\p{L}\p{N}_])/iu.test(text);
    if (isTomorrow) {
        return {
            delayMinutes: delayToLocalTime(now, 1, isEvening ? 20 : 10, isEvening ? 30 : 30),
            timeType: isEvening ? 'tomorrow_evening' : 'tomorrow'
        };
    }
    if (isEvening) {
        const current = getMoscowParts(now);
        const todayTarget = Date.UTC(current.year, current.month - 1, current.day, 20, 30, 0);
        const currentWall = localWallTimeMs(current);
        return {
            delayMinutes: delayToLocalTime(now, todayTarget > currentWall ? 0 : 1, 20, 30),
            timeType: 'evening'
        };
    }

    return null;
}

function cleanTopic(text) {
    const topic = text
        .replace(RELATIVE_TIME_RE, ' ')
        .replace(CALENDAR_TIME_RE, ' ')
        .replace(FUTURE_ACTION_RE, ' ')
        .replace(RECIPIENT_AND_FILLER_RE, ' ')
        .replace(TOPIC_FILLER_RE, ' ')
        .replace(/[.,!?;:()[\]{}]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return topic;
}

function extractTopic(text) {
    const topic = cleanTopic(text);

    const contentWords = topic.split(/\s+/).filter(word => !TOPIC_STOPWORDS.has(word.toLowerCase()));
    if (contentWords.length === 0) return null;
    if (/^(?:что-нибудь|что нибудь|кое-что|кое что|там|это)$/iu.test(topic)) return null;
    return topic.slice(0, 240);
}

function extractTopicFromContext(contextText) {
    const lines = String(contextText || '')
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => /^(?:пользователь|user)\s*:/iu.test(line))
        .reverse();

    for (const line of lines) {
        const userLine = line.replace(/^(?:пользователь|user)\s*:/iu, '').trim();
        const requestMatch = userLine.match(/(?:скинь|пришли|покажи|расскажи|напиши)\s+(?:мне\s+)?(.{2,120})$/iu);
        if (!requestMatch) continue;
        const topic = cleanTopic(requestMatch[1]);
        const contentWords = topic.split(/\s+/).filter(word => !TOPIC_STOPWORDS.has(word.toLowerCase()));
        if (contentWords.length > 0 && !/^(?:что-нибудь|что нибудь|кое-что|кое что|там|это)$/iu.test(topic)) {
            return topic.slice(0, 240);
        }
    }

    return null;
}

export function parseFollowupPromise(rawText, now = new Date(), contextText = '') {
    const text = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!text || !FUTURE_ACTION_RE.test(text)) return null;

    const actionMatch = text.match(FUTURE_ACTION_RE);
    const beforeAction = actionMatch ? text.slice(0, actionMatch.index) : '';
    if (/(?:^|\s)не\s*$/iu.test(beforeAction.trim()) || /(?<![\p{L}\p{N}_])не\s+(?:буду\s+)?(?:скину|напишу|расскажу|пришлю|вернусь|доеду|черкану|покажу)(?![\p{L}\p{N}_])/iu.test(text)) {
        return null;
    }

    const timing = parseDelayMinutes(text, now);
    if (!timing || timing.delayMinutes > MAX_FOLLOWUP_DELAY_MINUTES) return null;

    const topic = extractTopic(text) || extractTopicFromContext(contextText);
    if (!topic) return null;

    const sendPhoto = /(?<![\p{L}\p{N}_])(?:фото|фотку|фотка|селфи|изображение|снимок|картинк(?:у|а))(?![\p{L}\p{N}_])/iu.test(text);
    return {
        delayMinutes: timing.delayMinutes,
        timeType: timing.timeType,
        topic,
        sendPhoto
    };
}

export { MAX_FOLLOWUP_DELAY_MINUTES };
