# Progress Heartbeat: worker_m2_citizens

Last visited: 2026-09-04T07:46:00+03:00
Status: Implementation & verification complete, writing handoff report

## Completed
- [x] Read DISPATCH.md, ORIGINAL_REQUEST.md, orch_3/PROJECT.md, explorer handoff & report.
- [x] Extracted real Petrogradka building geometries (1080 buildings in `/tmp/spb_buildings.json`) and OSM highway/footway topology.
- [x] Calibrated zero-collision NavMesh coordinates across Bolshoy, Kamennoostrovsky, Lenina, and Matveevsky Garden. Verified 0 building polygon collisions across all 10 citizens.
- [x] Implemented 4-tier collision verification engine in `admin-linear/src/lib/pedestrianData.js`.
- [x] Placed open GLB models (`lera.glb`, `citizen.glb`, `soldier.glb`, `xbot.glb`) in `admin-linear/public/models/`.
- [x] Implemented `admin-linear/src/lib/threePedestrianLayer.js`:
  - 12-joint low-poly GTA biped rig with directional contact ground shadow.
  - Rotating emerald Sims Plumbob octahedron above Lera (`config.isLera || config.id === 'lera' || spec.hasPlumbob`).
  - Procedural sinusoidal kinematics (walking locomotion, idle breathing & head look, greeting wave gesture).
  - Physical 3D storefronts with entrance canopies and astronomical night lighting glow («Слой», «ВкусВилл», Showroom).
  - Hybrid GLTFLoader hook with seamless procedural fallback.
  - Dynamic raycaster selection hitbox tracking `mesh.userData.currentCoords`.
  - Social AI greeting handler triggering `onSocialInteraction`.
- [x] Wrote comprehensive test suite `test/m2_pedestrians_navmesh.test.js` (22/22 tests passing).
- [x] Verified build: `npm run admin:build` passes with exit code 0.

## In Progress
- [ ] Write `handoff.md`.
- [ ] Send coordination message to parent.

