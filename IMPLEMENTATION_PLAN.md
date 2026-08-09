# Лера 2.0 — технический план внедрения

## 1. Цель

Лера существует в единственном экземпляре. Все пользователи обращаются к одной симуляции Санкт-Петербурга и видят одно глобальное состояние: локацию, активность, потребности, настроение, физиологию, одежду, кошелек, задачи, расписание, NPC, погоду и дневник.

История, память и баланс сообщений остаются индивидуальными для каждого пользователя. Личные сообщения одного пользователя не показываются другим, но безопасные глобальные последствия могут влиять на общую жизнь Леры.

## 2. Архитектурные правила

1. PostgreSQL — единственный источник истины для динамики.
2. JSON-файлы используются только для статических конфигураций.
3. `simulation_worker.js` — единственный исполнитель фоновых тиков.
4. Время, потребности, деньги, задачи и расписание изменяются кодом.
5. LLM не может напрямую менять состояние.
6. LLM выбирает только `option_id` из вариантов, подготовленных кодом.
7. Все изменения проходят атомарную транзакцию.
8. Все события имеют `idempotency_key`.
9. Бытовой разговор не переводится в интимный режим самопроизвольно.
10. Инициативы и случайные события имеют cooldown.

## 3. Целевая структура

```text
src/
├── db/
│   └── database.js
├── engine/
│   ├── state_service.js
│   ├── needs_calculator.js
│   ├── schedule_generator.js
│   ├── task_service.js
│   └── decision_router.js
├── world/
│   ├── locations.json
│   ├── npcs.json
│   └── day_templates.json
├── memory/
│   ├── context_builder.js
│   └── daily_reflection.js
├── workers/
│   └── simulation_worker.js
├── ai.js
└── queue.js
```

## 4. PostgreSQL-модель

### `global_state`

Одна строка с фиксированным `id = 1`:

```text
id
location_id
location_name
wallet_rubles
wallet_stars
needs JSONB
physiology JSONB
wearing JSONB
inventory JSONB
active_task_id
current_slot
current_minute
last_tick_at
last_day_reset_at
weather JSONB
version
updated_at
```

Состояние читается через `SELECT ... FOR UPDATE` внутри транзакции.

### `simulation_events`

```text
id
event_type
source_user_id
payload JSONB
importance
visibility
idempotency_key UNIQUE
occurred_at
processed_at
created_at
```

Типы: `DONATION`, `USER_GLOBAL_EFFECT`, `NPC_EVENT`, `RANDOM_FAILURE`, `TASK_STARTED`, `TASK_COMPLETED`, `LOCATION_CHANGED`, `WEATHER_CHANGED`, `INITIATIVE_TRIGGER`, `DAY_STARTED`.

Приватный текст пользователя не попадает в глобальное событие без необходимости. В глобальный контекст передается только безопасное последствие.

### `simulation_tasks`

```text
id
task_type
title
location_id
started_at
ends_at
status
can_be_interrupted
effects_on_finish JSONB
created_by_event_id
completed_at
```

Статусы: `PENDING`, `IN_PROGRESS`, `WAITING_FOR_USER`, `COMPLETED`, `CANCELLED`.

### `schedule_days` и `schedule_slots`

`schedule_days`: `id`, `date UNIQUE`, `template_id`, `status`, `created_at`, `updated_at`.

`schedule_slots`: `id`, `schedule_day_id`, `slot_number`, `time_start`, `time_end`, `category`, `location_id`, `planned_action`, `status`, `mutation_reason`, `actual_log JSONB`.

На первой версии используются 24 часовых слота. Переход на 48 получасовых слотов допускается только после стабилизации базовой системы.

### `simulation_diary`

```text
id
date
slot_number
location_id
event_id
thought
action
consequence
importance
created_at
```

### `wallet_transactions`

```text
id
source_user_id
transaction_type
amount_rubles
amount_stars
reason
external_payment_id
idempotency_key UNIQUE
created_at
```

Сначала создается ledger-операция, затем в той же транзакции изменяется кошелек в `global_state`.

## 5. `state_service.js`

Отвечает только за чтение и атомарное изменение глобального состояния.

```js
getGlobalState(client)
withStateTransaction(callback)
applyStateDelta(delta, metadata)
setLocation(locationId, metadata)
setActiveTask(taskId)
createWalletTransaction(data)
```

Правила:

- потребности всегда ограничиваются диапазоном 0–100;
- кошелек не может стать отрицательным;
- завершенный слот нельзя изменить;
- каждое изменение имеет `event_id` или технический `reason`;
- ошибка откатывает всю транзакцию.

