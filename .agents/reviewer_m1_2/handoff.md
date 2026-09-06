# Handoff Report — reviewer_m1_2

**Agent:** `reviewer_m1_2` (Reviewer & Adversarial Critic)  
**Milestone:** M1 (MapLibre GL Integration, Shaders & Visual Quality)  
**Working Directory:** `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/reviewer_m1_2`  
**Date:** 2026-09-04  

---

## 1. Observation

### 1.1 MapLibre GL Layer Stacking & Order
In `admin-linear/src/components/FullScreenMap.jsx`:
- Lines 261–286 define `'3d-buildings'` (`type: 'fill-extrusion'`) with `fill-extrusion-pattern: facadePatternId`.
- Lines 289–317 define `'3d-buildings-roof'` (`type: 'fill-extrusion'`) with `fill-extrusion-pattern: roofPatternId`.
- Lines 327–401 define road markings:
  ```javascript
  const beforeLayerId = '3d-buildings';
  ...
  map.addLayer({ id: 'road-dividing-lines', ... }, beforeLayerId);
  map.addLayer({ id: 'road-crosswalk-stripes', ... }, beforeLayerId);
  map.addLayer({ id: 'road-crosswalk-lines', ... }, beforeLayerId);
  ```
  Road markings (`'road-dividing-lines'`, `'road-crosswalk-stripes'`, `'road-crosswalk-lines'`) are inserted *before* `'3d-buildings'`, placing them beneath building geometry.
  `'3d-buildings-roof'` is inserted after `'3d-buildings'`, capping building tops.

### 1.2 Roof Elevation Calculation & Z-Fighting Prevention
In `admin-linear/src/components/FullScreenMap.jsx`:
- Lines 298–311:
  ```javascript
  'fill-extrusion-base': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14, 0,
      14.5, ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]
  ],
  'fill-extrusion-height': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14, 0,
      14.5, ['+', ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14], 0.12]
  ]
  ```
  The roof layer starts at base elevation $H$ and extrudes to $H + 0.12$m, creating a dedicated 12cm tin parapet and cap polygon strictly elevated above the wall tops.

### 1.3 Day / Sunset / Night Theme Switching
- In `admin-linear/src/components/FullScreenMap.jsx`:
  - Buttons (lines 1000–1040) trigger `setTimeMode('day')`, `setTimeMode('sunset')`, `setTimeMode('night')`, and `setTimeMode('auto')`.
  - Solar calculation hook `getSunData()` (lines 173–180) maps `timeMode` to astronomical solar elevations (hour 13 for day, 19.2 for sunset, 23 for night).
  - Effect hook (lines 794–814) detects theme changes and updates map styles and paint properties:
    ```javascript
    map.setPaintProperty('3d-buildings', 'fill-extrusion-pattern', facadePatternId);
    map.setPaintProperty('3d-buildings-roof', 'fill-extrusion-pattern', roofPatternId);
    ```
- In `admin-linear/src/lib/facadeTextureGenerator.js`:
  - Lines 1081–1142: `registerAllFacadePatterns(map)` and `registerAllRoofPatterns(map)` register textures with `{ pixelRatio: 32 }` using `ROOF_PIXEL_RATIO` and `FACADE_PIXEL_RATIO`.

### 1.4 Absence of Commercial Storefront Duplication
In `admin-linear/src/lib/facadeTextureGenerator.js`:
- Ground floor bays (lines 526–841) are rendered procedurally:
  - Bay 0 (x: 0..128): Classical residential entrance portal (*Парадная СПб*) with stone arch, keystone, wrought-iron fanlight transom, carved wooden doors, brass handles.
  - Bay 1 (x: 128..256): Generic architectural bakery/cafe vitrine with brass surround and warm amber glow. No brand logos or "Слой" text.
  - Bay 2 (x: 256..384): Generic botanical/grocer vitrine with dark grey surround and green fascia (`#15803d`). No brand logos or "ВкусВилл" text.
  - Bay 3 (x: 384..512): Generic fashion gallery vitrine with matte black frame and mannequin silhouette. No brand logos or "SHOWROOM" text.
- Verified absence of `fillText` or `strokeText` calls rendering brand logos on repeating facade canvases.

