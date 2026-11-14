// The garden's art: the pond (with its lily pads and reeds), trees, bushes, rocks, flower beds, the fence and
// its gate, the end of the front path, and the flowers scattered on the grass. Rectangles
// ['r', x, y, w, h, colour] in pixels, palette colours only, light from the top-left. `gardenLowOps` is
// what lies on the ground (under the building's shell); `gardenHighOps` is what stands up (over it).
import { RAMPS } from '../palette.js'
import { treeSize } from '../garden.js'
import { ellipseOps, hash, ringOps } from '../pixel.js'
import { floorTileOps } from './shell.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const moved = (ops, dx, dy) => ops.map(([kind, x, y, w, h, color]) => [kind, x + dx, y + dy, w, h, color])
const [wood, stone, leaf, grass, glass, brick, light, plaster, periwinkle, lilac, terracotta] = [
  RAMPS.wood, RAMPS.stone, RAMPS.leaf, RAMPS.grass, RAMPS.glass, RAMPS.brick, RAMPS.light, RAMPS.plaster, RAMPS.periwinkle, RAMPS.lilac, RAMPS.terracotta,
]
export const HEADS = [brick[2], light[2], periwinkle[2], lilac[3], plaster[3], terracotta[2]]

// a flower on a tile of grass, chosen by a number from the tile's place: a head of three by three with a bright middle, and a stem
export const flowerOps = h => {
  const [x, y] = [1 + ((h >>> 4) % 11), (h >>> 9) % 9]
  return [r(x, y, 3, 3, HEADS[(h >>> 14) % HEADS.length]), r(x + 1, y + 1, 1, 1, light[3]), r(x + 1, y + 3, 1, 2, leaf[1])]
}

// ---- standing things, each in its own box of pixels ----

// A round tree: a shadow, a trunk and a crown of leaf clusters, light from the top left. Drawn in a box of 3 tiles by 3 and,
// with `k` of 5/3, a big one in a box of 5 by 5 (every measure scaled).
const roundTreeOps = ({ x, y }, tint, k = 1) => {
  const S = n => Math.max(1, Math.round(n * k))
  const ops = [...ellipseOps(S(26), S(45), S(15), S(3), grass[0]), r(S(19), S(43), S(10), S(2), wood[0]), r(S(21), S(30), S(6), S(14), wood[1]), r(S(21), S(30), S(2), S(14), wood[2]), r(S(26), S(31), S(1), S(13), wood[0])]
  ops.push(...ellipseOps(S(24), S(19), S(22), S(17), tint[0]), ...ellipseOps(S(24), S(19), S(21), S(16), tint[1]), ...ellipseOps(S(22), S(17), S(17), S(12), tint[2]), ...ellipseOps(S(16), S(11), S(8), S(5), tint[3]))
  for (let i = 0; i < Math.round(12 * k * k); i++) {
    const h = hash(x * 7 + i, y * 3 + i * 5)
    const [px, py] = [S(7) + (h % S(32)), S(7) + ((h >>> 6) % S(24))]
    if (((px - S(24)) / S(19)) ** 2 + ((py - S(19)) / S(14)) ** 2 > 0.8) continue
    ops.push(r(px, py, S(4), S(2), tint[1]), r(px, py, S(4), 1, tint[3]))
  }
  return ops
}

// A pine: three tiers of needles, widest at the bottom, on a short trunk. The same boxes and scale as the round tree.
const pineOps = (_, k = 1) => {
  const S = n => Math.max(1, Math.round(n * k))
  const ops = [...ellipseOps(S(26), S(45), S(14), S(3), grass[0]), r(S(22), S(37), S(4), S(8), wood[1]), r(S(22), S(37), S(1), S(8), wood[2]), r(S(25), S(38), S(1), S(7), wood[0])]
  const rows = S(15)
  for (const tier of [2, 1, 0]) {
    const top = S(2 + tier * 11)
    for (let i = 0; i < rows; i++) {
      const half = Math.floor((S(2) + Math.round((i / (rows - 1)) * (S(14) + tier * S(4)))) / 2)
      ops.push(r(S(24) - half, top + i, half * 2, 1, i === rows - 1 ? leaf[0] : leaf[1]))
      ops.push(r(S(24) - half, top + i, Math.min(S(2), half), 1, leaf[2]), r(S(24) + half - Math.min(S(2), half), top + i, Math.min(S(2), half), 1, leaf[0]))
    }
    ops.push(r(S(21), top + S(3), S(3), 1, leaf[3]))
  }
  return ops
}

const BIG = 5 / 3 // a big tree is this much bigger than a small one
// the picture of a tree, by its kind
export const treeOps = tree => {
  const tint = hash(tree.x, tree.y) % 2 ? leaf : grass
  switch (tree.kind) {
    case 'pine': return pineOps(tree)
    case 'bigpine': return pineOps(tree, BIG)
    case 'biground': return roundTreeOps(tree, tint, BIG)
    default: return roundTreeOps(tree, tint)
  }
}

