// The tropical day. Sky dome shader, sun and moon, and every ambient light in the scene.
//
// THE ONE RULE: the sun rises over the land (+X) and sets into the sea (−X). The arc is
// tilted a little to the south the way it is at 15°N, so it passes over your right
// shoulder at noon if you are facing the water. Everything about this world is built so
// that you are looking west at the right moment.
//
// BAY SKY v2 (2026-10-07, own design — Goa's sky read as Goa). It is a NEW-MOON night
// over a remote cove: no moon at all, a teal-black dome instead of Goa's violet, round
// crisp stars hashed on a 3D grid (Goa's were projected onto a plane and smeared into
// streaks toward the horizon), a real Milky Way arch with a dark dust rift and a warm
// core, a faint green AIRGLOW band on the horizon (what a truly dark sky actually shows),
// slow shooting stars, and night clouds that are dark shapes blotting out stars rather
// than lit purple smears. Twilight goes teal, not magenta.

import * as THREE from 'three';

const PHASES = {
    predawn: {
        sunY: -12, sunColor: 0xff9c66, sunInt: 0,
        skyTop: 0x04121c, skyHoriz: 0x163a48, skyBot: 0x061420,
        fogColor: 0x0a1c26, fogDens: 0.0026,
        ambColor: 0x10242e, ambInt: 0.15, hemiSky: 0x163a48, hemiGrnd: 0x060c10,
        moonVis: 0, starFade: 0.7, haze: 0.25, cloud: 0.2,
    },
    dawn: {
        sunY: 5, sunColor: 0xffb27a, sunInt: 0.80,
        skyTop: 0x27407a, skyHoriz: 0xffb894, skyBot: 0x5c4260,
        fogColor: 0x8a7a86, fogDens: 0.0026,
        ambColor: 0x4a4256, ambInt: 0.34, hemiSky: 0xffc0a0, hemiGrnd: 0x30281e,
        moonVis: 0.18, starFade: 0.18, haze: 0.7, cloud: 0.55,
    },
    morning: {
        sunY: 42, sunColor: 0xfff0d2, sunInt: 1.60,
        skyTop: 0x2f76c4, skyHoriz: 0xa8d2e8, skyBot: 0xbfdcea,
        fogColor: 0xa8c2ce, fogDens: 0.0017,
        ambColor: 0x7d8e9c, ambInt: 0.44, hemiSky: 0xc4e0ee, hemiGrnd: 0x5a6a3c,
        moonVis: 0, starFade: 0, haze: 0.45, cloud: 0.45,
    },
    noon: {
        // Tropical midday: hard, hazy and slightly bleached, not a crisp blue.
        sunY: 88, sunColor: 0xfffaf0, sunInt: 1.90,
        skyTop: 0x3d84cc, skyHoriz: 0xcfe2ea, skyBot: 0xd8e6ec,
        fogColor: 0xc6d6da, fogDens: 0.0019,
        ambColor: 0x9aa8b0, ambInt: 0.50, hemiSky: 0xd8ecf4, hemiGrnd: 0x6a7a44,
        moonVis: 0, starFade: 0, haze: 0.85, cloud: 0.5,
    },
    afternoon: {
        sunY: 34, sunColor: 0xffcf8a, sunInt: 1.70,
        skyTop: 0x3a6cae, skyHoriz: 0xf0c898, skyBot: 0xe6b487,
        fogColor: 0xc0a894, fogDens: 0.0019,
        ambColor: 0x8a7a68, ambInt: 0.46, hemiSky: 0xf4cc9a, hemiGrnd: 0x5e5030,
        moonVis: 0, starFade: 0, haze: 0.7, cloud: 0.6,
    },
    sunset: {
        // The hero frame. Everything here is tuned to be looked at from the sand.
        sunY: 3, sunColor: 0xff6a1e, sunInt: 1.35,
        skyTop: 0x1e3a66, skyHoriz: 0xff7a3a, skyBot: 0xffa45e,
        fogColor: 0xd4784a, fogDens: 0.0024,
        ambColor: 0x7a4a48, ambInt: 0.38, hemiSky: 0xff8a4a, hemiGrnd: 0x40241c,
        moonVis: 0.2, starFade: 0.05, haze: 1.0, cloud: 0.85,
    },
    dusk: {
        // Teal twilight — the sea-blue hour, not Goa's magenta.
        sunY: -8, sunColor: 0xff7a4a, sunInt: 0.22,
        skyTop: 0x081a30, skyHoriz: 0x2e7a86, skyBot: 0x0e3442,
        fogColor: 0x143a46, fogDens: 0.0028,
        ambColor: 0x1c3a44, ambInt: 0.24, hemiSky: 0x2e6a78, hemiGrnd: 0x0c181c,
        moonVis: 0, starFade: 0.45, haze: 0.6, cloud: 0.35,
    },
    night: {
        // Low. Intentionally. See the note at the top of the file.
        // New moon: no moonlight at all. Starlight and the water are the light.
        sunY: -40, sunColor: 0xff4400, sunInt: 0,
        skyTop: 0x01050a, skyHoriz: 0x05141a, skyBot: 0x020a10,
        // Lifted 2026-10-07 (Devansh: "beach too dark, can't see anything"): the water
        // stays the brightest thing, but sand, trees and people now read in starlight,
        // and the ground term is cyan — the sea's own glow lighting things from below.
        fogColor: 0x0a1c26, fogDens: 0.0024,
        ambColor: 0x2c4e60, ambInt: 1.0, hemiSky: 0x3c6c84, hemiGrnd: 0x0c3440,
        moonVis: 0, starFade: 1, haze: 0.2, cloud: 0.22,
    },
};

