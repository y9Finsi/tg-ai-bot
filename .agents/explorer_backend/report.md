# Backend Architecture & Investigation Report: TGK Publishing, AI Model Matrix & Diagnostics

**Author**: Backend Architecture Explorer  
**Date**: 2026-08-25  
**Scope**: R1 (TGK Publishing & Photo Consistency, Cron, Text Adaptation), R2 (Centralized AI Model Matrix & Routing), R5 (Backend: Channel Access Diagnostics)

---

## 1. Executive Summary

This investigation analyzed the backend architecture of the Telegram AI Bot platform (`src/`, `server.js`, `channel_poster.js`, `channel_content.js`, `services/image_generator.js`, `services/voice_generator.js`, `ai/llm_client.js`, `ai/intent_router.js`, `ai/response_judge.js`, `db/database.js`).

### Core Findings
1. **R1 (TGK Media Desynchronization)**: In `src/server.js`, previewing an AI photo (`/api/admin/channel/preview-ai-photo`) generates a base64 `data:image/jpeg;base64,...` URL. When the user publishes the draft (`/api/admin/channel/publish-draft`), `publishChannelDraft` in `src/channel_poster.js` (lines 395–437) only checks `media?.file_id` and ignores `media?.preview_url` (data URLs). As a result, `photoToSend` remains `null`, causing `publishChannelDraft` to trigger a brand-new call to `generateLeraPhoto`, discarding the WYSIWYG preview photo and posting a completely different image to Telegram.
2. **R1 (Cron Scheduler & Artificial Clamps)**: In `src/channel_poster.js` (lines 506–510), `dayStart` is calculated as a rolling 24-hour window (`new Date(Date.now() - 24 * 60 * 60 * 1000)`) instead of the calendar day start in `Europe/Moscow` (00:00:00 MSK). Additionally, `posts_per_day` is hard-clamped to `Math.min(2)` and `frequency_hours` is hard-clamped to `Math.max(12)` in `channel_poster.js`, `server.js` (lines 2153–2156), and `db/database.js` (line 1860).
3. **R1 (Channel Text Limits)**: In `src/channel_content.js` (lines 83–103), `validateChannelText` strictly rejects posts exceeding format character limits by even a single character (`value.length > limits.maxChars`), rejecting drafts via `CHANNEL_TOO_LONG`. It lacks intelligent text adaptation (sentence-boundary pruning, whitespace normalization) for minor (15–20%) overflows.
4. **R2 (Centralized Model Matrix & Routing)**: AI provider configuration is fragmented across `ai_providers` (Core Dialogue), `settings.llm_routing_*` (Classifier & Judge), `settings.image_*` (Text-to-Image), and `settings.voice_*` (TTS). `image_generator.js` uses heuristic substring matching (`isMultimodalChatModel`) rather than an explicit protocol flag (`/images/generations` vs `/chat/completions`). `/api/admin/providers/test` only runs text completions and fails on image and voice providers; there are no per-slot diagnostic health checks.
5. **R5 (Backend Channel Permission Check)**: There is currently no `GET /api/admin/channel/check-access` endpoint to verify bot administrative status (`can_post_messages`) or retrieve channel metadata prior to publishing.

---

## 2. Codebase Architecture & File Mapping

```
src/
├── channel_poster.js          # Draft generation, publishing logic, cron auto-poster
├── channel_content.js         # Editorial format limits, format selection, text validation
├── channel_prompt.js          # System prompt builder for TGK posts
├── server.js                  # Express API routes (Channel, Providers, Images, Voice)
├── ai.js                      # Central AI orchestrator, prompt assembly, context injection
├── ai/
│   ├── llm_client.js          # OpenAI client pool, multi-provider fallback loop, trace logging
│   ├── intent_router.js       # Style classifier & Judge settings, intent routing
│   ├── response_judge.js      # Public channel & private chat quality validation rules
│   └── sandbox_service.js     # Admin sandbox simulation execution
├── services/
│   ├── image_generator.js     # Image prompt construction, protocol switching, fallback execution
│   └── voice_generator.js     # Audio speech synthesis via /audio/speech
└── db/
    └── database.js            # Settings repository, post logs, provider database operations
```

---

## 3. Detailed Gaps, Bugs & Root Causes

