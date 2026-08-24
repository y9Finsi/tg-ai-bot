# Project: Telegram AI Bot Admin Panel & TGK Publishing Refactoring

## Architecture
- **Backend Core**: Express API in `src/server.js`, `src/channel_poster.js`, `src/channel_content.js`, `src/services/image_generator.js`, `src/services/ai_matrix.js`, `src/db/database.js`.
- **Frontend SPA**: React 19 + Tailwind CSS in `admin-v2/` decomposed into feature modules:
  - `src/features/channel/` (TGK channel settings, draft publishing, auto-poster config, permission diagnostics)
  - `src/features/crm/` (User CRM, virtualized chat history, interactive force-directed memory graph)
  - `src/features/studio/` (Prompt Studio, AI Sandbox, prompt testing)
  - `src/features/providers/` (Centralized Model Matrix, AI role slot manager, diagnostic ping checks)
  - `src/features/content/` (Media gallery, canvas image compression upload, voice/audio manager)
  - `src/features/simulation/` (Dialogue simulation, personality testing, state inspection)
  - `src/components/layout/` (SPA Sidebar, header, navigation, toast system, modals)
  - `src/lib/` (Image compressor, API client, graph simulation physics, virtualizer)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | WYSIWYG Photo Consistency | Decode base64 data URLs / preview buffers in `publishChannelDraft` to send exact previewed image to Telegram without duplicate generation | M1 | R1 |
| 2 | Calendar Day MSK Cron Scheduler | Track auto-poster daily limits from 00:00 Europe/Moscow calendar day; remove `Math.min(2)` and `Math.max(12)` artificial limit clamps | M1 | R1 |
| 3 | Intelligent Channel Text Adaptation | Normalize whitespace and gracefully truncate text at sentence boundaries on 15–20% overflow instead of hard rejecting with CHANNEL_TOO_LONG | M1 | R1 |
| 4 | Centralized Model Matrix API & Routing | Unified provider configuration for 6 AI slots: Core Dialogue (fallback list), Style Classifier, Judge, Text-to-Image (/images/generations vs /chat/completions), Image-to-Image (with required reference verification), Voice (TTS) | M2 | R2 |
| 5 | AI Model Matrix Health-Check Endpoint | Instant diagnostic ping / health-check endpoint for each model matrix slot (`POST /api/admin/model-matrix/health-check`) | M2 | R2 |
| 6 | Channel Bot Access Validation Endpoint | Endpoint `GET /api/admin/channel/check-access` to verify bot administrative status (`can_post_messages`) and return channel metadata | M2 | R5 |
| 7 | Frontend Feature Modular Decomposition | Decompose 5,944-line `admin-v2/src/main.jsx` into modular packages under `admin-v2/src/features/{channel, crm, studio, providers, content, simulation}` | M3 | R3 |
| 8 | SPA Sidebar & Hash-Based Routing | Modern SPA sidebar navigation with hash routing (`#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation`) and tab state caching | M3 | R3 |
| 9 | Interactive Force-Directed Memory Graph | Interactive SVG canvas with velocity-Verlet physics simulation, zoom, pan, node drag, edge inspector drawer | M4 | R4 |
| 10 | Virtualized CRM Chat History | Windowed list virtualization with DOM recycling maintaining steady 60 FPS across extensive user chat histories | M4 | R4 |
| 11 | Centralized Model Matrix UI | Unified table and configuration modal for managing, switching, and pinging all 6 AI slots from a single interface | M5 | R2 |
| 12 | Client-Side Image Compression | Canvas-based downscaling helper in `src/lib/imageCompressor.js` reducing image uploads to <= 2.5 MB to prevent HTTP 413 errors | M5 | R5 |
| 13 | Channel Permissions Diagnostic UI | Channel diagnostic check button and status badges in TGK panel calling `/api/admin/channel/check-access` | M5 | R5 |
| 14 | E2E & Contract Test Verification | Automated 4-tier test suite covering backend logic, frontend builds, API contracts, and integration flows | M6 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend TGK Publishing, Scheduler & Text Adaptation | Fix photo publishing desync, MSK calendar day cron, clamp removal, and intelligent text adaptation in `src/channel_poster.js`, `src/channel_content.js`, `src/server.js`, `src/db/database.js` | none | DONE |
| M2 | Centralized AI Model Matrix & Diagnostics Backend | Implement unified Model Matrix routes, slot routing (T2I vs I2I protocols, TTS, Core Dialogue fallbacks), health checks, and `GET /api/admin/channel/check-access` in `src/services/` and `src/server.js` | none | DONE |
| M3 | Frontend Modular Architecture & Hash Navigation | Decompose `admin-v2/src/main.jsx` into modular feature directories, implement SPA layout with hash routing and state caching, verify `npm run admin:build` | none | DONE |
| M4 | CRM Interactive Force-Directed Memory Graph & Virtualized Chat | Build interactive physics-based Memory Graph (zoom/pan/drag/inspect) and VirtualizedChatList in `admin-v2/src/features/crm/` | M3 | DONE |
| M5 | Model Matrix UI, Media Compression & Channel Diagnostics | Implement ModelMatrixTable UI, Canvas image compressor integration in upload flows, and Channel access check UI; verify `npm run admin:build` | M2, M3 | DONE |
| M6 | E2E Test Suite & Final Verification | Execute complete 4-tier test suite + adversarial Tier 5 validation, verifying all acceptance criteria and production build | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts

### Backend API Contracts

