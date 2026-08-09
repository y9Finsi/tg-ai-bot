# Radiant LERA Engine и Telegram AI Bot

## 1. Назначение проекта

Проект представляет собой Telegram-бота с AI-персонажем Лерой и веб-админкой Ultimate Admin. Бот поддерживает:

- диалог пользователя с AI-персонажем;
- персональную историю общения;
- долгосрочную память о пользователях;
- генерацию ответов через OpenAI-compatible API;
- цепочку AI-провайдеров с fallback;
- платные текстовые запросы и фото;
- Telegram Stars, внешние платежи и промокоды;
- реферальную систему;
- автоматические бонусы и ретаргетинг;
- публикацию постов в Telegram-канал;
- фоновую симуляцию жизни Леры;
- инвентарь, одежду, потребности, задачи и NPC;
- полноценный веб-центр управления и диагностики.

Главная концепция текущей версии проекта состоит из двух связанных уровней:

1. **Пользовательский AI-чат**. Каждый пользователь имеет собственную историю, факты памяти, баланс и контекст общения.
2. **Единая глобальная симуляция Леры**. Все пользователи видят одну и ту же Леру, её глобальное состояние, локацию, активную задачу, потребности, инвентарь и дневник.

Личные сообщения пользователя не становятся общими. В глобальную симуляцию попадают только безопасные общие последствия, которые должны влиять на жизнь Леры.

## 2. Технологический стек

### Backend

- Node.js.
- JavaScript ESM (`"type": "module"`).
- Telegraf для Telegram Bot API.
- Express для веб-сервера и админских API.
- PostgreSQL для постоянного состояния и бизнес-данных.
- BullMQ для очередей.
- Redis как backend очередей.
- OpenAI SDK для OpenAI-compatible провайдеров.

### Infrastructure

- Docker Compose.
- PostgreSQL 15 Alpine в Docker.
- Redis 7 Alpine в Docker.
- Отдельный контейнер бота.
- Healthcheck для PostgreSQL и Redis.

### Frontend

- Обычный HTML/CSS/JavaScript без frontend-фреймворка.
- Админка раздаётся Express из `public/admin`.
- SSE используется для live-логов.
- Карта админки реализована как стилизованный HTML/CSS/SVG-интерфейс.

## 3. Запуск проекта

### Переменные окружения

Основные переменные:

- `BOT_TOKEN` — токен Telegram-бота.
- `ADMIN_ID` — Telegram ID администратора.
- `OPENROUTER_API_KEY` — fallback API key для AI.
- `DATABASE_URL` — строка подключения к PostgreSQL.
- `REDIS_URL` — строка подключения к Redis.
- `ADMIN_WEB_KEY` — обязательный ключ веб-админки.
- `PLATEGA_MERCHANT_ID` — merchant ID Platega.
- `PLATEGA_SECRET` — секрет Platega.
- `ADMIN_PORT` — порт веб-админки, по умолчанию `3000`.

`ADMIN_WEB_KEY` обязателен. Если он не задан, веб-админка не запускается. Значение `admin123` больше не используется как рабочий fallback.

### Docker

```bash
docker compose up -d --build
docker logs -f evabot
```

В Docker Compose поднимаются:

- `evabot` — бот и веб-админка;
- `evabot_postgres` — PostgreSQL;
- `evabot_redis` — Redis.

### Локальные проверки

```bash
npm test
npx eslint src public/admin test
```

## 4. Структура проекта

