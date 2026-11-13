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

test('cells to avoid are gone round; when there is no way round, there is no path; the goal is never avoided', () => {
  const grid = ['...', '...', '...']

  const round = findPath(grid, [0, 1], [2, 1], new Set(['1,1']))
  assert.equal(round.some(([x, y]) => x === 1 && y === 1), false)
  assert.deepEqual(round.at(-1), [2, 1])

  assert.equal(findPath(['...'], [0, 0], [2, 0], new Set(['1,0'])), null)
  assert.deepEqual(findPath(['...'], [0, 0], [2, 0], new Set(['2,0'])).at(-1), [2, 0])
})

test('with a seed the way differs from worker to worker but is the same for the same seed, and is nearly as short as the shortest', () => {
  const grid = Array.from({ length: 12 }, () => '.'.repeat(12))
  const ways = seed => findPath(grid, [0, 0], [11, 11], new Set(), { seed })
  const seen = new Set()

  for (let seed = 1; seed <= 40; seed++) {
    const way = ways(seed)
    assert.deepEqual(way.at(-1), [11, 11])
    assert.ok(way.length <= 22 + 2, `${way.length} steps`) // the shortest is 22
    assert.deepEqual(ways(seed), way) // the same seed, the same way
    seen.add(JSON.stringify(way))
  }
  assert.ok(seen.size >= 10, `${seen.size} different ways in 40`)
})

test('a seed never makes the goal unreachable, or leads through a wall', () => {
  const grid = ['.....', '.###.', '.....']
  for (let seed = 0; seed < 30; seed++) {
    const way = findPath(grid, [0, 1], [4, 1], new Set(), { seed })
    assert.deepEqual(way.at(-1), [4, 1])
    for (const [x, y] of way) assert.notEqual(grid[y][x], '#')
  }
  assert.equal(findPath(['..#..'], [0, 0], [4, 0], new Set(), { seed: 3 }), null)
})

test('a cell that costs extra is kept off when there is another way, and used when there is not', () => {
  // a stair three wide: the sides cost extra, so the way from one side at the top to one side at the bottom is by the middle
  const grid = Array.from({ length: 8 }, () => '...')
  const sides = x => (x === 0 || x === 2 ? 8 : 0)
  const way = findPath(grid, [0, 0], [0, 7], new Set(), { cost: sides })

  for (const [x, y] of way.slice(0, -1).filter(([, y]) => y > 0 && y < 7)) assert.equal(x, 1, `column ${x} at row ${y}`)
  // with nothing else to take, the expensive cell is still walked on
  assert.equal(findPath(['...'], [0, 0], [2, 0], new Set(), { cost: x => (x === 1 ? 50 : 0) }).length, 2)
})
