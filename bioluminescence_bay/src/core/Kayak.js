// KAYAKS — paddle the bay and light it up. Bay, 2026-10-07 (from Devansh's kayak photo:
// "as it moves the lights surround it").
//
// One rideable kayak waits on the sand at Mangrove Creek (E to get in). While you are in
// it, Controls hands the camera to this module (controls.setPilot): W/S paddle forward and
// back, A/D turn, the mouse still looks around, Shift paddles hard. Every stroke dips a
// blade on alternate sides and writes a disturbance into the ocean's trail ring, and the
// bow pushes a continuous wake — the glitter shader thickens its sparks wherever trails
// are, so the kayak sits in a moving cloud of light. E near the shore (or anywhere, to
// roll out and swim) gets you out.
//
// Five NPC paddlers loop the bay on their own slow ellipses, each lighting its own wake.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';
import { ARRIVAL, DJ_RAFT } from './constants.js';

const HULL_COLORS = [0xd8dcd8, 0xe8d24a, 0xe86a2a, 0x2ab8c8, 0xc83a3a];

function plainMat(color, rough = 0.5) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}

/** A sea kayak, nose along +X. Returns { group, paddle, rider|null }. */
function buildKayak(color, withRider) {
    const g = new THREE.Group();
    // Hull: a lathe profile (pointed ends), flattened.
    const prof = [];
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        prof.push(new THREE.Vector2(Math.sin(t * Math.PI) ** 0.7 * 0.36 + 0.001, (t - 0.5) * 4.6));
    }
    const hullGeo = new THREE.LatheGeometry(prof, 14);
    hullGeo.rotateZ(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, plainMat(color, 0.4));
    hull.scale.set(1, 0.55, 1);
    hull.position.y = 0.12;
    hull.castShadow = true;
    g.add(hull);
    // Cockpit rim and dark well.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 16), plainMat(0x1a1a1e, 0.8));
    rim.rotation.x = Math.PI / 2; rim.scale.set(1.5, 1, 1); rim.position.set(-0.15, 0.32, 0);
    g.add(rim);
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14), plainMat(0x0c0c10, 0.9));
    well.rotation.x = -Math.PI / 2; well.scale.set(1.5, 1, 1); well.position.set(-0.15, 0.3, 0);
    g.add(well);
    // Deck bungees, criss-cross on the bow, as in the photo.
    const cord = new THREE.LineBasicMaterial({ color: 0x111111 });
    const pts = [];
    for (let i = 0; i < 4; i++) {
        const x0 = 0.6 + i * 0.35;
        pts.push(new THREE.Vector3(x0, 0.31, -0.2), new THREE.Vector3(x0 + 0.35, 0.31, 0.2));
        pts.push(new THREE.Vector3(x0, 0.31, 0.2), new THREE.Vector3(x0 + 0.35, 0.31, -0.2));
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cord));

    // Paddle: a pivot at chest height, shaft across, blade each end.
    const paddle = new THREE.Group();
    paddle.position.set(-0.05, 0.85, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 6), plainMat(0x222226, 0.6));
    shaft.rotation.x = Math.PI / 2;
    paddle.add(shaft);
    for (const s of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.44), plainMat(0x161618, 0.5));
        blade.position.z = s * 1.18;
        paddle.add(blade);
    }
    g.add(paddle);

    let rider = null;
    if (withRider) {
        rider = new THREE.Group();
        const skin = plainMat(0x6a4a34, 0.8), suit = plainMat(0x12141a, 0.8);
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 3, 8), suit);
        torso.position.set(-0.15, 0.68, 0);
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.46), plainMat(0x2a2e36, 0.8));
        vest.position.set(-0.15, 0.74, 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
        head.position.set(-0.15, 1.12, 0);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), suit);
        hair.position.copy(head.position).add(new THREE.Vector3(0, 0.02, 0));
        rider.add(torso, vest, head, hair);
        g.add(rider);
    }
    return { group: g, paddle, rider };
}

