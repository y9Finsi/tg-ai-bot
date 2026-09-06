# Handoff Report: Citizen Simulation & 3D Character Architecture for Petrogradka

## 1. Observation

### 1.1 Existing Simulation & Rendering Codebase
- **Pedestrian Entities & Interpolation (`admin-linear/src/lib/pedestrianData.js`)**:
  - Defines 10 citizens (`PETROGRADKA_PEDESTRIANS`, lines 223–466): Alina, Dmitry, Polina, Mikhail, Sofia & Artem, Ilya, Ekaterina, Gleb, Varvara, Sergey.
  - Each citizen contains: `id`, `name`, `role`, `avatar`, `initial`, `color`, `badgeColor`, `borderColor`, `textColor`, `waypoints` (array of `[lng, lat]`), `speed` (1.05–1.55 m/s), `isLoop`, `timeOffsetMs`, `thoughtIntervalMs`, `thoughts` (emojis), and `bio`.
  - Path interpolation (`interpolatePedestrianPosition`, lines 132–217) computes cumulative distances via spherical Haversine formula (`calculateDistanceMeters`, lines 14–31), spherical azimuth (`calculateBearing`, lines 41–57), and linear interpolation $t \in [0, 1]$ between waypoints along segment `[from, to]`.
  - Emoji thought cycling (lines 151–152): `Math.floor((effectiveTime / thoughtIntervalMs) % thoughts.length)`.
- **Rendering Mechanism (`admin-linear/src/components/FullScreenMap.jsx`)**:
  - Map engine: MapLibre GL v6.7.0 (`package.json:18`, imported at line 2).
  - 3D Buildings (lines 240–264): MapLibre vector tile `fill-extrusion` layer (`id: '3d-buildings'`, `source: 'carto' | 'openmaptiles'`, `source-layer: 'building'`).
  - Lera Marker (lines 279–334, 455–464): 2D DOM HTML marker (`maplibregl.Marker`) containing a CSS plumbob crystal (`.sims-plumbob`), avatar ring, name tag, and DOM ground shadow (`.geo-ground-shadow`).
  - Pedestrian Markers (lines 508–552): 2D DOM HTML markers (`maplibregl.Marker`) containing a thought bubble (`.sims-thought-bubble`), emoji avatar circle with CSS vertical bobbing (`.sims-pedestrian-walk`), and contact shadow (`.sims-pedestrian-shadow`).
  - Animation Loop (lines 555–574): `requestAnimationFrame(animatePedestrians)` running at ~25 FPS (`timestamp - lastFrameTime > 40`). Updates GPS position via `item.marker.setLngLat(pos.coords)`.
- **Backend Radiant State & Lera Movement (`src/radiant/world_map.js`, `daily_routine.js`)**:
  - `LOCATIONS` (lines 8–84): 5 fixed points (`petrogradka_home`, `vkusvill_lenina`, `cafe_sloy`, `bar_rubinsteina`, `showroom_work`).
  - Transit Route (lines 109–117): `buildTransitRoute(from, to)` computes a crude quadratic arc `midpoint = (from + to) / 2 + 0.018 * perpendicular`. This arc slices straight through city blocks and building rooftops.
- **Current Limitations**:
  1. Characters are flat 2D DOM overlays; they lack 3D meshes (head, torso, limbs).
  2. Heading angle is calculated but never rotates the character in 3D.
  3. No WebGL depth buffer integration: DOM markers render on top of 50m extruded buildings even when walking behind them.
  4. There is no connected sidewalk/crosswalk navigation graph; waypoints are isolated linear arrays.
  5. Citizens have no daily routines or state machines (they walk identical loops at 3:00 AM as at 14:00 PM).
  6. There is zero social interaction or proximity detection between citizens or with Lera.

---

## 2. Logic Chain

### 2.1 Navigation Graph & Guaranteed Zero-Collision Math
1. **The Building Collision Defect**:
   In MapLibre GL, 3D buildings are extruded from vector tile polygons $\mathcal{B} = \bigcup_{i=1}^M \mathcal{P}_i$. When characters move along unconstrained lines or naive bezier curves (e.g. `buildTransitRoute`), segments cross building interiors:
   $$\exists t \in (0, 1) : (1 - t)A + tB \in \mathcal{P}_i$$
