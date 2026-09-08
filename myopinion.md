# Мой разбор плана автоскрапера и контент-пайплайна Леры

## Вывод

Идея полезная, но план перескакивает сразу к AI-скраперу, не закрыв базовый контур данных. В проекте уже есть рабочий банк lera_content, админские CRUD-эндпоинты, ручной тест отправки и тул send_content. Но это каталог ручных материалов, а не pipeline: источников, статусов обработки, очереди импорта, AI-разметки, истории запусков и связи с матрицей интересов сейчас нет.

Поэтому запись результата сразу в enabled=true рискованна: можно загрязнить боевую выдачу, получить дубли и считать неподтвержденный парсинг рабочим контентом.

## Фактическая текущая реализация

Миграция 007_lera_content_initiatives.sql и bootstrap database.js создают lera_content: тип медиа/ссылки, URL или Telegram file_id, описание, флаги enabled, allow_in_dialogue, allow_initiative, allow_channel и опциональные source_channel_id/source_message_id. Есть уникальность Telegram source+message, но нет canonical URL/hash, moderation status, score, tags, embedding, причины отклонения и версии enrichment.

ContentBankTab.jsx уже умеет список, поиск, фильтры, CRUD, тестовую отправку и настройку служебного Telegram-канала. server.js предоставляет GET/POST/PATCH/DELETE /api/admin/content и test endpoint. Источников, scrape-now, статусов запусков и логов pipeline нет.

send_content.js выбирает enabled + allow_in_dialogue, исключает уже отправленное пользователю, затем случайно выбирает кандидата. Категории и query фильтруются regex по description/URL; это не матрица интересов и не семантический поиск. При пустом результате включается повторная выборка всех материалов.

channel_poster.js в основном генерирует собственные посты через LLM; банк используется для фото/мемов, но автоскрапер к редакционному планированию не подключен.

