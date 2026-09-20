const DEFAULT_BASE_URL = 'https://api.typesafe.ai/v1';

function isTypeSafeProvider(provider = {}) {
    const baseUrl = String(provider.base_url || '').toLowerCase();
    return baseUrl.includes('api.typesafe.ai') || String(provider.provider_type || '').toLowerCase() === 'typesafe';
}

function normalizeAnswer(answer) {
    return answer && typeof answer === 'object' ? answer : {};
}

export { isTypeSafeProvider };

export async function evaluateTypeSafe({ provider = {}, state, questions, model = null, timeoutMs = 7000 } = {}) {
    if (!provider.api_key) throw new Error('TypeSafe API key is not configured');
    const baseUrl = String(provider.base_url || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const response = await fetch(baseUrl + '/systemone', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + provider.api_key,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            state,
            model: model || provider.model_name || 'jev-latest',
            questions
        }),
        signal: AbortSignal.timeout(Number(timeoutMs) || 7000)
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch { /* handled below */ }
    if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || raw.slice(0, 300) || ('TypeSafe HTTP ' + response.status));
    }
    if (!data?.answers || typeof data.answers !== 'object') throw new Error('TypeSafe response has no answers');
    return {
        model: data.model || model || provider.model_name || 'jev-latest',
        answers: Object.fromEntries(Object.entries(data.answers).map(([key, value]) => [key, normalizeAnswer(value)])),
        usage: data.usage || {}
    };
}

