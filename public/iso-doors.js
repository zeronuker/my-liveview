// Doors in the angled view. A door is a gap in a wall; here it gets what makes it a door: a leaf standing open (swing),
// two leaves (double), glass panels with a blinking sensor (sliding), stone posts and a lintel (arch), and a strip on the
// floor. `door` is { kind, x, i, j, w, h, axis, wall }: the door's column, the tile's place in the opening, which way the wall
// runs ('x' or 'y') and how tall the wall beside it stands. Drawn like iso-art.js, on a canvas context at (px, py) of the tile's box.
import { bottomEdge, diamond, edgeY, rect, slab } from './iso-draw.js'
import { shade } from './palette.js'

// the edges at the two ends of an opening (along the wall), and the one in the wall's plane on the viewer's side
const ENDS = { x: ['ul', 'lr'], y: ['ur', 'll'] }
const FACE = { x: 'll', y: 'lr' }

// what a leaf or panel stands: as tall as the wall, but not lower than a person's shoulder
const stand = door => Math.max(8, door.wall)

// a wooden leaf standing open at a jamb, with a handle
const leaf = (c, px, py, door, side) => {
  const h = stand(door)
  slab(c, px, py, 0, side, h, shade('wood', 2), shade('wood', 3))
  const col = side === 'ur' || side === 'lr' ? 12 : 6
  rect(c, px + col, py + edgeY(side, col) - h + 4, 1, 1, shade('metal', 3))
}

// a lintel over the opening, if the wall is tall enough to have one: the top of the wall, with the opening under it
const lintel = (c, px, py, door) => {
  if (door.wall < 16) return
  for (let col = 0; col < 8; col++) {
    rect(c, px + col, py - door.wall + bottomEdge(col), 1, 5, shade('plaster', 2))
    rect(c, px + 15 - col, py - door.wall + bottomEdge(col), 1, 5, shade('plaster', 1))
  }
  diamond(c, px, py - door.wall, shade('wallcap', 2))
}

const SENSOR = 'slow' // the sensor over a sliding door blinks like the flat view's

const KINDS = {
  // the leaf is hinged at the far end for doors on an odd column, as the flat view mirrors it (the plan has no swing side)
  swing: (c, px, py, door, { first, last }) => {
    const mirrored = door.x % 2 === 1
    if (mirrored ? last : first) leaf(c, px, py, door, ENDS[door.axis][mirrored ? 1 : 0])
  },
  double: (c, px, py, door, { first, last }) => {
    if (first) leaf(c, px, py, door, ENDS[door.axis][0])
    if (last) leaf(c, px, py, door, ENDS[door.axis][1])
  },
  sliding: (c, px, py, door, { first, last }) => {
    if (!first && !last) return // half open: a panel at each end, the middle clear
    const h = stand(door)
    slab(c, px, py, 0, FACE[door.axis], h, shade('glass', 2), shade('glass', 3))
    if (first) {
      const col = door.axis === 'x' ? 4 : 10
      rect(c, px + col - 1, py + edgeY(FACE[door.axis], col) - h - 2, 4, 2, shade('metal', 1)) // the sensor's box
    }
  },
  arch: (c, px, py, door, { first, last }) => {
    for (const [at, side] of [[first, ENDS[door.axis][0]], [last, ENDS[door.axis][1]]]) if (at) slab(c, px, py, 0, side, stand(door), shade('stone', 2), shade('stone', 3))
  },
}

// One tile of a door
export const doorTile = (c, px, py, door) => {
  const along = door.axis === 'x' ? [door.i, door.w] : [door.j, door.h]
  if (door.kind !== 'arch') [4, 8, 8, 4].forEach((w, j) => rect(c, px + 8 - w / 2, py + 2 + j, w, 1, shade('metal', 1))) // the strip on the floor
  KINDS[door.kind]?.(c, px, py, door, { first: along[0] === 0, last: along[0] === along[1] - 1 })
  lintel(c, px, py, door)
}

// The sensor's light over a sliding door: { dx, dy, w, h, pattern, on, off } from the tile's box, on its first tile only.
export const doorLights = door => {
  if (door.kind !== 'sliding' || (door.axis === 'x' ? door.i : door.j) !== 0) return []
  const col = door.axis === 'x' ? 4 : 10
  return [{ dx: col, dy: edgeY(FACE[door.axis], col) - stand(door) - 3, w: 1, h: 1, pattern: SENSOR, on: shade('light', 3), off: shade('brick', 2) }]
}
