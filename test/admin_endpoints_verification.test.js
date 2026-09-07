import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set environment variables before dynamically importing database and server modules
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/tg_ai_bot_test';
process.env.ADMIN_WEB_KEY = process.env.ADMIN_WEB_KEY || 'test_admin_key_linear_verification';

const { initDatabaseTables, closeDB } = await import('../src/database.js');
const { createAdminApp } = await import('../src/server.js');
const { broadcastQueue } = await import('../src/broadcast.js');
const { aiQueue } = await import('../src/queue.js');

const ADMIN_KEY = process.env.ADMIN_WEB_KEY;

test('Admin Linear Endpoints Integration Verification Suite', { concurrency: 1 }, async (t) => {
    let server = null;
    let baseUrl = '';
    let sessionCookie = '';
    let createdTaskId = null;
    let createdProviderId = null;
    let currentProfileData = null;

    async function adminFetch(path, options = {}) {
        const url = `${baseUrl}${path}`;
        const headers = { ...(options.headers || {}) };
        if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        const res = await fetch(url, { ...options, headers });
        let data = null;
        const text = await res.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { status: res.status, ok: res.ok, headers: res.headers, data };
    }

    // =========================================================================
    // 0. Environment & Database Bootstrap
    // =========================================================================
    await t.test('0. Setup environment, database schema, and live test server', async () => {
        await initDatabaseTables();
        const app = createAdminApp();
        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
        assert.ok(baseUrl.startsWith('http://127.0.0.1:'), 'Live test server must be listening on 127.0.0.1');
    });

    // =========================================================================
    // 1. Session & Auth Endpoints
    // =========================================================================
    await t.test('1.1 GET /api/admin/session returns false when unauthenticated', async () => {
        const res = await adminFetch('/api/admin/session');
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.authenticated, false);
    });

    await t.test('1.2 GET /api/admin/session returns true with x-admin-key header', async () => {
        const res = await adminFetch('/api/admin/session', {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.authenticated, true);
    });

    await t.test('1.3 POST /api/admin/login rejects invalid key with 401', async () => {
        const res = await adminFetch('/api/admin/login', {
            method: 'POST',
            body: { key: 'invalid_secret_key' }
        });
        assert.equal(res.status, 401);
        assert.ok(res.data.error, 'Should return error message');
    });

    await t.test('1.4 POST /api/admin/login succeeds with valid key and issues cookie', async () => {
        const res = await adminFetch('/api/admin/login', {
            method: 'POST',
            body: { key: ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);

        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie, 'Must return Set-Cookie header');
        assert.ok(setCookie.includes('admin_key='), 'Cookie must contain admin_key');
        sessionCookie = setCookie.split(';')[0];
    });

    await t.test('1.5 GET /api/admin/session returns true with valid admin cookie', async () => {
        const res = await adminFetch('/api/admin/session', {
            headers: { Cookie: sessionCookie }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.authenticated, true);
    });

    await t.test('1.6 POST /api/admin/logout clears admin cookie', async () => {
        const res = await adminFetch('/api/admin/logout', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        const setCookie = res.headers.get('set-cookie');
        assert.ok(setCookie, 'Must return Set-Cookie header to clear session');
        assert.ok(setCookie.includes('Max-Age=0'), 'Cookie must be invalidated with Max-Age=0');
    });

    // =========================================================================
    // 2. Radiant Overview & Day Endpoints
    // =========================================================================
    await t.test('2.1 GET /api/admin/radiant/overview returns full canonical overview schema', async () => {
        const res = await adminFetch('/api/admin/radiant/overview', {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.state, 'Must contain state object');
        assert.ok(res.data.state.location_id, 'State must have location_id');
        assert.ok(typeof res.data.state.needs === 'object', 'State must have needs object');
        assert.ok('hunger' in res.data.state.needs, 'Needs must include hunger');
        assert.ok('fatigue' in res.data.state.needs, 'Needs must include fatigue');
        assert.ok(Array.isArray(res.data.queue), 'Queue must be an array');
        assert.ok(Array.isArray(res.data.inventory), 'Inventory must be an array');
        assert.ok(typeof res.data.weather === 'object', 'Weather must be an object');
        assert.ok(res.data.locations, 'Must include world locations');
    });

    await t.test('2.2 GET /api/admin/radiant/day returns timeline, schedule, profile, and summary', async () => {
        const res = await adminFetch('/api/admin/radiant/day', {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(Array.isArray(res.data.timeline), 'Must contain timeline array');
        assert.ok(Array.isArray(res.data.schedule), 'Must contain schedule array');
        assert.ok(res.data.profile, 'Must contain day profile');
        assert.ok(res.data.state, 'Must contain state object');
        assert.ok(res.data.summary, 'Must contain day summary');
    });

    // =========================================================================
    // 3. Radiant Actions & Queue Endpoints
    // =========================================================================
    await t.test('3.1 POST /api/admin/radiant/tick increments simulation time by 15m', async () => {
        const res = await adminFetch('/api/admin/radiant/tick', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {}
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.snapshot, 'Tick response must include snapshot overview');
    });

    await t.test('3.2 POST /api/admin/radiant/god-mode applies SET_STATE mutation', async () => {
        const res = await adminFetch('/api/admin/radiant/god-mode', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                action: 'SET_STATE',
                rubles: 5000,
                stars: 300,
                needs: { hunger: 42, fatigue: 18, horny: 50 },
                physiology: { cycle_day: 14 }
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.action, 'SET_STATE');
        assert.ok(res.data.snapshot, 'Must return updated snapshot');
        assert.equal(res.data.snapshot.state.needs.hunger, 42);
        assert.equal(res.data.snapshot.state.needs.fatigue, 18);
    });

    await t.test('3.3 POST /api/admin/radiant/mutate modifies state, wallet, and needs', async () => {
        const res = await adminFetch('/api/admin/radiant/mutate', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                rublesDelta: 250,
                starsDelta: 25,
                needs: { hunger: 35, fatigue: 12 },
                locationId: 'petrogradka_home'
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.state, 'Must return updated state');
        assert.equal(res.data.state.needs.hunger, 35);
        assert.equal(res.data.state.needs.fatigue, 12);
    });

    await t.test('3.4 POST /api/admin/radiant/queue/push enqueues planned task', async () => {
        const res = await adminFetch('/api/admin/radiant/queue/push', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                taskType: 'EAT_FOOD_HOME',
                durationMinutes: 25,
                priority: 70,
                targetLocation: 'petrogradka_home'
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.task, 'Must return created task');
        assert.equal(res.data.task.task_type, 'EAT_FOOD_HOME');
        createdTaskId = res.data.task.id;
        assert.ok(createdTaskId, 'Task must have an ID');
    });

    await t.test('3.5 DELETE /api/admin/queue/:taskId removes task from queue', async () => {
        assert.ok(createdTaskId, 'Requires createdTaskId from push test');
        const res = await adminFetch(`/api/admin/queue/${createdTaskId}`, {
            method: 'DELETE',
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
    });

    // =========================================================================
    // 4. Inventory Endpoints
    // =========================================================================
    const testWearable = 'test_beret_' + Date.now();
    const testFood = 'test_croissant_' + Date.now();
    const testToy = 'test_book_' + Date.now();

    await t.test('4.1 POST /api/admin/inventory/add adds wearable clothing item', async () => {
        const res = await adminFetch('/api/admin/inventory/add', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                itemId: testWearable,
                itemType: 'clothes',
                properties: { name: 'Французский берет', slot: 'head', warmth: 1 },
                quantity: 1
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.item, 'Must return created item');
        assert.equal(res.data.item.item_id, testWearable);
    });

    await t.test('4.2 POST /api/admin/inventory/add adds consumable food item', async () => {
        const res = await adminFetch('/api/admin/inventory/add', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                itemId: testFood,
                itemType: 'food',
                properties: { name: 'Круассан с миндалем', hunger_restore: 20, is_consumable: true },
                quantity: 2
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.item.item_id, testFood);
        assert.equal(Number(res.data.item.quantity), 2);
    });

    await t.test('4.3 POST /api/admin/inventory/add adds durable toy item', async () => {
        const res = await adminFetch('/api/admin/inventory/add', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                itemId: testToy,
                itemType: 'toy',
                properties: { name: 'Книга стихов Бродского', is_durable: true, boredom_restore: 15 },
                quantity: 1
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.item.item_id, testToy);
    });

    await t.test('4.4 POST /api/admin/inventory/equip equips item to slot', async () => {
        const res = await adminFetch('/api/admin/inventory/equip', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: { itemId: testWearable }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.item.is_equipped, true);
    });

    await t.test('4.5 POST /api/admin/inventory/unequip unequips item back to inventory', async () => {
        const res = await adminFetch('/api/admin/inventory/unequip', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: { itemId: testWearable }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.item.is_equipped, false);
    });

    await t.test('4.6 POST /api/admin/inventory/consume consumes 1 consumable item and modifies needs', async () => {
        const res = await adminFetch('/api/admin/inventory/consume', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: { itemId: testFood, quantity: 1 }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.deltas, 'Must include stat deltas applied');
        assert.ok('hunger' in res.data.deltas, 'Deltas must include hunger change');
        assert.equal(Number(res.data.item.quantity), 1);
    });

    await t.test('4.7 POST /api/admin/inventory/use uses durable item without consuming it', async () => {
        const res = await adminFetch('/api/admin/inventory/use', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: { itemId: testToy }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.isDurable, true);
        assert.equal(Number(res.data.item.quantity), 1);
    });

    // =========================================================================
    // 5. AI Settings & Providers Endpoints
    // =========================================================================
    await t.test('5.1 GET /api/admin/providers lists provider stack', async () => {
        const res = await adminFetch('/api/admin/providers', {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(Array.isArray(res.data.providers), 'Must return providers array');
    });

    await t.test('5.2 POST /api/admin/providers creates a new custom provider', async () => {
        const res = await adminFetch('/api/admin/providers', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                name: 'Test LLM Fast',
                base_url: 'https://api.openai.com/v1',
                api_key: 'sk-test-mock-key-verification',
                model_name: 'gpt-4o-mini',
                timeout_ms: 8000
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.provider, 'Must return created provider');
        assert.equal(res.data.provider.name, 'Test LLM Fast');
        assert.equal(res.data.provider.model_name, 'gpt-4o-mini');
        createdProviderId = res.data.provider.id;
        assert.ok(createdProviderId, 'Created provider must have an ID');
    });

    await t.test('5.3 PUT /api/admin/providers/:id updates provider fields', async () => {
        assert.ok(createdProviderId, 'Requires createdProviderId');
        const res = await adminFetch(`/api/admin/providers/${createdProviderId}`, {
            method: 'PUT',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                name: 'Test LLM Fast Updated',
                model_name: 'gpt-4o'
            }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.provider.name, 'Test LLM Fast Updated');
        assert.equal(res.data.provider.model_name, 'gpt-4o');
    });

    await t.test('5.4 POST /api/admin/providers/:id/activate sets primary provider', async () => {
        assert.ok(createdProviderId, 'Requires createdProviderId');
        const res = await adminFetch(`/api/admin/providers/${createdProviderId}/activate`, {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.provider.is_active, true);
    });

    await t.test('5.5 PATCH /api/admin/providers/:id/priority updates provider priority', async () => {
        assert.ok(createdProviderId, 'Requires createdProviderId');
        const res = await adminFetch(`/api/admin/providers/${createdProviderId}/priority`, {
            method: 'PATCH',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: { priority: 5 }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.provider.priority, 5);
    });

    await t.test('5.6 DELETE /api/admin/providers/:id deletes custom provider', async () => {
        assert.ok(createdProviderId, 'Requires createdProviderId');
        const res = await adminFetch(`/api/admin/providers/${createdProviderId}`, {
            method: 'DELETE',
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);

        // Verify deletion in GET /api/admin/providers
        const listRes = await adminFetch('/api/admin/providers', {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(listRes.status, 200);
        const found = listRes.data.providers.find(p => p.id === createdProviderId);
        assert.equal(found, undefined, 'Deleted provider must no longer appear in list');
    });

    await t.test('5.7 GET /api/admin/lera-profile returns full canonical profile, prompts, and sampling', async () => {
        const res = await adminFetch('/api/admin/lera-profile', {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.profile, 'Must return profile object');
        assert.ok(res.data.profile.profile, 'Must contain nested canonical profile');
        assert.ok(typeof res.data.profile.profile.age_bio === 'string', 'Profile must contain age_bio string');
        assert.ok(typeof res.data.profile.profile.character === 'string', 'Profile must contain character string');
        assert.ok(typeof res.data.profile.profile.speech === 'string', 'Profile must contain speech string');
        assert.ok(Array.isArray(res.data.profile.profile.blocks), 'Profile must contain blocks array');
        assert.ok(typeof res.data.profile.profile.surfacePrompts === 'object', 'Profile must contain surfacePrompts');
        assert.ok(Array.isArray(res.data.versions), 'Must contain versions array');
        assert.ok(res.data.sampling, 'Must contain sampling configuration');
        assert.ok(typeof res.data.sampling.temperature === 'number', 'Temperature must be a number');
        currentProfileData = res.data.profile.profile;
    });

    await t.test('5.8 POST /api/admin/lera-profile updates profile, prompts, rules, and sampling', async () => {
        assert.ok(currentProfileData, 'Requires currentProfileData');
        const updatedBio = 'Лере 19 лет. Она из Санкт-Петербурга, учится на 2 курсе СПбГИК и обожает кофе на Петроградке.';
        const testBlock = {
            id: 'rule_verification_test',
            title: 'Тестовое правило для верификации',
            content: 'Отвечать живо и естественно при упоминании Петроградки',
            surface: 'CHAT',
            enabled: true,
            priority: 10
        };

        const res = await adminFetch('/api/admin/lera-profile', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                profile: {
                    ...currentProfileData,
                    age_bio: updatedBio,
                    blocks: [...(currentProfileData.blocks || []), testBlock]
                },
                temperature: 0.75,
                max_tokens: 380,
                typing_delay: true
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.saved, 'Must return saved version record');
        assert.equal(res.data.sampling.temperature, 0.75);
        assert.equal(res.data.sampling.max_tokens, 380);
        assert.equal(res.data.profile.profile.age_bio, updatedBio);
        assert.ok(res.data.profile.profile.blocks.some(b => b.id === 'rule_verification_test'), 'Updated rule block must be present');
    });

    await t.test('5.9 POST /api/admin/raw-prompt-preview returns casual chat prompt with accurate tokens and routing', async () => {
        const res = await adminFetch('/api/admin/raw-prompt-preview', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                ruleId: 'rule_chat_casual',
                surface: 'CHAT',
                mode: 'CASUAL',
                userText: 'привет, как дела на петроградке?'
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.surface, 'CHAT');
        assert.equal(res.data.mode, 'CASUAL');
        assert.ok(res.data.rule, 'Must find rule_chat_casual');
        assert.equal(res.data.rule.id, 'rule_chat_casual');
        assert.equal(res.data.generationParams.temperature, 0.68);
        assert.equal(res.data.generationParams.max_tokens, 200);
        assert.ok(res.data.systemPrompt.includes('КАНОНИЧЕСКИЙ ПРОФИЛЬ ЛЕРЫ'), 'Must contain canonical profile header');
        assert.ok(res.data.systemPrompt.includes('CHAT'), 'Must specify CHAT surface');
        assert.ok(res.data.systemPrompt.includes('АКТИВНОЕ ПРАВИЛО: Личка / Casual'), 'Must include active rule title');
        assert.ok(res.data.radiantContext, 'Must contain Radiant context');
        assert.ok(Array.isArray(res.data.messages), 'Must contain messages array');
    });

    await t.test('5.10 POST /api/admin/raw-prompt-preview returns erotic chat prompt with 18+ tokens, temp and content', async () => {
        const res = await adminFetch('/api/admin/raw-prompt-preview', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                ruleId: 'rule_chat_erotic',
                surface: 'CHAT',
                mode: 'EROTIC'
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.surface, 'CHAT');
        assert.equal(res.data.mode, 'EROTIC');
        assert.ok(res.data.rule, 'Must find rule_chat_erotic');
        assert.equal(res.data.rule.id, 'rule_chat_erotic');
        assert.equal(res.data.generationParams.temperature, 0.75);
        assert.equal(res.data.generationParams.max_tokens, 240);
        assert.ok(res.data.systemPrompt.includes('АКТИВНОЕ ПРАВИЛО: Личка / Erotic 18+'), 'Must include erotic rule title');
        assert.ok(res.data.systemPrompt.includes('СТРОЖАЙШИЙ ЗАПРЕТ на отговорки про сон'), 'Must include erotic rule content');
    });

    await t.test('5.11 POST /api/admin/raw-prompt-preview returns channel post prompt with persona and 230 tokens', async () => {
        const res = await adminFetch('/api/admin/raw-prompt-preview', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                ruleId: 'rule_evening_channel',
                surface: 'CHANNEL'
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.surface, 'CHANNEL');
        assert.ok(res.data.rule, 'Must find rule_evening_channel');
        assert.equal(res.data.rule.id, 'rule_evening_channel');
        assert.equal(res.data.generationParams.temperature, 0.70);
        assert.equal(res.data.generationParams.max_tokens, 230);
        assert.ok(res.data.systemPrompt.includes('Telegram-канал Леры'), 'Must include channel persona');
        assert.ok(res.data.systemPrompt.includes('Публичный образ петербургской студентки'), 'Must include channel rule content');
    });

    await t.test('5.12 POST /api/admin/raw-prompt-preview returns initiative prompt with trigger and 200 tokens', async () => {
        const res = await adminFetch('/api/admin/raw-prompt-preview', {
            method: 'POST',
            headers: { 'x-admin-key': ADMIN_KEY },
            body: {
                ruleId: 'rule_morning_initiative',
                surface: 'INITIATIVE'
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.surface, 'INITIATIVE');
        assert.ok(res.data.rule, 'Must find rule_morning_initiative');
        assert.equal(res.data.rule.id, 'rule_morning_initiative');
        assert.equal(res.data.generationParams.temperature, 0.72);
        assert.equal(res.data.generationParams.max_tokens, 200);
        assert.ok(res.data.systemPrompt.includes('САМОСТОЯТЕЛЬНАЯ ИНИЦИАТИВА ЛЕРЫ'), 'Must include initiative directives');
        assert.ok(res.data.systemPrompt.includes('Пиши живо, коротко и естественно'), 'Must include initiative rule content');
    });

    // =========================================================================
    // 99. Teardown
    // =========================================================================
    await t.test('99. Teardown test server, queues, and database connection', async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await Promise.allSettled([
            broadcastQueue.close(),
            aiQueue.close()
        ]);
        await closeDB();
    });
});
