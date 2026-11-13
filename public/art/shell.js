// The shell of the Garden Studio: the floors, walls, doors, windows and stairs. Everything is
// a list of rectangles, ['r', x, y, w, h, colour], in pixels, 16 to a tile, using only the
// colours of palette.js. Light comes from the top-left: lit edges are top and left.
//
// Walls are seen from the south and a little above. A wall cell with more wall to its south is
// all cap (its top). A cell where the wall's run ends at the south shows its cap on the top six
// pixels and its face (plaster with a skirting board) on the ten below; windows and doors are
// drawn on that face.
import { RAMPS } from '../palette.js'
import { hash } from '../pixel.js'
import { levelAt } from '../studio.js'

const TILE = 16
const r = (x, y, w, h, color) => ['r', x, y, w, h, color]
const moved = (ops, dx, dy) => ops.map(([kind, x, y, w, h, color]) => [kind, x + dx, y + dy, w, h, color])

// each kind of floor: the material it is made of, and how it looks. `lift` moves along the
// material's four shades (1: a shade lighter, -1: a shade darker).
const FLOORS = {
  honey: { material: 'honey', style: 'plank' },
  street: { material: 'honey', style: 'plank', lift: 1 },
  wood: { material: 'wood', style: 'plank' },
  sage: { material: 'sage', style: 'carpet' },
  blue: { material: 'periwinkle', style: 'carpet' },
  lilac: { material: 'lilac', style: 'carpet' },
  glass: { material: 'frost', style: 'carpet' },
  gray: { material: 'stone', style: 'slab' },
  teal: { material: 'slate', style: 'tile' },
  tile: { material: 'frost', style: 'tile' },
  stone: { material: 'stone', style: 'slab' },
  path: { material: 'stone', style: 'gravel' },
  dark: { material: 'metal', style: 'grate', lift: -1 },
}

export const FLOOR_TONES = Object.keys(FLOORS)

// One tile of floor; `x` and `y` are its place, so no two neighbours are quite alike. Every
// pattern carries on across the tile's edges: planks run on, tiles meet at their grout lines.
export const floorTileOps = (tone, x, y) => {
  const floor = FLOORS[tone] ?? FLOORS.gray
  const ramp = RAMPS[floor.material]
  const c = i => ramp[Math.max(0, Math.min(3, i + (floor.lift ?? 0)))]
  const hx = hash(x, y)
  const hy = hash(y + 91, x + 17)
  const ops = [r(0, 0, TILE, TILE, c(2))]
  if (floor.style === 'plank') {
    for (let row = 0; row < 4; row++) {
      const h = hash(x * 4 + row, y * 7 + 3)
      ops.push(r(0, row * 4 + 3, TILE, 1, c(1))) // the gap between two planks
      ops.push(r((h % 14) + 1, row * 4, 1, 3, c(1))) // where this plank ends
      if ((h >>> 9) % 2) ops.push(r(((h >>> 4) % 10) + 2, row * 4 + 1, 2, 1, c(3))) // a streak of grain, on some planks
    }
  } else if (floor.style === 'tile') {
    ops.push(r(0, 0, TILE, 1, c(1)), r(0, 0, 1, TILE, c(1)), r(0, 8, TILE, 1, c(1)), r(8, 0, 1, TILE, c(1)))
    for (const [ox, oy] of [[1, 1], [9, 1], [1, 9], [9, 9]]) ops.push(r(ox, oy, 2, 1, c(3))) // each tile's lit corner
  } else if (floor.style === 'slab') {
    // big slabs, one to a tile, lit along the top and left edges
    ops.push(r(0, 0, TILE, 1, c(1)), r(0, 0, 1, TILE, c(1)), r(1, 1, TILE - 2, 1, c(3)), r(1, 1, 1, TILE - 2, c(3)))
    for (let i = 0; i < 2; i++) ops.push(r(2 + ((hx >>> (i * 5)) % 12), 2 + ((hy >>> (i * 5)) % 12), 1, 1, c(1)))
  } else if (floor.style === 'grate') {
    for (let i = 0; i < TILE; i += 4) ops.push(r(0, i, TILE, 1, c(1)), r(i, 0, 1, TILE, c(1)))
  } else {
    // carpet and gravel: a few darker specks and one lighter
    const specks = floor.style === 'gravel' ? 8 : 5
    for (let i = 0; i < specks; i++) ops.push(r((hx >>> (i * 3)) % TILE, (hy >>> (i * 3)) % TILE, 1, 1, i === specks - 1 ? c(3) : c(1)))
  }
  return ops
}

