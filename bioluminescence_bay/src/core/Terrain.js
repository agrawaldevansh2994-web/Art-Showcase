// Terrain: Bioluminescence Bay. One crescent cove facing west (−X), closed at both ends
// by laterite horns, with a dune at the back of the beach and jungle-covered ridge behind.
//
// Forked from Goa_trance/src/core/Terrain.js (2026-10-07). The machinery is unchanged —
// a CROSS-SHORE PROFILE as a function of distance from the waterline, rock masses added
// on top, landmark flattening — only the waterline and the rock masses are new. Read the
// Goa file's history before changing beachProfile(): TIDE_AMPLITUDE is tuned against it.
//
// Everything in the world sits on getTerrainHeight(). Zones, props, the crowd, the ocean
// and the player controller all call it — never re-derive the ground height anywhere else.

import * as THREE from 'three';
import { noise } from './Noise.js';
import {
    TERRAIN_SIZE, TERRAIN_SEGS, SEA_LEVEL,
    THE_ROCKS, DRIFTWOOD_STAGE, FIRE_CAMP, ARRIVAL, LOOKOUT,
    COVE_HALF_Z, COVE_BACK_X, COVE_MOUTH_X,
} from './constants.js';

// ─────────────────────────────────────────────────────────────
//  THE SHORELINE
// ─────────────────────────────────────────────────────────────

/**
 * Nominal waterline X at a given point along the coast. A crescent: deepest (furthest
 * inland) at z = 0, back out at the horns. cos² rather than a parabola so the curve
 * meets the horns tangentially instead of with a kink. A little noise so it is a beach
 * and not a compass arc.
 */
export function coastX(z) {
    const u = Math.min(Math.abs(z) / COVE_HALF_Z, 1);
    const bow = Math.cos(u * Math.PI * 0.5);
    return COVE_MOUTH_X + (COVE_BACK_X - COVE_MOUTH_X) * bow * bow
        + noise.fbm2D(z * 0.006, 13.7, 2) * 5;
}

const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * The cross-shore profile: height as a function of distance inland from the waterline.
 * This one function is the whole beach. Keep the wet-sand gradient shallow — the tide
 * walks across it, and TIDE_AMPLITUDE is tuned against this number.
 */
function beachProfile(d) {
    if (d < 0) {
        // Sea floor. Gentle shelf that matches the wet-sand gradient at d=0 so the
        // waterline has no crease in it, then falls away properly further out.
        const t = -d;
        return -(t * 0.028 + Math.pow(t / 40, 2.6) * 2.4);
    }
    if (d < 14) return d * 0.028;                                  // wet sand → 0.39
    if (d < 34) return 0.39 + (d - 14) * 0.082;                    // dry sand → 2.03
    if (d < 70) return 2.03 + smoothstep((d - 34) / 36) * 3.5;     // dune + palm line → 5.5
    if (d < 150) return 5.5 - smoothstep((d - 70) / 80) * 1.7;     // grove settles to 3.8
    return 3.8;
}

// ─────────────────────────────────────────────────────────────
//  HEADLANDS
//  Laterite promontories. High at the sea with a cliff face dropping into it, a flat
//  top you can stand a venue on, and a shoulder falling away inland so you can walk
//  around the back of them.
// ─────────────────────────────────────────────────────────────

const HEADLANDS = [
    // THE NORTH HORN. The taller of the two: a cliff straight into deep water on its
    // seaward face, the rock shelf (THE_ROCKS) at its foot inside the cove, and a flat
    // top that M3 puts the lookout on. It is what you see over your right shoulder from
    // the stage, so it has to read as a wall against the stars.
    { z: -192, halfZ: 52, seaEdge: -128, cliffRun: 26, inlandEdge: 18, inlandRun: 70, peak: 34, seed: 11 },
    // THE SOUTH HORN. Lower and rounder — the arrival trail climbs over its shoulder,
    // so the inland run is long and gentle.
    { z: 192, halfZ: 50, seaEdge: -118, cliffRun: 24, inlandEdge: 10, inlandRun: 90, peak: 24, seed: 71 },
    // Two low rock fingers that run out into the shallows inside each horn. They break
    // the swell into two lines of glowing surf instead of one straight band.
    { z: -140, halfZ: 16, seaEdge: -78, cliffRun: 14, inlandEdge: -40, inlandRun: 20, peak: 4, seed: 211 },
    { z: 142, halfZ: 14, seaEdge: -74, cliffRun: 14, inlandEdge: -40, inlandRun: 20, peak: 3.5, seed: 307 },
];

