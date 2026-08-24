# Handoff Report — Milestone M2: Centralized AI Model Matrix, Slot Routing, Health Checks & Channel Diagnostics

## 1. Observation
1. **Dispersed AI Configurations in Codebase**:
   - Provider definitions and routing were previously distributed across `ai_providers` table queries in `src/db/database.js`, classifier/judge settings in `src/ai/intent_router.js` (`getRoutingSettings`, `updateRoutingSettings`), image settings in `getImageGenerationSettings`, and voice settings in `getVoiceGenerationSettings` without a single unified API or diagnostics engine.
2. **Image Protocol & Reference Enforcement**:
   - `src/services/image_generator.js` lines 276–440 had heuristics for choosing `/chat/completions` vs `/images/generations` without explicit override support via protocol flags, and lacked strict pre-call validation for edit models requiring reference images.
3. **New Service & Endpoints Created**:
   - Created `src/services/ai_matrix.js` implementing `MATRIX_SLOTS = ['core_dialogue', 'style_classifier', 'judge', 'text_to_image', 'image_to_image', 'voice']`, `normalizeProtocol()`, `getModelMatrix()`, `updateModelMatrix()`, and `runSlotHealthCheck()`.
   - Updated `src/server.js` (lines 1592–1638 and 2179–2300) with:
     - `GET /api/admin/model-matrix`
     - `POST /api/admin/model-matrix`
     - `POST /api/admin/model-matrix/health-check`
     - `GET /api/admin/channel/check-access`
     - Exported `createAdminApp(bot)` and `startAdminServer()`.
   - Updated `src/db/database.js` (lines 1733–1814) with protocol support for `getImageGenerationSettings` and new functions `getImageEditSettings` and `saveImageEditSettings`.
4. **Automated Verification Command & Results**:
   - Executed command: `node --test --test-force-exit test/model_matrix_routing.test.js test/channel_access_check.test.js test/image_generator.test.js`
   - Result: 21 tests passed, 0 failed across all suites:
     - `test/model_matrix_routing.test.js` (9/9 passed): protocol normalization, slot structure contract, model updates, reference enforcement, explicit protocol routing to `/images/generations` and `/chat/completions`, slot health check ping with latency, and HTTP endpoint contract test.
     - `test/channel_access_check.test.js` (7/7 passed): bot uninitialized 503, missing channel ID 400, admin permissions extraction 200, creator status 200, non-admin member status 200, chat not found 400, bot not a member 400.
     - `test/image_generator.test.js` (5/5 passed): provider selection, gemini provider detection, fallback, and prompt building.

## 2. Logic Chain
1. **Unification of AI Matrix**:
   - `getModelMatrix()` aggregates settings from all individual domains (`ai_providers`, `global_settings`, `intent_router`, `image_generator`, `voice_generator`) and maps them into a coherent 6-slot data model (`core_dialogue`, `style_classifier`, `judge`, `text_to_image`, `image_to_image`, `voice`).
   - `updateModelMatrix()` handles updates for all 6 slots in a single atomic transaction or modular batch, ensuring that switching active dialogue providers, fallback priorities, classifier settings, image protocol (`/images/generations` vs `/chat/completions`), edit reference flags, or voice models immediately reflects across the runtime.
2. **Diagnostic Slot Health Checks**:
   - `runSlotHealthCheck()` performs real HTTP requests to the respective provider endpoint (`/chat/completions`, `/images/generations`, `/audio/speech`), calculates `latency_ms`, catches errors, and returns a structured response `{ ok, status: 'HEALTHY' | 'UNHEALTHY', latency_ms, provider_name, model, message }` for any single slot or all slots combined.
3. **Channel Diagnostics Reliability**:
   - `GET /api/admin/channel/check-access` queries the Telegram Bot API via `getMe()`, `getChat()`, `getChatMember()`, and `getChatMemberCount()`. It extracts granular permissions (`can_post_messages`, `can_edit_messages`, `can_delete_messages`, `status`), derives `is_admin` and `can_post`, and handles Telegram errors gracefully with clear localized error messages.
4. **Offline Test Compatibility & In-Memory Resiliency**:
   - `ai_matrix.js` includes an in-memory cache layer that gracefully absorbs database configuration changes when PostgreSQL is unavailable during unit test execution or transient DB disconnects, ensuring 100% deterministic test execution.

## 3. Caveats
- Production health checks against live external AI providers require valid API keys configured in `ai_providers` or in the request payload. In testing environments without internet/API keys, unit tests use mocked `fetch` handlers.
- `can_post_messages` in Telegram supergroups vs broadcast channels: for channels, `can_post_messages` is the definitive posting permission; for creators, full permissions are automatically granted.

## 4. Conclusion
Milestone M2 implementation is complete and verified. The unified Model Matrix service, its admin REST endpoints, explicit image protocol routing, reference enforcement, slot health check diagnostics, and Telegram channel access verification are fully operational with 21 passing automated tests.

## 5. Verification Method
Run the project test suite using Node.js:
```bash
node --test --test-force-exit test/model_matrix_routing.test.js test/channel_access_check.test.js test/image_generator.test.js
```
Files to inspect:
- `src/services/ai_matrix.js`
- `src/services/image_generator.js`
- `src/server.js` (lines 1592–1638, 2179–2300, 3236–3249)
- `src/db/database.js` (lines 1733–1814)
- `test/model_matrix_routing.test.js`
- `test/channel_access_check.test.js`
