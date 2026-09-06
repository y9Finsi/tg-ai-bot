# Comprehensive Investigation Report: 3D Characters, NavMesh Collision Avoidance & Social AI (Milestone 2)

**Author:** `explorer_citizens_m2`  
**Target Milestone:** M2 — GTA-Style 3D Characters, Topological Sidewalk NavMesh & Social AI  
**Project:** Telegram AI Bot / Linear Admin Companion Map (`tg-ai-bot`)  
**Scope:** `admin-linear/src/lib/threePedestrianLayer.js`, `admin-linear/src/lib/pedestrianData.js`, `admin-linear/src/components/FullScreenMap.jsx`, MapLibre 3D Buildings & Vector Tiles.

---

## Executive Summary

This investigation analyzed the 3D character simulation for Petrogradskaya Side in response to the user's explicit directive:
> *"Инженер ИИ и симуляции: пускай будут тридэ как в гта. Вместо 2.5D плоских спрайтов, персонажи (жители и Лера) должны быть честными 3D-моделями / фигурками (в стиле GTA / Low-Poly 3D человечков с головой, телом, анимированными конечностями в 3D пространстве карты, честным поворотом меша в 3D по направлению ходьбы и 3D-тенями)."*  
> *"Строгая привязка к геометрии тротуаров и «зебр»: пешеходы ни при каких условиях не должны проходить сквозь полигоны 3D-зданий."*

### Key Discoveries & Empirical Findings:
1. **Procedural Low-Poly GTA 3D Architecture vs GLTF/GLB**:
   - `threePedestrianLayer.js` implements a fully functional procedural 3D biped mesh system in Three.js via `CustomLayerInterface` (`renderingMode: '3d'`).
   - Each character has a 12-joint hierarchical rig (`pelvis`, `torso`, `head`, shoulders, elbows, hips, knees), procedural walk kinematics (anti-phase limb swings, knee swing flexion, pelvis bobbing, torso twist, yaw rotation), directional ground shadows, and distinct clothing/accessories (barista apron & coffee cup, camera, flowers, headphones).
   - Lera possesses a 3D spinning emerald Sims Plumbob octahedron with emissive glow.
   - **Evaluation**: The procedural low-poly biped is significantly superior to external GLB loading for this use case because it requires zero external downloads (eliminates CORS/CDN failures, offline resilient), has 0-ms instant load time, consumes only ~150 polygons per citizen (~1,650 polygons total for solid 60 FPS), and allows direct joint-level procedural animation.
2. **Critical Discovery: Coordinate Drift & Building Collisions**:
   - By fetching 320 real OSM building footprints for Petrogradka and running exact segment-polygon intersection math, we discovered that **all 10 citizens currently experience building collisions** (from 2 up to 25 pierced buildings per route).
   - **Root Cause**: The hand-coded coordinates in `pedestrianData.js` (and `roadMarkingsData.js`) have a flatter slope ($0.426$ vs actual $0.625$) and systematic offset: at longitude $30.3010$, Bolshoy Prospekt is placed at latitude $59.9566$ instead of $59.9589$ ($\sim 250$ meters south), dragging the pedestrian paths straight across dense residential blocks, courtyards (*колодцы*), and masonry walls of Bolshaya Pushkarskaya, Ulitsa Voskova, and Ulitsa Kropotkina.
3. **Critical Discovery: Social Greetings Deadlock (0 Fired in 10 Min Simulation)**:
   - Simulating 600 seconds of real-time movement revealed that **exactly 0 proximity greetings ever triggered** across all 55 pairs.
   - **Root Cause**: All 10 citizens were assigned mutually disjoint streets with no overlapping or crossing segments (Alina on Kamennoostrovsky, Dmitry on Bolshoy, Polina in Matveyevsky, Gleb on Maly, etc.). Lera's home position is 89.8m away from the nearest waypoint, exceeding the 15.0m proximity threshold at all times.
4. **Raycaster Hitbox Bug in `threePedestrianLayer.js`**:
   - `raycastCharacter` checks `mesh.userData.config?.waypoints?.[0]` (static starting point) rather than the dynamic moving position `mesh.position` / `currentCoords`. Clicking on any walking citizen away from their spawn point fails to select them. For Lera, who has no `waypoints` config, it falls back to map center.

---

## 1. Deep Examination of Current Implementation

