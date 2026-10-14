// Shared config for Bioluminescence Bay.
// One source of truth — every module that needs a number reads it from here.
//
// Forked from Goa_trance/src/core/constants.js on 2026-10-07. Same orientation, so
// every system that came across with the fork still reads the world correctly:
//   −X is open sea (west).  +X is inland (east): sand, dune, palm scrub, jungle ridge.
//   −Z is north (the North Horn).  +Z is south (the South Horn, where you arrive).
//   y = 0 is mean sea level and is the only absolute reference in the world.
// The difference from Goa: this is not a long strip. It is ONE crescent cove closed at
// both ends by rock horns, so from the sand the glowing water reads as a bowl of light.

// --- World ---
export const TERRAIN_SIZE = 1400;
// 220 is the ceiling before startup cost gets noticeable: every vertex is a full
// noise evaluation, and the minimap bakes its relief from the same function.
export const TERRAIN_SEGS = 220;

// The player is fenced to the strip. X is asymmetric — unlike the Mountains valley,
// one side of this world is open water you are meant to swim in.
export const WALK_BOUND_X_MIN = -170;   // far enough out to swim round the DJ raft
export const WALK_BOUND_X_MAX = 120;    // the jungle edge behind the dune
export const WALK_BOUND_Z = 215;        // the two horns

// --- Sea ---
export const SEA_LEVEL = 0;
// Tide moves the waterline across the near-flat wet-sand band. 0.35 m against a
// 0.028 gradient is roughly 12 units of beach appearing and disappearing — visible
// without being silly. getTerrainHeight() never changes; only the water does.
export const TIDE_AMPLITUDE = 0.35;
export const WADE_DEPTH = 0.5;          // ankle-to-knee: slowed, splashing
export const SWIM_DEPTH = 1.4;          // chest: feet leave the sand
export const DIVE_DEPTH = 6.0;          // how far under you can get

// --- Player ---
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_RADIUS = 1.1;
export const WALK_SPEED = 13;
export const RUN_SPEED = 27;
export const SWIM_SPEED = 7.5;
export const MOUSE_SENS = 0.0019;

// --- Zone streaming (disabled after preloadAll; see ZoneManager) ---
export const ZONE_ACTIVATE_DIST = 210;
export const ZONE_DEACTIVATE_DIST = 290;

// --- The cove ---
// The waterline is a crescent: coastX(z) in Terrain.js bows inland to COVE_BACK_X at
// z = 0 and returns to the horns at ±COVE_HALF_Z. Change these and the whole bay moves.
export const COVE_HALF_Z = 170;
export const COVE_BACK_X = -12;         // waterline x at the middle of the cove
export const COVE_MOUTH_X = -60;        // waterline x at the horns

// --- Landmark anchors, north (−Z) to south (+Z) ---
// Used by terrain flattening, every zone, the paths, the crowd and the minimap.
// Never hardcode a coordinate that already has a name here.
// BAY LAYOUT v2 (2026-10-07 redesign — no longer Goa's south-to-north beach walk):
// you ARRIVE high on the North Horn at the lookout and see the whole glowing crescent
// before you set foot on it; a switchback trail drops to the rocks. The stage moved to
// the SOUTH half of the dune with the raft off it; the fire camp moved north behind the
// dune; the old south arrival is now the mangrove creek where the kayaks are.
export const LOOKOUT = { x: -88, z: -178 };        // cliff-top lookout on the North Horn — the spawn
export const THE_ROCKS = { x: -50, z: -126 };      // rock shelf at the foot of the North Horn (glow pools)
export const FIRE_CAMP = { x: 44, z: -64 };        // fire circle behind the dune, north half
export const DRIFTWOOD_STAGE = { x: 22, z: 62 };   // on the dune, south half, facing the sea
export const DJ_RAFT = { x: -76, z: 44 };          // floating off the stage — in earshot of the surf
export const ARRIVAL = { x: -26, z: 150 };         // MANGROVE CREEK: kayak landing in the south corner

// --- Palette ---
export const PALETTE = {
    // Daylight coast
    sand: 0xd8c39a,
    wetSand: 0x9a8465,
    laterite: 0x9c4f2c,          // the red rock the headlands are made of
    palm: 0x2f5a2c,
    paddy: 0x6a8f3a,
    seaDeep: 0x061c33,
    seaShallow: 0x0f5f72,
    foam: 0xdff2f0,
    // Sunset
    sunOrange: 0xff7a2a,
    sunGold: 0xffc255,
    dusk: 0xff5a7a,
    // Night / fluoro. These are the UV-paint colours — saturated, and they carry the
    // whole night read once ambient drops. See fluoro() in Props.js.
    uvMagenta: 0xff2ea6,
    uvLime: 0xaaff2a,
    uvCyan: 0x1ce7ff,
    uvOrange: 0xff8a00,
    uvViolet: 0x9a3cff,
    // Warm 1995 light — oil lamps, kerosene, string bulbs
    lamp: 0xffb055,
    ember: 0xff4a1a,
    // Cold 2020s light — the one modern venue
    led: 0xd8f4ff,
    // The plankton. Noctiluca reads cyan-blue on camera; this is the colour the whole
    // world is built around, and nothing else in the bay may be this colour.
    bioCore: 0x7ff6ff,
    bioBlue: 0x1fa8ff,
    driftwood: 0xb9ad98,
    // Structure
    bamboo: 0x9a7c4a,
    darkWood: 0x4a3520,
    thatch: 0x8a6f42,
};

// Fluoro tapestry / flag palette, in the order they get strung.
export const FLUORO_COLORS = [
    PALETTE.uvMagenta, PALETTE.uvLime, PALETTE.uvCyan,
    PALETTE.uvOrange, PALETTE.uvViolet,
];

// Boats on this coast are painted in exactly these colours and no others.
export const BOAT_COLORS = [0x1f5fa8, 0xd8352a, 0xf0b323, 0x1d7a54, 0xe4e0d4];
