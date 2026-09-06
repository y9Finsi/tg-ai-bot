# Technical Investigation Report: City Environment, Traffic Simulation, Street Lighting & E2E CDP Testing

**Author**: `explorer_env_m3` (Teamwork Explorer Agent)  
**Date**: 2026-09-04  
**Project**: `tg-ai-bot` / `admin-linear`  
**Milestone**: M3 (City Environment, 3D Trees, Dynamic Traffic & Lighting) & M5 (E2E Verification)  
**Location**: Saint Petersburg, Petrogradskaya Side (Петроградская сторона)  

---

## 1. Executive Summary

This investigation establishes the complete technical blueprint for transforming the 3D map of Petrogradskaya Storona into a living, high-performance city simulation (The Sims / GTA world design). It addresses three foundational systems:
1. **Botanical Environment & Swaying 3D Vegetation**: Realistic low-poly trees (Petersburg Lindens, Silver Birches, Autumn Maples) and lilac/hedge bushes in Matveevsky Garden, Skver Nizami, Skver Popova, and boulevards. Rendered via `THREE.InstancedMesh` with vertex-shader wind sway and astronomical directional ground shadows.
2. **Dynamic Vehicle Traffic & Night Headlights**: Multi-lane vehicle flows along Bolshoy Prospekt and Kamennoostrovsky Prospekt featuring yellow St. Petersburg taxis (Яндекс Go with amber roof sign), private sedans (Petersburg monochrome palette), and the signature azure blue city bus («Лазурный автобус СПб»). Includes IDM car-following anti-collision logic and forward headlight volumetric light cones activating during sunset/night.
3. **Cast-Iron Street Lanterns & Warm Sidewalk Illumination**: 162 historical 19th-century cast-iron street lamps along avenue curbs and park promenades casting warm amber downward volumetric light cones (2700K sodium) and sidewalk illumination pools.
4. **E2E Automation & Chrome CDP Verification**: Headless Chrome testing suite (`scripts/test_sims_3d.mjs`) verifying zero building collision in pedestrian/vehicle graphs, night headlight/lamp activation, UI interaction with concentric radii, and `npm run admin:build` exit 0.

---

## 2. Codebase Baseline & Existing Infrastructure

### 2.1 File Inventory Analysis
- **`admin-linear/src/lib/cityEnvironmentLayer.js`**: Does not exist yet. Needs to be created as a MapLibre `CustomLayerInterface` (`renderingMode: '3d'`).
- **`admin-linear/src/lib/cityEnvironmentData.js`**: Does not exist yet. Needs to be created to supply park boundary polygons, tree positions, street lamp coordinates, and vehicle spline paths.
- **`admin-linear/src/components/FullScreenMap.jsx`**:
  - Currently 1,268 lines.
  - MapLibre GL map instance configured at `pitch: 50` (Sims 50° camera angle) and `bearing: -15` (isometric view).
  - Already hosts `3d-buildings` layer with dynamic `fill-extrusion-pattern` (`spb-facade-day`, `spb-facade-sunset`, `spb-facade-night`).
  - Already hosts `road-dividing-lines`, `road-crosswalk-stripes` (zebra polygons), and `road-crosswalk-lines`.
  - Mounts `threePedestrianLayer.js` as layer `3d-pedestrians`.
  - Centralized sun calculator (`solarCalculator.js`) drives directional lighting and astronomical ground shadows.
- **`admin-linear/src/lib/threePedestrianLayer.js`**:
  - Implements MapLibre `CustomLayerInterface` anchored at Petrogradka Center `[30.3080, 59.9590]`.
  - Demonstrates Mercator transform matrix projection: local meters `[x, y, z]` mapped into MapLibre projection matrix via `camera.projectionMatrix = projMat.multiply(transformMatrix)`.
  - Calls `renderer.resetState()` on each frame to maintain WebGL context harmony with MapLibre GL.
