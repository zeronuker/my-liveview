// The Office's pixel art for the place itself: floors, walls, furniture. Each
// piece is a list of rectangles, ['r', x, y, w, h, colour], on a grid of 16
// pixels to a tile; office.js paints them on small canvases and draws those
// scaled up with no smoothing. Plain data in, plain data out, so it can be
// tested. People are in sprites.js.
//
// Much of this is still plain placeholder art for the Garden Studio plan (a box of
// one colour for most furniture); the detailed art comes room by room, drawn with
// the pixel-art skill and the palette in palette.js.
import { ramp, shade } from './palette.js'
import { levelAt } from './studio.js'

export const TILE = 16

const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

const r = (x, y, w, h, color) => ['r', x, y, w, h, color]

// how each room's floor looks: two shades, a line colour and a pattern
const FLOORS = {
  gray: { base: '#c8cdd6', alt: '#bfc5cf', line: '#aab1bd', style: 'tile' },
  teal: { base: '#b7d4d8', alt: '#adcbd0', line: '#98b8be', style: 'tile' },
  dark: { base: '#3c3c56', alt: '#363650', line: '#2d2d44', style: 'tile' },
  tile: { base: '#dfe9ec', alt: '#d5e1e5', line: '#c3d1d6', style: 'tile' },
  glass: { base: '#cfe6f0', alt: '#c5dfeb', line: '#b0cfdf', style: 'tile' },
  stone: { base: '#b4b2a9', alt: '#aaa8a0', line: '#999790', style: 'tile' },
  path: { base: '#c9b79a', alt: '#bfad8f', line: '#ab9a7e', style: 'tile' },
  honey: { base: '#dcc59c', alt: '#d3bb90', line: '#bfa577', style: 'plank' },
  street: { base: '#f2e6cc', alt: '#eadcbd', line: '#d9c9a5', style: 'plank' },
  wood: { base: '#b98a5a', alt: '#af8052', line: '#9a6e45', style: 'plank' },
  sage: { base: '#dde6d0', alt: '#d3ddc4', line: '#bccaa8', style: 'carpet' },
  blue: { base: '#b9c5e0', alt: '#afbcd9', line: '#9aa8c9', style: 'carpet' },
  lilac: { base: '#ccd3ea', alt: '#c2cae5', line: '#aeb7d4', style: 'carpet' },
}

// one tile of floor; `x`, `y` are the tile's place, so neighbours differ a little
const floorTile = (tone, x, y) => {
  const f = FLOORS[tone] ?? FLOORS.gray
  const h = hash(x, y)
  const ops = [r(0, 0, TILE, TILE, h % 5 === 0 ? f.alt : f.base)]
  if (f.style === 'plank') {
    for (const row of [3, 7, 11, 15]) ops.push(r(0, row, TILE, 1, f.line))
    ops.push(r(4 + (h % 8), (h >>> 3) % 2 ? 0 : 8, 1, 3, f.line))
  } else if (f.style === 'tile') {
    ops.push(r(0, 0, TILE, 1, f.line), r(0, 0, 1, TILE, f.line))
  } else {
    for (let i = 0; i < 4; i++) ops.push(r((h >>> (i * 4)) % TILE, (h >>> (i * 4 + 2)) % TILE, 1, 1, f.alt))
    ops.push(r((h >>> 5) % TILE, (h >>> 9) % TILE, 1, 1, f.line))
  }
  return ops
}

const grassTile = (x, y) => {
  const h = hash(x, y)
  return h % 3 === 0 ? [r((h >>> 4) % TILE, (h >>> 8) % TILE, 1, 1, shade('grass', 3)), r((h >>> 12) % TILE, (h >>> 16) % TILE, 1, 1, shade('grass', 1))] : []
}

// a flight of stairs: a step every four pixels
const stairTile = () => [r(0, 0, TILE, TILE, '#d3d1c7'), ...[0, 4, 8, 12].map(y => r(0, y, TILE, 1, '#888780'))]

// a wall block: its lighter top, and a darker foot
const wallTile = () => {
  const [dark, mid, base, light] = ramp('#4a4468')
  return [r(0, 0, TILE, TILE, base), r(0, 0, TILE, 3, light), r(0, TILE - 3, TILE, 3, mid), r(0, TILE - 1, TILE, 1, dark)]
}

const DOORS = { sliding: '#9ec9e4', double: '#8d4c2a', swing: '#8d4c2a' }

// the floor, walls and doors of the whole plan: ops in plan pixels (tile * 16)
export const groundOps = layout => {
  const ops = [r(0, 0, layout.width * TILE, layout.height * TILE, shade('grass', 2))]
  const put = (tx, ty, tileOps) => {
    for (const [, x, y, w, h, color] of tileOps) ops.push(r(tx * TILE + x, ty * TILE + y, w, h, color))
  }
  const open = (x, y) => (layout.grid[y]?.[x] ?? '#') !== '#'
  const indoors = (x, y) => open(x, y) && levelAt(layout, x, y) !== 'outside'
  const solidFurniture = new Set(layout.furniture.filter(f => f.solid).flatMap(f => Array.from({ length: f.w * f.h }, (_, i) => `${f.x + (i % f.w)},${f.y + Math.floor(i / f.w)}`)))

  for (let ty = 0; ty < layout.height; ty++) for (let tx = 0; tx < layout.width; tx++) put(tx, ty, grassTile(tx, ty))
  for (const room of layout.rooms)
    for (let ty = room.y; ty < room.y + room.h; ty++)
      for (let tx = room.x; tx < room.x + room.w; tx++) put(tx, ty, room.level === 'stairs' ? stairTile() : floorTile(room.tone, tx, ty))

  for (const door of layout.doors)
    for (let ty = door.y; ty < door.y + door.h; ty++)
      for (let tx = door.x; tx < door.x + door.w; tx++) {
        put(tx, ty, floorTile('street', tx, ty))
        if (DOORS[door.kind]) put(tx, ty, [r(0, 7, TILE, 2, DOORS[door.kind])])
      }

  // a wall is a solid cell, with no furniture on it, that has some floor indoors beside it
  for (let ty = 0; ty < layout.height; ty++)
    for (let tx = 0; tx < layout.width; tx++) {
      if (open(tx, ty) || solidFurniture.has(`${tx},${ty}`)) continue
      let beside = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) beside ||= indoors(tx + dx, ty + dy)
      if (beside) put(tx, ty, wallTile())
    }
  return ops
}

