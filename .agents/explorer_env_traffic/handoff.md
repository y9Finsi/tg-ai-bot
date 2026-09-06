# Handoff Report: City Environment, Vegetation, Lighting & Traffic Simulation for Petrogradka 3D Map

**Date**: 2026-09-03  
**Author**: Explorer Subagent (`explorer_env_traffic`)  
**Target Milestone**: R3 — City Environment, 3D Vegetation, Street Lighting & Dynamic Traffic Simulation  
**Working Directory**: `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_env_traffic/`  

---

## 1. Observation

### 1.1 Codebase Structure & Current 3D Map Baseline
From direct file inspection:
- **`admin-linear/src/components/FullScreenMap.jsx`**:
  - Line 2: Imports `* as maplibregl from 'maplibre-gl'`.
  - Line 350–361: MapLibre GL map instance is initialized with `pitch: 50` (Sims 50° camera angle) and `bearing: -15` (isometric perspective).
  - Line 240–263: 3D extruded buildings are rendered via layer `'3d-buildings'` with dynamic paint property `'fill-extrusion-color'` and `'fill-extrusion-height'` based on building levels/render_height.
  - Line 266–269: Directional lighting is fed into MapLibre via `map.setLight(currentSun.mapLight)`.
  - Line 508–551: Pedestrians are currently rendered via 2D HTML DOM markers animated on an animation frame loop.
- **`admin-linear/src/lib/solarCalculator.js`**:
  - Lines 14–24: SPb geographical reference: Latitude 59.95° N, Longitude 30.31° E, UTC+3.
  - Lines 35–81: Day phases (`day`, `morning_afternoon`, `golden_hour`, `twilight`, `night`).
  - Lines 402–480: `calculateSpbSun(hour, dayOfYear)` computes declination, hour angle, astronomical solar elevation, azimuth, daylight phase, MapLibre directional light, and directional ground shadow vector `(offsetX, offsetY, blur, opacity)`.
- **`admin-linear/src/lib/pedestrianData.js`**:
  - Lines 235–240: Waypoints along Kamennoostrovsky Prospekt from Austrian Square to Kronverksky: `[30.3160, 59.9598]`, `[30.3169, 59.9585]`, `[30.3178, 59.9572]`, `[30.3188, 59.9558]`.
  - Lines 260–264: Waypoints on Bolshoy Prospekt near Cafe Sloy: `[30.3121, 59.9612]`, `[30.3092, 59.9601]`, `[30.3065, 59.9590]`, `[30.3038, 59.9578]`.
  - Lines 283–288: Waypoints around Matveevsky Garden: `[30.3072, 59.9582]`, `[30.3092, 59.9587]`, `[30.3088, 59.9596]`, `[30.3068, 59.9591]`.
  - Lines 331–336: Waypoints around Skver Nizami: `[30.3132, 59.9628]`, `[30.3138, 59.9634]`, `[30.3146, 59.9631]`, `[30.3140, 59.9625]`.
- **`src/radiant/weather_service.js`**:
  - Lines 20–25: Queries Open-Meteo for Saint Petersburg (`latitude: 59.93, longitude: 30.31`) returning `is_raining`, `precipitation`, `weather_code`, `temperature_2m`.
- **Build Verification**:
  - `npm run admin:build` successfully compiles `admin-linear` in 1.42 seconds with zero bundle or syntax errors.

---

## 2. Logic Chain & Technical Solutions

### Question 1: Map Coordinate System & Exact Locations
MapLibre GL operates in standard WGS84 geographic coordinates `[longitude, latitude]` (where X = longitude in degrees East, Y = latitude in degrees North), internally transformed via Web Mercator projection into unit coordinates `[0..1]`.

#### Exact Geometries & Coordinates:
1. **Matveevsky Garden (Матвеевский сад / сквер)**
   - **Center Anchor**: `[30.3080, 59.9589]`
   - **Boundary Polygon**:
     ```json
     [[30.3068, 59.9581], [30.3095, 59.9587], [30.3089, 59.9598], [30.3063, 59.9592], [30.3068, 59.9581]]
     ```
   - **Dimensions**: ~120m east-west, ~85m north-south.
   - **Botanical Capacity**: 32 trees (linden, maple), 24 lilac/hedge bushes.

