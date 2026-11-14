// Turning the angled view in quarter turns. The drawing code only looks at the plan (rooms, walls, furniture, doors, stairs), so
// a turned view is drawn from a turned copy of the plan, by the same code. Everything that lives (people, pets, fish) goes on in
// the plan as it is and is only turned when it is drawn. `k` is the number of quarter turns, 0 to 3, each clockwise on the plan
// (the plan's top goes to the right); `W` and `H` are the plan's own width and height. Plain data in, plain data out, so it can
// be tested.

const DIRS = ['right', 'down', 'left', 'up'] // clockwise
const COMPASS = ['north', 'east', 'south', 'west']

// which way someone facing `dir` in the plan faces in the turned one
export const turnDir = (k, dir) => (DIRS.includes(dir) ? DIRS[(DIRS.indexOf(dir) + k) % 4] : dir)
export const turnCompass = (k, side) => (COMPASS.includes(side) ? COMPASS[(COMPASS.indexOf(side) + k) % 4] : side)

// a direction or a speed (dx, dy) in the turned plan
export const turnVector = (k, dx, dy) => [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]][k % 4].map(v => v + 0) // (+ 0: no negative zero)

// where the point (x, y), in tiles (a tile's middle is at x + 0.5, y + 0.5), of the plan is in the turned one
export const turnPoint = (k, W, H, x, y) => [[x, y], [H - y, x], [W - x, H - y], [y, W - x]][k % 4]

// where the middle of tile (x, y) is in the turned plan, as a tile place (it need not be a whole tile)
export const turnCell = (k, W, H, x, y) => {
  const [tx, ty] = turnPoint(k, W, H, x + 0.5, y + 0.5)
  return [tx - 0.5, ty - 0.5]
}

// a rectangle of tiles in the turned plan
export const turnRect = (k, W, H, { x, y, w, h }) => {
  const [ax, ay] = turnPoint(k, W, H, x, y)
  const [bx, by] = turnPoint(k, W, H, x + w, y + h)
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

// A copy of the plan turned `k` quarter turns. It keeps `original` (the plan as it is) and `rotation`, and `toOriginal(x, y)`
// says which tile of the original is at a tile of this one. With no turn it is the plan itself.
export const rotateLayout = (layout, k) => {
  if (!k) return layout
  const { width: W, height: H } = layout
  const odd = k % 2 === 1
  const [width, height] = odd ? [H, W] : [W, H]
  const rect = r => ({ ...r, ...turnRect(k, W, H, r) })
  const cell = ({ x, y }) => ({ x: Math.round(turnCell(k, W, H, x, y)[0]), y: Math.round(turnCell(k, W, H, x, y)[1]) })
  const { grid, wallArt, ...rest } = layout // the grid and the wall art are not used by the angled view
  return {
    ...rest,
    width,
    height,
    rooms: layout.rooms.map(room => ({ ...rect(room), ...(room.high ? { high: turnCompass(k, room.high) } : {}) })),
    doors: layout.doors.map(rect),
    windows: layout.windows.map(rect),
    furniture: layout.furniture.map(item => ({ ...rect(item), ...(item.face ? { face: turnDir(k, item.face) } : {}) })),
    rugs: layout.rugs.map(rect),
    lights: layout.lights.map(light => {
      const [x, y] = turnPoint(k, W, H, light.x, light.y)
      return { ...light, x, y, rx: odd ? light.ry : light.rx, ry: odd ? light.rx : light.ry }
    }),
    spots: { ...layout.spots, desks: layout.spots.desks.map(seat => ({ ...seat, ...cell(seat), face: turnDir(k, seat.face), desk: cell(seat.desk) })) },
    original: layout,
    rotation: k,
    toOriginal: (x, y) => turnCell((4 - k) % 4, width, height, x, y).map(Math.round),
  }
}

// The garden (iso-garden.js's flat form: a fence as a rectangle with a gap and two posts) turned the same way.
export const rotateGarden = (garden, k, W, H) => {
  const odd = k % 2 === 1
  const rect = r => ({ ...r, ...turnRect(k, W, H, r) })
  const cell = thing => {
    const [x, y] = turnCell(k, W, H, thing.x, thing.y).map(Math.round)
    return { ...thing, x, y, ox: thing.x, oy: thing.y } // the place before turning too, so what varies from tile to tile stays as it was
  }
  const [cx, cy] = turnPoint(k, W, H, garden.pond.cx, garden.pond.cy)
  return {
    ...garden,
    pond: { cx, cy, rx: odd ? garden.pond.ry : garden.pond.rx, ry: odd ? garden.pond.rx : garden.pond.ry },
    path: rect(garden.path),
    beds: garden.beds.map(rect),
    trees: garden.trees.map(cell),
    bushes: garden.bushes.map(cell),
    rocks: garden.rocks.map(cell),
    fence: { rect: rect(garden.fence.rect), gap: rect(garden.fence.gap), pillars: garden.fence.pillars.map(cell) },
  }
}
