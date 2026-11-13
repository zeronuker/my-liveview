import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStudio, levelAt } from '../public/studio.js'
import { findPath } from '../public/walk.js'

const layout = buildStudio()
const cell = (x, y) => layout.grid[y]?.[x] ?? '#'
const isOpen = (x, y) => cell(x, y) !== '#'
const FACE = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }
const key = (x, y) => `${x},${y}`
const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
const roomNamed = name => layout.rooms.find(r => r.name === name)
const cellsOf = r => Array.from({ length: r.w * r.h }, (_, i) => [r.x + (i % r.w), r.y + Math.floor(i / r.w)])
const openCells = () => layout.grid.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '#' ? [] : [[x, y]])))

const allSpots = () => {
  const s = layout.spots
  return {
    entrance: [s.entrance], handIn: [s.handIn], managerSeat: [s.managerSeat], ceoSeat: [s.ceoSeat],
    ceoDelivery: [s.ceoDelivery], ceoDoor: [s.ceoDoor], stairsBottom: [s.stairsBottom], stairsTop: [s.stairsTop],
    files: s.files, seats: s.seats, desks: s.desks, lab: s.lab,
  }
}

// The open cells joined to each other, not counting the `closed` cells ("x,y" keys). Returns cell key -> group number.
const groups = closed => {
  const group = new Map()
  let next = 0
  for (const [x, y] of openCells()) {
    if (group.has(key(x, y)) || closed.has(key(x, y))) continue
    group.set(key(x, y), next)
    const queue = [[x, y]]
    for (let head = 0; head < queue.length; head++)
      for (const [dx, dy] of Object.values(FACE)) {
        const [nx, ny] = [queue[head][0] + dx, queue[head][1] + dy]
        if (!isOpen(nx, ny) || closed.has(key(nx, ny)) || group.has(key(nx, ny))) continue
        group.set(key(nx, ny), next)
        queue.push([nx, ny])
      }
    next++
  }
  return group
}
const closedCells = rects => new Set(rects.flatMap(r => cellsOf(r).map(([x, y]) => key(x, y))))
const apart = (group, a, b) => group.get(key(...cellsOf(roomNamed(a)).find(([x, y]) => isOpen(x, y) && group.has(key(x, y))))) !== group.get(key(...cellsOf(roomNamed(b)).find(([x, y]) => isOpen(x, y) && group.has(key(x, y)))))

test('the grid is as big as the world says, every row the same length', () => {
  assert.equal(layout.grid.length, layout.height)
  for (const row of layout.grid) assert.equal(row.length, layout.width)
})

test('every spot is somewhere a person can stand', () => {
  for (const [name, spots] of Object.entries(allSpots())) {
    assert.ok(spots.length > 0, `${name} has spots`)
    for (const spot of spots) assert.ok(isOpen(spot.x, spot.y), `${name} at ${spot.x},${spot.y}`)
  }
})

test('everyone can walk from the front gate to every spot', () => {
  const from = [layout.spots.entrance.x, layout.spots.entrance.y]
  for (const [name, spots] of Object.entries(allSpots()))
    for (const spot of spots) assert.notEqual(findPath(layout.grid, from, [spot.x, spot.y]), null, `${name} at ${spot.x},${spot.y}`)
})

test('every open cell can be reached from the front gate', () => {
  const { x, y } = layout.spots.entrance
  const reached = groups(new Set())
  for (const [cx, cy] of openCells()) assert.equal(reached.get(key(cx, cy)), reached.get(key(x, y)), `${cx},${cy}`)
})

test('every open cell has a floor: it is in a room or is a door', () => {
  for (const [x, y] of openCells()) assert.ok(layout.rooms.some(r => inside(r, x, y)) || layout.doors.some(d => inside(d, x, y)), `${x},${y}`)
})

