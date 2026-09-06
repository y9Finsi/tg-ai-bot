# Handoff Report — worker_m1_facades

**Agent:** `worker_m1_facades` (Worker: implementer, qa, specialist)  
**Milestone:** M1 (High-Quality SPb Facades, Roofs & Road Network)  
**Working Directory:** `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m1_facades`  
**Date:** 2026-09-04  

---

## 1. Observation

1. **MapLibre Elevation Ratio & Blurriness:**
   In `admin-linear/src/lib/facadeTextureGenerator.js`, patterns were previously registered via:
   ```javascript
   map.addImage(id, imageData);
   ```
   Without specifying `{ pixelRatio: 32 }`, MapLibre GL defaults to `pixelRatio = 1.0`. At $512 \times 512$ canvas resolution and 1px per meter elevation factor in `fill_extrusion_pattern.vertex.glsl`, typical 16-meter tall building walls were textured using only $\approx 16$ vertical pixels (3.125% of texture height), causing extreme 32x blurriness.

2. **Roof Texture Bleed:**
   In MapLibre GL, `fill-extrusion-pattern` applies the exact same canvas image to top surfaces (normal $(0, 0, 1)$) as it does to vertical walls. Because the single extrusion layer `'3d-buildings'` contained window rhythms, pediments, and storefronts, roofs were rendered with arbitrary slices of windows and store signs.

3. **Repeated Storefront Logos on Residential Buildings:**
   The generic repeating 512px residential facade canvas had previously baked «Слой», «ВкусВилл», and Showroom logos into Bays 1, 2, and 3, causing these brand logos to duplicate on every building across the Petrogradka district every $\approx 19$ meters.

4. **CC0 Texture Availability:**
   Direct HTTP download from Poly Haven CDN confirmed active, high-resolution textures:
   - Yellow plaster: `yellow_plaster_diff_1k.jpg` (632 KB)
   - Granite wall: `granite_wall_diff_1k.jpg` (935 KB)
   - Metal sheet: `box_profile_metal_sheet_diff_1k.jpg` (339 KB)
   Downloaded into `admin-linear/public/textures/` and copied to `public/admin-linear/textures/` during build.

5. **Test and Build Verification:**
   - `node --test test/m1_facades_road_network.test.js`: 12/12 tests passing in 51ms.
   - `node --test test/m1_empirical_verification.test.js`: 14/14 tests passing in 638ms (including headless Chrome canvas pixel sampling).
   - `npm run admin:build`: Vite build exits code 0 in 2.46s.

---

## 2. Logic Chain

1. **Elevation Scale Resolution:**
   Following Observation 1, setting `pixelRatio = H_texture / H_module_meters = 512 / 16 = 32` in `map.addImage(id, imageData, { pixelRatio: 32 })` ensures that 1 texture cycle maps precisely to 16 meters of building height (32 pixels per vertical meter). This completely eliminates the 32x bilinear blurriness.

2. **Dedicated Roof Capping Layer:**
   Following Observation 2, introducing a dedicated `fill-extrusion` layer `'3d-buildings-roof'` elevated by $+0.12$m above wall height:
   - `fill-extrusion-base: ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]`
   - `fill-extrusion-height: ['+', ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14], 0.12]`
   - `fill-extrusion-pattern: roofPatternId`
   And generating an authentic St. Petersburg standing seam tin roof (`spb-roof-day`, `spb-roof-sunset`, `spb-roof-night`) caps building tops, completely eliminating window and storefront bleed onto roofs without Z-fighting.

3. **Classical Architectural Refinement:**
   Following Observation 3, the general residential facade atlas was rebuilt with classical order:
   - Deep rusticated granite base with V-grooves and mineral speckling.
   - Entablature with dentils (сухарики), floor string cornices, architraves (наличники), and alternating pediments (сандрики).
   - Day/sunset glazing reflections and warm 2700K incandescent evening glow (~68.75% lit with curtains, houseplants, chandeliers; ~31.25% dark with moonlight sheen).
   - Replaced repeated commercial logos with classical entrance portals (парадная с кованым навесом, дубовые двери, латунные ручки) and arched vitrines.

4. **Road Markings Styling:**
   Centerlines and zebra crosswalk polygons from `roadMarkingsData.js` were styled with time-of-day adaptive opacities (`0.72..0.76` at night, `#e2e8f0`) to naturally blend with night asphalt and street lanterns without glaring.

---

## 3. Caveats

1. **Tile Extents at High Zoom:** MapLibre vector tiles use height attributes (`render_height` / `levels`) which fall back to 14m when tags are missing in Carto basemaps. The interpolation expression smoothly handles zoom levels 14 to 14.5.
2. **Texture Memory Footprint:** Registering 6 canvas textures (3 facade themes + 3 roof themes at $512 \times 512 \times 4$ bytes) consumes $\approx 6$ MB of GPU texture memory, well within mobile WebGL limits.

---

## 4. Conclusion

Milestone M1 is fully accomplished:
- `pixelRatio: 32` is implemented in `facadeTextureGenerator.js` for all facade and roof image registrations.
- Standing seam tin roof generator (`drawSpbRoof`, `registerAllRoofPatterns`, `ROOF_PATTERN_IDS`) is implemented and integrated.
- Dedicated `'3d-buildings-roof'` extrusion layer is registered in `FullScreenMap.jsx` with $+0.12$m elevation.
- Classical St. Petersburg architectural facades are implemented with authentic rustication, cornices, pediments, and day/sunset/night illumination.
- CC0 PBR textures are stored in `admin-linear/public/textures/`.
- All unit and empirical verification tests pass (100%), and `npm run admin:build` compiles cleanly with code 0.

---

## 5. Verification Method

1. **Run Unit & Regression Tests:**
   ```bash
   node --test test/m1_facades_road_network.test.js
   ```
   *Expected:* 12/12 tests pass (TAP exit code 0).

2. **Run Empirical Pixel Sampling & GeoJSON Tests:**
   ```bash
   node --test test/m1_empirical_verification.test.js
   ```
   *Expected:* 14/14 tests pass (TAP exit code 0).

3. **Run Production Build:**
   ```bash
   npm run admin:build
   ```
   *Expected:* Vite build finishes with code 0.

4. **Files Modified:**
   - `admin-linear/src/lib/facadeTextureGenerator.js`
   - `admin-linear/src/components/FullScreenMap.jsx`
   - `admin-linear/public/textures/`
   - `test/m1_facades_road_network.test.js`
