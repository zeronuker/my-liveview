import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clamp } from '../public/resize.js'

test('a size is kept between its smallest and its largest', () => {
  assert.equal(clamp(100, 180, 480), 180)
  assert.equal(clamp(300, 180, 480), 300)
  assert.equal(clamp(900, 180, 480), 480)
})

test('the same holds for a share of the width', () => {
  assert.equal(clamp(0.05, 0.2, 0.8), 0.2)
  assert.equal(clamp(0.5, 0.2, 0.8), 0.5)
  assert.equal(clamp(0.95, 0.2, 0.8), 0.8)
})
