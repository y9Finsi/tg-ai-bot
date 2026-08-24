# Original User Request

## Initial Request — 2026-08-25T01:34:23+03:00

Полный рефакторинг админ-панели и модуля публикаций в Telegram-канал (ТГК) бота Леры: модульная декомпозиция фронтенда, устранение десинхронизации генерации/публикации AI-медиа, создание централизованной матрицы AI-провайдеров с валидацией эндпоинтов, внедрение интерактивного D3-графа памяти и оптимизация работы с медиа.

Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main
Integrity mode: development

## Requirements

### R1. TGK Publishing & WYSIWYG Photo Consistency
- Fix image desynchronization in channel post publishing: when a draft with a generated AI photo preview (preview_url / buffer) is published, send the exact previewed image to Telegram rather than triggering a random re-generation.
- Fix auto-posting cron scheduler: calculate daily post limits based on calendar day in Europe/Moscow (00:00 MSK) rather than a rolling 24-hour window. Remove artificial constraints on post frequency (Math.max(12)) and daily posts (Math.min(2)).
- Implement intelligent text adaptation in src/channel_content.js to prevent hard rejections on minor character limit overflows (up to 15-20%).

### R2. Centralized AI Model Matrix & Routing
- Centralize provider configuration and roles into a unified model matrix: Core Dialogue (LLM with ordered fallbacks), Style Classifier, Judge, Text-to-Image generator (with explicit protocol selector: /images/generations vs /chat/completions), Image-to-Image / Edit (/chat/completions with required reference verification), and Voice (TTS).
- Provide instant diagnostic health-checks for every model slot.

### R3. Frontend Modular Architecture & Hash Navigation
- Refactor the 6,000-line monolithic admin-v2/src/main.jsx into a clean, feature-driven directory structure (admin-v2/src/features/{channel, crm, studio, providers, content, simulation}).
- Implement a modern SPA sidebar layout with hash-based routing (#channel, #crm, #studio, #providers, #content, #simulation) where each tab operates as an isolated component with independent state and caching.

### R4. CRM & Interactive Force-Directed Memory Graph
- Replace the static 4x4 coordinate grid in MemoryGraph with an interactive, physical force-directed graph (D3 / SVG canvas) supporting zooming, panning, node dragging, and inspectable relationship edges.
- Virtualize user chat history scrolling in CRM cards to maintain 60 FPS performance during inspection of extensive message histories.

### R5. Media Optimization & Channel Permission Diagnostics
- Implement client-side image compression (HTML5 Canvas) before uploading to reduce file sizes to 2–3 MB, completely eliminating 413 Payload Too Large errors.
- Add an instant channel access validation endpoint (GET /api/admin/channel/check-access) and UI button to verify Telegram bot administrative permissions (can_post_messages) and display channel metadata before publishing.

## Acceptance Criteria

### Backend & Core Logic
- [ ] Publishing a post draft with a generated AI photo sends the exact previewed image directly to Telegram without triggering duplicate generation requests.
- [ ] Channel poster cron operates on calendar days (Europe/Moscow) and respects user-configured post frequency and daily limits without backend clamps.
- [ ] Text-to-image and image-edit providers route to the correct endpoints based on explicit capability/protocol flags, and edit models properly require reference images.
- [ ] GET /api/admin/channel/check-access accurately returns bot permissions and channel details.

### Frontend & UI Architecture
- [ ] Monolithic main.jsx is successfully decomposed into modular sub-packages under src/features/.
- [ ] Hash navigation seamlessly switches between #channel, #crm, #studio, #providers, #content, and #simulation without full-page re-renders.
- [ ] Model Matrix UI allows configuring, switching, and pinging all AI roles from a single interface.
- [ ] CRM Memory Graph renders real force-directed nodes with physics, zoom/pan, and draggable elements.
- [ ] Client-side image upload automatically resizes large images before sending to server.
- [ ] npm run admin:build passes without build or bundling errors.
