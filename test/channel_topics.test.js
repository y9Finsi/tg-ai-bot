import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTopicDistribution, selectWeightedTopic } from '../src/channel_topics.js';

test('channel topic distribution has exactly one hundred percent across active topics', () => {
    const weights = normalizeTopicDistribution(['thoughts', 'life', 'questions'], {
        thoughts: 100, life: 100, questions: 32, flirt: 99
    });

    assert.equal(weights.thoughts + weights.life + weights.questions, 100);
    assert.equal(weights.flirt, 0);
    assert.equal(weights.jokes, 0);
});

test('channel topic selection uses only active topics and respects zero shares', () => {
    const settings = {
        topics: ['thoughts', 'life', 'questions'],
        topic_weights: { thoughts: 100, life: 0, questions: 0 }
    };

    assert.equal(selectWeightedTopic(settings, 0), 'thoughts');
    assert.equal(selectWeightedTopic(settings, 0.99), 'thoughts');
});

test('all-zero active topic weights are split evenly instead of producing an invalid distribution', () => {
    const weights = normalizeTopicDistribution(['thoughts', 'life', 'jokes'], {});

    assert.equal(weights.thoughts + weights.life + weights.jokes, 100);
    assert.ok(weights.thoughts > 0 && weights.life > 0 && weights.jokes > 0);
});