// t → [phaseA, phaseB].
//
// These are tuned against the actual sun geometry, not chosen freely: the sun crosses
// the horizon at exactly t = 0.5 (see the arc in update()), so the sunset palette has to
// peak there and not before. An earlier cut had full sunset colour at t = 0.46 while the
// sun was still 35° up, which looks wrong in a way that is hard to name and easy to see.
const SEGMENTS = [
    [0.000, 0.060, PHASES.dawn, PHASES.morning],
    [0.060, 0.180, PHASES.morning, PHASES.noon],
    [0.180, 0.360, PHASES.noon, PHASES.afternoon],
    [0.360, 0.440, PHASES.afternoon, PHASES.afternoon],
    [0.440, 0.500, PHASES.afternoon, PHASES.sunset],   // sun 22° → 0°
    [0.500, 0.555, PHASES.sunset, PHASES.dusk],
    [0.555, 0.620, PHASES.dusk, PHASES.night],
    [0.620, 0.930, PHASES.night, PHASES.night],
    [0.930, 0.980, PHASES.night, PHASES.predawn],
    [0.980, 1.000, PHASES.predawn, PHASES.dawn],
];

const LABELS = [
    [0.06, 'FIRST LIGHT'], [0.18, 'MORNING'], [0.36, 'MIDDAY HEAT'],
    [0.44, 'AFTERNOON'], [0.50, 'GOLDEN HOUR'], [0.555, 'SUNSET'],
    [0.62, 'AFTERGLOW'], [0.85, 'NIGHT'], [0.93, 'DEEP NIGHT'], [1.01, 'BEFORE LIGHT'],
];

const _tmpColor = new THREE.Color();
function lerpColor(a, b, f, out) { return out.set(a).lerp(_tmpColor.set(b), f); }

function makeGlowSprite(color, alpha) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},${alpha * 0.3})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
}

// How far south the sun's arc leans. 15°N in the dry season: it passes to the south
// at noon and drops almost vertically into the sea, which is why Goa sunsets are quick.
const DECLINATION = 0.21;

// The Milky Way's plane, as the normal of a great circle. Tilted so the arch rises out
// of the sea in the south-west and climbs over the cove — the lookout spawn looks at it.
const MW_NORMAL = new THREE.Vector3(0.55, 0.45, -0.70).normalize();