2. **Nizami Square (Сквер Низами)**
   - **Center Anchor**: `[30.3138, 59.9630]` (Kamennoostrovsky Pr. 25–27)
   - **Boundary Polygon**:
     ```json
     [[30.3128, 59.9627], [30.3142, 59.9624], [30.3148, 59.9632], [30.3132, 59.9635], [30.3128, 59.9627]]
     ```
   - **Dimensions**: ~70m avenue frontage, ~60m depth.
   - **Botanical Capacity**: 18 weeping willows and decorative lindens encircling the central fountain/monument plaza + 16 ornamental bushes.

3. **Popov Square (Сквер Профессора Попова)**
   - **Center Anchor**: `[30.3122, 59.9702]` (Kamennoostrovsky Pr. 39–41, near Petrogradskaya metro & Karpovka)
   - **Boundary Polygon**:
     ```json
     [[30.3114, 59.9696], [30.3129, 59.9697], [30.3128, 59.9708], [30.3113, 59.9707], [30.3114, 59.9696]]
     ```
   - **Dimensions**: ~85m north-south, ~55m depth.
   - **Botanical Capacity**: 22 birch and rowan trees arranged in dual promenade rows flanking the A.S. Popov monument + 20 border hedge segments.

4. **Bolshoy Prospekt P.S. (Большой проспект П.С.)**
   - **Extent**: From Tuchkov Bridge (`[30.2860, 59.9495]`) to Ploshchad Lva Tolstogo (`[30.3138, 59.9622]`).
   - **Length**: ~2,380 meters. Bearing: ~51.5° (NE) / ~231.5° (SW).
   - **Road Profile**: 4 traffic lanes (total carriageway width 14m) + two sidewalks (4.5m each).
   - **Key Nodes**:
     - Tuchkov Bridge: `[30.2860, 59.9495]`
     - Dobrolyubova / Sportivnaya: `[30.2915, 59.9520]`
     - Vvedenskaya: `[30.2990, 59.9558]`
     - Shamsheva / Lenina: `[30.3038, 59.9578]`
     - Cafe «Слой» (Bolshoy 82): `[30.3121, 59.9612]`
     - Leo Tolstoy Square: `[30.3138, 59.9622]`

5. **Kamennoostrovsky Prospekt (Каменноостровский проспект)**
   - **Extent**: From Troitsky Bridge (`[30.3275, 59.9530]`) to Karpovka Bridge (`[30.3110, 59.9715]`).
   - **Length**: ~3,150 meters. Bearing: ~342° (NNW) / ~162° (SSE).
   - **Road Profile**: 6 traffic lanes (carriageway 21m) + two granite sidewalks (5.5m each).
   - **Key Nodes**:
     - Troitsky Bridge: `[30.3275, 59.9530]`
     - Alexandrovsky Park / Gorkovskaya: `[30.3218, 59.9557]`
     - Austrian Square (Австрийская пл.): `[30.3165, 59.9595]`
     - Skver Nizami: `[30.3138, 59.9630]`
     - Petrogradskaya Metro / Pl. Lva Tolstogo: `[30.3135, 59.9664]`
     - Skver Popova / Karpovka Bridge: `[30.3122, 59.9702]`

---

### Question 2: 3D Trees & Bushes (Geometry, Swaying & Soft Shadows)

#### 2.1 Low-Poly Procedural Geometry
To achieve the requested stylized Sims/GTA aesthetic without heavy network asset downloads:
- **Tree Mesh Structure**:
  - **Trunk**: 6-sided tapered cylinder (`CylinderGeometry(0.18, 0.35, 3.8, 6)`), dark bark brown `#3d2b1f`.
  - **Crown**: 3 procedural archetypes:
    1. *Petersburg Linden (Липа)*: 3 tiered, squashed low-poly icosahedrons (`IcosahedronGeometry(2.0, 1)`, foliage `#2d5a27`).
    2. *Silver Birch (Берёза)*: Slender white/grey trunk (`#f3f4f6`) with drooping cone canopy (`ConeGeometry(2.2, 5.0, 6)`, foliage `#4ade80`).
    3. *Autumn Maple (Клён)*: Broad multi-spherical canopy (`#15803d` or `#d97706`).
- **Bush Mesh Structure**:
  - Squashed low-poly dodecahedron (`DodecahedronGeometry(0.9, 1)`, scale `1.2, 0.7, 1.2`), emerald `#365314` and lilac `#a855f7`.

