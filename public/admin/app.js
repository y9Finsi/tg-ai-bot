let selectedMemoryUserId = null;
let selectedMemoryUser = null;
let promptDefaults = null;
let logStream = null;
let radiantMap = null;
let radiantLayer = null;
let devMap = null;
let devMapLayer = null;
let devStream = null;
let devSnapshot = null;
let devPromptLogs = [];
let devGraphData = null;
let lifeTree = null;
let lifeTreeData = null;
let devTransitAnimation = null;
let devLeraMarker = null;
let devRefreshTimer = null;
let healthRefreshTimer = null;

const NEEDS = [
    ['hunger', 'Голод', '🍗'],
    ['fatigue', 'Усталость', '😴'],
    ['boredom', 'Скука', '📺'],
    ['horny', 'Пошлость', '🔥'],
    ['hygiene', 'Гигиена', '🧼'],
    ['bladder', 'Туалет', '🚽'],
    ['mood', 'Настроение', '😊']
];
const TASK_TITLES = { IDLE_HOME_REST: 'Отдыхает дома', BUY_FOOD_STORE: 'Покупает еду во ВкусВилле', WORK_LAPTOP: 'Работает', TRAVEL: 'Идёт по маршруту', EMERGENCY_EAT: 'Срочно ищет еду', EAT_FOOD_HOME: 'Ест дома', ASK_NASTYA_FOR_FOOD: 'Просит Настю о еде', GO_TO_BATHROOM: 'Идёт в туалет', SLEEP_EXHAUSTED: 'Ложится спать', SHOWER_HOME: 'Принимает душ', REST_HOME: 'Отдыхает', INVITE_BAR_NASTYA: 'Идёт к Насте' };

const PROMPT_LABELS = {
    lera_base: 'System Core — личность и биография',
    lera_speech: 'Speech — речь, мат и зумерский сленг',
    lera_intimacy: 'Intimacy — правила интимного режима',
    lera_jokes: 'Jokes — ирония и юмор',
    lera_examples: 'Examples — примеры обычных ответов',
    lera_virt_examples: 'Virtual examples — примеры виртуальных сцен',
    lera_rules: 'Rules — ограничения и обязательные правила'
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function showToast(message, type = 'success') {
    let box = document.getElementById('toast-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-box';
        box.className = 'toast-box';
        document.body.appendChild(box);
    }
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    box.appendChild(item);
    setTimeout(() => item.remove(), 3500);
}

function showLogin() {
    let overlay = document.getElementById('login-overlay');
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.className = 'login-overlay';
    overlay.innerHTML = `
        <form id="login-form" class="login-card">
            <span class="login-kicker">RADIANT LERA</span>
            <h2>Ultimate Command Center</h2>
            <p>Введите <code>ADMIN_WEB_KEY</code>. Ключ сохранится только в защищённой HttpOnly cookie.</p>
            <input id="login-key" type="password" class="input" autocomplete="current-password" placeholder="Admin key" required>
            <button class="btn btn-primary" type="submit">Войти в командный центр</button>
            <small id="login-error"></small>
        </form>`;
    document.body.appendChild(overlay);
    document.getElementById('login-form').addEventListener('submit', loginAdmin);
    document.getElementById('login-key').focus();
}

async function loginAdmin(event) {
    event.preventDefault();
    const key = document.getElementById('login-key').value;
    const error = document.getElementById('login-error');
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ key })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Ошибка входа');
        document.getElementById('login-overlay').remove();
        await initializeDashboard();
    } catch (err) {
        error.textContent = err.message;
    }
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    });

    let data;
    try {
        data = await response.json();
    } catch {
        data = {};
    }
    if (response.status === 401) {
        showLogin();
        throw new Error('Требуется авторизация');
    }
    if (!response.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
}

function switchTab(tabId, button = null) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    (button || document.querySelector(`[data-tab="${tabId}"]`))?.classList.add('active');
    const tabTitles = {
        'tab-overview': ['RADIANT / OVERVIEW', 'Состояние мира'],
        'tab-world': ['WORLD / 01', 'Физический мир'],
        'tab-behavior': ['DAY / 02', 'Как проходит день Леры'],
        'tab-llm': ['LLM / 03', 'Prompt inspector'],
        'tab-users': ['USERS / 04', 'Пользователи и память'],
        'tab-content': ['CONTENT / 05', 'Контент и провайдеры'],
        'tab-system': ['SYSTEM / 06', 'God Mode и система']
    };
    const [kicker, title] = tabTitles[tabId] || ['', ''];
    setText('section-kicker', kicker);
    setText('section-title', title);

    const loaders = {
        'tab-overview': fetchOverview,
        'tab-world': fetchDevSnapshot,
        'tab-behavior': fetchDecisions,
        'tab-llm': async () => { await fetchDevSnapshot(); await fetchPromptSettings(); },
        'tab-users': async () => { await fetchUsers(); await fetchDigests(); },
        'tab-content': async () => { await fetchProviders(); await fetchPhotos(); await fetchChannelSettings(); },
        'tab-system': async () => { await fetchInventory(); await fetchDiagnostics(); }
    };
    loaders[tabId]?.();
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab, button));
    });
    setupCommandPalette();
}

