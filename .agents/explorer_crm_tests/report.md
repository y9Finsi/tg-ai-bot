# Comprehensive Investigation Report: CRM, Force-Directed Memory Graph & Test Infrastructure

**Agent**: CRM, D3 Graph & Test Infrastructure Explorer  
**Date**: 2026-08-25  
**Project**: Telegram AI Bot with Payments (Admin Panel v2 / Radiant Admin)  
**Authoritative Reference**: `.agents/ORIGINAL_REQUEST.md` (Requirement R4 & Test Architecture)

---

## 1. Executive Summary

This report delivers a complete architectural and technical investigation into three critical subsystems of the repository:
1. **CRM User Workspace & Memory Graph (R4)**: Current static 4x4 coordinate grid limitations vs. a modern interactive force-directed graph (D3 / SVG canvas physics, zoom/pan, draggable nodes, edge inspections).
2. **Virtualized Chat History (R4)**: Performance bottleneck of rendering unwindowed DOM message streams vs. a 60 FPS DOM-recycling virtual list (`VirtualizedChatList`).
3. **Repository-Wide Test Infrastructure**: Audit of the existing Node.js native test runner, inventory of all 49 test suites, analysis of backend Express testability, and a structured 4-Tier testing roadmap (Unit -> API Integration -> Component/Virtualization -> Playwright E2E).

---

## 2. CRM & Memory Graph Architecture

### 2.1 Current Implementation in `admin-v2/src/main.jsx`
The CRM workspace is rendered within `CrmPanel` (`admin-v2/src/main.jsx:3871–4300`). It is organized as a split layout:
- **Left Sidebar (`.crm-sidebar`)**:
  - Filter bar: All (`all`), Premium (`premium`), Blocked (`blocked`).
  - Search input: queries `/api/admin/users/search?q={query}` or `/api/admin/users?limit=50`.
  - User List Grid (`.user-list-grid`): displays user avatar/icon, username, Telegram ID, text/image balances, and daily initiative usage (`initiatives_used_today / initiative_limit_effective`).
- **Right Main Panel (`.crm-main`)**:
  - Activated when a user is selected via `openUser(id)`, triggering `/api/admin/users/:id/full`.
  - Seven sub-tabs:
    1. `balance`: Fast balance presets (+10 text, +5 photo, +5 voice) and custom balance inputs.
    2. `memory`: Flat list of active and inactive memory facts with toggle and delete actions.
    3. `memory-graph`: Renders `<MemoryGraph graph={memoryGraph} ... />`.
    4. `why`: Renders `<RetrievalTrace retrievals={retrievals} ... />` showing scoring, latency, fallback reasons, and candidate exclusions.
    5. `relationship`: Sliders/inputs for `trust`, `affection`, `irritation` and relationship event logs.
    6. `chat`: Visual messenger chat bubbles rendered without windowing.
    7. `payments`: Purchase transactions and stars/ruble package activations.

### 2.2 Backend Memory Graph Data Pipeline
The graph endpoint is exposed at `GET /api/admin/memory/graph/:userId` (`src/server.js:2570–2576`), delegating to `memoryRepository.getGraph(userId, { limit })` (`src/memory/memory_repository.js:982–1094`):

```typescript
// Backend Data Model returned by /api/admin/memory/graph/:userId
interface MemoryGraphResponse {
  success: boolean;
  graph: {
    userId: string;
    nodes: Array<FactNode | EntityNode | RetrievalNode>;
    edges: Array<SupersedesEdge | MentionsEdge | SelectedEdge>;
    stats: {
      facts: number;
      active: number;
      inactive: number;
      retrievals: number;
      entities: number;
    };
  };
}

interface FactNode {
  id: `fact:${string}`;
  kind: 'fact';
  factId: string;
  type: string;             // 'BIOGRAPHY' | 'PREFERENCE' | 'SOCIAL' | 'WORK' | 'OPINION' | etc.
  label: string;            // Normalized fact text
  active: boolean;          // isActive
  confidence: number;       // 0.0 - 1.0
  importance: number;       // 0 - 100
  provenance: object;
  createdAt: string;
  validFrom?: string;
  validUntil?: string;
}

interface EntityNode {
  id: `entity:${string}`;
  kind: 'entity';
  label: string;            // Entity name / place / person
  active: true;
}

interface RetrievalNode {
  id: `retrieval:${string}`;
  kind: 'retrieval';
  label: string;            // User query text
  source: string;           // Provider / Strategy
  createdAt: string;
  active: true;
}

interface SupersedesEdge {
  id: `supersedes:${string}:${string}`;
  source: `fact:${string}`;
  target: `fact:${string}`;
  type: 'SUPERSEDES';
  label: 'заменяет';
}

interface MentionsEdge {
  id: `mentions:${string}:${string}`;
  source: `fact:${string}`;
  target: `entity:${string}`;
  type: 'MENTIONS';
  label: 'связано';
}

interface SelectedEdge {
  id: `selected:${string}:${string}`;
  source: `retrieval:${string}`;
  target: `fact:${string}`;
  type: 'SELECTED';
  label: string;            // Score, e.g. "0.85"
  score: number;
}
```