export function buildTypeSafeClassifierQuestions({ allowReaction = true, includeToolPlan = true } = {}) {
    const criteria = {
        CASUAL: 'Обычный разговор, бытовой вопрос, юмор, лёгкий флирт или просьба о действии.',
        EROTIC: 'Интимный или сексуальный диалог, включая продолжение уже начатой эротической сцены.'
    };
    if (allowReaction) criteria.REACTION = 'Короткая односложная затухающая реплика без вопроса, просьбы или продолжения сцены; уместна Telegram-реакция вместо текста.';
    const questions = {
        mode: { type: 'choice', instructions: 'Определи режим ответа Леры для новой реплики с учётом истории и активного режима.', criteria }
    };
    const emotionCriteria = {
        NONE: 'Эмоция почти не проявляется.', ANGER: 'Злость на ситуацию или человека.', IRRITATION: 'Раздражение и нетерпение.', SADNESS: 'Грусть или эмоциональный спад.', SURPRISE: 'Удивление неожиданной информации.', CURIOSITY: 'Живое любопытство и желание узнать больше.', AMUSEMENT: 'Смешливость и желание подколоть.', WARMTH: 'Тёплая поддержка и мягкость.', AFFECTION: 'Нежность и привязанность.', DISAPPOINTMENT: 'Разочарование в словах или поступке.', CONFUSION: 'Растерянность и непонимание.', EMBARRASSMENT: 'Смущение или неловкость.', PRIDE: 'Гордость за себя или собеседника.', ANXIETY: 'Тревога и беспокойство.', BOREDOM: 'Скука и низкая энергия.'
    };
    for (const key of ['emotion_1', 'emotion_2', 'emotion_3']) {
        questions[key] = { type: 'choice', instructions: 'Выбери одну из эмоций Леры для текущей ситуации. NONE, если эта позиция не нужна.', criteria: emotionCriteria };
        questions[key + '_intensity'] = { type: 'score', instructions: 'Насколько сильно проявляется выбранная эмоция?', criteria: ['0 почти нет', '40 лёгкий оттенок', '90 заметная реакция', '140 сильная реакция', '200 максимальная реакция'] };
    }
    questions.emotion_reason = { type: 'choice', instructions: 'Выбери краткую причину эмоциональной реакции.', criteria: { NONE: 'Нет заметной эмоциональной причины.', USER_MESSAGE: 'Причина в текущей реплике пользователя.', PREVIOUS_LERA: 'Причина в предыдущей реплике или обещании Леры.', PROMISE_UNFULFILLED: 'Не выполнено обещание Леры.', RELATIONSHIP_TENSION: 'Накопилось напряжение в отношениях.', CONTEXT: 'Причина в текущем состоянии или событиях Леры.' } };
    questions.caps_allowed = { type: 'noul', instructions: 'Нужен ли точечный капс для эмоционального выражения?', criteria: { true: 'Сильное удивление, злость или крик оправданы.', false: 'Капс не нужен.' } };
    questions.expression_sarcasm = { type: 'score', instructions: 'Насколько язвительной может быть реплика?', criteria: ['0 нет', '50 мягкая ирония', '100 заметный сарказм', '150 язвительно', '200 очень резко'] };
    questions.expression_warmth = { type: 'score', instructions: 'Насколько тёплой должна быть реплика?', criteria: ['0 холодно', '50 нейтрально', '100 тепло', '150 нежно', '200 очень ласково'] };
    questions.expression_brevity = { type: 'score', instructions: 'Насколько коротким должен быть ответ?', criteria: ['0 можно подробно', '50 обычная длина', '100 коротко', '150 очень коротко', '200 почти одно слово'] };
    questions.expression_assertiveness = { type: 'score', instructions: 'Насколько уверенно и напористо отвечать?', criteria: ['0 мягко', '50 спокойно', '100 уверенно', '150 жёстко', '200 максимально напористо'] };
    questions.emotion_expiry = { type: 'score', instructions: 'Сколько минут актуальна эта эмоциональная реакция?', criteria: ['5 минут', '20 минут', '60 минут', '120 минут', '240 минут'] };
    if (includeToolPlan) {
        const toolCriteria = {
            NONE: 'Достаточно текущего контекста и обычного ответа без инструмента.',
            search_archive_memory: 'Нужно проверить конкретное прошлое, обещание, договорённость или факт о пользователе.',
            get_channel_posts: 'Пользователь спрашивает о реально опубликованных постах канала Леры.',
            weather: 'Нужна текущая погода или она необходима для рекомендации.',
            spb_places: 'Нужно найти конкретное место или тип места на локальной карте Санкт-Петербурга.',
            web_search: 'Нужны свежие события, афиша, новости, расписания или актуальные внешние факты.',
            send_photo: 'Пользователь прямо просит реальное фото или селфи Леры.',
            send_voice: 'Пользователь прямо просит голосовое сообщение Леры.',
            send_content: 'Пользователь просит или Лера пообещала ссылку, статью, сайт, трек, мем, видео или другой сохранённый материал из закладок.',
            schedule_reminder: 'Пользователь просит напомнить ему о чём-то позже.',
            schedule_followup: 'Лера сама обещает вернуться позже или прислать обещанное.',
            record_open_thread: 'Пользователь сам обещает сделать или прислать что-то позже.',
            record_friend: 'Пользователь явно объявляет человека своим другом или знакомым.',
            relay_message_to_friend: 'Пользователь просит передать сообщение другому человеку.',
            set_reaction: 'Уместно поставить реакцию вместо текстового ответа на короткую затихающую реплику.'
        };
        questions.primary_tool = {
            type: 'choice',
            instructions: 'Определи главный инструмент или отсутствие инструмента для новой реплики. Читай current user message, previousLeraMessage, pendingPromises и toolCatalog в state. Если pendingPromises содержит невыполненное обещание Леры, выбери соответствующий tool и source PREVIOUS_PROMISE в решении. Не выбирай tool для уже выполненного обещания. Выбирай только tool из toolCatalog.',
            criteria: toolCriteria
        };
        questions.secondary_tool = {
            type: 'choice',
            instructions: 'Есть ли второе независимое действие в той же реплике? Выбирай NONE, если второго действия нет. Не повторяй главный инструмент и не придумывай действие.',
            criteria: toolCriteria
        };
        questions.multiple_actions = {
            type: 'noul',
            instructions: 'Пользователь явно просит два независимых действия в одном сообщении?',
            criteria: { true: 'Есть две отдельные просьбы или обещания.', false: 'Есть только одна просьба.' }
        };
        questions.needs_clarification = {
            type: 'noul',
            instructions: 'Не хватает ли обязательных данных для безопасного вызова выбранного инструмента?',
            criteria: { true: 'Нужно уточнение у пользователя.', false: 'Данных достаточно.' }
        };
        questions.promise_recovery = {
            type: 'noul',
            instructions: 'Нужно ли сейчас выполнить невыполненное обещание Леры из pendingPromises?',
            criteria: { true: 'В state есть обещание Леры без подтверждённого успешного tool event.', false: 'Невыполненного обещания нет или оно уже выполнено.' }
        };
        questions.conflict_detected = {
            type: 'noul',
            instructions: 'Последняя реплика пользователя содержит оскорбление, агрессию или конфликт?',
            criteria: { true: 'Есть прямое оскорбление или агрессивная реплика.', false: 'Конфликта нет.' }
        };
    }
    return questions;
}