// a flight of stairs: a step every four pixels, with a lit edge and a shadowed riser
export const stairOps = () => {
  const stone = RAMPS.stone
  const ops = [r(0, 0, TILE, TILE, stone[2])]
  for (let step = 0; step < 4; step++) ops.push(r(0, step * 4, TILE, 1, stone[3]), r(0, step * 4 + 3, TILE, 1, stone[1]))
  return ops
}

// A wall cell. `isWall(x, y)` says whether there is wall at a cell.
export const wallOps = (x, y, isWall) => {
  const cap = RAMPS.wallcap
  const face = RAMPS.plaster
  const trim = RAMPS.wood
  const [n, s, e, w] = [isWall(x, y - 1), isWall(x, y + 1), isWall(x + 1, y), isWall(x - 1, y)]
  const ops = []
  if (s) {
    // the wall goes on to the south: just the top of it
    ops.push(r(0, 0, TILE, TILE, cap[2]))
    if (!n) ops.push(r(0, 0, TILE, 1, cap[3]))
    if (!w) ops.push(r(0, 0, 1, TILE, cap[3]))
    if (!e) ops.push(r(TILE - 1, 0, 1, TILE, cap[1]))
    return ops
  }
  ops.push(r(0, 0, TILE, 6, cap[2]), r(0, 5, TILE, 1, cap[1]))
  if (!n) ops.push(r(0, 0, TILE, 1, cap[3]))
  if (!w) ops.push(r(0, 0, 1, 6, cap[3]))
  if (!e) ops.push(r(TILE - 1, 0, 1, 6, cap[1]))
  ops.push(r(0, 6, TILE, 10, face[2]), r(0, 6, TILE, 1, face[1])) // the face, and the shadow under the cap
  ops.push(r(0, 14, TILE, 2, trim[1]), r(0, 14, TILE, 1, trim[2])) // the skirting board
  if (!w) ops.push(r(0, 7, 1, 7, face[3]))
  if (!e) ops.push(r(TILE - 1, 7, 1, 7, face[1]))
  const h = hash(x, y)
  ops.push(r(2 + (h % 11), 8 + ((h >>> 4) % 5), 2, 1, face[3])) // a fleck in the plaster
  return ops
}

// A thin wall that runs north to south, in the middle of its cell: six pixels of cap, lit on the left.
// The floors of the rooms on each side carry on to it (the plan draws them first).
export const thinWallOps = (x, y, isWall) => {
  const cap = RAMPS.wallcap
  const ops = [r(5, 0, 6, TILE, cap[2]), r(5, 0, 1, TILE, cap[3]), r(10, 0, 1, TILE, cap[1])]
  if (!isWall(x, y - 1)) ops.push(r(5, 0, 6, 1, cap[3]))
  if (!isWall(x, y + 1)) ops.push(r(5, TILE - 1, 6, 1, cap[1]))
  return ops
}

// the part of a list of rectangles that lies between two x positions
const clipped = (ops, x0, x1) =>
  ops.flatMap(([kind, x, y, w, h, color]) => {
    const [a, b] = [Math.max(x, x0), Math.min(x + w, x1)]
    return b > a ? [[kind, a, y, b - a, h, color]] : []
  })

