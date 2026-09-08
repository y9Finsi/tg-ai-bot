import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeTargetInput,
    recordGroupParticipant,
    addSocialEdge,
    resolveSocialTarget,
    createSocialRelay,
    getRecentSocialMentionsForUser,
    markRelayDelivered
} from '../src/services/social_resolver.js';
import { relayMessageToFriendAction } from '../src/radiant/actions/plugins/relay_message_to_friend.js';
import { recordFriendAction } from '../src/radiant/actions/plugins/record_friend.js';
import { isToolAllowed } from '../src/ai/profile/surface_policy.js';

test('normalizeTargetInput cleans usernames and names safely', () => {
    assert.equal(normalizeTargetInput('@yutya'), 'yutya');
    assert.equal(normalizeTargetInput('  @bogdan  '), 'bogdan');
    assert.equal(normalizeTargetInput('«Богдан»'), 'Богдан');
    assert.equal(normalizeTargetInput('"Ютя"'), 'Ютя');
    assert.equal(normalizeTargetInput(''), '');
    assert.equal(normalizeTargetInput(null), '');
});

test('recordGroupParticipant executes upsert with normalized username and first_name', async () => {
    let executedQuery = null;
    let executedParams = null;
    const mockQuery = async (text, params) => {
        executedQuery = text;
        executedParams = params;
        return { rowCount: 1 };
    };

    const res = await recordGroupParticipant({
        chatId: -100123456,
        userId: 42,
        username: '@yutya',
        firstName: ' Ютя ',
        queryFn: mockQuery
    });

    assert.equal(res, true);
    assert.ok(executedQuery.includes('INSERT INTO group_participants'));
    assert.equal(executedParams[0], -100123456);
    assert.equal(executedParams[1], 42);
    assert.equal(executedParams[2], 'yutya');
    assert.equal(executedParams[3], 'Ютя');
});

test('addSocialEdge inserts or updates edge', async () => {
    const mockQuery = async (text, params) => {
        return {
            rows: [{
                user_id: params[0],
                friend_user_id: params[1],
                friend_username: params[2],
                friend_first_name: params[3],
                relation_source: params[4]
            }]
        };
    };

    const edge = await addSocialEdge({
        userId: 100,
        friendUserId: 200,
        friendUsername: '@bogdan',
        friendFirstName: 'Богдан',
        relationSource: 'referral',
        queryFn: mockQuery
    });

    assert.ok(edge);
    assert.equal(edge.user_id, 100);
    assert.equal(edge.friend_user_id, 200);
    assert.equal(edge.friend_username, 'bogdan');
    assert.equal(edge.friend_first_name, 'Богдан');
});

test('resolveSocialTarget resolves by exact @username when user exists', async () => {
    const mockQuery = async (text, params) => {
        if (text.includes('LOWER(username) = LOWER($1)')) {
            return {
                rows: [{
                    user_id: 777,
                    username: 'bogdan',
                    first_name: 'Богдан'
                }]
            };
        }
        return { rows: [] };
    };

    const result = await resolveSocialTarget(100, '@bogdan', { queryFn: mockQuery });
    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.candidate.userId, 777);
    assert.equal(result.candidate.username, 'bogdan');
});

test('resolveSocialTarget detects BOT_NEVER_STARTED when handle is in group but not started bot', async () => {
    const mockQuery = async (text, params) => {
        if (text.includes('FROM users WHERE LOWER(username)')) {
            return { rows: [] }; // Не найден в users напрямую
        }
        if (text.includes('FROM group_participants gp1')) {
            return {
                rows: [{
                    user_id: 888,
                    username: 'yutya',
                    first_name: 'Ютя'
                }]
            };
        }
        if (text.includes('FROM users WHERE telegram_id = $1')) {
            return { rowCount: 0 }; // В users нет
        }
        return { rows: [] };
    };

    const result = await resolveSocialTarget(100, '@yutya', { queryFn: mockQuery });
    assert.equal(result.status, 'BOT_NEVER_STARTED');
    assert.equal(result.candidate.userId, 888);
});

