## 2026-09-04T04:05:31Z
You are worker_m1_facades, a Worker agent.
Your working directory is: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m1_facades
Project root: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main

MANDATORY FIRST STEP:
Read /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/ORIGINAL_REQUEST.md completely.
Also read the master project document:
/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/orch_3/PROJECT.md
And read the comprehensive survey reports:
/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_facades_m1/handoff.md
/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_facades_m1/report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You own:
- `admin-linear/src/lib/facadeTextureGenerator.js`
- `admin-linear/src/lib/roadMarkingsData.js`
- `admin-linear/src/components/FullScreenMap.jsx` (facade registration, 3d-buildings-roof layer registration)
- `admin-linear/public/textures/` (downloading/saving CC0 PBR textures)
- `test/m1_facades_road_network.test.js`

YOUR MISSION (Milestone M1: High-Quality SPb Facades, Roofs & Road Network):
1. Fix the MapLibre elevation-to-pixel ratio:
   In `admin-linear/src/lib/facadeTextureGenerator.js`, register patterns with `pixelRatio: 32` (for 512px) or `64` (for 1024px) in `map.addImage(id, imageData, { pixelRatio: 32 })`. This aligns 1 pattern cycle to 16m building height, completely resolving the 32x blurriness.
2. Dedicated Seamed Tin Roof Layer:
   Implement `registerAllRoofPatterns(map)` generating authentic St. Petersburg tin sheet metal roof textures (`spb-roof-day`, `spb-roof-sunset`, `spb-roof-night`).
   In `admin-linear/src/components/FullScreenMap.jsx`, add layer `'3d-buildings-roof'` with `fill-extrusion-base: ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14]`, `fill-extrusion-height: ['+', ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 14], 0.12]`, and `fill-extrusion-pattern: 'spb-roof-' + theme`. This completely covers building tops with clean seamed tin roof, eliminating window/store bleed on roofs.
3. High-Quality Facades & Architectural Refinement:
   In `facadeTextureGenerator.js`, produce high-quality Classicist facades:
   - Rusticated granite base with deep V-grooves and mineral texture.
   - Refined ochre/terracotta plaster with cornices, architraves, and pediments.
   - Clear window frames with glazing reflections (day/sunset) and warm amber 2700K interior glow at night with curtain/flowerpot silhouettes.
   - Remove repeating store brand logos from the general residential facade atlas (replace with classical entrance portals and arched vitrines).
   - Per user directive: Download open CC0 PBR textures from Poly Haven (e.g. granite wall, yellow plaster, metal sheet) into `admin-linear/public/textures/` or integrate them into high-res procedural generators.
4. Road Markings & Zebras:
   Verify `roadMarkingsData.js` (crosswalk zebras and dividing centerlines). Ensure night opacity styling blends naturally with street lighting.
5. Verification:
   Run:
   - `node --test test/m1_facades_road_network.test.js` (update tests if new exports like roof patterns are added)
   - `npm run admin:build` (must exit code 0)
6. Write your detailed handoff in:
   `/Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/worker_m1_facades/handoff.md`
   Document all verification commands, output, and files modified.
7. Send a coordination message to the parent when complete.
