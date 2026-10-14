// Obstacle registry with smooth push-out resolution.
//
// Two shapes only — circles for towers, stupas, trees and vehicles; AABBs for stages
// and stalls. The resolver pushes the player out along the shortest axis and cancels
// the velocity component heading into the surface, so you slide along walls instead of
// sticking to them.
//
// PLAYER_RADIUS is passed in rather than imported: a silent `undefined` here turns every
// radial test into NaN and collision fails without a single error in the console.

export function createCollisionSystem() {
    const staticObstacles = [];
    let dynamicObstacles = [];

    function registerCircle(x, z, r, label = '') {
        staticObstacles.push({ type: 'circle', x, z, r, label });
    }

    function registerAABB(minX, minZ, maxX, maxZ, label = '') {
        staticObstacles.push({ type: 'aabb', minX, minZ, maxX, maxZ, label });
    }

    /** Convenience: an axis-aligned box given its centre and half-extents. */
    function registerBox(cx, cz, halfX, halfZ, label = '') {
        registerAABB(cx - halfX, cz - halfZ, cx + halfX, cz + halfZ, label);
    }

    function clearDynamic() { dynamicObstacles = []; }

    function registerDynamicCircle(x, z, r, label = '') {
        dynamicObstacles.push({ type: 'circle', x, z, r, label });
    }

    /** Drop everything registered by a zone that has just been unloaded. */
    function unregisterByLabel(label) {
        for (let i = staticObstacles.length - 1; i >= 0; i--) {
            if (staticObstacles[i].label === label) staticObstacles.splice(i, 1);
        }
    }

    function _resolveCircle(position, velocity, radius, obs) {
        const dx = position.x - obs.x;
        const dz = position.z - obs.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = obs.r + radius;
        if (dist >= minDist) return false;

        // Dead centre: nudge out along +X rather than dividing by zero.
        if (dist < 0.0001) {
            position.x += minDist;
            return true;
        }
        const pen = minDist - dist;
        const nx = dx / dist, nz = dz / dist;
        position.x += nx * pen;
        position.z += nz * pen;

        const vDotN = velocity.x * nx + velocity.z * nz;
        if (vDotN < 0) { velocity.x -= vDotN * nx; velocity.z -= vDotN * nz; }
        return true;
    }

    function _resolveAABB(position, velocity, radius, obs) {
        const px = position.x, pz = position.z;
        const minX = obs.minX - radius, maxX = obs.maxX + radius;
        const minZ = obs.minZ - radius, maxZ = obs.maxZ + radius;
        if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) return false;

        const left = px - minX, right = maxX - px;
        const back = pz - minZ, front = maxZ - pz;
        const m = Math.min(left, right, back, front);

        if (m === left) { position.x = minX; if (velocity.x > 0) velocity.x = 0; }
        else if (m === right) { position.x = maxX; if (velocity.x < 0) velocity.x = 0; }
        else if (m === back) { position.z = minZ; if (velocity.z > 0) velocity.z = 0; }
        else { position.z = maxZ; if (velocity.z < 0) velocity.z = 0; }
        return true;
    }

    /**
     * Push `position` (a Vector3, mutated in place) out of every overlapping obstacle.
     * Three passes so corners resolve cleanly. Returns { hit }.
     */
    function resolve(position, velocity, radius) {
        if (typeof radius !== 'number' || !isFinite(radius)) {
            console.warn('CollisionSystem.resolve: bad radius', radius);
            return { hit: false };
        }
        let anyHit = false;
        for (let pass = 0; pass < 3; pass++) {
            let hit = false;
            for (let i = 0; i < staticObstacles.length; i++) {
                const o = staticObstacles[i];
                if (o.type === 'circle') hit = _resolveCircle(position, velocity, radius, o) || hit;
                else hit = _resolveAABB(position, velocity, radius, o) || hit;
            }
            for (let i = 0; i < dynamicObstacles.length; i++) {
                hit = _resolveCircle(position, velocity, radius, dynamicObstacles[i]) || hit;
            }
            if (hit) anyHit = true; else break;
        }
        return { hit: anyHit };
    }

    return {
        registerCircle, registerAABB, registerBox,
        clearDynamic, registerDynamicCircle, unregisterByLabel,
        resolve,
        getAll: () => staticObstacles.concat(dynamicObstacles),
        count: () => staticObstacles.length + dynamicObstacles.length,
    };
}
