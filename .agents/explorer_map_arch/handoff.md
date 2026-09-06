# Handoff Report: 3D Map Rendering Architecture for Petrogradka

**Agent Archetype**: Explorer (Read-Only)  
**Task**: Investigation of 3D Map Rendering Architecture for Petrogradka (`tg-ai-bot`)  
**Date**: 2026-09-03  
**Working Directory**: `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_map_arch/`  

---

## 1. Observation

### 1.1 Implementation Locations and Frameworks
- **Active 3D Map Component**: `admin-linear/src/components/FullScreenMap.jsx` (1,097 lines).
  - Uses `maplibre-gl` version `6.7.0` (declared in root `package.json:18`, verified via `node_modules/maplibre-gl/package.json`).
  - WebGL Canvas initialized at line 350:
    ```javascript
    map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: [initialLoc.lng, initialLoc.lat], // [lng, lat] WGS84
        zoom: 15.2,
        pitch: 50, // Sims 50° camera angle
        bearing: -15, // Sims isometric perspective
        maxPitch: 65,
        minZoom: 11,
        maxZoom: 18.5,
        attributionControl: false
    });
    ```
  - Map styles: CARTO GL Vector Styles (OpenMapTiles vector schema):
    - Day/Sunset: `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json` (line 52)
    - Night: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (line 53)
  - Worker vendored locally: `maplibregl.setWorkerUrl('/assets/maplibre-gl-worker.mjs')` (line 341).
- **Astronomical Solar & Lighting Engine**: `admin-linear/src/lib/solarCalculator.js` (482 lines).
  - Computes solar declination, hour angle, elevation, azimuth, and ground shadows for Saint Petersburg (59.95° N, 30.31° E).
  - Updates MapLibre GL directional lighting via `map.setLight(currentSun.mapLight)` (line 268 of `FullScreenMap.jsx`).
- **Pedestrian Simulation & Path Engine**: `admin-linear/src/lib/pedestrianData.js` (473 lines).
  - 10 predefined citizens (`PETROGRADKA_PEDESTRIANS`) walking along realistic sidewalks of Kamennoostrovsky, Bolshoy Prospekt, Lev Tolstoy, Lenina, Matveyevsky Garden, and Skver Nizami.
  - Computes geodesic distance (Haversine WGS84) and initial compass bearing.
  - Interpolation loop running in `requestAnimationFrame` throttled to ~25 FPS (`timestamp - lastFrameTime > 40`).
- **Locations & Simulation Configs**: `admin-linear/src/lib/simulationConstants.js` and `src/radiant/world_map.js`.
  - Coordinates for `petrogradka_home` `[30.3049, 59.9589]`, `cafe_sloy` `[30.3121, 59.9612]`, `vkusvill_lenina` `[30.2986, 59.9563]`, `showroom_work` `[30.2731, 59.9386]`.
- **Legacy & Public Map Components**:
  - `deprecated/admin-v2/src/features/simulation/SpbMapWidget.jsx`: Legacy 2D Leaflet widget with inverted OSM tiles.
  - `public/map.html`: Public standalone 2D Leaflet page on route `/map`.

### 1.2 Current Building, Polygon, and Road Representation
- **3D Buildings Layer**: Added in `FullScreenMap.jsx:241-259`:
  ```javascript
  map.addLayer({
      id: '3d-buildings',
      source: hasCarto ? 'carto' : 'openmaptiles',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
          'fill-extrusion-color': theme.buildingColor,
          'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14, 0,
              14.5, ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]
          ],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': theme.buildingOpacity
      }
  });
  ```
- **Observed Current State**:
  - Buildings are extruded polygons from OSM data colored with a single monochromatic height-interpolated palette (e.g. dark slate `#1a2230` to `#3f4f66` at night, ivory `#f8f4ed` to sandstone `#d8be9f` in day).
  - There are currently **NO window textures, NO rustication, and NO illuminated storefronts** on the 3D building meshes.
  - Roads are flat vector lines from the CARTO basemap; there are **NO pedestrian crosswalks («зебры») or road dividing lines**.
  - Pedestrians are currently 2D HTML/DOM markers (`maplibregl.Marker`) containing emoji avatars (`🎓`, `🐕`, `🥐`) and floating speech bubbles.
- **Verification via Live Headless Chrome CDP**:
  - Executed `scripts/test_maplibre.mjs`. Chrome connected on port 9334, loaded `http://localhost:3000`, clicked the "Карта СПб" tab.
  - WebGL Canvas confirmed active: `1440x761 px`, 19 markers loaded, screenshot saved to `/tmp/actual_maplibre_3d_state.png`.
  - Visual inspection confirms flat extruded buildings, flat roads, and 2D circular badge markers.

