export const SPB_LOCATIONS = [
    {
        id: 'petrogradka_home',
        name: 'Квартира на Петроградке',
        shortName: 'Дом',
        district: 'Петроградская сторона',
        icon: '🏠',
        lat: 59.9589,
        lng: 30.3049,
        description: 'Уютная съёмная квартира, ноутбук, гардероб и отдых.'
    },
    {
        id: 'cafe_sloy',
        name: 'Кофейня «Слой»',
        shortName: 'Кафе «Слой»',
        district: 'Петроградская сторона',
        icon: '☕',
        lat: 59.9612,
        lng: 30.3121,
        description: 'Любимый кофе, миндальные круассаны и встречи с Настей.'
    },
    {
        id: 'vkusvill_lenina',
        name: 'ВкусВилл на Ленина',
        shortName: 'ВкусВилл',
        district: 'Большая Пушкарская',
        icon: '🛒',
        lat: 59.9563,
        lng: 30.2986,
        description: 'Продукты, готовая еда и перекусы на скорую руку.'
    },
    {
        id: 'showroom_work',
        name: 'Шоурум Макса (ВО)',
        shortName: 'Шоурум',
        district: 'Васильевский остров',
        icon: '👗',
        lat: 59.9386,
        lng: 30.2731,
        description: 'Шоурум одежды на ВО, съёмки контента и рабочие смены.'
    },
    {
        id: 'bar_rubinsteina',
        name: 'Бар на Рубинштейна',
        shortName: 'Бар',
        district: 'Центральный район',
        icon: '🍸',
        lat: 59.9294,
        lng: 30.3437,
        description: 'Коктейли, вечерняя тусовка и общение с друзьями.'
    },
    {
        id: 'spbgik',
        name: 'СПбГИК (Институт культуры)',
        shortName: 'СПбГИК',
        district: 'Дворцовая набережная',
        icon: '🎓',
        lat: 59.9427,
        lng: 30.3197,
        description: '2 курс кафедры медиа, лекции и студенческие пары.'
    }
];

export const LOCATION_MAP = Object.fromEntries(SPB_LOCATIONS.map(l => [l.id, l]));

export const NEEDS_CONFIG = [
    {
        id: 'hunger',
        label: 'Голод',
        unit: '%',
        inverted: false,
        warningThreshold: 65,
        criticalThreshold: 85,
        description: '0 — сыта, 100 — сильный голод. При >85% бросает дела и ищет еду.'
    },
    {
        id: 'fatigue',
        label: 'Усталость',
        unit: '%',
        inverted: false,
        warningThreshold: 70,
        criticalThreshold: 90,
        description: '0 — бодра, 100 — истощение. При >90% ложится спать.'
    },
    {
        id: 'boredom',
        label: 'Скука',
        unit: '%',
        inverted: false,
        warningThreshold: 60,
        criticalThreshold: 80,
        description: '0 — увлечена, 100 — тоска. При >60% ищет диалога и постит в канал.'
    },
    {
        id: 'hygiene',
        label: 'Свежесть',
        unit: '%',
        inverted: true, // 100 is great, < 30 is bad
        warningThreshold: 40,
        criticalThreshold: 20,
        description: '100 — чистая, <25% — срочно уходит в душ.'
    },
    {
        id: 'bladder',
        label: 'Туалет',
        unit: '%',
        inverted: false,
        warningThreshold: 70,
        criticalThreshold: 85,
        description: '0 — комфорт, >75% — экстренное прерывание в санузел.'
    },
    {
        id: 'horny',
        label: 'Влечение',
        unit: '%',
        inverted: false,
        warningThreshold: 60,
        criticalThreshold: 80,
        description: '0 — нейтрально, >65% — флирт, кокетство и романтический вайб.'
    }
];

export function getCycleInfo(cycleDay = 3) {
    const day = Number(cycleDay) || 1;
    if (day >= 1 && day <= 5) {
        return { phase: 'Менструация / ПМС', badge: 'ПМС', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', note: 'Чувствительное настроение, нужен покой и шоколад.' };
    }
    if (day >= 6 && day <= 11) {
        return { phase: 'Фолликулярная фаза', badge: 'Фолликулярная', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', note: 'Прилив энергии, творческий подъем, учеба.' };
    }
    if (day >= 12 && day <= 16) {
        return { phase: 'Овуляция (Пик)', badge: 'Овуляция', color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20', note: 'Максимум либидо, флирт, харизма, яркий вайб.' };
    }
    return { phase: 'Лютеиновая фаза', badge: 'Лютеиновая', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', note: 'Спокойный размеренный ритм, рутина.' };
}

export function formatTaskType(type) {
    if (!type) return 'Задача';
    const dict = {
        'EAT': 'Прием пищи / перекус',
        'SLEEP': 'Сон и восстановление',
        'REST': 'Отдых дома',
        'STUDY': 'Пары в СПбГИК',
        'WORK_SHOWROOM': 'Работа в шоуруме',
        'COFFEE_SLOY': 'Кофе в «Слое»',
        'HANG_NASTYA': 'Встреча с Настей',
        'BAR_EVENING': 'Вечер в баре',
        'SHOWER': 'Душ и уход',
        'TRAVEL': 'Дорога / Транзит',
        'CHANNEL_POST': 'Постинг в канал',
        'GROCERY_SHOP': 'Покупка продуктов'
    };
    return dict[type] || type.replace(/_/g, ' ');
}
