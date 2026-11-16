import assert from 'node:assert/strict'
import { test } from 'node:test'

import { putOn } from '../public/map.js'

const POINTS = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 4, z: -2 }, { x: 20, y: 0, z: 6 }]

test('putOn: a light is placed between the curve points, not on the nearest one', () => {
  const at = t => {
    const out = new Float32Array(6)
    putOn(out, 1, POINTS, t) // slot 1: the second three numbers
    return [...out.slice(3)]
  }
  assert.deepEqual(at(0), [0, 0, 0])
  assert.deepEqual(at(0.25), [5, 2, -1]) // half way between the first two points
  assert.deepEqual(at(0.5), [10, 4, -2])
  assert.deepEqual(at(0.75), [15, 2, 2])
  assert.deepEqual(at(1), [20, 0, 6]) // the end, not past it
  assert.deepEqual(at(1.5), [20, 0, 6]) // and out of range stays on the curve
  assert.deepEqual(at(-1), [0, 0, 0])
})
