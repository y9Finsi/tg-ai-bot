# Аудит Radiant LERA Engine: сверка спецификации, кода и админки

Документ подготовлен по фактическому коду репозитория и дополняет `overview.md`. Он не является планом внедрения Strict Radiant Engine: сначала фиксируется, как система работает сейчас, затем перечисляются расхождения и порядок проверки.

## Краткий ответ: как сейчас работает жизнь Леры

Сейчас жизнь Леры моделируется не чистым Skyrim Radiant AI, а гибридом:

1. `SimulationWorker` запускает тик сразу после старта бота и затем каждые 5 минут.
2. Тик берет глобальную строку `sim_state` в транзакции с блокировкой, рассчитывает прошедшие минуты и меняет потребности.
3. `needs.js` повышает голод, усталость, скуку и bladder, снижает hygiene, а также обновляет horny. При активных модификаторах меняются mood и fatigue.
4. `npc_radiant.js` обновляет состояния Насти и Макса. При достижении порогов NPC добавляют interrupt-задачи в `sim_queue`.
5. При критических нуждах добавляются `GO_TO_BATHROOM`, `EMERGENCY_EAT` или `SLEEP_EXHAUSTED`.
6. Если активная очередь пуста, worker вызывает `ScheduleService.prepareCurrentSlot()` и создает задачу из текущего часового слота. Поэтому обычный день сейчас управляется 24-часовым шаблоном.
7. GOAP может развернуть цель в цепочку подзадач: например, надеть одежду, дойти до магазина, купить еду, вернуться и поесть.
8. Текущая задача получает прогресс каждые 5 минут. После завершения применяются детерминированные эффекты к потребностям и инвентарю.
9. При завершении **любой** задачи создается raw diary log и запускается отдельный LLM-вызов для короткой нарративной записи.
10. Текущее состояние читается чатом через `ContextBuilder`: локация, задача, потребности, физиология, одежда, инвентарь, дневник и текущий/соседние слоты расписания.

Итог: посмотреть день Леры сейчас можно в админке во вкладке **«Расписание 24ч»**. Это преимущественно плановый день из `sim_schedule_slots`, дополненный фактическим логом текущей задачи. Реальный источник того, что движок выполняет в данный момент, находится во вкладках **«Карта & Состояние»**, в `sim_queue`, `sim_state`, дневнике и `sim_rationale`.

Важно: будущие слоты не являются гарантией фактического поведения. Они превращаются в реальные задачи только когда очередь пуста. Interrupt-задачи, задачи администратора и GOAP имеют приоритет и могут изменить день.

## Фактическая сверка с Strict Radiant спецификацией

