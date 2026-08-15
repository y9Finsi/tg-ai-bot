import test from 'node:test';
import assert from 'node:assert/strict';
import { computeClimaxState, getClimaxPromptInstruction, isFastClimaxTrigger, CLIMAX_STAGES } from '../src/ai/climax_engine.js';

test('isFastClimaxTrigger detects user climax statements', () => {
    assert.equal(isFastClimaxTrigger('я кончаю'), true);
    assert.equal(isFastClimaxTrigger('сейчас кончу'), true);
    assert.equal(isFastClimaxTrigger('я все, кончил'), true);
    assert.equal(isFastClimaxTrigger('давай вместе кончим'), true);
    assert.equal(isFastClimaxTrigger('привет как дела'), false);
    assert.equal(isFastClimaxTrigger('ты красивая'), false);
});

test('computeClimaxState advances stages sequentially', () => {
    // 1 turn: WARMUP
    const state1 = computeClimaxState({
        recentEvents: [],
        userText: 'давай вирт',
        isEroticMode: true
    });
    assert.equal(state1.stage, CLIMAX_STAGES.WARMUP);
    assert.equal(state1.turns, 1);
    assert.ok(state1.arousal >= 20);

    // After several turns with arousal accumulating:
    const mockEvents = [
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.WARMUP, arousal: 35 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.BUILDUP, arousal: 50 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.BUILDUP, arousal: 65 } },
        { status: 'COMPLETED', metadata: { mode: 'EROTIC', climax_stage: CLIMAX_STAGES.EDGE, arousal: 80 } }
    ];

    const stateEdge = computeClimaxState({
        recentEvents: mockEvents,
        userText: 'продолжай',
        isEroticMode: true
    });
    assert.equal(stateEdge.stage, CLIMAX_STAGES.CLIMAX);
    assert.equal(stateEdge.turns, 5);

    // Fast climax trigger
    const stateFast = computeClimaxState({
        recentEvents: mockEvents.slice(0, 1),
        userText: 'я кончаю',
        isEroticMode: true
    });
    assert.equal(stateFast.stage, CLIMAX_STAGES.CLIMAX);
    assert.equal(stateFast.arousal, 100);

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

test('getClimaxPromptInstruction produces expected guidance per stage', () => {
    const warmupPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.WARMUP, arousal: 25 });
    assert.match(warmupPrompt, /Разогрев/);
    assert.match(warmupPrompt, /Не торопи кульминацию/);

    const climaxPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.CLIMAX, arousal: 100 });
    assert.match(climaxPrompt, /ОРГАЗМ/);
    assert.match(climaxPrompt, /Яркая эмоциональная кульминация/);

    const afterglowPrompt = getClimaxPromptInstruction({ stage: CLIMAX_STAGES.AFTERGLOW, arousal: 10 });
    assert.match(afterglowPrompt, /Послевкусие/);
    assert.match(afterglowPrompt, /Сцена завершается/);
});
