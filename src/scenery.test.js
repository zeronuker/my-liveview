import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLayout } from '../public/layout.js'
import { groundOps, itemsOf, LAPTOP, paint, TILE } from '../public/scenery.js'

const layout = buildLayout()
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
  assert.deepEqual(groundOps(layout), groundOps(buildLayout()))
})

test('a laptop open and in use looks different from one that is closed, and both fit in the first tile of a desk', () => {
  assert.notDeepEqual(LAPTOP.open, LAPTOP.closed)
  checkOps(LAPTOP.open, TILE, TILE, 'open laptop')
  checkOps(LAPTOP.closed, TILE, TILE, 'closed laptop')
})

test('paint draws each rectangle where it says, from a corner', () => {
  const calls = []
  const ctx = { fillRect: (...a) => calls.push(['rect', ...a]), set fillStyle(color) { calls.push(['color', color]) } }
  paint(ctx, [['r', 1, 2, 3, 4, '#ffffff']], 10, 20)

  assert.deepEqual(calls, [['color', '#ffffff'], ['rect', 11, 22, 3, 4]])
})
