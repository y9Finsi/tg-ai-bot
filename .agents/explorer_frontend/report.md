# Frontend Architecture & Modular Refactoring Report

**Project Root**: `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main`  
**Frontend Root**: `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/admin-v2`  
**Target Areas**: R1 (TGK Consistency), R2 (Model Matrix UI), R3 (Modular Decomposition & Hash Routing), R4 (Force-Directed Memory Graph & Virtualized CRM Chat), R5 (Client-Side Media Compression & Channel Access Validation)

---

## 1. Executive Summary

The current `admin-v2` frontend is centered around a **5,944-line monolithic file (`admin-v2/src/main.jsx`)** that manages all features (Simulation Day Diary, Inventory, CRM Users & Commerce, AI Sandbox & Prompt Studio, LLM Providers, Photo Catalog & Channel Publications, and System Diagnostics) within a single component file.

This monolithic structure suffers from:
1. **Severe Coupling**: Modifying one tab (e.g. Channel auto-posting) risks regressions across shared state and un-scoped CSS in CRM or Sandbox.
2. **Heavy Re-renders & State Loss**: Navigating between sections re-mounts large component trees and resets uncommitted form state.
3. **Missing Critical Capabilities**:
   - Lack of client-side image compression causing HTTP 413 errors on large uploads.
   - Static 4x4 coordinate grid in `MemoryGraph` instead of a physical force-directed graph.
   - Non-virtualized DOM rendering of chat logs in CRM causing frame drops.
   - Scattered AI model settings rather than a unified Model Matrix interface.
   - Missing instant channel permission checks before publishing.

This report provides the complete decomposition architecture into **6 clean feature packages** under `src/features/{channel, crm, studio, providers, content, simulation}`, a modern SPA sidebar layout with hash-based routing (`#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation`), isolated component state with caching, HTML5 Canvas image compression, and force-directed graph physics.

---

## 2. Monolithic Structure Analysis (`admin-v2/src/main.jsx`)

### 2.1 File Map & Line Ranges Breakdown

| Line Range | Category / Component | Description & Responsibilities |
|---|---|---|
| **1 – 59** | Imports & Static Constants | Radix tabs, alert dialogs, Lucide icons, prompt module definitions (`LERA_PROMPT_MODULES`, `ROUTING_PROMPT_MODULES`, `CHANNEL_PROMPT_MODULES`), default judge prompts. |
| **60 – 259** | Shared Utility Functions | Date formatters (`formatDate`, `formatDay`, `formatTime`, `shiftIsoDate`, `mskDateParts`, `isoDate`), topic shares normalizer (`normalizeTopicShares`, `redistributeTopicShare`), task/item formatters (`taskName`, `eventName`, `itemMeta`, `itemEffects`, `formatLocation`, `taskSource`, `formatReason`, `formatCancelReason`). |
| **90 – 123** | `MemoryGraph` | Static 4x4 coordinate layout for memory facts (`92 + (index % 4) * 174`). |
| **124 – 149** | `RetrievalTrace` | Response trace card list ("Why answered this way"). |
| **260 – 269** | `api()` Utility | Centralized fetch wrapper with `sessionStorage` admin key auth header and error throwing. |
| **270 – 294** | `Progress`, `ConfirmAction`, `Toast` | Common atomic UI helpers and alert dialog modal wrapper. |
| **295 – 317** | `Login` | Admin key authorization screen. |
| **318 – 959** | Simulation & Diary Components | `ProfileCard`, `StatCard`, `NeedsPanel`, `InventoryWidget`, `InventoryPanel`, `TaskCard`, `TaskDetailModal`, `Timeline`, `DaySummary`, `KanbanBoard`, `CurrentDecision`, `DiaryHeader`, `NpcPanel`, `RandomEventLab`, `PersonalityLab`, `SimulationLab`. |
| **960 – 1073** | Shared Prompt & Log Helpers | `QualityBadge`, `PromptModulesEditor`, `PromptAssemblyMap`, `formatRelativeTime`, `copyToClipboard`, `downloadTextFile`, `getKindBadgeVariant`. |
| **1074 – 2160** | System Logs & Diagnostics | `LiveServerLogsTab`, `ErrorsAuditTab`, `SimulationRationaleTab`, `LogsPanel`. |
| **2161 – 3505** | AI Sandbox & Prompt Studio | `LlmPanel`, `SandboxRawPrompt`, `SandboxResultCard`, `SandboxCompareChanges`, `SandboxPromptModules`, `SandboxSamplingControls`, `ProductionPromptModulesPanel`, `LeraProfileEditor`, `LeraJudgeSettingsEditor`, `SandboxPanel`, `CommentsPromptStudioPanel`, `ActionsManagerPanel`, `AiSandboxPromptStudio`. |
| **3506 – 3870** | AI Providers & Settings | `ImageGenerationTestPanel`, `LlmSettingsPanel` (Provider priority chain, sampling capabilities, classifier settings, judge settings, memory extractor settings). |
| **3871 – 4385** | CRM Panel | `CrmPanel` (Users search & list, user dossier, balances, memory facts, relationship form, chat window, payments, promocodes, business metrics). |
| **4386 – 5650** | Content & Channel Panel | `PhotoThumbnail`, `PhotoMetaEditor`, `ContentPanel` (Photo gallery, photo upload, media catalog, AI image generation settings & master reference, CosyVoice 3 voice settings & test, Telegram channel settings, draft generator, AI photo preview, draft publishing, channel history). |
| **5651 – 5772** | System Panel | `SystemPanel` (Engine status, simulation resets, operations). |
| **5773 – 5803** | `DiaryTabbar` | Topbar navigation header. |
| **5804 – 5945** | `App` & `ErrorBoundary` | Root state (`authenticated`, `day`, `view`, `data`, `readOnly`, `notice`), health polling (15s), hash sync, root DOM mount. |

