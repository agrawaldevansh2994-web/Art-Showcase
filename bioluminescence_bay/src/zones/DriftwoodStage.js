// THE NET CAVE — the main stage of Bioluminescence Bay (redesign 2026-10-07, from a
// reference photo Devansh sent: a tunnel of draped fishing net, uplit electric blue,
// warm pools of light on the floor). Replaces the M0 driftwood arch.
//
// The fishermen's old nets are draped over a run of bent-pole ribs into a long cave on
// the dune. Its MOUTH faces west down the sand to the water; the booth sits deep inside
// at the back. Between the ribs the net sags and folds, so the walls billow like the
// photo. The net is a shader, not a texture: an anti-aliased mesh grid, lit from the
// floor up (bright at the base, fading toward the crown), with a pulse that runs from
// the booth out to the mouth on every kick. Three layered shells give the depth of
// overlapping drapes. Warm amber pools sit on the floor along both walls.
//
// Light budget unchanged: ONE PointLight (booth) + the fire. The net is additive and
// emissive — it lights nothing, so it costs no light slots.
//
// File/export names kept (DriftwoodStage.js / generateDriftwoodStage / DRIFTWOOD_STAGE)
// so main.js, the audio graph and the crowd wiring need no renames.

import * as THREE from 'three';
import { getTerrainHeight, landmarkY } from '../core/Terrain.js';
import { DRIFTWOOD_STAGE, PALETTE } from '../core/constants.js';
import {
    MAT, buildSpeakerStack, buildBeachFire, makeGlowSprite, plain,
} from '../core/Props.js';
import { mergeStatics, markDynamic } from '../core/Merge.js';

const KEY = 'stage';
const DRIFT = plain(PALETTE.driftwood, { kind: 'standard', roughness: 0.97 });
const DRIFT_DARK = plain(0x8f826e, { kind: 'standard', roughness: 0.98 });

// ── Cave dimensions (local: +X is the back of the cave, −X the mouth) ──
const CAVE_LEN = 24;        // booth end → mouth
const RIBS = 7;             // pole ribs the net is draped over

function netMaterial(layerSeed, strength) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }, uNight: { value: 1 }, uBass: { value: 0 }, uPulse: { value: 0 },
            uSeed: { value: layerSeed }, uStrength: { value: strength },
            uLow: { value: new THREE.Color(0x6fe4ff) }, uHigh: { value: new THREE.Color(0x2048ff) },
        },
        vertexShader: /* glsl */`
            attribute vec2 aMeters;     // (along the cave, around the arch) in metres
            attribute float aLift;      // height above the floor, metres
            attribute float aU;         // 0 at the booth, 1 at the mouth
            varying vec2 vM; varying float vLift; varying float vU;
            void main(){
                vM = aMeters; vLift = aLift; vU = aU;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: /* glsl */`
            uniform float uTime, uNight, uBass, uPulse, uSeed, uStrength;
            uniform vec3 uLow, uHigh;
            varying vec2 vM; varying float vLift; varying float vU;
            void main(){
                // Mesh grid, ~22 cm cells, anti-aliased; dissolves to a soft sheen where
                // cells get smaller than a pixel so the distance never moirés.
                vec2 cell = vM / 0.22;
                vec2 w = fwidth(cell);
                vec2 gl = abs(fract(cell) - 0.5);
                vec2 line = smoothstep(vec2(0.42) - w * 1.5, vec2(0.48), gl);   // 1 on the cord, 0 in the hole
                float knots = max(line.x, line.y);
                float far = clamp(max(w.x, w.y) * 1.6, 0.0, 1.0);
                float mesh = mix(knots, 0.45, far) + 0.06;   // + a faint sheen so the drape reads as a surface

                // Uplight: bright at the floor, falling off up the wall; streaks where the
                // folds catch it.
                float up = exp(-vLift * 0.22) * 0.85 + 0.2;
                float streak = 0.65 + 0.35 * sin(vM.y * 1.7 + vM.x * 0.35 + uSeed * 4.0)
                                     * sin(vM.x * 0.9 - uSeed);
                // Kick pulse running from the booth (u=0) to the mouth (u=1).
                float wave = exp(-pow((vU - uPulse) * 6.0, 2.0)) * (0.4 + uBass);
                float breathe = 0.85 + 0.15 * sin(uTime * 0.6 + uSeed * 2.0);

                vec3 col = mix(uHigh, uLow, clamp(up, 0.0, 1.0));
                float lum = mesh * up * streak * breathe * (1.0 + wave * 1.6);
                col *= lum * uStrength * 2.0 * (0.12 + uNight * 0.88);
                gl_FragColor = vec4(col, 1.0);
            }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, fog: false,
    });
}

