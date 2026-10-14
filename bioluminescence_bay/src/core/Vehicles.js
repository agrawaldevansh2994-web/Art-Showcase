// What moves along the sand: rented scooters, a couple of Enfields, and one black-and-
// yellow taxi that never leaves the bit of road at the south end.
//
// Every vehicle exposes { x, z, heading, speed, collisionRadius, label } so the
// controller can ride any of them and the collision system can treat them all the same.
// Each mesh declares its own userData.rideView, because a single fixed camera height
// puts your eyes inside the bodywork of anything taller than a scooter.
//
// Nothing drives north of z ≈ −10: that is where the headland cuts the beach in two and
// the only way on is the footpath.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';
import { MAT, makeGlowSprite } from './Props.js';
import { ARRIVAL } from './constants.js';

const TRACK_Z_MIN = -8;
const TRACK_Z_MAX = 284;

/** Where the beach track is at a given point along the coast. Mirrors Paths.js. */
function trackX(z) { return Math.max(shoreX(z) + 26, -40); }

// ─────────────────────────────────────────────────────────────
//  BUILDERS
// ─────────────────────────────────────────────────────────────

const SCOOTER_COLORS = [0xd8d2c4, 0x2a6ba8, 0xc03a2a, 0x3a7a54, 0xe0b028];

function buildScooter(color) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.28 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.25, metalness: 0.85 });
    const black = new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.8 });

    // Step-through body: the leg shield up front, a flat footboard, and the tail that
    // holds the engine. That silhouette is the whole reason it reads as a scooter.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.86, 0.22), paint);
    shield.position.set(0, 0.82, 0.62);
    shield.rotation.x = -0.22;
    g.add(shield);

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.85), black);
    board.position.set(0, 0.42, 0.06);
    g.add(board);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.9), paint);
    tail.position.set(0, 0.68, -0.62);
    tail.castShadow = true;
    g.add(tail);
    // The little round side panel over the engine.
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.52, 10), paint);
    cowl.rotation.z = Math.PI / 2;
    cowl.position.set(0, 0.62, -0.78);
    g.add(cowl);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.72), black);
    seat.position.set(0, 0.99, -0.42);
    g.add(seat);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), chrome);
    column.position.set(0, 1.15, 0.72);
    column.rotation.x = 0.24;
    g.add(column);
    const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.66, 6), chrome);
    bars.rotation.z = Math.PI / 2;
    bars.position.set(0, 1.44, 0.66);
    g.add(bars);
    // Mirrors. Nobody uses them but every one of these has them.
    for (const sx of [-0.33, 0.33]) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 4), chrome);
        stem.position.set(sx, 1.56, 0.66);
        g.add(stem);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.075, 8), chrome);
        glass.position.set(sx, 1.68, 0.65);
        g.add(glass);
    }

    // Small wheels, close together — the other half of the scooter silhouette.
    const wheelGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.15, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const wz of [0.78, -0.82]) {
        const w = new THREE.Mesh(wheelGeo, black);
        w.position.set(0, 0.3, wz);
        g.add(w);
        wheels.push(w);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 8), chrome);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(w.position);
        g.add(hub);
    }

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
    lamp.position.set(0, 1.18, 0.84);
    g.add(lamp);
    const glow = makeGlowSprite(0xfff0c0, 0.7, 2.6);
    glow.position.copy(lamp.position);
    g.add(glow);

    g.userData = { wheels, lamp, rideView: { y: 1.85 }, wantsHeadlight: true };
    return g;
}

function buildEnfield() {
    const g = new THREE.Group();
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.22, metalness: 0.9 });
    const paint = new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 0.35, metalness: 0.45 });
    const black = new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.85 });

    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.72, 6, 10), paint);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, 1.0, 0.12);
    g.add(tank);

    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.52), chrome);
    engine.position.set(0, 0.64, 0.05);
    g.add(engine);
    for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.6), chrome);
        fin.position.set(0, 0.48 + i * 0.12, 0.05);
        g.add(fin);
    }

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.8), black);
    seat.position.set(0, 1.03, -0.6);
    g.add(seat);

    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.65, 6), chrome);
    frame.rotation.x = Math.PI / 2;
    frame.position.set(0, 0.76, -0.2);
    g.add(frame);
    const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.76, 6), chrome);
    bars.rotation.z = Math.PI / 2;
    bars.position.set(0, 1.4, 0.7);
    g.add(bars);
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 1.05, 6), chrome);
    fork.position.set(0, 0.93, 0.76);
    fork.rotation.x = 0.28;
    g.add(fork);

    const wheelGeo = new THREE.TorusGeometry(0.44, 0.12, 8, 18);
    const wheels = [];
    for (const wz of [0.88, -0.92]) {
        const w = new THREE.Mesh(wheelGeo, black);
        w.position.set(0, 0.46, wz);
        w.rotation.y = Math.PI / 2;
        g.add(w);
        wheels.push(w);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.11, 10), chrome);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(w.position);
        g.add(hub);
    }

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
    lamp.position.set(0, 1.24, 0.92);
    g.add(lamp);
    const glow = makeGlowSprite(0xfff0c0, 0.7, 3);
    glow.position.copy(lamp.position);
    g.add(glow);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 1.25, 8), chrome);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.27, 0.53, -0.48);
    g.add(exhaust);

    g.userData = { wheels, lamp, rideView: { y: 2.0 }, wantsHeadlight: true };
    return g;
}

