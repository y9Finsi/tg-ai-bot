import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

test('admin v2 uses diary navigation and real shadcn-style primitives', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /@radix-ui\/react-tabs/);
    assert.match(source, /@radix-ui\/react-alert-dialog/);
    assert.match(source, /components\/ui\/button/);
    assert.match(source, /components\/ui\/card/);
    assert.match(source, /Дневник дня/);
    assert.match(source, /Настройки LLM/);
    assert.match(source, /Только чтение/);
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
    assert.match(source, /disabled=\{readOnly\}/);
    assert.match(source, /Сбросить runtime\?/);
    assert.match(source, /фактическ.*событ/);
});

test('admin v2 P2 includes diary summary, filters, export and labs', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['Итог дня', 'Экспорт', 'Random Event Lab', 'Personality Lab', 'Simulation Lab', 'Люди вокруг Леры', 'Запустить сравнение']) {
        assert.match(source, new RegExp(marker));
    }
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
    assert.doesNotMatch(source, /function ScheduleTimeline/);
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
    const css = read('admin-v2/src/styles.css');
    assert.match(css, /schedule-detail/);
    assert.match(css, /plan-fact-links/);
    assert.match(css, /@media\(max-width:540px\)/);
});

test('admin v2 has one diary workspace and no duplicate decisions tab', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /Дневник дня/);
    assert.doesNotMatch(source, /Причины решений/);
    assert.doesNotMatch(source, /value="decisions"/);
    assert.match(source, /function KanbanBoard/);
    for (const marker of ['Предстоит', 'В процессе', 'Сделано', 'Отменено', 'decision-symbol', 'remaining_minutes']) {
        assert.match(source, new RegExp(marker));
    }
    assert.doesNotMatch(source, /view === 'decisions'/);
});

