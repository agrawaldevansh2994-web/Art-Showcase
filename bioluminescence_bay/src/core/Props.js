// The prop library. Everything the coast is furnished with — palms, tapestries, chai
// mamas, boats, shacks, shrines, speaker stacks — lives here so the zone files stay
// about composition.
//
// Convention: builders return either a Group, or { group, update } when they animate.
// Everything is placed with getTerrainHeight() so nothing ever floats or sinks.

import * as THREE from 'three';
import { getTerrainHeight, getTerrainNormal } from './Terrain.js';
import { PALETTE, FLUORO_COLORS, BOAT_COLORS } from './constants.js';
import { markDynamic } from './Merge.js';

// ─────────────────────────────────────────────────────────────
//  SHARED MATERIALS  (built once — a stall on every corner should not
//  mean a new shader program on every corner)
// ─────────────────────────────────────────────────────────────
/**
 * Marks a material/geometry/texture as owned by this library rather than by the zone
 * that happens to be holding it. ZoneManager.unload() disposes everything in the group
 * it is tearing down, and without this flag it would dispose MAT.bamboo out from under
 * every other zone still drawing with it.
 */
export function markShared(resource) {
    resource.userData = resource.userData || {};
    resource.userData.shared = true;
    return resource;
}

export const MAT = {
    bamboo: new THREE.MeshStandardMaterial({ color: PALETTE.bamboo, roughness: 0.88 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4c2c, roughness: 0.92 }),
    darkWood: new THREE.MeshStandardMaterial({ color: PALETTE.darkWood, roughness: 0.95 }),
    thatch: new THREE.MeshStandardMaterial({ color: PALETTE.thatch, roughness: 1.0 }),
    palmLeaf: new THREE.MeshLambertMaterial({ color: 0x3f6b32, side: THREE.DoubleSide }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.94 }),
    laterite: new THREE.MeshStandardMaterial({ color: PALETTE.laterite, roughness: 0.97 }),
    // Structural metal sits at 0.5 with a hint of emissive on purpose: at metalness ~1
    // with no envMap, PBR metal takes all its colour from a reflection that does not
    // exist and renders as a black silhouette at night.
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.45, metalness: 0.5, emissive: 0x0a0c10 }),
    scaffold: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.55, emissive: 0x121418 }),
    tin: new THREE.MeshStandardMaterial({ color: 0x7a7d80, roughness: 0.55, metalness: 0.5 }),
    speaker: new THREE.MeshStandardMaterial({ color: 0x0f0f14, roughness: 0.85 }),
    cone: new THREE.MeshStandardMaterial({ color: 0x1e1e26, roughness: 0.6 }),
    rope: new THREE.MeshBasicMaterial({ color: 0x9a8a6a }),
    wire: new THREE.MeshBasicMaterial({ color: 0x2e2b22 }),
    cloth: new THREE.MeshLambertMaterial({ color: 0xd8c9a8, side: THREE.DoubleSide }),
};
Object.values(MAT).forEach(markShared);

const glowCache = new Map();
export function glowMaterial(color, opacity = 1) {
    const key = `${color}_${opacity}`;
    if (!glowCache.has(key)) {
        glowCache.set(key, markShared(new THREE.MeshBasicMaterial({
            color, fog: false, transparent: opacity < 1, opacity,
        })));
    }
    return glowCache.get(key);
}

/**
 * A CACHED opaque material. Use this instead of `new THREE.Mesh*Material` for anything
 * that does not animate its own material.
 *
 * This matters more than it looks. The first build of this world created a fresh
 * material per prop — the flea market ended up holding 347 of them across 742 meshes,
 * which is half the reason it ran at 10 fps. Sharing material instances is also what
 * makes Merge.mergeStatics() able to collapse those meshes into a handful of buffers:
 * it groups by material identity, so uncached materials merge into nothing.
 *
 * NEVER animate a material you got from here — it is shared world-wide, and the classic
 * symptom is every prop of that colour flickering in unison. Build your own for that.
 */
const plainCache = new Map();
export function plain(color, opts = {}) {
    const kind = opts.kind ?? 'lambert';
    const side = opts.side ?? THREE.FrontSide;
    const key = `${kind}|${color}|${side}|${opts.roughness ?? 0.9}|${opts.metalness ?? 0}|`
        + `${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.opacity ?? 1}|`
        + `${opts.transparent ? 1 : 0}|${opts.wireframe ? 1 : 0}`;
    if (!plainCache.has(key)) {
        const base = {
            color, side,
            transparent: !!opts.transparent,
            opacity: opts.opacity ?? 1,
            wireframe: !!opts.wireframe,
        };
        const m = kind === 'lambert'
            ? new THREE.MeshLambertMaterial(base)
            : new THREE.MeshStandardMaterial({
                ...base,
                roughness: opts.roughness ?? 0.9,
                metalness: opts.metalness ?? 0,
                emissive: opts.emissive ?? 0x000000,
                emissiveIntensity: opts.emissiveIntensity ?? 1,
            });
        markShared(m);
        plainCache.set(key, m);
    }
    return plainCache.get(key);
}

// The radial-gradient texture behind a glow sprite depends only on (color, alpha).
// Cached by key — building one per call leaks a texture per prop per zone load.
const glowTexCache = new Map();
function glowTexture(color, alpha) {
    const key = `${color}_${alpha}`;
    if (!glowTexCache.has(key)) {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const cx = c.getContext('2d');
        const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
        const grad = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.25})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grad;
        cx.fillRect(0, 0, 128, 128);
        glowTexCache.set(key, markShared(new THREE.CanvasTexture(c)));
    }
    return glowTexCache.get(key);
}

// A neutral white radial falloff, for Points fields that colour themselves per-vertex.
// Same rule as the glow sprites: a PointsMaterial with no map draws hard squares.
let _particleTex = null;
export function particleTexture() {
    if (!_particleTex) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const cx = c.getContext('2d');
        const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.42)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = grad;
        cx.fillRect(0, 0, 64, 64);
        _particleTex = markShared(new THREE.CanvasTexture(c));
    }
    return _particleTex;
}

export function makeGlowSprite(color, alpha = 0.8, size = 4) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(color, alpha), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    s.scale.set(size, size, 1);
    return s;
}

// ─────────────────────────────────────────────────────────────
//  FLUORO — the UV paint system
//
//  The visual signature of a Goa party, and it costs ZERO lights. A fluoro material is
//  ordinary painted cloth by day; at night its emissive comes up and bloom does the
//  rest. Driven once per frame from updateFluoro(ctx), never per object.
//
//  `boost` is the important knob. Real blacklight has a huge dynamic range — a few
//  things scream and most stay nearly dark. Everything at boost 1 reads as neon soup.
//  Use ~1.8 for the two or three hero pieces on a floor, ~0.35 for background dressing.
// ─────────────────────────────────────────────────────────────
const fluoroCache = new Map();
const fluoroMats = [];

/** Register any material to be driven by the night factor. Used for mapped tapestries. */
export function registerFluoro(mat, boost = 1) {
    mat.userData = mat.userData || {};
    mat.userData.fluoroBoost = boost;
    fluoroMats.push(mat);
    return mat;
}

export function fluoro(color, opts = {}) {
    const boost = opts.boost ?? 1;
    const key = `${color}_${boost}_${opts.side ?? 2}`;
    if (!fluoroCache.has(key)) {
        const m = new THREE.MeshStandardMaterial({
            color, roughness: 0.95, metalness: 0,
            emissive: color, emissiveIntensity: 0,
            side: opts.side ?? THREE.DoubleSide,
        });
        markShared(registerFluoro(m, boost));
        fluoroCache.set(key, m);
    }
    return fluoroCache.get(key);
}

/** One call a frame from main.js drives every fluoro surface in the world. */
export function updateFluoro(ctx) {
    const night = ctx.night ?? 0;
    // Squared, so the paint stays paint right through the sunset and only lights up
    // once it is genuinely dark. A linear ramp made everything glow at golden hour.
    const drive = night * night * 1.7;
    for (let i = 0; i < fluoroMats.length; i++) {
        const m = fluoroMats[i];
        m.emissiveIntensity = drive * m.userData.fluoroBoost;
    }
}

// ─────────────────────────────────────────────────────────────
//  SIGNAGE
// ─────────────────────────────────────────────────────────────
const signTexCache = new Map();
function signTexture(text, opts) {
    const w = opts.w ?? 512, h = opts.h ?? 128;
    const key = JSON.stringify([text, w, h, opts.bg, opts.weight, opts.size,
        opts.color, opts.gradient, opts.glow, opts.font]);
    if (!signTexCache.has(key)) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');

        if (opts.bg !== false) {
            cx.fillStyle = opts.bg || 'rgba(18,10,6,0.85)';
            cx.fillRect(0, 0, w, h);
        }
        cx.font = `${opts.weight ?? 'bold'} ${opts.size ?? 52}px ${opts.font ?? 'system-ui, sans-serif'}`;
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';

        if (opts.gradient) {
            const g = cx.createLinearGradient(0, 0, w, 0);
            opts.gradient.forEach((stop, i) => g.addColorStop(i / (opts.gradient.length - 1), stop));
            cx.fillStyle = g;
        } else {
            cx.fillStyle = opts.color || '#ffd27a';
        }
        cx.shadowColor = opts.glow || 'rgba(255,150,40,0.8)';
        cx.shadowBlur = 22;
        cx.fillText(text, w / 2, h / 2 + 2);

        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        signTexCache.set(key, markShared(tex));
    }
    return signTexCache.get(key);
}

export function makeSign(text, opts = {}) {
    const w = opts.w ?? 512, h = opts.h ?? 128;
    return new THREE.Mesh(
        new THREE.PlaneGeometry(opts.width ?? 6, (opts.width ?? 6) * (h / w)),
        new THREE.MeshBasicMaterial({
            map: signTexture(text, opts), transparent: true, fog: false, side: THREE.DoubleSide,
        })
    );
}

// ─────────────────────────────────────────────────────────────
//  LIGHT BUDGET
//
//  Three.js bakes the scene's light count into every material's shader, so real lights
//  are a scarce resource: ~25 for the whole loaded world. Anything that glows is an
//  emissive material plus an additive sprite unless it asks with `light: true`.
//  The fluoro system above is designed to need none at all.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  TAPESTRIES — the psychedelic UV cloth behind every booth on this coast
// ─────────────────────────────────────────────────────────────
const tapestryTexCache = new Map();

