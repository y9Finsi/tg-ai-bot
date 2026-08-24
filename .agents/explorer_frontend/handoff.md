# Frontend Architecture Explorer Handoff Report

**Agent**: Frontend Architecture Explorer (`explorer_frontend`)  
**Target Milestone**: Frontend Modular Architecture & Refactoring Plan (R1–R5)  
**Date**: 2026-08-25T01:38:15+03:00

---

## 1. Observation

1. **Monolithic Entry Point**:
   - File: `admin-v2/src/main.jsx` (5,944 lines).
   - Contains all view components: `NeedsPanel`, `InventoryPanel`, `KanbanBoard`, `LlmPanel`, `AiSandboxPromptStudio`, `CrmPanel`, `ContentPanel`, `SystemPanel`, `LlmSettingsPanel`, `ImageGenerationTestPanel`, `MemoryGraph`, `RetrievalTrace`, `ConfirmAction`, `Progress`, `Toast`, `Login`, and `App`.
   - Single root state with hash-based view switcher (`adminViewFromHash`, lines 153–157, 5808–5818) supporting `['diary', 'dialogs', 'llm-settings', 'crm', 'content', 'inventory', 'system']`.

2. **Memory Graph Grid Implementation**:
   - Lines 90–123 in `admin-v2/src/main.jsx`.
   - Rigid 4x4 coordinate calculation:
     ```javascript
     const positions = Object.fromEntries(graph.nodes.map((node, index) => [String(node.id ?? node.key ?? index), {
         x: 92 + (index % 4) * 174,
         y: 54 + Math.floor(index / 4) * 96
     }]));
     ```
   - Lacks physics simulation, zooming, panning, node dragging, and inspectable links.

3. **CRM Chat History Rendering**:
   - Lines 4254–4271 in `admin-v2/src/main.jsx`.
   - Directly maps `(selectedUser.conversations || []).map(...)` into the DOM inside `.crm-chat-window` without virtualization or windowing.

4. **Image Upload Payload Handling**:
   - Lines 4535–4563 in `admin-v2/src/main.jsx` (`uploadPhotoFile`).
   - Reads raw file via `FileReader.readAsDataURL(file)` and sends full uncompressed Base64 string directly in JSON body to `POST /api/admin/photos/upload`.
   - No client-side compression or downscaling.

5. **AI Model Configuration & Settings**:
   - Lines 3635–3870 in `admin-v2/src/main.jsx` (`LlmSettingsPanel`), lines 3506–3634 (`ImageGenerationTestPanel`), lines 5091–5348 in `ContentPanel` (AI Image & Voice settings).
   - Model settings are fragmented across 3 separate panels instead of a unified matrix.

6. **Build System & Dependencies**:
   - Root `package.json` contains `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite` v7, `react` v19, `lucide-react`, `@radix-ui/react-*`, `@base-ui/react`.
   - Build script: `npm run admin:build` (`vite build --config admin-v2/vite.config.js`).
   - Build successfully compiles existing code into `public/admin-v2/` in ~1.2s.

---

## 2. Logic Chain

1. **Decomposition Necessity (R3)**:
   - Because 5,944 lines of disparate domains are co-located in `main.jsx`, any modification in prompt editing or channel settings risks un-scoped side effects and causes unnecessary full-tree re-renders.
   - Decomposing the codebase into 6 domain packages under `src/features/{channel, crm, studio, providers, content, simulation}` creates strict isolation boundaries, modular hooks, and clear ownership.

2. **Hash-Based SPA Routing & Tab Caching (R3)**:
   - Defining hash routes (`#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation`) with a keep-alive container (`style={{ display: activeRoute === '...' ? 'contents' : 'none' }}`) preserves user form drafts and scroll positions when navigating between tabs without full re-mounts.

3. **Model Matrix Centralization (R2)**:
   - Consolidating LLM Dialogue fallbacks, Style Classifier, AI Judge, Text-to-Image (with `/images/generations` vs `/chat/completions` protocol selector), Image-to-Image (with reference validation), and Voice TTS into `src/features/providers/components/ModelMatrixTable.jsx` provides a single unified interface with instant diagnostic ping checks.

4. **Physics-Based Memory Graph & Virtualized Chat (R4)**:
   - Replacing the static 4x4 coordinate formula with a velocity-Verlet / spring-force simulation loop on SVG elements provides physical node dragging, spring linkages, zoom, and pan without heavy external bundle dependencies.
   - Adding a windowed virtualization slice to the CRM chat view limits rendered DOM nodes to the visible viewport, ensuring smooth 60 FPS scrolling even with thousands of messages.

5. **Client-Side Image Compression & Channel Diagnostics (R5)**:
   - Intercepting image uploads with an HTML5 Canvas downscaler (`compressImage` in `src/lib/imageCompressor.js`) guarantees payloads remain $\le 2.5\text{ MB}$, completely preventing HTTP 413 Payload Too Large errors.
   - Integrating `GET /api/admin/channel/check-access` into the channel settings UI allows instant verification of bot posting permissions before publishing.

---

## 3. Caveats

1. **Backend Route Compatibility**:
   - The frontend assumes the backend provides `GET /api/admin/channel/check-access` (R5) and capability/protocol flags in image generation endpoints (R2).
2. **React 19 Compatibility**:
   - The project uses React 19. All custom hooks, force simulation refs, and virtualization logic must comply with standard React 19 concurrent and ref patterns.
3. **No Direct Code Modifications**:
   - In accordance with the Explorer archetype instructions, no source code in `admin-v2/src/` has been modified during this read-only investigation. All changes are documented in `report.md` for subsequent implementation.

---

## 4. Conclusion

1. The refactoring plan decomposes `admin-v2/src/main.jsx` (5,944 lines) into 6 modular feature packages (`channel`, `crm`, `studio`, `providers`, `content`, `simulation`) plus shared layout and common libraries.
2. Hash routing `#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation` with backward-compatibility aliases and keep-alive caching is fully specified.
3. The Model Matrix UI, Force-Directed Memory Graph, Virtualized Chat, Canvas Image Compression, and Channel Diagnostics have complete technical designs ready for implementation.
4. Full architectural details and file mappings are available in `.agents/explorer_frontend/report.md`.

---

## 5. Verification Method

1. **Inspect Architectural Report**:
   - View `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_frontend/report.md`.
2. **Verify Current Build Status**:
   - Run command: `npm run admin:build`
   - Expected result: Exit code 0, bundled assets output in `public/admin-v2/`.
3. **Post-Implementation Verification**:
   - Verify all 6 feature directories exist under `admin-v2/src/features/`.
   - Verify `admin-v2/src/main.jsx` is reduced to a concise entry point (<50 lines).
   - Execute `npm run admin:build` to confirm clean bundling without errors.
