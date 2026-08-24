# Handoff Report: Backend Architecture Explorer

**Author**: Backend Architecture Explorer  
**Working Directory**: `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_backend`  
**Target Milestone**: Investigation & Analysis (R1, R2, R5 Backend)

---

## 1. Observation

### R1: TGK Post Publishing & Image Desynchronization
- In `src/server.js:2227-2252`, `POST /api/admin/channel/preview-ai-photo` generates an in-memory image (`saveToDb: false`) and returns `preview_url` (data URL `data:image/jpeg;base64,...`).
- In `admin-v2/src/main.jsx:4647-4655`, the UI stores this as `channelDraft.media = { type: 'ai_photo', preview_url: res.preview_url, file_id: res.file_id || null }`.
- In `admin-v2/src/main.jsx:4665-4676`, publishing sends `media: channelDraft.media` to `POST /api/admin/channel/publish-draft`.
- In `src/channel_poster.js:395-437`, `publishChannelDraft` inspects `contentId` (DB ID) and `media?.file_id`. It never inspects `media?.preview_url` or data URLs. As a result, `photoToSend` remains `null`.
- In `src/channel_poster.js:413-432`, because `photoToSend` is `null` and `settings.media_mode === 'ai_photo'`, `publishChannelDraft` calls `generateLeraPhoto(...)` again, generating a completely different image and publishing it instead of the previewed image.

### R1: Auto-Posting Cron Scheduler & Limit Clamps
- In `src/channel_poster.js:506-510`, `dayStart` is calculated as `new Date(Date.now() - 24 * 60 * 60 * 1000)` (rolling 24-hour window) rather than `00:00:00` MSK calendar day.
- In `src/channel_poster.js:510`, `const dailyLimit = Math.max(1, Math.min(2, Number(settings.posts_per_day || 2)));` hardcodes `Math.min(2)`.
- In `src/server.js:2153-2156`, `safePostsPerDay` is clamped to `Math.min(2, ...)` and `safeFrequencyHours` is clamped to `Math.max(12, ...)` in `reference_short` mode.
- In `src/db/database.js:1860`, `posts_per_day` is clamped to `Math.min(2, ...)`.

### R1: Text Validation & Rejection in `channel_content.js`
- In `src/channel_content.js:83-103`, `validateChannelText` strictly rejects any text where `value.length > limits.maxChars` with `CHANNEL_TOO_LONG`.
- In `src/channel_poster.js:185-187` and `372-374`, a validation failure overrides judge evaluation with `REJECT:CHANNEL_TOO_LONG`, triggering post rejection (`DRAFT_REJECTED`).

### R2: Centralized AI Model Matrix & Routing
- Configuration is divided across:
  - `ai_providers` table (Core Dialogue fallback list) in `src/db/database.js:140-148, 1834-1837, 2418-2545`.
  - `settings.llm_routing_*` in `src/ai/intent_router.js:183-255` (Classifier, Judge).
  - `settings.image_*` in `src/db/database.js:1733-1776` (Text-to-Image).
  - `settings.voice_*` in `src/db/database.js:1778-1820` (Voice/TTS).
- `src/services/image_generator.js:53-89` uses string heuristics (`isMultimodalChatModel`) rather than an explicit protocol flag (`/images/generations` vs `/chat/completions`).
- `src/server.js:1615-1651` (`POST /api/admin/providers/test`) tests only `client.chat.completions.create` with text `"Скажи \"ОК\""`, which fails for image and voice providers.

### R5 (Backend): Channel Access Validation Endpoint
- `GET /api/admin/channel/check-access` is currently absent from `src/server.js`.

---

## 2. Logic Chain

1. **WYSIWYG Publishing**: Because `publishChannelDraft` ignores data URLs in `media.preview_url`, any draft generated with a previewed image is re-generated upon publication -> **Fix**: decode data URLs into `Buffer` and assign to `photoToSend = { source: buffer, filename: 'lera_channel.jpg' }`, skipping new generation.
2. **Cron Scheduler**: Because `dayStart` uses `Date.now() - 24*3600*1000`, posts published at 23:00 yesterday block posts at 10:00 today. Because `Math.min(2)` and `Math.max(12)` are hardcoded, user settings for frequent posts are ignored -> **Fix**: use `getStartOfDayMSK()` (MSK midnight) and remove `Math.min(2)` and `Math.max(12)` clamps.
3. **Text Adaptation**: Minor character overflows (up to 20%) can be safely resolved by cleaning whitespace, trimming trailing punctuation/fillers, or truncating at sentence boundaries -> **Fix**: add `adaptChannelText` in `src/channel_content.js` before returning rejection.
4. **Unified Model Matrix**: Providing a single contract covering Core Dialogue, Style Classifier, Judge, Text-to-Image, Image-to-Image, and Voice allows the admin UI to configure and diagnose all model slots in one place -> **Fix**: implement `GET /api/admin/model-matrix`, `POST /api/admin/model-matrix`, and `POST /api/admin/model-matrix/health-check`.
5. **Channel Permissions**: Querying `getChat`, `getChatMemberCount`, and `getChatMember` via Telegram Bot API verifies `can_post_messages` and returns channel metadata -> **Fix**: add `GET /api/admin/channel/check-access`.

---

## 3. Caveats

- Timezone handling: Moscow time is permanently UTC+3 (no DST transitions). `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' })` is standard and safe across Node.js versions.
- Image generation payload sizes: Data URLs sent over Express JSON body must fit within Express body parser limits (currently configured to 50MB in `server.js:207`).
- Telegram Bot API rate limits: `check-access` and `health-check` endpoints should not be flooded in infinite loops; client UI should trigger on-demand or with debounce.

---

## 4. Conclusion

The investigation has pinpointed the exact lines, causes, and mechanisms for all backend requirements in R1, R2, and R5. The recommended technical designs provide exact backward-compatible fixes and unified API contracts ready for implementation.

---

## 5. Verification Method

1. **File Locations to Inspect**:
   - `src/channel_poster.js` (lines 395–437, 500–521)
   - `src/server.js` (lines 2142–2197, 2227–2261)
   - `src/channel_content.js` (lines 31–40, 83–103)
   - `src/services/image_generator.js` (lines 53–89, 276–443)
   - `src/services/voice_generator.js` (lines 9–30, 35–142)
2. **Commands to Verify**:
   - Run tests: `node --test test/public_channel_contract.test.js test/response_text.test.js`
   - Review report: `cat .agents/explorer_backend/report.md`
