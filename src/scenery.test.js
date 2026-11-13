import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStudio } from '../public/studio.js'
import { groundOps, itemsOf, paint, TILE } from '../public/scenery.js'

const layout = buildStudio()
const COLOR = /^(#[0-9a-f]{6}|rgba\(\d+,\d+,\d+,[0-9.]+\))$/

const checkOps = (ops, width, height, what) => {
  assert.ok(ops.length > 0, `${what} has something to draw`)
  for (const op of ops) {
    const [kind, x, y, w, h, color] = op
    assert.equal(kind, 'r', what)
    for (const n of [x, y, w, h]) assert.ok(Number.isInteger(n), `${what}: ${op}`)
    assert.ok(w > 0 && h > 0, `${what}: ${op}`)
    assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, `${what}: ${op} is outside ${width} by ${height}`)
    assert.match(color, COLOR, `${what}: ${op}`)
  }
}

test('the floor and walls are all inside the plan, in whole pixels and real colours', () => {
  checkOps(groundOps(layout), layout.width * TILE, layout.height * TILE, 'ground')
})

test('every piece of furniture has art that fits inside its own size', () => {
  for (const item of itemsOf(layout)) checkOps(item.ops, item.w * TILE, item.h * TILE, `${item.kind} at ${item.x},${item.y}`)
})

test('chairs and sofas are under the people; desks, shelves and the rest are in front of those behind them', () => {
  const under = kind => itemsOf(layout).filter(i => i.kind === kind).every(i => i.under)
  const over = kind => itemsOf(layout).filter(i => i.kind === kind).every(i => !i.under)

  assert.ok(under('chair') && under('sofa'))
  for (const kind of ['desk', 'shelf', 'machine', 'tray', 'plant']) assert.ok(over(kind), kind)
})

test('the floor is the same every time: nothing is random', () => {
  assert.deepEqual(groundOps(layout), groundOps(buildStudio()))
})

test('the ground has two frames that differ only in the pond, both inside the plan', () => {
  const [a, b] = [groundOps(layout, 0), groundOps(layout, 1)]
  checkOps(b, layout.width * TILE, layout.height * TILE, 'ground, frame 1')
  assert.deepEqual(groundOps(layout), a)
  assert.equal(a.length, b.length)
  const differing = a.map((op, i) => i).filter(i => JSON.stringify(a[i]) !== JSON.stringify(b[i]))
  assert.ok(differing.length > 0 && differing.length < 400, `${differing.length} rectangles differ`)
  const pond = { x0: 24 * TILE, x1: 47 * TILE, y0: 40 * TILE, y1: 54 * TILE } // a box round the pond, its bank and its reeds
  for (const i of differing) assert.ok(a[i][1] >= pond.x0 && a[i][1] <= pond.x1 && a[i][2] >= pond.y0 && a[i][2] <= pond.y1, `${a[i]} is not in the pond`)
})

test('paint draws each rectangle where it says, from a corner', () => {
  const calls = []
  const ctx = { fillRect: (...a) => calls.push(['rect', ...a]), set fillStyle(color) { calls.push(['color', color]) } }
  paint(ctx, [['r', 1, 2, 3, 4, '#ffffff']], 10, 20)

  assert.deepEqual(calls, [['color', '#ffffff'], ['rect', 11, 22, 3, 4]])
})