export function createSkyCycle(scene, startTime = 0.42) {
    // ── Sky dome ──
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            uTop: { value: new THREE.Color(0x040814) },
            uHoriz: { value: new THREE.Color(0x0d1226) },
            uBot: { value: new THREE.Color(0x05070f) },
            uTime: { value: 0 },
            uSunDir: { value: new THREE.Vector3(-1, 0.2, 0) },
            uMoonDir: { value: new THREE.Vector3(1, 0.4, 0) },
            uSunColor: { value: new THREE.Color(0xff6a1e) },
            uStarFade: { value: 1 },
            uHaze: { value: 0.6 },
            uCloud: { value: 0.5 },
            uMwNormal: { value: MW_NORMAL.clone() },
            uMeteorA: { value: new THREE.Vector3(0, 1, 0) },
            uMeteorB: { value: new THREE.Vector3(0, 1, 0) },
            uMeteor: { value: 0 },
        },
        vertexShader: /* glsl */`
            varying vec3 vDir;
            void main(){
                // THE VIEW DIRECTION IS THE LOCAL POSITION, NOT THE WORLD POSITION.
                // The dome is re-centred on the camera every frame, so its world-space
                // vertices are offset by wherever the player is standing — normalising
                // those gave a direction skewed by up to 8° once you walked a couple of
                // hundred units from the origin, which put the shader's sun visibly
                // beside the sun mesh. Two suns. The attribute "position" is already
                // relative to the dome's own centre, which is the direction we want.
                vDir = position;
                gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: /* glsl */`
            uniform vec3 uTop, uHoriz, uBot, uSunDir, uMoonDir, uSunColor, uMwNormal, uMeteorA, uMeteorB;
            uniform float uTime, uStarFade, uHaze, uCloud, uMeteor;
            varying vec3 vDir;

            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float hash2(vec2 p){ return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }

            float vnoise(vec2 p){
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                           mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
            }
            vec3 hash3(vec3 p){
                p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
                return fract(sin(p) * 43758.5453);
            }
            // Round stars: one candidate per cell of a 3D grid laid over the unit sphere,
            // so density and shape are the same in every direction — no smearing.
            vec3 starLayer(vec3 d, float scale, float keep, float sizePx){
                vec3 p = d * scale;
                vec3 cell = floor(p);
                vec3 rnd = hash3(cell);
                if (rnd.x > keep) return vec3(0.0);
                vec3 c = cell + 0.2 + rnd * 0.6;
                float dist = length(p - c);
                float mag = pow(rnd.y, 3.0);                       // a few bright, many faint
                float core = smoothstep(sizePx * (0.5 + mag), 0.0, dist);
                // colour temperature: blue-white through white to warm
                vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.66), rnd.z);
                float tw = 0.75 + 0.25 * sin(uTime * (1.5 + rnd.z * 3.0) + rnd.y * 60.0);
                return tint * core * (0.25 + mag * 2.4) * tw;
            }
            float fbm(vec2 p);
            float fbm3(vec3 p){
                return fbm(p.xy + p.z * 1.7) * 0.6 + fbm(p.yz * 1.3 - p.x) * 0.4;
            }
            float fbm(vec2 p){
                float v = 0.0, a = 0.5;
                for (int i = 0; i < 4; i++) { v += vnoise(p) * a; p *= 2.03; a *= 0.5; }
                return v;
            }

            void main(){
                vec3 dir = normalize(vDir);
                float h = dir.y;
                vec3 sd = normalize(uSunDir);

                vec3 col = mix(uHoriz, uTop, smoothstep(0.0, 0.5, h));
                col = mix(uBot, col, smoothstep(-0.25, 0.0, h));

                // Atmospheric scatter around the sun: a glow smeared along the horizon on
                // the sun's side of the sky. The exponents here are the difference
                // between a sunset and a white-out — an earlier cut used pow(sunDot, 3.0)
                // and pow(sunDot, 0.8), and 0.8 is so close to linear that it lit the
                // entire hemisphere, which stacked with the sun sprite and the bloom into
                // a solid white wall across the whole horizon. Keep these tight.
                float sunDot = max(dot(dir, sd), 0.0);
                float horizonBand = exp(-abs(h) * 5.0);
                col += uSunColor * pow(sunDot, 9.0) * 0.34 * uHaze;
                col += uSunColor * pow(sunDot, 2.6) * 0.09 * uHaze * horizonBand;
                col += vec3(1.0, 0.74, 0.42) * pow(sunDot, 300.0);

                // Tropical cloud banks, low and drifting off the sea.
                float cl = fbm(vec2(dir.x, dir.z) / max(abs(h) + 0.12, 0.12) * 1.6
                               + vec2(uTime * 0.006, uTime * 0.0025));
                float band = smoothstep(0.02, 0.30, h) * smoothstep(0.62, 0.18, h);
                float cloud = smoothstep(0.48, 0.78, cl) * band * uCloud;
                // Lit from the sun side, dark on the other — this is what makes the
                // sunset clouds read as clouds rather than as grey smears.
                // Lit on the sun side by day; at night the "lit" colour falls to almost
                // the sky colour, so clouds become dark shapes that hide stars.
                vec3 cloudDark = mix(uTop * 0.6, vec3(0.10, 0.11, 0.13), 1.0 - uStarFade);
                vec3 cloudLit = mix(cloudDark, uSunColor * 1.25,
                                    (pow(sunDot, 1.6) * 0.85 + 0.10) * (1.0 - uStarFade * 0.95));
                col = mix(col, cloudLit, cloud * 0.8);
                float clear = 1.0 - smoothstep(0.05, 0.5, cloud);

                float above = smoothstep(-0.01, 0.10, h);
                float sky = uStarFade * above * clear;

                // Milky Way: a band around the great circle, with a dust rift down its
                // middle and a warm bulge toward the core.
                float mwLat = dot(dir, normalize(uMwNormal));
                float mwBand = exp(-mwLat * mwLat * 38.0);
                float dust = fbm3(dir * 6.0);
                float rift = smoothstep(0.06, 0.0, abs(mwLat + (dust - 0.5) * 0.08)) * smoothstep(0.35, 0.65, dust);
                float clumps = fbm3(dir * 14.0 + 3.1);
                vec3 mwCol = mix(vec3(0.16, 0.20, 0.24), vec3(0.32, 0.27, 0.20), smoothstep(0.2, -0.6, dir.z + dir.x * 0.3));
                col += mwCol * mwBand * (0.35 + clumps * 0.9) * (1.0 - rift * 0.85) * sky * 0.55;

                // Stars: three layers, densest inside the band.
                vec3 st = starLayer(dir, 180.0, 0.22, 0.10)
                        + starLayer(dir, 420.0, 0.08 + mwBand * 0.6, 0.16) * 0.9
                        + starLayer(dir, 70.0, 0.08, 0.06) * 1.6;
                col += st * 1.4 * sky * (1.0 - smoothstep(0.0, 0.08, -h)) * smoothstep(0.0, 0.14, h + 0.02);

                // Airglow: a faint green-teal band hugging the horizon on a truly dark night.
                float glowBand = exp(-max(h, 0.0) * 14.0) * smoothstep(-0.03, 0.01, h);
                col += vec3(0.03, 0.09, 0.06) * glowBand * uStarFade * (0.7 + 0.3 * fbm(dir.xz * 3.0 + uTime * 0.01));

                // Shooting star: a short bright segment from A toward B, fading as it goes.
                if (uMeteor > 0.0) {
                    vec3 ab = uMeteorB - uMeteorA;
                    float tt = clamp(dot(dir - uMeteorA, ab) / dot(ab, ab), 0.0, 1.0);
                    float head = uMeteor;                             // 0..1 travel
                    float onTrail = smoothstep(head - 0.35, head, tt) * step(tt, head);
                    float dd = length(dir - (uMeteorA + ab * tt));
                    float m = smoothstep(0.0016, 0.0, dd) * onTrail * sin(uMeteor * 3.14159);
                    col += vec3(0.85, 0.95, 1.0) * m * 1.6 * sky;
                }

                // (No moon: it is a new-moon night. The disc still exists for daytime.)
                float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
                col += vec3(0.97, 0.98, 1.0) * pow(moonDot, 430.0) * (1.0 - uStarFade) * 0.0;

                gl_FragColor = vec4(col, 1.0);
            }`,
        side: THREE.BackSide,
        depthWrite: false,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1800, 64, 32), skyMat);
    skyDome.renderOrder = -1;
    scene.add(skyDome);

    // ── Lights ── (four, fixed count, forever)
    const ambient = new THREE.AmbientLight(0x0e1428, 0.11);
    const hemi = new THREE.HemisphereLight(0x121c38, 0x04060c, 0.4);
    const sunLight = new THREE.DirectionalLight(0xffcf8a, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 900;
    sunLight.shadow.camera.left = -300;
    sunLight.shadow.camera.right = 300;
    sunLight.shadow.camera.top = 300;
    sunLight.shadow.camera.bottom = -300;
    sunLight.shadow.bias = -0.0006;
    const moonLight = new THREE.DirectionalLight(0x8fa2ff, 0);
    scene.add(ambient, hemi, sunLight, moonLight);

    // ── Celestial bodies ──
    const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(18, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffb066, fog: false }));
    const sunGlow = makeGlowSprite(0xffa050, 0.9);
    const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(14, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff6e8, fog: false }));
    const moonGlow = makeGlowSprite(0xccddff, 0.5);
    moonGlow.scale.set(220, 220, 1);
    scene.add(sunMesh, sunGlow, moonMesh, moonGlow);

    scene.fog = new THREE.FogExp2(0x080c1a, 0.003);

    // ── State ──
    let timeOfDay = startTime;
    // Bay: the night is the world, so the clock crawls. 0.0007 gives ~7.5 min of full
    // night (t 0.62 → 0.93) before predawn. N still freezes it, < > still scrub.
    let cycleSpeed = 0.0007;
    let frozen = false;
    let day = 1;
    let ceremony = null;          // { remaining, speed } — fast-forward to sunset
    let underwater = 0;
    const meteorA = new THREE.Vector3(), meteorB = new THREE.Vector3();
    let meteorT = -1, meteorWait = 4;

    const cfg = {
        sunY: 0, sunColor: new THREE.Color(), sunInt: 0,
        skyTop: new THREE.Color(), skyHoriz: new THREE.Color(), skyBot: new THREE.Color(),
        fogColor: new THREE.Color(), fogDens: 0,
        ambColor: new THREE.Color(), ambInt: 0,
        hemiSky: new THREE.Color(), hemiGrnd: new THREE.Color(),
        moonVis: 0, starFade: 0, haze: 0, cloud: 0,
    };

    function sample(t) {
        t = ((t % 1) + 1) % 1;
        let a = PHASES.night, b = PHASES.night, f = 0;
        for (const [lo, hi, pa, pb] of SEGMENTS) {
            if (t >= lo && t < hi) { a = pa; b = pb; f = (t - lo) / (hi - lo); break; }
        }
        const n = (x, y) => x + (y - x) * f;
        cfg.sunY = n(a.sunY, b.sunY);
        cfg.sunInt = n(a.sunInt, b.sunInt);
        cfg.fogDens = n(a.fogDens, b.fogDens);
        cfg.ambInt = n(a.ambInt, b.ambInt);
        cfg.moonVis = n(a.moonVis, b.moonVis);
        cfg.starFade = n(a.starFade, b.starFade);
        cfg.haze = n(a.haze, b.haze);
        cfg.cloud = n(a.cloud, b.cloud);
        lerpColor(a.sunColor, b.sunColor, f, cfg.sunColor);
        lerpColor(a.skyTop, b.skyTop, f, cfg.skyTop);
        lerpColor(a.skyHoriz, b.skyHoriz, f, cfg.skyHoriz);
        lerpColor(a.skyBot, b.skyBot, f, cfg.skyBot);
        lerpColor(a.fogColor, b.fogColor, f, cfg.fogColor);
        lerpColor(a.ambColor, b.ambColor, f, cfg.ambColor);
        lerpColor(a.hemiSky, b.hemiSky, f, cfg.hemiSky);
        lerpColor(a.hemiGrnd, b.hemiGrnd, f, cfg.hemiGrnd);
        return cfg;
    }

    const sunDir = new THREE.Vector3();
    const moonDir = new THREE.Vector3();
    const UNDERWATER_FOG = new THREE.Color(0x0a3f4a);

    function update(delta, time, camera) {
        if (ceremony) {
            const step = delta * ceremony.speed;
            timeOfDay += step;
            ceremony.remaining -= step;
            if (ceremony.remaining <= 0) ceremony = null;
        } else if (!frozen) {
            timeOfDay += delta * cycleSpeed;
            if (timeOfDay >= 1) day++;
        }
        timeOfDay = ((timeOfDay % 1) + 1) % 1;

        const c = sample(timeOfDay);

        // ── celestial geometry ──
        // t=0 sunrise in the east (+X), t=0.25 overhead, t=0.5 sunset in the sea (−X).
        const a = timeOfDay * Math.PI * 2;
        sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(DECLINATION), Math.sin(a) * Math.sin(DECLINATION)).normalize();
        moonDir.set(-Math.cos(a), -Math.sin(a) * Math.cos(DECLINATION) + 0.12, -Math.sin(a) * Math.sin(DECLINATION)).normalize();

        skyMat.uniforms.uTop.value.copy(c.skyTop);
        skyMat.uniforms.uHoriz.value.copy(c.skyHoriz);
        skyMat.uniforms.uBot.value.copy(c.skyBot);
        skyMat.uniforms.uTime.value = time;
        skyMat.uniforms.uSunDir.value.copy(sunDir);
        skyMat.uniforms.uMoonDir.value.copy(moonDir);
        skyMat.uniforms.uSunColor.value.copy(c.sunColor);
        skyMat.uniforms.uStarFade.value = c.starFade;
        skyMat.uniforms.uHaze.value = c.haze;
        skyMat.uniforms.uCloud.value = c.cloud;

        // Shooting stars every 9–24 s at night, ~0.9 s each.
        meteorWait -= delta;
        if (meteorT < 0 && meteorWait <= 0 && c.starFade > 0.6) {
            const az = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 0.5;
            meteorA.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
            const az2 = az + (Math.random() - 0.5) * 0.5, el2 = el - 0.12 - Math.random() * 0.12;
            meteorB.set(Math.cos(az2) * Math.cos(el2), Math.sin(el2), Math.sin(az2) * Math.cos(el2));
            meteorT = 0;
        }
        if (meteorT >= 0) {
            meteorT += delta / 0.9;
            if (meteorT >= 1) { meteorT = -1; meteorWait = 9 + Math.random() * 15; }
        }
        skyMat.uniforms.uMeteorA.value.copy(meteorA);
        skyMat.uniforms.uMeteorB.value.copy(meteorB);
        skyMat.uniforms.uMeteor.value = Math.max(meteorT, 0);

        if (camera) skyDome.position.set(camera.position.x, 0, camera.position.z);

        // ── fog ──
        scene.fog.color.copy(c.fogColor);
        scene.fog.density = c.fogDens;
        scene.background = c.fogColor;
        if (underwater > 0.001) {
            // Green-blue, and thick — you should not be able to see the beach from the
            // bottom. Applied here rather than in main so nothing else has to know.
            scene.fog.color.lerp(UNDERWATER_FOG, underwater);
            scene.fog.density = c.fogDens * (1 - underwater) + 0.055 * underwater;
            scene.background = scene.fog.color;
        }

        // ── lights ──
        ambient.color.copy(c.ambColor);
        ambient.intensity = c.ambInt * (1 - underwater * 0.45);
        hemi.color.copy(c.hemiSky);
        hemi.groundColor.copy(c.hemiGrnd);
        hemi.intensity = c.ambInt * 0.85;
        sunLight.color.copy(c.sunColor);
        sunLight.intensity = c.sunInt * (1 - underwater * 0.7);
        sunLight.visible = sunLight.intensity > 0.02;
        // Along sunDir, like everything else. Kept just above the horizon so that at
        // sunset the light rakes across the sand instead of coming up from under it.
        sunLight.position.set(sunDir.x * 340, Math.max(sunDir.y * 340, 12), sunDir.z * 340);
        if (camera) {
            sunLight.target.position.set(camera.position.x, 0, camera.position.z);
            sunLight.target.updateMatrixWorld();
        }
        moonLight.color.setHex(0x8fa2ff);
        // + a cool starlight key at night so shapes have a lit side, not just a fill.
        moonLight.intensity = c.moonVis * 0.55 + Math.max(0, 0.7 - c.sunInt * 0.8);
        moonLight.position.set(moonDir.x * 300, 220, moonDir.z * 300);

        // ── discs ──
        // THE ONE RULE HERE: the disc goes wherever sunDir points, full stop.
        // This used to place X and Z from sunDir but Y from the phase table's `sunY`,
        // which is a different quantity entirely — the sky shader drew its sun along
        // sunDir at ~35° while the mesh sat at ~12°, and you got two suns in the sky.
        // Offset by the camera in X/Z exactly as skyDome is, and NOT in Y, also exactly
        // as skyDome is. The dome is what draws the sun's glow and scatter, so if the
        // disc does not share the dome's centre the two drift apart as you walk down the
        // beach — which looked like a second, smaller sun sitting beside the first.
        const R = 900;
        const cx = camera ? camera.position.x : 0;
        const cz = camera ? camera.position.z : 0;
        sunMesh.position.set(cx + sunDir.x * R, sunDir.y * R, cz + sunDir.z * R);
        // Kept visible a little way under the horizon so it sinks into the sea rather
        // than blinking out of existence.
        sunMesh.visible = sunDir.y > -0.05;
        sunMesh.material.color.copy(c.sunColor);
        // Atmospheric magnification: the sun looks enormous on the horizon and small
        // overhead. Faked, and worth it — this is the shot people remember.
        const lowness = 1 - THREE.MathUtils.clamp(Math.abs(sunDir.y) * 3.0, 0, 1);
        sunMesh.scale.setScalar(1 + lowness * 1.5);
        sunGlow.position.copy(sunMesh.position);
        sunGlow.visible = sunMesh.visible;
        // Sized in world units at R = 900, so this IS an angular size: 200 units is
        // ~12.7°, which is already a generous halo. It was 580 (37°) and that single
        // number was most of the "the whole horizon is white" problem.
        sunGlow.scale.setScalar(120 + lowness * 80);
        sunGlow.material.opacity = THREE.MathUtils.clamp(0.22 + lowness * 0.34, 0, 1);

        // Same rule for the moon. It used to be clamped to y >= 0.06, which shoved it
        // into the sky in the middle of the afternoon while it was actually below the
        // horizon — the other half of the two-suns bug.
        moonMesh.position.set(
            cx + moonDir.x * R * 0.85, moonDir.y * R * 0.85, cz + moonDir.z * R * 0.85);
        moonMesh.visible = c.moonVis > 0.04 && moonDir.y > -0.02;
        moonMesh.scale.setScalar(1 + (1 - THREE.MathUtils.clamp(moonDir.y * 3, 0, 1)) * 0.5);
        moonGlow.position.copy(moonMesh.position);
        moonGlow.visible = moonMesh.visible;
        moonGlow.material.opacity = c.moonVis * 0.55;

        return c;
    }

    function label() {
        for (const [hi, name] of LABELS) if (timeOfDay < hi) return name;
        return 'NIGHT';
    }

    return {
        update,
        getConfig: () => cfg,
        getSunDir: () => sunDir,
        getSunColor: () => cfg.sunColor,
        getHorizonColor: () => cfg.skyHoriz,
        label,
        getDay: () => day,
        getTime: () => timeOfDay,
        setTime: (t) => { timeOfDay = ((t % 1) + 1) % 1; },
        scrub: (d) => { timeOfDay = ((timeOfDay + d) % 1 + 1) % 1; },
        toggleFreeze: () => { frozen = !frozen; return frozen; },
        isFrozen: () => frozen,
        /** How far under the surface the camera is, 0..1. Drives fog and light. */
        setUnderwater: (v) => { underwater = THREE.MathUtils.clamp(v, 0, 1); },

        /** Fast-forward to the sunset everyone came out onto the sand for (~20s). */
        startSunsetCeremony() {
            if (ceremony) return;
            let dist = (0.487 - timeOfDay + 1) % 1;   // just before it touches the water
            if (dist < 0.04) dist += 1;               // already there — run a whole day round
            ceremony = { remaining: dist, speed: dist / 20 };
        },
        isCeremonyRunning: () => !!ceremony,

        /** How "sunset" it is right now, 0..1, peaking as the sun touches the water. */
        duskFactor() {
            const t = timeOfDay;
            if (t > 0.43 && t < 0.57) return 1 - Math.abs(t - 0.50) / 0.07;
            return 0;
        },
        /** How "night" it is, 0..1 — everything that glows fades in on this. */
        nightFactor: () => cfg.starFade,
    };
}
