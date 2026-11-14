// The geometry of the angled view: where a place on the plan is on the screen. The plan's x runs
// down to the right and its y down to the left, so a tile is a diamond `tile` wide and half as
// tall. Plain data in, plain data out, so it can be tested.

export const ISO_RISE = 1 // tiles of room above the plan, for tall walls
const SLAB = 0.4 // tiles of room under it, for the brick edge

// the size of the whole plan in tiles, for fit(), zoomAt() and keepInView() of layout.js
export const isoExtent = layout => ({
  width: (layout.width + layout.height) / 2,
  height: (layout.width + layout.height) / 4 + ISO_RISE + SLAB,
})

// Where the point (x, y) of the plan, in tiles (a tile's middle is at x + 0.5, y + 0.5), is on the
// screen, from a view { tile, left, top }. With `angled` off the plan is flat.
export const screenAt = (view, layout, x, y, angled) =>
  angled
    ? { x: view.left + ((x - y + layout.height) * view.tile) / 2, y: view.top + ((x + y) * view.tile) / 4 + ISO_RISE * view.tile }
    : { x: view.left + x * view.tile, y: view.top + y * view.tile }