/** 0..1 — how much of the ground here is laterite rock rather than sand or soil. */
export function headlandAmount(x, z) {
    let m = 0;
    for (let i = 0; i < HEADLANDS.length; i++) {
        const s = HEADLANDS[i];
        const dz = (z - s.z) / s.halfZ;
        if (dz <= -1 || dz >= 1) continue;
        let cross;
        if (x < s.seaEdge) cross = 1 + (x - s.seaEdge) / s.cliffRun;
        else if (x < s.inlandEdge) cross = 1;
        else cross = 1 - (x - s.inlandEdge) / s.inlandRun;
        if (cross <= 0) continue;
        const along = Math.cos(dz * Math.PI * 0.5);
        m = Math.max(m, along * along * smoothstep(Math.min(cross, 1)));
    }
    return m;
}

function headlandHeight(x, z) {
    // Max across headlands, not a sum — headlandAmount() (above) already does this.
    // Two masses' Z-ranges can legitimately overlap (the north shoulder and the
    // second Disco Valley hill do), and summing there stacked both heights into
    // one landmass taller than either was designed to be.
    let h = 0;
    for (let i = 0; i < HEADLANDS.length; i++) {
        const s = HEADLANDS[i];
        const dz = (z - s.z) / s.halfZ;
        if (dz <= -1 || dz >= 1) continue;
        let cross;
        if (x < s.seaEdge) cross = 1 + (x - s.seaEdge) / s.cliffRun;
        else if (x < s.inlandEdge) cross = 1;
        else cross = 1 - (x - s.inlandEdge) / s.inlandRun;
        if (cross <= 0) continue;
        const along = Math.cos(dz * Math.PI * 0.5);
        // Ridged noise gives the rock its broken, terraced look instead of a smooth loaf.
        const rough = noise.ridged2D(x * 0.013 + s.seed, z * 0.013, 3);
        h = Math.max(h, along * along * smoothstep(Math.min(cross, 1)) * s.peak * (0.68 + rough * 0.58));
    }
    return h;
}

// ─────────────────────────────────────────────────────────────
//  RAW TERRAIN
// ─────────────────────────────────────────────────────────────

function rawHeight(x, z) {
    const d = x - coastX(z);
    let h = beachProfile(d);

    h += headlandHeight(x, z);

    // The low forested ridge that closes the world off to the east, well past the
    // paddy. Nothing is built out there; it exists so the horizon inland is not a line.
    //
    // The ramp MUST plateau. The terrain mesh runs to x = ±700 (TERRAIN_SIZE/2) but you
    // can only walk to x = 150, and an unclamped quadratic out there reached 3700 units
    // at the corner — a mountain range visible from the whole beach. Clamp, then flatten.
    if (x > 96) {
        const t = smoothstep(Math.min((x - 96) / 110, 1));
        h += t * 26 + noise.fbm2D(x * 0.010, z * 0.010, 3) * t * 18;
    }
    // …and the same at the far south, past the arrival road. Same clamp, same reason.
    // Close the world off past both horns. Same clamp, same reason.
    if (Math.abs(z) > 222) {
        const t = smoothstep(Math.min((Math.abs(z) - 222) / 90, 1));
        h += t * 28;
    }

    // Surface detail. Sand is smooth; ground gets lumpier the further inland you go.
    const inland = THREE.MathUtils.clamp((d - 30) / 90, 0, 1);
    h += noise.fbm2D(x * 0.017, z * 0.017, 3) * (0.5 + inland * 5.2);
    // Fine ripple, only really visible on the open sand.
    h += noise.fbm2D(x * 0.11, z * 0.11, 2) * 0.22 * (1 - inland * 0.7);

    return h;
}

// ─────────────────────────────────────────────────────────────
//  LANDMARK FLATTENING
//  Every zone needs buildable ground. Each spot samples the raw terrain once at its
//  centre and blends the surrounding area toward that level.
// ─────────────────────────────────────────────────────────────