- **`scripts/test_sims_3d.mjs`**:
  - Does not exist yet.
  - Existing scripts `scripts/test_m1_cdp.mjs` and `scripts/test_m1_empirical_challenger.mjs` demonstrate successful WebSocket CDP communication with Google Chrome headless on port 9335/9340, verifying MapLibre canvas, WebGL context status, layer ordering, and capturing screenshots.
- **`package.json`**:
  - Root package includes `three: "^0.185.1"`, `maplibre-gl: "^6.7.0"`, `lucide-react: "^0.468.0"`, `vite: "^7.1.12"`, `@tailwindcss/vite: "^4.3.3"`.
  - Build command `npm run admin:build` successfully builds `admin-linear` in under 2 seconds.

---

## 3. Exact Geographic Geometries & Spatial Anchors

All coordinates use WGS84 `[longitude, latitude]` with standard Web Mercator conversion. Local Three.js coordinates are anchored at **Petrogradka Center**: `[30.3080, 59.9590]` where $1\text{ unit} = 1\text{ meter}$.

```
Three.js X = East (meters)
Three.js Y = Altitude / Height Up (meters)
Three.js Z = South (meters)
```

### 3.1 Park Boundaries & Botanical Capacity

1. **Matveevsky Garden (Матвеевский сад / сквер)**
   - **Anchor**: `[30.3080, 59.9589]` (between Bolshoy Pr. and Bolshaya Pushkarskaya)
   - **Boundary Polygon**:
     ```json
     [
       [30.3068, 59.9581],
       [30.3095, 59.9587],
       [30.3089, 59.9598],
       [30.3063, 59.9592],
       [30.3068, 59.9581]
     ]
     ```
   - **Dimensions**: ~120m $\times$ 85m.
   - **Flora**: 34 trees (20 Lindens, 8 Birches, 6 Maples) + 26 lilac/hedge bushes along interior promenades and perimeter fences.

2. **Nizami Square (Сквер Низами)**
   - **Anchor**: `[30.3138, 59.9630]` (Kamennoostrovsky Pr. 25–27)
   - **Boundary Polygon**:
     ```json
     [
       [30.3128, 59.9627],
       [30.3142, 59.9624],
       [30.3148, 59.9632],
       [30.3132, 59.9635],
       [30.3128, 59.9627]
     ]
     ```
   - **Dimensions**: ~70m avenue frontage $\times$ 60m depth.
   - **Flora**: 20 decorative Lindens and weeping Birches encircling the central fountain and monument plaza + 18 ornamental hedge bushes.

3. **Popov Square (Сквер Профессора Попова)**
   - **Anchor**: `[30.3122, 59.9702]` (Kamennoostrovsky Pr. 39–41, near Karpovka River and Petrogradskaya Metro)
   - **Boundary Polygon**:
     ```json
     [
       [30.3114, 59.9696],
       [30.3129, 59.9697],
       [30.3128, 59.9708],
       [30.3113, 59.9707],
       [30.3114, 59.9696]
     ]
     ```
   - **Dimensions**: ~85m $\times$ 55m.
   - **Flora**: 24 Birches and Maples in symmetrical rows flanking the monument + 20 border shrubs.

4. **Street Boulevards**:
   - 40 additional boulevard trees lining wide pavement sections on Kamennoostrovsky Prospekt and Bolshaya Pushkarskaya.
   - **Total Botanical Count**: ~118 trees, 64 bushes.

---

### 3.2 Road Corridors & Spline Trajectories

1. **Bolshoy Prospekt P.S. (Большой проспект П.С.)**:
   - From Sportivnaya / Dobrolyubova (`[30.2915, 59.9520]`) to Leo Tolstoy Square (`[30.3155, 59.9625]`).
   - Carriageway: 14m width, 4 lanes (2 NE outbound, 2 SW inbound).
   - Lane offsets from road centerline:
     - Lane NE (Outbound): $+3.5\text{m}$
     - Lane SW (Inbound): $-3.5\text{m}$