test('the CEO is on the first floor, the desks and the manager on the mezzanine, everything else below', () => {
  const s = layout.spots
  assert.equal(levelAt(layout, s.ceoSeat.x, s.ceoSeat.y), 'first')
  assert.ok(s.ceoSeat.y < layout.groundTop && s.entrance.y > layout.groundTop)
  assert.equal(levelAt(layout, s.entrance.x, s.entrance.y), 'outside')
  assert.equal(levelAt(layout, s.managerSeat.x, s.managerSeat.y), 'mezzanine')
  for (const d of s.desks) assert.equal(levelAt(layout, d.x, d.y), 'mezzanine', `desk seat at ${d.x},${d.y}`)
  for (const f of s.files) assert.equal(levelAt(layout, f.x, f.y), 'ground', `file spot at ${f.x},${f.y}`)
  for (const l of s.lab) assert.equal(levelAt(layout, l.x, l.y), 'ground', `lab spot at ${l.x},${l.y}`)
  assert.equal(levelAt(layout, 0, 0), null) // a wall has no level
})

test('a person changes level only on a stair or when going in or out of the building', () => {
  for (const [x, y] of openCells())
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (!isOpen(x + dx, y + dy)) continue
      const [a, b] = [levelAt(layout, x, y), levelAt(layout, x + dx, y + dy)]
      if (a !== b) assert.ok([a, b].some(l => l === 'stairs' || l === 'outside'), `${a} meets ${b} at ${x},${y}`)
    }
})

test('rooms are shut off from each other except through doors, archways and stairs', () => {
  const sealed = groups(closedCells([...layout.doors, ...layout.rooms.filter(r => r.level === 'stairs')]))
  const separate = [
    ['File room', 'Main street'], ['Test lab', 'Main street'], ['Server room', 'Main street'], ["Men's bathroom", 'Main street'],
    ["Women's bathroom", 'Main street'], ['Meeting room', 'Main street'], ['CEO stairwell', 'Main street'],
    ['Lobby', 'Open office'], ['Lobby', 'Main street'], ['Open office', 'Main street'], ['Open office', 'Social hub'],
    ['Lounge and pantry', 'Social hub'], ['Lounge and pantry', 'Vending area'],
    ['CEO office', 'CEO foyer'], ['CEO office', 'Small conference'], ['CEO foyer', 'Small conference'],
    ['Entrance', 'Front path'], ['Terrace', 'Lounge and pantry'],
  ]
  for (const [a, b] of separate) assert.ok(apart(sealed, a, b), `${a} and ${b} are open to each other`)
  // open plan on purpose: the hub, the vending area and the corridor with the street; the lobby with its entrance; the boardwalk with the path
  const joined = [['Social hub', 'Main street'], ['Vending area', 'Social hub'], ['Corridor', 'Main street'], ['Lobby', 'Entrance'], ['Terrace', 'Front path']]
  for (const [a, b] of joined) assert.ok(!apart(sealed, a, b), `${a} and ${b} are shut off from each other`)
})

test('the lobby and the open office have no door between them', () => {
  const lobby = roomNamed('Lobby')
  const office = roomNamed('Open office')
  for (const d of layout.doors) assert.ok(!(inside({ x: lobby.x - 1, y: lobby.y - 1, w: lobby.w + 2, h: lobby.h + 2 }, d.x, d.y) && inside({ x: office.x - 1, y: office.y - 1, w: office.w + 2, h: office.h + 2 }, d.x, d.y)))
})

test('the double doors of the CEO stairs are in the middle of the foot and cover the whole width', () => {
  const stairs = roomNamed('CEO stairs')
  const double = layout.doors.find(d => d.kind === 'double')
  assert.equal(double.x, stairs.x)
  assert.equal(double.w, stairs.w)
  assert.equal(double.y, stairs.y + stairs.h + 1) // the landing row, then the wall row with the doors
})

test('a flight of stairs has no way off sideways', () => {
  for (const r of layout.rooms.filter(r => r.level === 'stairs'))
    for (const [x, y] of cellsOf(r))
      for (const side of [x - 1, x + 1]) assert.ok(!isOpen(side, y) || inside(r, side, y), `${r.name} at ${side},${y}`)
})

