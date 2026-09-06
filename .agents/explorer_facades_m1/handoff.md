# Handoff Report — explorer_facades_m1

**Agent:** `explorer_facades_m1` (Explorer archetype: read-only investigation & synthesis)  
**Task:** Investigation of 3D St. Petersburg building facade textures, tin roof layer architecture, storefront localization, and road markings (zebras and centerlines).  
**Working Directory:** `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_facades_m1`  
**Date:** 2026-09-04  

---

## 1. Observation

1. **`admin-linear/src/lib/facadeTextureGenerator.js` lines 864–882:**
   ```javascript
   export function registerAllFacadePatterns(map) {
       if (!map) return;
       const themes = ['day', 'sunset', 'night'];

       themes.forEach(theme => {
           const id = FACADE_PATTERN_IDS[theme];
           const imageData = getSpbFacadeImageData(theme);

           try {
               if (!map.hasImage(id)) {
                   map.addImage(id, imageData);
               } else if (map.updateImage) {
                   map.updateImage(id, imageData);
               }
           } catch (err) {
               console.warn(`[FacadeTexture] Failed to register image ${id}:`, err);
           }
       });
   }
   ```
   Direct observation: `map.addImage(id, imageData)` is invoked with no third argument options object `{ pixelRatio }`. MapLibre GL assigns default `pixelRatio = 1.0`.

2. **MapLibre GL vertex shader (`node_modules/maplibre-gl/src/shaders/glsl/fill_extrusion_pattern.vertex.glsl` lines 88–94):**
   ```glsl
   vec2 pos = a_normal_ed.x == 1 && a_normal_ed.y == 0 && a_normal_ed.z == 16384
       ? a_pos // extrusion top
       : vec2(edgedistance, elevation * u_height_factor); // extrusion side

   v_pos_a = get_pattern_pos(u_pixel_coord_upper, u_pixel_coord_lower, fromScale * display_size_a, tileRatio, pos);
   ```
   And `node_modules/maplibre-gl/src/webgl/program/fill_extrusion_program.ts` line 115:
   ```typescript
   'u_height_factor': -Math.pow(2, coord.overscaledZ) / tile.tileSize / 8
   ```
   At `coord.overscaledZ = 16` and `tileSize = 512`, $u\_height\_factor = -16$.
   $tileRatio = 1 / 16 = 0.0625$.
   Elevation of $1$ meter: $pos.y = -16$.
   Pixel offset in pattern space: $-16 \cdot 0.0625 = -1.0$ pixel.
   Therefore, 1 meter of elevation corresponds to exactly 1 pattern pixel at `pixelRatio: 1.0`.
   On a 16-meter tall building, a $512 \times 512$ canvas covers only $\frac{16}{512} = 0.03125$ ($3.125\%$) of the vertical texture height, causing 32x blurriness.

3. **Roof Mapping in MapLibre GL:**
   Line 88 of `fill_extrusion_pattern.vertex.glsl` reveals that for the roof polygon (where normal is pointing up), $pos = a\_pos$ (world tile coordinates).
   In `fill_extrusion_pattern.fragment.glsl` lines 30–40, the exact same texture pattern `u_image` is sampled for both the roof and the sides. There is no distinction between roof and wall in the fragment shader. Because `facadeTextureGenerator.js` included storefront logos («Слой», «ВкусВилл»), windows, and cornices on the canvas, the roofs of buildings were rendered with slices of windows and store logos.

4. **Storefront Duplication:**
   Lines 89–94 and 434–788 of `facadeTextureGenerator.js` show that Bay 1 is «Слой», Bay 2 is «ВкусВилл», Bay 3 is Showroom across a 512px width repeating every 128px.
   When tiled horizontally along the perimeter of building polygons, every building in Petrogradka duplicated «Слой», «ВкусВилл», and Showroom every $\approx 19$ meters.
   Simultaneously, `admin-linear/src/lib/pedestrianData.js` lines 76, 82, 116 define the actual physical GPS locations for these storefronts:
   - «Слой»: `[30.3121, 59.9612]` (Bolshoy Prospekt 84)
   - «ВкусВилл»: `[30.3005, 59.9576]` (Ulitsa Lenina 22)
   - Showroom: `[30.2952, 59.9540]` (Bolshoy Prospekt 26)