| Область | Что есть сейчас | Статус относительно Strict Radiant | Подтверждение |
|---|---|---|---|
| Расписание | Три шаблона, 24 слота, генерация по дню недели; пустая очередь заполняется текущим слотом | Не соответствует: расписание остается исполнительным fallback | `src/workers/simulation_worker.js:90-103`, `src/radiant/schedule_service.js`, `src/radiant/day_templates.js` |
| База расписаний | `sim_schedule_days` и `sim_schedule_slots` создаются и используются | Не соответствует требованию удаления таблиц | `src/db/schema_v3.sql:112-134`, `src/db/state_repository.js:390-500` |
| Очередь | Сортировка по `priority DESC, created_at ASC`; статусы `PENDING`, `IN_PROGRESS`, `PAUSED`, `COMPLETED` | Частично соответствует priority queue, но не строгому LIFO и нет `PAUSED_WAITING_DEPENDENCY` | `src/db/state_repository.js:220-283`, `src/db/schema_v3.sql:28-39` |
| GOAP | Подзадачи добавляются, родитель сразу переводится в `COMPLETED` | Дублирование предотвращено, но родитель не блокируется как ожидающий dependency; цепочка не хранит parent task | `src/workers/simulation_worker.js:117-125`, `src/radiant/goap_planner.js:14-86` |
| Перемещение | Есть `TRAVEL_TO_LOCATION` с длительностью; после тика worker пишет `activeTask.target_location` в `sim_state` | Не соответствует физическому transit: нет `IN_TRANSIT`, координат прогресса и атомарной смены локации в конце пути | `src/workers/simulation_worker.js:142-171`, `src/db/schema_v3.sql:28-39` |
| Погода | `calculateTravelInfo` умеет вернуть `WET_CLOTHES`, но worker и admin передают `is_raining: false` | Не реализовано фактически; нет погодного источника и 5-минутной проверки | `src/workers/simulation_worker.js:109`, `src/server.js:186`, `src/radiant/world_map.js:89-105` |
| Инвентарь | Еда списывается при завершении еды; одежда экипируется; есть `rain_resist` | Базовый инвентарь есть, но погодная цепочка не работает end-to-end; `hasItemType` не проверяет конкретные условия использования | `src/workers/simulation_worker.js:244-277`, `src/radiant/inventory.js` |
| Mood | Хранится внутри `sim_state.needs`; меняется decay/modifiers/effects | Не соответствует производному mood; отсутствует `calculateMood(state)` | `src/radiant/needs.js:6-14`, `src/db/schema_v3.sql:9`, `src/ai/context_builder.js:108` |
| Цикл | `cycle_day` хранится и админка позволяет его изменить; в дни 12-14 horny растет быстрее | Частично: дни 12-14 есть, но коэффициент 2.5, а не ровно 2; дни 1-2 не добавляют PMS автоматически | `src/radiant/needs.js:38-52`, `src/server.js:276-292` |
| NPC Radiant AI | Настя и Макс на каждом тике наращивают шкалы и могут создать interrupts | Частично соответствует; это простые пороговые правила, не полноценный планировщик целей/перемещений NPC | `src/radiant/npc_radiant.js` |
| Дневник | LLM observer вызывается после завершения каждой задачи | Не соответствует batching: нет фильтра по корневой задаче, importance или блоку 3-4 часа | `src/workers/simulation_worker.js:200-240` |
| Контекст чата | Передает реальные state, queue, inventory, diary и schedule; read path не пишет state | Частично: mood/willingness используют сохраненный mood; отдельный read-only transaction не гарантирован | `src/ai/context_builder.js:57-119`, `src/db/state_repository.js:1-115` |
| Willingness | Есть формула с коэффициентами `0.5`, `0.4`, `0.3`, порог отражен текстом промпта | Не соответствует заявленной формуле без коэффициентов и не блокирует команду на уровне движка | `src/radiant/goap_planner.js:89-115`, `src/ai/context_builder.js:108-116` |
| Карта | Есть 5 статических локаций, маршрут до target и маркеры Леры/Насти/Макса | Визуализация есть, но позиция Леры меняется скачком; realtime tracking отсутствует | `src/radiant/world_map.js`, `public/admin/app.js:305-347` |

## Критичные расхождения, которые нельзя считать уже реализованными

1. **Это не чистый Radiant AI.** При пустой `sim_queue` worker обращается к расписанию и ставит `SCHEDULE_*`-задачу. Удаление расписания потребует изменения worker, context builder, server API, схемы, admin UI и тестов.
2. **Погода не моделируется.** В двух ключевых местах передается литерал `{ is_raining: false }`, поэтому ветка `WET_CLOTHES` практически недостижима в рабочем тике.
3. **Transit не физический.** Длительность travel существует только как длительность задачи. В конце каждого тика `location_id` устанавливается в целевую локацию даже если задача еще не завершена. Для строгой модели это риск ложной локации во время пути.
4. **Mood не виртуальный.** Он сохраняется в JSON нужд, попадает в seed schema и участвует в effects. Простое удаление поля без миграции и пересчета контекста приведет к потере поведения.
5. **Цикл не полностью интегрирован.** `PMS_CRAMPS` не добавляется автоматически в дни 1-2, а наличие старого modifier не очищается при переходе фазы.
6. **LLM Observer расходует токены на атомарные действия.** Вызов выполняется для каждой завершенной задачи, включая расписанные и мелкие действия; файла `src/ai/llm_observer.js` нет, логика встроена в worker.
7. **GOAP не соответствует заявленной модели родителя.** В схеме отсутствуют `parent_task_id` и `PAUSED_WAITING_DEPENDENCY`; родитель закрывается как `COMPLETED`, а не остается ожидающим результата цепочки.
8. **Документация и тесты закрепляют старую архитектуру.** `overview.md` описывает 24 слота как текущую возможность, а `test/radiant_admin.test.js` проверяет наличие 24 слотов и выбор шаблонов. После Strict-рефакторинга эти тесты должны быть заменены, а не просто удалены.

## Как сейчас смотреть день Леры в админке

1. Открыть `/admin` и пройти авторизацию через `ADMIN_WEB_KEY`.
2. Во вкладке **«Карта & Состояние»** смотреть:
   - текущую локацию;
   - активную задачу и остаток минут;
   - очередь `sim_queue`;
   - GOAP-цепочку;
   - потребности, цикл, модификаторы, одежду и деньги;
   - NPC;
   - последние записи дневника.