/** Mandala / spiral / eye patterns, painted in fluoro on black. */
function tapestryTexture(kind, seed) {
    const key = `${kind}_${seed}`;
    if (tapestryTexCache.has(key)) return tapestryTexCache.get(key);

    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#08040c';
    g.fillRect(0, 0, S, S);

    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    const cols = FLUORO_COLORS.map(hex);
    const rot = (seed % 7) * 0.4;

    g.translate(S / 2, S / 2);
    g.rotate(rot);
    g.lineWidth = 3;

    if (kind === 'mandala') {
        for (let ring = 8; ring >= 1; ring--) {
            const r = ring * 28;
            const spokes = 6 + ring * 2;
            g.strokeStyle = cols[(ring + seed) % cols.length];
            g.beginPath();
            g.arc(0, 0, r, 0, Math.PI * 2);
            g.stroke();
            for (let i = 0; i < spokes; i++) {
                const a = (i / spokes) * Math.PI * 2;
                g.beginPath();
                g.moveTo(Math.cos(a) * (r - 26), Math.sin(a) * (r - 26));
                g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                g.stroke();
                g.fillStyle = cols[(ring + i + seed) % cols.length];
                g.beginPath();
                g.arc(Math.cos(a) * r, Math.sin(a) * r, 3.5, 0, Math.PI * 2);
                g.fill();
            }
        }
    } else if (kind === 'spiral') {
        for (let arm = 0; arm < 5; arm++) {
            g.strokeStyle = cols[(arm + seed) % cols.length];
            g.lineWidth = 5;
            g.beginPath();
            for (let t = 0; t < 220; t++) {
                const a = t * 0.09 + arm * (Math.PI * 2 / 5);
                const r = t * 1.05;
                const x = Math.cos(a) * r, y = Math.sin(a) * r;
                if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.stroke();
        }
    } else { // 'eye' — the third eye everyone paints on these
        g.strokeStyle = cols[seed % cols.length];
        g.lineWidth = 7;
        g.beginPath();
        g.ellipse(0, 0, 190, 105, 0, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = cols[(seed + 2) % cols.length];
        g.beginPath();
        g.arc(0, 0, 62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#08040c';
        g.beginPath();
        g.arc(0, 0, 26, 0, Math.PI * 2);
        g.fill();
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            g.strokeStyle = cols[(i + seed) % cols.length];
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(Math.cos(a) * 200, Math.sin(a) * 115);
            g.lineTo(Math.cos(a) * 246, Math.sin(a) * 142);
            g.stroke();
        }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    markShared(tex);
    tapestryTexCache.set(key, tex);
    return tex;
}

const tapestryMatCache = new Map();
function tapestryMaterial(kind, seed, boost) {
    const key = `${kind}_${seed}_${boost}`;
    if (!tapestryMatCache.has(key)) {
        const tex = tapestryTexture(kind, seed);
        const m = new THREE.MeshStandardMaterial({
            map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0,
            color: 0xbbbbbb, roughness: 1, side: THREE.DoubleSide,
        });
        markShared(registerFluoro(m, boost));
        tapestryMatCache.set(key, m);
    }
    return tapestryMatCache.get(key);
}

/**
 * A UV cloth strung between two points, sagging and rippling in the sea breeze.
 * `kind`: 'mandala' | 'spiral' | 'eye'.
 */
export function buildTapestry(x1, z1, x2, z2, opts = {}) {
    const height = opts.height ?? 4.2;
    const top = opts.top ?? 6.0;
    const kind = opts.kind ?? 'mandala';
    const seed = opts.seed ?? 0;
    const g = new THREE.Group();

    const y1 = (opts.baseY ?? getTerrainHeight(x1, z1)) + top;
    const y2 = (opts.baseY ?? getTerrainHeight(x2, z2)) + top;
    const span = Math.hypot(x2 - x1, z2 - z1);

    const geo = new THREE.PlaneGeometry(span, height, 14, 6);
    const mesh = markDynamic(new THREE.Mesh(geo, tapestryMaterial(kind, seed, opts.boost ?? 1.5)));
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2 - height / 2, (z1 + z2) / 2);
    mesh.rotation.y = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
    g.add(mesh);

    if (opts.poles !== false) {
        for (const [px, pz] of [[x1, z1], [x2, z2]]) {
            const ty = opts.baseY ?? getTerrainHeight(px, pz);
            const h = top + 0.5;
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, h, 6), MAT.bamboo);
            pole.position.set(px, ty + h / 2, pz);
            g.add(pole);
        }
    }

    // The cloth is one mesh, so it cannot be animated per-object — it is animated as a
    // whole, by pushing its own vertices. Sag baked in once, ripple every frame.
    const pos = geo.attributes.position;
    const base = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) / span) + 0.5;
        base[i * 2] = u;
        base[i * 2 + 1] = pos.getY(i);
        pos.setY(i, pos.getY(i) - Math.sin(u * Math.PI) * (opts.sag ?? 0.35));
    }
    pos.needsUpdate = true;

    function update(ctx) {
        const t = ctx.time;
        const wind = 0.5 + (ctx.weather?.stormLevel ?? 0) * 2.4;
        for (let i = 0; i < pos.count; i++) {
            const u = base[i * 2];
            const v = (base[i * 2 + 1] / height) + 0.5;
            pos.setZ(i, Math.sin(t * 1.6 + u * 5.5 + seed) * 0.22 * wind * (0.35 + v * 0.65));
        }
        pos.needsUpdate = true;
    }
    update({ time: 0 });

    return { group: g, update };
}

// ─────────────────────────────────────────────────────────────
//  DECO — the stretched UV canopy overhead
//
//  The thing that actually reads as "psytrance floor" in every photograph of one, and
//  the piece this world was missing: a radial mandala pulled up over the crowd, with
//  stretched sails fanning off its rim. Same material family as the tapestries above —
//  a fluoro emissiveMap driven by the night factor, costing ZERO real lights.
//
//  Both shapes map a RADIAL texture, which is why one generator serves both: the canopy
//  maps its polar coordinates straight onto the texture disc, and each sail maps its
//  boundary loop evenly around that same disc.
// ─────────────────────────────────────────────────────────────

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const decoTexCache = new Map();

/**
 * A kaleidoscopic fluoro mandala on near-black.
 *
 * Every random choice is made UP FRONT into `rings`, before a single stroke is drawn,
 * because the wedge is redrawn once per sector per mirror. Consuming the RNG *while*
 * drawing would give every sector different content and the symmetry — the entire point
 * of the pattern — would collapse into noise.
 */
function decoTexture(seed, sectors = 12, S = 768) {
    const key = `deco_${seed}_${sectors}_${S}`;
    if (decoTexCache.has(key)) return decoTexCache.get(key);

    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#04020a';
    g.fillRect(0, 0, S, S);

    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    const cols = FLUORO_COLORS.map(hex);
    const rnd = mulberry32(seed * 7919 + 17);
    const pick = () => cols[Math.floor(rnd() * cols.length)];
    const R = S / 2;
    const TAU = Math.PI * 2;
    const half = Math.PI / sectors;

    const RING_COUNT = 11;
    const rings = [];
    for (let i = 0; i < RING_COUNT; i++) {
        const t = (i + 1) / RING_COUNT;
        rings.push({
            r: R * (0.08 + t * 0.87),
            eye: R * (0.019 + rnd() * 0.026),
            a: pick(), b: pick(), c: pick(),
            petal: rnd() > 0.40,
            band: rnd() > 0.35,
            dots: 2 + Math.floor(rnd() * 4),
            lw: 2 + rnd() * 3,
        });
    }

    function eye(x, y, rad, a, b, cc) {
        g.fillStyle = a; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
        g.fillStyle = b; g.beginPath(); g.arc(x, y, rad * 0.62, 0, TAU); g.fill();
        g.fillStyle = cc; g.beginPath(); g.arc(x, y, rad * 0.28, 0, TAU); g.fill();
        g.strokeStyle = '#04020a'; g.lineWidth = Math.max(1, rad * 0.14);
        g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke();
    }

    function wedge() {
        for (const ring of rings) {
            if (ring.band) {
                g.strokeStyle = ring.a;
                g.lineWidth = ring.lw;
                g.beginPath();
                g.arc(0, 0, ring.r, -half, half);
                g.stroke();
            }
            // The motif on the wedge axis. It is its own mirror, so it is what gives
            // each ring its beat.
            eye(ring.r, 0, ring.eye, ring.a, ring.b, ring.c);

            if (ring.petal) {
                // A tapered leaf held off the axis; the mirror pass turns it into a pair.
                const ang = half * 0.58;
                const rr = ring.r * 0.93;
                const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
                const ir = rr - ring.eye * 2.4;
                g.strokeStyle = ring.b;
                g.lineWidth = ring.lw * 0.85;
                g.beginPath();
                g.moveTo(Math.cos(ang) * ir, Math.sin(ang) * ir);
                g.quadraticCurveTo(px + ring.eye, py - ring.eye, px, py + ring.eye * 1.7);
                g.stroke();
            }
            for (let d = 0; d < ring.dots; d++) {
                const ang = half * (0.25 + (d / ring.dots) * 0.68);
                const rr = ring.r - ring.eye * 1.9;
                g.fillStyle = ring.c;
                g.beginPath();
                g.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, ring.lw * 0.55, 0, TAU);
                g.fill();
            }
        }
    }

    g.save();
    g.translate(R, R);
    g.lineCap = 'round';
    for (let s = 0; s < sectors; s++) {
        for (const mir of [1, -1]) {
            g.save();
            g.rotate((s / sectors) * TAU);
            g.scale(1, mir);
            wedge();
            g.restore();
        }
    }
    // Centre rosette last, so it sits on top of where every spoke converges. Small, and
    // dark in the middle on purpose: a solid fluoro disc at the convergence point is the
    // brightest thing on the canopy and bloomed into a plain white blob overhead.
    for (let i = 5; i >= 1; i--) {
        g.fillStyle = i === 1 ? '#08040f' : cols[(seed + i) % cols.length];
        g.beginPath();
        g.arc(0, 0, R * 0.026 * i, 0, TAU);
        g.fill();
    }
    g.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    markShared(tex);
    decoTexCache.set(key, tex);
    return tex;
}

const decoMatCache = new Map();
function decoMaterial(seed, sectors, S, boost) {
    const key = `${seed}_${sectors}_${S}_${boost}`;
    if (!decoMatCache.has(key)) {
        const tex = decoTexture(seed, sectors, S);
        const m = new THREE.MeshStandardMaterial({
            map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0,
            color: 0x8e8e8e, roughness: 1, side: THREE.DoubleSide,
        });
        markShared(registerFluoro(m, boost));
        decoMatCache.set(key, m);
    }
    return decoMatCache.get(key);
}

const _sA = new THREE.Vector3(), _sB = new THREE.Vector3(), _sUp = new THREE.Vector3(0, 1, 0);
/** A thin cylinder spanning two points — guy lines, rigging, rope runs. */
function strut(ax, ay, az, bx, by, bz, radius, mat) {
    _sA.set(ax, ay, az);
    _sB.set(bx, by, bz).sub(_sA);
    const len = _sB.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 5), mat);
    m.position.set(ax + _sB.x * 0.5, ay + _sB.y * 0.5, az + _sB.z * 0.5);
    m.quaternion.setFromUnitVectors(_sUp, _sB.normalize());
    return m;
}

/**
 * The hero piece: a mandala canopy pulled up over the floor on `points` anchors and
 * scalloped between them, which is how stretched deco actually hangs — taut at the
 * tie-off, sagging in the bays.
 *
 * Returns its `anchors` so the caller can register collision on the masts; this builder
 * deliberately does not touch the collision system itself.
 */
