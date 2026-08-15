import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeClimaxState,
    getClimaxPromptInstruction,
    isFastClimaxTrigger,
    normalizeArousalEvent,
    CLIMAX_STAGES,
    AROUSAL_DELTAS
} from '../src/ai/climax_engine.js';

test('isFastClimaxTrigger detects user climax statements', () => {
    assert.equal(isFastClimaxTrigger('я кончаю'), true);
    assert.equal(isFastClimaxTrigger('сейчас кончу'), true);
    assert.equal(isFastClimaxTrigger('я все, кончил'), true);
    assert.equal(isFastClimaxTrigger('давай вместе кончим'), true);
    assert.equal(isFastClimaxTrigger('привет как дела'), false);
    assert.equal(isFastClimaxTrigger('ты красивая'), false);
});

test('normalizeArousalEvent handles various event shapes and intensities', () => {
    assert.deepEqual(normalizeArousalEvent({ type: 'KISS_TOUCH', intensity: 0.8 }), { type: 'KISS_TOUCH', intensity: 0.8 });
    assert.deepEqual(normalizeArousalEvent({ type: 'SEX_PENETRATION' }), { type: 'SEX_PENETRATION', intensity: 0.8 });
    assert.deepEqual(normalizeArousalEvent({ type: 'UNKNOWN' }), { type: 'NONE', intensity: 0 });
    assert.deepEqual(normalizeArousalEvent(null), { type: 'NONE', intensity: 0 });
});

test('computeClimaxState strictly isolates non-erotic modes', () => {
    const casualState = computeClimaxState({
        recentEvents: [],
        userText: 'Привет, как прошёл день?',
        isEroticMode: false,
        arousalEvent: { type: 'SEX_PENETRATION', intensity: 1.0 }
    });
    assert.equal(casualState.stage, null);
    assert.equal(casualState.arousal, 0);
    assert.equal(casualState.turns, 0);
    assert.equal(casualState.isFinished, false);
});

test('computeClimaxState calculates arousal deltas from events', () => {
    // 1 turn: KISS_TOUCH event
    const state1 = computeClimaxState({
        recentEvents: [],
        userText: 'целую твои плечи',
        isEroticMode: true,
        arousalEvent: { type: 'KISS_TOUCH', intensity: 1.0 }
    });
    assert.equal(state1.stage, CLIMAX_STAGES.WARMUP);
    assert.equal(state1.turns, 1);
    assert.equal(state1.arousal, 15 + AROUSAL_DELTAS.KISS_TOUCH);

    // 2 turn: SEX_PENETRATION event
    const state2 = computeClimaxState({
        recentEvents: [{ status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.WARMUP, arousal: state1.arousal } }],
        userText: 'вхожу в тебя',
        isEroticMode: true,
        arousalEvent: { type: 'SEX_PENETRATION', intensity: 1.0 }
    });
    assert.equal(state2.stage, CLIMAX_STAGES.BUILDUP);
    assert.equal(state2.turns, 2);
    assert.ok(state2.arousal >= state1.arousal + 20);
});

test('computeClimaxState advances stages sequentially and handles Edging', () => {
    // Early fast climax trigger triggers EDGING instead of instant climax
    const stateEarlyClimax = computeClimaxState({
        recentEvents: [{ status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.WARMUP, arousal: 25 } }],
        userText: 'я кончаю',
        isEroticMode: true,
        arousalEvent: { type: 'CLIMAX_TRIGGER', intensity: 1.0 }
    });
    assert.equal(stateEarlyClimax.stage, CLIMAX_STAGES.EDGE);
    assert.equal(stateEarlyClimax.isEdging, true);
    assert.ok(stateEarlyClimax.arousal >= 50);

    // After several turns with arousal accumulating:
    const mockEvents = [
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.WARMUP, arousal: 25 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.BUILDUP, arousal: 40 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.BUILDUP, arousal: 55 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.EDGE, arousal: 70 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.EDGE, arousal: 85 } }
    ];

    // Climax when arousal is high and user triggers climax
    const stateClimax = computeClimaxState({
        recentEvents: mockEvents,
        userText: 'кончаю вместе с тобой',
        isEroticMode: true,
        arousalEvent: { type: 'CLIMAX_TRIGGER', intensity: 1.0 }
    });
    assert.equal(stateClimax.stage, CLIMAX_STAGES.CLIMAX);
    assert.equal(stateClimax.arousal, 100);

    // After CLIMAX -> AFTERGLOW
    const climaxEvents = [
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.CLIMAX, arousal: 100 } }
    ];
    const stateAfterglow = computeClimaxState({
        recentEvents: climaxEvents,
        userText: 'ты как?',
        isEroticMode: true
    });
    assert.equal(stateAfterglow.stage, CLIMAX_STAGES.AFTERGLOW);
    assert.equal(stateAfterglow.isFinished, false);

    // After AFTERGLOW -> FINISHED (resets to CASUAL)
    const afterglowEvents = [
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.AFTERGLOW, arousal: 10 } }
    ];
    const stateFinished = computeClimaxState({
        recentEvents: afterglowEvents,
        userText: 'ложись спать',
        isEroticMode: true
    });
    assert.equal(stateFinished.isFinished, true);
});

test('getClimaxPromptInstruction produces expected guidance per stage and edging', () => {
    const warmupPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.WARMUP, arousal: 25 });
    assert.match(warmupPrompt, /Разогрев/);
    assert.match(warmupPrompt, /2x2/);

    const edgingPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.EDGE, arousal: 60, isEdging: true });
    assert.match(edgingPrompt, /edging/i);
    assert.match(edgingPrompt, /Не давай ему кончить прямо сейчас/);

    const climaxPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.CLIMAX, arousal: 100 });
    assert.match(climaxPrompt, /ОРГАЗМ/);

    const afterglowPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.AFTERGLOW, arousal: 10 });
    assert.match(afterglowPrompt, /Послевкусие/);
});