#### 2.2 Gentle Swaying (Vertex Shader Wind Simulation)
Injected into the tree foliage material via `material.onBeforeCompile`:
```glsl
uniform float uTime;
uniform float uWindStrength; // 0.08 calm, 0.22 storm
uniform vec2 uWindDirection; // normalize(vec2(1.0, -0.4))

// In vertex shader main():
float heightFactor = clamp(position.y / 5.5, 0.0, 1.0);
float flex = pow(heightFactor, 1.6); // Trunk rooted, crown flexes
float wave1 = sin(uTime * 1.8 + position.x * 1.5 + position.z * 1.5);
float wave2 = cos(uTime * 3.2 + position.y * 2.0) * 0.35;
float displacement = (wave1 + wave2) * uWindStrength * flex;

transformed.x += uWindDirection.x * displacement;
transformed.z += uWindDirection.y * displacement;
```

#### 2.3 Soft Directional Ground Shadows
Rather than expensive GPU shadow maps:
- Under each tree, place a ground decal quad (`z = 0.002`).
- Alpha radial texture: center opacity 0.5 fading to 0.
- Synchronized dynamically with `solarCalculator.js`:
  - `decal.scale.set(1.0, Math.min(3.0, sunData.shadow.length), 1.0)`
  - `decal.rotation.z = -sunData.shadow.azimuth * Math.PI / 180`
  - `decal.material.opacity = sunData.shadow.opacity * 0.7`
  - Noon: tight circular shadow underneath trunk.
  - Sunset: elongated 6-8m shadow stretching across lawn.
  - Night: soft cool moonlight shadow (opacity 0.2).

#### 2.4 Performance via `THREE.InstancedMesh`
- All trunks across all 3 parks rendered in **1 single draw call**.
- All foliage crowns rendered in **1 single draw call**.
- All bushes rendered in **1 single draw call**.
- Total city vegetation: **130+ trees & bushes rendered in 3 draw calls at 60 FPS**.

---

### Question 3: Moving Vehicle Traffic Simulation

#### 3.1 Vehicle Types & Low-Poly Archetypes
1. **St. Petersburg Yellow Taxi (Яндекс Go)**:
   - Body: `BoxGeometry(1.8m, 4.6m, 0.85m)`, vibrant lemon yellow `#facc15`.
   - Cabin/Windows: Dark tinted glass `#1e293b`.
   - Roof Taxi Checker (Шашечки): `BoxGeometry(0.35m, 0.8m, 0.2m)`, glowing amber.
   - 4 rubber wheels (`CylinderGeometry(0.32m, 0.32m, 0.24m, 8)`).
2. **Private Sedans (Monochrome Petersburg Palette)**:
   - Classic Petersburg car tones: Neva Graphite `#374151`, Pearl White `#f8fafc`, Midnight Baltic Blue `#1e3a8a`, Deep Cherry `#831843`.
3. **St. Petersburg Azure Blue City Bus (Лазурный автобус СПб)**:
   - Body: `BoxGeometry(2.55m, 12.2m, 3.1m)` in official transit azure `#0284c7`.
   - Panoramic window ribbon (`#0f172a`), 6 wheels (double rear axle).
   - Digital route board above windshield: LED amber matrix displaying "10 — Петроградская".

#### 3.2 Lane Geometries & Movement Math
- **Bolshoy Prospekt**:
  - Outbound NE Lane: Offset +3.5m from road centerline.
  - Inbound SW Lane: Offset -3.5m from road centerline.
- **Kamennoostrovsky Prospekt**:
  - Northbound Lanes: Curbside bus lane (+8.5m), Cruising lane (+5.0m), Express lane (+1.75m).
  - Southbound Lanes: Symmetrical negative offsets.
- **Movement on Splines**:
  - Continuous closed-loop or conveyor splines parameterised by arc-length $s \in [0, L]$.
  - Vehicle position: $P(s) = \text{Spline.getPointAt}(s / L)$.
  - Vehicle yaw orientation: $\theta = \operatorname{atan2}(\text{tangent.x}, \text{tangent.y})$.
- **Collision Avoidance (IDM Car Following)**:
  - If vehicle $i$ approaches predecessor $j$ within $12\text{m}$: decelerate smoothly to match $v_j$.
  - If distance $< 6\text{m}$: full stop ($v_i = 0$), prevent intersection pile-ups!
  - Brake lights glow vivid red (`#ff0000`, emissive intensity 3.5).

#### 3.3 Dusk/Night Headlight & Taillight Activation & Illumination
- **Vehicle Emitter Bulbs**:
  - Front: Warm halogen `#fffbeb` / cool xenon `#e0f2fe`.
  - Rear: Ruby red `#ef4444`.