3. Во вкладке **«Расписание 24ч»** смотреть полный план текущего дня:
   - прошлые слоты;
   - текущий слот и прогресс часа;
   - будущие слоты;
   - `actual_log` и причину мутации, если движок перебил план.
4. Во вкладке **«Логи причин»** смотреть, почему движок принял решение: decay, interrupt, GOAP, schedule, effects и admin override.
5. Во вкладке **«Инвентарь & GOAP»** проверять одежду, еду, предметы и вручную добавленные задачи.

Прямые read-only API для проверки:

```text
GET /api/admin/radiant/overview
GET /api/admin/radiant/schedule
GET /api/admin/radiant/rationale?limit=40
GET /api/admin/inventory
GET /api/admin/queue
```

Главный источник факта: `state.location_id`, первая строка `queue`, ее `remaining_minutes`, а также реальные `sim_diary` и `sim_rationale`. Поле `schedule.slots[].planned` само по себе не является фактом.

## План сверки кода и админки перед рефакторингом

### Этап 1. Зафиксировать текущий контракт

- Снять JSON-ответы `overview`, `schedule`, `rationale`, `inventory`, `queue` на чистой БД.
- Записать, какие поля реально используются `public/admin/app.js`.
- Сопоставить каждый UI-блок с API-полем, SQL-таблицей и источником записи.
- Отдельно отметить плановые поля (`planned`, `template_id`) и фактические (`active_task`, `actual_log`, `sim_state`, `sim_queue`).

### Этап 2. Проверить жизненный цикл одного дня

- Запустить worker на тестовом состоянии с пустой очередью.
- Сделать тик в обычной минуте и убедиться, что создается `SCHEDULE_*`.
- Добавить emergency need и проверить приоритет над расписанием.
- Добавить NPC interrupt и проверить pause/ordering.
- Завершить еду, сон и travel; сверить state, inventory, diary, rationale и UI.
- Проверить restart/catch-up: elapsed time больше 5 минут, пропущенные слоты, повторное создание расписания.

### Этап 3. Проверить Strict Radiant-контракт

- После проектирования нового контракта проверить отсутствие обращений к schedule в worker и context builder.
- Проверить, что пустая очередь создает только `IDLE_HOME` или согласованный базовый idle-state.
- Проверить `parent_task_id`, `PAUSED_WAITING_DEPENDENCY`, отсутствие повторного раскрытия и корректное завершение корня.
- Проверить transit: одна задача пути, промежуточный статус, локация меняется только при завершении.
- Ввести источник погоды и тестировать дождь с rain-resistant и без него.
- Проверить автоматическое добавление/снятие PMS modifier и формулы cycle multipliers.
- Проверить, что mood вычисляется, а не сохраняется как базовый need.
- Проверить observer batching и отсутствие LLM-вызова на мелкие дочерние задачи.
- Проверить read-only контекст под параллельным тиком и отсутствие SQL mutation.

### Этап 4. Сверить админку после изменения модели

- Удалить или переименовать вкладку «Расписание 24ч», если расписание действительно удаляется.
- Добавить timeline фактических событий: task start, task progress, transit, interrupt, completion, diary.
- Явно разделить `CURRENT FACT`, `QUEUE`, `DECISION TRACE` и `HISTORY`; не показывать прогноз как факт.
- На карте показывать transit state и процент пути, а не только конечный target.
- Для каждой задачи отображать `parent_task_id`, статус dependency и источник решения.
- В Prompt Inspector показывать вычисленный mood, modifiers, willingness и snapshot timestamp.
- Проверить empty/loading/error states всех radiant endpoints.
- Обновить frontend contract tests и мобильный layout.

## Готовый промпт для ИИ: анализ текущего проекта и сверка с целевой моделью

Скопируй этот промпт другому ИИ вместе с путем к репозиторию. Он предназначен для **анализа и отчета**, а не для немедленного редактирования кода.

