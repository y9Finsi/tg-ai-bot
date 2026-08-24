## 2026-08-25T01:40:43+03:00
You are the Frontend Worker for Milestone M3 (Frontend Modular Architecture & Hash Navigation Decomposition).
Your working directory is: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m3_frontend
Project root: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Authoritative request: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/ORIGINAL_REQUEST.md
Reference report: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_frontend/report.md
Scope document: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/orch_1/PROJECT.md

Scope & Tasks:
1. Decompose the 5,944-line monolithic `admin-v2/src/main.jsx` into a clean, feature-driven directory structure:
   - `admin-v2/src/components/layout/` (`Sidebar.jsx`, `Header.jsx`, `AppLayout.jsx`)
   - `admin-v2/src/components/ui/` (`Toast.jsx`, `Modal.jsx`, `ConfirmModal.jsx`, etc.)
   - `admin-v2/src/features/channel/` (`ChannelTab.jsx`, `PostEditor.jsx`, `DraftList.jsx`, `ChannelDiagnostics.jsx`)
   - `admin-v2/src/features/crm/` (`CrmTab.jsx`, `UserDetailsDrawer.jsx`, `MemoryGraph.jsx`, `VirtualizedChatList.jsx`)
   - `admin-v2/src/features/studio/` (`StudioTab.jsx`, `PromptEditor.jsx`, `Sandbox.jsx`)
   - `admin-v2/src/features/providers/` (`ProvidersTab.jsx`, `ModelMatrixTable.jsx`, `HealthCheckButton.jsx`)
   - `admin-v2/src/features/content/` (`ContentTab.jsx`, `MediaUploader.jsx`)
   - `admin-v2/src/features/simulation/` (`SimulationTab.jsx`, `SimulationPanel.jsx`)
   - `admin-v2/src/lib/` (API client, helpers, `imageCompressor.js`, `forceGraphPhysics.js`, `virtualizer.js`)
   - `admin-v2/src/App.jsx` (Root SPA container)
   - `admin-v2/src/main.jsx` (Clean React 19 entry point < 50 lines)
2. Implement modern SPA sidebar layout with hash-based routing (`#channel`, `#crm`, `#studio`, `#providers`, `#content`, `#simulation`) with backward compatibility aliases (`#diary`, `#dialogs`, `#llm-settings`, `#inventory`, `#system`) and keep-alive caching.
3. Ensure all imports, styles (Tailwind v4), icons (`lucide-react`), and component exports are properly linked.
4. Run `npm run admin:build` and verify that the build passes with 0 errors.
5. Write your handoff report to /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m3_frontend/handoff.md.
6. When done, send a message to orchestrator.