## 6. `needs_calculator.js`

Чистая детерминированная математика без LLM:

- hunger растет со временем;
- fatigue растет во время бодрствования;
- hygiene снижается;
- bladder растет;
- boredom зависит от активности;
- mood получает штрафы от критических потребностей;
- horny и `cycle_day` обновляются всегда;
- `arousal_level` меняется только при подходящем режиме диалога;
- рефрактерный период снимается по времени.

Основная функция:

```js
calculateElapsedEffects(state, elapsedMinutes, context)
```

Она возвращает delta и не пишет в базу. Запись выполняет `state_service.js`.

## 7. `schedule_generator.js`

Отвечает за создание расписания, применение модификаторов, закрытие слотов и мутацию только будущих слотов.

Шаблоны хранятся в `world/day_templates.json`:

```text
WEEKDAY_FREELANCE
FRIDAY_SOCIAL
WEEKEND_LAZY
```

Приоритеты:

1. критическое состояние;
2. активная задача;
3. первый день цикла;
4. отсутствие денег;
5. погода;
6. NPC-событие;
7. обычный план.

Полный день генерируется кодом, а не LLM.

## 8. `task_service.js`

Задача переводит Леру в физическое состояние, одинаковое для всех пользователей.

```js
startTask(data)
getActiveTask()
finishExpiredTasks(now)
interruptTask(taskId, reason)
getTaskResponseContext(userId)
```

Примеры задач: душ, сон, готовка, работа, поездка, бар, прогулка.

Во время задачи первые сообщения можно сохранять без ответа. При превышении лимита пингов разрешается короткий ответ-прерывание. После завершения создается одно событие возврата.

## 9. `decision_router.js`

Развилки запускаются для `STAT_CRITICAL`, `NPC_INCOMING`, `RANDOM_FAILURE`, `MONEY_LIMIT_BREACH` и `TASK_CONFLICT`.

Код формирует варианты:

```json
{
  "decision_id": "decision_123",
  "trigger_type": "NPC_INCOMING",
  "options": [
    { "option_id": "STAY_HOME", "description": "Остаться дома" },
    { "option_id": "GO_TO_BAR", "description": "Поехать в бар" },
    { "option_id": "ASK_USER_FOR_HELP", "description": "Попросить помощи" }
  ]
}
```

LLM возвращает только:

```json
{ "chosen_option_id": "STAY_HOME" }
```

После валидации код применяет заранее описанную мутацию. При ошибке используется безопасный fallback.

## 10. `simulation_worker.js`

Worker запускается один раз вместе с ботом и не зависит от входящих сообщений.

Каждые 5–10 минут:

```text
1. Получить PostgreSQL advisory lock.
2. Заблокировать global_state.
3. Посчитать elapsed_minutes от last_tick_at.
4. Применить needs_calculator.
5. Закрыть истекшие задачи.
6. Сдвинуть текущий слот.
7. Создать расписание нового дня при необходимости.
8. Обновить погоду, если истек TTL.
9. Проверить NPC и random events.
10. Записать дневник.
11. Обновить last_tick_at.
12. Выполнить commit.
```

Для catch-up после рестарта:

- до 24 часов — обработать логические тики математикой;
- больше 24 часов — агрегировать потребности и обработать важные границы;
- LLM не вызывать;
- не создавать пачку повторных инициатив и постов;
- обновлять `last_tick_at` только после успешного commit.

## 11. World-конфиги

`locations.json` содержит `id`, `name`, `district`, `type`, `avg_check`, `travel_minutes`, `travel_cost`, `weather_limits`, `description`.

`npcs.json` содержит `id`, `name`, `role`, `active_hours`, `event_types`, `weights`, `cooldown_minutes`.

Конфиги статичны. Cooldown и текущее состояние NPC хранятся в PostgreSQL.

## 12. `context_builder.js`

Сборщик формирует:

```text
[IDENTITY]
[CURRENT_TIME]
[GLOBAL_LERA_STATE]
[CURRENT_LOCATION]
[ACTIVE_TASK]
[CURRENT_SCHEDULE]
[WEATHER]
[RECENT_GLOBAL_EVENTS]
[DIARY_CONTEXT]
[PRIVATE_USER_MEMORY]
[RECENT_PRIVATE_DIALOG]
[CONVERSATION_MODE]
[RESPONSE_RULES]
```

Глобальные данные одинаковы для всех. Приватная память и история фильтруются по `user_id`.

Режимы: `HOUSEHOLD`, `CASUAL`, `FLIRT`, `INTIMATE`.

