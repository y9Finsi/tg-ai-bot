import test from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluateTypeSafe,
    buildTypeSafeClassifierQuestions,
    buildTypeSafeJudgeQuestions,
    isTypeSafeProvider
} from '../src/services/typesafe_client.js';
import { filterToolSchemas, normalizeToolPlan } from '../src/radiant/actions/tool_plan.js';
import { normalizeEmotionProfile, renderEmotionOverlay } from '../src/ai/emotion_planner.js';

test('TypeSafe client uses System One endpoint and normalizes answers', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({
            model: 'jev-1.13.0',
            answers: { mode: { type: 'choice', choice: 'CASUAL', confidence: 0.91 } },
            usage: { input_tokens: 10, output_tokens: 2 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
        const result = await evaluateTypeSafe({
            provider: { name: 'Jev', base_url: 'https://api.typesafe.ai/v1', api_key: 'secret', model_name: 'jev-latest' },
            state: { userMessage: 'привет' },
            questions: buildTypeSafeClassifierQuestions(),
            timeoutMs: 1000
        });
        assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
        assert.equal(request.options.headers.Authorization, 'Bearer secret');
        assert.equal(result.answers.mode.choice, 'CASUAL');
        assert.equal(result.model, 'jev-1.13.0');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('TypeSafe provider detection and judge questions are stable', () => {
    assert.equal(isTypeSafeProvider({ base_url: 'https://api.typesafe.ai/v1' }), true);
    assert.equal(isTypeSafeProvider({ base_url: 'https://openrouter.ai/api/v1' }), false);
    const questions = buildTypeSafeJudgeQuestions();
    assert.deepEqual(Object.keys(questions), ['ignores_user', 'repetition', 'out_of_character', 'invented_fact', 'broken_logic', 'system_leak', 'format', 'relationship_event', 'emotion_consistency']);
    assert.equal(questions.system_leak.type, 'noul');
});

test('tool plan separates mode routing from safe tool execution', () => {
    const photoPlan = normalizeToolPlan({
        toolName: 'send_photo',
        confidence: 0.98,
        userText: 'скинь фотку'
    });
    assert.deepEqual(photoPlan, {
        needed: true,
        name: 'send_photo',
        args: {},
        kind: 'SIDE_EFFECT',
        confidence: 0.98,
        needsClarification: false,
        tools: [{ name: 'send_photo', args: {}, kind: 'SIDE_EFFECT', confidence: 0.98, source: 'CURRENT_MESSAGE' }],
        allowedToolNames: ['send_photo']
    });

    const ordinaryPlan = normalizeToolPlan({ toolName: 'NONE', confidence: 0.99 });
    assert.deepEqual(filterToolSchemas([{ name: 'send_photo' }, { name: 'weather' }], ordinaryPlan), []);

    const readPlan = normalizeToolPlan({ toolName: 'weather', confidence: 0.95, userText: 'какая погода?' });
    assert.deepEqual(filterToolSchemas([{ name: 'weather' }, { name: 'send_photo' }], readPlan), []);
});

test('emotion profile keeps a bounded combined vector and renders a behavioral overlay', () => {
    const profile = normalizeEmotionProfile({
        emotion_1: { choice: 'ANGER' },
        emotion_1_intensity: { score: 170 },
        emotion_2: { choice: 'AFFECTION' },
        emotion_2_intensity: { score: 80 },
        emotion_3: { choice: 'NONE' },
        emotion_reason: 'INSULT',
        expression_sarcasm: { score: 150 },
        expression_warmth: { score: 60 },
        expression_brevity: { score: 140 },
        expression_assertiveness: { score: 160 },
        caps_allowed: { noul: 0.9 }
    });
    assert.deepEqual(profile.emotions, [
        { type: 'ANGER', intensity: 170 },
        { type: 'AFFECTION', intensity: 80 }
    ]);
    assert.match(renderEmotionOverlay(profile), /злость 170\/200/);
    assert.match(renderEmotionOverlay(profile), /Причина: INSULT/);
});
