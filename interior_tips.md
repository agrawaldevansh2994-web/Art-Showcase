# Building game interiors that look right first time (no reference images)

How the Aurora interiors (Ice Bar, Waffle Cabin, Rorbu, Lavvu) were built. Written for Claude Code or any other agent working in Three.js. The approach transfers to any engine.

## 1. Write the room before you code it
Start with 4–6 lines of plain prose: what the place is, who uses it, the one thing your eye goes to first, and what makes it warm.
> "Fisherman's rorbu: stone fireplace on the back wall is the hero, table with 4 chairs + candles in the middle, rag rug, oars on the wall, the window gable looks out at the fjord."

Then list the props in three tiers:
- **Hero (1):** the fireplace, stove or bar counter. Gets the most detail and the light.
- **Supporting (4–8):** table, chairs, shelves, counter, bench, rug.
- **Clutter (10–30):** mugs, candles, bottles, logs, hides, tools. Small, repeated, and placed with slight random jitter.

A room reads as *real* because of the clutter tier. Most AI-built rooms skip it and look empty.

## 2. Real-world dimensions, always
Build in metres and look the sizes up; never eyeball them:
- door 0.9 × 2.0
- table height 0.75
- chair seat 0.45
- counter 1.05
- shelf depth 0.3
- mug height 0.1
- ceiling 2.4–2.7

Wrong scale is the #1 reason a room looks "off" and needs iterations. Keep these numbers as constants.

## 3. Lighting does 80% of the look, and it's mostly fake
- **ONE real light per scene, shared:** a single PointLight that moves to whichever interior the player is in or near, at intensity 0 elsewhere. The light count never changes, so shaders never recompile and nothing hitches.
- **Everything else is faked:**
  - warm **emissive** on surfaces near the fire (emissiveMap = the same texture, low intensity)
  - **baked vertex colour** (brighter near the hearth, darker in corners and near the floor)
  - additive **glow sprites** on flames, candles and lamps
- **Warm/cool contrast:** a warm interior (≈ 2700 K orange, `0xffb478`) against a cold blue outdoors is what makes it cosy. Push it.
- **Flicker:** two or three sine waves at odd frequencies (7.3, 17.1, 21.7 Hz) on flame scale and glow opacity. Never `Math.random()` per frame, which jitters.

## 4. Cheap geometry, lots of it
- Boxes, cylinders, cones and extruded shapes only. A fireplace is about 12 boxes; a waffle is one ExtrudeGeometry from a 5-lobe heart shape.
- **Merge all static props** into one mesh per material per room (BufferGeometryUtils.mergeGeometries). 200 props end up as about 6 draw calls.
- Keep the moving parts (flames, steam, glows) separate and mark them dynamic.
- Scale the UVs to world size so planks and stone tile at real size.

## 5. Life: things that move
Every room gets at least two moving things:
- fire
- steam from a pot or kettle
- smoke out of the chimney or smoke hole
- a vendor running an idle loop
- candle flicker

Use one shared particle system for all the steam and smoke, so it's one draw.

## 6. Performance rules
- **Cull contents by distance:** hide the interior until the player is within about 10 m of its walls. From outside, show a warm window plane instead, so nothing visibly changes at a distance.
- Keep interiors out of planar reflections.
- **Precompile shaders** against the same render target the game actually draws into (composer target, not the screen), or the first look inside hitches.
- **Close every shell, and make walls double-sided:** a wall that is single-sided or one-sided from inside makes the room see-through from outside. That was the lavvu bug.

## 7. Make it playable, not just pretty
- Use simple AABB colliders per prop group, not per mesh.
- Shrink the player's collision radius near doors (about 0.4 m) so doorways don't snag.
- Muffle outdoor audio inside (low-pass) and keep the hearth crackle dry.
- Mark each interior on the map with a door icon.

## 8. Verify with 1–2 renders, not 20
Render from two fixed cameras:
1. from the doorway looking in
2. from the far corner looking back at the door

Check:
- Can you spot the hero in 1 second?
- Is any corner empty?
- Is any surface flat black (it needs emissive or vertex colour)?
- Can you see through anything (missing wall or backface)?
- Does anything float or clip?

Fix those and stop.

## Prompt you can paste into Claude Code
> Build a walk-in interior for <place>. First write a 5-line description and a 3-tier prop list (1 hero, 4–8 supporting, 10–30 clutter) with real-world sizes in metres. Use primitives only, merged per material. Use one shared moving PointLight and fake the rest with warm emissive, baked vertex colour and glow sprites; make the inside warm (~2700 K) against the cold outside. Add at least 2 animated elements (fire flicker from layered sines, steam particles). Make the walls double-sided or closed so the room isn't see-through from outside. Hide the contents beyond 10 m. Add AABB colliders. Then render from the doorway and from the far corner, and fix empty corners, black surfaces, see-through gaps and floating props.
