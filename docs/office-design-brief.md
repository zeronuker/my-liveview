# Office design brief: "The Garden Studio"

Agreed with the user on 2026-11-13, after many rounds of top-down sketches (version 14 was the one approved). The sketches were drawn as SVG in the chat and are **not stored**; this document is the record. Read `.claude/skills/office-pixel-art/SKILL.md` before drawing anything for it.

## How to read the coordinates

The sketch used "plan units": about 1 unit = 1 game pixel, and the game tile is 16 pixels, so 16 units = 1 tile. A worker is 12 by 16 pixels, so a door about 18 to 24 units wide is about one tile. Rectangles below are `x, y, width, height` in plan units, with x to the right and y down. The building's main block is x 70 to 630 and y 110 to 510 (about 35 by 25 tiles). The CEO suite sits above it at negative y. When the layout is built in `public/layout.js`, snap every edge to the tile grid (the rounding is a small change; keep rooms as close in size as possible).

## The idea

A friendly, open office in a garden. A neutral shell with a few strongly themed rooms, a main street that links the rooms, loud rooms at the front and quiet ones at the back, lots of daylight, plants and warm lighting. The building is stepped, not a square. It has three levels, each with its own floor colour.

## Levels and floor colours

| Level | What is on it | Floor colour |
|---|---|---|
| First floor | The CEO suite | Pale blue (`#b9c5e0`), the foyer a soft blue-lilac (`#ccd3ea`) |
| Mezzanine (raised) | The open office and the lobby | Soft sage (`#dde6d0` for the open office, `#e6ecdc` for the lobby, `#d7e0c4` for the entrance zone) |
| Ground floor | Back rooms, main street, social hub, lounge and pantry, terrace | Honey wood (`#dcc59c`; the street `#f2e6cc`; the hub `#e6cf9f`; the lounge `#e8cfa0`) |

The mezzanine sits over a hidden space on the ground floor (not drawn, not walkable). Level changes happen only at stairs.

## Ground floor

- **Back row, y 110 to 200**, left to right:
  - File room, x 70 to 150. Quiet. No windows (archives are kept out of the sun).
  - Test lab, x 150 to 230. Quiet. One north window.
  - Server room, x 230 to 290. Three dark racks with blinking lights.
  - Men's bathroom, x 290 to 330, and women's bathroom, x 330 to 370. Each has two stalls, two sinks and a small frosted window.
  - Meeting room, x 370 to 570. Glass walls, a 10-chair table, a wall TV on the east wall, two north windows.
  - CEO stairwell, x 570 to 630. Narrow, with double doors (see Doors).
- **Main street**: a band along y 200 to 225 from x 70 to 630, and a corridor at x 345 to 385 from y 225 to 340. Every back room opens onto the band.
- **Social hub**, x 400 to 630, y 225 to 415. A sofa facing a wall TV, two armchairs and a coffee table on a big rug, a ping-pong table, plants, big east windows.
- **Vending strip**, x 400 to 630, y 415 to 443. Three machines on its west half, a water cooler and a bin.
- **Lounge and pantry**, x 400 to 630, y 443 to 540 (the south wing sticks out past the main block). Two more vending machines, a pantry counter with sink and fridge along the south wall, an island with three stools, a sofa. An open archway at x 582 to 628 joins the lounge to the hub. Windows on the east wall and over the pantry counter.
- **Terrace**: a wooden deck, x 455 to 625, y 540 to 622, on posts with a railing on three sides. It floats over a large pond (ellipse centre 540, 595; radii 125 by 68) and overlooks it. Entry through sliding glass doors from the lounge. A boardwalk (x 396 to 456, y 580 to 594) crosses the water from the front path.

## Mezzanine

- **Open office**, x 72 to 340, y 225 to 418. No walls. 16 desks in irregular islands of different sizes and directions (not a uniform grid): a six-desk island, two four-desk islands and a two-desk vertical pair. Chairs on both sides of each island. Plants between islands. Windows on the whole west wall.
- **Manager's desk** at the lower east edge of the open office (about x 300 to 314, y 366 to 404, chair east of it), with the hand-in tray beside it.
- **Guardrails** (see-through rails with posts) along the north edge (y 227 from x 74 to 288) and the east edge (x 340 from y 262 to 416), open at the stairs.
- **Lobby**, x 70 to 400, y 420 to 510, plus the entrance bay, x 250 to 400, y 510 to 555.
  - Reception counter just inside the entrance, left of the doors (long side at the bottom, short arm up on the right). Monitor, bell, brochure stand, a pendant lamp.
  - Coat stand and umbrella stand by the door, a welcome mat.
  - Waiting lounge (west half): a terracotta rug under two sofas and two armchairs around a round coffee table with magazines, a side table with a lamp, two pendant lamps, plants, windows behind the sofas.
  - Entrance: **sliding double doors** at the right end of the bay's south wall (x 350 to 396). Glass front along the rest of the bay.
