# Отчёт по работе: Content Life для Леры (Полная реализация)

Дата: 8 сентября 2026 года  
Исполнитель: Субагент Content Life Implementer

---

## 1. Задача — что нужно было сделать

Реализовать полный сквозной жизненный цикл автономного контента (Content Life) для Леры:
- Починить регулярные выражения и сетевые таймауты парсера/скрапера источников (`src/content/content_scraper.js`);
- Добавить поддержку RSS-фидов для каналов YouTube и функцию пакетного обхода `scrapeAllActiveSources()`;
- Расширить схему БД миграцией для отслеживания ошибок источников, причин отклонения, скоринга и быстрых индексов;
- Добавить серверные endpoints для удаления источников, истории запусков, расширенной фильтрации находок со счетчиками и автопаузы источников при 3 ошибках подряд;
- Реализовать полнофункциональный темный UI в стиле Linear в `admin-linear` (3 вкладки: «Банк материалов», «Находки скрапера», «Источники» с управлением, статусами и действиями);
- Реализовать жизненный цикл задачи `CONTENT_BROWSE` в Radiant (`src/radiant/content_browse_service.js`) с отбором пачки, оценкой качества, принятием/отклонением/откладыванием и записью сессий;
- Заменить случайный выбор контента в `send_content` на многофакторный скоринг и фиксировать историю использования в `content_usage`;
- Обеспечить авто-approve находок в `src/queue.js` при отложенных follow-up и сохранить параметры при утреннем переносе.

---

## 2. Что реализовано

### 2.1. Критический фикс парсера и скрапера (`src/content/content_scraper.js`)
- Починены опечатки в регулярках: `[sS]` заменено на `[\s\S]` в `parseTelegram` и `parseRss`, благодаря чему многострочные блоки Telegram-виджетов и XML-элементы `<item>` / `<entry>` захватываются корректно.
- Добавлен таймаут `signal: AbortSignal.timeout(10000)` во все сетевые запросы `fetch`, предотвращая зависание очередей и воркеров.
- Реализовано обнаружение и парсинг YouTube-каналов (`/@handle`, `/channel/UC...`, `/c/`): скрапер извлекает `channel_id`, запрашивает официальный XML-фид `https://www.youtube.com/feeds/videos.xml?channel_id=...` и извлекает свежие видеоролики с обложками и описанием. Одиночные ссылки на видео продолжают поддерживаться через OpenGraph-метаданные.
- Реализована и экспортирована функция `scrapeAllActiveSources()`: защищена флагом `isScrapingActive` от гонок и повторных запусков, последовательно опрашивает все активные источники, фиксирует результаты в `content_scrape_runs`, считает `consecutive_errors` и автоматически отключает источник (`enabled = FALSE`) при 3 сбоях подряд.

### 2.2. Схема базы данных (`src/db/migrations/20260908_content_life.sql`)
- В таблицу `content_sources` добавлены колонки:
  - `consecutive_errors INT NOT NULL DEFAULT 0`
  - `check_interval_minutes INT NOT NULL DEFAULT 180`
  - `is_trusted BOOLEAN NOT NULL DEFAULT FALSE`
- В таблицу `content_discoveries` добавлены колонки:
  - `rejection_reason TEXT`
  - `quality_score NUMERIC NOT NULL DEFAULT 0`
- Добавлены индексы:
  - `content_usage_user_content_idx` на `content_usage(user_id, content_id)`
  - `content_scrape_runs_source_idx` на `content_scrape_runs(source_id, started_at DESC)`
