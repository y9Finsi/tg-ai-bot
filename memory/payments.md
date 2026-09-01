# memory/payments.md — Платежная система и тарифы

## 1. Платежный шлюз Platega

Интеграция с сервисом **Platega** реализована в [src/services/platega.js](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/src/services/platega.js).

### Переменные окружения (.env)
- `PLATEGA_SHOP_ID` (или `PLATEGA_MERCHANT_ID`) — ID магазина в системе Platega.
- `PLATEGA_SECRET_KEY` (или `PLATEGA_SECRET`) — секретный API-ключ для подписи запросов и проверки вебхуков.

### Основные функции
1. `createPlategaInvoice(amountRub, description, payloadId)`
   - Отправляет `POST https://api.platega.com/v1/invoices`.
   - Возвращает `{ invoice_id, pay_url }`.
2. `checkPlategaInvoice(invoiceId)`
   - Отправляет `GET https://api.platega.com/v1/invoices/${invoiceId}` с заголовком `X-Secret-Key`.
   - Возвращает статус оплаты инвойса.

---

## 2. Вебхук обработки оплаты

Вебхук зарегистрирован в [src/server.js](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/src/server.js) на эндпоинте:
`POST /webhook/platega`

### Логика обработки:
1. Валидация подписи / секретного ключа вебхука.
2. Проверка статуса платежа (`PAID` / `CONFIRMED`).
3. По `payload` извлекается `userId` и тип покупки (подписка на N дней / покупка пакета генераций).
4. Запись в таблицу `payments` (`user_id`, `amount`, `currency`, `created_at`).
5. Обновление пользователя в таблице `users`:
   - Продление `premium_until` на соответствующий срок.
   - Если был статус `is_premium = false`, переводится в `true`.
   - Начисление реферального бонуса пригласителю через [src/services/referral.js](file:///Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/src/services/referral.js).
6. Отправка подтверждающего уведомления пользователю в Telegram.

---

## 3. Модель пользователей и подписок (БД)

Таблица `users` содержит следующие платежные поля:
- `is_premium` (`BOOLEAN`) — флаг активного премиум-доступа.
- `premium_until` (`TIMESTAMP`) — дата и время окончания премиума.
- `frozen_premium_seconds` (`BIGINT`) — остаток времени подписки при заморозке аккаунта.
- `free_requests_left` (`INT`) — количество оставшихся бесплатных тестовых сообщений/генераций (по умолчанию 5).
- `referred_by` (`BIGINT`) — Telegram ID пригласившего пользователя.
- `total_api_cost` (`NUMERIC`) — накопленная стоимость обращений к LLM API для аналитики маржинальности.

---

## 4. Реферальная система (`src/services/referral.js`)

- При старте бота по реферальной ссылке (`/start ref_123456`) в `users.referred_by` фиксируется ID реферера.
- При первой оплате реферала реферер получает бонусные запросы или продление подписки.
