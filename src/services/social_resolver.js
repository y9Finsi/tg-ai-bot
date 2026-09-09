/**
 * src/services/social_resolver.js
 * Социальный резолвер, граф связей и безопасная передача сообщений между пользователями.
 */

import { query as defaultQuery } from '../db/database.js';

let socialQueueInstance = null;

export function setSocialQueue(queue) {
    socialQueueInstance = queue;
}

async function resolveSocialQueue() {
    if (socialQueueInstance) return socialQueueInstance;
    try {
        const queueMod = await import('../queue.js');
        if (queueMod?.aiQueue) {
            socialQueueInstance = queueMod.aiQueue;
        }
    } catch {}
    return socialQueueInstance;
}

export async function enqueueSocialRelayDelivery({
    relayId,
    senderId,
    targetId,
    senderName,
    targetName,
    message,
    vibeTag = null,
    delayMinutes = 3
}) {
    const queue = await resolveSocialQueue();
    const delayMs = Math.max(0, Math.min(1440, Number(delayMinutes) || 3)) * 60 * 1000;
    if (queue) {
        try {
            await queue.add('social-relay-deliver', {
                relayId,
                senderId,
                targetId,
                senderName,
                targetName,
                message,
                vibeTag
            }, {
                delay: delayMs,
                removeOnComplete: true,
                attempts: 3
            });
            return true;
        } catch (err) {
            console.warn('[SOCIAL RESOLVER] Ошибка постановки в очередь social-relay-deliver:', err.message);
            return false;
        }
    }
    return false;
}

/**
 * Нормализация текста имени или юзернейма
 */