2. **Kamennoostrovsky Prospekt (Каменноостровский проспект)**:
   - From Kronverksky / Gorkovskaya (`[30.3188, 59.9558]`) through Austrian Square (`[30.3165, 59.9589]`), Skver Nizami (`[30.3148, 59.9612]`), Leo Tolstoy Square (`[30.3140, 59.9625]`), to Karpovka Bridge (`[30.3130, 59.9660]`).
   - Carriageway: 21m width, 6 lanes (dedicated bus lanes curbside + cruising lanes).
   - Lane offsets from road centerline:
     - Northbound Cruising: $+4.0\text{m}$, Northbound Bus Lane: $+7.5\text{m}$
     - Southbound Cruising: $-4.0\text{m}$, Southbound Bus Lane: $-7.5\text{m}$

---

## 4. 3D Trees & Foliage Design (InstancedMesh & Shader Sway)

### 4.1 Low-Poly Procedural Botanical Geometries
To prevent multi-megabyte GLTF downloads while providing crisp, stylized Sims/GTA visuals:

1. **Petersburg Linden (Липа европейская)**:
   - Trunk: `CylinderGeometry(0.18, 0.35, 3.8, 6)`, bark `#3d2b1f`.
   - Crown: 3 tiered, squashed low-poly icosahedrons (`IcosahedronGeometry(2.0, 1)`), foliage `#2d5a27`.
2. **Silver Birch (Берёза повислая)**:
   - Trunk: Slender white/grey cylinder (`CylinderGeometry(0.12, 0.22, 4.8, 6)`), `#f3f4f6`.
   - Crown: Drooping cone canopy (`ConeGeometry(2.2, 5.0, 6)`), foliage `#4ade80`.
3. **Autumn Maple (Клён остролистный)**:
   - Trunk: Curved cylinder (`CylinderGeometry(0.20, 0.38, 4.0, 6)`), `#2e2017`.
   - Crown: Broad dodecahedron canopy (`DodecahedronGeometry(2.2, 1)`), rich foliage `#15803d` (or amber `#d97706` in autumn).
4. **Lilac & Hedge Bushes (Сирень / Кустарник)**:
   - Crown: Squashed low-poly dodecahedron (`DodecahedronGeometry(0.9, 1)` with scale `[1.2, 0.7, 1.2]`), emerald `#365314` and lilac `#a855f7`.

### 4.2 Foliage Wind Sway Vertex Shader
Injected cleanly into tree crown materials via `material.onBeforeCompile`:

```glsl
uniform float uTime;
uniform float uWindStrength; // 0.08 calm, 0.25 gusty
uniform vec2 uWindDirection; // normalize(vec2(1.0, -0.4))

// In vertex shader main():
float heightFactor = clamp(position.y / 5.5, 0.0, 1.0);
float flex = pow(heightFactor, 1.6); // Base is firmly rooted, canopy sways
float wave1 = sin(uTime * 1.8 + position.x * 1.5 + position.z * 1.5);
float wave2 = cos(uTime * 3.2 + position.y * 2.0) * 0.35;
float displacement = (wave1 + wave2) * uWindStrength * flex;

transformed.x += uWindDirection.x * displacement;
transformed.z += uWindDirection.y * displacement;
```

### 4.3 Directional Astronomical Ground Contact Shadows
Instead of heavy GPU depth shadow mapping:
- Under each tree, an elliptical ground decal quad (`y = 0.02`).
- Ground decal properties synchronized dynamically with `solarCalculator.js`:
  - `scale.set(1.0, Math.min(3.5, sunData.shadow.length), 1.0)`
  - `rotation.z = -sunData.shadow.azimuth * Math.PI / 180`
  - `opacity = sunData.shadow.opacity * 0.65`
- High noon: compact round shadow beneath trunk.
- Sunset: elongated 6–8m shadow stretching across the lawn.
- Night: subtle moonlit contact shadow (opacity 0.2).

### 4.4 WebGL Draw Call Budget via `THREE.InstancedMesh`
- Trunks (all species): 1 draw call (`THREE.InstancedMesh`)
- Linden Canopies: 1 draw call
- Birch Canopies: 1 draw call
- Maple Canopies: 1 draw call
- Bushes: 1 draw call
- Tree Ground Shadows: 1 draw call
- **Total draw calls for 180+ botanical instances: ONLY 6 DRAW CALLS**.