```text
src/
├── ai.js
├── ai/
│   ├── context_builder.js
│   ├── llm_client.js
│   └── memory_extractor.js
├── bot.js
├── broadcast.js
├── channel_poster.js
├── channel_topics.js
├── database.js
├── db/
│   ├── database.js
│   ├── schema_v3.sql
│   └── state_repository.js
├── handlers/
│   ├── ai_menu.js
│   ├── help.js
│   └── profile.js
├── logger.js
├── memory/
│   └── summarizer.js
├── prompts.js
├── prompts/
│   ├── lera_base.txt
│   ├── lera_speech.txt
│   ├── lera_intimacy.txt
│   ├── lera_jokes.txt
│   ├── lera_examples.txt
│   ├── lera_virt_examples.txt
│   └── lera_rules.txt
├── radiant/
│   ├── day_templates.js
│   ├── goap_planner.js
│   ├── inventory.js
│   ├── needs.js
│   ├── npc_radiant.js
│   ├── schedule_service.js
│   └── world_map.js
├── server.js
├── utils/
│   └── robust_json.js
└── workers/
    └── simulation_worker.js

public/
├── admin/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── map.html
└── ...

test/
├── engine.test.js
└── radiant_admin.test.js
```

## 5. Основной жизненный цикл сообщения

### 5.1 Получение сообщения

1. Пользователь отправляет текст, фото или другое медиа в Telegram.
2. `bot.js` получает событие Telegraf.
3. Сообщения пользователя временно объединяются debounce-буфером.
4. Несколько быстрых сообщений пользователя могут быть объединены в один запрос.
5. Проверяется:
   - существование пользователя;
   - блокировка;
   - длина запроса;
   - наличие текстового или фото-баланса;
   - включён ли Free Mode.

### 5.2 Атомарное резервирование ресурса

Для обычного пользователя ресурс резервируется до постановки запроса в очередь:

- текстовый запрос использует `free_requests_left`;
- фото-запрос использует `image_balance`.

Резервирование выполняется SQL-операцией с условием `balance > 0`.

Это означает, что при балансе `1` из двух одновременных запросов пройдёт только один.

Если очередь не была создана или генерация завершилась ошибкой, резерв возвращается.

### 5.3 Очередь AI

Запрос добавляется в BullMQ queue `ai-requests`.

В job сохраняются:

- `userId`;
- текст;
- Telegram chat ID;
- ID временного сообщения;
- идентификаторы conversation events;
- batch ID;
- тип зарезервированного ресурса.

`queue.js` worker:

1. вызывает `generateResponse`;
2. отправляет ответ в Telegram;
3. отправляет фото отдельно, если AI добавил `[IMAGE: ...]`;
4. записывает сообщения в историю;
5. записывает conversation events;
6. обновляет статусы входных событий;
7. возвращает ресурс при финальной ошибке.

Очередь настроена на повторные попытки с exponential backoff.

## 6. AI-пайплайн

### 6.1 Сборка контекста

`src/ai/context_builder.js` собирает реальное состояние из PostgreSQL:

- текущая локация;
- активная задача;
- потребности;
- физиология;
- настроение;
- готовность выполнять команды;
- надетая одежда;
- инвентарь;
- дневник;
- текущий слот расписания;
- предыдущий и следующий слот;
- текущий GOAP-контекст.

Контекст строится в read-only режиме.

В режиме Prompt Preview можно передать overrides. Они применяются только в памяти и не изменяют `sim_state`.

### 6.2 Системный промпт

`src/prompts.js` загружает модульные части промпта:

- `lera_base` — основа личности;
- `lera_speech` — стиль речи;
- `lera_intimacy` — интимный режим;
- `lera_jokes` — юмор;
- `lera_examples` — примеры ответов;
- `lera_virt_examples` — примеры виртуальных сцен;
- `lera_rules` — правила и ограничения.

Промпты:

- загружаются из файлов;
- могут быть переопределены через БД;
- редактируются из админки;
- применяются без перезапуска процесса.

Ползунки характера `Flirt`, `Stubbornness`, `Irony`, `Care` намеренно не реализованы.

### 6.3 LLM-провайдеры

`src/ai/llm_client.js` поддерживает:

- несколько AI-провайдеров;
- приоритеты;
- timeout;
- fallback при ошибке;
- параметры temperature/presence/frequency penalty;
- кэширование OpenAI-compatible клиентов.

