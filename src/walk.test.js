import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findPath } from '../public/walk.js'

// '#' is something in the way (a desk, a wall); anything else can be walked on
const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1

test('a straight corridor: one cell at a time, the start left out, the goal last', () => {
  assert.deepEqual(findPath(['.....'], [0, 0], [3, 0]), [[1, 0], [2, 0], [3, 0]])
})

test('already there: no steps', () => {
  assert.deepEqual(findPath(['...'], [1, 0], [1, 0]), [])
})

test('walks around a wall by the shortest way', () => {
  const grid = ['.....', '.###.', '.....']
  const path = findPath(grid, [0, 1], [4, 1])

  assert.equal(path.length, 6)
  assert.deepEqual(path.at(-1), [4, 1])
  for (const [x, y] of path) assert.notEqual(grid[y][x], '#')
  ;[[0, 1], ...path].slice(1).forEach((cell, i) => assert.ok(adjacent([[0, 1], ...path][i], cell)))
})

test('a goal that cannot be reached gives null, not a loop', () => {
  assert.equal(findPath(['..#..'], [0, 0], [4, 0]), null)
})

test('a start or goal that is in the way or outside the floor gives null', () => {
  assert.equal(findPath(['.#.'], [0, 0], [1, 0]), null)
  assert.equal(findPath(['.#.'], [1, 0], [2, 0]), null)
  assert.equal(findPath(['...'], [0, 0], [5, 0]), null)
  assert.equal(findPath(['...'], [0, -1], [1, 0]), null)
})

test('a big open floor is crossed corner to corner', () => {
  const grid = Array.from({ length: 60 }, () => '.'.repeat(60))

  assert.equal(findPath(grid, [0, 0], [59, 59]).length, 118)
})

test('rows of different lengths do not break it', () => {
  assert.deepEqual(findPath(['...', '.'], [0, 1], [2, 0]), [[0, 0], [1, 0], [2, 0]])
})