- Все изменения оформлены как идемпотентные `CREATE TABLE IF NOT EXISTS` и `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### 2.3. Бэкенд API и автопауза (`src/server.js`)
- `POST /api/admin/content/sources/:id/run`:
  - При ошибке инкрементирует `consecutive_errors`, фиксирует `last_error`. Если ошибок >= 3, переводит источник в `enabled = FALSE`.
  - При успехе сбрасывает `consecutive_errors = 0`, очищает `last_error` и обновляет `last_success_at = NOW()`.
- Добавлен `DELETE /api/admin/content/sources/:id` для удаления источников.
- Добавлен `GET /api/admin/content/runs`: возвращает последние 50 запусков скрапера с именем и типом источника.
- Обновлен `GET /api/admin/content/discoveries`:
  - Поддерживает фильтрацию по `status`, `source_id`, `category` и полнотекстовый поиск по `q` (`title` и `raw_text`).
  - Возвращает агрегированный объект счетчиков `counts: { total, discovered, saved, rejected, expired }` для бейджей UI.
- Обновлен `POST /api/admin/content/discoveries/:id/approve`:
  - При создании `lera_content` тип медиа (`telegramType`) определяется автоматически: `video`, `photo`, `audio` или `link`.
  - Проставляются флаги: `allowInDialogue: true, allowInitiative: true, allowChannel: false`.
- Добавлена фоновая задача `startContentBackgroundTasks`: периодически (раз в 30 минут) запускает `scrapeAllActiveSources()` и переводит просроченные находки (`expires_at < NOW()`) в статус `EXPIRED`.

### 2.4. Полноценный UI в стиле Linear (`admin-linear`)
- В `admin-linear/src/components/ContentBankTab.jsx` добавлены вкладки 1-го уровня:
  1. `Банк материалов` — каталог `lera_content` (список/сетка, редактирование, тестовая отправка в Telegram).
  2. `Находки скрапера` (`ContentDiscoveriesView.jsx`).
  3. `Источники` (`ContentSourcesView.jsx`).
- Вкладка **«Источники»**:
  - Карточки источников с иконками типов (Telegram / RSS / YouTube), адресами, тегами/топиками.
  - Отображение статусов («Активен» / «Пауза»), бейджей ошибок (`Сбоев: N`) и даты последнего сбора.
  - Кнопка «Собрать сейчас» с отображением спиннера и toast-уведомлением с количеством найденных и новых материалов.
  - Модальное окно добавления источника с валидацией.
  - Переключатель активности источника и кнопка удаления.
- Вкладка **«Находки скрапера»**:
  - Фильтры по статусам с живыми счетчиками: `Все`, `Новые`, `В банке`, `Отклоненные`, `Архив`.
  - Фильтрация по источникам и поиск по тексту находок.
  - Карточки находок: заголовок, сниппет описания, оригинальный URL, дата, оценка качества ★.
  - Кнопки быстрых действий для статуса `DISCOVERED`: «В банк» (перенос в `lera_content` + статус `SAVED`), «Отклонить» (`REJECTED`) и «В архив» (`EXPIRED`).
  - Строгое соблюдение палитры Linear UI (`#151515`, `#181818`, `#242424`, `#292e5e`, `#434771`, акценты emerald/rose/amber/sky).

### 2.5. Radiant `CONTENT_BROWSE` Lifecycle (`src/radiant/content_browse_service.js`)
- Создан сервис `src/radiant/content_browse_service.js`:
  - Метод `executeContentBrowseSession(radiantTaskId)` открывает сессию в `content_browse_sessions`.
  - Выбирает пачку из 5 свежих находок со статусом `DISCOVERED`.
  - Оценивает качество (проверка спама, длина текста, наличие заголовка, категория, домен).
  - Качественные материалы (скор >= 60) автоматически переносит в банк `lera_content` со статусом `SAVED`.
  - Мусорные/спам-материалы (скор < 30) переводит в `REJECTED` с причиной.
  - Пограничные оставляет на дальнейшее осмысление (`DEFER`).
  - Фиксирует решения в `content_browse_decisions` и завершает сессию со сводкой `stats`.
- В `src/workers/simulation_worker.js` подключен вызов `executeContentBrowseSession` при завершении задачи `CONTENT_BROWSE`.

### 2.6. Скоринг и трекинг доставки (`src/radiant/actions/plugins/send_content.js` и `src/queue.js`)
- В `send_content.js`:
  - Заменен чистый `Math.random()` на скоринг кандидатов:
    - совпадение категории: +30
    - совпадение ключевых слов: +30
    - новизна материала: +10 (< 7 дней), +5 (< 2 дней)
    - штраф за недавнюю отправку этому пользователю: -50 (< 7 дней), -20 (< 30 дней)
    - бонус за инициативность: +10
  - При отправке фиксируется запись в `content_usage` (`content_id`, `user_id`, `surface = 'dialogue'`, `result = 'SUCCESS'`).