export function normalizeTargetInput(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return '';
    return rawInput.trim().replace(/^[@"'«»]/, '').replace(/["'«»]$/, '').trim();
}

/**
 * Получение вариантов имени для транслитерации и сопоставления (RU <-> EN)
 */
export function getTargetNameVariants(rawInput) {
    const clean = normalizeTargetInput(rawInput).toLowerCase();
    if (!clean) return [];

    const variants = new Set([clean]);

    const RU_EN = {
        'а': 'a', 'б': 'b', 'в': ['v', 'w'], 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
        'з': 'z', 'и': ['i', 'y'], 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': ['h', 'kh'], 'ц': ['ts', 'c'],
        'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': ['yu', 'you'],
        'я': ['ya', 'ia']
    };

    let expansions = [''];
    let isCyrillic = false;

    for (const ch of clean) {
        if (RU_EN[ch] !== undefined) {
            isCyrillic = true;
            const subs = Array.isArray(RU_EN[ch]) ? RU_EN[ch] : [RU_EN[ch]];
            const next = [];
            for (const prefix of expansions) {
                for (const sub of subs) {
                    next.push(prefix + sub);
                }
            }
            expansions = next.slice(0, 16); // Ограничиваем комбинаторный взрыв
        } else {
            expansions = expansions.map(prefix => prefix + ch);
        }
    }

    function transliterateCyrillic(str) {
        let results = [''];
        for (const ch of str) {
            if (RU_EN[ch] !== undefined) {
                const subs = Array.isArray(RU_EN[ch]) ? RU_EN[ch] : [RU_EN[ch]];
                const next = [];
                for (const prefix of results) {
                    for (const sub of subs) {
                        next.push(prefix + sub);
                    }
                }
                results = next.slice(0, 16);
            } else {
                results = results.map(prefix => prefix + ch);
            }
        }
        return results;
    }

    if (isCyrillic) {
        for (const exp of expansions) {
            variants.add(exp);
            if (exp.includes('ks')) variants.add(exp.replace(/ks/g, 'x'));
        }

        // Поддержка падежных форм имен (дательный/винительный: Богдану -> Богдан, Юте -> Ютя/Юта, Саше -> Саша)
        if (clean.length >= 3) {
            const stems = [];
            if (clean.endsWith('у') || clean.endsWith('а')) {
                stems.push(clean.slice(0, -1));
            } else if (clean.endsWith('е')) {
                const root = clean.slice(0, -1);
                stems.push(root + 'а', root + 'я', root);
            } else if (clean.endsWith('ю')) {
                const root = clean.slice(0, -1);
                stems.push(root + 'ь', root + 'я', root);
            }

            for (const stem of stems) {
                if (stem.length >= 2) {
                    variants.add(stem);
                    const latinVariants = transliterateCyrillic(stem);
                    for (const lv of latinVariants) {
                        variants.add(lv);
                    }
                }
            }
        }
    }

    if (clean.startsWith('ют')) {
        variants.add('youtya');
        variants.add('youtyay');
        variants.add('yutya');
        variants.add('yuta');
        variants.add('ютя');
        variants.add('юта');
    }

    if (/^[a-z0-9_]+$/.test(clean)) {
        if (clean.includes('x')) {
            variants.add(clean.replace(/x/g, 'ks'));
        }
        if (clean.startsWith('you')) {
            variants.add('ю' + clean.slice(3));
        } else if (clean.startsWith('yu')) {
            variants.add('ю' + clean.slice(2));
        }
        if (clean.endsWith('tya') || clean.endsWith('ta')) {
            variants.add('ютя');
            variants.add('юта');
        }
    }

    return Array.from(variants);
}

/**
 * Пассивное сохранение участника группы при любом входящем сообщении
 */
export async function recordGroupParticipant({ chatId, userId, username = null, firstName = null, queryFn = defaultQuery }) {
    if (!chatId || !userId) return null;
    const cleanUsername = username ? String(username).replace(/^@/, '').trim() : null;
    const cleanFirstName = firstName ? String(firstName).trim() : null;

    try {
        await queryFn(`
            INSERT INTO group_participants (chat_id, user_id, username, first_name, last_seen_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (chat_id, user_id) DO UPDATE SET
                username = COALESCE(EXCLUDED.username, group_participants.username),
                first_name = COALESCE(EXCLUDED.first_name, group_participants.first_name),
                last_seen_at = NOW()
        `, [chatId, userId, cleanUsername, cleanFirstName]);
        return true;
    } catch (err) {
        console.warn(`[SOCIAL RESOLVER] Ошибка сохранения участника группы ${chatId}/${userId}:`, err.message);
        return false;
    }
}

/**
 * Добавление или обновление ребра в графе связей (друзья, рефералы)
 */
export async function addSocialEdge({ userId, friendUserId, friendUsername = null, friendFirstName = null, relationSource = 'explicit', sourceContextId = null, queryFn = defaultQuery }) {
    if (!userId || !friendUserId) return null;
    const cleanUsername = friendUsername ? String(friendUsername).replace(/^@/, '').trim() : null;
    const cleanFirstName = friendFirstName ? String(friendFirstName).trim() : null;

    try {
        const res = await queryFn(`
            INSERT INTO user_social_edges (user_id, friend_user_id, friend_username, friend_first_name, relation_source, source_context_id, is_confirmed, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (user_id, friend_user_id) DO UPDATE SET
                friend_username = COALESCE(EXCLUDED.friend_username, user_social_edges.friend_username),
                friend_first_name = COALESCE(EXCLUDED.friend_first_name, user_social_edges.friend_first_name),
                relation_source = EXCLUDED.relation_source
            RETURNING *
        `, [userId, friendUserId, cleanUsername, cleanFirstName, relationSource, sourceContextId]);
        return res.rows?.[0] || null;
    } catch (err) {
        console.warn(`[SOCIAL RESOLVER] Ошибка добавления ребра ${userId} -> ${friendUserId}:`, err.message);
        return null;
    }
}

/**
 * Разрешение адресата сообщения с защитой от коллизий и утечек (Entity Resolution)
 */
export async function resolveSocialTarget(senderId, rawTargetText, { queryFn = defaultQuery } = {}) {
    const raw = String(rawTargetText || '').trim();
    if (!raw) {
        return { status: 'INVALID_INPUT', error: 'Имя получателя не указано' };
    }

    const clean = normalizeTargetInput(raw);

    // 0. Если указано местоимение или ответ («ему», «ей», «в ответ», «обратно», «тому кто писал»)
    const isPronounReply = /^(?:ему|ей|им|тому|автору|отправителю|обратно|назад|в\s+ответ)$/i.test(clean) || /^(?:ему|ей|обратно|в\s+ответ)/i.test(raw);
    if (isPronounReply) {
        try {
            const lastIncoming = await queryFn(`
                SELECT sender_id, sender_name 
                FROM social_relays 
                WHERE target_id = $1 AND status = 'delivered'
                ORDER BY delivered_at DESC LIMIT 1
            `, [senderId]).then(r => r.rows || []).catch(() => []);

            if (lastIncoming.length > 0) {
                const senderUser = await queryFn(`
                    SELECT telegram_id as user_id, username, first_name 
                    FROM users 
                    WHERE telegram_id = $1 LIMIT 1
                `, [lastIncoming[0].sender_id]).then(r => r.rows?.[0]).catch(() => null);

                if (senderUser) {
                    return {
                        status: 'RESOLVED',
                        candidate: {
                            userId: senderUser.user_id,
                            username: senderUser.username,
                            firstName: senderUser.first_name || lastIncoming[0].sender_name,
                            source: 'last_incoming_relay'
                        }
                    };
                }
            }
        } catch (err) {
            console.warn('[SOCIAL RESOLVER] Ошибка резолвинга местоимения через social_relays:', err.message);
        }
    }

    const isExplicitHandle = raw.startsWith('@') || /^[a-zA-Z0-9_]{4,32}$/.test(raw);

    // 1. Поиск по точному @username
    if (isExplicitHandle) {
        const userRows = await queryFn(`
            SELECT telegram_id as user_id, username, first_name
            FROM users
            WHERE LOWER(username) = LOWER($1) AND is_blocked = FALSE
            LIMIT 1
        `, [clean]).then(r => r.rows || []).catch(() => []);

        if (userRows.length > 0) {
            const candidate = {
                userId: userRows[0].user_id,
                username: userRows[0].username,
                firstName: userRows[0].first_name || clean,
                source: 'username_direct'
            };
            return { status: 'RESOLVED', candidate };
        }

        // Если в users не нашли, проверяем, был ли такой юзернейм в общих группах
        const groupCandidateRows = await queryFn(`
            SELECT gp2.user_id, gp2.username, gp2.first_name
            FROM group_participants gp1
            JOIN group_participants gp2 ON gp1.chat_id = gp2.chat_id
            WHERE gp1.user_id = $1 AND gp2.user_id != $1 AND LOWER(gp2.username) = LOWER($2)
            LIMIT 1
        `, [senderId, clean]).then(r => r.rows || []).catch(() => []);

        if (groupCandidateRows.length > 0) {
            const row = groupCandidateRows[0];
            // Проверяем, запустил ли он бота в ЛС
            const hasStarted = await queryFn(`
                SELECT 1 FROM users WHERE telegram_id = $1 LIMIT 1
            `, [row.user_id]).then(r => (r.rowCount || 0) > 0).catch(() => false);

            const candidate = {
                userId: row.user_id,
                username: row.username,
                firstName: row.first_name || clean,
                source: 'mutual_group_handle'
            };

            if (!hasStarted) {
                return { status: 'BOT_NEVER_STARTED', candidate };
            }
            return { status: 'RESOLVED', candidate };
        }

        return { status: 'NOT_FOUND', targetText: raw };
    }

    // 2. Поиск по имени среди подтвержденных связей (социальные ребра, общие группы, рефералы)
    const candidatesMap = new Map();
    const variants = getTargetNameVariants(raw);

    // 2а. Явные ребра друзей
    try {
        const edgeRows = await queryFn(`
            SELECT friend_user_id as user_id, friend_username as username, friend_first_name as first_name, relation_source
            FROM user_social_edges
            WHERE user_id = $1 AND friend_user_id IS NOT NULL
              AND (
                (friend_username IS NOT NULL AND LOWER(friend_username) = ANY($2))
                OR (friend_first_name IS NOT NULL AND LOWER(friend_first_name) = ANY($2))
                OR EXISTS (SELECT 1 FROM unnest($2::text[]) v WHERE friend_first_name IS NOT NULL AND LOWER(friend_first_name) LIKE v || '%')
              )
        `, [senderId, variants]).then(r => r.rows || []);
        for (const row of edgeRows) {
            candidatesMap.set(String(row.user_id), {
                userId: row.user_id,
                username: row.username,
                firstName: row.first_name,
                source: `edge_${row.relation_source}`
            });
        }
    } catch {}

    // 2б. Участники общих групп
    try {
        const groupRows = await queryFn(`
            SELECT DISTINCT gp2.user_id, gp2.username, gp2.first_name
            FROM group_participants gp1
            JOIN group_participants gp2 ON gp1.chat_id = gp2.chat_id
            WHERE gp1.user_id = $1 AND gp2.user_id != $1
              AND (
                (gp2.username IS NOT NULL AND LOWER(gp2.username) = ANY($2))
                OR (gp2.first_name IS NOT NULL AND LOWER(gp2.first_name) = ANY($2))
                OR EXISTS (SELECT 1 FROM unnest($2::text[]) v WHERE gp2.first_name IS NOT NULL AND LOWER(gp2.first_name) LIKE v || '%')
              )
        `, [senderId, variants]).then(r => r.rows || []);
        for (const row of groupRows) {
            if (!candidatesMap.has(String(row.user_id))) {
                candidatesMap.set(String(row.user_id), {
                    userId: row.user_id,
                    username: row.username,
                    firstName: row.first_name,
                    source: 'mutual_group'
                });
            }
        }
    } catch {}

    // 2в. Реферальные связи (пригласивший или приглашенный)
    try {
        const refRows = await queryFn(`
            SELECT u.telegram_id as user_id, u.username, u.first_name
            FROM referrals r
            JOIN users u ON (CASE WHEN r.referrer_id = $1 THEN r.referred_id ELSE r.referrer_id END) = u.telegram_id
            WHERE (r.referrer_id = $1 OR r.referred_id = $1)
              AND (
                (u.username IS NOT NULL AND LOWER(u.username) = ANY($2))
                OR (u.first_name IS NOT NULL AND LOWER(u.first_name) = ANY($2))
                OR EXISTS (SELECT 1 FROM unnest($2::text[]) v WHERE u.first_name IS NOT NULL AND LOWER(u.first_name) LIKE v || '%')
              )
        `, [senderId, variants]).then(r => r.rows || []);
        for (const row of refRows) {
            if (!candidatesMap.has(String(row.user_id))) {
                candidatesMap.set(String(row.user_id), {
                    userId: row.user_id,
                    username: row.username,
                    firstName: row.first_name,
                    source: 'referral'
                });
            }
        }
    } catch {}

    // 2г. Точный поиск по пользователям системы (если в друзьях и группах не нашли)
    if (candidatesMap.size === 0 && variants.length > 0) {
        try {
            const directUserRows = await queryFn(`
                SELECT telegram_id as user_id, username, first_name
                FROM users
                WHERE is_blocked = FALSE AND telegram_id != $1
                  AND (
                    (username IS NOT NULL AND LOWER(username) = ANY($2))
                    OR (first_name IS NOT NULL AND LOWER(first_name) = ANY($2))
                  )
                LIMIT 2
            `, [senderId, variants]).then(r => r.rows || []);
            if (directUserRows.length === 1) {
                const u = directUserRows[0];
                candidatesMap.set(String(u.user_id), {
                    userId: u.user_id,
                    username: u.username,
                    firstName: u.first_name,
                    source: 'user_directory'
                });
            }
        } catch {}
    }

    const candidates = Array.from(candidatesMap.values());

    if (candidates.length === 0) {
        return { status: 'NOT_FOUND', targetText: raw };
    }

    if (candidates.length > 1) {
        // Коллизия: найдено больше одного человека с таким именем
        return {
            status: 'AMBIGUOUS',
            candidates: candidates.map(c => ({
                userId: c.userId,
                name: c.firstName,
                username: c.username ? `@${c.username}` : null
            }))
        };
    }

    // Ровно 1 кандидат
    const single = candidates[0];
    const hasStarted = await queryFn(`
        SELECT 1 FROM users WHERE telegram_id = $1 LIMIT 1
    `, [single.userId]).then(r => (r.rowCount || 0) > 0).catch(() => false);

    if (!hasStarted) {
        return { status: 'BOT_NEVER_STARTED', candidate: single };
    }

    return { status: 'RESOLVED', candidate: single };
}

/**
 * Создание задачи на передачу сообщения (Social Relay)
 */
export async function createSocialRelay({
    senderId,
    senderName,
    targetId,
    targetName,
    message,
    vibeTag = null,
    relayType = 'DIRECT_MESSAGE',
    delayMinutes = 3,
    queryFn = defaultQuery
}) {
    if (!senderId || !targetId || !message) {
        throw new Error('[SOCIAL RELAY] Не все обязательные поля переданы (senderId, targetId, message)');
    }

    const cleanDelay = Math.max(0, Math.min(1440, Number(delayMinutes) || 3));
    const res = await queryFn(`
        INSERT INTO social_relays (
            sender_id, target_id, sender_name, target_name_raw,
            relay_type, message_content, vibe_tag, status,
            scheduled_for, expires_at, created_at
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, 'pending',
            NOW() + ($8 || ' minutes')::interval,
            NOW() + INTERVAL '3 days',
            NOW()
        )
        RETURNING *
    `, [senderId, targetId, senderName, targetName, relayType, message, vibeTag, cleanDelay]);

    return res.rows?.[0] || null;
}

/**
 * Получение ожидающих отправки релеев, срок которых уже наступил
 */
export async function getPendingDueRelays({ limit = 10, queryFn = defaultQuery } = {}) {
    try {
        const res = await queryFn(`
            SELECT * FROM social_relays
            WHERE status = 'pending' AND scheduled_for <= NOW() AND expires_at > NOW()
            ORDER BY scheduled_for ASC
            LIMIT $1
        `, [limit]);
        return res.rows || [];
    } catch (err) {
        console.warn('[SOCIAL RESOLVER] Ошибка получения due relays:', err.message);
        return [];
    }
}

/**
 * Пометка сообщения как доставленного
 */
export async function markRelayDelivered(relayId, { queryFn = defaultQuery } = {}) {
    try {
        await queryFn(`
            UPDATE social_relays
            SET status = 'delivered', delivered_at = NOW()
            WHERE id = $1
        `, [relayId]);
        return true;
    } catch {
        return false;
    }
}

export async function markRelayFailed(relayId, { queryFn = defaultQuery } = {}) {
    try {
        await queryFn(`
            UPDATE social_relays
            SET status = 'failed', delivered_at = NOW()
            WHERE id = $1
        `, [relayId]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Поиск недавних сплетен/переданных фактов для подмеса в контекст
 * (когда пользователь спрашивает: «что Ютя про меня говорила?»)
 */
export async function getRecentSocialMentionsForUser(targetUserId, fromName = null, { limit = 3, queryFn = defaultQuery } = {}) {
    try {
        let sql = `
            SELECT id, sender_name, message_content, vibe_tag, created_at, relay_type
            FROM social_relays
            WHERE target_id = $1
              AND status IN ('pending', 'delivered')
              AND created_at > NOW() - INTERVAL '3 days'
        `;
        const params = [targetUserId];

        if (fromName) {
            const clean = normalizeTargetInput(fromName);
            if (clean) {
                params.push(`%${clean.toLowerCase()}%`);
                sql += ` AND LOWER(sender_name) LIKE $${params.length}`;
            }
        }

        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await queryFn(sql, params);
        return res.rows || [];
    } catch (err) {
        console.warn('[SOCIAL RESOLVER] Ошибка getRecentSocialMentionsForUser:', err.message);
        return [];
    }
}