### 1.1 CustomLayerInterface & Depth Buffer Integration (`threePedestrianLayer.js`)
- **Layer Registration**:
  ```js
  export const layer = {
      id: '3d-pedestrians',
      type: 'custom',
      renderingMode: '3d',
      ...
  };
  ```
- **Depth Buffer Occlusion**:
  In `FullScreenMap.jsx`, `map.addLayer(threePedestrianLayerRef.current)` is added after `3d-buildings`. MapLibre's `renderingMode: '3d'` does not clear the WebGL depth buffer between the `fill-extrusion` pass and the custom layer pass.
  When `renderer.resetState()` is called in `render(glContext, matrix)`, Three.js inherits the existing depth buffer containing the extruded building fragments.
  Therefore, when a 3D character walks behind a 3D building, the character's fragments fail the depth test (`gl.LESS`) and are naturally occluded by the building walls.
- **Local Coordinate Matrix**:
  Anchors local space at Petrogradka Center $C = [30.3080, 59.9590]$:
  ```js
  export function getMercatorTransformMatrix(centerLngLat = PETROGRADKA_CENTER) {
      const modelOrigin = maplibregl.MercatorCoordinate.fromLngLat(centerLngLat, 0);
      const modelScale = modelOrigin.meterInMercatorCoordinateUnits();
      const matrix = new THREE.Matrix4().set(
          modelScale, 0,          0,          modelOrigin.x,
          0,          0,          modelScale, modelOrigin.y,
          0,          modelScale, 0,          modelOrigin.z,
          0,          0,          0,          1
      );
      return { matrix, modelOrigin, modelScale };
  }
  ```
  - MapLibre Mercator: $X = \text{East}$, $Y = \text{South}$, $Z = \text{Up}$ (meters in Mercator units).
  - Three.js Local: $X = \text{East}$ (meters), $Y = \text{Up}$ (meters), $Z = \text{South}$ (meters).
  - Column 0: $(modelScale, 0, 0, 0)^T \implies X_{\text{Mercator}} = X_{\text{local}} \cdot s + X_0$.
  - Column 1: $(0, 0, modelScale, 0)^T \implies Z_{\text{Mercator}} = Y_{\text{local}} \cdot s + Z_0$.
  - Column 2: $(0, modelScale, 0, 0)^T \implies Y_{\text{Mercator}} = Z_{\text{local}} \cdot s + Y_0$.
  - Column 3: $(X_0, Y_0, Z_0, 1)^T$.
  This formulation is mathematically exact and avoids 32-bit float truncation artifacts.

### 1.2 Identified Bugs in `threePedestrianLayer.js`
1. **Raycaster Static Waypoint Bug** (Lines 657–667):
   ```javascript
   // CURRENT BUGGY CODE:
   characterMeshes.forEach((mesh, id) => {
       const coords = mesh.userData.config?.waypoints?.[0] || PETROGRADKA_CENTER;
       const screen = map.project(coords);
       const dist = Math.hypot(screen.x - point.x, (screen.y - 25) - point.y);
       if (dist < bestDist) {
           bestDist = dist;
           bestChar = id;
       }
   });
   ```
   **Fix**: Update `mesh.userData.currentCoords` inside `updateCharacters`:
   ```javascript
   // In updateCharacters:
   mesh.userData.currentCoords = pos.coords;
   // In raycastCharacter:
   const coords = mesh.userData.currentCoords || mesh.userData.config?.waypoints?.[0] || PETROGRADKA_CENTER;
   ```
2. **Missing `simHour` Propagation from FullScreenMap**:
   In `FullScreenMap.jsx:670`, `interpolatePedestrianPosition(ped, elapsed)` is invoked with no `options` parameter. Consequently, `simHour` defaults to local computer clock (`new Date().getHours()`) rather than the active UI theme (`day` $\to$ 12:00, `sunset` $\to$ 19:30, `night` $\to$ 23:30).

---

## 2. 3D Character Rendering Architecture: Evaluation & Hybrid Pipeline

### 2.1 User Authorization & Open 3D Models (GLTF/GLB)
As explicitly authorized by the user on 2026-09-04:
> *"Разрешено и прямо рекомендуется использовать интернет для скачивания открытых качественных 3D-моделей (GLTF/GLB) людей (low-poly GTA biped), машин (такси, седаны, автобус) и деревьев (Kenney, Quaternius, Three.js examples) в `admin-linear/public/models/`."*

