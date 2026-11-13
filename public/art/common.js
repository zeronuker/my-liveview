// Art that more than one room uses: sofas and armchairs, plants, and the things lying on the floor
// (rugs, mats and pools of light). Rectangles ['r', x, y, w, h, colour] in pixels, palette colours
// only, light from the top-left.
import { RAMPS } from '../palette.js'
import { ellipseOps, glowOps, gridOps, hash, ringOps } from '../pixel.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const moved = (ops, dx, dy) => ops.map(([kind, x, y, w, h, color]) => [kind, x + dx, y + dy, w, h, color])

// A sofa `len` cells long, drawn as if it faced down (towards you): its backrest on top, the seat in
// front in one cushion to a cell, and one of three kinds of arm at each end (`style`: 0 rolled and wide, 1 slim,
// 2 none, a modern sofa) and a pillow or two in the `accent` colours. 16 pixels deep.
const sofaFacingDown = (len, f, style = 0, accent) => {
  const L = len * TILE
  const arm = [3, 2, 1][style]
  const ops = [
    r(1, 0, L - 2, 4, f[2]), r(1, 0, L - 2, 1, f[3]), r(1, 4, L - 2, 1, f[1]), // the backrest
    r(1, 12, L - 2, 3, f[1]), r(1, 15, L - 2, 1, f[0]), // the front
  ]
  if (style === 0) ops.push(r(0, 2, 3, 13, f[1]), r(0, 2, 3, 1, f[3]), r(0, 3, 1, 11, f[2]), r(L - 3, 2, 3, 13, f[1]), r(L - 3, 2, 3, 1, f[3]), r(L - 1, 3, 1, 12, f[0])) // rolled arms, the left lit and the right in shadow
  else if (style === 1) ops.push(r(0, 3, 2, 12, f[1]), r(0, 3, 2, 1, f[3]), r(L - 2, 3, 2, 12, f[1]), r(L - 1, 4, 1, 11, f[0])) // slim arms
  else ops.push(r(1, 15, 2, 1, f[0]), r(L - 3, 15, 2, 1, f[0])) // no arms: just feet
  for (let i = 0; i < len; i++) {
    const start = i === 0 ? arm : i * TILE
    const end = i === len - 1 ? L - arm : (i + 1) * TILE
    ops.push(r(start, 5, end - start, 7, f[2]), r(start, 5, end - start, 1, f[3]))
    if (i > 0) ops.push(r(start, 5, 1, 7, f[1])) // the gap between two cushions
  }
  if (accent) {
    const pillows = len > 1 ? [arm + 1, L - arm - 6] : [5]
    for (const x of pillows) ops.push(r(x, 6, 5, 5, accent[2]), r(x, 6, 5, 1, accent[3]), r(x + 4, 7, 1, 4, accent[1])) // a pillow, lit on top
  }
  return ops
}

// the same, turned to face another way: up, left or right
const faced = (face, [kind, x, y, w, h, color]) => {
  if (face === 'up') return [kind, x, TILE - y - h, w, h, color]
  if (face === 'right') return [kind, y, x, h, w, color]
  if (face === 'left') return [kind, TILE - y - h, x, h, w, color]
  return [kind, x, y, w, h, color]
}

// An office chair, as if facing down: its backrest on top, the seat, and a base on wheels.
const chairFacingDown = f => [
  r(3, 1, 10, 4, f[1]), r(3, 1, 10, 1, f[2]), r(3, 4, 10, 1, f[0]), // the backrest
  r(2, 6, 1, 5, f[0]), r(13, 6, 1, 5, f[0]), // the arms
  r(3, 5, 10, 7, f[1]), r(3, 5, 10, 1, f[2]), r(3, 11, 10, 1, f[0]), // the seat
  r(7, 12, 2, 2, f[0]), r(3, 14, 10, 1, f[0]), r(3, 15, 1, 1, f[1]), r(12, 15, 1, 1, f[1]), // the column, the base, the wheels
]

// a sofa or armchair in the colour of its `tone` if it has one (the CEO suite's is leather)
const ACCENTS = [RAMPS.brick, RAMPS.light, RAMPS.periwinkle, RAMPS.leaf, RAMPS.plaster, RAMPS.fabricCool]
const seatOps = (item, material) => {
  const [style, accent] = [hash(item.x, item.y) % 3, ACCENTS[hash(item.y, item.x) % ACCENTS.length]]
  const len = item.face === 'left' || item.face === 'right' ? item.h : item.w
  return sofaFacingDown(len, RAMPS[item.tone ?? material], style, accent === RAMPS[item.tone ?? material] ? RAMPS.plaster : accent).map(op => faced(item.face ?? 'down', op))
}

