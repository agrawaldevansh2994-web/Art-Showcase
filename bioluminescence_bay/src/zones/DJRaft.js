// THE DJ RAFT — a plank deck on oil drums, anchored in the middle of the bay.
//
// The second floor, and the one the world is named for: there is no dance floor out
// here except the water. People wade in from the beach and dance knee-deep facing it;
// the brave swim out and tread water round it. Every bob of the raft disturbs the sea,
// so it sits in a permanent halo of plankton light that pulses on the kick.
//
// How the halo works: the raft calls ocean.splash() around its own edge (source 'raft',
// so it never steals the player's trail slots — see pushTrail in Ocean.js). No lights,
// no extra geometry: the glow is the water's.
//
// M2 (2026-10-07): you can board it. Swim to the ladder on the beach side, E to climb.
// Aboard, you walk in the raft's local frame (core/Deck.js, copied from Atlantis's yacht
// deck), so the bob and tilt carry you; walk off any edge and you drop into the sea;
// E at the ladder climbs back down. The booth, speakers and mast are deck walls.

import * as THREE from 'three';
import { DJ_RAFT, PALETTE, FLUORO_COLORS } from '../core/constants.js';
import {
    MAT, buildSpeakerStack, buildStringLights, makeGlowSprite, plain, fluoro,
} from '../core/Props.js';
import { mergeStatics, markDynamic } from '../core/Merge.js';
import { createDeck } from '../core/Deck.js';

const KEY = 'raft';
const HALF = 5;                 // the deck is 10 × 10
const FREEBOARD = 0.55;         // deck top above the local water surface

