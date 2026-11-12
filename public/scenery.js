// The Office's pixel art for the place itself: floors, walls, furniture. Each
// piece is a list of rectangles, ['r', x, y, w, h, colour], on a grid of 16
// pixels to a tile; office.js paints them on small canvases and draws those
// scaled up with no smoothing. Plain data in, plain data out, so it can be
// tested. People are in sprites.js.
export const TILE = 16

const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

const r = (x, y, w, h, color) => ['r', x, y, w, h, color]

// how each room's floor looks: two shades, a line colour and a pattern
const FLOORS = {
  gray: { base: '#3d424d', alt: '#373c46', line: '#2f333c', style: 'concrete' },
  teal: { base: '#2a5f62', alt: '#245558', line: '#1f4a4d', style: 'carpet' },
  purple: { base: '#43386f', alt: '#3b3163', line: '#332a57', style: 'carpet' },
  amber: { base: '#7d6140', alt: '#725837', line: '#5e4630', style: 'plank' },
  coral: { base: '#6b4b4d', alt: '#5f4244', line: '#4f3638', style: 'tile' },
  blue: { base: '#2f4468', alt: '#2a3d5e', line: '#233350', style: 'carpet' },
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
  } else if (f.style === 'carpet') {
    for (let i = 0; i < 4; i++) ops.push(r((h >>> (i * 4)) % TILE, (h >>> (i * 4 + 2)) % TILE, 1, 1, f.alt))
    ops.push(r((h >>> 5) % TILE, (h >>> 9) % TILE, 1, 1, f.line))
  } else {
    for (let i = 0; i < 3; i++) ops.push(r((h >>> (i * 5)) % TILE, (h >>> (i * 5 + 2)) % TILE, 2, 1, f.line))
  }
  return ops
}

// a piece of back wall: the colour of the wall, a skirting board, and now and
// then a window
const wallTile = (withWindow, light = '#6f9fc9') => {
  const ops = [r(0, 0, TILE, TILE, '#3a3550'), r(0, 0, TILE, 2, '#4a4468'), r(0, 12, TILE, 4, '#2b2640'), r(0, 12, TILE, 1, '#201c33')]
  if (withWindow)
    ops.push(r(2, 2, 12, 9, '#d6cdb8'), r(3, 3, 10, 7, light), r(7, 3, 1, 7, '#d6cdb8'), r(3, 6, 10, 1, '#d6cdb8'), r(3, 3, 4, 2, '#8fbfe3'))
  return ops
}