test('sandbox uses a chat-first layout and keeps technical controls collapsed', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/styles.css');

    assert.match(source, /className="[^"]*\bstudio-shell\b[^"]*"/);
    assert.match(source, /className="studio-workbench"/);
    assert.match(source, /className="studio-chat-card"/);
    assert.match(source, /type="range"/);
    assert.match(source, /Переопределения контекста/);
    assert.match(source, /className="studio-debug"/);
    assert.match(source, /sandbox-production-settings/);
    assert.match(css, /\.studio-chat-card \{/);
    assert.match(css, /\.studio-section \{/);
    assert.match(css, /\.sandbox-history-bubble/);
});

test('sandbox keeps chat actions and A/B replies in one compact Telegram-like flow', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/styles.css');

    for (const marker of [
        'Контекст пользователя',
        'Сравнивать ответы A/B',
        'sandbox-current-message',
        'sandbox-chat-answers',
        'sandbox-result-bubble',
        'Сохранить как пресет',
        'Опубликовать',
        'sandbox-send-button'
    ]) {
        assert.match(source, new RegExp(marker));
    }
    assert.match(source, /<Play size=\{14\} \/>/);
    assert.match(css, /\.sandbox-result-tabs \{/);
    assert.match(css, /\.sandbox-result-toolbar \{ display: flex;/);
    assert.match(css, /\.sandbox-regenerate-button \{/);
    assert.match(css, /\.sandbox-send-button \{[^}]*background: #172554/);
    assert.match(css, /\.sandbox-result-bubble \{/);
    assert.match(source, /className="studio-intent-tabs" role="tablist" aria-label="Intent"/);
    assert.match(css, /\.studio-intent-tabs \{/);
});

test('sandbox keeps A/B configuration and result selection in adjacent tabs', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/styles.css');

    assert.match(source, /className="studio-variant-tabs" role="tablist" aria-label="Редактируемый вариант"/);
    assert.match(source, /Вариант A<\/button>/);
    assert.match(source, /Вариант B<\/button>/);
    assert.match(source, /className="sandbox-result-tabs" role="tablist" aria-label="Ответы A\/B"/);
    assert.match(source, /onClick=\{\(\) => setSelectedVariant\('A'\)\}/);
    assert.match(source, /onClick=\{\(\) => setSelectedVariant\('B'\)\}/);
    assert.doesNotMatch(source, /<summary>Variant B/);
    assert.doesNotMatch(source, /sandbox-chat-answers', abMode && 'is-ab'/);
    assert.match(css, /\.studio-variant-tabs, \.sandbox-result-tabs \{ display: flex;/);
    assert.match(css, /\.studio-variant-tab\.is-active, \.sandbox-result-tab\.is-active/);
    assert.doesNotMatch(css, /\.sandbox-chat-answers\.is-ab/);
});

test('sandbox user context endpoint is read-only and auth reaches every sandbox route', () => {
    const server = read('src/server.js');

    assert.match(server, /Path=\/api; Max-Age=43200/);
    assert.match(server, /app\.get\('\/api\/sandbox\/users'/);
    assert.match(server, /app\.get\('\/api\/sandbox\/users\/:id\/context'/);
    assert.match(server, /writes: 0/);
    assert.match(server, /historySource: eventHistory\.length \? 'conversation_events' : 'chat_history'/);
});

test('new management center covers the legacy admin domains and safe actions', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['Пользователи', 'Память', 'Провайдеры', 'Промпт Леры', 'Фото', 'Канал', 'Продажи', 'Инвентарь', 'Очередь', 'Диагностика']) {
        assert.match(source, new RegExp(marker));
    }
    for (const marker of ['FORECAST_REBUILD', 'radiant/queue/repair', 'diagnostics/prune', 'broadcast/control', 'radiant/god-mode', 'memory/facts', 'llm-settings', 'channel/draft', 'channel/publish-draft']) {
        assert.match(source, new RegExp(marker.replace('/', '\\/')));
    }
    assert.match(source, /ConfirmAction title="Применить God Mode\?/);
    assert.match(source, /ConfirmAction title="Поставить рассылку в очередь\?/);
    const server = read('src/server.js');
    for (const route of ['/api/admin/radiant/god-mode', '/api/admin/radiant/queue/repair', '/api/admin/diagnostics/prune', '/api/admin/broadcast/control', '/api/admin/memory/facts/:userId', '/api/admin/llm-settings']) {
        assert.match(server, new RegExp(route.replace('/', '\\/')));
    }
});

test('day workspace has one source of truth: kanban, not a duplicated event feed', () => {
    const source = read('admin-v2/src/main.jsx');
    const diary = source.slice(source.indexOf("{view === 'diary'"), source.indexOf("}{view === 'dialogs'"));
    assert.match(diary, /NeedsPanel/);
    assert.match(diary, /CurrentDecision/);
    assert.match(diary, /KanbanBoard/);
    assert.doesNotMatch(diary, /TimelineFilters|RandomEventLab|PersonalityLab|SimulationLab|NpcPanel|Commitments/);
    assert.doesNotMatch(source, /localStorage\.getItem/);
    const planned = source.indexOf("['planned', 'Задачи'");
    const active = source.indexOf("['active', 'В процессе'");
    const done = source.indexOf("['done', 'Сделано'");
    assert.ok(planned < active && active < done);
    for (const marker of ['Состояние Леры', 'Голод', 'Усталость', 'Настроение']) assert.match(source, new RegExp(marker));
    assert.doesNotMatch(source, /DayPicker|Вернуться к сегодня|Архивный день/);
});

test('kanban task cards expose a human lifecycle and countdown fields', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /EAT_FOOD_HOME: 'Еда дома'/);
    assert.match(source, /Начнётся через/);
    assert.match(source, /Завершится через/);
    assert.match(source, /Завершено в/);
    assert.match(source, /progress_percent/);
    assert.match(source, /remaining_minutes/);
    const server = read('src/server.js');
    assert.match(server, /taskType: overview\.active_task\.task_type/);
    assert.match(server, /sourceLabel/);
    assert.match(server, /clockAt/);
    assert.match(server, /EAT_FOOD_HOME: 'еда дома'/);
});

test('kanban and day mode keep the server snapshot, human statuses and derived mood aligned', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['Просрочено с', 'kanban-item-cancelled', 'План изменился: не успела сделать', 'kanban-item-overdue', 'elapsedSinceSnapshot', 'routine-strip', 'Ближайшее окно']) {
        assert.match(source, new RegExp(marker));
    }
    assert.ok(source.includes('clockAt={data?.at}'));
    assert.match(source, /const sharpNeeds = Object\.entries\(state\?\.needs \|\| \{\}\).*NEED_LABELS/);
    const server = read('src/server.js');
    assert.match(server, /import \{ taskDefinition \} from '\.\/radiant\/task_catalog\.js'/);
    assert.match(server, /const durationMinutes = Number\(item\.payload\?\.durationMinutes/);
    assert.match(server, /taskDefinition\(taskType\)\.durationMinutes/);
    assert.match(server, /state: \{ \.\.\.overview\.state, active_task/);
    assert.match(server, /status === 'OVERDUE'/);
    assert.match(server, /startAt: hasAbsoluteStart/);
});

test('kanban presents one task lifecycle: plan becomes fact, stale plans become explained cancellations', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['Отменено', 'причина:', 'Приглашение', 'inviter', 'Сейчас Лера свободна']) assert.match(source, new RegExp(marker));
    assert.match(source, /planned.*active.*done.*cancelled|cancelled.*Отменено/);
    assert.doesNotMatch(source, /Прогноз не считается выполнением/);
    const server = read('src/server.js');
    for (const marker of ['planStart', 'factLabel', 'cancelReason', 'inviterName', 'inviterInitial']) assert.match(server, new RegExp(marker));
    assert.match(server, /matchedFact/);
    assert.match(source, /!row\.matchedFact/);
    assert.match(server, /matchedFact/);
});

test('needs panel uses a compact human summary and bento layout', () => {
    const source = read('admin-v2/src/main.jsx');
    for (const marker of ['needs-overview', 'needs-compact-grid']) assert.match(source, new RegExp(marker));
    assert.match(source, /Настроение/);
    assert.match(source, /Текущее местоположение/);
    assert.match(source, /Деньги/);
});

test('admin v2 uses dedicated LLM settings and split-screen CRM', () => {
    const source = read('admin-v2/src/main.jsx');
    assert.match(source, /@radix-ui\/react-tabs/);
    assert.match(source, /@radix-ui\/react-alert-dialog/);
    assert.match(source, /Дневник дня/);
    assert.match(source, /Настройки LLM/);
    assert.match(source, /CRM Пользователей/);
    assert.match(source, /Контент и Канал/);
    assert.match(source, /Движок и Операции/);
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
    assert.match(source, /management-note-error/);
    assert.match(source, /LERA_PROMPT_MODULES/);
    assert.match(source, /explicitness/);
    assert.match(source, /outfit_tags/);
    assert.match(source, /messagesCount/);
    assert.match(source, /maxActivations/);
    assert.match(source, /priority/);
    assert.match(source, /stars/);
    assert.match(source, /photos-card-grid/);
    assert.match(source, /topic-weights-grid/);
    assert.match(source, /uploadPhotoFile/);
});