export function buildDecoCanopy(cx, cz, opts = {}) {
    const R = opts.radius ?? 14;
    const points = opts.points ?? 6;
    const top = opts.top ?? 11;
    const drop = opts.drop ?? 2.4;          // centre-to-rim fall
    const scallop = opts.scallop ?? 1.5;    // extra sag midway between anchors
    const seed = opts.seed ?? 0;
    const baseY = opts.baseY ?? getTerrainHeight(cx, cz);
    const g = new THREE.Group();

    const RINGS = 8, SEG = points * 10;
    const pos = [], uv = [], idx = [];
    for (let ring = 0; ring <= RINGS; ring++) {
        const t = ring / RINGS;
        for (let s = 0; s < SEG; s++) {
            const a = (s / SEG) * Math.PI * 2;
            // 0 at an anchor, 1 midway between two.
            const sc = (1 - Math.cos(a * points)) * 0.5;
            const rad = R * t * (1 - sc * 0.10 * t);
            pos.push(
                Math.cos(a) * rad,
                top - t * t * drop - sc * scallop * t * t,
                Math.sin(a) * rad);
            uv.push(0.5 + 0.5 * Math.cos(a) * t, 0.5 + 0.5 * Math.sin(a) * t);
        }
    }
    for (let ring = 0; ring < RINGS; ring++) {
        for (let s = 0; s < SEG; s++) {
            const a0 = ring * SEG + s, a1 = ring * SEG + ((s + 1) % SEG);
            idx.push(a0, a0 + SEG, a1 + SEG, a0, a1 + SEG, a1);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mesh = markDynamic(new THREE.Mesh(
        geo, decoMaterial(seed, opts.sectors ?? 12, 768, opts.boost ?? 1.7)));
    mesh.position.set(cx, baseY, cz);
    g.add(mesh);

    const rimY = baseY + top - drop;
    const anchors = [];
    for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
        anchors.push({ x: px, z: pz, y: rimY });

        if (opts.poles !== false) {
            const gy = getTerrainHeight(px, pz);
            const h = rimY - gy + 0.4;
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.10, 0.15, h, 6), opts.poleMat ?? MAT.bamboo);
            pole.position.set(px, gy + h / 2, pz);
            g.add(pole);
        } else if (opts.guys !== false) {
            // No mast: the cloth is tied off to whatever is already standing there —
            // a palm, a scaffold leg — so all that shows is the line going out to it.
            const gx = cx + Math.cos(a) * R * 1.5, gz = cz + Math.sin(a) * R * 1.5;
            g.add(strut(px, rimY, pz, gx, baseY + top * 0.62, gz, 0.035, MAT.rope));
        }
    }

    // Ripple. One mesh, animated as a whole by pushing its own vertices — the shared
    // material rule means it cannot be animated per-object anyway.
    const p = geo.attributes.position;
    const restY = new Float32Array(p.count);
    const rad01 = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
        restY[i] = p.getY(i);
        rad01[i] = Math.hypot(p.getX(i), p.getZ(i)) / R;
    }
    function update(ctx) {
        const t = ctx.time;
        const wind = 0.5 + (ctx.weather?.stormLevel ?? 0) * 2.0;
        for (let i = 0; i < p.count; i++) {
            const rr = rad01[i];
            p.setY(i, restY[i] + Math.sin(t * 0.85 + rr * 4.2 + seed) * 0.17 * wind * rr);
        }
        p.needsUpdate = true;
    }

    return { group: g, update, anchors, rimY };
}

/**
 * One stretched sail between three points. The edges bow INWARD toward the centroid,
 * which is the whole difference between reading as tensioned fabric and reading as a
 * flat triangular cut-out.
 *
 * Static on purpose — real stretched deco barely moves, and staying static lets
 * mergeStatics() collapse a whole fan of them into one draw call per texture.
 */
export function buildDecoSail(corners, opts = {}) {
    const bow = opts.bow ?? 0.26;
    const perEdge = opts.perEdge ?? 8;
    const seed = opts.seed ?? 0;

    const C = corners.map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    const cen = new THREE.Vector3().add(C[0]).add(C[1]).add(C[2]).multiplyScalar(1 / 3);

    const boundary = [];
    for (let e = 0; e < 3; e++) {
        const A = C[e], B = C[(e + 1) % 3];
        const ctrl = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5).lerp(cen, bow);
        for (let i = 0; i < perEdge; i++) {
            const t = i / perEdge, it = 1 - t;
            boundary.push(new THREE.Vector3(
                it * it * A.x + 2 * it * t * ctrl.x + t * t * B.x,
                it * it * A.y + 2 * it * t * ctrl.y + t * t * B.y,
                it * it * A.z + 2 * it * t * ctrl.z + t * t * B.z));
        }
    }

    const N = boundary.length;
    const pos = [cen.x, cen.y + (opts.lift ?? 0.45), cen.z];
    const uv = [0.5, 0.5];
    for (let i = 0; i < N; i++) {
        // Even angular march around the texture disc. The three corners land exactly on
        // thirds, so the pattern stays symmetric across the sail.
        const th = (i / N) * Math.PI * 2;
        pos.push(boundary[i].x, boundary[i].y, boundary[i].z);
        uv.push(0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th));
    }
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, decoMaterial(seed, opts.sectors ?? 6, 512, opts.boost ?? 1.4));
}

// ─────────────────────────────────────────────────────────────
//  PAINTED PANELS — stage fascia, backdrop flanks, booth fronts
//
//  Bilaterally symmetric about the vertical centre, because that is exactly how these
//  are painted in life: lay out one half, mirror it. Drawn into the LEFT half only and
//  then flipped onto the right in one drawImage.
// ─────────────────────────────────────────────────────────────
const panelTexCache = new Map();
function panelTexture(seed, W, H) {
    const key = `panel_${seed}_${W}_${H}`;
    if (panelTexCache.has(key)) return panelTexCache.get(key);

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#050208';
    g.fillRect(0, 0, W, H);

    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    const cols = FLUORO_COLORS.map(hex);
    const rnd = mulberry32(seed * 6151 + 29);
    const pick = () => cols[Math.floor(rnd() * cols.length)];
    const TAU = Math.PI * 2;
    const cx = W / 2, cy = H * 0.52;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Flames radiating off the centre.
    const flames = 7 + Math.floor(rnd() * 4);
    for (let i = 0; i < flames; i++) {
        const a = Math.PI * (0.55 + (i / flames) * 0.92);
        const len = Math.min(W, H) * (0.34 + rnd() * 0.42);
        g.strokeStyle = pick();
        g.lineWidth = 3 + rnd() * 7;
        g.beginPath();
        g.moveTo(cx, cy);
        g.quadraticCurveTo(
            cx + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * W * 0.1,
            cy + Math.sin(a) * len * 0.5,
            cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        g.stroke();
    }
    // Concentric arcs behind them.
    for (let i = 0; i < 6; i++) {
        g.strokeStyle = pick();
        g.lineWidth = 2 + rnd() * 4;
        g.beginPath();
        g.arc(cx, cy, Math.min(W, H) * (0.09 + i * 0.068), Math.PI * 0.5, Math.PI * 1.5);
        g.stroke();
    }
    // The eye. Every one of these has one.
    const eR = Math.min(W, H) * 0.12;
    const eX = cx - W * 0.2, eY = cy - H * 0.04;
    for (const [rr, col] of [[eR, pick()], [eR * 0.64, pick()], [eR * 0.28, '#050208']]) {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(eX, eY, rr * 1.35, rr, 0, 0, TAU);
        g.fill();
    }
    // Zigzag along the bottom edge.
    g.strokeStyle = pick();
    g.lineWidth = Math.max(3, H * 0.02);
    g.beginPath();
    const stepX = W / 22;
    for (let k = 0; k * stepX <= cx; k++) g.lineTo(k * stepX, H * (k % 2 ? 0.88 : 0.95));
    g.stroke();
    for (let i = 0; i < 40; i++) {
        g.fillStyle = pick();
        g.beginPath();
        g.arc(rnd() * cx, rnd() * H, 2 + rnd() * 4, 0, TAU);
        g.fill();
    }

    // Mirror the left half onto the right. Source and destination do not overlap.
    const halfW = Math.ceil(W / 2);
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    g.drawImage(c, 0, 0, halfW, H, 0, 0, halfW, H);
    g.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    markShared(tex);
    panelTexCache.set(key, tex);
    return tex;
}

/**
 * The all-seeing eye in a triangle — the one motif this scene puts front and centre,
 * and the reason the main backdrop has no screen on it.
 *
 * IMPORTANT: pass a canvas whose aspect matches the panel's, or the circle and triangle
 * come out stretched. Everything here is sized off `S = H`, so px-per-world-unit is only
 * uniform when W/H equals the panel's own width/height.
 */
function eyeTexture(seed, W, H) {
    const key = `eyeicon_${seed}_${W}_${H}`;
    if (panelTexCache.has(key)) return panelTexCache.get(key);

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#050208';
    g.fillRect(0, 0, W, H);

    const TAU = Math.PI * 2;
    const cx = W / 2, cy = H * 0.5, S = H;
    const violet = '#9a3cff', cyan = '#1ce7ff', magenta = '#ff2ea6', lime = '#aaff2a';
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Rays clear across the panel, so the wide backdrop is not empty either side.
    const rays = 40;
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU;
        g.strokeStyle = i % 4 === 0 ? magenta : violet;
        g.lineWidth = S * (i % 2 ? 0.006 : 0.012);
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * S * 0.46, cy + Math.sin(a) * S * 0.46);
        g.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
        g.stroke();
    }

    // Lotus petals behind the eye.
    const petals = 26;
    for (let i = 0; i < petals; i++) {
        const a = (i / petals) * TAU;
        g.strokeStyle = i % 2 ? violet : magenta;
        g.lineWidth = S * 0.014;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * S * 0.17, cy + Math.sin(a) * S * 0.17);
        g.lineTo(cx + Math.cos(a) * S * 0.31, cy + Math.sin(a) * S * 0.31);
        g.stroke();
    }

    // Enclosing ring, then the triangle through it.
    g.strokeStyle = violet;
    g.lineWidth = S * 0.022;
    g.beginPath(); g.arc(cx, cy, S * 0.40, 0, TAU); g.stroke();
    g.strokeStyle = lime;
    g.lineWidth = S * 0.008;
    g.beginPath(); g.arc(cx, cy, S * 0.435, 0, TAU); g.stroke();

    g.strokeStyle = violet;
    g.lineWidth = S * 0.028;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i / 3) * TAU;
        const x = cx + Math.cos(a) * S * 0.455, y = cy + Math.sin(a) * S * 0.455;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();

    // The eye itself: a vesica, cut by two arcs.
    const ew = S * 0.27, eh = S * 0.115;
    const almond = () => {
        g.beginPath();
        g.moveTo(cx - ew, cy);
        g.quadraticCurveTo(cx, cy - eh * 2.2, cx + ew, cy);
        g.quadraticCurveTo(cx, cy + eh * 2.2, cx - ew, cy);
        g.closePath();
    };
    almond();
    g.fillStyle = '#0a0616';
    g.fill();

    g.save();
    almond();
    g.clip();
    g.fillStyle = cyan;
    g.beginPath(); g.arc(cx, cy, eh * 1.5, 0, TAU); g.fill();
    g.strokeStyle = '#0a3f4d';
    g.lineWidth = S * 0.012;
    for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * eh * 0.62, cy + Math.sin(a) * eh * 0.62);
        g.lineTo(cx + Math.cos(a) * eh * 1.5, cy + Math.sin(a) * eh * 1.5);
        g.stroke();
    }
    g.fillStyle = '#061a20';
    g.beginPath(); g.arc(cx, cy, eh * 0.58, 0, TAU); g.fill();
    g.fillStyle = '#eafcff';
    g.beginPath(); g.arc(cx - eh * 0.46, cy - eh * 0.46, eh * 0.20, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx + eh * 0.42, cy - eh * 0.60, eh * 0.10, 0, TAU); g.fill();
    g.restore();

    almond();
    g.strokeStyle = violet;
    g.lineWidth = S * 0.020;
    g.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    markShared(tex);
    panelTexCache.set(key, tex);
    return tex;
}