---

## 5. Moving Vehicle Traffic & Night Headlights

### 5.1 Authentic St. Petersburg Vehicle Archetypes

1. **St. Petersburg Yellow Taxi (Яндекс Go)**:
   - Body: `BoxGeometry(1.8, 0.85, 4.4)`, vibrant lemon yellow `#facc15`.
   - Cabin/Windows: Tinted obsidian glass `#1e293b`.
   - Roof Taxi Checker (Шашечки): Amber illuminated block `BoxGeometry(0.35, 0.2, 0.75)` with emissive `#f59e0b`.
   - Rubber wheels: 4 cylinders with dark graphite rims.
2. **Private Sedans (Monochrome Petersburg Fleet)**:
   - Body: `BoxGeometry(1.85, 0.82, 4.6)`.
   - Colors: Neva Graphite `#374151`, Baltic Dark Blue `#1e3a8a`, Pearl White `#f8fafc`, Petersburg Cherry `#831843`.
3. **St. Petersburg Azure Blue City Bus (Лазурный автобус СПб)**:
   - Dimensions: `BoxGeometry(2.55, 3.1, 12.2)` in official transit azure `#0284c7`.
   - Panoramic window ribbon (`#0f172a`), 6 wheels.
   - Digital amber LED route matrix display: `"10 — Петроградская"`.

### 5.2 Spline Trajectory & Anti-Collision Kinematics (IDM)
- Traffic paths are represented as 3D splines parameterized by arc length $s \in [0, L]$.
- Vehicle position: $P(s) = \text{Spline.getPointAt}(s / L)$.
- Vehicle yaw orientation: $\theta = \operatorname{atan2}(\text{tangent.x}, \text{tangent.z})$.
- Intelligent Driver Model (IDM) car-following distance checks:
  - Vehicles monitor distance to leading vehicle on the same lane.
  - If gap $< 14\text{m}$: smoothly decelerate.
  - If gap $< 6\text{m}$: full stop ($v = 0$). Eliminates rear-end collisions or bunching at intersections.
  - Brake lights glow vivid red (`#ef4444`, emissive intensity 3.0) during braking.

### 5.3 Dusk/Night Headlight & Taillight Illumination
1. **Emitter Bulbs**:
   - Front: 2 dual halogen/xenon spheres (`#fffbeb` / `#e0f2fe`).
   - Rear: 2 ruby red brake lights (`#ef4444`).
2. **Forward Asphalt Ground Decal**:
   - Additive-blended trapezoid projected onto the pavement extending 14m forward (width widening from 1.8m to 4.8m).
3. **Volumetric Fog Cone**:
   - Semi-transparent cone extending forward from the headlights (`AdditiveBlending`, `depthWrite: false`).
4. **Day/Night Activation**:
   - Day (sun elevation $\ge 0^\circ$): Headlights OFF (emissive 0, cone opacity 0).
   - Sunset / Golden Hour ($-6^\circ \le \text{elevation} < 0^\circ$): Headlights fade in (cone opacity ramps $0.0 \to 0.4$).
   - Night ($\text{elevation} < -6^\circ$): Headlights FULL ON (emissive 2.8, cone opacity 0.75), illuminating road markings and zebra crossings as vehicles pass!

---

## 6. Cast-Iron Street Lanterns & Warm Light Cones

### 6.1 Historical Petrogradka Lamp Geometry
- Faithful recreation of Saint Petersburg 19th-century cast-iron street lamps:
  - Base: Octagonal molded plinth (`CylinderGeometry(0.4, 0.45, 0.8, 8)`), dark anthracite iron `#1e2430`.
  - Column: Fluted tapered column (`CylinderGeometry(0.12, 0.22, 5.0, 8)`).
  - Arm: Curving gooseneck bracket extending over the curb.
  - Luminaire: Hexagonal lantern housing sodium/LED bulb (`#f59e0b`, 2700K).