### 2.2 Shared State & Dependencies in Current Monolith

- **Root State in `App`**:
  - `authenticated`: session check via `/api/admin/session`
  - `day`: current calendar day string in MSK (`YYYY-MM-DD`)
  - `view`: active view derived from `window.location.hash` (`diary`, `dialogs`, `llm-settings`, `crm`, `content`, `inventory`, `system`)
  - `data`: root snapshot from `/api/admin/radiant/day` (state, profile, timeline, schedule, activeTask, rationale, weather, health)
  - `notice`: active toast notification
- **Shared Helpers**:
  - `api(path, options)`
  - `cn(...classes)`
  - `normalizeTopicShares(topics, weights)`
  - `mskDateParts()` / `isoDate()`

---

## 3. Clean Target Directory Layout

The target architecture organizes the application into **6 feature modules** plus shared UI primitives, layout components, and core libraries.

```
admin-v2/src/
├── main.jsx                            # Slim root entry: ErrorBoundary, Providers, mount App
├── App.jsx                             # Shell container: Auth check, Sidebar layout, Hash Router, Toast
│
├── components/
│   ├── ui/                             # 22 existing Radix/shadcn UI primitives
│   │   ├── button.jsx, card.jsx, badge.jsx, dialog.jsx, alert-dialog.jsx, ...
│   ├── layout/
│   │   ├── Sidebar.jsx                 # Modern SPA Sidebar with 6 main hash routes (#channel, #crm, etc.)
│   │   ├── Topbar.jsx                  # Top header with brand, system status, location, health badge
│   │   └── NavItem.jsx                 # Sidebar navigation item with icon, label, active indicator
│   └── common/
│       ├── ConfirmAction.jsx           # Reusable confirmation dialog with pending state
│       ├── Toast.jsx                   # Notification alert box (success, error, info)
│       ├── Progress.jsx                # Visual progress bar
│       ├── Login.jsx                   # Authorization screen
│       └── ErrorBoundary.jsx           # React error boundary fallback
│
├── features/
│   ├── channel/                        # 📢 Feature: TGK Channel & Auto-posting (R1, R3, R5)
│   │   ├── index.jsx                   # Channel feature view container
│   │   ├── components/
│   │   │   ├── ChannelSettings.jsx     # Auto-posting parameters (frequency, calendar daily limit, editorial mode)
│   │   │   ├── ChannelAccessCheck.jsx  # R5: Permission diagnostics UI & button (GET /api/admin/channel/check-access)
│   │   │   ├── ChannelDraftEditor.jsx  # R1: WYSIWYG draft generator, AI photo preview, publish button
│   │   │   ├── ChannelTopicWeights.jsx # Interactive topic distribution & normalizer
│   │   │   ├── ChannelHistoryFeed.jsx  # History feed of published posts with provenance details
│   │   │   ├── ChannelCommentsConfig.jsx # Auto-replies, smart emoji reactions, user recognition
│   │   │   └── PromptAssemblyMap.jsx   # Visual prompt assembly map for channel posts
│   │   └── hooks/
│   │       └── useChannelData.js       # Channel settings, history, draft state & actions
│   │
│   ├── crm/                            # 👥 Feature: CRM, Relationships & Memory (R3, R4)
│   │   ├── index.jsx                   # CRM feature view container (Clients, Promocodes, Metrics)
│   │   ├── components/
│   │   │   ├── UserList.jsx            # User list with search & filter pills (all, premium, blocked)
│   │   │   ├── UserDossier.jsx         # User profile dossier with sub-tabs
│   │   │   ├── UserBalanceManager.jsx  # Text/Image/Voice balance editor & quick presets (+10💬, +5🖼️)
│   │   │   ├── UserMemoryFacts.jsx     # Long-term facts list with toggle/delete/add
│   │   │   ├── MemoryGraph.jsx         # R4: Physical Force-Directed Memory Graph (D3/SVG physics + drag/zoom/pan)
│   │   │   ├── RetrievalTrace.jsx      # Response trace & retrieval reasoning ("Почему ответила так")
│   │   │   ├── RelationshipEditor.jsx  # Dynamic trust/affection/irritation & relationship events log
│   │   │   ├── VirtualizedChatHistory.jsx # R4: High-performance 60 FPS virtualized message viewer
│   │   │   ├── PromocodesManager.jsx   # Promocodes & pricing packages editor
│   │   │   └── BusinessMetrics.jsx     # Analytics, active users count, revenue & free mode toggle
│   │   └── hooks/
│   │       └── useCrmData.js           # CRM users, selected user dossier & memory graph hook
│   │
│   ├── studio/                         # 🎨 Feature: AI Sandbox & Prompt Studio (R3)
│   │   ├── index.jsx                   # Studio feature view container
│   │   ├── components/
│   │   │   ├── ProductionPromptModules.jsx # Production prompt modules (core, common, casual, erotic, joke)
│   │   │   ├── LeraProfileEditor.jsx   # Persona, character traits, biographical settings
│   │   │   ├── LeraJudgeSettings.jsx   # Judge prompts & auditor checklist editor
│   │   │   ├── CommentsPromptStudio.jsx # Comments prompt & tone editor
│   │   │   ├── ActionsManager.jsx      # Scenario actions & tools manager
│   │   │   ├── SandboxPromptTester.jsx # Interactive sandbox harness & raw prompt preview
│   │   │   └── SandboxAbCompare.jsx    # A/B prompt testing & comparison card
│   │   └── hooks/
│   │       └── useStudioData.js        # Studio presets, module drafts & test execution hook
│   │
│   ├── providers/                      # ⚙️ Feature: AI Model Matrix & Routing (R2, R3)
│   │   ├── index.jsx                   # Providers feature view container
│   │   ├── components/
│   │   │   ├── ModelMatrixTable.jsx    # R2: Unified Model Matrix for all 6 AI roles
│   │   │   ├── ProviderChainManager.jsx # Provider fallback chain, priorities & sampling capabilities
│   │   │   ├── SlotHealthPing.jsx      # R2: Instant ping health-check button & status badges
│   │   │   ├── ImageGenSandbox.jsx     # Text-to-Image & Image-to-Image test panel with protocol selector
│   │   │   └── VoiceGenSandbox.jsx     # CosyVoice 3 TTS test panel & sample voice uploader
│   │   └── hooks/
│   │       └── useProvidersData.js     # Provider list, model matrix config & ping diagnostic actions
│   │
│   ├── content/                        # 🖼️ Feature: Media Catalog & Photos (R3, R5)
│   │   ├── index.jsx                   # Content feature view container
│   │   ├── components/
│   │   │   ├── PhotoGallery.jsx        # Photo catalog with filter pills (all, free, premium, spicy)
│   │   │   ├── PhotoUploader.jsx       # R5: HTML5 Canvas auto-compression dropzone
│   │   │   ├── PhotoMetaEditor.jsx     # Metadata editor (tags, outfit, explicitness, access level)
│   │   │   ├── MasterReferenceManager.jsx # Master reference photo setter & preview
│   │   │   ├── MediaCatalog.jsx        # Music, TikTok, video & link catalog
│   │   │   └── ContentSentJournal.jsx  # Delivered materials log
│   │   └── hooks/
│   │       └── useContentData.js       # Photos, catalog & upload state hook
│   │
│   └── simulation/                     # ⚡ Feature: Simulation & Radiant Engine (R3)
│       ├── index.jsx                   # Simulation feature view container
│       ├── components/
│       │   ├── DiaryHeader.jsx         # MSK Date picker & status bar
│       │   ├── NeedsPanel.jsx          # Vital stats & need gauges
│       │   ├── CurrentDecision.jsx     # Active GOAP task & rationale
│       │   ├── KanbanBoard.jsx         # Daily schedule & task cards
│       │   ├── InventoryWidget.jsx     # Quick backpack summary
│       │   ├── InventoryPanel.jsx      # Full wardrobe, items & consumables
│       │   ├── DaySummary.jsx          # Daily recap
│       │   ├── LiveServerLogsTab.jsx   # Real-time server log stream & filters
│       │   ├── ErrorsAuditTab.jsx      # Error tracking & diagnostics
│       │   ├── SimulationRationaleTab.jsx # Decision reasoning inspector
│       │   └── RandomEventLab.jsx      # Event injection & NPC interaction panel
│       └── hooks/
│           └── useSimulationData.js    # Radiant day snapshot, health polling & refresh hook
│
└── lib/
    ├── api.js                          # Centralized fetch wrapper with auth header & error handling
    ├── imageCompressor.js              # R5: Client-side HTML5 Canvas image compression utility
    ├── dateUtils.js                    # MSK formatting, relative time, ISO date helpers
    ├── topicUtils.js                   # Topic weight normalization & redistribution
    ├── simulationUtils.js              # Task names, event names, item metadata helpers
    └── utils.js                        # cn / classnames utility
```