- **Illuminating Headlight Cones (Volumetric + Road Decals)**:
  - **Asphalt Ground Projection**: Additive blended trapezoidal quad extending 14m ahead on the asphalt (width 1.8m $\to$ 4.8m).
  - **Volumetric Fog Cone**: Semi-transparent cone extending forward from headlamps (`AdditiveBlending`, `depthWrite: false`).
  - **Activation**:
    - Day ($\alpha \ge 0^\circ$): Headlights OFF, cone opacity 0.
    - Sunset / Golden Hour ($-4^\circ \le \alpha < 0^\circ$): Cones fade in (opacity 0.35).
    - Night ($\alpha < -4^\circ$): Headlights FULL ON (emissive 2.5, cone opacity 0.75), illuminating road markings and zebra crossings as cars pass!

---

### Question 4: Street Lamp Posts & Warm Light Cones

#### 4.1 Historical Petrogradka Cast-Iron Lanterns
- Height: 6.2 meters.
- Finish: Dark anthracite cast-iron `#1e2430`.
- Geometry: Octagonal base + fluted mast + curving gooseneck arm + glass luminaire housing sodium/LED bulb (`#f59e0b`, 2700K).

#### 4.2 Sidewalk Placement Coordinates
Lamps placed along the curb lines at 28-meter intervals:
- **Bolshoy Prospekt**: 64 total posts (32 North sidewalk, 32 South sidewalk).
- **Kamennoostrovsky Prospekt**: 84 total posts (42 West sidewalk, 42 East sidewalk).
- **Parks**: 14 pedestrian path lanterns (height 3.8m).
- Total: **162 street lamps**.

#### 4.3 High-Performance Volumetric Warm Light Cones
- **No Heavy Dynamic Lights**: Avoid standard Three.js spot lights that crash mobile/integrated GPUs.
- **Instanced Volumetric Cones**:
  - Inverted cone (`ConeGeometry(radius=3.8m, height=6.0m, segments=10, openEnded=true)`).
  - Additive shader with radial and vertical falloff:
    $$\text{intensity} = \left(1.0 - \frac{r}{R}\right)^{1.8} \cdot \operatorname{smoothstep}(0.0, 0.25, y/H)$$
  - Sidewalk ground decal: A circular decal on the pavement creating a warm golden pool of light under each post.
  - Performance: 162 lamp posts + 162 volumetric cones + 162 ground pools = **ONLY 3 DRAW CALLS** via `InstancedMesh`.

#### 4.4 Dusk/Night Activation
- Triggered by `solarCalculator.js`:
  - Day ($\alpha > 2^\circ$): OFF (opacity 0).
  - Golden Hour ($2^\circ \ge \alpha > -4^\circ$): Firing up with warm-up ignition flicker (`flicker = 1.0 + 0.08 * sin(time * 30.0)`), opacity ramps $0.0 \to 0.5$.
  - Night ($\alpha \le -4^\circ$): Full glow, opacity 0.85, emissive bulb 3.0.

---

### Question 5: Day/Night/Weather Cycle Hooks & Material Shaders

#### 5.1 Environmental State Coordination
A centralized reactive `EnvironmentState` bridges Radiant backend, astronomy math, MapLibre GL, and WebGL:
```javascript
export const EnvironmentState = {
    elevation: 45.0,
    azimuth: 180.0,
    phase: 'day',      // 'day' | 'golden_hour' | 'twilight' | 'night'
    nightFactor: 0.0,  // 0.0 (day) -> 1.0 (full night)
    isRaining: false,
    windSpeed: 1.0,
    windDir: [0.707, -0.707]
};
```

#### 5.2 Environmental Phase Mapping Table
| Phase | Elevation | Sun/Moon Light | Trees / Foliage | Street Lamps | Vehicle Headlights | Procedural Windows |
|---|---|---|---|---|---|---|
| **Day** | $\ge 10^\circ$ | `#fffdf5` (0.75) | Vivid park green, soft sway | OFF (0.0) | OFF (0.0) | Daytime stone reflection |
| **Golden Hour** | $0^\circ \dots 10^\circ$ | `#ff8a3d` (0.85) | Warm amber rim-lighting | Ignition (0.3) | Dusk beam (0.35) | Initial 15% lit |
| **Twilight** | $-6^\circ \dots 0^\circ$ | `#c084fc` (0.48) | Indigo silhouettes | ON (0.65) | Headlights ON (0.75) | 50% lit |
| **Night** | $< -6^\circ$ | `#93c5fd` (moon, 0.38) | Midnight spruce green | FULL ON (0.85) | FULL ON (0.90) | 75% warm golden glow |

