# memory/backend.md — Бэкенд, Telegram-бот и сервисы

## 1. Карта каталогов `src/`

```
src/
├── bot.js                  # Главный файл Telegram бота (Telegraf)
├── server.js               # Express 5 API сервер (админка, вебхуки, метрики)
├── queue.js                # BullMQ очереди и обработка фоновых задач
├── typing_manager.js       # Реалистичная имитация задержек и статуса "печатает"
├── channel_poster.js       # Автоматический постинг контента в Telegram-канал
├── channel_comments.js     # Автоматическое комментирование постов в канале
├── channel_content.js      # Генерация контент-плана и адаптация постов
├── ai/                     # LLM пайплайн
│   ├── llm_client.js       # Клиент к OpenRouter / OpenAI / Gemini
│   ├── context_builder.js  # Сборщик единого промпта (память + radiant + история)
│   ├── intent_router.js    # Классификатор намерений пользователя
│   ├── response_judge.js   # Валидатор и скорер ответов модели
│   └── memory_extractor.js # Извлечение фактов из диалога для долгосрочной памяти
├── db/                     # Слой базы данных (PostgreSQL)
│   ├── database.js         # Пул соединений pg.Pool и базовые хелперы
│   ├── state_repository.js # Репозиторий состояния пользователей и сессий
│   ├── tools_repository.js # Хранилище тулов и кастомных состояний
│   ├── migrations/         # SQL-миграции схемы
│   └── schema_v3.sql       # Актуальный DDL схемы
├── memory/                 # Семантическая память
│   ├── semantica_client.js # HTTP-клиент к микросервису semantica-service
│   ├── memory_repository.js# Доступ к типизированным воспоминаниям
│   ├── memory_normalizer.js# Очистка и нормализация фактов
│   └── memory_outbox_worker.js # Фоновая синхронизация воспоминаний
├── radiant/                # Движок симуляции личности (NPC)
│   ├── day_runner.js       # Суточный планировщик и симуляция 24ч
│   ├── daily_routine.js    # Расписание и паттерны дня (учеба, работа, отдых)
│   ├── needs.js            # Система потребностей (энергия, голод, социализация)
│   ├── goap_planner.js     # GOAP (Goal-Oriented Action Planning) планировщик действий
│   └── weather_service.js  # Погода СПб для создания естественного контекста
├── services/               # Интеграции и внешние API
│   ├── ai_matrix.js        # Матрица моделей LLM с фолбэками
│   ├── image_generator.js  # Генерация картинок (Midjourney / Stable Diffusion / DALL-E)
│   ├── voice_generator.js  # Синтез и распознавание голосовых сообщений
│   ├── platega.js          # Интеграция с платежным шлюзом Platega
│   └── referral.js         # Реферальная система пользователей
└── handlers/               # Хэндлеры команд Telegram бота
    ├── ai_menu.js          # Меню режимов AI
    ├── profile.js          # Профиль пользователя, баланс и подписка
    └── help.js             # Справка и команды помощи
```

---

## 2. База данных и миграции

- **Пул соединений:** `src/db/database.js` инициализирует `pg.Pool` из `DATABASE_URL` (или `POSTGRES_*` переменных).
- **Схема и миграции:**
  - `init.sql` — базовые таблицы (`users`, `messages`, `global_settings`, `payments`).
  - `src/db/migrations/` — инкрементальные миграции:
    - `009_typed_memory.sql` — типизированная семантическая память (`memory_fact`, `memory_outbox`).
    - `011_migrate_legacy_memories.sql` — миграция оставшихся записей из `user_memories` в `memory_fact`.
- **Схема v3:** `src/db/schema_v3.sql` содержит полную картину схемы базы данных.

---

## 3. Диалоговый и ИИ-пайплайн (Smart Agent Core)