---

## 4. SPA Sidebar Layout & Hash-Based Routing Strategy (R3)

### 4.1 Hash Routes Specification

The application will support the following primary hash routes:

| Hash | Feature View | Title | Icon | Purpose |
|---|---|---|---|---|
| `#channel` | `ChannelFeature` | Канал и Публикации | `Radio` | TGK auto-posting, draft generator, AI photo preview, channel permissions check |
| `#crm` | `CrmFeature` | CRM Пользователей | `Users` | Clients, balances, force-directed memory graph, virtualized chat, promocodes |
| `#studio` | `StudioFeature` | AI Sandbox & Prompts | `SlidersHorizontal` | Prompt modules, Lera profile, Judge prompts, comments studio, A/B testing |
| `#providers` | `ProvidersFeature` | Матрица AI Моделей | `Brain` | Model Matrix for all 6 AI slots, fallback chain, ping health checks, TTS & Image test |
| `#content` | `ContentFeature` | Контент и Медиа | `Image` | Photo gallery, Canvas-compressed uploader, master reference, catalog |
| `#simulation` | `SimulationFeature` | Симуляция и Дневник | `Zap` | Day diary, needs, schedule kanban, backpack inventory, server logs, event lab |

#### Backward-Compatibility Aliases
To prevent breaking bookmarks and internal links:
- `#diary` → mapped to `#simulation`
- `#inventory` → mapped to `#simulation` (with inventory tab active)
- `#dialogs` → mapped to `#studio`
- `#llm-settings` → mapped to `#studio`
- `#system` → mapped to `#simulation` (with logs/system tab active)