// A door, in its own pixels (a tile is 16 wide): a swing door seen edge on, a pair of glass
// sliding doors, double wooden doors, or an archway with no door at all. A door in a wall that
// runs north to south is only a gap with a leaf standing open beside it (its posts as thin as the wall when `thin`).
export const doorOps = (door, isWall, thin = false) => {
  const cap = RAMPS.wallcap
  const trim = RAMPS.wood
  const metal = RAMPS.metal
  const glass = RAMPS.glass
  const brass = RAMPS.light
  const W = door.w * TILE
  const half = W / 2
  if (!(isWall(door.x - 1, door.y) && isWall(door.x + door.w, door.y))) {
    const [x, w] = thin ? [5, 6] : [0, TILE]
    return [
      r(x, 0, w, 4, cap[2]), r(x, 0, w, 1, cap[3]), r(x, 12, w, 4, cap[2]), r(x, 12, w, 1, cap[3]), r(x, 15, w, 1, cap[1]),
      r(2, 4, 12, 2, trim[2]), r(2, 4, 12, 1, trim[3]),
    ]
  }
  const ops = [
    r(0, 0, W, 6, cap[2]), r(0, 0, W, 1, cap[3]), r(0, 5, W, 1, cap[1]), r(0, 6, W, 1, trim[0]), // the beam over the opening
    r(0, 7, 2, 9, trim[1]), r(0, 7, 1, 9, trim[2]), r(W - 2, 7, 2, 9, trim[1]), r(W - 1, 7, 1, 9, trim[0]), // the two posts
  ]
  if (door.kind === 'swing') ops.push(r(2, 7, 2, 8, trim[2]), r(2, 7, 1, 8, trim[3]), r(2, 9, 2, 1, metal[2]), r(2, 13, 2, 1, metal[2]))
  if (door.kind === 'sliding')
    ops.push(
      r(2, 7, W - 4, 1, metal[2]), r(2, 14, W - 4, 1, metal[1]),
      r(2, 8, half - 2, 6, glass[2]), r(half, 8, half - 2, 6, glass[2]), r(half - 1, 7, 2, 8, metal[1]),
      r(4, 9, 2, 1, glass[3]), r(half + 2, 9, 2, 1, glass[3]),
    )
  if (door.kind === 'double')
    ops.push(
      r(2, 7, half - 3, 8, trim[2]), r(half + 1, 7, half - 3, 8, trim[2]), r(2, 7, 1, 8, trim[3]), r(half + 1, 7, 1, 8, trim[3]),
      r(4, 9, half - 7, 4, trim[1]), r(half + 3, 9, half - 7, 4, trim[1]), r(half - 1, 7, 2, 8, trim[0]),
      r(half - 4, 11, 1, 2, brass[2]), r(half + 3, 11, 1, 2, brass[2]),
    )
  return ops
}

// A window or a glass wall, in its own pixels. A window one cell high is drawn on the face of
// the wall below its cap; a taller one is drawn on the cap of a wall that runs north to south (a narrow
// one when that wall is `thin`).
export const windowOps = (win, thin = false) => {
  const metal = RAMPS.metal
  const glass = RAMPS.glass
  const plaster = RAMPS.plaster
  const W = win.w * TILE
  const H = win.h * TILE
  const ops = []
  if (win.h > win.w) {
    const [x, w] = thin ? [5, 6] : [2, 12]
    ops.push(r(x, 1, w, H - 2, metal[1]), r(x + 1, 2, w - 2, H - 4, glass[2]), r(x + 2, 3, 1, Math.max(1, H - 8), glass[3]))
    for (let i = 1; i < win.h; i++) ops.push(r(x + 1, i * TILE - 1, w - 2, 1, metal[1]))
    return ops
  }
  if (win.kind === 'glass') {
    ops.push(r(0, 6, W, 10, glass[2]), r(0, 6, W, 1, metal[2]), r(0, 15, W, 1, metal[1]))
    for (let i = 0; i <= W; i += TILE) ops.push(r(Math.min(i, W - 1), 7, 1, 8, metal[1]))
    for (let i = 0; i < win.w; i++) ops.push(r(i * TILE + 3, 8, 2, 1, glass[3]), r(i * TILE + 5, 9, 2, 1, glass[3]))
    return ops
  }
  ops.push(r(1, 7, W - 2, 7, metal[1]), r(2, 8, W - 4, 5, glass[2]), r(0, 14, W, 1, plaster[3]))
  for (let i = 1; i < win.w; i++) ops.push(r(i * TILE - 1, 8, 1, 5, metal[1]))
  for (let i = 0; i < win.w; i++) ops.push(r(i * TILE + 3, 9, 2, 1, glass[3]), r(i * TILE + 5, 10, 2, 1, glass[3]))
  return ops
}

// something hung on the face of a wall, in its own pixels: a whiteboard with a marker tray, or a framed
// landscape picture
export const wallArtOps = item => {
  const [metal, plaster, glass, brick, leaf] = [RAMPS.metal, RAMPS.plaster, RAMPS.glass, RAMPS.brick, RAMPS.leaf]
  const W = item.w * TILE
  if (item.kind === 'picture') {
    const [wood, light] = [RAMPS.wood, RAMPS.light]
    return [
      r(1, 6, W - 2, 9, wood[1]), r(1, 6, W - 2, 1, wood[2]), r(1, 6, 1, 9, wood[2]), r(W - 2, 7, 1, 8, wood[0]), // the frame
      r(3, 8, W - 6, 5, glass[3]), r(W - 9, 9, 2, 2, light[3]), // the sky and a sun
      r(3, 11, W - 6, 2, leaf[2]), r(5, 10, 5, 1, leaf[2]), r(3, 12, W - 6, 1, leaf[1]), // hills
    ]
  }
  return [
    r(1, 7, W - 2, 7, metal[2]), r(1, 7, W - 2, 1, metal[3]), r(2, 8, W - 4, 5, plaster[3]), // the frame and the board
    r(4, 9, 8, 1, glass[2]), r(4, 11, 12, 1, brick[2]), r(W - 14, 9, 8, 1, leaf[2]), // something written on it
    r(3, 13, W - 6, 1, metal[1]), r(8, 12, 2, 1, brick[2]), r(12, 12, 2, 1, glass[1]), // the marker tray, and two markers
  ]
}

