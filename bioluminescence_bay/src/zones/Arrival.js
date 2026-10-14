// MANGROVE CREEK — the kayak landing in the south corner of the cove (file kept as
// Arrival.js; since the 2026-10-07 redesign you arrive at the LOOKOUT, not here).
//
// BAY M1 (2026-10-07): restyled from Goa's Boat Landing. The outriggers, shacks, chai
// mama, coconut pile and blue drums are gone. What is here now is the kit of a night
// paddle outfit: sit-on-top kayaks pulled up above the tide line, a driftwood lean-to
// with a flask of ginger tea, and RED path lamps — red because white light kills your
// night vision and the whole point of this beach is seeing something faint. The sign
// at the bottom of the trail says the same thing.
//
// The mangroves themselves are planted by Terrain.js plantCoast() — this file is the
// paddling kit at their edge.

import * as THREE from 'three';
import { getTerrainHeight, landmarkY, shoreX } from '../core/Terrain.js';
import { ARRIVAL } from '../core/constants.js';
import {
    MAT, buildNets, buildPathLantern, makeSign, buildMat, plain,
} from '../core/Props.js';

// Kayak hull colours: bright plastic, because you want to find it again in the dark.
const KAYAK_COLORS = [0xe8762a, 0xf0c02a, 0x2a9ad0, 0xd83a4a, 0x3ac08a];
const RED_LAMP = 0xff3a24;

/** A sit-on-top kayak: a long squashed capsule, a seat well, a paddle laid across it.
 *  `floating` boats bob on the swell instead of sitting on the sand. */
function buildKayak(x, z, rotation, opts = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const y = opts.baseY ?? getTerrainHeight(x, z);
    const L = opts.length ?? 4.2;
    const hullMat = plain(opts.color ?? KAYAK_COLORS[0], { kind: 'standard', roughness: 0.45 });

    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, L - 0.72, 4, 10), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(1, 1, 0.55);            // flat-bottomed, wider than tall
    hull.position.y = 0.22;
    hull.castShadow = true;
    inner.add(hull);

    const well = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.42),
        plain(0x1a1a1e, { kind: 'standard', roughness: 0.9 }));
    well.position.set(-0.2, 0.42, 0);
    inner.add(well);

    // Paddle across the deck: shaft plus two blades.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 5), MAT.darkWood);
    shaft.rotation.x = Math.PI / 2;
    shaft.rotation.z = 0.25;
    shaft.position.set(0.3, 0.48, 0);
    inner.add(shaft);
    for (const s of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.42),
            plain(0x1a1a1e, { kind: 'standard', roughness: 0.6 }));
        blade.position.set(0.3 + s * 0.27, 0.48, s * 1.05);
        blade.rotation.y = 0.25;
        inner.add(blade);
    }

    inner.rotation.y = rotation;
    inner.rotation.z = opts.list ?? 0;
    inner.position.set(x, y, z);
    if (opts.floating) markDynamic(inner);   // or mergeStatics freezes it in place
    g.add(inner);

    const phase = Math.random() * 6;
    const update = opts.floating ? (c) => {
        inner.position.y = y + Math.sin(c.time * 1.3 + phase) * 0.12;
        inner.rotation.z = Math.sin(c.time * 0.9 + phase) * 0.06;
        inner.rotation.x = Math.sin(c.time * 1.1 + phase * 2) * 0.04;
    } : () => {};
    return { group: g, update };
}

/** Driftwood lean-to: four bleached posts, a sloping tarp, a crate table with a flask. */
function buildLeanTo(x, z, rotation) {
    const g = new THREE.Group();
    const y = getTerrainHeight(x, z);
    const drift = plain(0xb8ab94, { kind: 'standard', roughness: 0.95 });
    const W = 4.2, D = 3.0;
    for (const [px, pz, h] of [[-W / 2, -D / 2, 2.6], [W / 2, -D / 2, 2.6], [-W / 2, D / 2, 1.8], [W / 2, D / 2, 1.8]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 6), drift);
        post.position.set(px, h / 2, pz);
        post.rotation.z = (Math.random() - 0.5) * 0.08;
        post.castShadow = true;
        g.add(post);
    }
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, D + 0.5),
        plain(0x2a3a44, { side: THREE.DoubleSide }));
    tarp.rotation.x = -Math.PI / 2 + Math.atan2(0.8, D);
    tarp.position.y = 2.25;
    tarp.castShadow = true;
    g.add(tarp);
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), MAT.wood);
    table.position.set(0.4, 0.35, -0.4);
    g.add(table);
    const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 10),
        plain(0x9a9ea6, { kind: 'standard', roughness: 0.3, metalness: 0.8 }));
    flask.position.set(0.2, 0.91, -0.4);
    g.add(flask);
    // Life jackets hung on the back posts — orange reads even under a red lamp.
    for (const s of [-1, 1]) {
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.14),
            plain(0xe8662a, { kind: 'standard', roughness: 0.7 }));
        vest.position.set(s * (W / 2 - 0.3), 1.7, -D / 2 + 0.12);
        g.add(vest);
    }
    g.rotation.y = rotation;
    g.position.set(x, y, z);
    return g;
}
import { mergeStatics, markDynamic } from '../core/Merge.js';