### 4.2 State Persistence & Tab Caching Architecture

To prevent losing uncommitted inputs (e.g. typing a prompt draft in Studio or post draft in Channel) when switching tabs:

1. **Keep-Alive Feature Container**:
   ```jsx
   <div className="v2-workspace-container">
     <div style={{ display: activeRoute === 'channel' ? 'contents' : 'none' }}>
       <ChannelFeature toast={toast} />
     </div>
     <div style={{ display: activeRoute === 'crm' ? 'contents' : 'none' }}>
       <CrmFeature toast={toast} />
     </div>
     <div style={{ display: activeRoute === 'studio' ? 'contents' : 'none' }}>
       <StudioFeature toast={toast} />
     </div>
     <div style={{ display: activeRoute === 'providers' ? 'contents' : 'none' }}>
       <ProvidersFeature toast={toast} />
     </div>
     <div style={{ display: activeRoute === 'content' ? 'contents' : 'none' }}>
       <ContentFeature toast={toast} />
     </div>
     <div style={{ display: activeRoute === 'simulation' ? 'contents' : 'none' }}>
       <SimulationFeature day={day} setDay={setDay} data={data} toast={toast} />
     </div>
   </div>
   ```
2. **Independent Custom Hooks**: Each feature maintains its own state via dedicated hooks (`useChannelData`, `useCrmData`, `useStudioData`, `useProvidersData`, `useContentData`, `useSimulationData`), preventing cross-tab re-render cascades.
3. **SessionStorage Caching**: Critical draft fields (e.g., `channel_draft_text`, `studio_active_preset`) automatically sync to `sessionStorage` on change.