const PLANT = [
  '......oo..oo....',
  '.....ogdooglo...',
  '...oogllgdglgoo.',
  '..ogllggdgdggdo.',
  '.oglggdoggdggddo',
  '.ogggdodggldgddo',
  '..odgdgodggddddo',
  '..oddggodgdddoo.',
  '...oddgoodddoo..',
  '....oodddoooo...',
  '.....oodoo......',
  '....ORRRRRRO....',
  '....OppppppqO...',
  '.....OpppppqO...',
  '.....OppppqqO...',
  '......OqqqqO....',
]

// Six kinds of plant, chosen by where one stands, each in its own pot or planter: a bushy plant, a fern, a palm, a
// snake plant, a rubber plant and a cactus. Each is drawn in the leaf colours, with a dark outline.
const [leafO, leafD, leafG, leafL] = RAMPS.leaf

// a pot of 16 pixels wide, its top edge at y = 11 (or 12 for a wide, low planter box)
const potOps = (pot, wide) => {
  const [O, q, p, R] = pot
  return wide
    ? gridOps(['..ORRRRRRRRRRO..', '..OppppppppppqO.', '..OppppppppppqO.', '...OqqqqqqqqO...'], { O, q, p, R }, 0, 12)
    : gridOps(PLANT.slice(11), { O, q, p, R }, 0, 11)
}

// round blobs of leaf, each with an outline: all the outlines first, so a blob does not cover its neighbour's fill
const blobs = points => [
  ...points.map(([x, y, size = 2]) => r(x - 1, y - 1, size + 2, size + 2, leafO)),
  ...points.map(([x, y, size = 2, color = leafG]) => r(x, y, size, size, color)),
  ...points.filter(([, , , color]) => color === leafG || !color).map(([x, y]) => r(x, y, 1, 1, leafL)),
]

// fronds that rise from (cx, cy) at each angle (degrees), reach out `length` and droop `droop` by the tip
const fronds = (cx, cy, angles, length, droop) =>
  blobs(
    angles.flatMap(angle =>
      Array.from({ length: 5 }, (_, i) => {
        const t = (i + 1) / 5
        const [x, y] = [cx + Math.cos((angle * Math.PI) / 180) * t * length, cy - Math.sin((angle * Math.PI) / 180) * t * length + t * t * droop]
        return [Math.max(1, Math.min(13, Math.round(x))), Math.max(1, Math.min(9, Math.round(y))), 2, i === 4 ? leafL : i < 2 ? leafD : leafG]
      }),
    ),
  )

const PLANTS = [
  { pot: RAMPS.brick, foliage: () => gridOps(PLANT.slice(0, 11), { o: leafO, d: leafD, g: leafG, l: leafL }) }, // bushy
  { pot: RAMPS.plaster, foliage: () => fronds(8, 10, [165, 135, 105, 75, 45, 15], 7, 4) }, // a fern in a white pot
  { pot: RAMPS.metal, foliage: () => [r(7, 5, 2, 6, RAMPS.wood[2]), r(7, 5, 1, 6, RAMPS.wood[3]), r(8, 7, 1, 1, RAMPS.wood[1]), r(8, 9, 1, 1, RAMPS.wood[1]), ...fronds(8, 5, [170, 140, 110, 70, 40, 10], 7, 5)] }, // a palm in a grey pot
  { pot: RAMPS.wood, wide: true, foliage: () => [3, 5, 7, 9, 11].flatMap((x, i) => { const h = [6, 9, 10, 8, 6][i]; return [r(x - 1, 11 - h - 1, 4, h + 2, leafO), r(x, 11 - h, 2, h, leafD), r(x, 11 - h, 1, h, leafG), r(x, 11 - h, 2, 1, leafL)] }) }, // a snake plant in a wooden planter
  { pot: RAMPS.terracotta, foliage: () => [r(7, 3, 2, 8, RAMPS.wood[1]), ...blobs([[3, 4, 4], [10, 3, 4], [6, 1, 4], [2, 7, 3], [11, 7, 3]].map(([x, y, s]) => [x, y, s, leafD])), r(4, 5, 1, 1, leafL), r(11, 4, 1, 1, leafL), r(7, 2, 1, 1, leafL)] }, // a rubber plant in a terracotta pot
  {
    pot: RAMPS.slate,
    foliage: () => [r(5, 1, 6, 10, leafO), r(6, 2, 4, 9, leafG), r(7, 2, 1, 9, leafL), r(2, 4, 4, 5, leafO), r(3, 5, 2, 3, leafG), r(10, 5, 4, 5, leafO), r(11, 6, 2, 3, leafG), r(7, 0, 2, 2, RAMPS.brick[2]), r(7, 0, 1, 1, RAMPS.brick[3])], // a cactus with two arms and a flower
  },
]