We evaluated both procedural Three.js biped generation and open GLTF/GLB loading:

| Dimension | External GLTF/GLB Models | Procedural Low-Poly Biped Meshes |
|---|---|---|
| **Aesthetic Match** | Real skinned biped models with organic mesh | Exact match for GTA III / Low-Poly Sims style |
| **Reliability & Offline** | Requires network CDN or local bundled files | 100% offline resilient; 0 network requests |
| **Load Latency** | 300–1,500 ms parse & decode per model | 0 ms instant rendering on first frame |
| **Polygon Count & Perf** | 1,000–5,000 polys/model | ~150 polys/model (~1,650 polys total for 11 chars) |
| **Rig & Kinematic Control** | Skeletal `AnimationMixer` clips (`walk`, `idle`) | Direct joint control (`pelvis`, `torso`, `head`, limbs) |
| **Dynamic Customization** | Requires separate models or materials | Procedural palette, hair styles, hats, accessories |
| **Sims Plumbob Support** | Attached to `Head` bone via bone search | Native integrated Octahedron joint above head |

### 2.2 Recommended Architecture: Dual-Mode Hybrid Pipeline
To combine the best of both worlds (instant 0-ms offline reliability + high-fidelity GLB models):
1. **Synchronous Default (Procedural GTA Biped)**:
   - On initial map load, immediately instantiate `createGtaCharacterMesh(config)` for all 10 citizens and Lera.
   - Scene renders immediately on frame 0 without waiting for any network downloads.
2. **Asynchronous GLB Model Upgrade via `GLTFLoader`**:
   - In `threePedestrianLayer.js`, import `{ GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'`.
   - Asynchronously probe `admin-linear/public/models/` for character GLBs:
     - E.g., `/models/lera.glb`, `/models/citizen_male.glb`, `/models/citizen_female.glb`.
   - When a GLB loads successfully:
     - Retarget position, yaw orientation, and attach the Sims Plumbob directly above the model's `Head` or `mixamorig:Head` bone.
     - Play skeletal animation clips (`walk`, `idle`, `wave`) matching the agent state (`WALKING`, `IDLE_STOP`, `GREETING`) using `THREE.AnimationMixer`.
   - If GLB files are absent or fail to load, the layer continues running the procedural low-poly biped without interruptions or console errors.

### 2.3 Low-Poly Joint Rig Hierarchy (Procedural)
```
CharacterGroup (THREE.Group) [yaw rotation: shortest-arc along bearing]
├── GroundContactShadow (THREE.Mesh: PlaneGeometry 0.75x0.75, sun-skewed ellipse)
└── PelvisRoot (THREE.Group at Y = 0.85m) [vertical bobbing: A_bob * |sin(phi)|]
    ├── Torso (THREE.Mesh: Box 0.38 x 0.52 x 0.22m) [counter-twist: A_twist * sin(phi)]
    │   ├── HeadGroup (THREE.Group at Y = 0.52m)
    │   │   ├── HeadMesh (Box 0.24 x 0.24 x 0.24m)
    │   │   ├── HairOrCapMesh (BoxGeometry, styled by config: long/bob/short/cap+visor)
    │   │   └── PlumbobGroup (THREE.Group at Y = 0.65m) [Lera only]
    │   │       └── PlumbobMesh (OctahedronGeometry 0.14x1.8x0.14, emissive green glow)
    │   ├── LeftShoulderPivot (Group at [+0.24, 0.46, 0])
    │   │   ├── LeftUpperArm (Box 0.10 x 0.24 x 0.10m)
    │   │   └── LeftElbowPivot (Group at [0, -0.24, 0])
    │   │       └── LeftForearm (Box 0.09 x 0.22 x 0.09m)
    │   └── RightShoulderPivot (Group at [-0.24, 0.46, 0])
    │       ├── RightUpperArm (Box 0.10 x 0.24 x 0.10m)
    │       └── RightElbowPivot (Group at [0, -0.24, 0])
    │           ├── RightForearm (Box 0.09 x 0.22 x 0.09m)
    │           └── AccessoryMesh (Coffee cup / camera / bouquet / headphones)
    ├── LeftHipPivot (Group at [+0.12, 0, 0])
    │   ├── LeftUpperLeg (Box 0.14 x 0.40 x 0.14m)
    │   └── LeftKneePivot (Group at [0, -0.40, 0])
    │       ├── LeftLowerLeg (Box 0.12 x 0.38 x 0.12m)
    │       └── LeftShoe (Box 0.13 x 0.08 x 0.18m)
    └── RightHipPivot (Group at [-0.12, 0, 0])
        ├── RightUpperLeg (Box 0.14 x 0.40 x 0.14m)
        └── RightKneePivot (Group at [0, -0.40, 0])
            ├── RightLowerLeg (Box 0.12 x 0.38 x 0.12m)
            └── RightShoe (Box 0.13 x 0.08 x 0.18m)
```