const panelMatCache = new Map();
/** A flat painted panel. Static, so a stage's worth of them merges into one call. */
export function buildDecoPanel(width, height, opts = {}) {
    const seed = opts.seed ?? 0;
    const boost = opts.boost ?? 0.85;
    const kind = opts.kind ?? 'paint';
    const W = opts.w ?? 512, H = opts.h ?? 512;
    const key = `${kind}_${seed}_${boost}_${W}_${H}`;
    if (!panelMatCache.has(key)) {
        const tex = kind === 'eye' ? eyeTexture(seed, W, H) : panelTexture(seed, W, H);
        const m = new THREE.MeshStandardMaterial({
            map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0,
            color: 0x9a9a9a, roughness: 1, side: THREE.DoubleSide,
        });
        markShared(registerFluoro(m, boost));
        panelMatCache.set(key, m);
    }
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), panelMatCache.get(key));
}

// ─────────────────────────────────────────────────────────────
//  FLUORO BUNTING
//  Triangular flags on a line. One InstancedMesh per run.
// ─────────────────────────────────────────────────────────────
export function buildFluoroFlags(x1, z1, x2, z2, opts = {}) {
    const count = opts.count ?? 20;
    const poleH = opts.poleH ?? 5.5;
    const sag = opts.sag ?? 1.4;
    const g = new THREE.Group();

    const y1 = getTerrainHeight(x1, z1) + poleH;
    const y2 = getTerrainHeight(x2, z2) + poleH;

    if (opts.poles !== false) {
        for (const [px, pz] of [[x1, z1], [x2, z2]]) {
            const ty = getTerrainHeight(px, pz);
            const h = poleH + 0.6;
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 6), MAT.bamboo);
            pole.position.set(px, ty + h / 2, pz);
            g.add(pole);
        }
    }

    const pts = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        pts.push(new THREE.Vector3(
            THREE.MathUtils.lerp(x1, x2, t),
            THREE.MathUtils.lerp(y1, y2, t) - Math.sin(t * Math.PI) * sag,
            THREE.MathUtils.lerp(z1, z2, t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, count * 2, 0.03, 4, false), MAT.rope));

    // A pennant: a triangle hanging from its top edge.
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(
        [-0.34, 0, 0, 0.34, 0, 0, 0, -0.9, 0], 3));
    flagGeo.setIndex([0, 1, 2]);
    flagGeo.computeVertexNormals();

    const flagMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveIntensity: 0, roughness: 1,
    });
    // Bunting is background dressing, not a hero piece — it stays comparatively dim.
    registerFluoro(flagMat, opts.boost ?? 0.55);

    const flags = new THREE.InstancedMesh(flagGeo, flagMat, count);
    flags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flags.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    flags.frustumCulled = false;

    const facing = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
    const col = new THREE.Color();
    const anchors = [];
    for (let i = 0; i < count; i++) {
        const p = curve.getPointAt((i + 0.5) / count);
        anchors.push({ x: p.x, y: p.y, z: p.z, phase: i * 0.8 + Math.random() * 2 });
        col.setHex(FLUORO_COLORS[i % FLUORO_COLORS.length]);
        flags.setColorAt(i, col);
    }
    flags.instanceColor.needsUpdate = true;
    g.add(flags);

    const dummy = new THREE.Object3D();
    function update(ctx) {
        const t = ctx.time;
        const gust = 0.6 + (ctx.weather?.stormLevel ?? 0) * 2.0 + Math.sin(t * 0.5) * 0.25;
        for (let i = 0; i < count; i++) {
            const a = anchors[i];
            const s = Math.sin(t * 2.8 + a.phase);
            dummy.position.set(a.x, a.y, a.z);
            dummy.rotation.set(Math.sin(t * 2.1 + a.phase * 1.6) * 0.2 * gust, facing, s * 0.30 * gust);
            dummy.updateMatrix();
            flags.setMatrixAt(i, dummy.matrix);
        }
        flags.instanceMatrix.needsUpdate = true;
    }
    update({ time: 0 });

    return { group: g, update };
}

// ─────────────────────────────────────────────────────────────
//  STRING LIGHTS  (the warm kind — every shack has them)
// ─────────────────────────────────────────────────────────────
export function buildStringLights(points, opts = {}) {
    const color = opts.color ?? PALETTE.lamp;
    const spacing = opts.spacing ?? 2.0;
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(points);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 8, 0.02, 4, false), MAT.wire));

    // One material for the whole run rather than one per bulb. A string of bulbs is on a
    // single circuit anyway, and because they now share a material the twenty of them
    // collapse into one merged mesh instead of twenty draw calls and twenty materials.
    const n = Math.max(2, Math.floor(curve.getLength() / spacing));
    const bulbGeo = new THREE.SphereGeometry(0.10, 6, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.9 });
    for (let i = 0; i < n; i++) {
        const p = curve.getPointAt((i + 0.5) / n);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.copy(p);
        g.add(bulb);
    }

    const phase = Math.random() * 6;
    function update(ctx) {
        const night = ctx.night ?? 1;
        bulbMat.opacity = (0.35 + Math.sin(ctx.time * 1.8 + phase) * 0.22 + 0.4) * night;
    }
    return { group: g, update };
}

// ─────────────────────────────────────────────────────────────
//  NIGHT-FOREST LIGHT ART
//  Pools of colour on the floor, mirrored baubles in the branches, coloured haze up the
//  trunks. All of it additive or emissive — the whole set takes ZERO real lights.
// ─────────────────────────────────────────────────────────────

let _goboTex = null;
function goboTexture() {
    if (_goboTex) return _goboTex;
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    // Overlapping soft blobs, added rather than painted over each other, so a pool reads
    // as a broken pattern thrown through leaves instead of as a plain disc.
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const x = S / 2 + Math.cos(a) * S * 0.17;
        const y = S / 2 + Math.sin(a) * S * 0.17;
        const r = S * (0.15 + (i % 2) * 0.07);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
    }
    _goboTex = markShared(new THREE.CanvasTexture(c));
    return _goboTex;
}

/** Pools of coloured light scattered over the ground. One InstancedMesh, one call. */
export function buildGoboField(cx, cz, opts = {}) {
    const count = opts.count ?? 90;
    const radius = opts.radius ?? 16;
    const rnd = mulberry32((opts.seed ?? 0) * 977 + 5);

    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);                 // lie flat on the ground
    const mat = new THREE.MeshBasicMaterial({
        map: goboTexture(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    markShared(mat);

    const mesh = markDynamic(new THREE.InstancedMesh(geo, mat, count));
    mesh.frustumCulled = false;

    const col = new THREE.Color();
    const spots = [];
    for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * radius;    // sqrt keeps them evenly spread, not clumped
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        spots.push({
            x, z, y: getTerrainHeight(x, z) + 0.05 + rnd() * 0.04,
            // Small. Big pools stop reading as light thrown through leaves and start
            // reading as painted blobs on the ground.
            size: 0.30 + rnd() * 0.85,
            phase: rnd() * Math.PI * 2,
            spin: (rnd() - 0.5) * 0.3,
        });
        col.setHex(FLUORO_COLORS[Math.floor(rnd() * FLUORO_COLORS.length)]);
        mesh.setColorAt(i, col);
    }
    mesh.instanceColor.needsUpdate = true;

    const dummy = new THREE.Object3D();
    function update(ctx) {
        const night = ctx.night ?? 0;
        mat.opacity = night * night * 0.55;
        if (mat.opacity < 0.01) return;
        const t = ctx.time;
        for (let i = 0; i < count; i++) {
            const s = spots[i];
            dummy.position.set(s.x, s.y, s.z);
            dummy.rotation.set(0, t * s.spin + s.phase, 0);
            dummy.scale.setScalar(s.size * (0.82 + Math.sin(t * 0.7 + s.phase) * 0.18));
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }
    update({ time: 0, night: 1 });
    return { mesh, update };
}

/**
 * Mirror baubles hung in the branches.
 *
 * `flatShading` on a low-segment sphere is doing the real work: a smooth sphere spinning
 * about its own axis is visually static, and at metalness ~1 with no envMap it would be
 * a flat black silhouette. Facets at mid metalness catch the light and glitter as they
 * turn, which is the whole effect.
 */
export function buildHangingOrbs(cx, cz, opts = {}) {
    const count = opts.count ?? 16;
    const radius = opts.radius ?? 14;
    const rnd = mulberry32((opts.seed ?? 0) * 3121 + 11);
    const g = new THREE.Group();

    const orbMat = new THREE.MeshStandardMaterial({
        color: 0x2a3648, roughness: 0.10, metalness: 0.55,
        emissive: 0x18202e, flatShading: true,
    });
    markShared(orbMat);
    const orbs = markDynamic(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 7), orbMat, count));
    orbs.frustumCulled = false;

    // Barely larger than the orb, and faint. An additive SPHERE accumulates its front and
    // back faces evenly, so it renders as a flat disc of near-uniform brightness — at
    // 1.45x and 0.32 opacity these read as solid coloured balloons, not as glints.
    const haloMat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
    });
    markShared(haloMat);
    const halos = markDynamic(new THREE.InstancedMesh(new THREE.SphereGeometry(1.16, 9, 7), haloMat, count));
    halos.frustumCulled = false;

    const wireGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);
    wireGeo.translate(0, 0.5, 0);              // grows upward from the orb
    const wires = new THREE.InstancedMesh(wireGeo, MAT.wire, count);
    wires.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const data = [];
    for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 3 + Math.sqrt(rnd()) * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const y = getTerrainHeight(x, z) + 3.6 + rnd() * 4.4;
        data.push({ x, y, z, size: 0.13 + rnd() * 0.17, phase: rnd() * 6.28, spin: 0.4 + rnd() * 1.0 });

        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1.2 + rnd() * 2.8, 1);
        dummy.updateMatrix();
        wires.setMatrixAt(i, dummy.matrix);

        col.setHex(FLUORO_COLORS[Math.floor(rnd() * FLUORO_COLORS.length)]);
        halos.setColorAt(i, col);
    }
    wires.instanceMatrix.needsUpdate = true;
    halos.instanceColor.needsUpdate = true;
    g.add(orbs, halos, wires);

    function update(ctx) {
        const night = ctx.night ?? 0;
        haloMat.opacity = night * night * 0.11;
        const t = ctx.time;
        for (let i = 0; i < count; i++) {
            const d = data[i];
            dummy.position.set(d.x, d.y, d.z);
            dummy.rotation.set(0, t * d.spin + d.phase, 0);
            dummy.scale.setScalar(d.size);
            dummy.updateMatrix();
            orbs.setMatrixAt(i, dummy.matrix);
            dummy.scale.setScalar(d.size * (1 + Math.sin(t * 1.3 + d.phase) * 0.07));
            dummy.updateMatrix();
            halos.setMatrixAt(i, dummy.matrix);
        }
        orbs.instanceMatrix.needsUpdate = true;
        halos.instanceMatrix.needsUpdate = true;
    }
    update({ time: 0, night: 1 });
    return { group: g, update };
}