### 3.1. R1: Media Desynchronization in TGK Publishing

#### Exact Location
- `src/server.js`: Lines 2227–2252 (`/api/admin/channel/preview-ai-photo`)
- `src/channel_poster.js`: Lines 395–437 (`publishChannelDraft`)
- `admin-v2/src/main.jsx`: Lines 4640–4676 (`previewAiPhoto`, `publishDraft`)

#### Root Cause Analysis
1. When generating a preview in the admin UI, `/api/admin/channel/preview-ai-photo` creates an image with `saveToDb: false` and returns:
   ```json
   {
     "success": true,
     "preview_url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
   }
   ```
2. The UI sets `draft.media = { type: 'ai_photo', preview_url: res.preview_url, file_id: null }`.
3. When publishing the draft, the UI sends `req.body = { text, topic, provenance, media_content_id, media }` to `POST /api/admin/channel/publish-draft`.
4. In `publishChannelDraft` (`src/channel_poster.js` lines 395–408):
   ```javascript
   let photoToSend = null;
   let contentMedia = null;
   const contentId = media_content_id || provenance.media_content_id || media?.id;
   if (typeof contentId === 'string' && contentId.startsWith('photo:')) {
       // Only handles DB photos (photo:123)
   } else if (contentId) {
       // Only handles catalog content
   } else if (media?.file_id) {
       photoToSend = media.file_id;
   }
   ```
   `media.preview_url` (data URL or external URL) and `media.buffer` are **completely ignored**!
5. Consequently, `photoToSend` is `null`. At line 413:
   ```javascript
   if (isMediaRequested && !contentMedia && !photoToSend && (settings.media_mode === 'ai_photo' || settings.media_mode === 'db_photo')) {
       if (settings.media_mode === 'ai_photo') {
           // TRIGGERS A BRAND NEW generateLeraPhoto() CALL!
           const generated = await generateLeraPhoto({ ... });
           ...
       }
   }
   ```
6. A completely new, random AI photo is generated and sent to Telegram, discarding the user's approved preview.

---

### 3.2. R1: Cron Scheduler Rolling 24h & Artificial Clamps

#### Exact Location
- `src/channel_poster.js`: Lines 506–515 (`initChannelPoster`)
- `src/server.js`: Lines 2153–2156 (`POST /api/admin/channel/settings`)
- `src/db/database.js`: Line 1860 (`getChannelPosterSettings`)

#### Root Cause Analysis
1. **Rolling 24h Window**:
   ```javascript
   // src/channel_poster.js:506
   const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
   const postsToday = settings.channel_id
       ? await countChannelPostsSince(settings.channel_id, dayStart.toISOString())
       : 0;
   ```
   This looks back 24 hours from the current moment rather than resetting at `00:00:00 MSK` on the current calendar day.
2. **Artificial Clamps**:
   - `posts_per_day` is hard-clamped with `Math.min(2, ...)` in `database.js` (line 1860), `server.js` (line 2153), and `channel_poster.js` (line 510).
   - `frequency_hours` is hard-clamped to `Math.max(12, ...)` in `server.js` (line 2155) whenever `editorial_mode === 'reference_short'`.
   - If an admin sets 4 posts per day with 2-hour intervals, the backend clamps it to 2 posts per day and 12-hour intervals.

---

### 3.3. R1: Rigid Character Limits in `channel_content.js`

#### Exact Location
- `src/channel_content.js`: Lines 83–103 (`validateChannelText`)
- `src/channel_poster.js`: Lines 183–187, 370–374

#### Root Cause Analysis
1. `validateChannelText` strictly validates `value.length > limits.maxChars`:
   ```javascript
   // src/channel_content.js:93-95
   if (value.length > limits.maxChars) {
       return { ok: false, code: 'CHANNEL_TOO_LONG', reason: `Пост длиннее лимита ${limits.maxChars} символов.` };
   }
   ```
2. When the LLM generates 168 characters for a 160-character format (a minor 5% overflow), `validateChannelText` fails with `CHANNEL_TOO_LONG`. In `channel_poster.js`, this causes the post to fail judge validation with `REJECT:CHANNEL_TOO_LONG`, triggering expensive retries or discarding the draft as `DRAFT_REJECTED`.
3. No intelligent adaptation exists to trim trailing punctuation, merge accidental linebreaks, or cleanly prune at sentence boundaries when within 15–20% of the limit.