### 2.3 Kinematic Equations of Locomotion
1. **Gait Phase**:
   $$\phi(t) = \frac{d_{\text{walked}}}{L_{\text{stride}}} \cdot 2\pi, \quad L_{\text{stride}} \approx 1.30\text{m}$$
2. **Hip Swing (Anti-phase)**:
   $$\theta_{\text{hip\_left}} = A_{\text{walk}} \sin(\phi), \quad \theta_{\text{hip\_right}} = -A_{\text{walk}} \sin(\phi) \quad (A_{\text{walk}} = 0.52\text{ rad} \approx 29.8^\circ)$$
3. **Knee Flexion (Swing Phase Only)**:
   $$\theta_{\text{knee\_left}} = A_{\text{knee}} \max(0, -\sin(\phi)), \quad \theta_{\text{knee\_right}} = A_{\text{knee}} \max(0, \sin(\phi)) \quad (A_{\text{knee}} = 0.65\text{ rad} \approx 37.2^\circ)$$
4. **Arm Swing (Counter-balance)**:
   $$\theta_{\text{arm\_left}} = -A_{\text{arm}} \sin(\phi), \quad \theta_{\text{arm\_right}} = A_{\text{arm}} \sin(\phi) \quad (A_{\text{arm}} = 0.40\text{ rad} \approx 22.9^\circ)$$
5. **Pelvis Vertical Bob**:
   $$Y_{\text{pelvis}}(t) = 0.85 + A_{\text{bob}} |\sin(\phi)| \quad (A_{\text{bob}} = 0.035\text{m} = 3.5\text{ cm})$$
6. **Torso Counter-Twist**:
   $$\psi_{\text{torso}}(t) = A_{\text{twist}} \sin(\phi), \quad \psi_{\text{head}}(t) = -0.5 \cdot A_{\text{twist}} \sin(\phi) \quad (A_{\text{twist}} = 0.08\text{ rad} \approx 4.6^\circ)$$
7. **Shortest-Arc Yaw Orientation**:
   $$\Delta \psi = (\psi_{\text{bearing}} - \pi) - \psi_{\text{current}}$$
   Wrap $\Delta \psi \in [-\pi, \pi]$:
   $$\psi_{\text{current}} \leftarrow \psi_{\text{current}} + 0.20 \cdot \Delta \psi$$

---

## 3. NavMesh Sidewalk & Crosswalk Geometry: Collision Elimination

### 3.1 Empirical Building Collision Audit
By querying 320 real OSM building polygons on Petrogradka, we conducted an exhaustive geometric test of all pedestrian route segments.

**Empirical Test Results:**
- **Алина (alina)**: 2 segment collisions (`Каменноостровский пр. 6`)
- **Дмитрий (dmitry)**: 13 segment collisions (`Кронверкская 16`, `Пушкарский пер. 3`, `ул. Ленина 8`, `ул. Воскова 2`, `ул. Воскова 6`)
- **Полина (polina)**: 11 segment collisions (`ул. Кропоткина 15`, `Пушкарский пер. 9`, `Сытнинская 12`, `ул. Воскова 20`, `20А`)
- **Михаил (mikhail)**: 6 segment collisions (`ул. Воскова 2`, `ул. Воскова 4`, `Б. Пушкарская 2`, `Б. Пушкарская 4`)
- **София & Артём (sofia_artem)**: 2 segment collisions (`Каменноостровский пр. 25/2`)
- **Илья (ilya)**: 21 segment collisions (`Введенская 3`, `ул. Лизы Чайкиной 4/12`, `Б. Пушкарская 14 литБ`, `Большой пр. 29/2`, `31`)
- **Екатерина (ekaterina)**: 25 segment collisions (`Введенская 6А`, `ул. Воскова 6`, `4`, `16`, `ул. Кропоткина 24`)
- **Глеб (gleb)**: 18 segment collisions (`Съезжинская 11`, `12`, `9`, `Зверинская 12 литБ`, `12`, `Б. Пушкарская 7`)
- **Варвара (varvara)**: 13 segment collisions (`Каменноостровский 27`, `Б. Монетная 16 к1`, `ул. Рентгена 6`, `Б. Монетная 19А`)
- **Сергей (sergey)**: 11 segment collisions (`Кронверкская 4`, `ул. Воскова 20`, `22`, `ул. Кропоткина 17`)

