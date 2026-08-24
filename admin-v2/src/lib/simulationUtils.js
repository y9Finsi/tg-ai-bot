import { Utensils, Zap, Sparkles, Droplets, CircleAlert, Flame, Heart, BatteryCharging, HeartPulse, MapPin, Wallet, Calendar } from 'lucide-react';

export const TASK_NAMES = {
    SLEEP_NIGHT: 'Ночной сон',
    SLEEP_EXHAUSTED: 'Аварийный сон',
    EAT_BREAKFAST: 'Завтрак',
    EAT_LUNCH: 'Обед',
    EAT_DINNER: 'Ужин',
    EMERGENCY_EAT: 'Аварийная еда',
    EAT_FOOD_HOME: 'Еда дома',
    BUY_FOOD_STORE: 'Покупка еды',
    WORK_LAPTOP: 'Работа',
    TRAVEL: 'Дорога',
    SOCIAL_NASTYA: 'Встреча с Настей',
    LEISURE_HOME: 'Отдых дома',
    IDLE_HOME_REST: 'Пауза дома',
    GO_TO_BATHROOM: 'Туалет',
    SHOWER_HOME: 'Душ',
    PREPARE_FOR_OUTING: 'Сборы'
};

export const EVENT_NAMES = {
    TASK_COMPLETED: 'Задача завершена',
    ROOT_TASK_COMPLETED: 'Цепочка завершена',
    INTERRUPT_ACCEPTED: 'Прерывание',
    RANDOM_EVENT: 'Случайное событие',
    WORK_REQUEST_CREATED: 'Макс прислал работу',
    SOCIAL_MEETING_PROPOSED: 'Настя предложила встречу',
    COMMITMENT_MISSED: 'План пропущен'
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
    bar_rubinsteina: 'бар на Рубинштейна'
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
    return TASK_NAMES[value] || String(value || 'Событие').replaceAll('_', ' ').toLowerCase();
}

export function eventName(value) {
    return EVENT_NAMES[value] || String(value || 'Событие').replaceAll('_', ' ').toLowerCase();
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
    const raw = String(row.source || row.created_by || row.createdBy || '');
    if (raw === 'GOAP' || raw === 'GOAP_PLANNER') return 'План действий';
    if (raw === 'UTILITY_SELECTOR') return 'План дня';
    if (raw === 'DAILY_ROUTINE') return 'Распорядок';
    if (raw.startsWith('NEEDS_')) return 'Потребность';
    if (row.kind === 'forecast') return 'План дня';
    if (row.kind === 'commitment') return 'Обязательство';
    return row.source || 'Факт';
}

export function formatReason(reason) {
    if (!reason) return '';
    const text = String(reason);
    if (text.includes('MAX_DEADLINE_MISSED')) return 'срочный дедлайн';
    if (text.includes('WORK_DEADLINE')) return 'рабочая задача';
    if (text.includes('WORK_REQUEST_CREATED')) return 'запрос по работе';
    if (text.includes('SOCIAL_MEETING_PROPOSED')) return 'предложение встречи';
    if (text.includes('hygiene utility')) return 'гигиена';
    if (text.includes('food utility')) return 'приём пищи';
    if (text.includes('private relief utility')) return 'личный отдых';
    if (text.includes('boredom utility')) return 'досуг';
    if (text.includes('bladder utility')) return 'туалет';
    if (text.includes('sleep utility')) return 'отдых и сон';
    if (text.includes('idle fallback')) return 'свободное время';
    if (text.includes('commitment:')) return text.replace('commitment:', 'по обязательству:').trim();
    if (text.includes('routine:')) return text.replace('routine:', 'по расписанию:').trim();
    return text.replaceAll('_', ' ').toLowerCase();
}

export function formatCancelReason(row, staleForecast) {
    if (row.cancelReason) {
        const r = String(row.cancelReason);
        if (r === 'MAX_DEADLINE_MISSED') return 'Лера не успела выполнить до дедлайна';
        if (r === 'TIME_WINDOW_PASSED') return 'Время для задачи прошло';
        if (r === 'DUPLICATE_ACTIVE_ROOT') return 'Заменена более актуальной задачей';
        return r;
    }
    if (staleForecast) return 'План изменился: не успела сделать в отведённое время';
    return 'задача больше не актуальна';
}

export function formatDecisionReason(item, taskType) {
    if (taskType === 'SLEEP_EXHAUSTED') return 'Экстренное восстановление сил: критическая усталость (100/100).';
    if (taskType === 'SHOWER_HOME') return 'Гигиеническая процедура: необходимо принять душ.';
    if (taskType === 'EMERGENCY_EAT') return 'Аварийная еда: критический уровень голода.';
    if (!item) return 'Режим дня, потребности и текущий статус планов.';
    if (item.category === 'UTILITY_SELECTOR') return item.explanation || 'Выбрано движком по приоритету потребностей.';
    if (item.category === 'DAILY_ROUTINE') return item.explanation || 'Плановый шаг по расписанию дня.';
    if (item.category === 'GOAP_PLANNER') return item.explanation || 'Шаг цепочки выполнения цели.';
    if (item.category === 'INTERRUPT') return item.explanation || 'Экстренное прерывание по физиологии.';
    return item.explanation && !item.explanation.includes('TASK_ADVANCE_SKIPPED') ? item.explanation : 'Режим дня и текущие потребности.';
}

export function getCycleMeta(cycleDay) {
    const day = Math.max(1, Math.min(28, Math.round(Number(cycleDay || 3))));
    if (day <= 5) return { day, phase: 'Менструация', hint: 'Спад энергии · Требуется покой', tone: 'red' };
    if (day <= 11) return { day, phase: 'Фолликулярная фаза', hint: 'Подъём сил и активности', tone: 'green' };
    if (day <= 14) return { day, phase: 'Овуляция', hint: 'Пик гормонов и влечения (+2%/тик)', tone: 'purple' };
    if (day <= 22) return { day, phase: 'Лютеиновая фаза', hint: 'Устойчивое состояние', tone: 'neutral' };
    return { day, phase: 'ПМС', hint: 'Эмоциональная чувствительность', tone: 'yellow' };
}

export function needStatus(key, value) {
    const num = Number(value || 0);
    if (key === 'hygiene') {
        if (num <= 30) return { label: 'Срочно нужен душ', valueText: `${num}/100`, tone: 'red' };
        if (num <= 60) return { label: 'Умеренная свежесть', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Чистая и свежая', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'fatigue') {
        if (num >= 80) return { label: 'Критический сон', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Заметная усталость', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Полна сил', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'hunger') {
        if (num >= 80) return { label: 'Сильный голод', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Пора перекусить', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Сыта', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'boredom') {
        if (num >= 80) return { label: 'Сильная скука', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Нужен новый стимул', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Увлечена', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'bladder') {
        if (num >= 80) return { label: 'Срочно в туалет', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Есть потребность', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Комфортно', valueText: `${num}/100`, tone: 'green' };
    }
    if (key === 'horny') {
        if (num >= 80) return { label: 'Высокое напряжение', valueText: `${num}/100`, tone: 'red' };
        if (num >= 50) return { label: 'Заметный импульс', valueText: `${num}/100`, tone: 'yellow' };
        return { label: 'Спокойно', valueText: `${num}/100`, tone: 'green' };
    }
    return { label: `${num}/100`, valueText: `${num}/100`, tone: 'neutral' };
}
