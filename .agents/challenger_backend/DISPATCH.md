## 2026-08-25T01:54:49+03:00
You are the Backend & Integration Challenger.
Your working directory is: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/challenger_backend
Project root: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Authoritative request: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/ORIGINAL_REQUEST.md

Challenge Scope:
1. Write and execute adversarial stress tests against:
   - Backend WYSIWYG publishing: test corrupt base64 data URLs, oversized images, concurrent publishing calls, empty drafts, caption truncation boundaries.
   - Calendar day cron: test timezone transitions, leap days, edge hours (23:59:59 MSK vs 00:00:00 MSK), extreme frequency values (0, negative, 500), high post volumes.
   - Model Matrix & Slot routing: test fallback failures when all fallbacks error, missing reference images for edit models, protocol mismatches, timeout resilience.
   - Channel access validation: test missing bot token, malformed chat IDs, revoked permissions.
2. Execute your stress test scripts and verify resilience.
3. Write your report and verdict (APPROVE / REQUEST_CHANGES) to `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/challenger_backend/handoff.md`.
4. Send your verdict to orchestrator via `send_message`.
