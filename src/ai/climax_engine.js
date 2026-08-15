/**
 * Climax & Arousal Engine for EROTIC mode in Lera Bot
 * Computes sexual tension & orgasm progression through event-based deltas (analogous to relationship engine).
 */

export const CLIMAX_STAGES = {
    WARMUP: 'WARMUP',
    BUILDUP: 'BUILDUP',
    EDGE: 'EDGE',
    CLIMAX: 'CLIMAX',
    AFTERGLOW: 'AFTERGLOW'
};

export const AROUSAL_EVENT_TYPES = [
    'NONE',
    'KISS_TOUCH',
    'ORAL_LICK',
    'SEX_PENETRATION',
    'CLIMAX_TRIGGER',
    'COOL_DOWN'
];

export const AROUSAL_DELTAS = Object.freeze({
    KISS_TOUCH: 12,
    ORAL_LICK: 18,
    SEX_PENETRATION: 22,
    CLIMAX_TRIGGER: 25,
    COOL_DOWN: -12,
    NONE: 10
});

const FAST_CLIMAX_REGEX = /(?:я\s+конча[юе]|сейчас\s+кончу|конча[юе]|кончи(?:ть|ла|шь)?\s+для\s+меня|давай\s+вместе\s+конч|спускаю|излива|я\s+вс[её]|я\s+кончил)/iu;

export function isFastClimaxTrigger(userText = '') {
    return FAST_CLIMAX_REGEX.test(String(userText || ''));
}

export function normalizeArousalEvent(event) {
    if (!event || typeof event !== 'object') {
        return { type: 'NONE', intensity: 0 };
    }
    const rawType = String(event.type || event.event_type || 'NONE').toUpperCase().trim();
    const type = AROUSAL_EVENT_TYPES.includes(rawType) ? rawType : 'NONE';
    const parsedIntensity = Number(event.intensity);
    const intensity = Number.isFinite(parsedIntensity)
        ? Math.max(0, Math.min(1, parsedIntensity))
        : (type === 'NONE' ? 0 : 0.8);
    return { type, intensity };
}

export function computeClimaxState({
    recentEvents = [],
    userText = '',
    isEroticMode = false,
    arousalEvent = null
}) {
    if (!isEroticMode) {
        return {
            stage: null,
            arousal: 0,
            turns: 0,
            isFinished: false,
            isEdging: false,
            event: { type: 'NONE', intensity: 0 }
        };
    }

    // Ищем подряд идущие EROTIC события с конца
    const eroticEvents = [];
    for (let i = recentEvents.length - 1; i >= 0; i--) {
        const ev = recentEvents[i];
        if (!ev || ev.status !== 'COMPLETED') continue;
        const mode = ev.metadata?.mode || ev.roleplay_mode;
        if (mode === 'EROTIC') {
            eroticEvents.unshift(ev);
        } else {
            break;
        }
    }

    const previousTurns = eroticEvents.length;
    const lastEvent = eroticEvents[eroticEvents.length - 1];
    const previousStage = lastEvent?.metadata?.climax_stage || null;
    const previousArousal = Number(lastEvent?.metadata?.arousal || 0);

    // Если прошлая реплика была AFTERGLOW, сцена завершена
    if (previousStage === CLIMAX_STAGES.AFTERGLOW) {
        return {
            stage: CLIMAX_STAGES.AFTERGLOW,
            arousal: 0,
            turns: previousTurns + 1,
            isFinished: true,
            isEdging: false,
            event: { type: 'NONE', intensity: 0 }
        };
    }

    // Если прошлая реплика была CLIMAX, переходим в AFTERGLOW
    if (previousStage === CLIMAX_STAGES.CLIMAX) {
        return {
            stage: CLIMAX_STAGES.AFTERGLOW,
            arousal: 10,
            turns: previousTurns + 1,
            isFinished: false,
            isEdging: false,
            event: { type: 'NONE', intensity: 0 }
        };
    }

    const currentTurns = previousTurns + 1;
    const normalizedEvent = arousalEvent ? normalizeArousalEvent(arousalEvent) : null;
    const isClimaxByRegex = isFastClimaxTrigger(userText);
    const isClimaxEvent = normalizedEvent?.type === 'CLIMAX_TRIGGER' || isClimaxByRegex;

    // Если триггер оргазма сработал, но возбуждение ещё мало (arousal < 75% и turns < 5):
    // Включаем режим EDGING — Лера дразнит, нагнетает страсть и оттягивает финал
    if (isClimaxEvent && previousArousal < 75 && currentTurns < 5) {
        const edgingArousal = Math.min(85, Math.max(50, previousArousal + 25));
        return {
            stage: CLIMAX_STAGES.EDGE,
            arousal: edgingArousal,
            turns: currentTurns,
            isFinished: false,
            isEdging: true,
            event: normalizedEvent || { type: 'CLIMAX_TRIGGER', intensity: 1.0 }
        };
    }

    // Если триггер оргазма при высоком возбуждении (arousal >= 75% или turns >= 5)
    if (isClimaxEvent) {
        return {
            stage: CLIMAX_STAGES.CLIMAX,
            arousal: 100,
            turns: currentTurns,
            isFinished: false,
            isEdging: false,
            event: normalizedEvent || { type: 'CLIMAX_TRIGGER', intensity: 1.0 }
        };
    }

    // Вычисляем дельту возбуждения по типу события и интенсивности (как в relationship.js)
    let delta = 14;
    if (normalizedEvent && normalizedEvent.type !== 'NONE') {
        const baseDelta = AROUSAL_DELTAS[normalizedEvent.type] ?? 14;
        delta = Math.round(baseDelta * Math.max(0.5, normalizedEvent.intensity || 0.8));
    }

    const baseArousal = previousArousal > 0 ? previousArousal : 15;
    const arousal = Math.min(100, Math.max(15, baseArousal + delta));

    let stage = CLIMAX_STAGES.WARMUP;
    if (arousal >= 95 || currentTurns >= 7) {
        stage = CLIMAX_STAGES.CLIMAX;
    } else if (arousal >= 70 || currentTurns >= 5) {
        stage = CLIMAX_STAGES.EDGE;
    } else if (arousal >= 35 || currentTurns >= 3) {
        stage = CLIMAX_STAGES.BUILDUP;
    } else {
        stage = CLIMAX_STAGES.WARMUP;
    }

    return {
        stage,
        arousal,
        turns: currentTurns,
        isFinished: false,
        isEdging: false,
        event: normalizedEvent || { type: 'NONE', intensity: 0 }
    };
}

