## 2026-08-25T01:40:43Z
You are the Test Writer for the E2E and Integration Testing Track.
Your working directory is: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/test_writer_e2e
Project root: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Authoritative request: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/ORIGINAL_REQUEST.md
Test Infra specification: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/orch_1/TEST_INFRA.md
Scope document: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/orch_1/PROJECT.md

Scope & Tasks:
1. Design and write comprehensive, opaque-box, requirement-driven test suites using Node.js built-in test runner (`node:test`, `node:assert`) under `test/`:
   - `test/tgk_wysiwyg_publish.test.js`: verifies base64 data URL buffer decoding, Telegram photo sending without re-generation, and draft publishing flow (Tiers 1-4).
   - `test/tgk_calendar_cron.test.js`: verifies MSK calendar day (00:00 MSK) calculations across timezones, removal of min/max clamps, and frequency limit checks (Tiers 1-4).
   - `test/tgk_text_adaptation.test.js`: verifies intelligent text adaptation, whitespace normalization, sentence-boundary truncation on 15-20% overflow (Tiers 1-4).
   - `test/model_matrix_routing.test.js`: verifies centralized model matrix configuration, Core Dialogue fallbacks, protocol selection (/images/generations vs /chat/completions), reference image validation, and health-check diagnostics (Tiers 1-4).
   - `test/channel_access_check.test.js`: verifies `GET /api/admin/channel/check-access` with bot permissions, channel metadata, admin vs member vs not-in-channel cases (Tiers 1-4).
   - `test/image_compressor.test.js`: verifies client-side canvas compression contract and resizing logic (Tiers 1-4).
   - `test/admin_build_smoke.test.js`: verifies frontend production build execution and asset generation.
2. Run `node --test test/*.test.js` to establish baseline test executions.
3. Write `TEST_READY.md` at project root (`/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/TEST_READY.md` or `.agents/orch_1/TEST_READY.md`) summarizing test coverage, runner commands, and test inventory.
4. Write your handoff report to /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/test_writer_e2e/handoff.md.
5. When done, send a message to orchestrator.