const FLAT_SPEC = [
    // Wide and a little scooped: the stage on the dune, and the dance floor running
    // down the sand in front of it toward the water.
    { p: DRIFTWOOD_STAGE, r: 30, feather: 26, drop: 0.6 },
    { p: THE_ROCKS, r: 18, feather: 20, drop: -0.9 },     // the shelf sits proud of the sand
    { p: FIRE_CAMP, r: 24, feather: 22, drop: 0 },
    { p: ARRIVAL, r: 24, feather: 22, drop: 0 },
    { p: LOOKOUT, r: 10, feather: 14, drop: 0 },          // a flat cliff-top to stand on
];

const FLAT_SPOTS = FLAT_SPEC.map(s => ({
    x: s.p.x, z: s.p.z, r: s.r, feather: s.feather,
    y: rawHeight(s.p.x, s.p.z) - s.drop,
}));

/** Ground level for a fully flattened landmark — useful for placing structures. */
export function landmarkY(anchor) {
    const spot = FLAT_SPOTS.find(s => s.x === anchor.x && s.z === anchor.z);
    return spot ? spot.y : rawHeight(anchor.x, anchor.z);
}

/** THE ground height function. Everything stands on this. */
export function getTerrainHeight(x, z) {
    let h = rawHeight(x, z);
    for (let i = 0; i < FLAT_SPOTS.length; i++) {
        const s = FLAT_SPOTS[i];
        const dx = x - s.x, dz = z - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const outer = s.r + s.feather;
        if (d >= outer) continue;
        const t = d <= s.r ? 1 : 1 - (d - s.r) / s.feather;
        h += (s.y - h) * smoothstep(t);
    }
    return h;
}

/** True when (x,z) is inside a flattened landmark — used to keep clearings clear. */
export function isFlattened(x, z, margin = 0) {
    for (let i = 0; i < FLAT_SPOTS.length; i++) {
        const s = FLAT_SPOTS[i];
        const dx = x - s.x, dz = z - s.z;
        if (dx * dx + dz * dz < (s.r + margin) * (s.r + margin)) return true;
    }
    return false;
}

const _n = new THREE.Vector3();
export function getTerrainNormal(x, z, eps = 1.2) {
    return _n.set(
        getTerrainHeight(x - eps, z) - getTerrainHeight(x + eps, z),
        eps * 2,
        getTerrainHeight(x, z - eps) - getTerrainHeight(x, z + eps)
    ).normalize().clone();
}

/** Steepness in 0..1, where 0 is flat ground and 1 is a wall. */
export function getSlope(x, z) {
    return 1 - getTerrainNormal(x, z).y;
}

// ─────────────────────────────────────────────────────────────
//  WATER QUERIES
//  The sea is drawn by Ocean.js, but "how deep is it here" is a terrain question and
//  everything from the controller to the crab spawner asks it, so it lives here.
// ─────────────────────────────────────────────────────────────

/** Depth of water over the ground at (x,z), 0 on dry land. */
export function waterDepth(x, z, seaLevel = SEA_LEVEL) {
    return Math.max(0, seaLevel - getTerrainHeight(x, z));
}

// The actual waterline is wherever getTerrainHeight crosses sea level, which the
// headlands move around. Bisection is exact and cheap enough cached by whole units of z.
const _shoreCache = new Map();
export function shoreX(z, seaLevel = SEA_LEVEL) {
    const key = Math.round(z);
    const cached = _shoreCache.get(key);
    if (cached !== undefined) return cached;

    let lo = -148, hi = 40;                       // wet at lo, dry at hi (almost always)
    if (getTerrainHeight(lo, key) > seaLevel) { _shoreCache.set(key, lo); return lo; }
    for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (getTerrainHeight(mid, key) < seaLevel) lo = mid; else hi = mid;
    }
    _shoreCache.set(key, hi);
    return hi;
}

// ─────────────────────────────────────────────────────────────
//  TERRAIN MESH
// ─────────────────────────────────────────────────────────────