1. **Native Tool Calling (`src/radiant/actions/` & `src/ai.js`):**
   - Инструменты: `send_photo`, `send_voice`, `send_content`, `set_reaction`, `set_interaction_mode`, `schedule_followup`, `web_search`, `weather`, `spb_places`, `get_channel_posts`.
   - **Отложенные обещания и действия (`schedule_followup.js`):**
     - Позволяет Лере давать обещания («пойду заварю кофе, скину как заварюсь», «доеду до работы напишу») и ставить отложенную задачу в BullMQ (`aiQueue.add('followup-promise', ..., { delay })`).
     - Детерминированный `jobId: followup-${userId}` (максимум 1 активный followup на пользователя с авто-перезаписью).
     - Доступен строго в личных сообщениях (ЛС, `isPublicContext: false`). В группах тул не предлагается модели.
     - **Отмена при новом сообщении (`cancelFollowupPromise`):** если пользователь присылает новое текстовое сообщение в ЛС, бытовые обещания Леры («я в душ») отменяются через `cancelFollowupPromise(userId)`, чтобы не спамить неактуальным возвратом в новый разговор.
     - **Архитектура модуля (`src/services/followup_service.js`):** управление картой обещаний (`pendingFollowupMap`), постановкой (`enqueueFollowupPromise`), отменой (`cancelFollowupPromise`) и чтением (`getPendingFollowup`) вынесено в изолированный сервис `followup_service.js`, полностью устраняя циклическую зависимость `ai.js <-> queue.js`.
   - **Социальные обещания и открытые гештальты (`record_open_thread.js`):**
     - Фиксирует обещания пользователя для Леры («скину трек потом», «покажу кота», «расскажу про работу»).
     - Сохраняет факт в Postgres (`memory_fact`, тип `OPEN_THREAD`, TTL 36ч) с правилом 1 слота (новое обещание тихо вытесняет предыдущее).
     - В моменте модель отвечает живой репликой («вахвхав хорошо, ловлю на слове»), без палева таймеров.
     - На следующий день (12:00–20:00 МСК, лаг >= 12ч) сервис инициатив (`initiative_service.js`) выбирает `open_thread` и пишет первой: «кстааати)) ты мне трек обещал скинуть вообще-то».
     - Принцип **One-Shot**: после отправки тред сразу деактивируется (`is_active = false`), исключая спам и накопление долгов.
   - **Умный подбор фото (`send_photo.js`):**
     - Строгий запрет повторного круга (ранее отправленные фото из `sent_photos` исключаются навсегда).
     - Контекстный скоринг: совпадение по времени суток, локации/обстановке (кровать/сон/пижама vs улица/прогулка/город) и штрафы за несовместимый вайб (уличные фото при запросе перед сном).
     - При отсутствии подходящего кадра — автоматический запуск нейрогенератора `generateLeraPhoto` с точным описанием сцены и сохранением в базу. При недоступности — возврат кода `NO_PHOTO` для естественного нехардкод-отказа модели.
   - **Голосовые сообщения (`send_voice.js`):**
     - Вызов `generateLeraVoice({ text })` синтезирует живой голос Леры через CosyVoice.
     - Изоляция follow-up шага: текст войса не скармливается обратно в LLM, чтобы исключить утечки мета-рассуждений. В Telegram отправляется чистый войс с нативным индикатором `record_voice`.
     - Нативный статус `upload_photo` и `record_voice` в [`typing_manager.js`](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/src/typing_manager.js) вместо текстовых заглушек.

2. **Pre-flight Response Judge (`src/ai/response_judge.js`):**
   - JSON-валидация ответа: `{ passed, verdict, code, reason, relationshipEvent, arousalEvent }`.
   - **Контракт `SYSTEM_LEAK`:** Автоматическая отбраковка любых служебных инструкций и мета-мыслей модели («НЕ повторяй...», «Не начинай с...», «Ответь своими словами»).
   - **Reflective Retry:** При отклонении реплики передает модели точную причину (`judgeResult.reason`) для естественного исправления.

3. **Ситуационная память с динамическим TTL (`src/ai/memory_extractor.js`):**
   - Временные события (`EPISODE`: дорога, тусовка, пары, болезнь) получают динамический `valid_until` (от 2 до 48 часов).
   - Экстрактор имеет автоматический фолбэк на активный провайдер чата при сетевых ошибках и 502 ответах.
   - Фоновый воркер `memory_outbox_worker.js` асинхронно синхронизирует воспоминания с `semantica-service`.

4. **Кэширование статистики и постов канала (`src/db/database.js`):**
   - `getChannelSubscriberCount` — in-memory кэш с TTL 30 минут.
   - `getLatestPublishedChannelPost` — in-memory кэш с TTL 5 минут.
   - Автоматическая инвалидация кэша (`invalidateLatestChannelPostCache`) при сохранении, публикации или удалении постов.

