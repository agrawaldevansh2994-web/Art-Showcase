// JELLYFISH + UNDERWATER PLANKTON — Bay M4 (2026-10-07).
//
// Glowing moon/comb jellies hanging under the water: a cluster under the DJ raft, the
// rest drifting across the bay. Two instanced draws (bells, tentacles) on one additive
// shader each — no lights. Bells pulse (contract → push up a little → relax and sink),
// tentacles trail and sway in the vertex shader.
//
// From above the ocean surface is ~88% opaque, so the nearest jellies also hand their
// positions to the ocean (ocean.setJellies): it thins the water and adds a soft violet-
// blue patch above each, so you see them glowing through the surface from the raft.
//
// Underwater (controls submerged > 0) a cloud of plankton specks fills the water around
// the camera, wrapping so it never runs out, swirling away from you as you swim — the
// "glow from below" view.

import * as THREE from 'three';
import { getTerrainHeight } from './Terrain.js';
import { DJ_RAFT } from './constants.js';

const N = 46;           // jellies
const TENT = 7;         // tentacles per jelly
const SURFACE_N = 16;   // how many the ocean is told about (nearest to the camera)

export function createJellyfish(scene, { ocean, camera }) {
    // ── placement ──
    const jel = [];
    function deepEnough(x, z) { return ocean.depthAt(x, z) > 3.2; }
    let tries = 0;
    while (jel.length < N && tries++ < 4000) {
        let x, z;
        if (jel.length < 16) {                       // the raft cluster
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 16;
            x = DJ_RAFT.x + Math.cos(a) * r; z = DJ_RAFT.z + Math.sin(a) * r;
        } else {
            x = -170 + Math.random() * 150; z = -150 + Math.random() * 300;
        }
        if (!deepEnough(x, z)) continue;
        const floorDepth = ocean.depthAt(x, z);
        jel.push({
            x, z, x0: x, z0: z,
            d: 0.6 + Math.random() * Math.min(3.2, floorDepth - 1.4),    // below surface
            s: 0.35 + Math.random() * 0.45,                                  // bell radius
            ph: Math.random() * 10, rate: 0.55 + Math.random() * 0.4,
            hue: Math.random(),
            drift: Math.random() * Math.PI * 2,
        });
    }
    const count = jel.length;

    // ── bells ──
    const bellGeo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const bellPhase = new Float32Array(count), bellHue = new Float32Array(count);
    jel.forEach((j, i) => { bellPhase[i] = j.ph; bellHue[i] = j.hue; });
    bellGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(bellPhase, 1));
    bellGeo.setAttribute('aHue', new THREE.InstancedBufferAttribute(bellHue, 1));

    const uniforms = { uTime: { value: 0 }, uNight: { value: 1 }, uUnder: { value: 0 }, uSea: { value: 0 } };
    const bellMat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */`
            attribute float aPhase; attribute float aHue;
            uniform float uTime;
            varying float vRim; varying float vHue; varying float vY; varying float vPulse; varying float vWy;
            void main(){
                float p = sin(uTime * 2.2 + aPhase * 6.0);
                float squeeze = 0.5 + 0.5 * p;                       // 1 = contracted
                vec3 pos = position;
                pos.xz *= 1.0 - squeeze * 0.22;
                pos.y *= 1.0 + squeeze * 0.18;
                // frilled skirt
                float rim = 1.0 - smoothstep(0.0, 0.45, pos.y);
                pos.xz *= 1.0 + rim * 0.06 * sin(atan(position.z, position.x) * 12.0 + uTime * 3.0);
                vec4 mv = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
                vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
                vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
                vHue = aHue; vY = position.y; vPulse = squeeze;
                vWy = (modelMatrix * instanceMatrix * vec4(pos, 1.0)).y;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            uniform float uNight, uUnder, uSea;
            varying float vRim; varying float vHue; varying float vY; varying float vPulse; varying float vWy;
            void main(){
                vec3 blue = vec3(0.25, 0.75, 1.0), violet = vec3(0.65, 0.4, 1.0), teal = vec3(0.2, 1.0, 0.85);
                vec3 c = vHue < 0.5 ? mix(blue, teal, vHue * 2.0) : mix(blue, violet, (vHue - 0.5) * 2.0);
                float rim = pow(vRim, 1.6);
                float rings = 0.5 + 0.5 * sin(vY * 40.0);
                float a = (0.18 + rim * 0.9 + rings * 0.08 + smoothstep(0.4, 0.0, vY) * 0.4) * (0.75 + vPulse * 0.5);
                a *= (0.25 + uNight * 0.75) * (1.0 + uUnder * 0.6);
                // seen from above, deeper ones fade into the water
                a *= mix(exp(-max(uSea - vWy, 0.0) * 0.45), 1.0, uUnder);
                gl_FragColor = vec4(c * a * 1.4, a);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, fog: false,
    });
    const bells = new THREE.InstancedMesh(bellGeo, bellMat, count);
    bells.frustumCulled = false;
    bells.renderOrder = 0;
    bells.name = 'jellyBells';
    scene.add(bells);

    // ── tentacles: a thin ribbon each, swaying in the shader ──
    const tentGeo = new THREE.PlaneGeometry(0.035, 1, 1, 10);
    tentGeo.translate(0, -0.5, 0);                    // hangs down from y=0
    const tCount = count * TENT;
    const tPhase = new Float32Array(tCount), tHue = new Float32Array(tCount);
    for (let i = 0; i < tCount; i++) { tPhase[i] = jel[(i / TENT) | 0].ph + (i % TENT) * 0.7; tHue[i] = jel[(i / TENT) | 0].hue; }
    tentGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(tPhase, 1));
    tentGeo.setAttribute('aHue', new THREE.InstancedBufferAttribute(tHue, 1));
    const tentMat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */`
            attribute float aPhase; attribute float aHue;
            uniform float uTime;
            varying float vT; varying float vHue; varying float vWy;
            void main(){
                vec3 pos = position;
                float t = -pos.y;                                  // 0 at bell, 1 at tip
                pos.x += sin(uTime * 1.3 + aPhase + t * 4.0) * 0.18 * t;
                pos.z += cos(uTime * 1.1 + aPhase * 1.3 + t * 3.0) * 0.14 * t;
                vT = t; vHue = aHue;
                vWy = (modelMatrix * instanceMatrix * vec4(pos, 1.0)).y;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
            }`,
        fragmentShader: /* glsl */`
            uniform float uNight, uUnder, uSea;
            varying float vT; varying float vHue; varying float vWy;
            void main(){
                vec3 c = mix(vec3(0.3, 0.8, 1.0), vec3(0.75, 0.5, 1.0), vHue);
                float a = (1.0 - vT) * 0.55 * (0.25 + uNight * 0.75) * (1.0 + uUnder * 0.5);
                a *= mix(exp(-max(uSea - vWy, 0.0) * 0.45), 1.0, uUnder);
                gl_FragColor = vec4(c * a, a);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, fog: false,
    });
    const tents = new THREE.InstancedMesh(tentGeo, tentMat, tCount);
    tents.frustumCulled = false;
    tents.renderOrder = 0;
    tents.name = 'jellyTentacles';
    scene.add(tents);

    // ── underwater plankton cloud around the camera ──
    const P = 1400, BOX = 26;
    const pPos = new Float32Array(P * 3), pRnd = new Float32Array(P);
    for (let i = 0; i < P; i++) {
        pPos[i * 3] = (Math.random() - 0.5) * BOX; pPos[i * 3 + 1] = (Math.random() - 0.5) * BOX * 0.5; pPos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
        pRnd[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aRnd', new THREE.BufferAttribute(pRnd, 1));
    const pUni = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uUnder: { value: 0 }, uSea: { value: 0 }, uStir: { value: 0 } };
    const pMat = new THREE.ShaderMaterial({
        uniforms: pUni,
        vertexShader: /* glsl */`
            attribute float aRnd;
            uniform float uTime, uUnder, uSea, uStir; uniform vec3 uCam;
            varying float vA;
            void main(){
                vec3 box = vec3(${BOX.toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, ${BOX.toFixed(1)});
                vec3 p = position + vec3(sin(uTime * 0.2 + aRnd * 30.0), sin(uTime * 0.15 + aRnd * 9.0) * 0.4, cos(uTime * 0.18 + aRnd * 20.0)) * 0.6;
                p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;   // wrap around the camera
                float below = smoothstep(0.05, 0.5, uSea - p.y);
                float dist = length(p - uCam);
                // brighter close to you while you are moving: you stir them up
                float stir = uStir * smoothstep(5.0, 0.8, dist);
                float tw = pow(0.5 + 0.5 * sin(uTime * (1.0 + aRnd * 4.0) + aRnd * 60.0), 3.0);
                vA = uUnder * below * (0.15 + tw * 0.6 + stir) * smoothstep(${(BOX * 0.5).toFixed(1)}, 4.0, dist);
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = clamp((1.5 + aRnd * 2.5) * 40.0 / -mv.z, 1.0, 9.0);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying float vA;
            void main(){
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.0, d) * vA;
                gl_FragColor = vec4(vec3(0.35, 0.85, 1.0) * a * 1.5, a);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const cloud = new THREE.Points(pGeo, pMat);
    cloud.frustumCulled = false;
    cloud.name = 'underwaterPlankton';
    scene.add(cloud);

    // ── per-frame ──
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Euler();
    const lastCam = new THREE.Vector3();
    const near = new Array(count).fill(0).map((_, i) => i);
    const surface = new Float32Array(SURFACE_N * 4);

    function update(ctx) {
        const t = ctx.time, dt = Math.min(ctx.delta, 0.05);
        const sea = ocean.getSeaLevel();
        uniforms.uTime.value = t;
        uniforms.uNight.value = ctx.night ?? 1;
        uniforms.uUnder.value = ctx.submerged ?? 0;
        uniforms.uSea.value = sea;

        for (let i = 0; i < count; i++) {
            const j = jel[i];
            // slow wander, tethered to home
            j.drift += (Math.sin(t * 0.07 + j.ph) * 0.3) * dt;
            j.x += Math.cos(j.drift) * 0.12 * dt + (j.x0 - j.x) * 0.002;
            j.z += Math.sin(j.drift) * 0.12 * dt + (j.z0 - j.z) * 0.002;
            const p = Math.sin(t * 2.2 + j.ph * 6.0);
            const bob = Math.sin(t * 0.5 + j.ph) * 0.25 + p * 0.06;
            const y = sea - j.d + bob;
            tilt.set(Math.sin(t * 0.3 + j.ph) * 0.15, 0, Math.cos(t * 0.27 + j.ph) * 0.15);
            q.setFromEuler(tilt);
            sc.set(j.s, j.s * 0.8, j.s);
            pos.set(j.x, y, j.z);
            m.compose(pos, q, sc);
            bells.setMatrixAt(i, m);
            for (let k = 0; k < TENT; k++) {
                const a = (k / TENT) * Math.PI * 2;
                const r = j.s * (k === 0 ? 0 : 0.55);
                pos.set(j.x + Math.cos(a) * r, y + j.s * 0.05, j.z + Math.sin(a) * r);
                sc.set(k === 0 ? 3 : 1, j.s * (k === 0 ? 2.2 : 3.4 + (k % 3) * 0.6), 1);
                m.compose(pos, q, sc);
                tents.setMatrixAt(i * TENT + k, m);
            }
            j.y = y;
        }
        bells.instanceMatrix.needsUpdate = true;
        tents.instanceMatrix.needsUpdate = true;

        // Tell the ocean about the nearest few so it can show them through the surface.
        const cx = camera.position.x, cz = camera.position.z;
        near.sort((a, b) => ((jel[a].x - cx) ** 2 + (jel[a].z - cz) ** 2) - ((jel[b].x - cx) ** 2 + (jel[b].z - cz) ** 2));
        for (let k = 0; k < SURFACE_N; k++) {
            const j = jel[near[k]];
            surface[k * 4] = j.x; surface[k * 4 + 1] = j.z; surface[k * 4 + 2] = Math.max(0.2, sea - j.y); surface[k * 4 + 3] = j.s;
        }
        ocean.setJellies?.(surface);

        // underwater cloud
        const speed = lastCam.distanceTo(camera.position) / Math.max(dt, 1e-3);
        lastCam.copy(camera.position);
        pUni.uTime.value = t;
        pUni.uCam.value.copy(camera.position);
        pUni.uUnder.value = ctx.submerged ?? 0;
        pUni.uSea.value = sea;
        pUni.uStir.value += (THREE.MathUtils.clamp(speed / 3, 0, 1.5) - pUni.uStir.value) * Math.min(1, dt * 4);
        cloud.visible = (ctx.submerged ?? 0) > 0.01;
    }

    return { update };
}
