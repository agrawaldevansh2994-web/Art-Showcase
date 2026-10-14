// BAY M1 (2026-10-07): forked from Goa's Sunset Rocks. The tide pools now hold trapped
// plankton and breathe blue at night (a cheap preview of M3's step-in glow pools), and
// the drum circle plays during Glow Tide instead of a sunset.
//
// THE ROCKS — the dark shelf at the foot of the North Horn that runs out into the surf.
//
// Press X anywhere (or E at the drums) for Glow Tide: the crowd walks into the water,
// and the djembe circle starts.
// The zone itself is deliberately almost empty: rock, tide pools, a ring of drums and one
// driftwood fire. The thing you are meant to be looking at is not in this file.

import * as THREE from 'three';
import { getTerrainHeight, landmarkY, shoreX } from '../core/Terrain.js';
import { THE_ROCKS, PALETTE } from '../core/constants.js';
import {
    MAT, buildBoulderField, buildBeachFire, buildMat, buildPathLantern,
    layOnGround, makeGlowSprite, plain,
} from '../core/Props.js';
import { mergeStatics, markDynamic } from '../core/Merge.js';

const KEY = 'theRocks';

export function generateTheRocks(ctx) {
    const g = new THREE.Group();
    const updaters = [];
    const A = THE_ROCKS;
    const baseY = landmarkY(A);

    // ── The shelf ──
    // Big flat slabs rather than round boulders: this is wave-cut rock, and it is what
    // you actually stand on. Squashed and tilted slightly so it reads as bedding planes.
    const slabMat = plain(0x6a3a26, { kind: 'standard', roughness: 0.98 });
    for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 15;
        const sx = A.x + Math.cos(a) * r;
        const sz = A.z + Math.sin(a) * r * 1.4;
        const slab = new THREE.Mesh(
            new THREE.BoxGeometry(3 + Math.random() * 5, 0.5 + Math.random() * 0.8, 2.5 + Math.random() * 4),
            slabMat);
        slab.position.set(sx, getTerrainHeight(sx, sz) + 0.1, sz);
        slab.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * Math.PI, (Math.random() - 0.5) * 0.16);
        slab.castShadow = true;
        slab.receiveShadow = true;
        g.add(slab);
    }
    // Broken rock scattered out into the water on the seaward side.
    g.add(buildBoulderField(30, A.x - 14, A.z, 16, 1.15));
    g.add(buildBoulderField(22, A.x + 6, A.z + 22, 13, 0.85));
    ctx.collisionSystem.registerCircle(A.x - 14, A.z, 5, KEY);

    // ── Tide pools ──
    // Dark, still discs sitting in the rock. They read because everything around them is
    // matte and they are not.
    const poolMat = new THREE.MeshStandardMaterial({
        color: 0x123038, roughness: 0.06, metalness: 0.55,
        transparent: true, opacity: 0.9, emissive: 0x04141a, emissiveIntensity: 0.4,
    });
    const pools = [];
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 11;
        const px = A.x + Math.cos(a) * r, pz = A.z + Math.sin(a) * r * 1.3;
        const geo = new THREE.CircleGeometry(0.8 + Math.random() * 1.5, 12);
        geo.rotateX(-Math.PI / 2);
        const pool = new THREE.Mesh(geo, poolMat);
        layOnGround(pool, px, pz, 0.42);
        g.add(pool);
        pools.push(pool);
    }

    // ── The drum circle ──
    // Seven djembes on the flattest slab, with mats. They are always here; the ceremony
    // is what puts people behind them.
    const drumMat = plain(0x5a3a1e, { kind: 'standard', roughness: 0.85 });
    const skinMat = plain(0xd8c8a8, { kind: 'standard', roughness: 0.9 });
    const drums = [];
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const dx = A.x + 4 + Math.cos(a) * 4.6;
        const dz = A.z + Math.sin(a) * 4.6;
        const dy = getTerrainHeight(dx, dz);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.19, 0.95, 10), drumMat);
        body.position.set(dx, dy + 0.48, dz);
        body.castShadow = true;
        g.add(body);
        const skin = markDynamic(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 12), skinMat));
        skin.position.set(dx, dy + 0.97, dz);
        g.add(skin);
        // Rope lacing down the side.
        for (let k = 0; k < 6; k++) {
            const ka = (k / 6) * Math.PI * 2;
            const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 3), MAT.rope);
            cord.position.set(dx + Math.cos(ka) * 0.28, dy + 0.55, dz + Math.sin(ka) * 0.28);
            cord.rotation.z = Math.cos(ka) * 0.12;
            cord.rotation.x = -Math.sin(ka) * 0.12;
            g.add(cord);
        }
        g.add(buildMat(dx + Math.cos(a) * 1.3, dz + Math.sin(a) * 1.3, {
            width: 1.2, depth: 1.0, color: 0x8a7a4e, rotation: -a,
        }));
        drums.push({ body, skin, phase: i * 0.9 });
    }

    // ── Driftwood fire ──
    const fire = buildBeachFire(A.x + 12, A.z - 8, { light: true, lightIntensity: 2.5, seatCount: 3 });
    g.add(fire.group);
    updaters.push(fire.update);
    ctx.collisionSystem.registerCircle(A.x + 12, A.z - 8, 1.6, KEY);

    // ── Two lamps, for after the sun has gone ──
    for (const [lx, lz] of [[A.x + 14, A.z + 8], [A.x + 6, A.z - 14]]) {
        const lantern = buildPathLantern(lx, lz, PALETTE.lamp, 2.0);
        g.add(lantern.group);
        updaters.push(lantern.update);
    }

    // ── Join the circle ──
    ctx.controls.addInteractable({
        x: A.x + 4, z: A.z, radius: 9, owner: KEY,
        prompt: 'E  JOIN THE CIRCLE',
        enabled: () => true,
        onInteract: () => ctx.startSunsetSession(),
    });

    // ─────────────────────────────────────────────
    let flare = 0;
    const _bio = new THREE.Color(0x1ab8ff);
    g.userData.update = (c) => {
        for (let i = 0; i < updaters.length; i++) updaters[i](c);

        const t = c.time;
        const dusk = c.dusk ?? 0;
        const night = c.night ?? 0;

        // The drums only move while the circle is actually playing.
        if (c.ceremony) {
            for (let i = 0; i < drums.length; i++) {
                const d = drums[i];
                // Only the skins move; the drums themselves stay exactly where they are.
                const hit = Math.max(0, Math.sin(t * 6.9 + d.phase));
                d.skin.scale.y = 1 + hit * hit * 0.7;
            }
        } else {
            for (let i = 0; i < drums.length; i++) drums[i].skin.scale.y = 1;
        }

        // The pools hold trapped plankton: dark by day, a slow blue breath at night,
        // brighter while Glow Tide is on. One shared material, so it costs nothing.
        flare = THREE.MathUtils.lerp(flare, c.ceremony ? 1 : 0, c.delta * 1.5);
        const breath = 0.75 + Math.sin(t * 0.8) * 0.25;
        poolMat.emissive.setHex(0x04141a).lerp(_bio, Math.min(1, night * (0.55 + flare * 0.45)));
        poolMat.emissiveIntensity = 0.2 + night * (0.5 + flare * 0.8) * breath - dusk * 0.1;
    };

    g.userData.emberSource = { x: A.x + 12, z: A.z - 8 };
    // Collapse every static prop that shares a material into one buffer per
    // material. Measured on this zone before merging: see core/Merge.js.
    mergeStatics(g);

    return g;
}