### 6.2 Placement Coordinates
- 162 total street lamps placed along curb lines at 28-meter intervals:
  - Bolshoy Prospekt: 64 lamps (32 north sidewalk, 32 south sidewalk).
  - Kamennoostrovsky Prospekt: 84 lamps (42 west sidewalk, 42 east sidewalk).
  - Park walkways: 14 lower promenade lanterns (height 3.8m).

### 6.3 Volumetric Warm Light Cones & Sidewalk Pools
- **No Costly Dynamic Lights**: Standard Three.js `PointLight` or `SpotLight` instances multiplied by 162 would overload the WebGL pipeline.
- **Instanced Volumetric Cones**:
  - Inverted cone (`ConeGeometry(radius = 3.8m, height = 6.0m, segments = 10, openEnded = true)`).
  - Custom additive shader with vertical and radial attenuation.
  - Sidewalk ground decal pool: warm amber circular decal on the pavement under each post.
  - Performance: 162 lamps + 162 volumetric cones + 162 sidewalk pools = **ONLY 3 DRAW CALLS** via `THREE.InstancedMesh`.
- **Night Activation**:
  - Day: Cones and pools hidden (`opacity = 0`).
  - Sunset: Ignition warm-up with subtle electrical flicker (`flicker = 1.0 + 0.06 * sin(time * 25.0)`).
  - Night: Full glow (`opacity = 0.85`, emissive 3.0).

---

## 7. Linear UI Polish & Performance Blueprint

### 7.1 Design Engineering Principles (Linear UI)
1. **Palette**:
   - Pure `#08090a` monochrome foundation.
   - Surface cards: `#0e1013` with `backdrop-blur-md` and borders in `rgba(255, 255, 255, 0.06)` or `0.08`.
   - Accent colors: Linear indigo `#5e6ad2`, emerald `#22c55e` (Lera/Sims), amber `#f59e0b` (lighting).
2. **Concentric Radii System**:
   - Outer Modals & Floating Docks: `rounded-3xl` (24px).
   - Inner Containers & Cards: `rounded-2xl` (16px).
   - Interactive Buttons & Inputs: `rounded-xl` (12px).
   - Badges & Small Tags: `rounded-lg` (8px).
   - Mathematical formula: $R_\text{outer} = R_\text{inner} + \text{padding}$.
3. **Tactile Response**:
   - All clickable elements feature `active:scale-[0.96]` and `transition-[background-color,border-color,transform] duration-150`.

### 7.2 WebGL Performance Budget
- Total Draw Calls across all layers:
  - 3D Buildings (`fill-extrusion`): MapLibre internal
  - Road Markings (dividing lines, zebras): MapLibre vector layers
  - GTA Pedestrians (10 citizens + Lera): ~11 meshes
  - City Environment (180+ trees/bushes): 6 draw calls
  - City Traffic (12 moving vehicles): 4 draw calls
  - Street Lamps (162 lamps + cones + pools): 3 draw calls
  - **Total Scene Draw Calls: <25**.
- Frame rate: Guaranteed 30–60 FPS on any laptop or mobile GPU.
- Animation loop throttled to ~30 FPS (`if (timestamp - lastFrameTime > 33)`), preventing CPU/GPU hogging.

---

## 8. E2E Testing Suite (`scripts/test_sims_3d.mjs`)

The Chrome CDP test suite must be implemented to run headless end-to-end tests against the running server.

### 8.1 Test Runner Architecture
- Spawns Google Chrome:
  ```bash
  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome \
    --headless=new \
    --remote-debugging-port=9345 \
    --user-data-dir=/tmp/chrome_sims_3d_test \
    --no-first-run \
    --use-gl=angle --enable-webgl \
    --window-size=1440,900 about:blank
  ```
- Connects via WebSocket to `webSocketDebuggerUrl`.
- Enables `Runtime`, `Page`, `Network`.
- Loads `ADMIN_WEB_KEY` from `.env`, injects authentication cookie and sessionStorage.
- Navigates to `http://localhost:3000`, clicks on the `"Карта СПб"` tab.
- Waits for MapLibre map and WebGL context to fully initialize.

### 8.2 Mandatory Test Assertions

