# AGENTS.md — Карточка и диспетчер проекта tg-ai-bot

> Точка входа для любых AI-ассистентов и агентов. Этот файл — карта навигации по проекту, правилам и памяти.

---

## 1. О проекте в двух словах
- **Название:** `tg-ai-bot` (Telegram AI Companion & Channel Manager with Payments)
- **Стек:** Node.js (ESM), Express 5, Telegraf 4, PostgreSQL 15, Redis 7 + BullMQ, React 19 + Vite + Tailwind CSS v4, Python (`semantica-service`).
- **Суть:** Умный Telegram-бот компаньон (персонаж Лера) с интеграцией LLM/генерации изображений/голоса, поддержкой Radiant AI (симуляция суточного цикла, потребностей, погоды), семантической памятью, автопостингом в Telegram-каналы, платными тарифами (Platega) и веб-админкой (`admin-v2`).

---

## 2. Быстрые команды

```bash
# Запуск бота и бэкенд-сервера
npm run dev        # node --env-file=.env src/bot.js

# Запуск тестов
npm test           # node --test --test-force-exit test/*.test.js

# Сборка веб-админки
npm run admin:build # vite build --config admin-v2/vite.config.js

# Запуск стека через Docker Compose
docker compose up -d
```

---

## 3. Архитектура и структура папок

```
.
├── AGENTS.md               # Этот файл (главный диспетчер)
├── memory/                 # Слои контекстной памяти (ленивое чтение)
│   ├── index.md            # Индекс и маршрутизация по памяти
│   ├── architecture.md     # Общая топология и потоки данных
│   ├── backend.md          # Сервер, бот, базы данных, очереди, Radiant
│   ├── frontend.md         # Админка admin-v2 (React 19, Tailwind, компоненты)
│   ├── payments.md         # Интеграция Platega, подписки, балансы
│   ├── gotchas.md          # Грабли, лимиты, костыли, тонкие места
│   └── domain.md           # Глоссарий предметной области и бизнес-правила
├── src/                    # Бэкенд, бот, сервисы, БД
│   ├── ai/                 # Роутинг моделей, контекст, память, скоринг ответов
│   ├── db/                 # Postgres репозитории, миграции, схема schema_v3.sql
│   ├── radiant/            # NPC симуляция суточного цикла, потребностей, GOAP
│   ├── memory/             # Семантическая память, нормализаторы, outbox worker
│   ├── services/           # Провайдеры (Platega, AI Matrix, генерация медиа)
│   ├── handlers/           # Обработчики команд и меню Telegram
│   ├── bot.js              # Точка входа Telegram бота
│   ├── server.js           # Express API сервер (порт 3000)
│   └── queue.js            # BullMQ очереди и воркеры
├── admin-v2/               # Фронтенд админ-панели (Vite + React 19)
│   └── src/features/       # Модули: CRM, Channel, Content, Providers, Studio...
├── semantica-service/      # Python сервис семантической памяти (порт 8081)
└── test/                   # Тесты на Node.js test runner
```

---

## 4. Протокол работы с памятью (Lazy Reading)

Не читай все подряд и не сканируй весь репозиторий без необходимости.
Перед выполнением задачи выбери только нужный слой из таблицы:

| Направление задачи | Какой файл читать в `memory/` | Дополнительно |
|---|---|---|
| **Навигация и старт** | [index.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/index.md) | Карта слоев |
| **Общая архитектура / Новые сервисы** | [architecture.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/architecture.md) | docker-compose.yml |
| **Бот / API / БД / Radiant / Очереди** | [backend.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/backend.md) | src/ |
| **Админка / UI / Компоненты / Стили** | [frontend.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/frontend.md) | admin-v2/ |
| **Платежи / Тарифы / Балансы / Чеки** | [payments.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/payments.md) | src/services/platega.js |
| **Странные баги / Падения / Таймауты** | [gotchas.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/gotchas.md) | Логи, .env |
| **Бизнес-логика / Лимиты / Понятия** | [domain.md](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/memory/domain.md) | Тарифная сетка |

---

## 5. Главные правила и ограничения (Guardrails)

1. **Точечные правки:** Не переписывай работающие модули целиком. Минимальный безопасный diff.
2. **Секреты:** Никогда не коммить и не логируй секреты из `.env` (`BOT_TOKEN`, `PLATEGA_SECRET_KEY`, `OPENROUTER_API_KEY` и др.).
3. **ESM:** Проект строго на ECMAScript Modules (`"type": "module"`). Используй явные импорты с расширением `.js` (`import foo from './foo.js'`).
4. **Проверка после изменений:**
   - Для фронтенда: `npm run admin:build`
   - Для бэкенда/логики: `npm test` или запуск специфичного теста из `test/`
5. **Политика актуализации памяти:** Если в задаче изменились роуты, схемы БД, логика платежей или появились новые грабли — обнови соответствующий файл в `memory/` и укажи это в отчете.
