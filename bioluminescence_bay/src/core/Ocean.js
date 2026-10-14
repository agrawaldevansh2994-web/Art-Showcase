// The bay — and the plankton, which is the whole point of this world.
//
// Forked from Goa_trance/src/core/Ocean.js (2026-10-07). Everything Goa built is still
// here (swell, shoaling, the break, the swash, the glitter path, the aGround depth trick)
// and its night-foam bioluminescence is the seed of this world. What this fork ADDS, all
// in the same single shaded plane, zero lights:
//
//   1. CREST GLOW   — swell crests light up as they steepen over the shelf, so lines of
//                     blue roll in toward the beach before they ever break.
//   2. SPARK FIELD  — individual dinoflagellates twinkling in the shallows.
//   3. TRAILS       — a ring buffer of TRAIL_N disturbance points (x, z, birth, strength)
//                     in a uniform array. Every splash() writes one; the shader draws a
//                     bright core that spreads and fades over ~5 s plus an expanding ring.
//                     This is what makes walking, swimming and the crowd in the surf glow.
//   4. BIO BOOST    — one scalar the Glow Tide event (X) and the music drive.
//
// Goa's original header follows.
//
// The Arabian Sea.
//
// One shaded plane does all of it: swell, shoaling, the breaking line, the swash sheet
// running up the wet sand, the sun and moon glitter path, and the bioluminescence at
// night. The trick that makes it work is a per-vertex `aGround` attribute holding the
// terrain height under each water vertex, sampled once at build time — with that in the
// shader the water knows how deep it is everywhere, so:
//
//   • the shoreline is wherever depth crosses zero, which means it follows every bend of
//     the coast and every headland for free, and
//   • raising or lowering the tide uniform genuinely moves the waterline up the beach.
//
// getTerrainHeight() is never modified by any of this. Only the water moves.

import * as THREE from 'three';
import { getTerrainHeight, shoreX } from './Terrain.js';
import { SEA_LEVEL, TIDE_AMPLITUDE, PALETTE } from './constants.js';

// The plane runs from well past the horizon in the west up onto the dry sand in the
// east. Vertices are redistributed so they bunch up near the shore — that is where the
// foam bands live and they need the resolution; open water 600 units out does not.
const SEA_FAR_X = -1500;
const SEA_NEAR_X = 45;
const SEA_HALF_Z = 820;
const SEGS_X = 220;
const SEGS_Z = 120;
// Disturbance points kept alive in the shader. 32 is the budget: the loop runs per
// water fragment, and most iterations exit on the distance test. Do not raise it without
// measuring fps standing in the surf at the stage (worst case: full screen of water).
const JELLY_N = 16;
const SWIM_N = 10;   // glowing swimmers under the surface (dolphins, turtles, the fish school) — 2026-10-09   // nearest jellyfish, fed by Jellyfish.js (x, z, depth, size)
const TRAIL_N = 48;   // was 32; kayaks (player + NPCs) share the ring since 2026-10-07

function shoreBiasedX(u) {
    // u: 0 at the far horizon, 1 at the near (inland) edge.
    const s = 1 - u;
    const len = SEA_NEAR_X - SEA_FAR_X;
    return SEA_NEAR_X - len * (0.35 * s + 0.65 * s * s * s) / 1.0;
}

