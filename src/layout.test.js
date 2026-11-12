import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLayout, fit } from '../public/layout.js'
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