// Soft shaft: brightest at the foot, fading out to the sides and up. Built pixel by
// pixel because the falloff has to work in both axes at once.
let _hazeTex = null;
function hazeTexture() {
    if (_hazeTex) return _hazeTex;
    const W = 64, H = 128;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    const img = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
        // Canvas y=0 is the TOP of the image, which maps to the TOP of the plane
        // (flipY is on by default), so brightness has to grow with y.
        const up = Math.pow(y / (H - 1), 1.5);
        for (let x = 0; x < W; x++) {
            const across = 1 - Math.abs(x - (W - 1) / 2) / ((W - 1) / 2);
            const a = Math.pow(Math.max(0, across), 1.7) * up;
            const i = (y * W + x) * 4;
            img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
            img.data[i + 3] = Math.round(a * 255);
        }
    }
    cx.putImageData(img, 0, 0);
    _hazeTex = markShared(new THREE.CanvasTexture(c));
    return _hazeTex;
}

/**
 * Coloured haze standing off the ground — a fake uplight at the foot of a tree.
 *
 * These are camera-facing quads, NOT cones. A cone's silhouette is its geometry edge
 * from every angle, so an additive one reads as a solid triangular sheet hanging in the
 * air however low you take the opacity. A billboarded quad with a soft texture has no
 * hard edge at all. It is yawed about Y only, so the shaft always stands upright.
 */
export function buildUplightHaze(spots, opts = {}) {
    const height = opts.height ?? 6.5;
    const width = opts.width ?? 3.2;
    const g = new THREE.Group();
    const mats = new Map();
    const planes = [];

    for (const [x, z, color] of spots) {
        if (!mats.has(color)) {
            const m = new THREE.MeshBasicMaterial({
                color, map: hazeTexture(), transparent: true, opacity: 0,
                blending: THREE.AdditiveBlending, depthWrite: false,
                side: THREE.DoubleSide, fog: false,
            });
            markShared(m);
            mats.set(color, m);
        }
        const h = height * (0.75 + Math.random() * 0.5);
        const geo = new THREE.PlaneGeometry(width, h);
        geo.translate(0, h / 2, 0);
        const p = markDynamic(new THREE.Mesh(geo, mats.get(color)));
        p.position.set(x, getTerrainHeight(x, z), z);
        g.add(p);
        planes.push(p);
    }

    function update(ctx) {
        const night = ctx.night ?? 0;
        const e = opts.stage && ctx.stageEnergy ? ctx.stageEnergy(opts.stage) : ctx.energy;
        const bass = e ? e.bass : 0;
        const o = night * night * (0.10 + bass * 0.09);
        for (const m of mats.values()) m.opacity = o;
        const cam = ctx.camera;
        if (!cam) return;
        for (let i = 0; i < planes.length; i++) {
            const p = planes[i];
            p.rotation.y = Math.atan2(cam.position.x - p.position.x, cam.position.z - p.position.z);
        }
    }
    update({ night: 0 });
    return { group: g, update };
}

// ─────────────────────────────────────────────────────────────
//  PALMS — the hero kind, hand-placed and swaying.
//  The thousands of background palms are instanced in Terrain.js instead.
// ─────────────────────────────────────────────────────────────
/** Bay redesign: a single casuarina (sea-pine) — a slim trunk and a soft drooping spire.
 *  Same { group, update } contract as buildPalm so zones can swap one for the other. */
export function buildCasuarina(x, z, opts = {}) {
    const g = new THREE.Group();
    const y = opts.baseY ?? getTerrainHeight(x, z);
    const h = opts.height ?? (11 + Math.random() * 7);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, h, 6),
        plain(0x3a2e26, { kind: 'standard', roughness: 0.95 }));
    trunk.position.set(x, y + h / 2, z);
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = plain(0x1f3a2c, { side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
        const r = (1.9 - i * 0.45) * (0.9 + Math.random() * 0.2);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.38, 7, 1, true), leaf);
        cone.position.set(x, y + h * (0.48 + i * 0.17), z);
        cone.castShadow = true;
        g.add(cone);
    }
    return { group: g, update: () => {} };
}

export function buildPalm(x, z, opts = {}) {
    const g = new THREE.Group();
    const y = opts.baseY ?? getTerrainHeight(x, z);
    const h = opts.height ?? (10 + Math.random() * 6);
    const lean = opts.lean ?? (Math.random() - 0.5) * 0.26;
    const leanDir = Math.random() * Math.PI * 2;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.36, h, 7), MAT.wood);
    trunk.position.set(0, h / 2, 0);
    trunk.castShadow = true;

    // Fluoro rings painted up the trunk. This is the single most Goa thing you can do
    // to a palm tree and it is what the floors are lit by once it goes dark.
    if (opts.painted) {
        for (let i = 0; i < 6; i++) {
            const ry = 1.4 + i * (h - 3) / 6;
            const r = THREE.MathUtils.lerp(0.36, 0.19, ry / h) + 0.03;
            const ring = new THREE.Mesh(
                new THREE.CylinderGeometry(r, r, 0.34 + Math.random() * 0.3, 8),
                fluoro(FLUORO_COLORS[(i + (opts.seed ?? 0)) % FLUORO_COLORS.length],
                    { boost: 1.15, side: THREE.FrontSide }));
            ring.position.y = ry;
            g.add(ring);
        }
    }

    const crown = new THREE.Group();
    crown.position.y = h * 0.97;
    const frondGeo = new THREE.PlaneGeometry(0.95, 4.8, 2, 6);
    frondGeo.translate(0, 2.4, 0);
    const fp = frondGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
        const t = fp.getY(i) / 4.8;
        fp.setZ(i, -t * t * 2.4);
        fp.setX(i, fp.getX(i) * (1 - t * 0.8));
    }
    frondGeo.computeVertexNormals();

    const fronds = [];
    for (let i = 0; i < 9; i++) {
        const f = new THREE.Mesh(frondGeo, MAT.palmLeaf);
        f.rotation.y = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
        f.rotation.x = 0.8 + Math.random() * 0.5;
        f.scale.setScalar(0.9 + Math.random() * 0.35);
        f.castShadow = true;
        crown.add(f);
        fronds.push({ mesh: f, baseX: f.rotation.x, phase: Math.random() * 6 });
    }

    // Coconuts, in a bunch under the crown.
    if (opts.coconuts !== false) {
        const nutMat = plain(0x5a4a2a, { kind: 'standard', roughness: 0.9 });
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const nut = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 6), nutMat);
            nut.position.set(Math.cos(a) * 0.42, -0.45, Math.sin(a) * 0.42);
            crown.add(nut);
        }
    }

    markDynamic(crown);
    g.add(trunk, crown);
    g.position.set(x, y, z);
    g.rotation.set(Math.sin(leanDir) * lean, 0, Math.cos(leanDir) * lean);

    function update(ctx) {
        const t = ctx.time;
        const wind = 0.5 + (ctx.weather?.stormLevel ?? 0) * 3;
        for (let i = 0; i < fronds.length; i++) {
            const f = fronds[i];
            f.mesh.rotation.x = f.baseX + Math.sin(t * 1.1 + f.phase) * 0.11 * wind;
        }
        crown.rotation.z = Math.sin(t * 0.7) * 0.03 * wind;
    }
    return { group: g, update, topY: y + h };
}

// ─────────────────────────────────────────────────────────────
//  BANYAN — the hidden floor grows out of one of these
// ─────────────────────────────────────────────────────────────
export function buildBanyan(x, z, scale = 1) {
    const g = new THREE.Group();
    const y = getTerrainHeight(x, z);
    const S = scale;
    const barkMat = plain(0x4a4033, { kind: 'standard', roughness: 0.98 });

    // The trunk is a cluster of fused columns, not a cylinder — that is what makes a
    // banyan read as a banyan rather than as an oak.
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = (i === 0 ? 0 : 1.5) * S;
        const th = (7 + Math.random() * 2.5) * S;
        const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55 * S, 0.95 * S, th, 7), barkMat);
        col.position.set(Math.cos(a) * r, th / 2, Math.sin(a) * r);
        col.rotation.z = Math.cos(a) * 0.08;
        col.rotation.x = -Math.sin(a) * 0.08;
        col.castShadow = true;
        g.add(col);
    }

    // Canopy: overlapping domes.
    const leafMat = plain(0x2c4f26);
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        const r = (i === 0 ? 0 : 4.5 + Math.random() * 3.5) * S;
        const dome = new THREE.Mesh(new THREE.SphereGeometry((3.4 + Math.random() * 1.8) * S, 9, 7), leafMat);
        dome.position.set(Math.cos(a) * r, (8.5 + Math.random() * 2.2) * S, Math.sin(a) * r);
        dome.scale.y = 0.62;
        dome.castShadow = true;
        g.add(dome);
    }

    // Aerial roots — the things you hang a speaker from.
    const roots = [];
    for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = (2.5 + Math.random() * 7) * S;
        const rx = Math.cos(a) * r, rz = Math.sin(a) * r;
        const topY = (8 + Math.random() * 1.5) * S;
        const groundGap = getTerrainHeight(x + rx, z + rz) - y;
        const len = topY - groundGap - (Math.random() > 0.4 ? 0 : 2.4 * S);
        if (len < 1) continue;
        const root = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07 * S, 0.14 * S, len, 5), barkMat);
        root.position.set(rx, topY - len / 2, rz);
        root.rotation.set((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12);
        g.add(root);
        roots.push({ x: x + rx, z: z + rz, topY: y + topY });
    }

    g.position.set(x, y, z);
    return { group: g, roots, canopyY: y + 9 * S };
}

// ─────────────────────────────────────────────────────────────
//  FIRE
// ─────────────────────────────────────────────────────────────
const FIRE_COLORS = [0xff3300, 0xff6622, 0xffaa00, 0xffdd55];

