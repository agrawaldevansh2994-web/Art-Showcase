// Minimap. The relief is baked once at startup by sampling the terrain height function
// and hill-shading it, then blitted each draw — redrawing zone markers and the player on
// top is cheap, re-sampling the noise every frame would not be.
//
// Sea level is the organising fact here as everywhere else: anything below y = 0 is drawn
// as water, so the coastline on the map is the same coastline you are standing on.

import { getTerrainHeight, shoreX } from './Terrain.js';

const MAP = { xMin: -160, xMax: 160, zMin: -320, zMax: 320 };
const RELIEF_W = 112;
const RELIEF_H = 224;

function bakeRelief() {
    const c = document.createElement('canvas');
    c.width = RELIEF_W; c.height = RELIEF_H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(RELIEF_W, RELIEF_H);
    const d = img.data;

    const dx = (MAP.xMax - MAP.xMin) / RELIEF_W;
    const dz = (MAP.zMax - MAP.zMin) / RELIEF_H;

    const heights = new Float32Array(RELIEF_W * RELIEF_H);
    for (let j = 0; j < RELIEF_H; j++) {
        for (let i = 0; i < RELIEF_W; i++) {
            heights[j * RELIEF_W + i] = getTerrainHeight(MAP.xMin + i * dx, MAP.zMin + j * dz);
        }
    }

    for (let j = 0; j < RELIEF_H; j++) {
        for (let i = 0; i < RELIEF_W; i++) {
            const idx = j * RELIEF_W + i;
            const h = heights[idx];
            const hl = heights[j * RELIEF_W + Math.max(i - 1, 0)];
            const hr = heights[j * RELIEF_W + Math.min(i + 1, RELIEF_W - 1)];
            const hd = heights[Math.max(j - 1, 0) * RELIEF_W + i];
            const hu = heights[Math.min(j + 1, RELIEF_H - 1) * RELIEF_W + i];

            // Light from the north-west, the way a paper map is always drawn.
            const shade = 0.5 + ((hl - hr) * 0.6 + (hd - hu) * 0.6) / 22;

            let r, g, b, s = Math.max(0.35, Math.min(shade, 1.5));
            if (h < 0) {
                // Water: shallow turquoise over the shelf, deep indigo past the drop.
                const t = Math.min(-h / 26, 1);
                r = 26 - t * 18; g = 92 - t * 66; b = 116 - t * 58;
                s = 1;                        // hillshading the seabed just looks like noise
            } else if (h < 2.2) {             // beach
                const t = h / 2.2;
                r = 214 - t * 14; g = 192 - t * 8; b = 150 + t * 4;
            } else if (h < 7) {               // dune and scrub
                const t = (h - 2.2) / 4.8;
                r = 200 - t * 90; g = 184 - t * 44; b = 154 - t * 74;
            } else if (h < 24) {              // grove and paddy
                const t = (h - 7) / 17;
                r = 110 - t * 44; g = 140 - t * 34; b = 80 - t * 26;
            } else {                          // laterite headland
                const t = Math.min((h - 24) / 44, 1);
                r = 66 + t * 110; g = 106 - t * 34; b = 54 - t * 6;
            }

            const o = idx * 4;
            d[o] = Math.min(255, r * s);
            d[o + 1] = Math.min(255, g * s);
            d[o + 2] = Math.min(255, b * s);
            d[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    // The waterline, drawn straight onto the relief so the coast reads instantly.
    ctx.strokeStyle = 'rgba(230,246,250,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let j = 0; j <= RELIEF_H; j += 2) {
        const z = MAP.zMin + j * dz;
        const px = (shoreX(z) - MAP.xMin) / dx;
        if (j === 0) ctx.moveTo(px, j); else ctx.lineTo(px, j);
    }
    ctx.stroke();

    return c;
}

export function createMinimap(camera, zones, getYaw, vehicles) {
    const canvas = document.getElementById('minimap-canvas');
    const ctx = canvas.getContext('2d');
    const relief = bakeRelief();
    const el = document.getElementById('minimap');
    let craftFn = null;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (document.pointerLockElement !== document.body) el.classList.toggle('expanded');
    });

    function draw() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

        const cw = rect.width || 170, ch = rect.height || 170;
        const expanded = el.classList.contains('expanded');

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#04121a';
        ctx.fillRect(0, 0, cw, ch);

        const spanX = MAP.xMax - MAP.xMin, spanZ = MAP.zMax - MAP.zMin;
        const scale = Math.min(cw / spanX, ch / spanZ);
        const drawW = spanX * scale, drawH = spanZ * scale;
        const offX = (cw - drawW) / 2, offY = (ch - drawH) / 2;
        const toPx = (x) => offX + (x - MAP.xMin) * scale;
        const toPy = (z) => offY + (z - MAP.zMin) * scale;

        ctx.globalAlpha = 0.95;
        ctx.drawImage(relief, offX, offY, drawW, drawH);
        ctx.globalAlpha = 1;

        // Zones.
        for (const key in zones) {
            const z = zones[key];
            const zx = toPx(z.center.x), zy = toPy(z.center.z);
            const r = Math.max(z.radius * scale, 3);
            const col = z.color || '#ffb800';

            ctx.beginPath();
            ctx.arc(zx, zy, r, 0, Math.PI * 2);
            ctx.fillStyle = col + '1c';
            ctx.fill();
            ctx.strokeStyle = col + (z.loaded ? 'cc' : '55');
            ctx.lineWidth = z.loaded ? 1.4 : 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(zx, zy, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.fill();

            if (expanded || z.major) {
                ctx.fillStyle = col + 'dd';
                ctx.font = `600 ${expanded ? 11 : 7.5}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(z.short || z.name, zx, zy - r - 3);
            }
        }

        // Vehicles.
        if (vehicles) {
            const list = vehicles.getAll();
            ctx.fillStyle = 'rgba(255,150,60,0.85)';
            for (let i = 0; i < list.length; i++) {
                ctx.beginPath();
                ctx.arc(toPx(list[i].x), toPy(list[i].z), 1.7, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Craft you can take out (kayaks, surfboards): bright cyan dots.
        if (craftFn) {
            const list = craftFn();
            ctx.fillStyle = 'rgba(120,255,200,0.95)';
            for (let i = 0; i < list.length; i++) {
                ctx.beginPath();
                ctx.arc(toPx(list[i].x), toPy(list[i].z), 2.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // North arrow, because on a coast that runs north–south it is genuinely useful.
        if (expanded) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '600 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('N', offX + drawW - 14, offY + 16);
            ctx.fillText('SEA', offX + 18, offY + drawH / 2);
        }

        // Player.
        const px = toPx(camera.position.x), py = toPy(camera.position.z);
        const yaw = getYaw();
        const dirX = -Math.sin(yaw), dirY = -Math.cos(yaw);

        ctx.beginPath();
        ctx.moveTo(px + dirX * 9, py + dirY * 9);
        ctx.lineTo(px - dirY * 4.5 - dirX * 3, py + dirX * 4.5 - dirY * 3);
        ctx.lineTo(px + dirY * 4.5 - dirX * 3, py - dirX * 4.5 - dirY * 3);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
    }

    return { draw, toggle: () => el.classList.toggle('expanded'), setCraft: (f) => { craftFn = f; } };
}