В `HOUSEHOLD` и `CASUAL` запрещен самопроизвольный переход в интимный roleplay. `horny` и `cycle_day` передаются всегда, но проявляются только при подходящем контексте.

## 13. `daily_reflection.js`

Один раз в сутки:

1. выбрать важные события дневника;
2. добавить необходимые пользовательские события;
3. вызвать легкий LLM-промпт;
4. провалидировать JSON;
5. сохранить сводку;
6. не менять напрямую `global_state`;
7. использовать idempotency key по дате.

## 14. Telegram-канал

Первая версия работает раз в 3–4 часа:

```text
найти яркое событие дневника
проверить cooldown
сгенерировать текст до 200 символов
опубликовать
сохранить post
```

Пока не реализуются комментарии, опросы и сложные реакции.

## 15. Контролируемая случайность

В разрешенных слотах:

```text
random failure: 15%
npc activity: 20%
```

Каждое событие имеет cooldown, условия запуска, список локаций, фиксированные эффекты, fallback и idempotency key. ИИ пишет текст, но код определяет последствия.

## 16. Платежи и донаты

Пользовательские таблицы, пакеты, Stars и платежи сохраняются.

После успешного платежа:

```text
1. Проверить external_payment_id.
2. Создать wallet_transaction.
3. Заблокировать global_state.
4. Увеличить общий кошелек.
5. Создать DONATION event.
6. Выполнить commit.
7. Отправить подтверждение плательщику.
```

Другие пользователи видят глобальное последствие, но не финансовые данные конкретного пользователя.

## 17. Порядок внедрения

### Фаза 1 — база

- [ ] создать PostgreSQL-таблицы;
- [ ] перенести текущий JSON-стейт в `global_state`;
- [ ] реализовать `state_service.js`;
- [ ] добавить транзакции и advisory lock;
- [ ] оставить экспорт JSON только для диагностики.

### Фаза 2 — физика и worker

- [ ] перенести математику в чистые функции;
- [ ] создать `simulation_worker.js`;
- [ ] реализовать catch-up;
- [ ] добавить завершение задач;
- [ ] протестировать рестарт, простой и параллельные сообщения.

### Фаза 3 — расписание и задачи

- [ ] перенести расписание и дневник в БД;
- [ ] создать статические шаблоны;
- [ ] реализовать мутацию будущих слотов;
- [ ] реализовать `task_service.js`;
- [ ] реализовать `decision_router.js`.

### Фаза 4 — контекст и ответы

- [ ] выделить `context_builder.js` из `ai.js`;
- [ ] разделить global и private context;
- [ ] добавить режимы диалога;
- [ ] подключить глобальные события;
- [ ] сохранить очередь и splitter `|||`.

### Фаза 5 — NPC, случайности и погода

- [ ] добавить `locations.json`;
- [ ] добавить `npcs.json`;
- [ ] реализовать cooldown;
- [ ] добавить 15% random failures;
- [ ] добавить 20% NPC events;
- [ ] обновлять погоду по TTL.

### Фаза 6 — канал и инициативность

- [ ] публиковать яркие события в канал;
- [ ] добавить cooldown постов;
- [ ] добавить инициативу после 24 часов;
- [ ] добавить инициативу при критических событиях;
- [ ] ограничить частоту сообщений каждому пользователю.

## 18. Критерии готовности

- [ ] два одновременных сообщения не теряют изменения состояния;
- [ ] два worker-процесса не выполняют один тик одновременно;
- [ ] после рестарта состояние корректно догоняется;
- [ ] catch-up не вызывает LLM;
- [ ] платеж не зачисляется дважды;
- [ ] все пользователи видят одну локацию и один кошелек;
- [ ] приватные сообщения не попадают другим пользователям;
- [ ] бытовой разговор не превращается сам в интимный;
- [ ] активная задача видна всем пользователям;
- [ ] завершенные слоты не переписываются;
- [ ] случайные события не дублируются;
- [ ] канал не публикует чаще cooldown;
- [ ] при недоступности LLM симуляция продолжает жить;
- [ ] при ошибке LLM используется безопасный fallback.

## 19. Не делать на первой версии

- не создавать отдельную Леру на каждого пользователя;
- не хранить динамику в JSON;
- не вызывать LLM на математический тик;
- не давать LLM свободно менять деньги и статы;
- не переходить к 48 слотам до стабилизации 24;
- не строить полноценную экономику NPC;
- не реализовывать комментарии и опросы канала;
- не подключать vector database без необходимости;
- не запускать несколько независимых worker-процессов без общего lock.