/** A ring-buffer flame emitter. Particles are recycled rather than allocated. */
export function buildFire(x, y, z, opts = {}) {
    const count = opts.count ?? 32;
    const spread = opts.spread ?? 0.6;
    const rise = opts.rise ?? 3.0;
    const size = opts.size ?? 0.24;
    const g = new THREE.Group();

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const parts = [];
    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
        parts.push({
            age: Math.random(), life: 0.7 + Math.random() * 0.6,
            vx: (Math.random() - 0.5) * spread, vz: (Math.random() - 0.5) * spread,
            vy: rise * (0.6 + Math.random() * 0.7),
        });
        c.setHex(FIRE_COLORS[i % FIRE_COLORS.length]);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
        size, map: particleTexture(), vertexColors: true, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    g.add(points);

    let light = null;
    if (opts.light) {
        light = new THREE.PointLight(PALETTE.ember, opts.lightIntensity ?? 2.4, opts.lightRange ?? 24);
        light.position.set(x, y + 1.4, z);
        g.add(light);
    }

    if (opts.glow !== false) {
        const sprite = makeGlowSprite(0xff6a22, 0.5, opts.glowSize ?? 5);
        sprite.position.set(x, y + 1.1, z);
        g.add(sprite);
        g.userData.glowSprite = sprite;
    }

    let boost = 0;
    function update(ctx) {
        const dt = Math.min(ctx.delta, 0.05);
        const bass = ctx.energy?.bass ?? 0;
        boost = Math.max(boost - dt * 2.4, 0);
        const power = 1 + bass * (opts.audioReactive ? 1.5 : 0.35) + boost;

        const p = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
            const pt = parts[i];
            pt.age += dt / pt.life;
            if (pt.age >= 1) {
                pt.age = 0;
                pt.vx = (Math.random() - 0.5) * spread;
                pt.vz = (Math.random() - 0.5) * spread;
                pt.vy = rise * (0.6 + Math.random() * 0.7);
            }
            const a = pt.age;
            p[i * 3] = x + pt.vx * a * 2.4;
            p[i * 3 + 1] = y + pt.vy * a * power;
            p[i * 3 + 2] = z + pt.vz * a * 2.4;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.55 + Math.sin(ctx.time * 9) * 0.12 + bass * 0.3;
        mat.size = size * (1 + bass * 0.5);

        const flicker = Math.sin(ctx.time * 11) * 0.28 + Math.sin(ctx.time * 17.3) * 0.18;
        if (light) light.intensity = (opts.lightIntensity ?? 2.4) * (1 + flicker * 0.4 + bass * 0.9 + boost);
        if (g.userData.glowSprite) {
            g.userData.glowSprite.material.opacity =
                (0.34 + bass * 0.3 + flicker * 0.1 + boost * 0.25) * (light ? 1 : 1.35);
            g.userData.glowSprite.scale.setScalar(
                (opts.glowSize ?? 5) * (1 + bass * 0.18 + boost * 0.3));
        }
    }

    return { group: g, update, light, burst: (amount = 1.6) => { boost = amount; } };
}

export function buildBeachFire(x, z, opts = {}) {
    const g = new THREE.Group();
    const y = getTerrainHeight(x, z);

    // Driftwood, laid in a star rather than stacked — that is how they burn on sand.
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 2.2, 6), MAT.darkWood);
        log.position.set(x + Math.cos(a) * 0.6, y + 0.18, z + Math.sin(a) * 0.6);
        log.rotation.set(0.16, -a, Math.PI / 2 - 0.2);
        g.add(log);
    }
    // A ring of laterite chunks to keep it off the sand.
    for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 + Math.random() * 0.14, 0), MAT.laterite);
        stone.position.set(x + Math.cos(a) * 1.4, y + 0.12, z + Math.sin(a) * 1.4);
        stone.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        g.add(stone);
    }

    const fire = buildFire(x, y + 0.35, z, {
        count: 30, spread: 0.55, rise: 2.4, size: 0.26,
        light: opts.light ?? true,
        lightIntensity: opts.lightIntensity ?? 2.6, lightRange: 26, glowSize: 5.5,
    });
    g.add(fire.group);

    if (opts.seats !== false) {
        for (let i = 0; i < (opts.seatCount ?? 5); i++) {
            const a = (i / (opts.seatCount ?? 5)) * Math.PI * 2 + Math.random() * 0.35;
            const r = 2.9 + Math.random() * 0.9;
            const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.6, 7), MAT.darkWood);
            log.position.set(sx, getTerrainHeight(sx, sz) + 0.26, sz);
            log.rotation.set(0, a, Math.PI / 2);
            log.castShadow = true;
            g.add(log);
        }
    }
    return { group: g, update: fire.update, x, z, y, burst: fire.burst };
}

// ─────────────────────────────────────────────────────────────
//  HURRICANE LAMP  (kerosene, on a bamboo post — the 1995 path light)
// ─────────────────────────────────────────────────────────────
export function buildPathLantern(x, z, color = PALETTE.lamp, height = 2.6, opts = {}) {
    const g = new THREE.Group();
    const y = opts.baseY ?? getTerrainHeight(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, height, 6), MAT.bamboo);
    post.position.set(x, y + height / 2, z);
    g.add(post);

    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.42, 7),
        plain(0x3a332a, { kind: 'standard', roughness: 0.75, metalness: 0.45 }));
    cage.position.set(x, y + height + 0.16, z);
    g.add(cage);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 7), MAT.tin);
    cap.position.set(x, y + height + 0.44, z);
    g.add(cap);

    const bulbMat = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.95 });
    const bulb = markDynamic(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bulbMat));
    bulb.position.set(x, y + height + 0.16, z);
    g.add(bulb);

    const glow = makeGlowSprite(color, 0.55, 3.0);
    glow.position.copy(bulb.position);
    g.add(glow);

    let light = null;
    if (opts.light) {
        light = new THREE.PointLight(color, 0.85, 14);
        light.position.copy(bulb.position);
        g.add(light);
    }

    const phase = Math.random() * 7;
    function update(ctx) {
        const night = ctx.night ?? 1;
        const flick = 0.8 + Math.sin(ctx.time * 2.4 + phase) * 0.16 + Math.sin(ctx.time * 8.1 + phase) * 0.06;
        if (light) light.intensity = 0.9 * flick * night;
        bulbMat.opacity = (0.4 + flick * 0.5) * Math.max(night, 0.2);
        glow.material.opacity = (0.15 + 0.5 * night) * flick;
    }
    return { group: g, update };
}

// ─────────────────────────────────────────────────────────────
//  CHAI MAMA
//  Sat on a mat at the edge of every floor from midnight until it gets light, with a
//  row of thermos flasks, a crate of glasses, and a hurricane lamp. No party on this
//  coast has ever run without one.
// ─────────────────────────────────────────────────────────────
const MAMA_SARI = [0xc02a4a, 0xd4741a, 0x1f6a9a, 0x2f7a3a, 0x8a2a7a];

export function buildChaiMama(x, z, rotation = 0, opts = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const y = opts.baseY ?? getTerrainHeight(x, z);
    const sari = opts.sari ?? MAMA_SARI[Math.floor(Math.random() * MAMA_SARI.length)];

    // Mat.
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9),
        plain(0xa8905e, { side: THREE.DoubleSide }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.02;
    inner.add(mat);

    // Her: a seated figure. Cone body reads as a sari from any distance.
    const sariMat = plain(sari);
    const body = markDynamic(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.92, 8), sariMat));
    body.position.set(0, 0.46, -0.25);
    body.castShadow = true;
    inner.add(body);
    const head = markDynamic(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8),
        plain(0x6a4028)));
    head.position.set(0, 1.08, -0.25);
    inner.add(head);
    const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7), sariMat);
    scarf.position.set(0, 1.12, -0.25);
    inner.add(scarf);

    // Thermos flasks — the real signature of the thing.
    const flaskColors = [0xc8342a, 0x1f5fa8, 0xd8a520, 0xe0ded4];
    for (let i = 0; i < 4; i++) {
        const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.46, 9),
            plain(flaskColors[i], { kind: 'standard', roughness: 0.42, metalness: 0.25 }));
        flask.position.set(-0.7 + i * 0.46, 0.23, 0.5);
        inner.add(flask);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 9), MAT.tin);
        lid.position.set(-0.7 + i * 0.46, 0.51, 0.5);
        inner.add(lid);
    }

    // Crate of glasses.
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 0.5), MAT.wood);
    crate.position.set(0.95, 0.17, -0.1);
    inner.add(crate);
    const glassMat = plain(0xd8c088, {
        kind: 'standard', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75,
    });
    for (let i = 0; i < 5; i++) {
        const tumbler = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.13, 7), glassMat);
        tumbler.position.set(0.78 + (i % 3) * 0.16, 0.4, -0.22 + Math.floor(i / 3) * 0.2);
        inner.add(tumbler);
    }

    // Her lamp. Emissive only — there are a lot of these.
    const lamp = buildPathLantern(0, 0, PALETTE.lamp, 0.55, { baseY: 0 });
    lamp.group.position.set(-1.05, 0, 0.15);
    inner.add(lamp.group);

    inner.rotation.y = rotation;
    inner.position.set(x, y, z);
    g.add(inner);

    const phase = Math.random() * 6;
    function update(ctx) {
        lamp.update(ctx);
        // She stirs. Barely.
        body.rotation.z = Math.sin(ctx.time * 0.5 + phase) * 0.03;
        head.position.y = 1.08 + Math.sin(ctx.time * 0.7 + phase) * 0.012;
    }
    return { group: g, update, x, z };
}

// ─────────────────────────────────────────────────────────────
//  BEACH SHACK — bamboo frame, palm thatch, string lights, plastic chairs
// ─────────────────────────────────────────────────────────────
export function buildShack(x, z, rotation = 0, opts = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const y = getTerrainHeight(x, z);
    const w = opts.width ?? 7, d = opts.depth ?? 5.5, h = opts.height ?? 2.9;

    // Deck, because sand is not a floor.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.22, d + 1.2), MAT.wood);
    deck.position.set(0, 0.11, 0);
    deck.receiveShadow = true;
    inner.add(deck);

    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, h, 6), MAT.bamboo);
        post.position.set(px, h / 2, pz);
        inner.add(post);
    }

    // Pitched palm-thatch roof: two slabs plus a ridge.
    for (const side of [-1, 1]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.22, d / 2 + 1.0), MAT.thatch);
        slab.position.set(0, h + 0.55, side * (d / 4 + 0.35));
        slab.rotation.x = side * -0.42;
        slab.castShadow = true;
        inner.add(slab);
    }
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, w + 1.6, 6), MAT.bamboo);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, h + 1.05, 0);
    inner.add(ridge);

    // Counter and back wall of woven matting.
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 1.05, 0.7), MAT.wood);
    counter.position.set(0, 0.75, -d / 2 + 0.6);
    counter.castShadow = true;
    inner.add(counter);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.85), MAT.cloth);
    back.position.set(0, h * 0.45, -d / 2 - 0.02);
    inner.add(back);

    // Plastic chairs and low tables out front — the whole reason anyone sits here.
    const chairMat = plain(opts.chairColor ?? 0xd8d4c8, { kind: 'standard', roughness: 0.55 });
    for (let i = 0; i < (opts.chairs ?? 6); i++) {
        const a = (i / (opts.chairs ?? 6)) * Math.PI - Math.PI / 2;
        const cx = Math.sin(a) * (w * 0.42), cz = d / 2 + 1.6 + Math.cos(a) * 1.1;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), chairMat);
        seat.position.set(cx, 0.45, cz);
        seat.rotation.y = Math.random() * 0.8;
        inner.add(seat);
        const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.07), chairMat);
        backRest.position.set(cx, 0.72, cz - 0.22);
        backRest.rotation.y = seat.rotation.y;
        inner.add(backRest);
        for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 5), chairMat);
            leg.position.set(cx + lx, 0.22, cz + lz);
            inner.add(leg);
        }
    }

    inner.rotation.y = rotation;
    inner.position.set(x, y, z);
    g.add(inner);

    // String lights along the eaves.
    const lights = buildStringLights([
        new THREE.Vector3(x - w / 2 - 0.6, y + h + 0.9, z + d / 2 + 0.6),
        new THREE.Vector3(x, y + h + 0.5, z + d / 2 + 0.9),
        new THREE.Vector3(x + w / 2 + 0.6, y + h + 0.9, z + d / 2 + 0.6),
    ], { spacing: 1.1 });
    g.add(lights.group);

    if (opts.sign) {
        const sign = makeSign(opts.sign, {
            width: w * 0.8, size: 58, color: '#ffe0a0',
            glow: 'rgba(255,150,40,0.8)', bg: 'rgba(24,14,8,0.9)',
        });
        sign.position.set(x, y + h + 1.5, z + Math.cos(rotation) * (d / 2 + 0.7));
        sign.rotation.y = rotation;
        g.add(sign);
    }

    return { group: g, update: lights.update, x, z };
}

