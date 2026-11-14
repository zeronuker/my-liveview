// The garden in the angled view: what lies on the ground (the pond, its bank, the front path, the flower
// beds, grass tufts and flowers) as 16 by 8 tiles, and what stands up (trees, bushes, rocks, the fence).
// The standing art is the flat view's own upright pictures (art/garden.js); the plan is garden.js.
// Drawn like iso-art.js: on a canvas context at (px, py), the left and top of the tile's diamond.
import { HEADS, bushOps, rockOps, treeOps } from './art/garden.js'
import { buildGarden, inPond, treeSize } from './garden.js'
import { block, cellHash, diamond, rect } from './iso-art.js'
import { railing } from './iso-furniture.js'
import { rotateGarden } from './iso-rotate.js'
import { shade } from './palette.js'

const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

// One tile of the garden's ground, if it is part of one: the front path, a flower bed, the pond or its stone bank.
// Frame 0 or 1: the ripples slide and the pads bob, so two frames shown in turn make the water move. False if the
// tile is plain grass.
export const gardenTile = (c, garden, px, py, x, y, frame) => {
  const h = cellHash(x, y)
  if (inRect(garden.path, x, y)) {
    diamond(c, px, py, shade('stone', (x + y) % 2 ? 1 : 2))
    return true
  }
  const bed = garden.beds.some(b => inRect(b, x, y))
  if (bed) {
    diamond(c, px, py, shade('wood', 0))
    for (let i = 0; i < 2; i++) {
      const n = cellHash(x + i * 13, y + i * 7)
      rect(c, px + 4 + (n % 7), py + 2 + ((n >>> 4) % 3), 2, 2, HEADS[(n >>> 9) % HEADS.length])
      rect(c, px + 4 + (n % 7), py + 4 + ((n >>> 4) % 3), 1, 1, shade('leaf', 2))
    }
    return true
  }
  if (inPond(garden, x, y)) {
    diamond(c, px, py, inPond(garden, x, y, 0.55) ? shade('glass', 0) : shade('glass', (x + y) % 2 ? 1 : 2))
    if (h % 3 === 0) rect(c, px + 5 + (frame ? 2 : 0), py + 3 + ((h >>> 4) % 2), 4, 1, shade('glass', 3))
    if (h % 11 === 0) {
      const bob = frame && (h >>> 3) % 2 ? 1 : 0
      rect(c, px + 6, py + 3 + bob, 4, 2, shade('leaf', 1))
      rect(c, px + 7, py + 3 + bob, 2, 1, shade('leaf', 2))
      if (h % 2 === 0) rect(c, px + 7, py + 2 + bob, 2, 1, shade('plaster', 3))
    }
    return true
  }
  if (inPond(garden, x, y, 1.2)) {
    diamond(c, px, py, shade('stone', (x + y) % 2 ? 2 : 3))
    return true
  }
  return false
}

// a tuft on some tiles of grass, and now and then a flower
export const grassDetail = (c, px, py, x, y) => {
  const h = cellHash(x, y)
  if (h % 3 === 0) {
    rect(c, px + 4 + ((h >>> 4) % 8), py + 3 + ((h >>> 8) % 2), 1, 1, shade('grass', 3))
    rect(c, px + 5 + ((h >>> 12) % 6), py + 3 + ((h >>> 16) % 2), 1, 1, shade('grass', 1))
  }
  if ((h >>> 20) % 12 === 0) {
    rect(c, px + 6 + ((h >>> 3) % 4), py + 2, 2, 2, HEADS[(h >>> 14) % HEADS.length])
    rect(c, px + 6 + ((h >>> 3) % 4), py + 4, 1, 1, shade('leaf', 1))
  }
}

// The garden of a plan, as this view draws it, turned with the plan: the fence is a rectangle with a gap (where the front path goes
// through) and a post on each side of the gap; every tree, bush and rock also remembers its place in the plan as it is (`ox`, `oy`),
// so what varies from one to the next stays the same whichever way the view is turned.
export const isoGarden = layout => {
  const original = layout.original ?? layout
  const garden = buildGarden(original)
  const { x0, y0, x1, y1, gate } = garden.fence
  const flat = {
    ...garden,
    fence: { rect: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, gap: { x: gate.x, y: y1, w: gate.w, h: 1 }, pillars: [{ x: gate.x - 1, y: y1 }, { x: gate.x + gate.w, y: y1 }] },
  }
  return rotateGarden(flat, layout.rotation ?? 0, original.width, original.height)
}

// is this tile on the fence round the plot (which has a gap where the front path goes through)?
export const isFence = ({ fence: { rect: r, gap } }, x, y) => inRect(r, x, y) && (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1) && !inRect(gap, x, y)

// a bit of fence: posts with two rails between them along the run of the fence; a stone post on each side of the gap
export const fenceTile = (c, garden, px, py, x, y) => {
  const { rect: r, pillars } = garden.fence
  if (pillars.some(post => post.x === x && post.y === y)) return block(c, px, py, 10, 'stone')
  const alongX = y === r.y || y === r.y + r.h - 1 // the top and bottom run east to west, the sides north to south
  railing('wood', 7)(c, px, py, alongX ? { w: 2, h: 1 } : { w: 1, h: 2 })
}

// Where the base of each picture is, in its own pixels: the foot of a tree, bush or rock.
const FEET = { tree: [26, 45], bigTree: [43, 75], small: [9, 13] }

// The trees, bushes and rocks as upright pictures: { x, y } the tile they stand on, the ops, the picture's size and
// where its foot is in it. A tree stands on its trunk's tile.
export const gardenPieces = garden => [
  ...garden.trees.map(t => {
    const size = treeSize(t) * 16
    return { x: t.x, y: t.y, ops: treeOps({ ...t, x: t.ox, y: t.oy }), w: size, h: size, foot: t.kind.startsWith('big') ? FEET.bigTree : FEET.tree }
  }),
  ...garden.bushes.map(b => ({ x: b.x, y: b.y, ops: bushOps({ x: b.ox, y: b.oy }), w: 16, h: 16, foot: FEET.small })),
  ...garden.rocks.map(k => ({ x: k.x, y: k.y, ops: rockOps(), w: 16, h: 16, foot: FEET.small })),
]