---

### 3.4. R2: AI Model Matrix, Capabilities & Routing Gaps

#### Exact Location
- `src/services/image_generator.js`: Lines 53–89 (`isMultimodalChatModel`), Lines 135–158 (`isImageCapableProvider`), Lines 276–443 (`executeImageGenerationRequest`)
- `src/services/voice_generator.js`: Lines 9–30 (`pickVoiceProvider`), Lines 35–142 (`generateLeraVoice`)
- `src/ai/intent_router.js`: Lines 183–252 (`getRoutingSettings`, `updateRoutingSettings`)
- `src/server.js`: Lines 1615–1651 (`POST /api/admin/providers/test`)

#### Root Cause Analysis
1. **Heuristic Protocol Detection**:
   In `src/services/image_generator.js`, whether to call `/images/generations` or `/chat/completions` is inferred from substring matching on the model name (`m.includes('gemini')`, `m.includes('flux')`, etc.):
   ```javascript
   // src/services/image_generator.js:53
   export function isMultimodalChatModel(modelName = '', baseUrl = '') { ... }
   ```
   If a custom provider hosts Flux or Stable Diffusion via a chat bridge or Gemini via a generations proxy, the heuristic fails.
2. **Missing Reference Verification for Edit Models**:
   While `isEditModel` throws if `!referenceDataUrl`, edit models are not structured as an explicit role in the AI Model Matrix.
3. **Flawed Diagnostic Provider Ping**:
   `POST /api/admin/providers/test` executes `client.chat.completions.create({ messages: [{ role: 'user', content: 'Скажи "ОК"' }] })` for all providers. Any provider configured for Image generation (`dall-e-3`, `flux`) or Voice (`cosyvoice3`) fails this test with a 400/404 error, giving false negative health reports.
4. **No Centralized Model Matrix API**:
   The admin UI has to make separate requests to `/api/admin/providers`, `/api/admin/routing/settings`, `/api/admin/image-settings`, and `/api/admin/voice-settings`.

---

### 3.5. R5 (Backend): Missing Channel Permission & Access Check

#### Exact Location
- `src/server.js`: Currently absent

#### Root Cause Analysis
Before publishing, admins currently have no way to verify whether the bot is added to the channel as an administrator and possesses `can_post_messages` rights. Publishing attempts to an improperly configured channel fail at runtime during `sendPhoto` / `sendMessage` with unhandled Telegram API errors (`403 Forbidden: bot is not an admin`).

---

## 4. Technical Implementation Design

### 4.1. R1: WYSIWYG Photo Consistency in `src/channel_poster.js`

#### Solution Architecture
In `publishChannelDraft`:
1. Check `media.preview_url`, `media.dataUrl`, `media.data_url`, `media.buffer`, `media.source`, `media.file_id`, and `media_content_id`.
2. Resolution priority:
   - **Data URL**: If `media?.preview_url?.startsWith('data:image/')`, parse base64 into a `Buffer` and set:
     ```javascript
     photoToSend = { source: Buffer.from(base64Data, 'base64'), filename: 'lera_channel.jpg' };
     ```
   - **File ID / Preview Link**: If `media?.file_id` or `preview_url` contains `file_id=...`, extract `file_id`.
   - **Direct Buffer / Source**: If `media?.buffer` or `media?.source`, use directly.
   - **DB / Catalog Photo**: If `photoDbId` or `contentMedia`, use existing logic.
   - **External URL**: If `media?.preview_url?.startsWith('http')`, pass the URL directly.
3. **Conditional Generation**: Only trigger `generateLeraPhoto` if `isMediaRequested` is true AND `photoToSend` is still `null` AND `!contentMedia` (e.g. during an automated cron run).

---

### 4.2. R1: Calendar Day (MSK) Cron & Constraint Removal

#### 1. MSK Calendar Day Calculation
Create a dedicated utility `getStartOfDayMSK()`:
```javascript
export function getStartOfDayMSK(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const mskDateStr = formatter.format(date); // "YYYY-MM-DD"
    return new Date(`${mskDateStr}T00:00:00.000+03:00`);
}
```
In `src/channel_poster.js`:
```javascript
const dayStart = getStartOfDayMSK();
const postsToday = settings.channel_id
    ? await countChannelPostsSince(settings.channel_id, dayStart.toISOString())
    : 0;
const dailyLimit = Math.max(1, Number(settings.posts_per_day || 2));
```