// ─────────────────────────────────────────────────────────────
//  HAMMOCK — slung between two points, and you can pitch your own with V
// ─────────────────────────────────────────────────────────────
export function buildHammock(x1, z1, x2, z2, opts = {}) {
    const g = new THREE.Group();
    const hangY = opts.hangY ?? 2.5;
    const y1 = getTerrainHeight(x1, z1) + hangY;
    const y2 = getTerrainHeight(x2, z2) + hangY;
    const sag = opts.sag ?? 1.15;

    const pts = [];
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3(
            THREE.MathUtils.lerp(x1, x2, t),
            THREE.MathUtils.lerp(y1, y2, t) - Math.sin(t * Math.PI) * sag,
            THREE.MathUtils.lerp(z1, z2, t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);

    const clothMat = plain(opts.color ?? 0xc85a3a, { side: THREE.DoubleSide });
    const mesh = markDynamic(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.42, 5, false), clothMat));
    mesh.castShadow = true;
    g.add(mesh);
    // The cords at each end.
    for (const [ex, ey, ez, tx, ty, tz] of [
        [x1, y1, z1, pts[2].x, pts[2].y, pts[2].z],
        [x2, y2, z2, pts[10].x, pts[10].y, pts[10].z]]) {
        const a = new THREE.Vector3(ex, ey, ez), b = new THREE.Vector3(tx, ty, tz);
        const len = a.distanceTo(b);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), MAT.rope);
        cord.position.copy(a).lerp(b, 0.5);
        cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(cord);
    }

    const axis = new THREE.Vector3(x2 - x1, 0, z2 - z1).normalize();
    const centre = new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    const phase = Math.random() * 6;
    function update(ctx) {
        // Swing the whole mesh about its own axis rather than deforming it.
        const swing = Math.sin(ctx.time * 0.55 + phase) * 0.055
            * (1 + (ctx.weather?.stormLevel ?? 0) * 3);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.position.copy(centre).multiplyScalar(-1).applyAxisAngle(axis, swing).add(centre);
        mesh.rotateOnAxis(axis, swing);
    }
    return { group: g, update };
}

// ─────────────────────────────────────────────────────────────
//  OUTRIGGER — the painted wooden fishing boats pulled up on the sand
// ─────────────────────────────────────────────────────────────
export function buildOutrigger(x, z, rotation = 0, opts = {}) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const y = opts.baseY ?? getTerrainHeight(x, z);
    const color = opts.color ?? BOAT_COLORS[Math.floor(Math.random() * BOAT_COLORS.length)];
    const L = opts.length ?? 8.5;

    const hullMat = plain(color, { kind: 'standard', roughness: 0.72 });
    const trimMat = plain(BOAT_COLORS[(BOAT_COLORS.indexOf(color) + 2) % BOAT_COLORS.length],
        { kind: 'standard', roughness: 0.72 });

    // Hull: a long capsule squashed flat, with a raised prow.
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, L - 1.4, 5, 10), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(1, 1, 0.72);
    hull.position.y = 0.62;
    hull.castShadow = true;
    inner.add(hull);

    const gunwale = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, 1.5), trimMat);
    gunwale.position.y = 1.16;
    inner.add(gunwale);

    // Prow, raised and pointed — every boat on this coast has one.
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.0, 6), hullMat);
    prow.rotation.z = -Math.PI / 2 - 0.35;
    prow.position.set(L / 2 + 0.5, 1.15, 0);
    inner.add(prow);

    // …and an eye painted on each side of it, so it can see where it is going.
    const eyeWhite = glowMaterial(0xf4f0e4);
    const eyeDark = glowMaterial(0x141018);
    for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), eyeWhite);
        w.position.set(L / 2 - 0.9, 0.86, side * 0.56);
        w.rotation.y = side * Math.PI / 2;
        inner.add(w);
        const p = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), eyeDark);
        p.position.set(L / 2 - 0.92, 0.86, side * 0.58);
        p.rotation.y = side * Math.PI / 2;
        inner.add(p);
    }

    // The outrigger itself: two curved arms out to a float.
    for (const side of [-1, 1]) {
        if (opts.singleOutrigger && side < 0) continue;
        for (const az of [-1.6, 1.6]) {
            // Cylinders run along local Y; rotating a quarter turn about X lays them
            // along Z, which is out across the water to the float.
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 6), MAT.bamboo);
            arm.rotation.x = Math.PI / 2;
            arm.position.set(az, 1.24, side * 1.7);
            inner.add(arm);
        }
        const floatSpar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, L * 0.7, 6), MAT.bamboo);
        floatSpar.rotation.z = Math.PI / 2;
        floatSpar.position.set(0, 0.9, side * 3.35);
        inner.add(floatSpar);
    }

    // Thwarts and a coil of net.
    for (const tz of [-2.2, 0, 2.2]) {
        const th = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.4), MAT.wood);
        th.position.set(tz, 1.12, 0);
        inner.add(th);
    }

    inner.rotation.y = rotation;
    inner.position.set(x, y, z);
    inner.rotation.z = opts.list ?? (Math.random() - 0.5) * 0.14;   // beached boats lean
    if (opts.floating) markDynamic(inner);
    g.add(inner);

    g.userData.floats = !!opts.floating;
    const phase = Math.random() * 6;
    function update(ctx) {
        if (!opts.floating) return;
        inner.position.y = y + Math.sin(ctx.time * 0.9 + phase) * 0.14;
        inner.rotation.z = Math.sin(ctx.time * 0.7 + phase) * 0.05;
        inner.rotation.x = Math.sin(ctx.time * 1.1 + phase * 1.4) * 0.03;
    }
    return { group: g, update, x, z };
}

/** Fishing nets drying on A-frames. */
export function buildNets(x, z, rotation = 0, count = 3) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const netMat = plain(0x3a6a5a, {
        wireframe: true, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
    });
    for (let i = 0; i < count; i++) {
        const px = (i - (count - 1) / 2) * 4.2;
        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 5), MAT.bamboo);
            leg.position.set(px, 1.2, side * 1.1);
            leg.rotation.x = side * 0.38;
            inner.add(leg);
        }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 5), MAT.bamboo);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(px, 2.35, 0);
        inner.add(bar);
        const net = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2, 9, 6), netMat);
        net.position.set(px, 1.3, 0);
        inner.add(net);
    }
    inner.rotation.y = rotation;
    inner.position.set(x, getTerrainHeight(x, z), z);
    g.add(inner);
    return g;
}

// ─────────────────────────────────────────────────────────────
//  SHRINE / CROSS — the two religions this coast keeps side by side
// ─────────────────────────────────────────────────────────────
export function buildShrine(x, z, rotation = 0) {
    const g = new THREE.Group();
    const inner = new THREE.Group();

    // Stone plinth and lingam.
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.5, 10), MAT.laterite);
    plinth.position.y = 0.25;
    plinth.receiveShadow = true;
    inner.add(plinth);
    const lingam = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 5, 10),
        plain(0x4a4640, { kind: 'standard', roughness: 0.7 }));
    lingam.position.y = 0.92;
    inner.add(lingam);

    // Trident.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.1, 6),
        plain(0x8a7a3a, { kind: 'standard', roughness: 0.4, metalness: 0.6 }));
    shaft.position.set(0.9, 1.55, 0);
    inner.add(shaft);
    const tridentMat = plain(0xc8a020, {
        kind: 'standard', roughness: 0.35, metalness: 0.7, emissive: 0x3a2a00,
    });
    for (const dx of [-0.26, 0, 0.26]) {
        const tine = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 5), tridentMat);
        tine.position.set(0.9 + dx, 3.35 - Math.abs(dx) * 0.7, 0);
        inner.add(tine);
    }

    // Marigolds. A ring of small orange spheres does the job better than it should.
    const marigold = plain(0xff8a10, {
        kind: 'standard', roughness: 0.8, emissive: 0x5a2600, emissiveIntensity: 0.5,
    });
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), marigold);
        f.position.set(Math.cos(a) * 0.95, 0.55, Math.sin(a) * 0.95);
        inner.add(f);
    }

    // A bell you can ring.
    const bell = markDynamic(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.36, 9),
        plain(0xc8a020, { kind: 'standard', roughness: 0.35, metalness: 0.78 })));
    bell.position.set(-1.0, 2.3, 0);
    inner.add(bell);
    const bellPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.7, 5), MAT.darkWood);
    bellPost.position.set(-1.0, 1.35, 0);
    inner.add(bellPost);
    const bellArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), MAT.darkWood);
    bellArm.position.set(-0.82, 2.62, 0);
    inner.add(bellArm);

    // Two diyas.
    const flames = [];
    for (const dx of [-0.5, 0.5]) {
        const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.09, 8), MAT.laterite);
        dish.position.set(dx, 0.55, 0.9);
        inner.add(dish);
        const f = buildFire(dx, 0.62, 0.9, {
            count: 8, spread: 0.06, rise: 0.5, size: 0.11, glowSize: 1.5,
        });
        inner.add(f.group);
        flames.push(f);
    }

    inner.rotation.y = rotation;
    inner.position.set(x, getTerrainHeight(x, z), z);
    g.add(inner);

    let swing = 0;
    function update(ctx) {
        for (let i = 0; i < flames.length; i++) flames[i].update(ctx);
        if (swing > 0.001) {
            bell.rotation.z = Math.sin(ctx.time * 14) * swing;
            swing *= Math.pow(0.25, ctx.delta);
        }
    }
    return { group: g, update, ring: () => { swing = 0.4; }, x, z };
}

/** The whitewashed Portuguese roadside cross. Every junction in Goa has one. */
export function buildCross(x, z, rotation = 0) {
    const g = new THREE.Group();
    const inner = new THREE.Group();

    for (let i = 0; i < 3; i++) {
        const s = 2.2 - i * 0.45;
        const step = new THREE.Mesh(new THREE.BoxGeometry(s, 0.32, s), MAT.plaster);
        step.position.y = 0.16 + i * 0.32;
        step.receiveShadow = true;
        inner.add(step);
    }
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.6, 0.55), MAT.plaster);
    column.position.y = 2.26;
    column.castShadow = true;
    inner.add(column);
    const vert = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.9, 0.34), MAT.plaster);
    vert.position.y = 4.4;
    inner.add(vert);
    const horiz = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.34), MAT.plaster);
    horiz.position.y = 4.7;
    inner.add(horiz);

    inner.rotation.y = rotation;
    inner.position.set(x, getTerrainHeight(x, z), z);
    g.add(inner);
    return g;
}

