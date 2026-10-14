// BIOLUMINESCENCE BAY — a hidden cove where the sea lights up.
// Entry point: builds the cove, wires the systems together, runs the frame loop.
//
// Forked from Goa_trance/src/main.js on 2026-10-07. The frame loop, the stall recorder,
// the preload-behind-the-overlay trick and the stats handle are Goa's and are kept as
// they were; read Goa_trance/CLAUDE.md for why each of them exists.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import {
    PALETTE,
    DRIFTWOOD_STAGE, DJ_RAFT, THE_ROCKS, FIRE_CAMP, ARRIVAL, LOOKOUT,
} from './core/constants.js';
import {
    createTerrain, plantCoast, plantDuneGrass, getTerrainHeight, landmarkY, shoreX,
} from './core/Terrain.js';
import { createOcean } from './core/Ocean.js';
import { createSkyCycle } from './core/SkyCycle.js';
import { createAudioEngine } from './core/AudioEngine.js';
import { createCollisionSystem } from './core/CollisionSystem.js';
import { createControls } from './core/Controls.js';
import { createZoneManager } from './core/ZoneManager.js';
import { createMinimap } from './core/Minimap.js';
import { createCrowdSystem } from './core/CrowdSystem.js';
import { createAtmosphere } from './core/Atmosphere.js';
import { createVehicles } from './core/Vehicles.js';
import { createFauna } from './core/Fauna.js';
import { createPaths } from './core/Paths.js';
import { createUI } from './core/UI.js';
import { buildHammock, buildPathLantern, updateFluoro, MAT } from './core/Props.js';

import { generateDriftwoodStage } from './zones/DriftwoodStage.js';
import { generateDJRaft } from './zones/DJRaft.js';
import { generateTheRocks } from './zones/TheRocks.js';
import { generateFireCamp } from './zones/FireCamp.js';
import { generateArrival } from './zones/Arrival.js';
import { generateLookout } from './zones/Lookout.js';
import { createGuide, did } from './core/Guide.js';
import { createKayaks } from './core/Kayak.js';
import { createJellyfish } from './core/Jellyfish.js';
import { createSurf } from './core/Surf.js';
import { createFootprints } from './core/Footprints.js';

