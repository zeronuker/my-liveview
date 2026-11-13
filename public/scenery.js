// The Office's pixel art for the place itself: floors, walls, furniture. Each
// piece is a list of rectangles, ['r', x, y, w, h, colour], on a grid of 16
// pixels to a tile; office.js paints them on small canvases and draws those
// scaled up with no smoothing. Plain data in, plain data out, so it can be
// tested. People are in sprites.js.
//
// The art is drawn in art/<part>.js, one file for each part of the place: the shell (floors, walls,
// doors, windows, stairs), the things several rooms share, the lobby, the open office. Furniture that
// has no art yet is a plain placeholder here (a box of one colour); the detailed art comes room by
// room, drawn with the pixel-art skill and the palette in palette.js.
import { backroomArts } from './art/backrooms.js'
import { ceoArts } from './art/ceo.js'
import { commonArts, decalOps } from './art/common.js'
import { flowerOps, gardenHighOps, gardenLowOps } from './art/garden.js'
import { lobbyArts } from './art/lobby.js'
import { officeArts } from './art/office.js'
import { shellOps } from './art/shell.js'
import { socialArts } from './art/social.js'
import { buildGarden } from './garden.js'
import { ramp, shade } from './palette.js'
import { hash } from './pixel.js'

export const TILE = 16

const r = (x, y, w, h, color) => ['r', x, y, w, h, color]

const grassTile = (x, y) => {
  const h = hash(x, y)
  const tufts = h % 3 === 0 ? [r((h >>> 4) % TILE, (h >>> 8) % TILE, 1, 1, shade('grass', 3)), r((h >>> 12) % TILE, (h >>> 16) % TILE, 1, 1, shade('grass', 1))] : []
  return (h >>> 20) % 12 === 0 ? [...tufts, ...flowerOps(h)] : tufts // and now and then a flower
}

// the grass, the garden's pond, path and beds, the shell of the plan, then what stands up in the garden: ops in
// plan pixels (tile * 16). The pond has two frames, 0 and 1; everything else is the same in both.
export const groundOps = (layout, frame = 0) => {
  const garden = buildGarden(layout)
  const ops = [r(0, 0, layout.width * TILE, layout.height * TILE, shade('grass', 2))]
  for (let ty = 0; ty < layout.height; ty++)
    for (let tx = 0; tx < layout.width; tx++) for (const [, x, y, w, h, color] of grassTile(tx, ty)) ops.push(r(tx * TILE + x, ty * TILE + y, w, h, color))
  return [...ops, ...gardenLowOps(garden, frame), ...shellOps(layout), ...decalOps(layout), ...gardenHighOps(garden)]
}

// a guardrail: a thin rail along the way it runs, with a post every tile
const railOps = ({ w, h }) => {
  const [dark, , base] = ramp('#6b6f7a')
  const ops = []
  if (w >= h) {
    ops.push(r(0, 6, w * TILE, 2, base), r(0, 8, w * TILE, 1, dark))
    for (let i = 0; i < w; i++) ops.push(r(i * TILE + 7, 3, 3, 9, dark))
  } else {
    ops.push(r(6, 0, 2, h * TILE, base), r(8, 0, 1, h * TILE, dark))
    for (let i = 0; i < h; i++) ops.push(r(3, i * TILE + 7, 9, 3, dark))
  }
  return ops
}

// plain placeholder: a box of one colour, lighter on top and darker at the foot
const boxOps = ({ w, h }, color) => {
  const [dark, mid, base, light] = ramp(color)
  return [r(0, 0, w * TILE, h * TILE, base), r(0, 0, w * TILE, 3, light), r(0, h * TILE - 3, w * TILE, 2, mid), r(0, h * TILE - 1, w * TILE, 1, dark)]
}

// what to draw for each kind of furniture; `under` things are drawn below the
// people (a chair, a sofa sat on), the rest are in front of whoever is behind them. A piece taller than its
// tile has a `rise`: that many pixels of its picture stand above its box, so the picture is `rise` taller than the box.
const ARTS = {
  rail: { under: false, ops: railOps },
  ...backroomArts,
  ...ceoArts,
  ...commonArts,
  ...lobbyArts,
  ...officeArts,
  ...socialArts,
}

// every piece of furniture in the plan with its art, in the item's own pixels
export const itemsOf = layout =>
  layout.furniture.map(item => {
    const art = ARTS[item.kind] ?? { under: false, ops: () => boxOps(item, '#888780') }
    return { ...item, under: art.under, rise: art.rise ?? 0, ops: art.ops(item), lights: art.lights?.(item) ?? [] }
  })

// the lights that are not on a piece of furniture: a blinking sensor over each sliding door, in plan pixels
export const doorLights = layout =>
  layout.doors
    .filter(door => door.kind === 'sliding')
    .map(door => ({ x: door.x * TILE + (door.w * TILE) / 2 - 1, y: door.y * TILE + 3, w: 2, h: 1, pattern: 'slow', on: shade('light', 3), off: shade('brick', 2) }))

// a sparkle sweeping along the glass of every window and glass wall that runs east to west, in plan pixels: a row of one
// pixel lights low in the pane, which flash in turn, each window out of step with the next
export const windowLights = layout =>
  layout.windows
    .filter(win => win.w >= win.h)
    .flatMap(win => {
      const [x0, W] = [win.x * TILE, win.w * TILE]
      const [y, glass] = win.kind === 'glass' ? [win.y * TILE + 12, shade('glass', 2)] : [win.y * TILE + 11, shade('glass', 2)]
      const seed = hash(win.x, win.y) % 40
      const lights = []
      for (let x = x0 + 3; x < x0 + W - 3; x += 5) if (win.kind !== 'glass' || (x - x0) % TILE > 1) lights.push({ x, y, w: 1, h: 1, pattern: 'glint', seed, on: shade('glass', 3), off: glass })
      return lights
    })

// paints a list of rectangles with its corner at (x, y)
export const paint = (ctx, ops, x = 0, y = 0) => {
  for (const [, ox, oy, w, h, color] of ops) {
    ctx.fillStyle = color
    ctx.fillRect(x + ox, y + oy, w, h)
  }
}