Провайдеры управляются из админки.

### 6.4 Prompt Logs

Каждый вызов LLM сохраняется в `prompt_logs`.

Лог содержит:

- user ID;
- тип вызова;
- roleplay mode;
- модель;
- провайдер;
- исходный текст пользователя;
- system prompt;
- Radiant context;
- `messages[]`;
- state snapshot;
- использованные факты памяти;
- raw response;
- parsed response;
- usage;
- latency;
- фото-флаг;
- ошибку, если она была.

Это используется вкладкой Prompt Inspector.

## 7. Глобальная симуляция Леры

Главный исполнитель — `src/workers/simulation_worker.js`.

Worker запускается один раз при старте бота и выполняет тик каждые 5 минут.

### Последовательность тика

1. Получить lock на глобальное состояние.
2. Вычислить прошедшее время.
3. Увеличить/уменьшить потребности.
4. Обработать состояния NPC.
5. Проверить критические нужды.
6. Добавить interrupt-задачи в `sim_queue`.
7. Если очередь пуста, создать задачу из текущего расписания.
8. Разрешить GOAP-зависимости.
9. Выполнить прогресс активной задачи.
10. Применить детерминированные последствия завершённой задачи.
11. Обновить глобальное состояние.
12. Синхронизировать слот расписания.
13. Записать дневник.
14. Записать rationale.

LLM не вызывается для математического тика.

### Приоритеты

Сначала обрабатываются:

1. критические нужды;
2. NPC interrupts;
3. задачи администратора;
4. GOAP dependencies;
5. расписание обычной жизни.

Задача расписания имеет низкий приоритет и добавляется только если `sim_queue` пуста.

## 8. Потребности и эффекты задач

Потребности хранятся в `sim_state.needs`:

- `hunger` — голод;
- `fatigue` — усталость;
- `boredom` — скука;
- `horny` — возбуждение;
- `hygiene` — гигиена;
- `bladder` — потребность в туалете;
- `mood` — настроение.

Все значения ограничиваются диапазоном 0–100.

### Примеры эффектов

- `EAT_FOOD_HOME`:
  - списывает первый доступный food item;
  - использует `hunger_restore` конкретного предмета;
  - использует `mood_boost` конкретного предмета.
- `BUY_FOOD_STORE`:
  - проверяет баланс кошелька;
  - списывает 250 рублей;
  - добавляет `cheese_ramen`.
- `SLEEP_EXHAUSTED`:
  - уменьшает fatigue;
  - повышает mood.
- `GO_TO_BATHROOM`:
  - сбрасывает bladder.
- `HYGIENE` или `SHOWER`:
  - устанавливает hygiene в 100.
- `WORK`:
  - увеличивает fatigue;
  - может увеличить boredom.
- `SOCIAL`/`BAR`:
  - уменьшает boredom;
  - повышает mood;
  - увеличивает fatigue.

## 9. Инвентарь и гардероб

Инвентарь хранится в `sim_inventory`.

Предмет содержит:

- `item_id`;
- `item_type`;
- `properties`;
- `quantity`;
- `is_equipped`.

Одежда поддерживает слоты:

- `underwear`;
- `top`;
- `bottom`;
- `dress`;
- `outer`;
- `shoes`.

Пример свойств:

```json
{
  "warmth": 20,
  "rain_resist": true,
  "location_type": "street",
  "slot": "outer"
}
```

При надевании:

- заменяется конфликтующий слот;
- платье снимает верх и низ;
- бельё и обувь остаются;
- одежда попадает в prompt context;
- GOAP может использовать свойства одежды для выбора маршрута и переодевания.

Инвентарь списывается атомарным `UPDATE ... WHERE quantity >= requested_quantity`, поэтому количество не становится отрицательным.

## 10. Расписание 24 часа

Расписание генерируется кодом из шаблонов:

