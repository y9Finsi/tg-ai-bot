import { Utensils, Zap, Sparkles, Droplets, CircleAlert, Flame, Heart, BatteryCharging, HeartPulse, MapPin, Wallet, Calendar } from 'lucide-react';

export const TASK_NAMES = {
    SLEEP_NIGHT: 'Ночной сон',
    SLEEP_EXHAUSTED: 'Сон (восстановление сил)',
    EMERGENCY_SLEEP: 'Сон (восстановление сил)',
    EAT_BREAKFAST: 'Завтрак',
    EAT_LUNCH: 'Обед',
    EAT_DINNER: 'Ужин',
    EMERGENCY_EAT: 'Перекус',
    EAT_FOOD_HOME: 'Обед дома',
    BUY_FOOD_STORE: 'Покупка еды',
    BUY_GROCERIES: 'Покупка продуктов в магазине',
    WORK_LAPTOP: 'Работа за ноутбуком',
    WORK_SHOWROOM: 'Работа в шоуруме',
    STUDY_SPBGIK: 'Учёба в СПбГИК',
    TRAVEL: 'Дорога / Транзит',
    TRANSIT: 'В пути',
    SOCIAL_NASTYA: 'Встреча с Настей',
    ASK_NASTYA_FOR_FOOD: 'Попросить еду у Насти',
    DESPERATE_EAT_TAP_WATER: 'Попить воды',
    LEISURE_HOME: 'Отдых дома',
    IDLE_HOME_REST: 'Отдых дома',
    GO_TO_BATHROOM: 'Санузел',
    TOILET: 'Санузел',
    SHOWER_HOME: 'Душ',
    PREPARE_FOR_OUTING: 'Сборы',
    WALK_PETROGRADKA: 'Прогулка по Петроградке',
    COFFEE_PAUSE: 'Кофе-брейк в кафе',
    READ_BOOK: 'Чтение книги',
    CHAT_PHONE: 'Разговор по телефону',
    SHOPPING_SHOWROOM: 'Шопинг в шоуруме',
    MEETING_FRIENDS: 'Встреча с друзьями',
    DINNER_OUT: 'Ужин в кафе',
    BAR_EVENING: 'Вечер в баре',
    BAR_RUBINSTEINA: 'Вечер в баре на Рубинштейна',
    EVENING_REST: 'Вечерний отдых',
    WAKE_UP: 'Подъём',
    MORNING_ROUTINE: 'Утренняя рутина',
    TIKTOK_SCROLL: 'Скроллинг соцсетей',
    MEMES_SCROLL: 'Мемы и соцсети'
};

export const EVENT_NAMES = {
    TASK_COMPLETED: 'Завершено',
    ROOT_TASK_COMPLETED: 'Выполнено',
    INTERRUPT_ACCEPTED: 'Прерывание',
    RANDOM_EVENT: 'Событие дня',
    WORK_REQUEST_CREATED: 'Заказ от Макса',
    SOCIAL_MEETING_PROPOSED: 'Встреча с Настей',
    COMMITMENT_MISSED: 'Пропущено'
};

export const WEEKDAY_NAMES = [
    'воскресенье',
    'понедельник',
    'вторник',
    'среда',
    'четверг',
    'пятница',
    'суббота'
];

export const LOCATION_NAMES = {
    petrogradka_home: 'дом на Петроградке',
    showroom_work: 'шоурум',
    cafe_sloy: 'кафе «Слой»',
    vkusvill_lenina: 'ВкусВилл на Ленина',
    bar_rubinsteina: 'бар на Рубинштейна',
    spbgik: 'СПбГИК'
};

export const NEED_LABELS = {
    hunger: ['Голод', '0 — сыта, 100 — необходим приём пищи', 'голод', Utensils],
    fatigue: ['Усталость', '0 — полна сил, 100 — необходим сон', 'усталость', Zap],
    boredom: ['Скука', '0 — увлечена, 100 — нужен досуг', 'скука', Sparkles],
    hygiene: ['Свежесть', '100 — чистая, 0 — требуется душ', 'гигиена', Droplets],
    bladder: ['Туалет', '0 — комфортно, 100 — срочно в туалет', 'туалет', CircleAlert],
    horny: ['Влечение', '0 — спокойствие, 100 — романтический импульс', 'личное напряжение', Flame]
};

