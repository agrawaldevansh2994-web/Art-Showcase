# CONTEXT: how Playa Art thinks

Read this before proposing, critiquing, or writing code. These are Devansh's standing rules
and taste, learned over 22 worlds.

## What a Playa Art world is
- A **first-person, explorable** place in the browser (Three.js + Vite), served from its own
  subpath of www.3dart.co.in (for example `/bay/`). Free, no login, desktop-first.
- **One world, one folder, one standalone Vite app.** Worlds never import from each other.
  Shared code gets copied into the new folder and adapted.
- Each world has a `CLAUDE.md`: concept, zones, systems, milestones, and a running history of
  what was built, measured, and still open.

## Hard rules
1. **Never change an existing world** unless Devansh explicitly asks. A new idea gets a new folder.
2. **Copy systems, not looks.** Reuse terrain, crowd, ocean, and controls code, but a new world
   must not look like the world it came from. Bioluminescence Bay was first criticised for
   looking too much like Goa.
3. **Original IP only.** No names, logos, characters, or dialogue from films, shows, or games.
   "A Stranger Things feel" means an original 80s small town.
4. **Never trade resolution or sharpness for speed.** He rejected a world that looked "480p"
   after a perf pass. Get performance from instancing, LODs, culling, fewer lights, and baked
   or emissive light instead.
5. **Verify visually.** Nothing counts as looking right until it's rendered and looked at.
   Headless frame rates are not real frame rates.
6. Assets: CC0 or self-made only, credited in the world's README. Runtime URLs use
   `import.meta.env.BASE_URL`, never a bare leading `/`.

## Taste: what makes a great world
- **One rule of reality changed.** The strongest worlds bend one rule: gravity (Space), air
  (Atlantis), light and shadow (Shadow City), time (Deep Time), scale (Shrunk, ant height in a
  backyard). A pitch should name its rule.
- **Light as the subject:** night, glow, aurora, bioluminescence, neon, lasers off a pyramid
  apex, lanterns.
- **Real places made magical:** Goa, the Himalaya, Giza, Arctic Norway, Mumbai.
- **A walkable journey with a reveal:** lookout above, walk down, hidden spots "nobody points
  you to".
- **Things to do:** ride (husky sled, kayak, roadster), fly, swim, dive, switch bodies, scrub
  time, plus one **signature moment** (fireworks, the impact, a sunrise ceremony).
- Photoreal sky, light, and water; painterly layered haze also works (a Firewatch-like look
  with a photoreal sky).
- Big builds in one go are welcome.

## Dislikes
- **"Just a DJ plus a dancing crowd."** A party can be part of a world, never the whole idea.
- Boxy, underlit people up close. Abstract flat-primitive looks. Point-light soup.
- A new world that reads as a reskin of an old one.

## Lead palettes already used (don't repeat as the main palette)
Coastal sunset gold plus deep teal underwater (Atlantis); blacklight UV and neon city rain
(Afterglow); electric blue on black (Bioluminescence Bay); green aurora on polar night
(Aurora); warm sand sunset plus UV (Goa); moonlit silver plus UV mushrooms (Silverwood);
teal, amber, and indigo moody (Nightwalker); red corridors and cold LED (Warehouse); blue
steel lasers on night desert (Pyramids); dusty desert neon (The Playa); era-shifting lava,
ice, and red giant (Deep Time); stone courtyard with hard sun against shadow (Shadow City).

**Under-used openings:** daylight and golden hour with no neon, pastel or high-key palettes,
monsoon and mist by day, impossible interiors, desert canyons by day, reefs by day, snow by
daylight, India beyond Goa and Mumbai.

## The 22 live worlds (for "don't duplicate" checks)
Atlantis, Afterglow, Last Train (rave on a glass night metro), Panopticon (techno in a circular
prison), Scenic Drive, Bioluminescence Bay, Aurora Ice Festival, Forest Rave, Pyramids at
Night, Shrunk, Shadow City, Deep Time, Goa Trance, Silverwood, Nightwalker, Odyssey, Space,
The Playa, Warehouse raves, Mumbai, Deep End, and more. See https://www.3dart.co.in.

## Ideas floated, not built
A 360° Greek warrior arena (fighter or spectator), an 80s small-town supernatural mystery, a
Southern-gothic juke-joint slow horror, night drifting on a mountain pass, a Monsoon Mumbai
local train, a glowing tide pool at ant scale, a lighthouse in a storm, a clockwork brass
bazaar, an abandoned space station, a shadow-puppet village, a lantern-festival river. Also an
AI-generated DJ video as a chroma-keyed screen in a club world.

## Working style
Short answers and few rounds. A one-paragraph plan (concept, the rule it changes, zones, the
signature moment, milestones) before any big build.