// a bush, one tile
export const bushOps = ({ x, y }) => {
  const tint = hash(x, y) % 2 === 0 ? leaf : grass
  return [...ellipseOps(9, 13, 6, 2, grass[0]), ...ellipseOps(8, 9, 7, 5, tint[0]), ...ellipseOps(8, 9, 6, 4, tint[1]), ...ellipseOps(7, 8, 4, 3, tint[2]), r(4, 6, 3, 1, tint[3]), r(9, 8, 2, 1, tint[3])]
}

// a rock, one tile
export const rockOps = () => [...ellipseOps(9, 13, 6, 2, grass[0]), ...ellipseOps(8, 11, 6, 4, stone[1]), ...ellipseOps(7.5, 10.5, 5, 3, stone[2]), r(5, 9, 3, 1, stone[3])]

// a flower bed of w by h tiles: dark soil with a stone edge and a few flowers to a tile
const bedOps = ({ x, y, w, h }) => {
  const [W, H] = [w * TILE, h * TILE]
  const ops = [r(0, 0, W, H, wood[0]), r(0, 0, W, 1, stone[2]), r(0, H - 1, W, 1, stone[1]), r(0, 0, 1, H, stone[2]), r(W - 1, 0, 1, H, stone[1])]
  for (let cy = 0; cy < h; cy++)
    for (let cx = 0; cx < w; cx++)
      for (let i = 0; i < 4; i++) {
        const n = hash(x + cx + i * 13, y + cy + i * 7)
        const [fx, fy] = [cx * TILE + 2 + (n % 10), cy * TILE + 1 + ((n >>> 4) % 7)]
        ops.push(r(fx - 1, fy + 4, 2, 1, leaf[2]), r(fx + 1, fy + 3, 1, 3, leaf[1]), r(fx, fy, 3, 3, HEADS[(n >>> 9) % HEADS.length]), r(fx + 1, fy + 1, 1, 1, light[3]))
      }
  return ops
}

// ---- the fence ----

// a tile of fence along the top or bottom: pickets with two rails behind them
const fenceAcross = () => {
  const ops = [r(0, 6, 16, 2, wood[1]), r(0, 11, 16, 2, wood[1])]
  for (const px of [0, 4, 8, 12]) ops.push(r(px, 3, 3, 12, wood[2]), r(px, 3, 1, 12, wood[3]), r(px + 2, 4, 1, 11, wood[1]), r(px + 1, 2, 1, 1, wood[2]))
  return [...ops, r(0, 15, 16, 1, wood[0])]
}

// a tile of fence down an edge, seen from the side: a post with two rails across
const fenceDown = () => [r(6, 0, 4, 16, wood[1]), r(6, 0, 2, 16, wood[2]), r(9, 0, 1, 16, wood[0]), r(4, 3, 8, 2, wood[2]), r(4, 10, 8, 2, wood[2])]

// a stone gatepost, one tile
const pillarOps = () => [r(2, 0, 12, 3, stone[3]), r(2, 2, 12, 1, stone[1]), r(3, 3, 10, 13, stone[2]), r(3, 3, 2, 13, stone[3]), r(11, 3, 2, 13, stone[1]), r(3, 15, 10, 1, stone[0])]

// the fence round the plot, with a gap and two gateposts where the front path ends
const fenceOps = ({ x0, y0, x1, y1, gate }) => {
  const ops = []
  const put = (tx, ty, tile) => ops.push(...moved(tile, tx * TILE, ty * TILE))
  const [across, down, pillar] = [fenceAcross(), fenceDown(), pillarOps()]
  for (let x = x0; x <= x1; x++) {
    put(x, y0, across)
    if (x >= gate.x && x < gate.x + gate.w) continue
    put(x, y1, x === gate.x - 1 || x === gate.x + gate.w ? pillar : across)
  }
  for (let y = y0 + 1; y < y1; y++) put(x0, y, down), put(x1, y, down)
  return ops
}

// ---- on the ground ----