const KEY = 'arrival';

export function generateArrival(ctx) {
    const g = new THREE.Group();
    const updaters = [];
    const A = ARRIVAL;
    const baseY = landmarkY(A);

    // ── The kayaks ──
    // Pulled up in a rough line above the high-water mark, noses to the sea, as the
    // night-paddle crew leave them between trips.
    for (let i = 0; i < 6; i++) {
        const bz = A.z - 22 + i * 8;
        const bx = shoreX(bz) + 10 + (i % 2) * 2.5;
        const kayak = buildKayak(bx, bz, Math.PI / 2 + (Math.random() - 0.5) * 0.35, {
            color: KAYAK_COLORS[i % KAYAK_COLORS.length],
            length: 3.8 + Math.random() * 1.0,
            list: (Math.random() - 0.5) * 0.12,
        });
        g.add(kayak.group);
        updaters.push(kayak.update);
        ctx.collisionSystem.registerBox(bx, bz, 0.6, 2.2, KEY);
    }
    // Two out on the water, waiting to go — they bob on the swell and drag plankton
    // trails only in the player's imagination for now (M4 could feed them to the trail buffer).
    for (const [dx, dz] of [[-12, 4], [-15, 9]]) {
        const fz = A.z + dz;
        const afloat = buildKayak(shoreX(fz) + dx, fz, Math.PI / 2 - 0.3 + dx * 0.02, {
            color: KAYAK_COLORS[(dz / 4) % KAYAK_COLORS.length | 0], floating: true, baseY: 0.2,
        });
        g.add(afloat.group);
        updaters.push(afloat.update);
    }

    // ── Nets ──
    g.add(buildNets(A.x + 4, A.z - 26, 0.2, 2));

    // ── The lean-to ──
    g.add(buildLeanTo(A.x + 16, A.z - 6, -Math.PI / 2 + 0.2));
    ctx.collisionSystem.registerBox(A.x + 16, A.z - 6, 2.4, 1.8, KEY);

    ctx.controls.addInteractable({
        x: A.x + 16, z: A.z - 6, radius: 7, owner: KEY,
        prompt: 'E  GINGER TEA FROM THE FLASK',
        onInteract: (api) => {
            api.grantChai(120);
            ctx.audio.sfx('pour', { gain: 0.5 });
            ctx.ui.toast('HOT, SWEET, AND ENOUGH TO GET YOU INTO THE WATER');
        },
    });

    // ── Dry bags and crates by the trail foot ──
    for (let i = 0; i < 5; i++) {
        const cx = A.x + 22 + (i % 2) * 1.1;
        const cz = A.z + 2 + Math.floor(i / 2) * 1.0;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), MAT.wood);
        crate.position.set(cx, getTerrainHeight(cx, cz) + 0.3 + (i === 4 ? 0.6 : 0), cz);
        crate.rotation.y = Math.random() * 0.5;
        crate.castShadow = true;
        g.add(crate);
    }
    const bagColors = [0xf0c02a, 0x2a9ad0, 0xe8762a];
    for (let i = 0; i < 6; i++) {
        const bx = A.x + 18 + Math.random() * 3, bz = A.z + 6 + Math.random() * 3;
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 3, 8),
            plain(bagColors[i % 3], { kind: 'standard', roughness: 0.6 }));
        bag.rotation.z = Math.PI / 2 + (Math.random() - 0.5);
        bag.rotation.y = Math.random() * Math.PI;
        bag.position.set(bx, getTerrainHeight(bx, bz) + 0.2, bz);
        g.add(bag);
    }

    // ── Light ──
    // Red only. White lamps on this beach would wash out the glow you came to see.
    for (const [dx, dz, real] of [[6, -18, false], [12, 0, false], [8, 18, false], [22, -4, false]]) {   // the real light moved to the Lookout
        const lantern = buildPathLantern(A.x + dx, A.z + dz, RED_LAMP, 2.0, { light: real });
        g.add(lantern.group);
        updaters.push(lantern.update);
    }

    for (let i = 0; i < 5; i++) {
        g.add(buildMat(A.x + 8 + Math.random() * 8, A.z - 4 + Math.random() * 16, {
            color: i % 2 ? 0xa8905e : 0x8a7a4e,
        }));
    }

    // ── Creek sign ──
    const sign = makeSign('MANGROVE CREEK · KAYAKS', {
        width: 5.6, size: 40, color: '#d8f2ff', glow: 'rgba(80,190,255,0.7)', bg: 'rgba(8,16,24,0.9)',
    });
    sign.position.set(A.x + 22, baseY + 2.4, A.z - 10);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), MAT.darkWood);
    signPost.position.set(A.x + 22, baseY + 1.2, A.z - 10);
    g.add(signPost);

    // ─────────────────────────────────────────────
    g.userData.update = (c) => {
        for (let i = 0; i < updaters.length; i++) updaters[i](c);
    };
    // Collapse every static prop that shares a material into one buffer per
    // material. Measured on this zone before merging: see core/Merge.js.
    mergeStatics(g);

    return g;
}
