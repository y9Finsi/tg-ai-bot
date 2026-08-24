# DISPATCH

## 2026-08-25T01:40:43Z
You are the Backend Worker for Milestone M1 (TGK Publishing, Calendar Cron, and Text Adaptation).
Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m1_tgk
Project root: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Authoritative request: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/ORIGINAL_REQUEST.md
Reference report: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_backend/report.md
Scope document: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/orch_1/PROJECT.md

Scope & Tasks:
1. Fix WYSIWYG image consistency in `src/channel_poster.js`: In `publishChannelDraft`, if the draft has `preview_url` or `media_url` containing a base64 data URL (`data:image/...;base64,...`) or buffer, decode it into a Buffer and send directly to Telegram using `bot.sendPhoto(chatId, buffer, ...)` without triggering `generateLeraPhoto`.
2. Fix auto-posting cron scheduler in `src/channel_poster.js`: Calculate daily post limits based on calendar day in Europe/Moscow timezone (from 00:00 MSK today to current time) instead of a rolling 24-hour window. Remove artificial constraints on post frequency (`Math.max(12)`) and daily posts (`Math.min(2)`) in `src/channel_poster.js`, `src/server.js`, and `src/db/database.js`.
3. Implement intelligent text adaptation in `src/channel_content.js`: Normalize multiple whitespaces/newlines and gracefully truncate at the last sentence/phrase boundary if the generated text exceeds channel limits by up to 15-20%, rather than immediately hard-rejecting with `CHANNEL_TOO_LONG`.
4. Run tests / verification for these backend components using Node test runner.
5. Write your handoff report to /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m1_tgk/handoff.md with passing test results and code details.
6. When done, send a message to orchestrator.