// Vertical walls down to this row (the first floor and the back rooms, above the wall with their doors) are thin, the rest thick.
const THIN_UNTIL_ROW = 16

// the whole shell of a plan: ops in plan pixels
export const shellOps = layout => {
  const ops = []
  const put = (tx, ty, tile) => ops.push(...moved(tile, tx * TILE, ty * TILE))
  const open = (x, y) => (layout.grid[y]?.[x] ?? '#') !== '#'
  const furnished = new Set(layout.furniture.filter(f => f.solid).flatMap(f => Array.from({ length: f.w * f.h }, (_, i) => `${f.x + (i % f.w)},${f.y + Math.floor(i / f.w)}`)))
  // indoors: floor you can stand on inside the building, or furniture standing on such a floor
  const inRoom = (x, y) => layout.rooms.some(o => o.level !== 'outside' && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)
  const indoors = (x, y) => (open(x, y) ? levelAt(layout, x, y) !== 'outside' : furnished.has(`${x},${y}`) && inRoom(x, y))

  // a wall is a solid cell, with no furniture on it, that has some floor indoors beside it
  const walls = new Set()
  for (let y = 0; y < layout.height; y++)
    for (let x = 0; x < layout.width; x++) {
      if (open(x, y) || furnished.has(`${x},${y}`)) continue
      let beside = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) beside ||= indoors(x + dx, y + dy)
      if (beside) walls.add(`${x},${y}`)
    }
  const isWall = (x, y) => walls.has(`${x},${y}`)

  for (const room of layout.rooms)
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++) put(x, y, room.level === 'stairs' ? stairOps() : floorTileOps(room.tone, x, y))

  // the floor of a doorway, or under a guardrail, is the floor of the room beside it (the mezzanine's, if it is there)
  const toneNear = (x, y) => {
    const near = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dx, dy]) => layout.rooms.findLast(o => o.level !== 'stairs' && x + dx >= o.x && x + dx < o.x + o.w && y + dy >= o.y && y + dy < o.y + o.h))
      .filter(Boolean)
    return (near.find(o => o.level === 'mezzanine') ?? near[0])?.tone ?? 'honey'
  }
  for (const door of layout.doors)
    for (let y = door.y; y < door.y + door.h; y++) for (let x = door.x; x < door.x + door.w; x++) put(x, y, floorTileOps(toneNear(x, y), x, y))
  for (const key of furnished) {
    const [x, y] = key.split(',').map(Number)
    if (!inRoom(x, y)) put(x, y, floorTileOps(toneNear(x, y), x, y))
  }

  // a floor to carry on under a thin wall, from the room beside it (or nothing, where that side is garden)
  const floorAt = (x, y) => {
    const room = layout.rooms.findLast(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)
    return room ? (room.level === 'stairs' ? stairOps() : floorTileOps(room.tone, x, y)) : []
  }
  // thin: a wall cell that only runs north to south, among the first floor and the back rooms
  const isThin = (x, y) => y <= THIN_UNTIL_ROW && (isWall(x, y - 1) || isWall(x, y + 1)) && !isWall(x - 1, y) && !isWall(x + 1, y)

  for (const key of walls) {
    const [x, y] = key.split(',').map(Number)
    if (isThin(x, y)) {
      put(x, y, [...clipped(floorAt(x - 1, y), 0, 5), ...clipped(floorAt(x + 1, y), 11, TILE), ...thinWallOps(x, y, isWall)])
    } else put(x, y, wallOps(x, y, isWall))
  }
  const thinDoor = door => door.y <= THIN_UNTIL_ROW
  for (const door of layout.doors) put(door.x, door.y, doorOps(door, isWall, thinDoor(door)))
  for (const win of layout.windows) put(win.x, win.y, windowOps(win, win.h > win.w && win.y <= THIN_UNTIL_ROW))
  for (const art of layout.wallArt ?? []) put(art.x, art.y, wallArtOps(art))
  return ops
}