export function createTerrain(scene) {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const count = pos.count;
    const heights = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const h = getTerrainHeight(pos.getX(i), pos.getZ(i));
        heights[i] = h;
        pos.setY(i, h);
    }

    const cols = new Float32Array(count * 3);
    const cSeabed = new THREE.Color(0x5c5a48);
    const cWetSand = new THREE.Color(0x9a8465);
    const cDrySand = new THREE.Color(0xd8c39a);
    const cScrub = new THREE.Color(0x6f7a44);
    const cGrove = new THREE.Color(0x365a2c);
    const cPaddy = new THREE.Color(0x6a8f3a);
    const cLaterite = new THREE.Color(0x9c4f2c);
    const cLatDark = new THREE.Color(0x5e3020);
    const c = new THREE.Color();
    const side = TERRAIN_SEGS + 1;
    const step = TERRAIN_SIZE / TERRAIN_SEGS;

    for (let i = 0; i < count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), y = heights[i];

        // Steepness from the cached grid rather than four more noise evaluations.
        const ix = i % side, iz = (i / side) | 0;
        const hL = heights[iz * side + Math.max(ix - 1, 0)];
        const hR = heights[iz * side + Math.min(ix + 1, side - 1)];
        const hD = heights[Math.max(iz - 1, 0) * side + ix];
        const hU = heights[Math.min(iz + 1, side - 1) * side + ix];
        const grad = Math.hypot((hR - hL) / (2 * step), (hU - hD) / (2 * step));
        const steep = Math.min(grad, 2) / 2;

        const d = x - coastX(z);

        if (y < -0.6) c.copy(cSeabed);
        else if (y < 0.5) c.copy(cSeabed).lerp(cWetSand, (y + 0.6) / 1.1);
        else if (d < 34) c.copy(cWetSand).lerp(cDrySand, THREE.MathUtils.clamp((y - 0.5) / 1.3, 0, 1));
        else if (d < 62) c.copy(cDrySand).lerp(cScrub, THREE.MathUtils.clamp((d - 34) / 28, 0, 1));
        else if (d < 108) c.copy(cScrub).lerp(cGrove, THREE.MathUtils.clamp((d - 62) / 46, 0, 1));
        else c.copy(cGrove).lerp(cPaddy, THREE.MathUtils.clamp((d - 108) / 40, 0, 1));

        // Laterite wins wherever there is rock under you. This red is the single most
        // recognisable colour on this coast and it needs to read from a long way off.
        const rock = headlandAmount(x, z);
        if (rock > 0.04) {
            c.lerp(cLaterite, Math.min(rock * 1.25, 0.94));
            // Damp, mossy shadow in the gullies.
            if (steep > 0.4) c.lerp(cLatDark, Math.min((steep - 0.4) * 1.6, 0.7));
        }

        const grain = noise.fbm2D(x * 0.07, z * 0.07, 2) * 0.06;
        cols[i * 3] = THREE.MathUtils.clamp(c.r + grain, 0, 1);
        cols[i * 3 + 1] = THREE.MathUtils.clamp(c.g + grain * 0.9, 0, 1);
        cols[i * 3 + 2] = THREE.MathUtils.clamp(c.b + grain * 0.75, 0, 1);
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.96, metalness: 0.02, flatShading: true,
    }));
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    return mesh;
}

// ─────────────────────────────────────────────────────────────
//  COCONUT PALMS
//  Two InstancedMeshes for the whole coast: one for trunks, one for every frond of
//  every palm. Eight thousand fronds cost one draw call.
// ─────────────────────────────────────────────────────────────

const FRONDS_PER_PALM = 8;

function makeFrondGeometry() {
    const g = new THREE.PlaneGeometry(0.9, 4.6, 2, 7);
    g.translate(0, 2.3, 0);                       // pivot at the stem, blade runs up +Y
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / 4.6;
        p.setZ(i, -t * t * 2.3);                  // droop
        p.setX(i, p.getX(i) * (1 - t * 0.8));     // taper to a point
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
}

/**
 * @param opts.density 0..1 scale on the count actually placed
 * @param opts.minD/maxD  cross-shore band the palms are allowed in
 */