/** The black-and-yellow taxi. Sits at the end of the road with the driver asleep in it. */
function buildTaxi() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.4, metalness: 0.35 });
    const roof = new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.45, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({
        color: 0x1a2430, roughness: 0.12, metalness: 0.6, transparent: true, opacity: 0.7,
    });

    // Round, upright and small — an Ambassador, not a saloon.
    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.95, 4.2), body);
    lower.position.y = 0.86;
    lower.castShadow = true;
    g.add(lower);
    const fenders = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 3.6, 4, 8), body);
    fenders.rotation.z = Math.PI / 2;
    fenders.scale.set(1, 1, 0.8);
    fenders.position.y = 0.8;
    g.add(fenders);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.78, 2.1), roof);
    cabin.position.set(0, 1.72, -0.15);
    g.add(cabin);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 0.08), glass);
    windshield.position.set(0, 1.68, 0.92);
    windshield.rotation.x = -0.22;
    g.add(windshield);
    for (const sx of [-0.95, 0.95]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.56, 1.9), glass);
        side.position.set(sx, 1.7, -0.15);
        g.add(side);
    }

    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const tyre = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.95 });
    const wheels = [];
    for (const sx of [-1.02, 1.02]) {
        for (const wz of [1.35, -1.35]) {
            const w = new THREE.Mesh(wheelGeo, tyre);
            w.position.set(sx, 0.46, wz);
            g.add(w);
            wheels.push(w);
        }
    }

    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false });
    for (const sx of [-0.66, 0.66]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), lampMat);
        lamp.position.set(sx, 1.02, 2.06);
        g.add(lamp);
        const glow = makeGlowSprite(0xfff0c8, 0.6, 2.8);
        glow.position.copy(lamp.position);
        g.add(glow);
    }
    // The roof sign.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 0.6, emissive: 0x4a4020 }));
    sign.position.set(0, 2.22, 0.3);
    g.add(sign);

    g.userData = { wheels, rideView: { y: 2.6 }, wantsHeadlight: true };
    return g;
}

// ─────────────────────────────────────────────────────────────
//  SYSTEM
// ─────────────────────────────────────────────────────────────

