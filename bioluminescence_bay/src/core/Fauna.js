// The living coast: beach dogs, crows overhead, crabs on the wet sand, and a pod of
// dolphins offshore that you mostly see at dusk.
//
// None of this is interactive and none of it takes a light. It is here because a beach
// with nothing alive on it reads as a rendering.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';
import { DJ_RAFT as DJ_RAFT_C } from './constants.js';

// ─────────────────────────────────────────────────────────────
//  BUILDERS
// ─────────────────────────────────────────────────────────────

function buildDog() {
    const g = new THREE.Group();
    const fur = new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(0.08, 0.35, 0.28 + Math.random() * 0.25),
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 7), fur);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.45;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.19, 0.18), fur);
    head.position.set(0.44, 0.55, 0);
    g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.11), fur);
    snout.position.set(0.6, 0.51, 0);
    g.add(snout);
    for (const sz of [-0.07, 0.07]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), fur);
        ear.position.set(0.4, 0.68, sz);
        g.add(ear);
    }
    const legs = [];
    for (const lx of [0.24, -0.24]) {
        for (const lz of [0.12, -0.12]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.42, 4), fur);
            leg.position.set(lx, 0.21, lz);
            g.add(leg);
            legs.push(leg);
        }
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.34, 4), fur);
    tail.position.set(-0.44, 0.56, 0);
    tail.rotation.z = -0.9;
    g.add(tail);
    g.userData = { legs, tail };
    return g;
}

function buildBird() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x181820, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 3, 6), mat);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const wings = [];
    for (const side of [-1, 1]) {
        const wingGeo = new THREE.BufferGeometry();
        wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(
            [0, 0, 0, -0.22, 0, side * 0.85, 0.2, 0, side * 0.5], 3));
        wingGeo.setIndex([0, 1, 2]);
        wingGeo.computeVertexNormals();
        const w = new THREE.Mesh(wingGeo, mat);
        g.add(w);
        wings.push(w);
    }
    g.userData = { wings };
    return g;
}

function buildDolphin() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x53616e, roughness: 0.35, metalness: 0.12 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xb8bfc4, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.7, 5, 10), skin);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const under = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.3, 4, 8), belly);
    under.rotation.z = Math.PI / 2;
    under.position.y = -0.22;
    g.add(under);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 7), skin);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(1.32, -0.03, 0);
    g.add(beak);

    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 4), skin);
    dorsal.position.set(-0.05, 0.5, 0);
    dorsal.rotation.z = -0.4;
    dorsal.scale.z = 0.34;
    g.add(dorsal);

    // Tail stock + fluke on a pivot so the tail beats (2026-10-09).
    const tail = new THREE.Group();
    tail.position.set(-1.05, 0, 0);
    const stock = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 3, 8), skin);
    stock.rotation.z = Math.PI / 2; stock.position.x = -0.15;
    tail.add(stock);
    const fluke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), skin);
    fluke.scale.set(0.32, 0.05, 1.0);
    fluke.position.set(-0.5, 0, 0);
    tail.add(fluke);
    g.add(tail);
    g.userData.tail = tail;

    // Plankton glow: a soft shell lit by the water rushing over the skin. Shown only while
    // the dolphin is under (that is when a real one in a bio bay lights up).
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x46e6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false });
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.3, 4, 10), glowMat);
    shell.rotation.z = Math.PI / 2; shell.position.x = -0.1; shell.scale.set(1, 1, 0.9);
    g.add(shell);
    g.userData.glow = glowMat;

    for (const side of [-1, 1]) {
        const flipper = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), skin);
        flipper.position.set(0.5, -0.24, side * 0.32);
        flipper.rotation.set(0, 0, -0.9);
        flipper.scale.z = 0.3;
        g.add(flipper);
    }
    return g;
}

// ─────────────────────────────────────────────────────────────
//  SYSTEM
// ─────────────────────────────────────────────────────────────

