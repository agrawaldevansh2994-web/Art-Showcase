# Bioluminescence Bay — a hidden cove where the sea lights up

> **Status (2026-10-07): M0 SCAFFOLD — runs, renders, not signed off, NOT deployed.**
> `npm install && npm run dev` in this folder → `localhost:5188/bay/`.
> Deliberately **not** in `build.mjs` and **not** on the landing page — wiring it in is
> Devansh's call (§9). No other world was touched to build this; everything shared was
> **copied** in, never imported across folders.
>
> M0 was written outside Claude Code (by Hark, against the repo over the GitHub MCP) and
> checked with headless SwiftShader renders only — no real GPU yet. Treat every number in
> §8 as software-renderer numbers, and do the §8 "first laptop run" before building more.

General 3D playbook: the root `CLAUDE.md` (lives on Devansh's PC, `Downloads/backups/`
per `3dexplorable_modeltips.md` — it was not in the repo when M0 was written, so M0
followed `3dexplorable_modeltips.md` plus `Goa_trance/CLAUDE.md`). Read both before
touching sky, terrain, performance, crowds or audio. Known-wrong advice in the old tips
file: **linear audio rolloff** — use exponential (already the case here, inherited from Goa).

---

## 0. The idea, and the one shot it exists for

A crescent cove at night, new moon, closed at both ends by rock horns. The plankton are
in: every wave crest, footstep, swimmer, dolphin and dancer in the surf leaves a trail of
electric blue that spreads, rings outward and fades. A **Driftwood Stage** on the dune at
the back of the beach faces the sea; out in the middle of the bay a DJ plays from a **raft**
sitting in its own permanent halo of light that pulses on the kick.