- **Wall between the lobby and the open office**: solid, x 70 to 334 at y 418 to 422, **no door**. Staff reach the open office only by the stairs.

## First floor: the CEO suite (y -35 to 100, with a floor slab y 100 to 110)

- **Foyer**, x 520 to 630: where the stairs arrive. A bench, a plant, wall art, a rug.
- **Large CEO office**, x 330 to 520: a big desk under the window wall with the chair behind it, a rug with two visitor chairs, a sofa, a bookshelf on the west wall, a drinks cabinet, a plant. North windows.
- **Small conference room**, x 220 to 330: glass walls, a six-chair table, a wall TV, a plant.
- Doors: foyer to office on the shared wall at its lower end (swings into the CEO office); conference to office at the lower end of their shared wall (swings into the conference room).

## Stairs

- **Stairs A**: from the lobby (mezzanine) down to the main street corridor. x 345 to 385, y 340 to 420.
- **Stairs B**: from the main street up into the open office. x 290 to 334, y 228 to 260.
- **CEO stairs**: from the main street up to the CEO foyer, inside the narrow stairwell. Double doors in the **middle** of the stairwell's foot, spanning its **full width**, with the leaves swinging up into the stairwell.

So the walk from the front door to a desk is: entrance, lobby, stairs A down, main street, stairs B up, open office.

## Doors and windows

- Single doors always sit at an end of a wall, never in the middle; a short line and an arc show the swing. Left-end doors: file room, server room, men's bathroom (14 units wide), meeting room (glass). Right-end doors: test lab, women's bathroom (14 units wide).
- Open archways, no door: lounge to hub, lobby entrance bay to lobby.
- Windows go on exterior walls where daylight helps: the whole open-office west wall, the lobby, the hub east wall, the lounge, the meeting room, the test lab, the bathrooms, the CEO suite's top wall and the foyer's east wall. None in the file room.

## The garden

Grass all round, trees along the edges and corners, flower beds, a gate path from the front gate (x 350 to 396) to the entrance, the pond, the boardwalk. Pets (cats, dogs, chickens) wander on their own outside the walls; they are not workers.

## What the spots of the game map to

| Existing spot | New place |
|---|---|
| entrance | the front gate path, walking to the entrance doors |
| files | the file room (it needs shelves drawn) |
| seats (study seats) | the lounge sofas, the hub sofa, the waiting-lounge sofas |
| desks | the 16 chairs of the open office islands |
| lab | the test lab (it needs its machine drawn) |
| handIn, managerSeat | the manager's desk and tray in the open office |
| ceoSeat, ceoDelivery, ceoDoor | the CEO office desk and the foyer |
| stairs | stairs A, stairs B and the CEO stairs |

## Rules for the build

1. Walls are solid; people walk only through doors, archways and stairs.
2. Every spot must be reachable from the entrance (`src/layout.test.js`).
3. The guardrail edges are not walkable.
4. The art uses only the colours in `public/palette.js`, one ramp per material, light from the top-left (see the skill).
5. Draw things at game size: a worker is 12 by 16 pixels.

## Decisions taken in the design talks

- The tile stays 16 pixels. Detail comes from walls, props, lighting and the garden, not from a bigger tile.
- No printer room. (The server room replaced it. Open question: add a small printer stand somewhere?)
- No receptionist character (the game has no such role).
- The open office has no walls except the lobby wall; the mezzanine has guardrails.
- The terrace floats over the pond; the pond is large.

## Views

Flat (top-down, 3/4) first, because it reads clearly and is quicker to finish. An angled (isometric) view like the user's reference screenshot is wanted as a second view, switched by a toggle:

1. Keep the data about the building (rooms, walls, doors, furniture, spots) separate from the drawing, so a second view can read the same data.
2. First version of the angled view: floors as diamonds, walls as tall blocks with a cutaway at the front, the existing people standing upright.
3. Later: redraw the props and people at the angled style, room by room. A static concept picture comes before this, for the user to approve.

## Build steps

