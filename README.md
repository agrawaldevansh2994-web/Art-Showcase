# Playa Art: showcase repo

**Playa Art** is a collection of free, first-person 3D worlds you walk into straight in the
browser. Live at **https://www.3dart.co.in** (22 worlds). Instagram: @explorable_worlds.
Built by Devansh Agrawal with AI agents.

**Pitch:** 22 free worlds in your browser. No headset, no download, no ticket.

This public repo is a **read-only snapshot** made so an AI model can study the codebase. The
main repo is private. It holds three representative worlds with complete source, plus the
context you need to understand how every Playa Art world is built.

## Read in this order
1. `README.md` (this file): what the project is.
2. `CONTEXT.md`: the creative rules, taste, and constraints. Read this before suggesting anything.
3. `ARCHITECTURE.md`: how a world is engineered: stack, folder layout, systems, performance.
4. `worlds/*/CLAUDE.md`: each world's own design doc and build history.

## The three worlds
| Folder | Live URL | What it shows |
|---|---|---|
| `worlds/scenic_drive/` | https://www.3dart.co.in/scenic/ | Drivable car/bike on a branching Himalayan road: streamed terrain LOD rings, road ribbons, fork choice, time-of-day, multiple cameras. Newest architecture. |
| `worlds/bioluminescence_bay/` | https://www.3dart.co.in/bay/ | Hidden cove at night where the sea glows electric blue: glowing surf and footprints, kayak, jellyfish, lookout-to-beach reveal, a DJ raft. |
| `worlds/Goa_trance/` | https://www.3dart.co.in/goa/ | Goa freak coast, ~1995, Anjuna to Vagator: terrain, ocean, sunset-to-night sky cycle, crowd, scooters, seven zones. The template many later worlds copied systems from. |

All three are fully procedural Three.js: no model or texture files are required. Each runs on its own:

```bash
cd worlds/scenic_drive   # or bioluminescence_bay, Goa_trance
npm install
npm run dev              # opens localhost:<port>/<base>/
```

Controls (shared across worlds): click to start, WASD to move, mouse to look, Shift to run,
E to use, K for the key list, Esc to free the mouse. Desktop with keyboard and mouse is
recommended.

## What's not included
The other 19 worlds, the landing page, the root build script, music, and large media. Nothing
here is needed to run the three worlds.

## License
All rights reserved. See `LICENSE`. Public for viewing and analysis only.
