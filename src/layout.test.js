import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fit, keepInView, zoomAt } from '../public/layout.js'
import { buildStudio } from '../public/studio.js'

const layout = buildStudio()

test('the plan fits a wide canvas by its height and a tall one by its width, centred', () => {
  const wide = fit(2000, 440, layout, 0)
  assert.equal(wide.tile, 440 / layout.height)
  assert.ok(Math.abs(wide.top) < 1e-9)
  assert.equal(wide.left, (2000 - wide.tile * layout.width) / 2)

  const tall = fit(380, 2000, layout, 0)
  assert.equal(tall.tile, 380 / layout.width)
  assert.equal(tall.left, 0)
})

test('a canvas with no room still gives a usable tile', () => {
  assert.ok(fit(0, 0, layout).tile >= 1)
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