export function createPalms(scene, count, bounds, opts = {}) {
    const minD = opts.minD ?? 30;
    const maxD = opts.maxD ?? 160;

    const trunkGeo = new THREE.CylinderGeometry(0.17, 0.34, 1, 6);
    trunkGeo.translate(0, 0.5, 0);                // grows up from y=0
    const frondGeo = makeFrondGeometry();

    const trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const frondMat = new THREE.MeshLambertMaterial({
        color: 0xffffff, vertexColors: true, side: THREE.DoubleSide,
    });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, count * FRONDS_PER_PALM);
    trunks.castShadow = true;
    fronds.castShadow = true;

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let placed = 0, frondIdx = 0;

    for (let attempt = 0; attempt < count * 5 && placed < count; attempt++) {
        const x = bounds.xMin + noise.rand() * (bounds.xMax - bounds.xMin);
        const z = bounds.zMin + noise.rand() * (bounds.zMax - bounds.zMin);
        const d = x - coastX(z);
        if (d < minD || d > maxD) continue;
        if (isFlattened(x, z, 8)) continue;
        if (headlandAmount(x, z) > 0.55) continue;      // nothing roots in bare laterite
        if (getSlope(x, z) > 0.6) continue;

        const y = getTerrainHeight(x, z);
        const h = 9 + noise.rand() * 9;                  // coconut palms are tall and varied
        const lean = (noise.rand() - 0.5) * 0.30;        // and they all lean toward the light
        const leanDir = noise.rand() * Math.PI * 2;

        dummy.position.set(x, y, z);
        dummy.rotation.set(Math.sin(leanDir) * lean, 0, Math.cos(leanDir) * lean);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.09, 0.16 + noise.rand() * 0.10, 0.22 + noise.rand() * 0.12);
        trunks.setColorAt(placed, col);

        // Crown: the top of the trunk after the lean has displaced it.
        const cx = x + Math.sin(leanDir) * lean * h * 0.55;
        const cz = z + Math.cos(leanDir) * lean * h * 0.55;
        const cy = y + h * 0.97;
        const crownHue = 0.26 + noise.rand() * 0.06;
        const crownLight = 0.16 + noise.rand() * 0.12;

        for (let f = 0; f < FRONDS_PER_PALM; f++) {
            const a = (f / FRONDS_PER_PALM) * Math.PI * 2 + noise.rand() * 0.3;
            const tilt = 0.75 + noise.rand() * 0.55;     // out and down from the crown
            dummy.position.set(cx, cy, cz);
            dummy.rotation.set(0, 0, 0);
            dummy.rotateY(a);
            dummy.rotateX(tilt);
            dummy.scale.setScalar(0.85 + noise.rand() * 0.4);
            dummy.updateMatrix();
            fronds.setMatrixAt(frondIdx, dummy.matrix);
            col.setHSL(crownHue, 0.45 + noise.rand() * 0.2, crownLight);
            fronds.setColorAt(frondIdx, col);
            frondIdx++;
        }
        placed++;
    }

    trunks.count = placed;
    fronds.count = frondIdx;
    if (placed > 0) {
        trunks.instanceColor.needsUpdate = true;
        fronds.instanceColor.needsUpdate = true;
    }

    const group = new THREE.Group();
    group.name = 'palms';
    group.add(trunks, fronds);
    scene.add(group);
    return group;
}

// ─────────────────────────────────────────────────────────────
//  BAY VEGETATION (redesign, 2026-10-07)
//  Goa's coconut palms are gone. Real bioluminescent bays (Vieques, Havelock, the
//  Maldives lagoons) are fringed by MANGROVES — the tannins and nutrients their roots
//  leak are what feed the plankton — so the cove's two corners are mangrove thickets
//  standing on arched prop roots in the water. The dune line is CASUARINA: tall,
//  narrow, feathery sea-pines that read as soft spires against the stars, nothing
//  like a palm. Behind them a low broadleaf canopy (sea-almond / banyan blobs).
//  Three instanced sets, ~8 draw calls total.
// ─────────────────────────────────────────────────────────────

function createCasuarinas(scene, count, bounds, opts = {}) {
    const minD = opts.minD ?? 30, maxD = opts.maxD ?? 90;
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.24, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    // Foliage: three stacked, drooping cones — a soft spire, not a Christmas tree.
    const tiers = [];
    for (let i = 0; i < 3; i++) {
        const c = new THREE.ConeGeometry(1.0 - i * 0.22, 1.5, 7, 1, true);
        c.translate(0, 0.62 + i * 0.32, 0);
        tiers.push(c);
    }
    const foliageGeo = mergeGeos(tiers);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(foliageGeo, leafMat, count);
    trunks.castShadow = leaves.castShadow = true;
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    let placed = 0;
    for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
        const x = bounds.xMin + noise.rand() * (bounds.xMax - bounds.xMin);
        const z = bounds.zMin + noise.rand() * (bounds.zMax - bounds.zMin);
        const d = x - coastX(z);
        if (d < minD || d > maxD) continue;
        if (isFlattened(x, z, 6)) continue;
        if (headlandAmount(x, z) > 0.6) continue;
        if (getSlope(x, z) > 0.7) continue;
        const y = getTerrainHeight(x, z);
        const h = 11 + noise.rand() * 10;
        const lean = (noise.rand() - 0.5) * 0.12;
        dummy.position.set(x, y, z);
        dummy.rotation.set(lean, noise.rand() * 6.28, -lean);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.07, 0.12, 0.16 + noise.rand() * 0.08);
        trunks.setColorAt(placed, col);
        // Foliage spans the top 75% of the trunk, narrow (radius ~2) and tall.
        const w = 1.7 + noise.rand() * 0.9;
        dummy.position.set(x, y + h * 0.25, z);
        dummy.scale.set(w, h * 0.55, w);
        dummy.updateMatrix();
        leaves.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.36 + noise.rand() * 0.06, 0.28 + noise.rand() * 0.12, 0.13 + noise.rand() * 0.07);
        leaves.setColorAt(placed, col);
        placed++;
    }
    trunks.count = leaves.count = placed;
    if (placed) { trunks.instanceColor.needsUpdate = true; leaves.instanceColor.needsUpdate = true; }
    const g = new THREE.Group(); g.name = 'casuarinas'; g.add(trunks, leaves); scene.add(g);
    return g;
}