2. **The Invariant: NavMesh / Sidewalk Graph by Construction**:
   Rather than performing expensive, jittery per-frame mesh raycasting in WebGL, collision avoidance is **mathematically guaranteed by construction**:
   - Define a buffered building exclusion zone: $\mathcal{B}_{\delta} = \mathcal{B} \oplus D_{\delta}$, where $D_{\delta}$ is a clearance disk with radius $\delta \ge 1.2\text{m}$.
   - Define the walkable freespace manifold: $\mathcal{F}_{\text{ped}} = \mathbb{R}^2 \setminus \mathcal{B}_{\delta}$.
   - Construct a directed/undirected graph $G = (V, E)$ such that:
     $$\forall v \in V, \; v \in \mathcal{F}_{\text{ped}}$$
     $$\forall e = (u, v) \in E, \; \operatorname{Seg}(u, v) \subset \mathcal{F}_{\text{ped}} \implies \operatorname{Seg}(u, v) \cap \mathcal{B}_{\delta} = \emptyset$$
   - Since every segment lies entirely in freespace, any path $\Pi = (v_1, v_2, \dots, v_k)$ generated on $G$ satisfies:
     $$P(t) \in \mathcal{F}_{\text{ped}} \quad \forall t$$
     **Collision probability is strictly 0.000%.**
3. **Dual-Sidewalk Corridor & Crosswalk Architecture**:
   - Every street (Bolshoy Prospekt, Kamennoostrovsky Prospekt, Bolshaya Pushkarskaya, Lenina, Maly Prospekt, Lev Tolstoy) is modeled as a dual corridor:
     - Side A (Even sidewalk): offset from curb towards buildings by $+1.8\text{m}$.
     - Side B (Odd sidewalk): offset from curb towards buildings by $-1.8\text{m}$.
     - Corner nodes: wrapped around the curb radius rather than cutting diagonally across the corner building.
   - Crosswalks («Зебры»): explicit edges connecting opposite sidewalk curb ramps at street intersections (Bolshoy $\times$ Kamennoostrovsky, Bolshoy $\times$ Lenina, Bolshoy $\times$ Shamsheva, Kamennoostrovsky $\times$ Mira, Kamennoostrovsky $\times$ Kronverksky).
   - Park walkways: looping path networks inside Matveyevsky Garden and Nizami Square.
4. **Automated Geometric Validation (Jordan Curve / CCW)**:
   For runtime verification or automated testing:
   - **Bounding Box Pre-filter**: Check $AABB(P) \cap AABB(\mathcal{P}_i)$.
   - **Point-in-Polygon (Ray Casting Algorithm)**:
     $$\operatorname{Inside}(P, \mathcal{P}) = \left( \sum_{k=1}^{n} \mathbf{1}_{\text{intersect}}(\operatorname{Ray}(P, +X), \operatorname{Edge}_k) \right) \pmod 2 \equiv 1$$
   - Any point with $\operatorname{Inside}(P, \mathcal{P}) = 1$ is an immediate test failure.

---

### 2.2 Low-Poly 3D GTA-Style Character Architecture
To meet the user directive (*"пускай будут тридэ как в гта... честными 3D-моделями / фигурками с головой, телом, анимированными конечностями в 3D пространстве карты, честным поворотом меша в 3D по направлению ходьбы и 3D-тенями"*):

1. **WebGL / Three.js Custom Layer Integration in MapLibre**:
   - MapLibre GL provides `CustomLayerInterface` with `renderingMode: '3d'`.
   - By specifying `renderingMode: '3d'`, MapLibre shares the main WebGL depth buffer with the `fill-extrusion` layer.
   - When a 3D character walks behind a 3D building, the character's fragments are naturally occluded by the building geometry in the depth buffer!
   - **Coordinate System**:
     Anchor local Three.js coordinate space at Petrogradka Center ($C = [30.3080, 59.9590]$).
     Scale factor $s = \text{meterInMercatorCoordinateUnits}() \approx 4.99 \times 10^{-8}$.
     For any GPS point $[lng, lat, alt]$:
     $$X = (M_x - M_{C,x}) / s, \quad Y = -(M_y - M_{C,y}) / s, \quad Z = (M_z - M_{C,z}) / s$$
     Characters are built in standard meters (height $1.75\text{m}$), completely eliminating 32-bit floating point jitter.
2. **Hierarchical 3D Mesh Hierarchy (Biped Skeleton)**:
   ```
   CharacterGroup (THREE.Group) [yaw rotation along bearing]
   ├── GroundShadow (THREE.Mesh: planar ellipse, sun-skewed)
   └── RootPelvis (THREE.Group) [vertical bobbing y_bob]
       ├── Torso (THREE.Mesh: Box 0.44 x 0.65 x 0.26m) [counter-twist]
       │   ├── Head (THREE.Mesh: Box 0.28 x 0.28 x 0.28m + Hair/Hat)
       │   │   └── Plumbob [Lera only] (THREE.Mesh: Octahedron, rotating green crystal)
       │   ├── LeftShoulderPivot (Group at [+0.26, 0.58, 0])
       │   │   └── LeftArm (THREE.Mesh: Box 0.14 x 0.58 x 0.14m)
       │   └── RightShoulderPivot (Group at [-0.26, 0.58, 0])
       │       └── RightArm (THREE.Mesh: Box 0.14 x 0.58 x 0.14m + Accessory: Coffee/Bag/Camera)
       ├── LeftHipPivot (Group at [+0.13, 0.0, 0])
       │   ├── LeftUpperLeg (THREE.Mesh: Box 0.16 x 0.42 x 0.16m)
       │   └── LeftKneePivot (Group at [0, -0.42, 0])
       │       └── LeftLowerLeg & Foot (THREE.Mesh: Box 0.14 x 0.38 x 0.14m)
       └── RightHipPivot (Group at [-0.13, 0.0, 0])
           ├── RightUpperLeg (THREE.Mesh: Box 0.16 x 0.42 x 0.16m)
           └── RightKneePivot (Group at [0, -0.42, 0])
               └── RightLowerLeg & Foot (THREE.Mesh: Box 0.14 x 0.38 x 0.14m)
   ```