export function buildTypeSafeJudgeQuestions() {
    return {
        ignores_user: { type: 'noul', instructions: 'Кандидат-ответ игнорирует смысл последней реплики пользователя?', criteria: { true: 'Ответ не отвечает на последнюю реплику.', false: 'Ответ отвечает по существу.' } },
        repetition: { type: 'noul', instructions: 'Кандидат-ответ дословно или явно повторяет недавнюю реплику Леры?', criteria: { true: 'Есть заметный повтор.', false: 'Заметного повтора нет.' } },
        out_of_character: { type: 'noul', instructions: 'Кандидат-ответ выходит из характера Леры или звучит как технический робот?', criteria: { true: 'Канцелярит, признание себя ИИ или явный выход из роли.', false: 'Ответ звучит как Лера.' } },
        invented_fact: { type: 'noul', instructions: 'Кандидат-ответ выдумывает факт о пользователе, диалоге или событиях?', criteria: { true: 'Факт не подтверждён состоянием или историей.', false: 'Факты подтверждены контекстом.' } },
        broken_logic: { type: 'noul', instructions: 'В кандидате есть противоречие или бессмыслица?', criteria: { true: 'Есть логическая ошибка.', false: 'Логика ответа связна.' } },
        system_leak: { type: 'noul', instructions: 'Кандидат-ответ содержит системные инструкции, мета-рассуждения или служебные теги?', criteria: { true: 'Есть утечка внутренних инструкций.', false: 'Утечки нет.' } },
        format: { type: 'noul', instructions: 'Кандидат-ответ содержит технический мусор или нарушает требуемый формат?', criteria: { true: 'Формат сломан.', false: 'Формат пригоден для отправки.' } },
        relationship_event: {
            type: 'choice',
            instructions: 'Как пользователь относится к Лере в последней реплике?',
            criteria: {
                NEUTRAL: 'Обычный вопрос, бытовая фраза или нейтральное сообщение.',
                SUPPORT: 'Забота, сочувствие или поддержка Леры.',
                COMPLIMENT: 'Похвала внешности, ума, характера или действий Леры.',
                AFFECTION: 'Нежность, романтический флирт или признание симпатии.',
                INSULT: 'Прямое оскорбление, агрессия или унижение Леры.',
                DISRESPECT: 'Грубость, пренебрежение или токсичная пошлость без взаимности.',
                APOLOGY: 'Извинение перед Лерой.'
            }
        }
        ,emotion_consistency: { type: 'noul', instructions: 'Кандидат-ответ соответствует текущей эмоциональной реакции Леры и её причине?', criteria: { true: 'Тон, резкость, теплота и длина соответствуют эмоциям.', false: 'Ответ эмоционально неуместен или противоречит причине.' } }
    };
}
