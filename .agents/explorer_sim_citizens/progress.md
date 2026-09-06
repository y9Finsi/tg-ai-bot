# Progress — Explorer Sim Citizens

Last visited: 2026-09-03T23:18:00+03:00

## Current Status
- [x] Initialized DISPATCH.md and BRIEFING.md
- [x] Investigated existing citizen / Lera simulation & rendering in codebase
  - Identified `admin-linear/src/components/FullScreenMap.jsx`, `admin-linear/src/lib/pedestrianData.js`, `admin-linear/src/lib/simulationConstants.js`
  - Explored backend Radiant engine in `src/radiant/` (`world_map.js`, `daily_routine.js`, `goap_planner.js`)
  - Identified that current pedestrians are 2D HTML/DOM markers animated via requestAnimationFrame along 4-5 hardcoded waypoints without 3D meshes, 3D rotation, or depth testing
- [x] Investigated navigation graph, sidewalks, crosswalks, and mathematical collision avoidance with 3D buildings
  - Formulated NavMesh / sidewalk-crosswalk topological graph by construction with zero-collision invariant
  - Designed dual-sidewalk corridor topology (Bolshoy, Kamennoostrovsky, Pushkarskaya, etc.) and crosswalk stripes
- [x] Investigated low-poly 3D GTA-style character hierarchy, procedural/mesh animation, and shadows in Three.js/WebGL
  - Designed hierarchical biped model (head, torso, counter-phase swinging arms, walking legs with knee flexion, directional 3D shadow, rotating plumbob for Lera)
  - Evaluated MapLibre CustomLayerInterface with Three.js (renderingMode: '3d') sharing the WebGL depth buffer for 3D building occlusion
- [ ] Synthesizing citizen schedules, social interactions (<15m), and speech bubbles
- [ ] Compiling comprehensive handoff.md following 5-component protocol
