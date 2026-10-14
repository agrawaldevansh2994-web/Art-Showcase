# 3D Explorable Scene Tactics & Best Practices

> ## ⚠️ SUPERSEDED — read `Downloads/backups/CLAUDE.md` instead
> This file is kept as history. The current playbook lives in the root `CLAUDE.md`,
> which carries everything below that still holds plus what was learned since
> (measured light-count/shader-recompile findings, texture leaks, material and
> particle gotchas, working method).
>
> **One claim in this file is now known to be wrong:** section 2 says *"Linear
> distance drop-offs work best"* for audio. Linear caused two stages 320 units
> apart to both play at ~60% in the middle of the valley and fight each other;
> `distanceModel: 'exponential'` with a tuned `refDistance`/`rolloffFactor` is the
> fix. Do not follow the linear advice.

When generating or iterating on 3D browser-based scenes (especially with Three.js), follow these proven tactics to ensure the scene looks incredible, performs smoothly, and stays manageable.

## 1. Performance is Everything (Combating Lag)
*   **InstancedMesh is Mandatory for Clutter**: Never use a `for` loop to add hundreds of individual `THREE.Mesh` objects (like trees, leaves, or grass). Use `THREE.InstancedMesh`. It drops draw calls from thousands to literally 1. 
*   **Cache and Reuse Materials/Geometries**: If you have 400 lanterns or lightbulbs, **do not** instantiate a new `MeshStandardMaterial` or `CylinderGeometry` for every single one. Create them *once* outside the generation loop and pass the reference. This prevents garbage collection stutters ("mini hangs") and shader compilation lag.
*   **Keep PointLights to a Minimum**: In Three.js, adding too many `PointLight` objects will destroy performance because the shader must calculate the lighting equation for *every* light on *every* pixel. For ambient glows (like fireflies or small lanterns), use `THREE.Sprite` with Additive Blending. Only use actual `PointLight`s for major light sources (like the party core or the moon).

## 2. Aesthetics & Vibe
*   **Banish the Void**: Pitch black (`0x000000`) looks unnatural. Use rich, dark hues for the background and fog (e.g., `0x051510` for a deep forest night) to create atmosphere.
*   **Material Base Colors Matter**: If you want a scene to look dark, do not make the base material colors pitch black. If a material is black, it will absorb all light and you won't be able to see the geometry even when a bright light shines on it. Use mid-tones for the base color (e.g., green for grass) and rely on the `AmbientLight` and `DirectionalLight` to control the actual darkness of the scene.
*   **Bloom & Tonemapping**: Use `UnrealBloomPass` to make lights "pop". Pair it with `THREE.ACESFilmicToneMapping` on the renderer and adjust the exposure. This gives the scene a cinematic, HDR-like quality.

