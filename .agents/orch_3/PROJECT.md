# Project: Petrogradka 3D Sims/GTA Simulator Transformation

## Architecture
- **Rendering Foundation**: MapLibre GL v6.7.0 (`FullScreenMap.jsx`) with Sims perspective (pitch: 50°, bearing: -15°), astronomical SPb solar engine (`solarCalculator.js`), and MapLibre `CustomLayerInterface` (`renderingMode: '3d'`) hosting Three.js scenes anchored at Petrogradka Center `[30.3080, 59.9590]` (1 unit = 1 meter).
- **Architectural Facades & Roofs**: High-resolution Classicist atlas (`facadeTextureGenerator.js`) with `pixelRatio = 32/64` calibrated to building elevation (16m), eliminating blurriness. Dedicated `3d-buildings-roof` extrusion layer (+0.12m elevation) textured with seamed tin roof (`spb-roof-day/sunset/night`) eliminating window bleed onto roofs. Authentic granite rustication, ochre plaster, profiled mouldings, and warm 2700K night window glow with curtains/plants.
- **Physical 3D Storefronts & Road Markings**: «Слой», «ВкусВилл», and Showroom rendered as physical 3D storefronts at their exact GPS coordinates via Three.js. Road network with dashed centerlines and zebra crosswalks under building layers.
- **GTA-Style 3D Characters**: Low-poly 3D biped hierarchy (Head, Torso, Left/Right Arms, Left/Right Legs with knee joints, directional 3D shadow, rotating Plumbob for Lera) with procedural sinusoidal walking kinematics, 3D heading yaw rotation, and shared WebGL depth buffer occlusion against 3D buildings. Hybrid loader supporting open GLTF/GLB models from `admin-linear/public/models/`.
- **Zero-Collision Sidewalk NavMesh**: Topological graph strictly calibrated to sidewalks and crosswalks. Mathematical 4-tier validation (AABB pre-filter, Jordan ray-casting point-in-polygon, segment edge intersection, clearance buffer) guaranteeing zero penetration into building polygons.
- **Social AI & Diurnal Routines**: Schedule transitions based on `simHour` and map theme, routing citizens through 4 shared social hubs (Cafe Sloy, Austrian Sq, Matveevsky Garden) to trigger proximity greetings (<15m) and Linear UI speech bubbles. Dynamic raycaster selection on `currentCoords`.
- **City Environment & Vegetation**: Procedural Lindens, Birches, Maples, and Lilac bushes in Matveevsky Garden, Skver Nizami, and Skver Popova rendered via `THREE.InstancedMesh` with vertex-shader wind sway ($y^{1.6}$ curve) and ground contact shadows (6 draw calls for 180+ instances).
- **Dynamic Traffic & Headlights**: Vehicles (yellow SPb taxi, monochrome sedans, azure blue bus) on Bolshoy and Kamennoostrovsky splines with IDM car-following anti-collision logic and dusk/night forward headlight cones.
- **Street Lighting**: 162 cast-iron lantern posts with instanced downward volumetric cones (sodium 2700K) and sidewalk illumination pools activating at dusk/night.
- **Design System & UI Polish**: Linear design principles (#08090a monochrome, concentric radii, active:scale-[0.96], Citizen Inspector card, 25-30+ FPS WebGL throttling).
- **Verification**: Headless Chrome CDP automation (`test_sims_3d.mjs`), building collision audit, and `npm run admin:build` exit 0.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | High-Resolution Facade Atlases | Razor-sharp textures with pixelRatio=32/64, rustication, mouldings, cornices | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Dedicated Seamed Tin Roof Layer | `3d-buildings-roof` layer (+12cm) with tin sheet texture, no roof bleed | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Physical 3D Storefronts | «Слой», «ВкусВилл», Showroom at exact GPS coordinates with night glow | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Day/Sunset/Night Window Glow | Warm 2700K incandescent illumination with curtain and plant silhouettes | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Road Markings & Zebras | Dividing centerlines and zebra crosswalks under buildings | M1 | ORIGINAL_REQUEST §R1 |
| 6 | GTA-Style 3D Humanoids | Low-poly 3D biped meshes with head, torso, limbs in Three.js | M2 | Follow-up 2026-09-03 |
| 7 | Procedural Walk Kinematics | Anti-phase arm/leg swings, knee flexion, pelvis bob, 3D yaw | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Shared Depth Occlusion | WebGL depth buffer occlusion when walking behind 3D buildings | M2 | Follow-up 2026-09-03 |
| 9 | Zero-Collision Sidewalk NavMesh | Calibrated graph with 4-tier validation guaranteeing 0 building collisions | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Diurnal Routines & Idle Stops | Schedules + storefront / bench pauses | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Social Proximity AI (<15m) | Social hubs, wave gestures, Linear speech bubbles, dynamic raycasting | M2 | ORIGINAL_REQUEST §R2 |
| 12 | 3D Trees & Bushes | Instanced meshes in Matveevsky, Nizami, Popov with wind sway | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Dynamic Vehicle Traffic | Taxis, sedans, azure bus on Bolshoy & Kamennoostrovsky with IDM physics | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Headlight Illumination Cones | Vehicle forward beams activating at sunset/night | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Street Lantern Posts & Cones | 162 cast-iron lamps with warm downward light cones at night | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Reactive Environment State | Centralized bridge for sun elevation, weather, and shaders | M3 | ORIGINAL_REQUEST §R3 |
| 17 | Linear UI Polish & Radii | Concentric radii, #08090a, active:scale-[0.96], HUD/Inspector | M4 | ORIGINAL_REQUEST §R4 |
| 18 | Chrome CDP E2E Automation | Automated headless test verifying canvas, lights, interaction | M5 | ORIGINAL_REQUEST §R5 |
| 19 | Building Collision Audit | Automated point-in-polygon test confirming zero building entry | M5 | ORIGINAL_REQUEST §R5 |
| 20 | Build Validation | npm run admin:build clean code 0 | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | High-Quality Facades & Road Network | Scale fix (pixelRatio=32), dedicated tin roof layer, physical storefronts, PBR atlas, zebras | none | DONE |
| M2 | GTA 3D Characters & Zero-Collision NavMesh | 3D biped meshes, walk cycle, calibrated NavMesh (0 building collision), social AI hubs, raycaster fix | M1 | IN_PROGRESS |
| M3 | City Environment & Dynamic Traffic | Instanced 3D trees with wind sway, vehicles with night headlights, 162 street lamps | M1 | PLANNED |
| M4 | Linear UI Polish & Performance | Linear #08090a monochrome, concentric radii, inspector card, 25-30 FPS WebGL throttling | M2, M3 | PLANNED |
| M5 | E2E Testing & CDP Verification | Full headless CDP test suite `test_sims_3d.mjs`, collision audit, `npm run admin:build` exit 0 | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### M1 ↔ MapLibre GL (`admin-linear/src/lib/facadeTextureGenerator.js`, `FullScreenMap.jsx`)
- `registerAllFacadePatterns(map)`: registers `spb-facade-day`, `spb-facade-sunset`, `spb-facade-night` with `pixelRatio: 32`
- `registerAllRoofPatterns(map)`: registers `spb-roof-day`, `spb-roof-sunset`, `spb-roof-night` with `pixelRatio: 32`
- Layer `'3d-buildings'` textured with `fill-extrusion-pattern: 'spb-facade-{theme}'`
- Layer `'3d-buildings-roof'` elevated by +0.12m with `fill-extrusion-pattern: 'spb-roof-{theme}'`

### M2 ↔ Three.js Pedestrian Layer (`admin-linear/src/lib/pedestrianData.js`, `threePedestrianLayer.js`)
- `SIDEWALK_NAVMESH_GRAPH`: strictly calibrated sidewalk nodes and edges with zero building polygon overlap
- `createGtaCharacterMesh(config)`: returns `THREE.Group` with 12-joint biped hierarchy, directional shadow, Sims plumbob
- `updateGtaCharacterAnimation(group, phase, speed, yaw, isGreeting)`: procedural kinematics
- `onSocialInteraction(charA, charB, dialogue)`: event emitter for Linear speech bubbles
- Raycaster uses `mesh.userData.currentCoords`

### M3 ↔ City Environment (`admin-linear/src/lib/cityEnvironmentData.js`, `cityEnvironmentLayer.js`)
- `PARK_ZONES`: Matveevsky Garden, Skver Nizami, Skver Popova boundary polygons
- `ROAD_CORRIDORS`: Bolshoy and Kamennoostrovsky avenue splines
- `CityEnvironmentLayer`: Three.js custom layer with `THREE.InstancedMesh` trees (wind sway shader), vehicles (IDM movement + night headlights), and 162 street lamps
- `updateEnvironmentLighting(sunData, weatherData)`: synchronized night mode transitions

### M5 ↔ E2E Testing (`scripts/test_sims_3d.mjs`)
- Runs Chrome CDP headless against Vite dev server
- Validates WebGL context, building collision avoidance, night lights, UI interactions, and production build

## Code Layout
- `admin-linear/src/lib/facadeTextureGenerator.js`: High-res PBR/Hi-DPI facade atlas and roof pattern generator
- `admin-linear/src/lib/roadMarkingsData.js`: GeoJSON features for centerlines and crosswalk zebras
- `admin-linear/src/lib/pedestrianData.js`: Calibrated zero-collision sidewalk NavMesh, citizen schedules, and social hubs
- `admin-linear/src/lib/threePedestrianLayer.js`: MapLibre CustomLayerInterface for GTA 3D characters, walk animation, physical storefronts
- `admin-linear/src/lib/cityEnvironmentData.js`: Park coordinates, tree placements, road splines, lamp coordinates
- `admin-linear/src/lib/cityEnvironmentLayer.js`: Three.js custom layer for instanced trees, traffic, and street lamps
- `admin-linear/src/components/FullScreenMap.jsx`: Master integration component
- `scripts/test_sims_3d.mjs`: E2E Chrome CDP verification runner
- `test/m1_facades_road_network.test.js`: Milestone 1 unit & regression tests
- `test/m2_pedestrians_navmesh.test.js`: Milestone 2 NavMesh and character tests