---

## 5. Model Matrix UI Design (R2)

### 5.1 Architecture of the Unified Model Matrix

The Model Matrix UI in `src/features/providers/components/ModelMatrixTable.jsx` provides a centralized control plane for all 6 AI functional slots:

```
+----------------------------------------------------------------------------------------------------+
| 🧠 ЦЕНТРАЛЬНАЯ МАТРИЦА AI МОДЕЛЕЙ И МАРШРУТИЗАЦИИ                                                  |
+----------------------+--------------------+---------------------+------------------+---------------+
| Слот / Роль          | Провайдер          | Модель              | Протокол/Режим   | Диагностика   |
+----------------------+--------------------+---------------------+------------------+---------------+
| 1. Core Dialogue     | Primary: OpenRouter| mistral-large       | Fallback Chain   | [⚡ Ping All] |
|                      | Backup: DeepSeek   | deepseek-chat       | (3 провайдера)   | 420 ms · PASS |
+----------------------+--------------------+---------------------+------------------+---------------+
| 2. Style Classifier  | Mistral AI         | mistral-small       | CASUAL/EROTIC/.. | [⚡ Ping]     |
|                      |                    |                     | timeout: 7000ms  | 180 ms · PASS |
+----------------------+--------------------+---------------------+------------------+---------------+
| 3. AI Judge (Auditor)| OpenRouter         | claude-3-5-haiku    | Mode: ENFORCE    | [⚡ Ping]     |
|                      |                    |                     | timeout: 5000ms  | 310 ms · PASS |
+----------------------+--------------------+---------------------+------------------+---------------+
| 4. Text-to-Image     | Gemini Bridge      | gemini-2.5-flash    | Protocol:        | [⚡ Ping]     |
|                      |                    |                     | [images/gen  v]  | 1450 ms · PASS|
+----------------------+--------------------+---------------------+------------------+---------------+
| 5. Image-to-Image    | Gemini Bridge      | gemini-2.5-flash    | Multimodal Chat  | [⚡ Ping]     |
|    (Edit / Ref)      |                    |                     | Ref: 👑 Active   | 1890 ms · PASS|
+----------------------+--------------------+---------------------+------------------+---------------+
| 6. Voice (TTS)       | Hausmer / CosyVoice| cosyvoice3          | Preset: female   | [⚡ Ping]     |
|                      |                    |                     | Sample: 🎙️ Active| 620 ms · PASS |
+----------------------+--------------------+---------------------+------------------+---------------+
```

