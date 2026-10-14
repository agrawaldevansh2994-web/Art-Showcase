// SURF BREAK v2 — Bay, 2026-10-07.
// v1 was three glowing ribbons; Devansh: "reads very basic… I want big waves with proper
// surfing". v2:
//   • Big waves (up to ~4.5 m) built from a real cross-section: a long back slope, a
//     crest, and a lip that throws forward into a barrel, with the inside wall as its
//     own sheet. They shoal as they come in, stand up, curl, and break into whitewater.
//   • The break PEELS: the breaking point runs north → south along the beach at about
//     surfing speed, so there is always a pocket to ride ahead of the whitewater.
//   • Riding: pop up (eye rises, board under you), W/S climb and drop the face, A/D
//     carve, Shift pumps. Stay just ahead of the curl to get barrelled; too deep and
//     the whitewater takes you. Every ride is scored (time + barrel time).
//   • A rack with a glowing SURF sign and a light beacon, NPC surfers in the pocket of
//     every wave, and broken water feeding the ocean's glitter trail ring.
// Geometry is rebuilt on the CPU each frame: 3 waves × 120 × ~48 verts (+ normals), plus a
// 900-droplet spray pool (2026-10-09 polish).

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';

export const SURF = { z0: -120, z1: -44 };
const ZL = SURF.z1 - SURF.z0;
const NZ = 120;
const START_D = 92, SPEED = 5.2, INTERVAL = 9.5, HMAX = 4.4, XS = 2.3;   // XS: cross-section stretch
const BREAK_N = 58, BREAK_S = 14;            // breaking distance at the north / south end

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
const lerp = (a, b, t) => a + (b - a) * t;

// Cross-section, in units of wave height. s > 0 is toward the beach.
const BACK = [[-3.2, 0], [-2.4, 0.12], [-1.7, 0.3], [-1.1, 0.55], [-0.6, 0.8], [-0.25, 0.95], [0, 1.0]];
const LIP_FLAT = [[0.22, 0.9], [0.36, 0.7], [0.46, 0.45], [0.52, 0.2], [0.56, 0.0]];
const LIP_CURL = [[0.42, 1.05], [0.82, 0.98], [1.08, 0.78], [1.2, 0.52], [1.22, 0.3]];
const FACE = [[0.62, 0.0], [0.36, 0.22], [0.2, 0.48], [0.16, 0.72], [0.22, 0.92]];
// Polish 2026-10-09: the 12-point profile read as facets up close. Densify it with a
// Catmull-Rom pass (same count for the flat and curled lips, so they still blend point for
// point) and shade with real normals.
function densify(pts, k) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let j = 0; j < k; j++) {
            const t = j / k, t2 = t * t, t3 = t2 * t;
            out.push([0, 1].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
        }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
}
const PROF_FLAT = densify([...BACK, ...LIP_FLAT], 3);
const PROF_CURL = densify([...BACK, ...LIP_CURL], 3);
const FACE_D = densify(FACE, 3);
const NB = PROF_FLAT.length, NF = FACE_D.length;

