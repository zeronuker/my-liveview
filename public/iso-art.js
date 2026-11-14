// The angled view's pixel art for the place: floors, the brick slab under the building, walls cut away at
// the front, windows, chairs and desks, monitors. The rest of the furniture is in iso-furniture.js, the
// garden in iso-garden.js, the drawing tools in iso-draw.js. Each piece is drawn on a canvas context at
// (px, py), the left and top of its tile's 16 by 8 diamond, in whole pixels, with palette colours only. Light
// comes from the top-left. The tile at (x, y) has its corners at: top (x, y), right (x + 1, y), left
// (x, y + 1), bottom (x + 1, y + 1). Used by iso-scene.js (the Office) and angled-concept.html.
import { BACK, BEHIND, block, bottomEdge, cellHash, diamond, rect, seatTop, slab, table, topEdge } from './iso-draw.js'
import { doorLights, doorTile } from './iso-doors.js'
import { LIGHTS, PIECES } from './iso-furniture.js'
import { entrancesOf, levelHeight, stairsOf, stepHeight } from './iso.js'
import { shade } from './palette.js'
import { levelAt } from './studio.js'

export { block, cellHash, diamond, rect }
export const WALL = 16 // how tall a wall at the back stands, in pixels
export const DESK = 5 // the height of a desk, so a monitor can stand on it

// the floor colour of each kind of room (the same materials as art/shell.js)
const FLOOR = {
  honey: ['honey', 2], street: ['honey', 3], wood: ['wood', 2], sage: ['sage', 2], blue: ['periwinkle', 2],
  lilac: ['lilac', 2], glass: ['frost', 2], gray: ['stone', 2], teal: ['slate', 2], tile: ['frost', 2],
  stone: ['stone', 2], path: ['stone', 1], dark: ['metal', 1],
}

const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