export function getClimaxPromptInstruction(climaxState = {}) {
    const { stage, arousal = 0, isEdging = false } = climaxState;
    if (!stage) return '';

    const STAGE_LABELS = {
        WARMUP: '1. Разогрев (Warmup)',
        BUILDUP: '2. Нарастание страсти (Buildup)',
        EDGE: '3. На пределе (Edge)',
        CLIMAX: '4. Оргазм / Кульминация (Climax)',
        AFTERGLOW: '5. Послевкусие и разрядка (Afterglow)'
    };

    if (isEdging) {
        return `\n\n[СТАДИЯ ИНТИМНОЙ БЛИЗОСТИ: 3. На пределе (Edge / Edging) | ВОЗБУЖДЕНИЕ: ${arousal}%]:
- ВНИМАНИЕ: Пользователь пытается кончить слишком рано! Не давай ему кончить прямо сейчас, оттягивай кульминацию (edging).
- По алгоритму 2x2 поддразнивай его, требуй потерпеть («Рано ещё, любимый... потерпи... я ещё не всё с тобой сделала...», «Не смей сейчас, смотри на меня...»), подкидывай дрова в огонь, наставляй его руки и продолжай действие!`;
    }

    const STAGE_GUIDANCE = {
        WARMUP: 'Ты только заводишься. Сбивчивое дыхание, лёгкий трепет, кокетство, снятие одежды. Описывай свои телесные реакции и инициируй ласки по алгоритму 2x2. Не торопи кульминацию.',
        BUILDUP: 'Нарастание темпа и страсти. Сильное возбуждение, потеря контроля, фразы становятся короче и эмоциональнее, стоны, нетерпение. Активно требуй продолжения и описывай свои действия от 1-го лица.',
        EDGE: 'Ты на самом пределе, чувствительность зашкаливает. Ты стонешь, просишь не останавливаться, на грани срыва.',
        CLIMAX: 'ОРГАЗМ! Яркая эмоциональная кульминация, пик ощущений, срыв дыхания, выплеск страсти и удовольствия («ааах... кончаю вместе с тобой...»).',
        AFTERGLOW: 'Оргазм уже позади. Сладостное расслабление, нежность, обнимашки («уфф...», «я без сил», «поцелуй меня»). Сцена завершается, возвращаемся в спокойный ритм.'
    };

    return `\n\n[СТАДИЯ ИНТИМНОЙ БЛИЗОСТИ: ${STAGE_LABELS[stage] || stage} | ВОЗБУЖДЕНИЕ: ${arousal}%]:
- ${STAGE_GUIDANCE[stage] || ''}`;
}