1. This brief. (Done.)
2. Build the empty plan: walls, doorways, levels, stairs, guardrail cells, with tests that prove reachability and that walkers use only doors and stairs. **Done (2026-11-13) as a new file, `public/studio.js` (`buildStudio()` and `levelAt()`), with `src/studio.test.js`; the game still uses `layout.js` until step 3 swaps it.** What it fixed in tiles: a world 47 by 49 tiles, the building x 5 to 41 (37 tiles wide, walls one tile thick and shared), the CEO suite rows 2 to 9, the back rooms rows 11 to 16, the main street rows 18 and 19, the open office rows 21 to 32 and the lobby rows 34 to 39 (x 6 to 25), the social hub x 27 to 40 rows 20 to 31, the lounge rows 35 to 40, the terrace and boardwalk below it. Rooms are a little smaller than in the sketches because of the walls: the file room is 4 by 6 tiles, the bathrooms 2 by 6, the meeting room 10 by 6, the stairwell 4 wide. Levels are 'first', 'ground', 'mezzanine', 'outside' and 'stairs'. Desk seats now carry a `face` and the `desk` cell in front of them (chairs are on both sides of an island). Things placed so far are only those that affect walking or the spots (desks, sofas, shelves, machine, tables, racks, stalls, vending, counters, rails, TVs); the other props come with the art in step 4, and each needs a spot-free path (the tests will check).
3. Re-wire the spots, the director and the stage. Walking routes become long (via both stairs): check that it looks right. **Done (2026-11-13) with placeholder art:** `public/studio.js` is now the plan the Office uses; `layout.js` keeps only fit, zoom and pan. `scenery.js` draws grass, a floor per room, one-tile wall blocks, stair stripes, door bars and plain coloured boxes for furniture that has no art yet (guardrails have a thin rail with posts). The stage turns a seated worker to face the way the seat faces; the sprites still show the front for every seated pose until step 4. Checked in the browser pane with the `full` mock session: workers walk in through the gate and doors, over both stairs, and Skip empties the Office. Observations: at the fitted zoom the workers are small (the world is 47 by 49 tiles; use the wheel or Fit); a trip from the gate to a desk is long (about 14 seconds at normal speed), and the `full` session takes noticeably longer than before. The walking speed was left alone on purpose, to be judged by the user.
4. Art, room by room, with the pixel-art skill: walls and floors, lobby, open office, social wing, back rooms, CEO suite, then the garden, pond and pets. Milestones: M0 foundations, M1 the shell, M2 lobby, M3 open office (and seated people from behind and the side), M4 social wing, M5 back rooms, M6 CEO suite, M7 garden and pets.
   - **M2 done (2026-11-13): the lobby.** New in `public/pixel.js`: `gridOps` (letters to rectangles), `ellipseOps`, `ringOps`, `glowOps` (a pool of light as a dither). New art files: `public/art/common.js` (sofas and armchairs for every facing and length, plants, rugs and mats, and `decalOps`) and `public/art/lobby.js` (the two-piece reception counter with monitor, bell and papers, coffee table with magazines and a vase, side table with a lamp, coat stand, umbrella stand). The plan gained `rugs` and `lights` lists and a `face` on sofas and armchairs; sofas now have kinds `sofa` and `armchair`. The terracotta rug is an oval with a border, a pale band and a ring of dots. Checked in the art-preview page and in the real Office zoomed in. Known simplifications: a sofa facing up shows its back, but the sitter is still drawn over it; seated people from behind and the side come in M3. Room names are now drawn over the furniture.
   - **M0 and M1 done (2026-11-13).** `public/art/shell.js` draws the shell with palette colours only: 13 floor kinds (plank, carpet, tile, slab, grate, gravel, each with per-tile variation and seams that run on), walls seen from the south (all cap where more wall continues south; cap on top and a plaster face with a skirting board where the run ends), door frames, sliding glass doors, double wooden doors, arches, windows and clear glass walls, stairs with steps, and a floor under the guardrails. `studio.js` now has a `windows` list (tested). `public/pixel.js` holds `hash`; the grid-to-pixels helper is left for M2, where the first props need it. The palette grew to 80 colours (floor materials and a wall cap); its near-duplicate test now allows pale tints close together. The server serves any `/art/<name>.js`, and a test checks that every file in `public/` is served (a missing `pixel.js` was caught this way). Room labels now show only when zoomed in (a tile of 14 pixels or more). The art-preview page shows each floor as 4 by 4 tiles and close-ups of the shell.
5. Update the mock sessions and tests, and play them.
6. Worker movement polish.
7. The angled view.

## Open points

- The long walk from the front door to a desk (via both stairs): confirm it is what the user wants in the game, or let workers appear in the open office.
- The empty file room and test lab need their furniture designed.
- What lives under the mezzanine (nothing drawn, not walkable).
- A printer stand: yes or no.