function createBroadleaf(scene, count, bounds, opts = {}) {
    const minD = opts.minD ?? 70, maxD = opts.maxD ?? 220;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    // A canopy of three overlapping squashed blobs.
    const blobs = [];
    for (const [bx, by, bz, r] of [[0, 0, 0, 1], [0.75, -0.15, 0.3, 0.75], [-0.6, -0.1, -0.45, 0.8]]) {
        const b = new THREE.IcosahedronGeometry(r, 1);
        b.scale(1, 0.62, 1);
        b.translate(bx, by, bz);
        blobs.push(b);
    }
    const canopyGeo = mergeGeos(blobs);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(canopyGeo, leafMat, count);
    crowns.castShadow = true;
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    let placed = 0;
    for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
        const x = bounds.xMin + noise.rand() * (bounds.xMax - bounds.xMin);
        const z = bounds.zMin + noise.rand() * (bounds.zMax - bounds.zMin);
        const d = x - coastX(z);
        if (d < minD || d > maxD) continue;
        if (isFlattened(x, z, 8)) continue;
        if (headlandAmount(x, z) > 0.7) continue;
        const y = getTerrainHeight(x, z);
        const h = 4 + noise.rand() * 4, w = 4 + noise.rand() * 4;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, noise.rand() * 6.28, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.07, 0.15, 0.14);
        trunks.setColorAt(placed, col);
        dummy.position.set(x, y + h + w * 0.25, z);
        dummy.scale.set(w, w, w);
        dummy.updateMatrix();
        crowns.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.27 + noise.rand() * 0.08, 0.35 + noise.rand() * 0.15, 0.11 + noise.rand() * 0.07);
        crowns.setColorAt(placed, col);
        placed++;
    }
    trunks.count = crowns.count = placed;
    if (placed) { trunks.instanceColor.needsUpdate = true; crowns.instanceColor.needsUpdate = true; }
    const g = new THREE.Group(); g.name = 'broadleaf'; g.add(trunks, crowns); scene.add(g);
    return g;
}

/**
 * Mangroves: a dome canopy held up on 7 arched prop roots that plunge into the water.
 * Planted in a band straddling the waterline (d from -10 to +6) in the cove's corners.
 */
