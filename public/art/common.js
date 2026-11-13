// Art that more than one room uses: sofas and armchairs, plants, and the things lying on the floor
// (rugs, mats and pools of light). Rectangles ['r', x, y, w, h, colour] in pixels, palette colours
// only, light from the top-left.
import { RAMPS } from '../palette.js'
import { ellipseOps, glowOps, gridOps, ringOps } from '../pixel.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const moved = (ops, dx, dy) => ops.map(([kind, x, y, w, h, color]) => [kind, x + dx, y + dy, w, h, color])

// A sofa `len` cells long, drawn as if it faced down (towards you): its backrest on top, the seat in
// front in one cushion to a cell, an arm at each end. 16 pixels deep.
const sofaFacingDown = (len, f) => {
  const L = len * TILE
  const ops = [
    r(1, 0, L - 2, 4, f[2]), r(1, 0, L - 2, 1, f[3]), r(1, 4, L - 2, 1, f[1]), // the backrest
    r(1, 12, L - 2, 3, f[1]), r(1, 15, L - 2, 1, f[0]), // the front
    r(0, 2, 3, 13, f[1]), r(0, 2, 3, 1, f[3]), r(0, 3, 1, 11, f[2]), // the left arm, lit
    r(L - 3, 2, 3, 13, f[1]), r(L - 3, 2, 3, 1, f[3]), r(L - 1, 3, 1, 12, f[0]), // the right arm, in shadow
  ]
  for (let i = 0; i < len; i++) {
    const start = i === 0 ? 3 : i * TILE
    const end = i === len - 1 ? L - 3 : (i + 1) * TILE
    ops.push(r(start, 5, end - start, 7, f[2]), r(start, 5, end - start, 1, f[3]))
    if (i > 0) ops.push(r(start, 5, 1, 7, f[1])) // the gap between two cushions
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

const seatOps = (item, material) =>
  sofaFacingDown(item.face === 'left' || item.face === 'right' ? item.h : item.w, RAMPS[material]).map(op => faced(item.face ?? 'down', op))

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

const plantOps = () => {
  const [o, d, g, l] = RAMPS.leaf
  const [O, q, p, R] = RAMPS.brick
  return gridOps(PLANT, { o, d, g, l, O, q, p, R })
}

export const commonArts = {
  sofa: { under: true, ops: item => seatOps(item, 'fabricCool') },
  armchair: { under: true, ops: item => seatOps(item, 'fabricWarm') },
  plant: { under: false, ops: plantOps },
}

// a rug (an oval with a border and a ring of dots) or a doormat, in its own pixels
const rugOps = ({ kind, w, h }) => {
  const [W, H] = [w * TILE, h * TILE]
  if (kind === 'mat') {
    const wood = RAMPS.wood
    const ops = [r(0, 0, W, H, wood[1]), r(1, 1, W - 2, H - 2, wood[2])]
    for (let x = 4; x < W - 3; x += 4) ops.push(r(x, 2, 1, H - 4, wood[3]))
    return ops
  }
  const t = RAMPS.terracotta
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
