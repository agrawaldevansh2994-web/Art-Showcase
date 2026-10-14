// BAY (2026-10-07): forked from Goa's Palm Camp, then redesigned — chai mama gone, palms
// replaced by casuarinas, moved to the NORTH half behind the dune so its light never
// reaches the water.
//
// FIRE CAMP — where everyone actually sleeps.
//
// Bamboo huts under the coconut grove, hammocks between the trunks, laundry on a line,
// a well, and a fire that has been going since about 1987. It is the only quiet place in
// the world that is not hiding from you.

import * as THREE from 'three';
import { getTerrainHeight, landmarkY } from '../core/Terrain.js';
import { FIRE_CAMP, PALETTE } from '../core/constants.js';
import {
    MAT, buildCasuarina, buildHammock, buildBeachFire, buildPathLantern,
    buildStringLights, buildMat, plain,
} from '../core/Props.js';
import { mergeStatics, markDynamic } from '../core/Merge.js';

const KEY = 'palmCamp';

/** A bamboo sleeping hut: frame, thatch roof, a door hole and a shuttered window. */
function buildHut(x, z, rotation, opts = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const y = getTerrainHeight(x, z);
    const w = opts.width ?? 3.6, d = opts.depth ?? 3.2, h = opts.height ?? 2.4;

    // Raised on short stumps, because everything here is raised on short stumps.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.2, d + 0.5), MAT.wood);
    floor.position.y = 0.42;
    floor.receiveShadow = true;
    inner.add(floor);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 5), MAT.darkWood);
        stump.position.set(sx * w * 0.42, 0.21, sz * d * 0.42);
        inner.add(stump);
    }

    const wallMat = plain(opts.wall ?? 0xb49a68, { side: THREE.DoubleSide });
    // Three walls and a gap for the door.
    for (const [wx, wz, ww, ry] of [
        [0, -d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(ww, h), wallMat);
        wall.position.set(wx, 0.52 + h / 2, wz);
        wall.rotation.y = ry;
        inner.add(wall);
    }
    for (const dx of [-w * 0.34, w * 0.34]) {
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.32, h), wallMat);
        front.position.set(dx, 0.52 + h / 2, d / 2);
        inner.add(front);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.1), wallMat);
    lintel.position.set(0, 0.52 + h - 0.25, d / 2);
    inner.add(lintel);

    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h + 0.5, 6), MAT.bamboo);
        post.position.set(px, 0.52 + h / 2, pz);
        inner.add(post);
    }

    // Pitched palm-thatch.
    for (const side of [-1, 1]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.2, d / 2 + 0.8), MAT.thatch);
        slab.position.set(0, 0.52 + h + 0.55, side * (d / 4 + 0.28));
        slab.rotation.x = side * -0.5;
        slab.castShadow = true;
        inner.add(slab);
    }
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, w + 1.1, 6), MAT.bamboo);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, 0.52 + h + 1.0, 0);
    inner.add(ridge);

    // Somebody is in. A translucent shell plus a sprite reads as a lamp inside from ten
    // metres, and there are eight of these — they cannot each have a PointLight.
    const innerMat = new THREE.MeshBasicMaterial({
        color: PALETTE.lamp, transparent: true, opacity: 0.16, fog: false,
    });
    const glowShell = markDynamic(new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), innerMat));
    glowShell.position.set(0, 1.3, 0);
    inner.add(glowShell);

    inner.rotation.y = rotation;
    inner.position.set(x, y, z);
    g.add(inner);
    g.userData.innerMat = innerMat;
    g.userData.phase = Math.random() * 6;
    // Collapse every static prop that shares a material into one buffer per
    // material. Measured on this zone before merging: see core/Merge.js.
    mergeStatics(g);

    return g;
}