export function generateDJRaft(ctx) {
    const g = new THREE.Group();
    const updaters = [];
    const A = DJ_RAFT;

    // Everything on the raft lives under one dynamic root that is moved every frame.
    // Built at the origin, so all positions below are raft-local.
    const raft = markDynamic(new THREE.Group());
    raft.position.set(A.x, 0, A.z);
    g.add(raft);

    // ── Drums ──
    const drumMat = plain(0x2a5d6e, { kind: 'standard', roughness: 0.55, metalness: 0.35 });
    for (const dx of [-3.6, 0, 3.6]) {
        for (const dz of [-3.6, 3.6]) {
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12), drumMat);
            drum.rotation.z = Math.PI / 2;
            drum.position.set(dx, -0.35, dz);
            raft.add(drum);
        }
    }

    // ── Deck ──
    const deck = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.3, HALF * 2), MAT.wood);
    deck.position.y = FREEBOARD - 0.15;
    deck.receiveShadow = true;
    raft.add(deck);
    const plankMat = plain(PALETTE.driftwood, { kind: 'standard', roughness: 0.96 });
    for (let i = 0; i < 10; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.2, 0.05, 0.92), plankMat);
        p.position.set(0, FREEBOARD + 0.02, -HALF + 0.5 + i);
        raft.add(p);
    }

    // ── Booth, facing the beach (+X) ──
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 3.0), MAT.darkWood);
    table.position.set(-1.2, FREEBOARD + 0.5, 0);
    raft.add(table);
    for (const dz of [-0.85, 0, 0.85]) {
        const unit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.72), plain(0x23211c, { kind: 'standard', roughness: 0.7 }));
        unit.position.set(-1.2, FREEBOARD + 1.05, dz);
        raft.add(unit);
    }

    // Speakers (v2, 2026-10-07 — "the in-water structure should be better"): the old
    // 2.4 m festival cubes stood as two black towers on a 10 m raft. Now compact cabs,
    // two high a side, with LED rings round every driver that flash on the kick.
    const cabMat = plain(0x15181c, { kind: 'standard', roughness: 0.6, metalness: 0.2 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x58e6ff, fog: false, transparent: true });
    const ledMat2 = new THREE.MeshBasicMaterial({ color: 0xb46bff, fog: false, transparent: true });
    const ringGeo = new THREE.TorusGeometry(0.3, 0.028, 4, 20);
    for (const dz of [-3.4, 3.4]) {
        for (let i = 0; i < 2; i++) {
            const y = FREEBOARD + 0.6 + i * 1.2;
            const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 1.25), cabMat);
            cab.position.set(-2.9, y, dz);
            cab.rotation.y = dz > 0 ? -0.25 : 0.25;
            raft.add(cab);
            const ring = new THREE.Mesh(ringGeo, i ? ledMat2 : ledMat);
            ring.rotation.y = Math.PI / 2;
            ring.position.set(0.47, 0, 0);
            cab.add(ring);
            const cone = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), plain(0x0a0a0c, { kind: 'standard', roughness: 0.9 }));
            cone.rotation.y = Math.PI / 2; cone.position.set(0.455, 0, 0);
            cab.add(cone);
        }
    }

    // LED strip round the deck edge + the booth front, and a cyan wash under the drums.
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x48dcff, fog: false, transparent: true });
    for (const [w, d, x, z] of [[HALF * 2, 0.06, 0, HALF], [HALF * 2, 0.06, 0, -HALF], [0.06, HALF * 2, HALF, 0], [0.06, HALF * 2, -HALF, 0]]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), stripMat);
        st.position.set(x, FREEBOARD - 0.22, z);
        raft.add(st);
    }
    const boothMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uBass: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime, uBass; varying vec2 vUv;
            void main(){
                float col = floor(vUv.x * 18.0);
                float h = 0.25 + 0.6 * abs(sin(col * 1.7 + uTime * (2.0 + mod(col, 3.0)))) * (0.5 + uBass);
                float bar = step(vUv.y, h) * step(0.15, fract(vUv.x * 18.0));
                vec3 c = mix(vec3(0.2, 0.85, 1.0), vec3(0.7, 0.4, 1.0), vUv.y);
                gl_FragColor = vec4(c * (0.15 + bar * 1.1), 1.0);
            }`,
    });
    const boothFace = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.9), boothMat);
    boothFace.rotation.y = Math.PI / 2;
    boothFace.position.set(-0.69, FREEBOARD + 0.5, 0);
    raft.add(boothFace);

    const washMat = new THREE.ShaderMaterial({
        uniforms: { uI: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uI; varying vec2 vUv;
            void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.35, r) * uI;
                gl_FragColor = vec4(vec3(0.2, 0.75, 1.0) * a, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 4.2, HALF * 4.2), washMat);
    wash.rotation.x = -Math.PI / 2;
    wash.position.y = 0.06;
    wash.renderOrder = 3;
    raft.add(wash);

    // Beams from the mast top, slow sweeps, cyan and violet.
    const beamGeo = new THREE.ConeGeometry(1.4, 26, 14, 1, true);
    beamGeo.translate(0, -13, 0);
    const beams = [];
    for (let i = 0; i < 4; i++) {
        const m = new THREE.MeshBasicMaterial({ color: i % 2 ? 0xa060ff : 0x40e0ff, transparent: true, opacity: 0.12,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        const b = new THREE.Mesh(beamGeo, m);
        b.position.set(-3.8, FREEBOARD + 7.4, 0);
        raft.add(b);
        beams.push(b);
    }
    updaters.push((c) => {
        const e = c.stageEnergy(KEY), t = c.time, n = c.night ?? 1;
        const kick = 0.35 + e.bass * 0.9;
        ledMat.opacity = ledMat2.opacity = 0.35 + e.bass * 0.65;
        stripMat.opacity = 0.5 + 0.5 * Math.sin(t * 1.3) * 0.5 + e.bass * 0.3;
        boothMat.uniforms.uTime.value = t; boothMat.uniforms.uBass.value = e.bass;
        washMat.uniforms.uI.value = (0.25 + kick * 0.5) * n;
        beams.forEach((b, i) => {
            const a = t * (0.35 + i * 0.07) + i * 1.6;
            b.rotation.set(Math.PI - 0.9 + Math.sin(a) * 0.35, a * 0.6 + i * Math.PI / 2, Math.cos(a * 1.3) * 0.3, 'YXZ');
            b.material.opacity = (0.05 + 0.11 * kick) * n;
        });
    });

    // ── Mast, flag and bulbs ──
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 7.5, 6), MAT.bamboo);
    mast.position.set(-3.8, FREEBOARD + 3.75, 0);
    raft.add(mast);
    const flag = markDynamic(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4, 6, 2),
        fluoro(FLUORO_COLORS[4], { boost: 1.4 })));
    flag.position.set(-3.8, FREEBOARD + 6.6, 1.25);
    raft.add(flag);
    const flagPos = flag.geometry.attributes.position;
    const flagBase = Float32Array.from(flagPos.array);

    const top = new THREE.Vector3(-3.8, FREEBOARD + 7.2, 0);
    for (const [cx, cz] of [[HALF, HALF], [HALF, -HALF], [-HALF, HALF], [-HALF, -HALF]]) {
        const corner = new THREE.Vector3(cx * 0.95, FREEBOARD + 1.2, cz * 0.95);
        const mid = top.clone().lerp(corner, 0.5); mid.y -= 0.9;
        { const sl = buildStringLights([top, mid, corner], { color: PALETTE.lamp, spacing: 1.1 }); raft.add(sl.group); updaters.push(sl.update); }
    }

    // One warm glow over the decks instead of a light: the water does the lighting.
    const glow = markDynamic(makeGlowSprite(0xffb066, 0.5, 5));
    glow.position.set(-1.2, FREEBOARD + 2.4, 0);
    raft.add(glow);

    // Swimmers bump into it.
    ctx.collisionSystem.registerCircle(A.x, A.z, HALF + 1.2, KEY);

    // ── Ladder, beach side (+X) ──
    // Two rails down into the water and four rungs. Swim to it, E to climb.
    const ladderMat = plain(0x9aa0a6, { kind: 'standard', roughness: 0.35, metalness: 0.8 });
    for (const dz of [-0.45, 0.45]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), ladderMat);
        rail.position.set(HALF + 0.12, FREEBOARD - 0.5, dz);
        raft.add(rail);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 5, 10, Math.PI), ladderMat);
        hoop.position.set(HALF - 0.16, FREEBOARD + 0.6, dz);
        hoop.rotation.y = Math.PI / 2;
        raft.add(hoop);
    }
    for (let i = 0; i < 4; i++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), ladderMat);
        rung.rotation.x = Math.PI / 2;
        rung.position.set(HALF + 0.12, FREEBOARD - 0.25 - i * 0.4, 0);
        raft.add(rung);
    }

    // ── The deck you stand on (raft-local) ──
    const DECK_Y = FREEBOARD + 0.045;          // plank tops
    const seg = (ax, az, bx, bz) => ({ ax, az, bx, bz, y0: 0, y1: 3 });
    const walk = createDeck({
        floors: [{ kind: 'rect', x0: -HALF, x1: HALF, z0: -HALF, z1: HALF, y: DECK_Y }],
        walls: [
            // DJ table, 1.0 × 3.0 at x = -1.2
            seg(-1.7, -1.5, -0.7, -1.5), seg(-0.7, -1.5, -0.7, 1.5),
            seg(-0.7, 1.5, -1.7, 1.5), seg(-1.7, 1.5, -1.7, -1.5),
            { circle: true, x: -2.9, z: -3.4, r: 0.75, y0: 0, y1: 3 },   // speaker cabs
            { circle: true, x: -2.9, z: 3.4, r: 0.75, y0: 0, y1: 3 },
            { circle: true, x: -3.8, z: 0, r: 0.2, y0: 0, y1: 8 },      // mast
        ],
    });
    ctx.controls.addInteractable({
        x: A.x + HALF + 1.2, z: A.z, radius: 2.8, owner: KEY, swim: true,
        prompt: 'E  CLIMB ABOARD',
        enabled: () => !ctx.controls.isAboard(),
        onInteract: (api) => api.board({
            deck: walk, root: raft,
            spawn: { x: HALF - 0.9, y: DECK_Y, z: 0 },
            ladder: { x: HALF - 0.6, z: 0, r: 1.6 },
            exit: { x: A.x + HALF + 1.6, z: A.z },
            toast: 'ON THE RAFT — G TO DANCE',
        }),
    });

    // ── Halo ──
    // Points round the edge where the drums slap the water.
    const EDGE = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        EDGE.push([Math.cos(a) * (HALF + 0.6), Math.sin(a) * (HALF + 0.6)]);
    }
    let haloTimer = 0;
    let edgeIndex = 0;
    let lastBass = 0;
    let kickCount = 0;

    // ─────────────────────────────────────────────
    g.userData.update = (c) => {
        for (let i = 0; i < updaters.length; i++) updaters[i](c);
        const t = c.time;
        const ocean = c.ocean;
        const e = c.stageEnergy(KEY);
        const night = c.night ?? 0;

        // Bob and tilt on the real swell — the same field the shader draws.
        if (ocean) {
            const y0 = ocean.surfaceY(A.x, A.z, t);
            const yx = ocean.surfaceY(A.x + HALF, A.z, t) - ocean.surfaceY(A.x - HALF, A.z, t);
            const yz = ocean.surfaceY(A.x, A.z + HALF, t) - ocean.surfaceY(A.x, A.z - HALF, t);
            raft.position.y = y0;
            raft.rotation.z = Math.atan2(yx, HALF * 2) * 0.8;
            raft.rotation.x = -Math.atan2(yz, HALF * 2) * 0.8;

            // Halo: a steady trickle of small disturbances round the edge, plus a ring
            // of four on the first kick of every bar. Budget: the shader ring holds 32
            // points living ~5 s, and the player's own trail must never be starved —
            // four points a bar plus ~4.5 a second is the most the raft may spend.
            haloTimer -= c.delta;
            const kick = e.bass > 0.55 && lastBass <= 0.55;
            lastBass = e.bass;
            if (kick && (kickCount++ % 4) === 0) {
                for (let i = 0; i < EDGE.length; i += 3) {
                    ocean.splash(A.x + EDGE[i][0], A.z + EDGE[i][1], 0.9, 'raftKick' + i);
                }
            } else if (haloTimer <= 0) {
                haloTimer = 0.4;
                edgeIndex = (edgeIndex + 5) % EDGE.length;
                ocean.splash(A.x + EDGE[edgeIndex][0], A.z + EDGE[edgeIndex][1], 0.5, 'raft');
            }
        }

        glow.material.opacity = (0.15 + night * 0.4) * (1 + e.bass * 0.5);

        // Flag ripple.
        for (let i = 0; i < flagPos.count; i++) {
            const x = flagBase[i * 3];
            const u = (x + 1.2) / 2.4;
            flagPos.array[i * 3 + 2] = flagBase[i * 3 + 2] + Math.sin(t * 3 + x * 2.2) * 0.18 * u;
        }
        flagPos.needsUpdate = true;
    };

    mergeStatics(g);
    return g;
}