- `WEEKDAY_FREELANCE`;
- `FRIDAY_SOCIAL`;
- `WEEKEND_LAZY`.

Каждый день содержит 24 слота, по одному на час.

Слот имеет:

- час;
- категорию;
- planned action;
- location ID;
- status;
- фактический лог;
- причину изменения.

Статусы:

- `PLANNED`;
- `IN_PROGRESS`;
- `DONE`;
- `MUTATED`.

Завершённый слот замораживается. Если симуляция не успела записать фактическое событие, слот получает явную отметку:

```text
Фактический лог отсутствует: симуляция не зафиксировала этот час
```

План не выдаётся за факт.

## 11. GOAP

`src/radiant/goap_planner.js` отвечает за:

- разрешение зависимостей задач;
- проверку одежды;
- проверку еды;
- проверку денег;
- расчёт travel time;
- расчёт willingness;
- построение visual chain для админки.

Пример emergency food chain:

```text
EQUIP_OUTFIT
→ TRAVEL_TO_LOCATION
→ BUY_FOOD_STORE
→ TRAVEL_TO_LOCATION
→ EAT_FOOD_HOME
```

После раскрытия родительская задача закрывается, чтобы не создавать подзадачи повторно на каждом тике.

## 12. NPC и timezone

Поддерживаются NPC:

- Настя;
- Макс.

Их состояния хранятся в `sim_npc_state`.

NPC могут создавать interrupts:

- приглашение в бар;
- срочные рабочие правки;
- другие будущие события.

Временные окна используют `Europe/Moscow`, а не timezone операционной системы.

## 13. Админка

Админка находится в:

- `public/admin/index.html`;
- `public/admin/app.js`;
- `public/admin/style.css`.

### Вкладки

1. Карта и состояние.
2. Расписание 24 часа.
3. Промпты Леры.
4. Prompt Inspector.
5. Память пользователей.
6. Rationale и логи решений.
7. Инвентарь и GOAP.
8. Каталог фото.
9. AI-провайдеры.
10. Telegram-канал и воронки.
11. Users CRM.
12. Тарифы и промокоды.
13. Live logs и диагностика.

## 14. Авторизация админки

Поток входа:

1. Браузер запрашивает `/api/admin/session`.
2. Если cookie нет, показывается login overlay.
3. Ключ отправляется на `POST /api/admin/login`.
4. Сервер устанавливает:
   - `HttpOnly`;
   - `SameSite=Strict`;
   - `Path=/api/admin`;
   - ограниченный `Max-Age`.
5. Последующие запросы используют cookie.

Секрет не передаётся в URL и не хранится в `app.js`.

## 15. Каталог фото

Таблица `lera_photos` хранит:

- Telegram `file_id`;
- caption;
- access level;
- time of day;
- общие теги;
- уровень откровенности;
- теги одежды.

Поддерживаются уровни:

- `free`;
- `premium`;
- `vip`.

### Upload

1. Админ выбирает локальное изображение.
2. Браузер кодирует его в data URL.
3. Сервер отправляет изображение через Bot API в чат администратора.
4. Telegram возвращает настоящий `file_id`.
5. В БД сохраняется только `file_id` и метаданные.

Максимальный размер upload — 10 МБ.

### Preview

Preview работает через server-side proxy:

```text
GET /api/admin/photos/:id/preview
```

Telegram URL с bot token не возвращается браузеру.

## 16. Пользовательская память

Основная таблица — `user_memories`.

Память поддерживает:

- добавление;
- редактирование;
- активацию;
- деактивацию;
- удаление;
- просмотр в Prompt Inspector.

При извлечении памяти AI не может деактивировать чужую запись: запрос теперь проверяет и `memory_id`, и `user_id`.

## 17. Дайджесты

### Глобальные дайджесты

- `DAILY` — события дневника Леры;
- `WEEKLY` — объединение дневных сводок;
- `MONTHLY` — объединение недельных сводок.

