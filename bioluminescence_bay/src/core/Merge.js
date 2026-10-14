// Static geometry merging.
//
// WHY THIS EXISTS, measured: the first build of this world ran at 10 fps on an Intel
// iGPU. Ablation put half the cost in the zones — not in their triangles (77k across all
// seven, which is nothing) but in their DRAW CALLS: 2338 meshes, and the flea market
// alone held 742 meshes made of 347 distinct materials, because every stall built its own
// tarp, cloth panels and wares materials with `new`.
//
// So there are two halves to the fix and they only work together:
//   1. Props.plain() hands out CACHED materials, so props that look the same share one
//      material instance (see Props.js). Without that, merging can never group anything.
//   2. mergeStatics() below collapses every static mesh sharing a material into a single
//      buffer per material, baking each mesh's world transform into its vertices.
//
// Anything that animates must be flagged with markDynamic() first, and stays untouched —
// a merged mesh has no individual parts left to move.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Flag a mesh (or a group of them) as animated, so mergeStatics leaves it alone. */
export function markDynamic(obj) {
    obj.userData = obj.userData || {};
    obj.userData.dynamic = true;
    return obj;
}

/**
 * Strip a geometry down to exactly position/normal/uv so merges cannot fail on a
 * mismatched attribute set — hand-built BufferGeometries here often have no uv at all.
 */
function normalise(geo) {
    const g = new THREE.BufferGeometry();
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.attributes.position;
    g.setAttribute('position', pos.clone());
    if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
    else { g.computeVertexNormals(); }
    if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
    else g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    if (src !== geo) src.dispose();
    return g;
}

function hasDynamicAncestor(o, root) {
    let p = o.parent;
    while (p && p !== root.parent) {
        if (p.userData && p.userData.dynamic) return true;
        p = p.parent;
    }
    return false;
}

/**
 * Merge every static mesh in `group` that shares a material. Returns what it did, which
 * is worth logging the first few times you touch a zone.
 */
export function mergeStatics(group, opts = {}) {
    const minRun = opts.min ?? 3;      // below this the bookkeeping costs more than it saves
    group.updateMatrixWorld(true);

    const buckets = new Map();
    group.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSprite) return;
        if (o.userData && o.userData.dynamic) return;
        if (Array.isArray(o.material) || !o.material) return;
        if (!o.geometry || !o.geometry.attributes.position) return;
        if (hasDynamicAncestor(o, group)) return;
        const key = o.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { mat: o.material, list: [] });
        buckets.get(key).list.push(o);
    });

    let mergedMeshes = 0, removedMeshes = 0;

    for (const { mat, list } of buckets.values()) {
        if (list.length < minRun) continue;

        const geos = [];
        let castShadow = false, receiveShadow = false;
        for (const m of list) {
            const g = normalise(m.geometry);
            g.applyMatrix4(m.matrixWorld);
            geos.push(g);
            castShadow = castShadow || m.castShadow;
            receiveShadow = receiveShadow || m.receiveShadow;
        }

        let mergedGeo = null;
        try {
            mergedGeo = mergeGeometries(geos, false);
        } catch (e) {
            mergedGeo = null;
        }
        geos.forEach(g => g.dispose());
        if (!mergedGeo) continue;

        for (const m of list) {
            // The originals' geometries are per-prop and not shared, so disposing them
            // is safe — the MATERIAL is shared and must not be touched.
            if (!m.geometry.userData?.shared) m.geometry.dispose();
            m.parent.remove(m);
            removedMeshes++;
        }

        const merged = new THREE.Mesh(mergedGeo, mat);
        merged.castShadow = castShadow;
        merged.receiveShadow = receiveShadow;
        // Vertices are already in world space, so the mesh itself must sit at the origin.
        merged.matrixAutoUpdate = false;
        merged.updateMatrix();
        group.add(merged);
        mergedMeshes++;
    }

    return { mergedMeshes, removedMeshes };
}
