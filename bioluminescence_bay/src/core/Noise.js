// Seeded Perlin noise. Seeding matters: the terrain height function is queried by
// terrain generation, prop placement, the crowd, and the player controller — they all
// have to agree, and a reload must produce the same coastline every time.

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class SeededNoise {
    constructor(seed = 1337) {
        this.rand = mulberry32(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + t * (b - a); }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise3D(x, y, z) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = this.fade(x), v = this.fade(y), w = this.fade(z);
        const P = this.perm;
        const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
        const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
        return this.lerp(
            this.lerp(
                this.lerp(this.grad(P[AA], x, y, z), this.grad(P[BA], x - 1, y, z), u),
                this.lerp(this.grad(P[AB], x, y - 1, z), this.grad(P[BB], x - 1, y - 1, z), u), v),
            this.lerp(
                this.lerp(this.grad(P[AA + 1], x, y, z - 1), this.grad(P[BA + 1], x - 1, y, z - 1), u),
                this.lerp(this.grad(P[AB + 1], x, y - 1, z - 1), this.grad(P[BB + 1], x - 1, y - 1, z - 1), u), v),
            w);
    }

    noise2D(x, y) { return this.noise3D(x, y, 0); }

    fbm2D(x, y, octaves = 4) {
        let val = 0, amp = 0.5, freq = 1;
        for (let i = 0; i < octaves; i++) {
            val += this.noise2D(x * freq, y * freq) * amp;
            amp *= 0.5; freq *= 2;
        }
        return val;
    }

    /** Ridged multifractal — this is what gives the peaks their sharp crests. */
    ridged2D(x, y, octaves = 4) {
        let val = 0, amp = 0.5, freq = 1;
        for (let i = 0; i < octaves; i++) {
            const n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
            val += n * n * amp;
            amp *= 0.5; freq *= 2;
        }
        return val;
    }
}

export const noise = new SeededNoise(19951231);