// What the plan has at each tile, worked out once: floor, wall (a solid tile touching a floor) or neither, and how high each
// stands (iso.js: the first floor is a storey up, the mezzanine a third of that, the rest on the ground).
export const makeWorld = layout => {
  const { width, height, rooms, furniture, windows, rugs, doors } = layout
  const inGrid = (x, y) => x >= 0 && y >= 0 && x < width && y < height
  const floor = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => levelAt(layout, x, y) !== null))
  const isFloor = (x, y) => inGrid(x, y) && floor[y][x]
  const near = (x, y, n, test) => {
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if ((i || j) && test(x + i, y + j)) return true
    return false
  }
  const isWall = (x, y) => inGrid(x, y) && !isFloor(x, y) && near(x, y, 1, isFloor)
  const floorZ = (x, y) => levelHeight(levelAt(layout, x, y))
  // the stairs and the steps outside are worked out in the plan as it is (iso.js), whichever way it is turned
  const original = layout.original ?? layout
  const toOriginal = layout.toOriginal ?? ((x, y) => [x, y])
  const stairs = stairsOf(original)
  const entrances = entrancesOf(original)
  const furn = new Map()
  for (const f of furniture.filter(f => f.kind !== 'pendant').reverse()) for (let j = f.y; j < f.y + f.h; j++) for (let i = f.x; i < f.x + f.w; i++) furn.set(`${i},${j}`, f)
  // how high the stairs stand beside a tile (x, y) that runs along them: the side of a staircase rises with it
  const rampZ = (x, y) => {
    const [ox, oy] = toOriginal(x, y)
    return Math.max(0, ...stairs.filter(({ room }) => oy >= room.y && oy < room.y + room.h && (ox === room.x - 1 || ox === room.x + room.w)).map(stair => stepHeight(stair, oy)))
  }
  // A wall: a guardrail stands on the edge of the higher floor; a wall between floors of one height stands on that height; a wall
  // between floors of different heights (a podium wall) stands on the ground and reaches the higher floor and a low rail more.
  const walls = new Map()
  const wallInfo = (x, y) => {
    if (!isWall(x, y)) return null
    const key = `${x},${y}`
    if (!walls.has(key)) {
      const zs = []
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && isFloor(x + i, y + j)) zs.push(floorZ(x + i, y + j))
      const [low, high] = [Math.min(...zs), Math.max(...zs)]
      walls.set(key, furn.has(key) ? { z: Math.max(high, rampZ(x, y)), top: 0 } : low === high ? { z: high, top: 0 } : { z: 0, top: high + 3 })
    }
    return walls.get(key)
  }
  // how strongly a pool of light (the plan's `lights`) falls on a tile: 0 none, 1 in the pool, 2 in its middle
  const poolAt = (x, y) =>
    Math.max(0, ...layout.lights.map(l => {
      const d = ((x + 0.5 - l.x) / l.rx) ** 2 + ((y + 0.5 - l.y) / l.ry) ** 2
      return d < 0.35 ? 2 : d < 1 ? 1 : 0
    }))
  const baseZ = (x, y) => (isFloor(x, y) ? floorZ(x, y) : (wallInfo(x, y)?.z ?? 0))
  return {
    layout, inGrid, isFloor, isWall, near, poolAt,
    // how high a floor, or the foot of a wall or guardrail, stands (whole pixels, or a fraction beside a staircase)
    baseZ,
    isRaised: (x, y) => baseZ(x, y) > 0,
    isRaisedFloor: (x, y) => isFloor(x, y) && floorZ(x, y) > 0,
    // how high a podium wall (between floors of different heights) reaches, or 0 for any other tile
    sharedTop: (x, y) => wallInfo(x, y)?.top ?? 0,
    rampZ,
    // a step of a staircase, or of the steps down outside the entrance, or null: how high it stands, and whether the runner is on it
    stairsAt: (x, y) => {
      const [ox, oy] = toOriginal(x, y)
      const stair = stairs.find(({ room }) => inside(room, ox, oy))
      if (stair) return { z: stepHeight(stair, oy), rise: Math.abs(stair.zHigh - stair.zLow) / stair.room.h, runner: Boolean(stair.room.runner) && ox > stair.room.x && ox < stair.room.x + stair.room.w - 1 }
      const entrance = entrances.find(e => ox >= e.x && ox < e.x + e.w && oy === e.y + 1)
      return entrance ? { z: entrance.z / 2, rise: entrance.z / 2, runner: false } : null
    },
    pendants: furniture.filter(f => f.kind === 'pendant'),
    isBuilding: (x, y) => isFloor(x, y) || isWall(x, y),
    furnAt: (x, y) => furn.get(`${x},${y}`),
    toneAt: (x, y) => (rooms.findLast(r => inside(r, x, y)) ?? { tone: 'stone' }).tone,
    windowAt: (x, y) => windows.find(w => inside(w, x, y)),
    doorAt: (x, y) => doors.find(d => inside(d, x, y)),
    rugAt: (x, y) => rugs.find(r => inside(r, x, y)),
  }
}