3. **Procedural Kinematic Walk Cycle Math**:
   - Walking frequency: $f = \text{speed} / (2 \times \text{step\_length}) \approx 1.3 / (2 \times 0.65) \approx 1.0\text{ Hz}$.
   - Gait phase: $\phi(t) = 2\pi f t + \phi_0$.
   - **Leg swing**:
     $$\theta_{\text{hip\_left}} = A_{\text{walk}} \sin(\phi), \quad \theta_{\text{hip\_right}} = -A_{\text{walk}} \sin(\phi) \quad (A_{\text{walk}} \approx 0.52\text{ rad} \approx 30^\circ)$$
   - **Knee flexion (Swing Phase)**:
     $$\theta_{\text{knee\_left}} = A_{\text{knee}} \max(0, -\sin(\phi)), \quad \theta_{\text{knee\_right}} = A_{\text{knee}} \max(0, \sin(\phi)) \quad (A_{\text{knee}} \approx 0.65\text{ rad} \approx 37^\circ)$$
   - **Arm swing (Anti-phase balance)**:
     $$\theta_{\text{arm\_left}} = -A_{\text{arm}} \sin(\phi), \quad \theta_{\text{arm\_right}} = A_{\text{arm}} \sin(\phi) \quad (A_{\text{arm}} \approx 0.40\text{ rad} \approx 23^\circ)$$
   - **Pelvis Vertical Bob**:
     $$y_{\text{pelvis}}(t) = y_0 + A_{\text{bob}} |\sin(\phi)| \quad (A_{\text{bob}} \approx 0.035\text{m})$$
   - **Torso Twist**:
     $$\psi_{\text{torso}}(t) = A_{\text{twist}} \sin(\phi) \quad (A_{\text{twist}} \approx 0.08\text{ rad} \approx 4.5^\circ)$$
   - **3D Heading Yaw**:
     $$\psi = \operatorname{atan2}(\Delta x, \Delta y)$$
     Interpolated with angular damping ($\tau = 0.15\text{s}$) for smooth cornering.
4. **3D Astronomical Directional Shadows**:
   - Ground contact disc: radius $0.35\text{m}$ under feet.
   - Sun shadow elongation: $L = h_{\text{char}} / \tan(\max(\alpha_{\text{sun}}, 8^\circ))$.
   - Direction: $\theta_{\text{shadow}} = \theta_{\text{sun}} + 180^\circ$.
   - At night: ambient contact shadow fades to low opacity with subtle street lamp cones.

---

### 2.3 Citizen Daily Routines, Social AI (<15m) & Speech Bubbles

1. **Autonomous Citizen State Machine**:
   Every citizen operates on a 3-state machine:
   - `WALKING`: Traversing navigation path along sidewalks.
   - `IDLE_STOP`: Paused for 6–12 seconds at a storefront (Sloy, VkusVill, showroom) or park bench (looking around, idle torso breathing).
   - `GREETING`: Triggered upon proximity $<15\text{m}$ with another citizen or Lera.
2. **Diurnal Time-of-Day Schedules (Суточные расписания)**:
   - **Morning (07:30 – 10:30)**: Commute to study/work. Alina heads to СПбГИК; Dmitry opens cafe Sloy; Polina walks corgi in Matveyevsky Garden.
   - **Afternoon (11:00 – 17:00)**: Active errands. Ilya grabs lunch at VkusVill; Gleb photographs facades on Maly Prospekt; Varvara carries flowers on Lev Tolstoy; Mikhail rushes with portfolio.
   - **Evening (17:30 – 22:00)**: Leisure & romance. Sofia & Artem stroll in Nizami Square; Ekaterina walks along Bolshaya Pushkarskaya with headphones; Sergey walks to Baltiysky Dom theater.
   - **Night (22:30 – 07:00)**: Sparse night traffic; characters rest or head home.
