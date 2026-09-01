# memory/architecture.md — Общая архитектура и топология

## 1. Схема сервисов и топология

Проект разворачивается через `docker-compose.yml` и состоит из 4 ключевых сервисов:

```
                  ┌──────────────────────────────┐
                  │    Telegram Users & Admin    │
                  └──────────────┬───────────────┘
                                 │
                 (Telegram Polling / Webhook + Web UI)
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Node.js Core (bot)                     │
│  - Telegram Bot (Telegraf)                                  │
│  - Express 5 API Server (:3000)                             │
│  - Radiant Engine (NPC State & Day Cycle)                   │
│  - BullMQ Workers (Async Tasks, Content, Broadcast)         │
│  - AI Matrix / LLM Pipeline (OpenRouter, OpenAI, Gemini)    │
└───────┬─────────────────┬───────────────────┬───────────────┘
        │                 │                   │
        ▼                 ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐
│  PostgreSQL  │   │    Redis     │   │   Semantica Service   │
│   (v15-alp)  │   │   (v7-alp)   │   │   (Python, :8081)     │
│              │   │              │   │                       │
│ - Users      │   │ - BullMQ     │   │ - Vector/Semantic     │
│ - Memories   │   │   Queues     │   │   Memory Retrieval    │
│ - Payments   │   │ - Locks &    │   │ - State persistence   │
│ - Radiant DB │   │   Temp state │   │                       │
└──────────────┘   └──────────────┘   └───────────────────────┘
```

---

## 2. Основные компоненты и порты

| Сервис | Технология | Порт | Назначение |
|---|---|---|---|
| **Core Bot & Server** | Node.js (ESM), Express 5, Telegraf | `3000` | Обработка апдейтов Telegram, REST API админки, вебхуки оплат |
| **Semantica Service** | Python, FastAPI/urllib | `8081` | Семантическая память и ранжирование релевантных воспоминаний |
| **Database** | PostgreSQL 15 | `5432` | Основное реляционное хранилище пользователей, сообщений, состояния Radiant и платежей |
| **Queue / Cache** | Redis 7 | `6379` | Очереди BullMQ (отложенный постинг, генерация контента, бродкасты) |
| **Admin UI (admin-v2)** | React 19, Vite, Tailwind CSS v4 | — | Веб-панель управления (билдится через `npm run admin:build` или Vite dev) |

---

## 3. Поток обработки сообщения (LLM & Radiant Pipeline)

1. **Вход сообщения:** Пользователь отправляет текст/голос/фото в Telegram -> Telegraf перехватывает апдейт в `src/bot.js`.
2. **Проверка доступа и баланса:** Проверяется `free_requests_left`, `is_premium`, лимиты генераций через `src/db/state_repository.js`.
3. **Сбор контекста (`src/ai/context_builder.js`):**
   - Последние сообщения из диалога (`src/db/`).
   - Долгосрочные факты из семантической памяти (`semantica-service` / `src/memory/`).
   - Текущее состояние Radiant NPC: уровень энергии, настроение, текущее занятие по суточному циклу (`src/radiant/`).
   - Погодный контекст (Open-Meteo в СПб).
4. **Роутинг модели (`src/services/ai_matrix.js` / `src/ai/llm_client.js`):**
   - Выбор модели в зависимости от задачи (быстрый ответ, креатив, vision).
5. **Оценка качества ответа (`src/ai/response_judge.js`):**
   - Проверка соответствия тону Леры, валидация отсутствия галлюцинаций.
6. **Сохранение памяти & Ответ:**
   - Ответ отправляется пользователю с имитацией набора текста (`src/typing_manager.js`).
   - Новые факты из диалога асинхронно отправляются в `src/memory/memory_outbox_worker.js`.
