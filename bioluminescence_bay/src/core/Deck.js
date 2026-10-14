// Copied from atlantis/src/yacht/Deck.js on 2026-10-07 (BAY M2) — copied, not imported;
// Atlantis is untouched. Only change: the jump reads `api.jump` (a one-frame edge from
// Controls) instead of Atlantis's `api.pressed` set. Original header follows.
//
// Walking on a moving deck (CLAUDE.md §17.2). You live in the YACHT'S frame: position,
// velocity, floors and walls are all local, so the boat carries you and turns your view
// with it for free. Only when you go over the side do you become a world-space swimmer.
//
// floors: {kind:'rect'|'ramp'|'main'} (Yacht.js) — the floor is sampled AFTER the move,
//         across the footprint (root §4), stairs are ramps under the treads.
// walls:  segments with a y-range, or circles; a wall with a `gate` is open while that
//         gate is open (the dive gates, open only when the boat is stopped).

const EYE = 1.7, R = 0.3, GRAVITY = 22, JUMP = 4.5, STEP_UP = 0.6, SNAP = 0.45;
const WALK = 3.0, RUN = 5.6;

export function createDeck({ floors, walls }) {
    const p = { x: 0, y: 0, z: 0 };       // feet, local
    const v = { x: 0, y: 0, z: 0 };
    let grounded = true;

    function inside(f, x, z) {
        if (f.kind === 'rect') return x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1;
        if (f.kind === 'ramp') return x >= f.x0 && x <= f.x1 && z >= Math.min(f.zA, f.zB) && z <= Math.max(f.zA, f.zB);
        return f.inside(x, z);
    }
    function yOf(f, x, z) {
        if (f.kind === 'rect') return f.y;
        if (f.kind === 'ramp') return f.yA + (f.yB - f.yA) * ((z - f.zA) / (f.zB - f.zA));
        return f.y(x, z);
    }
    function floorAt(x, z, maxY) {
        let best = -Infinity;
        for (const f of floors) {
            if (!inside(f, x, z)) continue;
            const y = yOf(f, x, z);
            if (y <= maxY && y > best) best = y;
        }
        return best;
    }
    function floorUnder(x, z, maxY) {
        let b = floorAt(x, z, maxY);
        const k = R * 0.7;
        for (const [dx, dz] of [[k, 0], [-k, 0], [0, k], [0, -k]]) b = Math.max(b, floorAt(x + dx, z + dz, maxY));
        return b;
    }

    function resolve(px, pz, gates) {
        const feet = p.y;
        for (let pass = 0; pass < 2; pass++) {
            for (const w of walls) {
                if (feet + 1.6 < w.y0 || feet + 0.1 > w.y1) continue;
                if (w.gate && gates[w.gate]) continue;
                if (w.circle) {
                    const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
                    if (d < w.r + R && d > 1e-5) { p.x = w.x + (dx / d) * (w.r + R); p.z = w.z + (dz / d) * (w.r + R); }
                    continue;
                }
                const ex = w.bx - w.ax, ez = w.bz - w.az, len2 = ex * ex + ez * ez;
                if (len2 < 1e-8) continue;
                const len = Math.sqrt(len2), nx = -ez / len, nz = ex / len;
                // Which side you were on at the start of the frame: a push must never shove
                // you through a thin rail to its far side (the Dome's ring-wall lesson).
                const sPrev = Math.sign((px - w.ax) * nx + (pz - w.az) * nz) || 1;
                const t = Math.max(0, Math.min(1, ((p.x - w.ax) * ex + (p.z - w.az) * ez) / len2));
                const cx = w.ax + ex * t, cz = w.az + ez * t;
                const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
                const sNow = Math.sign(dx * nx + dz * nz) || sPrev;
                if (t > 0 && t < 1 && sNow !== sPrev) {
                    p.x = cx + nx * sPrev * R; p.z = cz + nz * sPrev * R;       // crossed: put back
                } else if (d < R) {
                    const ux = d > 1e-5 ? dx / d : nx * sPrev, uz = d > 1e-5 ? dz / d : nz * sPrev;
                    p.x = cx + ux * R; p.z = cz + uz * R;
                }
            }
        }
    }

    /** One frame of walking. Returns 'fell' once you are below the waterline. */
    function step(dt, api, gates) {
        const k = api.keys;
        const yaw = api.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        let ax = 0, az = 0;
        if (k.KeyW || k.ArrowUp) { ax += fx; az += fz; }
        if (k.KeyS || k.ArrowDown) { ax -= fx; az -= fz; }
        if (k.KeyD || k.ArrowRight) { ax += rx; az += rz; }
        if (k.KeyA || k.ArrowLeft) { ax -= rx; az -= rz; }
        const n = Math.hypot(ax, az);
        const sp = k.ShiftLeft || k.ShiftRight ? RUN : WALK;
        if (n > 0) { ax = (ax / n) * sp; az = (az / n) * sp; }
        const kk = grounded ? 12 : 2;
        v.x += (ax - v.x) * Math.min(1, dt * kk);
        v.z += (az - v.z) * Math.min(1, dt * kk);
        const px = p.x, pz = p.z, feetBefore = p.y;
        // Stair magnetism: walking onto the foot (or the head) of a flight eases you sideways into
        // its clear middle, so stepping on near one edge can't catch a guard's end. Measured:
        // boarding stair 2 from the cockpit climbed on only 3 of 12 approaches without this.
        for (const f of floors) {
            if (f.kind !== 'ramp' || p.x < f.x0 - 0.45 || p.x > f.x1 + 0.45) continue;
            const dir = Math.sign(f.zB - f.zA), len = Math.abs(f.zB - f.zA);
            const s = (p.z - f.zA) * dir, along = v.z * dir;
            const atFoot = s > -0.9 && s < 1.5 && Math.abs(p.y - f.yA) < 0.75 && along > 0.5;
            const atHead = s > len - 1.5 && s < len + 0.9 && Math.abs(p.y - f.yB) < 0.75 && along < -0.5;
            if (!atFoot && !atHead) continue;
            const tx = Math.min(f.x1 - 0.34, Math.max(f.x0 + 0.34, p.x));
            p.x += Math.sign(tx - p.x) * Math.min(Math.abs(tx - p.x), 2.4 * dt);
        }
        v.y -= GRAVITY * dt;
        p.x += v.x * dt; p.z += v.z * dt; p.y += v.y * dt;
        resolve(px, pz, gates);
        const floor = floorUnder(p.x, p.z, Math.max(feetBefore, p.y) + STEP_UP);
        const wasGrounded = grounded;
        grounded = false;
        if (floor > -Infinity) {
            if (p.y <= floor || (wasGrounded && v.y <= 0 && p.y - floor < SNAP)) {
                p.y = floor; v.y = 0; grounded = true;
            }
        }
        if (grounded && api.jump) v.y = JUMP;
        return p.y < -0.35 ? 'fell' : null;
    }

    return {
        p, v, step, floorAt,
        place(x, y, z) { p.x = x; p.y = y; p.z = z; v.x = v.y = v.z = 0; grounded = true; },
        get grounded() { return grounded; },
        EYE,
    };
}