export function generateFireCamp(ctx) {
    const g = new THREE.Group();
    const updaters = [];
    const A = FIRE_CAMP;
    const baseY = landmarkY(A);
    const huts = [];

    // ── Huts, loosely round the fire ──
    const hutSpots = [
        [-14, -10, 0.5], [-16, 6, 1.2], [-8, 17, 2.4], [6, 19, 3.1],
        [16, 9, 4.0], [17, -7, 4.9], [7, -16, 5.6], [-5, -18, 0.1],
    ];
    for (const [dx, dz, rot] of hutSpots) {
        const hx = A.x + dx, hz = A.z + dz;
        const hut = buildHut(hx, hz, rot);
        g.add(hut);
        huts.push(hut);
        ctx.collisionSystem.registerBox(hx, hz, 2.2, 2.0, KEY);
    }

    // ── Casuarinas, and hammocks between them ──
    const palmSpots = [[-22, 0], [-11, -22], [11, -23], [23, 2], [12, 24], [-12, 24], [0, -26], [26, -14]];
    const tops = [];
    palmSpots.forEach(([dx, dz], i) => {
        const px = A.x + dx, pz = A.z + dz;
        const palm = buildCasuarina(px, pz, { height: 12 + (i % 4) * 2 });
        g.add(palm.group);
        updaters.push(palm.update);
        ctx.collisionSystem.registerCircle(px, pz, 0.7, KEY);
        tops.push([px, pz]);
    });
    const hammockPairs = [[0, 1], [2, 3], [4, 5]];
    const hammockColors = [0xc85a3a, 0x2f7a8a, 0xd8a520];
    hammockPairs.forEach(([a, b], i) => {
        const ham = buildHammock(tops[a][0], tops[a][1], tops[b][0], tops[b][1], {
            hangY: 2.5 + i * 0.2, color: hammockColors[i], sag: 1.3,
        });
        g.add(ham.group);
        updaters.push(ham.update);
    });

    // ── The fire ──
    const fire = buildBeachFire(A.x, A.z, { light: true, lightIntensity: 2.8, seatCount: 7 });
    g.add(fire.group);
    updaters.push(fire.update);
    ctx.collisionSystem.registerCircle(A.x, A.z, 1.7, KEY);

    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        g.add(buildMat(A.x + Math.cos(a) * 5, A.z + Math.sin(a) * 5, { rotation: -a }));
    }

    // ── Laundry ──
    // A line between two palms with things pegged to it. Nothing says lived-in faster.
    const lineA = tops[0], lineB = tops[6];
    const ax = lineA[0], az = lineA[1], bx = lineB[0], bz = lineB[1];
    const ay = getTerrainHeight(ax, az) + 3.0, by = getTerrainHeight(bx, bz) + 3.0;
    const linePts = [];
    for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        linePts.push(new THREE.Vector3(
            THREE.MathUtils.lerp(ax, bx, t),
            THREE.MathUtils.lerp(ay, by, t) - Math.sin(t * Math.PI) * 0.7,
            THREE.MathUtils.lerp(az, bz, t)));
    }
    const lineCurve = new THREE.CatmullRomCurve3(linePts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(lineCurve, 20, 0.02, 4, false), MAT.rope));

    const laundry = [];
    const laundryColors = [0xe8e2d2, 0xd8342a, 0x1f6fa8, 0xf0b323, 0xe8e2d2, 0x2f8a54, 0xd8cbb0];
    for (let i = 0; i < 7; i++) {
        const p = lineCurve.getPointAt((i + 0.5) / 7);
        const cloth = markDynamic(new THREE.Mesh(
            new THREE.PlaneGeometry(0.7, 0.95, 2, 3),
            plain(laundryColors[i], { side: THREE.DoubleSide })));
        cloth.position.set(p.x, p.y - 0.5, p.z);
        cloth.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
        g.add(cloth);
        laundry.push({ mesh: cloth, base: cloth.rotation.y, phase: i * 0.8 });
    }

    // ── The well ──
    const wellX = A.x + 20, wellZ = A.z + 18;
    const wellY = getTerrainHeight(wellX, wellZ);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.0, 12), MAT.laterite);
    well.position.set(wellX, wellY + 0.5, wellZ);
    well.castShadow = true;
    g.add(well);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.95, 12),
        plain(0x14343e, {
            kind: 'standard', roughness: 0.05, metalness: 0.7, emissive: 0x061a20,
        }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(wellX, wellY + 0.72, wellZ);
    g.add(water);
    for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 5), MAT.bamboo);
        post.position.set(wellX + sx * 1.0, wellY + 1.6, wellZ);
        g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), MAT.bamboo);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(wellX, wellY + 2.6, wellZ);
    g.add(beam);
    ctx.collisionSystem.registerCircle(wellX, wellZ, 1.4, KEY);

    // ── Light ──
    for (const [dx, dz] of [[-10, 10], [10, -10], [-18, -16], [18, 16]]) {
        const lantern = buildPathLantern(A.x + dx, A.z + dz, PALETTE.lamp, 2.3);
        g.add(lantern.group);
        updaters.push(lantern.update);
    }
    const strings = buildStringLights([
        new THREE.Vector3(tops[2][0], getTerrainHeight(tops[2][0], tops[2][1]) + 3.4, tops[2][1]),
        new THREE.Vector3(A.x + 2, baseY + 3.0, A.z + 12),
        new THREE.Vector3(tops[4][0], getTerrainHeight(tops[4][0], tops[4][1]) + 3.4, tops[4][1]),
    ], { spacing: 1.4 });
    g.add(strings.group);
    updaters.push(strings.update);

    // ─────────────────────────────────────────────
    g.userData.update = (c) => {
        for (let i = 0; i < updaters.length; i++) updaters[i](c);
        const night = c.night ?? 0;
        const t = c.time;
        const wind = 0.5 + (c.weather?.stormLevel ?? 0) * 3;

        for (let i = 0; i < huts.length; i++) {
            const h = huts[i];
            h.userData.innerMat.opacity = (0.03 + night * 0.2)
                * (0.85 + Math.sin(t * 1.7 + h.userData.phase) * 0.15);
        }
        for (let i = 0; i < laundry.length; i++) {
            const l = laundry[i];
            l.mesh.rotation.z = Math.sin(t * 1.4 + l.phase) * 0.22 * wind;
            l.mesh.rotation.y = l.base + Math.sin(t * 0.9 + l.phase) * 0.14 * wind;
        }
    };

    g.userData.emberSource = { x: A.x, z: A.z };
    return g;
}