/** One draped shell. Returns a mesh in world space. */
function buildNetShell(A, baseY, x0, opts) {
    const SEG_U = 96, SEG_V = 48;
    const pos = [], meters = [], lift = [], us = [], idx = [];
    for (let i = 0; i <= SEG_U; i++) {
        const u = i / SEG_U;                                     // 0 booth → 1 mouth
        const halfW = THREE.MathUtils.lerp(7.0, 9.5, u) * opts.scale;
        const height = THREE.MathUtils.lerp(6.2, 8.8, Math.pow(u, 0.8)) * opts.scale;
        // Pinned on each rib, sagging inward between them.
        const between = Math.sin(Math.PI * ((u * (RIBS - 1)) % 1));
        const sag = 1 - 0.11 * between * opts.sag;
        let arc = 0, prev = null;
        for (let j = 0; j <= SEG_V; j++) {
            const v = j / SEG_V;
            const th = Math.PI * v;                               // 0 = +Z wall, π = −Z wall
            // Vertical folds, stronger between ribs and low on the walls.
            const fold = (Math.sin(th * 14 + u * 9 + opts.seed) * 0.5 + Math.sin(th * 31 - u * 23 + opts.seed * 2) * 0.25)
                * (0.25 + between * 0.6) * (0.4 + Math.abs(Math.cos(th)) * 0.8) * opts.scale * 0.45;
            const r = sag + fold / halfW;
            const x = A.x + x0 - u * CAVE_LEN;
            const z = A.z + Math.cos(th) * halfW * r;
            const yy = Math.sin(th) * height * r;
            const y = baseY + Math.max(yy, 0) - 0.15;
            if (prev) arc += Math.hypot(z - prev[0], y - prev[1]);
            prev = [z, y];
            pos.push(x, y, z);
            meters.push(u * CAVE_LEN, arc);
            lift.push(Math.max(y - baseY, 0));
            us.push(u);
        }
    }
    for (let i = 0; i < SEG_U; i++) for (let j = 0; j < SEG_V; j++) {
        const a = i * (SEG_V + 1) + j, b = a + SEG_V + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aMeters', new THREE.Float32BufferAttribute(meters, 2));
    geo.setAttribute('aLift', new THREE.Float32BufferAttribute(lift, 1));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, opts.material);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return markDynamic(mesh);
}

