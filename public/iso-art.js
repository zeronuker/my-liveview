// The angled view's pixel art: floors, the brick slab under the building, walls cut away at the
// front, furniture, monitors. Each piece is drawn on a canvas context at (px, py), the left and
// top of its tile's 16 by 8 diamond, in whole pixels, with palette colours only. Light comes from
// the top-left. The tile at (x, y) has its corners at: top (x, y), right (x + 1, y), left
// (x, y + 1), bottom (x + 1, y + 1). Used by iso-scene.js (the Office) and angled-concept.html.
import { shade } from './palette.js'
import { levelAt } from './studio.js'

export const WALL = 16 // how tall a wall at the back stands, in pixels

// the floor colour of each kind of room (the same materials as art/shell.js)
const FLOOR = {
  honey: ['honey', 2], street: ['honey', 3], wood: ['wood', 2], sage: ['sage', 2], blue: ['periwinkle', 2],
  lilac: ['lilac', 2], glass: ['frost', 2], gray: ['stone', 2], teal: ['slate', 2], tile: ['frost', 2],
  stone: ['stone', 2], path: ['stone', 1], dark: ['metal', 1],
}
// what each piece of furniture is made of and how tall it stands, in pixels
const STYLE = {
  ceodesk: ['leather', 6], coffeetable: ['wood', 3], shelf: ['wood', 18], cabinet: ['wood', 7],
  sidetable: ['wood', 5], boardtable: ['wood', 5], tv: ['metal', 12], machine: ['metal', 12], rail: ['metal', 4],
  pingpong: ['leaf', 5], rack: ['metal', 14], vending: ['fabricCool', 16], fridge: ['frost', 14], counter: ['wood', 6],
  island: ['wood', 6], coffeebar: ['wood', 6], cafetable: ['wood', 4], stool: ['wood', 3], reception: ['wood', 7],
  labbench: ['metal', 6], cubicle: ['tile', 10], urinal: ['frost', 8], vanity: ['frost', 6], sink: ['frost', 6],
  cooler: ['glass', 9], bin: ['metal', 4], coatstand: ['wood', 14], umbrella: ['fabricCool', 4], parasol: ['fabricWarm', 3],
  deckrail: ['wood', 3],
}
const TONES = new Set(['leather', 'fabricWarm', 'fabricCool', 'terracotta', 'sage'])
const TABLES = new Set(['desk', 'ceodesk', 'boardtable', 'cafetable', 'coffeetable', 'sidetable'])
const SOFAS = new Set(['sofa', 'armchair'])

export const cellHash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0

const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
export const rect = (c, x, y, w, h, color) => {
  c.fillStyle = color
  c.fillRect(x, y, w, h)
}

// What the plan has at each tile, worked out once: floor, wall (a solid tile touching a floor) or neither.
export const makeWorld = layout => {
  const { width, height, rooms, furniture, windows, rugs } = layout
  const inGrid = (x, y) => x >= 0 && y >= 0 && x < width && y < height
  const floor = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => levelAt(layout, x, y) !== null))
  const isFloor = (x, y) => inGrid(x, y) && floor[y][x]
  const near = (x, y, n, test) => {
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if ((i || j) && test(x + i, y + j)) return true
    return false
  }
  const isWall = (x, y) => inGrid(x, y) && !isFloor(x, y) && near(x, y, 1, isFloor)
  const furn = new Map()
  for (const f of furniture.filter(f => f.kind !== 'pendant').reverse()) for (let j = f.y; j < f.y + f.h; j++) for (let i = f.x; i < f.x + f.w; i++) furn.set(`${i},${j}`, f)
  return {
    layout, inGrid, isFloor, isWall, near,
    isBuilding: (x, y) => isFloor(x, y) || isWall(x, y),
    furnAt: (x, y) => furn.get(`${x},${y}`),
    toneAt: (x, y) => (rooms.findLast(r => inside(r, x, y)) ?? { tone: 'stone' }).tone,
    windowAt: (x, y) => windows.find(w => inside(w, x, y)),
    rugAt: (x, y) => rugs.find(r => inside(r, x, y)),
  }
}

// A 16 by 8 diamond, drawn a row at a time so the edges stay crisp (a path would be smoothed).
const WIDTHS = [4, 8, 12, 16, 16, 12, 8, 4]
export const diamond = (c, px, py, color) => WIDTHS.forEach((w, j) => rect(c, px + 8 - w / 2, py + j, w, 1, color))
// the top and bottom edge of the diamond in a column 0 to 7 (the right half mirrors it)
const topEdge = col => 3 - (col >> 1)
const bottomEdge = col => 5 + (col >> 1)

