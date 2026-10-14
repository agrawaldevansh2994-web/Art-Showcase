// The people. ~850 of them, drawn in eleven instanced meshes.
//
// Five behaviours — dancing at a floor, wandering the beach, sitting on a mat, gazing at
// something, and standing in the shallows. Dancers are wired to the analyser of the floor
// they are standing at, so Hilltop and Disco Valley genuinely move to different music.
// Everybody tracks the terrain height, so nobody sinks into the sand.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    DRIFTWOOD_STAGE, DJ_RAFT, THE_ROCKS,
    FIRE_CAMP, ARRIVAL, LOOKOUT,
} from './constants.js';

// BAY CROWD (redesign 2026-10-07). Goa's freaks, sadhus, travellers and fluoro ravers
// are gone. This is a night-swim crowd: swimsuits, rash vests, wetsuits, paddlers in
// life vests, and a glow crew in bioluminescent body paint. Field meanings changed:
//   shorts (was sarong)   board shorts / swim skirt at the hips
//   cap    (was dreads)   hair or a swim cap / wetsuit hood (capColors when present)
//   vest   (was pack)     a life vest worn ON the torso, paddlers mostly
//   paint                 bioluminescent paint — blues and teals only, never rainbow
//   glow   (was stick)    a glowing wristband on the right wrist
const BIO_PAINT = [0x2ad8ff, 0x1a9aff, 0x4fffd8, 0x7ab8ff, 0x9ff6ff];
const HAIR = [0x141010, 0x1e1612, 0x2e2018, 0x5a4028, 0x8a6a40, 0xc8a870];
const OUTFITS = {
    // Swimsuits, here to get in the water.
    swimmer: {
        body: [0x0e1a2a, 0x10283a, 0x1a1a22, 0x0a3a40, 0x2a1030],
        accent: [0x1a9aff, 0x0a3a40, 0xe8e2d2],
        capColors: [0xf0f0e8, 0xf0c02a, 0x2ad8ff, 0xe8562a],
        shorts: 0.55, cap: 0.6, vest: 0.0, paint: 0.45, glow: 0.55,
    },
    // Rash vests and life jackets — back from a kayak loop.
    paddler: {
        body: [0xd8d4c8, 0x8a96a0, 0x3a4a5a, 0xc8b89a],
        accent: [0xe8662a, 0xf0b323, 0xd83a2a],
        shorts: 0.85, cap: 0.75, vest: 0.85, paint: 0.1, glow: 0.3,
    },
    // Full wetsuits, some hooded. The ones who swim out to the raft.
    diver: {
        body: [0x0c0c10, 0x12141a, 0x0c1a22],
        accent: [0x1a6aff, 0x0c0c10],
        capColors: [0x0c0c10, 0x10141a],
        shorts: 0.0, cap: 0.8, vest: 0.15, paint: 0.2, glow: 0.5,
    },
    // People from the village behind the dune: cotton, indigo, white.
    local: {
        body: [0xe8e4d8, 0x2a3a6a, 0xd0cabc, 0x3a4a8a],
        accent: [0x2a3a6a, 0xe8e4d8, 0x8a6a40],
        shorts: 0.3, cap: 0.95, vest: 0.0, paint: 0.02, glow: 0.05,
    },
    // The glow crew: dark clothes, blue paint head to toe, wristbands on both… well, one.
    glowcrew: {
        body: [0x08080e, 0x0c0e16, 0x10101a],
        accent: [0x2ad8ff, 0x4fffd8],
        shorts: 0.4, cap: 0.5, vest: 0.0, paint: 0.98, glow: 0.98,
    },
};
const OUTFIT_KEYS = Object.keys(OUTFITS);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function scatter(cx, cz, rx, rz, n, out) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        out.push({ x: cx + Math.cos(a) * r * rx, z: cz + Math.sin(a) * r * rz });
    }
    return out;
}