parse_tg_channels.js — CLI-заготовка: читает HTML t.me/s, сохраняет текст в data/*.json и не пишет в PostgreSQL, не обрабатывает полноценные media/file_id, не делает enrichment или dedup.

## Недочеты исходного плана

1. Смешаны ingestion, moderation и publication. Нужны состояния discovered -> enriched -> approved/rejected -> enabled/disabled. Новый материал не должен сразу включаться.
2. Таблица content_sources без raw items, курсора, запусков и попыток не объяснит, что обработано и почему произошел сбой.
3. Dedup только по URL/file_id недостаточен: нужны normalized URL, source+external id и media hash.
4. t.me/s — хрупкий HTML-источник: меняется разметка, медиа может быть недоступно, есть rate limits и вопросы прав на перепубликацию.
5. AI не заменяет детерминированную policy-проверку: нужны лимиты MIME/размера, доменов, рекламы, казино, NSFW, персональных данных и опасного контента.
6. Порог 8+ не определен: нет confidence, версии prompt/model и поведения при timeout или невалидном JSON.
7. Матрица интересов не привязана к текущему коду. Сейчас выбор — regex и random, а не интересы, веса, freshness и cooldown.
8. Нет защиты от повторов и перекоса по источникам: нужны usage counters, per-user/per-surface cooldown и quotas.
9. Нет provenance: источник, дата, лицензия, причина решения и факт использования должны сохраняться.
10. Cron/BullMQ не описаны операционно: нужны lock, idempotency, retry/backoff, concurrency limits, timeout и dead-letter/error state.
11. Админке нужны preview raw/enriched, reject reason, approve, retry и run counters, а не только список источников.
12. npm test/build не доказывают Telegram, Redis, PostgreSQL, внешний HTML и LLM. Нужен post-deploy smoke.

## Рекомендуемая реализация

### 1. Надежный ingestion

Добавить content_sources и content_ingest_runs, а также content_raw_items со source_id, external_id, canonical URL, временем публикации, raw text/media metadata, MIME/size и status new/duplicate/invalid/ready_for_enrichment/failed. Уникальный ключ — source_id+external_id. Использовать существующий Telegram HTML-парсер как адаптер, но не data/ как конечное хранилище. RSS и произвольный web отложить.

### 2. Отдельный enrichment job

Очередь должна выдавать структурированный JSON: decision accept/reject/review, score, categories, interests, why, lera_context, allow flags и confidence. Сохранять provider/model/prompt version/raw result. review не попадает в выдачу. Первый запуск — review-only; auto-accept только для trusted sources и высокой confidence.

### 3. Контролируемый маппинг в lera_content

Не ломать ручной CRUD. Добавить source_item_id, content_hash, tags/interest_tags, quality_score, moderation_status, enriched_at, used_at либо вынести provenance в отдельную таблицу. Автоконтент создавать disabled/review до прохождения policy и AI-порогов. Ручные материалы должны продолжить работать по старому контракту.

### 4. Подключение к выбору

Сохранить внешний контракт send_content(category, query), но заменить случайный выбор на scoring: match интересов + категория + freshness + quality - recent usage - repetition penalty. На MVP достаточно tags JSONB и простых весов, embeddings пока не нужны. Для канала использовать только allow_channel=true и provenance; scraper не должен публиковать напрямую.

### 5. Админский контур

В ContentBankTab добавить подвкладку источников и запусков: last run, counters new/accepted/rejected/error, запуск источника, retry, run details, review queue, raw/enriched preview, approve/reject/disable и расписание. API лучше разделить на sources, runs, raw-items и enrich, а не делать синхронный scrape-now.

## Минимальная проверка

Unit-тесты canonical URL, dedup, parser fixtures, policy-фильтров и JSON-schema enrichment. Интеграционный тест source -> raw item -> mock enrichment -> lera_content -> send_content. Повторный запуск не создает дублей; падение LLM не включает материал. На staging проверить Telegram media/rate limits. После deploy проверить health, workers, миграции и ручной scrape одного источника.

## Приоритет MVP

1–2 доверенных публичных Telegram-источника, только текст/ссылки, review-only, ручной approve в существующей админке, без RSS/web, embeddings и автоматической публикации. После накопления реальных ошибок добавлять медиа, scoring и расписание.

Итог: план реализуем, но в текущем виде слишком рано автоматизирует доверие к данным. Сначала журнал сырья и состояний, затем enrichment, затем контролируемое попадание в существующий lera_content. Матрицу интересов нужно формализовать и подключить к выбору материалов, а не оставлять названием на схеме.
## Уточнение после проверки Radiant и production

План нужно понимать именно так: пока Лера просматривает найденный материал, модель может решить, что хочет поделиться им позже, и вызвать уже существующий schedule_followup. Скрапер не ставит таймеры сам. В payload follow-up нужно добавить content_id/discovery_id, чтобы позже send_content отправил именно обещанный материал, а не случайный.

Для музыки самый простой вариант — не делать отдельные интеграции с каждым музыкальным сервисом. Собирать ссылки на треки из YouTube, Telegram и RSS новых релизов, хранить metadata и ссылку на YouTube или Яндекс.Музыку, а делиться ссылкой в ЛС/канале через существующий send_content. Яндекс.Музыку и YouTube не нужно скачивать или зеркалировать.

Окончательный порядок релиза:

1. **R1 — источники и просмотр:** Telegram + RSS + простой YouTube metadata adapter, raw/discovery-таблицы, dedup, маленькие discovery-сессии, enrichment, вкладка «Найдено», review-only.
2. **R2 — банк:** approved находки попадают в lera_content, сохраняются tags/mood/reaction/source/freshness, ручные материалы не ломаются.
3. **R3 — использование:** send_content получает простой score вместо random/regex; Radiant видит подходящие находки; schedule_followup получает конкретный content id и может вернуть Леру к обещанному треку/видео/новости.
4. **R4 — автономность:** расписание, trusted sources, auto-accept хороших находок и пауза плохих источников.

Отдельный scraper microservice, graph database, embeddings, второй delivery-механизм и прямую автопубликацию в канал не добавляем. Это не нужно для сильного MVP и будет конкурировать за ресурсы с уже работающим Radiant.
