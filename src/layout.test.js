import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLayout, fit, keepInView, zoomAt } from '../public/layout.js'
import { findPath } from '../public/walk.js'

const layout = buildLayout()
const cell = spot => layout.grid[spot.y][spot.x]

const allSpots = () => {
  const s = layout.spots
  return {
    entrance: [s.entrance],
    handIn: [s.handIn],
    managerSeat: [s.managerSeat],
    ceoSeat: [s.ceoSeat],
    ceoDelivery: [s.ceoDelivery],
    ceoDoor: [s.ceoDoor],
    stairsBottom: [s.stairsBottom],
    stairsTop: [s.stairsTop],
    files: s.files,
    seats: s.seats,
    desks: s.desks,
    lab: s.lab,
  }
}

test('the grid is as big as the world says, every row the same length', () => {
  assert.equal(layout.grid.length, layout.height)
  for (const row of layout.grid) assert.equal(row.length, layout.width)
})

test('every spot is somewhere a person can stand', () => {
  for (const [name, spots] of Object.entries(allSpots())) {
    assert.ok(spots.length > 0, `${name} has spots`)
    for (const spot of spots) assert.notEqual(cell(spot), '#', `${name} at ${spot.x},${spot.y}`)
  }
})

test('everyone can walk from the front door to every spot, upstairs included', () => {
  const from = [layout.spots.entrance.x, layout.spots.entrance.y]
  for (const [name, spots] of Object.entries(allSpots()))
    for (const spot of spots) assert.notEqual(findPath(layout.grid, from, [spot.x, spot.y]), null, `${name} at ${spot.x},${spot.y}`)
})

test('the CEO is upstairs and everyone else starts on the ground floor', () => {
  assert.ok(layout.spots.ceoSeat.y < layout.groundTop)
  assert.ok(layout.spots.entrance.y >= layout.groundTop)
  assert.ok(layout.spots.managerSeat.y >= layout.groundTop)
})

test('there are enough desks, seats, shelves and lab places to share around', () => {
  assert.ok(layout.spots.desks.length >= 16)
  assert.ok(layout.spots.seats.length >= 9)
  assert.ok(layout.spots.files.length >= 12)
  assert.ok(layout.spots.lab.length >= 8)
})

test('no two spots of a kind are the same place', () => {
  for (const spots of [layout.spots.desks, layout.spots.seats, layout.spots.files, layout.spots.lab])
    assert.equal(new Set(spots.map(s => `${s.x},${s.y}`)).size, spots.length)
})

test('the plan fits a wide canvas by its height and a tall one by its width, centred', () => {
  const wide = fit(2000, 440, layout, 0)
  assert.equal(wide.tile, 440 / layout.height)
  assert.equal(wide.top, 0)
  assert.equal(wide.left, (2000 - wide.tile * layout.width) / 2)

  const tall = fit(380, 2000, layout, 0)
  assert.equal(tall.tile, 380 / layout.width)
  assert.equal(tall.left, 0)
})

test('a canvas with no room still gives a usable tile', () => {
  assert.ok(fit(0, 0, layout).tile >= 1)
})

test('every desk seat has a desk directly below it, and a chair', () => {
  const solid = (kind, x, y) => layout.furniture.some(f => f.kind === kind && f.solid && x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h)
  const chair = (x, y) => layout.furniture.some(f => f.kind === 'chair' && f.x === x && f.y === y)

  for (const seat of layout.spots.desks) {
    assert.ok(solid('desk', seat.x, seat.y + 1), `desk below ${seat.x},${seat.y}`)
    assert.ok(chair(seat.x, seat.y), `chair at ${seat.x},${seat.y}`)
  }
  const { managerSeat, ceoSeat, ceoDelivery } = layout.spots
  assert.ok(solid('desk', managerSeat.x, managerSeat.y + 1) && chair(managerSeat.x, managerSeat.y))
  assert.ok(solid('desk', ceoSeat.x, ceoSeat.y + 1) && chair(ceoSeat.x, ceoSeat.y))
  assert.ok(solid('desk', ceoDelivery.x, ceoDelivery.y - 1)) // work is handed over the CEO's desk
})

test('every sofa seat is on a sofa, and the sofa is walked over', () => {
  for (const seat of layout.spots.seats) {
    assert.ok(layout.furniture.some(f => f.kind === 'sofa' && !f.solid && seat.x >= f.x && seat.x < f.x + f.w && seat.y === f.y), `sofa at ${seat.x},${seat.y}`)
  }
})

test('solid furniture is in the way on the grid and the rest is not', () => {
  for (const f of layout.furniture)
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) assert.equal(layout.grid[y][x] === '#', f.solid, `${f.kind} at ${x},${y}`)
})

test('every open cell of the plan is in a room, so it has a floor', () => {
  for (const [y, row] of layout.grid.entries())
    for (const [x, ch] of [...row].entries())
      if (ch !== '#') assert.ok(layout.rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), `${x},${y}`)
})

test('zooming keeps the point under the pointer where it is', () => {
  const fitted = fit(1000, 600, layout, 0)
  const point = { x: 400, y: 300 }
  const world = { x: (point.x - fitted.left) / fitted.tile, y: (point.y - fitted.top) / fitted.tile }
  const zoomed = zoomAt(fitted, fitted, point, 2)

  assert.equal(zoomed.tile, fitted.tile * 2)
  assert.ok(Math.abs(zoomed.left + world.x * zoomed.tile - point.x) < 1e-9)
  assert.ok(Math.abs(zoomed.top + world.y * zoomed.tile - point.y) < 1e-9)
})

test('the plan cannot be zoomed out past the fitted size, or in past six times it', () => {
  const fitted = fit(1000, 600, layout, 0)

  assert.equal(zoomAt(fitted, fitted, { x: 0, y: 0 }, 0.1).tile, fitted.tile)
  assert.equal(zoomAt(fitted, fitted, { x: 0, y: 0 }, 100).tile, fitted.tile * 6)
})

test('a view cannot be pushed so far that the plan leaves the canvas', () => {
  const fitted = fit(1000, 600, layout, 0)
  const far = keepInView({ tile: fitted.tile, left: -99999, top: 99999 }, layout, 1000, 600)

  assert.ok(far.left + layout.width * fitted.tile >= 40)
  assert.ok(far.top <= 600 - 40)
  assert.deepEqual(keepInView(fitted, layout, 1000, 600), fitted) // a good view is left alone
})
