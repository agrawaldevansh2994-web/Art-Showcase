// GLOWING FOOTPRINTS — Bay, 2026-10-07. Walk the wet sand and each step squeezes the
// plankton stranded in it: a pale blue print that flares and fades over ~10 s, like the
// real thing. One instanced draw, ring buffer of 160 prints, only on the wet band just
// above the waterline (dry sand upslope stays dark).

import * as THREE from 'three';
import { getTerrainHeight } from './Terrain.js';

const N = 160;

export function createFootprints(scene, { ocean, controls, camera }) {
    const geo = new THREE.PlaneGeometry(0.16, 0.3);
    geo.rotateX(-Math.PI / 2);
    const born = new Float32Array(N).fill(-100);
    geo.setAttribute('aBorn', new THREE.InstancedBufferAttribute(born, 1));
    const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNight: { value: 1 } },
        vertexShader: /* glsl */`
            attribute float aBorn; uniform float uTime;
            varying vec2 vUv; varying float vAge;
            void main(){ vUv = uv; vAge = uTime - aBorn;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`
            uniform float uNight; varying vec2 vUv; varying float vAge;
            float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main(){
                vec2 p = vUv - 0.5; p.x *= 1.9;
                // a sole and a heel
                float sole = smoothstep(0.5, 0.3, length(p - vec2(0.0, 0.12)) * 1.6);
                float heel = smoothstep(0.5, 0.3, length(p + vec2(0.0, 0.22)) * 2.2);
                float shape = max(sole, heel);
                float grain = 0.55 + 0.45 * hash(floor(vUv * 14.0));
                float life = smoothstep(0.0, 0.15, vAge) * exp(-vAge * 0.28) * (1.0 + 1.5 * exp(-vAge * 3.0));
                float a = shape * grain * life * uNight;
                gl_FragColor = vec4(vec3(0.35, 0.85, 1.0) * a * 1.4, a);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.frustumCulled = false;
    mesh.name = 'footprints';
    const park = new THREE.Matrix4().makeTranslation(0, -500, 0);
    for (let i = 0; i < N; i++) mesh.setMatrixAt(i, park);
    scene.add(mesh);

    let cursor = 0, side = 1, lastX = camera.position.x, lastZ = camera.position.z, acc = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

    function update(ctx) {
        mat.uniforms.uTime.value = ctx.time;
        mat.uniforms.uNight.value = ctx.night ?? 1;
        const x = camera.position.x, z = camera.position.z;
        const dx = x - lastX, dz = z - lastZ;
        const step = Math.hypot(dx, dz);
        lastX = x; lastZ = z;
        if (step > 3 || controls.isPiloting?.() || controls.isAboard?.()) { acc = 0; return; }
        acc += step;
        if (acc < 0.75) return;
        acc = 0;
        const g = getTerrainHeight(x, z), above = g - ocean.getSeaLevel();
        if (above < -0.25 || above > 0.9) return;           // wet band only
        const yaw = Math.atan2(dx, dz);
        side = -side;
        const ox = Math.cos(yaw) * 0.13 * side, oz = -Math.sin(yaw) * 0.13 * side;
        p.set(x + ox, getTerrainHeight(x + ox, z + oz) + 0.025, z + oz);
        q.setFromAxisAngle(up, yaw);
        m.compose(p, q, s);
        mesh.setMatrixAt(cursor, m);
        born[cursor] = ctx.time;
        mesh.instanceMatrix.needsUpdate = true;
        geo.attributes.aBorn.needsUpdate = true;
        cursor = (cursor + 1) % N;
    }
    return { update };
}