function setupCommandPalette() {
    const trigger = document.querySelector('.command-trigger');
    if (!trigger) return;
    const items = [...document.querySelectorAll('.tab-btn')].map(button => ({
        id: button.dataset.tab,
        title: button.textContent.trim(),
        button
    }));
    const overlay = document.createElement('div');
    overlay.className = 'command-overlay hidden';
    overlay.innerHTML = `<div class="command-dialog" role="dialog" aria-modal="true" aria-label="Search navigation"><input class="command-input" placeholder="Search navigation..." autocomplete="off"><div class="command-results"></div><div class="command-hint"><span>Navigate</span><kbd>↵</kbd><span>Close</span><kbd>Esc</kbd></div></div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.command-input');
    const results = overlay.querySelector('.command-results');
    const close = () => { overlay.classList.add('hidden'); input.value = ''; };
    const render = () => {
        const query = input.value.trim().toLowerCase();
        const filtered = items.filter(item => !query || item.title.toLowerCase().includes(query));
        results.innerHTML = filtered.map((item, index) => `<button class="command-item ${index === 0 ? 'selected' : ''}" data-command-tab="${escapeHtml(item.id)}"><span>${escapeHtml(item.title)}</span><kbd>${index + 1}</kbd></button>`).join('') || '<div class="command-empty">No matching sections</div>';
        results.querySelectorAll('[data-command-tab]').forEach(item => item.addEventListener('click', () => { switchTab(item.dataset.commandTab); close(); }));
    };
    const open = () => { overlay.classList.remove('hidden'); render(); window.requestAnimationFrame(() => input.focus()); };
    trigger.addEventListener('click', open);
    input.addEventListener('input', render);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); overlay.classList.contains('hidden') ? open() : close(); }
        if (event.key === 'Escape' && !overlay.classList.contains('hidden')) close();
        if (!overlay.classList.contains('hidden') && event.key === 'Enter') overlay.querySelector('.command-item.selected')?.click();
    });
}

async function fetchOverview() {
    try {
        const [data, health] = await Promise.all([api('/api/admin/radiant/overview'), api('/api/admin/radiant/health')]);
        renderOverview(data);
        renderHealth(health);
    } catch (err) {
        if (err.message !== 'Требуется авторизация') console.error('Overview:', err);
    }
}

function renderHealth(health) {
    const status = health?.status || 'OFFLINE';
    setText('autonomy-health-status', status === 'ONLINE' ? 'ONLINE' : status === 'DEGRADED' ? 'DEGRADED' : 'OFFLINE');
    setText('autonomy-status', `AUTONOMY ${status}`);
    const age = health?.worker?.tick_age_seconds;
    setText('autonomy-health-detail', health?.worker?.last_success_at ? `Последний тик ${formatDate(health.worker.last_success_at)}${age !== null ? ` · ${age}с назад` : ''}` : 'Успешных тиков ещё нет');
    document.getElementById('autonomy-health-status')?.classList.toggle('health-online', status === 'ONLINE');
    document.getElementById('autonomy-health-status')?.classList.toggle('health-degraded', status === 'DEGRADED');
    document.getElementById('autonomy-health-status')?.classList.toggle('health-offline', status === 'OFFLINE');
}

async function runManualTick() {
    try {
        await api('/api/admin/radiant/tick', { method: 'POST', body: JSON.stringify({}) });
        await fetchOverview();
        showToast('Один 5-минутный тик выполнен');
    } catch (error) {
        showToast(`Manual tick: ${error.message}`, 'error');
    }
}

function renderOverview(data) {
    const state = data.state || {};
    const needs = state.needs || {};
    const physiology = state.physiology || {};
    const active = data.active_task;

    setText('val-location', state.location_name || state.location_id || '—');
    setText('val-rubles', state.wallet?.rubles ?? 0);
    setText('val-stars', state.wallet?.stars ?? 0);
    setText('val-outfit', data.outfit?.text || '—');
    setText('val-active-task', active ? `${active.task_type}, осталось ${active.remaining_minutes} мин` : 'Свободна');
    setText('active-task-title', active ? taskTitle(active.task_type) : 'Нет текущей задачи');
    setText('overview-task-meta', active ? `${active.remaining_minutes} минут · ${active.status}` : 'Движок выберет цель на следующем тике');
    setText('val-willingness', `${data.willingness?.value ?? 0}%`);
    setText('overview-mood', `${state.mood ?? 0}/100`);
    setText('val-willingness-formula', data.willingness?.formula || '—');
    setText('val-modifiers', (state.active_modifiers || []).join(', ') || 'Нет');
    setText('tick-worker-status', `TICK: ${state.last_tick_at ? formatDate(state.last_tick_at) : '—'}`);

    renderCycleGrid(physiology.cycle_day || 1);
    renderNeeds({ ...needs, mood: state.mood });
    renderGoapChain(data.goap_chain || { steps: [] });
    setText('queue-summary', data.queue?.length ? `В исполнительной очереди ${data.queue.length} задач · активная показывается выше` : 'Исполнительная очередь пуста');
    renderMap(data);
    renderDiary(data.diary || []);
    renderLocationSelects(data.locations || {});

    setText('val-nastya-drama', `${Math.round(data.npcs?.nastya?.drama_level ?? 0)}/100`);
    setText('val-max-stress', `${Math.round(data.npcs?.max_client?.deadline_urgency ?? 0)}/100`);
    setText('val-nastya-cooldown', cooldownText(data.npcs?.nastya?.cooldown_until));
    setText('val-max-cooldown', cooldownText(data.npcs?.max_client?.cooldown_until));

    renderSchedule({ forecast: data.forecast, queue: data.queue, state: data.state, activeTask: data.active_task, transit: data.transit, weather: data.weather });
    if (devSnapshot) renderDevPhysical(devSnapshot);
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function setValue(id, value) {
    const node = document.getElementById(id);
    if (node) node.value = value ?? '';
}

function cooldownText(value) {
    return value ? `Cooldown до ${formatDate(value)}` : 'Cooldown не активен';
}

function renderNeeds(needs) {
    const container = document.getElementById('needs-meters');
    if (!container) return;
    container.innerHTML = '';
    NEEDS.forEach(([key, label, icon]) => {
        const raw = Math.max(0, Math.min(100, Number(needs[key] ?? (key === 'hygiene' ? 100 : 0))));
        const value = key === 'hygiene' || key === 'mood' ? raw : 100 - raw;
        const item = document.createElement('div');
        item.className = 'meter-item';
        item.innerHTML = `
            <span>${icon} ${escapeHtml(label)}</span>
            <div class="bar-container"><div class="bar ${key === 'horny' ? 'horny' : ''}" style="width:${value}%"></div></div>
            <span>${raw}/100</span>`;
        container.appendChild(item);
    });
}

function renderCycleGrid(currentDay) {
    const grid = document.getElementById('cycle-days-grid');
    if (!grid) return;
    grid.innerHTML = '';
    setText('val-cycle', currentDay);
    setText(
        'cycle-phase-tag',
        currentDay <= 5 ? '🩸 Менструация' : (currentDay >= 13 && currentDay <= 16 ? '🔥 Овуляция' : '🌸 Обычная фаза')
    );
    for (let day = 1; day <= 28; day++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `cycle-day-cell ${day === currentDay ? 'active-day' : ''} ${day >= 13 && day <= 16 ? 'ovulation' : ''} ${day <= 5 ? 'pms' : ''}`;
        cell.textContent = day;
        cell.title = `Установить день ${day}`;
        cell.addEventListener('click', () => setCycleDay(day));
        grid.appendChild(cell);
    }
}

async function setCycleDay(day) {
    await mutateState({ physiology: { cycle_day: day } });
    showToast(`День цикла установлен: ${day}`);
}

function renderGoapChain(chain) {
    setText('goap-source-label', `ИСТОЧНИК: ${chain.source || 'EMPTY'}${chain.goal ? ` • ЦЕЛЬ: ${chain.goal}` : ''}`);
    const box = document.getElementById('goap-visual-chain');
    if (!box) return;
    box.innerHTML = '';
    const steps = chain.steps || [];
    if (steps.length === 0) {
        box.innerHTML = '<span class="muted">Очередь пуста, подзадач нет.</span>';
        return;
    }
    steps.forEach((step, index) => {
        const node = document.createElement('div');
        node.className = `goap-step ${step.active ? 'active' : ''}`;
        node.title = `Локация: ${step.location || '—'}; приоритет: ${step.priority ?? '—'}; источник: ${step.createdBy || 'GOAP'}`;
        node.textContent = `${step.name} · ${step.remainingMinutes ?? step.durationMinutes ?? '?'}м`;
        box.appendChild(node);
        if (index < steps.length - 1) {
            const arrow = document.createElement('span');
            arrow.className = 'goap-arrow';
            arrow.textContent = '➔';
            box.appendChild(arrow);
        }
    });
}

function renderQueue(queue) {
    ['queue-list', 'inventory-queue-list'].forEach(id => {
        const list = document.getElementById(id);
        if (!list) return;
        list.innerHTML = '';
        if (queue.length === 0) list.innerHTML = '<li class="muted">Очередь пуста</li>';
        queue.forEach((task, index) => {
            const item = document.createElement('li');
            item.innerHTML = `<strong>${index === 0 ? '▶ ' : ''}${escapeHtml(task.task_type)}</strong>
                <span>prio ${task.priority} · ${task.remaining_minutes}м · ${escapeHtml(task.target_location)} · ${escapeHtml(task.created_by)}</span>`;
            list.appendChild(item);
        });
    });
}

async function repairQueue() {
    try {
        const data = await api('/api/admin/radiant/queue/repair', { method: 'POST', body: JSON.stringify({}) });
        const count = Number(data.repair?.cancelled || 0);
        showToast(count ? `Отменено дублей: ${count}` : 'Активных дублей не найдено', count ? 'success' : 'warning');
        if (data.overview) renderOverview(data.overview);
        else await fetchOverview();
    } catch (error) {
        showToast(`Queue repair: ${error.message}`, 'error');
    }
}

async function resetRuntime() {
    if (!confirm('Reset runtime очистит queue, factual history, rationale и forecast. Users, wallet, inventory и память сохранятся. Продолжить?')) return;
    try {
        const requestId = `reset:${Date.now()}`;
        await api('/api/admin/radiant/reset-runtime', { method: 'POST', body: JSON.stringify({ request_id: requestId }) });
        showToast('Runtime сброшен. Следующий тик создаст новую цель.');
        await fetchOverview();
    } catch (error) { showToast(`Reset: ${error.message}`, 'error'); }
}

async function fetchDecisions() {
    try {
        const data = await api('/api/admin/radiant/overview');
        lifeTreeData = data;
        const active = data.active_task;
        const rationale = data.facts?.at(-1) || null;
        const selected = data.selected_goal || {};
        const nextForecast = data.forecast?.nodes?.[0];
        const needSummary = humanNeedSummary(data.state?.needs || {});
        setText('day-brief-title', active ? taskTitle(active.task_type) : 'Лера сейчас свободна');
        setText('day-brief-copy', active
            ? `Она выполняет этот шаг ${active.remaining_minutes || 0} минут. После него движок снова сравнит потребности и выберет следующий шаг.`
            : 'Очередь пуста: на ближайшем тике движок выберет новую цель по потребностям, времени и сигналам Насти/Макса.');
        setText('day-brief-reason', selected.reason || needSummary);
        const nextForecastNode = data.forecast?.nodes?.find(node => node.task_type !== active?.task_type) || nextForecast;
        setText('day-brief-next', nextForecastNode ? taskTitle(nextForecastNode.task_type) : 'будет выбран на тике');
        setText('day-brief-state', `${data.state?.location_name || data.state?.location_id || '—'} · mood ${data.state?.mood ?? 0}`);
        document.getElementById('decision-why').innerHTML = `<strong>${escapeHtml(selected.reason || 'Цель выбирается по текущим потребностям')}</strong><p>${escapeHtml(needSummary)}</p><p>Готовность к внешним командам: ${data.willingness?.value ?? 0}% · погода: ${escapeHtml(data.weather?.status || 'неизвестно')}</p>`;
        setText('decision-raw-rationale', JSON.stringify(data.queue_anomalies || {}, null, 2));
        setText('decision-current-title', active ? taskTitle(active.task_type) : 'Нет текущей задачи');
        setText('decision-current-meta', active ? `${active.status} · ${active.remaining_minutes} мин` : 'Очередь пуста');
        renderLifeTree(data);
    } catch (error) { showToast(`Решения Леры: ${error.message}`, 'error'); }
}

function humanNeedSummary(needs) {
    const labels = { hunger: 'голод', fatigue: 'усталость', boredom: 'скука', hygiene: 'гигиена', bladder: 'туалет', horny: 'интимное напряжение' };
    const entries = Object.entries(labels).map(([key, label]) => ({ label, value: Number(needs[key] || 0), key }));
    const high = entries.filter(item => item.key === 'hygiene' ? item.value < 60 : item.value >= 40).sort((a, b) => b.value - a.value);
    return high.length ? `Сейчас сильнее всего влияет: ${high.slice(0, 2).map(item => `${item.label} ${Math.round(item.value)}`).join(', ')}.` : 'Острые потребности не давят, поэтому работает обычный приоритет дня.';
}

function renderLifeTree(data) {
    const container = document.getElementById('life-tree');
    if (!container || !window.cytoscape) return;
    const queue = data.queue || [];
    const forecast = data.forecast?.nodes || [];
    const selected = data.selected_goal || {};
    const active = data.active_task;
    const elements = [];
    const nodeMap = new Map();
    const addNode = (id, label, kind, status, raw, meta = '') => {
        nodeMap.set(id, raw);
        elements.push({ data: { id, label, kind, status: status || '', meta, raw } });
    };
    addNode('day', 'ДЕНЬ ЛЕРЫ', 'DAY', 'ROOT', data.state, `${data.state?.location_name || 'дом'} · ${data.state?.last_tick_at ? formatDate(data.state.last_tick_at) : 'тик ещё не записан'}`);
    addNode('reason', `ПОЧЕМУ\n${selected.reason || humanNeedSummary(data.state?.needs || {})}`, 'REASON', 'REASON', selected, `score ${Math.round(selected.score || 0)}`);
    elements.push({ data: { id: 'e-day-reason', source: 'day', target: 'reason' } });

    queue.forEach(task => addNode(`q-${task.id}`, `${taskTitle(task.task_type)}\n${task.status}`, 'LIVE', task.status, task, `${task.remaining_minutes || 0}/${task.duration_minutes || 0} мин · ${task.target_location || ''}`));
    const roots = queue.filter(task => !task.parent_task_id && !task.depends_on_task_id);
    (roots.length ? roots : queue.slice(0, 1)).forEach(task => elements.push({ data: { id: `e-reason-q-${task.id}`, source: 'reason', target: `q-${task.id}` } }));
    queue.forEach(task => {
        if (task.parent_task_id) elements.push({ data: { id: `e-parent-${task.id}`, source: `q-${task.parent_task_id}`, target: `q-${task.id}` } });
        else if (task.depends_on_task_id) elements.push({ data: { id: `e-dep-${task.id}`, source: `q-${task.depends_on_task_id}`, target: `q-${task.id}` } });
    });
    addNode('forecast', 'ПОТОМ\nпрогноз дня', 'FORECAST_ROOT', 'FORECAST', data.forecast || {}, data.forecast ? `${data.forecast.date} · версия ${data.forecast.version_number}` : 'ещё не создан');
    elements.push({ data: { id: 'e-day-forecast', source: 'day', target: 'forecast' } });
    forecast.forEach(node => addNode(`f-${node.id}`, `${taskTitle(node.task_type)}\nПРОГНОЗ`, 'FORECAST', node.status || 'FORECAST', node, `${node.planned_duration_minutes || 0} мин · ${node.location_id || ''}`));
    forecast.forEach((node, index) => elements.push({ data: { id: `e-f-${node.id}`, source: index ? `f-${forecast[index - 1].id}` : 'forecast', target: `f-${node.id}` } }));

    const empty = document.getElementById('life-tree-empty');
    empty?.classList.toggle('hidden', elements.length > 2);
    container.innerHTML = '';
    lifeTree?.destroy();
    lifeTree = window.cytoscape({ container, elements, layout: { name: 'breadthfirst', directed: true, padding: 30, spacingFactor: 1.18, avoidOverlap: true }, style: [
        { selector: 'node', style: { 'background-color': '#18181b', 'border-color': '#52525b', 'border-width': 1, label: 'data(label)', color: '#e4e4e7', 'font-size': 11, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 150, 'text-valign': 'center', 'text-halign': 'center', width: 178, height: 58, shape: 'round-rectangle' } },
        { selector: 'node[kind = "DAY"]', style: { 'background-color': '#242427', 'border-color': '#f4f4f5', 'border-width': 2, width: 190, height: 64 } },
        { selector: 'node[kind = "REASON"]', style: { 'background-color': '#2b2413', 'border-color': '#f4b942', color: '#fde68a', shape: 'diamond', width: 190, height: 72 } },
        { selector: 'node[kind = "LIVE"]', style: { 'background-color': '#172554', 'border-color': '#60a5fa' } },
        { selector: 'node[status = "COMPLETED"]', style: { 'background-color': '#13251a', 'border-color': '#22c55e', color: '#bbf7d0' } },
        { selector: 'node[kind = "FORECAST"], node[kind = "FORECAST_ROOT"]', style: { 'background-color': '#2b2413', 'border-color': '#d4a72c', 'border-style': 'dashed', color: '#f4cf7a' } },
        { selector: 'node[status = "IN_PROGRESS"], node[status = "IN_TRANSIT"]', style: { 'border-width': 3 } },
        { selector: 'edge', style: { width: 2, 'line-color': '#52525b', 'target-arrow-color': '#71717a', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } }
    ] });
    lifeTree.on('tap', 'node', event => renderLifeNode(event.target.data('id'), nodeMap.get(event.target.data('id')), event.target.data('kind')));
    setText('life-tree-empty', elements.length ? '' : 'Для дерева пока нет событий.');
}

function renderLifeNode(id, node, kind) {
    const title = document.getElementById('life-node-inspector');
    if (!title) return;
    const label = id === 'day' ? 'День Леры' : id === 'reason' ? 'Причина выбора' : id === 'forecast' ? 'Прогноз дня' : taskTitle(node?.task_type || node?.label);
    title.innerHTML = `<strong>${escapeHtml(label)}</strong><p>${escapeHtml(node?.explanation || node?.reason || node?.metadata?.reason || node?.result?.reason || 'Технических пояснений для этого узла пока нет.')}</p><small>${escapeHtml(JSON.stringify(node || {}, null, 2))}</small>`;
}

function renderDiary(entries) {
    const container = document.getElementById('diary-feed');
    if (!container) return;
    container.innerHTML = '';
    entries.slice().reverse().forEach(entry => {
        const item = document.createElement('div');
        item.className = 'diary-item';
        item.innerHTML = `<time>${escapeHtml(formatDate(entry.occurred_at || entry.timestamp))}</time><p><strong>${escapeHtml(entry.event_type || 'FACT')}</strong> ${escapeHtml(JSON.stringify(entry.payload || entry.raw_log || {}))}</p>`;
        container.appendChild(item);
    });
    if (!entries.length) container.innerHTML = '<p class="muted">Записей пока нет.</p>';
}

function renderLocationSelects(locations) {
    ['god-location', 'preview-location', 'task-location'].forEach(id => {
        const select = document.getElementById(id);
        if (!select || select.options.length > 0) return;
        if (id === 'preview-location') select.add(new Option('Локация без подмены', ''));
        Object.values(locations).forEach(loc => select.add(new Option(loc.name, loc.id)));
    });
}

function renderMap(data) {
    const container = document.getElementById('skyrim-map');
    const leaflet = window.L;
    if (!container || !leaflet) return;
    if (!radiantMap) { radiantMap = leaflet.map(container).setView([59.953, 30.31], 13); leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(radiantMap); radiantLayer = leaflet.layerGroup().addTo(radiantMap); }
    radiantLayer.clearLayers();
    Object.values(data.locations || {}).forEach(location => leaflet.marker(location.coordinates).bindTooltip(`${location.icon || ''} ${location.name}`).addTo(radiantLayer));
    if (data.active_task?.transit_route) leaflet.polyline(data.active_task.transit_route, { color: '#c2410c', weight: 5 }).addTo(radiantLayer);
    const position = data.transit?.coordinate || data.locations?.[data.state?.location_id]?.coordinates;
    if (position) leaflet.marker(position).bindTooltip(`Лера: ${TASK_TITLES[data.active_task?.task_type] || data.active_task?.task_type || 'свободна'}`, { permanent: true }).addTo(radiantLayer);
    setText('map-updated', `${data.weather?.status || 'weather'} · ${new Date().toLocaleTimeString('ru-RU')}`);
}

async function mutateState(payload) {
    try {
        await api('/api/admin/radiant/mutate', { method: 'POST', body: JSON.stringify(payload) });
        await fetchOverview();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function teleportLera() {
    const locationId = document.getElementById('god-location').value;
    if (locationId) await mutateState({ locationId });
}

async function pushTask(taskType, targetLocation, durationMinutes, priority) {
    try {
        await api('/api/admin/radiant/queue/push', {
            method: 'POST',
            body: JSON.stringify({ taskType, targetLocation, durationMinutes, priority })
        });
        showToast(`Задача ${taskType} добавлена`);
        await fetchOverview();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function pushTaskFromForm() {
    const taskType = document.getElementById('task-type').value.trim();
    if (!taskType) return showToast('Укажи TASK_TYPE', 'error');
    return pushTask(
        taskType,
        document.getElementById('task-location').value,
        Number(document.getElementById('task-duration').value),
        Number(document.getElementById('task-priority').value)
    );
}

async function fetchSchedule() {
    try {
        const [overview, mutations] = await Promise.all([api('/api/admin/radiant/overview'), api('/api/admin/radiant/forecast/history')]);
        renderSchedule({ forecast: overview.forecast, queue: overview.queue, state: overview.state, activeTask: overview.active_task, transit: overview.transit, weather: overview.weather, history: mutations.history });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderSchedule(data) {
    const container = document.getElementById('schedule-list');
    if (!container) return;
    const forecast = data.forecast;
    setText('schedule-meta', forecast ? `${forecast.date} · версия ${forecast.version_number} · ${forecast.source}` : 'Прогноз ещё не создан');
    container.innerHTML = (forecast?.nodes || []).map(node => `<article class="schedule-slot ${String(node.status || 'forecast').toLowerCase()}"><time>${escapeHtml(node.intent_key)}</time><div class="schedule-slot-body"><strong>${escapeHtml(TASK_TITLES[node.task_type] || node.task_type)}</strong><small>${escapeHtml(node.location_id)} · ${node.planned_duration_minutes} мин · ${node.status}</small></div></article>`).join('') || '<p class="muted">Нет прогнозных узлов.</p>';
    const fact = document.getElementById('factual-now');
    if (fact) fact.innerHTML = `<article class="diary-item"><strong>${escapeHtml(TASK_TITLES[data.activeTask?.task_type] || data.activeTask?.task_type || 'Свободна')}</strong><p>${escapeHtml(data.state?.location_name || data.state?.location_id || '—')} · mood ${data.state?.mood ?? '—'} · weather ${data.weather?.status || '—'}${data.transit ? ` · transit ${data.transit.progress_percent}%` : ''}</p></article>`;
    const queue = document.getElementById('forecast-queue');
    if (queue) queue.innerHTML = (data.queue || []).map(task => `<li><strong>${escapeHtml(TASK_TITLES[task.task_type] || task.task_type)}</strong> · p${task.priority} · ${task.status}${task.parent_task_id ? ` · parent ${task.parent_task_id}` : ''}</li>`).join('') || '<li>Очередь пуста</li>';
    const history = document.getElementById('forecast-history');
    if (history) history.innerHTML = (data.history || []).map(item => `<article class="diary-item"><strong>${escapeHtml(item.reason)}</strong><p>${escapeHtml(item.source)} · v${item.to_version_number}</p></article>`).join('') || '<p class="muted">Мутаций пока нет.</p>';
}

async function godMode(action) { try { await api('/api/admin/radiant/god-mode', { method: 'POST', body: JSON.stringify({ action }) }); await fetchOverview(); showToast('God Mode применён'); } catch (err) { showToast(err.message, 'error'); } }

function taskTitle(id) { return TASK_TITLES[id] || id || '—'; }

async function fetchDevSnapshot() {
    try {
        const data = await api('/api/admin/devtool/snapshot');
        devSnapshot = data;
        devPromptLogs = data.promptLogs || [];
        renderDevPhysical(data);
        renderDevLlm();
        renderDevRationale(data.rationale || []);
        return data;
    } catch (error) { showToast(`DevTool snapshot: ${error.message}`, 'error'); return null; }
}

function renderDevPhysical(data = devSnapshot) {
    if (!data?.world) return;
    const world = data.world;
    const state = world.state || {};
    const needs = { ...(state.needs || {}), mood: state.mood ?? world.mood ?? 0 };
    setText('dev-snapshot-time', `SNAPSHOT ${formatDate(data.snapshotAt)}`);
    setText('dev-weather-badge', `WEATHER ${String(world.weather?.status || '—').toUpperCase()} · ${world.weather?.is_raining === true ? 'RAIN' : world.weather?.is_raining === false ? 'CLEAR' : 'UNKNOWN'}`);
    setText('dev-map-location', `${state.location_id || '—'} · ${world.activeTask ? taskTitle(world.activeTask.task_type) : 'IDLE'}`);
    const transit = world.transit || (world.active_task?.status === 'IN_TRANSIT' ? { progressPercent: world.active_task.transit_progress_percent, from: world.active_task.transit_from_location, to: world.active_task.transit_to_location, coordinate: world.active_task.transit_coordinate } : null);
    setText('dev-transit-status', transit ? `IN_TRANSIT ${transit.progressPercent ?? transit.progress_percent ?? 0}%` : 'IDLE');
    setText('dev-map-progress', transit ? `${transit.from} → ${transit.to} · ${transit.progressPercent ?? transit.progress_percent ?? 0}%` : 'No active route');
    setText('dev-willingness', `${world.willingness?.value ?? 0}%`);
    setText('dev-willingness-copy', willingnessCopy(world.willingness?.value ?? 0));
    setText('dev-cycle-label', `Cycle day ${state.physiology?.cycle_day || 1}`);
    setText('dev-cycle-description', cycleCopy(state.physiology?.cycle_day || 1));
    renderDevVitals(needs);
    renderDevPaperdoll(world.inventory || []);
    renderDevModifiers(state.active_modifiers || []);
    renderDevMap({ ...world, transit });
}

function willingnessCopy(value) {
    return value < 30 ? `${value}% — Устала/голодна. Команды-распоряжения заблокированы.` : value < 60 ? `${value}% — Согласится не на всё. Нужды требуют внимания.` : `${value}% — Настроение рабочее, готова слушать Богдана.`;
}

function cycleCopy(day) { return day <= 2 ? 'PMS · PMS_CRAMPS · fatigue x1.5' : day >= 12 && day <= 14 ? 'Ovulation · horny x2' : 'Stable phase'; }

function renderDevVitals(needs) {
    const container = document.getElementById('dev-vitals'); if (!container) return;
    const labels = { hunger: 'Hunger', fatigue: 'Fatigue', boredom: 'Boredom', horny: 'Horny', hygiene: 'Hygiene', bladder: 'Bladder', mood: 'Mood' };
    container.innerHTML = Object.entries(labels).map(([key, label]) => {
        const raw = Math.max(0, Math.min(100, Number(needs[key] ?? (key === 'hygiene' ? 100 : 0))));
        const value = key === 'hygiene' || key === 'mood' ? raw : 100 - raw;
        return `<div class="dev-vital"><div class="dev-vital-label"><span>${label}</span><strong>${raw}%</strong></div><div class="dev-vital-track"><i class="${key === 'mood' ? 'mood' : ''}" style="width:${value}%"></i></div></div>`;
    }).join('');
}

function renderDevPaperdoll(inventory) {
    const container = document.getElementById('dev-paperdoll'); if (!container) return;
    const slots = ['outer', 'top', 'bottom', 'shoes'];
    const equipped = inventory.filter(item => item.item_type === 'clothes' && item.is_equipped);
    container.innerHTML = slots.map(slot => {
        const item = equipped.find(entry => (entry.properties || {}).slot === slot);
        return `<div class="dev-paper-slot ${item ? 'filled' : ''}" title="${item ? `rain_resist: ${!!item.properties?.rain_resist}` : 'empty'}"><span>${slot}</span><strong>${escapeHtml(item?.item_id || '—')}</strong><small>${item ? (item.properties?.rain_resist ? '☂ rain_resist' : 'dry only') : 'empty slot'}</small></div>`;
    }).join('');
}

function renderDevModifiers(modifiers) {
    const container = document.getElementById('dev-modifiers'); if (!container) return;
    setText('dev-modifier-count', String(modifiers.length));
    const descriptions = { WET_CLOTHES: 'Mood penalty from rain transit', PMS_CRAMPS: 'Cycle days 1–2 fatigue penalty', HANGOVER: 'Mood and fatigue penalty' };
    container.innerHTML = modifiers.map(modifier => `<span class="dev-chip danger" title="${escapeHtml(descriptions[modifier] || 'Active engine modifier')}">[${escapeHtml(modifier)}]</span>`).join('') || '<span class="muted">No active modifiers</span>';
}

function renderDevMap(world) {
    const container = document.getElementById('dev-map'); const leaflet = window.L;
    if (!container || !leaflet) return;
    if (!devMap) { devMap = leaflet.map(container).setView([59.953, 30.31], 13); leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(devMap); devMapLayer = leaflet.layerGroup().addTo(devMap); }
    devMapLayer.clearLayers();
    devLeraMarker = null;
    Object.values(world.locations || {}).forEach(location => leaflet.marker(location.coordinates).bindTooltip(`${location.icon || ''} ${location.name}`).addTo(devMapLayer));
    const npcs = { Настя: world.locations?.bar_rubinsteina, Макс: world.locations?.showroom_work };
    Object.entries(npcs).forEach(([name, location]) => { if (location) leaflet.circleMarker(location.coordinates, { radius: 7, color: name === 'Настя' ? '#f472b6' : '#38bdf8' }).bindTooltip(name).addTo(devMapLayer); });
    const active = world.activeTask;
    if (active?.transit_route) leaflet.polyline(active.transit_route, { color: '#f59e0b', weight: 4, dashArray: '8 8' }).addTo(devMapLayer);
    const destination = world.transit?.coordinate || world.locations?.[world.state?.location_id]?.coordinates;
    if (destination) {
        const target = destination.map(Number);
        devLeraMarker = leaflet.marker(target, { title: 'Lera' }).bindTooltip(`Lera · ${active ? taskTitle(active.task_type) : 'IDLE'}`, { permanent: true }).addTo(devMapLayer);
    }
    const rain = document.getElementById('dev-rain-overlay');
    rain?.classList.toggle('active', world.weather?.is_raining === true);
}

function renderDevRationale(traces) {
    const container = document.getElementById('dev-rationale-feed'); if (!container) return;
    container.innerHTML = traces.map(trace => `<button class="dev-trace-row" onclick="inspectRationale(${Number(trace.id)})"><span class="dev-trace-time">${escapeHtml(formatDate(trace.created_at))}</span><span class="dev-trace-category">${escapeHtml(trace.category)}</span><strong>${escapeHtml(trace.title)}</strong><small>${escapeHtml(trace.explanation)}</small></button>`).join('') || '<p class="dev-empty">No rationale events.</p>';
}

async function inspectRationale(id) {
    try { const data = await api(`/api/admin/devtool/rationale/${id}`); renderDevNodeInspector(data.trace, data.raw); } catch (error) { showToast(error.message, 'error'); }
}

async function refreshDevGraph() {
    try { devGraphData = await api('/api/admin/devtool/graph'); renderDevGraph(devGraphData); renderDevRationale(devGraphData.rationale || []); } catch (error) { showToast(`Graph: ${error.message}`, 'error'); }
}

function renderDevGraph(data) {
    const canvas = document.getElementById('dev-graph-canvas'); if (!canvas) return;
    const forecastNodes = data.forecast?.nodes || []; const queue = data.queue || [];
    const nodes = [...queue.map(task => ({ data: { id: `q-${task.id}`, label: taskTitle(task.task_type), kind: 'FACT', status: task.status, raw: task } })), ...forecastNodes.map(node => ({ data: { id: `f-${node.id}`, label: taskTitle(node.task_type), kind: 'FORECAST', status: node.status, raw: node } }))];
    const edges = [];
    queue.forEach(task => { if (task.parent_task_id) edges.push({ data: { id: `qe-${task.id}`, source: `q-${task.parent_task_id}`, target: `q-${task.id}` } }); if (task.depends_on_task_id) edges.push({ data: { id: `qd-${task.id}`, source: `q-${task.depends_on_task_id}`, target: `q-${task.id}` } }); });
    (data.forecast?.edges || []).forEach(edge => edges.push({ data: { id: `fe-${edge.id}`, source: `f-${edge.from_node_id}`, target: `f-${edge.to_node_id}` } }));
    if (!nodes.length) { canvas.innerHTML = '<div class="empty">No graph nodes.</div>'; return; }
    if (window.cytoscape) {
        canvas.innerHTML = '';
        window.cytoscape({ container: canvas, elements: [...nodes, ...edges], layout: { name: 'breadthfirst', directed: true, padding: 24, spacingFactor: 1.2 }, style: [
            { selector: 'node', style: { 'background-color': '#18181b', 'border-color': '#52525b', 'border-width': 1, label: 'data(label)', color: '#e4e4e7', 'font-size': 11, 'text-wrap': 'wrap', 'text-max-width': 120, 'text-valign': 'center', width: 150, height: 46 } },
            { selector: 'node[kind = "FORECAST"]', style: { 'background-color': '#2b2413', 'border-color': '#d4a72c', 'border-style': 'dashed' } },
            { selector: 'node[status = "COMPLETED"]', style: { 'background-color': '#13251a', 'border-color': '#22c55e' } },
            { selector: 'node[status = "IN_PROGRESS"], node[status = "IN_TRANSIT"]', style: { 'background-color': '#172554', 'border-color': '#60a5fa', 'border-width': 2 } },
            { selector: 'edge', style: { width: 1.5, 'line-color': '#52525b', 'target-arrow-color': '#71717a', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } }
        ] }).on('tap', 'node', event => { const node = event.target.data('raw'); if (node) renderDevNodeInspector(node, node.payload || node.metadata || node); });
    } else {
        canvas.innerHTML = `<div class="empty">Cytoscape unavailable. ${nodes.length} nodes loaded.</div>`;
    }
    setText('dev-graph-meta', `${data.forecast ? `Forecast v${data.forecast.version_number}` : 'No forecast'} · ${nodes.length} nodes`);
}

function inspectGraphNode(id) {
    const node = [...(devGraphData?.forecast?.nodes || []).map(item => ({ ...item, nodeType: 'FORECAST' })), ...(devGraphData?.queue || []).map(item => ({ ...item, nodeType: 'QUEUE' }))].find(item => `${item.nodeType === 'FORECAST' ? 'f' : 'q'}-${item.id}` === id);
    if (node) renderDevNodeInspector(node, node.payload || node.metadata || node);
}

function renderDevNodeInspector(node, payload) {
    setText('dev-node-title', taskTitle(node.task_type || node.title)); setText('dev-node-kind', node.status || node.nodeType || node.category || 'NODE');
    const container = document.getElementById('dev-node-inspector'); if (!container) return;
    container.innerHTML = `<div class="dev-inspector-kv"><span>Trigger</span><strong>${escapeHtml(node.created_by || node.source || node.category || 'forecast')}</strong><span>Parent</span><strong>${escapeHtml(node.parent_task_id || 'root')}</strong><span>Location</span><strong>${escapeHtml(node.target_location || node.location_id || '—')}</strong></div><h4>Preconditions / payload</h4><pre class="dev-json">${escapeHtml(JSON.stringify(payload || {}, null, 2))}</pre>`;
}

function renderDevLlm() { renderDevPromptLogs(devPromptLogs); }
function filterDevPromptLogs() { renderDevPromptLogs(devPromptLogs); }
function renderDevPromptLogs(logs) {
    const container = document.getElementById('dev-prompt-stream'); if (!container) return;
    const filter = String(document.getElementById('dev-prompt-filter')?.value || '').toLowerCase();
    const filtered = logs.filter(log => !filter || `${log.kind} ${log.user_text} ${log.model}`.toLowerCase().includes(filter));
    container.innerHTML = filtered.map(log => `<button class="dev-prompt-row" onclick="inspectPromptLog(${Number(log.id)}, this)"><div><span class="dev-trace-category">${escapeHtml(log.kind)}</span><span>${escapeHtml(formatDate(log.created_at))}</span></div><strong>${escapeHtml(log.user_text || '[initiative / observer]')}</strong><small>${escapeHtml(log.model || '—')} · ${log.latency_ms || 0}ms · ${log.prompt_tokens || log.usage?.prompt_tokens || 0}→${log.completion_tokens || log.usage?.completion_tokens || 0} tokens</small></button>`).join('') || '<div class="dev-empty">No LLM calls.</div>';
}

async function inspectPromptLog(id, button) {
    document.querySelectorAll('.dev-prompt-row').forEach(node => node.classList.remove('active')); button?.classList.add('active');
    try { const data = await api(`/api/admin/prompt-logs/${id}`); const log = data.log; const xray = document.getElementById('dev-xray'); document.getElementById('dev-xray-empty')?.classList.add('hidden'); xray?.classList.remove('hidden'); if (xray) xray.innerHTML = `<div class="dev-xray-metrics"><span>${escapeHtml(log.provider_name || '—')}</span><span>${escapeHtml(log.model || '—')}</span><span>${log.latency_ms || 0}ms</span><span>${log.prompt_tokens || 0} prompt</span><span>${log.completion_tokens || 0} completion</span><span>${log.total_tokens || 0} total</span><span>$${Number(log.cost_usd || 0).toFixed(6)}</span><span class="${log.command_gate_status === 'COMMAND_REFUSED' ? 'danger-text' : ''}">${escapeHtml(log.command_gate_status || 'NO COMMAND')}</span></div><div class="dev-xray-split"><div><h4>System Prompt Assembly</h4>${inspectorSection('GLOBAL_LERA_STATE', JSON.stringify(data.layers.physics, null, 2))}${inspectorSection('RADIANT_CONTEXT', data.layers.radiant_context)}${inspectorSection('PRIVATE_USER_CONTEXT', JSON.stringify(data.layers.memory_used, null, 2))}${inspectorSection('FULL SYSTEM PROMPT', data.layers.system_prompt)}</div><div><h4>Raw LLM Output</h4>${inspectorSection('RAW RESPONSE', data.layers.raw_response)}${inspectorSection('PARSED RESPONSE', data.layers.parsed_response)}${inspectorSection('MESSAGES', JSON.stringify(data.layers.messages, null, 2))}</div></div>`; } catch (error) { showToast(error.message, 'error'); }
}

function renderDevConsole() { setText('dev-llm-stream-status', devStream ? 'STREAM ONLINE' : 'STREAM OFFLINE'); }
async function devGod(action) { try { await api('/api/admin/radiant/god-mode', { method: 'POST', body: JSON.stringify({ action }) }); await fetchDevSnapshot(); showToast(`${action} applied`); } catch (error) { showToast(error.message, 'error'); } }
async function devSetState() { const number = id => { const value = document.getElementById(id)?.value; return value === '' || value === undefined ? undefined : Number(value); }; const values = { rubles: number('dev-rubles'), stars: number('dev-stars'), needs: { hunger: number('dev-hunger'), fatigue: number('dev-fatigue'), horny: number('dev-horny'), hygiene: number('dev-hygiene') } }; Object.keys(values.needs).forEach(key => values.needs[key] === undefined && delete values.needs[key]); if (!Object.keys(values.needs).length) delete values.needs; Object.keys(values).forEach(key => values[key] === undefined && delete values[key]); await devGodWithValues('SET_STATE', values); }
async function devGodWithValues(action, values) { try { await api('/api/admin/radiant/god-mode', { method: 'POST', body: JSON.stringify({ action, ...values }) }); await fetchDevSnapshot(); showToast(`${action} applied`); } catch (error) { showToast(error.message, 'error'); } }

function appendDevEvent(event) {
    const consoleNode = document.getElementById('dev-event-console');
    if (consoleNode) {
        const line = `[${formatDate(event.timestamp)}] ${event.type}: ${JSON.stringify(event.payload || event)}`;
        consoleNode.textContent = `${line}\n${consoleNode.textContent}`.slice(0, 12000);
    }
    if (event.type === 'prompt_log' || event.type === 'rationale' || event.type === 'god_mode' || event.type === 'command_gate') {
        clearTimeout(devRefreshTimer);
        devRefreshTimer = setTimeout(() => fetchDevSnapshot(), 250);
    }
}

function initDevToolStream() {
    if (devStream) devStream.close();
    devStream = new EventSource('/api/admin/devtool/stream', { withCredentials: true });
    ['connected', 'prompt_log', 'rationale', 'god_mode', 'command_gate'].forEach(type => {
        devStream.addEventListener(type, event => {
            try { appendDevEvent(JSON.parse(event.data)); } catch { /* malformed event is ignored */ }
        });
    });
    devStream.onerror = () => setText('dev-llm-stream-status', 'STREAM RECONNECTING');
    setText('dev-llm-stream-status', 'STREAM ONLINE');
}

async function fetchPromptSettings() {
    try {
        const data = await api('/api/admin/llm-settings');
        ensureLegacyPromptControls();
        promptDefaults = data.defaultParams;
        document.getElementById('llm-temperature')?.setAttribute('value', data.llmParams.temperature);
        document.getElementById('llm-presence')?.setAttribute('value', data.llmParams.presence_penalty);
        document.getElementById('llm-frequency')?.setAttribute('value', data.llmParams.frequency_penalty);
        renderPromptSections(data.prompts || {});
        setValue('prompt-full-preview', data.fullPrompt || '');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderPromptSections(prompts) {
    const container = document.getElementById('prompt-sections');
    container.innerHTML = '';
    Object.entries(prompts).forEach(([key, text], index) => {
        const details = document.createElement('details');
        details.className = 'prompt-section';
        details.open = index === 0;
        details.innerHTML = `<summary>${escapeHtml(PROMPT_LABELS[key] || key)} <span>${String(text).length} символов</span></summary>
            <textarea class="prompt-textarea" data-prompt-key="${escapeHtml(key)}" spellcheck="false"></textarea>`;
        details.querySelector('textarea').value = text;
        container.appendChild(details);
    });
}

function ensureLegacyPromptControls() {
    const container = document.getElementById('prompt-sections');
    if (!container || document.getElementById('llm-temperature')) return;
    const box = document.createElement('div');
    box.className = 'inline-form';
    box.innerHTML = '<label class="metric-label">Temperature<input id="llm-temperature" class="input" type="number" step="0.1"></label><label class="metric-label">Presence<input id="llm-presence" class="input" type="number" step="0.1"></label><label class="metric-label">Frequency<input id="llm-frequency" class="input" type="number" step="0.1"></label><button class="btn primary" onclick="savePrompts()">Save prompt modules</button>';
    container.parentNode.insertBefore(box, container);
}

async function savePrompts() {
    const prompts = {};
    document.querySelectorAll('[data-prompt-key]').forEach(area => {
        prompts[area.dataset.promptKey] = area.value;
    });
    try {
        const data = await api('/api/admin/llm-settings', {
            method: 'POST',
            body: JSON.stringify({
                temperature: Number(document.getElementById('llm-temperature')?.value || promptDefaults?.temperature || 0.7),
                presence_penalty: Number(document.getElementById('llm-presence')?.value || promptDefaults?.presence_penalty || 0.1),
                frequency_penalty: Number(document.getElementById('llm-frequency')?.value || promptDefaults?.frequency_penalty || 0.1),
                prompts
            })
        });
        setValue('prompt-full-preview', data.fullPrompt || '');
        showToast('Промпты применены без перезапуска бота');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function resetLlmParams() {
    if (!promptDefaults) return;
    document.getElementById('llm-temperature').value = promptDefaults.temperature;
    document.getElementById('llm-presence').value = promptDefaults.presence_penalty;
    document.getElementById('llm-frequency').value = promptDefaults.frequency_penalty;
}

async function fetchPromptLogs() {
    const userId = document.getElementById('inspector-user-id')?.value.trim();
    try {
        const data = await api(`/api/admin/prompt-logs?limit=100${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`);
        const container = document.getElementById('prompt-log-list');
        container.innerHTML = '';
        data.logs.forEach(log => {
            const button = document.createElement('button');
            button.className = 'prompt-log-item';
            button.innerHTML = `<span>${escapeHtml(log.kind)} · ${escapeHtml(formatDate(log.created_at))}</span>
                <strong>${escapeHtml(log.first_name || log.username || log.user_id)}</strong>
                <p>${escapeHtml(log.user_text || '[инициатива]')}</p>
                <small>${escapeHtml(log.model || '—')} · ${log.latency_ms || 0}ms</small>`;
            button.addEventListener('click', () => fetchPromptLogDetail(log.id, button));
            container.appendChild(button);
        });
        if (!data.logs.length) container.innerHTML = '<p class="muted">Логов пока нет. Новые диалоги появятся здесь автоматически.</p>';
    } catch (err) {
        if (err.message !== 'Требуется авторизация') showToast(err.message, 'error');
    }
}

async function fetchPromptLogDetail(id, button) {
    document.querySelectorAll('.prompt-log-item').forEach(item => item.classList.remove('active'));
    button?.classList.add('active');
    try {
        const data = await api(`/api/admin/prompt-logs/${id}`);
        const log = data.log;
        const layers = data.layers;
        const detail = document.getElementById('prompt-log-detail');
        detail.innerHTML = `
            <div class="detail-meta"><span class="badge">${escapeHtml(log.provider_name || '—')}</span><span>${escapeHtml(log.model || '—')}</span><span>${log.latency_ms}ms</span><span>${escapeHtml(formatDate(log.created_at))}</span></div>
            ${inspectorSection('1. Физика и state snapshot', JSON.stringify(layers.physics, null, 2))}
            ${inspectorSection('2. Radiant context: локация, задача, willingness, дневник, расписание', layers.radiant_context)}
            ${inspectorSection('3. Факты памяти, реально использованные в запросе', JSON.stringify(layers.memory_used, null, 2))}
            ${inspectorSection('4. Итоговый system prompt', layers.system_prompt)}
            ${inspectorSection('5. Полный messages[]', JSON.stringify(layers.messages, null, 2))}
            ${inspectorSection('6. Сырой ответ LLM', layers.raw_response)}
            ${inspectorSection('7. Ответ после парсинга/чистки', layers.parsed_response)}`;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function inspectorSection(title, text) {
    return `<details class="inspector-section"><summary>${escapeHtml(title)}</summary><pre>${escapeHtml(text || '—')}</pre></details>`;
}

async function runPromptPreview(runLlm) {
    const userId = document.getElementById('preview-user-id')?.value.trim();
    if (!userId) return showToast('Укажи Telegram ID', 'error');
    const number = id => {
        const raw = document.getElementById(id)?.value;
        return raw === '' ? undefined : Number(raw);
    };
    const overrides = {
        location_id: document.getElementById('preview-location')?.value || undefined,
        needs: {
            hunger: number('preview-hunger'),
            fatigue: number('preview-fatigue'),
            horny: number('preview-horny')
        },
        physiology: { cycle_day: number('preview-cycle') }
    };
    Object.keys(overrides.needs).forEach(key => overrides.needs[key] === undefined && delete overrides.needs[key]);
    Object.keys(overrides.physiology).forEach(key => overrides.physiology[key] === undefined && delete overrides.physiology[key]);
    try {
        setText('preview-output', 'Генерация…');
        const data = await api('/api/admin/prompt-preview', {
            method: 'POST',
            body: JSON.stringify({
                userId,
                overrides,
                runLlm,
                userText: document.getElementById('preview-text')?.value || ''
            })
        });
        setText('preview-output', `${data.context}${data.llm ? `\n\n========== RAW LLM RESPONSE ==========\n${data.llm.rawText}\n\nMODEL: ${data.llm.model} · ${data.llm.provider} · ${data.llm.latencyMs}ms` : ''}`);
    } catch (err) {
        setText('preview-output', `Ошибка: ${err.message}`);
    }
}

async function searchMemoryUsers() {
    const term = document.getElementById('memory-search').value.trim();
    if (!term) return;
    try {
        const data = await api(`/api/admin/users/search?q=${encodeURIComponent(term)}`);
        const container = document.getElementById('memory-user-results');
        container.innerHTML = '';
        data.users.forEach(user => {
            const button = document.createElement('button');
            button.className = 'user-result';
            button.textContent = `${user.first_name || 'Без имени'} @${user.username || '—'} · ${user.telegram_id}`;
            button.addEventListener('click', () => selectMemoryUser(user));
            container.appendChild(button);
        });
        if (!data.users.length) container.innerHTML = '<p class="muted">Никого не найдено.</p>';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function selectMemoryUser(user) {
    selectedMemoryUserId = user.telegram_id;
    await fetchMemoryFacts(user);
}

async function fetchMemoryFacts(user = null) {
    if (!selectedMemoryUserId) return;
    if (user) selectedMemoryUser = user;
    const shownUser = user || selectedMemoryUser;
    try {
        const data = await api(`/api/admin/memory/facts/${selectedMemoryUserId}`);
        const box = document.getElementById('memory-facts-box');
        box.innerHTML = `<div class="flex-header"><h3>${escapeHtml(shownUser?.first_name || 'Пользователь')} · ${selectedMemoryUserId}</h3><span>${data.facts.filter(f => f.is_active).length} активных фактов</span></div>
            <div class="form-row"><input id="new-memory-fact" class="input wide" placeholder="Новый факт о пользователе"><button class="btn btn-primary" onclick="addMemoryFact()">Добавить</button></div>
            <div id="facts-list" class="facts-list mt-10"></div>
            <div class="flex-header mt-20"><h3>Дайджесты отношений</h3><div class="button-group"><button class="btn btn-secondary" onclick="generateUserDigest('DAILY')">DAILY</button><button class="btn btn-secondary" onclick="generateUserDigest('WEEKLY')">WEEKLY</button><button class="btn btn-secondary" onclick="generateUserDigest('MONTHLY')">MONTHLY</button></div></div>
            <div id="user-digests-list" class="mt-10"></div>`;
        const list = document.getElementById('facts-list');
        data.facts.forEach(fact => {
            const row = document.createElement('div');
            row.className = `fact-row ${fact.is_active ? '' : 'inactive'}`;
            row.innerHTML = `<textarea></textarea><div class="fact-actions"><span>${escapeHtml(formatDate(fact.created_at))}</span><button class="btn btn-secondary">Сохранить</button><button class="btn btn-secondary">${fact.is_active ? 'Деактивировать' : 'Активировать'}</button><button class="btn btn-god">Удалить</button></div>`;
            row.querySelector('textarea').value = fact.fact;
            const [save, toggle, remove] = row.querySelectorAll('button');
            save.addEventListener('click', () => updateMemoryFact(fact.id, { fact: row.querySelector('textarea').value }));
            toggle.addEventListener('click', () => updateMemoryFact(fact.id, { isActive: !fact.is_active }));
            remove.addEventListener('click', () => removeMemoryFact(fact.id));
            list.appendChild(row);
        });
        if (!data.facts.length) list.innerHTML = '<p class="muted">Память пока пуста.</p>';
        await fetchUserDigests();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function addMemoryFact() {
    const fact = document.getElementById('new-memory-fact').value.trim();
    if (!fact) return;
    await api(`/api/admin/memory/facts/${selectedMemoryUserId}`, { method: 'POST', body: JSON.stringify({ fact }) });
    await fetchMemoryFacts();
}

async function updateMemoryFact(id, payload) {
    await api(`/api/admin/memory/facts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    await fetchMemoryFacts();
}

async function removeMemoryFact(id) {
    if (!confirm('Удалить факт безвозвратно?')) return;
    await api(`/api/admin/memory/facts/${id}`, { method: 'DELETE' });
    await fetchMemoryFacts();
}

async function fetchDigests() {
    try {
        const data = await api('/api/admin/memory/digests?stream=LIFE_DIARY&limit=60');
        const container = document.getElementById('digests-list');
        container.innerHTML = '';
        data.digests.forEach(digest => {
            const item = document.createElement('article');
            item.className = `digest-card ${digest.digest_type.toLowerCase()}`;
            item.innerHTML = `<div><span class="badge">${escapeHtml(digest.digest_type)}</span><strong>${escapeHtml(digest.period_label)}</strong></div><p>${escapeHtml(digest.summary_text)}</p>`;
            container.appendChild(item);
        });
        if (!data.digests.length) container.innerHTML = '<p class="muted">Дайджестов пока нет.</p>';
    } catch (err) {
        if (err.message !== 'Требуется авторизация') showToast(err.message, 'error');
    }
}

async function generateDigest(layer) {
    try {
        const data = await api('/api/admin/memory/digests/generate', { method: 'POST', body: JSON.stringify({ layer }) });
        showToast(data.message, data.summary ? 'success' : 'warning');
        await fetchDigests();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function fetchUserDigests() {
    if (!selectedMemoryUserId) return;
    const data = await api(`/api/admin/memory/digests?stream=USER_CHAT&userId=${selectedMemoryUserId}&limit=60`);
    const container = document.getElementById('user-digests-list');
    if (!container) return;
    container.innerHTML = data.digests.map(digest => `<article class="digest-card ${escapeHtml(digest.digest_type.toLowerCase())}"><div><span class="badge">${escapeHtml(digest.digest_type)}</span><strong>${escapeHtml(digest.period_label)}</strong></div><p>${escapeHtml(digest.summary_text)}</p></article>`).join('') || '<p class="muted">Дайджестов отношений пока нет.</p>';
}

async function generateUserDigest(layer) {
    if (!selectedMemoryUserId) return;
    try {
        const data = await api('/api/admin/memory/digests/generate', { method: 'POST', body: JSON.stringify({ layer, userId: selectedMemoryUserId }) });
        showToast(data.message, data.summary ? 'success' : 'warning');
        await fetchUserDigests();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function fetchRationaleLogs() {
    try {
        const data = await api('/api/admin/radiant/rationale?limit=100');
        const container = document.getElementById('rationale-logs-list');
        container.innerHTML = '';
        data.traces.forEach(trace => {
            const item = document.createElement('div');
            item.className = 'diary-item';
            item.innerHTML = `<div><span class="badge">${escapeHtml(trace.category)}</span><time>${escapeHtml(formatDate(trace.timestamp))}</time></div><strong>${escapeHtml(trace.title)}</strong><p>${escapeHtml(trace.explanation)}</p>`;
            container.appendChild(item);
        });
        if (!data.traces.length) container.innerHTML = `<p class="muted">${escapeHtml(data.empty_hint || 'Трейс пуст.')}</p>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function fetchInventory() {
    try {
        const [inventoryData, queueData] = await Promise.all([api('/api/admin/inventory'), api('/api/admin/queue')]);
        const inventory = inventoryData.inventory || [];
        const container = document.getElementById('inventory-list');
        container.innerHTML = '';
        inventory.forEach(item => {
            const card = document.createElement('article');
            card.className = 'inventory-card';
            const props = Object.entries(item.properties || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');
            card.innerHTML = `<div class="flex-header"><h4>${escapeHtml(item.item_id)}</h4><span class="badge">${escapeHtml(item.item_type)}</span></div><p>Количество: <strong>${item.quantity}</strong></p><small>${escapeHtml(props || 'без свойств')}</small><div class="button-group mt-10"></div>`;
            const actions = card.querySelector('.button-group');
            if (item.item_type === 'clothes') {
                const button = document.createElement('button');
                button.className = 'btn btn-secondary';
                button.textContent = item.is_equipped ? 'Снять' : 'Надеть';
                button.addEventListener('click', () => item.is_equipped ? unequipItem(item.item_id) : equipItem(item.item_id));
                actions.appendChild(button);
            } else {
                const button = document.createElement('button');
                button.className = 'btn btn-secondary';
                button.textContent = 'Списать 1';
                button.addEventListener('click', () => consumeItem(item.item_id));
                actions.appendChild(button);
            }
            container.appendChild(card);
        });
        renderOutfitSlots(inventoryData.outfit?.bySlot || {});
        renderQueue(queueData.queue || []);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderOutfitSlots(bySlot) {
    const labels = { underwear: 'Бельё', top: 'Верх', bottom: 'Низ', dress: 'Платье', outer: 'Верхняя одежда', shoes: 'Обувь' };
    const container = document.getElementById('outfit-slots');
    container.innerHTML = '';
    Object.entries(labels).forEach(([slot, label]) => {
        const item = bySlot[slot];
        const card = document.createElement('div');
        card.className = `outfit-slot ${item ? 'filled' : ''}`;
        card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(item?.item_id || 'Пусто')}</strong><small>${item ? `Тепло ${item.warmth} · дождь ${item.rain_resist ? 'да' : 'нет'}` : 'Слот свободен'}</small>`;
        container.appendChild(card);
    });
}

async function equipItem(itemId) {
    await api('/api/admin/inventory/equip', { method: 'POST', body: JSON.stringify({ itemId }) });
    await fetchInventory();
}

async function unequipItem(itemId) {
    await api('/api/admin/inventory/unequip', { method: 'POST', body: JSON.stringify({ itemId }) });
    await fetchInventory();
}

async function consumeItem(itemId) {
    await api('/api/admin/inventory/consume', { method: 'POST', body: JSON.stringify({ itemId, quantity: 1 }) });
    await fetchInventory();
}

async function addInventoryItem() {
    try {
        const propertiesRaw = document.getElementById('inv-item-props').value.trim();
        const properties = propertiesRaw ? JSON.parse(propertiesRaw) : {};
        await api('/api/admin/inventory/add', {
            method: 'POST',
            body: JSON.stringify({
                itemId: document.getElementById('inv-item-id').value.trim(),
                itemType: document.getElementById('inv-item-type').value,
                quantity: Number(document.getElementById('inv-item-qty').value),
                properties
            })
        });
        await fetchInventory();
    } catch (err) {
        showToast(`Ошибка properties JSON: ${err.message}`, 'error');
    }
}

async function fetchPhotos() {
    try {
        const data = await api('/api/admin/photos');
        const container = document.getElementById('photos-grid');
        container.innerHTML = '';
        data.photos.forEach(photo => {
            const card = document.createElement('article');
            card.className = 'photo-card';
            card.innerHTML = `<div class="photo-preview" data-photo-preview="${photo.id}"><span>Превью по запросу</span></div><div class="flex-header"><h4>#${photo.id}</h4><span class="badge">${escapeHtml(photo.access_level)}</span></div><small title="${escapeHtml(photo.file_id)}">${escapeHtml(photo.file_id.slice(0, 24))}…</small><input class="input" placeholder="Описание"><input class="input" placeholder="Теги через запятую"><input class="input" placeholder="Теги одежды"><label class="field">Откровенность<input class="input" type="number" min="0" max="100" value="${photo.explicitness || 0}"></label><select class="input"><option value="free">Free</option><option value="premium">Premium</option><option value="vip">VIP</option></select><select class="input"><option value="any">Любое время</option><option value="morning">Утро</option><option value="day">День</option><option value="evening">Вечер</option><option value="night">Ночь</option></select><div class="button-group"><button class="btn btn-secondary">Превью</button><button class="btn btn-secondary">Сохранить</button><button class="btn btn-god">Удалить</button></div>`;
            const [caption, tags, outfitTags, explicitness] = card.querySelectorAll('input');
            const [accessLevel, timeOfDay] = card.querySelectorAll('select');
            caption.value = photo.caption || '';
            tags.value = (photo.tags || []).join(', ');
            outfitTags.value = (photo.outfit_tags || []).join(', ');
            accessLevel.value = photo.access_level || 'free';
            timeOfDay.value = photo.time_of_day || 'any';
            const [preview, save, remove] = card.querySelectorAll('button');
            preview.addEventListener('click', () => loadPhotoPreview(photo.id));
            save.addEventListener('click', () => updatePhoto(photo.id, { caption: caption.value, tags: tags.value, access_level: accessLevel.value, time_of_day: timeOfDay.value, outfit_tags: outfitTags.value, explicitness: Number(explicitness.value) }));
            remove.addEventListener('click', () => deletePhoto(photo.id));
            container.appendChild(card);
        });
        if (!data.photos.length) container.innerHTML = '<p class="muted">Фото пока не загружены.</p>';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function uploadPhoto() {
    const file = document.getElementById('input-photo-file').files[0];
    const fileId = document.getElementById('input-file-id').value.trim();
    if (!file && !fileId) return showToast('Выбери файл или укажи Telegram file_id', 'error');
    const payload = { caption: document.getElementById('input-caption').value.trim(), tags: document.getElementById('input-photo-tags').value, outfit_tags: document.getElementById('input-outfit-tags').value, explicitness: Number(document.getElementById('input-explicitness').value), access_level: document.getElementById('select-access-level').value, time_of_day: document.getElementById('select-time-of-day').value };
    if (file) {
        if (file.size > 10 * 1024 * 1024) return showToast('Файл больше 10 МБ', 'error');
        payload.data = await fileToDataUrl(file);
        payload.filename = file.name;
        await api('/api/admin/photos/upload', { method: 'POST', body: JSON.stringify(payload) });
    } else {
        await api('/api/admin/photos', { method: 'POST', body: JSON.stringify({ ...payload, file_id: fileId }) });
    }
    document.getElementById('input-file-id').value = '';
    document.getElementById('input-photo-file').value = '';
    await fetchPhotos();
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function loadPhotoPreview(id) {
    const box = document.querySelector(`[data-photo-preview="${id}"]`);
    box.innerHTML = `<img src="/api/admin/photos/${id}/preview?ts=${Date.now()}" alt="Фото #${id}">`;
    const image = box.querySelector('img');
    image.onerror = () => { box.innerHTML = '<span>Не удалось загрузить превью</span>'; };
}

async function updatePhoto(id, payload) {
    await api(`/api/admin/photos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    showToast(`Фото #${id} обновлено`);
    await fetchPhotos();
}

async function deletePhoto(id) {
    if (!confirm(`Удалить фото #${id}?`)) return;
    await api(`/api/admin/photos/${id}`, { method: 'DELETE' });
    await fetchPhotos();
}

async function fetchProviders() {
    try {
        const data = await api('/api/admin/providers');
        const container = document.getElementById('providers-list');
        container.innerHTML = '';
        data.providers.forEach(provider => {
            const card = document.createElement('article');
            card.className = 'inventory-card';
            card.innerHTML = `<div class="flex-header"><h4>${escapeHtml(provider.name)}</h4><span class="badge">${provider.is_active ? 'ACTIVE' : 'FALLBACK'}</span></div><p>${escapeHtml(provider.model_name)}</p><small>${escapeHtml(provider.base_url)}</small><div class="button-group mt-10"><button class="btn btn-secondary">Активировать</button><button class="btn btn-god">Удалить</button></div>`;
            const [activate, remove] = card.querySelectorAll('button');
            activate.addEventListener('click', () => activateProvider(provider.id));
            remove.addEventListener('click', () => deleteProvider(provider.id));
            container.appendChild(card);
        });
        const active = data.providers.find(provider => provider.is_active);
        setText('active-model-badge', `MODEL: ${active?.model_name || '—'}`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function addNewProvider() {
    const payload = { name: document.getElementById('prov-name').value.trim(), base_url: document.getElementById('prov-url').value.trim(), api_key: document.getElementById('prov-key').value.trim(), model_name: document.getElementById('prov-model').value.trim() };
    if (Object.values(payload).some(value => !value)) return showToast('Заполни все поля провайдера', 'error');
    await api('/api/admin/providers', { method: 'POST', body: JSON.stringify(payload) });
    await fetchProviders();
}

async function activateProvider(id) {
    await api(`/api/admin/providers/${id}/activate`, { method: 'POST' });
    await fetchProviders();
}

async function deleteProvider(id) {
    if (!confirm('Удалить провайдера?')) return;
    await api(`/api/admin/providers/${id}`, { method: 'DELETE' });
    await fetchProviders();
}

async function testProviders() {
    const box = document.getElementById('test-results-box');
    box.innerHTML = '<p class="muted">Проверяем цепочку…</p>';
    try {
        const data = await api('/api/admin/providers/test', { method: 'POST' });
        box.innerHTML = data.results.map(result => `<div class="diary-item"><strong>${escapeHtml(result.name)}</strong><p>${result.status === 'SUCCESS' ? `Успешно · ${result.durationMs}ms · ${escapeHtml(result.response)}` : escapeHtml(result.error)}</p></div>`).join('');
    } catch (err) {
        box.textContent = err.message;
    }
}

async function fetchChannelSettings() {
    try {
        const [data, history] = await Promise.all([api('/api/admin/channel/settings'), api('/api/admin/channel/history?limit=30')]);
        const settings = data.settings || {};
        document.getElementById('channel-id-input').value = data.channelId || '';
        document.getElementById('channel-url-input').value = data.channelUrl || '';
        document.getElementById('channel-frequency').value = settings.frequency_hours || 4;
        document.getElementById('channel-message-count').value = settings.messages_count || '1';
        document.getElementById('channel-media-mode').value = settings.media_mode || 'none';
        document.getElementById('channel-enabled').checked = !!settings.is_enabled;
        setText('free-mode-status', data.freeMode ? 'Free Mode включён' : 'Free Mode выключен');
        renderTopicControls(settings);
        renderChannelHistory(history.posts || []);
        await fetchBroadcastStatus();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderTopicControls(settings) {
    const labels = { thoughts: 'Мысли', flirt: 'Флирт', life: 'Жизнь', jokes: 'Шутки', questions: 'Вопросы' };
    const enabled = new Set(settings.topics || []);
    const container = document.getElementById('channel-topic-controls');
    container.innerHTML = '';
    Object.entries(labels).forEach(([key, label]) => {
        const row = document.createElement('label');
        row.className = 'topic-control';
        row.innerHTML = `<input type="checkbox" data-topic-enabled="${key}" ${enabled.has(key) ? 'checked' : ''}><span>${label}</span><input type="number" min="0" max="100" class="input" data-topic-weight="${key}" value="${settings.topic_weights?.[key] ?? 0}">`;
        container.appendChild(row);
    });
}

async function saveChannelSettings() {
    const topics = [...document.querySelectorAll('[data-topic-enabled]:checked')].map(node => node.dataset.topicEnabled);
    const topicWeights = Object.fromEntries([...document.querySelectorAll('[data-topic-weight]')].map(node => [node.dataset.topicWeight, Number(node.value)]));
    await api('/api/admin/channel/settings', { method: 'POST', body: JSON.stringify({ channelId: document.getElementById('channel-id-input').value, channelUrl: document.getElementById('channel-url-input').value, isEnabled: document.getElementById('channel-enabled').checked, frequencyHours: Number(document.getElementById('channel-frequency').value), topics, topicWeights, messagesCount: document.getElementById('channel-message-count').value, mediaMode: document.getElementById('channel-media-mode').value }) });
    showToast('Настройки канала сохранены');
    await fetchChannelSettings();
}

function renderChannelHistory(posts) {
    const container = document.getElementById('channel-history');
    container.innerHTML = posts.map(post => `<article class="diary-item"><div><span class="badge">${escapeHtml(post.topic || '—')}</span><time>${escapeHtml(formatDate(post.created_at))}</time></div><p>${escapeHtml(post.text)}</p></article>`).join('') || '<p class="muted">Публикаций пока нет.</p>';
}

async function sendBroadcast() {
    try {
        const data = await api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ text: document.getElementById('broadcast-text').value, mediaFileId: document.getElementById('broadcast-file-id').value.trim(), mediaType: document.getElementById('broadcast-media-type').value, button: document.getElementById('broadcast-button').value, segment: document.getElementById('broadcast-segment').value }) });
        showToast(data.message);
        await fetchBroadcastStatus();
    } catch (err) { showToast(err.message, 'error'); }
}

async function fetchBroadcastStatus() {
    try {
        const data = await api('/api/admin/broadcast/status');
        setText('broadcast-status', data.available === false
            ? data.error
            : JSON.stringify({ paused: data.paused, ...data.counts }, null, 2));
    } catch (err) { setText('broadcast-status', err.message); }
}

async function controlBroadcast(action) {
    try { await api('/api/admin/broadcast/control', { method: 'POST', body: JSON.stringify({ action }) }); await fetchBroadcastStatus(); }
    catch (err) { showToast(err.message, 'error'); }
}

async function publishChannelNow() {
    try {
        await api('/api/admin/channel/publish-now', { method: 'POST' });
        showToast('Пост опубликован');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleFreeModeAction() {
    const data = await api('/api/admin/funnels/toggle-free-mode', { method: 'POST' });
    setText('free-mode-status', data.free_mode_enabled ? 'Free Mode включён' : 'Free Mode выключен');
}

async function resetLimits() {
    const data = await api('/api/admin/funnels/reset-limits', { method: 'POST', body: JSON.stringify({ textCount: 10 }) });
    showToast(`Лимиты сброшены для ${data.count} пользователей`);
}

async function fetchUsers() {
    try {
        const data = await api('/api/admin/stats');
        const stats = data.stats || {};
        setText('stat-total-users', stats.total_users || 0);
        setText('stat-revenue-rub', `${stats.total_revenue_rub || 0} ₽`);
        setText('stat-revenue-stars', `${stats.stars_total || 0} ⭐`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function searchCrmUsers() {
    const term = document.getElementById('crm-search').value.trim();
    if (!term) return;
    const data = await api(`/api/admin/users/search?q=${encodeURIComponent(term)}`);
    renderCrmUsers(data.users);
}

async function fetchUsersPage() {
    const data = await api('/api/admin/users?limit=50');
    renderCrmUsers(data.users);
}

function renderCrmUsers(users) {
    const container = document.getElementById('crm-users-list');
    container.innerHTML = '';
    users.forEach(user => {
        const button = document.createElement('button');
        button.className = 'user-result';
        button.textContent = `${user.first_name || 'Без имени'} @${user.username || '—'} · ${user.telegram_id}`;
        button.addEventListener('click', () => renderCrmUserDetail(user));
        container.appendChild(button);
    });
}

async function renderCrmUserDetail(user) {
    const data = await api(`/api/admin/users/${user.telegram_id}/full`);
    user = data.user;
    const detail = document.getElementById('crm-user-detail');
    detail.innerHTML = `<div class="card inset-card"><div class="flex-header"><div><h3>${escapeHtml(user.first_name || '')} @${escapeHtml(user.username || '—')} · ${user.telegram_id}</h3><p>${user.is_premium ? 'VIP' : 'Обычный'} · ${user.is_blocked ? 'ЗАБЛОКИРОВАН' : 'активен'} · потратил ${user.total_spent ?? 0} ₽</p></div><div class="button-group"><button class="btn ${user.is_blocked ? 'btn-primary' : 'btn-god'}" onclick="crmAction('${user.telegram_id}','${user.is_blocked ? 'unblock' : 'block'}')">${user.is_blocked ? 'Разблокировать' : 'Заблокировать'}</button></div></div>
        <div class="crm-operations"><label class="field">Баланс текстов<input id="crm-text-balance" type="number" min="0" class="input" value="${user.free_requests_left ?? 0}"></label><label class="field">Баланс фото<input id="crm-image-balance" type="number" min="0" class="input" value="${user.image_balance ?? 0}"></label><button class="btn btn-secondary" onclick="saveCrmBalances('${user.telegram_id}')">Сохранить баланс</button><label class="field">Выдать пакет<select id="crm-package" class="input"><option value="text_small">+50 текстов</option><option value="text_large">+200 текстов</option><option value="img_small">+10 фото</option><option value="img_large">+30 фото</option><option value="vip_sub">VIP</option><option value="store:lite">Магазин Lite</option><option value="store:medium">Магазин Medium</option><option value="store:hard">Магазин Hard</option><option value="store:full">Магазин Full</option></select></label><button class="btn btn-primary" onclick="grantCrmPackage('${user.telegram_id}')">Выдать</button></div>
        <h3>Платежи</h3><div id="crm-payments" class="payment-list"></div>
        <h3>Факты памяти</h3><div id="crm-facts" class="user-results"></div>
        <h3>Диалог</h3><div id="crm-chat" class="crm-chat"></div><div class="form-row"><input id="crm-direct-text" class="input wide" placeholder="Сообщение от лица Леры"><button class="btn btn-primary" onclick="sendDirectMessage('${user.telegram_id}')">Отправить</button></div></div>`;
    const chat = document.getElementById('crm-chat');
    data.conversations.forEach(event => {
        const row = document.createElement('div');
        row.className = `chat-row ${event.role === 'user' ? 'user' : 'lera'}`;
        row.textContent = `${event.role}: ${event.content || ''}`;
        chat.appendChild(row);
    });
    document.getElementById('crm-payments').innerHTML = data.payments.map(payment => `<div class="payment-row"><strong>${payment.amount} ${escapeHtml(payment.currency)}</strong><span>${escapeHtml(payment.provider || '—')} · ${escapeHtml(payment.status)} · ${escapeHtml(formatDate(payment.created_at))}</span></div>`).join('') || '<p class="muted">Платежей нет.</p>';
    document.getElementById('crm-facts').innerHTML = data.facts.map(fact => `<span class="user-result ${fact.is_active ? '' : 'inactive'}">${escapeHtml(fact.fact)}</span>`).join('') || '<p class="muted">Фактов нет.</p>';
}

async function crmAction(userId, action, extra = {}) {
    try {
        const data = await api(`/api/admin/users/${userId}/action`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
        showToast(`CRM: ${action} выполнено`);
        await renderCrmUserDetail(data.user);
    } catch (err) { showToast(err.message, 'error'); }
}

function saveCrmBalances(userId) {
    return crmAction(userId, 'set_balances', { textBalance: Number(document.getElementById('crm-text-balance').value), imageBalance: Number(document.getElementById('crm-image-balance').value) });
}

function grantCrmPackage(userId) {
    const value = document.getElementById('crm-package').value;
    return value.startsWith('store:')
        ? crmAction(userId, 'grant_store_package', { packageKey: value.split(':')[1] })
        : crmAction(userId, 'grant_package', { packageType: value });
}

async function sendDirectMessage(userId) {
    const text = document.getElementById('crm-direct-text').value.trim();
    if (!text) return;
    await api('/api/admin/users/send-message', { method: 'POST', body: JSON.stringify({ userId, text }) });
    showToast('Сообщение отправлено');
}

async function fetchPackagesAndPromos() {
    await Promise.all([fetchPackages(), fetchPromos()]);
}

async function fetchPackages() {
    const data = await api('/api/admin/packages');
    const container = document.getElementById('packages-list');
    container.innerHTML = '';
    Object.entries(data.packages).forEach(([key, pkg]) => {
        const row = document.createElement('div');
        row.className = 'package-row';
        row.innerHTML = `<strong>${escapeHtml(key)}</strong><label>₽<input class="input" type="number" value="${pkg.rub}"></label><label>Stars<input class="input" type="number" value="${pkg.stars}"></label><label>💬<input class="input" type="number" value="${pkg.text}"></label><label>📸<input class="input" type="number" value="${pkg.img}"></label><button class="btn btn-secondary">Сохранить</button>`;
        const inputs = row.querySelectorAll('input');
        row.querySelector('button').addEventListener('click', () => savePackage(key, inputs));
        container.appendChild(row);
    });
}

async function savePackage(key, inputs) {
    await api('/api/admin/packages', { method: 'POST', body: JSON.stringify({ key, rub: Number(inputs[0].value), stars: Number(inputs[1].value), text: Number(inputs[2].value), img: Number(inputs[3].value) }) });
    showToast(`Пакет ${key} сохранён`);
}

async function fetchPromos() {
    const data = await api('/api/admin/promocodes');
    const container = document.getElementById('promocodes-list');
    container.innerHTML = data.promocodes.map(promo => `<div class="package-row"><strong>${escapeHtml(promo.code)}</strong><span>${promo.current_activations}/${promo.max_activations} активаций · скидка ${promo.discount_percent}% · ${promo.is_active ? 'активен' : 'выключен'}</span><button class="btn btn-god" onclick="deletePromo(${promo.id})">Удалить</button></div>`).join('');
}

async function createPromo() {
    await api('/api/admin/promocodes', { method: 'POST', body: JSON.stringify({ code: document.getElementById('promo-code').value.trim(), maxActivations: Number(document.getElementById('promo-activations').value), bonusRequests: Number(document.getElementById('promo-requests').value), bonusImages: Number(document.getElementById('promo-images').value), discountPercent: Number(document.getElementById('promo-discount').value) }) });
    await fetchPromos();
}

async function deletePromo(id) {
    if (!confirm('Удалить промокод?')) return;
    await api(`/api/admin/promocodes/${id}`, { method: 'DELETE' });
    await fetchPromos();
}

function initSSELogs() {
    if (logStream) logStream.close();
    const consoleNode = document.getElementById('logs-console');
    logStream = new EventSource('/api/admin/logs/stream', { withCredentials: true });
    logStream.onmessage = event => {
        const item = JSON.parse(event.data);
        const level = document.getElementById('log-level')?.value;
        const search = document.getElementById('log-search')?.value.toLowerCase();
        if (level && item.type !== level) return;
        if (search && !String(item.message).toLowerCase().includes(search)) return;
        consoleNode.textContent += `\n[${item.timestamp || new Date().toLocaleTimeString()}] ${item.type || 'INFO'}: ${item.message || JSON.stringify(item)}`;
        consoleNode.scrollTop = consoleNode.scrollHeight;
    };
    logStream.onerror = () => {
        consoleNode.textContent += '\n[SSE] Соединение потеряно, EventSource попробует переподключиться.';
    };
}

async function loadLogHistory() {
    const level = document.getElementById('log-level').value;
    const search = document.getElementById('log-search').value;
    try {
        const data = await api(`/api/admin/logs?level=${encodeURIComponent(level)}&search=${encodeURIComponent(search)}`);
        setText('logs-console', data.logs.map(item => `[${item.timestamp}] ${item.type}: ${item.message}`).join('\n') || 'Логов по фильтру нет.');
    } catch (err) { showToast(err.message, 'error'); }
}

function clearLogConsole() { setText('logs-console', ''); }

async function fetchDiagnostics() {
    try {
        const data = await api('/api/admin/diagnostics');
        const cards = [
            ['PostgreSQL', data.db.ok ? `OK · ${data.db.latencyMs}ms` : data.db.error],
            ['Redis / BullMQ', data.redis.ok ? `OK · waiting ${data.redis.counts.waiting || 0}` : data.redis.error],
            ['Simulation Worker', `${data.worker.timerActive ? 'timer active' : 'timer off'} · running ${data.worker.running}`],
            ['Процесс', `uptime ${Math.floor(data.uptimeSeconds / 60)} мин · RSS ${Math.round(data.memory.rss / 1024 / 1024)} МБ`],
            ['Prompt logs', data.rows.prompt_logs],
            ['Rationale / очередь', `${data.rows.sim_rationale} / ${data.rows.active_queue}`]
        ];
        document.getElementById('diagnostics-grid').innerHTML = cards.map(([title, value]) => `<div class="stat-box"><h4>${escapeHtml(title)}</h4><p class="diagnostic-value">${escapeHtml(value)}</p></div>`).join('');
    } catch (err) { showToast(err.message, 'error'); }
}

async function pruneDiagnostics() {
    if (!confirm('Удалить старые технические логи по указанным срокам?')) return;
    const data = await api('/api/admin/diagnostics/prune', { method: 'POST', body: JSON.stringify({ promptDays: Number(document.getElementById('retention-prompt').value), rationaleDays: Number(document.getElementById('retention-rationale').value), diaryDays: Number(document.getElementById('retention-diary').value) }) });
    showToast(`Удалено: ${JSON.stringify(data.deleted)}`);
    await fetchDiagnostics();
}

async function initializeDashboard() {
    try {
        const sessionResponse = await fetch('/api/admin/session', { credentials: 'same-origin' });
        const session = await sessionResponse.json();
        if (!session.authenticated) {
            showLogin();
            return;
        }
        await fetchOverview();
        await fetchDevSnapshot();
        await fetchProviders();
        initSSELogs();
        initDevToolStream();
    } catch {
        // api() already shows login when authorization is missing.
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    initializeDashboard();
    setInterval(() => {
        if (!document.getElementById('login-overlay')) fetchOverview();
    }, 5000);
    healthRefreshTimer = setInterval(() => {
        if (!document.getElementById('login-overlay')) fetchHealth();
    }, 5000);
});

async function fetchHealth() {
    try { renderHealth(await api('/api/admin/radiant/health')); }
    catch (error) { setText('autonomy-health-status', 'OFFLINE'); setText('autonomy-status', 'AUTONOMY OFFLINE'); console.debug('Health:', error.message); }
}
