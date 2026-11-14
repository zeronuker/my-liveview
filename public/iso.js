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

// ---- the levels ----
// The first floor (the CEO suite) stands one storey above the ground and the mezzanine (the lobby, the open office and the
// entrance) a third of that. They stand on podiums, and the staircases take their two heights from the levels they join.

export const STOREY = 24 // pixels, at 16 to a tile; a wall at the back stands 16
export const MEZZANINE = 8 // lower than half a storey: a platform hides the ground behind it, up to four pixels for each tile it is high

const LEVEL_HEIGHT = { first: STOREY, mezzanine: MEZZANINE } // every other level is on the ground

// how high a level's floor stands
export const levelHeight = level => LEVEL_HEIGHT[level] ?? 0

const cache = new WeakMap()
const geometry = layout => {
  if (!cache.has(layout)) {
    // each staircase: its high end and the heights of the floors at its two ends
    const stairs = layout.rooms
      .filter(room => room.level === 'stairs')
      .map(room => {
        const middle = room.x + (room.w >> 1)
        const [above, below] = [levelHeight(levelAt(layout, middle, room.y - 1)), levelHeight(levelAt(layout, middle, room.y + room.h))]
        const [zHigh, zLow] = room.high === 'north' ? [above, below] : [below, above]
        return { room, high: room.high, zLow, zHigh }
      })
    // the front doors of the mezzanine: the floor outside is lower, so there are two steps down, the door's row and two more
    const entrances = layout.doors
      .filter(door => door.level === 'mezzanine' && levelAt(layout, door.x, door.y + door.h) === 'outside')
      .map(door => ({ x: door.x, w: door.w, y: door.y, z: MEZZANINE }))
    cache.set(layout, { stairs, entrances })
  }
  return cache.get(layout)
}

// the staircases, and the steps down outside the entrance, of a plan
export const stairsOf = layout => geometry(layout).stairs
export const entrancesOf = layout => geometry(layout).entrances

// how high the step on row y of a staircase stands, in pixels: the top row is at the height of the floor it reaches, the one
// before the bottom a step above the floor it leaves
export const stepHeight = ({ room, high, zLow, zHigh }, y) => zLow + ((zHigh - zLow) * (high === 'north' ? room.y + room.h - y : y - room.y + 1)) / room.h

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

// How high someone standing at tile (x, y) of the plan is raised, in pixels (x and y may be between tiles): the height of the
// floor of their level, a smooth climb on the stairs, and a smooth way down the steps outside the entrance.
export const liftAt = (layout, x, y) => {
  const { stairs, entrances } = geometry(layout)
  const [cx, cy] = [Math.round(x), Math.round(y)]
  for (const e of entrances) if (cx >= e.x && cx < e.x + e.w && y >= e.y && y <= e.y + 2) return e.z * clamp((e.y + 2 - y) / 2, 0, 1)
  const level = levelAt(layout, cx, cy)
  if (level === 'first' || level === 'mezzanine') return levelHeight(level)
  const stair = stairs.find(({ room }) => cx >= room.x && cx < room.x + room.w && y >= room.y - 0.5 && y <= room.y + room.h)
  return stair ? clamp(stepHeight(stair, y), Math.min(stair.zLow, stair.zHigh), Math.max(stair.zLow, stair.zHigh)) : 0
}