// the floor and walls of the whole plan: ops in plan pixels (tile * 16)
export const groundOps = layout => {
  const ops = []
  const put = (tx, ty, tileOps) => {
    for (const [, x, y, w, h, color] of tileOps) ops.push(r(tx * TILE + x, ty * TILE + y, w, h, color))
  }
  for (const room of layout.rooms)
    for (let ty = room.y; ty < room.y + room.h; ty++)
      for (let tx = room.x; tx < room.x + room.w; tx++) {
        if (room.name === 'Stairs') {
          put(tx, ty, [r(0, 0, TILE, TILE, '#3d424d'), r(0, 0, TILE, 1, '#575d6b'), r(0, 8, TILE, 1, '#575d6b'), r(0, 7, TILE, 1, '#2f333c'), r(0, 15, TILE, 1, '#2f333c')])
        } else put(tx, ty, floorTile(room.tone, tx, ty))
      }

  // the back wall of the ground floor, and of the CEO's room, with windows
  for (let tx = 0; tx <= 34; tx++) put(tx, layout.groundTop - 1, wallTile(tx % 4 === 1))
  for (let tx = 22; tx <= 34; tx++) put(tx, 0, wallTile(tx % 4 === 2, '#2e4a6e'))

  // a rug under the CEO's desk
  const rug = { x: 25 * TILE, y: 2 * TILE + 8, w: 9 * TILE, h: 3 * TILE + 8 }
  ops.push(r(rug.x, rug.y, rug.w, rug.h, '#c9a24a'), r(rug.x + 2, rug.y + 2, rug.w - 4, rug.h - 4, '#6b3a4f'), r(rug.x + 5, rug.y + 5, rug.w - 10, rug.h - 10, '#7d4560'))

  // a thin line round every room
  for (const room of layout.rooms) {
    const [x, y, w, h] = [room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE]
    for (const o of [r(x, y, w, 1, '#1b1830'), r(x, y + h - 1, w, 1, '#1b1830'), r(x, y, 1, h, '#1b1830'), r(x + w - 1, y, 1, h, '#1b1830')]) ops.push(o)
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

const sofaOps = () => [
  r(1, 1, 46, 8, '#8c5a24'), r(2, 2, 44, 6, '#c98f3a'), r(2, 2, 44, 1, '#e0aa55'),
  r(3, 8, 42, 6, '#d9a04a'), r(16, 8, 1, 6, '#a06f28'), r(31, 8, 1, 6, '#a06f28'),
  r(0, 4, 4, 11, '#8c5a24'), r(44, 4, 4, 11, '#8c5a24'), r(0, 4, 4, 2, '#a06f28'), r(44, 4, 4, 2, '#a06f28'),
  r(1, 15, 46, 1, SHADOW),
]

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

const machineOps = () => [
  r(1, 46, 30, 2, SHADOW),
  r(1, 4, 30, 42, '#4a4f63'), r(0, 2, 32, 6, '#5c6178'), r(0, 2, 32, 1, '#7a8099'),
  r(5, 10, 22, 14, '#0e2a33'), r(6, 11, 20, 12, '#2fc4b8'), r(8, 13, 12, 1, '#a8f0ea'), r(8, 16, 16, 1, '#7fded6'), r(8, 19, 9, 1, '#a8f0ea'),
  r(6, 28, 4, 4, '#e55353'), r(12, 28, 4, 4, '#f2c94c'), r(18, 28, 4, 4, '#4caf50'),
  r(6, 36, 20, 1, '#363a4a'), r(6, 39, 20, 1, '#363a4a'), r(6, 42, 20, 1, '#363a4a'), r(0, 44, 32, 4, '#2c3040'),
]

const trayOps = () => [
  r(2, 14, 12, 1, SHADOW), r(2, 6, 12, 8, '#8a6a44'), r(3, 7, 10, 6, '#a58058'),
  r(4, 4, 8, 5, '#f3efe6'), r(5, 3, 8, 5, '#e6e1d6'), r(6, 5, 5, 1, '#b9b4a8'), r(6, 7, 4, 1, '#b9b4a8'),
]

const plantOps = () => [
  r(4, 15, 8, 1, SHADOW), r(5, 10, 6, 5, '#a8553a'), r(5, 10, 6, 1, '#c66a4a'),
  r(4, 3, 8, 7, '#3f8f4a'), r(3, 5, 3, 4, '#2f7a3a'), r(10, 4, 3, 5, '#4fa65a'), r(6, 2, 4, 3, '#4fa65a'), r(7, 4, 2, 2, '#6cc177'),
]

// what to draw for each kind of furniture; `under` things are drawn below the
// people (a chair, a sofa sat on), the rest are in front of whoever is behind them
const ARTS = {
  desk: { under: false, ops: item => deskOps(item.w) },
  sofa: { under: true, ops: () => sofaOps() },
  chair: { under: true, ops: () => chairOps() },
  shelf: { under: false, ops: item => shelfOps(item.h) },
  machine: { under: false, ops: () => machineOps() },
  tray: { under: false, ops: () => trayOps() },
  plant: { under: false, ops: () => plantOps() },
}

// every piece of furniture in the plan with its art, in the item's own pixels
export const itemsOf = layout =>
  layout.furniture.map(item => ({ ...item, under: ARTS[item.kind].under, ops: ARTS[item.kind].ops(item) }))

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
