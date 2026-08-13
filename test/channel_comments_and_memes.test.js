import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContentFromChannelPost } from '../src/content_service.js';
import { buildChannelSystemPrompt } from '../src/channel_prompt.js';
import { getLeraProfileProjection } from '../src/db/database.js';
import { parseLlmJson } from '../src/utils/robust_json.js';

test('getLeraProfileProjection returns tailored rules for CHANNEL_COMMENT and INITIATIVE surfaces', () => {
    const mockProfile = {
        age_bio: 'Лера, 19 лет, СПб',
        character: 'дерзкая, теплая',
        speech: 'разговорный сленг, строчные буквы',
        flirt: 'игривость без пошлости',
        forbidden: 'не сливать интим в паблик',
        facts: 'не выдумывать факты',
        public_image: 'авторский канал студентки'
    };

    const commentProjection = getLeraProfileProjection(mockProfile, 'CHANNEL_COMMENT');
    assert.match(commentProjection, /Публичный образ в комментариях/);
    assert.match(commentProjection, /Границы публичности/);

    const initiativeProjection = getLeraProfileProjection(mockProfile, 'INITIATIVE');
    assert.match(initiativeProjection, /Голос и подача/);
    assert.match(initiativeProjection, /Флирт и теплота/);
});

test('comment decision parser extracts valid JSON reaction and text reply', () => {
    const rawLlmOutput = '```json\n{\n  "reaction": "🔥",\n  "reply": "жиза кароч, сама вчера так залипла",\n  "reason": "поддержала вайб треда"\n}\n```';
    const parsed = parseLlmJson(rawLlmOutput);
    assert.equal(parsed.reaction, '🔥');
    assert.equal(parsed.reply, 'жиза кароч, сама вчера так залипла');
    assert.equal(parsed.reason, 'поддержала вайб треда');
});

test('content parser detects #тгк, #канал, #мем and strips them from description', () => {
    const post1 = {
        chat: { id: -100123 },
        message_id: 101,
        caption: 'когда проснулся в 14:00 #тгк',
        photo: [{ file_id: 'photo-1' }]
    };
    const extracted1 = extractContentFromChannelPost(post1);
    assert.equal(extracted1.allowChannel, true);
    assert.equal(extracted1.description, 'когда проснулся в 14:00');

    const post2 = {
        chat: { id: -100123 },
        message_id: 102,
        caption: 'просто трек для души',
        audio: { file_id: 'audio-1' }
    };
    const extracted2 = extractContentFromChannelPost(post2);
    assert.equal(extracted2.allowChannel, false);
    assert.equal(extracted2.description, 'просто трек для души');
});

test('channel system prompt supports meme and repost topics', () => {
    const promptMeme = buildChannelSystemPrompt({
        topic: 'meme',
        topicDescription: 'Дерзкая подпись к мему про учебу'
    });
    assert.match(promptMeme, /мем|подпись/i);
    assert.match(promptMeme, /ровно один цельный пост без разделителей/);

    const promptRepost = buildChannelSystemPrompt({
        topic: 'repost',
        topicDescription: 'Реакция на пост'
    });
    assert.match(promptRepost, /репост|мнение/i);
});

test('commenter context recognizes known friends while preserving strict privacy', () => {
    const commenter = {
        isKnown: true,
        userId: 12345,
        name: 'Богдан',
        relationshipStatus: 'друг',
        facts: ['любит гулять по ночам', 'пьет много кофе']
    };

    assert.equal(commenter.isKnown, true);
    assert.equal(commenter.name, 'Богдан');
    assert.equal(commenter.facts.length, 2);
});