// the floor of a tile: its room's colour in a checker, a rug over it, or grass outside. With `grassNear` set, grass
// is only drawn that many tiles round the building.
export const groundTile = (c, world, px, py, x, y, grassNear = Infinity) => {
  if (world.isFloor(x, y)) {
    const rug = world.rugAt(x, y)
    const lift = world.poolAt(x, y) // lit by a lamp: a shade lighter, or two
    if (rug) return diamond(c, px, py, shade(rug.tone ?? 'terracotta', Math.min(3, ((x + y) % 2 ? 1 : 2) + lift)))
    const [mat, step] = FLOOR[world.toneAt(x, y)] ?? FLOOR.stone
    return diamond(c, px, py, shade(mat, Math.min(3, ((x + y) % 2 ? step : step + 1) + lift)))
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

// The podium a raised tile stands on: plaster faces from the ground (or the lower tile beside it) up to its floor, with a brick base
// on the ground, on the sides that face the viewer and have no podium wall beyond them. Drawn at the tile's place on the ground.
export const podiumTile = (c, world, px, py, x, y) => {
  const z = Math.round(world.baseZ(x, y))
  const faceBelow = (nx, ny) => {
    if (world.sharedTop(nx, ny) > 0) return 0 // a podium wall covers it
    const nz = Math.round(world.baseZ(nx, ny))
    return nz < z ? [z - nz, nz] : 0
  }
  for (let col = 0; col < 8; col++) {
    for (const [nx, ny, mirror, light] of [[x, y + 1, false, 2], [x + 1, y, true, 1]]) {
      const below = faceBelow(nx, ny)
      if (!below) continue
      const [h, nz] = below
      const at = mirror ? px + 15 - col : px + col
      rect(c, at, py + bottomEdge(col) - z, 1, h, shade('plaster', light))
      if (nz === 0) rect(c, at, py + bottomEdge(col) - Math.min(4, h), 1, Math.min(4, h), shade('brick', light))
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

export const monitor = (c, px, py, lit, v) => {
  rect(c, px + 7, py - DESK - 1, 2, 2, shade('metal', 0))
  rect(c, px + 4, py - DESK - 6, 8, 5, shade('metal', 0))
  rect(c, px + 5, py - DESK - 5, 6, 3, lit ? [shade('glass', 3), shade('light', 3), shade('leaf', 3)][v % 3] : shade('metal', 1))
  if (lit) rect(c, px + 6, py - DESK - 4, 3, 1, shade('plaster', 3))
  rect(c, px + 5, py - DESK + 2, 6, 1, shade('plaster', 3))
}

// A tile of a piece of furniture. `sitter(x, y)` draws whoever sits on a chair, between its seat and its backrest. `detail`
// adds small things, a mug on a desk.
const furnitureTile = (c, px, py, furn, x, y, { sitter, detail }) => {
  const part = { i: x - furn.x, j: y - furn.y, w: furn.w, h: furn.h }
  if (furn.kind === 'chair') {
    const mat = furn.tone === 'leather' ? 'leather' : 'metal'
    const back = BACK[furn.face] ?? 'ur'
    if (BEHIND.has(back)) slab(c, px, py, 3, back, 7, shade(mat, 1), shade(mat, 3))
    seatTop(c, px, py, 3, shade(mat, 2))
    rect(c, px + 6, py + 4, 4, 2, shade(mat, 0))
    sitter?.(x, y)
    if (!BEHIND.has(back)) slab(c, px, py, 3, back, 7, shade(mat, 1), shade(mat, 3))
  } else if (furn.kind === 'tray') {
    block(c, px, py, 2, 'metal')
  } else if (furn.kind === 'plant') {
    rect(c, px + 6, py + 1, 4, 3, shade('terracotta', 1))
    rect(c, px + 7, py - 1, 2, 2, shade('wood', 1))
    for (const [dx, dy, s] of [[3, -9, 6], [6, -12, 5], [8, -8, 5], [5, -6, 6]]) rect(c, px + dx, py + dy, s, s - 1, shade('leaf', (dx + dy) & 1 ? 2 : 3))
  } else if (furn.kind === 'desk') {
    table(c, px, py, DESK, 'wood', part)
    if (detail && cellHash(x, y) % 2) rect(c, px + 11, py - 6, 2, 2, shade('fabricWarm', 3))
  } else if (PIECES[furn.kind]) {
    PIECES[furn.kind](c, px, py, furn, part, { x, y })
  } else {
    block(c, px, py, 6, 'wood') // a kind with no drawer: a plain box
  }
}

// how tall a wall stands: tall at the back, cut low at the front, half between rooms
const wallHeight = (world, x, y) => {
  if (world.sharedTop(x, y) > 0) return world.sharedTop(x, y) // a podium wall: up to the higher floor, and its low rail
  const behind = world.isFloor(x + 1, y) || world.isFloor(x, y + 1)
  const front = world.isFloor(x - 1, y) || world.isFloor(x, y - 1)
  const ramp = world.rampZ(x, y)
  return Math.max(ramp > 0 ? Math.round(ramp) + 3 : 0, behind && front ? 8 : behind ? WALL : front ? 3 : 8)
}

// A tile of a door, or null: its kind, its place in the opening, which way the wall runs round it and how tall that wall is.
export const doorOf = (world, x, y) => {
  const door = world.doorAt(x, y)
  if (!door) return null
  const axis = world.isWall(door.x - 1, door.y) && world.isWall(door.x + door.w, door.y) ? 'x' : 'y'
  const wall = axis === 'x' ? wallHeight(world, door.x - 1, door.y) : wallHeight(world, door.x, door.y - 1)
  return { kind: door.kind, x: door.x, i: x - door.x, j: y - door.y, w: door.w, h: door.h, axis, wall }
}

// The lights that blink on a tile: those of its furniture (iso-furniture.js), the sensor over a sliding door, and the glint that sweeps along a window's
// pane, which is out of step with the next window's. Each is { dx, dy, w, h, pattern, on, off } from the tile's box.
export const lightsOf = (world, x, y) => {
  const door = doorOf(world, x, y)
  if (door) return doorLights(door)
  const furn = world.furnAt(x, y)
  if (furn) return LIGHTS[furn.kind]?.(furn, { i: x - furn.x, j: y - furn.y, w: furn.w, h: furn.h }, { x, y }) ?? []
  const win = world.isWall(x, y) && world.windowAt(x, y)
  const h = win && wallHeight(world, x, y)
  if (!win || h <= 8) return []
  const left = world.isFloor(x, y + 1)
  const seed = cellHash(win.x, win.y) % 40
  return Array.from({ length: 6 }, (_, i) => {
    const col = i + 1
    return { dx: left ? col : 15 - col, dy: -h + bottomEdge(col) + 9, w: 1, h: 1, pattern: 'glint', seed, on: shade('glass', 3), off: shade('glass', left ? 2 : 1) }
  })
}

// A tile's wall or furniture (not its floor, and not what sits on a desk).
export const structureTile = (c, world, px, py, x, y, options = {}) => {
  const furn = world.furnAt(x, y)
  if (world.isWall(x, y) && !furn) {
    const h = wallHeight(world, x, y)
    block(c, px, py, h, 'plaster', true)
    diamond(c, px, py - h, shade('wallcap', 2))
    for (let col = 0; col < 8; col++) rect(c, px + col, py - h + topEdge(col), 1, 1, shade('wallcap', 3))
    const win = h > 8 && world.windowAt(x, y)
    if (win) {
      const side = world.isFloor(x, y + 1) ? 'left' : 'right'
      const [a, b] = side === 'left' ? [x === win.x, x === win.x + win.w - 1] : [y === win.y, y === win.y + win.h - 1]
      windowOn(c, px, py, h, side, a, b)
    }
  } else if (world.stairsAt(x, y)) {
    const step = world.stairsAt(x, y)
    const h = Math.max(1, Math.round(step.z))
    const mat = step.runner ? 'carpet' : 'stone'
    // a step: a lit nosing along the front edge, a riser under it (dark when the step is tall, lighter when it is low), the tread on top
    const [left, right] = step.rise >= 3 ? [1, 0] : [2, 1]
    for (let col = 0; col < 8; col++) {
      rect(c, px + col, py - h + bottomEdge(col), 1, h, shade(mat, left))
      rect(c, px + 15 - col, py - h + bottomEdge(col), 1, h, shade(mat, right))
      rect(c, px + col, py - h + bottomEdge(col), 1, 1, shade(mat, 3))
      rect(c, px + 15 - col, py - h + bottomEdge(col), 1, 1, shade(mat, 2))
    }
    diamond(c, px, py - h, shade(mat, step.runner ? 2 : 3))
  } else if (world.doorAt(x, y)) {
    doorTile(c, px, py, doorOf(world, x, y))
  } else if (furn) {
    furnitureTile(c, px, py, furn, x, y, options)
  }
}

export { furnitureTile }