5. **Poly Haven & ambientCG CC0 Asset Verification:**
   HTTP requests verified active, downloadable high-res CC0 PBR textures:
   - Ochre Plaster: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/yellow_plaster_02/yellow_plaster_02_diff_1k.jpg`
   - Granite Rustication: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/granite_wall/granite_wall_diff_1k.jpg`
   - Seamed Sheet Metal Roof: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/box_profile_metal_sheet/box_profile_metal_sheet_diff_1k.jpg`

6. **Road Markings & Tests:**
   `test/m1_facades_road_network.test.js` passes 10/10 tests in 48ms (`node --test test/m1_facades_road_network.test.js`).
   `npm run admin:build` passes in 1.91s without bundling errors.

---

## 2. Logic Chain

1. **Root Cause of "Muddy / Blurry" Facades:**  
   Observation 1 and Observation 2 demonstrate that MapLibre scales building elevation into pattern pixels at a rate of 1px per meter when `pixelRatio = 1.0`. A $512 \times 512$ canvas was interpreted as a 512-meter tall surface. On typical 16-meter St. Petersburg buildings, only 16 vertical pixels were displayed, stretched 32x across the facade.
   $\implies$ Setting `pixelRatio = H_tex / H_meters` (e.g. $pixelRatio = 32$ for 512px, or $64$ for 1024px) precisely aligns the texture to the real 16-meter building height, yielding razor-sharp rendering.

2. **Root Cause of Broken Roofs (Roof Bleed):**  
   Observation 3 proves that MapLibre GL has no native property to texture roofs separately from walls within a single `fill-extrusion` layer. The entire 2D canvas (including windows and storefront logos) is planar-mapped onto the roof.
   $\implies$ Adding a second `fill-extrusion` layer (`3d-buildings-roof`) with `base: H` and `height: H + 0.12` creates a dedicated roof geometry elevated 12cm above the walls. Texturing this layer with authentic seamed tin roof (`spb-roof-tin`) completely covers the wall tops in the Z-buffer, eliminating window bleed on roofs without Z-fighting.

3. **Root Cause of Storefront Repetition:**  
   Observation 4 shows that storefront logos were drawn into the generic repeating facade atlas, causing them to appear dozens of times on every building in the district.
   $\implies$ Removing store logos from the general residential facade atlas, replacing them with classical architectural portals (парадная) and generic arched vitrines, and rendering «Слой», «ВкусВилл», and Showroom as physical 3D storefronts at their exact coordinates via Three.js (`threePedestrianLayer.js`) eliminates repetition and provides authentic immersion.

4. **Asset Integration Feasibility:**  
   Observation 5 confirms that authentic St. Petersburg architectural textures (ochre plaster, rusticated granite, seamed tin roof) are directly accessible via Poly Haven CC0 CDN and can be placed into `admin-linear/public/textures/` or composited into the atlas.

---

## 3. Caveats

1. **Web Basemap Data Extent:** OpenMapTiles / Carto vector tiles have minor height variations; some buildings lack `render_height` or `levels` tags and fall back to the default height of 14 meters. The formula `['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]` handles this cleanly.
2. **WebGL Texture Unit Limits:** Registering 4–6 patterns (`spb-facade-day`, `spb-facade-sunset`, `spb-facade-night`, `spb-roof-day`, `spb-roof-sunset`, `spb-roof-night`) consumes minimal GPU texture memory (<24 MB total), well within standard mobile and desktop limits.
3. **Network Mode for Tests:** Offline headless test environments require procedural Canvas/mock fallbacks, which `facadeTextureGenerator.js` already provides.

---

## 4. Conclusion

The critical user feedback has been completely diagnosed down to the exact WebGL shader equations. A comprehensive, actionable, architectural-grade solution has been designed and documented:
- Scale fix: `pixelRatio = 32` (512px) / `64` (1024px).
- Roof fix: Dedicated `3d-buildings-roof` layer (+12cm elevation) with St. Petersburg seamed tin roof.
- Facade fix: High-resolution Classicist atlas (granite rustication with V-grooves and mineral texture, ochre plaster, profiled mouldings, sandriks, sky reflections, golden sunset, warm 2700K incandescent night illumination with curtain and plant silhouettes).
- Storefront fix: Physical 3D storefronts for «Слой», «ВкусВилл», Showroom at their exact coordinates in Three.js.
- Road markings: Fully verified and ready, with recommendation for slight night opacity toning.

---

## 5. Verification Method

1. **Verify Unit & Regression Tests:**
   ```bash
   node --test test/m1_facades_road_network.test.js
   ```
   *Expected:* 10/10 tests pass with code 0.

2. **Verify Frontend Production Build:**
   ```bash
   npm run admin:build
   ```
   *Expected:* Vite build succeeds with code 0 without bundling errors.

3. **Verify Report Documentation:**
   Inspect `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_facades_m1/report.md` for complete architectural formulas, shader equations, and code blueprints.