export function createKayaks(scene, { ocean, controls, audio, ui }) {
    const root = new THREE.Group();
    root.name = 'kayaks';
    scene.add(root);

    // ── The rideable ones (2026-10-07 fix: "can't find it / can't get on") ──
    // Two: one mid-beach below the cave, one at Mangrove Creek. Each wears a green glow
    // stick with a halo you can see from up the beach, shows on the minimap, and can be
    // boarded from the sand or while swimming beside it.
    const haloTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const k = c.getContext('2d');
        const g = k.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(200,255,220,1)'); g.addColorStop(0.25, 'rgba(110,255,170,0.45)'); g.addColorStop(1, 'rgba(0,80,40,0)');
        k.fillStyle = g; k.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    })();
    // Glow kit (v2): the rideable boats are LED tour kayaks — a cyan strip along each
    // gunwale and a pool of light thrown down through the hull onto the water.
    const poolTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const k = c.getContext('2d');
        const g = k.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(120,240,255,0.9)'); g.addColorStop(0.5, 'rgba(40,180,255,0.35)'); g.addColorStop(1, 'rgba(0,40,80,0)');
        k.fillStyle = g; k.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    })();
    function addGlowKit(group) {
        const led = new THREE.MeshBasicMaterial({ color: 0x5ae8ff, fog: false });
        for (const sz of [-1, 1]) {
            const pts = [];
            for (let i = 0; i <= 12; i++) {
                const t = i / 12, x = (t - 0.5) * 4.2;
                pts.push(new THREE.Vector3(x, 0.27, sz * (Math.sin(t * Math.PI) ** 0.7 * 0.34)));
            }
            const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 4), led);
            group.add(tube);
        }
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.2), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.02;
        pool.renderOrder = 3;
        group.add(pool);
        return pool;
    }
    function addGlowStick(group) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6),
            new THREE.MeshBasicMaterial({ color: 0x8dffbe, fog: false }));
        stick.position.set(1.4, 0.55, 0);
        group.add(stick);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x9dffc8, transparent: true,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        halo.scale.set(2.2, 2.2, 1);
        halo.position.set(1.4, 0.6, 0);
        group.add(halo);
        return halo;
    }

    const boats = [];
    for (const homeZ of [-14, ARRIVAL.z - 14]) {
        const homeX = shoreX(homeZ) + 1.2;
        const k = buildKayak(boats.length ? 0x2ab8c8 : 0xe8d24a, false);
        k.halo = addGlowStick(k.group);
        k.pool = addGlowKit(k.group);
        root.add(k.group);
        const b = { k, homeX, homeZ, x: homeX, z: homeZ, heading: Math.PI, speed: 0, strokeT: 0, side: 1, idleT: undefined };
        boats.push(b);
        const prompt = 'E  TAKE THE KAYAK OUT';
        // Two interactables per boat — Controls only offers 'swim' ones while swimming.
        for (const swim of [false, true]) {
            b['it' + swim] = controls.addInteractable({
                x: b.x, z: b.z, radius: 5, prompt, swim,
                enabled: () => me !== b,
                onInteract: () => startPaddling(b),
                owner: 'kayak',
            });
        }
    }
    let me = null;          // the boat you are in
    let mine = null;        // its mesh bundle
    const craft = () => boats.filter(b => b !== me);

    function placeIdle(b, t) {
        const g = getTerrainHeight(b.x, b.z), sea = ocean.getSeaLevel();
        const y = g < sea ? ocean.surfaceY(b.x, b.z, t) - 0.08 : g - 0.05;
        b.k.group.position.set(b.x, y, b.z);
        b.k.group.rotation.set(0, -b.heading, 0);
        b.itfalse.x = b.ittrue.x = b.x;
        b.itfalse.z = b.ittrue.z = b.z;
    }

    const EYE = 0.95;
    let nowT = 0;
    const fwd = new THREE.Vector3();

    const pilot = {
        prompt() {
            const depth = ocean.depthAt(me.x, me.z);
            return depth < 0.9 ? 'E  GET OUT   ·   W/S PADDLE   ·   A/D TURN'
                : 'W/S PADDLE   ·   A/D TURN   ·   SHIFT HARD   ·   E ROLL OUT AND SWIM';
        },
        interact() { stopPaddling(); },
        step(dt, keys) {
            const time = nowT;
            const thrust = (keys['w'] ? 1 : 0) - (keys['s'] ? 0.6 : 0);
            const turn = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);   // +heading swings toward the camera's right
            const hard = !!(keys['shift'] || keys['ShiftLeft'] || keys['ShiftRight']);
            // v2 (2026-10-07, "go faster on shift"): sprint is nearly twice cruise.
            const maxV = hard ? 10.5 : 5.2;
            me.speed += thrust * (hard ? 6.5 : 2.8) * dt;
            me.speed *= Math.exp(-dt * 0.55);                     // glide, then drag
            me.speed = THREE.MathUtils.clamp(me.speed, -1.8, maxV);
            const dHead = turn * (0.9 + Math.abs(me.speed) * 0.12) * dt;
            me.heading += dHead;

            fwd.set(Math.cos(me.heading), 0, Math.sin(me.heading));
            let nx = me.x + fwd.x * me.speed * dt, nz = me.z + fwd.z * me.speed * dt;
            // Run aground in the shallows; nose off the raft.
            if (ocean.depthAt(nx, nz) < 0.18 && me.speed > 0) { me.speed *= 0.3; nx = me.x; nz = me.z; }
            const rdx = nx - DJ_RAFT.x, rdz = nz - DJ_RAFT.z, rd = Math.hypot(rdx, rdz);
            if (rd < 8.5) { nx = DJ_RAFT.x + rdx / rd * 8.5; nz = DJ_RAFT.z + rdz / rd * 8.5; me.speed *= 0.6; }
            me.x = nx; me.z = nz;

            // Ride the swell: height plus a little pitch/roll from the surface slope.
            const y = ocean.surfaceY(me.x, me.z, time);
            const yF = ocean.surfaceY(me.x + fwd.x, me.z + fwd.z, time);
            const yS = ocean.surfaceY(me.x - fwd.z * 0.6, me.z + fwd.x * 0.6, time);
            mine.group.position.set(me.x, y - 0.08, me.z);
            mine.group.rotation.set(0, 0, 0);
            mine.group.rotateY(-me.heading);
            mine.group.rotateZ(Math.atan2(yF - y, 1) * 0.8);
            mine.group.rotateX(Math.atan2(yS - y, 0.6) * 0.6);

            // Strokes: alternate sides; each dip lights the water beside the hull.
            const paddling = Math.abs(thrust) > 0 || Math.abs(turn) > 0;
            if (paddling) me.strokeT += dt * (hard ? 1.9 : 1.35);
            const ph = me.strokeT * Math.PI * 2;
            mine.paddle.rotation.set(Math.sin(ph) * 0.55, 0, Math.cos(ph) * 0.18);
            const side = Math.sin(ph) > 0 ? 1 : -1;
            if (paddling && side !== me.side) {
                me.side = side;
                const bx = me.x + fwd.x * 0.4 - fwd.z * side * 1.2, bz = me.z + fwd.z * 0.4 + fwd.x * side * 1.2;
                ocean.splash(bx, bz, hard ? 2.2 : 1.6, side > 0 ? 'kayakL' : 'kayakR', 0.25);
                audio.sfx?.('splash', { gain: 0.12 });
            }
            // Bow wake and the swirl behind.
            if (Math.abs(me.speed) > 0.6) {
                ocean.splash(me.x + fwd.x * 2.0, me.z + fwd.z * 2.0, 0.6 + Math.abs(me.speed) * 0.15, 'kayakBow', 0.18);
                ocean.splash(me.x - fwd.x * 2.2, me.z - fwd.z * 2.2, 0.5 + Math.abs(me.speed) * 0.12, 'kayakStern', 0.3);
            }
            // yaw runs the opposite way to heading (yaw = atan2(-cos h, -sin h)).
            return { x: me.x - fwd.x * 0.15, y: y + EYE, z: me.z - fwd.z * 0.15, turn: -dHead };
        },
    };

    function startPaddling(b) {
        me = b; mine = b.k;
                me.speed = 0;
        me.idleT = undefined;
        // Push the boat off: start it in water just seaward of where it sat.
        let x = me.x;
        for (let i = 0; i < 30 && ocean.depthAt(x, me.z) < 0.45; i++) x -= 0.5;
        me.x = x;
        controls.setPilot(pilot, Math.atan2(-Math.cos(me.heading), -Math.sin(me.heading)));
        ui.toast('IN THE KAYAK — W to paddle');
    }

    function stopPaddling() {
        const depth = ocean.depthAt(me.x, me.z);
        controls.clearPilot(me.x - Math.sin(me.heading) * 1.2, me.z + Math.cos(me.heading) * 1.2, depth > 1.2);
        ui.toast(depth > 1.2 ? 'IN THE WATER' : 'ON FOOT');
        // Leave it where you left it; it drifts back home after a while.
        me.idleT = 0;
        me = null; mine = null;
    }

    // ── NPC paddlers ──
    const npcs = [];
    const loops = [
        { cx: -95, cz: 10, rx: 30, rz: 60, speed: 0.032 },
        { cx: -80, cz: 90, rx: 22, rz: 30, speed: -0.045 },
        { cx: -140, cz: -24, rx: 16, rz: 26, speed: 0.038 },   // moved off the surf break
        { cx: -60, cz: 120, rx: 14, rz: 20, speed: 0.06 },
        { cx: -120, cz: 60, rx: 34, rz: 22, speed: -0.03 },
    ];
    loops.forEach((L, i) => {
        const k = buildKayak(HULL_COLORS[i % HULL_COLORS.length], true);
        root.add(k.group);
        npcs.push({ k, L, a: Math.random() * Math.PI * 2, ph: Math.random() * 6, src: 'npcKayak' + i });
    });

    function update(ctx) {
        nowT = ctx.time;
        const t = ctx.time, dt = Math.min(ctx.delta, 0.05);
        for (const b of boats) {
            b.k.halo.material.opacity = 0.55 + 0.45 * Math.sin(t * 2.0 + b.homeZ);
            if (b === me) continue;
            placeIdle(b, t);
            if (b.idleT !== undefined) {
                b.idleT += dt;
                // Drifts home after a minute untouched, so the next swim finds it.
                if (b.idleT > 60) { b.x = b.homeX; b.z = b.homeZ; b.heading = Math.PI; b.idleT = undefined; }
            }
        }
        for (let i = 0; i < npcs.length; i++) {
            const n = npcs[i], L = n.L;
            n.a += L.speed * dt * 3;
            let x = L.cx + Math.cos(n.a) * L.rx, z = L.cz + Math.sin(n.a) * L.rz;
            // tangent → heading
            const tx = -Math.sin(n.a) * L.rx * Math.sign(L.speed), tz = Math.cos(n.a) * L.rz * Math.sign(L.speed);
            const head = Math.atan2(tz, tx);
            if (ocean.depthAt(x, z) < 0.6) { x -= 6; }               // never beach
            const y = ocean.surfaceY(x, z, t);
            n.k.group.position.set(x, y - 0.08, z);
            n.k.group.rotation.set(0, -head, 0);
            n.ph += dt * 1.2;
            const ph = n.ph * Math.PI * 2;
            n.k.paddle.rotation.set(Math.sin(ph) * 0.55, 0, Math.cos(ph) * 0.18);
            const side = Math.sin(ph) > 0 ? 1 : -1;
            if (side !== n.side) {
                n.side = side;
                const fx = Math.cos(head), fz = Math.sin(head);
                ocean.splash(x - fz * side * 1.2, z + fx * side * 1.2, 1.3, n.src, 0.4);
            }
        }
    }

    function contextCard(camX, camZ) {
        if (me) return { title: 'KAYAK', sub: 'Every stroke lights the water. Paddle out to the raft, or along the shore.',
            rows: [['W / ↑', 'Paddle'], ['S / ↓', 'Back paddle'], ['A D / ← →', 'Turn'], ['SHIFT', 'Sprint paddle'], ['E', ocean.depthAt(me.x, me.z) < 0.9 ? 'Get out' : 'Roll out and swim']],
            stat: `${(Math.abs(me.speed) * 3.6).toFixed(0)} km/h` };
        for (const b of boats) {
            const dx = camX - b.x, dz = camZ - b.z;
            if (dx * dx + dz * dz < 18 * 18) return { title: 'KAYAK', sub: 'Look for the green glow stick.',
                rows: [['E', 'Get in (next to it)'], ['W / ↑', 'Paddle'], ['A D / ← →', 'Turn'], ['SHIFT', 'Sprint']] };
        }
        return null;
    }

    return { update, isPaddling: () => !!me, craft, contextCard };
}