function createMangroves(scene, count, zBands) {
    const ROOTS = 7;
    // One prop root: a half-torus arc, ~1 unit tall, from the trunk base out to the mud.
    const rootGeo = new THREE.TorusGeometry(0.6, 0.05, 4, 8, Math.PI);
    rootGeo.rotateY(Math.PI / 2);
    rootGeo.translate(0, 0, 0.6);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const crown = new THREE.IcosahedronGeometry(1, 1);
    crown.scale(1, 0.55, 1);
    const rootMat = new THREE.MeshLambertMaterial({ color: 0x3a2e24 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2e24 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    const roots = new THREE.InstancedMesh(rootGeo, rootMat, count * ROOTS);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crown, leafMat, count);
    crowns.castShadow = true;
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    let placed = 0, ri = 0;
    for (let attempt = 0; attempt < count * 10 && placed < count; attempt++) {
        const band = zBands[Math.floor(noise.rand() * zBands.length)];
        const z = band[0] + noise.rand() * (band[1] - band[0]);
        const x = coastX(z) - 10 + noise.rand() * 16;
        if (isFlattened(x, z, 4)) continue;
        if (headlandAmount(x, z) > 0.35) continue;
        const ground = getTerrainHeight(x, z);
        const base = Math.max(ground, SEA_LEVEL - 0.1);      // roots lift the tree out of the water
        const lift = 1.2 + noise.rand() * 0.6;
        const scaleR = 1.4 + noise.rand() * 0.8;
        for (let k = 0; k < ROOTS; k++) {
            const a = (k / ROOTS) * Math.PI * 2 + noise.rand() * 0.5;
            dummy.position.set(x, Math.min(ground, SEA_LEVEL) - 0.2, z);
            dummy.rotation.set(0, a, 0);
            dummy.scale.set(scaleR, lift * 1.6, scaleR);
            dummy.updateMatrix();
            roots.setMatrixAt(ri++, dummy.matrix);
        }
        const th = 2.5 + noise.rand() * 2.5;
        dummy.position.set(x, base + lift * 0.8, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, th, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(placed, dummy.matrix);
        const w = 3 + noise.rand() * 2.5;
        dummy.position.set(x, base + lift * 0.8 + th, z);
        dummy.rotation.set(0, noise.rand() * 6.28, 0);
        dummy.scale.set(w, w * 0.9, w);
        dummy.updateMatrix();
        crowns.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.30 + noise.rand() * 0.05, 0.4, 0.10 + noise.rand() * 0.06);
        crowns.setColorAt(placed, col);
        placed++;
    }
    roots.count = ri; trunks.count = crowns.count = placed;
    if (placed) crowns.instanceColor.needsUpdate = true;
    const g = new THREE.Group(); g.name = 'mangroves'; g.add(roots, trunks, crowns); scene.add(g);
    return g;
}

function mergeGeos(list) {
    // Tiny local merge (positions + normals only), so Terrain does not depend on addons.
    let n = 0;
    const flat = list.map(g => (g.index ? g.toNonIndexed() : g));
    flat.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of flat) {
        g.computeVertexNormals();
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return out;
}

/** All the vegetation of the cove, planted in one call. */
export function plantCoast(scene) {
    // Casuarina spires along the dune — the silhouette against the stars.
    createCasuarinas(scene, 300, { xMin: -50, xMax: 80, zMin: -200, zMax: 200 }, { minD: 36, maxD: 90 });
    // Low broadleaf canopy behind, and stragglers up the horns.
    createBroadleaf(scene, 520, { xMin: 10, xMax: 180, zMin: -260, zMax: 260 }, { minD: 80, maxD: 220 });
    createBroadleaf(scene, 120, { xMin: -100, xMax: 80, zMin: -250, zMax: 250 }, { minD: 20, maxD: 200 });
    // Mangrove thickets in both corners of the cove, standing in the water.
    createMangroves(scene, 150, [[-170, -105], [100, 168]]);
}

// ─────────────────────────────────────────────────────────────
//  BEACH GRASS
//  Tufts on the dune. Pure set dressing, one draw call, disproportionately effective
//  at stopping the dry sand reading as an empty plane.
// ─────────────────────────────────────────────────────────────

export function plantDuneGrass(scene, count = 2600) {
    const geo = new THREE.ConeGeometry(0.34, 1.15, 3, 1, true);
    geo.translate(0, 0.575, 0);
    const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff, vertexColors: true, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let placed = 0;

    for (let attempt = 0; attempt < count * 4 && placed < count; attempt++) {
        const x = -60 + noise.rand() * 140;
        const z = -230 + noise.rand() * 460;
        const d = x - coastX(z);
        if (d < 26 || d > 110) continue;
        if (isFlattened(x, z, 4)) continue;
        if (headlandAmount(x, z) > 0.4) continue;

        dummy.position.set(x, getTerrainHeight(x, z) - 0.1, z);
        dummy.rotation.set((noise.rand() - 0.5) * 0.35, noise.rand() * 6.28, (noise.rand() - 0.5) * 0.35);
        dummy.scale.set(0.7 + noise.rand() * 0.9, 0.6 + noise.rand() * 1.3, 0.7 + noise.rand() * 0.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        col.setHSL(0.16 + noise.rand() * 0.10, 0.34 + noise.rand() * 0.22, 0.26 + noise.rand() * 0.16);
        mesh.setColorAt(placed, col);
        placed++;
    }
    mesh.count = placed;
    if (placed > 0) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'duneGrass';
    scene.add(mesh);
    return mesh;
}