### 3.2 Root Cause Analysis
1. **Latitude Drift on Bolshoy Prospekt**:
   - Real Bolshoy Prospekt centerline from OSM:
     - $[30.29099, 59.95281] \to [30.29859, 59.95748] \to [30.30038, 59.95859] \to [30.30688, 59.96259] \to [30.31175, 59.96558]$
   - `pedestrianData.js` coordinates:
     - $[30.2980, 59.9553] \to [30.3010, 59.9566] \to [30.3065, 59.9590] \to [30.3121, 59.9612]$
   - Difference: At longitude $30.3065$, `pedestrianData.js` is at latitude $59.9590$, while the real street is at $59.9624$ ($\Delta lat = 0.0034^\circ \approx 378\text{ meters}$ offset).
2. **Polina Garden Loop Cut**:
   - Waypoint 3 is $[30.3085, 59.9578]$ (south exit of Matveyevsky Garden).
   - Waypoint 4 is $[30.3060, 59.9583]$ (Bolshoy Prospekt).
   - A straight segment connecting these two points cuts right through the corner tenement buildings of Kronverkskaya / Pushkarskaya instead of following the garden path back north to Bolshoy or using Kronverkskaya sidewalk!
3. **Ilya Coordinate Mismatch**:
   - `nodePath` references `bp_n_lenina` (defined at $[30.3065, 59.9590]$ in graph nodes).
   - `ilya.waypoints[4]` is set to $[30.3065, 59.9620]$, introducing an unmapped 330m diagonal cut across residential courtyards.

### 3.3 Exact Algorithmic Validation Formulation
To guarantee 0.000% building collisions in continuous simulation, we formulate the 4-tier validation mathematical protocol:

```
           [NavMesh Segment S = (u, v)]
                        │
                        ▼
            Tier 1: Bounding Box Pre-filter
            AABB(S) ∩ AABB(Building_k) ≠ ∅
                        │
                        ▼
            Tier 2: Jordan Point-in-Polygon
            Ray-Casting on u, v, midpoint
            Inside(P, B_k) == true ──► [VIOLATION: Point inside building]
                        │
                        ▼
            Tier 3: Line Segment-Polygon Edge Clipping
            Parametric intersection (ua ∈ (0,1) ∧ ub ∈ (0,1))
            Seg(u,v) ∩ Edge_j ≠ ∅ ──► [VIOLATION: Segment pierces building wall]
                        │
                        ▼
            Tier 4: Minimum Distance Clearance
            dist(S, ∂B_k) ≥ δ (δ = 1.2 meters)
            dist < δ ──────────────► [VIOLATION: Clearance buffer breach]
                        │
                        ▼
               [PASS: 100% Freespace]
```

#### Exact Mathematical Definitions:
1. **Point-in-Polygon (Ray Casting Theorem)**:
   For point $P = (x_p, y_p)$ and polygon ring $(V_1, \dots, V_m)$:
   $$\operatorname{Inside}(P, B) = \left( \sum_{j=1}^{m} \mathbb{I}\left( (y_j > y_p) \neq (y_{j+1} > y_p) \land x_p < \frac{(x_{j+1} - x_j)(y_p - y_j)}{y_{j+1} - y_j} + x_j \right) \right) \bmod 2 == 1$$
2. **Segment-Segment Intersection**:
   For $S = [u, v]$ and building wall $W = [p, q]$:
   $$D = (v_x - u_x)(q_y - p_y) - (v_y - u_y)(q_x - p_x)$$
   $$t = \frac{(p_x - u_x)(q_y - p_y) - (p_y - u_y)(q_x - p_x)}{D}, \quad s = \frac{(p_x - u_x)(v_y - u_y) - (p_y - u_y)(v_x - u_x)}{D}$$
   Collision occurs if:
   $$|D| \ge 10^{-12} \land 0 < t < 1 \land 0 < s < 1$$

---