**The hero shot (reel #1):** camera low in the shallows, a dancer's legs kicking up blue,
the raft glowing on the water behind, the drop hits and a ring of light rolls out from the
raft. Every design decision is judged against whether it makes that shot better.

**The rule that keeps it beautiful:** the plankton is the only cold light in the world.
Nothing else may be cyan/blue (`PALETTE.bioCore` / `PALETTE.bioBlue`). Every man-made
light is warm amber. If a render shows anything out-glowing the water, that thing is wrong.

---

## 1. What was forked from where

Base: **`Goa_trance/`**, copied whole on 2026-10-07, because Goa already had the hard
parts of this world: a shaded ocean with a per-vertex depth attribute (shoreline, tide,
break, swash all for free), swimming/diving, night-foam bioluminescence, splash sparks, a
coastal terrain profile, crowds that wade, procedural psy/full-on sets, the guide.

| File | State | Notes |
|---|---|---|
| `src/core/Ocean.js` | **modified** | the plankton system, §3 |
| `src/core/Terrain.js` | **modified** | crescent `coastX()`, two horns + two rock fingers, new flat spots, new palm belts, world closed at |z| > 222 |
| `src/core/constants.js` | **modified** | new anchors, cove shape, walk bounds, palette (`bioCore`, `bioBlue`, `driftwood`, darker sea) |
| `src/core/CrowdSystem.js` | **modified** | new population plan (stage floor runs down to the water; dancers in the surf face the raft); wet people splash, §3 |
| `src/core/Paths.js` | **modified** | beach track round the crescent, arrival trail over the South Horn, stage/camp/rocks trails, 9 lamps |
| `src/core/Fauna.js` | **modified** | dolphins circle the bay on an ellipse (straight coast runs went through the horns); splash source `'fauna'` |
| `src/core/SkyCycle.js` | **modified** | one line: `cycleSpeed` 0.0030 → 0.0007 (night lasts ~7.5 min) |
| `src/core/Controls.js` | one comment | otherwise Goa's |
| everything else in `src/core/` | **unchanged copy** | Atmosphere, AudioEngine, CollisionSystem, Guide, Merge, Minimap, Noise, Props, UI, Vehicles, ZoneManager |
| `src/zones/DriftwoodStage.js` | **new** | §4 |
| `src/zones/DJRaft.js` | **new** | §4 |
| `src/zones/TheRocks.js` | Goa `SunsetRocks.js`, re-anchored | still Goa-styled; M1 |
| `src/zones/FireCamp.js` | Goa `PalmCamp.js`, re-anchored | still Goa-styled; M1 |
| `src/zones/Arrival.js` | Goa `BoatLanding.js`, re-anchored, sign text changed | still Goa-styled (shacks, outriggers, chai mama); M1 |
| `src/main.js`, `index.html` | **modified** | zones, teleports, audio stages, Glow Tide, guide, entry screen, `window.BAY` |
| `vite.config.js` | **modified** | `base: '/bay/'`, port 5188 |

Dropped from Goa: Hilltop, Disco Valley, the Banyan, the Flea Market.

**Not shared code.** `Guide.js` here is a copy of the identical-in-four-worlds guide; if
the guide is ever edited across worlds, this is now the fifth copy (`diff -q` them).

---

## 2. Orientation and layout

Same axes as Goa so every inherited system reads the world correctly:
**−X is the sea (west), +X inland. −Z north, +Z south. y = 0 mean sea level.**

```
            −Z  NORTH HORN (cliff, peak 34) ── THE_ROCKS (−50,−126)
             |        rock finger z≈−140
   open sea  |  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ \
    (−X)     |   ~  DJ_RAFT (−70,−18)  ~  ~      )  beach crescent: waterline
             |  ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ /   x = −60 at the horns,
             |                                     x = −12 at z = 0
             |        dune → DRIFTWOOD_STAGE (26, 0), faces −X
             |        palm scrub → FIRE_CAMP (48, 84)
             |        rock finger z≈142   ARRIVAL (−26, 150)
            +Z  SOUTH HORN (peak 24) ── arrival trail climbs over its shoulder from (70, 236)
```

- Cove shape is three constants: `COVE_HALF_Z`, `COVE_BACK_X`, `COVE_MOUTH_X`. `coastX()`
  is a cos² bow between them, so it meets the horns tangentially.
- Walk bounds: x ∈ [−170, 120], |z| ≤ 215. The raft is ~58 u off the beach in ~8 m of water.
- You arrive at the foot of the South Horn trail looking north-west across the bay at the
  raft — the first frame is meant to be the whole glowing crescent.

---

## 3. The plankton system (`Ocean.js`) — the heart of the world

Goa's ocean is one `ShaderMaterial` plane. The Bay adds four things to the **same**
fragment shader. Zero lights, zero extra meshes.

1. **Crest glow.** The vertex shader exports `vCrest` (swell height normalised by its
   local amplitude). Crests over 0.62 glow in water 0.5–16 m deep, so lines of blue roll
   in toward the beach before they break. Modulated by smooth `vnoise`, never `hash()`.
2. **Spark field.** Individual dinoflagellates: ~4 % of 0.33 u cells hold a round point
   that twinkles at its own rate, only in the shallows.
3. **Trails.** `uTrail[TRAIL_N = 32]`, a ring buffer of `vec4(x, z, birthTime, strength)`.
   Each point draws a core that spreads and fades (~5 s) plus an expanding ring.
   `splash(x, z, amount, source)` writes one, **rate-limited per source** (≥ 0.09 s or
   ≥ 1.4 u since that source's last point), so sources cannot starve each other.
4. **Bio boost.** `ocean.setBioBoost(v)` eases a global multiplier (1 normal, 2.6 Glow
   Tide). `uBass` adds up to +30 % on the kick.

**Who writes trails, and the budget** (32 slots × ~5 s life ≈ 6.4 new points/s sustained):

| Source | Rate | Where |
|---|---|---|
| `'player'` | wading/swimming (Controls) + every frame submerged (main.js), rate-limited | Controls.js, main.js |
| `'raft'` / `'raftKick*'` | one edge point / 0.4 s + 4 points on the first kick of each bar | DJRaft.js |
| `'crowd'` | one wet person near the camera / 0.3 s | CrowdSystem.js |
| `'fauna'` | dolphins breaching | Fauna.js |

That is already over budget in the busiest spot (surf at the stage, swimming, raft in
view) — oldest points get overwritten early, which reads fine (they were fading anyway).
**Do not raise `TRAIL_N` without measuring fps on a real GPU with a full screen of water**;
the loop runs per water fragment. If more is needed, the next step is a render-target
"disturbance texture" (ping-pong, like Atlantis caustics) instead of a bigger loop.

Goa's own night foam (`foam`, `foamCol`, the splash `Points`) is kept but toned down —
see §8 for why.

---

## 4. Zones

| Key | Name | Anchor | What's there (M0) |
|---|---|---|---|
| `stage` | THE DRIFTWOOD STAGE | (26, 0) | plank deck on the dune, door-on-oil-drums booth, three crooked driftwood ribs forming an arch (TubeGeometry), warm bulbs on the big rib and two sagging runs to driftwood posts, two 3-cab speaker stacks facing the sea, six amber glass-float glows, 14 seating logs, one warm booth PointLight, one beach fire. Floor runs west down the sand into the surf. |
| `raft` | THE RAFT | (−70, −18) | 10×10 deck on six drums, booth facing the beach, two 2-cab stacks, mast with a fluoro flag, warm bulb runs to the corners. Bobs and tilts on `ocean.surfaceY()` (the same field the shader draws). Halo = its own `splash()` calls. Collides with swimmers (circle r 6.2). **Cannot be boarded yet** (M2). |
| `rocks` | THE ROCKS | (−50, −126) | Goa's Sunset Rocks, re-anchored. E there starts the Glow Tide. Future glow pools (M3). |
| `camp` | THE FIRE CAMP | (48, 84) | Goa's Palm Camp, re-anchored. |
| `arrival` | THE SOUTH TRAIL | (−26, 150) | Goa's Boat Landing, re-anchored; signs now read THE BAY / NO TORCHES ON THE SAND. |

**Glow Tide (X, or E at the rocks):** 40 s, `setBioBoost(2.6)`, the crowd rallies onto the
waterline in front of the stage facing the sea, drum circle on, conch. Replaces Goa's
sunset session (the ctx hook is still called `startSunsetSession` because `TheRocks.js`
calls it by that name).

---

## 5. Audio

Inherited `AudioEngine.js` unchanged (procedural sets, positional, exponential rolloff,
underwater low-pass, drum circle, bring-your-own-file per stage).

| Stage key | Set | Anchor | refDistance / rolloff |
|---|---|---|---|
| `stage` | `discoValley` (melodic full-on, A major) | floor centre (12, ·, 0) | 34 / 2.3 |
| `raft` | `hilltop` (dark night psy, 145 bpm) | the raft | 44 / 1.7 |

**UNTUNED:** the raft has to carry ~58 u to the surf, so its rolloff is soft, and the two
floors overlap in the shallows. Measure on the laptop (stand in the surf at z = −18 and at
the stage floor) and fix it the way Goa fixed Hilltop/Disco Valley. A dedicated set for
the raft (slower, dubby, "underwater" — the world's own sound) is an M4 item.

---

## 6. Look rules

- **Only the plankton is cold.** All bulbs, lamps, fires: `PALETTE.lamp` / amber.
- **Light budget:** 12 lights total at M0 (booth lamp, fires, inherited zone lights, sky).
  Every new PointLight recompiles every material — Goa's preload-all-behind-the-overlay
  is kept for exactly this reason. Prefer emissive + bloom + sprites.
- **Never `hash(floor(...))` for anything that feeds the glow** — it tiles (§8).
- Driftwood is bleached grey (`PALETTE.driftwood`), not brown. Brown read as "Goa bamboo".
- Inherited fluoro/UV paint: keep it rare here (the raft flag only). The Bay is not a UV
  party; the water is the light show.

---

## 7. Milestones

- **M0 — scaffold (done, 2026-10-07).** Fork, cove terrain, plankton system, Driftwood
  Stage, raft, Glow Tide, guide, entry screen. Builds clean (`vite build`, 38 modules).
- **M1 — restyle + audio (code done 2026-10-07; laptop pass still owed).**
  Done: Arrival is now a night-paddle landing (beached + floating kayaks, driftwood
  lean-to with a ginger-tea flask, dry bags, RED path lamps, sign in plankton blue);
  outriggers, shacks, chai mama, coconuts, drums removed. Fire Camp lost its chai mama.
  The Rocks' tide pools breathe blue at night and brighten during Glow Tide (preview of
  M3). All ambient scooters/Enfields/taxi removed, headlight pool 2→0, B rental replaced
  by a toast. Audio retuned on the exponential model (table in main.js STAGE_DEFS):
  stage 24/2.0, raft 35/2.4 → raft 0.12 on the stage floor, crossfade ~0.47/0.40 at the
  waterline, stage 0.08 at the raft. Headless: 54 programs, 10 lights (was 12), 787
  meshes (was 932), no console errors.
  Still open: laptop fps run (§8); audio by ear; stage legibility from the water;
  Paths.js lanterns are still warm white (consider red); laterite marker stones.
- **M2 — board the raft (code done 2026-10-07).** `core/Deck.js` copied from
  `atlantis/src/yacht/Deck.js` (only change: jump reads a one-frame `api.jump` edge).
  Controls gained an `aboard` mode: `board(platform)` / `leaveDeck()` / `isAboard()`;
  while aboard you walk in the raft's LOCAL frame and the camera is `raft.localToWorld`,
  so bob and tilt carry you. Ladder on the beach side (+X): swim to it, E CLIMB ABOARD
  (interactables now take `swim: true` to show while swimming); E at the ladder climbs
  down; walk off any edge and you fall in (Deck returns 'fell'). Booth, speaker stacks
  and mast are deck walls. Guide step 4 now completes on boarding.
  Verified headless: board → aboard, ladder down → swimming; node sim: table wall stops
  you at x=-0.4, walking off the side returns 'fell'. Not yet: raft dancers (no Rocketbox
  rig in this folder — would need copying from Atlantis's People.js), feel of walk speed
  on a real GPU, whether the tilt (0.8 × swell slope) is too much underfoot.
- **Redesign v2 (2026-10-07, after Devansh: "reads as a replica of Goa with 5% changes").**
  Layout: spawn moved to THE LOOKOUT on the North Horn (new zone `Lookout.js`: driftwood
  rail, split-log bench, glowing glass-float cairn, THE BAY sign, one red lamp — the only
  real light up there); red-lit cliff trail switchbacks down to THE ROCKS. Stage moved to
  the south half of the dune (22, 62), raft off it (-76, 44), fire camp to the north half
  (44, -64), the old south arrival became MANGROVE CREEK (kayaks). Constants in
  `constants.js` "LAYOUT v2". Audio table re-checked (same ~86 u spacing, still holds).
  Trees: palms gone. `plantCoast()` now plants casuarina spires (dune), broadleaf blob
  canopy (behind), and mangroves on arched prop roots in the water in both cove corners
  (~8 draw calls). `buildCasuarina()` in Props replaces buildPalm in zones.
  People: new outfit set (swimmer, paddler w/ life vest, diver, local, glow crew),
  capsule bodies, two legs, shorts/caps/vests/wristbands, blue-only bio paint. FIXED an
  inherited bug: crowd materials had `vertexColors: true` with no colour attribute, so
  every person rendered pure black — Goa_trance has the same bug (NOT touched there).
  Paths: float posts (glass fishing floats) replace laterite marker stones; boardwalk
  spurs to stage and creek. Entry screen restyled: centred, rises from dark water,
  italic serif title with cyan glow, new copy.
  Headless: 58–60 programs, 10 lights, 658 meshes, no console errors; boarding retested.
  SKY v2 (same day, after "the sky is the biggest thing that reads as Goa"): SkyCycle
  rewritten for a NEW-MOON night — no moon/moonlight, teal-black dome, round stars on a
  3D hash grid (3 layers, colour temperatures), Milky Way arch (MW_NORMAL) with dust rift
  and warm core rising from the SW sea, green airglow on the horizon, shooting stars every
  9–24 s, night clouds are dark star-blockers, teal twilight instead of magenta. Night
  ambient raised 0.11→0.17 to make up for the lost moonlight.
- **Net Cave + glitter + kayaks (2026-10-07, from Devansh's reference photos).**
  Stage → THE NET CAVE (DriftwoodStage.js, names kept): 24 m tunnel of draped fishing
  net over 7 pole ribs, mouth facing the sea, booth inside; net is an additive shader
  (AA mesh grid, uplit, kick pulse booth→mouth), 3 layered shells + back wall, blue
  uplight cans, warm amber floor pools, blue floor wash. No extra lights.
  Water → glitter pass in Ocean.js: discrete twinkling sparks (2 scales) whose density
  follows activity (shallows, foam, crests, trails), thin near-white lace lines at swash
  fronts, bright waterline, broad sheet glow cut back; STRANDED PLANKTON Points layer
  (7000) glitters on the wet sand just above the tide line. TRAIL_N 32→48, splash() takes
  a per-source minGap.
  Kayaks → Kayak.js: E at Mangrove Creek takes a kayak out (controls.setPilot/clearPilot);
  W/S paddle, A/D turn, Shift hard, E to get out (or roll out in deep water); strokes and
  bow/stern wake feed the trail ring so the glitter swarms the hull. 5 NPC paddlers loop
  the bay with their own wakes. Test: playa/tools/kayak.mjs.
- **M4 part 1: jellyfish + underwater glow (2026-10-07).** Jellyfish.js: ~46 jellies
  (16 clustered under the raft), 2 instanced additive draws (pulsing bells, swaying
  tentacles), fade with depth from above; nearest 16 fed to ocean uJelly so the surface
  thins and glows over them. Underwater: 1400-speck plankton cloud wraps around the
  camera, brighter near you while you move. Still M4: raft's own set, sidechain plankton.
- **Review fixes + surf (2026-10-07, Devansh's first laptop run).** Kayaks: now two
  (mid-beach z −14, creek), green glow stick + halo, cyan minimap dots, boardable from
  sand or while swimming (two interactables each, positions follow the boat). Night
  lighting lifted (SkyCycle night amb 1.0 cyan-ground hemi, starlight key 0.7) — water
  shader untouched. Footprints.js: glowing prints on the wet sand. Surf.js: break at
  z −114…−58 south of the Rocks, 3 CPU-built swells following shoreX, peel N→S, glowing
  lip + whitewater feeding the trail ring; board rack (E), paddle, catch by facing the
  beach + holding W as a wave lifts you, A/D carve, NPC surfer per wave. Test:
  tools/surf.mjs [surf|kayak], tools/dbg.mjs (overview).
- **Review 2 (2026-10-07).** Surf v2 (Surf.js rewrite): 4.4 m waves from a real
  cross-section (back/crest/lip + inside-face sheet), curl → barrel → whitewater, peel
  N→S (breakD 58→14 m over z −120…−44) so there is a pocket; ride with W/S up/down the
  face, A/D carve, Shift pump, barrel time scored; rack at z −78 with SURF sign + beacon;
  NPC surfers in the pocket. Context controls card (#ctx-card, ui.context) near the rack
  / kayaks and while on them; K panel has KAYAK + SURF sections; T teleports to both.
  Arrow keys alias WASD everywhere (Controls ARROW_ALIAS). Kayak: Shift sprint 10.5 m/s,
  LED gunwale strips + light pool on the rideable ones. Raft v2: compact cabs with LED
  rings, LED deck strip, EQ booth front, cyan wash, mast beams, 9 deck dancers + a DJ.
  Crowd v2: body-frame rig (arms/head follow twist+sway), separate swinging legs, beat
  dance in 4 styles + DJ, faint emissive so bodies read. Tests: tools/ride.mjs (uses
  BAY.surf._dbg), tools/view.mjs "once|||every".
- **Review 3 polish (2026-10-09).** Net Cave crowd thinned 250 → 48 with a 3 m aisle to
  the booth. Info cards (#ctx-card) smaller; **H** collapses them to a one-line pill
  (remembered in localStorage `bay.ctxHidden`). Surf: Catmull-Rom densified profile
  (NZ 120), per-frame normals with fresnel + moon glint, round sparkles, 900-droplet spray
  off the lip/whitewater/NPCs and a rooster tail when you carve; catch window a bit wider.
  Fauna: dolphins cruise with a beating tail and throw real ballistic leaps (splash in/out);
  4 sea turtles paddling near the surface; a 70-fish glowing school that scatters from
  you. Ocean `uSwim` streaks draw lit plankton over each submerged swimmer. Final
  ShaderPass: soft vignette + fine grain (no tone change). Tools: tools/cam2.mjs (camera
  set right before each render).
- **M3 — the North Horn.** Glow pools on THE ROCKS (still tide pools that light when you
  step in), a lookout on the horn top for the money wide shot, a cave in the cliff face
  with glowing water inside.
- **M4 — sound and life.** The raft's own set; plankton reacting to the music's
  sidechain more visibly; glowing jellyfish drifting under the raft (instanced, emissive);
  diving reveals the glow from below (Atlantis's Snell's window could be borrowed).
- **M5 — ship.** §9.

---

## 8. Measured, and what the first renders corrected

Headless Chromium + SwiftShader at 960×540 (software GL — fps meaningless, counts real):
**55 programs, 12 lights, 1 shadow caster, ~932 meshes, 126–485 draw calls and ~0.5–0.74 M
triangles depending on view.** Build 85–110 ms; shader compile 0.7–3.7 s (software).
The draw-call count at the arrival view (~470) is Goa-level; Goa ran 30–43 fps on an iGPU.

What the first renders corrected (2026-10-07):
1. **Checkerboard across the shallows.** Goa's swash `jitter = hash(floor(xz * 0.35))` and
   M0's first crest modulation were per-cell hashes — invisible on white day foam, a grid
   of tiles once the plankton glow amplified them. Fixed with smooth `vnoise()`. Rule in §6.
2. **The whole shallows glowed as one sheet.** Goa's broad swash foam × night bio lit
   every metre of water under 2.4 m deep. Toned down and squared (`foam * foam`) so the
   glow sits on lines; trails and sparks boosted to carry the image instead.
3. **Square sparks** read as dashes at grazing angles; now round points in each cell.

**First laptop run (do before M1):** `BAY.stats()` and fps at (a) the arrival view, (b)
standing in the surf at the stage floor facing the raft (worst case for the trail loop),
(c) swimming at the raft. `BAY.stalls()` after a minute of play. Check the raft halo and
the player trail look as intended, and whether the stage reads from the water.

---

## 9. Before it goes on the site (needs Devansh's OK — none of this is done)

1. `build.mjs` entry for `bioluminescence_bay` → `/bay/` (copy the Goa entry).
2. Landing card + real screenshot in `landing/shots/`; OG image `landing/og/bay.jpg`,
   then restore the full share-preview `<meta>` block in `index.html` (stubbed at M0).
3. Promo: a `promo/shots/bay-*.json` capture of the hero shot (§0).
4. Respect PROMOTION.md rules: original IP (fine to monetise), no commercial music
   auto-plays, don't poll the live site after a push.

## 10. Open questions for Devansh

- Name on the landing card: "Bioluminescence Bay", "Glow Tide", or something shorter?
- Should time run at all (it currently crawls through one night, then dawn), or lock to
  night like the warehouses?
- Raft music: keep the borrowed Hilltop psy set, or a slower, dubby set of its own?
