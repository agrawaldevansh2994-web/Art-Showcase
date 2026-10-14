import { defineConfig } from 'vite';

export default defineConfig({
  // Served from playa-art.vercel.app/bay/ (wired into build.mjs and the landing page 2026-10-07) — every emitted asset URL is prefixed with
  // this. Anything referenced at runtime by an absolute path must use
  // import.meta.env.BASE_URL, not a bare leading slash.
  base: '/bay/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    // 5173 playa, 5174 mountains, 5175 warehouse (and Rave2, which collides with it).
    port: 5188,   // Bay's own port (5176 is Goa_trance's)
    open: true,
  },
});