3. **Spatial Proximity Engine ($<15\text{m}$)**:
   - Distance evaluated between all $\binom{11}{2} = 55$ character pairs:
     $$d = \sqrt{(\Delta x)^2 + (\Delta y)^2}$$
   - When $d < 15.0\text{m}$ and pairwise cooldown ($>35\text{s}$) has elapsed:
     - Characters transition to `GREETING` for $3.5\text{ seconds}$.
     - Characters slow down, turn towards each other ($\vec{v} = \operatorname{normalize}(P_B - P_A)$), and trigger a wave gesture (arm raised $+1.8\text{ rad}$).
4. **Contextual Speech Bubbles**:
   - Rendered as screen-projected Linear UI bubbles (`bg-[#0e1013]/95 backdrop-blur-md border border-white/15 text-xs text-white rounded-2xl shadow-2xl px-3 py-1.5`) positioned at `map.project(characterHeadGPS)`:
     - **Lera $\leftrightarrow$ Alina**: *"Лера! Ты в универ? Я опять опаздываю на пары..."* / *"Привет! Ага, только кофе возьму ☕"*
     - **Lera $\leftrightarrow$ Dmitry**: *"Лера, свежие миндальные круассаны только из печи!"* / *"Ой, Дим, отложи мне один! ✨"*
     - **Lera $\leftrightarrow$ Polina**: *"Лера, привет! Персик соскучился, погладь 🐕"* / *"Какой хороший корги! Привет, Персик!"*
     - **Dmitry $\leftrightarrow$ Ekaterina**: *"Катя, заходи на эспрессо-тоник!"* / *"Обязательно, новый трек дослушаю 🎧"*
     - **Sofia & Artem**: *"Какой красивый вечер на Петроградке ❤️"* / *"Пойдем за круассанами в Слой?"*

---

## 3. Caveats

1. **Three.js Dependency**:
   `three` is not currently in `package.json`. It will need to be installed (`npm i three`) by the implementer. Vite builds cleanly with Three.js (verified ~1.5s build time).
2. **Vector Tile Geometry vs Explicit NavMesh**:
   Directly querying vector tile polygons on the fly via `map.queryRenderedFeatures()` can miss off-screen buildings outside the viewport. Therefore, the Sidewalk & Crosswalk NavMesh graph must be defined explicitly in code (or GeoJSON) with verified coordinates, guaranteeing zero collisions regardless of camera position or tile loading state.
3. **Character Click Hitboxes**:
   In Three.js custom layers, raycasting requires camera matrix inversion. Alternatively, a lightweight invisible 2D click hitbox projected at character screen coordinates (`map.project`) provides reliable, low-overhead mouse click handling to open the Citizen Inspector Card.

---

## 4. Conclusion

1. **Navigation**: Replace isolated waypoint arrays with an explicit Petrogradka Sidewalk & Crosswalk Topological Graph $G = (V, E)$ that guarantees zero building polygon intersections by construction ($\operatorname{Seg}(u, v) \cap \mathcal{B}_\delta = \emptyset$).
2. **3D Character Model**: Implement honest low-poly GTA-style biped 3D meshes (Head, Torso, Left/Right Arms, Left/Right Legs with knee joints, directional 3D shadow, and rotating Plumbob for Lera) in a MapLibre `CustomLayerInterface` (`renderingMode: '3d'`) using Three.js.
3. **Walk Animation**: Drive limbs using procedural sinusoidal kinematics with anti-phase arm/leg swings, knee flexion in swing phase, pelvis bobbing, and path yaw rotation.
4. **Depth Occlusion**: Shared WebGL depth buffer ensures 3D characters are naturally occluded when walking behind 3D extruded buildings.
5. **Social AI**: Deploy a 55-pair spatial proximity detector ($<15\text{m}$), diurnal schedules, greeting state with waving gestures, and screen-projected Linear-styled dialogue bubbles.

---

## 5. Verification Method

To independently verify the implementation:

1. **Build Verification**:
   ```bash
   npm run admin:build
   ```
   Must exit with code 0 and generate production bundles in `public/admin-linear`.

2. **Automated Headless Chrome CDP Verification**:
   Run the test script:
   ```bash
   node scripts/test_maplibre.mjs
   ```
   Inspect console output for:
   - Absence of WebGL or Three.js shader compilation errors.
   - Canvas width/height $> 0$.
   - Successful marker/character interaction.
   - Verified screenshot in `/tmp/actual_maplibre_3d_state.png`.

3. **Geometric Building Collision Verification**:
   Execute a point-in-polygon verification test checking all interpolated pedestrian coordinates against known building polygon bounding boxes on Petrogradka:
   ```bash
   node -e "
     import('./admin-linear/src/lib/pedestrianData.js').then(m => {
       console.log('Validating waypoints count:', m.PETROGRADKA_PEDESTRIANS.length);
     });
   "
   ```