### General Good Ideas (The "Vibe" Layer)
*   **Audio-Reactive Everything**: If you have music, pump the FFT (Fast Fourier Transform) data into your shaders or object scales. A pulsing, audio-reactive world instantly feels 100x more alive than static geometry.
*   **Dynamic Weather (Don't just use particles)**: When building weather like dust storms or fog, don't rely entirely on particle systems. Tie `scene.fog.density` and `scene.fog.color` to your weather system. A volumetric wall of fog creates a true "whiteout" effect that particles alone can never achieve, and completely hides the edge of the world.
    - **Portals (Stargates)**: Used rotating ring geometries with specialized Torus segments. The `time` variable drives rotation, `pulse` drives material glow oscillation (`Math.sin(time*2.5)`).
    - **Vehicles/Bicycles**: Spawning relies on camera heading. Make sure to `+ Math.PI` to the yaw to orient spawned vehicles correctly, otherwise they drive backwards.
    - **Dismounting**: When getting off a vehicle, calculate an orthogonal vector (`Math.cos` and `-Math.sin`) and displace the player position outside the vehicle's collision radius so they don't get trapped.
    - **Dust Storms**: 
      - *Ambient Dust*: 10,000 tiny particles (`size: 0.8`) using `NormalBlending`. Additive blending looks too much like glowing snow!
      - *Heavy Storm*: Ramps fog density to `0.05` (whiteout), shifts color to beige `0xccaa88`, and blasts particles on the Z-axis at `3.5+` speed.
      - *Transitions*: Use extremely slow lerps (`delta * 0.15`) for opacity and density so the storm creeps in over 10 seconds.
    - **Audio Tuning**: Linear distance drop-offs work best for portals. For dynamic ducking (like lowering the main stage volume near a portal), use a Smoothstep curve (`t*t*(3-2*t)`) instead of linear so the transition feels organic like a DJ crossfade.
*   **Procedural Terrain Height Tracking**: If your terrain is generated via procedural shaders (e.g., sine waves for dunes), don't hardcode your camera to a flat Y-axis plane (e.g., `camera.position.y = 1.8`). You will clip underneath the ground. Instead, mirror the shader's noise math in Javascript (e.g., `groundY = Math.sin(x)*Math.cos(z)*4.0`) and dynamically lock the camera height to `groundY + PLAYER_HEIGHT`.
*   **Key Event Debouncing (Crucial for GPU Health)**: When building user-spawnable objects (like hitting 'B' to build a tent), you **must** use `if (e.repeat) return;` inside your `keydown` listener. Without this, a user holding down the key will fire the event 60 times a second, instantly spawning hundreds of meshes/lights and crashing the browser.

## 3. Audio & Music
*   **Procedural Web Audio**: Relying on external audio files can cause CORS issues, dead links, or slow loading times. For electronic music or atmospheric drones, use the `AudioContext` API to generate procedural audio buffers (e.g., math-generated kicks, hi-hats, and synth basslines). It's 100% reliable and instantaneous.
*   **Positional Audio**: Attach `THREE.PositionalAudio` to specific meshes in the scene so the audio gets louder as the user approaches it, grounding the sound in the 3D world. Remember to add a `THREE.AudioListener` to the camera!

## 4. First-Person Controls
*   **PointerLockControls**: This is the standard for first-person exploration. Always include an HTML overlay with a "Click to Enter" button because modern browsers block audio playback and cursor-locking until the user interacts with the page.
*   **Keyboard Handling**: Use a `keys` object that maps `event.code` and `event.key.toLowerCase()` to true/false. This ensures WASD movement works smoothly across different keyboard layouts (like AZERTY) and Caps-Lock states. Check both in the animation loop.

## 5. Animation Loops
*   **Time-Based Math**: When animating hovering items, flickering lights, or bouncing people, use `Math.sin(clock.getElapsedTime() * speed + phaseOffset)`. This guarantees smooth animation regardless of the frame rate.
*   **Avoid Object Creation in `animate()`**: Never use the `new` keyword inside the `requestAnimationFrame` loop. It will cause massive memory leaks and frame drops.


## 6. People you can walk up to (Atlantis yacht, 2026-10-02)
*   **A prop "glued to the hand" means it is mounted on the wrong side of the hand.** Rocketbox's hand bone has +X down the fingers, the palm on **+Y**, +Z toward the index. The props sat on −Y (the back of the hand) while the fingers closed on nothing. Render the hand close-up from four sides with the grip applied (`tools/preview-guest.html?prop=glass|bottle|phone`) and read the joint positions in hand space before moving anything.
*   **One object per person, kept.** Don't toggle a glass on and off with the animation clip: it vanishes when the arm drops. Hold it low (blend the arm to its own drink-clip pose after the mixer) and put it down only when they start dancing.
*   **Plan a crowd in arrival order, not departure order.** People who walk in from different directions fill the floor in a different order than they set off. Each should choose her spot on reaching the floor's edge: the deepest free spot she can walk to in a straight line without passing within a body's width of anyone. Never make anyone pass between two standing dancers.
*   **Keep a lane open to every stair.** Dancers are solid; a spot 1.1 m from the next leaves no room to pass. Measure the clear width from the foot of each stair to the open deck with the real wall list.
*   **Edit a baked character's outfit by body position, not texture colour.** Rasterise a position map once (`bake-guests.html?mode=posmap`), then paint by height and angle. Bare skin from a donor body copies cleanly through cylinder coordinates (angle round the torso, height), and the tone must be matched separately for front and back.
*   **Reshaping a skinned mesh: move the vertices, keep the normals.** Recomputing normals on an unindexed FBX mesh facets the whole body. A 7–11 % pull needs no new ones.
*   **A first-person drink is low and to the side.** At eye level the glass floated mid-air; put it in the lower corner, stem and foot below the frame, with a slow sway that grows when you walk.
*   **Greet by distance, don't wait for a key.** A line of text as the player walks up, E for more, one more key for the big action. State the keys on the prompt line, not just in a toast.
*   **A "later, if anyone asks" request goes in the notes, not the build.** (A kiss animation: no Rocketbox clip exists; it would be a hand-posed head lean plus a camera move.)