const plantOps = ({ x, y }) => {
  const plant = PLANTS[hash(x, y) % PLANTS.length]
  return [...plant.foliage(), ...potOps(plant.pot, plant.wide)]
}

export const commonArts = {
  chair: { under: true, ops: item => chairFacingDown(RAMPS[item.tone ?? 'metal']).map(op => faced(item.face ?? 'down', op)) },
  sofa: { under: true, ops: item => seatOps(item, 'fabricCool') },
  armchair: { under: true, ops: item => seatOps(item, 'fabricWarm') },
  plant: { under: false, ops: plantOps },
}

// a rug (an oval with a border and a ring of dots) or a doormat, in its own pixels
// A rectangular rug: an outline, a border, a pale band, then a field with a pattern (`diamond`, `stripes`, `check`
// or none) and a short fringe at the two ends.
const rectRugOps = (W, H, t, pattern) => {
  const ops = [r(0, 1, W, H - 2, t[1]), r(1, 2, W - 2, H - 4, t[2]), r(3, 4, W - 6, H - 8, t[3]), r(5, 6, W - 10, H - 12, t[2])]
  for (let y = 2; y < H - 2; y += 3) ops.push(r(0, y, 1, 1, t[3]), r(W - 1, y, 1, 1, t[1])) // fringe
  const [x0, y0, x1, y1] = [5, 6, W - 5, H - 6]
  if (pattern === 'stripes') for (let x = x0 + 2; x < x1 - 1; x += 6) ops.push(r(x, y0, 2, y1 - y0, t[1]), r(x + 2, y0, 1, y1 - y0, t[3]))
  else if (pattern === 'check') {
    for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) if (((x - x0) / 4 + (y - y0) / 4) % 2 === 0) ops.push(r(x, y, Math.min(4, x1 - x), Math.min(4, y1 - y), t[1]))
  } else if (pattern === 'diamond')
    for (let cy = y0 + 4; cy < y1; cy += 8)
      for (let cx = x0 + 4; cx < x1 - 2; cx += 8) ops.push(r(cx, cy - 3, 1, 1, t[1]), r(cx - 1, cy - 2, 3, 1, t[1]), r(cx - 2, cy - 1, 5, 1, t[1]), r(cx - 3, cy, 7, 1, t[3]), r(cx - 2, cy + 1, 5, 1, t[1]), r(cx - 1, cy + 2, 3, 1, t[1]), r(cx, cy + 3, 1, 1, t[1]))
  return ops
}

const rugOps = ({ kind, tone = 'terracotta', shape = 'oval', pattern, w, h }) => {
  const [W, H] = [w * TILE, h * TILE]
  if (kind === 'mat') {
    const wood = RAMPS.wood
    const ops = [r(0, 0, W, H, wood[1]), r(1, 1, W - 2, H - 2, wood[2])]
    for (let x = 4; x < W - 3; x += 4) ops.push(r(x, 2, 1, H - 4, wood[3]))
    return ops
  }
  const t = RAMPS[tone]
  if (shape === 'rect') return rectRugOps(W, H, t, pattern)
  const [cx, cy] = [W / 2, H / 2]
  return [
    ...ellipseOps(cx, cy, W / 2, H / 2, t[1]), // the outline
    ...ellipseOps(cx, cy, W / 2 - 2, H / 2 - 2, t[2]), // the border
    ...ellipseOps(cx, cy, W / 2 - 6, H / 2 - 6, t[3]), // a pale band inside it
    ...ellipseOps(cx, cy, W / 2 - 9, H / 2 - 9, t[2]), // the field
    ...ringOps(cx, cy, W / 2 - 17, H / 2 - 15, 24, t[1]), // a ring of dots
  ]
}

// what lies on the floor of a plan: its rugs and mats, and the pools of light, in plan pixels
export const decalOps = layout => [
  ...layout.rugs.flatMap(rug => moved(rugOps(rug), rug.x * TILE, rug.y * TILE)),
  ...layout.lights.flatMap(l => glowOps(l.x * TILE, l.y * TILE, l.rx * TILE, l.ry * TILE, RAMPS.plaster[3])),
]
