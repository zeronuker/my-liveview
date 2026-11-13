---
name: office-pixel-art
description: Rules and a check loop for drawing the Office's pixel art (floors, walls, doors, furniture, props, garden, animals) in code. Use before adding or changing anything in public/scenery.js, public/sprites.js or the floor plan art, and whenever the goal is a more detailed Office.
---

# Office pixel art

The Office is drawn in code, on a 16-pixel tile, with no image files. This skill keeps all new art in one style and makes sure every piece is looked at before it is kept. Read it before drawing; use the reference files for the details.

## The style (fixed, do not drift)

- **Tile:** 16 by 16 pixels. People are 12 by 16. Big things (the meeting table, a sofa, a tree) cover several tiles, drawn as one piece.
- **Light:** one source, top-left. Lit edges are top and left, shadow falls bottom-right.
- **Colours:** only from `public/palette.js`. Each material is a ramp of four shades (0 darkest, 3 lightest) made with hue shifts: shadows lean blue, highlights lean yellow. Never pure black or pure white. Warm light colours (`light` ramp) belong to light sources only: lamps, screens, sunlit windows.
- **Outline:** one rule for everything: a 1 pixel outline in the darkest shade of the object's own material, lightened on the lit (top-left) edge. No black outlines.
- **Shadows:** a short, soft shadow under every standing object, at most 1 tile long and 1 to 2 pixels down. Never long or one-sided.
- **Projection:** one view for everything: walls and furniture seen from the front and slightly above, so you see the front face and a little of the top.
- **Scale:** whole pixels only. The canvas scales up with no smoothing.

## How to draw a new piece

1. Decide the piece's size in tiles and which materials it uses (look up shades with `shade('wood', 2)`).
2. Block in the big flat shapes first. Then light and shadow. Then the outline. Then small details last.
3. Add it to `PIECES` in `public/art-preview.html` and look at it (see "The check loop").
4. Wire it in. The art lives in `public/art/<part>.js`, one file for each part of the place (`shell.js` has the floors, walls, doors, windows and stairs; the server serves any `/art/<name>.js`). Furniture and props are registered in `ARTS` in `public/scenery.js`, people and animals in `public/sprites.js`, and where things go in `public/studio.js` (the plan). Windows are data in `studio.js` (`windows`). Keep the existing tests green, and test every new art file the way `src/shell.test.js` does: whole pixels, inside its size, palette colours only, the same every time.

## The check loop (do not skip)

Never keep a piece you have not looked at. Every piece gets at least two passes:

1. Start the server (`preview_start`), open `/art-preview.html` in the browser pane, and take a screenshot at 8x.
2. Go through `references/checklist.md`, line by line, in writing.
3. Fix what failed and look again. Show the user only after the second pass is clean.
4. Then look at it in the real Office, in place, beside the other art: does it match their style and density?

## Own rules, not borrowed

- Draw everything ourselves. Study other art (Slynyrd's tutorials, LimeZu, Kenney) but never copy their pixels. Only CC0 material may be copied, and only when needed.
- No tutorial exists for some props (fridge, coffee machine, printer, whiteboard, fence, cat, dog, chicken). Design them from the rules above and judge by eye with the checklist.

## References

- `references/recipes.md`: how to draw walls, doors, windows, floors, furniture, light, trees, grass and animals.
- `references/checklist.md`: the written checklist for the check loop.
- `references/rooms.md`: what each room should contain, so detail is planned.
