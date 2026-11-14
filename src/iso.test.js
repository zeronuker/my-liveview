import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fit } from '../public/layout.js'
import { ISO_RISE, isoExtent, screenAt } from '../public/iso.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()
const view = { tile: 16, left: 0, top: 0 }

test('a flat plan puts a place at its tile times the tile size', () => {
  assert.deepEqual(screenAt({ tile: 10, left: 5, top: 7 }, layout, 3, 4, false), { x: 35, y: 47 })
})

test('in the angled view going east moves right and down, going south moves left and down', () => {
  const here = screenAt(view, layout, 10, 10, true)
  assert.deepEqual(screenAt(view, layout, 11, 10, true), { x: here.x + 8, y: here.y + 4 })
  assert.deepEqual(screenAt(view, layout, 10, 11, true), { x: here.x - 8, y: here.y + 4 })
})

test('every corner of the plan is inside the extent, and the extremes touch its edges', () => {
  const box = isoExtent(layout)
  const corners = [[0, 0], [layout.width, 0], [0, layout.height], [layout.width, layout.height]].map(([x, y]) => screenAt(view, layout, x, y, true))
  assert.equal(Math.min(...corners.map(p => p.x)), 0)
  assert.equal(Math.max(...corners.map(p => p.x)), box.width * view.tile)
  assert.equal(Math.min(...corners.map(p => p.y)), ISO_RISE * view.tile)
  assert.ok(Math.max(...corners.map(p => p.y)) < box.height * view.tile)
})

test('the angled plan fits a canvas, with the same tile size for both ways', () => {
  const box = isoExtent(layout)
  const { tile, left, top } = fit(1600, 800, box, 0)
  assert.ok(tile * box.width <= 1600 + 1e-9 && tile * box.height <= 800 + 1e-9)
  assert.ok(left >= 0 && top >= 0)
})