```text
Ты проводишь repository-grounded аудит проекта по адресу:
/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main

Главный источник фактов — код, SQL, тесты и админка. Файл overview.md считай гипотезой, которую нужно проверить, а не истиной. Не выдумывай реализованные возможности по названиям файлов или комментариям.

Целевая архитектура называется Strict Radiant LERA Engine:

1. Нет фонового 24-часового расписания, day templates, schedule fallback и таблиц sim_schedule_days/sim_schedule_slots. Жизнь строится динамически из needs, physiology, modifiers, NPC interrupts, окружения и sim_queue. При пустой очереди используется только согласованный базовый idle-state дома.
2. sim_queue — priority/LIFO goal stack. GOAP раскрывает dependencies один раз, хранит parent_task_id, ставит родителя в PAUSED_WAITING_DEPENDENCY и не создает одинаковые подзадачи повторно.
3. Travel — физическая задача с IN_TRANSIT, временем из world map и сменой location_id только после завершения пути. Погода проверяется на каждом 5-минутном шаге пути.
4. Дождь без экипировки с rain_resist=true добавляет irritation и WET_CLOTHES. Weather должен быть реальным входом движка, а не постоянным is_raining=false.
5. Mood — вычисляемый показатель из базовых needs и active_modifiers; он не хранится как базовая потребность.
6. cycle_day 1-28 влияет на decay: дни 1-2 автоматически дают PMS_CRAMPS и +50% к fatigue rate; дни 12-14 дают ровно x2 к horny rate. Modifier lifecycle должен быть определен.
7. Willingness считается по согласованной формуле и при низком значении влияет на обработку команд пользователя. Проверь, где это только текстовая инструкция для LLM, а где реально блокируется/переносится задача.
8. LLM Observer вызывается пакетно: на завершении root task/block или при importance >= 2, но не на каждой мелкой дочерней задаче.
9. Контекст Telegram читает согласованный snapshot в read-only режиме и не меняет sim_queue/state.
10. Админка показывает факты текущего состояния, очередь, GOAP dependencies, transit progress, rationale и дневник. Прогноз нельзя выдавать за факт.

Проведи аудит в следующем порядке:

A. Построй карту репозитория: entrypoints, simulation worker, DB repository, schema, radiant modules, AI context, admin API, admin frontend, tests. Укажи точные файлы и строки.
B. Восстанови фактический tick lifecycle: lock, time delta, needs, physiology, NPC, interrupts, queue ordering, GOAP, task progress, effects, state update, diary, observer.
C. Восстанови фактический жизненный цикл дня и ответь отдельно: как сейчас формируется день Леры, можно ли его увидеть в админке, какие части являются планом, а какие фактом.
D. Сверь каждый пункт целевой модели с кодом, SQL и UI.
E. Проверь админские endpoints и frontend consumers: для каждого radiant-блока укажи API, таблицу/источник, поле, отображение и возможную ошибку рассинхронизации.
F. Проверь тесты: какие тесты закрепляют старую 24-slot модель, какие проверки отсутствуют для Strict Radiant.
G. Проверь документацию overview.md на утверждения, которые не подтверждаются кодом.

Обязательные отдельные проверки:

- Найди все использования schedule_service.js, day_templates.js, sim_schedule_days, sim_schedule_slots и SCHEDULE_.
- Найди все места, где передается is_raining=false, и проверь достижимость WET_CLOTHES.
- Найди все обновления location_id и проверь, происходит ли смена до завершения travel.
- Найди все изменения needs.mood и реши, является ли mood persisted или derived.
- Найди все места, где создается diary entry и вызывается LLM Observer; проверь batching/importance/root task.
- Проверь наличие parent_task_id, IN_TRANSIT и PAUSED_WAITING_DEPENDENCY в schema, repository, worker, API и UI.
- Проверь, что read-only context не вызывает мутационные SQL или транзакции с блокировкой.

Формат ответа:

1. Executive summary: 5-10 фактов.
2. Current behavior: пошаговая схема одного тика и одного обычного дня.
3. Findings: таблица Severity (Critical/High/Medium/Low), файл:строка, наблюдение, влияние, доказательство.
4. Code/admin contract matrix: backend source -> API -> frontend element -> DB source -> test.
5. Strict Radiant gap matrix: реализовано / частично / отсутствует / противоречит.
6. Answer to the product question: что пользователь может увидеть сейчас и чего не может.
7. Migration plan in safe order: schema, repository, worker, AI context, observer, server API, admin UI, tests, docs.
8. Verification plan with concrete commands and scenario tests.
9. Do not modify files. Do not report a feature as implemented unless you cite code and line numbers.
```

## Команды для повторной проверки

```bash
npm test
npx eslint src public/admin test
node --check src/workers/simulation_worker.js
node --check src/server.js
node --check src/ai/context_builder.js
```

Для проверки PostgreSQL и админского контракта нужны запущенные PostgreSQL/Redis и корректный `.env`; без них статические проверки не подтверждают runtime-поведение worker и API.
