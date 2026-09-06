# BRIEFING — 2026-09-04T07:16:30+03:00

## Mission
Implement Milestone M2: GTA 3D Characters, Zero-Collision Sidewalk NavMesh, and Social AI on Petrogradka for tg-ai-bot companion map.

## 🔒 My Identity
- Archetype: worker_m2_citizens
- Roles: implementer, qa, specialist
- Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m2_citizens
- Original parent: e9fa19a5-92c0-4def-82f5-783ceed2094f
- Milestone: M2 (GTA 3D Characters, Zero-Collision NavMesh & Social AI)

## 🔒 Key Constraints
- Exclusive write ownership:
  * `admin-linear/src/lib/threePedestrianLayer.js`
  * `admin-linear/src/lib/pedestrianData.js`
  * `admin-linear/public/models/`
  * `test/m2_pedestrians_navmesh.test.js`
- Do NOT cheat. All implementations genuine, no hardcoded test shortcuts.
- Minimal change principle on external files (stay within ownership).
- Communication: use send_message to notify parent; long reports go to handoff.md.
- Build verification: `npm run admin:build` exit code 0, `node --test test/m2_pedestrians_navmesh.test.js` exit code 0.

## Current Parent
- Conversation ID: e9fa19a5-92c0-4def-82f5-783ceed2094f
- Updated: not yet

## Task Summary
- **What to build**:
  1. Low-poly 3D biped hierarchy (head, torso, limbs, knee flexion, pelvis bob, yaw, shadow, emerald Sims plumbob for Lera, hybrid GLTF/GLB loader with procedural fallback).
  2. Zero-collision Sidewalk NavMesh: calibrate waypoints on Bolshoy, Kamennoostrovsky, Lenina, Matveevsky Garden; 4-tier collision verification algorithm against Petrogradka buildings.
  3. Social AI & proximity interactions (<15m triggers wave + dialogue via onSocialInteraction; diurnal schedules around 4 hubs: Cafe Sloy, Austrian Sq, Matveevsky Garden, Skver Nizami).
  4. Fix raycaster hitbox to dynamic `mesh.userData.currentCoords`.
  5. Physical 3D storefront integration (entrance markers/canopies at physical GPS for Sloy, VkusVill, Showroom with night glow).
  6. Comprehensive test suite in `test/m2_pedestrians_navmesh.test.js` and build verification.
- **Success criteria**:
  - `npm run admin:build` passes cleanly
  - `node --test test/m2_pedestrians_navmesh.test.js` passes cleanly
  - Zero building collisions across all 10 citizens
  - Dynamic raycast selection works
  - 3D models and kinematics with plumbob and physical storefronts
- **Interface contracts**: orch_3/PROJECT.md § Interface Contracts (M2)

## Key Decisions Made
- Use procedural low-poly 3D biped as instant fallback, with GLTFLoader hook for public/models/*.glb.
- Exact sidewalk coordinate calibration according to Petrogradka map geometry.
- 4-tier geometric collision audit module implemented in pedestrianData.js and tested thoroughly.
- Dynamic hitbox tracking stored in mesh.userData.currentCoords and read by raycastCharacter.

## Change Tracker
- **admin-linear/src/lib/pedestrianData.js**: Zero-collision sidewalk NavMesh calibration, 4-tier collision verification engine (AABB, PIP, Segment-Polygon, Clearance Buffer >= 0.8m), 161 Petrogradka building footprints, diurnal routines, 4 social hubs, proximity detection (<15m) and dialogue triggering.
- **admin-linear/src/lib/threePedestrianLayer.js**: Low-poly GTA 3D biped hierarchy (12 joints), rotating emerald Sims Plumbob octahedron for Lera, procedural sinusoidal walking kinematics, greeting wave animation, physical 3D storefronts with night glow, dynamic raycasting tracking currentCoords, hybrid GLTF hook.
- **admin-linear/public/models/**: Placed `lera.glb`, `citizen.glb`, `soldier.glb`, `xbot.glb`.
- **test/m2_pedestrians_navmesh.test.js**: 22 unit & integration tests covering all requirements.

## Quality Status
- **Build/test result**: All 22 tests passing in `test/m2_pedestrians_navmesh.test.js`. `npm run admin:build` passes cleanly (exit code 0, 13.3s).
- **Collisions**: 0 building collisions across all 10 citizens and all NavMesh graph edges.
- **Lint/Syntax**: 0 errors, pure ESM compliant.

## Artifact Index
- `.agents/worker_m2_citizens/DISPATCH.md` — assignment
- `.agents/worker_m2_citizens/BRIEFING.md` — working memory
- `.agents/worker_m2_citizens/progress.md` — liveness heartbeat
- `.agents/worker_m2_citizens/handoff.md` — handoff report
- `admin-linear/src/lib/threePedestrianLayer.js` — Three.js custom layer for pedestrians and storefronts
- `admin-linear/src/lib/pedestrianData.js` — NavMesh, schedules, collision math, social AI
- `admin-linear/public/models/` — GLB model assets
- `test/m2_pedestrians_navmesh.test.js` — test suite

