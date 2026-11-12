# The check loop checklist

Answer every line in writing for each new piece. Finish with SHIP or FIX and a list of what to change.

## Reads well

- Squint or look at 1x: does it still read as the right object? Is its silhouette clear?
- Does it stand out from its floor or wall? (Value contrast, not only hue.)
- Are shapes inside it clusters of 3 or more pixels, not scattered single pixels? Every lone pixel is on purpose or removed.
- If it has a pair (eyes, arms, legs, chair arms), are both readable or clearly hidden on purpose?

## Light and colour

- One light source, top-left. Are the lit edges top and left and the shadow bottom-right?
- No pillow shading (the darkest shade does not wrap all the way round the object).
- No banding (shade bands are not parallel 1 pixel stripes along the edge).
- Shadows lean cool, highlights lean warm. No pure black, no pure white.
- Only colours from `public/palette.js`. Warm light colours only on lamps, screens and sunlit glass.

## Craft

- One outline rule, 1 pixel, in the darkest shade of the material, lightened on the lit edge.
- Curves step smoothly (1, 2, 3 pixels), no jumps like 1, 3, 1.
- Same pixel size everywhere: no half-pixels, no scaled parts.
- Floors and walls repeat with no visible seam.
- A short shadow under it, no longer than 1 tile.

## In place (after the preview, in the real Office)

- Does it match its neighbours' style, scale and level of detail?
- Does it hide or block a worker's path, spot or label?
- Do the layout tests still pass: every spot reachable from the entrance, and walking only through doors?
- Does it still look right in all five themes and at a narrow window?

## Animation (if it moves)

- Contact frames exist (feet or paws on the ground).
- Body bob is 2 pixels at most; head and tail follow one frame late.
- Watch at least 3 loops: the last frame leads smoothly back to the first, and nothing flickers.