### 2.3 Flaws in the Current Static MemoryGraph
In `admin-v2/src/main.jsx:90–122`, the graph component uses a rigid, artificial 4x4 coordinate formula:
```javascript
const width = 720;
const height = Math.max(230, Math.ceil(graph.nodes.length / 4) * 96 + 42);
const positions = Object.fromEntries(graph.nodes.map((node, index) => [String(node.id ?? node.key ?? index), {
    x: 92 + (index % 4) * 174,
    y: 54 + Math.floor(index / 4) * 96
}]));
```
**Key Deficiencies**:
1. **Broken Spatial Semantics**: Connected nodes are placed in arbitrary table-grid cells regardless of topology. Long crossing lines obscure node labels.
2. **Zero Physics**: No collision avoidance or spring attraction.
3. **No Zoom / Pan**: Only standard CSS overflow (`overflow-x: auto`), which truncates large graphs on smaller viewports.
4. **No Draggability**: Users cannot reposition nodes to cluster related topics.
5. **No Edge Inspection / Hover Tooltips**: Clicking or hovering over nodes/edges provides no feedback.
6. **No Subgraph Highlighting**: Selecting a fact does not highlight its 1-hop neighborhood or supersession history.

---

## 3. Interactive Force-Directed Memory Graph Design

### 3.1 Physics & Simulation Engine Specification
To satisfy **Requirement R4**, the new `MemoryGraph` should feature an SVG/Canvas force simulation with continuous numerical integration (Velocity Verlet).

#### Mathematical Forces:
1. **Link Spring Force (`forceLink`)**:
   $$F_{\text{link}}(u, v) = k_{\text{type}} \cdot (\|p_u - p_v\| - d_{\text{target}})$$
   - `d_target`: 80px for `MENTIONS`, 60px for `SUPERSEDES`, 110px for `SELECTED`.
   - `strength`: 0.7 for high rigidity on direct replacements.
2. **Many-Body Repulsion (`forceManyBody`)**:
   $$F_{\text{repulsion}}(u, v) = -\frac{G_{\text{repulse}}}{\|p_u - p_v\|^2 + \epsilon}$$
   - `G_repulse` = -280 to prevent node overlap while maintaining cohesive clusters.
3. **Collision Force (`forceCollide`)**:
   $$r_{\text{collision}} = r_{\text{node}} + 18\text{px}$$
   - Prevents node overlap with strict circle radius constraints (Fact: 24px, Entity: 20px, Retrieval: 22px).
4. **Centering & Bounding Gravity (`forceCenter` + `forceX` / `forceY`)**:
   - Keeps disconnected subgraphs smoothly centered within the canvas viewport $(W/2, H/2)$.

### 3.2 Interaction Model
1. **Zoom & Pan Engine**:
   - Smooth transform state: matrix $[k, 0, 0, k, t_x, t_y]$.
   - Wheel event handler: zoom centered on mouse cursor position ($k \in [0.25, 3.5]$).
   - Mouse drag on SVG background: pan canvas.
   - Toolbar controls: `[+] Zoom In`, `[-] Zoom Out`, `[1:1] Reset`, `[⊡] Fit Graph to Viewport`.
2. **Node Drag & Pin**:
   - `onPointerDown`: captures pointer, sets node fixed position `fx = node.x`, `fy = node.y`, raises simulation `alphaTarget(0.3)`.
   - `onPointerMove`: updates `fx`, `fy`.
   - `onPointerUp`: releases `fx = null, fy = null` (or retains pin if locked).