const SHADOW = 'rgba(0,0,0,0.28)'

const deskOps = tiles => {
  const w = tiles * TILE
  return [
    r(1, 15, w - 2, 1, SHADOW),
    r(0, 2, w, 9, '#b98a5a'), r(0, 2, w, 1, '#d9b384'), r(0, 10, w, 1, '#8a6240'),
    r(1, 11, w - 2, 4, '#7a5435'), r(3, 11, 1, 4, '#8a6240'), r(w - 12, 12, 9, 3, '#6a472b'), r(w - 8, 13, 1, 1, '#d9b36a'),
  ]
}

const chairOps = () => [
  r(4, 1, 8, 8, '#2b2b3f'), r(5, 2, 6, 6, '#44445e'), r(5, 2, 6, 1, '#5a5a7a'),
  r(3, 9, 10, 4, '#3c3c56'), r(7, 13, 2, 2, '#2a2a3a'), r(4, 15, 8, 1, '#2a2a3a'),
]

const BOOKS = ['#c0392b', '#2a7f9e', '#e9c46a', '#4caf50', '#9b5de5', '#e76f51', '#f4efe6']
const shelfOps = tiles => {
  const ops = []
  for (let t = 0; t < tiles; t++) {
    const top = t * TILE
    ops.push(r(1, top, 14, TILE, '#5b4330'), r(2, top + 1, 12, 14, '#3d2c20'))
    for (const level of [0, 1]) {
      let x = 2
      for (let i = 0; i < 4; i++) {
        const h = hash(t * 2 + level, i)
        const width = 2 + (h % 2)
        if (x + width > 14) break
        ops.push(r(x, top + 1 + level * 7 + (h % 3), width, 6 - (h % 3), BOOKS[(h >>> 4) % BOOKS.length]))
        x += width + 1
      }
      ops.push(r(2, top + 7 + level * 7, 12, 1, '#5b4330'))
    }
  }
  return ops
}

const trayOps = () => [
  r(2, 14, 12, 1, SHADOW), r(2, 6, 12, 8, '#8a6a44'), r(3, 7, 10, 6, '#a58058'),
  r(4, 4, 8, 5, '#f3efe6'), r(5, 3, 8, 5, '#e6e1d6'), r(6, 5, 5, 1, '#b9b4a8'), r(6, 7, 4, 1, '#b9b4a8'),
]

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

const COLORS = {
  desk: '#9a6b3f', sofa: '#2a7f9e', machine: '#4a4f63', table: '#9a6b3f', tv: '#3c3c56', rack: '#2c2c3a', stall: '#d8d6cc',
  vending: '#e24b4a', cooler: '#6faed6', island: '#b98a5a', counter: '#8d4c2a',
}

// what to draw for each kind of furniture; `under` things are drawn below the
// people (a chair, a sofa sat on), the rest are in front of whoever is behind them
const ARTS = {
  desk: { under: false, ops: item => (item.h === 1 && item.w >= 2 ? deskOps(item.w) : boxOps(item, COLORS.desk)) },
  chair: { under: true, ops: () => chairOps() },
  sofa: { under: true, ops: item => boxOps(item, COLORS.sofa) },
  shelf: { under: false, ops: item => shelfOps(item.h) },
  tray: { under: false, ops: () => trayOps() },
  rail: { under: false, ops: railOps },
}

// every piece of furniture in the plan with its art, in the item's own pixels
export const itemsOf = layout =>
  layout.furniture.map(item => {
    const art = ARTS[item.kind] ?? { under: false, ops: () => boxOps(item, COLORS[item.kind] ?? '#888780') }
    return { ...item, under: art.under, ops: art.ops(item) }
  })

// a laptop on a desk: closed, or open and in use, seen from behind (the person
// sits on the far side). Pixels are in the desk's own first tile.
export const LAPTOP = {
  closed: [r(4, 5, 8, 4, '#8a8f9c'), r(4, 5, 8, 1, '#aeb3bf'), r(4, 9, 8, 1, '#5d6270')],
  open: [
    r(4, 0, 8, 7, '#9aa0ae'), r(4, 0, 8, 1, '#5fe3ff'), r(4, 0, 1, 7, '#7d8392'), r(11, 0, 1, 7, '#7d8392'), r(7, 3, 2, 2, '#e8e8f0'),
    r(4, 7, 8, 2, '#7c8190'), r(4, 9, 8, 1, '#5d6270'),
  ],
}

// paints a list of rectangles with its corner at (x, y)
export const paint = (ctx, ops, x = 0, y = 0) => {
  for (const [, ox, oy, w, h, color] of ops) {
    ctx.fillStyle = color
    ctx.fillRect(x + ox, y + oy, w, h)
  }
}