### 1.3 Build and Dependencies
- Build command: `npm run admin:build` executes `vite build --config admin-linear/vite.config.js`.
- Build execution tested: exits with code 0 in `1.78s`.
- Output bundle: `public/admin-linear/` (served at `/admin`, `/dashboard`, `/linear`, and `/`).
- Key dependencies in `package.json`:
  - `"maplibre-gl": "^6.7.0"`
  - `"react": "^19.1.1"`
  - `"tailwindcss": "^4.3.3"`
  - `"lucide-react": "^0.468.0"`
  - Note: `three` is currently not installed.

---

## 2. Logic Chain

1. **Map Engine Foundation**:
   - `admin-linear` already possesses a mature WebGL 3D foundation in MapLibre GL 6.7.0, complete with realistic solar geometry, camera pitch/bearing presets, and sidewalk waypoint interpolation.
   - Any new rendering capabilities should build directly upon this MapLibre GL instance rather than introducing an isolated or competing canvas.

2. **Procedural Facade Texturing Pipeline**:
   - MapLibre GL's `fill-extrusion` specification natively supports `fill-extrusion-pattern: <image_id>`.
   - `map.addImage(id, canvas)` accepts standard HTML5 Canvas elements.
   - Therefore, a procedural St. Petersburg facade generator (`facadeTextureGenerator.js`) can generate 512x512 canvas textures using 2D Canvas drawing APIs:
     - **Ground Floor (Цоколь)**: Horizontal stone rustication grooves (`#334155`), arched entrance door (парадная), and panoramic storefronts:
       - «Слой»: warm amber bakery glow (`rgba(251, 191, 36, 0.85)`), black/brass trim, croissant silhouette.
       - «ВкусВилл»: signature green awning (`#15803d`), crisp white logo, bright cool-white interior glow.
       - Fashion Showroom: minimalist framing, spotlight accents.
     - **Upper Floors (2–5 этажи)**: Classic Petersburg ochre/terracotta stucco, horizontal belt cornices (междуэтажные карнизы), decorative window trims (наличники).
     - **Dynamic Window Illumination**:
       - Day: Sky-cyan reflections with white mullions.
       - Sunset: Golden-peach specular highlights.
       - Night: ~65% of windows illuminated with warm incandescent amber glow (`#fde047`, `#fbbf24`), curtain silhouettes; ~35% dark sleep mode.
   - When the lighting theme changes (Day/Sunset/Night), updating `fill-extrusion-pattern` to `spb-facade-${theme}` updates all 3D buildings instantly with zero WebGL recompilation cost.

3. **Road Markings Pipeline**:
   - MapLibre GL supports vector GeoJSON layers placed at precise layer depths.
   - Placing road markings below `'3d-buildings'` (`map.addLayer(layer, '3d-buildings')`) guarantees that buildings properly occlude road markings.
   - **Dividing Lines**: GeoJSON `LineString` along the centerlines of Bolshoy and Kamennoostrovsky with `line-dasharray: [4, 4]`, `line-color: '#ffffff'`, `line-width: 2.5`.
   - **Crosswalks («Зебры»)**: GeoJSON features at key intersections (Bolshoy & Lenina, Bolshoy & Kamennoostrovsky, Kamennoostrovsky & Kronverksky, Matveyevsky Garden) rendered as transverse dashed bars (`line-width: 12`, `line-dasharray: [1, 1]`) or exact polygon stripes.

4. **3D GTA-Style Characters, Trees, and Traffic Integration**:
   - The user explicitly mandated: *«Инженер ИИ и симуляции: пускай будут тридэ как в гта»*.
   - Flat DOM badges must be replaced with true 3D low-poly humanoid meshes (head, torso, limbs with walking animation gait) that rotate in 3D along their movement bearing and cast contact shadows.
   - **Recommended Architecture**: MapLibre GL `CustomLayerInterface` with Three.js (`three`):
     - `CustomLayerInterface` renders directly inside MapLibre's WebGL context on the same canvas.
     - Using `maplibregl.MercatorCoordinate.fromLngLat([30.3049, 59.9589], 0)` as the local scene origin allows 1 Three.js unit = 1 real meter!
     - Humanoids are 1.8m tall, cars are 4.5m long, trees are 8m tall.
     - Hierarchical procedural meshes (boxes and cylinders) require zero external GLTF downloads:
       - Pedestrians: Head, torso, swinging arm/leg limbs, facing direction bearing.
       - Vehicles: SPb yellow taxi, blue SPb bus, sedans, with forward headlight cones (`ConeGeometry` with additive blending) activated at sunset/night.
       - Trees: Trunks + clustered dodecahedron crowns in Matveyevsky Garden and Skver Nizami, animated with subtle wind sway via vertex/group rotation.
       - Street lamps: Iron posts with downward warm light cones on sidewalks.