/** Scatter along the waterline, `inset` units inland of it. */
function scatterShore(zFrom, zTo, inset, spread, n, out) {
    for (let i = 0; i < n; i++) {
        const z = zFrom + Math.random() * (zTo - zFrom);
        out.push({ x: shoreX(z) + inset + (Math.random() - 0.5) * spread, z });
    }
    return out;
}

export function createCrowdSystem(scene) {
    // ── Population plan ──
    const plan = [];
    const add = (mode, opts, pts) => pts.forEach(p => plan.push({ ...p, mode, ...opts }));

    // The stage faces west, so its floor runs DOWN the sand from the dune toward the
    // water: dancers between the stage and the wet sand, all facing the booth (+X).
    const S = DRIFTWOOD_STAGE;
    // keep a 3 m aisle down the middle so you can walk in to the booth
    const lane = (p) => { const d = p.z - S.z; if (Math.abs(d) < 1.6) p.z = S.z + Math.sign(d || 1) * (1.6 + Math.random()); return p; };
    // Net Cave (thinned 2026-10-09 — Devansh: "too many people, it covers the whole cave"):
    // a loose floor inside with room to walk through to the booth, and a few at the mouth.
    add('dancer', { stage: 'stage', face: { x: S.x + 10, z: S.z } }, scatter(S.x - 5, S.z, 8, 5, 34, []).map(lane));
    
    add('dancer', { stage: 'stage', face: { x: S.x + 10, z: S.z } }, scatter(S.x - 19, S.z, 5, 9, 14, []).map(lane));

    // Waist-deep off the stage, dancing to the raft across the water and kicking up
    // plankton. These are the shot.
    add('dancer', { stage: 'raft', face: DJ_RAFT }, scatterShore(DJ_RAFT.z - 34, DJ_RAFT.z + 30, -6, 8, 70, []));

    // On the raft itself (v2): a handful dancing on the deck in front of the booth and
    // the DJ behind it. Raft-local positions; they ride the raft's bob (see onRaft).
    const raftPts = [];
    for (let i = 0; i < 9; i++) raftPts.push({ x: DJ_RAFT.x + 0.6 + Math.random() * 3.6, z: DJ_RAFT.z + (Math.random() - 0.5) * 7 });
    add('dancer', { stage: 'raft', onRaft: true, face: { x: DJ_RAFT.x - 1.2, z: DJ_RAFT.z } }, raftPts);
    add('dancer', { stage: 'raft', onRaft: true, isDJ: true, face: { x: DJ_RAFT.x + 20, z: DJ_RAFT.z } }, [{ x: DJ_RAFT.x - 2.0, z: DJ_RAFT.z }]);

    // Up on the lookout, and along the rock shelf, just looking at the water.
    add('gazer', { face: DJ_RAFT }, scatter(LOOKOUT.x - 6, LOOKOUT.z + 6, 2.5, 2.5, 6, []));   // off to the right of the spawn view, not in it
    add('gazer', { face: { x: -400, z: THE_ROCKS.z + 60 } }, scatter(THE_ROCKS.x + 10, THE_ROCKS.z, 12, 14, 24, []));
    add('sitter', {}, scatter(FIRE_CAMP.x, FIRE_CAMP.z, 16, 14, 36, []));
    add('sitter', {}, scatter(ARRIVAL.x + 6, ARRIVAL.z - 4, 10, 10, 14, []));
    add('wanderer', {}, scatter(ARRIVAL.x + 8, ARRIVAL.z - 10, 16, 14, 12, []));

    // Standing about in the glowing surf, the whole length of the cove.
    add('wader', {}, scatterShore(-120, 130, 3, 8, 70, []));
    add('wanderer', {}, scatterShore(-120, 130, 20, 26, 80, []));

    const COUNT = plan.length;
    let crowdSplashTimer = 0;

    // ── Geometry ──
    // One leg, hung from the hip (top at the origin) so each can swing on its own.
    const legOne = new THREE.CapsuleGeometry(0.08, 0.74, 2, 6); legOne.translate(0, -0.43, 0);
    const band = new THREE.TorusGeometry(0.075, 0.03, 4, 10); band.rotateX(Math.PI / 2); band.translate(0, -0.7, 0);
    const geo = {
        // Rounder, slimmer bodies than Goa's six-sided cylinders.
        torso: new THREE.CapsuleGeometry(0.2, 0.46, 3, 8),
        head: new THREE.SphereGeometry(0.2, 10, 8),
        leg: legOne,
        arm: new THREE.CapsuleGeometry(0.06, 0.66, 2, 5),
        sarong: new THREE.CylinderGeometry(0.235, 0.255, 0.3, 8),          // shorts
        dreads: new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.9),  // cap / hair
        pack: new THREE.BoxGeometry(0.47, 0.44, 0.36),                       // life vest, worn
        paint: new THREE.CapsuleGeometry(0.215, 0.46, 3, 8),
        stick: band,                                                          // wristband
    };
    geo.arm.translate(0, -0.4, 0);

    // vertexColors MUST stay off: these geometries have no 'color' attribute, and with
    // vertexColors on, WebGL feeds the missing attribute as (0,0,0) — every person rendered
    // pure black whatever instanceColor said (inherited from Goa; fixed here 2026-10-07).
    // Per-person colour comes from instanceColor, which needs no flag.
    const skinMat = new THREE.MeshLambertMaterial();
    const clothMat = new THREE.MeshLambertMaterial();
    const glowMat = new THREE.MeshBasicMaterial({ fog: false, transparent: true, opacity: 0.95 });
    const paintMat = new THREE.MeshBasicMaterial({
        fog: false, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });

    function iMesh(g, m) {
        const mesh = new THREE.InstancedMesh(g, m, COUNT);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
        mesh.frustumCulled = false;
        return mesh;
    }

    const torsos = iMesh(geo.torso, clothMat);
    const heads = iMesh(geo.head, skinMat);
    const legsL = iMesh(geo.leg, clothMat);
    const legsR = iMesh(geo.leg, clothMat);
    const armsL = iMesh(geo.arm, skinMat);
    const armsR = iMesh(geo.arm, skinMat);
    const sarongs = iMesh(geo.sarong, clothMat);
    const dreads = iMesh(geo.dreads, clothMat);
    const packs = iMesh(geo.pack, clothMat);
    const paints = iMesh(geo.paint, paintMat);
    const sticks = iMesh(geo.stick, glowMat);

    torsos.castShadow = true;
    // A touch of self-light so bodies read against the glowing cave and water instead
    // of going to flat black silhouettes (Devansh, 2026-10-07: people "seem very off").
    clothMat.emissive = new THREE.Color(0x0b1820);
    skinMat.emissive = new THREE.Color(0x140e0a);

    const group = new THREE.Group();
    group.name = 'crowd';
    group.add(torsos, heads, legsL, legsR, armsL, armsR, sarongs, dreads, packs, paints, sticks);
    scene.add(group);

    // ── Population ──
    const people = [];
    const dummy = new THREE.Object3D();
    // YXZ, so X and Z rotations happen in the BODY's frame after the yaw rather than
    // about the world axes. Under the default XYZ a dancer facing sideways swung their
    // arms and legs forward along world X instead of along their own forward.
    dummy.rotation.order = 'YXZ';
    const col = new THREE.Color();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const body = new THREE.Object3D(); body.rotation.order = 'YXZ';
    const tmpM = new THREE.Matrix4();

    for (let i = 0; i < COUNT; i++) {
        const spec = plan[i];
        const style = OUTFITS[pick(OUTFIT_KEYS)];

        const p = {
            mode: spec.mode,
            stage: spec.stage || null,
            homeX: spec.x, homeZ: spec.z,
            x: spec.x, z: spec.z,
            face: spec.face || null,
            heading: Math.random() * Math.PI * 2,
            phase: Math.random() * Math.PI * 2,
            speed: 1.5 + Math.random() * 2.6,
            bobAmp: 0.1 + Math.random() * 0.17,
            twistSpeed: 1.6 + Math.random() * 3.0,
            armsUp: Math.random() > 0.4,
            // Left and right are driven from the same wave with this offset between
            // them. Without it both arms mirror exactly every frame, which is the single
            // thing that made the floor read as rows of scarecrows.
            armPhase: 0.7 + Math.random() * 2.4,
            armSplit: 0.28 + Math.random() * 0.45,   // arms never sit glued to the ribs
            armFwdAmt: 0.16 + Math.random() * 0.3,
            // How deep this one sits. Without the spread every sitter bottomed out on
            // the legScale clamp and the whole group had identical legs.
            sitDepth: Math.random() * 0.2,
            height: 0.9 + Math.random() * 0.22,
            walkSpeed: 1.5 + Math.random() * 1.8,
            wanderTimer: Math.random() * 4,
            hasSarong: Math.random() < style.shorts,
            hasDreads: Math.random() < style.cap,
            hasPack: Math.random() < style.vest,
            hasPaint: Math.random() < style.paint,
            hasStick: Math.random() < style.glow,
            rally: null,
            onRaft: !!spec.onRaft, isDJ: !!spec.isDJ,
            // Dance style: 0 bounce, 1 hands-up jumper, 2 fist pump, 3 side-step swayer.
            style: spec.isDJ ? 4 : (Math.random() * 4) | 0,
            // Ground height is sampled once and only re-sampled on frames this person
            // actually moves. getTerrainHeight() is not free, and dancers, sitters and
            // gazers animate in place — re-deriving it every frame was pure waste.
            groundY: getTerrainHeight(spec.x, spec.z),
        };
        people.push(p);

        col.setHex(pick(style.body));
        torsos.setColorAt(i, col);
        legsL.setColorAt(i, col.clone().multiplyScalar(0.75));
        legsR.setColorAt(i, col.clone().multiplyScalar(0.75));
        sarongs.setColorAt(i, new THREE.Color(pick(style.accent)).multiplyScalar(0.7));
        dreads.setColorAt(i, new THREE.Color(style.capColors && Math.random() < 0.7 ? pick(style.capColors) : pick(HAIR)));
        packs.setColorAt(i, new THREE.Color(pick(style.accent)));

        const skin = new THREE.Color().setHSL(0.06 + Math.random() * 0.04, 0.3 + Math.random() * 0.15, 0.18 + Math.random() * 0.42);
        heads.setColorAt(i, skin);
        armsL.setColorAt(i, skin);
        armsR.setColorAt(i, skin);

        paints.setColorAt(i, new THREE.Color(pick(BIO_PAINT)));
        sticks.setColorAt(i, new THREE.Color(pick(BIO_PAINT)));

        if (!p.hasSarong) sarongs.setMatrixAt(i, hidden);
        if (!p.hasDreads) dreads.setMatrixAt(i, hidden);
        if (!p.hasPack) packs.setMatrixAt(i, hidden);
        if (!p.hasPaint) paints.setMatrixAt(i, hidden);
        if (!p.hasStick) sticks.setMatrixAt(i, hidden);
    }

    [torsos, heads, legsL, legsR, armsL, armsR, sarongs, dreads, packs, paints, sticks]
        .forEach(m => { m.instanceColor.needsUpdate = true; });

    // ── Update ──
    let frame = 0;

    function update(ctx) {
        frame++;
        const t = ctx.time;
        const dt = ctx.delta;
        const night = ctx.night ?? 1;
        const camX = ctx.camera.position.x, camZ = ctx.camera.position.z;

        const energyFor = {
            stage: ctx.stageEnergy('stage'),
            raft: ctx.stageEnergy('raft'),
        };

        // ── Bay: people standing in the water light it up ──
        // One disturbance every ~0.3 s from somebody wet near the camera. Rate is the
        // budget (see TRAIL_N in Ocean.js): the crowd may spend about a third of it.
        crowdSplashTimer -= dt;
        if (ctx.ocean && night > 0.3 && crowdSplashTimer <= 0) {
            crowdSplashTimer = 0.3;
            const start = (Math.random() * COUNT) | 0;
            for (let k = 0; k < 40; k++) {
                const q = people[(start + k * 7) % COUNT];
                const dx = q.x - camX, dz = q.z - camZ;
                if (dx * dx + dz * dz > 4900) continue;
                if (ctx.ocean.depthAt(q.x, q.z) < 0.06) continue;
                ctx.ocean.splash(q.x, q.z, q.mode === 'dancer' ? 0.9 : 0.5, 'crowd');
                break;
            }
        }

        for (let i = 0; i < COUNT; i++) {
            const p = people[i];

            // Level of detail: distant people animate on every fourth frame.
            const dx = p.x - camX, dz = p.z - camZ;
            const distSq = dx * dx + dz * dz;
            if (distSq > 22500 && (i & 3) !== (frame & 3)) continue;
            if (distSq > 250000) continue;              // beyond 500u nobody can see them

            const e = p.stage ? energyFor[p.stage] : ctx.energy;
            const bass = e ? e.bass : 0;
            const treble = e ? e.treble : 0;

            // `dip` is how far the hips drop BELOW standing height, and it is never
            // negative. It used to be a signed sine added straight to the body's Y — at
            // full bass that lifted everyone, feet included, most of a metre off the
            // sand and dropped them back into it. A dance bob is a knee bend, not a hop:
            // the feet stay planted and the legs compress (see the leg scaling below).
            let dip = 0, twist = 0, sway = 0, armAngle = 0, crouch = 0, sink = 0;
            let step = 0;                       // leg swing, for anyone actually walking
            // The right arm's own angle, and a shared forward/back swing. Left it null
            // for the modes where both arms doing the same thing is correct.
            let armAlt = null, armFwd = 0;
            let facing = p.heading;
            let moved = false;

            if (p.rally) {
                const rx = p.rally.x - p.x, rz = p.rally.z - p.z;
                const d = Math.hypot(rx, rz);
                if (d > p.rally.radius) {
                    facing = Math.atan2(rx, rz);
                    const v = p.walkSpeed * 2.2 * dt;
                    p.x += (rx / d) * v;
                    p.z += (rz / d) * v;
                    moved = true;
                    dip = Math.abs(Math.sin(t * 8 + p.phase)) * 0.07;
                    step = Math.sin(t * 8 + p.phase) * 0.5;
                    armAngle = Math.sin(t * 8 + p.phase) * 0.62;
                } else {
                    // Arrived. Everyone turns and looks at the same thing.
                    dip = (0.5 - 0.5 * Math.cos(t * 1.4 + p.phase)) * 0.06;
                    armAngle = p.rally.hands
                        ? Math.PI * 0.8 + Math.sin(t * 1.6 + p.phase) * 0.18
                        : Math.sin(t * 0.9 + p.phase) * 0.16;
                    facing = p.rally.faceHeading;
                }
            } else if (p.mode === 'dancer') {
                // v2 dance (2026-10-07): locked to the beat and in four styles, so the
                // floor reads as a crowd at a party rather than one looped wobble.
                const bpm = e && e.bpm ? e.bpm : 124;
                const beatT = t * bpm / 60 + p.phase * 0.159;        // beats
                const ph = beatT * Math.PI * 2;
                const hit = Math.pow(0.5 + 0.5 * Math.cos(ph), 3);    // sharp on the beat
                const amp = 0.55 + bass * 0.9;
                twist = Math.sin(ph * 0.25 + p.phase) * 0.22;
                if (p.style === 0) {            // bounce
                    dip = hit * p.bobAmp * 0.8 * amp;
                    sway = Math.sin(ph * 0.5) * 0.12;
                    step = Math.sin(ph * 0.5) * 0.25;
                    armAngle = p.armSplit + 0.3 + Math.sin(ph) * 0.35;
                    armAlt = p.armSplit + 0.3 + Math.sin(ph + p.armPhase) * 0.35;
                    armFwd = 0.35 + Math.sin(ph * 0.5) * 0.25;
                } else if (p.style === 1) {     // hands up, jump on the hits
                    dip = (1 - hit) * 0.09 * amp;
                    p.hop = (bass > 0.5 ? hit * 0.16 : hit * 0.05);
                    armAngle = Math.PI * 0.82 + Math.sin(ph) * 0.12;
                    armAlt = Math.PI * 0.82 + Math.sin(ph + 1.2) * 0.12;
                    armFwd = 0.15;
                } else if (p.style === 2) {     // fist pump, right arm on the beat
                    dip = hit * 0.08 * amp;
                    sway = Math.sin(ph * 0.5) * 0.08;
                    armAngle = p.armSplit + 0.15;
                    armAlt = Math.PI * (0.6 + 0.3 * hit);
                    armFwd = 0.5;
                    step = Math.sin(ph * 0.5) * 0.15;
                } else if (p.style === 3) {     // side step + sway
                    dip = hit * 0.06;
                    sway = Math.sin(ph * 0.5) * 0.22;
                    p.side = Math.sin(ph * 0.5) * 0.18;
                    step = Math.sin(ph * 0.5) * 0.35;
                    armAngle = 0.5 + Math.sin(ph * 0.5) * 0.4;
                    armAlt = 0.5 - Math.sin(ph * 0.5) * 0.4;
                    armFwd = 0.45;
                } else {                        // the DJ: head nod, hands on the decks, one up now and then
                    dip = hit * 0.05;
                    twist = Math.sin(t * 0.6) * 0.15;
                    armAngle = 0.25; armFwd = 1.15;
                    const wave = (Math.sin(t * 0.37) > 0.82);
                    armAlt = wave ? Math.PI * 0.85 : 0.25;
                    if (!wave) armFwd = 1.15;
                }
                if (p.face) facing = Math.atan2(p.face.x - p.x, p.face.z - p.z);
            } else if (p.mode === 'wanderer') {
                p.wanderTimer -= dt;
                if (p.wanderTimer <= 0) {
                    p.wanderTimer = 3 + Math.random() * 6;
                    p.heading += (Math.random() - 0.5) * 1.5;
                }
                // Keep them on the sand: turn back at the water and at the palm line.
                const shore = shoreX(p.z);
                if (p.x < shore + 3) p.heading = Math.atan2(1, (Math.random() - 0.5) * 0.5);
                if (p.x > shore + 62) p.heading = Math.atan2(-1, (Math.random() - 0.5) * 0.5);
                if (Math.abs(p.z) > 280) p.heading = Math.atan2(0.2, -Math.sign(p.z));

                const v = p.walkSpeed * dt;
                p.x += Math.sin(p.heading) * v;
                p.z += Math.cos(p.heading) * v;
                moved = true;
                facing = p.heading;
                const stride = t * 7 + p.phase;
                dip = Math.abs(Math.sin(stride)) * 0.06;
                step = Math.sin(stride) * 0.55;
                armAngle = Math.sin(stride) * 0.52;
                sway = Math.sin(stride * 0.5) * 0.06;
            } else if (p.mode === 'sitter') {
                // Varied, so the group does not all bottom out on the legScale clamp
                // with one identical pair of legs.
                crouch = 0.40 + p.sitDepth;
                dip = (0.5 - 0.5 * Math.cos(t * 0.9 + p.phase)) * 0.04;
                sway = Math.sin(t * 0.7 + p.phase) * 0.14;
                twist = Math.sin(t * 0.42 + p.phase) * 0.22;
                // Arms rest low and forward, onto the knees. They were at 0.9 rad —
                // held out to the sides at 50°, which is what made a group of seated
                // people read as a row of mannequins.
                armAngle = 0.15 + Math.sin(t * 0.55 + p.phase) * 0.10;
                armFwd = 0.55 + Math.sin(t * 0.5 + p.phase) * 0.14;
                // Sitting is not being welded to the sand: they shift and turn.
                p.wanderTimer -= dt;
                if (p.wanderTimer <= 0) {
                    p.wanderTimer = 4 + Math.random() * 7;
                    p.heading += (Math.random() - 0.5) * 1.1;
                }
                facing = p.heading;
            } else if (p.mode === 'wader') {
                // Knee to waist deep, rocking with the swell, facing out to sea.
                sink = 0.55;
                dip = (0.5 - 0.5 * Math.cos(t * 0.85 + p.phase)) * 0.16;
                sway = Math.sin(t * 0.65 + p.phase) * 0.16;
                armAngle = 0.35 + Math.sin(t * 0.7 + p.phase) * 0.22;
                facing = Math.PI / 2;                     // −X, out at the horizon
            } else { // gazer
                dip = (0.5 - 0.5 * Math.cos(t * 1.1 + p.phase)) * (0.05 + bass * 0.1);
                sway = Math.sin(t * 0.8 + p.phase) * 0.1;
                armAngle = Math.sin(t * 0.6 + p.phase) * 0.2;
                if (p.face) facing = Math.atan2(p.face.x - p.x, p.face.z - p.z);
            }

            // Every mode except 'dancer' drove BOTH arms off one number, so all of them
            // mirrored exactly, frame after frame — measured at the Boat Landing, 72 of
            // 72 people. A small independent wobble on the right arm is enough to break
            // it; a crowd whose arms are all symmetric reads as mannequins, not people.
            if (armAlt === null) {
                armAlt = armAngle + Math.sin(t * 0.8 + p.phase + p.armPhase) * 0.17;
            }

            if (moved) p.groundY = getTerrainHeight(p.x, p.z);
            if (p.onRaft) p.groundY = (ctx.ocean ? ctx.ocean.surfaceY(DJ_RAFT.x, DJ_RAFT.z, t) : 0) + 0.6;
            const s = p.height;

            // Feet line. Everything above the knees hangs off `upper`, which is the only
            // thing the dip moves — so the soles stay on the sand however hard the bass
            // is hitting. `sink` is the exception: a wader really is lower than the sand.
            const footY = p.groundY - sink * s;
            const drop = (dip + crouch) * s;
            const upper = footY - drop;

            // The legs take up the slack by compressing, which is what a knee bend is.
            const LEG_H = 0.86;
            const legScale = Math.max(0.4, 1 - drop / (LEG_H * s));
            const legH = LEG_H * s * legScale;

            // ── Body frame (v2): everything hangs off the torso's own transform, so a
            // twisting, swaying dancer keeps arms on shoulders and head on neck. ──
            const hop = p.hop || 0; p.hop = 0;
            const side = p.side || 0; p.side = 0;
            const bx = p.x + Math.cos(facing) * side, bz = p.z - Math.sin(facing) * side;
            const hipY = upper + 0.86 * s + hop;
            body.position.set(bx, hipY, bz);
            body.rotation.set(0, facing + twist, sway * 0.6);
            body.scale.set(s, s, s);
            body.updateMatrix();

            const place = (mesh, lx, ly, lz, rx, ry, rz) => {
                dummy.position.set(lx, ly, lz);
                dummy.rotation.set(rx, ry, rz);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                tmpM.multiplyMatrices(body.matrix, dummy.matrix);
                mesh.setMatrixAt(i, tmpM);
                return tmpM;
            };
            place(torsos, 0, 0.3, 0, 0, 0, 0);
            if (p.hasPaint) paints.setMatrixAt(i, tmpM);
            place(heads, 0, 0.92, 0.02, p.mode === 'gazer' ? -0.36 : (p.mode === 'dancer' ? -0.12 - dip * 1.5 : 0), 0, sway * 0.3);

            // Legs from the hips, in the world (not twisted with the upper body), each
            // swinging on its own; they shorten for the knee bend.
            const legLen = Math.max(0.35, (hipY - hop - footY) / (0.86 * s));
            for (const [mesh, sx, sg] of [[legsL, -0.11, 1], [legsR, 0.11, -1]]) {
                dummy.position.set(bx + Math.cos(facing) * sx * s, hipY, bz - Math.sin(facing) * sx * s);
                dummy.rotation.set(crouch > 0 ? -1.2 : step * 0.45 * sg, facing, sway * 0.2);
                dummy.scale.set(s, s * legLen, s);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            }

            const aR = armAlt ?? armAngle;
            // shoulders at local (±0.27, 0.66); arm geometry hangs down from its origin
            place(armsL, -0.27, 0.66, 0, -armFwd, 0, -armAngle);
            place(armsR, 0.27, 0.66, 0, -armFwd, 0, aR);
            if (p.hasStick) {
                place(sticks, 0.27, 0.66, 0, -armFwd, 0, aR);
                if (night <= 0.25) sticks.setMatrixAt(i, hidden);
            }
            if (p.hasSarong) { place(sarongs, 0, -0.08, 0, 0, 0, 0); }
            if (p.hasDreads) { place(dreads, 0, 0.95, 0.02, 0, 0, 0); }
            if (p.hasPack) { place(packs, 0, 0.38, 0, 0, 0, 0); }
            dummy.scale.set(1, 1, 1);
            continue;
            if (p.hasSarong) {
                dummy.position.set(p.x, upper + 0.78 * s, p.z);
                dummy.rotation.set(0, facing + twist * 0.4, sway * 0.6);
                dummy.scale.set(s, s, s);
                dummy.updateMatrix();
                sarongs.setMatrixAt(i, dummy.matrix);
            }
            if (p.hasDreads) {
                dummy.position.set(p.x, upper + 1.81 * s, p.z);
                dummy.rotation.set(0, facing, sway * 0.4);
                dummy.updateMatrix();
                dreads.setMatrixAt(i, dummy.matrix);
            }
            if (p.hasPack) {
                // Life vest: worn on the chest, so it sits on the torso centre.
                dummy.position.set(p.x, upper + 1.24 * s, p.z);
                dummy.rotation.set(0, facing + twist, sway);
                dummy.updateMatrix();
                packs.setMatrixAt(i, dummy.matrix);
            }
            if (p.hasStick) {
                // Held in the right hand, so it must track the RIGHT arm exactly.
                dummy.position.set(p.x + ox, shoulderY, p.z + oz);
                dummy.rotation.set(-armFwd, facing, aR);
                dummy.scale.setScalar(s * (night > 0.25 ? 1 : 0.001));   // wristband
                dummy.updateMatrix();
                sticks.setMatrixAt(i, dummy.matrix);
            }
            dummy.scale.set(1, 1, 1);
        }

        torsos.instanceMatrix.needsUpdate = true;
        heads.instanceMatrix.needsUpdate = true;
        legsL.instanceMatrix.needsUpdate = true;
        legsR.instanceMatrix.needsUpdate = true;
        armsL.instanceMatrix.needsUpdate = true;
        armsR.instanceMatrix.needsUpdate = true;
        sarongs.instanceMatrix.needsUpdate = true;
        dreads.instanceMatrix.needsUpdate = true;
        packs.instanceMatrix.needsUpdate = true;
        paints.instanceMatrix.needsUpdate = true;
        sticks.instanceMatrix.needsUpdate = true;

        // Paint and glowsticks come up with the dark, on the same squared curve the
        // fluoro props use so the crowd and the tapestries light up together.
        glowMat.opacity = 0.2 + night * 0.78;
        paintMat.opacity = night * night * 0.85;
    }

    /**
     * Send the wandering crowd somewhere and tell them what to look at when they get
     * there — this is the sunset ceremony. `faceX/faceZ` is a DIRECTION, not a point.
     */
    function rallyTo(x, z, radius = 40, faceX = -1, faceZ = 0, hands = false) {
        const faceHeading = Math.atan2(faceX, faceZ);
        for (let i = 0; i < COUNT; i++) {
            const p = people[i];
            if (p.mode === 'wanderer' || p.mode === 'gazer' || p.mode === 'wader') {
                p.rally = {
                    x, z, radius: radius * (0.4 + Math.random() * 0.9),
                    faceHeading: faceHeading + (Math.random() - 0.5) * 0.3,
                    hands: hands && Math.random() > 0.55,
                };
            }
        }
    }

    function disperse() {
        for (let i = 0; i < COUNT; i++) people[i].rally = null;
    }

    return { update, rallyTo, disperse, count: COUNT, group };
}