### 1.5 Downloaded CC0 PBR Textures
In `admin-linear/public/textures/`:
- `box_profile_metal_sheet_diff_1k.jpg` (346 KB, 1024x1024, Substance Designer)
- `granite_wall_diff_1k.jpg` (957 KB, 1024x1024, Substance Designer)
- `yellow_plaster_diff_1k.jpg` (647 KB, 1024x1024, Photoshop)
- `brick_bump.jpg` (803 KB, 1024x1024)
- `brick_diffuse.jpg` (1.09 MB, 1024x1024)
Copied and verified in `public/admin-linear/textures/` after build.

### 1.6 Independent Test & Build Execution
- Command: `node --test test/m1_facades_road_network.test.js`
  - Result: 12/12 tests passing, duration: 52.9ms, exit code 0.
- Command: `node --test test/m1_empirical_verification.test.js`
  - Result: 14/14 tests passing, duration: 865.7ms (including headless Chrome pixel sampling of the 512x512 canvas and GeoJSON polygon calculations), exit code 0.
- Command: `npm run admin:build`
  - Result: Vite v7.3.6 build succeeded in 3.15s, exit code 0.

---

## 2. Logic Chain

1. **Stacking Integrity:**
   By passing `beforeLayerId = '3d-buildings'` when registering `'road-dividing-lines'`, `'road-crosswalk-stripes'`, and `'road-crosswalk-lines'`, MapLibre GL places road markings underneath the extruded building geometries. By adding `'3d-buildings-roof'` after `'3d-buildings'`, the tin roof extrusion caps the building tops. This matches the requested layer hierarchy.

2. **Z-Fighting Elimination:**
   Because `fill-extrusion-base` of `'3d-buildings-roof'` is set to building height $H$ and `fill-extrusion-height` is set to $H + 0.12$m, the roof cap is non-coplanar with the building walls. In 32-bit WebGL depth buffers across zoom levels 14–18, a 12cm elevation delta provides sufficient separation to eliminate coplanar flicker (Z-fighting) while visually appearing as an authentic roof parapet.

3. **Theme Reactivity & Scaling:**
   Passing `pixelRatio: 32` when registering 512px patterns scales the vertical texture repeat to exactly $512 / 32 = 16$ meters, resolving the prior 32x bilinear blurriness. When theme buttons are pressed, `FullScreenMap.jsx` synchronously updates `setPaintProperty` for both walls and roofs, properly switching between day, sunset, and night patterns.

4. **Absence of Storefront Duplication:**
   Inspecting `drawSpbFacade` confirms that commercial brand signs were completely stripped from the repeating 512px canvas. Ground floor bays now render generic architectural elements (residential entrance portal, warm cafe vitrine, botanical vitrine, gallery vitrine). Specific brand storefronts are kept as dedicated single-instance GPS locations in `pedestrianData.js`.

5. **Integrity & Authenticity:**
   All 5 CC0 textures are verified 1024x1024 JPEG images with valid EXIF headers. There are no dummy mocks, no hardcoded test assertions, no bypasses, and no fabricated logs.

---

## 3. Caveats

- **Vector Tile Fallback:** Buildings without explicit `render_height` or `levels` attributes in the OpenMapTiles/Carto schema default to 14m via the `coalesce` expression. This is consistent across both wall and roof layers.
- **Hardware Acceleration:** Full visual rendering of MapLibre GL and Three.js custom layers requires WebGL2 support on the client browser.

---

## 4. Conclusion

**Verdict: APPROVE**

The work submitted for Milestone M1 (High-Quality SPb Facades, Roofs & Road Network) meets all architectural, visual, and code quality requirements. No integrity violations or regression defects were identified.

---

## 5. Verification Method

To independently reproduce and verify this review:
1. Run Milestone 1 unit tests:
   ```bash
   node --test test/m1_facades_road_network.test.js
   ```
2. Run empirical headless Chrome canvas pixel verification:
   ```bash
   node --test test/m1_empirical_verification.test.js
   ```
3. Run admin production build:
   ```bash
   npm run admin:build
   ```
4. Verify layer declarations and roof offset in `admin-linear/src/components/FullScreenMap.jsx` (lines 261–375).
5. Verify texture files in `admin-linear/public/textures/`:
   ```bash
   file admin-linear/public/textures/*
   ```
