# ARCHITECTURE: how a Playa Art world is built

## Stack
- `three ^0.160.0`, `vite ^6`, plain ES modules (no framework, no TypeScript).
- Each world is a standalone Vite app: `index.html`, `src/main.js`, `vite.config.js`, and
  `package.json`. `vite.config.js` sets `base: '/<subpath>/'` and a unique dev `server.port`.
- In the private repo, a root `build.mjs` builds every world and copies each `dist/` under
  its subpath next to a static `landing/` page, deployed on Vercel. Not included here.

## Two layouts you'll see here

### A. Core + zones (Goa_trance, bioluminescence_bay)
The pattern most worlds use. Bay's systems were copied from Goa and redesigned.
```
src/main.js            boot, renderer, loop, wires everything
src/core/
  constants.js         world size, palette, tuning numbers
  Noise.js             value/simplex noise
  Terrain.js           heightfield mesh + shader colouring
  Ocean.js             water shader (Bay adds glowing surf: Surf.js, Footprints.js)
  SkyCycle.js          sky dome, sun/moon, time-of-day palette
  Atmosphere.js        fog, haze, stars, particles
  Controls.js          pointer-lock first-person controls, run, jump
  CollisionSystem.js   simple colliders + terrain height following
  CrowdSystem.js       instanced crowd with dance animation + LOD
  ZoneManager.js       zones register here; activates/deactivates by distance
  Props.js, Merge.js   prop builders; geometry merging to cut draw calls
  Paths.js, Vehicles.js, Fauna.js, Guide.js, Minimap.js, UI.js, AudioEngine.js
  (Bay only) Kayak.js, Jellyfish.js, Deck.js
src/zones/*.js         one file per place (e.g. Lookout, DJRaft, FireCamp, HilltopStage)
```
A zone builds its own meshes, registers colliders and points of interest, and exposes
`update(dt, t)`.

### B. Streamed route (scenic_drive), the newest
```
route.js     control points, arc-length tables, the fork, time-of-day tracks
field.js     deterministic height field shaped around the roads
terrain.js   3 LOD rings (256 / 1024 / 4096 m) with skirts + shader colouring
road.js      200 m streamed road ribbons, parapets, signboards; only the chosen branch loads
flora.js, props.js, sky.js, vehicles.js, camera.js, audio.js (procedural)
main.js      drive() physics, the loop, test hooks (window.SD)
```
See `worlds/scenic_drive/CLAUDE.md` for gotchas (for example, `fogify()` needs
`customProgramCacheKey`).

## Rendering and performance conventions
- Target 60 fps on a mid laptop GPU, with a low tier holding about 30 fps on integrated
  graphics. Never reach it by dropping resolution.
- **Instancing** for crowds, foliage, and repeated props; **LODs** and distance-based zone
  activation; merged static geometry.
- **Light:** few or no dynamic PointLights or SpotLights. Glow comes from emissive materials,
  additive sprites and decals (Scenic Drive's headlights are road decals), fog, and bloom.
- Shader work (terrain colouring, water, glow) is preferred over heavy textures. These three
  worlds are fully procedural.
- Audio is generated procedurally (Web Audio) or loaded from local tracks that aren't committed.

## UX conventions
Click to start (pointer lock), WASD, mouse look, Shift run, E use, K key list, Esc frees the
mouse, a visible "All Worlds" link back to the landing page, an on-screen guide or minimap for
where to go, and a photo mode in newer worlds.

## Testing
Worlds expose a small `window` hook (for example `window.SD.jump(...)`) so headless
Puppeteer renders can place the camera exactly. Every visual change is checked against
rendered PNGs.