### 5.2 Slot Specifics & Requirements

1. **Core Dialogue**:
   - Displays primary provider + ordered fallback chain with up/down arrows to reorder priority.
   - Live sampling parameters toggles (`temperature`, `top_p`, `max_tokens`).
2. **Style Classifier**:
   - Provider selector (or inherit from chain), model name, timeout ms, max tokens.
3. **AI Judge (Auditor)**:
   - Mode selector (`OFF`, `OBSERVE`, `ENFORCE`).
   - System prompt editor with "Вставить эталонный чеклист" button.
4. **Text-to-Image Generator**:
   - **Explicit Protocol Selector**: `/images/generations` (native image API) vs `/chat/completions` (multimodal bridge).
   - Flag `auto_generate_channel` for auto-generating images during channel posts.
5. **Image-to-Image / Edit**:
   - Multi-modal `/chat/completions` protocol.
   - Master reference status check: displays green `👑 Master Ref Active` or yellow `⚠️ No reference`.
6. **Voice Synthesis (TTS)**:
   - Provider, model (`cosyvoice3`, `tts-1`), voice preset (`female`, `nova`), audio sample player.

### 5.3 Instant Diagnostic Health-Checks (SlotHealthPing)
Each row in the matrix includes a `⚡ Ping` button that makes a lightweight diagnostic request to test:
- API endpoint connectivity
- API key validity
- Model response latency in milliseconds
- Correct response format (e.g. JSON verdict for Judge, Base64 image for T2I, audio buffer for TTS)

---

## 6. CRM: Interactive Force-Directed Memory Graph & Virtualized Chat (R4)

### 6.1 Interactive Force-Directed Memory Graph (`MemoryGraph.jsx`)

#### Problem in Current Code:
Lines 97-100 of `main.jsx` place nodes on a rigid 4x4 coordinate grid:
```js
const positions = Object.fromEntries(graph.nodes.map((node, index) => [
    String(node.id ?? node.key ?? index),
    { x: 92 + (index % 4) * 174, y: 54 + Math.floor(index / 4) * 96 }
]));
```

#### Refactored Solution:
An interactive, physics-based force-directed graph implemented in pure SVG with velocity Verlet / spring physics:

1. **Physics Engine**:
   - **Repulsion Force (Coulomb)**: All node pairs repel each other ($F = \frac{k}{d^2 + \epsilon}$) to prevent overlap.
   - **Spring Attraction (Hooke)**: Connected edges pull nodes toward target link distance ($F = (d - d_0) \cdot k_{spring}$).
   - **Center Gravity**: Gentle gravitational attraction to SVG center ($(c - p) \cdot g$) to prevent disconnected islands from floating away.
   - **Velocity Damping**: $v_x \leftarrow v_x \cdot 0.85, v_y \leftarrow v_y \cdot 0.85$ for rapid convergence.
2. **Interactive Controls**:
   - **Drag & Drop**: Clicking and dragging any node pins its coordinates (`fx, fy`), recalculates forces, and unpins upon release.
   - **Pan & Zoom**: SVG `<g transform="translate(panX, panY) scale(zoom)">` with mouse wheel zoom (0.4x to 3.0x) and canvas dragging.
   - **Inspectable Edges & Nodes**: Clicking a node or edge opens an inline inspection card displaying fact text, score, memory type, created timestamp, and superseding relationships.
   - **Toolbar**: Reset View, Zoom In/Out, Physics Pause/Resume, and Filter by Active/Inactive/Superseded.

