// The geometry of the angled view: where a place on the plan is on the screen. The plan's x runs
// down to the right and its y down to the left, so a tile is a diamond `tile` wide and half as
// tall. Plain data in, plain data out, so it can be tested.

import { levelAt } from './studio.js'

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

// ---- the upper storey ----
// The first floor (the CEO suite) stands one storey above the ground, on a podium, and a staircase rises to it.

export const STOREY = 24 // pixels, at 16 to a tile; a wall at the back stands 16

// the staircase that rises to the first floor: a stairs room whose high end (north) meets a first-floor tile; null if none
export const risingStairs = layout =>
  layout.rooms.find(room => room.level === 'stairs' && room.high === 'north' && levelAt(layout, room.x, room.y - 1) === 'first') ?? null

// how high the step on a stairs tile (x, y) stands, in pixels: the top tile of the stairs is a full storey up, the bottom one a sixth of it
export const stepHeight = (room, y) => (STOREY * (room.y + room.h - y)) / room.h

// How high someone standing at tile (x, y) of the plan is raised, in pixels (x and y may be between tiles): a storey on the
// first floor, nothing on the ground floor, and a smooth climb up the stairs.
export const liftAt = (layout, x, y) => {
  const stairs = risingStairs(layout)
  const [cx, cy] = [Math.round(x), Math.round(y)]
  if (levelAt(layout, cx, cy) === 'first') return STOREY
  if (stairs && cx >= stairs.x && cx < stairs.x + stairs.w && y >= stairs.y - 0.5 && y <= stairs.y + stairs.h) return Math.min(STOREY, Math.max(0, stepHeight(stairs, y)))
  return 0
}