export function createSurf(scene, { ocean, controls, audio, ui }) {
    const root = new THREE.Group();
    root.name = 'surf';
    scene.add(root);

    const breakD = (z) => lerp(BREAK_N, BREAK_S, (z - SURF.z0) / ZL);
    /** Peel point: where along the beach this wave is breaking right now. */
    const peelZ = (d) => SURF.z0 + (BREAK_N - d) / (BREAK_N - BREAK_S) * ZL;

    function state(w, z) {
        const edge = smooth(SURF.z0, SURF.z0 + 10, z) * (1 - smooth(SURF.z1 - 10, SURF.z1, z));
        const grow = smooth(START_D, START_D - 34, w.d);
        const bd = breakD(z);
        const curl = smooth(bd + 12, bd, w.d);                 // 0 → 1 as the lip throws
        const broken = smooth(bd, bd - 7, w.d);                // 0 → 1 as it closes out
        const h = HMAX * w.size * edge * grow * (1 - broken * 0.72);
        return { h, curl: curl * (1 - broken), broken, edge };
    }

    // ── material ──
    const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNight: { value: 1 } },
        vertexShader: /* glsl */`
            attribute float aU; attribute float aGlow; attribute float aIn;
            varying float vU; varying float vGlow; varying float vIn; varying vec3 vW; varying vec3 vN;
            void main(){
                vU = aU; vGlow = aGlow; vIn = aIn;
                vN = normalize(mat3(modelMatrix) * normal);
                vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
                gl_Position = projectionMatrix * viewMatrix * w;
            }`,
        fragmentShader: /* glsl */`
            uniform float uTime, uNight;
            varying float vU; varying float vGlow; varying float vIn; varying vec3 vW; varying vec3 vN;
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
                return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
            void main(){
                vec3 deep = vec3(0.003, 0.025, 0.045), face = vec3(0.01, 0.11, 0.18);
                // translucent wall: lighter as it thins toward the lip
                vec3 col = mix(deep, face, smoothstep(0.2, 0.75, vU));
                // streaks running up the face
                float streak = noise(vec2(vW.z * 1.3, vW.y * 6.0 - uTime * 1.5));
                col += vec3(0.03, 0.16, 0.22) * streak * smoothstep(0.35, 0.8, vU) * 0.4;
                // the lip line and the curling lip: hot cyan
                float lip = (smoothstep(0.66, 0.8, vU) * 0.6 + exp(-pow((vU - 0.86) / 0.05, 2.0)) * 1.4) * (0.5 + vGlow);
                // sparkle: plankton lit by the moving water
                // round points, not cells (cells read as squares at grazing angles)
                vec2 q = vec2(vW.z * 4.0, vW.y * 5.0 + vW.x * 2.0);
                vec2 c = floor(q), f = fract(q) - 0.5 - (vec2(hash(c + 3.1), hash(c + 9.7)) - 0.5) * 0.6;
                float sp = step(0.93, hash(c)) * smoothstep(0.22, 0.04, length(f)) * (0.5 + 0.5 * sin(uTime * 4.0 + hash(c + 7.0) * 50.0));
                // foam on broken water
                float foam = vGlow * smoothstep(0.4, 1.0, vU) * (0.3 + 0.7 * noise(vW.xz * 1.8 + uTime * vec2(0.4, 0.9)));
                vec3 glow = vec3(0.3, 0.88, 1.0);
                vec3 add = glow * (lip * 0.55 + sp * (0.35 + vGlow * 0.6) + foam * 0.6);
                // inside the barrel: the wall glows from within
                add += vIn * glow * (0.25 + 0.6 * noise(vec2(vW.z * 0.8 - uTime * 2.0, vW.y * 3.0))) * 0.45;
                // real shape: fresnel sheen + a moon glint, so the face reads as a curved wall
                vec3 V = normalize(cameraPosition - vW);
                vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
                float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
                vec3 L = normalize(vec3(-0.5, 0.55, 0.35));
                float spec = pow(max(dot(reflect(-L, N), V), 0.0), 40.0);
                col = col * (0.75 + 0.35 * max(dot(N, L), 0.0)) + vec3(0.12, 0.35, 0.45) * fres * 0.55 + vec3(0.55, 0.75, 0.85) * spec * 0.35;
                col += add * (0.35 + uNight * 0.85);
                float a = mix(0.9, 0.97, vU) * smoothstep(0.0, 0.08, vU + vIn);
                gl_FragColor = vec4(col, a);
            }`,
        transparent: true, depthWrite: true, side: THREE.DoubleSide,
    });

    function makeSheet(nu, inside) {
        const geo = new THREE.BufferGeometry();
        const n = NZ * nu;
        const pos = new Float32Array(n * 3), aU = new Float32Array(n), aGlow = new Float32Array(n), aIn = new Float32Array(n);
        const idx = [];
        for (let zi = 0; zi < NZ; zi++) for (let ui = 0; ui < nu; ui++) { aU[zi * nu + ui] = ui / (nu - 1); aIn[zi * nu + ui] = inside ? 1 : 0; }
        for (let zi = 0; zi < NZ - 1; zi++) for (let ui = 0; ui < nu - 1; ui++) {
            const a = zi * nu + ui, b = a + 1, c = a + nu, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
        geo.setAttribute('aGlow', new THREE.BufferAttribute(aGlow, 1));
        geo.setAttribute('aIn', new THREE.BufferAttribute(aIn, 1));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        root.add(mesh);
        return { mesh, geo, pos, aGlow, aIn, nu, inside };
    }

    // ── spray: glowing droplets off the lip, the whitewater and your board ──
    const SPN = 900;
    const spPos = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN), spA = new Float32Array(SPN);
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    spGeo.setAttribute('aA', new THREE.BufferAttribute(spA, 1));
    const spMat = new THREE.ShaderMaterial({
        uniforms: { uNight: { value: 1 } },
        vertexShader: /* glsl */`
            attribute float aA; varying float vA;
            void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = clamp(90.0 / -mv.z, 1.5, 9.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */`
            uniform float uNight; varying float vA;
            void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
                float a = smoothstep(0.5, 0.0, d) * vA;
                gl_FragColor = vec4(vec3(0.45, 0.92, 1.0) * (0.5 + uNight * 0.8) * a, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const spray = new THREE.Points(spGeo, spMat);
    spray.frustumCulled = false; spray.renderOrder = 3;
    root.add(spray);
    let spHead = 0;
    function emitSpray(x, y, z, up, fwd) {
        const i = spHead; spHead = (spHead + 1) % SPN;
        spPos[i * 3] = x + (Math.random() - 0.5) * 0.6; spPos[i * 3 + 1] = y; spPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
        spVel[i * 3] = fwd * (0.6 + Math.random() * 0.6);          // +X is toward the beach
        spVel[i * 3 + 1] = up * (0.5 + Math.random() * 0.7);
        spVel[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
        spLife[i] = 0.8 + Math.random() * 0.7;
    }
    function updateSpray(dt, sea) {
        for (let i = 0; i < SPN; i++) {
            if (spLife[i] <= 0) { spA[i] = 0; continue; }
            spLife[i] -= dt;
            spVel[i * 3 + 1] -= 9.8 * dt;
            spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
            if (spPos[i * 3 + 1] < sea) spLife[i] = 0;
            spA[i] = Math.max(0, Math.min(1, spLife[i] * 1.6)) * 0.85;
        }
        spGeo.attributes.position.needsUpdate = true;
        spGeo.attributes.aA.needsUpdate = true;
    }

    const waves = [];
    for (let i = 0; i < 3; i++) {
        waves.push({ back: makeSheet(NB, false), face: makeSheet(NF, true), d: 30 + i * SPEED * INTERVAL, size: 1, splashT: 0, id: i });
    }

    function buildWave(w, sea) {
        const B = w.back, F = w.face;
        for (let zi = 0; zi < NZ; zi++) {
            const z = SURF.z0 + (zi / (NZ - 1)) * ZL;
            const sx = shoreX(z);
            const st = state(w, z);
            const h = st.h, c = st.curl, bk = st.broken;
            const glow = st.edge * (0.12 + c * 0.45 + bk * 0.55);
            // whitewater: the profile slumps and spreads
            const slump = 1 - bk * 0.45;
            let k = zi * B.nu;
            for (let j = 0; j < NB; j++, k++) {
                const a = PROF_FLAT[j], b = PROF_CURL[j];
                const s = lerp(a[0], b[0], c), y = lerp(a[1], b[1], c);
                const dist = w.d - s * h * XS * slump;
                B.pos[k * 3] = sx - dist; B.pos[k * 3 + 1] = sea + 0.05 + y * h * slump; B.pos[k * 3 + 2] = z;
                B.aGlow[k] = glow;
            }
            k = zi * F.nu;
            for (let j = 0; j < NF; j++, k++) {
                const [s0, y] = FACE_D[j];
                const s = lerp(LIP_FLAT[LIP_FLAT.length - 1][0], s0, c);
                const dist = w.d - s * h * XS * slump;
                // with no curl the face sheet folds flat onto the front of the back sheet
                F.pos[k * 3] = sx - dist; F.pos[k * 3 + 1] = sea + 0.04 + y * h * slump * c; F.pos[k * 3 + 2] = z;
                F.aGlow[k] = glow * c;
            }
        }
        for (const S of [B, F]) {
            S.geo.attributes.position.needsUpdate = true;
            S.geo.attributes.aGlow.needsUpdate = true;
            S.geo.computeVertexNormals();
        }
        // spray off the throwing lip and the whitewater
        w.sprayAcc = (w.sprayAcc || 0) + 1;
        for (let n = 0; n < 5; n++) {
            const zi = 2 + Math.floor(Math.random() * (NZ - 4));
            const z = SURF.z0 + (zi / (NZ - 1)) * ZL;
            const st = state(w, z);
            const hot = Math.max(st.curl, st.broken * 0.8) * st.edge;
            if (hot < 0.35 || st.h < 0.8 || Math.random() > hot) continue;
            const k = (zi * B.nu + B.nu - 1) * 3;
            emitSpray(B.pos[k], B.pos[k + 1], B.pos[k + 2], 1.5 + st.h * 0.6, 1.2 + st.h * 0.5 * (1 - st.broken));
        }
    }

    // ── boards and figures ──
    function buildBoard(color) {
        const g = new THREE.Group();
        const shape = new THREE.Shape();
        shape.moveTo(-1.05, 0);
        shape.bezierCurveTo(-1.05, 0.3, 0.6, 0.32, 1.15, 0);
        shape.bezierCurveTo(0.6, -0.32, -1.05, -0.3, -1.05, 0);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 14 });
        geo.rotateX(-Math.PI / 2);
        const board = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: new THREE.Color(color).multiplyScalar(0.08) }));
        g.add(board);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.012, 0.04), new THREE.MeshBasicMaterial({ color: 0x6fe4ff, fog: false }));
        stripe.position.y = 0.105;
        g.add(stripe);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        fin.position.set(-0.85, -0.06, 0);
        g.add(fin);
        return g;
    }
    function buildSurfer() {
        const g = new THREE.Group();
        const suit = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.7, emissive: 0x0a1418 });
        const skin = new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.8, emissive: 0x120c08 });
        const legF = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.62, 3, 6), suit); legF.position.set(0.32, 0.45, 0); legF.rotation.z = 0.4;
        const legB = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.62, 3, 6), suit); legB.position.set(-0.3, 0.45, 0); legB.rotation.z = -0.4;
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8), suit); torso.position.set(0.05, 1.08, 0.05); torso.rotation.x = 0.25;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), skin); head.position.set(0.12, 1.5, 0.12);
        const armF = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.6, 2, 5), suit); armF.position.set(0.48, 1.25, 0.05); armF.rotation.z = 1.2;
        const armB = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.6, 2, 5), suit); armB.position.set(-0.38, 1.2, 0.05); armB.rotation.z = -1.0;
        g.add(legF, legB, torso, head, armF, armB);
        return g;
    }

    // Rack + sign + beacon on the sand, middle of the break.
    const rackZ = -78;
    const rackX = shoreX(rackZ) + 6;
    const rackY = getTerrainHeight(rackX, rackZ);
    const rack = new THREE.Group();
    rack.position.set(rackX, rackY, rackZ);
    const COLORS = [0xf2efe6, 0xe8d24a, 0x2ab8c8, 0xe86a2a, 0xff5fa8];
    COLORS.forEach((c, i) => {
        const b = buildBoard(c);
        b.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.15);
        b.position.set(0, 1.1, (i - 2) * 0.55);
        rack.add(b);
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), new THREE.MeshStandardMaterial({ color: 0x5a4030 }));
    bar.position.set(0.25, 1.4, 0);
    rack.add(bar);
    const signTex = (() => {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
        const k = cv.getContext('2d');
        k.fillStyle = 'rgba(0,0,0,0)'; k.fillRect(0, 0, 256, 96);
        k.font = '800 64px system-ui, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle';
        k.shadowColor = '#40e8ff'; k.shadowBlur = 18; k.fillStyle = '#bff6ff'; k.fillText('SURF', 128, 50);
        return new THREE.CanvasTexture(cv);
    })();
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false, fog: false }));
    sign.scale.set(3.6, 1.35, 1);
    sign.position.set(0, 3.4, 0);
    rack.add(sign);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x5ae8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 40, 10, 1, true), beaconMat);
    beacon.position.set(0, 20, 0);
    rack.add(beacon);
    root.add(rack);

    for (const swim of [false, true]) {
        controls.addInteractable({
            x: rackX, z: rackZ, radius: 5.5, swim, prompt: 'E  GRAB A SURFBOARD',
            enabled: () => !me, onInteract: () => start(), owner: 'surf',
        });
    }

    const myBoard = buildBoard(0xe8d24a);
    myBoard.visible = false;
    root.add(myBoard);

    // NPC surfers ride the pocket of each wave.
    const npc = waves.map((w, i) => {
        const g = new THREE.Group();
        g.add(buildBoard(COLORS[(i + 1) % COLORS.length]));
        const s = buildSurfer(); s.position.y = 0.08; g.add(s);
        g.visible = false;
        root.add(g);
        return { g, lag: 2 + i * 1.5, src: 'surfNpc' + i };
    });

    // ── player ──
    let me = null;
    let nowT = 0, best = 0;
    const tmp = new THREE.Vector3();

    function start() {
        let dist = 1.5;
        while (ocean.depthAt(shoreX(rackZ) - dist, rackZ) < 0.6 && dist < 25) dist += 0.5;
        me = { dist, z: rackZ, heading: Math.PI, speed: 0, mode: 'paddle', wave: null, vz: 0, f: 0.5, roll: 0, eye: 0.6, rideT: 0, barrelT: 0, score: 0 };
        myBoard.visible = true;
        controls.setPilot(pilot, Math.PI / 2);
        ui.toast('BOARD IN HAND — PADDLE OUT PAST THE WHITEWATER');
        audio.sfx?.('splash', { gain: 0.3 });
    }
    function stop() {
        const x = shoreX(me.z) - me.dist;
        const deep = ocean.depthAt(x, me.z) > 1.2;
        controls.clearPilot(x, me.z, deep);
        myBoard.visible = false;
        me = null;
        ui.toast('BOARD BACK ON THE RACK');
    }
    function endRide(msg) {
        const pts = Math.round(me.rideT * 10 + me.barrelT * 60);
        best = Math.max(best, pts);
        ui.toast(`${msg} — ${me.rideT.toFixed(1)}s ride · ${me.barrelT.toFixed(1)}s barrel · ${pts} pts`, 4200);
        me.mode = 'paddle'; me.wave = null; me.speed = 0.4; me.heading = Math.PI * 0.95; me.roll = 0;
        audio.sfx?.('splash', { gain: 0.5 });
    }

    const pilot = {
        prompt() {
            if (!me) return null;
            if (me.mode === 'ride') return null;
            return 'E  DROP THE BOARD';
        },
        interact() { stop(); },
        step(dt, keys) {
            const t = nowT, sea = ocean.getSeaLevel();
            const hard = !!(keys['shift'] || keys['ShiftLeft'] || keys['ShiftRight']);
            let turnOut = 0;
            if (me.mode === 'paddle') {
                const thrust = (keys['w'] ? 1 : 0) - (keys['s'] ? 0.5 : 0);
                const turn = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
                me.speed += thrust * (hard ? 4.5 : 3.0) * dt;
                me.speed *= Math.exp(-dt * 0.9);
                me.speed = THREE.MathUtils.clamp(me.speed, -0.8, hard ? 5.6 : 4.0);
                const dh = turn * 1.5 * dt;
                me.heading += dh; turnOut = -dh;
                me.dist -= Math.cos(me.heading) * me.speed * dt;
                me.z += Math.sin(me.heading) * me.speed * dt;
                // broken water shoves you back toward the beach
                for (const w of waves) {
                    const st = state(w, me.z);
                    if (st.broken > 0.4 && Math.abs(me.dist - w.d) < 3) me.dist -= 1.8 * dt;
                }
                me.dist = THREE.MathUtils.clamp(me.dist, 1.0, 110);
                me.z = THREE.MathUtils.clamp(me.z, SURF.z0 - 30, SURF.z1 + 30);
                me.eye += (0.6 - me.eye) * Math.min(1, dt * 4);
                // catch: you're on the back of a standing wave, facing in, paddling
                if (keys['w'] && Math.cos(me.heading) > 0.3) {
                    for (const w of waves) {
                        const rel = me.dist - w.d;
                        const st = state(w, me.z);
                        if (rel > -2.5 && rel < st.h * 2.6 && st.h > 1.5 && st.broken < 0.3) {   // a touch more forgiving (2026-10-09)
                            me.mode = 'ride'; me.wave = w; me.vz = 0; me.f = 0.55; me.rideT = 0; me.barrelT = 0; me.y = sea + 0.6 * st.h;
                            ui.toast('POP UP!  ·  A/D CARVE  ·  W/S UP & DOWN THE FACE');
                            audio.sfx?.('splash', { gain: 0.45 });
                            break;
                        }
                    }
                }
                if (Math.abs(me.speed) > 0.4 && Math.random() < dt * 6) ocean.splash(shoreX(me.z) - me.dist, me.z, 0.9, 'surfer', 0.25);
            } else {
                const w = me.wave;
                const turn = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
                me.rideT += dt;
                // carving: the camera faces the beach on pop-up, so its right is +Z.
                const maxV = hard ? 15 : 12;
                me.vz += turn * (hard ? 20 : 15) * dt;
                me.vz *= Math.exp(-dt * 0.4);
                me.vz = THREE.MathUtils.clamp(me.vz, -maxV, maxV);
                me.z += me.vz * dt;
                me.f += ((keys['w'] ? 0.9 : 0) - (keys['s'] ? 0.9 : 0)) * dt;
                me.f += (0.5 - me.f) * dt * 0.4;
                me.f = THREE.MathUtils.clamp(me.f, 0.12, 0.95);
                const st = state(w, me.z);
                // position on the face: f = 0 trough, 1 just under the lip
                const fs = lerp(FACE[0][0], FACE[FACE.length - 1][0], me.f) * (st.curl > 0.3 ? 1 : 0.7);
                const fy = lerp(0.1, 0.88, me.f);
                me.dist = w.d - fs * st.h * XS;
                me.y = sea + 0.05 + fy * st.h;
                me.heading = Math.atan2(me.vz, SPEED) * 0.9;
                me.roll += (-me.vz * 0.035 - me.roll) * Math.min(1, dt * 4);
                me.eye += (1.45 - me.eye) * Math.min(1, dt * 5);
                const inBarrel = st.curl > 0.55 && me.f < 0.7;
                if (inBarrel) {
                    me.barrelT += dt;
                    if (me.barrelT > 0.4 && me.barrelT - dt <= 0.4) ui.toast('BARRELLED!', 1500);
                }
                ocean.splash(shoreX(me.z) - me.dist + 1.0, me.z, 2.2, 'surfer', 0.07);
                // rooster tail off the rail when you carve
                const carve = Math.min(1, Math.abs(me.vz) / 10);
                for (let n = 0; n < 1 + carve * 4; n++) if (Math.random() < 0.6) emitSpray(shoreX(me.z) - me.dist - 0.6, me.y + 0.1, me.z - Math.sign(me.vz || 1) * 0.8, 2 + carve * 3, -1.5 - carve * 2);
                if (st.broken > 0.75) endRide('CAUGHT BY THE WHITEWATER');
                else if (st.h < 1.0 || me.z < SURF.z0 + 2 || me.z > SURF.z1 - 2) endRide('KICKED OUT');
                else if (w.d < 8) endRide('RODE IT IN');
            }

            const x = shoreX(me.z) - me.dist;
            const lift = liftAt(me.dist, me.z);
            const y = me.mode === 'ride' ? me.y : Math.max(ocean.surfaceY(x, me.z, t), sea + lift) + 0.05;
            const hd = me.heading;
            myBoard.position.set(x, y, me.z);
            myBoard.rotation.set(me.mode === 'ride' ? me.roll : 0, -hd, me.mode === 'ride' ? -0.28 : 0, 'YXZ');
            const back = me.mode === 'ride' ? 0.15 : 0.55;
            tmp.set(x - Math.cos(hd) * back, y + me.eye, me.z - Math.sin(hd) * back);
            return { x: tmp.x, y: tmp.y, z: tmp.z, turn: turnOut };
        },
    };

    /** Surface lift from the waves at (dist from shore, z) — bobbing over swells. */
    function liftAt(dist, z) {
        let best = 0;
        for (const w of waves) {
            const st = state(w, z);
            const s = (w.d - dist) / Math.max(0.5, st.h * XS);
            if (s < BACK[0][0] || s > 0.5) continue;
            let y = 0;
            for (let j = 1; j < BACK.length; j++) {
                if (s <= BACK[j][0]) { const a = BACK[j - 1], b = BACK[j]; y = lerp(a[1], b[1], (s - a[0]) / (b[0] - a[0])); break; }
                y = 1 - s;
            }
            best = Math.max(best, y * st.h);
        }
        return best;
    }

    function update(ctx) {
        nowT = ctx.time;
        const dt = Math.min(ctx.delta, 0.05);
        const sea = ocean.getSeaLevel();
        mat.uniforms.uTime.value = ctx.time;
        mat.uniforms.uNight.value = ctx.night ?? 1;
        beaconMat.opacity = 0.1 + 0.08 * Math.sin(ctx.time * 1.6);
        spMat.uniforms.uNight.value = ctx.night ?? 1;
        updateSpray(dt, sea);
        for (let i = 0; i < waves.length; i++) {
            const w = waves[i];
            w.d -= SPEED * dt;
            if (w.d < -4) { w.d += SPEED * INTERVAL * waves.length; w.size = 0.85 + Math.random() * 0.3; }
            buildWave(w, sea);
            w.splashT -= dt;
            if (w.splashT <= 0 && w.d < BREAK_N && w.d > 2) {
                w.splashT = 0.22;
                const z = Math.min(SURF.z1 - 6, Math.max(SURF.z0 + 6, peelZ(w.d) - 4 - Math.random() * 20));
                const st = state(w, z);
                if (st.broken > 0.3) ocean.splash(shoreX(z) - w.d + 1, z, 2.8, 'surfWave' + i, 0.2);
            }
            // NPC: in the pocket just ahead of the peel
            const n = npc[i];
            const z = peelZ(w.d) + n.lag + 3;
            const st = state(w, z);
            const ride = z > SURF.z0 + 6 && z < SURF.z1 - 6 && st.h > 1.6 && st.broken < 0.4 && !(me && me.wave === w && Math.abs(me.z - z) < 4);
            n.g.visible = ride;
            if (ride) {
                const fs = lerp(FACE[0][0], FACE[FACE.length - 1][0], 0.45);
                if (Math.random() < 0.5) emitSpray(shoreX(z) - (w.d - fs * st.h * XS) - 0.5, sea + 0.5 * st.h, z - 0.9, 2.5, -1.5);
                const x = shoreX(z) - (w.d - fs * st.h * XS);
                n.g.position.set(x, sea + 0.05 + 0.45 * st.h, z);
                n.g.rotation.set(0.3, -Math.atan2(9, SPEED) * 0.9, -0.3, 'YXZ');
                ocean.splash(x + 0.8, z - 1, 1.6, n.src, 0.25);
            }
        }
    }

    /** Controls card when you are near the rack or on a board. */
    function contextCard(camX, camZ) {
        if (me) {
            if (me.mode === 'ride') return { title: 'RIDING', sub: 'Stay just ahead of the curl. Too deep and the whitewater takes you.',
                rows: [['A / D', 'Carve along the face'], ['W / S', 'Climb / drop the face'], ['SHIFT', 'Pump for speed'], ['IN CURL', 'Get barrelled (×6 pts)']],
                stat: `${me.rideT.toFixed(1)}s · barrel ${me.barrelT.toFixed(1)}s` };
            return { title: 'SURF BREAK', sub: 'Paddle out past the whitewater, turn to face the beach, and keep paddling as a big wave lifts you.',
                rows: [['W / ↑', 'Paddle'], ['A D / ← →', 'Turn'], ['SHIFT', 'Paddle harder'], ['HOLD W', 'Facing in as a wave comes = pop up'], ['E', 'Drop the board']],
                stat: best ? `Best ride: ${best} pts` : null };
        }
        const dx = camX - rackX, dz = camZ - rackZ;
        if (dx * dx + dz * dz < 26 * 26) return { title: 'SURF BREAK', sub: 'Big peeling waves. Grab a board from the rack.',
            rows: [['E', 'Grab a board (at the rack)'], ['W', 'Paddle out'], ['HOLD W', 'Facing the beach as a wave lifts you = pop up'], ['A / D', 'Carve on the wave']] };
        return null;
    }

    return { update, craft: () => [{ x: rackX, z: rackZ }], isSurfing: () => !!me, contextCard, rack: { x: rackX, z: rackZ }, _dbg: { get me() { return me; }, waves, state } };
}
