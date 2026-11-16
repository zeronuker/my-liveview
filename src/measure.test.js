import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHOICES, litOf, sizeOf, tintOf } from '../public/measure.js'

const NOW = Date.parse('2026-06-01')
const day = n => NOW - n * 86400000

test('CHOICES: what each part of a building can show', () => {
  assert.deepEqual(CHOICES, { height: ['lines', 'changes'], footprint: ['lines', 'changes'], colour: ['folder', 'age', 'changes', 'type'], windows: ['recent', 'changes'] })
})

test('sizeOf: lines as they are, or changes scaled so the most changed file counts as a long one', () => {
  assert.equal(sizeOf({ lines: 120, changes: 4 }, 'lines', 10), 120)
  assert.equal(sizeOf({ lines: 120, changes: 10 }, 'changes', 10), 3000)
  assert.ok(sizeOf({ lines: 120, changes: 1 }, 'changes', 10) < sizeOf({ lines: 120, changes: 5 }, 'changes', 10))
  assert.equal(sizeOf({ lines: 120 }, 'changes', 10), 1) // never changed in git: the smallest
})

test('litOf: recent work, or more windows lit the more often a file changed', () => {
  assert.equal(litOf({ changed: day(1) }, 'recent', NOW, 10), 0.6)
  assert.ok(litOf({ changes: 10 }, 'changes', NOW, 10) > litOf({ changes: 1 }, 'changes', NOW, 10))
})

test('tintOf: folder keeps the folder colours; age, changes and type give a colour of their own', () => {
  assert.equal(tintOf({ path: 'a.js' }, 'folder', NOW, 10), null)
  const fresh = tintOf({ path: 'a.js', changed: day(0) }, 'age', NOW, 10)
  const old = tintOf({ path: 'a.js', changed: day(400) }, 'age', NOW, 10)
  assert.ok(fresh.s > old.s && fresh.h < old.h)
  const cold = tintOf({ path: 'a.js', changes: 0 }, 'changes', NOW, 10)
  const hot = tintOf({ path: 'a.js', changes: 10 }, 'changes', NOW, 10)
  assert.ok(hot.s > cold.s && hot.l > cold.l)
  assert.deepEqual(tintOf({ path: 'x/a.js' }, 'type', NOW, 10), tintOf({ path: 'y/b.JS' }, 'type', NOW, 10))
  assert.notDeepEqual(tintOf({ path: 'a.js' }, 'type', NOW, 10), tintOf({ path: 'a.css' }, 'type', NOW, 10))
})
