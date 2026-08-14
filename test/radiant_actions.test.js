/**
 * Unit & Integration Test Suite for RADIANT Actions + Needle Router
 * Step 1 Vertical Slice Verification
 */

import assert from 'assert';
import { actionRegistry, actionRouter, executeAction, webSearchAction } from '../src/radiant/actions/index.js';
import { NeedleAdapter } from '../src/radiant/actions/adapters/needle.js';
import { ContextBuilder } from '../src/ai/context_builder.js';

async function runTests() {
    console.log('--- STARTING RADIANT ACTIONS TEST SUITE ---');
    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    };

    // 1. Registry tests
    await test('Registry: contract validation', () => {
        assert.throws(() => actionRegistry.validateContract(null), /должен быть объектом/);
        assert.throws(() => actionRegistry.validateContract({ name: 'test' }), /description/);
        assert.throws(() => actionRegistry.validateContract({ name: 'test', description: 'desc' }), /inputSchema/);
        assert.throws(() => actionRegistry.validateContract({ name: 'test', description: 'desc', inputSchema: {} }), /execute/);
    });

    await test('Registry: register, get, getEnabled, getSchemas', () => {
        const dummyAction = {
            name: 'test_dummy',
            description: 'Dummy test action',
            inputSchema: { type: 'object', properties: { val: { type: 'string' } }, required: ['val'] },
            execute: async (args) => ({ result: args.val })
        };
        actionRegistry.register(dummyAction);
        assert.strictEqual(actionRegistry.get('test_dummy').name, 'test_dummy');

        const schemas = actionRegistry.getSchemas();
        const hasDummy = schemas.some(s => s.name === 'test_dummy');
        assert.strictEqual(hasDummy, true);

        // Test override disable
        actionRegistry.setOverride('test_dummy', { enabled: false });
        const enabledSchemas = actionRegistry.getSchemas();
        assert.strictEqual(enabledSchemas.some(s => s.name === 'test_dummy'), false);

        // Reset
        actionRegistry.setOverride('test_dummy', { enabled: true });
    });

    // 2. Executor tests
    await test('Executor: executes valid action and returns canonical ActionResult', async () => {
        const res = await executeAction({
            name: 'test_dummy',
            args: { val: 'hello radiant' }
        });
        assert.strictEqual(res.status, 'success');
        assert.strictEqual(res.action, 'test_dummy');
        assert.deepStrictEqual(res.data, { result: 'hello radiant' });
        assert.strictEqual(typeof res.meta.durationMs, 'number');
        assert.strictEqual(res.error, null);
    });

    await test('Executor: rejects unknown action without throwing', async () => {
        const res = await executeAction({ name: 'non_existent_tool_123' });
        assert.strictEqual(res.status, 'error');
        assert.strictEqual(res.error.code, 'UNKNOWN_ACTION');
    });

    await test('Executor: rejects disabled action', async () => {
        actionRegistry.setOverride('test_dummy', { enabled: false });
        const res = await executeAction({ name: 'test_dummy', args: { val: 'test' } });
        assert.strictEqual(res.status, 'error');
        assert.strictEqual(res.error.code, 'ACTION_DISABLED');
        actionRegistry.setOverride('test_dummy', { enabled: true });
    });

    await test('Executor: validates inputSchema and rejects invalid args', async () => {
        const res = await executeAction({ name: 'test_dummy', args: {} });
        assert.strictEqual(res.status, 'error');
        assert.strictEqual(res.error.code, 'INVALID_ARGUMENTS');
    });

    await test('Executor: handles action timeout safely', async () => {
        const slowAction = {
            name: 'slow_action',
            description: 'Slow action for timeout test',
            inputSchema: { type: 'object' },
            timeoutMs: 50,
            execute: async () => {
                await new Promise(r => setTimeout(r, 200));
                return 'done';
            }
        };
        actionRegistry.register(slowAction);
        const res = await executeAction({ name: 'slow_action' });
        assert.strictEqual(res.status, 'error');
        assert.strictEqual(res.error.code, 'ACTION_TIMEOUT');
    });

    await test('Executor: handles runtime exception safely', async () => {
        const buggyAction = {
            name: 'buggy_action',
            description: 'Buggy action',
            inputSchema: { type: 'object' },
            execute: async () => {
                throw new Error('Something broke inside plugin');
            }
        };
        actionRegistry.register(buggyAction);
        const res = await executeAction({ name: 'buggy_action' });
        assert.strictEqual(res.status, 'error');
        assert.strictEqual(res.error.code, 'ACTION_EXECUTION_ERROR');
        assert.ok(res.error.message.includes('Something broke inside plugin'));
    });

    // 3. Needle Adapter tests
    await test('Needle Adapter: handles offline sidecar with ROUTER_OFFLINE', async () => {
        const deadAdapter = new NeedleAdapter({ endpoint: 'http://127.0.0.1:59999/v1/route', timeoutMs: 100 });
        const res = await deadAdapter.route({
            message: 'привет',
            schemas: [{ name: 'test', description: 'test', inputSchema: {} }]
        });
        assert.strictEqual(res.status, 'ROUTER_OFFLINE');
        assert.strictEqual(res.decision, 'fallback');
    });

    await test('Needle Adapter: correctly parses unified response with mode and action', async () => {
        const adapter = new NeedleAdapter({ endpoint: 'http://mock-needle/v1/route' });
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                type: 'action',
                mode: 'CASUAL',
                action: 'weather',
                arguments: { city: 'Санкт-Петербург' },
                confidence: 0.95,
                latency_ms: 12.5
            })
        });

        try {
            const res = await adapter.route({ message: 'какая погода?', schemas: [{ name: 'weather' }] });
            assert.strictEqual(res.status, 'SUCCESS');
            assert.strictEqual(res.mode, 'CASUAL');
            assert.strictEqual(res.action, 'weather');
            assert.strictEqual(res.arguments.city, 'Санкт-Петербург');
            assert.strictEqual(res.confidence, 0.95);
        } finally {
            global.fetch = originalFetch;
        }
    });

    // 4. Router tests
    await test('Router: transparent fallback to LLM when router offline', async () => {
        const routing = await actionRouter.routeAndExecute({
            userText: 'что происходит в городе?',
            userId: 1
        });
        // Needle offline -> FALLBACK_TO_LLM, actionResult is null
        assert.strictEqual(routing.decision, 'FALLBACK_TO_LLM');
        assert.strictEqual(routing.actionResult, null);
        assert.strictEqual(routing.trace.status, 'ROUTER_OFFLINE');
    });

    // 5. ContextBuilder ActionResult formatting
    await test('ContextBuilder: formats successful ActionResult with sources', () => {
        const mockActionResult = {
            action: 'web_search',
            status: 'success',
            data: {
                text: 'В Севкабеле проходит фестиваль крафтовой еды.',
                sources: [
                    { title: 'Севкабель Порт', url: 'https://sevcabelport.ru' }
                ],
                searchQueries: ['севкабель порт события']
            },
            meta: { durationMs: 400, cached: false, provider: 'gemini_grounding' },
            error: null
        };
        const promptBlock = ContextBuilder.formatActionResultPrompt(mockActionResult);
        assert.ok(promptBlock.includes('=== ⚡ АКТУАЛЬНЫЕ ДАННЫЕ (ACTION RESULT) ==='));
        assert.ok(promptBlock.includes('Действие: web_search'));
        assert.ok(promptBlock.includes('В Севкабеле проходит фестиваль крафтовой еды.'));
        assert.ok(promptBlock.includes('Севкабель Порт: https://sevcabelport.ru'));
    });

    await test('ContextBuilder: formats error ActionResult cleanly', () => {
        const errorActionResult = {
            action: 'web_search',
            status: 'error',
            error: { code: 'ACTION_TIMEOUT', message: 'превышен лимит времени' }
        };
        const promptBlock = ContextBuilder.formatActionResultPrompt(errorActionResult);
        assert.ok(promptBlock.includes('=== ⚡ ВНЕШНЕЕ ДЕЙСТВИЕ (ОШИБКА) ==='));
        assert.ok(promptBlock.includes('превышен лимит времени'));
    });

    // 6. Web Search Plugin Contract & Gemini Parser Mock
    await test('WebSearch: has valid schema and provider structure', () => {
        assert.strictEqual(webSearchAction.name, 'web_search');
        assert.strictEqual(typeof webSearchAction.execute, 'function');
        assert.strictEqual(webSearchAction.inputSchema.required[0], 'query');
    });

    await test('GeminiSearchProvider: correctly parses groundingMetadata and sources', async () => {
        const { GeminiSearchProvider } = await import('../src/radiant/actions/plugins/web_search.js');
        const provider = new GeminiSearchProvider({ apiKey: 'fake_key', model: 'gemini-2.5-flash' });
        
        // Mock global.fetch for this test
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Фестиваль уличного искусства Порт Арт проходит до конца августа.' }]
                        },
                        groundingMetadata: {
                            webSearchQueries: ['севкабель порт арт 2026'],
                            groundingChunks: [
                                {
                                    web: {
                                        title: 'Севкабель Порт - Официальный сайт',
                                        uri: 'https://sevcabelport.ru/events/art'
                                    }
                                }
                            ]
                        }
                    }
                ]
            })
        });

        try {
            const res = await provider.search('севкабель порт');
            assert.strictEqual(res.text, 'Фестиваль уличного искусства Порт Арт проходит до конца августа.');
            assert.strictEqual(res.sources.length, 1);
            assert.strictEqual(res.sources[0].title, 'Севкабель Порт - Официальный сайт');
            assert.strictEqual(res.sources[0].url, 'https://sevcabelport.ru/events/art');
            assert.strictEqual(res.searchQueries[0], 'севкабель порт арт 2026');
        } finally {
            global.fetch = originalFetch;
        }
    });

    // 7. Weather Action Contract & Execution
    await test('WeatherAction: executes and returns formatted weather', async () => {
        const { weatherAction } = await import('../src/radiant/actions/plugins/weather.js');
        const res = await executeAction({ name: 'weather', args: {} });
        assert.strictEqual(res.status, 'success');
        assert.strictEqual(res.action, 'weather');
        assert.ok(res.data.text.includes('Погода в Санкт-Петербурге'));
        assert.strictEqual(res.meta.provider, 'open_meteo');
    });

    // 8. SPB Places Action Contract & Search
    await test('SPBPlacesAction: searches known locations', async () => {
        const { spbPlacesAction } = await import('../src/radiant/actions/plugins/spb_places.js');
        const res = await executeAction({ name: 'spb_places', args: { query: 'Слой' } });
        assert.strictEqual(res.status, 'success');
        assert.strictEqual(res.action, 'spb_places');
        assert.ok(res.data.text.includes('Кофейня Слой'));
        assert.strictEqual(res.meta.count, 1);
    });

    await test('SPBPlacesAction: handles unknown locations gracefully', async () => {
        const res = await executeAction({ name: 'spb_places', args: { query: 'несуществующее_место_123' } });
        assert.strictEqual(res.status, 'success');
        assert.strictEqual(res.meta.count, 0);
        assert.ok(res.data.text.includes('не найдено'));
    });

    // 9. SSRF Guard Tests
    await test('SsrfGuard: validates safe public URLs and rejects invalid protocols', async () => {
        const { SsrfGuard } = await import('../src/radiant/actions/security/ssrf_guard.js');
        const valid = SsrfGuard.validateUrl('https://api.weather.com/v1/forecast');
        assert.strictEqual(valid.protocol, 'https:');
        assert.throws(() => SsrfGuard.validateUrl('ftp://example.com/file'), /Запрещенный протокол/);
    });

    await test('SsrfGuard: blocks cloud metadata IP', async () => {
        const { SsrfGuard } = await import('../src/radiant/actions/security/ssrf_guard.js');
        // Simulate production mode
        const oldEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            assert.throws(() => SsrfGuard.validateUrl('http://169.254.169.254/latest/meta-data'), /заблокировано/);
        } finally {
            process.env.NODE_ENV = oldEnv;
        }
    });

    // 10. MCP Client Tests (JSON-RPC tools/list and tools/call)
    await test('McpClient: discovers tools via tools/list', async () => {
        const { McpClient } = await import('../src/radiant/actions/adapters/mcp_client.js');
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    tools: [
                        {
                            name: 'get_crypto_price',
                            description: 'Получить курс криптовалюты',
                            inputSchema: { type: 'object', properties: { symbol: { type: 'string' } } }
                        }
                    ]
                }
            })
        });

        try {
            const tools = await McpClient.discoverTools('http://fake-mcp:3000/sse');
            assert.strictEqual(tools.length, 1);
            assert.strictEqual(tools[0].name, 'get_crypto_price');
            assert.strictEqual(tools[0].description, 'Получить курс криптовалюты');
        } finally {
            global.fetch = originalFetch;
        }
    });

    await test('McpClient: calls tool via tools/call', async () => {
        const { McpClient } = await import('../src/radiant/actions/adapters/mcp_client.js');
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    content: [{ type: 'text', text: 'BTC: $98,500' }]
                }
            })
        });

        try {
            const res = await McpClient.callTool('http://fake-mcp:3000/sse', 'get_crypto_price', { symbol: 'BTC' });
            assert.strictEqual(res.text, 'BTC: $98,500');
            assert.strictEqual(res.isError, false);
        } finally {
            global.fetch = originalFetch;
        }
    });

    // 11. Webhook Client Tests
    await test('WebhookClient: executes HTTP POST and parses response', async () => {
        const { WebhookClient } = await import('../src/radiant/actions/adapters/webhook_client.js');
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ status: 'ok', rate: 101.5 })
        });

        try {
            const res = await WebhookClient.executeWebhook({
                url: 'https://api.example.com/rates',
                method: 'POST',
                args: { currency: 'USD' }
            });
            assert.strictEqual(res.data.rate, 101.5);
            assert.strictEqual(res.status, 200);
        } finally {
            global.fetch = originalFetch;
        }
    });

    console.log(`\n--- TEST RESULTS: ${passed} passed, ${failed} failed ---`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