// A box on a tile: top, left face (towards +y) and right face (towards +x), `h` pixels tall.
export const block = (c, px, py, h, mat, skirt = false) => {
  for (let col = 0; col < 8; col++) {
    rect(c, px + col, py - h + bottomEdge(col), 1, h, shade(mat, 2))
    rect(c, px + 15 - col, py - h + bottomEdge(col), 1, h, shade(mat, 1))
    if (skirt) {
      rect(c, px + col, py + bottomEdge(col) - 2, 1, 2, shade('wood', 1))
      rect(c, px + 15 - col, py + bottomEdge(col) - 2, 1, 2, shade('wood', 0))
    }
  }
  diamond(c, px, py - h, shade(mat, 3))
}

// the floor of a tile: its room's colour in a checker, a rug over it, or grass outside. With `grassNear` set, grass
// is only drawn that many tiles round the building.
export const groundTile = (c, world, px, py, x, y, grassNear = Infinity) => {
  if (world.isFloor(x, y)) {
    const rug = world.rugAt(x, y)
    if (rug) return diamond(c, px, py, shade(rug.tone ?? 'terracotta', (x + y) % 2 ? 1 : 2))
    const [mat, step] = FLOOR[world.toneAt(x, y)] ?? FLOOR.stone
    return diamond(c, px, py, shade(mat, (x + y) % 2 ? step : Math.min(3, step + 1)))
  }
  if (!world.isBuilding(x, y) && (grassNear === Infinity || world.near(x, y, grassNear, world.isFloor))) diamond(c, px, py, shade('grass', cellHash(x, y) % 3 ? 2 : 1))
}

// the thin slab under the building: brick faces on the sides that face the viewer
export const slabTile = (c, world, px, py, x, y) => {
  if (!world.isBuilding(x, y)) return
  for (let col = 0; col < 8; col++) {
    if (!world.isBuilding(x, y + 1)) {
      rect(c, px + col, py + bottomEdge(col), 1, 5, shade('brick', 2))
      rect(c, px + col, py + bottomEdge(col), 1, 1, shade('brick', 3))
    }
    if (!world.isBuilding(x + 1, y)) {
      rect(c, px + 15 - col, py + bottomEdge(col), 1, 5, shade('brick', 1))
      rect(c, px + 15 - col, py + bottomEdge(col), 1, 1, shade('brick', 2))
    }
  }
}

// a window on a wall's face, with curtains at its ends
const windowOn = (c, px, py, h, side, curtainA, curtainB) => {
  for (let col = 1; col < 7; col++) {
    const x = side === 'left' ? px + col : px + 15 - col
    const y = py - h + bottomEdge(col) + 3
    rect(c, x, y, 1, 3, shade('glass', 3))
    rect(c, x, y + 3, 1, 5, shade('glass', side === 'left' ? 2 : 1))
  }
  const curtain = col => {
    for (let i = 0; i < 2; i++) {
      const cc = col + i
      rect(c, side === 'left' ? px + cc : px + 15 - cc, py - h + bottomEdge(cc) + 2, 1, 10, shade('carpet', side === 'left' ? 2 : 1))
    }
  }
  if (curtainA) curtain(0)
  if (curtainB) curtain(6)
}

// a seat's backrest along one edge of the tile: 'ur' (upper right), 'ul', 'll' or 'lr'
const backrest = (c, px, py, z, side, hh, color, rim) => {
  for (let i = 0; i < 6; i++) {
    const col = side === 'ur' || side === 'lr' ? 8 + i : 2 + i
    const edge = side === 'ur' ? topEdge(15 - col) : side === 'ul' ? topEdge(col) : side === 'll' ? bottomEdge(col) - 1 : bottomEdge(15 - col) - 1
    rect(c, px + col, py - z + edge - hh + 1, 1, hh, color)
    rect(c, px + col, py - z + edge - hh + 1, 1, 1, rim)
  }
}
const BACK = { down: 'ur', up: 'll', right: 'ul', left: 'lr' } // the edge behind someone facing this way
const seatTop = (c, px, py, z, color) => [4, 8, 8, 4].forEach((w, j) => rect(c, px + 8 - w / 2, py + 2 + j - z, w, 1, color))

// a desk: a thick top on thin legs
const table = (c, px, py, h, mat) => {
  rect(c, px + 1, py + bottomEdge(1) - h + 2, 1, h - 2, shade('metal', 1))
  rect(c, px + 14, py + bottomEdge(1) - h + 2, 1, h - 2, shade('metal', 0))
  rect(c, px + 7, py + 8 - h + 2, 2, h - 2, shade('metal', 1))
  for (let col = 0; col < 8; col++) {
    rect(c, px + col, py - h + bottomEdge(col), 1, 2, shade(mat, 2))
    rect(c, px + 15 - col, py - h + bottomEdge(col), 1, 2, shade(mat, 1))
  }
  diamond(c, px, py - h, shade(mat, 3))
}