### Пользовательские дайджесты

- `USER_CHAT / DAILY` — события конкретного диалога;
- `USER_CHAT / WEEKLY` — развитие отношений за неделю;
- `USER_CHAT / MONTHLY` — долгосрочная динамика.

Записи идемпотентны по типу, потоку, периоду и пользователю.

## 18. Telegram-канал

Настройки канала:

- ID канала;
- ссылка;
- частота публикаций;
- число сообщений в одном посте;
- медиа-режим;
- список тем;
- веса тем;
- включение автопостинга.

Темы:

- `thoughts`;
- `flirt`;
- `life`;
- `jokes`;
- `questions`.

Автопостинг:

- проверяется каждые 15 минут;
- учитывает фактическое время последней публикации;
- выбирает тему по весам;
- использует дневник и состояние Леры;
- защищён от параллельного запуска;
- корректно останавливается при shutdown.

## 19. Рассылки

BullMQ broadcast queue поддерживает:

- текст;
- фото;
- видео;
- документ;
- animation/GIF;
- inline-кнопку.

Сегменты:

- все активные пользователи;
- пользователи с покупками;
- пользователи без покупок;
- неактивные больше 24 часов;
- Premium.

Очередь поддерживает:

- retries;
- exponential backoff;
- pause;
- resume;
- очистку старых completed/failed jobs;
- graceful shutdown worker-а.

## 20. CRM

Карточка пользователя объединяет:

- Telegram ID;
- username;
- имя;
- Premium status;
- блокировку;
- текстовый баланс;
- фото-баланс;
- total spent;
- историю платежей;
- факты памяти;
- историю диалога.

Действия:

- установить баланс текстов;
- установить баланс фото;
- заблокировать;
- разблокировать;
- выдать текстовый пакет;
- выдать фото-пакет;
- выдать VIP;
- выдать реальный магазинный пакет;
- отправить сообщение от имени Леры.

Сообщение из Live Chat записывается в `conversation_events` с меткой `ADMIN_LIVE_CHAT`.

## 21. Rationale и диагностика

`sim_rationale` хранит реальные причины решений движка:

- изменение нужд;
- interrupt;
- GOAP;
- расписание;
- эффекты задачи;
- административное вмешательство.

Диагностика показывает:

- доступность PostgreSQL;
- latency PostgreSQL;
- доступность Redis/BullMQ;
- очередь waiting/active/failed/delayed;
- состояние simulation worker;
- uptime процесса;
- RSS memory;
- количество prompt logs;
- количество rationale;
- размер активной sim queue.

Если Redis недоступен, read-only endpoint отвечает контролируемым результатом `available: false`, а не зависает бесконечно.

## 22. Retention

Администратор может удалять старые технические записи:

- prompt logs;
- rationale;
- diary.

Значения по умолчанию:

- prompt logs — 30 дней;
- rationale — 14 дней;
- diary — 90 дней.

Удаление запускается вручную из админки.

## 23. База данных

### Текущие Radiant-таблицы

- `sim_state`;
- `sim_inventory`;
- `sim_queue`;
- `sim_npc_state`;
- `sim_diary`;
- `sim_schedule_days`;
- `sim_schedule_slots`;
- `sim_rationale`.

### AI и память

- `prompt_logs`;
- `user_memories`;
- `user_memories_digests`;
- `conversation_events`;
- `chat_history`.

### Пользователи и коммерция

- `users`;
- `payments`;
- `settings`;
- `promocodes`;
- `user_promocodes`;
- `referrals`.

### Медиа и канал

- `lera_photos`;
- `sent_photos`;
- `channel_post_logs`;
- `channel_recommendations`.

## 24. Миграции

`src/db/schema_v3.sql` применяется при старте через `initDatabaseTables()`.

Схема:

- создаёт отсутствующие таблицы;
- добавляет отсутствующие колонки;
- создаёт индексы;
- удаляет старые дубли инвентаря;
- добавляет уникальность `sim_inventory.item_id`;
- обеспечивает идемпотентность memory digests.