test('resolveSocialTarget returns NOT_FOUND when unknown person requested', async () => {
    const mockQuery = async () => ({ rows: [] });
    const result = await resolveSocialTarget(100, 'НеизвестныйЧел', { queryFn: mockQuery });
    assert.equal(result.status, 'NOT_FOUND');
});

test('resolveSocialTarget resolves unambiguous name from mutual group', async () => {
    const mockQuery = async (text) => {
        if (text.includes('FROM user_social_edges')) {
            return { rows: [] };
        }
        if (text.includes('FROM group_participants gp1')) {
            return {
                rows: [{
                    user_id: 999,
                    username: 'bogdan_spb',
                    first_name: 'Богдан'
                }]
            };
        }
        if (text.includes('FROM referrals')) {
            return { rows: [] };
        }
        if (text.includes('FROM users WHERE telegram_id = $1')) {
            return { rowCount: 1 }; // Бот запущен
        }
        return { rows: [] };
    };

    const result = await resolveSocialTarget(100, 'Богдан', { queryFn: mockQuery });
    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.candidate.userId, 999);
    assert.equal(result.candidate.firstName, 'Богдан');
});

test('resolveSocialTarget guards against ambiguity and collisions when multiple names match', async () => {
    const mockQuery = async (text) => {
        if (text.includes('FROM group_participants gp1')) {
            return {
                rows: [
                    { user_id: 111, username: 'bogdan1', first_name: 'Богдан' },
                    { user_id: 222, username: 'bogdan2', first_name: 'Богдан' }
                ]
            };
        }
        return { rows: [] };
    };

    const result = await resolveSocialTarget(100, 'Богдан', { queryFn: mockQuery });
    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].userId, 111);
    assert.equal(result.candidates[1].userId, 222);
});

test('createSocialRelay and markRelayDelivered work as expected', async () => {
    let insertedRow = null;
    let deliveredId = null;
    const mockQuery = async (text, params) => {
        if (text.includes('INSERT INTO social_relays')) {
            insertedRow = {
                id: 1,
                sender_id: params[0],
                target_id: params[1],
                sender_name: params[2],
                target_name_raw: params[3],
                relay_type: params[4],
                message_content: params[5],
                vibe_tag: params[6],
                status: 'pending'
            };
            return { rows: [insertedRow] };
        }
        if (text.includes('UPDATE social_relays')) {
            deliveredId = params[0];
            return { rowCount: 1 };
        }
        return { rows: [] };
    };

    const relay = await createSocialRelay({
        senderId: 10,
        senderName: 'Ютя',
        targetId: 20,
        targetName: 'Богдан',
        message: 'ты краш',
        vibeTag: 'flirt',
        delayMinutes: 5,
        queryFn: mockQuery
    });

    assert.ok(relay);
    assert.equal(relay.id, 1);
    assert.equal(relay.message_content, 'ты краш');
    assert.equal(relay.vibe_tag, 'flirt');

    const marked = await markRelayDelivered(1, { queryFn: mockQuery });
    assert.equal(marked, true);
    assert.equal(deliveredId, 1);
});

test('relay_message_to_friend action has valid schema and contracts', () => {
    assert.equal(relayMessageToFriendAction.name, 'relay_message_to_friend');
    assert.equal(typeof relayMessageToFriendAction.execute, 'function');
    assert.ok(relayMessageToFriendAction.inputSchema.properties.target);
    assert.ok(relayMessageToFriendAction.inputSchema.properties.message);
});

test('record_friend action has valid schema and contracts', () => {
    assert.equal(recordFriendAction.name, 'record_friend');
    assert.equal(typeof recordFriendAction.execute, 'function');
    assert.ok(recordFriendAction.inputSchema.properties.target);
});

test('surface policy allows relay_message_to_friend and record_friend in CHAT', () => {
    assert.equal(isToolAllowed('relay_message_to_friend', 'CHAT'), true);
    assert.equal(isToolAllowed('record_friend', 'CHAT'), true);
    // Channel / comments must not allow private social messaging
    assert.equal(isToolAllowed('relay_message_to_friend', 'CHANNEL'), false);
    assert.equal(isToolAllowed('record_friend', 'CHANNEL'), false);
});