export const DESK = 5 // the height of a desk, so a monitor can stand on it

// a monitor on its stand with a keyboard in front, drawn over a desk; lit when someone is at work
export const monitor = (c, px, py, lit, v) => {
  rect(c, px + 7, py - DESK - 1, 2, 2, shade('metal', 0))
  rect(c, px + 4, py - DESK - 6, 8, 5, shade('metal', 0))
  rect(c, px + 5, py - DESK - 5, 6, 3, lit ? [shade('glass', 3), shade('light', 3), shade('leaf', 3)][v % 3] : shade('metal', 1))
  if (lit) rect(c, px + 6, py - DESK - 4, 3, 1, shade('plaster', 3))
  rect(c, px + 5, py - DESK + 2, 6, 1, shade('plaster', 3))
}

// A tile's wall or furniture (not its floor, and not what sits on a desk). `sitter(x, y)` draws whoever sits on a chair,
// between its seat and its backrest. `detail` adds small things, a mug on a desk.
export const structureTile = (c, world, px, py, x, y, { sitter, detail } = {}) => {
  const furn = world.furnAt(x, y)
  if (world.isWall(x, y)) {
    // tall at the back, cut low at the front, half between rooms
    const behind = world.isFloor(x + 1, y) || world.isFloor(x, y + 1)
    const front = world.isFloor(x - 1, y) || world.isFloor(x, y - 1)
    const h = behind && front ? 8 : behind ? WALL : front ? 3 : 8
    block(c, px, py, h, 'plaster', true)
    diamond(c, px, py - h, shade('wallcap', 2))
    for (let col = 0; col < 8; col++) rect(c, px + col, py - h + topEdge(col), 1, 1, shade('wallcap', 3))
    const win = h > 8 && world.windowAt(x, y)
    if (win) {
      const side = world.isFloor(x, y + 1) ? 'left' : 'right'
      const [a, b] = side === 'left' ? [x === win.x, x === win.x + win.w - 1] : [y === win.y, y === win.y + win.h - 1]
      windowOn(c, px, py, h, side, a, b)
    }
  } else if (furn?.kind === 'chair') {
    const mat = furn.tone === 'leather' ? 'leather' : 'metal'
    const back = BACK[furn.face] ?? 'ur'
    const behind = back === 'ur' || back === 'ul'
    if (behind) backrest(c, px, py, 3, back, 7, shade(mat, 1), shade(mat, 3))
    seatTop(c, px, py, 3, shade(mat, 2))
    rect(c, px + 6, py + 4, 4, 2, shade(mat, 0))
    sitter?.(x, y)
    if (!behind) backrest(c, px, py, 3, back, 7, shade(mat, 1), shade(mat, 3))
  } else if (furn?.kind === 'tray') {
    block(c, px, py, 2, 'metal')
  } else if (furn && SOFAS.has(furn.kind)) {
    const mat = furn.tone && TONES.has(furn.tone) ? furn.tone : furn.kind === 'sofa' ? 'fabricWarm' : 'fabricCool'
    const back = BACK[furn.face] ?? 'ur'
    block(c, px, py, 4, mat)
    backrest(c, px, py, 4, back, 6, shade(mat, 1), shade(mat, 3))
  } else if (furn && TABLES.has(furn.kind)) {
    table(c, px, py, furn.kind === 'desk' ? DESK : STYLE[furn.kind][1], furn.kind === 'ceodesk' ? 'leather' : 'wood')
    if (detail && furn.kind === 'desk' && cellHash(x, y) % 2) rect(c, px + 11, py - 6, 2, 2, shade('fabricWarm', 3))
  } else if (furn?.kind === 'plant') {
    rect(c, px + 6, py + 1, 4, 3, shade('terracotta', 1))
    rect(c, px + 7, py - 1, 2, 2, shade('wood', 1))
    for (const [dx, dy, s] of [[3, -9, 6], [6, -12, 5], [8, -8, 5], [5, -6, 6]]) rect(c, px + dx, py + dy, s, s - 1, shade('leaf', (dx + dy) & 1 ? 2 : 3))
  } else if (furn) {
    const [mat, h] = STYLE[furn.kind] ?? ['wood', 6]
    block(c, px, py, h, furn.tone && TONES.has(furn.tone) ? furn.tone : mat)
  }
}