// the pond, in plan pixels: a stone bank, shallows and deep water, ripples, lily pads and reeds. Frame 0 or 1: the
// ripples slide and the pads bob, so two frames shown in turn make it move.
export const pondOps = ({ pond }, frame = 0) => {
  const [px, py, rx, ry] = [pond.cx * TILE, pond.cy * TILE, pond.rx * TILE, pond.ry * TILE]
  const ops = [
    ...ellipseOps(px, py + 1, rx + 7, ry + 5, stone[1]), ...ellipseOps(px, py, rx + 5, ry + 4, stone[2]), ...ringOps(px, py, rx + 3, ry + 2, 48, stone[3], 3), // the bank
    ...ellipseOps(px, py, rx, ry, glass[1]), ...ellipseOps(px - 2, py - 2, rx - 6, ry - 5, glass[2]), ...ellipseOps(px + 6, py + 4, rx - 40, ry - 30, glass[0]), // water, shallow and deep
  ]
  for (let i = 0; i < 30; i++) {
    const h = hash(i * 31 + 5, 99)
    const [angle, d] = [((h % 360) * Math.PI) / 180, 0.2 + ((h >>> 9) % 60) / 100]
    const [x, y] = [Math.round(px + Math.cos(angle) * rx * d) + (frame ? 4 : 0), Math.round(py + Math.sin(angle) * ry * d)]
    ops.push(r(x, y, 5, 1, glass[3]), r(x + 2, y + 2, 4, 1, glass[0]))
  }
  ;[[2.5, 3.2], [-3.5, 4], [6, 1.8], [7.5, -0.4], [-6, 3], [0.5, 5]].forEach(([dx, dy], i) => {
    const [x, y] = [Math.round(px + dx * TILE), Math.round(py + dy * TILE) + (frame && i % 2 ? 1 : 0)]
    ops.push(...ellipseOps(x, y, 6, 3, leaf[1]), ...ellipseOps(x, y, 5, 2, leaf[2]), r(x - 5, y - 1, 3, 1, glass[1]))
    if (i % 2 === 0) ops.push(r(x - 1, y - 2, 3, 2, plaster[3]), r(x, y - 2, 1, 1, light[2]))
  })
  for (const degrees of [75, 110, 150]) {
    const [x, y] = [Math.round(px + Math.cos((degrees * Math.PI) / 180) * (rx + 3)), Math.round(py + Math.sin((degrees * Math.PI) / 180) * (ry + 3))]
    ops.push(r(x, y - 10, 1, 10, leaf[1]), r(x + 2, y - 12, 1, 12, leaf[2]), r(x - 2, y - 7, 1, 7, leaf[1]), r(x + 1, y - 14, 2, 4, brick[1]), r(x - 3, y - 9, 2, 3, brick[1]))
  }
  return ops
}

// what lies on the ground: the pond (in frame 0 or 1), the shadow and posts of the terrace that floats over it, the
// end of the front path and the flower beds. Plan pixels, drawn under the shell.
export const gardenLowOps = (garden, frame = 0) => {
  const ops = [...pondOps(garden, frame)]
  ops.push(r(31 * TILE, 48 * TILE, 10 * TILE, 5, glass[0]))
  for (const x of [31, 35, 39]) ops.push(r(x * TILE + 6, 48 * TILE, 4, 7, wood[0]), r(x * TILE + 6, 48 * TILE, 1, 7, wood[1]))
  const { path } = garden
  for (let y = path.y; y < path.y + path.h; y++) for (let x = path.x; x < path.x + path.w; x++) ops.push(...moved(floorTileOps('path', x, y), x * TILE, y * TILE))
  for (const bed of garden.beds) ops.push(...moved(bedOps(bed), bed.x * TILE, bed.y * TILE))
  return ops
}

// what stands up: trees, bushes and rocks from the back of the plan to the front, then the fence. Plan pixels, drawn
// over the shell.
export const gardenHighOps = garden => {
  const standing = [
    ...garden.trees.map(t => ({ key: t.y, ops: moved(treeOps(t), (t.x - (treeSize(t) - 1) / 2) * TILE, (t.y - (treeSize(t) - 1)) * TILE) })),
    ...garden.bushes.map(b => ({ key: b.y, ops: moved(bushOps(b), b.x * TILE, b.y * TILE) })),
    ...garden.rocks.map(k => ({ key: k.y, ops: moved(rockOps(), k.x * TILE, k.y * TILE) })),
  ]
  return [...standing.sort((a, b) => a.key - b.key).flatMap(s => s.ops), ...fenceOps(garden.fence)]
}

// every kind of piece, for the tests to look at one at a time: its ops and the size of its box in pixels
export const gardenParts = {
  roundTree: { ops: roundTreeOps({ x: 2, y: 5 }, leaf), w: 3 * TILE, h: 3 * TILE },
  lightTree: { ops: roundTreeOps({ x: 2, y: 5 }, grass), w: 3 * TILE, h: 3 * TILE },
  pine: { ops: pineOps(), w: 3 * TILE, h: 3 * TILE },
  bigRoundTree: { ops: roundTreeOps({ x: 2, y: 5 }, leaf, BIG), w: 5 * TILE, h: 5 * TILE },
  bigPine: { ops: pineOps({}, BIG), w: 5 * TILE, h: 5 * TILE },
  bush: { ops: bushOps({ x: 6, y: 41 }), w: TILE, h: TILE },
  rock: { ops: rockOps(), w: TILE, h: TILE },
  bed: { ops: bedOps({ x: 26, y: 42, w: 4, h: 2 }), w: 4 * TILE, h: 2 * TILE },
  fence: { ops: [...fenceAcross(), ...moved(fenceDown(), 0, 0)], w: TILE, h: TILE },
  pillar: { ops: pillarOps(), w: TILE, h: TILE },
}