3. **1-Hop Neighborhood Highlighting**:
   - When node $N$ is clicked:
     - Dim all unrelated nodes and edges to $15\%$ opacity.
     - Highlight $N$, all neighbor nodes $\text{adj}(N)$, and all incident edges $E(N)$ with accent glows.
4. **Rich Inspector Sidebar / Drawer & Hover Tooltip**:
   - Hover: instant floating glassmorphic tooltip with node type, summary label, and confidence score.
   - Click: activates detailed Inspector Card:
     * Full fact text and metadata payload.
     * Memory category tag (`BIOGRAPHY`, `PREFERENCE`, `SOCIAL`, etc.).
     * Superseded/Superseding chain history.
     * Connected entities.
     * Direct actions: **Toggle Active Status**, **Delete Fact**, **Copy Fact ID**.

### 3.3 Implementation Approaches: D3 vs. Zero-Dependency Custom Engine

| Feature | Option A: D3 Modules (`d3-force`, `d3-zoom`, `d3-drag`) | Option B: Custom Pure React/SVG Physics Engine |
|---|---|---|
| **Bundle Impact** | ~32 KB (gzipped ~9 KB) | ~4 KB (zero external deps) |
| **Dependencies** | Requires `d3-force`, `d3-zoom`, `d3-selection` | Zero external dependencies |
| **Simulation Speed** | Highly optimized Barnes-Hut quadtree ($O(N \log N)$) | Direct pairwise integration ($O(N^2)$ for small $N \le 200$) |
| **Maintenance** | Industry-standard API | 100% self-contained in React hook (`useForceSimulation`) |

**Recommendation**: Both are viable. If adding `d3` (or `d3-force` + `d3-zoom`) to `package.json` is approved, it offers the standard robust quadtree simulation. If keeping `package.json` lean is preferred, a self-contained ~150-line `useForceSimulation` hook provides 60 FPS physics, zoom/pan matrix, and drag-and-drop.

---

## 4. Virtualized Chat History Architecture

### 4.1 The DOM Bottleneck in Current CRM
In `admin-v2/src/main.jsx:4254–4271`, the chat tab renders the entire message array directly into `.crm-chat-window`:
```jsx
{(selectedUser.conversations || []).map(conv => (
    <div className={cn('chat-bubble-row', ...)} key={conv.id}>
        <div className="chat-bubble">...</div>
    </div>
))}
```
When inspecting users with 500–5,000 messages:
- **6,000+ DOM elements** are instantiated.
- Garbage collection pauses, layout reflows, and GPU paint operations cause scrolling frame rates to plunge to 15–20 FPS.
- Memory consumption increases by tens of megabytes per open user profile.

### 4.2 High-Performance `VirtualizedChatList` Architecture
To guarantee **solid 60 FPS scrolling**, a virtualized DOM recycling list is designed.

