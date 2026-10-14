// Player controller: pointer lock, look, terrain-following movement, collision, riding,
// the head torch, the interaction system — and the water.
//
// THE WATER. Three states, chosen purely from how deep the sea is where you are standing:
//   land  — normal walking
//   wade  — slowed, splashing, and kicking up plankton at night
//   swim  — feet off the sand, camera pinned to the surface, CTRL to go under
// There is no invisible wall at the waterline. You can swim out as far as the world goes.

import * as THREE from 'three';

const ARROW_ALIAS = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd' };
import {
    WALK_SPEED, RUN_SPEED, SWIM_SPEED, MOUSE_SENS, PLAYER_HEIGHT, PLAYER_RADIUS,
    WALK_BOUND_X_MIN, WALK_BOUND_X_MAX, WALK_BOUND_Z,
    WADE_DEPTH, SWIM_DEPTH, DIVE_DEPTH,
} from './constants.js';
import { getTerrainHeight, getTerrainNormal } from './Terrain.js';

export function createControls({ camera, scene, audio, collisionSystem, vehicles, ocean, ui }) {
    let locked = false;
    let yaw = 0, pitch = 0;
    const keys = {};
    const velocity = new THREE.Vector3();
    const moveDir = new THREE.Vector3();

    let autoSteer = false;
    let headBob = 0;
    let bumpTimer = 0;
    let stepTimer = 0;
    let speedBoost = 0;
    let chai = 0;                   // chai buff: moves you quicker for a while
    let riding = null;

    // ── Aboard a moving platform (BAY M2: the DJ raft) ──
    // While aboard you live in the platform's LOCAL frame (Deck.js, from Atlantis): the
    // raft's bob and tilt carry you for free, and walking off the edge drops you in the sea.
    // { deck, root, ladder:{x,z,r}, exit:{x,z} (world, where you surface on climbing down) }
    let aboard = null;
    // ── Piloting (BAY: kayaks). { step(dt, keys, time) -> {x,y,z,turn}, prompt(), interact() }
    let pilot = null;
    let pilotTime = 0;
    let jumpEdge = false;
    const _local = new THREE.Vector3();

    // ── Water state ──
    let waterState = 'land';
    let diveDepth = 0;              // how far below the surface the camera is being held
    let submerged = 0;              // 0..1, drives fog, audio and the vignette
    let wakeTimer = 0;
    let wasSwimming = false;

    const BUMP_TIME = 0.26;
    const BUMP_AMOUNT = 0.045;

    // ── Dancing ──
    // Ported from Warehouse_rave's PlayerState/Controls split. That world has a
    // BeatClock to lock onto; this one does not, so the phase runs off the FFT bass of
    // whichever floor you are standing on, fed in from main.js each frame. Energy ramps
    // and decays rather than snapping, so it never latches — walk away and it stops.
    const DANCE_RAMP = 2.4, DANCE_DECAY = 1.6;
    const DANCE_BOB = 0.075, DANCE_SWAY = 0.055, DANCE_ROLL = 0.030, DANCE_FOV_PULSE = 1.8;
    let dancing = false;
    let danceEnergy = 0;
    let dancePhase = 0;
    let danceBass = 0;
    let danceRoll = 0;
    const BASE_FOV = camera.fov;

    // ── Head torch ──
    const torch = new THREE.SpotLight(0xffe6bb, 0, 62, Math.PI / 7, 0.55, 1.2);
    torch.position.set(0, 0.1, 0.2);
    torch.target.position.set(0, 0, -1);
    camera.add(torch);
    camera.add(torch.target);
    scene.add(camera);
    let torchOn = false;

    // ── Interactables ──
    const interactables = [];
    function addInteractable(o) {
        const item = {
            x: o.x, z: o.z, radius: o.radius ?? 8,
            prompt: o.prompt ?? 'PRESS E',
            onInteract: o.onInteract,
            enabled: o.enabled ?? (() => true),
            owner: o.owner ?? null,
            swim: o.swim ?? false,     // offered while swimming (e.g. a ladder)
        };
        interactables.push(item);
        return item;
    }
    function removeInteractablesByOwner(owner) {
        for (let i = interactables.length - 1; i >= 0; i--) {
            if (interactables[i].owner === owner) interactables.splice(i, 1);
        }
    }
    function nearestInteractable() {
        let best = null, bestD = Infinity;
        for (let i = 0; i < interactables.length; i++) {
            const it = interactables[i];
            if (!it.enabled()) continue;
            if ((waterState === 'swim') !== it.swim) continue;
            const dx = camera.position.x - it.x, dz = camera.position.z - it.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < it.radius && d < bestD) { bestD = d; best = it; }
        }
        return best;
    }

    // ── Custom key hooks (main.js registers world-level shortcuts here) ──
    const keyHooks = {};
    function onKey(key, fn) {
        const k = key.toLowerCase();
        if (!keyHooks[k]) keyHooks[k] = [];
        keyHooks[k].push(fn);
    }

    // ─────────────────────────────────────────────
    //  POINTER LOCK
    // ─────────────────────────────────────────────
    function enter() {
        ui.hideOverlay();
        document.body.classList.add('playing');
        try { document.body.requestPointerLock(); } catch (e) { /* browser refused */ }
        audio.resume();
    }

    document.addEventListener('pointerlockchange', () => {
        locked = document.pointerLockElement === document.body;
        if (locked) { ui.hideOverlay(); document.body.classList.add('playing'); }
        else ui.showOverlay();
    });
    document.addEventListener('pointerlockerror', () => { locked = false; });

    document.addEventListener('mousemove', e => {
        if (!locked) return;
        yaw -= e.movementX * MOUSE_SENS;
        pitch -= e.movementY * MOUSE_SENS;
        pitch = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, pitch));
    });

    // ─────────────────────────────────────────────
    //  KEYBOARD
    // ─────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        keys[e.code] = true;
        const k = e.key.toLowerCase();
        keys[k] = true;
        // Arrow keys drive everything WASD drives (walk, swim, kayak, surf) — 2026-10-07.
        const al = ARROW_ALIAS[e.code]; if (al) { keys[al] = true; e.preventDefault(); }
        // Space scrolls the page and Ctrl+key is a browser shortcut on some layouts.
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) jumpEdge = true; }

        // Guard against key-repeat: everything below either spawns geometry or toggles
        // state, and holding the key would flood the scene.
        if (e.repeat) return;

        if (k === 'q') {
            autoSteer = !autoSteer;
            ui.toast(autoSteer ? 'AUTO-STEER ON — A/D turns you' : 'AUTO-STEER OFF');
        } else if (k === 'f') {
            torchOn = !torchOn;
            torch.intensity = torchOn ? 3.2 : 0;
            audio.sfx('chime', { gain: 0.18 });
            ui.toast(torchOn ? 'HEAD TORCH ON' : 'HEAD TORCH OFF');
        } else if (k === 'e') {
            handleInteract();
        } else if (k === 'b') {
            // BAY M1: no scooter rental on the Bay.
            if (riding) { dismount(); return; }
            ui.toast('NO ENGINES ON THE BAY — WALK, OR SWIM');
        } else if (k === 'r') {
            if (riding) audio.sfx('horn', { gain: 0.55 });
        } else if (k === 'g') {
            // Warehouse binds this to F; F is the head torch here.
            dancing = !dancing;
            ui.toast(dancing ? 'DANCING — G TO STOP' : 'STOPPED');
        }

        const hooks = keyHooks[k];
        if (hooks) hooks.forEach(fn => fn());
    });

    document.addEventListener('keyup', e => {
        keys[e.code] = false;
        keys[e.key.toLowerCase()] = false;
        const al = ARROW_ALIAS[e.code]; if (al) keys[al] = false;
    });

    // ─────────────────────────────────────────────
    //  INTERACTION / RIDING
    // ─────────────────────────────────────────────
    function handleInteract() {
        if (riding) { dismount(); return; }
        if (pilot) { pilot.interact(); return; }
        if (aboard) {
            const p = aboard.deck.p, L = aboard.ladder;
            if (Math.hypot(p.x - L.x, p.z - L.z) < L.r) leaveDeck(true);
            return;
        }
        const it = nearestInteractable();
        if (it) { it.onInteract(api); return; }
        const v = vehicles.findNearest(camera.position, 16);
        if (v) { mount(v); ui.toast('RIDING — E to get off'); }
    }

    function mount(v) {
        riding = v;
        v.drivenByPlayer = true;
        yaw = v.heading + Math.PI;
        audio.sfx('horn', { gain: 0.3 });
    }

    function dismount() {
        if (!riding) return;
        // Step off sideways, or you end up standing inside the bodywork.
        const push = (riding.collisionRadius ?? 4) + PLAYER_RADIUS + 0.4;
        camera.position.x += Math.cos(riding.heading) * push;
        camera.position.z -= Math.sin(riding.heading) * push;
        riding.drivenByPlayer = false;
        riding = null;
        ui.toast('ON FOOT');
    }

    // ─────────────────────────────────────────────
    //  MOVEMENT
    // ─────────────────────────────────────────────
    function update(delta) {
        if (speedBoost > 0) speedBoost -= delta;
        if (chai > 0) chai -= delta;

        // Dance energy ramps and decays; the phase runs on the bass so it lands with the
        // floor you are on. It keeps advancing even when energy is 0 so that starting
        // again picks up mid-bar instead of snapping to a downbeat.
        const target = dancing ? 1 : 0;
        const rate = dancing ? 1 / DANCE_RAMP : 1 / DANCE_DECAY;
        danceEnergy += (target - danceEnergy) * Math.min(1, delta * rate * 3);
        if (Math.abs(danceEnergy - target) < 0.002) danceEnergy = target;
        dancePhase += delta * (1.9 + danceBass * 1.3);
        if (dancePhase > 1e6) dancePhase = 0;

        // FOV punch on the kick.
        const targetFov = BASE_FOV + danceBass * DANCE_FOV_PULSE * danceEnergy;
        if (Math.abs(camera.fov - targetFov) > 0.01) {
            camera.fov += (targetFov - camera.fov) * Math.min(1, delta * 8);
            camera.updateProjectionMatrix();
        }
        // Head tilt, counter-phase to the weight shift so the head stays roughly level
        // over a body that is moving under it.
        danceRoll = danceEnergy > 0.01
            ? -Math.sin(dancePhase * Math.PI) * DANCE_ROLL * danceEnergy : 0;

        if (!locked) { applyCameraRotation(); return; }
        if (riding) { updateRiding(delta); return; }
        if (aboard) { updateDeck(delta); return; }
        if (pilot) {
            pilotTime += delta;
            const r = pilot.step(Math.min(delta, 0.05), keys);
            yaw += r.turn;                                   // the view turns with the boat
            camera.position.set(r.x, r.y, r.z);
            submerged = 0; diveDepth = 0; waterState = 'land';
            applyCameraRotation(delta);
            ui.prompt(pilot.prompt());
            return;
        }

        const seaLevel = ocean.getSeaLevel();
        const groundY = getTerrainHeight(camera.position.x, camera.position.z);
        const depth = Math.max(0, seaLevel - groundY);

        const prevState = waterState;
        waterState = depth >= SWIM_DEPTH ? 'swim' : (depth >= WADE_DEPTH ? 'wade' : 'land');
        if (prevState !== 'swim' && waterState === 'swim') {
            audio.sfx('splash', { gain: 0.5 });
            ocean.splash(camera.position.x, camera.position.z, 2.5);
        }

        const running = !!(keys['shift'] || keys['ShiftLeft'] || keys['ShiftRight']);

        // ── heading ──
        moveDir.set(0, 0, 0);
        if (autoSteer) {
            const turn = 2.1;
            if (keys['a'] || keys['ArrowLeft']) yaw += turn * delta;
            if (keys['d'] || keys['ArrowRight']) yaw -= turn * delta;
            if (keys['w'] || keys['ArrowUp']) moveDir.z -= 1;
            if (keys['s'] || keys['ArrowDown']) moveDir.z += 1;
        } else {
            if (keys['w'] || keys['ArrowUp']) moveDir.z -= 1;
            if (keys['s'] || keys['ArrowDown']) moveDir.z += 1;
            if (keys['a'] || keys['ArrowLeft']) moveDir.x -= 1;
            if (keys['d'] || keys['ArrowRight']) moveDir.x += 1;
        }
        const moving = moveDir.lengthSq() > 0;
        moveDir.normalize();

        const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
        const mx = moveDir.x * cosY + moveDir.z * sinY;
        const mz = -moveDir.x * sinY + moveDir.z * cosY;

        // ── speed ──
        let speed;
        if (waterState === 'swim') {
            speed = SWIM_SPEED * (running ? 1.55 : 1);
        } else {
            speed = running ? RUN_SPEED : WALK_SPEED;
            if (speedBoost > 0) speed *= 1.75;
            if (chai > 0) speed *= 1.15;
            // Wading is hard work, and gets harder the deeper you go.
            if (waterState === 'wade') {
                speed *= 1 - 0.55 * THREE.MathUtils.clamp((depth - WADE_DEPTH) / (SWIM_DEPTH - WADE_DEPTH), 0, 1);
            }
            // Soft sand and climbing both cost you.
            if (moving) {
                const ahead = 2.2;
                const hThere = getTerrainHeight(camera.position.x + mx * ahead, camera.position.z + mz * ahead);
                const grade = (hThere - groundY) / ahead;
                if (grade > 0.15) speed *= Math.max(0.32, 1 - grade * 0.85);
                else if (grade < -0.2) speed *= Math.min(1.3, 1 - grade * 0.28);
            }
        }

        // Water has drag — you neither start nor stop quickly in it.
        const accel = waterState === 'swim' ? 3.2 : 9;
        velocity.x = THREE.MathUtils.lerp(velocity.x, mx * speed, delta * accel);
        velocity.z = THREE.MathUtils.lerp(velocity.z, mz * speed, delta * accel);

        camera.position.x += velocity.x * delta;
        camera.position.z += velocity.z * delta;

        vehicles.registerDynamicObstacles(collisionSystem);
        const { hit } = collisionSystem.resolve(camera.position, velocity, PLAYER_RADIUS);
        if (hit) bumpTimer = BUMP_TIME;

        camera.position.x = THREE.MathUtils.clamp(camera.position.x, WALK_BOUND_X_MIN, WALK_BOUND_X_MAX);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -WALK_BOUND_Z, WALK_BOUND_Z);

        const planarSpeed = Math.hypot(velocity.x, velocity.z);

        // ── vertical ──
        if (waterState === 'swim') {
            // CTRL takes you under, SPACE brings you up, and you float back up on your
            // own if you do neither. The floor stops you before the sand does.
            const diving = !!(keys['control'] || keys['ControlLeft'] || keys['ControlRight']);
            const rising = !!keys['Space'];
            if (diving) diveDepth += delta * 3.4;
            else if (rising) diveDepth -= delta * 4.2;
            else diveDepth -= delta * 1.1;

            const groundHere = getTerrainHeight(camera.position.x, camera.position.z);
            const maxDive = Math.min(DIVE_DEPTH, seaLevel - groundHere - 0.5);
            diveDepth = THREE.MathUtils.clamp(diveDepth, 0, Math.max(maxDive, 0));

            headBob += delta * (moving ? 3.4 : 1.2);
            camera.position.y = seaLevel + 0.35 - diveDepth + Math.sin(headBob) * (0.09 - diveDepth * 0.01);

            if (moving && planarSpeed > 1) {
                stepTimer -= delta;
                if (stepTimer <= 0) {
                    stepTimer = 0.9;
                    audio.sfx('splash', { gain: diveDepth > 0.5 ? 0.08 : 0.2 });
                }
            }
            wasSwimming = true;
        } else {
            if (wasSwimming) {
                // Coming out of the water.
                if (diveDepth > 0.5) audio.sfx('splash', { gain: 0.45 });
                wasSwimming = false;
            }
            diveDepth = Math.max(0, diveDepth - delta * 6);

            if (moving && planarSpeed > 0.5) {
                headBob += delta * (running ? 15 : 10.5);
                stepTimer -= delta * (running ? 1.7 : 1);
                if (stepTimer <= 0) {
                    stepTimer = 0.44;
                    if (waterState === 'wade') audio.sfx('splash', { gain: 0.22 });
                    else audio.sfx('step', { gain: running ? 0.3 : 0.2 });
                }
            } else {
                headBob += delta * 1.6;
            }
            const bobAmount = moving ? (running ? 0.085 : 0.05) : 0.012;

            // Re-sample the ground, and sample the whole FOOTPRINT rather than the point
            // underfoot. Two separate things put the camera inside the headland on the
            // climb a horn:
            //   1. `groundY` above is taken BEFORE this frame's move and collision
            //      resolve. Running uphill covers ~0.8 units a frame against a grade
            //      near 1.8, so the stale sample sat over a metre low — most of
            //      PLAYER_HEIGHT — and the slope swallowed the near plane.
            //   2. The terrain MESH is 220 segments over 1400 units: one quad per 6.4
            //      units. Its flat chords sit above the analytic curve wherever the
            //      slope is concave, so following getTerrainHeight() exactly still
            //      clips through the drawn surface on steep ground.
            // Taking the max across the player's own radius fixes both, and costs four
            // extra samples a frame for one entity.
            const px = camera.position.x, pz = camera.position.z;
            const groundNow = Math.max(
                getTerrainHeight(px, pz),
                getTerrainHeight(px + PLAYER_RADIUS, pz),
                getTerrainHeight(px - PLAYER_RADIUS, pz),
                getTerrainHeight(px, pz + PLAYER_RADIUS),
                getTerrainHeight(px, pz - PLAYER_RADIUS));

            // Dance: down on the beat, up between — the body drops into the kick, it
            // does not hop off the sand. Same shape as the crowd's dip, for the same
            // reason. Lateral weight shifts over two beats, not one.
            let danceY = 0, danceLateral = 0;
            if (danceEnergy > 0.01) {
                danceY = -(0.5 - 0.5 * Math.cos(dancePhase * Math.PI * 2)) * DANCE_BOB * danceEnergy;
                danceLateral = Math.sin(dancePhase * Math.PI) * DANCE_SWAY * danceEnergy;
            }
            // Standing in water, your eyes are still your own height above the sand.
            camera.position.y = groundNow + PLAYER_HEIGHT + Math.sin(headBob) * bobAmount + danceY;

            if (danceLateral !== 0) {
                // Applied along the camera's right vector, so it reads as the body
                // moving under a steady head rather than the world sliding.
                camera.position.x += Math.cos(yaw) * danceLateral * delta * 6;
                camera.position.z += -Math.sin(yaw) * danceLateral * delta * 6;
            }
        }

        // ── the wake ──
        // Anything moving through the shallows lights up the plankton. This is the whole
        // reason to walk into the sea at night, so it is generous rather than subtle.
        if (waterState !== 'land' && planarSpeed > 1.2) {
            wakeTimer -= delta;
            if (wakeTimer <= 0) {
                wakeTimer = 0.07;
                ocean.splash(camera.position.x, camera.position.z, 0.7 + planarSpeed * 0.05);
            }
        }

        submerged = THREE.MathUtils.smoothstep(diveDepth, 0.35, 1.1);

        applyCameraRotation(delta);
        updatePrompt();
    }

    function updateRiding(delta) {
        const v = riding;
        const isBike = v.kind === 'scooter' || v.kind === 'enfield';
        let power = isBike ? 24 : 18;
        if (keys['shift'] || keys['ShiftLeft'] || keys['ShiftRight']) power *= 1.9;
        const turnRate = isBike ? 2.3 : 1.5;

        if (keys['w'] || keys['ArrowUp']) v.speed = THREE.MathUtils.lerp(v.speed, power, delta * 2.2);
        else if (keys['s'] || keys['ArrowDown']) v.speed = THREE.MathUtils.lerp(v.speed, -power * 0.5, delta * 2.2);
        else v.speed = THREE.MathUtils.lerp(v.speed, 0, delta * 1.6);

        const grip = Math.min(Math.abs(v.speed) / 6, 1);
        if (keys['a'] || keys['ArrowLeft']) { v.heading += turnRate * delta * grip; yaw += turnRate * delta * grip; }
        if (keys['d'] || keys['ArrowRight']) { v.heading -= turnRate * delta * grip; yaw -= turnRate * delta * grip; }

        v.x += Math.sin(v.heading) * v.speed * delta;
        v.z += Math.cos(v.heading) * v.speed * delta;
        v.x = THREE.MathUtils.clamp(v.x, WALK_BOUND_X_MIN, WALK_BOUND_X_MAX);
        v.z = THREE.MathUtils.clamp(v.z, -WALK_BOUND_Z, WALK_BOUND_Z);

        // Nothing with wheels goes into the sea. Push it back onto the sand instead.
        if (ocean.depthAt(v.x, v.z) > 0.35) {
            v.x += 1.6;
            v.speed *= 0.55;
        }

        camera.position.x = v.x;
        camera.position.z = v.z;
        // Each vehicle declares its own eye point; a single fixed height puts the camera
        // inside the bodywork of anything tall.
        const view = v.mesh.userData.rideView ?? { y: isBike ? 2.0 : 3.6 };
        camera.position.y = getTerrainHeight(v.x, v.z) + view.y;

        submerged = 0;
        diveDepth = 0;
        waterState = 'land';

        applyCameraRotation(delta);
        updatePrompt();
    }

    // ─────────────────────────────────────────────
    //  ABOARD (BAY M2)
    // ─────────────────────────────────────────────
    function board(platform) {
        if (riding) dismount();
        aboard = platform;
        jumpEdge = false;
        const s0 = platform.spawn;
        platform.deck.place(s0.x, s0.y, s0.z);
        velocity.set(0, 0, 0);
        diveDepth = 0; submerged = 0; waterState = 'land';
        audio.sfx('splash', { gain: 0.35 });
        ui.toast(platform.toast ?? 'ABOARD');
    }

    function leaveDeck(byLadder) {
        if (!aboard) return;
        const root = aboard.root;
        if (byLadder) {
            camera.position.x = aboard.exit.x;
            camera.position.z = aboard.exit.z;
        } else {
            _local.set(aboard.deck.p.x, aboard.deck.p.y, aboard.deck.p.z);
            root.localToWorld(_local);
            camera.position.x = _local.x;
            camera.position.z = _local.z;
            audio.sfx('splash', { gain: 0.6 });
        }
        camera.position.y = ocean.getSeaLevel() + 0.35;
        velocity.set(0, 0, 0);
        aboard = null;
        waterState = 'swim';
        wasSwimming = true;
    }

    function updateDeck(delta) {
        const dt = Math.min(delta, 0.05);
        const deck = aboard.deck;
        const res = deck.step(dt, { keys, yaw, jump: jumpEdge }, {});
        jumpEdge = false;
        if (res === 'fell') { leaveDeck(false); applyCameraRotation(delta); updatePrompt(); return; }

        // Same dance dip as on the sand, measured from the deck.
        let danceY = 0;
        if (danceEnergy > 0.01) {
            danceY = -(0.5 - 0.5 * Math.cos(dancePhase * Math.PI * 2)) * DANCE_BOB * danceEnergy;
        }
        const moving = Math.hypot(deck.v.x, deck.v.z) > 0.3 && deck.grounded;
        if (moving) headBob += dt * 9;
        aboard.root.updateMatrixWorld();
        _local.set(deck.p.x, deck.p.y + deck.EYE + danceY + (moving ? Math.sin(headBob) * 0.035 : 0), deck.p.z);
        aboard.root.localToWorld(_local);
        camera.position.copy(_local);

        submerged = 0; diveDepth = 0; waterState = 'land';
        applyCameraRotation(delta);
        updatePrompt();
    }

    function applyCameraRotation(delta = 0.016) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
        if (bumpTimer > 0) {
            bumpTimer -= delta;
            const t = Math.max(bumpTimer, 0) / BUMP_TIME;
            camera.rotation.z = Math.sin(t * Math.PI * 9) * BUMP_AMOUNT * t + danceRoll;
        } else {
            // Swimming rolls gently; walking does not.
            const target = (waterState === 'swim' ? Math.sin(headBob * 0.5) * 0.045 : 0) + danceRoll;
            camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, target, delta * 6);
        }
    }

    function updatePrompt() {
        if (riding) { ui.prompt('E  GET OFF   ·   R  HORN'); return; }
        if (aboard) {
            const p = aboard.deck.p, L = aboard.ladder;
            ui.prompt(Math.hypot(p.x - L.x, p.z - L.z) < L.r ? 'E  CLIMB DOWN' : 'G  DANCE   ·   WALK OFF THE EDGE TO JUMP IN');
            return;
        }
        if (waterState === 'swim') {
            const it = nearestInteractable();
            if (it) { ui.prompt(it.prompt); return; }
            ui.prompt(diveDepth > 0.5 ? 'SPACE  SURFACE' : 'CTRL  DIVE');
            return;
        }
        const it = nearestInteractable();
        if (it) { ui.prompt(it.prompt); return; }
        const v = vehicles.findNearest(camera.position, 16);
        if (v) { ui.prompt(`E  RIDE THE ${v.label}`); return; }
        ui.prompt(null);
    }

    // ─────────────────────────────────────────────
    //  PUBLIC
    // ─────────────────────────────────────────────
    const api = {
        update, enter, onKey, addInteractable, removeInteractablesByOwner,
        isLocked: () => locked,
        isRiding: () => !!riding,
        board, leaveDeck,
        setPilot(p, faceYaw) { if (riding) dismount(); aboard = null; pilot = p; if (faceYaw !== undefined) yaw = faceYaw; pitch = -0.05; },
        clearPilot(x, z, swimming) {
            pilot = null;
            camera.position.x = x; camera.position.z = z;
            const g = getTerrainHeight(x, z), sea = ocean.getSeaLevel();
            camera.position.y = swimming ? sea + 0.35 : Math.max(g, sea - 0.4) + PLAYER_HEIGHT;
            velocity.set(0, 0, 0);
            waterState = swimming ? 'swim' : 'land';
            wasSwimming = swimming;
        },
        isPiloting: () => !!pilot,
        isAboard: () => !!aboard,
        getYaw: () => yaw,
        getPitch: () => pitch,
        isTorchOn: () => torchOn,
        setTorch(on) { torchOn = on; torch.intensity = on ? 3.2 : 0; },
        grantSpeed(seconds) { speedBoost = Math.max(speedBoost, seconds); },
        grantChai(seconds) { chai = Math.max(chai, seconds); },
        hasChai: () => chai > 0,
        /** 'land' | 'wade' | 'swim' */
        getWaterState: () => waterState,
        /**
         * Fed once a frame from main.js. Controls owns the camera, so anything that
         * wants to move it hands a number in here rather than writing to it — two
         * systems both assigning camera.position.y is a fight nobody can debug.
         */
        setDanceBass(v) { danceBass = v || 0; },
        isDancing: () => dancing,
        getDanceEnergy: () => danceEnergy,
        /** 0..1 — how far under the surface the camera is. Drives fog and the mix. */
        getSubmerged: () => submerged,
        teleport(x, z, faceX, faceZ) {
            camera.position.set(x, getTerrainHeight(x, z) + PLAYER_HEIGHT, z);
            velocity.set(0, 0, 0);
            diveDepth = 0;
            submerged = 0;
            waterState = 'land';
            if (faceX !== undefined) yaw = Math.atan2(-(faceX - x), -(faceZ - z));
            pitch = 0;
            if (riding) dismount();
            aboard = null;
            pilot = null;
        },
        getGroundNormal: () => getTerrainNormal(camera.position.x, camera.position.z),
    };
    return api;
}