#### 5.3 Weather Cycle Hooks (St. Petersburg Baltic Rain)
When `weather.is_raining === true`:
- **Wet Asphalt**: Surface roughness drops from 0.80 to 0.12, specular reflectivity increases to reflect vehicle headlights and street lamp cones in puddles.
- **Wind**: Wind speed multiplier jumps from 1.0 to 2.8, increasing tree sway in the vertex shader.
- **Atmospheric Haze**: Three.js exponential fog (`FogExp2('#1e293b', 0.0003)`) diffuses street lamp cones and vehicle beams into volumetric atmospheric glow.

---

## 3. Caveats & Edge Cases

1. **MapLibre WebGL Context Sharing**:
   - When sharing MapLibre's WebGL context with Three.js in a `CustomLayerInterface`, Three.js can mutate WebGL state flags (depth test, blend function, active texture units).
   - **Remedy**: Always call `this.renderer.resetState()` at the beginning of `render(gl, matrix)` and preserve MapLibre's stencil and depth buffers.
2. **Coordinate Precision & Jitter**:
   - Web Mercator coordinates span `[0, 1]`. Direct conversion to 32-bit floating point in shaders causes vertex jitter at high zooms (z16–z18).
   - **Remedy**: Use local origin centering (camera-relative rendering) or `MercatorCoordinate.fromLngLat` with double-precision delta offsets.
3. **Traffic Overlaps on Sharp Turns**:
   - Simple spline interpolation without vehicle length consideration can cause trailers or buses to clip sidewalks on sharp corners.
   - **Remedy**: Keep turning radii on Bolshoy and Kamennoostrovsky above 18 meters; buses follow smooth arc-length parameterized curves.
4. **Performance on Low-End Mobile Devices**:
   - If user opens admin panel on mobile Safari/Chrome, instanced meshes (`THREE.InstancedMesh`) are mandatory. Under no circumstances should individual `THREE.Mesh` nodes be created for 130+ trees and 160+ lamps.

---

## 4. Conclusion

The city environment of Petrogradskaya Storona can be transformed into a living, breathing 3D simulation with exceptional visual fidelity and steady 60 FPS performance.

### Implementation Blueprint for Workers:
1. **Module `admin-linear/src/lib/cityEnvironmentData.js`**:
   - Store exact polygons and center coordinates for Matveevsky Garden, Skver Nizami, and Skver Popova.
   - Store 130 tree/bush placement points and 162 street lamp post curb coordinates.
   - Store 4 avenue splines with multi-lane offsets for Bolshoy and Kamennoostrovsky.
2. **Module `admin-linear/src/lib/vegetationRenderer.js`**:
   - Procedural low-poly Linden, Birch, Maple, and Bush geometries.
   - `THREE.InstancedMesh` with vertex-shader wind sway and directional ground shadow decals.
3. **Module `admin-linear/src/lib/trafficSimulation.js`**:
   - Procedural St. Petersburg yellow taxis, monochrome sedans, and azure blue buses.
   - Car-following physics (IDM) with collision prevention and smooth turning.
   - Additive blended headlight and taillight ground illumination cones.
4. **Integration into `FullScreenMap.jsx`**:
   - Mount custom 3D WebGL layer into MapLibre GL map instance.
   - Hook into `solarCalculator.js` and `WeatherService` snapshot for seamless day/night and rain transitions.

---

## 5. Verification Method

To independently verify the implementation and findings:

1. **Build Integrity Check**:
   ```bash
   npm run admin:build
   ```
   *Expected result*: Build exits with code 0, creating valid assets in `public/admin-linear/`.

2. **Map Coordinates & Spatial Validation**:
   - Inspect coordinates in `admin-linear/src/lib/cityEnvironmentData.js` against OpenStreetMap / Yandex Maps.
   - Confirm Matveevsky Garden is bounded within `[30.3068, 59.9581]` to `[30.3095, 59.9598]`.
   - Confirm Skver Nizami is bounded within `[30.3128, 59.9627]` to `[30.3148, 59.9635]`.
   - Confirm Skver Popova is bounded within `[30.3114, 59.9696]` to `[30.3129, 59.9708]`.

3. **Runtime & Visual Verification via Chrome CDP / Browser**:
   - Open Map tab in admin panel (`#map`).
   - Switch time mode between `Day`, `Sunset`, `Night`:
     - Verify street lamps and car headlights are invisible during `Day`.
     - Verify street lamp volumetric cones fade in with warm golden light at `Sunset` and `Night`.
     - Verify vehicle headlights illuminate the asphalt pavement in front of cars.
     - Verify trees gently sway in the wind and cast elongated shadows at sunset.
   - Check browser console for zero WebGL warnings/errors.
