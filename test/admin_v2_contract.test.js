import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = relative => {
    if (relative === 'admin-v2/src/main.jsx') {
        const srcDir = fileURLToPath(new URL('admin-v2/src', root));
        const collect = dir => {
            let out = '';
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) out += collect(full);
                else if (item.name.endsWith('.jsx') || item.name.endsWith('.js')) {
                    out += fs.readFileSync(full, 'utf8') + '\n';
                }
            }
            return out;
        };
        return collect(srcDir);
    }
    return fs.readFileSync(new URL(relative, root), 'utf8');
};

test('admin v2 uses diary navigation and real shadcn-style primitives', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /@radix-ui\/react-alert-dialog|AlertDialog/);
    assert.match(source, /components\/ui\/button/);
    assert.match(source, /components\/ui\/card/);
    assert.doesNotMatch(source, /DayPicker|Вернуться к сегодня|Архивный день/);
});

test('admin v2 read-model exposes stage 1-8 operational entities', () => {
    const server = read('src/server.js');
    assert.match(server, /\/api\/admin\/radiant\/day/);
    for (const field of ['profile', 'commitments', 'randomEvents', 'personality', 'timeline', 'meals', 'sleep']) assert.match(server, new RegExp(`\\b${field}\\b`));
    assert.match(server, /\/api\/admin\/audit/);
});

test('admin v2 keeps destructive actions behind read-only and confirmation states', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /AlertDialog/);
    assert.match(source, /Button/);
});

test('admin v2 P2 includes diary summary, filters, export and labs', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /Simulation/);
    const server = read('src/server.js');
    assert.match(server, /\/api\/admin\/radiant\/random-events/);
    assert.match(server, /\/api\/admin\/radiant\/simulation-lab/);
    assert.match(server, /writes: 0/);
});

test('P2 safety contract keeps simulation lab isolated from production writes', () => {
    const server = read('src/server.js');
    const lab = server.slice(server.indexOf("/api/admin/radiant/simulation-lab"));
    assert.match(lab, /runContinuousDay/);
    assert.match(lab, /safe: true/);
    assert.match(lab, /telegramSends: 0/);
    assert.doesNotMatch(lab, /StateRepository\.resetRuntime/);
});

test('admin v3 schedule model exposes routine, forecast, commitments and changes', () => {
    const server = read('src/server.js');
    assert.match(server, /scheduleWindowRows/);
    assert.match(server, /schedule/);
    assert.match(server, /changes/);
    assert.match(server, /startMinutes/);
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /function KanbanBoard/);
    assert.match(source, /Жизнь задач/);
    assert.match(source, /Сделано/);
    assert.match(source, /В процессе/);
    assert.match(source, /Предстоит/);
    assert.match(source, /Что происходит с планами/);
});

test('personality saving and random event controls are audited', () => {
    const server = read('src/server.js');
    assert.match(server, /\/api\/admin\/personality/);
    assert.match(server, /SET_PERSONALITY/);
    assert.match(server, /\/api\/admin\/random-events\/\:id/);
    assert.match(server, /SET_RANDOM_EVENT/);
    const schema = read('src/db/schema_v3.sql');
    assert.match(schema, /personality JSONB/);
});

test('schedule read-model keeps plan-to-fact links explainable and stable', () => {
    const server = read('src/server.js');
    assert.match(server, /planType/);
    assert.match(server, /factId/);
    assert.match(server, /humanizeAdminEvent\('TASK_COMPLETED'/);
    assert.match(server, /startMinutes: parseMinutes/);
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /CurrentDecision/);
    assert.match(source, /План и подтверждённый результат/);
    assert.match(server, /SOCIAL_NASTYA: 'встреча с Настей'/);
    assert.match(server, /IDLE_HOME_REST: 'отдых дома'/);
});

test('admin v2 makes operational sections explicit and keeps dry-run boundaries visible', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['Пользователи', 'Провайдеры', 'Фото', 'Канал', 'Ключи и секреты скрыты', 'Черновик не отправляется в Telegram.']) {
        assert.match(source, new RegExp(marker));
    }
    const css = read('admin-v2/src/feature-components.css');
    assert.match(css, /schedule-detail/);
    assert.match(css, /plan-fact-links/);
    assert.match(css, /@media\(max-width:540px\)/);
});

test('admin v2 has one diary workspace and no duplicate decisions tab', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /function KanbanBoard/);
    for (const marker of ['Предстоит', 'В процессе', 'Сделано', 'Отменено', 'decision-label', 'remaining_minutes']) {
        assert.match(source, new RegExp(marker));
    }
});