1. **Build Validation**:
   - Execute `npm run admin:build` and confirm exit code 0.
2. **WebGL Context & Shader Audit**:
   - Assert `gl.getError() === 0` (no WebGL errors).
   - Assert `gl.isContextLost() === false`.
   - Assert `window.__mapErrors.length === 0`.
3. **Vegetation Audit (3D Trees & Bushes)**:
   - Query Three.js city environment layer:
     - Verify InstancedMesh instance counts: Linden $\ge 20$, Birch $\ge 20$, Maple $\ge 15$, Bushes $\ge 30$.
     - Verify instance coordinates fall within the defined boundary polygons of Matveevsky Garden, Skver Nizami, and Skver Popova.
     - Verify uniform `uTime` increments over animation frames (proving foliage wind sway).
4. **Vehicle Traffic Audit**:
   - Query traffic simulation instance:
     - Verify vehicle count $\ge 8$ (including taxis, sedans, and azure bus).
     - Sample coordinates at $t_0$ and $t_0 + 2000\text{ms}$; assert $\Delta \text{distance} > 5\text{m}$ for moving vehicles.
     - Verify vehicle heading yaw matches trajectory tangent vectors.
5. **Night Mode Light Activation Audit**:
   - Click UI button `"Ночь"` (`timeMode = 'night'`):
     - Assert building pattern changes to `spb-facade-night`.
     - Assert street lamp volumetric cones have `opacity \ge 0.5`.
     - Assert vehicle headlights have `emissive \ge 1.0` and headlight ground cones have `opacity \ge 0.5`.
   - Click UI button `"День"` (`timeMode = 'day'`):
     - Assert building pattern changes to `spb-facade-day`.
     - Assert street lamp volumetric cones have `opacity === 0`.
     - Assert vehicle headlights have `opacity === 0`.
6. **Zero Building Collision Audit**:
   - Verify that all pedestrian NavMesh waypoints and all traffic spline segments maintain zero penetration with building footprints.
   - Run point-in-polygon tests against building centroids/polygons.
7. **UI Interaction & Citizen Inspector Audit**:
   - Trigger click on a pedestrian.
   - Assert Citizen Inspector card appears in DOM (`selectedPedestrian`).
   - Assert inspector card displays avatar, name, role, bio, and thoughts.
   - Assert concentric radii (`rounded-3xl` container, `rounded-2xl` icon).
   - Click close button; assert card is removed from DOM.
8. **Verification Artifacts**:
   - Capture full viewport screenshot to `/tmp/sims_3d_environment_verification.png`.
   - Output structured JSON summary and exit 0.

---

## 9. Next Steps & Implementation Roadmap

1. **Step 1 (Data Layer)**: Implement `admin-linear/src/lib/cityEnvironmentData.js` exporting:
   - `PARK_BOUNDARIES`, `BOTANICAL_INSTANCES`
   - `STREET_LAMP_COORDINATES`
   - `TRAFFIC_ROUTES`, `VEHICLE_CONFIGS`
2. **Step 2 (Rendering Layer)**: Implement `admin-linear/src/lib/cityEnvironmentLayer.js`:
   - MapLibre `CustomLayerInterface` (`renderingMode: '3d'`)
   - Instanced tree meshes with wind sway vertex shader and astronomical ground contact shadows
   - Instanced cast-iron street lamps with downward volumetric cones
   - Vehicle meshes, spline navigation, IDM car-following, and night headlight beams
   - `updateEnvironment(sunData, weatherData, elapsedMs)`
3. **Step 3 (Map Integration)**: Mount `cityEnvironmentLayer` in `admin-linear/src/components/FullScreenMap.jsx`:
   - Add layer in `applyThemeToMap` immediately below `3d-pedestrians`.
   - Call `updateEnvironment` on each animation frame alongside `updateCharacters`.
4. **Step 4 (E2E Test)**: Create and run `scripts/test_sims_3d.mjs`:
   - Run full CDP test verifying building collision avoidance, headlights/window lights at night, UI interactions, and `npm run admin:build` exit 0.
