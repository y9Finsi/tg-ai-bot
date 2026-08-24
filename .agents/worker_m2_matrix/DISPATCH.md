## 2026-08-25T01:40:43Z
Scope & Tasks:
1. Centralize AI provider configuration into a unified Model Matrix service (`src/services/ai_matrix.js`) supporting 6 slots:
   - Core Dialogue (with ordered fallback list: primary model -> fallback 1 -> fallback 2...)
   - Style Classifier (model selection)
   - Judge (model selection)
   - Text-to-Image (with explicit protocol selector: `/images/generations` vs `/chat/completions`)
   - Image-to-Image / Edit (`/chat/completions` with required reference image verification)
   - Voice / TTS (provider & voice model selection)
2. Implement backend endpoints in `src/server.js`:
   - `GET /api/admin/model-matrix`: returns full current model matrix configuration.
   - `POST /api/admin/model-matrix`: updates model matrix configuration.
   - `POST /api/admin/model-matrix/health-check`: executes instant diagnostic ping/health check for any slot (testing chat completion, image generation, voice, etc.) and returns status and latency.
3. In `src/services/image_generator.js`: Route image generation calls based on the explicit protocol flag (`/images/generations` vs `/chat/completions`) and enforce reference image requirement for edit/i2i models.
4. Implement `GET /api/admin/channel/check-access` in `src/server.js`: Validates Telegram bot administrative permissions in the channel (calls `getMe`, `getChat`, `getChatMember`, checks `can_post_messages`) and returns channel metadata and status.
5. Run tests / verification using Node test runner.
6. Write your handoff report to /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m2_matrix/handoff.md with passing test results and code details.
7. When done, send a message to orchestrator.