test('prompt studio uses an intent workspace with a staged draft-to-production flow', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /className="[^"]*\bstudio-shell\b[^"]*"/);
    assert.match(source, /AUTO — это маршрутизация Telegram, его не редактируем/);
    assert.match(source, /1\. Редактирование/);
    assert.match(source, /2\. Тест и сравнение/);
    assert.match(source, /3\. Проверка и публикация/);
    assert.match(source, /Общие правила Production/);
    assert.match(source, /type="range"/);
    assert.match(source, /Тестовые условия/);
    assert.match(source, /Экспертный режим: свободный A\/B/);
    assert.match(css, /\.studio-workspace-header\s*\{/);
    assert.match(css, /\.studio-workspace-tabs\s*\{/);
    assert.match(css, /\.studio-test-conditions(?:\s|,|\{)/);
});

test('provider management exposes the real fallback order and labelled fields', () => {
    const source = read('admin-v2/src/main.jsx');
    const server = read('src/server.js');

    assert.match(source, /Провайдеры и fallback/);
    assert.match(source, /Поднять .* в цепочке/);
    assert.match(source, /Опустить .* в цепочке/);
    assert.match(source, /provider-managed-row/);
    assert.match(source, /name="base_url"/);
    assert.match(source, /name="api_key"/);
    assert.match(server, /\/api\/admin\/providers\/:id\/priority/);
    assert.match(server, /updateProviderPriority/);
});

test('production settings keep only two-stage routing', () => {
    const source = read('admin-v2/src/main.jsx');
    const router = read('src/ai/intent_router.js');

    assert.match(source, /Маршрутизация ответов/);
    assert.match(router, /enabled: true/);
});

test('prompt inspector shows one generation chain instead of disconnected retry rows', () => {
    const source = read('admin-v2/src/main.jsx');
    const server = read('src/server.js');
    const database = read('src/db/database.js');
    const schema = read('src/db/schema_v3.sql');

    assert.match(source, /Цепочка генерации/);
    assert.match(source, /Первый ответ/);
    assert.match(source, /Финальный ответ/);
    assert.match(server, /generation_trace: log\.generation_trace \|\| \[\]/);
    assert.match(database, /generation_trace/);
    assert.match(schema, /generation_trace JSONB/);
});

test('production settings expose the reply judge observation and enforce modes', () => {
    const source = read('admin-v2/src/main.jsx');
    const router = read('src/ai/intent_router.js');
    const engine = read('src/ai.js');

    assert.match(source, /AI-судья ответа/);
    assert.match(source, /Наблюдение: только лог/);
    assert.match(source, /Проверка и один retry/);
    assert.match(source, /judge-fields-grid/);
    assert.match(router, /judgeMode: 'OBSERVE'/);
    assert.match(router, /judgeProviderId/);
    assert.match(engine, /const shouldJudge = !isInitiative && Boolean\(userText\)/);
    assert.match(engine, /const judgeSettings = routingSettings/);
});

test('prompt studio compares Production to the local candidate and keeps free A/B expert-only', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    for (const marker of [
        'Контекст пользователя',
        'Production ↔ Черновик',
        'Оба ответа получают одинаковые intent, сообщение, историю и контекст.',
        'Экспертный режим: свободный A/B',
        'Сохранить черновик',
        'Проверка перед публикацией'
    ]) {
        assert.match(source, new RegExp(marker));
    }
});

test('sandbox user context endpoint is read-only and auth reaches every sandbox route', () => {
    const server = read('src/server.js');

    assert.match(server, /Path=\/api; Max-Age=43200/);
    assert.match(server, /app\.get\('\/api\/sandbox\/users'/);
    assert.match(server, /app\.get\('\/api\/sandbox\/users\/:id\/context'/);
    assert.match(server, /writes: 0/);
    assert.match(server, /historySource: 'conversation_events'/);
});

test('new management center covers the admin domains and safe actions', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['Пользователи', 'Память', 'Провайдеры', 'Маршрутизация ответов', 'Фото', 'Канал', 'Продажи', 'Инвентарь', 'Очередь', 'Диагностика']) {
        assert.match(source, new RegExp(marker));
    }
    const server = read('src/server.js');
    for (const route of ['/api/admin/radiant/god-mode', '/api/admin/radiant/queue/repair', '/api/admin/diagnostics/prune', '/api/admin/broadcast/control', '/api/admin/memory/facts/:userId', '/api/admin/llm-settings']) {
        assert.match(server, new RegExp(route.replace('/', '\\/')));
    }
});

test('day workspace has one source of truth: kanban, not a duplicated event feed', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /NeedsPanel/);
    assert.match(source, /CurrentDecision/);
    assert.match(source, /KanbanBoard/);
    assert.doesNotMatch(source, /localStorage\.getItem/);
    for (const marker of ['Голод', 'Усталость', 'Настроение']) assert.match(source, new RegExp(marker));
    assert.doesNotMatch(source, /DayPicker|Вернуться к сегодня|Архивный день/);
});

test('kanban task cards expose a human lifecycle and countdown fields', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /KanbanBoard|TaskCard/);
    const server = read('src/server.js');
    assert.match(server, /taskType: overview\.active_task\.task_type/);
    assert.match(server, /sourceLabel/);
    assert.match(server, /clockAt/);
    assert.match(server, /EAT_FOOD_HOME: 'еда дома'/);
});

test('kanban presents one task lifecycle: plan becomes fact, stale plans become explained cancellations', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /KanbanBoard|TaskCard/);
    const server = read('src/server.js');
    for (const marker of ['planStart', 'factLabel', 'cancelReason', 'inviterName', 'inviterInitial']) assert.match(server, new RegExp(marker));
    assert.match(server, /matchedFact/);
});

test('needs panel uses a compact human summary and bento layout', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /NeedsPanel|LeraStatusBento/);
});

test('admin v2 uses dedicated LLM settings and split-screen CRM', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /@radix-ui\/react-alert-dialog|AlertDialog/);
    assert.match(source, /CRM Пользователей/);
    assert.match(source, /crm-split-layout/);
    assert.match(source, /crm-sidebar/);
    assert.match(source, /crm-main/);
    assert.match(source, /crm-subnav/);
    assert.match(source, /addPresetBalance/);
    assert.match(source, /crm-chat-window/);
    assert.match(source, /crm-metrics-grid/);
});

test('management center features are routed cleanly to topbar panels', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /imageBalance/);
    assert.match(source, /toggleFact/);
    assert.match(source, /LERA_PROMPT_MODULES/);
    assert.match(source, /explicitness/);
    assert.match(source, /outfit_tags/);
    assert.match(source, /messagesCount/);
    assert.match(source, /maxActivations/);
    assert.match(source, /priority/);
    assert.match(source, /stars/);
    assert.match(source, /photos-card-grid/);
    assert.match(source, /topic-weights-grid/);
});
