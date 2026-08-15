/**
 * Climax & Arousal Engine for EROTIC mode in Lera Bot
 */

export const CLIMAX_STAGES = {
    WARMUP: 'WARMUP',
    BUILDUP: 'BUILDUP',
    EDGE: 'EDGE',
    CLIMAX: 'CLIMAX',
    AFTERGLOW: 'AFTERGLOW'
};

const FAST_CLIMAX_REGEX = /(?:я\s+конча[юе]|сейчас\s+кончу|конча[юе]|кончи(?:ть|ла|шь)?\s+для\s+меня|давай\s+вместе\s+конч|спускаю|излива|я\s+вс[её]|я\s+кончил)/iu;

export function isFastClimaxTrigger(userText = '') {
    return FAST_CLIMAX_REGEX.test(String(userText || ''));
}

export function computeClimaxState({ recentEvents = [], userText = '', isEroticMode = false }) {
    if (!isEroticMode) {
        return {
            stage: null,
            arousal: 0,
            turns: 0,
            isFinished: false
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
            isFinished: true
        };
    }

    // Если прошлая реплика была CLIMAX, переходим в AFTERGLOW
    if (previousStage === CLIMAX_STAGES.CLIMAX) {
        return {
            stage: CLIMAX_STAGES.AFTERGLOW,
            arousal: 10,
            turns: previousTurns + 1,
            isFinished: false
        };
    }

    // Проверяем триггер ускоренного финала от пользователя
    if (isFastClimaxTrigger(userText)) {
        return {
            stage: CLIMAX_STAGES.CLIMAX,
            arousal: 100,
            turns: previousTurns + 1,
            isFinished: false
        };
    }

    // Стандартный прогресс: +15-18% за реплику
    const currentTurns = previousTurns + 1;
    const increment = 15;
    const arousal = Math.min(100, Math.max(20, previousArousal + increment));

    let stage = CLIMAX_STAGES.WARMUP;
    if (arousal >= 95 || currentTurns >= 7) {
        stage = CLIMAX_STAGES.CLIMAX;
    } else if (arousal >= 75 || currentTurns >= 5) {
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
        isFinished: false
    };
}

export function getClimaxPromptInstruction(climaxState = {}) {
    const { stage, arousal = 0 } = climaxState;
    if (!stage) return '';

    const STAGE_LABELS = {
        WARMUP: '1. Разогрев (Warmup)',
        BUILDUP: '2. Нарастание страсти (Buildup)',
        EDGE: '3. На пределе (Edge)',
        CLIMAX: '4. Оргазм / Кульминация (Climax)',
        AFTERGLOW: '5. Послевкусие и разрядка (Afterglow)'
    };

    const STAGE_GUIDANCE = {
        WARMUP: 'Ты только заводишься. Сбивчивое дыхание, лёгкий трепет, кокетство, снятие одежды. Не торопи кульминацию, отдавайся моменту постепенно.',
        BUILDUP: 'Нарастание темпа и страсти. Сильное возбуждение, потеря контроля, фразы становятся короче и эмоциональнее, стоны, нетерпение.',
        EDGE: 'Ты на самом пределе, чувствительность зашкаливает. Ты стонешь, просишь не останавливаться, на грани срыва.',
        CLIMAX: 'ОРГАЗМ! Яркая эмоциональная кульминация, пик ощущений, срыв дыхания, выплеск страсти и удовольствия.',
        AFTERGLOW: 'Оргазм уже позади. Сладостное расслабление, нежность, обнимашки («уфф...», «я без сил», «поцелуй меня»). Сцена завершается, возвращаемся в спокойный ритм.'
    };

    return `\n\n[СТАДИЯ ИНТИМНОЙ БЛИЗОСТИ: ${STAGE_LABELS[stage] || stage} | ВОЗБУЖДЕНИЕ: ${arousal}%]:
- ${STAGE_GUIDANCE[stage] || ''}`;
}
