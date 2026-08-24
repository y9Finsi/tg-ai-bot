# TEST_READY: Telegram AI Bot Admin Panel & TGK Publishing Refactoring

## 1. Executive Summary
Comprehensive, opaque-box, requirement-driven automated test suites have been designed and implemented under `test/` using Node.js built-in test runner (`node:test`, `node:assert/strict`). The suite provides end-to-end verification for all backend logic, API routes, data transformations, scheduler cron operations, media contracts, and frontend production builds across 4 core testing tiers plus adversarial/edge variations.

- **Total Test Suites**: 7
- **Total Test Cases**: 105
- **Pass Rate**: 100% (105 / 105 passing)
- **Framework**: Node.js Built-in Test Runner (`node:test`, `node:assert/strict`)

---

## 2. Test Inventory & Coverage Matrix

| # | Feature | Test File | Tier 1 (Happy) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (E2E) | Tier 5 (Adversarial) | Total Tests | Status |
|---|---------|-----------|:--------------:|:-----------------:|:--------------:|:------------:|:--------------------:|:-----------:|:------:|
| 1 | WYSIWYG Photo Consistency & Draft Publishing | `test/tgk_wysiwyg_publish.test.js` | 5 | 5 | 3 | 1 | 3 | 17 | ✅ PASS |
| 2 | Calendar Day MSK Cron Scheduler & Limit Clamps | `test/tgk_calendar_cron.test.js` | 5 | 5 | 2 | 1 | 3 | 16 | ✅ PASS |
| 3 | Intelligent Channel Text Adaptation & Limits | `test/tgk_text_adaptation.test.js` | 5 | 5 | 2 | 1 | 2 | 15 | ✅ PASS |
| 4 | Centralized AI Model Matrix & Routing | `test/model_matrix_routing.test.js` | 5 | 5 | 2 | 1 | 2 | 15 | ✅ PASS |
| 5 | Channel Bot Access Validation Endpoint | `test/channel_access_check.test.js` | 5 | 5 | 1 | 1 | 2 | 14 | ✅ PASS |
| 6 | Client-Side Image Canvas Compression Contract | `test/image_compressor.test.js` | 5 | 5 | 1 | 1 | 2 | 14 | ✅ PASS |
| 7 | Frontend Production Build Smoke & SPA Layout | `test/admin_build_smoke.test.js` | 5 | 5 | 2 | 1 | 1 | 14 | ✅ PASS |
| **Total** | | | **35** | **35** | **13** | **7** | **15** | **105** | ✅ **100%** |

---

## 3. How to Run the Tests

### Run All 7 Refactoring Suites
```bash
node --test --test-force-exit test/tgk_wysiwyg_publish.test.js test/tgk_calendar_cron.test.js test/tgk_text_adaptation.test.js test/model_matrix_routing.test.js test/channel_access_check.test.js test/image_compressor.test.js test/admin_build_smoke.test.js
```

### Run Individual Test Suites
```bash
# 1. WYSIWYG Draft Publishing
node --test --test-force-exit test/tgk_wysiwyg_publish.test.js

# 2. MSK Calendar Day Cron Scheduler
node --test --test-force-exit test/tgk_calendar_cron.test.js

# 3. Intelligent Text Adaptation
node --test --test-force-exit test/tgk_text_adaptation.test.js

# 4. Centralized Model Matrix & Routing
node --test --test-force-exit test/model_matrix_routing.test.js

# 5. Channel Access Diagnostics Endpoint
node --test --test-force-exit test/channel_access_check.test.js

# 6. Canvas Image Compression Contract
node --test --test-force-exit test/image_compressor.test.js

# 7. Frontend Production Build Smoke
node --test --test-force-exit test/admin_build_smoke.test.js
```

### Run Full Repository Test Suite
```bash
npm test
```

---

## 4. Test Suite Detailed Specifications

### 4.1. `test/tgk_wysiwyg_publish.test.js`
- **Scope**: WYSIWYG media consistency, base64 data URL buffer decoding, Telegram photo sending without re-generation, and draft publishing flow.
- **Key Assertions**:
  - `decodeMediaPayload`: parses base64 data URLs (`data:image/jpeg;base64,...`, `data:image/png;base64,...`, `data:image/webp;base64,...`), raw Buffers, preview URLs, and file IDs.
  - `publishChannelDraft`: transmits previewed binary buffer directly to Telegram without invoking `generateLeraPhoto`.
  - Captions > 1024 characters are cleanly trimmed to <= 1024 characters for media posts.
  - Idempotency claims prevent duplicate post sends.
  - Validates error handling for uninitialized bots, missing channel IDs, and oversized/empty drafts.

