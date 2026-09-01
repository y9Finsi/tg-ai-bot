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

1. **Native Tool Calling (`src/ai/chat_tools.js`):**
   - Инструменты: `send_photo`, `send_voice`, `send_content`, `set_reaction`, `set_interaction_mode`.
   - Модель управляет медиа, реакциями и эротическими переходами через нативные вызовы функций вместо текстовых псевдо-тегов `[VOICE: ...]`.

2. **Pre-flight Response Judge (`src/ai/response_judge.js`):**
   - Возвращает JSON: `{ passed, verdict, code, reason, relationshipEvent, arousalEvent }`.
   - **Reflective Retry:** При отклонении реплики передает модели точную причину (`judgeResult.reason`).
   - При повторном отклонении ответ берется из второй очищенной попытки без вымышленных VPN-заглушек.

3. **Ситуационная память с динамическим TTL (`src/ai/memory_extractor.js`):**
   - Временные события (`EPISODE`: дорога, тусовка, пары, болезнь) получают `valid_until`.
   - Экстрактор имеет автоматический фолбэк на активный провайдер чата при сетевых ошибках и 502 ответах.

4. **Кэширование статистики канала (`src/db/database.js`):**
   - `getChannelSubscriberCount` — in-memory кэш с TTL 30 минут (`SUBSCRIBER_CACHE_TTL_MS = 30 * 60 * 1000`).
   - `getLatestPublishedChannelPost` — in-memory кэш с TTL 5 минут.

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