export function createVehicles(scene, audio) {
    const group = new THREE.Group();
    group.name = 'vehicles';
    scene.add(group);

    const vehicles = [];
    function addVehicle(v) { vehicles.push(v); group.add(v.mesh); return v; }

    // ── Shared headlight pool ──
    // Two real SpotLights for every vehicle in the world, lent each frame to whichever
    // are closest to the camera. The COUNT never changes, which is the point: adding or
    // removing a light at runtime recompiles every shader in the scene.
    const HEADLIGHT_POOL = 0;   // BAY M1: nothing to light — saves two SpotLights
    const headlights = [];
    for (let i = 0; i < HEADLIGHT_POOL; i++) {
        const sl = new THREE.SpotLight(0xfff0c8, 0, 50, Math.PI / 6, 0.5, 1.4);
        group.add(sl, sl.target);
        headlights.push(sl);
    }
    const _rank = [];
    const _wp = new THREE.Vector3();

    function assignHeadlights(ctx) {
        const lit = (ctx.night ?? 1) > 0.25;
        _rank.length = 0;
        for (let i = 0; i < vehicles.length; i++) {
            const v = vehicles[i];
            if (!v.mesh.userData.wantsHeadlight) continue;
            const dx = v.x - ctx.camera.position.x, dz = v.z - ctx.camera.position.z;
            _rank.push({ v, d: dx * dx + dz * dz });
        }
        _rank.sort((a, b) => a.d - b.d);

        for (let i = 0; i < headlights.length; i++) {
            const sl = headlights[i];
            const picked = _rank[i];
            if (!picked || !lit) { sl.intensity = 0; continue; }
            const { v } = picked;
            const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
            v.mesh.getWorldPosition(_wp);
            sl.position.set(_wp.x + fx * 1.6, _wp.y + 1.4, _wp.z + fz * 1.6);
            sl.target.position.set(_wp.x + fx * 13, _wp.y + 0.3, _wp.z + fz * 13);
            sl.target.updateMatrixWorld();
            sl.intensity = 2.6;
        }
    }

    // BAY M1: no engines on the Bay. Goa's cruising scooters, Enfields and the parked taxi
    // are gone — the cove has no road (the trail comes in on foot over the South Horn).
    // The module stays so Controls/Minimap keep their contract; kayaks may land here later.

    // ── The player's rented scooter ──
    let rental = null;
    function spawnScooter(pos, yaw) {
        if (!rental) {
            rental = {
                kind: 'scooter', label: 'SCOOTER',
                mesh: buildScooter(0xd8d2c4),
                x: pos.x, z: pos.z, heading: yaw + Math.PI,
                speed: 0, collisionRadius: 1.3, drivenByPlayer: false, wheelSpin: 0,
            };
            addVehicle(rental);
        }
        // Re-summon: drop it in front of wherever the player is now. The + PI is not
        // optional — without it the thing spawns facing backwards.
        rental.x = pos.x + Math.sin(yaw + Math.PI) * 2.4;
        rental.z = pos.z + Math.cos(yaw + Math.PI) * 2.4;
        rental.heading = yaw + Math.PI;
        rental.speed = 0;
        return rental;
    }

    // ─────────────────────────────────────────────
    function update(ctx) {
        const dt = Math.min(ctx.delta, 0.05);
        const night = ctx.night ?? 1;

        for (let i = 0; i < vehicles.length; i++) {
            const v = vehicles[i];

            if (!v.drivenByPlayer && v.cruise !== undefined) {
                v.speed = THREE.MathUtils.lerp(v.speed, v.cruise, dt * 0.8);
                const targetX = trackX(v.z) + v.dir * 2.8;
                const dx = targetX - v.x;
                v.x += dx * Math.min(dt * 1.2, 1);
                v.z += v.dir * v.speed * dt;
                if (v.z > TRACK_Z_MAX) { v.dir = -1; v.heading = Math.PI; }
                if (v.z < TRACK_Z_MIN) { v.dir = 1; v.heading = 0; }
                v.heading = v.dir > 0 ? Math.atan2(dx * 0.4, 1) : Math.PI - Math.atan2(dx * 0.4, 1);
            }

            const groundY = getTerrainHeight(v.x, v.z);
            v.mesh.position.set(v.x, groundY, v.z);
            v.mesh.rotation.y = v.heading;

            // Pitch and roll to the sand so nothing floats over a rut.
            const ahead = 2.2;
            const hF = getTerrainHeight(v.x + Math.sin(v.heading) * ahead, v.z + Math.cos(v.heading) * ahead);
            const hS = getTerrainHeight(v.x + Math.cos(v.heading) * ahead, v.z - Math.sin(v.heading) * ahead);
            v.mesh.rotation.x = THREE.MathUtils.lerp(v.mesh.rotation.x, -Math.atan2(hF - groundY, ahead), dt * 5);
            v.mesh.rotation.z = THREE.MathUtils.lerp(v.mesh.rotation.z, Math.atan2(hS - groundY, ahead), dt * 5);

            const ud = v.mesh.userData;
            if (ud.wheels) {
                v.wheelSpin += v.speed * dt * 2.4;
                for (let w = 0; w < ud.wheels.length; w++) ud.wheels[w].rotation.x = v.wheelSpin;
            }
            if (ud.lamp) ud.lamp.visible = night > 0.2;
        }

        assignHeadlights(ctx);
    }

    function registerDynamicObstacles(collisionSystem) {
        collisionSystem.clearDynamic();
        for (let i = 0; i < vehicles.length; i++) {
            const v = vehicles[i];
            if (v.drivenByPlayer) continue;
            collisionSystem.registerDynamicCircle(v.x, v.z, v.collisionRadius, v.label);
        }
    }

    function findNearest(pos, maxDist) {
        let best = null, bestD = maxDist;
        for (let i = 0; i < vehicles.length; i++) {
            const v = vehicles[i];
            const d = Math.hypot(pos.x - v.x, pos.z - v.z);
            if (d < bestD) { bestD = d; best = v; }
        }
        return best;
    }

    return {
        update, registerDynamicObstacles, findNearest, spawnScooter,
        getAll: () => vehicles,
    };
}