Fresh PostgreSQL 17 был проверен локально: схема создаётся с нуля и повторно применяется без ошибки.

## 25. Тесты

Текущий `npm test` выполняет 11 тестов.

Покрыты:

- форматирование conversation gap;
- безопасное форматирование conversation events;
- исправление типичных ошибок LLM JSON;
- 24 слота каждого шаблона;
- выбор weekday/friday/weekend шаблона;
- Europe/Moscow time helper;
- длительность задачи до конца часа;
- эффекты еды/сна;
- запрет изменения голода без еды;
- weighted topic selection;
- реальная GOAP-chain;
- соответствие task type и schedule category.

Дополнительно вручную проверены:

- свежая PostgreSQL schema migration;
- повторное применение schema;
- атомарная reservation текстового ресурса;
- атомарная reservation фото;
- возврат зарезервированного ресурса;
- CRM API;
- upload и preview фото;
- channel settings;
- diagnostics;
- frontend handler contract;
- desktop/mobile layout.

## 26. Результат финального review

В процессе review были исправлены следующие критичные проблемы:

1. Проверка баланса использовала несуществующий `text_balance`.
2. Текстовый баланс можно было обходить параллельными запросами.
3. Фото-баланс не резервировался и не списывался.
4. VIP-фото могло попасть в fallback для бесплатного пользователя.
5. AI memory extractor мог деактивировать факт другого пользователя.
6. Частичный JSON update затирал остальные поля state.
7. Цикл Леры не изменялся через God Mode.
8. GOAP повторно создавал одинаковые подзадачи.
9. NPC использовали timezone сервера.
10. Публичная карта раскрывала приватное состояние.
11. Telegram preview мог раскрыть bot token.
12. Платежные ALTER выполнялись до создания таблицы payments.
13. Инвентарь дублировался на рестартах.
14. BullMQ worker-ы не закрывались при shutdown.
15. Telegram ошибки могли считаться успешными BullMQ jobs.
16. У channel poster не было защиты от параллельной публикации.
17. SSE не имел heartbeat.
18. Redis diagnostic endpoint мог зависать на длительном reconnect.

## 27. Эксплуатационные ограничения

- Для production обязательно задать `ADMIN_WEB_KEY`.
- Для работы очередей нужен Redis.
- Для Telegram upload нужен рабочий `BOT_TOKEN` и корректный `ADMIN_ID`.
- Для канал-постера бот должен иметь права публикации в канале.
- Для платежей нужны рабочие ключи Platega и Telegram Stars configuration.
- Ротация prompt/rationale/diary retention должна выполняться регулярно.
- Если будет несколько экземпляров бота, для channel poster и simulation worker нужен общий distributed lock через Redis/PostgreSQL advisory lock.
- Сейчас NPC-позиции на карте являются базовыми визуальными точками, а не полноценным realtime tracking по отдельной таблице координат.
- Redis в локальном окружении без Docker может отсутствовать; в этом случае диагностика показывает `available: false`.

## 28. Основные точки входа для дальнейшей разработки

- AI-ответы: `src/ai.js`.
- Telegram orchestration: `src/bot.js`.
- AI queue: `src/queue.js`.
- Broadcast queue: `src/broadcast.js`.
- Simulation tick: `src/workers/simulation_worker.js`.
- Global state repository: `src/db/state_repository.js`.
- Database schema: `src/db/schema_v3.sql`.
- Admin API: `src/server.js`.
- Admin frontend: `public/admin/index.html`, `public/admin/app.js`, `public/admin/style.css`.
- LLM prompt modules: `src/prompts.js` и `src/prompts/*.txt`.
- Memory extraction: `src/ai/memory_extractor.js`.
- Memory digests: `src/memory/summarizer.js`.
- Channel poster: `src/channel_poster.js`.