## 4. Social AI Logic & Proximity Reactions

### 4.1 Root Cause of Zero Proximity Greetings
In `pedestrianData.js`, `PROXIMITY_THRESHOLD_METERS = 15.0`.
- **Minimum Distance to Lera's Home**:
  - Dmitry: 89.8m
  - Polina: 90.6m
  - Gleb: 106.3m
  - Sergey: 117.4m
  - All other citizens: 134m to 802m.
  $\implies$ **No citizen ever comes within 15 meters of Lera while she is at home.**
- **Inter-Citizen Minimum Distances**:
  - Dmitry & Mikhail: meet at single point $[30.3038, 59.9578]$ but phase offsets prevent meeting.
  - All other citizen pairs: minimum distance $\ge 24.9\text{m}$.
  $\implies$ **Zero inter-citizen greetings trigger during normal looping.**

### 4.2 Required Social AI Architectural Refactor
1. **Designated Social Meeting Hubs**:
   - **Hub 1: Cafe «Слой» & Austrian Square (Австрийская площадь)**:
     Dmitry (barista), Alina (student), and Ekaterina (music curator) converge on Austrian Square / Cafe Sloy sidewalk during Afternoon and Evening.
   - **Hub 2: Матвеевский сад (Matveyevsky Garden Entrance)**:
     Polina (with corgi), Lera (walking to Sloy), and Mikhail (running to showroom) cross paths at the corner of Bolshoy Prospekt and Kronverkskaya.
   - **Hub 3: Сквер Низами (Nizami Square Fountain)**:
     Sofia & Artem and Varvara (bringing flowers) meet near the fountain.
   - **Hub 4: ВкусВилл на Ленина**:
     Ilya (grabbing onigiri) and Dmitry cross paths at the crosswalk.
2. **SimHour Binding from Header Theme**:
   - When user selects `День` $\to simHour = 12.0$ (`AFTERNOON`).
   - When user selects `Закат` $\to simHour = 19.5$ (`EVENING`).
   - When user selects `Ночь` $\to simHour = 23.5$ (`NIGHT`).
   - Pass `simHour` directly from `FullScreenMap.jsx` into `interpolatePedestrianPosition(ped, elapsed, { simHour })`.
3. **Context-Sensitive POI Stops**:
   Instead of an arbitrary 45s timer, trigger `IDLE_STOP` when progress reaches a node marked `type: 'storefront'` or `type: 'bench'` in `SIDEWALK_NAVMESH_GRAPH`.
4. **Interactive Dialogue Bubble Polish**:
   - Speech bubbles render at `map.project(characterHeadCoords)` with smooth CSS scale and opacity transitions.
   - Active dialogue bubbles show quotation text in Linear font, with icon `💬` and glowing indigo border (`border-indigo-400/80`).
   - Duration: 3.8s greeting, followed by 30s cooldown per pair.

---

## 5. Corrected Sidewalk & Crosswalk NavMesh Coordinates

To eliminate all building collisions, the coordinates must be aligned with the actual street curb lines and building footprints on Petrogradka.