5. **Оптимизация нагрузки на PostgreSQL и кэширование (Этап 2):**
   - **Глобальный Radiant Snapshot Cache (`src/ai/context_builder.js`):** `ContextBuilder.buildSnapshot` кэширует глобальное состояние Леры (sim_state, inventory, queue, facts, observer batches, weather, channel stats, commitments) в памяти на 20 секунд (`SNAPSHOT_CACHE_TTL_MS = 20000`). Снимает 10-12 SQL-запросов на каждую входящую реплику. Экспортирует `invalidateSnapshotCache()`.
   - **Кэширование префиксов настроек (`src/db/database.js`):** `getSettingsByPrefix` использует in-memory кэш `prefixCache` (TTL 30с). Инвалидируется при `setSetting` и `invalidateSettingsCache(key)`.
   - **Оптимизация истории диалога (`src/db/database.js` & `src/ai.js`):** `getRecentConversationEvents(userId, limit, chatHistoryClearedAt)` принимает опциональный `chatHistoryClearedAt` параметром, полностью убирая correlated subquery к таблице `users` при генерации реплик.
   - **Транзакционная изоляция тикера симуляции (`src/workers/simulation_worker.js`):** В `runSubTick` вызов `StateRepository.getLatestForecast(date, client)` использует транзакционный `client`, предотвращая захват лишних соединений из пула во время блокировки `sim_state`. Настройки случайных событий читаются батчем через `getSettingsByPrefix('random_event_enabled_')`.
   - **Анти-N+1 в сервисе инициатив (`src/initiative_service.js`):** В `enqueuePersonalInitiatives` внедрена in-memory предфильтрация 500 пользователей по статусу, окнам времени (`age_seconds`), часам суток и типам событий до обращения к БД. Оставшиеся кандидаты обрабатываются батчами по 10 пользователей (`Promise.all`), а контент запрашивается строго по необходимости.

---

## 3. Сервер Express (`src/server.js`)

Сервер слушает порт `ADMIN_PORT` (по умолчанию `3000`):
- `GET /health` — healthcheck для Docker / оркестратора.
- `POST /webhook/platega` — вебхук подтверждения оплат от платежного сервиса Platega.
- `/api/admin/*` — REST эндпоинты для веб-админки `admin-v2` (авторизация по `ADMIN_WEB_KEY` или токену):
  - Пользователи, статистика, переопределение настроек.
  - Radiant симуляция (форсирование событий, изменение потребностей).
  - Контент и публикации Telegram-канала.
  - Управление провайдерами моделей AI Matrix.

---

## 4. Очереди и асинхронные воркеры (`src/queue.js`)

- Построено на **BullMQ** + **Redis**.
- Очереди:
  - `ai-requests`: обработка входящих сообщений (`processAiJob`), инициатив (`processInitiativeJob`), бытовых обещаний (`processFollowupJob`), напоминаний собеседнику (`processReminderJob`), доставки контента (`processContentDeliveryJob`).
  - `memory_outbox` — асинхронная выгрузка и индексация воспоминаний.
  - `channel_content_generation` — генерация постов и медиа по расписанию.
  - `broadcast_queue` — массовая рассылка уведомлений пользователям с учетом лимитов Telegram.
- **Инструменты напоминаний и отложенных действий:**
  - `schedule_reminder`: планирует независимые напоминания пользователю (от 10 сек до 24 часов). Поддерживает мульти-таймеры (`jobId: reminder-${userId}-${timestamp}-${rnd}`). При вызове из групп отправляет напоминание в ЛС (`chatId: userId`).
  - `schedule_followup`: планирует бытовые возвращения и обещания самой Леры (кофе, душ, дорога, лук с фото) с 1 активным слотом на пользователя.
  - Dual-Mode Tool Calling: распознает как нативные `tool_calls` провайдеров, так и текстовые `<tool_call>{...}</tool_call>` теги.
  - In-Memory Cache для настроек (`settingsCache` с TTL 30с) устраняет N+1 нагрузку на PostgreSQL.
  - Code-First Source of Truth для промптов: файлы в Git (`src/prompts/*.txt`) автоматически обновляют записи в БД при старте.

---

## 5. Изолированный контекст групп и гостевой режим (Guest Mode)

- **База данных:** `conversation_events` хранит `chat_id BIGINT` и `thread_id BIGINT`, составной индекс `idx_conversation_events_chat_thread (chat_id, thread_id, occurred_at DESC)`.
- **Изоляция:**
  - В группах (`envelope.chatId !== userId` или `isPublicContext: true`) история выбирается через `getRecentScopeConversationEvents(chatId, threadId, limit)`.
  - Приватная романтическая память ЛС не утекает в публичные чаты (`memories = []`).
  - Принудительный режим `CASUAL`, 18+/EROTIC в группе жестко блокируется и осаживается в характере Леры.
- **Мультидиалог:**
  - Входящие и исторические сообщения размечаются тегами `<user name="Имя">текст</user>`.
  - Реплаи (`reply_to_message`) размечаются с указанием автора и сниппета (`[в ответ на сообщение (Имя): «...»]`).
- **Медиа и тулы в группе:**
  - `send_photo`: в публичном контексте отключается `allow_db_fallback` (`allowFallback = false`), генерируя свежее фото на лету без использования готовой галереи базы.
  - `schedule_reminder` и `schedule_followup`: проверяют наличие диалога в ЛС (`PM_NOT_STARTED`), планируют доставку в ЛС.
  - Поддержка `ctx.replyWithPhoto`, `ctx.replyWithVoice` с авто-фоллбэком на текст при запретах в группе.
  - В гостевом режиме ответ отправляется через `answerGuestQuery`.