### 4.2. `test/tgk_calendar_cron.test.js`
- **Scope**: Calendar day Europe/Moscow (00:00 MSK) calculations across timezones, removal of min/max clamps, and frequency limit checks.
- **Key Assertions**:
  - Daily limit resets at 00:00 MSK (not rolling 24h, not UTC midnight).
  - Unclamped `posts_per_day`: values > 2 (e.g. 5, 10) are honored without `Math.min(2)` constraint.
  - Unclamped `frequency_hours`: values < 12 (e.g. 1, 2, 4 hours) are honored without `Math.max(12)` constraint.
  - `getTimeOfDayMSK`: accurately returns 'утро' (05:00-11:59), 'день' (12:00-17:59), 'вечер' (18:00-22:59), 'ночь' (23:00-04:59).
  - Multi-day schedule simulation verifies quota resets across midnight MSK boundary.

### 4.3. `test/tgk_text_adaptation.test.js`
- **Scope**: Intelligent channel text adaptation, whitespace normalization, format limits, and sentence-boundary truncation on 15–20% overflow.
- **Key Assertions**:
  - Formats: `short_thought` (160), `photo_caption` (120), `life_observation` (240), `long_monologue` (500), `question` (160), `meme_caption` (140), `repost_reaction` (160).
  - Overflow <= 20% is adapted at sentence/clause boundaries (`. `, `! `, `? `, `\n`, `, `).
  - Overflow > 20% returns `CHANNEL_TOO_LONG`.
  - Single-paragraph formats collapse multiple linebreaks into a single coherent line.
  - Editorial modes (`reference_short` vs `legacy_mix`) enforce valid format sequences.

### 4.4. `test/model_matrix_routing.test.js`
- **Scope**: Centralized model matrix configuration, Core Dialogue fallbacks, protocol selection (/images/generations vs /chat/completions), reference image validation, and health-check diagnostics.
- **Key Assertions**:
  - 6 AI slots: `core_dialogue`, `style_classifier`, `judge`, `text_to_image`, `image_to_image`, `voice`.
  - Core dialogue fallback cascade automatically switches to backup providers on 500 error or timeout.
  - Protocol routing: `/images/generations` routes to dedicated image generation payload; `/chat/completions` routes to multimodal chat payload.
  - Image-to-image strictly requires a valid reference image data URL (`REFERENCE_IMAGE_REQUIRED`).
  - Diagnostic health check endpoint returns latency and health status.

### 4.5. `test/channel_access_check.test.js`
- **Scope**: `GET /api/admin/channel/check-access` verification with bot permissions, channel metadata, admin vs member vs not-in-channel cases.
- **Key Assertions**:
  - Administrator/creator bot with `can_post_messages: true` returns HTTP 200 with full channel metadata.
  - Member status (non-admin) returns HTTP 400 with `BOT_NOT_ADMIN`.
  - Channel not found or bot not member returns HTTP 400 with Telegram API error details.
  - Missing channel ID returns HTTP 400 `CHANNEL_ID_REQUIRED`.
  - Uninitialized bot instance returns HTTP 503 `BOT_NOT_INITIALIZED`.

### 4.6. `test/image_compressor.test.js`
- **Scope**: Client-side canvas compression contract, aspect ratio preservation, and resizing logic.
- **Key Assertions**:
  - Landscape 4K (3840x2160) scales to 1920x1080 (16:9).
  - Portrait 4K (2160x3840) scales to 1080x1920 (9:16).
  - Square large (3000x3000) scales to 1920x1920 (1:1).
  - Images already under 1920x1920 remain unscaled (no upscale).
  - Iterative quality step-down (0.85 -> 0.70 -> 0.55) ensures output files remain under 2.5 MB target budget to prevent HTTP 413 errors.

### 4.7. `test/admin_build_smoke.test.js`
- **Scope**: Frontend production build execution, bundle generation, and SPA navigation layout.
- **Key Assertions**:
  - `npm run admin:build` passes with exit code 0.
  - `public/admin-v2/index.html` generated with relative asset paths (`./assets/...`).
  - JS and CSS bundles are generated, non-empty, and split with a dedicated `vendor` chunk.
  - SPA hash routing anchors (`#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation`) are referenced.