export function taskName(value) {
    if (!value) return 'Активность';
    if (typeof value === 'object') {
        value = value.taskType || value.task_type || value.payload?.taskType || value.title || value.type || value.label || value.name;
    }
    const clean = String(value).replace(/^Завершено:\s*/, '').trim();
    if (TASK_NAMES[clean]) return TASK_NAMES[clean];
    
    // Check uppercase/normalized key
    const upperKey = clean.toUpperCase().replace(/\s+/g, '_');
    if (TASK_NAMES[upperKey]) return TASK_NAMES[upperKey];

    // English phrases matchers
    const lower = clean.toLowerCase();
    if (lower.includes('ask nastya') || lower.includes('ask_nastya')) return 'Попросить еду у Насти';
    if (lower.includes('tap water') || lower.includes('desperate')) return 'Попить воды';
    if (lower.includes('sleep') && (lower.includes('exhaust') || lower.includes('emergency'))) return 'Сон (восстановление сил)';
    if (lower.includes('sleep')) return 'Ночной сон';
    if (lower.includes('work') && lower.includes('laptop')) return 'Работа за ноутбуком';
    if (lower.includes('work') && lower.includes('showroom')) return 'Работа в шоуруме';
    if (lower.includes('study') || lower.includes('spbgik')) return 'Учёба в СПбГИК';
    if (lower.includes('toilet') || lower.includes('bathroom')) return 'Санузел';
    if (lower.includes('leisure') || lower.includes('rest')) return 'Отдых дома';
    if (lower.includes('food') || lower.includes('eat')) return 'Приём пищи';
    if (lower.includes('coffee')) return 'Кофе-брейк';
    if (lower.includes('shower')) return 'Душ';

    const words = clean.replaceAll('_', ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function eventName(event) {
    if (!event) return 'Событие';
    if (typeof event === 'object') {
        const taskType = event.taskType || event.task_type || event.payload?.taskType;
        if (taskType) return taskName(taskType);
        if (event.label) return String(event.label).replace(/^Завершено:\s*/, '');
        if (event.type && EVENT_NAMES[event.type]) return EVENT_NAMES[event.type];
        return taskName(event.type || event.event || 'Событие');
    }
    if (EVENT_NAMES[event]) return EVENT_NAMES[event];
    if (TASK_NAMES[event]) return TASK_NAMES[event];
    return taskName(event);
}

export function formatLocation(loc) {
    if (!loc) return '';
    return LOCATION_NAMES[loc] || String(loc).replaceAll('_', ' ');
}

export function rowTaskType(row) {
    return row?.taskType || row?.task_type || row?.payload?.taskType;
}

export function itemMeta(item, catalog = []) {
    const catalogItem = catalog.find(entry => entry.id === item.item_id);
    return {
        ...item,
        name: catalogItem?.name || String(item.item_id || 'Предмет').replaceAll('_', ' '),
        properties: { ...(catalogItem?.properties || {}), ...(item.properties || {}) }
    };
}

export function itemEffects(item) {
    const props = item.properties || {};
    const values = [];
    if (props.hunger_restore) values.push(`сытость +${props.hunger_restore}`);
    if (props.mood_boost) values.push(`настроение +${props.mood_boost}`);
    if (props.rain_resist) values.push('защита от дождя');
    if (props.warmth) values.push(`тепло +${props.warmth}`);
    if (item.item_type === 'toy') values.push('игровой эффект пока не подключён');
    return values.length ? values.join(' · ') : 'эффект не указан';
}

export function taskSource(row) {
    if (row.invitation) return 'Приглашение';
    if (row.sourceLabel) return row.sourceLabel;
    const raw = String(row.source || row.created_by || row.createdBy || row.type || '');
    if (raw === 'GOAP' || raw === 'GOAP_PLANNER') return 'План';
    if (raw === 'UTILITY_SELECTOR') return 'План';
    if (raw === 'DAILY_ROUTINE' || raw === 'ROUTINE') return 'Расписание';
    if (raw.startsWith('NEEDS_') || raw === 'NEEDS') return 'Потребность';
    if (raw === 'TASK_COMPLETED' || raw === 'ROOT_TASK_COMPLETED') return 'Выполнено';
    if (row.kind === 'forecast' || row.status === 'FORECAST') return 'План';
    if (row.kind === 'commitment') return 'Обязательство';
    return 'План';
}

export function formatReason(reason) {
    if (!reason) return '';
    const text = String(reason);
    if (text.includes('MAX_DEADLINE_MISSED')) return 'дедлайн по работе';
    if (text.includes('WORK_DEADLINE')) return 'рабочая задача';
    if (text.includes('WORK_REQUEST_CREATED')) return 'запрос от Макса';
    if (text.includes('SOCIAL_MEETING_PROPOSED')) return 'встреча с Настей';
    if (text.includes('hygiene utility') || text.includes('hygiene')) return 'гигиена';
    if (text.includes('food utility') || text.includes('food')) return 'голод';
    if (text.includes('private relief utility')) return 'личный отдых';
    if (text.includes('boredom utility') || text.includes('boredom') || text.includes('leisure utility')) return 'досуг';
    if (text.includes('bladder utility') || text.includes('bladder')) return 'санузел';
    if (text.includes('sleep utility') || text.includes('sleep')) return 'усталость';
    if (text.includes('idle fallback')) return 'свободное время';
    if (text.includes('commitment:')) return text.replace('commitment:', 'обязательство:').trim();
    if (text.includes('routine:')) return text.replace('routine:', 'по расписанию:').trim();
    return text.replaceAll('_', ' ').toLowerCase();
}

export function formatCancelReason(row, staleForecast) {
    if (row.cancelReason) {
        const r = String(row.cancelReason);
        if (r === 'MAX_DEADLINE_MISSED') return 'Лера не успела выполнить до дедлайна';
        if (r === 'TIME_WINDOW_PASSED') return 'Окно времени прошло';
        if (r === 'INTERRUPTED') return 'Прервано более срочной задачей';
        return formatReason(r);
    }
    if (row.overdue || staleForecast) {
        return 'Время задачи истекло';
    }
    return 'Отменено по ходу дня';
}

export function formatDecisionReason(decision, taskType) {
    if (!decision) return '';
    if (decision.reason) return formatReason(decision.reason);
    if (decision.justification) return decision.justification;
    if (taskType === 'IDLE_HOME_REST') return 'Лера дома на Петроградке, отдых.';
    return '';
}

export function getCycleMeta(cycleDay = 3) {
    const day = Math.max(1, Math.min(28, Number(cycleDay) || 3));
    if (day >= 1 && day <= 5) return { phase: 'Менструация', day, tone: 'red', desc: 'Упадок сил, тяга к теплу, нужен покой.' };
    if (day >= 6 && day <= 11) return { phase: 'Фолликулярная', day, tone: 'blue', desc: 'Рост энергии, общительность, готовность к делам.' };
    if (day >= 12 && day <= 16) return { phase: 'Овуляция', day, tone: 'green', desc: 'Пик энергии и либидо, яркие эмоции, флирт.' };
    if (day >= 17 && day <= 24) return { phase: 'Лютеиновая', day, tone: 'yellow', desc: 'Постепенное снижение сил, уютные дела.' };
    return { phase: 'ПМС', day, tone: 'pink', desc: 'Чувствительность, перепады настроения, желание уюта.' };
}

export function needStatus(key, value) {
    const v = Number(value) || 0;
    if (key === 'hygiene') {
        if (v < 30) return { label: 'Требуется душ', tone: 'red' };
        if (v < 60) return { label: 'Умеренная свежесть', tone: 'yellow' };
        return { label: 'Свежая', tone: 'green' };
    }
    if (key === 'hunger') {
        if (v > 75) return { label: 'Сильный голод', tone: 'red' };
        if (v > 40) return { label: 'Пора перекусить', tone: 'yellow' };
        return { label: 'Сыта', tone: 'green' };
    }
    if (key === 'fatigue') {
        if (v > 80) return { label: 'Хочет спать', tone: 'red' };
        if (v > 45) return { label: 'Усталость', tone: 'yellow' };
        return { label: 'Полна сил', tone: 'green' };
    }
    if (key === 'boredom') {
        if (v > 70) return { label: 'Скучно', tone: 'red' };
        if (v > 40) return { label: 'Ищет занятие', tone: 'yellow' };
        return { label: 'Увлечена', tone: 'green' };
    }
    if (key === 'bladder') {
        if (v > 75) return { label: 'Срочно в туалет', tone: 'red' };
        if (v > 40) return { label: 'Есть потребность', tone: 'yellow' };
        return { label: 'В норме', tone: 'green' };
    }
    if (key === 'horny') {
        if (v > 75) return { label: 'Высокое напряжение', tone: 'red' };
        if (v > 40) return { label: 'Романтический настрой', tone: 'yellow' };
        return { label: 'Спокойствие', tone: 'green' };
    }
    return { label: 'В норме', tone: 'green' };
}
