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
     - **Ночной перенос на утро:** если таймер истекает ночью (23:00 - 09:30 МСК), воркер не будит пользователя, а переносит задачу на 10:30 утра («Доброе утро! Вчера уснула и забыла скинуть/написать...»).
     - **Напоминание при раннем сообщении:** если собеседник написал раньше времени, в промпт подмешивается напоминание `[ВИСИТ ОБЕЩАНИЕ]`, а отложенный job снимается после выполнения.
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
  - `memory_outbox` — асинхронная выгрузка и индексация воспоминаний.
  - `channel_content_generation` — генерация постов и медиа по расписанию.
  - `broadcast_queue` — массовая рассылка уведомлений пользователям с учетом лимитов Telegram.

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
  - Поддержка `ctx.replyWithPhoto`, `ctx.replyWithVoice` с авто-фоллбэком на текст при запретах в группе.
  - В гостевом режиме ответ отправляется через `answerGuestQuery`.
