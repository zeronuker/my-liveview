# Drawing recipes

Numbers come from tutorials and from the Office's own checks (Slynyrd's Pixelblog 20, 21, 35, 43, 44; the pixel-art-studio skill; Blake Crosley's structures article; Budgetpixel). Where no tutorial exists the recipe says "own design": judge it by eye.

## Walls

- A wall is a 2 tile tall band: a cornice or top row above, a face row below, with a baseboard (a darker strip) along the bottom of the face. A 3 tile wall gives room for wall decor but feels less homey.
- Draw the front face first so it can repeat sideways. Seen from above, a wall also has a top: draw it as a thin lighter cap.
- Walls are thick enough to read as walls: the side walls (left and right of a room) are drawn thinner than the front face, but never a 1 pixel line.
- A wall's drop shadow on the floor is never longer than one tile, and the same length whatever the wall's height. Only on one or two faces.
- Furniture against the back wall stands on the first floor row and rises into the wall band.

## Doors and doorways

- A door is 1 tile wide and 2 tiles tall (16 by 32 pixels). In the doorway the floor continues through the wall. Do not draw a door flat on the wall face: it then reads as a path.
- Doorways have a frame (a darker material) and a threshold strip on the floor.
- Glass doors: glass ramp with a diagonal highlight, 1 pixel frame.
- Workers may only walk through doors; the art must make the doors obvious.

## Windows and glass

- One window per bay of wall, never where a door is.
- Push the window's top in about 3 pixels from the wall top, so it does not look pasted on.
- Glass: the glass ramp, a lighter diagonal streak top-left, a darker bottom row, a 1 pixel frame with a sill below.

## Floors

- Every floor tile must repeat seamlessly on all four sides. Test: shift the tile by half its size, wrapping, and fix any seam in the middle.
- Make 3 or 4 variants of each floor tile and scatter them. Keep tile edges quieter than centres.
- Never put two busy textures next to each other. Rooms differ by material (wood, carpet, tile, concrete) and by colour.
- Rugs: 2 by 1 up to 3 by 2 tiles, with a border and an inner pattern. They sit under furniture.

## Furniture

- Design on the 16 pixel grid. Most things fit one tile; large rare things may be bigger.
- Block in shapes with the material's base shade, add one lighter shade on lit edges (top and left), one darker on the opposite edges, then the outline.
- Every object gets a short shadow on the floor under it.
- Use one asymmetric piece as the focal point of a room; do not repeat it. Vary repeated pieces by colour swaps (another fabric, another wood).
- Own design: pantry counter, fridge, coffee machine, sink, printer, whiteboard, TV, meeting table.

## Light and cosy

- Block in big shapes (walls, windows, desks, rugs) first. Then add small, believable details (steam from a mug, a cat on a sill, papers).
- Warm colours (the `light` ramp) are for things that give light only.
- A lamp or window casts a pool of light on the floor: a dithered (checkerboard) edge in a lighter floor shade, no larger than 2 tiles across. Own design: judge by eye.
- Never use more colours than the palette. A few colours, well placed, read as richer than many.

## Stairs

- Drawn to scale with the people and the wall height. Each step is a lighter top strip and a darker riser. Railings are a separate layer above the stairs. A landing at each end.

## Trees, bushes, grass (the garden)

- Leaves: build the crown from 3 bundle variants (base, a darker, a lighter, from one ramp), 4 or 5 colours each, shaded like a sphere: dark crescent bottom-right, light spot top-left (mirrored from Slynyrd, who lights from the right).
- Trunk: a cylinder, bark stripes widest in the middle; add a knot or root. A tree with a busy crown gets a clean trunk.
- Shadow: a flattened ellipse under the tree, 1 to 2 pixels tall, offset to the bottom-right.
- Grass: mix flat green areas with textured patches of different density; add the occasional flower. Make 3 or 4 grass variants. Draw paths and dirt as separate, quieter tiles with soft edge tiles.
- Fences, flower beds, pots: own design, 1 tile each, wood or stone ramp.

## Animals (cat, dog, chicken)

- At 16 by 16 or smaller: limbs 1 pixel wide, 2 or 3 colours per part (base, shadow, highlight). Make each one read by silhouette first: a cat has pointed ears and a tail, a dog a longer snout, a chicken a comb and a round body.
- Four views (front, back, side; mirror the side), walk of 4 frames: contact, passing, contact (mirror), passing. Body bobs 1 pixel on the passing frames. Idle: 2 frames, with a 1 pixel breath; add a blink or tail flick now and then.
- Animals wander on their own outside the walls; they are not workers and do not use the work spots.

## People

- Head is about a third to half of the sprite's height. Walk is 4 frames. Existing rules in `public/sprites.js` stay.
