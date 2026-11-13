// The desks of the open office: a desk for each way someone can sit at it, with a monitor, a keyboard and
// a small thing of its own on it, the manager's tray, and what a desk looks like while someone types.
// Rectangles ['r', x, y, w, h, colour] in pixels, palette colours only, light from the top-left.
//
// `face` is the way the person at the desk faces. Seen from the south, a desk whose person faces down (sits
// north of it) shows the backs of its monitors, and one whose person faces up (sits south of it) shows
// their screens. A desk one tile wide and two tall is for someone sitting to its west or east.
import { RAMPS } from '../palette.js'
import { hash } from '../pixel.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const [wood, metal, plaster, glass, brick, leaf, light] = [RAMPS.wood, RAMPS.metal, RAMPS.plaster, RAMPS.glass, RAMPS.brick, RAMPS.leaf, RAMPS.light]

// a small thing on a desk, chosen by where the desk is: a mug, papers, a plant, a lamp, or nothing
const clutter = (x, y, h) => {
  switch (h % 5) {
    case 0:
      return [r(x, y + 1, 3, 3, brick[2]), r(x, y + 1, 3, 1, brick[3]), r(x + 3, y + 2, 1, 1, brick[2])]
    case 1:
      return [r(x, y, 6, 4, plaster[3]), r(x, y, 6, 1, plaster[2]), r(x + 1, y + 1, 4, 1, plaster[1]), r(x + 1, y + 2, 3, 1, plaster[1])]
    case 2:
      return [r(x, y + 3, 4, 3, brick[2]), r(x, y + 3, 4, 1, brick[3]), r(x, y, 4, 3, leaf[2]), r(x + 1, y, 2, 1, leaf[3])]
    case 3:
      return [r(x, y + 4, 4, 1, metal[1]), r(x + 1, y + 1, 1, 3, metal[2]), r(x, y, 4, 2, light[2]), r(x, y, 4, 1, light[3])]
    default:
      return []
  }
}

// a keyboard and a mouse, from (x, y)
const keyboard = (x, y) => [r(x, y, 10, 2, plaster[2]), r(x, y, 10, 1, plaster[3]), r(x + 12, y, 2, 2, plaster[2]), r(x + 12, y, 2, 1, plaster[3])]

// a desk two tiles wide or more, for one person to a two tiles, sitting north (down) or south (up) of it
const wideOps = item => {
  const W = item.w * TILE
  const ops = [
    r(0, 0, W, 10, wood[2]), r(0, 0, W, 1, wood[3]), r(0, 0, 1, 10, wood[3]), r(W - 1, 1, 1, 9, wood[1]), // the top
    r(0, 10, W, 6, wood[1]), r(0, 10, W, 1, wood[0]), r(0, 15, W, 1, wood[0]), // the front
  ]
  for (let place = 0; place < Math.floor(item.w / 2); place++) {
    const x = place * 32
    ops.push(r(x + 2, 12, 28, 3, wood[0]), r(x + 2, 14, 28, 1, wood[2]), r(x + 14, 13, 4, 1, metal[2])) // a drawer front with its handle
    if (item.face === 'up')
      ops.push(
        r(x + 8, 0, 16, 7, metal[0]), r(x + 8, 0, 16, 1, metal[1]), r(x + 9, 1, 14, 5, glass[0]), r(x + 10, 2, 3, 1, glass[1]), r(x + 14, 7, 4, 1, metal[1]), // a monitor, seen from the front
        ...keyboard(x + 8, 8),
      )
    else
      ops.push(r(x + 8, 4, 16, 6, metal[1]), r(x + 8, 4, 16, 1, metal[2]), r(x + 8, 9, 16, 1, metal[0]), r(x + 15, 6, 2, 1, metal[2]), ...keyboard(x + 8, 1)) // the back of a monitor, and a keyboard
    ops.push(...clutter(x + 26, 2, hash(item.x + place, item.y)))
  }
  return ops
}

// a desk two tiles tall for someone sitting to its west (face 'right') or east (face 'left'): the monitor
// is seen from the side
const tallOps = item => {
  const H = item.h * TILE
  const west = item.face === 'right'
  const [mx, kx] = west ? [9, 2] : [4, 11]
  return [
    r(0, 0, TILE, H - 6, wood[2]), r(0, 0, TILE, 1, wood[3]), r(0, 0, 1, H - 6, wood[3]), r(TILE - 1, 1, 1, H - 7, wood[1]), // the top
    r(0, H - 6, TILE, 6, wood[1]), r(0, H - 6, TILE, 1, wood[0]), r(0, H - 1, TILE, 1, wood[0]), r(2, H - 4, 12, 2, wood[0]), // the front
    r(mx, 8, 3, 10, metal[1]), r(mx, 8, 3, 1, metal[2]), r(west ? mx : mx + 2, 9, 1, 8, glass[0]), r(mx, 18, 3, 1, metal[0]), // a monitor, from the side
    r(kx, 10, 3, 9, plaster[2]), r(kx, 10, 3, 1, plaster[3]), // a keyboard
    ...clutter(west ? 9 : 2, H - 14, hash(item.x, item.y)),
  ]
}

const deskOps = item => (item.h > item.w ? tallOps(item) : wideOps(item))

// what a desk looks like while someone is typing at it: the screen lit with lines of code, or, seen from
// behind, a glow on the monitor
export const deskOnOps = item => {
  if (item.h > item.w) {
    const west = item.face === 'right'
    return [r(west ? 9 : 6, 9, 1, 8, glass[2]), r(west ? 9 : 6, 10, 1, 2, light[3])]
  }
  const ops = []
  for (let place = 0; place < Math.floor(item.w / 2); place++) {
    const x = place * 32
    if (item.face === 'up')
      ops.push(r(x + 9, 1, 14, 5, glass[2]), r(x + 10, 2, 7, 1, light[3]), r(x + 10, 3, 10, 1, glass[3]), r(x + 10, 4, 5, 1, leaf[3]), r(x + 17, 4, 3, 1, brick[3]))
    else ops.push(r(x + 8, 4, 16, 1, glass[3]), r(x + 22, 6, 1, 1, light[3]))
  }
  return ops
}

const trayOps = () => [
  r(2, 6, 12, 8, wood[1]), r(2, 6, 12, 1, wood[2]), r(3, 7, 10, 6, wood[2]), r(2, 13, 12, 1, wood[0]), // the tray
  r(4, 4, 8, 5, plaster[3]), r(5, 3, 8, 5, plaster[2]), r(6, 5, 5, 1, plaster[1]), r(6, 7, 4, 1, plaster[1]), // papers piled in it
]

export const officeArts = {
  desk: { under: false, ops: deskOps },
  tray: { under: false, ops: trayOps },
}