#### 2. Removing Clamps
- In `src/server.js`:
  ```javascript
  const safePostsPerDay = Math.max(1, Math.min(100, Number(postsPerDay) || 2));
  const safeFrequencyHours = Math.max(1, Math.min(168, Number(frequencyHours) || 4));
  ```
- In `src/db/database.js`:
  ```javascript
  posts_per_day: Math.max(1, Number(values.channel_posts_per_day || 2)),
  ```

---

### 4.3. R1: Intelligent Text Adaptation in `src/channel_content.js`

#### Adaptation Algorithm
Implement `adaptChannelText(text, contentFormat, editorialMode)`:
1. Normalize whitespace, remove double newlines for single-paragraph formats (`photo_caption`, `short_thought`, `question`, `meme_caption`).
2. If character count <= `limits.maxChars`, return adapted text immediately.
3. If overflow is within tolerance (up to 20% over `limits.maxChars`):
   - Check if trimming trailing filler or trailing emoji brings it within limit.
   - Search for clean sentence/clause break boundaries (`. `, `! `, `? `, `\n`, `; `, `, `) before `limits.maxChars`.
   - Truncate cleanly at the boundary and trim.
4. Integrate `adaptChannelText` into `validateChannelText` so adapted text is evaluated before returning a rejection code.

---

### 4.4. R2: Centralized AI Model Matrix & Routing

#### Unified Matrix Roles
| Role / Slot | Protocol | Key Fields | Reference Required? |
|---|---|---|---|
| `core_dialogue` | `/chat/completions` | `providers` (ordered array), `active_provider_id` | No |
| `style_classifier` | `/chat/completions` | `provider_id`, `model`, `prompt`, `timeout_ms`, `max_tokens` | No |
| `judge` | `/chat/completions` | `provider_id`, `model`, `prompt`, `timeout_ms`, `max_tokens`, `mode`, `initiative_mode` | No |
| `text_to_image` | `/images/generations` OR `/chat/completions` | `provider_id`, `model`, `protocol` (`images_generations` \| `chat_completions`), `style_prompt`, `auto_channel`, `auto_save_catalog` | No |
| `image_to_image` | `/chat/completions` | `provider_id`, `model`, `protocol` (`chat_completions`), `require_reference: true`, `style_prompt` | **Yes (strict)** |
| `voice` | `/audio/speech` | `provider_id`, `model`, `voice_name`, `enabled`, `prompt_text`, `has_sample` | No |

#### API Contracts

##### `GET /api/admin/model-matrix`
Returns:
```json
{
  "success": true,
  "matrix": {
    "core_dialogue": {
      "providers": [
        { "id": 1, "name": "DeepSeek Primary", "model_name": "deepseek-chat", "priority": 1, "is_active": true, "is_enabled": true }
      ]
    },
    "style_classifier": {
      "provider_id": "1",
      "model": "deepseek-chat",
      "timeout_ms": 7000,
      "max_tokens": 4
    },
    "judge": {
      "provider_id": "1",
      "model": "deepseek-chat",
      "mode": "ENFORCE",
      "initiative_mode": "ENFORCE"
    },
    "text_to_image": {
      "provider_id": 2,
      "model": "flux-1-schnell",
      "protocol": "images_generations",
      "style_prompt": "...",
      "auto_generate_channel": true
    },
    "image_to_image": {
      "provider_id": 3,
      "model": "gemini-2.5-flash",
      "protocol": "chat_completions",
      "require_reference": true,
      "style_prompt": "..."
    },
    "voice": {
      "provider_id": 4,
      "model": "cosyvoice3",
      "voice_name": "female_warm",
      "voice_enabled": true
    }
  },
  "available_providers": [...]
}
```

##### `POST /api/admin/model-matrix`
Accepts updates to any or all matrix slots and persists to corresponding DB tables/settings.