// ─────────────────────────────────────────────────────────────
//  SOUND SYSTEM
// ─────────────────────────────────────────────────────────────
export function buildSpeakerStack(x, z, count = 4, baseY = null, opts = {}) {
    const g = new THREE.Group();
    const y0 = baseY ?? getTerrainHeight(x, z);
    const facing = opts.facing ?? 0;          // rotation about Y; drivers face +Z of that
    const drivers = [];
    const inner = new THREE.Group();

    for (let i = 0; i < count; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), MAT.speaker);
        box.position.set(0, 1.2 + i * 2.4, 0);
        box.castShadow = true;
        inner.add(box);
        for (const dx of [-0.58, 0.58]) {
            const cone = markDynamic(new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), MAT.cone));
            cone.position.set(dx, 1.2 + i * 2.4, 1.22);
            inner.add(cone);
            drivers.push(cone);
        }
        // A horn on the top cab.
        if (i === count - 1) {
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 4, 1, true), MAT.cone);
            horn.rotation.x = Math.PI / 2;
            horn.position.set(0, 1.2 + i * 2.4 + 0.9, 1.4);
            inner.add(horn);
        }
    }
    // Pallets under it, off the sand.
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 2.8), MAT.wood);
    pallet.position.y = 0.11;
    inner.add(pallet);

    inner.rotation.y = facing;
    inner.position.set(x, y0, z);
    g.add(inner);
    g.userData.drivers = drivers;

    function update(ctx) {
        const b = ctx.energy?.bass ?? 0;
        for (let i = 0; i < drivers.length; i++) {
            drivers[i].scale.setScalar(1 + b * 0.38 + Math.sin(ctx.time * 9 + i) * 0.04);
        }
    }
    return { group: g, update, x, z };
}

/** Steel scaffold tower — the modern venue's structure, and nothing else's. */
export function buildScaffold(x, z, height = 9, width = 2.2, baseY = null) {
    const g = new THREE.Group();
    const y0 = baseY ?? getTerrainHeight(x, z);
    const half = width / 2;
    const legGeo = new THREE.CylinderGeometry(0.09, 0.09, height, 6);

    for (const sx of [-half, half]) {
        for (const sz of [-half, half]) {
            const leg = new THREE.Mesh(legGeo, MAT.scaffold);
            leg.position.set(x + sx, y0 + height / 2, z + sz);
            leg.castShadow = true;
            g.add(leg);
        }
    }
    for (let h = 1.4; h < height; h += 1.7) {
        for (const [ax, az, len, rotY] of [
            [0, -half, width, 0], [0, half, width, 0],
            [-half, 0, width, Math.PI / 2], [half, 0, width, Math.PI / 2]]) {
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 5), MAT.scaffold);
            rail.rotation.set(0, rotY, Math.PI / 2);
            rail.position.set(x + ax, y0 + h, z + az);
            g.add(rail);
        }
        const brace = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, Math.hypot(width, 1.7), 5), MAT.scaffold);
        brace.position.set(x, y0 + h + 0.85, z - half);
        brace.rotation.z = Math.atan2(width, 1.7);
        g.add(brace);
    }
    return g;
}

/** Hanging line-array cabinets. Modern venue only. */
export function buildLineArray(x, y, z, count = 6, opts = {}) {
    const g = new THREE.Group();
    const boxes = [];
    for (let i = 0; i < count; i++) {
        const taper = 1 - i * 0.04;
        const box = markDynamic(new THREE.Mesh(new THREE.BoxGeometry(1.9 * taper, 0.52, 1.0), MAT.speaker));
        box.position.set(x, y - i * 0.58, z + i * 0.10);
        box.rotation.x = -i * 0.055;
        box.castShadow = true;
        g.add(box);
        boxes.push(box);
    }
    const rig = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.5, 4), MAT.scaffold);
    rig.position.set(x, y + 1.8, z);
    g.add(rig);

    function update(ctx) {
        const b = ctx.energy?.bass ?? 0;
        for (let i = 0; i < boxes.length; i++) {
            boxes[i].position.z = z + i * 0.10 + Math.sin(ctx.time * 11 + i) * b * 0.03;
        }
    }
    return { group: g, update };
}

/**
 * An LED wall. A canvas texture redrawn a few times a second, driven by the music —
 * one texture, one mesh, no lights. The only screen in this world.
 */
export function buildLEDWall(x, y, z, width = 9, height = 5, rotation = 0) {
    const W = 128, H = 72;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const cx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;

    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false });
    const mesh = markDynamic(new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;

    const g = new THREE.Group();
    g.add(mesh);
    // A black bezel so it reads as a panel rather than a floating rectangle.
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.3), MAT.speaker);
    bezel.position.set(x, y, z - 0.2);
    bezel.rotation.y = rotation;
    g.add(bezel);

    let acc = 0;
    function update(ctx) {
        // 12 fps is plenty for an LED wall and a twelfth of the upload cost.
        acc += ctx.delta;
        if (acc < 0.083) return;
        acc = 0;
        const t = ctx.time;
        const e = ctx.energy ?? { bass: 0, mid: 0, treble: 0 };
        cx.fillStyle = '#050008';
        cx.fillRect(0, 0, W, H);
        // Concentric rings pumping on the kick.
        for (let i = 8; i >= 0; i--) {
            const r = (i * 7 + e.bass * 26) % 70;
            cx.strokeStyle = `hsl(${(t * 40 + i * 26) % 360} 100% ${45 + e.mid * 30}%)`;
            cx.lineWidth = 2;
            cx.beginPath();
            cx.ellipse(W / 2, H / 2, r * 1.5, r, 0, 0, Math.PI * 2);
            cx.stroke();
        }
        // Spectrum bars along the bottom.
        for (let i = 0; i < 24; i++) {
            const v = Math.abs(Math.sin(t * 5 + i * 0.7)) * (0.3 + e.treble * 1.4);
            cx.fillStyle = `hsl(${(i * 15 + t * 60) % 360} 100% 60%)`;
            cx.fillRect(i * 5.4, H - v * H, 4.4, v * H);
        }
        tex.needsUpdate = true;
    }
    update({ time: 0, delta: 1, energy: null });
    return { group: g, update, mesh };
}

// ─────────────────────────────────────────────────────────────
//  MARKET STALL — the Wednesday flea market runs on these
// ─────────────────────────────────────────────────────────────
const TARP_COLORS = [0x1f5fa8, 0xc8342a, 0xd8a520, 0x1d7a54, 0x8a2a7a, 0xe07020];

export function buildStall(x, z, rotation, opts = {}) {
    const g = new THREE.Group();
    const y = getTerrainHeight(x, z);
    const w = opts.width ?? 4.2, d = opts.depth ?? 3.0, h = opts.height ?? 2.5;
    const tarp = opts.tarp ?? TARP_COLORS[Math.floor(Math.random() * TARP_COLORS.length)];

    const inner = new THREE.Group();

    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 5), MAT.bamboo);
        post.position.set(px, h / 2, pz);
        inner.add(post);
    }

    // Plastic tarp roof, sagging between the poles the way they always do.
    const tarpMat = plain(tarp, { side: THREE.DoubleSide });
    const roofGeo = new THREE.PlaneGeometry(w + 1.0, d + 1.0, 5, 5);
    const rp = roofGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
        const u = rp.getX(i) / (w + 1.0) + 0.5, v = rp.getY(i) / (d + 1.0) + 0.5;
        rp.setZ(i, -Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.45);
    }
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, tarpMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = h + 0.22;
    roof.castShadow = true;
    inner.add(roof);

    // A rail of hanging cloth at the back — this is what the market actually looks like.
    const clothColors = [0xd8342a, 0x1f6fa8, 0xf0b323, 0x2f8a54, 0x9a3cff, 0xe8e2d2];
    for (let i = 0; i < 6; i++) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w / 6 - 0.06, h * 0.72),
            plain(clothColors[i % clothColors.length], { side: THREE.DoubleSide }));
        panel.position.set(-w / 2 + (i + 0.5) * (w / 6), h * 0.46, -d / 2 + 0.06);
        inner.add(panel);
    }

    // Counter and goods.
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.95, 0.62), MAT.wood);
    counter.position.set(0, 0.48, d / 2 - 0.25);
    counter.castShadow = true;
    inner.add(counter);

    const waresMat = plain(opts.waresColor ?? 0xd0a050, {
        kind: 'standard', roughness: 0.6,
        emissive: opts.waresGlow ?? 0x000000, emissiveIntensity: 0.6,
    });
    for (let i = 0; i < 6; i++) {
        const item = new THREE.Mesh(
            opts.waresGeo ? opts.waresGeo.clone() : new THREE.SphereGeometry(0.15, 7, 7), waresMat);
        item.position.set(-w / 2 + 0.45 + i * (w - 0.9) / 5, 1.05, d / 2 - 0.28);
        inner.add(item);
    }

    // Its lamp.
    const lampColor = opts.lamp ?? PALETTE.lamp;
    let lamp = null;
    if (opts.light) {
        lamp = new THREE.PointLight(lampColor, 1.4, 13);
        lamp.position.set(0, h - 0.3, 0.2);
        inner.add(lamp);
    }
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 7), glowMaterial(lampColor));
    bulb.position.set(0, h - 0.3, 0.2);
    inner.add(bulb);
    const bulbGlow = makeGlowSprite(lampColor, 0.5, 4.2);
    bulbGlow.position.copy(bulb.position);
    inner.add(bulbGlow);

    if (opts.sign) {
        const sign = makeSign(opts.sign, {
            width: w * 0.85, size: 58, color: opts.signColor ?? '#ffe0a0',
            glow: 'rgba(255,150,40,0.8)',
        });
        sign.position.set(0, h + 0.62, d / 2 + 0.3);
        inner.add(sign);
    }

    inner.rotation.y = rotation;
    inner.position.set(x, y, z);
    g.add(inner);

    const phase = Math.random() * 6;
    function update(ctx) {
        const flick = 1 + Math.sin(ctx.time * 3.1 + phase) * 0.15;
        if (lamp) lamp.intensity = 1.35 * flick;
        bulbGlow.material.opacity = (0.2 + 0.36 * (ctx.night ?? 1)) * flick;
    }
    return { group: g, update, x, z };
}

// ─────────────────────────────────────────────────────────────
//  ROCK
// ─────────────────────────────────────────────────────────────
export function buildBoulderField(count, cx, cz, spread, scale = 1, opts = {}) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, opts.material ?? MAT.laterite, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const s = (0.5 + Math.random() * 1.6) * scale;
        dummy.position.set(x, getTerrainHeight(x, z) + s * 0.3, z);
        dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        // Wave-cut rock is flatter than mountain scree — squash it.
        dummy.scale.set(s * 1.2, s * (0.4 + Math.random() * 0.4), s * 1.2);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    return mesh;
}

/** Aligns a flat mesh (like a mat or ground art) to the slope it is lying on. */
export function layOnGround(mesh, x, z, lift = 0.06) {
    const n = getTerrainNormal(x, z);
    mesh.position.set(x, getTerrainHeight(x, z) + lift, z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    return mesh;
}

/** A woven mat — the flea market, the chai circle and the banyan floor are all mats. */
export function buildMat(x, z, opts = {}) {
    // The lie-flat rotation is baked into the geometry, not set on the mesh: layOnGround
    // overwrites the mesh quaternion outright, so anything set on .rotation first is lost.
    const geo = new THREE.PlaneGeometry(opts.width ?? 2.2, opts.depth ?? 1.6);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, plain(opts.color ?? 0xa8905e, { side: THREE.DoubleSide }));
    layOnGround(mesh, x, z, 0.04);
    mesh.rotateY(opts.rotation ?? Math.random() * Math.PI);
    return mesh;
}
