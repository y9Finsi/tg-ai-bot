import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChannelSystemPrompt } from '../src/channel_prompt.js';
import { buildJudgeMessages, parseJudgeVerdict } from '../src/ai/response_judge.js';
import { getCommenterContext } from '../src/channel_comments.js';

test('buildChannelSystemPrompt contains anti-cliche bans, life context, and paragraph format rules', () => {
    const prompt = buildChannelSystemPrompt({
        time: 'суббота, 15 августа, 22:00',
        timeOfDay: 'вечер',
        topic: 'life',
        recentPosts: [{ text: 'поела макароны с сыром' }]
    });

    assert.match(prompt, /СПбГИК/);
    assert.match(prompt, /СТРОЖАЙШИЙ ЗАПРЕТ на шаблонные зачины и позы/);
    assert.match(prompt, /сижу на кухне/);
    assert.match(prompt, /еду в маршрутке/);
    assert.match(prompt, /валяюсь под пледиком/);
    assert.match(prompt, /Форматирование по длине/);
    assert.match(prompt, /life_observation/);
});

test('buildJudgeMessages for surface CHANNEL includes CHANNEL_CLICHE and CHANNEL_REPETITION rules', () => {
    const messages = buildJudgeMessages({
        surface: 'CHANNEL',
        topic: 'life',
        reply: 'сижу щас на кухне и смотрю на мух...',
        recentPublicPosts: [{ text: 'сижу щас на кухне и жую хлеб' }]
    });

    const systemPrompt = messages[0].content;
    assert.match(systemPrompt, /REJECT:CHANNEL_CLICHE/);
    assert.match(systemPrompt, /REJECT:CHANNEL_REPETITION/);
    assert.match(systemPrompt, /REJECT:CHANNEL_FORMAT/);

    const verdictCliche = parseJudgeVerdict('{"verdict":"REJECT:CHANNEL_CLICHE"}');
    assert.equal(verdictCliche.passed, false);
    assert.equal(verdictCliche.code, 'CHANNEL_CLICHE');

    const verdictRepetition = parseJudgeVerdict('{"verdict":"REJECT:CHANNEL_REPETITION"}');
    assert.equal(verdictRepetition.passed, false);
    assert.equal(verdictRepetition.code, 'CHANNEL_REPETITION');
});