export function createOcean(scene) {
    // ── Geometry ──
    const geo = new THREE.PlaneGeometry(1, 2 * SEA_HALF_Z, SEGS_X, SEGS_Z);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const count = pos.count;
    const ground = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        // PlaneGeometry lays x out in [-0.5, 0.5]; remap it through the bias curve.
        const u = pos.getX(i) + 0.5;
        const x = shoreBiasedX(u);
        const z = pos.getZ(i);
        pos.setX(i, x);
        // Clamped: nothing past −60 reads any differently and it keeps the floats small.
        ground[i] = Math.max(getTerrainHeight(x, z), -60);
    }
    pos.needsUpdate = true;
    geo.setAttribute('aGround', new THREE.BufferAttribute(ground, 1));
    geo.computeVertexNormals();

    // ── Material ──
    const uniforms = THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            uTime: { value: 0 },
            uSea: { value: SEA_LEVEL },
            uSunDir: { value: new THREE.Vector3(-0.7, 0.2, 0) },
            uSunColor: { value: new THREE.Color(0xffc07a) },
            uSkyColor: { value: new THREE.Color(0x7fa6c8) },
            uDeep: { value: new THREE.Color(PALETTE.seaDeep) },
            uShallow: { value: new THREE.Color(PALETTE.seaShallow) },
            uGlitter: { value: 1 },
            uNight: { value: 0 },
            uStorm: { value: 0 },
            uBio: { value: new THREE.Color(PALETTE.bioBlue) },
            uBioCore: { value: new THREE.Color(PALETTE.bioCore) },
            uBioBoost: { value: 1 },
            uBass: { value: 0 },
            uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4(0, 0, -100, 0)) },
            uJelly: { value: Array.from({ length: JELLY_N }, () => new THREE.Vector4(0, 0, 10, 0)) },
            uSwim: { value: Array.from({ length: SWIM_N }, () => new THREE.Vector4(0, 0, 1, 0)) },
            uSwimK: { value: new Array(SWIM_N).fill(0) },
        },
    ]);

    const mat = new THREE.ShaderMaterial({
        uniforms,
        fog: true,
        transparent: true,
        depthWrite: true,
        side: THREE.DoubleSide,      // so it still reads when the camera is under it
        vertexShader: /* glsl */`
            #include <fog_pars_vertex>
            attribute float aGround;
            uniform float uTime;
            uniform float uSea;
            uniform float uStorm;

            varying float vDepth;
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying float vCrest;

            // Three shoreward-travelling swells at different scales. Amplitude grows with
            // depth so the open sea heaves and the shallows stay flat — without that the
            // waterline shimmers and the beach looks like it is vibrating.
            float swell(vec2 p, float t, float amp) {
                float h  = sin(p.x * 0.055 - t * 1.15) * 0.42;
                h += sin(p.x * 0.088 + p.y * 0.034 - t * 1.75) * 0.20;
                h += sin(p.y * 0.021 + p.x * 0.012 - t * 0.55) * 0.55;
                h += sin(p.x * 0.21 + p.y * 0.17 - t * 2.6) * 0.06;
                return h * amp;
            }

            void main() {
                vec3 p = position;
                float depth = uSea - aGround;
                vDepth = depth;

                float amp = smoothstep(0.15, 4.5, depth) * (1.0 + uStorm * 1.6);
                float h = swell(p.xz, uTime, amp);
                p.y = uSea + h;
                // 0 in the troughs, ~1 at the top of the biggest crests. Normalised by amp
                // so the shallows (amp → 0) never read as crests.
                vCrest = amp > 0.05 ? clamp(h / (amp * 1.1) * 0.5 + 0.5, 0.0, 1.0) : 0.0;

                // Analytic-ish normal from two nearby samples of the same field.
                float e = 2.5;
                float hx = swell(p.xz + vec2(e, 0.0), uTime, amp);
                float hz = swell(p.xz + vec2(0.0, e), uTime, amp);
                vNormal = normalize(vec3(h - hx, e, h - hz));

                vec4 wp = modelMatrix * vec4(p, 1.0);
                vWorld = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                gl_Position = projectionMatrix * mvPosition;

                #include <fog_vertex>
            }`,
        fragmentShader: /* glsl */`
            #include <fog_pars_fragment>
            uniform float uTime;
            uniform float uGlitter;
            uniform float uNight;
            uniform float uStorm;
            uniform vec3 uSunDir, uSunColor, uSkyColor, uDeep, uShallow, uBio, uBioCore;
            uniform float uBioBoost;
            uniform float uBass;
            uniform vec4 uTrail[${TRAIL_N}];
            uniform vec4 uJelly[${JELLY_N}];
            uniform vec4 uSwim[${SWIM_N}];
            uniform float uSwimK[${SWIM_N}];

            varying float vDepth;
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying float vCrest;

            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            // Smooth value noise. Bay: Goa's per-cell hash() jitter is invisible on white
            // daytime foam, but under the plankton glow every cell edge became a visible
            // tile (first render, 2026-10-07: a checkerboard across the shallows). Any
            // per-area variation that feeds the glow must use this, never hash(floor()).
            float vnoise(vec2 p){
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
            }

            void main() {
                // Above the waterline there is no water. This is what makes the tide work:
                // raise uSea and this test retreats up the beach on its own.
                if (vDepth <= 0.02) discard;

                vec3 N = normalize(vNormal);
                vec3 V = normalize(cameraPosition - vWorld);
                float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.4);

                // Body colour: turquoise over the shelf, indigo once it drops away.
                vec3 col = mix(uShallow, uDeep, smoothstep(0.6, 16.0, vDepth));
                col = mix(col, uSkyColor, fres * 0.55);

                // ── The glitter path ──
                // A tight specular lobe against the sun direction. Because it depends on
                // the view vector it automatically becomes a streak running from the
                // horizon to your feet, which is the single thing that makes a tropical
                // sea look like a tropical sea.
                vec3 H = normalize(normalize(uSunDir) + V);
                float ndh = max(dot(N, H), 0.0);
                float sparkle = hash(floor(vWorld.xz * 2.2 + uTime * 0.7)) * 0.6 + 0.5;
                col += uSunColor * pow(ndh, 260.0) * 4.2 * uGlitter * sparkle;
                col += uSunColor * pow(ndh, 18.0) * 0.32 * uGlitter;

                // ── Foam ──
                float shoreT = 1.0 - smoothstep(0.0, 2.4, vDepth);
                float jitter = vnoise(vWorld.xz * 0.35) * 2.4;

                // the wet edge itself
                float foam = (1.0 - smoothstep(0.0, 0.30, vDepth)) * 0.85;
                // swash sheets running up and sliding back
                float swash = sin(vDepth * 2.5 - uTime * 1.45 + jitter) * 0.5 + 0.5;
                foam += pow(swash, 3.5) * shoreT * 0.8;
                // the break, out where the swell trips over the shelf
                float breakBand = exp(-pow((vDepth - 1.7) / 0.75, 2.0));
                foam += pow(sin(vDepth * 1.05 - uTime * 0.85 + jitter) * 0.5 + 0.5, 7.0) * breakBand;
                // whitecaps further out during a squall
                foam += uStorm * smoothstep(0.55, 0.95, sin(vWorld.x * 0.09 - uTime * 2.1) * 0.5 + 0.5) * 0.5;
                foam = clamp(foam, 0.0, 1.0);

                // At night the foam is where the plankton light up, so it stops being
                // white and becomes the brightest thing in the world.
                // Bay: toned down from Goa's — the broad swash sheets were lighting the
                // whole shallows as one sheet. Squaring keeps the glow on the lines.
                vec3 foamCol = mix(vec3(0.88, 0.95, 0.93), uBio, uNight * 0.85);
                col = mix(col, foamCol, foam * (0.55 - uNight * 0.42));
                col += uBio * foam * foam * uNight * 0.12;

                // Depth fade at the very edge so the sheet does not end on a hard line.
                float alpha = 0.88 * smoothstep(0.0, 0.22, vDepth) + foam * 0.12;

                // ═════ BIOLUMINESCENCE (Bay additions) ═════
                float bioN = uNight * uBioBoost;
                if (bioN > 0.01) {
                    // 1. crests steepening over the shelf, before they break
                    float crest = smoothstep(0.62, 0.97, vCrest)
                        * smoothstep(0.5, 2.2, vDepth) * (1.0 - smoothstep(7.0, 16.0, vDepth));
                    crest *= 0.45 + 0.55 * vnoise(vWorld.xz * 0.12 + vec2(uTime * 0.05, 0.0));

                    // 2. disturbance trails: a core that spreads and fades, plus a ring.
                    //    (Computed first now — the glitter density feeds off it.)
                    float trail = 0.0;
                    for (int i = 0; i < ${TRAIL_N}; i++) {
                        vec4 tp = uTrail[i];
                        float age = uTime - tp.z;
                        if (tp.w <= 0.0 || age < 0.0 || age > 5.0) continue;
                        vec2 dv = vWorld.xz - tp.xy;
                        float d2 = dot(dv, dv);
                        if (d2 > 70.0) continue;
                        float fade = exp(-age * 0.85);
                        float core = exp(-d2 / (0.45 + age * 1.7));
                        float r = sqrt(d2) - (0.5 + age * 1.9);
                        float ring = exp(-(r * r) / 0.16) * 0.5;
                        trail += (core + ring) * fade * tp.w;
                    }

                    // 3. LACE (glitter pass, 2026-10-07, from Devansh's photos): the thin,
                    //    near-white lines at the front of each swash sheet, broken into
                    //    lace by noise. These are the brightest thing in the photos.
                    float ph = vDepth * 2.5 - uTime * 1.45 + jitter;
                    float edge = abs(fract(ph / 6.2831853 + 0.25) - 0.5);       // 0 at the sheet front
                    float lace = exp(-edge * edge / 0.0009) * shoreT;
                    lace *= smoothstep(0.35, 0.65, vnoise(vWorld.xz * 1.6 + vec2(uTime * 0.2, 0.0)));
                    float edgeLine = exp(-pow(vDepth - 0.06, 2.0) / 0.004) * (0.6 + 0.4 * vnoise(vWorld.xz * 2.0));

                    // 4. GLITTER: separate round sparks, two sizes, everywhere at night but
                    //    thickest where the water is being disturbed — the shore, the foam,
                    //    the crests, and around anything moving (trails). Dark between.
                    float activity = 0.07                                         // open water: sparse
                        + (1.0 - smoothstep(0.3, 5.0, vDepth)) * 0.35            // the shallows
                        + foam * 0.5 + crest * 0.5 + clamp(trail, 0.0, 1.5) * 0.7;
                    float glitter = 0.0;
                    for (int L = 0; L < 2; L++) {
                        float sc = L == 0 ? 2.6 : 6.5;
                        vec2 q = vWorld.xz * sc + float(L) * 17.3;
                        vec2 c = floor(q);
                        float h1 = hash(c), h2 = hash(c + 31.7), h3 = hash(c + 71.1);
                        float keep = step(1.0 - min(activity, 1.0) * (L == 0 ? 0.6 : 1.0), h1);
                        vec2 sp = fract(q) - (0.25 + 0.5 * vec2(h2, h3));
                        float rad = (L == 0 ? 0.13 : 0.10) * (0.6 + h3 * 0.8);
                        float dotv = smoothstep(rad, rad * 0.25, length(sp));
                        float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.2 + h2 * 4.0) + h1 * 50.0), 3.0);
                        glitter += keep * dotv * tw * (L == 0 ? 1.0 : 0.7);
                    }

                    float bio = foam * foam * 0.08 + crest * 0.35 + trail * 0.55
                              + lace * 1.8 + edgeLine * 0.8 + glitter * 3.2
                              + activity * 0.22;                                  // the blue body under the sparks
                    bio *= 1.0 + uBass * 0.3;
                    vec3 bioCol = mix(uBio, uBioCore, clamp(lace * 0.8 + edgeLine * 0.5 + glitter * 0.6, 0.0, 1.0));
                    col += bioCol * bio * bioN * 1.25;
                    alpha = max(alpha, clamp(bio * bioN, 0.0, 1.0) * 0.92);
                }

                // Jellyfish under the surface (M4): thin the water over each and add a soft
                // violet-blue patch, wider and fainter the deeper it hangs.
                float jg = 0.0;
                for (int i = 0; i < ${JELLY_N}; i++) {
                    vec4 J = uJelly[i];
                    if (J.w <= 0.0) continue;
                    vec2 dv = vWorld.xz - J.xy;
                    float spread = J.w * J.w * 2.0 + J.z * 0.9;
                    jg += exp(-dot(dv, dv) / spread) / (1.0 + J.z * 0.6);
                }
                // Swimmers: an elongated streak of lit plankton over each animal, brightest
                // at the head, trailing behind it (x, z, dir*len).
                float sg = 0.0;
                for (int i = 0; i < ${SWIM_N}; i++) {
                    float k = uSwimK[i];
                    if (k <= 0.0) continue;
                    vec4 S = uSwim[i];
                    float len = length(S.zw);
                    vec2 dir = S.zw / len;
                    vec2 dv = vWorld.xz - S.xy;
                    float al = dot(dv, dir), pe = dot(dv, vec2(-dir.y, dir.x));
                    float tail = al < 0.0 ? al / (len * 2.2) : al / (len * 0.55);
                    float w = len * 0.22 * (1.0 + max(0.0, -al) / len * 0.6);
                    float g = exp(-tail * tail * 2.0 - pe * pe / (w * w));
                    float twinkle = 0.7 + 0.3 * sin(uTime * 9.0 + al * 3.0 + pe * 5.0);
                    sg += g * k * twinkle;
                }
                jg *= uNight; sg *= uNight;
                col += vec3(0.3, 0.92, 1.0) * sg * 0.9;
                col += vec3(0.35, 0.55, 1.0) * jg * 0.55;
                alpha *= 1.0 - clamp(jg, 0.0, 1.0) * 0.35;
                gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
                #include <fog_fragment>
            }`,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'ocean';
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;       // it is bigger than its own bounding sphere suggests
    scene.add(mesh);

    // Declared up here rather than next to update(): splash() closes over it, and a
    // `let` sitting below its use site is the exact trap that black-screens these apps.
    let seaLevel = SEA_LEVEL;
    let now = 0;
    let bioBoostTarget = 1;
    let trailCursor = 0;
    // Rate-limit state per source ('player', 'raft', 'fauna', …) so one busy source
    // cannot starve the others of slots in the ring.
    const trailSources = new Map();

    /**
     * Write a disturbance into the shader's trail ring. Rate-limited per source so a
     * swimmer calling splash() every frame does not overwrite the whole ring in half a
     * second: a new point needs ~0.09 s OR ~1.4 units of travel since that source's last.
     */
    function pushTrail(x, z, strength, source = 'player', minGap = 0.09) {
        let st = trailSources.get(source);
        if (!st) { st = { t: -1, x: 1e9, z: 1e9 }; trailSources.set(source, st); }
        const dx = x - st.x, dz = z - st.z;
        if (now - st.t < minGap && dx * dx + dz * dz < 2) return;
        if (now - st.t < minGap * 0.5) return;
        const v = uniforms.uTrail.value[trailCursor];
        v.set(x, z, now, strength);
        trailCursor = (trailCursor + 1) % TRAIL_N;
        st.t = now; st.x = x; st.z = z;
    }

    // ─────────────────────────────────────────────
    //  BIOLUMINESCENT WAKE
    //  Kicked up by anything moving through the shallows at night. A ring buffer of
    //  additive points — no lights, no allocation per splash.
    // ─────────────────────────────────────────────
    const SPARKS = 420;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARKS * 3);
    for (let i = 0; i < SPARKS; i++) sparkPos[i * 3 + 1] = -500;   // parked below the world
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));

    const sparkTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        rad.addColorStop(0, 'rgba(180,255,240,0.95)');
        rad.addColorStop(0.35, 'rgba(60,230,210,0.35)');
        rad.addColorStop(1, 'rgba(0,60,80,0)');
        g.fillStyle = rad;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    })();

    const sparkMat = new THREE.PointsMaterial({
        size: 0.62, map: sparkTex, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    // The idle particles are parked at y = −500. Three.js would compute the bounding
    // sphere from there and cull the whole object the instant they move to the surface.
    sparks.frustumCulled = false;
    sparks.name = 'bioSparks';
    scene.add(sparks);

    const sparkLife = new Float32Array(SPARKS);
    const sparkVel = new Float32Array(SPARKS * 2);
    let sparkCursor = 0;

    /** Disturb the water at (x,z). `amount` scales how many particles it throws. */
    function splash(x, z, amount = 1, source = 'player', minGap = 0.09) {
        pushTrail(x, z, Math.min(1.4, 0.35 + amount * 0.25), source, minGap);
        const n = Math.min(SPARKS, Math.max(1, Math.round(amount * 7)));
        for (let i = 0; i < n; i++) {
            const k = sparkCursor;
            sparkCursor = (sparkCursor + 1) % SPARKS;
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 1.4;
            sparkPos[k * 3] = x + Math.cos(a) * r;
            sparkPos[k * 3 + 1] = seaLevel + 0.12;
            sparkPos[k * 3 + 2] = z + Math.sin(a) * r;
            sparkVel[k * 2] = Math.cos(a) * (0.4 + Math.random());
            sparkVel[k * 2 + 1] = Math.sin(a) * (0.4 + Math.random());
            sparkLife[k] = 0.9 + Math.random() * 0.9;
        }
    }

    // ─────────────────────────────────────────────
    //  STRANDED PLANKTON (glitter pass, 2026-10-07)
    //  The specks left glittering on the wet sand after a wave pulls back — in both of
    //  Devansh's reference photos. One Points draw: points scattered over the swash
    //  zone; the vertex shader shows each only while it sits just ABOVE the waterline
    //  (so the tide moves the band) and fades them as the sand dries upslope.
    // ─────────────────────────────────────────────
    const STRAND = 7000;
    const strandPos = new Float32Array(STRAND * 3);
    const strandRnd = new Float32Array(STRAND);
    for (let i = 0; i < STRAND; i++) {
        const z = -165 + Math.random() * 330;
        const x = shoreX(z) + (-1.5 + Math.random() * 9);
        strandPos[i * 3] = x; strandPos[i * 3 + 1] = getTerrainHeight(x, z) + 0.03; strandPos[i * 3 + 2] = z;
        strandRnd[i] = Math.random();
    }
    const strandGeo = new THREE.BufferGeometry();
    strandGeo.setAttribute('position', new THREE.BufferAttribute(strandPos, 3));
    strandGeo.setAttribute('aRnd', new THREE.BufferAttribute(strandRnd, 1));
    const strandMat = new THREE.ShaderMaterial({
        uniforms: { uSea: { value: SEA_LEVEL }, uTime: { value: 0 }, uNight: { value: 1 }, uBoost: { value: 1 } },
        vertexShader: /* glsl */`
            attribute float aRnd;
            uniform float uSea, uTime, uNight, uBoost;
            varying float vA;
            void main(){
                float above = position.y - uSea;
                float wet = smoothstep(-0.02, 0.03, above) * (1.0 - smoothstep(0.08, 0.42, above));
                float tw = pow(0.5 + 0.5 * sin(uTime * (0.8 + aRnd * 3.0) + aRnd * 80.0), 4.0);
                vA = wet * tw * uNight * uBoost;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = clamp((2.0 + aRnd * 3.0) * 60.0 / -mv.z, 1.0, 7.0) * step(0.01, vA);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            varying float vA;
            void main(){
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.0, d) * vA;
                gl_FragColor = vec4(vec3(0.45, 0.9, 1.0) * a * 1.6, a);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const strand = new THREE.Points(strandGeo, strandMat);
    strand.frustumCulled = false;
    strand.name = 'strandedPlankton';
    scene.add(strand);

    // ─────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────
    /**
     * Height of the water surface at a point — used by anything that floats. It mirrors
     * the vertex shader's swell exactly; if one changes the other has to.
     */
    function surfaceY(x, z, time) {
        const h = Math.sin(x * 0.055 - time * 1.15) * 0.42
            + Math.sin(x * 0.088 + z * 0.034 - time * 1.75) * 0.20
            + Math.sin(z * 0.021 + x * 0.012 - time * 0.55) * 0.55;
        const depth = seaLevel - getTerrainHeight(x, z);
        const amp = THREE.MathUtils.clamp((depth - 0.15) / 4.35, 0, 1);
        return seaLevel + h * amp * amp * (3 - 2 * amp);
    }

    function update(ctx) {
        const t = ctx.time;
        const night = ctx.night ?? 0;

        // Two tides a day. TIDE_AMPLITUDE against the wet-sand gradient in Terrain.js is
        // roughly twelve units of beach appearing and disappearing.
        seaLevel = SEA_LEVEL + Math.sin((ctx.timeOfDay ?? 0) * Math.PI * 4) * TIDE_AMPLITUDE;

        now = t;
        uniforms.uTime.value = t;
        uniforms.uBass.value = ctx.energy ? ctx.energy.bass : 0;
        uniforms.uBioBoost.value += (bioBoostTarget - uniforms.uBioBoost.value) * Math.min(1, ctx.delta * 0.6);
        uniforms.uSea.value = seaLevel;
        uniforms.uNight.value = night;
        uniforms.uStorm.value = ctx.weather?.stormLevel ?? 0;

        if (ctx.sky) {
            const sd = ctx.sky.getSunDir();
            const moonlit = night > 0.5;
            // At night the moon takes over the glitter path; it is thinner and colder.
            if (moonlit) {
                uniforms.uSunDir.value.set(-sd.x, Math.max(0.28, -sd.y), -sd.z).normalize();
                uniforms.uSunColor.value.setHex(0xbdd4ff);
                uniforms.uGlitter.value = 0.55;
            } else {
                uniforms.uSunDir.value.copy(sd);
                uniforms.uSunColor.value.copy(ctx.sky.getSunColor());
                // Widest and most golden exactly when the sun is on the water.
                const low = 1 - THREE.MathUtils.clamp(Math.abs(sd.y) * 3.2, 0, 1);
                uniforms.uGlitter.value = 0.8 + low * 1.4;
            }
            uniforms.uSkyColor.value.copy(ctx.sky.getHorizonColor());
        }

        // Deeper and colder at night so the fluoro on the beach has something to sit on.
        uniforms.uDeep.value.setHex(PALETTE.seaDeep).multiplyScalar(1 - night * 0.66);
        uniforms.uShallow.value.setHex(PALETTE.seaShallow).multiplyScalar(1 - night * 0.62);

        // ── sparks ──
        const dt = Math.min(ctx.delta, 0.05);
        let anyAlive = false;
        for (let i = 0; i < SPARKS; i++) {
            if (sparkLife[i] <= 0) continue;
            anyAlive = true;
            sparkLife[i] -= dt;
            sparkPos[i * 3] += sparkVel[i * 2] * dt;
            sparkPos[i * 3 + 2] += sparkVel[i * 2 + 1] * dt;
            sparkPos[i * 3 + 1] = seaLevel + 0.12;
            if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -500;
        }
        if (anyAlive) sparkGeo.attributes.position.needsUpdate = true;
        sparkMat.opacity = 0.25 + night * 0.75;
        strandMat.uniforms.uSea.value = seaLevel;
        strandMat.uniforms.uTime.value = t;
        strandMat.uniforms.uNight.value = night;
        strandMat.uniforms.uBoost.value = uniforms.uBioBoost.value;
    }

    return {
        mesh, sparks, update, splash, surfaceY,
        /** Glow Tide: 1 is a normal night, ~2.6 is the event. Eased, never snapped. */
        setBioBoost: (v) => { bioBoostTarget = v; },
        /** Float32Array of JELLY_N × (x, z, depth, size), nearest first. */
        /** a: [x, z, dirX*len, dirZ*len] × n, k: strengths (0 = off). */
        setSwimmers(a, k) { const S = uniforms.uSwim.value, K = uniforms.uSwimK.value; for (let i = 0; i < SWIM_N; i++) { const j = i * 4; if (i * 4 < a.length) S[i].set(a[j], a[j + 1], a[j + 2], a[j + 3]); K[i] = k[i] || 0; } },
        setJellies(a) { const J = uniforms.uJelly.value; for (let i = 0; i < J.length; i++) J[i].set(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]); },
        getBioBoost: () => uniforms.uBioBoost.value,
        getSeaLevel: () => seaLevel,
        /** Depth of water over the ground here, 0 on dry land. */
        depthAt: (x, z) => Math.max(0, seaLevel - getTerrainHeight(x, z)),
    };
}