- В `src/queue.js`:
  - В `processFollowupJob`: при утреннем переносе ночного напоминания сохраняются и прокидываются `contentId` и `discoveryId`.
  - Если передан `discoveryId` без `contentId`, находка автоматически принимается в банк (`addLeraContent`), привязывается к discovery со статусом `SAVED` и отправляется пользователю.
  - Фиксируется запись в `content_usage` (`surface = 'followup'`).

---

## 3. Статус задач из первоначального плана

| Пункт плана | Статус | Комментарий |
|---|---|---|
| 1. UI находок и источников в админке | **ВЫПОЛНЕНО** | Реализованы вкладки «Источники» и «Находки» с фильтрами, счетчиками, модалкой и действиями |
| 2. Worker lifecycle для CONTENT_BROWSE | **ВЫПОЛНЕНО** | Создан `content_browse_service.js`, интегрирован в `simulation_worker.js`, пишет сессии и решения |
| 3. Схема БД, индексы и retention | **ВЫПОЛНЕНО** | Обновлена миграция `20260908_content_life.sql`, добавлены колонки и индексы |
| 4. Авторасписание и автопауза источников | **ВЫПОЛНЕНО** | `scrapeAllActiveSources()` отключает источник после 3 сбоев; запущен фоновый таймер скрапинга и экспирации |
| 5. YouTube RSS feeds каналов | **ВЫПОЛНЕНО** | Поддержаны URL каналов, резолвинг `channel_id` и чтение XML фида `videos.xml` |
| 6. Скоринг контента и трекинг `content_usage` | **ВЫПОЛНЕНО** | Многофакторный скоринг в `send_content`, запись в `content_usage`, авто-approve в follow-up |

---

## 4. Проверка и верификация

1. **Синтаксическая проверка JS (`node --check`):**
   - `src/content/content_scraper.js` — OK (код 0)
   - `src/server.js` — OK (код 0)
   - `src/radiant/content_browse_service.js` — OK (код 0)
   - `src/workers/simulation_worker.js` — OK (код 0)
   - `src/radiant/actions/plugins/send_content.js` — OK (код 0)
   - `src/queue.js` — OK (код 0)
2. **Сборка фронтенда (`npm run admin:build`):**
   - Успешная сборка Vite v7.3.6 за 4.17с без ошибок и предупреждений типизации.
3. **Модульные тесты (`node --test`):**
   - `test/content_life.test.js` — 3/3 пройдены (проверка нормализации `canonicalUrl`, парсинга многострочного RSS и виджетов Telegram).
   - `test/initiative_content.test.js` — 11/11 пройдены.

---

## 5. Дополнительные улучшения: Яндекс Музыка, личный дневник и UX

- **Интеграция с Яндекс Музыкой (Python Sidecar):**
  - Поддержка парсинга треков, плейлистов, чартов и страниц артистов через `yandex-music` API по токену.
  - Обработка экспирации токена (`TOKEN_EXPIRED` 401) и геоблока (`GEOBLOCK_451`) с фиксацией в `last_error`.
- **Связь с Radiant & Дневником Леры:**
  - При нахождении и сохранении музыкального трека событие `LISTENED_MUSIC` фиксируется в `sim_factual_events`, делается запись в `sim_diary`, снижается скука (`boredom -20`) и поднимается настроение (`mood +10`).
  - Фактическое событие подмешивается в `{{day_events}}`, благодаря чему Лера естественно упоминает треки в диалогах с пользователем без галлюцинаций.
  - Дедупликация по `canonical_url` исключает повторы в `lera_content`.
- **Админка (Linear UI):**
  - Вывод обложек треков/альбомов (`thumbnail`) и бейджей исполнителей в находках скрапера.
  - Панель быстрых пресетов источников в 1 клик (Местное инди, Чарт, Инди лучшее, Родной Звук, КудаГо, The Flow, KEXP).
  - Сброс счетчика сбоев и ошибок при повторном включении источника.
  - Автоматическая очистка устаревших находок (> 30 дней) и логов запусков (> 14 дней).
