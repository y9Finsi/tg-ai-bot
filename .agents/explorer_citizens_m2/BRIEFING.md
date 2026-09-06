# BRIEFING — 2026-09-04T04:05:00Z

## Mission
Investigate 3D character rendering (GTA/low-poly biped vs GLTF/GLB), sidewalk/crosswalk NavMesh collision avoidance with 3D buildings, and social AI logic for pedestrians & Lera in MapLibre/Three.js.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Read-only investigation, evidence chain analysis, synthesis, reporting
- Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_citizens_m2
- Original parent: e9fa19a5-92c0-4def-82f5-783ceed2094f
- Milestone: M2 Citizens & 3D Character Simulation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- GTA-style 3D characters (honest 3D low-poly biped meshes or GLTF/GLB with hierarchical joints, limbs walking kinematics, yaw rotation, 3D shadows) instead of 2.5D flat sprites
- Pedestrians must NOT pass through 3D building polygons under any circumstances (mathematical guarantee)
- Diurnal social routines, benches/storefront stops, proximity <15m interactions, speech bubbles, Sims plumbob over Lera

## Current Parent
- Conversation ID: e9fa19a5-92c0-4def-82f5-783ceed2094f
- Updated: 2026-09-04T04:03:35Z

## Investigation State
- **Explored paths**:
  - `admin-linear/src/lib/threePedestrianLayer.js`
  - `admin-linear/src/lib/pedestrianData.js`
  - `admin-linear/src/lib/roadMarkingsData.js`
  - `admin-linear/src/lib/simulationConstants.js`
  - `admin-linear/src/components/FullScreenMap.jsx`
  - 320 real OSM building footprints on Petrogradka (`/tmp/spb_buildings.json`)
- **Key findings**:
  1. Procedural GTA 3D low-poly biped in `threePedestrianLayer.js` is fully implemented with 12 joints, anti-phase gait, Sims Plumbob, and shared MapLibre depth buffer.
  2. User authorized downloading open GLTF/GLB models (Three.js, Kenney, Quaternius); recommended a dual-mode hybrid architecture (synchronous procedural biped default + asynchronous `GLTFLoader` upgrade).
  3. Every single citizen currently has 2 to 25 building collisions due to a ~250–380m latitude offset in `pedestrianData.js` pushing paths into residential tenement blocks. Formulated calibrated coordinates and 4-tier validation algorithm.
  4. Exactly 0 proximity greetings ever trigger because citizens walk on disjoint streets and Lera's home is >89m away from nearest waypoint. Hub routing and `simHour` theme binding required.
  5. Raycaster bug in `threePedestrianLayer.js:658` looks up static `waypoints[0]` instead of moving coordinates.
- **Unexplored areas**: All core mission items explored and documented.

## Key Decisions Made
- Recommending retention of procedural low-poly biped as zero-failure baseline with GLTFLoader hook.
- Provided mathematical formulation for point-in-polygon and edge clipping collision tests.
- Formulated calibrated coordinates for Bolshoy Prospekt sidewalks and Matveyevsky Garden.

## Artifact Index
- DISPATCH.md — Incoming assignments and updates
- BRIEFING.md — Persistent working memory
- progress.md — Status and task checklist
- report.md — Comprehensive report with math, empirical tests, and code fixes
- handoff.md — 5-component self-contained handoff report
