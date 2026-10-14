// Everything in the air: haze off the sea, sand lifting off the dune, fireflies in the
// grove, incense smoke, embers from the fires, and the monsoon squall that rolls in when
// you press C. All particle fields follow the camera so they never run out.
//
// Runs after SkyCycle each frame, because the squall overrides the fog SkyCycle just set.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';

function softSprite(inner = 'rgba(255,255,255,0.9)', outer = 'rgba(255,255,255,0)') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner);
    g.addColorStop(0.4, inner.replace(/[\d.]+\)$/, '0.35)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

function field(count, mat) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const pts = new THREE.Points(geo, mat);
    // Idle particles get parked off-screen; without this the bounding sphere is computed
    // from where they are parked and the whole field is culled the moment they move.
    pts.frustumCulled = false;
    return pts;
}

export function createAtmosphere(scene, camera) {
    const softTex = softSprite();
    const group = new THREE.Group();
    group.name = 'atmosphere';
    scene.add(group);

    // ── Airborne sand and salt haze: fine, always present, catches every beam ──
    // The `map` is not optional. A PointsMaterial without one draws a hard SQUARE, and
    // with additive blending against a bright sky that reads as a screen full of white
    // confetti — which is exactly what this looked like before the texture went on.
    const DUST = 900;
    const dustMat = new THREE.PointsMaterial({
        color: 0xe4d8bc, size: 0.16, map: softTex, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const dust = field(DUST, dustMat);
    const dustP = dust.geometry.attributes.position.array;
    const dustVel = [];
    for (let i = 0; i < DUST; i++) {
        dustP[i * 3] = (Math.random() - 0.5) * 300;
        dustP[i * 3 + 1] = Math.random() * 22;
        dustP[i * 3 + 2] = (Math.random() - 0.5) * 300;
        // The sea breeze blows onshore, so the drift has a bias in +X.
        dustVel.push({
            x: 0.45 + Math.random() * 0.5,
            y: 0.12 + Math.random() * 0.35,
            z: (Math.random() - 0.5) * 0.4,
        });
    }
    group.add(dust);

    // ── Fireflies, in the grove only ──
    const FLIES = 200;
    const flyMat = new THREE.PointsMaterial({
        color: 0xc8ff88, size: 0.3, map: softTex, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const flies = field(FLIES, flyMat);
    const flyP = flies.geometry.attributes.position.array;
    const flyData = [];
    for (let i = 0; i < FLIES; i++) {
        const z = (Math.random() - 0.5) * 560;
        // Well inland of the waterline — there are no fireflies over open sand.
        const x = shoreX(z) + 80 + Math.random() * 70;
        // A firefly only oscillates ±4.5 about its home point, so the ground under it is
        // effectively constant — sample it once rather than 200 times a frame.
        const groundY = getTerrainHeight(x, z);
        flyData.push({ x, z, groundY, phase: Math.random() * 100, hover: 1.2 + Math.random() * 4.5 });
        flyP[i * 3] = x;
        flyP[i * 3 + 1] = groundY + 2;
        flyP[i * 3 + 2] = z;
    }
    group.add(flies);

    // ── Sea haze ──
    // Big soft blobs sitting on the water at first light and after rain. NormalBlending
    // on purpose: additive turns it into glowing fog rather than moisture.
    const HAZE = 300;
    const hazeMat = new THREE.PointsMaterial({
        color: 0xd8d0c0, size: 30, map: softTex, transparent: true, opacity: 0.0,
        blending: THREE.NormalBlending, depthWrite: false,
    });
    const haze = field(HAZE, hazeMat);
    const hazeP = haze.geometry.attributes.position.array;
    const hazeData = [];
    for (let i = 0; i < HAZE; i++) {
        const z = (Math.random() - 0.5) * 620;
        const x = shoreX(z) - Math.random() * 150;
        hazeData.push({ drift: 0.5 + Math.random() * 1.2, phase: Math.random() * 40, lift: Math.random() * 6 });
        hazeP[i * 3] = x;
        hazeP[i * 3 + 1] = 2 + Math.random() * 5;
        hazeP[i * 3 + 2] = z;
    }
    group.add(haze);

    // ── Monsoon rain, only present during weather ──
    const RAIN = 3400;
    const rainMat = new THREE.PointsMaterial({
        color: 0xcfe0e8, size: 0.26, map: softTex, transparent: true, opacity: 0,
        blending: THREE.NormalBlending, depthWrite: false,
    });
    const rain = field(RAIN, rainMat);
    const rainP = rain.geometry.attributes.position.array;
    const rainData = [];
    for (let i = 0; i < RAIN; i++) {
        rainP[i * 3] = (Math.random() - 0.5) * 240;
        rainP[i * 3 + 1] = Math.random() * 80;
        rainP[i * 3 + 2] = (Math.random() - 0.5) * 240;
        rainData.push({
            // Tropical rain falls hard and nearly straight down.
            fall: 26 + Math.random() * 22,
            swayPhase: Math.random() * 30,
            swayAmp: 0.3 + Math.random() * 0.9,
            groundY: getTerrainHeight(rainP[i * 3], rainP[i * 3 + 2]),
        });
    }
    rain.visible = false;
    group.add(rain);

    // ── Embers drifting up out of the fires ──
    const EMBERS = 240;
    const emberMat = new THREE.PointsMaterial({
        color: 0xff8033, size: 0.18, map: softTex, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const embers = field(EMBERS, emberMat);
    const emberP = embers.geometry.attributes.position.array;
    let emberSources = [];
    const emberData = [];
    for (let i = 0; i < EMBERS; i++) {
        emberData.push({
            age: Math.random(), life: 2.5 + Math.random() * 3.5,
            sx: 0, sz: 0, sy: 0, drift: (Math.random() - 0.5) * 1.4,
        });
    }
    group.add(embers);

    // ── Weather state ──
    let stormLevel = 0;
    let stormTarget = 0;
    const fogColorStorm = new THREE.Color(0x8a9098);

    function toggleStorm() {
        stormTarget = stormTarget > 0.5 ? 0 : 1;
        return stormTarget > 0.5;
    }

    function setEmberSources(list) {
        emberSources = list;
        for (let i = 0; i < EMBERS; i++) {
            const s = emberSources.length ? emberSources[i % emberSources.length] : { x: 0, z: 0, y: 0 };
            emberData[i].sx = s.x; emberData[i].sz = s.z;
            emberData[i].sy = s.y ?? getTerrainHeight(s.x, s.z);
        }
    }

    const camPos = new THREE.Vector3();

    // Haze and rain genuinely drift, so their ground height cannot be cached once like
    // the fireflies'. Each particle re-samples on one frame in eight, staggered by index
    // so the cost is spread rather than spiked.
    const GROUND_REFRESH = 8;
    let frame = 0;

    function update(ctx) {
        frame++;
        const dt = Math.min(ctx.delta, 0.05);
        const t = ctx.time;
        const night = ctx.night ?? 1;
        const dawn = ctx.dawn ?? 0;
        camPos.copy(camera.position);

        stormLevel = THREE.MathUtils.lerp(stormLevel, stormTarget, dt * 0.38);
        if (stormLevel < 0.004) stormLevel = 0;

        // ── airborne sand ──
        const dp = dust.geometry.attributes.position.array;
        for (let i = 0; i < DUST; i++) {
            const v = dustVel[i];
            dp[i * 3] += (v.x + Math.sin(t * 0.4 + i) * 0.12 + stormLevel * 12) * dt;
            dp[i * 3 + 1] += v.y * dt;
            dp[i * 3 + 2] += (v.z + Math.cos(t * 0.3 + i) * 0.12) * dt;
            if (dp[i * 3 + 1] > 24) dp[i * 3 + 1] = 0.3;
            if (dp[i * 3] - camPos.x > 150) dp[i * 3] -= 300;
            if (dp[i * 3] - camPos.x < -150) dp[i * 3] += 300;
            if (dp[i * 3 + 2] - camPos.z > 150) dp[i * 3 + 2] -= 300;
            if (dp[i * 3 + 2] - camPos.z < -150) dp[i * 3 + 2] += 300;
        }
        dust.geometry.attributes.position.needsUpdate = true;
        dustMat.opacity = (0.12 + night * 0.14 + stormLevel * 0.18) * (1 - (ctx.submerged ?? 0));

        // ── fireflies ──
        if (night > 0.12) {
            flies.visible = true;
            const fp = flies.geometry.attributes.position.array;
            for (let i = 0; i < FLIES; i++) {
                const f = flyData[i];
                fp[i * 3] = f.x + Math.sin(t * 0.5 + f.phase) * 4.5;
                fp[i * 3 + 2] = f.z + Math.cos(t * 0.37 + f.phase * 1.3) * 4.5;
                fp[i * 3 + 1] = f.groundY + f.hover + Math.sin(t * 1.3 + f.phase) * 0.9;
            }
            flies.geometry.attributes.position.needsUpdate = true;
            flyMat.opacity = (0.3 + Math.sin(t * 1.7) * 0.16) * night * (1 - stormLevel * 0.85);
        } else {
            flies.visible = false;
        }

        // ── sea haze ──
        const hazeStrength = Math.max(dawn * 0.95, stormLevel * 0.7, night * 0.10);
        if (hazeStrength > 0.02) {
            haze.visible = true;
            const hp = haze.geometry.attributes.position.array;
            for (let i = 0; i < HAZE; i++) {
                const h = hazeData[i];
                // Onshore drift, like the dust.
                hp[i * 3] += h.drift * dt * (1 + stormLevel * 4);
                if (hp[i * 3] - camPos.x > 170) hp[i * 3] -= 340;
                if (hp[i * 3] - camPos.x < -170) hp[i * 3] += 340;
                if (hp[i * 3 + 2] - camPos.z > 310) hp[i * 3 + 2] -= 620;
                if (hp[i * 3 + 2] - camPos.z < -310) hp[i * 3 + 2] += 620;
                hp[i * 3 + 1] = 1.5 + h.lift + Math.sin(t * 0.25 + h.phase) * 1.5;
            }
            haze.geometry.attributes.position.needsUpdate = true;
            hazeMat.opacity = hazeStrength * 0.12;
        } else {
            haze.visible = false;
        }

        // ── rain ──
        if (stormLevel > 0.01) {
            rain.visible = true;
            const rp = rain.geometry.attributes.position.array;
            const wind = 9 * stormLevel;
            for (let i = 0; i < RAIN; i++) {
                const r = rainData[i];
                rp[i * 3] += (wind + Math.sin(t * 1.3 + r.swayPhase) * r.swayAmp) * dt;
                rp[i * 3 + 1] -= r.fall * dt * (0.5 + stormLevel);
                rp[i * 3 + 2] += Math.cos(t * 0.9 + r.swayPhase) * r.swayAmp * dt;

                if ((i & (GROUND_REFRESH - 1)) === (frame & (GROUND_REFRESH - 1))) {
                    r.groundY = getTerrainHeight(rp[i * 3], rp[i * 3 + 2]);
                }
                if (rp[i * 3 + 1] < r.groundY) {
                    rp[i * 3] = camPos.x + (Math.random() - 0.5) * 220;
                    rp[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * 220;
                    rp[i * 3 + 1] = camPos.y + 40 + Math.random() * 45;
                    r.groundY = getTerrainHeight(rp[i * 3], rp[i * 3 + 2]);
                }
                if (rp[i * 3] - camPos.x > 120) rp[i * 3] -= 240;
                if (rp[i * 3] - camPos.x < -120) rp[i * 3] += 240;
                if (rp[i * 3 + 2] - camPos.z > 120) rp[i * 3 + 2] -= 240;
                if (rp[i * 3 + 2] - camPos.z < -120) rp[i * 3 + 2] += 240;
            }
            rain.geometry.attributes.position.needsUpdate = true;
            rainMat.opacity = Math.min(stormLevel * 0.8, 0.75);
        } else {
            rain.visible = false;
        }

        // ── embers ──
        if (emberSources.length) {
            const ep = embers.geometry.attributes.position.array;
            for (let i = 0; i < EMBERS; i++) {
                const e = emberData[i];
                e.age += dt / e.life;
                if (e.age >= 1) {
                    e.age = 0;
                    const s = emberSources[Math.floor(Math.random() * emberSources.length)];
                    e.sx = s.x; e.sz = s.z; e.sy = s.y ?? getTerrainHeight(s.x, s.z);
                    e.drift = (Math.random() - 0.5) * 1.6;
                }
                const a = e.age;
                ep[i * 3] = e.sx + Math.sin(t * 1.6 + i) * 1.4 + e.drift * a * 9 + a * 4;
                ep[i * 3 + 1] = e.sy + 0.5 + a * 11;
                ep[i * 3 + 2] = e.sz + Math.cos(t * 1.3 + i) * 1.4;
            }
            embers.geometry.attributes.position.needsUpdate = true;
            emberMat.opacity = (0.45 + Math.sin(t * 3) * 0.12) * (1 - stormLevel * 0.7);
        }

        // ── fog takeover during the squall ──
        // A real whiteout comes from the fog, not the particles. The sea going grey and
        // the horizon closing in is most of what sells it.
        if (scene.fog && stormLevel > 0.005) {
            scene.fog.color.lerp(fogColorStorm, stormLevel * 0.8);
            scene.fog.density = scene.fog.density * (1 - stormLevel) + 0.020 * stormLevel;
            if (scene.background && scene.background.isColor) {
                scene.background.lerp(fogColorStorm, stormLevel * 0.8);
            }
        }
    }

    return {
        update, toggleStorm, setEmberSources,
        getStormLevel: () => stormLevel,
        isStorming: () => stormTarget > 0.5,
    };
}
