// The tracks. Always loaded — these are what tell you where to go, so they have to be
// legible from anywhere on the coast.
//
// A ribbon is built by sampling getTerrainHeight along a centreline, which keeps every
// path glued to the ground however lumpy it gets. The beach track additionally samples
// shoreX(), so it runs parallel to the actual waterline rather than to a straight line.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';
import {
    DRIFTWOOD_STAGE, FIRE_CAMP, ARRIVAL, THE_ROCKS, LOOKOUT, PALETTE,
} from './constants.js';
import { buildPathLantern } from './Props.js';

/** Build a ground-hugging ribbon from a centreline function. */
function ribbon(pointAt, steps, halfWidth, material, lift = 0.08) {
    const positions = [];
    const indices = [];
    const uvs = [];

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = pointAt(t);
        const pNext = pointAt(Math.min(t + 1 / steps, 1));
        const dx = pNext.x - p.x, dz = pNext.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const w = typeof halfWidth === 'function' ? halfWidth(t) : halfWidth;

        const lx = p.x + nx * w, lz = p.z + nz * w;
        const rx = p.x - nx * w, rz = p.z - nz * w;
        positions.push(lx, getTerrainHeight(lx, lz) + lift, lz);
        positions.push(rx, getTerrainHeight(rx, rz) + lift, rz);
        uvs.push(0, t * steps * 0.25, 1, t * steps * 0.25);

        if (i < steps) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
}

/** Spline a polyline of [x,z] waypoints into a pointAt(t) for ribbon(). */
function through(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    return (t) => { const p = curve.getPoint(t); return { x: p.x, z: p.z }; };
}

/** A wayfinding post: a driftwood stake with a glass fishing float on top, faintly
 *  lit from inside. Bay redesign — replaces Goa's painted laterite stones. */
function buildFloatPost(x, z, color) {
    const g = new THREE.Group();
    const y = getTerrainHeight(x, z);
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.4, 5),
        new THREE.MeshStandardMaterial({ color: 0xb8ab94, roughness: 0.95 }));
    stake.position.set(x, y + 0.7, z);
    g.add(stake);
    const net = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x2a2a22, wireframe: true }));
    net.position.set(x, y + 1.55, z);
    g.add(net);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    glass.position.copy(net.position);
    g.add(glass);
    return g;
}

export function createPaths(scene) {
    const group = new THREE.Group();
    group.name = 'paths';
    scene.add(group);
    const updaters = [];

    const trailMat = new THREE.MeshStandardMaterial({ color: 0x6e604c, roughness: 0.99 });
    const sandTrackMat = new THREE.MeshStandardMaterial({ color: 0xc2ab84, roughness: 1.0 });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.95 });

    // ── The beach track ── packed sand above the high-water mark, the length of the cove.
    group.add(ribbon((t) => {
        const z = THREE.MathUtils.lerp(140, -118, t);
        return { x: shoreX(z) + 24, z };
    }, 160, 2.6, sandTrackMat));

    // ── The cliff trail ──
    // From the lookout on top of the North Horn, east along the top, then switchbacks
    // down the inland shoulder to the rock shelf. This is how everyone arrives.
    const L = LOOKOUT, R = THE_ROCKS;
    const cliff = [[L.x + 4, L.z + 2], [L.x + 24, L.z + 4], [L.x + 46, L.z + 2], [L.x + 58, L.z + 12],
        [L.x + 44, L.z + 24], [L.x + 60, L.z + 34], [R.x + 18, R.z - 8], [R.x + 14, R.z + 6]];
    const cliffAt = through(cliff);
    group.add(ribbon(cliffAt, 120, 1.5, trailMat));

    // ── Boardwalk-style trails from the beach track up to each venue ──
    group.add(ribbon(through([[shoreX(DRIFTWOOD_STAGE.z + 26) + 24, DRIFTWOOD_STAGE.z + 26],
        [DRIFTWOOD_STAGE.x - 4, DRIFTWOOD_STAGE.z + 30], [DRIFTWOOD_STAGE.x + 10, DRIFTWOOD_STAGE.z + 24]]),
        40, 1.4, boardMat, 0.12));
    group.add(ribbon(through([[shoreX(FIRE_CAMP.z) + 24, FIRE_CAMP.z + 4],
        [FIRE_CAMP.x - 22, FIRE_CAMP.z + 10], [FIRE_CAMP.x - 6, FIRE_CAMP.z + 4]]), 40, 1.4, trailMat));
    group.add(ribbon(through([[shoreX(128) + 24, 128], [ARRIVAL.x + 20, ARRIVAL.z - 12], [ARRIVAL.x + 12, ARRIVAL.z - 4]]),
        40, 1.4, boardMat, 0.12));

    // Red lamps down the cliff trail — red keeps your night vision for the water.
    for (let i = 0; i < 10; i++) {
        const p = cliffAt((i + 0.5) / 10);
        const lantern = buildPathLantern(p.x + 2.2, p.z, 0xff3a24, 1.6);
        group.add(lantern.group);
        updaters.push(lantern.update);
    }

    // ── Float posts at the junctions ──
    [[shoreX(DRIFTWOOD_STAGE.z + 26) + 27, DRIFTWOOD_STAGE.z + 28, PALETTE.uvCyan],
    [shoreX(FIRE_CAMP.z) + 27, FIRE_CAMP.z + 6, 0x6fd8ff],
    [shoreX(128) + 27, 130, 0x4fffc8],
    [R.x + 17, R.z + 9, 0x6fd8ff]]
        .forEach(([mx, mz, col]) => group.add(buildFloatPost(mx, mz, col)));

    function update(ctx) {
        for (let i = 0; i < updaters.length; i++) updaters[i](ctx);
    }

    return { group, update };
}
