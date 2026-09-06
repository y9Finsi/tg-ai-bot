# Project: Petrogradka 3D Sims/GTA Simulator Transformation

## Architecture
- **Rendering Foundation**: MapLibre GL v6.7.0 (`FullScreenMap.jsx`) with Sims perspective (pitch: 50°, bearing: -15°), astronomical SPb lighting engine (`solarCalculator.js`), and MapLibre `CustomLayerInterface` (`renderingMode: '3d'`) hosting a Three.js scene anchored at Petrogradka Center `[30.3080, 59.9590]` (1 unit = 1 meter).
- **Procedural Facades**: Dynamic 512x512 HTML5 Canvas generator (`facadeTextureGenerator.js`) providing `fill-extrusion-pattern` textures: rusticated ground floor, illuminated storefronts («Слой», «ВкусВилл», showroom), classical mouldings/cornices, and day/sunset/night window lighting (~65% amber night glow).
- **Road Network**: GeoJSON vector layers under buildings with dashed dividing lines and crosswalk («зебра») striping at major intersections.
- **GTA-Style 3D Characters**: Low-poly 3D biped hierarchy (Head, Torso, Left/Right Arms, Left/Right Legs with knee joints, directional 3D shadow, rotating Plumbob for Lera) with procedural sinusoidal walking kinematics, 3D heading yaw rotation, and shared WebGL depth buffer occlusion against 3D buildings.
- **Zero-Collision Sidewalk NavMesh**: Topological graph $G = (V, E)$ strictly constrained to sidewalks and crosswalks where $\operatorname{Seg}(u, v) \cap \mathcal{B}_\delta = \emptyset$.
- **Social AI & Diurnal Routines**: 3-state autonomous agent model (`WALKING`, `IDLE_STOP` at storefronts/benches, `GREETING`), time-of-day schedules, spatial proximity engine (<15m) triggering wave gestures and Linear UI speech bubbles.
- **City Environment & Vegetation**: Procedural Linden, Birch, Maple, and Lilac bushes in Matveevsky Garden, Skver Nizami, and Skver Popova rendered via `THREE.InstancedMesh` with vertex-shader wind sway and astronomical ground shadows.
- **Dynamic Traffic**: Moving vehicles (yellow SPb taxi, monochrome sedans, azure blue city bus) along Bolshoy and Kamennoostrovsky avenues with IDM car-following physics and dusk/night forward headlight cones.
- **Street Lighting**: 162 cast-iron lantern posts with instanced volumetric warm light cones (2700K sodium) activating at dusk/night.
- **Design System & UI Polish**: Linear design principles (#08090a monochrome, concentric radii, active:scale-[0.96], typography, 25-30 FPS WebGL throttling).
- **Verification**: Chrome CDP automated testing, building collision validation, and `npm run admin:build` exit 0.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Procedural Facade Textures | 512x512 Canvas generator with rustication, cornices, window rhythm | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Illuminated Storefronts | «Слой», «ВкусВилл», showroom with branded colors & night glow | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Day/Night Window Lighting | Amber glowing windows at dusk/night (~65% lit, 35% dark) | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Road Markings & Zebras | GeoJSON dividing lines & crosswalk stripes under buildings | M1 | ORIGINAL_REQUEST §R1 |
| 5 | GTA-Style 3D Humanoids | Low-poly 3D biped meshes with head, torso, limbs in Three.js | M2 | Follow-up 2026-09-03 |
| 6 | Procedural Walk Kinematics | Anti-phase arm/leg swings, knee flexion, pelvis bob, 3D yaw | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Shared Depth Occlusion | WebGL depth buffer occlusion when walking behind 3D buildings | M2 | Follow-up 2026-09-03 |
| 8 | Zero-Collision Sidewalk Graph | NavMesh $G = (V, E)$ strictly on sidewalks avoiding buildings | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Diurnal Routines & Idle Stops | Schedules + storefront / bench pauses | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Social Proximity AI (<15m) | Spatial proximity detection, wave gestures, Linear speech bubbles | M2 | ORIGINAL_REQUEST §R2 |
| 11 | 3D Trees & Bushes | Instanced meshes in Matveevsky, Nizami, Popov with wind sway | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Dynamic Vehicle Traffic | Taxis, sedans, azure bus on Bolshoy & Kamennoostrovsky | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Headlight Illumination Cones | Vehicle forward beams activating at sunset/night | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Street Lantern Posts & Cones | 162 cast-iron lamps with warm downward light cones at night | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Reactive Environment State | Centralized bridge for sun elevation, weather, and shaders | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Linear UI Polish & Radii | Concentric radii, #08090a, active:scale-[0.96], HUD/Inspector | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Chrome CDP E2E Automation | Automated headless test verifying canvas, lights, interaction | M5 | ORIGINAL_REQUEST §R5 |
| 18 | Building Collision Audit | Automated point-in-polygon test confirming zero building entry | M5 | ORIGINAL_REQUEST §R5 |
| 19 | Build Validation | npm run admin:build clean code 0 | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Facades & Road Network | Procedural facade textures with windows & storefronts, road markings & zebras | none | DONE |
| M2 | GTA 3D Characters & Social AI | Three.js low-poly biped models, walk kinematics, sidewalk NavMesh, social AI | M1 | PLANNED |
| M3 | City Environment & Traffic | 3D trees/bushes in parks, vehicle traffic with headlights, street lamps | M1 | PLANNED |
| M4 | Design Polish & Performance | Linear palette #08090a, concentric radii, inspector card, 25-30 FPS | M2, M3 | PLANNED |
| M5 | E2E Testing & CDP Verification | CDP test suite, building collision test, build verification | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### M1 ↔ M2, M3 (`admin-linear/src/lib/facadeTextureGenerator.js`)
- `generateSpbFacadePattern(theme)`: returns `{ canvas, id: 'spb-facade-' + theme }`
- Used by MapLibre layer `3d-buildings` via `fill-extrusion-pattern`
- Road markings added via GeoJSON source `'spb-road-markings'`

### M2 ↔ Three.js Scene (`admin-linear/src/lib/pedestrianData.js`, `threePedestrianLayer.js`)
- Exports `SIDEWALK_NAVMESH_GRAPH` with verified nodes and edges avoiding buildings
- Exports `createGtaCharacterMesh(characterConfig)`: returns `THREE.Group` with hierarchical bones/pivots
- `updateGtaCharacterAnimation(group, phase, speed, yaw, isGreeting)`: updates arm/leg/knee rotations and pelvis bob
- Proximity event callback: `onSocialInteraction(charA, charB, dialogue)` triggering speech bubble in UI

### M3 ↔ City Environment (`admin-linear/src/lib/cityEnvironmentData.js`, `cityEnvironmentLayer.js`)
- Exports `PARK_ZONES`: Matveevsky Garden, Skver Nizami, Skver Popova boundary polygons
- Exports `ROAD_CORRIDORS`: Bolshoy and Kamennoostrovsky splines with lane offsets
- `updateEnvironmentLighting(sunData, weatherData)`: updates instanced street lamp cones, vehicle headlights, and tree sway uniform `uTime`

### Code Layout
- `admin-linear/src/lib/facadeTextureGenerator.js`: Procedural canvas facade and storefront texture builder
- `admin-linear/src/lib/roadMarkingsData.js`: GeoJSON features for centerlines and crosswalk zebras
- `admin-linear/src/lib/threePedestrianLayer.js`: MapLibre CustomLayerInterface for low-poly GTA 3D characters
- `admin-linear/src/lib/cityEnvironmentData.js`: Park polygons, tree coordinates, lamp coordinates, road splines
- `admin-linear/src/lib/cityEnvironmentLayer.js`: Three.js custom layer for instanced trees, traffic, and street lamps
- `admin-linear/src/components/FullScreenMap.jsx`: Integration into main map view
- `scripts/test_sims_3d.mjs`: Automated Chrome CDP verification script
