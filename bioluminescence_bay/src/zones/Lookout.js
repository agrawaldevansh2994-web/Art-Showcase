// THE LOOKOUT — where you arrive. Bay redesign, 2026-10-07; nothing like it in Goa.
//
// A flat patch of rock on top of the North Horn, 25 m above the water, with a driftwood
// rail round the cliff side. You spawn here facing the cove: the whole crescent of
// glowing surf, the stage's bulbs on the dune, the raft's halo out on the black water.
// The first frame is the money shot; the red-lit cliff trail then takes you down to it.

import * as THREE from 'three';
import { getTerrainHeight, landmarkY } from '../core/Terrain.js';
import { LOOKOUT } from '../core/constants.js';
import { buildPathLantern, makeSign, makeGlowSprite, plain } from '../core/Props.js';
import { mergeStatics, markDynamic } from '../core/Merge.js';

const KEY = 'lookout';
const RED_LAMP = 0xff3a24;

export function generateLookout(ctx) {
    const g = new THREE.Group();
    const updaters = [];
    const A = LOOKOUT;
    const baseY = landmarkY(A);
    const drift = plain(0xc4b8a0, { kind: 'standard', roughness: 0.95 });
    const driftDark = plain(0x8a7c66, { kind: 'standard', roughness: 0.95 });

    // ── Driftwood rail round the cliff side (west through south) ──
    const R = 9.5, POSTS = 13;
    let prev = null;
    for (let i = 0; i < POSTS; i++) {
        const a = Math.PI * 1.05 - (i / (POSTS - 1)) * Math.PI * 0.62;   // west → south-south-west (sin>0 = +Z)
        // a = π is due west (−X); decreasing a swings toward +Z (south, the cove).
        const x = A.x + Math.cos(a) * R, z = A.z + Math.sin(a) * R;
        const y = getTerrainHeight(x, z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.25, 5), i % 2 ? drift : driftDark);
        post.position.set(x, y + 0.62, z);
        post.rotation.z = (Math.random() - 0.5) * 0.12;
        post.castShadow = true;
        g.add(post);
        if (prev) {
            for (const h of [1.1, 0.6]) {
                const a3 = new THREE.Vector3(prev.x, prev.y + h, prev.z), b3 = new THREE.Vector3(x, y + h, z);
                const len = a3.distanceTo(b3);
                const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, len, 5), drift);
                bar.position.copy(a3).lerp(b3, 0.5);
                bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b3.clone().sub(a3).normalize());
                g.add(bar);
            }
            ctx.collisionSystem.registerCircle((prev.x + x) / 2, (prev.z + z) / 2, 1.3, KEY);
        }
        prev = { x, y, z };
    }

    // ── A bench made from one split log, facing the cove ──
    const bx = A.x - 4, bz = A.z + 4;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 3.2, 8, 1, false, 0, Math.PI), drift);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.5;
    log.position.set(bx, baseY + 0.55, bz);
    g.add(log);
    for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.5), driftDark);
        leg.position.set(bx + Math.cos(0.5) * s * 1.2, baseY + 0.27, bz - Math.sin(0.5) * s * 1.2);
        leg.rotation.y = 0.5;
        g.add(leg);
    }
    ctx.collisionSystem.registerBox(bx, bz, 1.6, 0.5, KEY);

    // ── A cairn of glass fishing floats, glowing faintly blue ──
    const floats = [];
    const floatMat = new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.8 });
    const cx = A.x + 6, cz = A.z - 3;
    for (let i = 0; i < 7; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.28 + Math.random() * 0.12, 10, 8), floatMat);
        const a = i * 1.7;
        f.position.set(cx + Math.cos(a) * (i < 4 ? 0.5 : 0.25), baseY + 0.3 + (i < 4 ? 0 : 0.45) + (i === 6 ? 0.42 : 0), cz + Math.sin(a) * (i < 4 ? 0.5 : 0.25));
        g.add(f);
        floats.push(f);
    }
    const halo = markDynamic(makeGlowSprite(0x4fd8ff, 0.35, 3.2));
    halo.position.set(cx, baseY + 0.7, cz);
    g.add(halo);

    // ── The name of the place ──
    const sign = makeSign('THE BAY', {
        width: 6, size: 72, color: '#d8f2ff', glow: 'rgba(80,190,255,0.85)', bg: 'rgba(8,16,24,0.9)',
    });
    // Beside the trailhead, east of the spawn: you read it as you turn to go down.
    sign.position.set(A.x + 13, baseY + 2.6, A.z - 3);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.8, 5), driftDark);
        post.position.set(A.x + 13, baseY + 1.4, A.z - 3 + s * 2.6);
        g.add(post);
    }
    const board = makeSign('RED LIGHT ONLY BELOW · LET YOUR EYES ADJUST', {
        width: 5.2, size: 28, color: '#ffd8d0', glow: 'rgba(0,0,0,0)', bg: 'rgba(40,14,12,0.9)',
    });
    board.position.set(A.x + 15, baseY + 1.4, A.z + 5);
    board.rotation.y = -Math.PI / 2;
    g.add(board);

    // ── One red lamp (a real light — the only one up here) ──
    const lamp = buildPathLantern(A.x + 10, A.z + 2, RED_LAMP, 1.8, { light: true });
    g.add(lamp.group);
    updaters.push(lamp.update);

    g.userData.update = (c) => {
        for (let i = 0; i < updaters.length; i++) updaters[i](c);
        const pulse = 0.65 + Math.sin(c.time * 0.7) * 0.2;
        floatMat.opacity = 0.55 + pulse * 0.35;
        halo.material.opacity = (0.15 + (c.night ?? 1) * 0.3) * pulse;
    };
    mergeStatics(g);
    return g;
}
