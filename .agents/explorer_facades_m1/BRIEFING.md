# BRIEFING — 2026-09-04T04:05:00Z

## Mission
Investigate MapLibre GL 3D fill-extrusion-pattern facade tiling, realistic St. Petersburg architectural facade generation/assets, and road markings (crosswalks/lines) for FullScreenMap.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/bogdan/Desktop/Telegram-AI-bot-with-payments-main/.agents/explorer_facades_m1
- Original parent: e9fa19a5-92c0-4def-82f5-783ceed2094f
- Milestone: St. Petersburg Realistic Facades & Road Markings Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Visual correctness = correctness (authentic St. Petersburg facades, rusticated granite base, plaster, window frames, reflections, seamed tin roof, storefronts, road markings)
- Write only to .agents/explorer_facades_m1/

## Current Parent
- Conversation ID: e9fa19a5-92c0-4def-82f5-783ceed2094f
- Updated: 2026-09-04T04:05:00Z

## Investigation State
- **Explored paths**: `facadeTextureGenerator.js`, `roadMarkingsData.js`, `FullScreenMap.jsx`, `threePedestrianLayer.js`, `pedestrianData.js`, MapLibre GL shaders (`fill_extrusion_pattern.vertex.glsl`, `.fragment.glsl`, `fill_extrusion_program.ts`), Poly Haven & ambientCG CC0 asset endpoints.
- **Key findings**:
  1. Root cause of blurriness: MapLibre scales 1 meter of elevation to 1 pixel of pattern when `pixelRatio = 1.0`. A 512px canvas was mapped over 512 meters, showing only 16 pixels across a 16m building (32x stretch). Solution: `pixelRatio = H_tex / H_meters` (32 for 512px, 64 for 1024px).
  2. Root cause of roof corruption: MapLibre applies `fill-extrusion-pattern` to both walls and roofs. Solution: Dedicated `3d-buildings-roof` layer (+12cm elevation) textured with authentic St. Petersburg seamed tin roof (`spb-roof-tin`).
  3. Storefronts duplication: Store logos were baked into repeating facade pattern. Solution: Move «Слой», «ВкусВилл», Showroom to physical 3D storefronts at their exact coordinates in Three.js (`threePedestrianLayer.js`).
  4. Road markings: Verified 14 zebra crosswalks and Bolshoy/Kamennoostrovsky centerlines.
- **Unexplored areas**: None. Full end-to-end investigation complete.

## Key Decisions Made
- Formulated exact mathematical scaling formula for MapLibre pattern textures.
- Formulated dual-layer extrusion architecture for walls vs roofs.
- Formulated physical 3D storefront localization.
- Sourced and verified open CC0 PBR textures from Poly Haven.

## Artifact Index
- DISPATCH.md — record of initial dispatch and user authorization update
- BRIEFING.md — working memory and identity
- progress.md — liveness heartbeat
- report.md — comprehensive technical and architectural investigation report
- handoff.md — 5-component handoff report