export function createFauna(scene, ocean, audio) {
    const group = new THREE.Group();
    group.name = 'fauna';
    scene.add(group);

    // ── Dogs ──
    const dogs = [];
    for (let i = 0; i < 11; i++) {
        const mesh = buildDog();
        const z = -140 + Math.random() * 420;
        const x = shoreX(z) + 14 + Math.random() * 40;
        mesh.position.set(x, getTerrainHeight(x, z), z);
        group.add(mesh);
        dogs.push({
            mesh, x, z,
            heading: Math.random() * Math.PI * 2,
            speed: 0,
            timer: Math.random() * 8,
            asleep: Math.random() > 0.55,
            phase: Math.random() * 10,
        });
    }

    // ── Crows and kites ──
    const birds = [];
    for (let i = 0; i < 16; i++) {
        const mesh = buildBird();
        group.add(mesh);
        birds.push({
            mesh,
            cx: -40 + Math.random() * 120,
            cz: -220 + Math.random() * 480,
            radius: 14 + Math.random() * 40,
            height: 22 + Math.random() * 34,
            speed: 0.18 + Math.random() * 0.3,
            phase: Math.random() * 10,
            flap: 4 + Math.random() * 5,
            // Kites soar; crows flap. Half and half.
            soars: Math.random() > 0.5,
        });
    }

    // ── Dolphins ──
    // A pod running north along the deep water. Loops the length of the coast.
    const dolphins = [];
    for (let i = 0; i < 5; i++) {
        const mesh = buildDolphin();
        group.add(mesh);
        dolphins.push({
            mesh,
            // Bay: they circle the cove on an ellipse round the raft instead of running a
            // straight coast, which in a closed bay would take them through the horns.
            a: i * 0.22 + Math.random() * 0.1,
            z: 0, x: -110,
            phase: i * 0.6 + Math.random(),
            speed: 8 + Math.random() * 1.5,
            // leap cycle (2026-10-09): cruise under, then a real ballistic leap
            leapT: -1, nextLeap: 1.5 + i * 0.7 + Math.random() * 3, beat: Math.random() * 6,
            lane: (Math.random() - 0.5) * 6,
        });
    }

    // ── Sea turtles: slow, close to the surface between the raft and the shallows ──
    const turtles = [];
    function buildTurtle() {
        const g = new THREE.Group();
        const shellM = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, emissive: 0x0a1410 });
        const skinM = new THREE.MeshStandardMaterial({ color: 0x7a8a6a, roughness: 0.7, emissive: 0x0a120c });
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), shellM); shell.scale.set(1.15, 0.32, 0.9); g.add(shell);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skinM); head.position.set(0.74, 0.02, 0); head.scale.set(1.3, 0.8, 0.9); g.add(head);
        const fl = [];
        for (const [x, z, s] of [[0.32, 0.5, 1], [0.32, -0.5, 1], [-0.45, 0.38, 0.55], [-0.45, -0.38, 0.55]]) {
            const piv = new THREE.Group(); piv.position.set(x, -0.02, z);
            const f = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 8, 4), skinM);
            f.scale.set(0.5, 0.1, 1.4); f.position.z = Math.sign(z) * 0.3 * s; piv.add(f); g.add(piv); fl.push(piv);
        }
        const glowM = new THREE.MeshBasicMaterial({ color: 0x46e6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false });
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), glowM); halo.scale.set(1.3, 0.35, 1.15); g.add(halo);
        g.userData = { fl, glow: glowM };
        return g;
    }
    for (let i = 0; i < 4; i++) {
        const mesh = buildTurtle();
        group.add(mesh);
        turtles.push({ mesh, cx: -48 - Math.random() * 30, cz: [-12, 14, 80, 104][i], r: 9 + Math.random() * 8,
            a: Math.random() * 6.28, w: (0.05 + Math.random() * 0.03) * (i % 2 ? 1 : -1), bob: Math.random() * 6 });
    }

    // ── A school of small glowing fish: instanced, schooling round a drifting centre ──
    const FISH = 70;
    const fishGeo = new THREE.ConeGeometry(0.07, 0.34, 5); fishGeo.rotateZ(-Math.PI / 2);
    const fishMat = new THREE.MeshBasicMaterial({ color: 0x7ff4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const fish = new THREE.InstancedMesh(fishGeo, fishMat, FISH);
    fish.frustumCulled = false;
    group.add(fish);
    const fishData = [];
    for (let i = 0; i < FISH; i++) fishData.push({ r: 1.5 + Math.random() * 3.5, a: Math.random() * 6.28, y: Math.random() * 0.8, sp: 1.2 + Math.random() * 0.6, ph: Math.random() * 6 });

    // ── Crabs ──
    // Instanced. They live on the wet sand and they scatter from you.
    const CRABS = 110;
    const crabGeo = new THREE.SphereGeometry(0.11, 6, 5);
    crabGeo.scale(1.25, 0.55, 1);
    const crabs = new THREE.InstancedMesh(
        crabGeo, new THREE.MeshLambertMaterial({ color: 0xb8916a }), CRABS);
    crabs.frustumCulled = false;
    group.add(crabs);

    const crabData = [];
    for (let i = 0; i < CRABS; i++) {
        const z = -220 + Math.random() * 500;
        crabData.push({
            x: shoreX(z) + 2 + Math.random() * 12, z,
            heading: Math.random() * Math.PI * 2,
            speed: 0, timer: Math.random() * 5,
        });
    }

    const dummy = new THREE.Object3D();
    const swA = [], swK = [];
    let gullTimer = 6;

    function update(ctx) {
        const dt = Math.min(ctx.delta, 0.05);
        const t = ctx.time;
        const night = ctx.night ?? 0;
        const camX = ctx.camera.position.x, camZ = ctx.camera.position.z;
        const seaLevel = ocean.getSeaLevel();

        // ── dogs ──
        for (let i = 0; i < dogs.length; i++) {
            const d = dogs[i];
            d.timer -= dt;
            if (d.timer <= 0) {
                d.asleep = Math.random() > 0.45;
                d.timer = d.asleep ? 10 + Math.random() * 20 : 3 + Math.random() * 6;
                d.heading += (Math.random() - 0.5) * 2.6;
            }
            d.speed = THREE.MathUtils.lerp(d.speed, d.asleep ? 0 : 2.6, dt * 2.4);

            const shore = shoreX(d.z);
            if (d.x < shore + 6) d.heading = Math.atan2(1, 0.3);
            if (d.x > shore + 60) d.heading = Math.atan2(-1, 0.3);
            if (Math.abs(d.z) > 275) d.heading = Math.atan2(0.2, -Math.sign(d.z));

            d.x += Math.sin(d.heading) * d.speed * dt;
            d.z += Math.cos(d.heading) * d.speed * dt;
            const gy = getTerrainHeight(d.x, d.z);
            d.mesh.position.set(d.x, gy, d.z);
            d.mesh.rotation.y = d.heading - Math.PI / 2;
            // Asleep is not a pose we model; it is a dog lying on its side.
            d.mesh.rotation.z = d.asleep && d.speed < 0.2 ? Math.PI / 2 - 0.15 : 0;
            d.mesh.position.y = gy - (d.asleep && d.speed < 0.2 ? 0.22 : 0);

            const stride = t * 6 + d.phase;
            const ud = d.mesh.userData;
            for (let l = 0; l < ud.legs.length; l++) {
                ud.legs[l].rotation.x = Math.sin(stride + l * 1.6) * 0.5 * (d.speed > 0.2 ? 1 : 0);
            }
            ud.tail.rotation.x = Math.sin(t * 5 + d.phase) * (d.speed > 0.2 ? 0.5 : 0.12);
        }

        // ── birds ── (gone at night; they roost like everything else)
        const birdsOut = night < 0.55;
        for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            b.mesh.visible = birdsOut;
            if (!birdsOut) continue;
            const a = t * b.speed + b.phase;
            const bx = b.cx + Math.cos(a) * b.radius;
            const bz = b.cz + Math.sin(a) * b.radius;
            b.mesh.position.set(bx, b.height + Math.sin(t * 0.4 + b.phase) * 3, bz);
            b.mesh.rotation.y = -a + Math.PI / 2;
            b.mesh.rotation.z = 0.3;
            const flap = b.soars ? 0.1 : Math.sin(t * b.flap + b.phase) * 0.75;
            b.mesh.userData.wings[0].rotation.x = flap;
            b.mesh.userData.wings[1].rotation.x = -flap;
        }
        gullTimer -= dt;
        if (gullTimer <= 0) {
            gullTimer = 14 + Math.random() * 26;
            if (birdsOut && Math.random() > 0.4) audio.sfx('gull', { gain: 0.22 });
        }

        // ── dolphins (v2, 2026-10-09) ──
        // Cruise just under, tail beating, lit by plankton; every few seconds each one throws
        // a real ballistic leap (nose up out, nose down in) with a splash at both ends.
        const G = 9.8, LEAP = 1.05;
        swA.length = 0; swK.length = 0;
        for (let i = 0; i < dolphins.length; i++) {
            const d = dolphins[i];
            d.a += d.speed * dt / 75;
            const rx = 30 + d.lane, rz = 112 + d.lane;
            d.x = -112 + Math.cos(d.a) * rx;
            d.z = Math.sin(d.a) * rz;
            const surface = ocean.surfaceY(d.x, d.z, t);
            let y, pitch;
            d.beat += dt * (d.leapT >= 0 ? 4 : 7);
            if (d.leapT < 0) {
                d.nextLeap -= dt;
                y = surface - 0.9 + Math.sin(d.beat * 0.5) * 0.12;
                pitch = Math.cos(d.beat * 0.5) * 0.06;
                if (d.nextLeap <= 0) { d.leapT = 0; if (night > 0.3) ocean.splash(d.x, d.z, 1.6, 'fauna'); }
            } else {
                d.leapT += dt;
                const v0 = G * LEAP / 2;
                const vy = v0 - G * d.leapT;
                y = surface - 0.7 + v0 * d.leapT - 0.5 * G * d.leapT * d.leapT;
                pitch = Math.atan2(vy, d.speed) * 0.9;
                if (d.leapT >= LEAP) {
                    d.leapT = -1; d.nextLeap = 2.5 + Math.random() * 5;
                    ocean.splash(d.x, d.z, 2.2, 'fauna', 0);
                }
            }
            d.mesh.position.set(d.x, y, d.z);
            d.mesh.rotation.set(0, Math.atan2(-Math.cos(d.a) * rz, -Math.sin(d.a) * rx), pitch);
            d.mesh.userData.tail.rotation.z = Math.sin(d.beat) * 0.35;
            const under = THREE.MathUtils.clamp((surface - y) / 0.5, 0, 1);
            d.mesh.userData.glow.opacity = night * under * (0.22 + 0.08 * Math.sin(d.beat * 2));
            {   // streak of lit plankton on the surface above it (Ocean uSwim)
                const hx = -Math.sin(d.a) * rx, hz = Math.cos(d.a) * rz, hl = Math.hypot(hx, hz) || 1;
                swA.push(d.x, d.z, hx / hl * 2.6, hz / hl * 2.6); swK.push(under * 1.15);
            }
            // a wake of light while running just under the surface
            if (night > 0.4 && under > 0.5 && Math.random() < dt * 5) ocean.splash(d.x, d.z, 0.9, 'fauna');
        }

        // ── turtles ──
        for (const tu of turtles) {
            tu.a += tu.w * dt;
            const x = tu.cx + Math.cos(tu.a) * tu.r, z = tu.cz + Math.sin(tu.a) * tu.r;
            const surface = ocean.surfaceY(x, z, t);
            const breathe = Math.max(0, Math.sin(t * 0.18 + tu.bob)) ** 6;         // now and then it comes up to breathe
            const y = surface - 0.55 + breathe * 0.45;
            tu.mesh.position.set(x, y, z);
            tu.mesh.rotation.set(0, Math.atan2(-Math.cos(tu.a) * Math.sign(tu.w), -Math.sin(tu.a) * Math.sign(tu.w)) , Math.sin(t * 0.7 + tu.bob) * 0.05);
            const stroke = Math.sin(t * 1.6 + tu.bob);
            const fl = tu.mesh.userData.fl;
            fl[0].rotation.x = stroke * 0.5; fl[1].rotation.x = -stroke * 0.5;
            fl[0].rotation.y = stroke * 0.3; fl[1].rotation.y = -stroke * 0.3;
            fl[2].rotation.x = -stroke * 0.25; fl[3].rotation.x = stroke * 0.25;
            tu.mesh.userData.glow.opacity = night * (0.12 + 0.1 * Math.max(0, stroke));
            swA.push(x, z, -Math.sin(tu.a) * Math.sign(tu.w) * 1.3, Math.cos(tu.a) * Math.sign(tu.w) * 1.3); swK.push(0.45 + 0.35 * Math.max(0, stroke) - breathe * 0.3);
            if (night > 0.4 && Math.random() < dt * 1.5) ocean.splash(x, z, 0.6, 'fauna');
        }

        // ── fish school: circles a centre that drifts round the raft; scatters from you ──
        const fcx = DJ_RAFT_C.x + 18 + Math.cos(t * 0.05) * 22, fcz = DJ_RAFT_C.z - 30 + Math.sin(t * 0.07) * 40;
        const fdx = fcx - camX, fdz = fcz - camZ;
        const scare = Math.max(0, 1 - Math.hypot(fdx, fdz) / 9);
        const fSurf = ocean.surfaceY(fcx, fcz, t);
        for (let i = 0; i < FISH; i++) {
            const f = fishData[i];
            f.a += dt * f.sp * (1 + scare * 2) / f.r * 1.6;
            const r = f.r * (1 + scare * 1.5) + Math.sin(t * 0.8 + f.ph) * 0.4;
            const x = fcx + Math.cos(f.a) * r, z = fcz + Math.sin(f.a) * r;
            dummy.position.set(x, fSurf - 0.35 - f.y, z);
            dummy.rotation.set(Math.sin(t * 9 + f.ph) * 0.2, Math.atan2(-Math.cos(f.a), -Math.sin(f.a)), 0);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            fish.setMatrixAt(i, dummy.matrix);
        }
        fish.instanceMatrix.needsUpdate = true;
        swA.push(fcx, fcz, Math.cos(t * 0.3) * 4.5, Math.sin(t * 0.3) * 4.5); swK.push(0.35 + scare * 0.5);
        ocean.setSwimmers?.(swA, swK);
        fishMat.opacity = 0.15 + night * 0.7;

        // ── crabs ──
        for (let i = 0; i < CRABS; i++) {
            const c = crabData[i];
            const dx = c.x - camX, dz = c.z - camZ;
            const distSq = dx * dx + dz * dz;

            if (distSq < 100) {
                // Bolt, sideways, away from whatever that was.
                c.heading = Math.atan2(dx, dz) + Math.PI / 2;
                c.speed = 4.5;
                c.timer = 0.8;
            } else {
                c.timer -= dt;
                if (c.timer <= 0) {
                    c.timer = 1.5 + Math.random() * 4;
                    c.heading += (Math.random() - 0.5) * 3;
                    c.speed = Math.random() > 0.5 ? 0.9 : 0;
                }
            }
            c.speed = Math.max(0, c.speed - dt * 3.2);
            c.x += Math.sin(c.heading) * c.speed * dt;
            c.z += Math.cos(c.heading) * c.speed * dt;

            // Herd them back onto the wet sand if they stray.
            const shore = shoreX(c.z);
            if (c.x < shore - 1) c.x = shore - 1;
            if (c.x > shore + 16) c.x = shore + 16;

            const gy = Math.max(getTerrainHeight(c.x, c.z), seaLevel - 0.4);
            dummy.position.set(c.x, gy + 0.07, c.z);
            dummy.rotation.set(0, c.heading, 0);
            dummy.scale.setScalar(0.7 + (i % 5) * 0.12);
            dummy.updateMatrix();
            crabs.setMatrixAt(i, dummy.matrix);
        }
        crabs.instanceMatrix.needsUpdate = true;
    }

    function registerDynamicObstacles(collisionSystem) {
        // Dogs and crabs are not solid — you walk through them, which is both cheaper
        // and truer to how a beach dog behaves.
    }

    return { group, update, registerDynamicObstacles, dogs, dolphins, turtles };
}