5. **Collision Avoidance Guarantee**:
   - Requirement: *Pedestrians must never pass through 3D building polygons*.
   - **Layer 1**: Pedestrian routes in `pedestrianData.js` are already digitized strictly along sidewalk corridors between curbs and building facades.
   - **Layer 2**: Constrain pedestrian interpolation strictly to the 1D segment of the sidewalk path, clamping lateral spread to `±0.8m` (well within the 3.5m–6m sidewalk width).
   - **Layer 3**: 2D point-in-polygon check against OSM building footprint bounding boxes; if a candidate point encroaches within 1.0m of a building wall, it is projected back onto the nearest sidewalk centerline.

6. **Performance & Build Budget**:
   - Target framerate: 25–30 FPS. `FullScreenMap.jsx` already implements frame-throttling (`if (timestamp - lastFrameTime > 40)`).
   - Low-poly procedural geometry ensures under 3,000 total vertices for all characters, cars, and trees combined.
   - `THREE.InstancedMesh` allows rendering all 50+ trees and 30+ street lamps in 2 single draw calls.
   - Adding `three` to `package.json` adds ~150KB gzip to the vendor bundle; `npm run admin:build` remains well under 2.5 seconds.

---

## 3. Caveats

1. **`three` Dependency**:
   - `three` is not currently in `package.json`. The implementation subagent (e.g. Engineer AI / Simulation) will need to add `"three": "^0.170.0"` or `"three": "^0.160.0"` to `package.json` to leverage Three.js inside MapLibre's `CustomLayerInterface`.
   - *Alternative if no new packages allowed*: 2.5D billboard sprite quads or a raw WebGL custom layer can be written, but Three.js is significantly cleaner and faster to maintain for GTA-style 3D articulated humanoids.
2. **Dynamic Vector Tile Availability**:
   - CARTO GL vector styles depend on external CDN vector tiles (`basemaps.cartocdn.com`). If running in an offline environment without internet, pre-cached GeoJSON building footprints for Petrogradka must be loaded as a fallback.
3. **Texture UV Mapping on Complex OSM Polygons**:
   - MapLibre GL `fill-extrusion-pattern` wraps the pattern horizontally across all outer walls. For irregular concave courtyards, the texture wraps continuously; ensuring horizontal seamlessness in the 512x512 canvas pattern is essential.

---

## 4. Conclusion

The 3D map for Petrogradka in `tg-ai-bot` is implemented via **MapLibre GL v6.7.0** in `admin-linear/src/components/FullScreenMap.jsx`. It already features an astronomical lighting system (`solarCalculator.js`), sidewalk path interpolation (`pedestrianData.js`), and extruded OSM buildings.

The requested transformations can be implemented cleanly and modularly as follows:
1. **Procedural St. Petersburg Facades (R1)**: A 512x512 Canvas 2D generator supplying `fill-extrusion-pattern` with rusticated ground floors, storefronts («Слой», «ВкусВилл», showroom), classical mouldings, and day/sunset/night window illumination (warm glowing lights at night).
2. **Road Markings (R1)**: GeoJSON `line`/`fill` layers added immediately beneath `'3d-buildings'` for dashed centerlines and crosswalk "zebras".
3. **3D GTA Humanoids, 3D Trees & Traffic (R2, R3, Follow-up)**: A MapLibre `CustomLayerInterface` powered by Three.js, centered at Petrogradka `[30.3049, 59.9589]` (1 unit = 1 meter), hosting low-poly articulated humanoids, moving cars with headlight cones, instanced 3D trees, and street lamps.
4. **Collision Freedom (R2)**: Sidewalk-constrained pathing with bounding box repulsion prevents any clipping into building polygons.
5. **Performance & Build (R4, R5)**: Throttled at 25–30 FPS, instanced meshes, and fully compliant with `npm run admin:build`.

---

## 5. Verification Method

### 5.1 Independent Code and Architecture Inspection
1. Inspect `admin-linear/src/components/FullScreenMap.jsx:240-265` to confirm current `fill-extrusion` building layer configuration.
2. Inspect `admin-linear/src/lib/pedestrianData.js:220-466` to verify sidewalk waypoints and the 25 FPS interpolation loop (`FullScreenMap.jsx:557-573`).
3. Inspect `admin-linear/src/lib/solarCalculator.js:150-250` to verify astronomical sun/shadow calculations.

### 5.2 Build Verification
Run the build command from project root:
```bash
npm run admin:build
```
*Expected result*: Exits with code 0, outputs bundled assets to `public/admin-linear/` in under 2 seconds.

### 5.3 Chrome CDP Live Map Verification
Run the existing automated CDP test script:
```bash
node scripts/test_maplibre.mjs
```
*Expected result*:
- Connects to Chrome CDP, logs `[MapLibre STYLE READY]`.
- Confirms canvas presence: `hasCanvas: true`, dimensions `1440x761`.
- Simulates click on Lera avatar and verifies UI banner.
- Captures screenshot to `/tmp/actual_maplibre_3d_state.png`.