```
┌────────────────────────────────────────────────────────┐
│ Virtual Scroll Container (height: 500px, overflow-y)   │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Total Spacer (height: sum of all measured heights) │ │
│ │                                                    │ │
│ │  [... Unrendered Offscreen Items 0..38 ...]        │ │
│ │                                                    │ │
│ │  ┌──────────────────────────────────────────────┐  │ │
│ │  │ Item #39 (translateY: 2480px) [OVERSCAN]     │  │ │
│ │  │ Item #40 (translateY: 2540px) [VISIBLE]      │  │ │
│ │  │ Item #41 (translateY: 2610px) [VISIBLE]      │  │ │
│ │  │ Item #42 (translateY: 2750px) [VISIBLE]      │  │ │
│ │  │ Item #43 (translateY: 2830px) [VISIBLE]      │  │ │
│ │  │ Item #44 (translateY: 2900px) [OVERSCAN]     │  │ │
│ │  └──────────────────────────────────────────────┘  │ │
│ │                                                    │ │
│ │  [... Unrendered Offscreen Items 45..500 ...]      │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

#### Key Components:
1. **Dynamic Height Index Cache**:
   - Because message bubbles have variable heights (single word vs multi-paragraph response), each item's height $h_i$ is estimated initially ($72\text{px}$ base) and updated via `ResizeObserver` upon render.
   - Offset table: $\text{offset}_0 = 0, \quad \text{offset}_{i+1} = \text{offset}_i + h_i$.
2. **Binary Search Windowing ($O(\log N)$)**:
   - Given container `scrollTop` and `viewportHeight`:
   - $\text{startIndex} = \text{binarySearch}(\text{scrollTop} - \text{overscanPx})$.
   - $\text{endIndex} = \text{binarySearch}(\text{scrollTop} + \text{viewportHeight} + \text{overscanPx})$.
   - Only $\sim 12 - 20$ DOM items are mounted at any given moment.
3. **Scroll Anchoring & Auto-Scroll**:
   - On initial load: automatically scroll to bottom (`scrollTop = totalHeight`).
   - Sticky scroll-to-bottom: if user is within $60\text{px}$ of bottom when a new message arrives, maintain stickiness. If user scrolled up to review history, lock relative scroll position.
4. **Messenger Features**:
   - Role side alignment (`user-side` vs `lera-side`).
   - Telegram message timestamp formatted in Europe/Moscow.
   - LLM model badge (e.g. `gpt-4o`, `claude-3.5-sonnet`) when generated by AI.
   - Jump to bottom FAB indicator with unread count.

---

## 5. Repository Test Infrastructure Analysis

### 5.1 Test Runner & Execution Setup
- **Test Engine**: Node.js Native Test Runner (`node:test` + `node:assert/strict`).
- **NPM Script**: `"test": "node --test --test-force-exit test/*.test.js"`.
- **Performance**: High speed execution — unit and contract suites run in **$< 100\text{ ms}$**.
- **DevDependencies in `package.json`**:
  - `@eslint/js`: `^10.0.1`
  - `eslint`: `^10.5.0`
  - `@vitejs/plugin-react`: `^5.0.4`
  - `shadcn`: `^4.18.0`
  - `vite`: `^7.1.12`

### 5.2 Complete Inventory of All 49 Test Suites

| # | Test File | Size | Domain / Scope | Status / Notes |
|---|---|---|---|---|
| 1 | `admin_content_ui.test.js` | 4,383 B | Content UI & Layout Contract | PASS |
| 2 | `admin_home_figma.test.js` | 9,248 B | Design Tokens & Layout Fidelity | PASS |
| 3 | `admin_layout_cleanup.test.js` | 2,252 B | Sidebar & Layout Hygiene | PASS |
| 4 | `admin_p0_p2_design.test.js` | 4,248 B | P0-P2 UI Component Contracts | PASS |
| 5 | `admin_v2_contract.test.js` | 18,851 B | Admin Panel V2 Structure & Tabs | PASS |
| 6 | `admin_visual_consistency.test.js` | 9,025 B | UI Theme & Visual Tokens | PASS |
| 7 | `channel_admin_contract.test.js` | 2,815 B | Channel Admin UI Contract | PASS |
| 8 | `channel_comments_and_memes.test.js` | 3,930 B | Auto-reply comments & memes | FAIL (R1 refactor target) |
| 9 | `channel_optimization.test.js` | 2,110 B | Channel limit & schedule limits | FAIL (R1 refactor target) |
| 10 | `channel_prompt.test.js` | 2,327 B | Channel prompt builder | FAIL (R1 refactor target) |
| 11 | `channel_topics.test.js` | 1,282 B | Topic normalization & weights | PASS |
| 12 | `chat_context_guard.test.js` | 4,728 B | Chat context bounds & guardrails | PASS |
| 13 | `clean_layout_design.test.js` | 1,225 B | UI layout cleanliness | PASS |
| 14 | `climax_engine.test.js` | 6,182 B | Narrative climax generation | PASS |
| 15 | `commitments_travel.test.js` | 6,781 B | Radiant travel & commitments | PASS |
| 16 | `context_retriever.test.js` | 8,749 B | Memory & context retrieval | PASS |
| 17 | `continuous_day_context.test.js` | 4,786 B | 24h continuous day simulation | PASS |
| 18 | `day_profile_routine.test.js` | 3,769 B | Routine & schedule profile | PASS |
| 19 | `day_simulation_24h.test.js` | 16,701 B | 24h full day simulation run | PASS |
| 20 | `engine.test.js` | 1,709 B | Core simulation engine loop | PASS |
| 21 | `image_generator.test.js` | 2,460 B | Image generation protocols | FAIL (R2 refactor target) |
| 22 | `initiative_content.test.js` | 8,389 B | Proactive messaging generator | PASS |
| 23 | `inventory.test.js` | 1,088 B | Lera item backpack / inventory | PASS |
| 24 | `memory_outbox_worker.test.js` | 3,895 B | Outbox async retry & locks | PASS |
| 25 | `memory_pipeline_contract.test.js` | 9,046 B | Memory ingestion & extraction | PASS |
| 26 | `needs_panel_design.test.js` | 2,212 B | Radiant Needs UI contract | PASS |
| 27 | `npc_engine.test.js` | 1,429 B | NPC interactions (Nastya, etc.) | PASS |
| 28 | `parallel_transit_recovery.test.js` | 1,651 B | Transit state recovery | PASS |
| 29 | `prompt_routing_contract.test.js` | 1,478 B | Two-stage model router | FAIL (R2 refactor target) |
| 30 | `prompt_studio.test.js` | 10,979 B | Prompt Studio A/B candidate lab | PASS |
| 31 | `public_channel_contract.test.js` | 7,566 B | TGK publishing pipeline | FAIL (R1 refactor target) |
| 32 | `radiant_actions.test.js` | 17,178 B | GOAP action execution | FAIL (requires DB mock) |
| 33 | `radiant_admin.test.js` | 3,603 B | Radiant admin endpoints | PASS |
| 34 | `radiant_health.test.js` | 1,181 B | Engine health status check | PASS |
| 35 | `radiant_recovery.test.js` | 4,555 B | Crash & reboot recovery | PASS |
| 36 | `random_personality.test.js` | 3,589 B | Daily personality drift | PASS |
| 37 | `recovery_contract.test.js` | 2,356 B | System state recovery contract | PASS |
| 38 | `relationship.test.js` | 1,527 B | Dynamic relationship math | PASS |
| 39 | `response_judge.test.js` | 3,574 B | Response quality judge | PASS |
| 40 | `response_quality.test.js` | 2,858 B | Quality scoring & filtering | PASS |
| 41 | `response_text.test.js` | 5,871 B | Text normalization & parsing | PASS |
| 42 | `sandbox_service.test.js` | 7,092 B | AI Sandbox execution & runs | PASS |
| 43 | `search_archive_memory_action.test.js` | 4,250 B | Memory archive search action | PASS |
| 44 | `telegram_day_context.test.js` | 2,042 B | Daily context formatting for TG | PASS |
| 45 | `two_stage_routing_regression.test.js` | 11,678 B | Provider routing fallbacks | FAIL (R2 refactor target) |
| 46 | `typed_memory_domain.test.js` | 7,116 B | Typed memory domain logic | PASS |
| 47 | `typed_memory_schema.test.js` | 4,701 B | Memory DB schemas & DDL | PASS |
| 48 | `typing_manager.test.js` | 626 B | Telegram typing action manager | PASS |
| 49 | `vision_fallback.test.js` | 1,824 B | Multimodal vision fallbacks | PASS |

### 5.3 Backend Endpoints Testability Analysis
Currently, `src/server.js` contains both Express application configuration and immediate port binding (`app.listen(PORT)` in `startAdminServer()`).
To enable programmatic, in-process testing of all admin REST API endpoints without port conflicts:
1. **Extract `createAdminApp()`**:
   ```javascript
   export function createAdminApp() {
       const app = express();
       // ... configure middlewares, auth, and routes ...
       return app;
   }
   export function startAdminServer() {
       const app = createAdminApp();
       const PORT = process.env.ADMIN_PORT || 3000;
       return app.listen(PORT, () => {
           console.log(`🌐 [ADMIN WEB] Server running on http://localhost:${PORT}`);
       });
   }
   ```
2. **In-Memory Request Testing**:
   With `createAdminApp()` exported, test suites can invoke endpoints directly via `app.handle` or `supertest` / ephemeral listener without spawning live background network processes.

---

## 6. Recommended 4-Tier Testing Roadmap

```
┌────────────────────────────────────────────────────────┐
│  Tier 4: E2E Playwright Track                          │
│  - Full Admin SPA + Simulated Backend + Bot Workflows  │
├────────────────────────────────────────────────────────┤
│  Tier 3: Frontend Component & Virtualization Tests     │
│  - Vitest / React Testing Library / SVG Physics Math   │
├────────────────────────────────────────────────────────┤
│  Tier 2: Backend API & Contract Integration Tests      │
│  - Express In-Memory HTTP / Auth / CRUD / Endpoints    │
├────────────────────────────────────────────────────────┤
│  Tier 1: Fast Unit & Domain Logic Tests                │
│  - Node:test, Zero-IO, Math, Normalizers (< 100ms)    │
└────────────────────────────────────────────────────────┘
```

### Tier 1: Fast In-Process Unit & Domain Tests
- **Runner**: Native `node:test`.
- **Target**: Pure functions, mathematical formulas, memory normalizers, prompt builders, physics force calculations, virtual list index arithmetic.
- **Execution Target**: $< 1.0\text{ s}$ total.
- **Target Script**: `npm run test:unit`.

### Tier 2: Backend API & Contract Integration Tests
- **Runner**: Native `node:test` against `createAdminApp()`.
- **Target**:
  * Auth middleware (admin key validation).
  * `GET /api/admin/memory/graph/:userId` (node and edge schema compliance).
  * `GET /api/admin/conversations/:userId` (chat event history).
  * `GET /api/admin/channel/check-access` (R5 Telegram admin permission check).
  * `POST /api/admin/channel/publish` (R1 WYSIWYG preview photo consistency).
  * `GET /api/admin/providers/matrix` (R2 Model matrix health and capability routing).
- **Target Script**: `npm run test:api`.

### Tier 3: Frontend Component & Virtualization Tests
- **Runner**: `vitest` + `jsdom` + `@testing-library/react`.
- **Target**:
  * `MemoryGraph`: verifies SVG canvas rendering, node elements for facts/entities/retrievals, drag start/end events, zoom transform calculations.
  * `VirtualizedChatList`: verifies initial scroll anchoring, binary search windowing (only 15 DOM bubbles mounted for 500 items), dynamic height updates upon resize.
  * `ModelMatrix`: validates capability switches, provider priority order, fallback triggers.
- **Target Script**: `npm run admin:test`.

### Tier 4: End-to-End (E2E) Browser Track
- **Runner**: `@playwright/test`.
- **Target Workflows**:
  1. *CRM Workflow*: Navigate to `#crm` -> Select user from list -> Verify User Dossier opens -> Switch to `Memory Graph` tab -> Drag node -> Switch to `Chat` tab -> Scroll through 1,000 messages at 60 FPS -> Adjust text balance -> Verify success toast.
  2. *Channel Post Workflow*: Navigate to `#channel` -> Generate draft post with AI image -> Confirm preview image URL -> Click "Publish" -> Verify that exact preview image is sent without re-generating.
  3. *Model Matrix Workflow*: Navigate to `#providers` -> Switch Core Dialogue fallback -> Run diagnostic ping on Text-to-Image slot -> Verify live response indicator.
- **Target Script**: `npm run test:e2e`.

---

## 7. Next Steps & Implementation Guidelines for Implementers

1. **For Frontend Modularization (R3)**:
   - Extract CRM into `admin-v2/src/features/crm/` with dedicated components:
     * `CrmPanel.jsx` (main container and user list sidebar)
     * `MemoryGraph.jsx` (interactive force-directed canvas)
     * `VirtualizedChatList.jsx` (windowed message history)
     * `UserDossier.jsx` (balances, relationship, memory facts, payments)
2. **For Memory Graph Component (R4)**:
   - Place graph canvas styles in `admin-v2/src/feature-components.css` or scoped module.
   - Add markers for directed edges (`#arrow-supersedes`, `#arrow-mentions`, `#arrow-selected`).
   - Implement zoom/pan toolbar and node detail inspector drawer.
3. **For Backend Server (Testability)**:
   - Export `createAdminApp()` in `src/server.js` alongside `startAdminServer()`.
4. **For Build & Verification**:
   - Ensure `npm run admin:build` passes cleanly without Vite bundling errors.
   - Verify `npm test` runs with zero regressions on core domain tests.