### 6.2 Virtualized Chat History Viewer (`VirtualizedChatHistory.jsx`)

#### Problem in Current Code:
Lines 4254-4271 in `main.jsx` render all messages in the DOM simultaneously inside `.crm-chat-window`. For heavy users with 1,000+ messages, this creates hundreds of DOM nodes, causing memory bloat and scroll stuttering.

#### Refactored Solution:
A virtualized list component maintaining a steady 60 FPS:
1. Calculates container height and dynamic scroll offset.
2. Calculates visible message index window:
   $$\text{startIndex} = \max(0, \lfloor \text{scrollTop} / \text{itemHeight} \rfloor - \text{overscan})$$
   $$\text{endIndex} = \min(\text{total}, \lceil (\text{scrollTop} + \text{height}) / \text{itemHeight} \rceil + \text{overscan})$$
3. Renders only the visible subset (typically 15-25 items) with top and bottom spacer padding matching the full scroll height.
4. Auto-scrolls to the newest message on initial open.

---

## 7. Media Optimization & Channel Permission Diagnostics (R5)

### 7.1 Client-Side Canvas Image Compression (`src/lib/imageCompressor.js`)

#### Problem in Current Code:
Lines 4535-4563 in `main.jsx` read raw image files into `FileReader` and transmit the full Base64 payload directly to `/api/admin/photos/upload`. A 5–10 MB smartphone photo produces a 7–14 MB JSON payload, resulting in HTTP 413 Payload Too Large errors and slow uploads.

#### Refactored Solution:
A robust HTML5 Canvas client-side compressor:

```javascript
/**
 * Compresses an image File/Blob on the client side using HTML5 Canvas.
 * Reduces image payload to target <= 2.5 MB.
 * 
 * @param {File|Blob} file - Original image file
 * @param {Object} options - Compression options
 * @returns {Promise<{ file: File, dataUrl: string, originalSize: number, compressedSize: number, width: number, height: number }>}
 */
export async function compressImage(file, options = {}) {
    const {
        maxSizeBytes = 2.5 * 1024 * 1024, // 2.5 MB
        maxWidth = 2560,
        maxHeight = 2560,
        initialQuality = 0.88,
        outputFormat = 'image/jpeg'
    } = options;

    if (!file || !file.type.startsWith('image/')) {
        throw new Error('Указанный файл не является изображением');
    }

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
    });

    let { width, height } = img;
    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    let quality = initialQuality;
    let dataUrl = canvas.toDataURL(outputFormat, quality);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, outputFormat, quality));

    let attempts = 0;
    while (blob.size > maxSizeBytes && quality > 0.4 && attempts < 5) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL(outputFormat, quality);
        blob = await new Promise(resolve => canvas.toBlob(resolve, outputFormat, quality));
        attempts++;
    }

    URL.revokeObjectURL(img.src);

    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
        type: outputFormat,
        lastModified: Date.now()
    });

    return {
        file: compressedFile,
        dataUrl,
        blob,
        originalSize: file.size,
        compressedSize: blob.size,
        reductionPercent: Math.round((1 - blob.size / file.size) * 100),
        width,
        height
    };
}
```

### 7.2 Channel Permission Validation UI (`ChannelAccessCheck.jsx`)

Provides an instant Telegram bot administrative check before publishing:
1. **Trigger**: Button `<Button onClick={checkAccess}><ShieldCheck size={14} /> Проверить права бота</Button>` in `ChannelSettings` and `ChannelDraftEditor`.
2. **Endpoint**: `GET /api/admin/channel/check-access`
3. **Response Diagnostics**:
   - Bot status in channel: Administrator / Member / Kicked
   - `can_post_messages`: true/false (critical)
   - `can_edit_messages`: true/false
   - `can_delete_messages`: true/false
   - Channel Title, Username, and Subscriber Count
   - Visual status badges: Green (Ready for Auto-posting), Red (Permission Missing - Bot cannot post).

---

