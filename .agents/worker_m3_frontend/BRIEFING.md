# BRIEFING — 2026-08-25T01:54:30+03:00

## Mission
Decompose the 5,944-line monolithic `admin-v2/src/main.jsx` into a modular, feature-driven directory structure with modern hash routing, keep-alive caching, clean components, and verified build/test suite.

## 🔒 My Identity
- Archetype: worker_m3_frontend
- Roles: implementer, qa, specialist
- Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m3_frontend
- Original parent: e7bb03f3-c240-4998-ac4e-4d04a5f79746
- Milestone: M3 (Frontend Modular Architecture & Hash Navigation Decomposition)

## 🔒 Key Constraints
- Decompose monolithic 5,944-line `admin-v2/src/main.jsx` into clean, feature-driven directory structure.
- Clean `admin-v2/src/main.jsx` (< 50 lines) to act solely as the React 19 root entry point mounting ErrorBoundary and App.
- Modern SPA sidebar layout with hash-based routing & keep-alive caching (#channel, #crm, #studio, #providers, #content, #simulation).
- Backward compatibility aliases: #diary, #dialogs, #llm-settings, #inventory, #system.
- Verify build with `npm run admin:build` and test suite.

## Current Parent
- Conversation ID: e7bb03f3-c240-4998-ac4e-4d04a5f79746
- Updated: 2026-08-25T01:54:30+03:00

## Task Summary
- **What to build**: 6 feature packages (`channel`, `crm`, `studio`, `providers`, `content`, `simulation`), 3 layout components, 5 UI components, 9 core utility/physics/compressor libraries, SPA router App.jsx, concise main.jsx.
- **Success criteria**: `npm run admin:build` passes with 0 errors, 125/125 frontend unit and contract tests pass.
- **Interface contracts**: PROJECT.md & ORIGINAL_REQUEST.md.

## Change Tracker
- **Files created/modified**:
  - `admin-v2/src/lib/` (`api.js`, `dateUtils.js`, `topicUtils.js`, `simulationUtils.js`, `helpers.js`, `imageCompressor.js`, `forceGraphPhysics.js`, `virtualizer.js`, `utils.js`)
  - `admin-v2/src/components/ui/` (`Toast.jsx`, `ProgressBar.jsx`, `ConfirmAction.jsx`, `Login.jsx`, `ErrorBoundary.jsx`)
  - `admin-v2/src/components/layout/` (`Sidebar.jsx`, `Header.jsx`, `AppLayout.jsx`)
  - `admin-v2/src/features/channel/` (`PromptAssemblyMap.jsx`, `ChannelTopicWeights.jsx`, `ChannelDiagnostics.jsx`, `ChannelSettings.jsx`, `ChannelCommentsConfig.jsx`, `ChannelDraftEditor.jsx`, `ChannelHistoryFeed.jsx`, `ChannelTab.jsx`, `index.jsx`)
  - `admin-v2/src/features/crm/` (`MemoryGraph.jsx`, `RetrievalTrace.jsx`, `VirtualizedChatList.jsx`, `UserBalanceManager.jsx`, `UserMemoryFacts.jsx`, `RelationshipEditor.jsx`, `UserList.jsx`, `PromocodesManager.jsx`, `BusinessMetrics.jsx`, `UserDetailsDrawer.jsx`, `CrmTab.jsx`, `index.jsx`)
  - `admin-v2/src/features/studio/` (`ProductionPromptModules.jsx`, `LeraProfileEditor.jsx`, `LeraJudgeSettings.jsx`, `CommentsPromptStudio.jsx`, `ActionsManager.jsx`, `SandboxPanel.jsx`, `LiveServerLogsTab.jsx`, `ErrorsAuditTab.jsx`, `SimulationRationaleTab.jsx`, `LlmPanel.jsx`, `StudioTab.jsx`, `index.jsx`)
  - `admin-v2/src/features/providers/` (`SlotHealthPing.jsx`, `ModelMatrixTable.jsx`, `ProviderChainManager.jsx`, `ImageGenSandbox.jsx`, `VoiceGenSandbox.jsx`, `ProvidersTab.jsx`, `index.jsx`)
  - `admin-v2/src/features/content/` (`PhotoThumbnail.jsx`, `PhotoMetaEditor.jsx`, `PhotoGallery.jsx`, `PhotoUploader.jsx`, `MasterReferenceManager.jsx`, `MediaCatalog.jsx`, `ContentSentJournal.jsx`, `ContentTab.jsx`, `index.jsx`)
  - `admin-v2/src/features/simulation/` (`DiaryHeader.jsx`, `ProfileCard.jsx`, `StatCard.jsx`, `NeedsPanel.jsx`, `CurrentDecision.jsx`, `KanbanBoard.jsx`, `TaskCard.jsx`, `DaySummary.jsx`, `Timeline.jsx`, `InventoryWidget.jsx`, `Commitments.jsx`, `SimulationLab.jsx`, `SimulationPanel.jsx`, `SimulationTab.jsx`, `index.jsx`)
  - `admin-v2/src/App.jsx`
  - `admin-v2/src/main.jsx`
- **Build status**: `npm run admin:build` PASS (1.48s).
- **Test status**: 125/125 PASS across 12 test suites.

## Loaded Skills
- **Source**: emil-design-eng, better-ui, better-layout
- **Core methodology**: Polish, responsive layout, fluid interactions, accessible contrasts, component boundaries.
