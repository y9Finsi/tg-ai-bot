# BRIEFING — 2026-09-03T23:18:30+03:00

## Mission
Investigate 3D map rendering architecture for Petrogradka in the project to answer: implementation location/libraries, building/polygon/road definitions, procedural facade/road markings implementation strategy, and dependencies/performance/build setup.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_map_arch
- Original parent: 11ab2065-3f8a-42c2-9dc8-92714007234e
- Milestone: Petrogradka 3D Map Architecture Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do not modify project source code outside .agents/explorer_map_arch/
- Follow Handoff Protocol (5-Component Handoff Report)

## Current Parent
- Conversation ID: 11ab2065-3f8a-42c2-9dc8-92714007234e
- Updated: 2026-09-03T23:18:30+03:00

## Investigation State
- **Explored paths**:
  - `admin-linear/src/components/FullScreenMap.jsx`: active MapLibre GL 3D map component.
  - `admin-linear/src/lib/solarCalculator.js`: astronomical sun/shadow calculations for SPb (59.95°N, 30.31°E).
  - `admin-linear/src/lib/pedestrianData.js`: 10 citizens with sidewalk waypoints, Haversine interpolation, and bearings.
  - `admin-linear/src/lib/simulationConstants.js`: SPB_LOCATIONS, needs configs, task types.
  - `src/radiant/world_map.js`: backend location graph and travel times.
  - `scripts/test_maplibre.mjs`: headless Chrome CDP test runner with screenshot verification.
  - `deprecated/admin-v2/src/features/simulation/SpbMapWidget.jsx`: legacy Leaflet 2D widget.
  - `public/map.html`: public Leaflet 2D page.
- **Key findings**:
  - MapLibre GL v6.7.0 is active in `admin-linear`.
  - 3D buildings are currently rendered via a `fill-extrusion` layer with flat height-based interpolation colors; no facade textures or window lights exist yet.
  - `fill-extrusion-pattern` supports dynamic canvas textures registered via `map.addImage()`, enabling procedural classical St. Petersburg facades (rustication, windows, storefronts).
  - Road markings ("зебры", dividing lines) can be added as GeoJSON `line`/`fill` layers below `3d-buildings`.
  - 3D GTA-style characters, volumetric trees, and vehicles with headlights can be cleanly hosted in MapLibre via `CustomLayerInterface` using Three.js, with local coordinate space anchored at Petrogradka center `[30.3049, 59.9589]`.
  - Zero building collisions are guaranteed through sidewalk-constrained waypoints + 2D building footprint bounding box clamping.
  - Build setup `npm run admin:build` passes in 1.78s.
- **Unexplored areas**: None for the read-only exploration scope. All 4 target questions fully answered with live CDP verification.

## Key Decisions Made
- Confirmed MapLibre GL v6.7.0 is the foundational map engine in `admin-linear`.
- Recommended procedural Canvas 2D texture generation for `fill-extrusion-pattern` for buildings.
- Recommended Three.js via `CustomLayerInterface` for true 3D GTA humanoids, trees, and vehicles with headlights.
- Verified headless Chrome CDP test script (`scripts/test_maplibre.mjs`) as the golden test suite.

## Artifact Index
- DISPATCH.md — record of incoming dispatch messages
- BRIEFING.md — persistent working memory
- progress.md — liveness heartbeat
- handoff.md — final analysis and handoff report