/** A warm pool of light lying on the floor (additive decal). */
let _poolTex = null;
function floorPool(x, z, size) {
    if (!_poolTex) {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const k = c.getContext('2d');
        const gr = k.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,190,120,0.9)'); gr.addColorStop(0.35, 'rgba(255,150,80,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        k.fillStyle = gr; k.fillRect(0, 0, 128, 128);
        _poolTex = new THREE.CanvasTexture(c);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.6, size),
        new THREE.MeshBasicMaterial({ map: _poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, getTerrainHeight(x, z) + 0.06, z);
    return markDynamic(m);
}

export function generateDriftwoodStage(ctx) {
    const g = new THREE.Group();
    const updaters = [];
    const hotspots = [];
    let floorWash = null;
    const A = DRIFTWOOD_STAGE;
    const baseY = landmarkY(A);

    // The booth sits at the back (+X) of the flattened area; the floor is everything
    // west of it, down to the water.
    const BX = A.x + 8;

    // ── The deck ──
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 9), MAT.wood);
    deck.position.set(BX, baseY + 0.25, A.z);
    deck.receiveShadow = true;
    g.add(deck);
    // Salvaged planks laid over it at slightly wrong angles.
    for (let i = 0; i < 9; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.06, 0.9), i % 3 ? DRIFT : DRIFT_DARK);
        p.position.set(BX, baseY + 0.53, A.z - 4 + i);
        p.rotation.y = (Math.random() - 0.5) * 0.06;
        g.add(p);
    }
    ctx.collisionSystem.registerBox(BX, A.z, 2.6, 4.6, KEY);

    // ── Booth: a door on two oil drums ──
    for (const dz of [-1.3, 1.3]) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), plain(0x1f4a5a, { kind: 'standard', roughness: 0.6, metalness: 0.3 }));
        drum.position.set(BX - 0.6, baseY + 1.0, A.z + dz);
        g.add(drum);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 3.4), DRIFT_DARK);
    door.position.set(BX - 0.6, baseY + 1.54, A.z);
    g.add(door);
    for (const dz of [-0.9, 0, 0.9]) {
        const unit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.78), plain(0x23211c, { kind: 'standard', roughness: 0.7 }));
        unit.position.set(BX - 0.6, baseY + 1.63, A.z + dz);
        g.add(unit);
    }

    // ── The Net Cave ──
    // Back of the cave just behind the booth; the mouth CAVE_LEN further west.
    const X0 = BX - A.x + 3;
    const netMats = [netMaterial(0.0, 1.0), netMaterial(1.7, 0.55), netMaterial(3.3, 0.4)];
    const shells = [
        buildNetShell(A, baseY, X0, { scale: 1.0, sag: 1.0, seed: 0.0, material: netMats[0] }),
        buildNetShell(A, baseY, X0 - 0.6, { scale: 1.07, sag: 1.4, seed: 2.3, material: netMats[1] }),
        buildNetShell(A, baseY, X0 + 0.2, { scale: 0.93, sag: 0.7, seed: 4.1, material: netMats[2] }),
    ];
    shells.forEach(m => g.add(m));

    // The ribs: bent poles the net hangs from, dark against the glow.
    const ribMat = plain(0x1a1e24, { kind: 'standard', roughness: 0.8 });
    for (let k = 0; k < RIBS; k++) {
        const u = k / (RIBS - 1);
        const halfW = THREE.MathUtils.lerp(7.0, 9.5, u), height = THREE.MathUtils.lerp(6.2, 8.8, Math.pow(u, 0.8));
        const x = A.x + X0 - u * CAVE_LEN;
        const pts = [];
        for (let j = 0; j <= 12; j++) {
            const th = Math.PI * j / 12;
            pts.push(new THREE.Vector3(x, baseY + Math.sin(th) * height * 0.985 - 0.15, A.z + Math.cos(th) * halfW * 0.985));
        }
        const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.09, 5, false), ribMat);
        g.add(rib);
        // Ground fixtures at each rib foot: a blue uplight can, and its hot spot.
        for (const side of [-1, 1]) {
            const fz = A.z + side * (halfW - 0.5);
            const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 8), ribMat);
            can.position.set(x - 0.5, getTerrainHeight(x - 0.5, fz) + 0.14, fz);
            g.add(can);
            const hot = markDynamic(makeGlowSprite(0x46d2ff, 0.6, 1.6));
            hot.position.set(x - 0.5, can.position.y + 0.35, fz);
            g.add(hot);
            hotspots.push(hot);
            ctx.collisionSystem.registerCircle(x, A.z + side * halfW, 0.5, KEY);
        }
    }
    // The back wall: net pulled tight across the end behind the booth.
    {
        const halfW = 7.0, height = 6.2;
        const geo = new THREE.PlaneGeometry(halfW * 2, height, 30, 14);
        const P = geo.attributes.position, M = [], L = [], U = [];
        for (let i = 0; i < P.count; i++) {
            const lz = P.getX(i), ly = P.getY(i) + height / 2;
            // clip to the arch outline
            const th = Math.acos(THREE.MathUtils.clamp(lz / halfW, -1, 1));
            const yy = Math.min(ly, Math.sin(th) * height);
            P.setXYZ(i, 0, yy, lz);
            M.push(lz + halfW, yy); L.push(yy); U.push(0);
        }
        geo.setAttribute('aMeters', new THREE.Float32BufferAttribute(M, 2));
        geo.setAttribute('aLift', new THREE.Float32BufferAttribute(L, 1));
        geo.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
        const back = markDynamic(new THREE.Mesh(geo, netMats[0]));
        back.position.set(A.x + X0 + 0.3, baseY - 0.15, A.z);
        back.renderOrder = 2;
        g.add(back);
    }

    // Warm amber pools along both walls, like the floor washes in the photo.
    for (let k = 0; k < 8; k++) {
        const u = (k + 0.5) / 8;
        const halfW = THREE.MathUtils.lerp(7.0, 9.5, u);
        const x = A.x + X0 - u * CAVE_LEN;
        for (const side of [-1, 1]) g.add(floorPool(x, A.z + side * (halfW - 2.2), 2.6));
    }

    // A plank floor down the middle of the cave.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(CAVE_LEN - 3, 0.1, 9), plain(0x8a8c94, { kind: 'standard', roughness: 0.55, metalness: 0.1 }));
    floor.position.set(A.x + X0 - CAVE_LEN / 2 - 1.5, getTerrainHeight(A.x + X0 - CAVE_LEN / 2, A.z) + 0.02, A.z);
    floor.receiveShadow = true;
    g.add(floor);
    // The net's blue spilling across the floor (the photo's floor is lit blue between
    // the warm pools). An additive wash, so it costs no light.
    {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const k = c.getContext('2d');
        const gr = k.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, 'rgba(70,170,255,0.55)'); gr.addColorStop(0.5, 'rgba(40,90,255,0.18)'); gr.addColorStop(1, 'rgba(70,170,255,0.55)');
        k.fillStyle = gr; k.fillRect(0, 0, 64, 64);
        const wash = new THREE.Mesh(new THREE.PlaneGeometry(CAVE_LEN, 15),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        wash.rotation.x = -Math.PI / 2;
        wash.position.set(A.x + X0 - CAVE_LEN / 2, floor.position.y + 0.07, A.z);
        g.add(markDynamic(wash));
        floorWash = wash;
    }

    // ── Speaker stacks, facing the sea (−X) ──
    for (const dz of [-6.2, 6.2]) {
        const sp = buildSpeakerStack(BX - 0.4, A.z + dz, 3, baseY, { facing: -Math.PI / 2 });
        g.add(sp.group);
        updaters.push(sp.update);
    }

    // ── Seating logs scattered up the sides of the floor ──
    for (let i = 0; i < 14; i++) {
        const side = i % 2 ? 1 : -1;
        const lx = A.x - 6 - Math.random() * 22;
        const lz = A.z + side * (13 + Math.random() * 8);
        const len = 2.4 + Math.random() * 2.6;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, len, 7), i % 3 ? DRIFT : DRIFT_DARK);
        log.position.set(lx, getTerrainHeight(lx, lz) + 0.22, lz);
        log.rotation.set(0, Math.random() * Math.PI, Math.PI / 2);
        log.castShadow = true;
        g.add(log);
    }

    // ── The booth lamp — the only electric light on the stage ──
    const boothLamp = new THREE.PointLight(0xffb066, 1.4, 22, 2);
    boothLamp.position.set(BX - 1.4, baseY + 3.4, A.z);
    markDynamic(boothLamp);
    g.add(boothLamp);
    const boothGlow = markDynamic(makeGlowSprite(0xffb066, 0.5, 4));
    boothGlow.position.copy(boothLamp.position);
    g.add(boothGlow);

    // ── A fire on the north side of the floor ──
    const fire = buildBeachFire(A.x - 4, A.z - 22, { light: true, lightIntensity: 2.0, seatCount: 5 });
    g.add(fire.group);
    updaters.push(fire.update);
    ctx.collisionSystem.registerCircle(A.x - 4, A.z - 22, 1.6, KEY);

    // ─────────────────────────────────────────────
    let pulse = 2;
    g.userData.update = (c) => {
        for (let i = 0; i < updaters.length; i++) updaters[i](c);
        const e = c.stageEnergy(KEY);
        const night = c.night ?? 0;
        boothLamp.intensity = 1.4 * Math.max(night, 0.15) * (1 + e.bass * 0.35);
        boothGlow.material.opacity = (0.2 + night * 0.35) * (1 + e.bass * 0.4);
        // The kick pulse travels booth → mouth; a new one launches on each strong bass hit.
        pulse += c.delta * 1.6;
        if (e.bass > 0.55 && pulse > 0.7) pulse = -0.1;
        for (let i = 0; i < netMats.length; i++) {
            const u = netMats[i].uniforms;
            u.uTime.value = c.time; u.uNight.value = night; u.uBass.value = e.bass; u.uPulse.value = pulse;
        }
        floorWash.material.opacity = (0.2 + night * 0.8) * (0.85 + e.bass * 0.3);
        for (let i = 0; i < hotspots.length; i++) hotspots[i].material.opacity = (0.15 + night * 0.5) * (0.9 + e.bass * 0.3);
    };

    g.userData.emberSource = { x: A.x - 4, z: A.z - 22 };
    mergeStatics(g);
    return g;
}