// ═══════════════════════════════════════════════════════════
//  RENDERER
// ═══════════════════════════════════════════════════════════
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a18);
scene.fog = new THREE.FogExp2(0x060a18, 0.003);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.2, 3400);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The shadow map re-renders every caster on the coast — thousands of instanced palm
// fronds plus the crowd — into a 2048² map. Doing that every frame is a whole second
// geometry pass for a sun that takes five minutes to cross the sky.
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// 0.92, not the 1.15 the Mountains build used. That world's ground was dark green rock;
// this one is pale sand at ~0.85 albedo, which clips to white under far less light.
renderer.toneMappingExposure = 0.92;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Deliberately much tamer than the Mountains build. Two things here blow out fast:
// saturated fluoro magenta at close range, and sunlit pale sand. The threshold is high
// so only the sun, the fluoro and the fires bloom — not the whole beach.
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.82);
composer.addPass(bloom);
// Finish pass (2026-10-09 polish): a soft vignette that pulls the eye to the middle, and a
// very fine moving grain so the dark water and sky stop banding. Nothing else changes.
const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            vec2 d = vUv - 0.5; d.x *= 1.25;
            c.rgb *= mix(1.0, 0.72, smoothstep(0.32, 0.85, length(d)));
            c.rgb += (h(vUv * 1000.0 + fract(uTime) * 61.0) - 0.5) * 0.018;
            gl_FragColor = c;
        }`,
});
composer.addPass(finish);

// ═══════════════════════════════════════════════════════════
//  WORLD
// ═══════════════════════════════════════════════════════════
const ui = createUI();
ui.hudText('<span class="cool">THE RAFT</span> — out on the water <span class="sep">·</span> ' +
    '<span class="cool">THE NET CAVE</span> — on the dune <span class="sep">·</span> ' +
    'follow the red lamps down');

createTerrain(scene);
plantCoast(scene);
plantDuneGrass(scene);
const ocean = createOcean(scene);
const paths = createPaths(scene);

// 0.42 is late afternoon: the sun is ~28° up and it touches the water at t = 0.5, so
// the first thing that happens unprompted is the sunset, about half a minute in.
// 0.66 is full night (night runs 0.62 → 0.93, and SkyCycle's clock crawls in this
// fork). The Bay is a night world: you arrive in the dark and the water is already lit.
const sky = createSkyCycle(scene, 0.66);
const audio = createAudioEngine();
const collisionSystem = createCollisionSystem();
const vehicles = createVehicles(scene, audio);
const fauna = createFauna(scene, ocean, audio);
const atmosphere = createAtmosphere(scene, camera);
const crowd = createCrowdSystem(scene);

const controls = createControls({ camera, scene, audio, collisionSystem, vehicles, ocean, ui });

// Bay redesign: you arrive at the LOOKOUT on top of the North Horn, 25 m up, looking
// south-east over the whole glowing cove to the raft. The red-lit cliff trail goes down.
controls.teleport(LOOKOUT.x + 3, LOOKOUT.z + 2, DJ_RAFT.x, DJ_RAFT.z);
const kayaks = createKayaks(scene, { ocean, controls, audio, ui });
const jellies = createJellyfish(scene, { ocean, camera });
const surf = createSurf(scene, { ocean, controls, audio, ui });
const footprints = createFootprints(scene, { ocean, controls, camera });

// ═══════════════════════════════════════════════════════════
//  ZONES
// ═══════════════════════════════════════════════════════════
const zones = {
    stage: {
        name: 'THE NET CAVE', short: 'CAVE', major: true, color: '#46d2ff',
        center: new THREE.Vector3(DRIFTWOOD_STAGE.x, 0, DRIFTWOOD_STAGE.z), radius: 44,
        alwaysLoaded: true, loaded: false, group: null,
        generate: (c) => generateDriftwoodStage(c),
    },
    raft: {
        name: 'THE RAFT', short: 'RAFT', major: true, color: '#7ff6ff',
        center: new THREE.Vector3(DJ_RAFT.x, 0, DJ_RAFT.z), radius: 26,
        alwaysLoaded: true, loaded: false, group: null,
        generate: (c) => generateDJRaft(c),
    },
    rocks: {
        name: 'THE ROCKS', short: 'ROCKS', major: true, color: '#4fd8ff',
        center: new THREE.Vector3(THE_ROCKS.x, 0, THE_ROCKS.z), radius: 28,
        loaded: false, group: null,
        generate: (c) => generateTheRocks(c),
    },
    camp: {
        name: 'THE FIRE CAMP', short: 'CAMP', color: '#ffb055',
        center: new THREE.Vector3(FIRE_CAMP.x, 0, FIRE_CAMP.z), radius: 30,
        loaded: false, group: null,
        generate: (c) => generateFireCamp(c),
    },
    lookout: {
        name: 'THE LOOKOUT', short: 'LOOKOUT', major: true, color: '#7ff6ff',
        center: new THREE.Vector3(LOOKOUT.x, 0, LOOKOUT.z), radius: 22,
        alwaysLoaded: true, loaded: false, group: null,
        generate: (c) => generateLookout(c),
    },
    arrival: {
        name: 'MANGROVE CREEK', short: 'CREEK', color: '#4fffc8',
        center: new THREE.Vector3(ARRIVAL.x, 0, ARRIVAL.z), radius: 30,
        loaded: false, group: null,
        generate: (c) => generateArrival(c),
    },
};

const zoneManager = createZoneManager(scene, zones, collisionSystem, ui, renderer, camera);
const minimap = createMinimap(camera, zones, controls.getYaw, vehicles);
minimap.setCraft(() => [...kayaks.craft(), ...surf.craft()]);

// ═══════════════════════════════════════════════════════════
//  FRAME CONTEXT
//  One object, mutated each frame and handed to everything that updates.
// ═══════════════════════════════════════════════════════════
const SILENT = { bass: 0, mid: 0, treble: 0, level: 0 };

const ctx = {
    time: 0, delta: 0,
    camera, scene, ui, audio, controls, collisionSystem, crowd, sky, vehicles, ocean, fauna,
    energy: SILENT,
    stageEnergy: (key) => audio.getStageEnergy(key),
    night: 0, dawn: 0, dusk: 0, timeOfDay: 0, submerged: 0,
    weather: { stormLevel: 0 },
    ceremony: false,
    // Defined below; the Rocks zone registers an interactable that calls it, and zones
    // are generated inside preloadAll() which runs well after this file finishes.
    // (Goa's name — TheRocks.js still calls ctx.startSunsetSession. In the Bay it
    // starts the Glow Tide.)
    startSunsetSession: () => startGlowTide(),
};

// ═══════════════════════════════════════════════════════════
//  WHAT YOU CAN LEAVE BEHIND
// ═══════════════════════════════════════════════════════════
const playerCamp = new THREE.Group();
playerCamp.name = 'playerCamp';
scene.add(playerCamp);
const playerUpdaters = [];
let hammockCount = 0;
let lanternCount = 0;

function forwardPoint(distance) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    return camera.position.clone().add(dir.multiplyScalar(distance));
}

// e.repeat is already filtered inside Controls before hooks run, so holding V cannot
// carpet the beach in hammocks.
controls.onKey('v', () => {
    if (hammockCount >= 16) { ui.toast('That is enough hammocks'); return; }
    const p = forwardPoint(6);
    if (ocean.depthAt(p.x, p.z) > 0.3) { ui.toast('Not over the water'); return; }
    // Two posts of its own, so it works anywhere rather than only between real palms.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const nx = -dir.z, nz = dir.x;
    const ax = p.x + nx * 2.6, az = p.z + nz * 2.6;
    const bx = p.x - nx * 2.6, bz = p.z - nz * 2.6;
    for (const [px, pz] of [[ax, az], [bx, bz]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.2, 6), MAT.bamboo);
        post.position.set(px, getTerrainHeight(px, pz) + 1.6, pz);
        playerCamp.add(post);
    }
    const ham = buildHammock(ax, az, bx, bz, {
        hangY: 2.9, sag: 1.1,
        color: [0xc85a3a, 0x2f7a8a, 0xd8a520, 0x9a3cff][hammockCount % 4],
    });
    playerCamp.add(ham.group);
    playerUpdaters.push(ham.update);
    hammockCount++;
    audio.sfx('whoosh', { gain: 0.22 });
    ui.toast('HAMMOCK SLUNG');
});

controls.onKey('l', () => {
    if (lanternCount >= 40) { ui.toast('The beach is bright enough'); return; }
    const p = forwardPoint(3);
    const lantern = buildPathLantern(p.x, p.z, PALETTE.lamp, 2.2);
    playerCamp.add(lantern.group);
    playerUpdaters.push(lantern.update);
    lanternCount++;
    audio.sfx('chime', { gain: 0.25 });
    ui.toast('LAMP LIT');
});

// ═══════════════════════════════════════════════════════════
//  WORLD SHORTCUTS
// ═══════════════════════════════════════════════════════════
controls.onKey('k', () => ui.toggleShortcuts());
controls.onKey('h', () => ui.toast(ui.toggleContext() ? 'INFO CARDS HIDDEN — H TO SHOW' : 'INFO CARDS ON'));
controls.onKey('m', () => minimap.toggle());

const TELEPORTS = [
    { name: 'THE NET CAVE', p: { x: DRIFTWOOD_STAGE.x - 24, z: DRIFTWOOD_STAGE.z + 2 }, offset: 0, look: { x: DRIFTWOOD_STAGE.x + 10, z: DRIFTWOOD_STAGE.z } },
    { name: 'THE SURF, FACING THE RAFT', p: { x: shoreX(DJ_RAFT.z) + 1, z: DJ_RAFT.z }, offset: 0, look: DJ_RAFT },
    { name: 'THE ROCKS', p: THE_ROCKS, offset: 18, look: { x: THE_ROCKS.x - 200, z: THE_ROCKS.z + 40 } },
    { name: 'THE FIRE CAMP', p: FIRE_CAMP, offset: 22, look: FIRE_CAMP },
    { name: 'MANGROVE CREEK', p: ARRIVAL, offset: 12, look: DJ_RAFT },
    { name: 'THE SURF BREAK', p: { x: surf.rack.x + 4, z: surf.rack.z + 3 }, offset: 0, look: { x: surf.rack.x - 60, z: surf.rack.z - 6 } },
    { name: 'THE KAYAKS', p: { x: shoreX(-14) + 6, z: -11 }, offset: 0, look: { x: shoreX(-14) - 20, z: -14 } },
    { name: 'THE LOOKOUT', p: { x: LOOKOUT.x + 3, z: LOOKOUT.z + 2 }, offset: 0, look: DJ_RAFT },
];
let teleportIndex = -1;

controls.onKey('t', () => {
    teleportIndex = (teleportIndex + 1) % TELEPORTS.length;
    const d = TELEPORTS[teleportIndex];
    ui.flash(340);
    controls.teleport(d.p.x, d.p.z + d.offset, d.look.x, d.look.z);
    audio.sfx('whoosh', { gain: 0.4 });
    ui.toast(`→ ${d.name}`);
});

// ── The Glow Tide ──
// Bay's answer to Goa's sunset session (X, or E at the rocks). The plankton bloom
// surges for ~40 s: every disturbance is brighter and the crests light the whole bay,
// and everybody walks down into the surf to be in it.
let ceremonyTimer = 0;

function startGlowTide() {
    if (ceremonyTimer > 0) { ui.toast('The tide is already glowing'); return; }
    ceremonyTimer = 40;
    ctx.ceremony = true;
    ocean.setBioBoost(2.6);
    // −X is the sea. Rally on the waterline in front of the stage, facing out.
    crowd.rallyTo(shoreX(DRIFTWOOD_STAGE.z) + 3, DRIFTWOOD_STAGE.z, 34, -1, 0, true);
    audio.setDrumCircle(true);
    audio.sfx('conch', { gain: 0.8 });
    ui.flash(500);
    ui.toast('GLOW TIDE — everyone is walking into the water');
}
controls.onKey('x', startGlowTide);

controls.onKey('c', () => {
    const on = atmosphere.toggleStorm();
    audio.sfx('whoosh', { gain: 0.5 });
    ui.toast(on ? 'A SQUALL COMING IN OFF THE WATER' : 'IT IS BLOWING THROUGH');
});

controls.onKey('n', () => {
    const frozen = sky.toggleFreeze();
    ui.toast(frozen ? 'TIME HELD' : 'TIME RUNNING');
});
controls.onKey(',', () => sky.scrub(-0.02));
controls.onKey('.', () => sky.scrub(0.02));

// ═══════════════════════════════════════════════════════════
//  ENTRY / AUDIO SETUP
// ═══════════════════════════════════════════════════════════
// refDistance is the radius that still plays at full volume; rolloff sets how fast it
// falls away past that. AudioEngine uses the EXPONENTIAL model (gain = (d/ref)^-rolloff),
// per the 3D-scene tactics doc — the old linear-rolloff advice is superseded.
//
// BAY M1 tuning (2026-10-07), re-checked after the layout v2 move: stage anchor (8, 62),
// raft (-76, 44) — still ~86 u apart, the waterline ~35 u from the stage and ~51 u from
// the raft, so the table holds. Targets: each floor
// owns its own space, the waterline is a CROSSFADE (walk into the sea and the raft takes
// over), and neither is ever silent — the other one is a thump across the water.
//
//                         stage   raft
//   stage floor (12,0)    1.00    0.12
//   waterline  (-23,0)    0.47    0.40
//   at the raft           0.08    1.00
//
// M0 had stage 34/2.3 + raft 44/1.7: the raft was 0.33 on the stage floor and both were
// ~0.8–0.9 in the surf — two sets on top of each other. Re-measure by ear on the laptop.
const STAGE_DEFS = [
    {
        // Anchor at the centre of the floor (west of the booth), not at the booth.
        key: 'stage', setKey: 'discoValley',
        x: DRIFTWOOD_STAGE.x - 14, y: landmarkY(DRIFTWOOD_STAGE) + 6, z: DRIFTWOOD_STAGE.z,
        refDistance: 24, rolloff: 2.0, gain: 1.0,
    },
    {
        key: 'raft', setKey: 'hilltop',
        x: DJ_RAFT.x, y: 4, z: DJ_RAFT.z,
        refDistance: 35, rolloff: 2.4, gain: 0.95,
    },
];

const pendingTracks = [];

function wireUploader(inputId, labelId, stageKey) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        label.classList.add('loaded');
        label.childNodes[0].nodeValue = 'Loading…';
        if (!audio.isStarted()) {
            pendingTracks.push({ stageKey, file, label });
            label.childNodes[0].nodeValue = 'Queued — enter to play';
            return;
        }
        await audio.loadStageFile(stageKey, file);
        label.childNodes[0].nodeValue = 'Playing (change)';
    });
}
wireUploader('audio-stage', 'lbl-stage', 'stage');
wireUploader('audio-raft', 'lbl-raft', 'raft');

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', async (e) => {
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'label' || e.target.classList.contains('track-uploader')) return;

    if (!audio.isStarted()) audio.init(STAGE_DEFS);
    controls.enter();

    for (const t of pendingTracks.splice(0)) {
        await audio.loadStageFile(t.stageKey, t.file);
        t.label.childNodes[0].nodeValue = 'Playing (change)';
    }
});

const muteBtn = document.getElementById('mute-btn');
const volSlider = document.getElementById('vol-slider');
muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    muteBtn.innerHTML = audio.toggleMute() ? '&#128263;' : '&#9835;';
});
volSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    audio.setVolume(parseFloat(volSlider.value) / 100);
});
volSlider.addEventListener('click', (e) => e.stopPropagation());

// ═══════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════
const clock = new THREE.Clock();
let frame = 0;
const SHADOW_REFRESH = 4;

// Touching style.opacity every frame forces a style recalc for a value that is zero
// almost all the time, so it is only written when it actually changes.
const underwaterEl = document.getElementById('underwater');
let lastSubmerged = -1;

// Draw-call accounting for BAY.stats(). renderer.info.render is reset at the start of
// every renderer.render() call and the composer makes one per pass, so reading it after
// composer.render() would only ever report the final bloom quad. Turning autoReset off
// and resetting once per frame accumulates across all passes instead.
renderer.info.autoReset = false;
let frameCalls = 0, frameTris = 0;

// ── STALL RECORDER ──
// Frame-rate averages hide the thing that actually ruins a world like this: occasional
// multi-hundred-millisecond freezes. `outsideJs` is time the browser spent between our
// frames, which is where GPU work, shader linking and GC show up.
const STALL_MS = 60;
const stalls = [];
let lastFrameEnd = performance.now();
const T = { controls: 0, ocean: 0, vehicles: 0, fauna: 0, crowd: 0, atmosphere: 0, zones: 0, stream: 0, render: 0 };
const mark = (k, t0) => { T[k] = performance.now() - t0; };

function animate() {
    requestAnimationFrame(animate);
    const frameStart = performance.now();
    const outsideJs = frameStart - lastFrameEnd;
    const programsBefore = renderer.info.programs.length;
    let t = frameStart;

    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();
    frame++;

    // ── clock & light ──
    const cfg = sky.update(delta, time, camera);

    // ── refresh the shared frame context ──
    ctx.time = time;
    finish.uniforms.uTime.value = time;
    ctx.delta = delta;
    ctx.energy = audio.getEnergy();
    ctx.night = cfg.starFade;
    ctx.dawn = sky.duskFactor() * 0;            // reserved; the dusk factor is the one used here
    ctx.dusk = sky.duskFactor();
    ctx.timeOfDay = sky.getTime();
    ctx.weather.stormLevel = atmosphere.getStormLevel();

    // ── movement (must run before anything that reads the camera position) ──
    // The dance rides the loudest floor's bass, so it lands on whatever you can hear.
    controls.setDanceBass(Math.max(
        audio.getStageEnergy('stage').bass,
        audio.getStageEnergy('raft').bass,
        ctx.energy ? ctx.energy.bass : 0));
    t = performance.now(); controls.update(delta); mark('controls', t);
    ctx.submerged = controls.getSubmerged();
    // Bay: swimming under the surface lights the water above you too.
    if (ctx.submerged > 0.3) ocean.splash(camera.position.x, camera.position.z, 0.6, 'player');
    sky.setUnderwater(ctx.submerged);
    if (ctx.submerged !== lastSubmerged) {
        underwaterEl.style.opacity = ctx.submerged;
        lastSubmerged = ctx.submerged;
    }

    // ── audio ──
    audio.update(camera, delta, ctx.weather, ctx.night, ctx.submerged);

    // ── world ──
    t = performance.now(); ocean.update(ctx); kayaks.update(ctx); jellies.update(ctx); surf.update(ctx); footprints.update(ctx);
    ui.context(surf.contextCard(camera.position.x, camera.position.z) || kayaks.contextCard(camera.position.x, camera.position.z)); mark('ocean', t);
    paths.update(ctx);
    updateFluoro(ctx);
    for (let i = 0; i < playerUpdaters.length; i++) playerUpdaters[i](ctx);
    t = performance.now(); vehicles.update(ctx); mark('vehicles', t);
    t = performance.now(); fauna.update(ctx); mark('fauna', t);
    t = performance.now(); crowd.update(ctx); mark('crowd', t);
    t = performance.now(); atmosphere.update(ctx); mark('atmosphere', t);
    t = performance.now(); zoneManager.animate(ctx); mark('zones', t);

    // Both movers register into the same dynamic list, and Controls clears it each
    // frame before the vehicles go in — so the fauna has to be added after that.
    fauna.registerDynamicObstacles(collisionSystem);

    // ── ceremony ──
    if (ceremonyTimer > 0) {
        ceremonyTimer -= delta;
        if (ceremonyTimer <= 0) {
            ctx.ceremony = false;
            ocean.setBioBoost(1);
            crowd.disperse();
            audio.setDrumCircle(false);
            ui.toast('The beach goes back to what it was doing');
        }
    }

    // ── shadows ──
    renderer.shadowMap.needsUpdate = (frame % SHADOW_REFRESH === 0);

    // ── HUD, a few times a second rather than every frame ──
    T.stream = 0;
    if (frame % 20 === 0) {
        t = performance.now(); zoneManager.stream(camera, ctx); mark('stream', t);
        minimap.draw();
        ui.clock(sky.label(), `day ${sky.getDay()}${sky.isFrozen() ? ' · held' : ''}`);
    }

    renderer.info.reset();
    t = performance.now(); composer.render(); mark('render', t);
    frameCalls = renderer.info.render.calls;
    frameTris = renderer.info.render.triangles;

    // ── stall bookkeeping ──
    lastFrameEnd = performance.now();
    const jsMs = lastFrameEnd - frameStart;
    if (jsMs + outsideJs > STALL_MS) {
        const worst = Object.keys(T).reduce((a, b) => (T[a] > T[b] ? a : b));
        stalls.push({
            at: Math.round(time), total: +(jsMs + outsideJs).toFixed(0),
            js: +jsMs.toFixed(0), outsideJs: +outsideJs.toFixed(0),
            worst, worstMs: +T[worst].toFixed(0),
            newPrograms: renderer.info.programs.length - programsBefore,
            zone: zoneManager.getCurrentZoneName() || '—',
        });
        if (stalls.length > 60) stalls.shift();
    }
}

// Build and compile the whole coast behind the entry overlay, one frame after paint so
// the title card is actually on screen while it happens. Doing it up front is the point:
// a zone loading mid-walk changes the scene's light count, and three.js bakes that into
// every material, so it recompiles every shader in the scene and freezes the frame.
requestAnimationFrame(() => {
    const cost = zoneManager.preloadAll(ctx);

    // Fires that are always burning, collected from whichever zones declared one.
    const embers = [];
    for (const key in zones) {
        const src = zones[key].group?.userData.emberSource;
        if (src) embers.push({ ...src, y: getTerrainHeight(src.x, src.z) + 0.6 });
    }
    atmosphere.setEmberSources(embers);

    console.info(`[BAY] cove ready — ${cost.buildMs}ms build, ${cost.compileMs}ms shader compile`);
    minimap.draw();
    animate();
});

// Perf handle. Cheap to leave in and the only way to see draw calls and the live light
// count, which is what this scene lives or dies on.
// ── First-visit guide (Tab hides it, remembered). Steps advance when the visitor does the thing. ──
createGuide({
    world: () => ({ x: camera.position.x, z: camera.position.z }),
    steps: [
        { id: 'move', when: () => true, text: 'That is the bay. <b>Mouse</b> to look · hold <b>W</b> to walk · <b>Shift</b> to run', done: did.held('KeyW') },
        { id: 'sea', when: () => true, text: 'Walk down to the water. Then walk into it.', done: () => ocean.depthAt(camera.position.x, camera.position.z) > 0.2, big: true },
        { id: 'stage', when: () => true, text: 'Follow the red lamps down. The Net Cave is on the dune, south of the raft', done: (S, w) => Math.hypot(w.x - DRIFTWOOD_STAGE.x, w.z - DRIFTWOOD_STAGE.z) < 30 },
        { id: 'raft', when: () => true, text: 'Somebody is playing from a raft out in the bay. Swim to it — the ladder is on the beach side.', done: () => controls.isAboard() },
        { id: 'tide', when: () => true, text: 'Press <b>X</b> for the Glow Tide', done: did.pressed('KeyX') },
    ],
});

window.BAY = {
    renderer, scene, camera, zones, ctx, composer, bloom,
    crowd, atmosphere, vehicles, fauna, sky, paths, ocean, zoneManager, controls, kayaks, surf,
    stats() {
        let lights = 0, meshes = 0, shadowCasters = 0;
        scene.traverse(o => {
            if (o.isLight) { lights++; if (o.castShadow) shadowCasters++; }
            if (o.isMesh) meshes++;
        });
        return {
            calls: frameCalls, tris: frameTris,
            programs: renderer.info.programs.length,
            lights, shadowCasters, meshes,
        };
    },
    /** The last 60 frames slower than STALL_MS, worst first. Play, then call this. */
    stalls(n = 20) {
        return [...stalls].sort((a, b) => b.total - a.total).slice(0, n);
    },
    clearStalls() { stalls.length = 0; },
};

// ═══════════════════════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════════════════════
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
});