##### `POST /api/admin/model-matrix/health-check`
Body: `{ "slot": "core_dialogue" | "style_classifier" | "judge" | "text_to_image" | "image_to_image" | "voice" | "all" }`
Executes protocol-specific diagnostic checks:
- `core_dialogue` / `style_classifier` / `judge`: Lightweight chat completion test (`"ping"`).
- `text_to_image`: Dry-run or test generation with prompt `"test thumbnail"` according to configured protocol (`/images/generations` vs `/chat/completions`).
- `image_to_image`: Validates reference payload ingestion using 1x1 test pixel data URL.
- `voice`: Posts 1-word text to `${baseUrl}/audio/speech` and checks for valid audio buffer header.
Returns: `{ "success": true, "slot": "...", "status": "HEALTHY" | "DEGRADED" | "UNHEALTHY", "latency_ms": 320, "details": { ... } }`.

---

### 4.5. R5 (Backend): Channel Access Validation Endpoint

#### Endpoint Specification
`GET /api/admin/channel/check-access`

#### Query Parameters
- `channelId` (optional): Username (e.g. `@leralife`) or Channel ID (e.g. `-1001234567890`). Defaults to configured `channel_id`.

#### Implementation Logic
```javascript
app.get('/api/admin/channel/check-access', async (req, res) => {
    try {
        if (!botInstance) return res.status(503).json({ error: 'Telegram-бот не инициализирован' });

        const settings = await getChannelPosterSettings();
        const rawChannelId = req.query.channelId || settings.channel_id;
        const channelId = String(rawChannelId || '').trim();

        if (!channelId) {
            return res.status(400).json({ error: 'ID или @username канала не указан' });
        }

        const me = await botInstance.telegram.getMe();
        const [chat, memberCount, botMember] = await Promise.all([
            botInstance.telegram.getChat(channelId),
            botInstance.telegram.getChatMemberCount(channelId).catch(() => null),
            botInstance.telegram.getChatMember(channelId, me.id)
        ]);

        const isAdmin = ['creator', 'administrator'].includes(botMember.status);
        const canPost = botMember.status === 'creator' || Boolean(botMember.can_post_messages || botMember.can_manage_chat);
        const canEdit = botMember.status === 'creator' || Boolean(botMember.can_edit_messages);
        const canDelete = botMember.status === 'creator' || Boolean(botMember.can_delete_messages);

        res.json({
            success: true,
            channel: {
                id: chat.id,
                title: chat.title,
                username: chat.username || null,
                type: chat.type,
                description: chat.description || null,
                member_count: memberCount
            },
            bot: {
                id: me.id,
                username: me.username
            },
            access: {
                is_admin: isAdmin,
                can_post: canPost,
                status: botMember.status,
                permissions: {
                    can_post_messages: canPost,
                    can_edit_messages: canEdit,
                    can_delete_messages: canDelete
                }
            }
        });
    } catch (e) {
        const msg = e.message || '';
        let userMessage = 'Не удалось проверить доступ к каналу';
        if (msg.includes('chat not found')) userMessage = 'Канал не найден. Проверьте правильность @username или ID.';
        else if (msg.includes('bot is not a member')) userMessage = 'Бот не добавлен в канал.';
        else if (msg.includes('Unauthorized')) userMessage = 'Неверный токен Telegram-бота.';

        res.status(400).json({ success: false, error: userMessage, raw_error: msg });
    }
});
```

---

## 5. Verification & Testing Approach

1. **TGK Post Publishing WYSIWYG Verification**:
   - Unit test simulating `publishChannelDraft` receiving `media.preview_url = "data:image/jpeg;base64,..."`.
   - Assert `photoToSend` is populated with the decoded buffer without calling `generateLeraPhoto`.
2. **Cron Scheduler MSK Calendar Day Verification**:
   - Unit test verifying `getStartOfDayMSK()` returns `00:00:00.000+03:00` for Europe/Moscow across timezone boundaries.
   - Assert `postsToday` counts only posts created on the current calendar day.
3. **Text Adaptation Verification**:
   - Unit test for `adaptChannelText` feeding strings of 170 chars (limit 160) and asserting clean truncation at clause boundaries.
4. **Model Matrix Health Check & Protocol Routing Verification**:
   - Unit test verifying `/images/generations` vs `/chat/completions` protocol dispatching in `executeImageGenerationRequest`.
   - Unit test verifying `Image-to-Image` fails fast when `referenceDataUrl` is absent.
   - Contract test for `GET /api/admin/channel/check-access`.
