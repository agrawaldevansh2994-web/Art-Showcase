# World ideas — the "change one rule" brainstorm (2026-09-30)

Written for Devansh, as a record of the list we started from, what got picked, and what's
still on the shelf. Nothing here is a spec; each world that gets built has its own
`CLAUDE.md` in its folder.

## Why this list exists

Space (Afterglow) and Atlantis both worked because each one **changed a single rule of the
world** — gravity in one, the air itself in the other. Devansh asked for more worlds out of the
ordinary, and no more DJ + dancing crowd ("bored of that, it's everywhere"). So every idea
below changes one rule you haven't touched yet: **size, time, geometry, art style, or your own
body.**

## The first list

| # | World | The rule it changes | What it is | Risk | Size | Status |
|---|---|---|---|---|---|---|
| 1 | **Shrunk** | Scale | A backyard at ant height. Grass blades like redwoods, dewdrops that magnify what's behind them, a hose leak that's a waterfall, a dropped picnic that's a mountain range. The porch light is the sun; fireflies are the size of balloons. | Low | Medium | On the shelf |
| 2 | **The Frozen Second** | Time you control | One second of Holi in Vrindavan, stopped. Powder clouds hang in the air, a pichkari's water is caught mid-arc, a thousand people frozen mid-throw. You walk through it, and the mouse wheel moves time forward and back a few frames. A frozen crowd can't levitate or cross its arms, so the crowd bugs Goa had go away by design. | Low–medium | Medium | **Picked — "the craziest, no doubt". Next after Nightwalker.** |
| 3 | **Walk Through Time** | Time by position | One street (a Varanasi ghat, the Roman Forum). Every 50 m you walk is a century: buildings rise, crumble and are rebuilt around you. | Medium | Large (the same street built 6–8 times) | On the shelf |
| 4 | **The Inside-Out World** | Geometry | A spinning space-habitat cylinder (an O'Neill cylinder). The ground curves up on both sides and over your head; fields and towns hang above you; a light strip on the axis is the sun. | Medium | Large | On the shelf |
| 5 | **Mirror Sky** | Reflection | Salar de Uyuni after rain: a salt flat under a thin sheet of water, a perfect mirror to the horizon, the Milky Way above *and* below you. One reflective floor, the sky, a few flamingos and salt piles. | Very low | Smallest of all | On the shelf — the quickest win if wanted |
| 6 | **Escher's Staircases** | Gravity per wall | Impossible architecture that loops back on itself, with gravity that shifts to whichever wall you stand on (Monument Valley in first person). | High (new game logic, not set-dressing) | Large | On the shelf |
| 7 | **Walk Into the Paintings** | Art style | A gallery where each painting is a world: Starry Night's swirling brushstroke sky, Hokusai's Great Wave frozen as it towers, Dalí's melting clocks. | Medium (the painterly shader is the work) | Medium–large | On the shelf |
| 8 | **The Song Is the Landscape** | Music as terrain | Take one of the MP3s in `tracks/`: bass becomes hills, hi-hats become crystal grass, the drop is a canyon. Walking forward plays through the song. The first world built *out of* music. (Any real track ducks all other sound to 20% — the standing rule in the root `CLAUDE.md` §5.) | Medium | Medium | On the shelf |
| 9 | **You Are the Firefly (or the Bird)** | Your body | The Shrunk idea, but you're the creature: you fly low, land on things, and your own light is the only light. A world about darkness where you light up what you choose to look at. | — | — | Folded into the body-change ideas below |

## The follow-up: "change your body" (Devansh's own idea)

He asked for a world where you can convert between an animal and a human view, with vampires or
time travel. My three versions:

| World | The idea | Status |
|---|---|---|
| **Nightwalker** — a vampire | One town, three bodies. **Human**: warm colours, normal walking. **Vampire**: cold colours, every living person's heartbeat glows through walls, super-speed, leaps. **Bat**: the screen goes black and each click sends a ring of sound that lights only edges in white (echolocation). A mirror that shows the room but not you. | **Picked, and the base is built and pushed** (`11f930a`, folder `nightwalker/`). See below. |
| **Ichchhadhari Naag** — a shape-shifting cobra | The Indian version: a human in a South Indian temple town on a festival night (oil lamps, gopurams, kolam patterns), or a cobra 10 cm off the ground — grass is jungle, you see body heat like a pit viper, footsteps show as ripples in the ground. | On the shelf |
| **Werewolf** — the full-moon forest | Human: a dark, frightening forest. Wolf: colour drains out, **smells show as coloured trails in the air** (smoke, deer, campfire, people), and you run four times faster. Simpler than the vampire: one trick instead of three. | On the shelf. Also planned as a later **Wolf form** inside Nightwalker (a hybrid). |

**Time travel** was folded into Nightwalker instead of being its own world: in the tomb, a
founder's candle takes you to **the same valley in 1750** — no town, only the Carpathian village
at its founding, lit by torches. That's milestone M6, the stretch goal.

## How Nightwalker turned out (so far)

- **Sources:** The Vampire Diaries and Twilight. The site is public, so we take the look, the
  places and the powers — never the names, logos, characters or dialogue. The town is **Hollow
  Falls**.
- **Setting — a mix of both:** a modern town and rainforest (the shows) **plus** a Carpathian
  1750s **Old Quarter** (a tall-spired wooden church, a cemetery, a ruined keep).
- **Sunlight: sparkle, not burn.** In the Meadow's sunbeam your own forearms glitter.
- **Look:** three district palettes that blend as you walk — **teal** forest, **amber-sepia**
  founders' town, **indigo-violet** Old Quarter — kept **mostly dark and moody, "the same vibe we
  get in a vamp town."** All signs stay.
- **Later, not v1 (ideas raised along the way):** a Wolf form (hybrid: smells as coloured trails,
  4× speed) and the whole **werewolf side** (see "Later scope" below), a founders' masquerade in
  the hall, a comet crossing the sky, the 1750 time-jump (M6).
- **Where it stands:** base (three bodies + valley + grey blockout) built, measured and pushed
  but **not deployed**; all 20 reference pictures are in and read. The next session restyles
  everything from them. Plan: `nightwalker/TASKS.md`.

## Later scope: the werewolf side (Devansh, 2026-09-30)

Devansh: the werewolf side can be added to Nightwalker later — as another town or forest, or a
trip to another time. Not in v1; here is how it would fit, smallest step first. Same IP rule as
the rest: the pack, the curse and the full moon as *ideas*, never names, characters or dialogue.

1. **A fourth form: the Wolf** (smallest step). Key 4. The senses swap the way the bat's do:
   colour drains and **smells show as coloured trails in the air** (woodsmoke, deer, the river,
   each person a different trail), you run about four times faster, and sound sharpens to
   footsteps and breath. Same valley, no new place needed. It is already on the Nightwalker
   "later" list.
2. **The land beyond the Wolf Line** (a new place). The Wolf Line is already the west boundary
   of the valley, and the beach reference (`wiki_beach_lapush.jpg`) is already in `reference/`.
   Past it: a dark-sand beach, driftwood, a fir-topped headland, and the pack's own forest and
   village. A human is warned off the line; a vampire is unwelcome; a wolf walks straight
   through. The border becomes a real threshold instead of a fence of posts.
3. **A trip to another time** (the same trick as the 1750 candle in the tomb). In 1750 the
   Carpathian village has its own wolf-folk lore (the Romanian werewolf and moroi stories), so
   the valley at its founding can hold a pack as well as torches. It reuses the 1750 build
   rather than needing a second era.
4. **Another town** (largest step). A separate settlement inside the pack's forest, on the far
   side of the Wolf Line — the only choice that needs a whole new district and palette, so it
   goes last.

**My recommendation:** 1, then 2 — a Wolf form plus the land beyond the Wolf Line uses the
doorway and the reference already in place. Do 3 only alongside the 1750 jump, and 4 only if
the first two feel like too little.

**Constraint to keep:** adding a fourth form must not change the light count or program count
(see `nightwalker/CLAUDE.md` §4). Wolf smell-trails are a Senses-pass effect like echolocation,
not new lights.

## Suggested order from here

1. **Nightwalker** — restyle from the references, then ship (`nightwalker/TASKS.md`).
2. **The Frozen Second** — plan it (which festival moment, what gets frozen, how the wheel
   scrubs time), then build. The strongest idea left.
3. Whichever of **Mirror Sky** (quick, striking), **Song Is the Landscape** (uses your tracks) or
   **Shrunk** (safest) you want as a fast, contrasting world in between.

## The Claude challenge round (2026-10-07)

These are fresh pitches built to beat the existing list on one thing: **the rule changes what
you can do, what you can see, and what the world means at the same time.** No dance floor, no
standard portal tour, and no reskin of the frozen-time or mirror ideas.

| World | The one rule | The experience | Signature moment | Risk / size |
|---|---|---|---|---|
| **The Shadow Has Its Own World** | Shadows are solid places | At noon, a ruined city looks ordinary. Step into a tower's shadow and its impossible interior appears inside that exact shape: staircases, rooms, and a second city too large to fit inside the tower. As the sun moves, the shadow-world redraws itself under your feet. | A bell tower's shadow stretches across a plaza; walk its length and emerge from the shadow of a tiny bell at the other end. | Medium / medium |
| **The World Grows Behind You** | The world only exists after you pass | Ahead is a pale, empty horizon. Every step plants something behind you: first grass, then trees, houses, windows lit by lives you never met. Turn around and your path has become a whole inhabited world. Walk far enough and your first footprints are ancient ruins. | Look back after crossing a blank valley and find a lantern-lit village following your exact route. | Low–medium / medium |
| **Fold the Continent** | Distance is controlled by creases | Explore a paper-thin landscape from ground level. Find a crease and pull its edges together: two faraway valleys touch, rivers spill across the fold, and a mountain bends like a page. Flatten it and the places separate again. | Fold the horizon until the sun sets behind a mountain that was thousands of miles away. | High / medium–large |
| **The City Beneath Every Footstep** | Footprints stay forever and become terrain | Walk through a black, quiet plain. Each footfall leaves a glowing impression; repeated paths sink into ravines, pauses become pools, and paths crossed by many visitors rise into bridges. The ground becomes a visible record of how people explored it. | Climb a ridge made from thousands of paths, then spot your own tiny trail winding through it. | Medium / medium |
| **The Museum of Unheard Things** | Sound is the only material | The world begins as darkness. A breath draws a thin silver line; a knock builds a room; a hum raises a cathedral. Each sound leaves a structure that slowly decays into silence. Explore by making a soundscape, not by collecting objects. | Stop humming and watch the cathedral dissolve from its highest spire down, while one last ringing note keeps a doorway open. | Medium–high / small–medium |
| **The Sky Is a Deep Sea** | The sky has depth and buoyancy | Climb above the clouds and discover that they are the surface of an upside-down ocean. Stars are luminous creatures moving below it; rain rises from the land to feed the sea. Float among cloud reefs, then dive through the cloud-surface into a night ocean overhead. | Swim upward through a cloud and break into clear air, looking down at the world through the rippling underside of the sky. | Medium / medium |

**Best head-to-head pick: _The Shadow Has Its Own World_.** The rule is easy to explain in one
sentence, but every new light angle changes the walkable map. One courtyard can deliver the whole
idea: a tower, a moving sun, and a shadow whose interior is impossibly larger than its source.
That makes it a strong small build with a reveal people can understand from a single screenshot.
**Built:** `shadow_world/`; added to the combined build and landing page.
