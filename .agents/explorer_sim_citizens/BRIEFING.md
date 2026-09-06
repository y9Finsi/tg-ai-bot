# BRIEFING — 2026-09-03T23:19:00+03:00

## Mission
Investigate citizen simulation and 3D character architecture (honest 3D low-poly models in GTA style, sidewalk navigation, collision avoidance, daily routines, social interactions) for Petrogradka map.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, investigator, analyst
- Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_sim_citizens/
- Original parent: 11ab2065-3f8a-42c2-9dc8-92714007234e
- Milestone: Petrogradka 3D Sims Transformation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Honest 3D models / low-poly 3D figures in GTA style (head, torso, animated limbs, 3D walking rotation, 3D shadows)
- Strict adherence to sidewalk/crosswalk geometry and building collision avoidance
- Follow Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method)

## Current Parent
- Conversation ID: 11ab2065-3f8a-42c2-9dc8-92714007234e
- Updated: 2026-09-03T23:19:00+03:00

## Investigation State
- **Explored paths**:
  - `admin-linear/src/components/FullScreenMap.jsx`: active MapLibre GL 3D component with DOM markers, 3d-buildings layer, and animation loop.
  - `admin-linear/src/lib/pedestrianData.js`: 10 citizen definitions, waypoints, Haversine distance, spherical bearing, and linear interpolation.
  - `admin-linear/src/lib/simulationConstants.js`: SPB_LOCATIONS, needs configs, task type mappings.
  - `src/radiant/world_map.js` & `daily_routine.js`: backend location graph and routine tasks for Lera.
  - `package.json` & `admin-linear/vite.config.js`: build setup, MapLibre v6.7.0, Vite 7.
  - `scripts/test_maplibre.mjs`: headless Chrome CDP test runner.
- **Key findings**:
  - Current citizens and Lera are rendered as 2D HTML/DOM markers overlays. No 3D meshes, no 3D yaw rotation, no depth buffer occlusion against 3D buildings.
  - Current navigation has NO topological sidewalk graph; each pedestrian has 4-5 private waypoints. Lera travels along a curved arc through buildings.
  - Zero building collisions can be mathematically guaranteed by constructing a dual-sidewalk + crosswalk NavMesh graph where every edge is guaranteed disjoint from building polygons ($\operatorname{Seg}(u,v) \cap \mathcal{B}_\delta = \emptyset$).
  - Low-poly 3D GTA characters (hierarchical mesh: head, body, anti-phase arms, flexing legs, rotating plumbob, directional shadow) are best implemented via a MapLibre `CustomLayerInterface` (`renderingMode: '3d'`) using Three.js with local coordinate space anchored at Petrogradka.
  - Social interactions (<15m) require an $O(N^2)$ proximity detector, greeting state transitions, and context-aware dialogue bubbles rendered as screen-projected Linear-styled overlays.
- **Unexplored areas**: None for read-only exploration scope. All 4 target questions answered with exact code and math specifications.

## Key Decisions Made
- Recommended Three.js custom WebGL layer in MapLibre for 3D characters, aligning with peer explorer `explorer_map_arch`.
- Recommended NavMesh graph by construction with Jordan Curve PIP validation for zero building collisions.
- Designed complete procedural kinematic walk cycle and social proximity engine (<15m).

## Artifact Index
- DISPATCH.md — Dispatch logs
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Final investigation report