#### 1. Channel Access Diagnostics
- **Endpoint**: `GET /api/admin/channel/check-access`
- **Response Success (200)**:
```json
{
  "ok": true,
  "bot": { "id": 123456, "username": "lera_ai_bot", "can_join_groups": true },
  "channel": {
    "id": -1001234567890,
    "title": "Лера в Питере",
    "username": "lera_spb_tgk",
    "type": "channel",
    "member_count": 1420
  },
  "permissions": {
    "status": "administrator",
    "can_post_messages": true,
    "can_edit_messages": true,
    "can_delete_messages": true
  }
}
```
- **Response Error (400/500)**:
```json
{
  "ok": false,
  "error": "BOT_NOT_ADMIN",
  "message": "Bot is not an administrator in channel -1001234567890 (status: member)"
}
```

#### 2. Model Matrix Management & Diagnostics
- **Endpoint**: `GET /api/admin/model-matrix`
- **Response (200)**:
```json
{
  "ok": true,
  "slots": {
    "core_dialogue": { "active_provider": "openai", "active_model": "gpt-4o", "fallbacks": ["anthropic:claude-3-5-sonnet", "deepseek:deepseek-chat"] },
    "style_classifier": { "active_provider": "openai", "active_model": "gpt-4o-mini" },
    "judge": { "active_provider": "openai", "active_model": "gpt-4o" },
    "text_to_image": { "active_provider": "openai", "active_model": "dall-e-3", "protocol": "/images/generations" },
    "image_to_image": { "active_provider": "novita", "active_model": "flux-image-to-image", "protocol": "/chat/completions", "requires_reference": true },
    "voice": { "active_provider": "elevenlabs", "active_model": "eleven_multilingual_v2" }
  }
}
```
- **Endpoint**: `POST /api/admin/model-matrix/health-check`
- **Request**: `{ "slot": "text_to_image", "provider": "openai", "model": "dall-e-3", "protocol": "/images/generations" }`
- **Response (200)**: `{ "ok": true, "latency_ms": 1420, "message": "Endpoint verified successfully" }`

#### 3. TGK Draft Publishing with WYSIWYG Media
- **Endpoint**: `POST /api/admin/channel/posts/:id/publish`
- **Request**: `{}`
- **Behavior**: If post has `media_url` or `preview_url` (data URL or buffer), decode and transmit existing image without triggering `generateLeraPhoto`.

### Frontend Feature Module Contracts
- `admin-v2/src/features/channel/components/ChannelTab.jsx`
  - Props: `{ channelConfig, onUpdateConfig, drafts, onPublishDraft, onCreateDraft }`
- `admin-v2/src/features/crm/components/CrmTab.jsx`
  - Props: `{ users, selectedUserId, onSelectUser, memoryGraphData }`
- `admin-v2/src/features/providers/components/ProvidersTab.jsx`
  - Props: `{ matrixConfig, onSaveMatrix, onHealthCheck }`
- `admin-v2/src/lib/imageCompressor.js`
  - `compressImage(file: File, options?: { maxWidth?: number, maxHeight?: number, maxSizeBytes?: number, quality?: number }): Promise<File | Blob>`

## Code Layout
```
/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/
├── admin-v2/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── Header.jsx
│   │   │   │   └── AppLayout.jsx
│   │   │   └── ui/
│   │   │       ├── Button.jsx
│   │   │       ├── Modal.jsx
│   │   │       ├── Toast.jsx
│   │   │       └── Card.jsx
│   │   ├── features/
│   │   │   ├── channel/
│   │   │   │   ├── components/
│   │   │   │   │   ├── ChannelTab.jsx
│   │   │   │   │   ├── PostEditor.jsx
│   │   │   │   │   ├── DraftList.jsx
│   │   │   │   │   └── ChannelDiagnostics.jsx
│   │   │   │   └── hooks/
│   │   │   │       └── useChannelPosts.js
│   │   │   ├── crm/
│   │   │   │   ├── components/
│   │   │   │   │   ├── CrmTab.jsx
│   │   │   │   │   ├── MemoryGraph.jsx
│   │   │   │   │   ├── VirtualizedChatList.jsx
│   │   │   │   │   └── UserDetailsDrawer.jsx
│   │   │   │   └── hooks/
│   │   │   │       ├── useMemoryGraph.js
│   │   │   │       └── useUserConversations.js
│   │   │   ├── studio/
│   │   │   │   └── components/
│   │   │   │       ├── StudioTab.jsx
│   │   │   │       └── PromptEditor.jsx
│   │   │   ├── providers/
│   │   │   │   └── components/
│   │   │   │       ├── ProvidersTab.jsx
│   │   │   │       ├── ModelMatrixTable.jsx
│   │   │   │       └── HealthCheckButton.jsx
│   │   │   ├── content/
│   │   │   │   └── components/
│   │   │   │       ├── ContentTab.jsx
│   │   │   │       └── MediaUploader.jsx
│   │   │   └── simulation/
│   │   │       └── components/
│   │   │           └── SimulationTab.jsx
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   ├── imageCompressor.js
│   │   │   ├── forceGraphPhysics.js
│   │   │   └── virtualizer.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── vite.config.js
├── src/
│   ├── channel_poster.js
│   ├── channel_content.js
│   ├── server.js
│   ├── db/database.js
│   └── services/
│       ├── image_generator.js
│       └── ai_matrix.js
└── test/
    ├── tgk_wysiwyg_publish.test.js
    ├── tgk_calendar_cron.test.js
    ├── tgk_text_adaptation.test.js
    ├── model_matrix_routing.test.js
    ├── channel_access_check.test.js
    ├── image_compressor.test.js
    └── admin_build_smoke.test.js
```