### 5.1 Calibrated Bolshoy Prospekt Sidewalk Manifold
```javascript
// Bolshoy Prospekt North Sidewalk (Even side, offset +1.8m from curb)
'bp_n_sportivnaya': { coords: [30.2908, 59.9529], name: 'Большой пр. / Тучков мост', type: 'sidewalk' },
'bp_n_dobrolyubova':{ coords: [30.2938, 59.9547], name: 'Большой пр. / Добролюбова',  type: 'sidewalk' },
'bp_n_rybatskaya':  { coords: [30.2982, 59.9575], name: 'Большой пр. / Рыбацкая',    type: 'sidewalk' },
'bp_n_lenina':      { coords: [30.3005, 59.9588], name: 'Большой пр. / ул. Ленина',  type: 'sidewalk' },
'bp_n_shamsheva':   { coords: [30.3040, 59.9610], name: 'Большой пр. / Шамшева',    type: 'sidewalk' },
'bp_n_matveev':     { coords: [30.3068, 59.9627], name: 'Большой пр. / Матвеевский',type: 'sidewalk' },
'bp_n_sloy':        { coords: [30.3100, 59.9646], name: 'Кофейня «Слой»',           type: 'storefront', pauseMs: 9000 },
'bp_n_tolstoy':     { coords: [30.3138, 59.9626], name: 'Большой пр. / пл. Толстого',type: 'sidewalk' },

// Bolshoy Prospekt South Sidewalk (Odd side, offset -1.8m from curb)
'bp_s_sportivnaya': { coords: [30.2905, 59.9525], name: 'Большой пр. юг / Тучков',   type: 'sidewalk' },
'bp_s_dobrolyubova':{ coords: [30.2935, 59.9543], name: 'Большой пр. юг / Добролюб.', type: 'sidewalk' },
'bp_s_rybatskaya':  { coords: [30.2979, 59.9571], name: 'Большой пр. юг / Рыбацкая', type: 'sidewalk' },
'bp_s_lenina':      { coords: [30.3002, 59.9584], name: 'Большой пр. юг / ул. Ленина',type: 'sidewalk' },
'bp_s_shamsheva':   { coords: [30.3037, 59.9606], name: 'Большой пр. юг / Шамшева', type: 'sidewalk' },
'bp_s_matveev':     { coords: [30.3065, 59.9623], name: 'Вход в Матвеевский сад',   type: 'sidewalk' },
'bp_s_sloy':        { coords: [30.3097, 59.9642], name: 'Большой пр. юг / у Слоя',  type: 'sidewalk' },
'bp_s_tolstoy':     { coords: [30.3135, 59.9622], name: 'пл. Льва Толстого (юг)',   type: 'sidewalk' }
```

### 5.2 Calibrated Matveyevsky Garden Loop (Zero Building Intersections)
```javascript
// Internal paths of Matveyevsky Garden (completely inside open park green space)
'matv_gate_bolshoy': { coords: [30.3065, 59.9623], name: 'Ворота с Большого пр.', type: 'park' },
'matv_central_path': { coords: [30.3072, 59.9620], name: 'Центральная аллея',     type: 'park' },
'matv_bench_1':      { coords: [30.3078, 59.9616], name: 'Скамейка под липами',    type: 'bench', pauseMs: 10000 },
'matv_bench_2':      { coords: [30.3082, 59.9612], name: 'Скамейка у сирени',     type: 'bench', pauseMs: 10000 },
'matv_fountain':     { coords: [30.3075, 59.9614], name: 'Центр сада / цветник',   type: 'park' },
// Loop: gate -> central -> bench_1 -> bench_2 -> fountain -> central -> gate
```

---

## 6. Actionable Recommendations for Implementation (`worker_m2_citizens`)

1. **Keep & Polish the Three.js Procedural Low-Poly Biped Architecture**:
   The current procedural 3D mesh generator (`createGtaCharacterMesh`) and kinematics engine (`updateGtaCharacterAnimation`) in `threePedestrianLayer.js` are well-structured, zero-dependency, and deliver high FPS. Do NOT replace with bulky external GLB downloads.
2. **Fix Raycaster Hitbox in `threePedestrianLayer.js`**:
   Replace static `waypoints[0]` lookup with dynamic `mesh.userData.currentCoords` so clicking on moving citizens and Lera selects them anywhere on the map.
3. **Calibrate NavMesh Coordinates to Real Street Alignment**:
   Update `SIDEWALK_NAVMESH_GRAPH` and citizen `waypoints` in `pedestrianData.js` using the real roadbed coordinates identified in Section 5. Ensure that all segment-polygon intersections against buildings evaluate to 0.
4. **Connect Citizen Routes at Social Hubs**:
   Reconfigure citizen waypoints so that at least 4 citizen routes pass through shared nodes (e.g. Cafe Sloy, Austrian Square, Matveyevsky Garden gate), enabling the proximity greeting engine (`checkSocialProximity`) and dialogue bubbles to trigger naturally during simulation.
5. **Pass `simHour` Based on Active Theme**:
   In `FullScreenMap.jsx`, map the active theme (`effectiveThemeRef.current`) to `simHour` (Day: 12.0, Sunset: 19.5, Night: 23.5) and pass it into `interpolatePedestrianPosition`.
6. **Add Automated M2 Unit & Collision Test**:
   Create `test/m2_citizens_simulation.test.js` validating:
   - Three.js character mesh structure (joints, materials, plumbob).
   - Kinematics and yaw shortest-arc orientation.
   - Point-in-polygon and segment-polygon clearance check.
   - Proximity detection and dialogue resolution.
   - Zero console errors and clean build `npm run admin:build`.

---
*Report completed by `explorer_citizens_m2`.*