## 8. Step-by-Step Refactoring Implementation Plan

### Phase 1: Shared Core & Utilities Foundation
1. Extract `src/lib/api.js`, `src/lib/dateUtils.js`, `src/lib/topicUtils.js`, `src/lib/simulationUtils.js`, and `src/lib/imageCompressor.js`.
2. Extract common components: `ConfirmAction.jsx`, `Toast.jsx`, `Progress.jsx`, `Login.jsx`, `ErrorBoundary.jsx`.
3. Create layout components: `Sidebar.jsx`, `Topbar.jsx`, `NavItem.jsx`.

### Phase 2: Feature Package Decomposition
1. **`src/features/channel/`**:
   - Extract `ChannelSettings.jsx`, `ChannelDraftEditor.jsx`, `ChannelTopicWeights.jsx`, `ChannelHistoryFeed.jsx`, `ChannelCommentsConfig.jsx`, `PromptAssemblyMap.jsx`.
   - Implement `ChannelAccessCheck.jsx` (R5).
   - Bundle into `src/features/channel/index.jsx`.
2. **`src/features/providers/`**:
   - Extract `ProviderChainManager.jsx`, `ImageGenSandbox.jsx`, `VoiceGenSandbox.jsx`.
   - Implement `ModelMatrixTable.jsx` and `SlotHealthPing.jsx` (R2).
   - Bundle into `src/features/providers/index.jsx`.
3. **`src/features/crm/`**:
   - Extract `UserList.jsx`, `UserDossier.jsx`, `UserBalanceManager.jsx`, `UserMemoryFacts.jsx`, `RelationshipEditor.jsx`, `PromocodesManager.jsx`, `BusinessMetrics.jsx`.
   - Implement interactive force-directed `MemoryGraph.jsx` (R4).
   - Implement `VirtualizedChatHistory.jsx` (R4).
   - Bundle into `src/features/crm/index.jsx`.
4. **`src/features/studio/`**:
   - Extract `ProductionPromptModules.jsx`, `LeraProfileEditor.jsx`, `LeraJudgeSettings.jsx`, `CommentsPromptStudio.jsx`, `ActionsManager.jsx`, `SandboxPromptTester.jsx`, `SandboxAbCompare.jsx`.
   - Bundle into `src/features/studio/index.jsx`.
5. **`src/features/content/`**:
   - Extract `PhotoGallery.jsx`, `PhotoMetaEditor.jsx`, `MasterReferenceManager.jsx`, `MediaCatalog.jsx`, `ContentSentJournal.jsx`.
   - Integrate `compressImage()` into `PhotoUploader.jsx` (R5).
   - Bundle into `src/features/content/index.jsx`.
6. **`src/features/simulation/`**:
   - Extract `DiaryHeader.jsx`, `NeedsPanel.jsx`, `CurrentDecision.jsx`, `KanbanBoard.jsx`, `InventoryWidget.jsx`, `InventoryPanel.jsx`, `DaySummary.jsx`, `LiveServerLogsTab.jsx`, `ErrorsAuditTab.jsx`, `SimulationRationaleTab.jsx`, `RandomEventLab.jsx`.
   - Bundle into `src/features/simulation/index.jsx`.

### Phase 3: Root App & Shell Assembly
1. Assemble `App.jsx` with SPA Sidebar layout, hash router listener, keep-alive feature rendering, and 15s health polling.
2. Update `main.jsx` to a clean 30-line entry point rendering `<ErrorBoundary><App /></ErrorBoundary>`.

---

## 9. Verification & Build Validation

### Build Commands:
```bash
# Build admin frontend bundle for production
npm run admin:build
```

### Verification Criteria:
1. `npm run admin:build` completes with code 0, bundling into `public/admin-v2/` without syntax or unresolved import errors.
2. Hash navigation smoothly routes between `#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation`.
3. Model Matrix correctly exposes all 6 AI slots with ping triggers.
4. Memory graph renders draggable, force-directed SVG nodes.
5. Large image uploads are client-compressed to <= 2.5 MB.