test('every desk seat has a chair, and a desk in front of it', () => {
  const desk = (x, y) => layout.furniture.some(f => f.kind === 'desk' && f.solid && inside(f, x, y))
  const chair = (x, y) => layout.furniture.some(f => f.kind === 'chair' && !f.solid && f.x === x && f.y === y)
  for (const seat of [...layout.spots.desks, layout.spots.managerSeat, layout.spots.ceoSeat]) {
    const [dx, dy] = FACE[seat.face]
    assert.deepEqual(seat.desk, { x: seat.x + dx, y: seat.y + dy }, `desk in front of ${seat.x},${seat.y}`)
    assert.ok(desk(seat.desk.x, seat.desk.y), `desk at ${seat.desk.x},${seat.desk.y}`)
    assert.ok(chair(seat.x, seat.y), `chair at ${seat.x},${seat.y}`)
  }
  assert.ok(desk(layout.spots.ceoDelivery.x, layout.spots.ceoDelivery.y - 1)) // work is handed over the CEO's desk
  assert.ok(layout.furniture.some(f => f.kind === 'tray' && inside({ x: f.x, y: f.y - 1, w: 1, h: 1 }, layout.spots.handIn.x, layout.spots.handIn.y)))
})

test('every sofa seat is on a sofa, and the sofa is walked over', () => {
  for (const seat of layout.spots.seats)
    assert.ok(layout.furniture.some(f => f.kind === 'sofa' && !f.solid && inside(f, seat.x, seat.y)), `sofa at ${seat.x},${seat.y}`)
})

test('solid furniture is in the way on the grid and the rest is not', () => {
  for (const f of layout.furniture)
    for (const [x, y] of cellsOf(f)) assert.equal(layout.grid[y][x] === '#', f.solid, `${f.kind} at ${x},${y}`)
})

test('the guardrails are solid', () => {
  const rails = layout.furniture.filter(f => f.kind === 'rail')
  assert.ok(rails.length >= 4)
  for (const r of rails) for (const [x, y] of cellsOf(r)) assert.equal(cell(x, y), '#')
})

test('there are enough desks, seats, shelves and lab places to share around, and no two are the same place', () => {
  assert.ok(layout.spots.desks.length >= 16)
  assert.ok(layout.spots.seats.length >= 9)
  assert.ok(layout.spots.files.length >= 12)
  assert.ok(layout.spots.lab.length >= 8)
  for (const spots of [layout.spots.desks, layout.spots.seats, layout.spots.files, layout.spots.lab])
    assert.equal(new Set(spots.map(s => key(s.x, s.y))).size, spots.length)
})

test('every window is on a bare wall, with floor beside it to be seen from, and none overlap', () => {
  const furnished = new Set(layout.furniture.flatMap(f => cellsOf(f).map(([x, y]) => key(x, y))))
  const seen = new Set()
  assert.ok(layout.windows.length > 0)
  for (const w of layout.windows) {
    const vertical = w.h > w.w
    for (const [x, y] of cellsOf(w)) {
      assert.equal(cell(x, y), '#', `${w.kind} at ${x},${y} is not on a wall`)
      assert.ok(!furnished.has(key(x, y)), `${w.kind} at ${x},${y} is on furniture`)
      assert.ok(!layout.doors.some(d => inside(d, x, y)), `${w.kind} at ${x},${y} is on a door`)
      assert.ok(!seen.has(key(x, y)), `windows overlap at ${x},${y}`)
      seen.add(key(x, y))
      const sides = vertical ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]]
      assert.ok(sides.some(([sx, sy]) => isOpen(sx, sy) || furnished.has(key(sx, sy))), `${w.kind} at ${x},${y} has nothing to see it from`)
    }
  }
})

test('the plan is the same every time', () => {
  assert.deepEqual(buildStudio(), buildStudio())
})
